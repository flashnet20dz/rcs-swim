# ═══════════════════════════════════════════════════════════
# RCS Club — Build Setup.exe (Hybrid: Offline + Online)
# ═══════════════════════════════════════════════════════════
#
# يبني نسخة Desktop تعمل:
#   1. Offline — خادم Next.js Standalone محلي + SQLite
#   2. Online  — يحمّل من السحابة (Vercel) كـ fallback
#
# ═══════════════════════════════════════════════════════════

Write-Host "`n╔══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  RCS Club — Build Hybrid Desktop (Offline + Online)      ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

# ─── الخطوة 1: تثبيت الحزم ───
Write-Host "`n📦 الخطوة 1: تثبيت الحزم..." -ForegroundColor Yellow
npm install
if ($LASTEXITCODE -ne 0) { Write-Host "❌ فشل تثبيت الحزم" -ForegroundColor Red; Read-Host "اضغط Enter للخروج"; exit 1 }

# ─── الخطوة 2: التبديل إلى مخطط SQLite (Desktop = قاعدة بيانات محلية أوفلاين) ───
# ⚠️ مهم جداً: بدون هذه الخطوة، Prisma Client يُولَّد على أساس PostgreSQL
# (schema.prisma الأصلي)، والتطبيق يفشل بمجرد تشغيله بدون إنترنت لأن رابط
# الاتصال المحلي (file:...) لا يطابق نوع قاعدة البيانات المُولَّد لها العميل.
Write-Host "`n🔧 الخطوة 2: تجهيز مخطط SQLite (Offline) + توليد Prisma Client..." -ForegroundColor Yellow
node scripts/sync-sqlite-schema.js
Copy-Item "prisma\schema.prisma" "prisma\.schema.prisma.build-backup" -Force
Copy-Item "prisma\schema.sqlite.prisma" "prisma\schema.prisma" -Force

npx prisma generate
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ فشل توليد Prisma" -ForegroundColor Red
    Copy-Item "prisma\.schema.prisma.build-backup" "prisma\schema.prisma" -Force
    Remove-Item "prisma\.schema.prisma.build-backup" -Force
    Read-Host "اضغط Enter للخروج"; exit 1
}

# ─── الخطوة 2.5: إنشاء قاعدة بيانات SQLite "قالب" (كل الجداول، بدون بيانات) ───
# هذا الملف يُنسخ لمجلد بيانات المستخدم عند أول تشغيل بدل ملف فارغ بلا جداول
Write-Host "`n🗄️ الخطوة 2.5: إنشاء قاعدة بيانات SQLite القالب..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path "resources" | Out-Null
Remove-Item "prisma\rcs-club-template.db" -Force -ErrorAction SilentlyContinue
$env:DATABASE_URL = "file:$(Get-Location)\prisma\rcs-club-template.db"
npx prisma db push --skip-generate --accept-data-loss
Copy-Item "prisma\rcs-club-template.db" "resources\rcs-club-template.db" -Force
Remove-Item "prisma\rcs-club-template.db" -Force
Write-Host "  ✅ قاعدة القالب جاهزة: resources\rcs-club-template.db" -ForegroundColor Green

# ─── الخطوة 3: بناء Next.js (Standalone) ───
Write-Host "`n🏗️ الخطوة 3: بناء Next.js (Standalone)..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ فشل بناء Next.js" -ForegroundColor Red
    Copy-Item "prisma\.schema.prisma.build-backup" "prisma\schema.prisma" -Force
    Remove-Item "prisma\.schema.prisma.build-backup" -Force
    Read-Host "اضغط Enter للخروج"; exit 1
}

# التحقق من standalone
if (-not (Test-Path ".next\standalone\server.js")) {
    Write-Host "❌ ملف standalone/server.js غير موجود!" -ForegroundColor Red
    Write-Host "   تأكد أن next.config.ts يحتوي على: output: 'standalone'" -ForegroundColor Yellow
    Copy-Item "prisma\.schema.prisma.build-backup" "prisma\schema.prisma" -Force
    Remove-Item "prisma\.schema.prisma.build-backup" -Force
    Read-Host "اضغط Enter للخروج"
    exit 1
}
Write-Host "  ✅ Standalone server.js موجود" -ForegroundColor Green

# ─── الخطوة 4: تجميع Electron TypeScript ───
Write-Host "`n⚡ الخطوة 4: تجميع ملفات Electron..." -ForegroundColor Yellow
npx tsc electron/main.ts --outDir electron --target es2020 --module commonjs --moduleResolution node --esModuleInterop --skipLibCheck --lib es2020
npx tsc electron/preload.ts --outDir electron --target es2020 --module commonjs --moduleResolution node --esModuleInterop --skipLibCheck --lib es2020
Write-Host "  ✅ تم التجميع" -ForegroundColor Green

# ─── الخطوة 5: بناء Setup.exe ───
Write-Host "`n🎯 الخطوة 5: بناء Setup.exe (قد يستغرق 5-10 دقائق)..." -ForegroundColor Yellow
npx electron-builder --win nsis
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️ فشل NSIS، محاولة dir فقط..." -ForegroundColor Yellow
    npx electron-builder --win --dir
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ فشل البناء" -ForegroundColor Red
        Copy-Item "prisma\.schema.prisma.build-backup" "prisma\schema.prisma" -Force
        Remove-Item "prisma\.schema.prisma.build-backup" -Force
        Read-Host "اضغط Enter للخروج"; exit 1
    }
}

# ─── استعادة مخطط PostgreSQL الأصلي + إعادة توليد العميل لنسخة الويب ───
if (Test-Path "prisma\.schema.prisma.build-backup") {
    Copy-Item "prisma\.schema.prisma.build-backup" "prisma\schema.prisma" -Force
    Remove-Item "prisma\.schema.prisma.build-backup" -Force
    Write-Host "  ↩️ تمت استعادة schema.prisma الأصلي (PostgreSQL)" -ForegroundColor Cyan
    npx prisma generate | Out-Null
}

# ─── الخطوة 6: عرض النتائج ───
Write-Host "`n══════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  🎉 تم البناء بنجاح!" -ForegroundColor Green
Write-Host "══════════════════════════════════════════════════════════" -ForegroundColor Green

# التحقق من الملفات الناتجة
$setupExe = "dist\RCS Club Setup v1.0.0.exe"
$portableExe = "dist\win-unpacked\RCS Club.exe"

if (Test-Path $setupExe) {
    $size = [math]::Round((Get-Item $setupExe).Length / 1MB, 2)
    Write-Host "`n  📦 Setup.exe: $setupExe ($size MB)" -ForegroundColor White
}
if (Test-Path $portableExe) {
    $size = [math]::Round((Get-Item $portableExe).Length / 1MB, 2)
    Write-Host "  📦 Portable:  $portableExe ($size MB)" -ForegroundColor White
}

Write-Host "`n  🔑 معلومات الدخول:" -ForegroundColor Yellow
Write-Host "     admin@rcs.dz / admin123" -ForegroundColor White
Write-Host "     super@rcs.dz / super123" -ForegroundColor White

Write-Host "`n  🖥️ وضع التشغيل:" -ForegroundColor Yellow
Write-Host "     1. يحاول تشغيل خادم محلي (Offline + SQLite)" -ForegroundColor White
Write-Host "     2. إذا فشل، يحمّل من السحابة (Online)" -ForegroundColor White

# فتح مجلد dist
Write-Host "`n📂 فتح مجلد النتائج..." -ForegroundColor Cyan
Invoke-Item dist

Write-Host "`n✅ اكتمل!" -ForegroundColor Green
Read-Host "`nاضغط Enter للخروج"
