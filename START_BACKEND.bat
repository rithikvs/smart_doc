@echo off
chcp 65001 >nul
title Document Chatbot Backend Server
cd /d "%~dp0ai-document-chatbot-main"
call START_BACKEND.bat
