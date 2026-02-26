require('dotenv').config();
const { initializeBot, getBot } = require('../services/telegramService');
const { handleStart, handleMessage } = require('./handlers/auth');
const { handleMainMenu } = require('./handlers/menu');
const { 
  handleOrderCreate, 
  handleOrderManage, 
  handleCallback: handleOrderCallback,
  handleOrderMessage,
  handleConfirmOrEdit
} = require('./handlers/order');
const { getUserState, clearUserState, setUserState } = require('./handlers/auth');
const { startDailyReminderJob } = require('../services/reminderService');
const { 
  handleAddUser, 
  handleRightsSelection, 
  handleCreateReport, 
  handleMonthSelection,
  handleReportTypeSelection,
  handleCancel,
  handleManageUsers,
  handleManageUsersEdit,
  handleManageUserSelect,
  handleChangePasswordStart,
  handleDeleteUserPrompt,
  handleDeleteUserConfirm,
  handleDeleteUserCancel,
  handleChangeUserRightsStart,
  handleChangeUserRightsCommit
} = require('./handlers/admin');
const { handleError } = require('./middleware/errorHandler');
const logger = require('../utils/logger');
const pool = require('../config/database');

// Проверяем наличие токена
if (!process.env.TELEGRAM_BOT_TOKEN) {
  logger.error('TELEGRAM_BOT_TOKEN not found in environment variables');
  process.exit(1);
}

const BOT_LOCK_KEY = 987654321; // arbitrary unique key
let botLockClient = null;
let bot = null;
let lastPollingRestart = 0;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let restartInProgress = false;
let restartFailures = 0;
let restartWindowStartedAt = 0;
let longBackoffActive = false;
let longBackoffIndex = 0;
const longBackoffSchedule = [300000, 600000, 900000];

function isTransientNetworkError(error) {
  const code = (error && (error.code || (error.cause && error.cause.code))) || '';
  const msg = String((error && error.message) || '').toLowerCase();
  return (
    code === 'ENOTFOUND' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'EAI_AGAIN' ||
    msg.includes('getaddrinfo enotfound') ||
    msg.includes('socket hang up') ||
    msg.includes('timed out') ||
    msg.includes('network') ||
    msg.includes('dns')
  );
}

async function acquireBotLock() {
  try {
    botLockClient = await pool.connect();
    const res = await botLockClient.query('SELECT pg_try_advisory_lock($1) AS locked', [BOT_LOCK_KEY]);
    if (res.rows[0] && res.rows[0].locked) {
      return true;
    }
    const high32 = Math.floor(BOT_LOCK_KEY / 4294967296);
    const low32 = (BOT_LOCK_KEY >>> 0);
    try {
      const holders = await botLockClient.query(
        `SELECT l.pid
         FROM pg_locks l
         WHERE l.locktype = 'advisory'
           AND l.classid = $1
           AND l.objid = $2
           AND l.granted`,
        [high32, low32]
      );
      for (const row of holders.rows) {
        const pid = row.pid;
        if (!pid) continue;
        try {
          const term = await botLockClient.query('SELECT pg_terminate_backend($1) AS terminated', [pid]);
          if (!(term.rows[0] && term.rows[0].terminated)) {
            logger.warn('Failed to terminate backend holding bot lock');
          }
        } catch (e2) {
          logger.warn('Error terminating backend holding bot lock', e2);
        }
      }
    } catch (eFind) {
      logger.warn('Failed to inspect advisory lock holder', eFind);
    }
    const re = await botLockClient.query('SELECT pg_try_advisory_lock($1) AS locked', [BOT_LOCK_KEY]);
    return re.rows[0] && re.rows[0].locked;
  } catch (e) {
    logger.error('Failed to acquire bot lock', e);
    return false;
  }
}

async function releaseBotLock() {
  try {
    if (botLockClient) {
      await botLockClient.query('SELECT pg_advisory_unlock($1)', [BOT_LOCK_KEY]);
      botLockClient.release();
      botLockClient = null;
    }
  } catch (e) {
    logger.error('Failed to release bot lock', e);
  }
}

async function start() {
  const locked = await acquireBotLock();
  if (!locked) {
    logger.warn('Another bot instance is running. Exiting current process.');
    process.exit(0);
    return;
  }
  bot = initializeBot(process.env.TELEGRAM_BOT_TOKEN);
  startDailyReminderJob();

  // Обработчик команды /start
  bot.onText(/\/start/, async (msg) => {
    try {
      if ((msg.chat.type || '') !== 'private') { return; }
      await handleStart(bot, msg);
    } catch (error) {
      await handleError(bot, error, { chatId: msg.chat.id, command: '/start' });
    }
  });

  // Обработчик команды /menu
  bot.onText(/\/menu/, async (msg) => {
    try {
      if ((msg.chat.type || '') !== 'private') { return; }
      const st = getUserState(msg.from.id);
      if ((st.state || '').startsWith('order_')) {
        const { getInterruptOrderKeyboard } = require('./keyboards');
        await bot.sendMessage(msg.chat.id, 'Переход доступен после окончания оформления заказа. Хотите прекратить создание заказа?', getInterruptOrderKeyboard());
        return;
      }
      await handleMainMenu(bot, msg);
    } catch (error) {
      await handleError(bot, error, { chatId: msg.chat.id, command: '/menu' });
    }
  });

  // Обработчик текстовых сообщений
  bot.on('message', async (msg) => {
    // Пропускаем команды
    if (msg.text && msg.text.startsWith('/')) {
      return;
    }
    if ((msg.chat.type || '') !== 'private') { return; }

    try {
      if (msg.text && msg.text.trim().toLowerCase() === 'меню') {
        const st2 = getUserState(msg.from.id);
        if ((st2.state || '').startsWith('order_')) {
          const { getInterruptOrderKeyboard } = require('./keyboards');
          await bot.sendMessage(msg.chat.id, 'Переход доступен после окончания оформления заказа. Хотите прекратить создание заказа?', getInterruptOrderKeyboard());
          return;
        } else {
          await handleMainMenu(bot, msg);
          return;
        }
      }
      const st3 = getUserState(msg.from.id);
      const expAt = (st3.data || {}).auth_expires_at;
      if ((st3.state || '').startsWith('order_') || st3.state === 'authenticated') {
        if (expAt && Date.now() > expAt) {
          clearUserState(msg.from.id);
          await bot.sendMessage(msg.chat.id, '❌ Вы не авторизованы. Введите /start.');
          return;
        }
      }
      const st = getUserState(msg.from.id);
      if ((st.state || '').startsWith('order_')) {
        await handleOrderMessage(bot, msg);
      } else {
        await handleMessage(bot, msg);
      }
    } catch (error) {
      await handleError(bot, error, { chatId: msg.chat.id, type: 'message' });
    }
  });

  // Обработчик callback_query (нажатия на кнопки)
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    try {
      if (((query.message.chat || {}).type || '') !== 'private') { return; }
      try {
        await bot.answerCallbackQuery(query.id);
      } catch (e) {
        const msg = String((e && e.message) || '').toLowerCase();
        if (!(msg.includes('query is too old') || msg.includes('query id is invalid'))) {
          throw e;
        }
      }

      const ctx = { chat: query.message.chat, from: query.from };
      const stAuth = getUserState(query.from.id);
      const expAt = (stAuth.data || {}).auth_expires_at;
      const stState = String(stAuth.state || '');
      if ((stState.startsWith('order_') || stState === 'authenticated') && expAt && Date.now() > expAt) {
        clearUserState(query.from.id);
        await bot.sendMessage(chatId, '❌ Вы не авторизованы. Введите /start.');
        return;
      }
      const { getInterruptOrderKeyboard } = require('./keyboards');
      const isOrderFlow = stState.startsWith('order_') && !stState.startsWith('order_manage');
      const isOrderCallback = String(data || '').startsWith('order_') || String(data || '').startsWith('payment_') || String(data || '').startsWith('delivery_paid_') || String(data || '').startsWith('interrupt_order_') || data === 'cancel' || data === 'noop';
      if (isOrderFlow && !isOrderCallback) {
        await bot.sendMessage(chatId, 'Переход доступен после окончания оформления заказа. Хотите прекратить создание заказа?', getInterruptOrderKeyboard());
        return;
      }
      if (data === 'add_user') {
        await handleAddUser(bot, ctx);
      } else if (data === 'create_report') {
        await handleCreateReport(bot, ctx);
      } else if (data.startsWith('report_type_')) {
        await handleReportTypeSelection(bot, ctx, data);
      } else if (data.startsWith('report_addr_')) {
        const payload = data.substring('report_addr_'.length);
        const underscore = payload.indexOf('_');
        const addressId = payload.substring(0, underscore);
        const typeKey = payload.substring(underscore + 1);
        const { handleReportAddressSelection } = require('./handlers/admin');
        await handleReportAddressSelection(bot, ctx, addressId, typeKey);
      } else if (data === 'order_create') {
        await handleOrderCreate(bot, ctx);
      } else if (data === 'order_manage') {
        await handleOrderManage(bot, ctx);
      } else if (data.startsWith('month_')) {
        const monthKey = data.replace('month_', '');
        await handleMonthSelection(bot, ctx, monthKey);
      } else if (data.startsWith('replenish_month_')) {
        const payload = data.substring('replenish_month_'.length);
        const underscore = payload.indexOf('_');
        const addressId = payload.substring(0, underscore);
        const monthKey = payload.substring(underscore + 1);
        const { handleReplenishMonthSelection } = require('./handlers/admin');
        await handleReplenishMonthSelection(bot, ctx, addressId, monthKey);
      } else if (data.startsWith('recount_date_')) {
        const payload = data.substring('recount_date_'.length);
        if (payload.includes('_')) {
          const underscore = payload.indexOf('_');
          const addressId = payload.substring(0, underscore);
          const dateKey = payload.substring(underscore + 1);
          const { handleRecountDateSelectionByAddress } = require('./handlers/admin');
          await handleRecountDateSelectionByAddress(bot, ctx, addressId, dateKey);
        } else {
          const dateKey = payload;
          const { handleRecountDateSelection } = require('./handlers/admin');
          await handleRecountDateSelection(bot, ctx, dateKey);
        }
      } else if (data.startsWith('rights_')) {
        const rightsId = data.replace('rights_', '');
        await handleRightsSelection(bot, ctx, rightsId);
      } else if (data === 'cancel') {
        await handleCancel(bot, ctx);
      } else if (data === 'logout') {
        clearUserState(query.from.id);
        await bot.sendMessage(chatId, '❌ Вы не авторизованы. Введите /start.');
      } else if (data === 'manage_users') {
        await handleManageUsers(bot, ctx);
      } else if (data === 'manage_users_add') {
        await handleAddUser(bot, ctx);
      } else if (data === 'manage_users_edit') {
        await handleManageUsersEdit(bot, ctx);
      } else if (data.startsWith('manage_user_select_')) {
        const userIdToEdit = data.substring('manage_user_select_'.length);
        await handleManageUserSelect(bot, ctx, userIdToEdit);
      } else if (data.startsWith('manage_user_action_password_')) {
        const targetUserId = data.substring('manage_user_action_password_'.length);
        await handleChangePasswordStart(bot, ctx, targetUserId);
      } else if (data.startsWith('manage_user_action_delete_')) {
        const targetUserId = data.substring('manage_user_action_delete_'.length);
        await handleDeleteUserPrompt(bot, ctx, targetUserId);
      } else if (data.startsWith('delete_user_confirm_')) {
        const targetUserId = data.substring('delete_user_confirm_'.length);
        await handleDeleteUserConfirm(bot, ctx, targetUserId);
      } else if (data.startsWith('delete_user_cancel_')) {
        await handleDeleteUserCancel(bot, ctx);
      } else if (data.startsWith('manage_user_action_rights_')) {
        const targetUserId = data.substring('manage_user_action_rights_'.length);
        await handleChangeUserRightsStart(bot, ctx, targetUserId);
      } else if (data.startsWith('change_rights_employee_')) {
        const targetUserId = data.substring('change_rights_employee_'.length);
        await handleChangeUserRightsCommit(bot, ctx, targetUserId, 'employee');
      } else if (data.startsWith('change_rights_admin_')) {
        const targetUserId = data.substring('change_rights_admin_'.length);
        await handleChangeUserRightsCommit(bot, ctx, targetUserId, 'admin');
      } else if (data === 'change_rights_cancel') {
        await handleManageUsers(bot, ctx);
      } else if (data === 'back_menu') {
        await handleMainMenu(bot, ctx);
      } else if (data.startsWith('order_')) {
        if (data === 'order_confirm' || data === 'order_edit') {
          await handleConfirmOrEdit(bot, ctx, data);
        } else {
          await handleOrderCallback(bot, ctx, data);
        }
      } else if (String(data || '').startsWith('payment_')) {
        await handleOrderCallback(bot, ctx, data);
      } else if (String(data || '').startsWith('delivery_paid_')) {
        await handleOrderCallback(bot, ctx, data);
      } else if (String(data || '').startsWith('interrupt_order_')) {
        await handleOrderCallback(bot, ctx, data);
      }
    } catch (error) {
      await handleError(bot, error, { chatId, callbackData: data });
    }
  });

  // Обработка ошибок бота
  bot.on('polling_error', (error) => {
    logger.error('Polling error:', error);
    handleError(bot, error, { type: 'polling_error' });
    try {
      if (error && error.code === 'ETELEGRAM' && String(error.message || '').includes('409')) {
        logger.warn('Detected 409 conflict (another getUpdates). Stopping and exiting.');
        try { bot.stopPolling(); } catch (_) {}
        releaseBotLock().then(() => {
          process.exit(0);
        });
      }
      if (isTransientNetworkError(error)) {
        (async () => {
          if (restartInProgress || longBackoffActive) return;
          restartInProgress = true;
          try {
            try { bot.stopPolling(); logger.warn('Stopped polling due to network error'); } catch (_) {}
            const now = Date.now();
            if (!restartWindowStartedAt || (now - restartWindowStartedAt) > 900000) {
              restartWindowStartedAt = now;
              restartFailures = 0;
            }
            const delay = Math.min(60000, 5000 * Math.pow(2, Math.max(0, restartFailures)));
            await wait(delay);
            await bot.startPolling({ params: { timeout: 10 } });
            logger.info('Restarted polling after network error');
            restartFailures = 0;
          } catch (reErr) {
            logger.error('Failed to restart polling after network error', reErr);
            restartFailures += 1;
            if (restartFailures >= 5) {
              if (!longBackoffActive) {
                longBackoffActive = true;
                longBackoffIndex = 0;
                (async () => {
                  while (longBackoffIndex < longBackoffSchedule.length) {
                    const w = longBackoffSchedule[longBackoffIndex++];
                    logger.warn(`Long backoff restart in ${Math.round(w/60000)} minutes`);
                    await wait(w);
                    try {
                      try { bot.stopPolling(); } catch (_) {}
                      await bot.startPolling({ params: { timeout: 10 } });
                      logger.info('Restarted polling after long backoff');
                      restartFailures = 0;
                      restartWindowStartedAt = Date.now();
                      longBackoffActive = false;
                      return;
                    } catch (err2) {
                      logger.error('Failed long backoff restart', err2);
                    }
                  }
                  longBackoffActive = false;
                  try { bot.stopPolling(); } catch (_) {}
                  releaseBotLock().then(() => {
                    process.exit(1);
                  });
                })();
              }
            }
          } finally {
            restartInProgress = false;
          }
        })();
      }
    } catch (_) {}
  });

  // Обработка ошибок вебхука (если используется)
  bot.on('webhook_error', (error) => {
    logger.error('Webhook error:', error);
    handleError(bot, error, { type: 'webhook_error' });
  });

  logger.info('Bot started and ready to receive messages');
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down bot...');
  if (bot) bot.stopPolling();
  await releaseBotLock();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down bot...');
  if (bot) bot.stopPolling();
  await releaseBotLock();
  process.exit(0);
});

start();


