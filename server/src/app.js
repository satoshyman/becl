const path = require("path");
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ✅ Serve the WebApp (web/index.html) from the same Render service
const WEB_DIR = path.join(__dirname, "../../web");
app.use(express.static(WEB_DIR));

app.get("/", (req, res) => {
  res.sendFile(path.join(WEB_DIR, "index.html"));
});

// (اختياري) صحة السيرفر
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// ✅ Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});

// ✅ Start bot (runs in same service, no Background Worker needed)
// لو بوتك متربط من ملف تاني، سيب السطر ده كما هو أو عدّله حسب مسار البوت عندك.
try {
  require("./bot/start-bot"); // لو الملف ده موجود عندك
} catch (e) {
  // لو البوت عندك في مسار مختلف، تجاهل هنا وهنظبطه
  console.log("Bot autostart skipped (check bot path).");
}
