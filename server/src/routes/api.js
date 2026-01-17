import express from 'express';
import User from '../models/User.js';
import Config from '../models/Config.js';
import Withdrawal from '../models/Withdrawal.js';
import TaskCatalog from '../models/TaskCatalog.js';
import TaskStart from '../models/TaskStart.js';
import TaskCompletion from '../models/TaskCompletion.js';
import ActionState from '../models/ActionState.js';
import { telegramAuth, adminAuth } from '../middleware/telegramAuth.js';

const router = express.Router();

async function getAppConfig() {
  let cfg = await Config.findOne({ key: 'app' });
  if (!cfg) {
    cfg = await Config.create({ key: 'app' });
  }
  return cfg;
}

function startOfTodayUTC() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
}

async function notifyAdminWithdrawal(withdrawal, user) {
  const adminChatId = process.env.ADMIN_CHAT_ID;
  const botToken = process.env.BOT_TOKEN;
  if (!adminChatId || !botToken) return;

  const methodLabel = withdrawal.method === 'FAUCETPAY_TON'
    ? `FaucetPay (TON)`
    : `Binance ID (USDT - BEP20)`;

  const details = withdrawal.method === 'FAUCETPAY_TON'
    ? `Email: ${withdrawal.details?.faucetPayEmail || '-'}\nCurrency: TON`
    : `Binance ID: ${withdrawal.details?.binanceId || '-'}\nCurrency: USDT\nNetwork: BEP20`;

  const text =
`🟡 New Withdraw Request\n\n` +
`User: ${user?.username ? '@' + user.username : user?.firstName || ''} (${withdrawal.userTelegramId})\n` +
`Amount: ${withdrawal.amount} ${withdrawal.currency}\n` +
`Method: ${methodLabel}\n` +
`${details}\n\n` +
`ID: ${withdrawal._id}`;

  const payload = {
    chat_id: adminChatId,
    text,
    reply_markup: {
      inline_keyboard: [
        [
          { text: '✅ Approve', callback_data: `wd:approve:${withdrawal._id}` },
          { text: '❌ Reject', callback_data: `wd:reject:${withdrawal._id}` }
        ],
        [
          { text: '💚 Mark Paid', callback_data: `wd:paid:${withdrawal._id}` }
        ]
      ]
    }
  };

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(() => {});
}

// --- Public ---
router.get('/health', (req, res) => res.json({ ok: true }));

// Create/find user (handles referrals only on first join)
router.post('/sync', telegramAuth, async (req, res) => {
  const cfg = await getAppConfig();
  const tgUser = req.tgUser;
  const telegramId = req.tgUserId;
  const startParam = (req.body?.startParam || '').trim();

  let user = await User.findOne({ telegramId });
  const isNew = !user;

  if (!user) {
    user = await User.create({
      telegramId,
      username: tgUser?.username || null,
      firstName: tgUser?.first_name || null,
      joinedAt: new Date()
    });
  } else {
    // Keep basic profile fresh
    user.username = tgUser?.username || user.username;
    user.firstName = tgUser?.first_name || user.firstName;
    await user.save();
  }

  // Referral bonus (once): fixed TON bonus to referrer
  if (isNew && startParam && startParam !== telegramId) {
    const referrerId = String(startParam);
    const bonus = Number(cfg.referral?.bonusTon || 0.002);

    const ref = await User.findOne({ telegramId: referrerId });
    if (ref) {
      ref.friendsCount = (ref.friendsCount || 0) + 1;
      ref.balance = (ref.balance || 0) + bonus;
      ref.refEarned = (ref.refEarned || 0) + bonus;
      await ref.save();

      user.referrerTelegramId = referrerId;
      user.refApplied = true;
      await user.save();
    }
  }

  // Ensure default tasks exist
  const taskCount = await TaskCatalog.countDocuments({});
  if (taskCount === 0) {
    await TaskCatalog.insertMany([
      { taskId: 'task1', title: 'Open our partner link', rewardTon: 0.00005, durationSec: Number(cfg.tasks?.defaultDurationSec || 15), sort: 1 },
      { taskId: 'task2', title: 'Stay 15s on the page', rewardTon: 0.00005, durationSec: Number(cfg.tasks?.defaultDurationSec || 15), sort: 2 }
    ]);
  }

  res.json({
    user: {
      telegramId: user.telegramId,
      balance: user.balance,
      lockedBalance: user.lockedBalance,
      friendsCount: user.friendsCount,
      refEarned: user.refEarned
    },
    config: {
      money: cfg.money,
      rewards: cfg.rewards,
      limits: cfg.limits,
      withdraw: cfg.withdraw,
      referral: cfg.referral,
      tasks: cfg.tasks,
      ads: cfg.ads,
      adsScripts: cfg.adsScripts
    }
  });
});

router.get('/me', telegramAuth, async (req, res) => {
  const telegramId = req.tgUserId;
  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ message: 'User not found' });
  res.json({
    telegramId: user.telegramId,
    balance: user.balance,
    lockedBalance: user.lockedBalance,
    friendsCount: user.friendsCount,
    refEarned: user.refEarned
  });
});

router.get('/config', async (req, res) => {
  const cfg = await getAppConfig();
  res.json({
    money: cfg.money,
    rewards: cfg.rewards,
    limits: cfg.limits,
    withdraw: cfg.withdraw,
    referral: cfg.referral,
    tasks: cfg.tasks,
    ads: cfg.ads,
    adsScripts: cfg.adsScripts
  });
});

// Claim mine/faucet (5min gate is in frontend timer, but server enforces 1 claim per 5 minutes)
router.post('/actions/claim', telegramAuth, async (req, res) => {
  const telegramId = req.tgUserId;
  const { type } = req.body || {};
  if (!['mine', 'faucet', 'daily'].includes(type)) return res.status(400).json({ message: 'Invalid type' });

  const cfg = await getAppConfig();
  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ message: 'User not found' });

  const now = new Date();
  let state = await ActionState.findOne({ userTelegramId: telegramId, type });
  if (!state) state = await ActionState.create({ userTelegramId: telegramId, type });

  // Cooldowns (admin controlled)
  if (type === 'mine' || type === 'faucet') {
    const cdSec = type === 'mine'
      ? Number(cfg.money?.cooldowns?.mineSec ?? 300)
      : Number(cfg.money?.cooldowns?.faucetSec ?? 300);
    const cdMs = Math.max(1, cdSec) * 1000;
    if (state.lastClaimAt && now.getTime() - state.lastClaimAt.getTime() < cdMs) {
      return res.status(429).json({ message: 'Cooldown active' });
    }
  }

  if (type === 'daily') {
    const today = startOfTodayUTC();
    if (state.lastClaimAt && state.lastClaimAt >= today) {
      return res.status(429).json({ message: 'Daily already claimed' });
    }
  }

  const reward = Number(cfg.rewards?.[type] || 0);
  if (reward <= 0) return res.status(400).json({ message: 'Reward disabled' });

  user.balance += reward;
  await user.save();

  state.lastClaimAt = now;
  await state.save();

  res.json({ amount: reward, balance: user.balance });
});

// Optional: double last reward (rate limited)
router.post('/actions/double', telegramAuth, async (req, res) => {
  const telegramId = req.tgUserId;
  const { amount } = req.body || {};
  const a = Number(amount);
  if (!Number.isFinite(a) || a <= 0) return res.status(400).json({ message: 'Invalid amount' });

  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ message: 'User not found' });

  // Allow at most once every 10 minutes
  const now = new Date();
  let state = await ActionState.findOne({ userTelegramId: telegramId, type: 'double' });
  if (!state) state = await ActionState.create({ userTelegramId: telegramId, type: 'double' });
  const cdMs = 10 * 60 * 1000;
  if (state.lastClaimAt && now.getTime() - state.lastClaimAt.getTime() < cdMs) {
    return res.status(429).json({ message: 'Double cooldown active' });
  }

  // Safety cap per double action
  const cap = 0.05; // TON
  const add = Math.min(a, cap);

  user.balance = (user.balance || 0) + add;
  await user.save();
  state.lastClaimAt = now;
  await state.save();

  res.json({ ok: true, amount: add, user: { balance: user.balance, lockedBalance: user.lockedBalance } });
});

// Tasks catalog
router.get('/tasks', telegramAuth, async (req, res) => {
  const tasks = await TaskCatalog.find({ active: true }).sort({ sort: 1, createdAt: 1 }).lean();
  const done = await TaskCompletion.find({ userTelegramId: req.tgUserId }).lean();
  const doneSet = new Set(done.map(d => d.taskId));

  res.json({
    tasks: tasks.map(t => ({
      taskId: t.taskId,
      title: t.title,
      icon: t.icon,
      kind: t.kind,
      url: t.url,
      rewardTon: t.rewardTon,
      durationSec: t.durationSec,
      done: doneSet.has(t.taskId)
    }))
  });
});

// Start a task (once, and can't restart if completed)
router.post('/tasks/start', telegramAuth, async (req, res) => {
  const telegramId = req.tgUserId;
  const { taskId } = req.body || {};
  if (!taskId) return res.status(400).json({ message: 'Missing taskId' });

  const completed = await TaskCompletion.findOne({ userTelegramId: telegramId, taskId });
  if (completed) return res.status(409).json({ message: 'Task already completed' });

  try {
    const start = await TaskStart.create({ userTelegramId: telegramId, taskId, startedAt: new Date() });
    return res.json({ startedAt: start.startedAt });
  } catch (e) {
    // already started
    const existing = await TaskStart.findOne({ userTelegramId: telegramId, taskId });
    return res.json({ startedAt: existing?.startedAt });
  }
});

// Claim a task after duration (15s) - once per user
router.post('/tasks/claim', telegramAuth, async (req, res) => {
  const telegramId = req.tgUserId;
  const { taskId } = req.body || {};
  if (!taskId) return res.status(400).json({ message: 'Missing taskId' });

  const task = await TaskCatalog.findOne({ taskId, active: true });
  if (!task) return res.status(404).json({ message: 'Task not found' });

  const completed = await TaskCompletion.findOne({ userTelegramId: telegramId, taskId });
  if (completed) return res.status(409).json({ message: 'Task already completed' });

  const started = await TaskStart.findOne({ userTelegramId: telegramId, taskId });
  if (!started) return res.status(400).json({ message: 'Task not started' });

  const elapsedMs = Date.now() - started.startedAt.getTime();
  if (elapsedMs < (task.durationSec * 1000)) {
    return res.status(400).json({ message: `Wait ${task.durationSec}s before claiming` });
  }

  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ message: 'User not found' });

  // Unique insert prevents double claim
  try {
    await TaskCompletion.create({ userTelegramId: telegramId, taskId, rewardTon: task.rewardTon, completedAt: new Date() });
  } catch (e) {
    return res.status(409).json({ message: 'Task already completed' });
  }

  user.balance += task.rewardTon;
  await user.save();

  // Cleanup start record
  await TaskStart.deleteOne({ userTelegramId: telegramId, taskId }).catch(() => {});

  res.json({ amount: task.rewardTon, balance: user.balance });
});

// Withdrawals
router.post('/withdrawals', telegramAuth, async (req, res) => {
  const telegramId = req.tgUserId;
  const { amount, method, details } = req.body || {};
  const a = Number(amount);
  if (!Number.isFinite(a) || a <= 0) return res.status(400).json({ message: 'Invalid amount' });
  if (!['FAUCETPAY_TON', 'BINANCE_USDT_BEP20'].includes(method)) return res.status(400).json({ message: 'Invalid method' });

  const cfg = await getAppConfig();

  // Enabled methods (admin controlled)
  if (method === 'FAUCETPAY_TON' && cfg.withdraw?.enabledMethods?.faucetpayTon === false) {
    return res.status(400).json({ message: 'FaucetPay is disabled' });
  }
  if (method === 'BINANCE_USDT_BEP20' && cfg.withdraw?.enabledMethods?.binanceUsdtBep20 === false) {
    return res.status(400).json({ message: 'Binance USDT is disabled' });
  }
  const user = await User.findOne({ telegramId });
  if (!user) return res.status(404).json({ message: 'User not found' });

  const available = (user.balance || 0) - (user.lockedBalance || 0);
  if (a > available) return res.status(400).json({ message: 'Insufficient available balance' });

  let currency = 'TON';
  if (method === 'BINANCE_USDT_BEP20') currency = 'USDT';

  // Minimums
  if (currency === 'TON' && a < Number(cfg.limits?.minWithdrawTon || 0.0001)) {
    return res.status(400).json({ message: 'Below min TON withdrawal' });
  }
  if (currency === 'USDT' && a < Number(cfg.limits?.minWithdrawUsdt || 0.5)) {
    return res.status(400).json({ message: 'Below min USDT withdrawal' });
  }

  // Validate details
  const det = details || {};
  const normalizedDetails = { network: null, faucetPayEmail: null, binanceId: null };
  if (method === 'FAUCETPAY_TON') {
    const email = String(det.email || det.faucetPayEmail || '').trim();
    if (!email.includes('@')) return res.status(400).json({ message: 'Invalid FaucetPay email' });
    normalizedDetails.faucetPayEmail = email;
  } else {
    const binanceId = String(det.binanceId || '').trim();
    if (!binanceId) return res.status(400).json({ message: 'Missing Binance ID' });
    normalizedDetails.binanceId = binanceId;
    normalizedDetails.network = 'BEP20';
  }

  // LOCK balance immediately (your choice #1)
  user.lockedBalance = (user.lockedBalance || 0) + a;
  await user.save();

  const w = await Withdrawal.create({
    userTelegramId: telegramId,
    amount: a,
    currency,
    method,
    details: normalizedDetails,
    status: 'PENDING',
    requestedAt: new Date(),
    updatedAt: new Date()
  });

  // notify admin on bot
  await notifyAdminWithdrawal(w, req.tgUser);

  res.json({
    ok: true,
    id: String(w._id),
    status: w.status,
    user: {
      telegramId: user.telegramId,
      balance: user.balance,
      lockedBalance: user.lockedBalance,
      friendsCount: user.friendsCount,
      refEarned: user.refEarned
    }
  });
});

router.post('/withdrawals/mine', telegramAuth, async (req, res) => {
  const telegramId = req.tgUserId;
  const items = await Withdrawal.find({ userTelegramId: telegramId }).sort({ requestedAt: -1 }).limit(50).lean();
  res.json({
    items: items.map(w => ({
      id: String(w._id),
      amount: w.amount,
      currency: w.currency,
      method: w.method,
      status: w.status,
      createdAt: w.requestedAt,
      details: w.details
    }))
  });
});

// --- Admin (used by bot) ---
router.get('/admin/withdrawals/pending', adminAuth, async (req, res) => {
  const items = await Withdrawal.find({ status: 'PENDING' }).sort({ requestedAt: -1 }).limit(50).lean();
  res.json({ withdrawals: items });
});

router.post('/admin/withdrawals/:id/approve', adminAuth, async (req, res) => {
  const id = req.params.id;
  const w = await Withdrawal.findById(id);
  if (!w) return res.status(404).json({ message: 'Not found' });
  if (w.status !== 'PENDING') return res.status(400).json({ message: 'Not pending' });
  w.status = 'APPROVED';
  w.updatedAt = new Date();
  w.decisionBy = 'ADMIN';
  w.decisionAt = new Date();
  await w.save();
  res.json({ ok: true, status: w.status });
});

router.post('/admin/withdrawals/:id/reject', adminAuth, async (req, res) => {
  const id = req.params.id;
  const reason = String(req.body?.reason || '').slice(0, 200);
  const w = await Withdrawal.findById(id);
  if (!w) return res.status(404).json({ message: 'Not found' });
  if (w.status === 'REJECTED' || w.status === 'PAID') return res.status(400).json({ message: 'Already finalized' });

  // Refund locked balance
  const user = await User.findOne({ telegramId: w.userTelegramId });
  if (user) {
    user.lockedBalance = Math.max(0, (user.lockedBalance || 0) - w.amount);
    await user.save();
  }

  w.status = 'REJECTED';
  w.rejectReason = reason || 'Rejected';
  w.updatedAt = new Date();
  w.decisionBy = 'ADMIN';
  w.decisionAt = new Date();
  await w.save();

  res.json({ ok: true, status: w.status });
});

router.post('/admin/withdrawals/:id/paid', adminAuth, async (req, res) => {
  const id = req.params.id;
  const w = await Withdrawal.findById(id);
  if (!w) return res.status(404).json({ message: 'Not found' });
  if (w.status === 'PAID') return res.json({ ok: true, status: 'PAID' });
  if (w.status === 'REJECTED') return res.status(400).json({ message: 'Rejected' });

  // finalize: deduct locked from actual balance
  const user = await User.findOne({ telegramId: w.userTelegramId });
  if (user) {
    user.lockedBalance = Math.max(0, (user.lockedBalance || 0) - w.amount);
    user.balance = Math.max(0, (user.balance || 0) - w.amount);
    await user.save();
  }

  w.status = 'PAID';
  w.updatedAt = new Date();
  w.decisionBy = 'ADMIN';
  w.decisionAt = new Date();
  await w.save();

  res.json({ ok: true, status: w.status });
});

router.post('/admin/config', adminAuth, async (req, res) => {
  const cfg = await getAppConfig();
  const body = req.body || {};

  const sNum = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  // Allow safe updates
  if (body.rewards) {
    if (body.rewards.mine != null) cfg.rewards.mine = sNum(body.rewards.mine, cfg.rewards.mine);
    if (body.rewards.faucet != null) cfg.rewards.faucet = sNum(body.rewards.faucet, cfg.rewards.faucet);
    if (body.rewards.daily != null) cfg.rewards.daily = sNum(body.rewards.daily, cfg.rewards.daily);
  }
  if (body.limits) {
    if (body.limits.minWithdrawTon != null) cfg.limits.minWithdrawTon = sNum(body.limits.minWithdrawTon, cfg.limits.minWithdrawTon);
    if (body.limits.minWithdrawUsdt != null) cfg.limits.minWithdrawUsdt = sNum(body.limits.minWithdrawUsdt, cfg.limits.minWithdrawUsdt);
  }
  if (body.referral) {
    if (body.referral.bonusTon != null) cfg.referral.bonusTon = sNum(body.referral.bonusTon, cfg.referral.bonusTon);
  }
  if (body.ads) {
    cfg.ads.mine = String(body.ads.mine ?? cfg.ads.mine);
    cfg.ads.faucet = String(body.ads.faucet ?? cfg.ads.faucet);
    cfg.ads.daily = String(body.ads.daily ?? cfg.ads.daily);
    cfg.ads.double = String(body.ads.double ?? cfg.ads.double);
  }

  // Money settings
  if (body.money) {
    if (body.money.cooldowns) {
      if (body.money.cooldowns.mineSec != null) cfg.money.cooldowns.mineSec = sNum(body.money.cooldowns.mineSec, cfg.money.cooldowns.mineSec);
      if (body.money.cooldowns.faucetSec != null) cfg.money.cooldowns.faucetSec = sNum(body.money.cooldowns.faucetSec, cfg.money.cooldowns.faucetSec);
    }
    if (body.money.speedUpSec != null) cfg.money.speedUpSec = sNum(body.money.speedUpSec, cfg.money.speedUpSec);
  }

  // Withdraw methods enable/disable
  if (body.withdraw && body.withdraw.enabledMethods) {
    cfg.withdraw.enabledMethods.faucetpayTon = Boolean(body.withdraw.enabledMethods.faucetpayTon ?? cfg.withdraw.enabledMethods.faucetpayTon);
    cfg.withdraw.enabledMethods.binanceUsdtBep20 = Boolean(body.withdraw.enabledMethods.binanceUsdtBep20 ?? cfg.withdraw.enabledMethods.binanceUsdtBep20);
  }

  // Task defaults
  if (body.tasks) {
    if (body.tasks.defaultDurationSec != null) cfg.tasks.defaultDurationSec = sNum(body.tasks.defaultDurationSec, cfg.tasks.defaultDurationSec);
  }

  // Ad scripts
  if (body.adsScripts) {
    cfg.adsScripts.mine = String(body.adsScripts.mine ?? cfg.adsScripts.mine);
    cfg.adsScripts.faucet = String(body.adsScripts.faucet ?? cfg.adsScripts.faucet);
    cfg.adsScripts.daily = String(body.adsScripts.daily ?? cfg.adsScripts.daily);
  }

  await cfg.save();
  res.json({ ok: true, config: cfg });
});

// Admin: get current config
router.get('/admin/config', adminAuth, async (req, res) => {
  const cfg = await getAppConfig();
  res.json({ config: cfg });
});

// Admin: tasks management
router.get('/admin/tasks', adminAuth, async (req, res) => {
  const tasks = await TaskCatalog.find({}).sort({ active: -1, sort: 1, createdAt: 1 }).lean();
  res.json({ tasks });
});

router.post('/admin/tasks/create', adminAuth, async (req, res) => {
  const b = req.body || {};
  const taskId = String(b.taskId || '').trim();
  const title = String(b.title || '').trim();
  const icon = String(b.icon || '✅').trim().slice(0, 4);
  const kind = String(b.kind || 'timer');
  const url = String(b.url || '').trim();
  const rewardTon = Number(b.rewardTon);
  const durationSec = Number(b.durationSec ?? 15);
  const sort = Number(b.sort ?? 0);
  if (!taskId || !title) return res.status(400).json({ message: 'taskId and title are required' });
  if (!Number.isFinite(rewardTon) || rewardTon <= 0) return res.status(400).json({ message: 'Invalid rewardTon' });

  const t = await TaskCatalog.create({ taskId, title, icon, kind, url, rewardTon, durationSec, sort, active: true });
  res.json({ ok: true, task: t });
});

router.post('/admin/tasks/update', adminAuth, async (req, res) => {
  const b = req.body || {};
  const taskId = String(b.taskId || '').trim();
  if (!taskId) return res.status(400).json({ message: 'Missing taskId' });
  const t = await TaskCatalog.findOne({ taskId });
  if (!t) return res.status(404).json({ message: 'Not found' });
  if (b.title != null) t.title = String(b.title).trim();
  if (b.icon != null) t.icon = String(b.icon).trim().slice(0, 4) || '✅';
  if (b.kind != null) t.kind = String(b.kind);
  if (b.url != null) t.url = String(b.url).trim();
  if (b.rewardTon != null) t.rewardTon = Number(b.rewardTon);
  if (b.durationSec != null) t.durationSec = Number(b.durationSec);
  if (b.sort != null) t.sort = Number(b.sort);
  if (b.active != null) t.active = Boolean(b.active);
  await t.save();
  res.json({ ok: true, task: t });
});

router.post('/admin/tasks/delete', adminAuth, async (req, res) => {
  const taskId = String(req.body?.taskId || '').trim();
  if (!taskId) return res.status(400).json({ message: 'Missing taskId' });
  await TaskCatalog.deleteOne({ taskId });
  res.json({ ok: true });
});

// Admin: general stats
router.get('/admin/stats', adminAuth, async (req, res) => {
  const users = await User.countDocuments({});
  const pending = await Withdrawal.countDocuments({ status: 'PENDING' });
  const approved = await Withdrawal.countDocuments({ status: 'APPROVED' });
  const paid = await Withdrawal.countDocuments({ status: 'PAID' });
  const rejected = await Withdrawal.countDocuments({ status: 'REJECTED' });
  res.json({ users, withdrawals: { pending, approved, paid, rejected } });
});

export default router;
