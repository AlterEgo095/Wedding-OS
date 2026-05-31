#!/bin/bash
# ══════════════════════════════════════════════════════════════
# deploy.sh — Production Deployment Script
# Josué & Hornella Wedding Platform
# ══════════════════════════════════════════════════════════════
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh              # Full deployment
#   ./deploy.sh --update     # Update without downtime
#   ./deploy.sh --ssl        # Setup SSL with Let's Encrypt
#   ./deploy.sh --backup     # Backup database
#   ./deploy.sh --restore    # Restore database from backup
#

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[DEPLOY]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ─── Configuration ───
APP_NAME="wedding-platform"
COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env"
BACKUP_DIR="./backups"
DOMAIN=${DOMAIN:-""}

# ─── Pre-flight Checks ───
preflight() {
    log "Running pre-flight checks..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed. Please install Docker first."
    fi
    success "Docker found"

    # Check Docker Compose
    if ! docker compose version &> /dev/null && ! docker-compose version &> /dev/null; then
        error "Docker Compose is not installed."
    fi
    success "Docker Compose found"

    # Check .env file
    if [ ! -f "$ENV_FILE" ]; then
        warn "No .env file found. Creating from template..."
        cp .env.production .env
        error "Please edit .env with your production values before deploying."
    fi
    success ".env file found"

    # Check JWT_SECRET
    if grep -q "CHANGE_ME" "$ENV_FILE" 2>/dev/null; then
        error "JWT_SECRET still has placeholder value. Generate one with: openssl rand -base64 48"
    fi
    success "JWT_SECRET is configured"

    # Check NEXT_PUBLIC_BASE_URL
    if grep -q "your-domain.com" "$ENV_FILE" 2>/dev/null; then
        warn "NEXT_PUBLIC_BASE_URL still has placeholder. Update it with your actual domain."
    fi

    log "Pre-flight checks passed!"
}

# ─── Full Deployment ───
deploy() {
    log "Starting full deployment..."

    preflight

    # Stop existing containers
    log "Stopping existing containers..."
    docker compose -f $COMPOSE_FILE down 2>/dev/null || true

    # Build images
    log "Building Docker images..."
    docker compose -f $COMPOSE_FILE build --no-cache

    # Start containers
    log "Starting containers..."
    docker compose -f $COMPOSE_FILE up -d

    # Wait for health check
    log "Waiting for application to start..."
    sleep 10

    # Verify
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ | grep -q "200"; then
        success "Application is running!"
    else
        warn "Application may still be starting. Check with: docker compose logs -f"
    fi

    success "Deployment complete!"
    echo ""
    log "Your wedding platform is now available at: $(grep NEXT_PUBLIC_BASE_URL $ENV_FILE | cut -d= -f2)"
}

# ─── Zero-downtime Update ───
update() {
    log "Starting zero-downtime update..."

    # Build new image
    log "Building new image..."
    docker compose -f $COMPOSE_FILE build

    # Rolling restart
    log "Restarting application..."
    docker compose -f $COMPOSE_FILE up -d --no-deps --build app

    # Wait for health check
    log "Waiting for application to start..."
    sleep 10

    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ | grep -q "200"; then
        success "Update complete! Application is running."
    else
        error "Update failed. Check logs: docker compose logs -f"
    fi
}

# ─── Database Backup ───
backup() {
    log "Creating database backup..."
    mkdir -p $BACKUP_DIR

    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_FILE="$BACKUP_DIR/wedding-db-$TIMESTAMP.db"

    # Copy from container
    docker compose -f $COMPOSE_FILE cp app:/app/db/custom.db "$BACKUP_FILE" 2>/dev/null || {
        # Fallback: copy from local volume
        cp ./db/custom.db "$BACKUP_FILE" 2>/dev/null || error "Could not backup database"
    }

    success "Database backed up to: $BACKUP_FILE"
}

# ─── Database Restore ───
restore() {
    LATEST_BACKUP=$(ls -t $BACKUP_DIR/wedding-db-*.db 2>/dev/null | head -1)

    if [ -z "$LATEST_BACKUP" ]; then
        error "No backup found in $BACKUP_DIR"
    fi

    log "Restoring database from: $LATEST_BACKUP"
    warn "This will replace the current database!"

    read -p "Are you sure? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        log "Restore cancelled."
        exit 0
    fi

    # Stop the app
    docker compose -f $COMPOSE_FILE stop app

    # Restore
    docker compose -f $COMPOSE_FILE cp "$LATEST_BACKUP" app:/app/db/custom.db 2>/dev/null || {
        cp "$LATEST_BACKUP" ./db/custom.db 2>/dev/null || error "Could not restore database"
    }

    # Restart
    docker compose -f $COMPOSE_FILE start app

    success "Database restored!"
}

# ─── SSL Setup ───
setup_ssl() {
    if [ -z "$DOMAIN" ]; then
        error "Please set DOMAIN variable: DOMAIN=your-domain.com ./deploy.sh --ssl"
    fi

    log "Setting up SSL for $DOMAIN..."

    # Install certbot
    if ! command -v certbot &> /dev/null; then
        log "Installing Certbot..."
        apt-get update && apt-get install -y certbot python3-certbot-nginx
    fi

    # Get certificate
    mkdir -p /var/www/certbot
    certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" --email "admin@$DOMAIN" --agree-tos --non-interactive

    # Update nginx config with SSL
    sed -i "s/# ssl_certificate/ssl_certificate/" nginx/nginx.conf
    sed -i "s|# ssl_certificate_key /etc/nginx/ssl/privkey.pem;|ssl_certificate_key /etc/nginx/ssl/privkey.pem;|" nginx/nginx.conf

    # Copy certificates
    cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" nginx/ssl/
    cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" nginx/ssl/

    # Reload nginx
    docker compose -f $COMPOSE_FILE restart nginx

    success "SSL configured for $DOMAIN!"
    log "Setting up auto-renewal cron job..."
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && cp /etc/letsencrypt/live/$DOMAIN/*.pem nginx/ssl/ && docker compose -f $COMPOSE_FILE restart nginx") | crontab -
    success "SSL auto-renewal configured!"
}

# ─── Show Logs ───
logs() {
    docker compose -f $COMPOSE_FILE logs -f --tail=100
}

# ─── Status ───
status() {
    docker compose -f $COMPOSE_FILE ps
    echo ""
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ | grep -q "200"; then
        success "Application is healthy (HTTP 200)"
    else
        warn "Application may be down"
    fi
}

# ─── Main ───
case "${1:-}" in
    --update)
        update
        ;;
    --ssl)
        setup_ssl
        ;;
    --backup)
        backup
        ;;
    --restore)
        restore
        ;;
    --logs)
        logs
        ;;
    --status)
        status
        ;;
    --help)
        echo "Usage: $0 [--update|--ssl|--backup|--restore|--logs|--status|--help]"
        echo ""
        echo "Commands:"
        echo "  (none)     Full deployment"
        echo "  --update   Zero-downtime update"
        echo "  --ssl      Setup SSL with Let's Encrypt"
        echo "  --backup   Backup database"
        echo "  --restore  Restore database from latest backup"
        echo "  --logs     Show application logs"
        echo "  --status   Show container status"
        ;;
    *)
        deploy
        ;;
esac
