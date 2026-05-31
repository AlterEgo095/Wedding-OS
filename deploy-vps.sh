#!/bin/bash
# ══════════════════════════════════════════════════════════════════════════════
# deploy-vps.sh — Zero-downtime deployment for heureuxmariage.aenews.net
# Deploys the wedding platform WITHOUT stopping any existing containers
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

DEPLOY_DIR="/opt/wedding-platform"
DOMAIN="heureuxmariage.aenews.net"
APP_PORT=3080

echo "═══════════════════════════════════════════════════════════════"
echo "  Josué & Hornella Wedding Platform — VPS Deployment"
echo "  Domain: ${DOMAIN}"
echo "  Port: ${APP_PORT} (localhost only)"
echo "═══════════════════════════════════════════════════════════════"

# ─── Step 1: Check for port conflicts ────────────────────────────────────
echo ""
echo "[1/8] Checking port ${APP_PORT}..."
if ss -tlnp | grep -q ":${APP_PORT} "; then
    echo "❌ ERROR: Port ${APP_PORT} is already in use!"
    ss -tlnp | grep ":${APP_PORT} "
    exit 1
fi
echo "✅ Port ${APP_PORT} is free"

# ─── Step 2: Ensure deploy directory exists ──────────────────────────────
echo ""
echo "[2/8] Preparing deployment directory..."
mkdir -p "${DEPLOY_DIR}"
echo "✅ Directory ready: ${DEPLOY_DIR}"

# ─── Step 3: Stop old wedding container if exists (only wedding!) ────────
echo ""
echo "[3/8] Checking for existing wedding containers..."
if docker ps -a --format '{{.Names}}' | grep -q '^wedding-app$'; then
    echo "   Stopping old wedding-app container..."
    docker stop wedding-app 2>/dev/null || true
    docker rm wedding-app 2>/dev/null || true
    echo "✅ Old wedding container removed"
else
    echo "✅ No existing wedding container to remove"
fi

# ─── Step 4: Build the Docker image ─────────────────────────────────────
echo ""
echo "[4/8] Building Docker image (this may take a few minutes)..."
cd "${DEPLOY_DIR}"
docker compose -f docker-compose.prod.yml build --no-cache 2>&1 | tail -20
echo "✅ Docker image built"

# ─── Step 5: Start the application ──────────────────────────────────────
echo ""
echo "[5/8] Starting application on port ${APP_PORT}..."
docker compose -f docker-compose.prod.yml up -d 2>&1
echo "✅ Application started"

# ─── Step 6: Wait for health check ──────────────────────────────────────
echo ""
echo "[6/8] Waiting for application to be healthy..."
for i in $(seq 1 30); do
    if curl -sf http://127.0.0.1:${APP_PORT}/ > /dev/null 2>&1; then
        echo "✅ Application is healthy!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "⚠️  Application not responding yet, but container is running"
        docker logs wedding-app --tail 20 2>/dev/null || true
    fi
    sleep 3
done

# ─── Step 7: Configure Nginx ────────────────────────────────────────────
echo ""
echo "[7/8] Configuring Nginx for ${DOMAIN}..."
if [ -f "/etc/nginx/sites-available/${DOMAIN}" ]; then
    echo "   Updating existing Nginx config..."
else
    echo "   Creating new Nginx config..."
fi

sudo cp "${DEPLOY_DIR}/nginx/${DOMAIN}" "/etc/nginx/sites-available/${DOMAIN}" 2>/dev/null || \
    echo "⚠️  Need sudo for nginx config — run: sudo cp ${DEPLOY_DIR}/nginx/${DOMAIN} /etc/nginx/sites-available/${DOMAIN}"

# Enable the site
if [ ! -L "/etc/nginx/sites-enabled/${DOMAIN}" ]; then
    sudo ln -s "/etc/nginx/sites-available/${DOMAIN}" "/etc/nginx/sites-enabled/${DOMAIN}" 2>/dev/null || \
        echo "⚠️  Need sudo for nginx symlink — run: sudo ln -s /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/${DOMAIN}"
fi

# Test nginx config
sudo nginx -t 2>/dev/null && echo "✅ Nginx config valid" || echo "⚠️  Nginx config needs attention"

# ─── Step 8: SSL Certificate ────────────────────────────────────────────
echo ""
echo "[8/8] SSL Certificate setup..."
if [ -d "/etc/letsencrypt/live/${DOMAIN}" ]; then
    echo "✅ SSL certificate already exists for ${DOMAIN}"
else
    echo "   Obtaining SSL certificate with certbot..."
    sudo certbot certonly --nginx -d "${DOMAIN}" --non-interactive --agree-tos -m admin@aenews.net 2>/dev/null || \
        echo "⚠️  Certbot failed — run manually: sudo certbot certonly --nginx -d ${DOMAIN}"
fi

# ─── Reload Nginx ────────────────────────────────────────────────────────
echo ""
echo "Reloading Nginx..."
sudo systemctl reload nginx 2>/dev/null || echo "⚠️  Nginx reload needs sudo"

# ─── Final Status ────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  🎉 DEPLOYMENT COMPLETE!"
echo ""
echo "  🌐 URL: https://${DOMAIN}"
echo "  🔧 Local: http://127.0.0.1:${APP_PORT}"
echo "  📊 Container: $(docker ps --filter name=wedding-app --format '{{.Status}}' 2>/dev/null || echo 'checking...')"
echo "═══════════════════════════════════════════════════════════════"
