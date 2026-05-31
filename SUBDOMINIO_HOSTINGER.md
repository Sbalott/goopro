# 🌐 Publicar GooPro en tu subdominio de Hostinger

## Tu objetivo: clase.tusitio.com (o cualquier subdominio)

---

## OPCIÓN A — VPS de Hostinger (recomendado para WebRTC)

WebRTC **requiere HTTPS** en internet. Con VPS tienes control total.

### Paso 1 — Crear subdominio en Hostinger
1. Panel Hostinger → **Dominios** → tu dominio → **Subdominios**
2. Crear: `clase.tusitio.com` (o `meet`, `goopro`, etc.)
3. Apunta el subdominio a la **IP de tu VPS**
   - Tipo: A Record
   - Nombre: clase
   - Valor: [IP de tu VPS]
   - TTL: 300

### Paso 2 — Subir GooPro al VPS

```bash
# Desde tu PC, copia el proyecto al VPS
scp -r goopro/ root@[IP-VPS]:/var/www/goopro

# Conectarte al VPS
ssh root@[IP-VPS]

# Instalar Node.js en el VPS (si no está)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Instalar dependencias
cd /var/www/goopro
npm install

# Probar que funciona
node server/index.js
# Ctrl+C para detener
```

### Paso 3 — Instalar Nginx (reverse proxy)

```bash
apt install nginx -y
```

Crear configuración:
```bash
nano /etc/nginx/sites-available/goopro
```

Pegar esto (reemplaza `clase.tusitio.com`):
```nginx
server {
    listen 80;
    server_name clase.tusitio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Activar:
```bash
ln -s /etc/nginx/sites-available/goopro /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### Paso 4 — HTTPS gratis con Let's Encrypt

```bash
apt install certbot python3-certbot-nginx -y
certbot --nginx -d clase.tusitio.com
# Sigue las instrucciones, elige redirigir HTTP→HTTPS
```

✅ GooPro ya funciona en `https://clase.tusitio.com`

### Paso 5 — Mantenerlo corriendo siempre (PM2)

```bash
npm install -g pm2
cd /var/www/goopro
pm2 start server/index.js --name goopro
pm2 save
pm2 startup   # Copia y ejecuta el comando que te muestre
```

Comandos útiles:
```bash
pm2 status          # Ver estado
pm2 logs goopro     # Ver logs en vivo
pm2 restart goopro  # Reiniciar
pm2 stop goopro     # Detener
```

---

## OPCIÓN B — Railway (gratis, sin VPS, más fácil)

Railway da HTTPS automático y URL pública gratis.

1. Crea cuenta en https://railway.app
2. **New Project** → **Deploy from GitHub repo**
3. Sube el código a GitHub primero:
   ```bash
   git init
   git add .
   git commit -m "GooPro initial"
   # Crea repo en github.com y conecta
   git remote add origin https://github.com/TU_USUARIO/goopro.git
   git push -u origin main
   ```
4. En Railway conecta el repo → deploy automático
5. **Settings** → **Domains** → añade dominio personalizado
   - En Hostinger DNS: CNAME `clase` → tu-app.railway.app

---

## OPCIÓN C — Render.com (gratis)

1. https://render.com → New Web Service
2. Conecta GitHub con el repo de GooPro
3. Build Command: `npm install`
4. Start Command: `node server/index.js`
5. En Render → Settings → Custom Domain → `clase.tusitio.com`
6. En Hostinger DNS: CNAME → tu-app.onrender.com

---

## ⚠️ IMPORTANTE: WebRTC necesita HTTPS

- **localhost:3000** → funciona SIN https (para pruebas locales)
- **Internet** → NECESITA https:// obligatorio para cámara/micrófono
- Todas las opciones anteriores incluyen HTTPS automático

---

## DNS en Hostinger — referencia rápida

| Tipo  | Nombre | Valor                    | Para                    |
|-------|--------|--------------------------|-------------------------|
| A     | clase  | [IP de tu VPS]           | Opción A (VPS)          |
| CNAME | clase  | tu-app.railway.app       | Opción B (Railway)      |
| CNAME | clase  | tu-app.onrender.com      | Opción C (Render)       |

---

## Variables de entorno

En producción puedes cambiar el puerto:
```bash
PORT=3000 node server/index.js
# O con PM2:
PORT=3000 pm2 start server/index.js --name goopro
```

---

Sbalott Ecosystem © 2026
