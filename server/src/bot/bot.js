const { Telegraf, Markup } = require("telegraf");
const axios = require("axios");

// تأكد إن المتغيرات دي موجودة في Render
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = String(process.env.ADMIN_CHAT_ID || "");
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;
const BACKEND_URL = process.env.BACKEND_URL || ""; // لو شغّال خدمة واحدة، ممكن تسيبه فاضي
const FRONTEND_URL = process.env.FRONTEND_URL || ""; // لو خدمة واحدة، مش ضروري

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN is missing");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ====== /start (فتح الواجهة) ======
bot.start(async (ctx) => {
  const url =
    FRONTEND_URL ||
    `${ctx.telegram.webhookReply ? "" : ""}`; // fallback لو خدمة واحدة

  await ctx.reply(
    "🚀 Open App",
    Markup.inlineKeyboard([
      Markup.button.webApp(
        "Open App",
        FRONTEND_URL || "https://YOUR-RENDER-APP.onrender.com"
      ),
    ])
  );
});

// ====== لوحة التحكم المخفية ======
bot.command("panel", async (ctx) => {
  if (String(ctx.chat.id) !== ADMIN_CHAT_ID) {
    return ctx.reply("❌ Not authorized");
  }

  await ctx.reply(
    "🛠 Admin Panel",
    Markup.inlineKeyboard([
      [
        Markup.button.callback("💰 Money", "panel_money"),
        Markup.button.callback("✅ Tasks", "panel_tasks"),
      ],
      [
        Markup.button.callback("🏦 Withdrawals", "panel_withdraws"),
        Markup.button.callback("📊 Stats", "panel_stats"),
      ],
    ])
  );
});

// ====== مثال: عرض طلبات السحب المعلّقة ======
bot.action("panel_withdraws", async (ctx) => {
  if (String(ctx.chat.id) !== ADMIN_CHAT_ID) return;

  try {
    const res = await axios.get(`${BACKEND_URL}/api/admin/withdrawals`, {
      headers: { "x-admin-key": ADMIN_API_KEY },
    });

    const list = res.data || [];
    if (!list.length) {
      return ctx.reply("No pending withdrawals.");
    }

    for (const w of list) {
      await ctx.reply(
        `💸 Withdraw\nUser: ${w.userTelegramId}\nAmount: ${w.amount}\nMethod: ${w.method}\nStatus: ${w.status}`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback("✅ Approve", `w_app_${w._id}`),
            Markup.button.callback("❌ Reject", `w_rej_${w._id}`),
          ],
          [Markup.button.callback("💚 Paid", `w_paid_${w._id}`)],
        ])
      );
    }
  } catch (e) {
    console.error(e.message);
    ctx.reply("Error loading withdrawals.");
  }
});

// ====== أزرار تغيير حالة السحب ======
bot.action(/w_(app|rej|paid)_(.+)/, async (ctx) => {
  if (String(ctx.chat.id) !== ADMIN_CHAT_ID) return;

  const action = ctx.match[1];
  const id = ctx.match[2];
  let status = "PENDING";

  if (action === "app") status = "APPROVED";
  if (action === "rej") status = "REJECTED";
  if (action === "paid") status = "PAID";

  try {
    await axios.patch(
      `${BACKEND_URL}/api/admin/withdrawals/${id}`,
      { status },
      { headers: { "x-admin-key": ADMIN_API_KEY } }
    );

    await ctx.reply(`✔ Withdrawal ${status}`);
  } catch (e) {
    console.error(e.message);
    ctx.reply("Failed to update status.");
  }
});

// ====== تشغيل البوت ======
bot.launch().then(() => {
  console.log("Bot started");
});

// إغلاق نظيف
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
