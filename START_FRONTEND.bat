@echo off
chcp 65001 >nul
title Document Chatbot Frontend
cd /d "%~dp0ai-document-chatbot-main"
call START_FRONTEND.bat
