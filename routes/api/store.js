const express = require('express');
const router = express.Router();
const path = require('path');
const orderService = require('../../services/orderService');
const logger = require('../../utils/logger');
const { sendToChannel, sendMediaGroupToChannel } = require('../../services/telegramService');

const REMINDER_CHANNEL_MAP = {
  'Белгород': '-1003868788094',
  'Строитель': '-1002136516687',
  'Северный': '-1002144814016',
  'Тестовый магазин': '-1001600945854',
};

function resolveReminderChannel(addressName) {
  const addr = String(addressName || '').trim();
  if (!addr) return null;
  return REMINDER_CHANNEL_MAP[addr] || null;
}

function isValidChannelId(id) {
  const s = String(id || '');
  return /^-\d+$/.test(s);
}

function buildImageUrl(p) {
  const raw = String(p || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const isWinAbs = /^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('\\\\');
  if (isWinAbs) return raw;
  const rootDir = path.join(__dirname, '..', '..');
  const cleaned = raw.replace(/^\/+/, '');
  return path.join(rootDir, cleaned);
}

function buildPositionsText(items) {
  const lines = [];
  let total = 0;
  let hasDelivery = false;
  items.forEach((item, index) => {
    const idx = index + 1;
    lines.push(`Позиция ${idx}: ${item.catalogItemName}`);
    const isDelivery = item.fulfillmentType === 'delivery';
    const price = Number(item.catalogItemPrice || 0);
    total += price;
    if (isDelivery) hasDelivery = true;
    lines.push(`Тип: ${isDelivery ? 'Доставка' : 'Самовывоз'}`);
    if (item.executionDate) {
      lines.push(`Дата: ${item.executionDate}`);
    }
    if (item.fromHour && item.toHour) {
      lines.push(`Время: с ${item.fromHour} по ${item.toHour}`);
    }
    if (isDelivery) {
      if (item.recipientName) {
        lines.push(`Получатель: ${item.recipientName}`);
      }
      if (item.recipientPhone) {
        lines.push(`Телефон получателя: ${item.recipientPhone}`);
      }
      if (item.recipientAddress) {
        lines.push(`Адрес доставки: ${item.recipientAddress}`);
      }
    } else {
      if (item.pickupSelf) {
        lines.push('Заберу лично');
      } else {
        if (item.pickupOtherName) {
          lines.push(`ФИО того, кто заберёт: ${item.pickupOtherName}`);
        }
        if (item.pickupOtherPhone) {
          lines.push(`Телефон того, кто заберёт: ${item.pickupOtherPhone}`);
        }
      }
    }
    if (item.cardNeeded && item.cardText) {
      lines.push(`Открытка: ${item.cardText}`);
    }
    lines.push(`Стоимость позиции: ${price.toFixed(2)} ₽`);
    lines.push('');
  });
  if (items.length > 0) {
    let footer = `Итоговая стоимость заказа: ${total.toFixed(2)} ₽`;
    if (hasDelivery) {
      footer += ' (Без учета доставки)';
    }
    lines.push(footer);
  }
  return lines.join('\n').trim();
}

router.post('/orders', async (req, res, next) => {
  try {
    const {
      addressId,
      addressName,
      clientName,
      clientPhone,
      clientTelegram,
      clientChatId,
      items,
    } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Нет позиций для создания заказа' });
    }

    const trimmedClientName = String(clientName || '').trim();
    const trimmedClientPhone = String(clientPhone || '').trim();

    if (!trimmedClientName || !trimmedClientPhone) {
      return res.status(400).json({ error: 'Не указаны данные клиента' });
    }

    const groupNumber = await orderService.generateOrderNumber();
    const totalOrderCost = items.reduce((sum, item) => sum + Number(item.catalogItemPrice || 0), 0);
    const createdOrderIds = [];

    const userId = 1;

    for (const item of items) {
      const fulfillmentType = item.fulfillmentType === 'pickup' ? 'pickup' : 'delivery';
      const execDate = item.executionDate;
      const fromHour = String(item.fromHour || '').trim();
      const toHour = String(item.toHour || '').trim();
      const execTime = fromHour ? `${fromHour}:00` : '00:00';
      const execTimeTo = toHour ? `${toHour}:00` : execTime;

      const details = {
        source: 'web_app',
        catalog_item_id: item.catalogItemId,
        catalog_item_name: item.catalogItemName,
        catalog_item_price: item.catalogItemPrice,
        fulfillment_type: fulfillmentType,
        from_hour: fromHour,
        to_hour: String(item.toHour || '').trim(),
        pickup_self: !!item.pickupSelf,
        client_telegram: clientTelegram || null,
        client_chat_id: clientChatId || null,
        card_needed: !!item.cardNeeded,
        card_text: item.cardText ? String(item.cardText).trim() : '',
      };

      const contacts = {
        client_name: trimmedClientName,
        client_phone: trimmedClientPhone,
        recipient_name: '',
        recipient_phone: '',
        recipient_address: null,
      };

      if (fulfillmentType === 'delivery') {
        contacts.recipient_name = String(item.recipientName || '').trim();
        contacts.recipient_phone = String(item.recipientPhone || '').trim();
        contacts.recipient_address = String(item.recipientAddress || '').trim() || null;
      } else {
        const pickupSelf = !!item.pickupSelf;
        if (pickupSelf) {
          contacts.recipient_name = trimmedClientName;
          contacts.recipient_phone = trimmedClientPhone;
        } else {
          contacts.recipient_name = String(item.pickupOtherName || '').trim();
          contacts.recipient_phone = String(item.pickupOtherPhone || '').trim();
        }
      }

      try {
        const orderId = await orderService.createOrder(userId, {
          fulfillment_type: fulfillmentType,
          address_id: addressId || null,
          store_name: addressName || null,
          execution_date: execDate,
          execution_time: execTime,
          execution_time_to: execTimeTo,
          order_type: 'composition',
          creator_full_name: trimmedClientName,
          details,
          contacts,
          payment_status_id: null,
          cost: item.catalogItemPrice || 0,
          total_cost: totalOrderCost,
          paid_amount: 0,
          status: 'processing',
          number: groupNumber,
        });
        createdOrderIds.push(orderId);
      } catch (e) {
        logger.error('Failed to create web app order', e);
        throw e;
      }
    }

    let channelId = null;
    try {
      const numberStr = String(groupNumber);
      channelId =
        resolveReminderChannel(addressName) ||
        process.env.ORDER_CHANNEL_ID ||
        process.env.REPORT_CHANNEL_ID ||
        null;
      if (!channelId || !isValidChannelId(channelId)) {
        throw new Error(`Invalid reminder channel for address "${addressName}"`);
      }
      const headerChannel = `Новый заказ №${numberStr} был создан в магазине`;
      const clientInfoLines = [];
      clientInfoLines.push(`Клиент: ${trimmedClientName}, ${trimmedClientPhone}`);
      if (clientTelegram) {
        clientInfoLines.push(`Telegram: ${clientTelegram}`);
      }
      const positionsText = buildPositionsText(items);
      const channelMessage = [headerChannel, '', clientInfoLines.join('\n'), '', positionsText].join('\n').trim();
      await sendToChannel(channelId, channelMessage);

      if (clientChatId) {
        const clientHeader = `Ваш заказ №${numberStr} находится в обработке, наш менеджер свяжется с вами в ближайшее время☺️!`;
        const clientMessage = [clientHeader, '', positionsText].join('\n').trim();
        await sendToChannel(String(clientChatId), clientMessage);
      }
    } catch (sendError) {
      logger.error('Failed to send store order messages', sendError);
      return res.status(500).json({ error: 'FAILED_TO_SEND_MESSAGES' });
    }

    try {
      const photoUrls = (items || [])
        .map((item) => buildImageUrl(item.imagePath || item.image_path))
        .filter((u) => !!u);

      if (photoUrls.length > 0) {
        await sendMediaGroupToChannel(channelId, photoUrls);
        if (clientChatId) {
          await sendMediaGroupToChannel(String(clientChatId), photoUrls);
        }
      }
    } catch (photoError) {
      logger.error('Failed to send store order photos', photoError);
    }

    res.json({
      number: groupNumber,
      orderIds: createdOrderIds,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
