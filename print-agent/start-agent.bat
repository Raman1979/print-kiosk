@echo off
title Print Kiosk Agent
cd /d "%~dp0"

:loop
echo ==========================================================
echo   PRINT KIOSK AGENT
echo   Keep this window open while the shop is open.
echo   Minimize it if you like - just don't close it (X).
echo ==========================================================
echo.

call npm start

echo.
echo ----------------------------------------------------------
echo The agent stopped. Restarting automatically in 5 seconds...
echo (To stop for good, close this window now.)
echo ----------------------------------------------------------
timeout /t 5 /nobreak >nul
goto loop
