@echo off
chcp 65001 >nul
title نادي RCS — Build Setup.exe
color 0B

echo.
echo  ╔═══════════════════════════════════════════════════════╗
echo  ║                                                       ║
echo  ║     بناء Setup.exe — نادي RCS                         ║
echo  ║     Build Windows Installer                           ║
echo  ║                                                       ║
echo  ╚═══════════════════════════════════════════════════════╝
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  ❌ Node.js غير مثبت
    echo  ثبّت Node.js من: https://nodejs.org
    pause
    exit /b 1
)

:: Check npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo  ❌ npm غير مثبت
    pause
    exit /b 1
)

echo  ✅ Node.js متوفر
echo  ✅ npm متوفر
echo.

:: Install dependencies if needed
if not exist "node_modules" (
    echo  📦 تثبيت الحزم...
    call npm install
)

:: التبديل إلى مخطط SQLite (Desktop = قاعدة بيانات محلية أوفلاين)
:: مهم: بدون هذا، Prisma Client يُولَّد لـ PostgreSQL والتطبيق يفشل بدون إنترنت
echo  🔧 تجهيز مخطط SQLite (Offline) + توليد Prisma client...
call node scripts/sync-sqlite-schema.js
copy /Y "prisma\schema.prisma" "prisma\.schema.prisma.build-backup" >nul
copy /Y "prisma\schema.sqlite.prisma" "prisma\schema.prisma" >nul 2>nul
call npx prisma generate

:: إنشاء قاعدة بيانات SQLite "قالب" (كل الجداول، بدون بيانات)
:: هذا الملف يُنسخ لمجلد بيانات المستخدم عند أول تشغيل بدل ملف فارغ بلا جداول
echo  🗄️  إنشاء قاعدة بيانات SQLite القالب...
if not exist "resources" mkdir resources
del "prisma\rcs-club-template.db" 2>nul
set DATABASE_URL=file:%cd%\prisma\rcs-club-template.db
call npx prisma db push --skip-generate --accept-data-loss
copy /Y "prisma\rcs-club-template.db" "resources\rcs-club-template.db" >nul
del "prisma\rcs-club-template.db" >nul
echo  ✅ قاعدة القالب جاهزة: resources\rcs-club-template.db

:: Build Next.js
echo  🏗️  بناء Next.js...
call npm run build
if %errorlevel% neq 0 (
    echo  ❌ فشل بناء Next.js
    copy /Y "prisma\.schema.prisma.build-backup" "prisma\schema.prisma" >nul
    del "prisma\.schema.prisma.build-backup" >nul
    pause
    exit /b 1
)

:: Compile Electron TypeScript files
echo  ⚡ تجميع ملفات Electron...
call npx tsc electron/main.ts --outDir electron --target es2020 --module commonjs --moduleResolution node --esModuleInterop --skipLibCheck --lib es2020
call npx tsc electron/preload.ts --outDir electron --target es2020 --module commonjs --moduleResolution node --esModuleInterop --skipLibCheck --lib es2020

:: Build Windows installer with electron-builder
echo  📦 بناء Setup.exe...
call npx electron-builder --win nsis
if %errorlevel% neq 0 (
    echo  ❌ فشل بناء electron-builder
    echo  جرّب: npx electron-builder --win portable
    copy /Y "prisma\.schema.prisma.build-backup" "prisma\schema.prisma" >nul
    del "prisma\.schema.prisma.build-backup" >nul
    pause
    exit /b 1
)

:: استعادة مخطط PostgreSQL الأصلي + إعادة توليد العميل لنسخة الويب
if exist "prisma\.schema.prisma.build-backup" (
    copy /Y "prisma\.schema.prisma.build-backup" "prisma\schema.prisma" >nul
    del "prisma\.schema.prisma.build-backup" >nul
    echo  ↩️  تمت استعادة schema.prisma الأصلي ^(PostgreSQL^)
    call npx prisma generate >nul
)

echo.
echo  ╔═══════════════════════════════════════════════════════╗
echo  ║                                                       ║
echo  ║          ✅  تم البناء بنجاح!  ✅                      ║
echo  ║                                                       ║
echo  ║  📁 الملفات الناتجة في: dist\                         ║
echo  ║                                                       ║
echo  ║  Setup.exe:                                           ║
echo  ║     dist\RCS Club Setup 1.0.0.exe                     ║
echo  ║                                                       ║
echo  ║  Portable:                                            ║
echo  ║     dist\win-unpacked\RCS Club.exe                    ║
echo  ║                                                       ║
echo  ╚═══════════════════════════════════════════════════════╝
echo.

:: Open dist folder
explorer dist

pause
