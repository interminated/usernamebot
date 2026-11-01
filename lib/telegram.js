'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const WELCOME_IMAGE = path.resolve(__dirname, '..', 'assets', 'welcome.jpg');
const WELCOME_CAPTION = [
  '💚 <b>USERNAME GENERATOR | GAME</b>',
  '',
  'Добро пожаловать в мир уникальных <b>игровых юзернеймов!</b>',
  '',
  '🎲 <b>Генерируй</b> — находи красивые и редкие @ники.',
  '💎 <b>Коллекционируй</b> — собирай редкие сочетания.',
  '🛒 <b>Торгуй</b> — покупай и продавай на общем рынке.',
  '🏆 <b>Соревнуйся</b> — попадёшь ли ты в топ по капиталу?',
  '🤝 <b>Приглашай</b> — получай 100 000 игровых ₽ за нового друга.',
  '',
  '⚡ <b>Твоя коллекция начинается здесь.</b>',
  '',
  '<i>Рубли и юзернеймы существуют только внутри игры.</i>'
].join('\n');

function configFromEnv(env = process.env) {
  const token = String(env.BOT_TOKEN || '').trim();
  if (!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(token)) {
    throw new Error('Нужно задать действительный BOT_TOKEN в переменных окружения.');
  }
  const gameUrl = new URL(env.GAME_URL || 'https://usernamegame.bothost.tech');
  if (gameUrl.protocol !== 'https:' || gameUrl.username || gameUrl.password) {
    throw new Error('GAME_URL должен быть HTTPS-адресом сайта игры.');
  }
  const username = String(env.BOT_USERNAME || 'UsernameGeneratorGame').replace(/^@/, '');
  if (!/^[a-zA-Z0-9_]{5,32}$/.test(username)) throw new Error('Некорректный BOT_USERNAME');
  const base = String(env.MINI_APP_URL || `https://t.me/${username}`).replace(/\/$/, '');
  const link = new URL(base);
  if (link.hostname !== 't.me' || link.protocol !== 'https:' || link.search || link.hash || link.username || link.password) {
    throw new Error('MINI_APP_URL должен быть ссылкой https://t.me/ИмяБота (или /имя_приложения) без параметров.');
  }
  return { token, username, gameUrl: gameUrl.toString(), miniAppUrl: link.toString().replace(/\/$/, '') };
}

function mainAppLink(config, startParam = '') {
  const url = new URL(config.miniAppUrl);
  url.searchParams.set('startapp', startParam);
  // On an empty startapp value URLSearchParams generates '?startapp=', both forms are accepted by Telegram.
  return url.toString();
}

function buttonMarkup(config, startParam = '') {
  const primary = startParam
    ? { text: '🎮 Открыть игру', url: mainAppLink(config, startParam) }
    : { text: '🎮 Открыть игру', web_app: { url: config.gameUrl } };
  return {
    inline_keyboard: [
      [primary],
      [{ text: '🤝 Друзья · +100 000 ₽ за приглашение', url: mainAppLink(config) }]
    ]
  };
}

function parseCommand(text, botUsername) {
  if (typeof text !== 'string') return null;
  const match = text.trim().match(/^\/(start|help|friends)(?:@([a-zA-Z0-9_]+))?(?:\s+([^\s]+))?$/i);
  if (!match) return null;
  if (match[2] && match[2].toLowerCase() !== botUsername.toLowerCase()) return null;
  const command = match[1].toLowerCase();
  const param = command === 'start' && /^[A-Za-z0-9_-]{1,64}$/.test(match[3] || '') ? match[3] : '';
  return {command, startParam: param};
}

function errorMessage(method, response, payload) {
  const reason = payload?.description || `HTTP ${response.status}`;
  const retryAfter = Number(payload?.parameters?.retry_after) || 0;
  const error = new Error(`Telegram ${method}: ${reason}`);
  error.retryAfter = retryAfter;
  return error;
}

async function telegramApi(config, method, payload = {}, {fetchImpl = fetch, timeoutMs = 12000} = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${config.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const body = await response.json();
    if (!response.ok || !body?.ok) throw errorMessage(method, response, body);
    return body.result;
  } finally { clearTimeout(timeout); }
}

async function sendWelcome(config, chatId, startParam = '', deps = {}) {
  const {fetchImpl = fetch, readFileImpl = fs.readFile} = deps;
  const form = new FormData();
  form.set('chat_id', String(chatId));
  form.set('caption', WELCOME_CAPTION);
  form.set('parse_mode', 'HTML');
  form.set('reply_markup', JSON.stringify(buttonMarkup(config, startParam)));
  const bytes = await readFileImpl(WELCOME_IMAGE);
  form.set('photo', new Blob([bytes], {type:'image/jpeg'}), 'welcome.jpg');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetchImpl(`https://api.telegram.org/bot${config.token}/sendPhoto`, {
      method: 'POST', body: form, signal: controller.signal
    });
    const data = await response.json();
    if (!response.ok || !data?.ok) throw errorMessage('sendPhoto', response, data);
    return data.result;
  } finally { clearTimeout(timeout); }
}

async function handleUpdate(config, update, deps = {}) {
  const message = update?.message;
  if (!message || message.chat?.type !== 'private' || message.from?.is_bot) return false;
  const parsed = parseCommand(message.text, config.username);
  if (!parsed) return false;
  const chatId = message.chat.id;
  if (!Number.isSafeInteger(chatId)) return false;
  if (parsed.command === 'start') {
    await sendWelcome(config, chatId, parsed.startParam, deps);
    return true;
  }
  const lines = parsed.command === 'friends' ? [
    '🤝 <b>Приглашай друзей</b>',
    '',
    'Получай <b>100 000 игровых ₽</b> за каждого нового игрока.',
    'Открой игру → раздел <b>«Друзья»</b> → скопируй свою ссылку.',
    'Награда начисляется после первого подтверждённого входа друга в игру.'
  ] : [
    'ℹ️ <b>USERNAME GENERATOR | GAME</b>',
    '',
    '🎮 /start — начать игру',
    '🤝 /friends — приглашения и бонусы',
    '❔ /help — эта справка',
    '',
    'В игре можно генерировать, собирать и продавать игровые юзернеймы.',
    'Рубли виртуальные, обмена на реальные деньги нет.'
  ];
  await telegramApi(config, 'sendMessage', {
    chat_id: chatId, text: lines.join('\n'), parse_mode: 'HTML',
    reply_markup: buttonMarkup(config)
  }, deps);
  return true;
}

module.exports = {configFromEnv, WELCOME_IMAGE, WELCOME_CAPTION, mainAppLink, buttonMarkup, parseCommand, telegramApi, sendWelcome, handleUpdate};
