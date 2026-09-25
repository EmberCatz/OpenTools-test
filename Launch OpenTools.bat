@echo off
cd /d "%~dp0"

echo Starting OpenTools server (backend) in a separate window...
start "OpenTools Server" cmd /k "cd server && npm start"

echo Waiting for the server to come up...
timeout /t 4 /nobreak >nul

echo Starting OpenTools app...
cd app
call npm run tauri dev

pause
