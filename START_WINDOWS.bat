@echo off
cd /d "%~dp0"
if exist .env (
  node --env-file=.env bot.js
) else (
  echo Create .env from .env.example and set BOT_TOKEN first.
  pause
)
