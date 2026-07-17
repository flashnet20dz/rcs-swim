#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
# RCS Club — Build Setup.exe (Production Release)
# ═══════════════════════════════════════════════════════════
set -e

VERSION="1.0.0"
PRODUCT_NAME="RCS Club"
APP_EXE="RCS Club.exe"
SETUP_EXE="RCS Club Setup v${VERSION}.exe"

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  RCS Club — Build Setup.exe (Production)                ║"
echo "║  Version: ${VERSION}                                       ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ─── Step 1: Install dependencies ───
echo "📦 Step 1: Installing dependencies..."
if [ ! -d "node_modules" ]; then
  npm install
fi
echo "✅ Dependencies ready"
echo ""

# ─── Step 2: Switch to SQLite schema (Desktop = Offline DB) + generate client ───
# ⚠️ مهم جداً: نسخة Desktop توفّرها هذه العملية توفير الاتصال المحلي
# بدون إنترنت عبر SQLite. لو استعملنا schema.prisma (PostgreSQL) هنا،
# التطبيق سيعطي خطأ اتصال بمجرد تشغيله بدون إنترنت.
echo "🔧 Step 2: Preparing SQLite schema for Desktop/Offline + generating Prisma client..."
node scripts/sync-sqlite-schema.js
cp prisma/schema.prisma "prisma/.schema.prisma.build-backup"
cp prisma/schema.sqlite.prisma prisma/schema.prisma

# مهما حدث (نجاح أو فشل السكربت)، أعد schema.prisma الأصلي (PostgreSQL)
# في النهاية حتى لا يتأثر النشر على الويب (Vercel) بهذا التبديل المؤقت.
restore_schema() {
  if [ -f "prisma/.schema.prisma.build-backup" ]; then
    cp "prisma/.schema.prisma.build-backup" prisma/schema.prisma
    rm -f "prisma/.schema.prisma.build-backup"
    echo "↩️  تمت استعادة prisma/schema.prisma الأصلي (PostgreSQL)"
  fi
}
trap restore_schema EXIT

npx prisma generate
echo "✅ Prisma client (SQLite) generated"
echo ""

# ─── Step 2.5: Create fresh SQLite template database (all tables, no data) ───
# هذا الملف هو ما يُنسخ لمجلد المستخدم عند أول تشغيل (بدل ملف فارغ بلا جداول)
echo "🗄️  Step 2.5: Creating SQLite template database (empty tables)..."
mkdir -p resources
rm -f prisma/rcs-club-template.db
DATABASE_URL="file:$(pwd)/prisma/rcs-club-template.db" npx prisma db push --skip-generate --accept-data-loss
cp prisma/rcs-club-template.db resources/rcs-club-template.db
rm -f prisma/rcs-club-template.db
echo "✅ Template database ready: resources/rcs-club-template.db"
echo ""

# ─── Step 3: Build Next.js ───
echo "🏗️  Step 3: Building Next.js..."
npm run build
if [ $? -ne 0 ]; then
  echo "❌ Next.js build failed"
  exit 1
fi
echo "✅ Next.js build successful"
echo ""

# ─── Step 4: Compile Electron TypeScript ───
echo "⚡ Step 4: Compiling Electron TypeScript..."
npx tsc electron/main.ts --outDir electron --target es2020 --module commonjs --moduleResolution node --esModuleInterop --skipLibCheck --lib es2020
npx tsc electron/preload.ts --outDir electron --target es2020 --module commonjs --moduleResolution node --esModuleInterop --skipLibCheck --lib es2020
echo "✅ Electron files compiled"
echo ""

# ─── Step 5: Generate Windows icon ───
echo "🎨 Step 5: Generating Windows icon..."
if [ ! -f "public/images/icon.ico" ]; then
  python3 -c "
from PIL import Image
img = Image.open('public/images/rcs-logo-official.png').convert('RGBA')
img_256 = img.resize((256, 256), Image.Resampling.LANCZOS)
img_256.save('public/images/icon.ico', format='ICO', sizes=[(16,16),(32,32),(48,48),(64,64),(128,128),(256,256)])
img_256.save('public/images/icon-256.png', format='PNG')
print('  ✅ icon.ico created')
"
else
  echo "  ✅ icon.ico already exists"
fi
echo ""

# ─── Step 6: Build Windows app (electron-builder --dir) ───
echo "📦 Step 6: Building Windows app (electron-builder)..."
rm -rf dist/win-unpacked
npx electron-builder --win --dir
if [ $? -ne 0 ]; then
  echo "❌ electron-builder failed"
  exit 1
fi
echo "✅ Windows app built: dist/win-unpacked/${APP_EXE}"
echo ""

# ─── Step 7: Build Setup.exe with NSIS ───
echo "🎯 Step 7: Building Setup.exe with NSIS..."

# البحث عن makensis
MAKENSIS=""
if command -v makensis &> /dev/null; then
  MAKENSIS="makensis"
elif [ -f "/home/z/.cache/electron-builder/nsis-3.0.4.1/nsis-3.0.4.1-1mx3n/linux/makensis" ]; then
  MAKENSIS="/home/z/.cache/electron-builder/nsis-3.0.4.1/nsis-3.0.4.1-1mx3n/linux/makensis"
  # إعداد LD_PRELOAD لـ Linux
  if [ -f "scripts/nsis_redirect.so" ]; then
    export LD_PRELOAD="$(pwd)/scripts/nsis_redirect.so"
  fi
  export NSISDIR="/home/z/.cache/electron-builder/nsis-3.0.4.1/nsis-3.0.4.1-1mx3n"
fi

if [ -z "$MAKENSIS" ]; then
  echo "❌ makensis not found"
  echo "   On Windows: install NSIS from https://nsis.sourceforge.io"
  echo "   On Linux: use the electron-builder cached version"
  exit 1
fi

echo "  Using: $MAKENSIS"
"$MAKENSIS" -V2 installer-simple.nsi
if [ $? -ne 0 ]; then
  echo "❌ NSIS build failed"
  exit 1
fi
echo ""

# ─── Verify ───
if [ -f "dist/${SETUP_EXE}" ]; then
  SIZE=$(stat -c%s "dist/${SETUP_EXE}" 2>/dev/null || stat -f%z "dist/${SETUP_EXE}")
  SIZE_MB=$(echo "scale=2; $SIZE / 1024 / 1024" | bc)

  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║                                                          ║"
  echo "║          🎉  BUILD SUCCESSFUL!  🎉                        ║"
  echo "║                                                          ║"
  echo "╠══════════════════════════════════════════════════════════╣"
  echo "║                                                          ║"
  echo "║  📁 File:      ${SETUP_EXE}            ║"
  echo "║  📂 Path:      dist/${SETUP_EXE}        ║"
  echo "║  📏 Size:      ${SIZE_MB} MB                            ║"
  echo "║  🏷️  Version:   ${VERSION}                                  ║"
  echo "║  🏢 Publisher:  RCS Club Management System               ║"
  echo "║  🖼️  Icon:       icon.ico (256x256)                       ║"
  echo "║  📦 Type:       NSIS Installer (PE32)                    ║"
  echo "║                                                          ║"
  echo "║  ✅ Desktop shortcut       ║"
  echo "║  ✅ Start Menu shortcut    ║"
  echo "║  ✅ Uninstaller            ║"
  echo "║  ✅ Add/Remove Programs    ║"
  echo "║  ✅ Run after install      ║"
  echo "║                                                          ║"
  echo "╚══════════════════════════════════════════════════════════╝"
else
  echo "❌ Setup.exe was not created"
  exit 1
fi

# ─── استعادة نهائية: schema.prisma (PostgreSQL) + إعادة توليد العميل للويب ───
# ملاحظة: نستدعي restore_schema صراحةً هنا (وليس الاعتماد فقط على trap EXIT)
# لأن trap لا يعمل إلا عند خروج العملية فعلياً — أي بعد هذا السطر — وبذلك لو
# اكتفينا بالـ trap لكان "npx prisma generate" أدناه يعمل على مخطط SQLite بالخطأ.
echo ""
echo "🔧 استعادة schema.prisma الأصلي (PostgreSQL) وإعادة توليد العميل لنسخة الويب..."
restore_schema
npx prisma generate || echo "⚠️  لم يتم التوليد تلقائياً — شغّل 'npx prisma generate' يدوياً قبل العمل على نسخة الويب"
