require('dotenv').config();
const { InlineKeyboardButton } = require('node-telegram-bot-api');
const logger = require('../utils/logger');
const orderService = require('../services/orderService');

function getMainMenuKeyboard(userRights) {
  const buttons = [];

  const rn = (userRights || '').toLowerCase();
  const isAdmin = rn === 'администратор' || rn === 'разработчик';
  if (isAdmin) {
    const webAppUrl = process.env.WEB_APP_URL || '';
    if (webAppUrl && webAppUrl.startsWith('https://')) {
      logger.info(`Using WEB_APP_URL: ${webAppUrl}`);
      buttons.push([{ text: '📱 Перейти в приложение', web_app: { url: webAppUrl } }]);
    } else if (webAppUrl && webAppUrl.startsWith('http://')) {
      logger.warn(`WEB_APP_URL использует HTTP. Кнопка приложения скрыта. Для Telegram требуется HTTPS (используйте ngrok или туннель).`);
    }
  }

  buttons.push([{ text: '📝 Создать заказ', callback_data: 'order_create' }]);
  buttons.push([{ text: '📦 Управление заказами', callback_data: 'order_manage' }]);
  buttons.push([{ text: '🚪 Выйти из аккаунта', callback_data: 'logout' }]);

  // Кнопки только для администратора
  if (isAdmin) {
    buttons.push([{ text: '📊 Создать отчет', callback_data: 'create_report' }]);
    buttons.push([{ text: '👤 Управление пользователями', callback_data: 'manage_users' }]);
  }

  return {
    reply_markup: {
      inline_keyboard: buttons,
    },
  };
}

function getUserManagementKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '➕ Добавить пользователя', callback_data: 'manage_users_add' }],
        [{ text: '✏️ Изменить пользователя', callback_data: 'manage_users_edit' }],
        [{ text: '🏠 Главное меню', callback_data: 'back_menu' }],
      ],
    },
  };
}

function getUsersListKeyboard(users) {
  const rows = (users || []).map(u => [{ text: u.login, callback_data: `manage_user_select_${u.id}` }]);
  rows.push([{ text: '🏠 Главное меню', callback_data: 'back_menu' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function getUserActionsKeyboard(userId) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔐 Сменить пароль', callback_data: `manage_user_action_password_${userId}` }],
        [{ text: '🗑️ Удалить пользователя', callback_data: `manage_user_action_delete_${userId}` }],
        [{ text: '👑 Изменить права доступа', callback_data: `manage_user_action_rights_${userId}` }],
        [{ text: '🏠 Главное меню', callback_data: 'back_menu' }],
      ],
    },
  };
}

function getDeleteConfirmKeyboard(userId) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Подтвердить удаление', callback_data: `delete_user_confirm_${userId}` }],
        [{ text: '❌ Отмена', callback_data: `delete_user_cancel_${userId}` }],
        [{ text: '🏠 Главное меню', callback_data: 'back_menu' }],
      ],
    },
  };
}

function getRightsChangeKeyboard(userId) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '👤 Сотрудник', callback_data: `change_rights_employee_${userId}` }],
        [{ text: '👑 Администратор', callback_data: `change_rights_admin_${userId}` }],
        [{ text: '❌ Отмена', callback_data: 'change_rights_cancel' }],
        [{ text: '🏠 Главное меню', callback_data: 'back_menu' }],
      ],
    },
  };
}

function getRightsKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '👤 Сотрудник', callback_data: 'rights_employee' }],
        [{ text: '👑 Администратор', callback_data: 'rights_admin' }],
      ],
    },
  };
}

function getMonthsKeyboard() {
  const months = [];
  const currentDate = new Date();
  
  for (let i = 0; i < 6; i++) {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
    const monthName = date.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    months.push([{ text: monthName, callback_data: `month_${monthKey}` }]);
  }

  return {
    reply_markup: {
      inline_keyboard: months,
    },
  };
}

function getLastMonthsKeyboard(count) {
  const months = [];
  const currentDate = new Date();
  for (let i = 0; i < count; i++) {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
    const monthName = date.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    months.push([{ text: monthName, callback_data: `month_${monthKey}` }]);
  }
  return { reply_markup: { inline_keyboard: months } };
}

function getLastMonthsForAddressKeyboard(count, addressId) {
  const months = [];
  const currentDate = new Date();
  for (let i = 0; i < count; i++) {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
    const monthName = date.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    months.push([{ text: monthName, callback_data: `replenish_month_${addressId}_${monthKey}` }]);
  }
  return { reply_markup: { inline_keyboard: months } };
}

function getCancelKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '❌ Отмена', callback_data: 'cancel' }],
      ],
    },
  };
}

function getReportTypeKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Отчеты по привозам', callback_data: 'report_type_replenish' }],
        [{ text: 'Отчеты по пересчетам', callback_data: 'report_type_stock' }],
      ],
    },
  };
}

function getAddressKeyboardForReport(typeKey, addresses) {
  const rows = (addresses || []).map(a => [
    { text: a.name, callback_data: `report_addr_${a.id}_${typeKey}` }
  ]);
  return {
    reply_markup: {
      inline_keyboard: rows.length ? rows : [[{ text: 'Нет адресов', callback_data: 'noop' }]]
    }
  };
}

function getRecountDatesKeyboard(dates) {
  const rows = dates.map(d => {
    const dt = new Date(d);
    const label = dt.toLocaleDateString('ru-RU');
    const key = dt.toISOString().slice(0, 10);
    return [{ text: `дата пересчета: ${label}`, callback_data: `recount_date_${key}` }];
  });
  return { reply_markup: { inline_keyboard: rows.length ? rows : [[{ text: 'Нет данных', callback_data: 'noop' }]] } };
}

function getRecountDatesForAddressKeyboard(dates, addressId) {
  const rows = dates.map(d => {
    const dt = new Date(d);
    const label = dt.toLocaleDateString('ru-RU');
    const key = dt.toISOString().slice(0, 10);
    return [{ text: `дата пересчета: ${label}`, callback_data: `recount_date_${addressId}_${key}` }];
  });
  return { reply_markup: { inline_keyboard: rows.length ? rows : [[{ text: 'Нет данных', callback_data: 'noop' }]] } };
}

function getMenuReplyKeyboard() {
  return {};
}

function getFulfillmentKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚶 Самовывоз', callback_data: 'order_fulfillment_pickup' }],
        [{ text: '🚚 Доставка', callback_data: 'order_fulfillment_delivery' }],
        [{ text: '⬅️ Назад', callback_data: 'back_menu' }],
      ],
    },
  };
}

function getStoreKeyboard(userRights) {
  const rn = String(userRights || '').toLowerCase();
  const isDev = rn === 'разработчик';
  const rows = [
    [{ text: 'Северный', callback_data: 'order_store_Северный' }],
    [{ text: 'Строитель', callback_data: 'order_store_Строитель' }],
    [{ text: 'Белгород', callback_data: 'order_store_Белгород' }],
  ];
  if (isDev) {
    rows.unshift([{ text: 'Тестовый магазин', callback_data: 'order_store_Тестовый магазин' }]);
  }
  rows.push([{ text: '⬅️ Назад', callback_data: 'order_back' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function getCalendarKeyboard(monthKey, minDateStr) {
  const [yearStr, monthStr] = (monthKey || '').split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const daysInMonth = new Date(year, month, 0).getDate();
  const minDate = new Date(minDateStr);
  const rows = [];
  let row = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const label = String(d).padStart(2, '0');
    if (date < minDate) {
      row.push({ text: `·`, callback_data: 'noop' });
    } else {
      const iso = date.toISOString().slice(0, 10);
      row.push({ text: label, callback_data: `order_date_${iso}` });
    }
    if (row.length === 7) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) rows.push(row);
  const prevMonth = new Date(year, month - 2, 1);
  const nextMonth = new Date(year, month, 1);
  const today = new Date(minDateStr);
  const prevKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
  const nextKey = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
  const controls = [];
  const canPrev = prevMonth >= new Date(today.getFullYear(), today.getMonth(), 1);
  controls.push({ text: '◀️', callback_data: canPrev ? `order_cal_prev_${prevKey}` : 'noop' });
  controls.push({ text: `${year}-${String(month).padStart(2, '0')}`, callback_data: 'noop' });
  controls.push({ text: '▶️', callback_data: `order_cal_next_${nextKey}` });
  rows.push(controls);
  rows.push([{ text: '⬅️ Назад', callback_data: 'order_back' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function getTimeKeyboard() {
  const rows = [];
  const toLabel = (h) => `${String(h).padStart(2, '0')}:00`;
  let row = [];
  for (let h = 7; h <= 21; h++) {
    row.push({ text: toLabel(h), callback_data: `order_time_${toLabel(h)}` });
    if (row.length === 2) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) rows.push(row);
  rows.push([{ text: '⬅️ Назад', callback_data: 'order_back' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

function getTimeKeyboardForDate(dateIso) {
  const rows = [];
  const sel = new Date(dateIso);
  const fmt = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hour12: false });
  const parts = fmt.formatToParts(new Date());
  const getPart = (name) => {
    const p = parts.find(x => x.type === name);
    return p ? parseInt(p.value, 10) : null;
  };
  const mYear = getPart('year');
  const mMonth = getPart('month');
  const mDay = getPart('day');
  const mHour = getPart('hour');
  const isToday =
    sel.getFullYear() === mYear &&
    (sel.getMonth() + 1) === mMonth &&
    sel.getDate() === mDay;
  const startHour = isToday ? Math.max(7, mHour + 2) : 7;
  const endHour = 21;
  const toLabel = (h) => `${String(h).padStart(2, '0')}:00`;
  let row = [];
  for (let h = startHour; h <= endHour; h++) {
    row.push({ text: toLabel(h), callback_data: `order_time_${toLabel(h)}` });
    if (row.length === 2) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) rows.push(row);
  if (!rows.length) {
    rows.push([{ text: 'Нет доступного времени', callback_data: 'noop' }]);
  }
  rows.push([{ text: '⬅️ Назад', callback_data: 'order_back' }]);
  return { reply_markup: { inline_keyboard: rows } };
}

async function getOrderTypeKeyboard(userRights) {
  try {
    const types = await orderService.getOrderTypes();
    const rn = String(userRights || '').toLowerCase();
    const isDev = rn === 'разработчик';
    const filtered = (types || []).filter(t => {
      const nm = String(t.name || '').toLowerCase();
      if (nm === 'test' && !isDev) return false;
      return true;
    });
    const rows = filtered.map(t => [
      { text: String(t.called || t.name || ''), callback_data: `order_type_${t.name}` }
    ]);
    const hasTest = (types || []).some(t => String(t.name || '').toLowerCase() === 'test');
    if (isDev && !hasTest) {
      rows.unshift([{ text: 'Тестовый заказ', callback_data: 'order_type_test' }]);
    }
    rows.push([{ text: '⬅️ Назад', callback_data: 'order_back' }]);
    return { reply_markup: { inline_keyboard: rows.length ? rows : [[{ text: 'Нет типов заказов', callback_data: 'noop' }]] } };
  } catch (e) {
    logger.error('getOrderTypeKeyboard error', e);
    return { reply_markup: { inline_keyboard: [[{ text: 'Нет типов заказов', callback_data: 'noop' }], [{ text: '⬅️ Назад', callback_data: 'order_back' }]] } };
  }
}

function getNextKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '➡️ Далее', callback_data: 'order_next' }],
        [{ text: '⬅️ Назад', callback_data: 'order_back' }],
      ],
    },
  };
}

function getYesNoKeyboard(yesKey, noKey) {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Да', callback_data: yesKey }, { text: '❌ Нет', callback_data: noKey }],
        [{ text: '⬅️ Назад', callback_data: 'order_back' }],
      ],
    },
  };
}

function getPaymentStatusKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Оплачен полностью', callback_data: 'payment_full' }],
        [{ text: 'Оплачен частично', callback_data: 'payment_partial' }],
        [{ text: 'Не оплачен', callback_data: 'payment_none' }],
        [{ text: '⬅️ Назад', callback_data: 'order_back' }],
      ],
    },
  };
}

function getInterruptOrderKeyboard() {
  return {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'Удалить заказ', callback_data: 'interrupt_order_delete' }],
        [{ text: 'Продолжить создание', callback_data: 'interrupt_order_continue' }],
      ],
    },
  };
}

module.exports = {
  getMainMenuKeyboard,
  getRightsKeyboard,
  getMonthsKeyboard,
  getLastMonthsKeyboard,
  getLastMonthsForAddressKeyboard,
  getCancelKeyboard,
  getReportTypeKeyboard,
  getAddressKeyboardForReport,
  getRecountDatesKeyboard,
  getRecountDatesForAddressKeyboard,
  getMenuReplyKeyboard,
  getFulfillmentKeyboard,
  getStoreKeyboard,
  getCalendarKeyboard,
  getTimeKeyboard,
  getTimeKeyboardForDate,
  getOrderTypeKeyboard,
  getNextKeyboard,
  getYesNoKeyboard,
  getInterruptOrderKeyboard,
  getPaymentStatusKeyboard,
  getUserManagementKeyboard,
  getUsersListKeyboard,
  getUserActionsKeyboard,
  getDeleteConfirmKeyboard,
  getRightsChangeKeyboard,
};
