const pool = require('../config/database');
const logger = require('../utils/logger');
const orderService = require('./orderService');
const { sendToChannel, sendPhotoToChannel, sendMediaGroupToChannel } = require('./telegramService');

const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID || '-1003345446030';
const ERROR_CHANNEL_ID = process.env.ERROR_CHANNEL_ID || null;

const CHANNEL_MAP = {
  'Белгород': '-1003868788094',
  'Строитель': '-1002136516687',
  'Северный': '-1002144814016',
  'Тестовый магазин': '-5159177330',
};

function formatDaysLeft(triggerType) {
  if (triggerType === '14d') return 14;
  if (triggerType === '7d') return 7;
  if (triggerType === '1d') return 1;
  return 0;
}

async function getPendingReminders() {
  const res = await pool.query(
    `SELECT r.id, r.order_id, r.trigger_type, r.scheduled_date, 
            o.execution_date, o.execution_time, a.name AS address_name
     FROM reminders r 
     JOIN orders o ON o.id = r.order_id
     JOIN address a ON a.id = o.address_id
     WHERE r.sent = FALSE 
       AND o.status IN ('active','assembled','processing','accepted')
       AND r.scheduled_date = CURRENT_DATE`
  );
  return res.rows;
}

async function markSent(reminderId) {
  await pool.query('UPDATE reminders SET sent = TRUE, sent_at = NOW() WHERE id = $1', [reminderId]);
}

async function markOutdatedAsSent() {
  try {
    await pool.query(
      `UPDATE reminders 
       SET sent = TRUE, sent_at = NOW() 
       WHERE sent = FALSE 
         AND scheduled_date < CURRENT_DATE`
    );
  } catch (e) {
    logger.error('markOutdatedAsSent error', e);
  }
}

function formatRuDate(val) {
  const d = val instanceof Date ? val : new Date(val);
  if (!d || Number.isNaN(d.getTime())) return String(val || '');
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

function isValidChannelId(id) {
  const s = String(id || '');
  return /^-\d+$/.test(s);
}

function formatOrderDetails(o) {
  const lines = [];
  lines.push(`Тип получения: ${o.fulfillment_type === 'pickup' ? 'Самовывоз' : 'Доставка'}`);
  lines.push(`Точка: ${o.address_name}`);
  lines.push(`Дата: ${formatRuDate(o.execution_date)}`);
  lines.push(`Время: ${String(o.execution_time || '')}`);
  lines.push(`Тип заказа: ${String(o.order_type_called || '')}`);
  if (o.creator_full_name) {
    lines.push(`Оформил: ${o.creator_full_name}`);
  }
  const det = o.details || {};
  if (det && det.composition_kind) {
    lines.push(`Тип композиции: ${det.composition_kind === 'box' ? 'коробка' : det.composition_kind === 'bouquet' ? 'букет' : String(det.composition_kind)}`);
  }
  if (det && det.composition) {
    lines.push(`Состав: ${det.composition}`);
  }
  if (det && det.description) {
    lines.push(`Описание:\n${det.description}`);
  }
  if (det && det.card_text && !o.card_photo) {
    lines.push(`Открытка: ${det.card_text}`);
  } else if (o.card_photo) {
    lines.push('Открытка: фото добавлено');
  }
  if (det && det.comment) {
    lines.push(`Комментарий: ${det.comment}`);
  }
  if (typeof o.total_cost !== 'undefined') {
    const tc = Number(o.total_cost || 0);
    const pa = Number(o.paid_amount || 0);
    lines.push(`Оплата: ${o.payment_status_name || ''}`);
    lines.push(`Сумма: ${tc}`);
    lines.push(`Оплачено: ${pa}`);
    const rem = tc - pa;
    lines.push(`Остаток: ${rem}`);
  }
  lines.push(`Контакты:`);
  lines.push(`Клиент: ${o.client_name || ''}, ${o.client_phone || ''}`);
  if (o.fulfillment_type !== 'pickup') {
    const recAddr = o.recipient_address ? ', ' + o.recipient_address : '';
    lines.push(`Получатель: ${o.recipient_name || ''}, ${o.recipient_phone || ''}${recAddr}`);
  }
  const fidList = (Array.isArray(o.photos) ? o.photos : []).filter(Boolean);
  const count = fidList.length + (o.card_photo ? 1 : 0);
  if (count > 0) lines.push(`Фото: ${count}`);
  return lines.join('\n');
}

function formatReminderMessage(orderId, executionDate, daysLeft, order) {
  return [
    'Напоминание!',
    `Есть активный заказ №${orderId} на ${formatRuDate(executionDate)}.`,
    '',
    `Количество дней: ${daysLeft}`,
    '',
    formatOrderDetails(order)
  ].join('\n');
}

function formatAdminReminderMessage(orderId, executionDate, daysLeft, addressName, order) {
  return [
    'Напоминание!',
    `Есть активный заказ №${orderId} на ${formatRuDate(executionDate)}.`,
    `Адрес: ${addressName || ''}`,
    '',
    `Количество дней: ${daysLeft}`,
    '',
    formatOrderDetails(order)
  ].join('\n');
}

function formatReminderErrorMessage(orderId, triggerType, addressName, error) {
  const errMsg = String((error && error.message) || error || '').slice(0, 500);
  const num = Number(orderId || 0) || orderId;
  return [
    '❌ Ошибка отправки напоминания',
    `Заказ №${num}`,
    `Триггер: ${triggerType}`,
    `Адрес: ${addressName || ''}`,
    `Ошибка: ${errMsg}`,
  ].join('\n');
}

async function processDueReminders() {
  try {
    await markOutdatedAsSent();
    const nowUtcMs = Date.now();
    const pending = await getPendingReminders();
    for (const r of pending) {
      const sd = r.scheduled_date;
      const d = sd instanceof Date ? sd : new Date(sd);
      const y = d.getFullYear();
      const m = d.getMonth();
      const day = d.getDate();
      const targetUtcMs = Date.UTC(y, m, day, 6, 0, 0);
      if (nowUtcMs >= targetUtcMs) {
        try {
          const order = await orderService.getOrderWithDetails(r.order_id);
          if (!order) {
            continue;
          }
          if (!['active','assembled','processing','accepted'].includes(String(order.status || ''))) {
            await markSent(r.id);
            continue;
          }
          const addr = r.address_name || '';
          const channelId = CHANNEL_MAP[addr];
          const daysLeft = formatDaysLeft(r.trigger_type);
          const msg = formatReminderMessage(r.order_id, r.execution_date, daysLeft, order);
          if (channelId && isValidChannelId(channelId)) {
            await sendToChannel(channelId, msg);
            const fidList = (Array.isArray(order.photos) ? order.photos : []).filter(Boolean);
            if (fidList.length === 1) {
              await sendPhotoToChannel(channelId, fidList[0]);
            } else if (fidList.length > 1) {
              await sendMediaGroupToChannel(channelId, fidList);
            }
            if (order.card_photo) {
              await sendPhotoToChannel(channelId, order.card_photo);
            }
          } else {
            logger.warn(`No valid channel mapping for address "${addr}", sending to admin only for reminder ${r.id}`);
            if (ERROR_CHANNEL_ID && isValidChannelId(ERROR_CHANNEL_ID)) {
              try {
                const warnMsg = [
                  '⚠️ Канал адреса не настроен или некорректен',
                  `Заказ №${r.order_id}`,
                  `Адрес: ${addr || ''}`,
                  `Триггер: ${r.trigger_type}`,
                ].join('\n');
                await sendToChannel(ERROR_CHANNEL_ID, warnMsg);
              } catch (eWarn) {
                logger.error('Failed to notify error channel about address mapping issue', eWarn);
              }
            }
          }
          const adminMsg = formatAdminReminderMessage(r.order_id, r.execution_date, daysLeft, addr, order);
          const suppressAdmin = String(addr || '').toLowerCase() === 'тестовый магазин';
          if (!suppressAdmin && isValidChannelId(ADMIN_CHANNEL_ID)) {
            await sendToChannel(ADMIN_CHANNEL_ID, adminMsg);
            const fidList2 = (Array.isArray(order.photos) ? order.photos : []).filter(Boolean);
            if (fidList2.length === 1) {
              await sendPhotoToChannel(ADMIN_CHANNEL_ID, fidList2[0]);
            } else if (fidList2.length > 1) {
              await sendMediaGroupToChannel(ADMIN_CHANNEL_ID, fidList2);
            }
            if (order.card_photo) {
              await sendPhotoToChannel(ADMIN_CHANNEL_ID, order.card_photo);
            }
          }
          await markSent(r.id);
        } catch (e) {
          logger.error('Error sending reminder', e);
          if (ERROR_CHANNEL_ID && isValidChannelId(ERROR_CHANNEL_ID)) {
            try {
              const em = formatReminderErrorMessage(r.order_id, r.trigger_type, r.address_name || '', e);
              await sendToChannel(ERROR_CHANNEL_ID, em);
            } catch (e2) {
              logger.error('Failed to notify error channel about reminder failure', e2);
            }
          }
        }
      }
    }
  } catch (e) {
    logger.error('processDueReminders error', e);
  }
}

async function sendDueRemindersForOrder(orderId) {
  try {
    const nowUtcMs = Date.now();
    const res = await pool.query(
      `SELECT r.id, r.order_id, r.trigger_type, r.scheduled_date, 
              o.execution_date, o.execution_time, a.name AS address_name
       FROM reminders r 
       JOIN orders o ON o.id = r.order_id
       JOIN address a ON a.id = o.address_id
       WHERE r.sent = FALSE 
         AND r.order_id = $1 
         AND r.scheduled_date = CURRENT_DATE
         AND o.status IN ('active','assembled','processing','accepted')`,
      [orderId]
    );
    for (const r of res.rows) {
      const sd = r.scheduled_date;
      const d = sd instanceof Date ? sd : new Date(sd);
      const y = d.getFullYear();
      const m = d.getMonth();
      const day = d.getDate();
      const targetUtcMs = Date.UTC(y, m, day, 6, 0, 0);
      if (nowUtcMs >= targetUtcMs) {
        try {
          const order = await orderService.getOrderWithDetails(r.order_id);
          if (!order) {
            continue;
          }
          if (!['active','assembled','processing','accepted'].includes(String(order.status || ''))) {
            await markSent(r.id);
            continue;
          }
          const addr = r.address_name || '';
          const channelId = CHANNEL_MAP[addr];
          const daysLeft = formatDaysLeft(r.trigger_type);
          const msg = formatReminderMessage(r.order_id, r.execution_date, daysLeft, order);
          if (channelId && isValidChannelId(channelId)) {
            await sendToChannel(channelId, msg);
            const fidList = (Array.isArray(order.photos) ? order.photos : []).filter(Boolean);
            if (fidList.length === 1) {
              await sendPhotoToChannel(channelId, fidList[0]);
            } else if (fidList.length > 1) {
              await sendMediaGroupToChannel(channelId, fidList);
            }
            if (order.card_photo) {
              await sendPhotoToChannel(channelId, order.card_photo);
            }
          } else {
            logger.warn(`No valid channel mapping for address "${addr}", sending to admin only for reminder ${r.id}`);
            if (ERROR_CHANNEL_ID && isValidChannelId(ERROR_CHANNEL_ID)) {
              try {
                const warnMsg = [
                  '⚠️ Канал адреса не настроен или некорректен',
                  `Заказ №${r.order_id}`,
                  `Адрес: ${addr || ''}`,
                  `Триггер: ${r.trigger_type}`,
                ].join('\n');
                await sendToChannel(ERROR_CHANNEL_ID, warnMsg);
              } catch (eWarn) {
                logger.error('Failed to notify error channel about address mapping issue', eWarn);
              }
            }
          }
          const adminMsg = formatAdminReminderMessage(r.order_id, r.execution_date, daysLeft, addr, order);
          const suppressAdmin = String(addr || '').toLowerCase() === 'тестовый магазин';
          if (!suppressAdmin && isValidChannelId(ADMIN_CHANNEL_ID)) {
            await sendToChannel(ADMIN_CHANNEL_ID, adminMsg);
            const fidList2 = (Array.isArray(order.photos) ? order.photos : []).filter(Boolean);
            if (fidList2.length === 1) {
              await sendPhotoToChannel(ADMIN_CHANNEL_ID, fidList2[0]);
            } else if (fidList2.length > 1) {
              await sendMediaGroupToChannel(ADMIN_CHANNEL_ID, fidList2);
            }
            if (order.card_photo) {
              await sendPhotoToChannel(ADMIN_CHANNEL_ID, order.card_photo);
            }
          }
          await markSent(r.id);
        } catch (e) {
          logger.error('Error sending order reminder (event-driven)', e);
          if (ERROR_CHANNEL_ID && isValidChannelId(ERROR_CHANNEL_ID)) {
            try {
              const em = formatReminderErrorMessage(r.order_id, r.trigger_type, r.address_name || '', e);
              await sendToChannel(ERROR_CHANNEL_ID, em);
            } catch (e2) {
              logger.error('Failed to notify error channel about reminder failure', e2);
            }
          }
        }
      }
    }
  } catch (e) {
    logger.error('sendDueRemindersForOrder error', e);
  }
}

function startDailyReminderJob() {
  const msUntilNext = () => {
    const now = new Date();
    const todayTargetMs = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      6, 0, 0
    );
    const nowMs = now.getTime();
    if (nowMs < todayTargetMs) {
      return todayTargetMs - nowMs;
    }
    const next = new Date(todayTargetMs);
    next.setUTCDate(next.getUTCDate() + 1);
    const nextMs = Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), next.getUTCDate(), 6, 0, 0);
    return nextMs - nowMs;
  };
  const scheduleNext = () => {
    setTimeout(async () => {
      await processDueReminders();
      scheduleNext();
    }, msUntilNext());
  };
  (async () => {
    try {
      const chk = await pool.query('SELECT COUNT(*)::int AS cnt FROM reminders WHERE scheduled_date = CURRENT_DATE AND sent = FALSE');
      const hasUnsent = (chk.rows[0] && chk.rows[0].cnt > 0);
      if (hasUnsent) {
        await processDueReminders();
      } else {
        logger.info('Daily reminders already sent for today; skipping immediate run on startup');
      }
    } catch (e) {
      logger.warn('Failed to check unsent reminders at startup; running processDueReminders anyway', e);
      await processDueReminders();
    } finally {
      scheduleNext();
    }
  })();
}

module.exports = {
  startDailyReminderJob,
  processDueReminders,
  sendDueRemindersForOrder,
  markOutdatedAsSent,
};
