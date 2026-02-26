const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const { Blob } = require('buffer');
const logger = require('../utils/logger');

let botInstance = null;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getRetryAfterSeconds(error) {
  try {
    const sec = error && error.response && error.response.body && error.response.body.parameters && error.response.body.parameters.retry_after;
    return typeof sec === 'number' ? sec : null;
  } catch (_) {
    return null;
  }
}

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

function initializeBot(token) {
  if (!botInstance) {
    botInstance = new TelegramBot(token, { polling: false });
    try {
      botInstance.deleteWebHook({ drop_pending_updates: true }).catch((err) => {
        logger.warn('deleteWebHook failed (continuing with polling)', err);
      });
      botInstance.startPolling({ params: { timeout: 10 } });
      logger.info('Telegram bot initialized (webhook cleared, polling started)');
    } catch (err) {
      logger.error('Failed to start polling', err);
    }
  }
  return botInstance;
}

function getBot() {
  if (!botInstance) {
    return null;
  }
  return botInstance;
}

async function sendToChannel(channelId, message, options = {}) {
  const bot = getBot();
  const maxRetries = 3;
  let targetId = channelId;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (bot) {
        const msg = await bot.sendMessage(targetId, message, options);
        logger.info(`Message sent to channel ${targetId}`);
        return msg;
      } else {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const body = { chat_id: targetId, text: message, ...options };
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) {
          const txt = await res.text();
          const err = new Error(`HTTP ${res.status} ${txt}`);
          err.response = { body: { parameters: {} } };
          throw err;
        }
        const json = await res.json();
        logger.info(`Message sent to channel ${targetId} via HTTP`);
        return json.result;
      }
    } catch (error) {
      const retrySec = getRetryAfterSeconds(error);
      if (retrySec && attempt < maxRetries) {
        const waitMs = (retrySec + 1) * 1000;
        logger.warn(`Rate limited for channel ${targetId}, retry after ${retrySec}s (attempt ${attempt + 1}/${maxRetries})`);
        await wait(waitMs);
        continue;
      }
      try {
        const mig = error && error.response && error.response.body && error.response.body.parameters && error.response.body.parameters.migrate_to_chat_id;
        if (mig && attempt < maxRetries) {
          const newId = String(mig);
          logger.warn(`Channel ${targetId} migrated to ${newId}`);
          targetId = newId;
          continue;
        }
      } catch (_) {}
      if (isTransientNetworkError(error) && attempt < maxRetries) {
        const delay = Math.min(15000, 2000 * Math.pow(2, attempt));
        logger.warn(`Network error sending message to ${targetId}. Retrying in ${Math.round(delay/1000)}s (attempt ${attempt + 1}/${maxRetries})`);
        await wait(delay);
        continue;
      }
      logger.error(`Error sending message to channel ${targetId}:`, error);
      throw error;
    }
  }
}

async function sendDocumentToChannel(channelId, document, options = {}) {
  const bot = getBot();
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (bot) {
        await bot.sendDocument(channelId, document, options);
        logger.info(`Document sent to channel ${channelId}`);
        return;
      } else {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');
        const url = `https://api.telegram.org/bot${token}/sendDocument`;
        const form = new FormData();
        form.append('chat_id', channelId);
        let value = document;
        let filename = null;
        if (typeof document === 'string') {
          const filePath = document;
          const data = await fs.promises.readFile(filePath);
          value = new Blob([data]);
          filename = path.basename(filePath) || 'document';
        } else if (Buffer.isBuffer(document)) {
          value = new Blob([document]);
          filename = (options && options.filename) || 'document';
        }
        if (filename) {
          form.append('document', value, filename);
        } else {
          form.append('document', value);
        }
        if (options && options.caption) form.append('caption', options.caption);
        const res = await fetch(url, { method: 'POST', body: form });
        if (!res.ok) {
          const txt = await res.text();
          const err = new Error(`HTTP ${res.status} ${txt}`);
          err.response = { body: { parameters: {} } };
          throw err;
        }
        logger.info(`Document sent to channel ${channelId} via HTTP`);
        return;
      }
    } catch (error) {
      const retrySec = getRetryAfterSeconds(error);
      if (retrySec && attempt < maxRetries) {
        const waitMs = (retrySec + 1) * 1000;
        logger.warn(`Rate limited for channel ${channelId}, retry after ${retrySec}s (attempt ${attempt + 1}/${maxRetries})`);
        await wait(waitMs);
        continue;
      }
      if (isTransientNetworkError(error) && attempt < maxRetries) {
        const delay = Math.min(15000, 2000 * Math.pow(2, attempt));
        logger.warn(`Network error sending document to ${channelId}. Retrying in ${Math.round(delay/1000)}s (attempt ${attempt + 1}/${maxRetries})`);
        await wait(delay);
        continue;
      }
      logger.error(`Error sending document to channel ${channelId}:`, error);
      throw error;
    }
  }
}

async function sendPhotoToChannel(channelId, fileId, options = {}) {
  const bot = getBot();
  const maxRetries = 3;
  let targetId = channelId;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const raw = typeof fileId === 'string' ? fileId : '';
      const isHttpUrl = typeof raw === 'string' && /^https?:\/\//i.test(raw);
      const looksLikeLocalPath =
        typeof raw === 'string' &&
        !isHttpUrl &&
        (raw.startsWith('/') ||
          raw.startsWith('./') ||
          raw.startsWith('../') ||
          raw.includes('\\') ||
          /^[A-Za-z]:[\\/]/.test(raw));
      if (looksLikeLocalPath && token) {
        const url = `https://api.telegram.org/bot${token}/sendPhoto`;
        let filePath = raw;
        if (!path.isAbsolute(filePath)) {
          const rootDir = path.join(__dirname, '..');
          filePath = path.join(rootDir, filePath.replace(/^\/+/, ''));
        }
        const form = new FormData();
        form.append('chat_id', targetId);
        const data = await fs.promises.readFile(filePath);
        const ext = path.extname(filePath) || '.jpg';
        const blob = new Blob([data]);
        form.append('photo', blob, `photo${ext}`);
        if (options && options.caption) {
          form.append('caption', options.caption);
        }
        const res = await fetch(url, { method: 'POST', body: form });
        if (!res.ok) {
          const txt = await res.text();
          const err = new Error(`HTTP ${res.status} ${txt}`);
          err.response = { body: { parameters: {} } };
          throw err;
        }
        const json = await res.json();
        logger.info(`Photo sent to channel ${targetId} via HTTP (file upload)`);
        return json.result;
      }
      if (bot) {
        const msg = await bot.sendPhoto(targetId, fileId, options);
        logger.info(`Photo sent to channel ${targetId}`);
        return msg;
      }
      if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');
      const url = `https://api.telegram.org/bot${token}/sendPhoto`;
      const body = { chat_id: targetId, photo: fileId, ...options };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text();
        const err = new Error(`HTTP ${res.status} ${txt}`);
        err.response = { body: { parameters: {} } };
        throw err;
      }
      const json = await res.json();
      logger.info(`Photo sent to channel ${targetId} via HTTP`);
      return json.result;
    } catch (error) {
      const retrySec = getRetryAfterSeconds(error);
      if (retrySec && attempt < maxRetries) {
        const waitMs = (retrySec + 1) * 1000;
        logger.warn(`Rate limited for channel ${targetId} (photo), retry after ${retrySec}s (attempt ${attempt + 1}/${maxRetries})`);
        await wait(waitMs);
        continue;
      }
      try {
        const mig = error && error.response && error.response.body && error.response.body.parameters && error.response.body.parameters.migrate_to_chat_id;
        if (mig && attempt < maxRetries) {
          const newId = String(mig);
          logger.warn(`Channel ${targetId} migrated to ${newId}`);
          targetId = newId;
          continue;
        }
      } catch (_) {}
      if (isTransientNetworkError(error) && attempt < maxRetries) {
        const delay = Math.min(15000, 2000 * Math.pow(2, attempt));
        logger.warn(`Network error sending photo to ${targetId}. Retrying in ${Math.round(delay/1000)}s (attempt ${attempt + 1}/${maxRetries})`);
        await wait(delay);
        continue;
      }
      logger.error(`Error sending photo to channel ${targetId}:`, error);
      throw error;
    }
  }
}

async function sendMediaGroupToChannel(channelId, fileIds = [], options = {}) {
  const bot = getBot();
  const maxRetries = 3;
  const chunkSize = 10;
  const mediaChunks = [];
  let targetId = channelId;
  for (let i = 0; i < fileIds.length; i += chunkSize) {
    const chunk = fileIds.slice(i, i + chunkSize).map(fid => ({ type: 'photo', media: fid }));
    mediaChunks.push(chunk);
  }
  for (const chunk of mediaChunks) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (bot && bot.sendMediaGroup) {
          await bot.sendMediaGroup(targetId, chunk, options);
          logger.info(`Media group (${chunk.length}) sent to channel ${targetId}`);
        } else {
          for (const m of chunk) {
            await sendPhotoToChannel(targetId, m.media, { caption: options && options.caption });
          }
          logger.info(`Media group (${chunk.length}) sent as individual photos to channel ${targetId}`);
        }
        break;
      } catch (error) {
        const retrySec = getRetryAfterSeconds(error);
        if (retrySec && attempt < maxRetries) {
          const waitMs = (retrySec + 1) * 1000;
          logger.warn(`Rate limited for channel ${targetId} (media group), retry after ${retrySec}s (attempt ${attempt + 1}/${maxRetries})`);
          await wait(waitMs);
          continue;
        }
        try {
          const mig = error && error.response && error.response.body && error.response.body.parameters && error.response.body.parameters.migrate_to_chat_id;
          if (mig && attempt < maxRetries) {
            const newId = String(mig);
            logger.warn(`Channel ${targetId} migrated to ${newId}`);
            targetId = newId;
            continue;
          }
        } catch (_) {}
        if (isTransientNetworkError(error) && attempt < maxRetries) {
          const delay = Math.min(15000, 2000 * Math.pow(2, attempt));
          logger.warn(`Network error sending media group to ${targetId}. Retrying in ${Math.round(delay/1000)}s (attempt ${attempt + 1}/${maxRetries})`);
          await wait(delay);
          continue;
        }
        logger.error(`Error sending media group to channel ${targetId}:`, error);
        throw error;
      }
    }
  }
}

async function editMessageInChannel(channelId, messageId, newText, options = {}) {
  const bot = getBot();
  const maxRetries = 3;
  let targetId = channelId;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (bot) {
        await bot.editMessageText(newText, { chat_id: targetId, message_id: messageId, ...options });
        logger.info(`Message edited in channel ${targetId} (message_id=${messageId})`);
        return true;
      } else {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');
        const url = `https://api.telegram.org/bot${token}/editMessageText`;
        const body = { chat_id: targetId, message_id: messageId, text: newText, ...options };
        const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) {
          const txt = await res.text();
          const err = new Error(`HTTP ${res.status} ${txt}`);
          err.response = { body: { parameters: {} } };
          throw err;
        }
        logger.info(`Message edited in channel ${targetId} via HTTP (message_id=${messageId})`);
        return true;
      }
    } catch (error) {
      const retrySec = getRetryAfterSeconds(error);
      if (retrySec && attempt < maxRetries) {
        const waitMs = (retrySec + 1) * 1000;
        logger.warn(`Rate limited for channel ${targetId} (edit), retry after ${retrySec}s (attempt ${attempt + 1}/${maxRetries})`);
        await wait(waitMs);
        continue;
      }
      try {
        const mig = error && error.response && error.response.body && error.response.body.parameters && error.response.body.parameters.migrate_to_chat_id;
        if (mig && attempt < maxRetries) {
          const newId = String(mig);
          logger.warn(`Channel ${targetId} migrated to ${newId}`);
          targetId = newId;
          continue;
        }
      } catch (_) {}
      if (isTransientNetworkError(error) && attempt < maxRetries) {
        const delay = Math.min(15000, 2000 * Math.pow(2, attempt));
        logger.warn(`Network error editing message in ${targetId}. Retrying in ${Math.round(delay/1000)}s (attempt ${attempt + 1}/${maxRetries})`);
        await wait(delay);
        continue;
      }
      logger.error(`Error editing message in channel ${targetId} (message_id=${messageId}):`, error);
      throw error;
    }
  }
}

module.exports = {
  initializeBot,
  getBot,
  sendToChannel,
  editMessageInChannel,
  sendDocumentToChannel,
  sendPhotoToChannel,
  sendMediaGroupToChannel,
};
