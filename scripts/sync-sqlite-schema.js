#!/usr/bin/env node
/**
 * sync-sqlite-schema.js
 * ─────────────────────
 * يولّد `prisma/schema.sqlite.prisma` تلقائياً من `prisma/schema.prisma`
 * (نسخة PostgreSQL) عن طريق استبدال كتلة الـ datasource فقط، مع إبقاء كل
 * الموديلات والحقول والعلاقات مطابقة 100% للنسخة الرئيسية.
 *
 * لماذا هذا الملف موجود؟
 * كان هناك خطأ سابق: نسخة SQLite (لوضع Desktop/Offline) بقيت قديمة
 * ولم تتزامن مع تحديثات schema.prisma (مثل نظام Multi-Tenant وميزة
 * التعويضات)، مما يجعل تطبيق سطح المكتب يستعمل Prisma Client مبني
 * على بنية بيانات قديمة وغير متوافقة مع باقي الكود.
 *
 * الحل: بدل الاحتفاظ بملفين منفصلين يدوياً، هذا السكربت يُشغَّل تلقائياً
 * قبل كل بناء لنسخة Desktop (انظر build-setup.sh/.ps1) فيعيد توليد
 * schema.sqlite.prisma من schema.prisma الحالي في كل مرة — فلا يبقى
 * هناك احتمال أن ينسى أحد تحديثه يدوياً.
 *
 * الاستعمال اليدوي (اختياري، للتحقق فقط):
 *   node scripts/sync-sqlite-schema.js
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SOURCE = path.join(ROOT, "prisma", "schema.prisma");
const TARGET = path.join(ROOT, "prisma", "schema.sqlite.prisma");

const POSTGRES_DATASOURCE_RE = /datasource db \{[\s\S]*?\}/;

const SQLITE_HEADER = `// Prisma schema for RCS Club — Multi-Tenant Platform (SQLite / Desktop Offline variant)
// ⚠️ ملف مُولَّد تلقائياً من schema.prisma — لا تُعدّله يدوياً.
// عدّل schema.prisma فقط، ثم شغّل: npm run db:sync-sqlite-schema
// (أو يُشغَّل تلقائياً ضمن build-setup.sh / build-setup.ps1)
`;

function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error("✗ لم يتم العثور على prisma/schema.prisma");
    process.exit(1);
  }

  const source = fs.readFileSync(SOURCE, "utf8");

  if (!POSTGRES_DATASOURCE_RE.test(source)) {
    console.error("✗ لم يتم العثور على كتلة datasource داخل schema.prisma — تحقق من صيغة الملف");
    process.exit(1);
  }

  const sqliteDatasource = `datasource db {\n  provider = "sqlite"\n  url      = env("DATABASE_URL")\n}`;

  // نزيل التعليقات الأصلية في أعلى الملف (السطرين الأولين) ونستبدلها برأسنا الخاص،
  // ثم نستبدل كتلة الـ datasource بالنسخة الخاصة بـ SQLite
  const withoutOldHeader = source.replace(
    /^\/\/.*\n\/\/.*\n\/\/.*\n\n/,
    ""
  );

  const result = SQLITE_HEADER + "\n" + withoutOldHeader.replace(POSTGRES_DATASOURCE_RE, sqliteDatasource);

  fs.writeFileSync(TARGET, result, "utf8");
  console.log(`✓ تم تحديث ${path.relative(ROOT, TARGET)} من ${path.relative(ROOT, SOURCE)}`);
}

main();
