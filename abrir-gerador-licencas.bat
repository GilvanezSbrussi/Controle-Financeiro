@echo off
cd /d "%~dp0license-admin"
start "" "http://127.0.0.1:8789"
node server.js
