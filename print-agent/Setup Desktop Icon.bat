@echo off
title Print Agent - Setup
cd /d "%~dp0"

echo Setting up your desktop shortcut and icon...
echo.

powershell -ExecutionPolicy Bypass -NoProfile -File "create-shortcuts.ps1"
