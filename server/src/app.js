const path = require("path");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// ================== Middlewares ==================
app.use(cors());
app.use(express.json());

// ================== Serve WebApp ==================
// app.js موجود داخل: server/src/
// web موجود في: web/
// لذلك نطلع خطوتين لفوق
const WEB_DIR = path.join(__dirname, "../../web");

app.use(express.static(WEB_DIR));

app.get("/", (req, res) => {
  res.sendFile(path.join(WEB_DIR, "index.html"));
});

// ================== Health check ==================
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// ================== Start server ==================
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});

// ================== Start bot ==================
// مسار البوت: server/src/bot/bot.js
try {
  require("./bot/bot.js");
  console.log("Bot started from app.js");
} catch (err) {
  console.error("Bot failed to start:", err);
}
