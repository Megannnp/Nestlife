@echo off
rem ═══════════════════════════════════════════════════
rem  NestLife 一键安装（Windows）
rem  用法：双击运行本文件（或命令行执行 install.bat）
rem  自动完成：检查 Node → 装依赖 → 构建 → 生成密码 → 启动 → 打开浏览器
rem ═══════════════════════════════════════════════════
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d %~dp0

echo.
echo   [NestLife] Windows 一键安装（全程约 3~5 分钟）
echo   ==================================================
echo.

rem ── 1. 检查 Node.js ──────────────────────────────
where node >nul 2>nul
if errorlevel 1 (
  echo   [1/5] 未检测到 Node.js，正在用 winget 自动安装（Win10/11 自带）...
  winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements >nul 2>nul
  if errorlevel 1 (
    echo   [失败] 自动安装没成功。请打开 nodejs.org 下载 LTS 版安装，
    echo          装完后【关闭本窗口】，重新双击 install.bat 即可。
    pause
    exit /b 1
  )
  echo   [提示] Node.js 已安装。请【关闭本窗口】，重新双击 install.bat 继续。
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -v') do set NODEV=%%v
echo   [1/5] Node.js 版本：%NODEV%

rem ── 2. 安装依赖 ──────────────────────────────────
if not exist node_modules (
  echo   [2/5] 安装依赖（约 1~2 分钟）...
  call npm ci
) else (
  echo   [2/5] 依赖已存在，跳过
)

rem ── 3. 构建 ──────────────────────────────────────
echo   [3/5] 构建（约 1 分钟）...
call npm run build

rem ── 4. 生成 .env（自动密码）──────────────────────
if not exist .env (
  copy .env.example .env >nul
  for /f %%p in ('powershell -NoProfile -Command "[guid]::NewGuid().ToString('N').Substring(0,16)"') do set PW=%%p
  powershell -NoProfile -Command "(Get-Content .env) -replace '^# *NESTLIFE_AUTH=.*','NESTLIFE_AUTH=1' -replace '^# *NESTLIFE_ADMIN_PASSWORD=.*',('NESTLIFE_ADMIN_PASSWORD=!PW!') -replace '^NESTLIFE_ADMIN_PASSWORD=.*',('NESTLIFE_ADMIN_PASSWORD=!PW!') | Set-Content .env" >nul 2>nul
  echo !PW!> "%USERPROFILE%\.nestlife-password.txt"
  echo   [4/5] 已生成登录密码：!PW!  （保存在 %USERPROFILE%\.nestlife-password.txt）
) else (
  echo   [4/5] .env 已存在，跳过
)

rem ── 5. 启动 ──────────────────────────────────────
set PORT=3100
netstat -ano | findstr ":%PORT% " >nul 2>nul
if not errorlevel 1 (
  echo   [5/5] 端口 %PORT% 已在运行，跳过启动
) else (
  echo   [5/5] 启动中...
  start "NestLife" /min cmd /c "npm run start -- -p %PORT% > nestlife.log 2>&1"
  timeout /t 4 >nul 2>nul
)

rem ── 完成 ─────────────────────────────────────────
set IP=
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /c:"IPv4"') do (
  set IP=%%i
  goto :ipdone
)
:ipdone
set IP=!IP: =!
start http://localhost:%PORT%
echo.
echo   ==================================================
echo   [完成] 本机使用：  http://localhost:%PORT%
echo   手机访问：  http://!IP!:%PORT%
if defined PW (
  echo   登录密码：  !PW!  （本机免登录；手机访问需输入）
) else (
  echo   登录密码：  见 %USERPROFILE%\.nestlife-password.txt
)
echo   数据都在本机 data\ 目录；备份：系统 → 设置 → 数据管理
echo   ==================================================
echo.
pause
