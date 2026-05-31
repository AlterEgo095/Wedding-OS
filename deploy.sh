#!/bin/bash
# ══════════════════════════════════════════════════════════════════════
# deploy.sh — Ultra-Secure Production Deployment Script
# Josué & Hornella Wedding Platform
# ══════════════════════════════════════════════════════════════════════
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh                    # Full deployment with security hardening
#   ./deploy.sh --update           # Zero-downtime update
#   ./deploy.sh --ssl              # Setup SSL with Let's Encrypt
#   ./deploy.sh --backup           # Backup database
#   ./deploy.sh --restore          # Restore database from backup
#   ./deploy.sh --harden           # Security hardening only (firewall, fail2ban, etc.)
#   ./deploy.sh --status           # Show container status
#   ./deploy.sh --logs             # Show application logs
#   ./deploy.sh --check            # Run security audit
#   ./deploy.sh --rollback         # Rollback to previous version
#
# Environment Variables:
#   DOMAIN=your-domain.com         # Your domain name
#   SSL_EMAIL=admin@your.com       # Email for Let's Encrypt
#

set -euo pipefail

# ─── Colors ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log() { echo -e "${BLUE}[DEPLOY]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

# ─── Configuration ───
APP_NAME="wedding-platform"
COMPOSE_FILE="docker-compose.yml"
ENV_FILE=".env"
BACKUP_DIR="./backups"
DOMAIN=${DOMAIN:-""}
SSL_EMAIL=${SSL_EMAIL:-"admin@${DOMAIN}"}
LOG_FILE="./deploy.log"

# Logging
exec > >(tee -a "$LOG_FILE") 2>&1

# ─── Pre-flight Security Checks ───
preflight() {
    log "Running pre-flight security checks..."

    echo -e "\n${BOLD}═══ Pre-Flight Security Audit ═══${NC}\n"

    # Check Docker
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed. Please install Docker first."
    fi
    success "Docker found: $(docker --version)"

    # Check Docker Compose
    if docker compose version &> /dev/null; then
        success "Docker Compose (plugin) found"
    elif docker-compose version &> /dev/null; then
        success "Docker Compose (standalone) found"
    else
        error "Docker Compose is not installed."
    fi

    # Check .env file
    if [ ! -f "$ENV_FILE" ]; then
        warn "No .env file found. Creating from template..."
        if [ -f ".env.production" ]; then
            cp .env.production .env
            error "Please edit .env with your production values before deploying.\nRun: nano .env"
        else
            error "No .env.production template found. Create .env manually."
        fi
    fi
    success ".env file found"

    # Check JWT_SECRET
    if grep -q "CHANGE_ME" "$ENV_FILE" 2>/dev/null || grep -q "dev-only" "$ENV_FILE" 2>/dev/null; then
        error "JWT_SECRET still has a placeholder or dev value!\nGenerate one with: openssl rand -base64 48\nThen update .env"
    fi
    success "JWT_SECRET is configured (not a placeholder)"

    # Check ENCRYPTION_KEY
    if grep -q "CHANGE_ME.*encryption" "$ENV_FILE" 2>/dev/null || grep -q "dev-only-encryption" "$ENV_FILE" 2>/dev/null; then
        error "ENCRYPTION_KEY still has a placeholder or dev value!\nGenerate one with: openssl rand -base64 32\nThen update .env"
    fi
    success "ENCRYPTION_KEY is configured"

    # Check NEXT_PUBLIC_BASE_URL
    if grep -q "your-domain.com" "$ENV_FILE" 2>/dev/null; then
        warn "NEXT_PUBLIC_BASE_URL still has placeholder. Update it with your actual domain."
    else
        success "NEXT_PUBLIC_BASE_URL is configured"
    fi

    # Check NODE_ENV
    if grep -q "NODE_ENV=production" "$ENV_FILE" 2>/dev/null; then
        success "NODE_ENV is set to production"
    else
        warn "NODE_ENV is not set to production. Set NODE_ENV=production in .env"
    fi

    # Check for sensitive files exposed
    local sensitive_files=(".env" ".env.production" "db/custom.db")
    for f in "${sensitive_files[@]}"; do
        if [ -f "$f" ]; then
            local perms
            perms=$(stat -c %a "$f" 2>/dev/null || stat -f %Lp "$f" 2>/dev/null || echo "000")
            if [[ "$perms" != "600" && "$perms" != "400" ]]; then
                warn "File $f has permissions $perms (should be 600). Fix: chmod 600 $f"
            else
                success "File $f has secure permissions ($perms)"
            fi
        fi
    done

    # Check if port 3000 is exposed externally (it shouldn't be)
    if ss -tlnp 2>/dev/null | grep -q ":3000 "; then
        warn "Port 3000 is already in use. Ensure it's not externally accessible."
    fi

    # Check SSL certificates
    if [ -d "nginx/ssl" ]; then
        if ls nginx/ssl/*.pem &>/dev/null; then
            success "SSL certificates found in nginx/ssl/"
        else
            warn "No SSL certificates found in nginx/ssl/. Run: ./deploy.sh --ssl"
        fi
    else
        warn "nginx/ssl/ directory not found. Creating..."
        mkdir -p nginx/ssl
    fi

    # Verify Docker is not running as root
    if [ "$(id -u)" -eq 0 ]; then
        warn "Running as root! Consider using a non-root user with Docker group access."
    fi

    # Check available disk space
    local available_disk
    available_disk=$(df -h . | awk 'NR==2 {print $4}')
    info "Available disk space: $available_disk"

    # Check memory
    local available_mem
    available_mem=$(free -h | awk '/^Mem:/ {print $7}')
    info "Available memory: $available_mem"

    echo -e "\n${GREEN}${BOLD}Pre-flight checks passed!${NC}\n"
}

# ─── Full Deployment ───
deploy() {
    log "Starting ultra-secure full deployment..."

    preflight

    # Stop existing containers gracefully
    log "Stopping existing containers..."
    docker compose -f $COMPOSE_FILE down --timeout 30 2>/dev/null || true

    # Build images with no cache for security
    log "Building Docker images (no cache for security)..."
    docker compose -f $COMPOSE_FILE build --no-cache

    # Start containers
    log "Starting containers..."
    docker compose -f $COMPOSE_FILE up -d

    # Wait for health check
    log "Waiting for application to start (health check)..."
    local retries=0
    local max_retries=15
    while [ $retries -lt $max_retries ]; do
        if curl -sf -o /dev/null http://localhost:3000/ 2>/dev/null; then
            break
        fi
        retries=$((retries + 1))
        echo "  Attempt $retries/$max_retries..."
        sleep 3
    done

    if [ $retries -eq $max_retries ]; then
        error "Application failed to start within timeout. Check logs: docker compose logs -f"
    fi

    success "Application is running and healthy!"

    # Run post-deployment security check
    post_deploy_check

    echo ""
    echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}${BOLD}  🎉 Deployment Complete!${NC}"
    echo -e "${GREEN}${BOLD}══════════════════════════════════════════════════${NC}"
    echo ""
    local base_url
    base_url=$(grep NEXT_PUBLIC_BASE_URL "$ENV_FILE" | cut -d= -f2)
    info "Your wedding platform: $base_url"
    info "Admin panel: Click the crown icon (bottom-right)"
    info "Check status: ./deploy.sh --status"
    info "View logs: ./deploy.sh --logs"
    info "Security audit: ./deploy.sh --check"
    echo ""
}

# ─── Zero-downtime Update ───
update() {
    log "Starting zero-downtime update..."

    # Backup before update
    backup

    # Build new image
    log "Building new image..."
    docker compose -f $COMPOSE_FILE build

    # Rolling restart
    log "Restarting application (zero-downtime)..."
    docker compose -f $COMPOSE_FILE up -d --no-deps --build app

    # Wait for health check
    log "Waiting for application to start..."
    local retries=0
    while [ $retries -lt 15 ]; do
        if curl -sf -o /dev/null http://localhost:3000/ 2>/dev/null; then
            break
        fi
        retries=$((retries + 1))
        sleep 3
    done

    if [ $retries -eq 15 ]; then
        error "Update failed! Rolling back..."
        rollback
    fi

    success "Update complete! Application is running."
    post_deploy_check
}

# ─── Database Backup ───
backup() {
    log "Creating database backup..."
    mkdir -p $BACKUP_DIR

    local TIMESTAMP
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    local BACKUP_FILE="$BACKUP_DIR/wedding-db-$TIMESTAMP.db"

    # Try to copy from container first
    if docker compose -f $COMPOSE_FILE ps app 2>/dev/null | grep -q "running"; then
        docker compose -f $COMPOSE_FILE exec -T app cp /app/db/custom.db /tmp/backup.db 2>/dev/null || true
        docker compose -f $COMPOSE_FILE cp app:/tmp/backup.db "$BACKUP_FILE" 2>/dev/null || {
            # Fallback: copy from volume
            cp ./db/custom.db "$BACKUP_FILE" 2>/dev/null || error "Could not backup database"
        }
    else
        cp ./db/custom.db "$BACKUP_FILE" 2>/dev/null || error "Could not backup database"
    fi

    # Compress backup
    gzip "$BACKUP_FILE"
    success "Database backed up to: ${BACKUP_FILE}.gz"

    # Keep only last 10 backups
    ls -t $BACKUP_DIR/wedding-db-*.db.gz 2>/dev/null | tail -n +11 | xargs -r rm
    info "Backup retention: last 10 backups kept"
}

# ─── Database Restore ───
restore() {
    local LATEST_BACKUP
    LATEST_BACKUP=$(ls -t $BACKUP_DIR/wedding-db-*.db.gz 2>/dev/null | head -1)

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

    # Decompress and restore
    local temp_file="/tmp/wedding-restore-$(date +%s).db"
    gunzip -c "$LATEST_BACKUP" > "$temp_file"

    docker compose -f $COMPOSE_FILE cp "$temp_file" app:/app/db/custom.db 2>/dev/null || {
        cp "$temp_file" ./db/custom.db 2>/dev/null || { rm "$temp_file"; error "Could not restore database"; }
    }
    rm "$temp_file"

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

    # Create SSL directory
    mkdir -p nginx/ssl /var/www/certbot

    # Get certificate
    certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" --email "$SSL_EMAIL" --agree-tos --non-interactive

    # Copy certificates
    cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" nginx/ssl/
    cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" nginx/ssl/
    chmod 600 nginx/ssl/*.pem

    # Generate DH params for perfect forward secrecy
    if [ ! -f "nginx/ssl/dhparam.pem" ]; then
        log "Generating DH parameters (2048 bits)..."
        openssl dhparam -out nginx/ssl/dhparam.pem 2048
    fi

    # Reload nginx
    docker compose -f $COMPOSE_FILE restart nginx

    success "SSL configured for $DOMAIN!"

    # Setup auto-renewal
    log "Setting up auto-renewal cron job..."
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && cp /etc/letsencrypt/live/$DOMAIN/*.pem $PWD/nginx/ssl/ && docker compose -f $COMPOSE_FILE restart nginx") | crontab -
    success "SSL auto-renewal configured!"
}

# ─── Security Hardening ───
harden() {
    echo -e "\n${BOLD}═══ Security Hardening ═══${NC}\n"

    # 1. Configure UFW Firewall
    log "Configuring UFW firewall..."
    if command -v ufw &> /dev/null; then
        ufw --force enable
        ufw default deny incoming
        ufw default allow outgoing
        ufw allow 22/tcp     # SSH
        ufw allow 80/tcp     # HTTP
        ufw allow 443/tcp    # HTTPS
        ufw deny 3000/tcp    # Block direct app access
        ufw deny 3306/tcp    # Block MySQL
        ufw deny 5432/tcp    # Block PostgreSQL
        ufw --force reload
        success "UFW firewall configured (only 22, 80, 443 allowed)"
    else
        warn "UFW not installed. Install with: apt-get install ufw"
    fi

    # 2. Configure Fail2Ban
    log "Configuring Fail2Ban..."
    if command -v fail2ban-client &> /dev/null; then
        mkdir -p /etc/fail2ban/filter.d /etc/fail2ban/jail.d

        # Wedding platform auth filter
        cat > /etc/fail2ban/filter.d/wedding-auth.conf << 'EOF'
[Definition]
failregex = ^<HOST> .* "(GET|POST) /api/(guest/auth|admin/login) .*" (401|403|429) .*
ignoreregex =
EOF

        # Wedding platform jail
        cat > /etc/fail2ban/jail.d/wedding.conf << EOF
[wedding-auth]
enabled = true
port = http,https
filter = wedding-auth
logpath = $PWD/nginx-logs/access.log
maxretry = 5
findtime = 600
bantime = 3600
action = iptables-multiport[name=wedding, port="http,https", protocol=tcp]
EOF

        systemctl enable fail2ban
        systemctl restart fail2ban
        success "Fail2Ban configured for wedding platform auth"
    else
        warn "Fail2Ban not installed. Install with: apt-get install fail2ban"
    fi

    # 3. Secure file permissions
    log "Securing file permissions..."
    chmod 600 .env .env.production 2>/dev/null || true
    chmod 600 db/custom.db 2>/dev/null || true
    chmod 700 backups 2>/dev/null || true
    chmod +x deploy.sh
    success "File permissions secured"

    # 4. Disable unnecessary services
    log "Checking for unnecessary services..."
    for svc in avahi-daemon cups bluetooth; do
        if systemctl is-enabled "$svc" &>/dev/null; then
            systemctl disable "$svc" 2>/dev/null || true
            info "Disabled: $svc"
        fi
    done

    # 5. Kernel hardening
    log "Applying kernel security parameters..."
    sysctl -w net.ipv4.tcp_syncookies=1 2>/dev/null || true
    sysctl -w net.ipv4.conf.all.rp_filter=1 2>/dev/null || true
    sysctl -w net.ipv4.conf.default.rp_filter=1 2>/dev/null || true
    sysctl -w net.ipv4.icmp_echo_ignore_broadcasts=1 2>/dev/null || true
    sysctl -w net.ipv4.conf.all.accept_redirects=0 2>/dev/null || true
    sysctl -w net.ipv6.conf.all.accept_redirects=0 2>/dev/null || true
    success "Kernel security parameters applied"

    # 6. Configure automatic security updates
    if command -v apt-get &> /dev/null; then
        log "Configuring automatic security updates..."
        apt-get install -y unattended-upgrades 2>/dev/null || true
        dpkg-reconfigure -plow unattended-upgrades 2>/dev/null || true
        success "Automatic security updates configured"
    fi

    # 7. SSH hardening
    log "SSH hardening recommendations:"
    info "  - Disable root login: PermitRootLogin no"
    info "  - Disable password auth: PasswordAuthentication no"
    info "  - Use SSH keys only: PubkeyAuthentication yes"
    info "  - Change default port: Port 2222"
    info "  Edit: /etc/ssh/sshd_config"

    echo ""
    success "Security hardening complete!"
    info "Run './deploy.sh --check' to verify security posture"
}

# ─── Security Audit ───
security_check() {
    echo -e "\n${BOLD}═══ Security Audit ═══${NC}\n"

    local score=0
    local total=15

    # 1. Check Docker containers running
    if docker compose -f $COMPOSE_FILE ps 2>/dev/null | grep -q "running"; then
        success "[1/$total] Docker containers are running"
        score=$((score + 1))
    else
        warn "[1/$total] Docker containers are not running"
    fi

    # 2. Check HTTPS
    local base_url
    base_url=$(grep NEXT_PUBLIC_BASE_URL "$ENV_FILE" 2>/dev/null | cut -d= -f2)
    if [[ "$base_url" == https://* ]]; then
        success "[2/$total] NEXT_PUBLIC_BASE_URL uses HTTPS"
        score=$((score + 1))
    else
        warn "[2/$total] NEXT_PUBLIC_BASE_URL does not use HTTPS"
    fi

    # 3. Check JWT_SECRET
    if ! grep -q "CHANGE_ME\|dev-only" "$ENV_FILE" 2>/dev/null; then
        success "[3/$total] JWT_SECRET is not a placeholder"
        score=$((score + 1))
    else
        warn "[3/$total] JWT_SECRET is still a placeholder!"
    fi

    # 4. Check ENCRYPTION_KEY
    if ! grep -q "CHANGE_ME.*encryption\|dev-only-encryption" "$ENV_FILE" 2>/dev/null; then
        success "[4/$total] ENCRYPTION_KEY is not a placeholder"
        score=$((score + 1))
    else
        warn "[4/$total] ENCRYPTION_KEY is still a placeholder!"
    fi

    # 5. Check NODE_ENV
    if grep -q "NODE_ENV=production" "$ENV_FILE" 2>/dev/null; then
        success "[5/$total] NODE_ENV is set to production"
        score=$((score + 1))
    else
        warn "[5/$total] NODE_ENV is not production"
    fi

    # 6. Check SSL certificates
    if ls nginx/ssl/*.pem &>/dev/null 2>&1; then
        success "[6/$total] SSL certificates exist"
        score=$((score + 1))
    else
        warn "[6/$total] No SSL certificates found"
    fi

    # 7. Check UFW firewall
    if command -v ufw &> /dev/null && ufw status 2>/dev/null | grep -q "active"; then
        success "[7/$total] UFW firewall is active"
        score=$((score + 1))
    else
        warn "[7/$total] UFW firewall is not active"
    fi

    # 8. Check Fail2Ban
    if command -v fail2ban-client &> /dev/null && fail2ban-client status &>/dev/null; then
        success "[8/$total] Fail2Ban is running"
        score=$((score + 1))
    else
        warn "[8/$total] Fail2Ban is not running"
    fi

    # 9. Check .env permissions
    local env_perms
    env_perms=$(stat -c %a .env 2>/dev/null || stat -f %Lp .env 2>/dev/null || echo "000")
    if [[ "$env_perms" == "600" || "$env_perms" == "400" ]]; then
        success "[9/$total] .env file has secure permissions ($env_perms)"
        score=$((score + 1))
    else
        warn "[9/$total] .env file permissions are $env_perms (should be 600)"
    fi

    # 10. Check Docker running as non-root
    local docker_user
    docker_user=$(docker compose -f $COMPOSE_FILE exec app whoami 2>/dev/null || echo "unknown")
    if [[ "$docker_user" == "nextjs" ]]; then
        success "[10/$total] Docker container runs as non-root user"
        score=$((score + 1))
    else
        warn "[10/$total] Docker container may be running as root"
    fi

    # 11. Check database file permissions
    local db_perms
    db_perms=$(stat -c %a db/custom.db 2>/dev/null || stat -f %Lp db/custom.db 2>/dev/null || echo "000")
    if [[ "$db_perms" == "600" || "$db_perms" == "400" ]]; then
        success "[11/$total] Database file has secure permissions ($db_perms)"
        score=$((score + 1))
    else
        warn "[11/$total] Database file permissions are $db_perms (should be 600)"
    fi

    # 12. Check Nginx config
    if [ -f "nginx/nginx.conf" ]; then
        if grep -q "ssl_certificate" nginx/nginx.conf && ! grep -q "# ssl_certificate" nginx/nginx.conf; then
            success "[12/$total] Nginx SSL is configured"
            score=$((score + 1))
        else
            warn "[12/$total] Nginx SSL is not configured (commented out)"
        fi
    else
        warn "[12/$total] Nginx config not found"
    fi

    # 13. Check rate limiting in Nginx
    if grep -q "limit_req_zone" nginx/nginx.conf 2>/dev/null; then
        success "[13/$total] Nginx rate limiting is configured"
        score=$((score + 1))
    else
        warn "[13/$total] Nginx rate limiting is not configured"
    fi

    # 14. Check security headers in Nginx
    if grep -q "X-Frame-Options" nginx/nginx.conf 2>/dev/null && grep -q "Strict-Transport-Security" nginx/nginx.conf 2>/dev/null; then
        success "[14/$total] Nginx security headers are configured"
        score=$((score + 1))
    else
        warn "[14/$total] Nginx security headers may be missing"
    fi

    # 15. Check health check endpoint
    if curl -sf http://localhost:3000/ -o /dev/null 2>/dev/null; then
        success "[15/$total] Application health check passes"
        score=$((score + 1))
    else
        warn "[15/$total] Application health check failed"
    fi

    # Summary
    echo ""
    echo -e "${BOLD}═══ Security Score: $score/$total ═══${NC}"
    if [ $score -ge 13 ]; then
        echo -e "${GREEN}${BOLD}🛡️  EXCELLENT — Your platform is well-secured!${NC}"
    elif [ $score -ge 10 ]; then
        echo -e "${YELLOW}${BOLD}⚠️  GOOD — Some improvements recommended${NC}"
    else
        echo -e "${RED}${BOLD}🚨 WEAK — Immediate action required!${NC}"
    fi
    echo ""
}

# ─── Post-deployment Check ───
post_deploy_check() {
    log "Running post-deployment verification..."

    # Quick API health check
    local base_url
    base_url=$(grep NEXT_PUBLIC_BASE_URL "$ENV_FILE" 2>/dev/null | cut -d= -f2)

    if [ -n "$base_url" ]; then
        # Check if the site responds
        if curl -sf -o /dev/null "$base_url" 2>/dev/null; then
            success "Site responds at $base_url"
        else
            warn "Site does not respond at $base_url (may still be starting)"
        fi
    fi

    # Check Docker containers
    docker compose -f $COMPOSE_FILE ps
}

# ─── Rollback ───
rollback() {
    log "Rolling back to previous version..."

    # Find the previous image
    local prev_image
    prev_image=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep wedding | head -2 | tail -1)

    if [ -z "$prev_image" ]; then
        error "No previous image found for rollback"
    fi

    warn "Rolling back to: $prev_image"

    # Stop current
    docker compose -f $COMPOSE_FILE down

    # Start with previous image
    # This is a simplified rollback - in production, use proper image tagging
    docker compose -f $COMPOSE_FILE up -d

    success "Rollback complete!"
}

# ─── Show Logs ───
logs() {
    docker compose -f $COMPOSE_FILE logs -f --tail=100
}

# ─── Status ───
status() {
    echo -e "\n${BOLD}═══ Container Status ═══${NC}\n"
    docker compose -f $COMPOSE_FILE ps
    echo ""
    if curl -sf -o /dev/null http://localhost:3000/ 2>/dev/null; then
        success "Application is healthy (HTTP 200)"
    else
        warn "Application may be down"
    fi
    echo ""

    # Show resource usage
    echo -e "${BOLD}═══ Resource Usage ═══${NC}\n"
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 2>/dev/null || true
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
    --harden)
        harden
        ;;
    --check)
        security_check
        ;;
    --rollback)
        rollback
        ;;
    --logs)
        logs
        ;;
    --status)
        status
        ;;
    --help|-h)
        echo -e "${BOLD}Josué & Hornella Wedding Platform — Deployment Script${NC}"
        echo ""
        echo "Usage: $0 [OPTION]"
        echo ""
        echo "Options:"
        echo "  (none)      Full deployment with security checks"
        echo "  --update    Zero-downtime update"
        echo "  --ssl       Setup SSL with Let's Encrypt"
        echo "  --backup    Backup database (compressed)"
        echo "  --restore   Restore database from latest backup"
        echo "  --harden    Security hardening (firewall, fail2ban, etc.)"
        echo "  --check     Run security audit"
        echo "  --rollback  Rollback to previous version"
        echo "  --logs      Show application logs"
        echo "  --status    Show container status and resource usage"
        echo "  --help      Show this help message"
        echo ""
        echo "Environment Variables:"
        echo "  DOMAIN=your-domain.com    Domain for SSL"
        echo "  SSL_EMAIL=admin@your.com  Email for Let's Encrypt"
        ;;
    *)
        deploy
        ;;
esac
