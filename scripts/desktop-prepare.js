/**
 * desktop-prepare.js — يحضّر المشروع لبناء النسخة المكتبية (Electron)
 * ═══════════════════════════════════════════════════════════════
 *
 * يقوم بـ:
 *   1. نسخ احتياطي لـ prisma/schema.prisma (PostgreSQL) ← schema.prisma.web.bak
 *   2. استبدال prisma/schema.prisma بنسخة SQLite (schema.sqlite.prisma)
 *   3. تشغيل prisma generate لتوليد Prisma Client لـ SQLite
 *
 * هذا ضروري لأن النسخة المكتبية تستخدم SQLite محلياً (file:)،
 * بينما نسخة الويب تستخدم PostgreSQL (Neon).
 *
 * بعد البناء، شغّل `npm run desktop:restore` لاستعادة schema الأصلي.
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const SCHEMA_PATH = path.join(__dirname, "..", "prisma", "schema.prisma");
const SCHEMA_BAK = path.join(__dirname, "..", "prisma", "schema.prisma.web.bak");
const SQLITE_SCHEMA = path.join(__dirname, "..", "prisma", "schema.sqlite.prisma");

console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║  AquaCore — Desktop Build Preparation                    ║");
console.log("║  Switching Prisma schema: PostgreSQL → SQLite            ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

try {
  // 1) تحقق من وجود schema.sqlite.prisma
  if (!fs.existsSync(SQLITE_SCHEMA)) {
    console.error("❌ prisma/schema.sqlite.prisma not found!");
    console.error("   Run this first: node scripts/generate-sqlite-schema.js");
    process.exit(1);
  }

  // 2) نسخة احتياطية للـ schema الأصلي (PostgreSQL)
  if (fs.existsSync(SCHEMA_PATH)) {
    fs.copyFileSync(SCHEMA_PATH, SCHEMA_BAK);
    console.log("✅ Backed up schema.prisma → schema.prisma.web.bak");
  }

  // 3) استبدال بنسخة SQLite
  fs.copyFileSync(SQLITE_SCHEMA, SCHEMA_PATH);
  console.log("✅ Replaced schema.prisma with SQLite version");

  // 4) توليد Prisma Client لـ SQLite (استخدم نفس إصدار package.json: 6.11.1)
  console.log("\n🔧 Generating Prisma Client for SQLite...");
  execSync("npx prisma@6.11.1 generate", { stdio: "inherit", cwd: path.join(__dirname, "..") });
  console.log("✅ Prisma Client generated (SQLite)\n");

  console.log("══════════════════════════════════════════════════════════");
  console.log("  Ready for desktop build. Run: npm run electron:build");
  console.log("  After build, restore: npm run desktop:restore");
  console.log("══════════════════════════════════════════════════════════\n");
} catch (err) {
  console.error("\n❌ Preparation failed:", err.message);
  // حاول استعادة الـ schema الأصلي عند الفشل
  if (fs.existsSync(SCHEMA_BAK)) {
    fs.copyFileSync(SCHEMA_BAK, SCHEMA_PATH);
    console.error("⚠️  Restored original schema.prisma");
  }
  process.exit(1);
}
