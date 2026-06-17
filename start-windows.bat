@echo off
title Payment Tracker - keep this window open / 이 창을 닫지 마세요
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed yet, so the app cannot start.
  echo  Please install Node.js from https://nodejs.org first.
  echo  See README-windows.md for step-by-step instructions.
  echo.
  pause
  exit /b 1
)

echo.
echo  Starting the Payment Tracker...
echo  Your web browser will open in a moment.
echo.
echo  Keep this black window open while using the app.
echo  You can minimize it. Close it when you are done for the day.
echo.

node server.mjs
pause
