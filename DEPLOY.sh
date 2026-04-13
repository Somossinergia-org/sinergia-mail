#!/bin/bash
# ==========================================
# SINERGIA MAIL — Script de despliegue
# Ejecuta esto desde la carpeta del proyecto
# ==========================================

echo ""
echo "==================================="
echo "  SINERGIA MAIL — Despliegue"
echo "==================================="
echo ""

# 1. Instalar dependencias
echo "[1/4] Instalando dependencias..."
npm install

# 2. Login en Vercel (abre navegador)
echo ""
echo "[2/4] Conectando con Vercel..."
echo "Se abrira tu navegador para iniciar sesion."
npx vercel login

# 3. Desplegar
echo ""
echo "[3/4] Desplegando en Vercel..."
echo "Responde a las preguntas:"
echo "  - Set up and deploy? → Y"
echo "  - Which scope? → somossinergia-org"
echo "  - Link to existing project? → N"
echo "  - Project name? → sinergia-mail"
echo "  - Directory? → ./"
echo ""
npx vercel --prod

echo ""
echo "[4/4] Desplegado!"
echo ""
echo "==================================="
echo "  IMPORTANTE: Configura las variables"
echo "  de entorno en vercel.com/dashboard"
echo "==================================="
echo ""
echo "Ve a: vercel.com → sinergia-mail → Settings → Environment Variables"
echo "Y anade estas variables (sin las comillas):"
echo ""
echo "  GOOGLE_CLIENT_ID = (tu client id)"
echo "  GOOGLE_CLIENT_SECRET = (tu client secret)"
echo "  NEXTAUTH_SECRET = (genera uno con: openssl rand -base64 32)"
echo "  NEXTAUTH_URL = https://sinergia-mail.vercel.app"
echo "  ANTHROPIC_API_KEY = (tu api key sk-ant-...)"
echo "  CRON_SECRET = (genera uno con: openssl rand -base64 32)"
echo ""
echo "Despues redeploy: npx vercel --prod"
echo ""
