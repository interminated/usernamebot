'use strict';

const { configFromEnv, telegramApi, handleUpdate } = require('./lib/telegram');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const config = configFromEnv();
  const me = await telegramApi(config, 'getMe');
  if (me.username?.toLowerCase() !== config.username.toLowerCase()) {
    throw new Error(`BOT_TOKEN относится к @${me.username}, а BOT_USERNAME указан @${config.username}`);
  }
  // Polling and webhook cannot both receive updates. This bot owns message handling.
  await telegramApi(config, 'deleteWebhook', {drop_pending_updates:false});
  try {
    await telegramApi(config, 'setMyCommands', {commands:[
      {command:'start', description:'🎮 Начать игру'},
      {command:'help', description:'ℹ️ О проекте'},
      {command:'friends', description:'🤝 Пригласить друзей'}
    ]});
  } catch (error) {
    console.warn('Не удалось обновить список команд:', error.message);
  }

  console.log(`Бот @${me.username} запущен (long polling, без HTTP-порта).`);
  console.log('Мини-приложение:', config.gameUrl);
  let offset = 0;
  let retryMs = 1000;
  let stopping = false;
  process.once('SIGINT', () => {stopping = true;});
  process.once('SIGTERM', () => {stopping = true;});

  while (!stopping) {
    try {
      const updates = await telegramApi(config, 'getUpdates', {
        offset, timeout: 25, limit: 30, allowed_updates:['message']
      }, {timeoutMs: 35000});
      retryMs = 1000;
      for (const update of updates) {
        if (stopping) break;
        try {
          await handleUpdate(config, update);
        } catch (error) {
          // An invalid chat / transient failure must not crash the entire bot.
          console.error(`Ошибка обработки обновления ${update.update_id}:`, error.message);
        }
        offset = Math.max(offset, update.update_id + 1);
      }
    } catch (error) {
      if (stopping) break;
      console.error('Ошибка соединения с Telegram:', error.message);
      const wait = error.retryAfter ? Math.min(error.retryAfter * 1000, 60000) : retryMs;
      await sleep(wait);
      retryMs = Math.min(retryMs * 2, 30000);
    }
  }
  console.log('Бот остановлен.');
}

if (require.main === module) {
  main().catch(error => {
    console.error('Ошибка запуска:', error.message);
    process.exitCode = 1;
  });
}
module.exports = {main};
