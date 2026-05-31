# 🚀 Subir GooPro a https://live.sbalott.com
# Hosting compartido Hostinger → Railway (gratis, HTTPS automático)
# Tiempo estimado: 20-30 minutos

═══════════════════════════════════════════════════════════════
 PASO 1 — Crear cuenta en GitHub (si no tienes)
═══════════════════════════════════════════════════════════════

1. Ve a https://github.com
2. Clic en "Sign up"
3. Elige username, email y contraseña
4. Verifica el email

═══════════════════════════════════════════════════════════════
 PASO 2 — Subir GooPro a GitHub
═══════════════════════════════════════════════════════════════

1. En GitHub → clic en el "+" (arriba derecha) → "New repository"
2. Nombre: goopro
3. Privado o público (cualquiera funciona)
4. NO marques "Add README"
5. Clic en "Create repository"

Ahora sube los archivos:
6. En la página del repo → "uploading an existing file"
7. Arrastra TODA la carpeta "goopro" descomprimida
   (sube: package.json, server/, public/ y todo lo demás)
8. Escribe un mensaje: "GooPro inicial"
9. Clic en "Commit changes"

═══════════════════════════════════════════════════════════════
 PASO 3 — Deploy en Railway
═══════════════════════════════════════════════════════════════

1. Ve a https://railway.app
2. Clic en "Login" → "Login with GitHub"
3. Autoriza Railway a acceder a tu GitHub
4. En el dashboard → "New Project"
5. Selecciona "Deploy from GitHub repo"
6. Elige el repo "goopro" que creaste
7. Railway detecta Node.js automáticamente y despliega

Espera 2-3 minutos. Verás logs en vivo.

8. Cuando diga "Deployed" → ve a Settings del proyecto
9. Clic en "Generate Domain" → te da algo como:
   goopro-production.up.railway.app

✅ Ya funciona en esa URL provisional con HTTPS

═══════════════════════════════════════════════════════════════
 PASO 4 — Apuntar live.sbalott.com a Railway
═══════════════════════════════════════════════════════════════

En Railway:
1. Settings → Networking → "Custom Domain"
2. Escribe: live.sbalott.com
3. Railway te muestra un valor CNAME, algo así:
   goopro-production.up.railway.app
   (cópialo exactamente)

En Hostinger hPanel:
4. Ve a https://hpanel.hostinger.com
5. Dominios → sbalott.com → Administrar
6. Zona DNS (o "DNS / Servidores de nombres")
7. Clic en "Añadir registro"
8. Rellena así:
   ┌─────────┬────────┬──────────────────────────────────────┬──────┐
   │  Tipo   │ Nombre │              Valor/Destino            │ TTL  │
   ├─────────┼────────┼──────────────────────────────────────┼──────┤
   │  CNAME  │  live  │ goopro-production.up.railway.app     │ 3600 │
   └─────────┴────────┴──────────────────────────────────────┴──────┘
   (usa el valor exacto que te dio Railway)

9. Guardar
10. Esperar 5-30 minutos (propagación DNS)

En Railway:
11. Vuelve a Custom Domain → verifica que diga "Valid" ✅

═══════════════════════════════════════════════════════════════
 PASO 5 — HTTPS automático
═══════════════════════════════════════════════════════════════

Railway genera el certificado SSL solo.
No necesitas hacer nada más.

Después de que el DNS propague:
✅ https://live.sbalott.com → GooPro funcionando
✅ Cámara y micrófono funcionan (HTTPS habilitado)
✅ Compartir pantalla funciona
✅ Link de invitación: https://live.sbalott.com?room=clase-123&role=alumno

═══════════════════════════════════════════════════════════════
 LÍMITES DEL PLAN GRATUITO DE RAILWAY
═══════════════════════════════════════════════════════════════

Plan Hobby (gratis): $5 créditos/mes
- Suficiente para ~500 horas de uso / mes
- Si usas GooPro pocas horas al día, es GRATIS
- Plan de pago: $20/mes para uso ilimitado

═══════════════════════════════════════════════════════════════
 PROBLEMAS FRECUENTES
═══════════════════════════════════════════════════════════════

❌ Railway dice "Build failed"
→ Verifica que subiste package.json a la raíz del repo

❌ DNS no propaga
→ Espera hasta 24h. Verifica en https://dnschecker.org
   Busca: live.sbalott.com → tipo CNAME

❌ Cámara no funciona
→ Debe ser HTTPS (https://live.sbalott.com)
   En HTTP la cámara está bloqueada por el navegador

❌ Railway muestra "Application failed to respond"
→ En Railway → Settings → verifica que el puerto sea 3000
   O añade variable de entorno: PORT = 3000

═══════════════════════════════════════════════════════════════
 RESUMEN VISUAL
═══════════════════════════════════════════════════════════════

GitHub (código) → Railway (servidor Node.js + HTTPS)
                       ↑
Hostinger DNS:   live.sbalott.com → railway.app

═══════════════════════════════════════════════════════════════
 Sbalott Ecosystem © 2026
═══════════════════════════════════════════════════════════════
