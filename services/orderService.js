const pool = require('../config/database');
const logger = require('../utils/logger');

async function reserveOrderNumber(client, source) {
  const maxAttempts = 50;
  for (let i = 0; i < maxAttempts; i++) {
    const res = await client.query(
      `SELECT n
       FROM generate_series(1000, 9999) AS g(n)
       WHERE NOT EXISTS (
         SELECT 1 FROM order_number_registry r WHERE r.number = g.n
       )
       ORDER BY n
       LIMIT 1`
    );
    const row = res.rows[0];
    if (!row || typeof row.n !== 'number') {
      break;
    }
    const candidate = row.n;
    await client.query('SAVEPOINT order_number_sp');
    try {
      await client.query(
        'INSERT INTO order_number_registry(number, created_at, source) VALUES ($1, NOW(), $2)',
        [candidate, source || null]
      );
      await client.query('RELEASE SAVEPOINT order_number_sp');
      return candidate;
    } catch (e) {
      await client.query('ROLLBACK TO SAVEPOINT order_number_sp');
      if (e && e.code === '23505') {
        continue;
      }
      throw e;
    }
  }
  throw new Error('Unable to generate unique order number');
}

async function generateOrderNumber() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const num = await reserveOrderNumber(client, 'external');
    await client.query('COMMIT');
    return num;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {}
    throw e;
  } finally {
    client.release();
  }
}

async function findAddressIdByName(name) {
  const res = await pool.query('SELECT id FROM address WHERE name = $1', [name]);
  return res.rows[0] ? res.rows[0].id : null;
}

async function findPaymentStatusIdByName(name) {
  const res = await pool.query('SELECT id FROM payment_status WHERE name = $1', [name]);
  return res.rows[0] ? res.rows[0].id : null;
}

async function findOrderTypeIdByName(name) {
  const res = await pool.query('SELECT id FROM ordertype WHERE name = $1', [String(name || '').toLowerCase()]);
  return res.rows[0] ? res.rows[0].id : null;
}

async function getOrderTypes() {
  const res = await pool.query('SELECT id, name, called FROM ordertype ORDER BY id');
  return res.rows;
}

async function getOrderTypeCalledByName(name) {
  const res = await pool.query('SELECT called FROM ordertype WHERE name = $1', [String(name || '').toLowerCase()]);
  return res.rows[0] ? res.rows[0].called : null;
}

async function createOrder(userId, order) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let addressId = order.address_id || (order.store_name ? await findAddressIdByName(order.store_name) : null);
    if (!addressId && order.store_name) {
      const insAddr = await client.query('INSERT INTO address (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id', [order.store_name]);
      if (insAddr.rows[0] && insAddr.rows[0].id) {
        addressId = insAddr.rows[0].id;
      } else {
        const a2 = await client.query('SELECT id FROM address WHERE name = $1', [order.store_name]);
        addressId = a2.rows[0] ? a2.rows[0].id : null;
      }
    }
    let orderTypeId = order.order_type_id || (order.order_type ? await findOrderTypeIdByName(order.order_type) : null);
    if (!orderTypeId && order.order_type) {
      const nm = String(order.order_type || '').toLowerCase();
      const called =
        nm === 'wedding' ? 'Свадебный букет' :
        nm === 'composition' ? 'Композиция' :
        nm === 'food' ? 'Еда' :
        nm === 'flowers_food' ? 'Цветы + еда' :
        nm === 'test' ? 'Тестовый заказ' : nm;
      const insType = await client.query('INSERT INTO ordertype (name, called) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING RETURNING id', [nm, called]);
      if (insType.rows[0] && insType.rows[0].id) {
        orderTypeId = insType.rows[0].id;
      } else {
        const t2 = await client.query('SELECT id FROM ordertype WHERE name = $1', [nm]);
        orderTypeId = t2.rows[0] ? t2.rows[0].id : null;
      }
    }
    const status = order.status || 'active';
    let orderNumber = order.number;
    if (typeof orderNumber !== 'number' || !Number.isFinite(orderNumber)) {
      orderNumber = await reserveOrderNumber(client, 'order');
    }
    const executionTimeTo = order.execution_time_to || order.execution_time || '00:00';
    const insOrder = await client.query(
      'INSERT INTO orders (created_by_user_id, fulfillment_type, address_id, execution_date, execution_time, execution_time_to, order_type_id, status, number, creator_full_name, payment_status_id, cost, total_cost, delivery_cost, total_delivery_cost, paid_amount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id',
      [
        userId,
        order.fulfillment_type,
        addressId,
        order.execution_date,
        order.execution_time,
        executionTimeTo,
        orderTypeId,
        status,
        orderNumber,
        order.creator_full_name || null,
        order.payment_status_id || null,
        order.cost || order.total_cost || 0,
        order.total_cost || order.cost || 0,
        order.delivery_cost || 0,
        order.total_delivery_cost || order.delivery_cost || 0,
        order.paid_amount || 0,
      ]
    );
    const orderId = insOrder.rows[0].id;
    const details = order.details || {};
    await client.query(
      'INSERT INTO order_details (order_id, details) VALUES ($1, $2)',
      [orderId, details]
    );
    const c = order.contacts || {};
    await client.query(
      'INSERT INTO contacts (order_id, client_name, client_phone, recipient_name, recipient_phone, recipient_address) VALUES ($1,$2,$3,$4,$5,$6)',
      [orderId, c.client_name || '', c.client_phone || '', c.recipient_name || '', c.recipient_phone || '', c.recipient_address || null]
    );
    const photos = Array.isArray(order.photos) ? order.photos : [];
    for (const fileId of photos) {
      await client.query('INSERT INTO order_photos (order_id, file_id) VALUES ($1,$2)', [orderId, fileId]);
    }
    if (order.card_photo) {
      await client.query('INSERT INTO order_card_photo (order_id, file_id) VALUES ($1,$2) ON CONFLICT (order_id) DO UPDATE SET file_id = EXCLUDED.file_id', [orderId, order.card_photo]);
    }
    const toSqlDate = (d) => d.toISOString().slice(0, 10);
    const timeParts = String(order.execution_time || '00:00').split(':');
    const eh = parseInt(timeParts[0] || '0', 10);
    const em = parseInt(timeParts[1] || '0', 10);
    const execDt = new Date(order.execution_date);
    execDt.setHours(eh, em, 0, 0);
    const d0 = new Date(execDt);
    const d7 = new Date(execDt); d7.setDate(d7.getDate() - 7);
    const d1 = new Date(execDt); d1.setDate(d1.getDate() - 1);
    const d14 = new Date(execDt); d14.setDate(d14.getDate() - 14);
    const reminders = [];
    const todayStr = new Date().toISOString().slice(0, 10);
    if (String(order.order_type || '').toLowerCase() === 'wedding') {
      const d14Str = toSqlDate(d14);
      if (d14Str >= todayStr) reminders.push({ type: '14d', date: d14Str });
    }
    const d7Str = toSqlDate(d7);
    const d1Str = toSqlDate(d1);
    const d0Str = toSqlDate(d0);
    if (d7Str >= todayStr) reminders.push({ type: '7d', date: d7Str });
    if (d1Str >= todayStr) reminders.push({ type: '1d', date: d1Str });
    if (d0Str >= todayStr) reminders.push({ type: '0d', date: d0Str });
    for (const r of reminders) {
      await client.query(
        'INSERT INTO reminders (order_id, trigger_type, scheduled_date) VALUES ($1,$2,$3) ON CONFLICT (order_id, trigger_type) DO NOTHING',
        [orderId, r.type, r.date]
      );
    }
    const upsertText = async (key, val) => {
      await client.query(
        'INSERT INTO detail_type (order_id, key, value_text) VALUES ($1,$2,$3) ON CONFLICT (order_id, key) DO UPDATE SET value_text = EXCLUDED.value_text',
        [orderId, key, val]
      );
    };
    const upsertBool = async (key, val) => {
      await client.query(
        'INSERT INTO detail_type (order_id, key, value_bool) VALUES ($1,$2,$3) ON CONFLICT (order_id, key) DO UPDATE SET value_bool = EXCLUDED.value_bool',
        [orderId, key, val]
      );
    };
    const upsertDate = async (key, val) => {
      await client.query(
        'INSERT INTO detail_type (order_id, key, value_date) VALUES ($1,$2,$3) ON CONFLICT (order_id, key) DO UPDATE SET value_date = EXCLUDED.value_date',
        [orderId, key, val]
      );
    };
    const upsertTime = async (key, val) => {
      await client.query(
        'INSERT INTO detail_type (order_id, key, value_time) VALUES ($1,$2,$3) ON CONFLICT (order_id, key) DO UPDATE SET value_time = EXCLUDED.value_time',
        [orderId, key, val]
      );
    };
    await upsertDate('execution_date', order.execution_date);
    await upsertTime('execution_time', order.execution_time);
    if (order.execution_time_to) {
      await upsertTime('execution_time_to', order.execution_time_to);
    }
    await upsertText('fulfillment_type', order.fulfillment_type || '');
    await upsertText('store_name', order.store_name || '');
    await upsertText('order_type', order.order_type || '');
    if (c) {
      if (c.client_name) await upsertText('client_name', c.client_name);
      if (c.client_phone) await upsertText('client_phone', c.client_phone);
      if (c.recipient_name) await upsertText('recipient_name', c.recipient_name);
      if (c.recipient_phone) await upsertText('recipient_phone', c.recipient_phone);
      if (c.recipient_address) await upsertText('recipient_address', c.recipient_address);
    }
    for (const [k, v] of Object.entries(details)) {
      if (typeof v === 'boolean') {
        await upsertBool(k, v);
      } else if (v === null || typeof v === 'undefined') {
        continue;
      } else {
        const t = typeof v === 'object' ? JSON.stringify(v) : String(v);
        await upsertText(k, t);
      }
    }
    await client.query('COMMIT');
    return orderId;
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('createOrder error', e);
    throw e;
  } finally {
    client.release();
  }
}

async function createOrderDraft(userId, order) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let addressId = order.address_id || (order.store_name ? await findAddressIdByName(order.store_name) : null);
    if (!addressId && order.store_name) {
      const insAddr = await client.query('INSERT INTO address (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id', [order.store_name]);
      if (insAddr.rows[0] && insAddr.rows[0].id) {
        addressId = insAddr.rows[0].id;
      } else {
        const a2 = await client.query('SELECT id FROM address WHERE name = $1', [order.store_name]);
        addressId = a2.rows[0] ? a2.rows[0].id : null;
      }
    }
    let orderTypeId = order.order_type_id || (order.order_type ? await findOrderTypeIdByName(order.order_type) : null);
    if (!orderTypeId && order.order_type) {
      const nm = String(order.order_type || '').toLowerCase();
      const called =
        nm === 'wedding' ? 'Свадебный букет' :
        nm === 'composition' ? 'Композиция' :
        nm === 'food' ? 'Еда' :
        nm === 'flowers_food' ? 'Цветы + еда' :
        nm === 'test' ? 'Тестовый заказ' : nm;
      const insType = await client.query('INSERT INTO ordertype (name, called) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING RETURNING id', [nm, called]);
      if (insType.rows[0] && insType.rows[0].id) {
        orderTypeId = insType.rows[0].id;
      } else {
        const t2 = await client.query('SELECT id FROM ordertype WHERE name = $1', [nm]);
        orderTypeId = t2.rows[0] ? t2.rows[0].id : null;
      }
    }
    const status = 'draft';
    let orderNumber = order.number;
    if (typeof orderNumber !== 'number' || !Number.isFinite(orderNumber)) {
      orderNumber = await reserveOrderNumber(client, 'draft');
    }
    const executionTimeTo = order.execution_time_to || order.execution_time || '00:00';
    const insOrder = await client.query(
      'INSERT INTO orders (created_by_user_id, fulfillment_type, address_id, execution_date, execution_time, execution_time_to, order_type_id, status, number, creator_full_name, payment_status_id, total_cost, paid_amount) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id',
      [
        userId,
        order.fulfillment_type,
        addressId,
        order.execution_date,
        order.execution_time,
        executionTimeTo,
        orderTypeId,
        status,
        orderNumber,
        order.creator_full_name || null,
        order.payment_status_id || null,
        order.total_cost || 0,
        order.paid_amount || 0,
      ]
    );
    const orderId = insOrder.rows[0].id;
    const details = order.details || {};
    await client.query(
      'INSERT INTO order_details (order_id, details) VALUES ($1, $2)',
      [orderId, details]
    );
    const c = order.contacts || {};
    await client.query(
      'INSERT INTO contacts (order_id, client_name, client_phone, recipient_name, recipient_phone, recipient_address) VALUES ($1,$2,$3,$4,$5,$6)',
      [orderId, c.client_name || '', c.client_phone || '', c.recipient_name || '', c.recipient_phone || '', c.recipient_address || null]
    );
    const photos = Array.isArray(order.photos) ? order.photos : [];
    for (const fileId of photos) {
      await client.query('INSERT INTO order_photos (order_id, file_id) VALUES ($1,$2)', [orderId, fileId]);
    }
    if (order.card_photo) {
      await client.query('INSERT INTO order_card_photo (order_id, file_id) VALUES ($1,$2) ON CONFLICT (order_id) DO UPDATE SET file_id = EXCLUDED.file_id', [orderId, order.card_photo]);
    }
    const toSqlDate = (d) => d.toISOString().slice(0, 10);
    const timeParts = String(order.execution_time || '00:00').split(':');
    const eh = parseInt(timeParts[0] || '0', 10);
    const em = parseInt(timeParts[1] || '0', 10);
    const execDt = new Date(order.execution_date);
    execDt.setHours(eh, em, 0, 0);
    const d0 = new Date(execDt);
    const d7 = new Date(execDt); d7.setDate(d7.getDate() - 7);
    const d1 = new Date(execDt); d1.setDate(d1.getDate() - 1);
    const d14 = new Date(execDt); d14.setDate(d14.getDate() - 14);
    const reminders = [];
    if (String(order.order_type || '').toLowerCase() === 'wedding') {
      reminders.push({ type: '14d', date: toSqlDate(d14) });
    }
    reminders.push(
      { type: '7d', date: toSqlDate(d7) },
      { type: '1d', date: toSqlDate(d1) },
      { type: '0d', date: toSqlDate(d0) },
    );
    for (const r of reminders) {
      await client.query(
        'INSERT INTO reminders (order_id, trigger_type, scheduled_date) VALUES ($1,$2,$3) ON CONFLICT (order_id, trigger_type) DO NOTHING',
        [orderId, r.type, r.date]
      );
    }
    const upsertText = async (key, val) => {
      await client.query(
        'INSERT INTO detail_type (order_id, key, value_text) VALUES ($1,$2,$3) ON CONFLICT (order_id, key) DO UPDATE SET value_text = EXCLUDED.value_text',
        [orderId, key, val]
      );
    };
    const upsertBool = async (key, val) => {
      await client.query(
        'INSERT INTO detail_type (order_id, key, value_bool) VALUES ($1,$2,$3) ON CONFLICT (order_id, key) DO UPDATE SET value_bool = EXCLUDED.value_bool',
        [orderId, key, val]
      );
    };
    const upsertDate = async (key, val) => {
      await client.query(
        'INSERT INTO detail_type (order_id, key, value_date) VALUES ($1,$2,$3) ON CONFLICT (order_id, key) DO UPDATE SET value_date = EXCLUDED.value_date',
        [orderId, key, val]
      );
    };
    const upsertTime = async (key, val) => {
      await client.query(
        'INSERT INTO detail_type (order_id, key, value_time) VALUES ($1,$2,$3) ON CONFLICT (order_id, key) DO UPDATE SET value_time = EXCLUDED.value_time',
        [orderId, key, val]
      );
    };
    await upsertDate('execution_date', order.execution_date);
    await upsertTime('execution_time', order.execution_time);
    if (order.execution_time_to) {
      await upsertTime('execution_time_to', order.execution_time_to);
    }
    await upsertText('fulfillment_type', order.fulfillment_type || '');
    await upsertText('store_name', order.store_name || '');
    await upsertText('order_type', order.order_type || '');
    if (c) {
      if (c.client_name) await upsertText('client_name', c.client_name);
      if (c.client_phone) await upsertText('client_phone', c.client_phone);
      if (c.recipient_name) await upsertText('recipient_name', c.recipient_name);
      if (c.recipient_phone) await upsertText('recipient_phone', c.recipient_phone);
      if (c.recipient_address) await upsertText('recipient_address', c.recipient_address);
    }
    for (const [k, v] of Object.entries(details)) {
      if (typeof v === 'boolean') {
        await upsertBool(k, v);
      } else if (v === null || typeof v === 'undefined') {
        continue;
      } else {
        const t = typeof v === 'object' ? JSON.stringify(v) : String(v);
        await upsertText(k, t);
      }
    }
    await client.query('COMMIT');
    return orderId;
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('createOrderDraft error', e);
    throw e;
  } finally {
    client.release();
  }
}

async function updateOrderAndActivate(orderId, order) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let addressId = order.address_id || (order.store_name ? await findAddressIdByName(order.store_name) : null);
    if (!addressId && order.store_name) {
      const insAddr = await client.query('INSERT INTO address (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id', [order.store_name]);
      if (insAddr.rows[0] && insAddr.rows[0].id) {
        addressId = insAddr.rows[0].id;
      } else {
        const a2 = await client.query('SELECT id FROM address WHERE name = $1', [order.store_name]);
        addressId = a2.rows[0] ? a2.rows[0].id : null;
      }
    }
    let orderTypeId = order.order_type_id || (order.order_type ? await findOrderTypeIdByName(order.order_type) : null);
    if (!orderTypeId && order.order_type) {
      const nm = String(order.order_type || '').toLowerCase();
      const called =
        nm === 'wedding' ? 'Свадебный букет' :
        nm === 'composition' ? 'Композиция' :
        nm === 'food' ? 'Еда' :
        nm === 'flowers_food' ? 'Цветы + еда' :
        nm === 'test' ? 'Тестовый заказ' : nm;
      const insType = await client.query('INSERT INTO ordertype (name, called) VALUES ($1,$2) ON CONFLICT (name) DO NOTHING RETURNING id', [nm, called]);
      if (insType.rows[0] && insType.rows[0].id) {
        orderTypeId = insType.rows[0].id;
      } else {
        const t2 = await client.query('SELECT id FROM ordertype WHERE name = $1', [nm]);
        orderTypeId = t2.rows[0] ? t2.rows[0].id : null;
      }
    }
    const status = order.status || 'active';
    const executionTimeTo = order.execution_time_to || order.execution_time || '00:00';
    await client.query(
      'UPDATE orders SET fulfillment_type=$1, address_id=$2, execution_date=$3, execution_time=$4, execution_time_to=$5, order_type_id=$6, status=$7, creator_full_name=$8, payment_status_id=$9, cost=$10, total_cost=$11, delivery_cost=$12, total_delivery_cost=$13, paid_amount=$14, updated_at=NOW() WHERE id=$15',
      [
        order.fulfillment_type,
        addressId,
        order.execution_date,
        order.execution_time,
        executionTimeTo,
        orderTypeId,
        status,
        order.creator_full_name || null,
        order.payment_status_id || null,
        order.cost || order.total_cost || 0,
        order.total_cost || order.cost || 0,
        order.delivery_cost || 0,
        order.total_delivery_cost || order.delivery_cost || 0,
        order.paid_amount || 0,
        orderId,
      ]
    );
    const details = order.details || {};
    await client.query(
      'INSERT INTO order_details (order_id, details) VALUES ($1,$2) ON CONFLICT (order_id) DO UPDATE SET details = EXCLUDED.details',
      [orderId, details]
    );
    const c = order.contacts || {};
    await client.query(
      `INSERT INTO contacts (order_id, client_name, client_phone, recipient_name, recipient_phone, recipient_address)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (order_id) DO UPDATE SET 
         client_name=EXCLUDED.client_name, client_phone=EXCLUDED.client_phone,
         recipient_name=EXCLUDED.recipient_name, recipient_phone=EXCLUDED.recipient_phone,
         recipient_address=EXCLUDED.recipient_address`,
      [orderId, c.client_name || '', c.client_phone || '', c.recipient_name || '', c.recipient_phone || '', c.recipient_address || null]
    );
    await client.query('DELETE FROM order_photos WHERE order_id = $1', [orderId]);
    const photos = Array.isArray(order.photos) ? order.photos : [];
    for (const fileId of photos) {
      await client.query('INSERT INTO order_photos (order_id, file_id) VALUES ($1,$2)', [orderId, fileId]);
    }
    await client.query('DELETE FROM order_card_photo WHERE order_id = $1', [orderId]);
    if (order.card_photo) {
      await client.query('INSERT INTO order_card_photo (order_id, file_id) VALUES ($1,$2)', [orderId, order.card_photo]);
    }
    const toSqlDate = (d) => d.toISOString().slice(0, 10);
    const timeParts = String(order.execution_time || '00:00').split(':');
    const eh = parseInt(timeParts[0] || '0', 10);
    const em = parseInt(timeParts[1] || '0', 10);
    const execDt = new Date(order.execution_date);
    execDt.setHours(eh, em, 0, 0);
    const d0 = new Date(execDt);
    const d7 = new Date(execDt); d7.setDate(d7.getDate() - 7);
    const d1 = new Date(execDt); d1.setDate(d1.getDate() - 1);
    const d14 = new Date(execDt); d14.setDate(d14.getDate() - 14);
    // Remove obsolete '3h' reminders if exist
    await client.query('DELETE FROM reminders WHERE order_id = $1 AND trigger_type = $2', [orderId, '3h']);
    const reminders = [];
    const todayStr = new Date().toISOString().slice(0, 10);
    if (String(order.order_type || '').toLowerCase() === 'wedding') {
      const d14Str = toSqlDate(d14);
      if (d14Str >= todayStr) reminders.push({ type: '14d', date: d14Str });
    }
    const d7Str = toSqlDate(d7);
    const d1Str = toSqlDate(d1);
    const d0Str = toSqlDate(d0);
    if (d7Str >= todayStr) reminders.push({ type: '7d', date: d7Str });
    if (d1Str >= todayStr) reminders.push({ type: '1d', date: d1Str });
    if (d0Str >= todayStr) reminders.push({ type: '0d', date: d0Str });
    for (const r of reminders) {
      await client.query(
        'INSERT INTO reminders (order_id, trigger_type, scheduled_date) VALUES ($1,$2,$3) ON CONFLICT (order_id, trigger_type) DO UPDATE SET scheduled_date = EXCLUDED.scheduled_date',
        [orderId, r.type, r.date]
      );
    }
    const upsertText = async (key, val) => {
      await client.query(
        'INSERT INTO detail_type (order_id, key, value_text) VALUES ($1,$2,$3) ON CONFLICT (order_id, key) DO UPDATE SET value_text = EXCLUDED.value_text',
        [orderId, key, val]
      );
    };
    const upsertBool = async (key, val) => {
      await client.query(
        'INSERT INTO detail_type (order_id, key, value_bool) VALUES ($1,$2,$3) ON CONFLICT (order_id, key) DO UPDATE SET value_bool = EXCLUDED.value_bool',
        [orderId, key, val]
      );
    };
    const upsertDate = async (key, val) => {
      await client.query(
        'INSERT INTO detail_type (order_id, key, value_date) VALUES ($1,$2,$3) ON CONFLICT (order_id, key) DO UPDATE SET value_date = EXCLUDED.value_date',
        [orderId, key, val]
      );
    };
    const upsertTime = async (key, val) => {
      await client.query(
        'INSERT INTO detail_type (order_id, key, value_time) VALUES ($1,$2,$3) ON CONFLICT (order_id, key) DO UPDATE SET value_time = EXCLUDED.value_time',
        [orderId, key, val]
      );
    };
    await upsertDate('execution_date', order.execution_date);
    await upsertTime('execution_time', order.execution_time);
    await upsertText('fulfillment_type', order.fulfillment_type || '');
    await upsertText('store_name', order.store_name || '');
    await upsertText('order_type', order.order_type || '');
    if (c) {
      await upsertText('client_name', c.client_name || '');
      await upsertText('client_phone', c.client_phone || '');
      await upsertText('recipient_name', c.recipient_name || '');
      await upsertText('recipient_phone', c.recipient_phone || '');
      if (c.recipient_address) await upsertText('recipient_address', c.recipient_address);
    }
    for (const [k, v] of Object.entries(details)) {
      if (typeof v === 'boolean') {
        await upsertBool(k, v);
      } else if (v === null || typeof v === 'undefined') {
        continue;
      } else {
        const t = typeof v === 'object' ? JSON.stringify(v) : String(v);
        await upsertText(k, t);
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('updateOrderAndActivate error', e);
    throw e;
  } finally {
    client.release();
  }
}
async function listActiveOrders(limit = 10) {
  const res = await pool.query(
    `SELECT o.id, o.execution_date, o.execution_time, a.name AS address_name
     FROM orders o JOIN address a ON a.id = o.address_id
     WHERE o.status IN ('active','assembled','processing','accepted')
     ORDER BY o.execution_date ASC, o.execution_time ASC
     LIMIT $1`,
    [limit]
  );
  return res.rows;
}

async function listActiveOrdersByAddress(addressId, limit = 10) {
  const res = await pool.query(
    `SELECT o.id, o.number, o.execution_date, o.execution_time, a.name AS address_name
     FROM orders o JOIN address a ON a.id = o.address_id
     WHERE o.status IN ('active','assembled','processing','accepted') AND o.address_id = $1
     ORDER BY o.execution_date ASC, o.execution_time ASC
     LIMIT $2`,
    [addressId, limit]
  );
  return res.rows;
}

async function listActiveOrdersByAddressPage(addressId, limit = 10, offset = 0) {
  const res = await pool.query(
    `SELECT MIN(o.id) AS id,
            COALESCE(o.number, o.id) AS number,
            MIN(o.execution_date) AS execution_date,
            MIN(o.execution_time) AS execution_time,
            a.name AS address_name,
            COUNT(*) AS positions_count
     FROM orders o
     JOIN address a ON a.id = o.address_id
     WHERE o.status IN ('active','assembled','processing','accepted') AND o.address_id = $1
     GROUP BY COALESCE(o.number, o.id), a.name
     ORDER BY MIN(o.execution_date) ASC, MIN(o.execution_time) ASC
     LIMIT $2 OFFSET $3`,
    [addressId, limit, offset]
  );
  return res.rows;
}

async function countActiveOrdersByAddress(addressId) {
  const res = await pool.query(
    `SELECT COUNT(*)::int AS cnt
     FROM orders o
     WHERE o.status IN ('active','assembled','processing','accepted') AND o.address_id = $1`,
    [addressId]
  );
  return res.rows[0] ? res.rows[0].cnt : 0;
}

async function getAddressNameById(addressId) {
  const res = await pool.query('SELECT name FROM address WHERE id = $1', [addressId]);
  return res.rows[0] ? res.rows[0].name : null;
}

async function getCatalogImagePathById(catalogItemId) {
  const id = parseInt(catalogItemId, 10);
  if (!Number.isFinite(id)) return null;
  const res = await pool.query('SELECT image_path FROM catalog_item WHERE id = $1', [id]);
  return res.rows[0] ? res.rows[0].image_path : null;
}
async function getOrderWithDetails(orderId) {
  const otCheck = await pool.query(`SELECT to_regclass('ordertype') IS NOT NULL AS exists`);
  const hasOt = !!(otCheck.rows[0] && otCheck.rows[0].exists);
  if (hasOt) {
    const res = await pool.query(
      `SELECT o.id, o.number, o.fulfillment_type, o.execution_date, o.execution_time, o.status,
              o.creator_full_name,
              o.total_cost,
              o.paid_amount,
              ps.name AS payment_status_name,
              a.name AS address_name,
              ot.name AS order_type_name,
              ot.called AS order_type_called,
              d.details,
              c.client_name, c.client_phone, c.recipient_name, c.recipient_phone, c.recipient_address,
              COALESCE(array_agg(p.file_id) FILTER (WHERE p.file_id IS NOT NULL), '{}') AS photos,
              cp.file_id AS card_photo
       FROM orders o 
       JOIN address a ON a.id = o.address_id
       LEFT JOIN ordertype ot ON ot.id = o.order_type_id
       LEFT JOIN payment_status ps ON ps.id = o.payment_status_id
       LEFT JOIN order_details d ON d.order_id = o.id
       LEFT JOIN contacts c ON c.order_id = o.id
       LEFT JOIN order_photos p ON p.order_id = o.id
       LEFT JOIN order_card_photo cp ON cp.order_id = o.id
       WHERE o.id = $1
       GROUP BY o.id, o.number, a.name, ot.name, ot.called, d.details, c.client_name, c.client_phone, c.recipient_name, c.recipient_phone, c.recipient_address, cp.file_id, ps.name`,
      [orderId]
    );
    return res.rows[0] || null;
  } else {
    const res = await pool.query(
      `SELECT o.id, o.number, o.fulfillment_type, o.execution_date, o.execution_time, o.status,
              o.creator_full_name,
              o.total_cost,
              o.paid_amount,
              ps.name AS payment_status_name,
              a.name AS address_name,
              o.order_type AS order_type_name,
              d.details,
              c.client_name, c.client_phone, c.recipient_name, c.recipient_phone, c.recipient_address,
              COALESCE(array_agg(p.file_id) FILTER (WHERE p.file_id IS NOT NULL), '{}') AS photos,
              cp.file_id AS card_photo
       FROM orders o 
       JOIN address a ON a.id = o.address_id
       LEFT JOIN payment_status ps ON ps.id = o.payment_status_id
       LEFT JOIN order_details d ON d.order_id = o.id
       LEFT JOIN contacts c ON c.order_id = o.id
       LEFT JOIN order_photos p ON p.order_id = o.id
       LEFT JOIN order_card_photo cp ON cp.order_id = o.id
       WHERE o.id = $1
       GROUP BY o.id, o.number, a.name, d.details, c.client_name, c.client_phone, c.recipient_name, c.recipient_phone, c.recipient_address, cp.file_id, ps.name`,
      [orderId]
    );
    const row = res.rows[0] || null;
    if (!row) return null;
    const s = String(row.order_type_name || '').toLowerCase();
    row.order_type_called =
      s === 'wedding' ? 'Свадебный букет' :
      s === 'composition' ? 'Композиция' :
      s === 'food' ? 'Еда' :
      s === 'flowers_food' ? 'Цветы + еда' : 'Другое';
    return row;
  }
}

async function completeOrder(orderId) {
  await pool.query('UPDATE orders SET status = $1 WHERE id = $2', ['completed', orderId]);
}

async function cancelOrder(orderId) {
  await pool.query('UPDATE orders SET status = $1 WHERE id = $2', ['cancelled', orderId]);
}

async function assembleOrder(orderId) {
  await pool.query('UPDATE orders SET status = $1 WHERE id = $2', ['assembled', orderId]);
}

async function acceptOrder(orderId) {
  await pool.query('UPDATE orders SET status = $1 WHERE id = $2', ['accepted', orderId]);
}

async function acceptOrdersByNumber(number) {
  await pool.query('UPDATE orders SET status = $1 WHERE number = $2', ['accepted', number]);
}

async function updateOrderDeliveryCost(orderId, cost) {
  await pool.query(
    `UPDATE order_details
     SET details = jsonb_set(COALESCE(details, '{}'::jsonb), '{delivery_cost}', to_jsonb($2::numeric), true)
     WHERE order_id = $1`,
    [orderId, cost]
  );
}

async function getOrdersByNumber(number) {
  const res = await pool.query(
    `SELECT o.id,
            o.number,
            o.fulfillment_type,
            o.execution_date,
            o.execution_time,
            o.status,
            o.total_cost,
            o.paid_amount,
            a.name AS address_name,
            d.details,
            c.client_name,
            c.client_phone,
            c.recipient_name,
            c.recipient_phone,
            c.recipient_address
     FROM orders o
     JOIN address a ON a.id = o.address_id
     LEFT JOIN order_details d ON d.order_id = o.id
     LEFT JOIN contacts c ON c.order_id = o.id
     WHERE o.number = $1
     ORDER BY o.id`,
    [number]
  );
  return res.rows;
}

async function deleteOrder(orderId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM orders WHERE id = $1', [orderId]);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    logger.error('deleteOrder error', e);
    throw e;
  } finally {
    client.release();
  }
}

async function upsertOrderChannelMessage(orderId, kind, chatId, messageId) {
  await pool.query(
    `INSERT INTO order_channel_message (order_id, kind, chat_id, message_id)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (order_id, kind) DO UPDATE SET chat_id = EXCLUDED.chat_id, message_id = EXCLUDED.message_id`,
    [orderId, String(kind || ''), String(chatId || ''), parseInt(messageId, 10)]
  );
}

async function getOrderChannelMessages(orderId) {
  const res = await pool.query(
    'SELECT kind, chat_id, message_id FROM order_channel_message WHERE order_id = $1',
    [orderId]
  );
  return res.rows;
}

async function addOrderPhoto(orderId, fileId) {
  await pool.query('INSERT INTO order_photos (order_id, file_id) VALUES ($1,$2)', [orderId, fileId]);
}

async function deleteOrderPhotos(orderId) {
  await pool.query('DELETE FROM order_photos WHERE order_id = $1', [orderId]);
}

async function getOrderPhotosCount(orderId) {
  const res = await pool.query('SELECT COUNT(*)::int AS cnt FROM order_photos WHERE order_id = $1', [orderId]);
  return res.rows[0] ? res.rows[0].cnt : 0;
}

module.exports = {
  createOrder,
  createOrderDraft,
  updateOrderAndActivate,
  listActiveOrders,
  listActiveOrdersByAddress,
  listActiveOrdersByAddressPage,
  countActiveOrdersByAddress,
  getOrderWithDetails,
  completeOrder,
  cancelOrder,
  assembleOrder,
  acceptOrder,
  acceptOrdersByNumber,
  findAddressIdByName,
  getAddressNameById,
  getCatalogImagePathById,
  deleteOrder,
  findPaymentStatusIdByName,
  findOrderTypeIdByName,
  getOrderTypes,
  getOrderTypeCalledByName,
  upsertOrderChannelMessage,
  getOrderChannelMessages,
  addOrderPhoto,
  deleteOrderPhotos,
  getOrderPhotosCount,
  updateOrderDeliveryCost,
  getOrdersByNumber,
  generateOrderNumber,
};
