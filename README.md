# BeeClaimer Full (Telegram WebApp) — Ready Project

This is a **full working project** built from your single-page HTML UI, but with **real backend + MongoDB + manual withdrawals**:

- ✅ **Telegram WebApp UI** (same look & animations)
- ✅ **MongoDB (Atlas)** stores users, balance, tasks, withdrawals
- ✅ **Tasks**: 15 seconds verification, **one time per user**
- ✅ **Referrals**: fixed bonus (default **0.002 TON**) added instantly + friend count
- ✅ **Withdrawals (manual)** with bot notification + approve/reject/paid
  - FaucetPay (TON)
  - Binance ID (USDT - BEP20)
- ✅ **Locked balance** on withdrawal requests (your choice #1)

---

## 1) Local run (quick test)

### Backend
```bash
cd server
cp .env.example .env
# edit .env values
npm i
npm run dev
```

### Bot (admin approvals)
In another terminal:
```bash
cd server
npm run bot
```

### Frontend
Serve `web/` with any static server:
```bash
cd web
python3 -m http.server 5500
```
Open:
- `http://localhost:5500/?api=http://localhost:8080`

> In Telegram, the WebApp will pass `initData` automatically.

---

## 2) Deploy (GitHub → Render → MongoDB Atlas)

### MongoDB Atlas
1) Create cluster
2) Create DB user & password
3) Network access allow your Render IPs (or `0.0.0.0/0` for quick start)
4) Copy `mongodb+srv://...` into `MONGODB_URI`

### Render
Create two services:

#### A) Web Service (Backend)
- Root dir: `server`
- Build command: `npm install`
- Start command: `npm start`
- Env vars: `MONGODB_URI`, `BOT_TOKEN`, `ADMIN_CHAT_ID`, `ADMIN_API_KEY`

#### B) Background Worker (Bot)
- Root dir: `server`
- Build command: `npm install`
- Start command: `npm run bot`
- Env vars: same as above +
  - `BACKEND_URL=https://<your-backend>.onrender.com`
  - `FRONTEND_URL=https://<your-frontend>.onrender.com/?api=https://<your-backend>.onrender.com`

#### C) Static Site (Frontend)
- Root dir: `web`
- Publish dir: `.`

After you deploy the backend, open the static site with:
- `https://<your-frontend>.onrender.com/?api=https://<your-backend>.onrender.com`

---

## 3) Telegram BotFather setup

- Create bot and get `BOT_TOKEN`
- The bot already shows a **WebApp button** on /start using `FRONTEND_URL`.
  (You can also set it from BotFather if you want, but it's not required.)
- Admin chat id: open the bot from your admin account, send `/start`, then use any "get id" bot or check logs.

---

## Notes
- **Withdrawals are manual**: the bot only changes status + locks/unlocks balance.
- You can change rewards/minimums from Mongo (`config` document with key=`app`) or via admin API.

