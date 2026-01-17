import crypto from 'crypto';

function timingSafeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export function verifyTelegramInitData(initData, botToken) {
  if (!initData) throw new Error('Missing initData');
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) throw new Error('Missing hash');

  // Build data-check-string
  const pairs = [];
  for (const [key, value] of params.entries()) {
    if (key === 'hash') continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto.createHash('sha256').update(botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (!timingSafeEqual(computedHash, hash)) {
    throw new Error('Invalid initData hash');
  }

  const userJson = params.get('user');
  if (!userJson) throw new Error('Missing user');
  const user = JSON.parse(userJson);
  return { user, authDate: params.get('auth_date') };
}

export function telegramAuth(req, res, next) {
  try {
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) return res.status(500).json({ message: 'Server misconfigured: BOT_TOKEN missing' });

    const initData = req.headers['x-telegram-init-data'] || req.body?.initData;
    const parsed = verifyTelegramInitData(String(initData || ''), botToken);

    req.tgUser = parsed.user;
    req.tgUserId = String(parsed.user.id);
    next();
  } catch (e) {
    res.status(401).json({ message: 'Unauthorized: ' + (e?.message || 'invalid initData') });
  }
}

export function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'];
  if (!process.env.ADMIN_API_KEY) return res.status(500).json({ message: 'Server misconfigured: ADMIN_API_KEY missing' });
  if (key && key === process.env.ADMIN_API_KEY) return next();
  return res.status(403).json({ message: 'Forbidden' });
}
