require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const logger = require('../utils/logger');
const { handleError } = require('../bot/middleware/errorHandler');

const token = process.env.TELEGRAM_CLIENT_BOT_TOKEN;

if (!token) {
  logger.error('TELEGRAM_CLIENT_BOT_TOKEN not found in environment variables');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: false });

async function start() {
  try {
    try {
      await bot.deleteWebHook({ drop_pending_updates: true });
    } catch (err) {
      logger.warn('Client bot deleteWebHook failed (continuing with polling)', err);
    }
    await bot.startPolling({ params: { timeout: 10 } });
    logger.info('Client Telegram bot initialized (webhook cleared, polling started)');
  } catch (err) {
    logger.error('Client Telegram bot failed to start polling', err);
    process.exit(1);
  }

  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const chatType = msg.chat.type || '';
    if (chatType !== 'private') {
      return;
    }

    const webAppUrl = process.env.WEB_APP_CLIENT_URL || process.env.WEB_APP_URL || '';
    const text =
      'Здравствуйте! С вами на связи бот кофейни и студии цветов «Кофейно-букетный период»!\n\n' +
      'Для вашего удобства у нас появился интернет-магазин, благодаря которому вы можете ознакомиться с композициями и быстро сделать заказ в формате Telegram-приложения. Для перехода нажмите кнопку «Перейти в приложение».';

    const options = {};
    if (webAppUrl && webAppUrl.startsWith('https://')) {
      options.reply_markup = {
        inline_keyboard: [
          [{ text: 'Перейти в приложение', web_app: { url: webAppUrl } }],
        ],
      };
    } else if (webAppUrl) {
      options.reply_markup = {
        inline_keyboard: [
          [{ text: 'Перейти в приложение', url: webAppUrl }],
        ],
      };
    }

    try {
      if (Object.keys(options).length > 0) {
        await bot.sendMessage(chatId, text, options);
      } else {
        await bot.sendMessage(chatId, text);
      }
    } catch (error) {
      await handleError(bot, error, { chatId, command: '/start', scope: 'client-bot' });
    }
  });

  bot.on('polling_error', (error) => {
    logger.error('Client bot polling error:', error);
    handleError(bot, error, { type: 'polling_error', scope: 'client-bot' });
  });

  bot.on('webhook_error', (error) => {
    logger.error('Client bot webhook error:', error);
    handleError(bot, error, { type: 'webhook_error', scope: 'client-bot' });
  });

  logger.info('Client bot started and ready to receive messages');
}

start();
