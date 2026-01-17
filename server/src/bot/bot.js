import dotenv from 'dotenv';
import { Telegraf, Markup } from 'telegraf';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL; // Render Static Site URL (WebApp)

if (!BOT_TOKEN) throw new Error('BOT_TOKEN missing');
if (!ADMIN_CHAT_ID) throw new Error('ADMIN_CHAT_ID missing');
if (!ADMIN_API_KEY) throw new Error('ADMIN_API_KEY missing');

const bot = new Telegraf(BOT_TOKEN);

// In-memory admin flow state (single-admin use)
const flow = new Map();

function setFlow(chatId, state) {
  if (!state) flow.delete(String(chatId));
  else flow.set(String(chatId), state);
}

function getFlow(chatId) {
  return flow.get(String(chatId));
}

function isAdmin(ctx) {
  return String(ctx.chat?.id) === String(ADMIN_CHAT_ID);
}

async function callAdmin(path, body) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': ADMIN_API_KEY
    },
    body: JSON.stringify(body || {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

async function getAdmin(path) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    headers: { 'x-admin-key': ADMIN_API_KEY }
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

function kbMain() {
  return {
    inline_keyboard: [
      [
        { text: '💰 المال', callback_data: 'menu:money' },
        { text: '✅ المهام', callback_data: 'menu:tasks' }
      ],
      [
        { text: '🏦 السحوبات', callback_data: 'menu:withdrawals' },
        { text: '📢 الإعلانات', callback_data: 'menu:ads' }
      ],
      [
        { text: '📊 إحصائات', callback_data: 'menu:stats' }
      ]
    ]
  };
}

function kbBack() {
  return { inline_keyboard: [[{ text: '⬅️ رجوع', callback_data: 'menu:main' }]] };
}

async function renderMoney(ctx) {
  const { config } = await getAdmin('/api/admin/config');
  const c = config;
  const text =
    `💰 قسم المال\n\n` +
    `⛏️ Mining reward: ${c.rewards.mine}\n` +
    `🍯 Faucet reward: ${c.rewards.faucet}\n` +
    `🎁 Daily reward: ${c.rewards.daily}\n\n` +
    `⏱️ Mining cooldown: ${c.money.cooldowns.mineSec}s\n` +
    `⏱️ Faucet cooldown: ${c.money.cooldowns.faucetSec}s\n` +
    `⚡ SpeedUp reduce: ${c.money.speedUpSec}s\n\n` +
    `👥 Referral bonus (TON): ${c.referral.bonusTon}\n\n` +
    `⬇️ Min withdraw TON: ${c.limits.minWithdrawTon}\n` +
    `⬇️ Min withdraw USDT: ${c.limits.minWithdrawUsdt}\n\n` +
    `طرق السحب: FaucetPay=${c.withdraw.enabledMethods.faucetpayTon ? 'ON' : 'OFF'} | Binance USDT(BEP20)=${c.withdraw.enabledMethods.binanceUsdtBep20 ? 'ON' : 'OFF'}`;

  return ctx.editMessageText(text, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '⛏️ ربح التعدين', callback_data: 'money:set:reward_mine' },
          { text: '🍯 ربح الصنبور', callback_data: 'money:set:reward_faucet' }
        ],
        [
          { text: '🎁 ربح اليومي', callback_data: 'money:set:reward_daily' },
          { text: '👥 ربح الإحالات', callback_data: 'money:set:ref_bonus' }
        ],
        [
          { text: '⏱ وقت التعدين', callback_data: 'money:set:cd_mine' },
          { text: '⏱ وقت الصنبور', callback_data: 'money:set:cd_faucet' }
        ],
        [
          { text: '⚡ SpeedUp وقت', callback_data: 'money:set:speedup' }
        ],
        [
          { text: '⬇️ حد TON', callback_data: 'money:set:min_ton' },
          { text: '⬇️ حد USDT', callback_data: 'money:set:min_usdt' }
        ],
        [
          { text: c.withdraw.enabledMethods.faucetpayTon ? '✅ FaucetPay ON' : '❌ FaucetPay OFF', callback_data: 'money:toggle:faucetpay' },
          { text: c.withdraw.enabledMethods.binanceUsdtBep20 ? '✅ Binance ON' : '❌ Binance OFF', callback_data: 'money:toggle:binance' }
        ],
        [{ text: '⬅️ رجوع', callback_data: 'menu:main' }]
      ]
    }
  });
}

async function renderAds(ctx) {
  const { config } = await getAdmin('/api/admin/config');
  const c = config;
  const text =
    `📢 قسم الإعلانات\n\n` +
    `🔗 Links:\n` +
    `mine: ${c.ads.mine}\n` +
    `faucet: ${c.ads.faucet}\n` +
    `daily: ${c.ads.daily}\n` +
    `double: ${c.ads.double}\n\n` +
    `🧩 Scripts (JS snippets executed before each card):\n` +
    `mine: ${c.adsScripts.mine ? 'SET' : '-'}\n` +
    `faucet: ${c.adsScripts.faucet ? 'SET' : '-'}\n` +
    `daily: ${c.adsScripts.daily ? 'SET' : '-'}`;

  return ctx.editMessageText(text, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🔗 Link mine', callback_data: 'ads:set:link_mine' },
          { text: '🔗 Link faucet', callback_data: 'ads:set:link_faucet' }
        ],
        [
          { text: '🔗 Link daily', callback_data: 'ads:set:link_daily' },
          { text: '🔗 Link double', callback_data: 'ads:set:link_double' }
        ],
        [
          { text: '🧩 Script mine', callback_data: 'ads:set:script_mine' },
          { text: '🧩 Script faucet', callback_data: 'ads:set:script_faucet' }
        ],
        [
          { text: '🧩 Script daily', callback_data: 'ads:set:script_daily' }
        ],
        [{ text: '⬅️ رجوع', callback_data: 'menu:main' }]
      ]
    }
  });
}

async function renderTasks(ctx) {
  const { tasks } = await getAdmin('/api/admin/tasks');
  const top = tasks.slice(0, 8);
  let text = `✅ قسم المهام\n\n`;
  if (!top.length) text += 'لا توجد مهام.';
  else {
    text += top.map(t => {
      const st = t.active ? 'ON' : 'OFF';
      return `${t.icon || '✅'} ${t.taskId} | ${t.title}\nreward: ${t.rewardTon} TON | ${t.durationSec}s | ${st}`;
    }).join('\n\n');
  }

  const rows = top.map(t => ([
    { text: `${t.active ? '🟢' : '⚫️'} ${t.taskId}`, callback_data: `task:menu:${t.taskId}` }
  ]));
  rows.push([{ text: '➕ إضافة مهمة', callback_data: 'task:add' }]);
  rows.push([{ text: '⬅️ رجوع', callback_data: 'menu:main' }]);

  return ctx.editMessageText(text, { reply_markup: { inline_keyboard: rows } });
}

async function renderWithdrawals(ctx) {
  const data = await getAdmin('/api/admin/withdrawals/pending');
  const items = (data.withdrawals || []).slice(0, 10);
  let text = `🏦 قسم السحوبات\n\n`;
  if (!items.length) text += 'لا توجد طلبات تحت المراجعة ✅';
  else {
    text += items.map(w => {
      const det = w.method === 'FAUCETPAY_TON'
        ? `Email: ${w.details?.faucetPayEmail || '-'} | TON`
        : `Binance ID: ${w.details?.binanceId || '-'} | USDT BEP20`;
      return `🟡 ${w.amount} ${w.currency} | ${w.userTelegramId}\n${det}\nID: ${w._id}`;
    }).join('\n\n');
  }

  const rows = items.map(w => ([
    { text: `✅ Approve ${w.amount}`, callback_data: `wd:approve:${w._id}` },
    { text: `❌ Reject`, callback_data: `wd:reject:${w._id}` },
    { text: `💚 Paid`, callback_data: `wd:paid:${w._id}` }
  ]));
  rows.push([{ text: '🔄 تحديث', callback_data: 'menu:withdrawals' }]);
  rows.push([{ text: '⬅️ رجوع', callback_data: 'menu:main' }]);

  return ctx.editMessageText(text, { reply_markup: { inline_keyboard: rows } });
}

async function renderStats(ctx) {
  const s = await getAdmin('/api/admin/stats');
  const text =
    `📊 إحصائات عامة\n\n` +
    `👤 الأعضاء: ${s.users}\n` +
    `🟡 تحت المراجعة: ${s.withdrawals.pending}\n` +
    `🔵 موافق عليها: ${s.withdrawals.approved}\n` +
    `🟢 تم الدفع: ${s.withdrawals.paid}\n` +
    `🔴 مرفوضة: ${s.withdrawals.rejected}`;
  return ctx.editMessageText(text, { reply_markup: kbBack() });
}

bot.start((ctx) => {
  // For all users: open the WebApp (Render frontend)
  if (!FRONTEND_URL) {
    // Keep the bot usable even if the admin forgot to set FRONTEND_URL
    if (isAdmin(ctx)) {
      return ctx.reply(
        '⚠️ FRONTEND_URL غير مضبوط في .env / Render.\n' +
        'بعد النشر على Render ضع رابط الـ Static Site في FRONTEND_URL.\n\n' +
        'لوحة التحكم المخفية ✅\nاكتب /panel لفتح القائمة.'
      );
    }
    return ctx.reply('⚠️ WebApp URL غير متاح الآن. حاول لاحقًا.');
  }

  const kb = Markup.keyboard([
    Markup.button.webApp('🚀 Open App', FRONTEND_URL)
  ]).resize();

  const txt = isAdmin(ctx)
    ? '👑 Admin\nافتح الواجهة من الزر بالأسفل.\nلوحة التحكم: /panel'
    : 'افتح التطبيق من الزر بالأسفل 👇';

  return ctx.reply(txt, kb);
});

bot.command('panel', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply('Not authorized');
  setFlow(ctx.chat.id, null);
  return ctx.reply('لوحة التحكم:', { reply_markup: kbMain() });
});

bot.command('pending', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const res = await fetch(`${BACKEND_URL}/api/admin/withdrawals/pending`, {
    headers: { 'x-admin-key': ADMIN_API_KEY }
  });
  const data = await res.json().catch(() => ({}));
  const items = data.withdrawals || [];
  if (!items.length) return ctx.reply('No pending withdrawals ✅');

  const lines = items.slice(0, 20).map((w, i) => {
    const d = w.method === 'FAUCETPAY_TON'
      ? `Email: ${w.details?.faucetPayEmail || '-'} | TON`
      : `Binance ID: ${w.details?.binanceId || '-'} | USDT BEP20`;
    return `${i + 1}) ${w.amount} ${w.currency} - ${w.userTelegramId}\n${d}\nID: ${w._id}`;
  });
  return ctx.reply(lines.join('\n\n'));
});

// Handle text replies for admin flows
bot.on('text', async (ctx, next) => {
  if (!isAdmin(ctx)) return next();
  const st = getFlow(ctx.chat.id);
  if (!st) return next();

  const text = String(ctx.message?.text || '').trim();
  try {
    if (st.type === 'wd_reject') {
      const reason = text.slice(0, 200) || 'Rejected';
      await callAdmin(`/api/admin/withdrawals/${st.id}/reject`, { reason });
      setFlow(ctx.chat.id, null);
      await ctx.reply('❌ تم رفض السحب.');
      // Try to update original message if it exists (best effort)
      return;
    }

    if (st.type === 'set_config') {
      const value = text;
      const num = Number(value);
      const payload = {};
      if (st.key === 'reward_mine') payload.rewards = { mine: num };
      if (st.key === 'reward_faucet') payload.rewards = { faucet: num };
      if (st.key === 'reward_daily') payload.rewards = { daily: num };
      if (st.key === 'ref_bonus') payload.referral = { bonusTon: num };
      if (st.key === 'cd_mine') payload.money = { cooldowns: { mineSec: num } };
      if (st.key === 'cd_faucet') payload.money = { cooldowns: { faucetSec: num } };
      if (st.key === 'speedup') payload.money = { speedUpSec: num };
      if (st.key === 'min_ton') payload.limits = { minWithdrawTon: num };
      if (st.key === 'min_usdt') payload.limits = { minWithdrawUsdt: num };

      // Link fields (string)
      if (st.key === 'link_mine') payload.ads = { mine: value };
      if (st.key === 'link_faucet') payload.ads = { faucet: value };
      if (st.key === 'link_daily') payload.ads = { daily: value };
      if (st.key === 'link_double') payload.ads = { double: value };

      // Scripts (string)
      if (st.key === 'script_mine') payload.adsScripts = { mine: value === '0' ? '' : value };
      if (st.key === 'script_faucet') payload.adsScripts = { faucet: value === '0' ? '' : value };
      if (st.key === 'script_daily') payload.adsScripts = { daily: value === '0' ? '' : value };

      await callAdmin('/api/admin/config', payload);
      setFlow(ctx.chat.id, null);
      await ctx.reply('✅ تم الحفظ.');
      // show section again
      return ctx.reply('اختار قسم:', { reply_markup: kbMain() });
    }

    if (st.type === 'task_add') {
      // Expected format:
      // taskId|title|rewardTon|durationSec|icon|kind|url(optional)
      const parts = text.split('|').map(s => s.trim());
      if (parts.length < 6) throw new Error('صيغة غير صحيحة. أرسل: taskId|title|rewardTon|durationSec|icon|kind|url');
      const [taskId, title, rewardTon, durationSec, icon, kind, url] = parts;
      await callAdmin('/api/admin/tasks/create', {
        taskId,
        title,
        rewardTon: Number(rewardTon),
        durationSec: Number(durationSec),
        icon,
        kind,
        url: url || ''
      });
      setFlow(ctx.chat.id, null);
      return ctx.reply('✅ تمت إضافة المهمة. اكتب /panel');
    }

    if (st.type === 'task_edit') {
      // Format: field=value (title, rewardTon, durationSec, icon, kind, url, active, sort)
      const idx = text.indexOf('=');
      if (idx === -1) throw new Error('أرسل: field=value');
      const field = text.slice(0, idx).trim();
      const value = text.slice(idx + 1).trim();
      const patch = { taskId: st.taskId };
      if (['title', 'icon', 'kind', 'url'].includes(field)) patch[field] = value;
      if (['rewardTon', 'durationSec', 'sort'].includes(field)) patch[field] = Number(value);
      if (field === 'active') patch.active = (value === '1' || value.toLowerCase() === 'true' || value === 'on');
      await callAdmin('/api/admin/tasks/update', patch);
      setFlow(ctx.chat.id, null);
      return ctx.reply('✅ تم تعديل المهمة. اكتب /panel');
    }

    return next();
  } catch (e) {
    return ctx.reply('❌ ' + (e?.message || 'Error'));
  }
});

bot.on('callback_query', async (ctx) => {
  try {
    if (!isAdmin(ctx)) {
      await ctx.answerCbQuery('Not authorized', { show_alert: true });
      return;
    }

    const data = String(ctx.callbackQuery?.data || '');

    // Menus
    if (data === 'menu:main') {
      setFlow(ctx.chat.id, null);
      await ctx.answerCbQuery();
      return ctx.editMessageText('لوحة التحكم:', { reply_markup: kbMain() });
    }
    if (data === 'menu:money') {
      await ctx.answerCbQuery();
      return renderMoney(ctx);
    }
    if (data === 'menu:tasks') {
      await ctx.answerCbQuery();
      return renderTasks(ctx);
    }
    if (data === 'menu:withdrawals') {
      await ctx.answerCbQuery();
      return renderWithdrawals(ctx);
    }
    if (data === 'menu:ads') {
      await ctx.answerCbQuery();
      return renderAds(ctx);
    }
    if (data === 'menu:stats') {
      await ctx.answerCbQuery();
      return renderStats(ctx);
    }

    // Money set
    if (data.startsWith('money:set:')) {
      const key = data.split(':')[2];
      setFlow(ctx.chat.id, { type: 'set_config', key });
      await ctx.answerCbQuery();
      let hint = 'أرسل القيمة الجديدة:';
      if (key.startsWith('reward')) hint = 'أرسل قيمة الربح (رقم):';
      if (key.startsWith('cd_')) hint = 'أرسل الوقت بالثواني (مثال: 300):';
      if (key === 'speedup') hint = 'أرسل عدد الثواني التي سيتم تقليلها عند SpeedUp:';
      if (key.startsWith('min_')) hint = 'أرسل الحد الأدنى (رقم):';
      if (key === 'ref_bonus') hint = 'أرسل ربح الإحالة (TON):';
      return ctx.reply(hint);
    }

    if (data.startsWith('money:toggle:')) {
      const what = data.split(':')[2];
      const { config } = await getAdmin('/api/admin/config');
      const en = { ...config.withdraw.enabledMethods };
      if (what === 'faucetpay') en.faucetpayTon = !en.faucetpayTon;
      if (what === 'binance') en.binanceUsdtBep20 = !en.binanceUsdtBep20;
      await callAdmin('/api/admin/config', { withdraw: { enabledMethods: en } });
      await ctx.answerCbQuery('تم التغيير');
      return renderMoney(ctx);
    }

    // Ads
    if (data.startsWith('ads:set:')) {
      const key = data.split(':')[2];
      setFlow(ctx.chat.id, { type: 'set_config', key });
      await ctx.answerCbQuery();
      if (key.startsWith('script_')) {
        return ctx.reply('أرسل كود الإعلان (JS). لإزالة الكود أرسل: 0');
      }
      return ctx.reply('أرسل الرابط:');
    }

    // Tasks
    if (data === 'task:add') {
      setFlow(ctx.chat.id, { type: 'task_add' });
      await ctx.answerCbQuery();
      return ctx.reply(
        'أرسل المهمة بهذه الصيغة:\n' +
        'taskId|title|rewardTon|durationSec|icon|kind|url\n\n' +
        'مثال:\n' +
        't3|مشاهدة اعلان|0.00005|15|🎬|watch_video|https://example.com'
      );
    }

    if (data.startsWith('task:menu:')) {
      await ctx.answerCbQuery();
      const taskId = data.split(':')[2];
      return ctx.editMessageText(
        `إدارة المهمة: ${taskId}\n\n` +
        'اختيارات الإدارة:\n' +
        '1) تعديل: اضغط Edit ثم أرسل field=value\n' +
        '2) تفعيل/إيقاف\n' +
        '3) حذف',
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✏️ Edit', callback_data: `task:edit:${taskId}` },
                { text: '🔁 Toggle', callback_data: `task:toggle:${taskId}` }
              ],
              [
                { text: '🗑 Delete', callback_data: `task:delete:${taskId}` }
              ],
              [{ text: '⬅️ رجوع', callback_data: 'menu:tasks' }]
            ]
          }
        }
      );
    }

    if (data.startsWith('task:edit:')) {
      const taskId = data.split(':')[2];
      setFlow(ctx.chat.id, { type: 'task_edit', taskId });
      await ctx.answerCbQuery();
      return ctx.reply(
        'أرسل تعديل واحد بهذه الصيغة: field=value\n' +
        'Fields: title, rewardTon, durationSec, icon, kind, url, active, sort\n' +
        'مثال: rewardTon=0.00007'
      );
    }

    if (data.startsWith('task:toggle:')) {
      const taskId = data.split(':')[2];
      const { tasks } = await getAdmin('/api/admin/tasks');
      const t = tasks.find(x => x.taskId === taskId);
      if (!t) throw new Error('Task not found');
      await callAdmin('/api/admin/tasks/update', { taskId, active: !t.active });
      await ctx.answerCbQuery('تم');
      return renderTasks(ctx);
    }

    if (data.startsWith('task:delete:')) {
      const taskId = data.split(':')[2];
      await callAdmin('/api/admin/tasks/delete', { taskId });
      await ctx.answerCbQuery('تم الحذف');
      return renderTasks(ctx);
    }

    // Withdrawals actions (reuse existing)
    if (data.startsWith('wd:')) {
      const parts = data.split(':');
      if (parts.length !== 3) {
        await ctx.answerCbQuery('Unknown action', { show_alert: true });
        return;
      }
      const action = parts[1];
      const id = parts[2];

      if (action === 'approve') {
        await callAdmin(`/api/admin/withdrawals/${id}/approve`);
        await ctx.answerCbQuery('Approved ✅');
        await ctx.editMessageText((ctx.callbackQuery.message.text || '') + '\n\n🔵 Status: APPROVED');
        return;
      }

      if (action === 'reject') {
        // Ask for reason via text message
        setFlow(ctx.chat.id, { type: 'wd_reject', id, msgText: String(ctx.callbackQuery.message.text || '') });
        await ctx.answerCbQuery();
        return ctx.reply('اكتب سبب الرفض (سيظهر للمستخدم).');
      }

      if (action === 'paid') {
        await callAdmin(`/api/admin/withdrawals/${id}/paid`);
        await ctx.answerCbQuery('Marked paid 💚');
        await ctx.editMessageText((ctx.callbackQuery.message.text || '') + '\n\n🟢 Status: PAID');
        return;
      }
    }

    await ctx.answerCbQuery('Unknown', { show_alert: true });
  } catch (e) {
    await ctx.answerCbQuery(String(e?.message || 'Error'), { show_alert: true });
  }
});

bot.launch().then(() => {
  console.log('Bot running');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
