/**
 * RCS Club Desktop — Local Next.js Server
 * ─────────────────────────────────────────
 * يشغل Next.js في وضع production على بورت 3872
 * يستخدم SQLite محلي بدلاً من PostgreSQL السحابي
 *
 * يعمل تلقائياً عند بدء تطبيق Electron
 */

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const port = process.env.PORT || 3872;
const dev = false; // وضع production دائماً في Desktop

const app = next({ dev });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    console.log("[Next.js] Server prepared");

    createServer((req, res) => {
      const parsedUrl = parse(req.url, true);
      handle(req, res, parsedUrl);
    }).listen(port, (err) => {
      if (err) throw err;
      console.log(`[Next.js] ✅ Ready on http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error("[Next.js] Failed to start:", err);
    process.exit(1);
  });
