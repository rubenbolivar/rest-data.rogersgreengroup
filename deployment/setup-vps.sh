#!/bin/bash

# Rogers Green Restaurant Scraper - VPS Setup Script
# For Ubuntu 20.04+ / Debian 10+
# Usage: ./setup-vps.sh

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_NAME="restaurant-scraper"
APP_USER="restaurant"
APP_DIR="/opt/restaurant-scraper"
DOMAIN="rest-data.rogersgreengroup.com"
NODE_VERSION="18"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

update_system() {
    log_info "Updating system packages..."
    apt update && apt upgrade -y
    log_success "System updated"
}

install_dependencies() {
    log_info "Installing system dependencies..."
    
    # Essential packages
    apt install -y curl wget git unzip software-properties-common \
                   build-essential python3-pip nginx postgresql \
                   postgresql-contrib ufw fail2ban htop

    # Install Node.js
    log_info "Installing Node.js ${NODE_VERSION}..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt install -y nodejs

    # Install PM2 globally
    npm install -g pm2

    # Install Certbot for SSL
    apt install -y certbot python3-certbot-nginx

    log_success "Dependencies installed"
}

setup_user() {
    log_info "Setting up application user..."
    
    # Create user if doesn't exist
    if ! id "$APP_USER" &>/dev/null; then
        useradd -r -s /bin/false $APP_USER
        log_success "User $APP_USER created"
    else
        log_warning "User $APP_USER already exists"
    fi
}

setup_database() {
    log_info "Setting up PostgreSQL database..."
    
    # Start PostgreSQL
    systemctl start postgresql
    systemctl enable postgresql
    
    # Create database and user
    sudo -u postgres psql -c "CREATE DATABASE restaurant_scraper;" 2>/dev/null || log_warning "Database might already exist"
    sudo -u postgres psql -c "CREATE USER restaurant_user WITH PASSWORD 'secure_password_change_this';" 2>/dev/null || log_warning "User might already exist"
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE restaurant_scraper TO restaurant_user;" 2>/dev/null
    sudo -u postgres psql -c "ALTER USER restaurant_user CREATEDB;" 2>/dev/null
    
    log_success "Database setup completed"
}

setup_firewall() {
    log_info "Configuring firewall..."
    
    # Reset UFW to defaults
    ufw --force reset
    
    # Default policies
    ufw default deny incoming
    ufw default allow outgoing
    
    # Allow SSH
    ufw allow 22/tcp
    
    # Allow HTTP and HTTPS
    ufw allow 80/tcp
    ufw allow 443/tcp
    
    # Enable firewall
    ufw --force enable
    
    log_success "Firewall configured"
}

setup_fail2ban() {
    log_info "Configuring Fail2Ban..."
    
    # Create local configuration
    cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
port = 22
logpath = /var/log/auth.log

[nginx-http-auth]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log

[nginx-limit-req]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log
maxretry = 10
EOF

    systemctl restart fail2ban
    systemctl enable fail2ban
    
    log_success "Fail2Ban configured"
}

deploy_application() {
    log_info "Deploying application..."
    
    # Create application directory
    mkdir -p $APP_DIR
    cd $APP_DIR
    
    # If this is a fresh deployment, you would typically:
    # git clone your repository here
    # For now, we'll create the directory structure
    
    # Set ownership
    chown -R $APP_USER:$APP_USER $APP_DIR
    
    log_success "Application directory prepared at $APP_DIR"
}

setup_nginx() {
    log_info "Configuring Nginx..."
    
    # Remove default site
    rm -f /etc/nginx/sites-enabled/default
    
    # Create application nginx configuration
    cat > /etc/nginx/sites-available/$APP_NAME << EOF
# Rogers Green Restaurant Scraper - Nginx Configuration

# Rate limiting
limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/m;
limit_req_zone \$binary_remote_addr zone=login:10m rate=5r/m;

# Upstream Node.js application
upstream nodejs_backend {
    server 127.0.0.1:3000;
    keepalive 32;
}

# HTTP to HTTPS redirect
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;
    
    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    # Redirect all HTTP to HTTPS
    location / {
        return 301 https://\$host\$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;
    
    # SSL configuration (will be updated by certbot)
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    
    # SSL security settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    
    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
    
    # Static file serving
    location /css/ {
        alias $APP_DIR/public/css/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    location /js/ {
        alias $APP_DIR/public/js/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    location /img/ {
        alias $APP_DIR/public/img/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # API endpoints with rate limiting
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://nodejs_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
    
    # Login endpoints with stricter rate limiting
    location /admin/login {
        limit_req zone=login burst=5 nodelay;
        proxy_pass http://nodejs_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
    
    # Main application
    location / {
        proxy_pass http://nodejs_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # Health check endpoint
    location /health {
        access_log off;
        proxy_pass http://nodejs_backend;
    }
    
    # Block access to sensitive files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
    
    location ~ \.(env|log|sql)$ {
        deny all;
        access_log off;
        log_not_found off;
    }
}
EOF

    # Enable site
    ln -sf /etc/nginx/sites-available/$APP_NAME /etc/nginx/sites-enabled/
    
    # Test nginx configuration
    nginx -t
    
    # Restart nginx
    systemctl restart nginx
    systemctl enable nginx
    
    log_success "Nginx configured"
}

setup_ssl() {
    log_info "Setting up SSL certificate..."
    
    # Get SSL certificate
    certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos --email admin@rogersgreengroup.com
    
    # Set up auto-renewal
    (crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | crontab -
    
    log_success "SSL certificate installed"
}

setup_monitoring() {
    log_info "Setting up monitoring..."
    
    # Create log directories
    mkdir -p /var/log/$APP_NAME
    chown $APP_USER:$APP_USER /var/log/$APP_NAME
    
    # Setup logrotate
    cat > /etc/logrotate.d/$APP_NAME << EOF
/var/log/$APP_NAME/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 0644 $APP_USER $APP_USER
}
EOF

    log_success "Monitoring setup completed"
}

setup_pm2() {
    log_info "Setting up PM2 process manager..."
    
    # Create PM2 ecosystem file
    cat > $APP_DIR/ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: '$APP_NAME',
    script: './server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: '/var/log/$APP_NAME/error.log',
    out_file: '/var/log/$APP_NAME/out.log',
    log_file: '/var/log/$APP_NAME/combined.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max_old_space_size=1024'
  }]
};
EOF

    # Set up PM2 startup script
    pm2 startup systemd -u $APP_USER --hp $APP_DIR
    
    log_success "PM2 configured"
}

optimize_system() {
    log_info "Optimizing system performance..."
    
    # Kernel parameter optimizations
    cat >> /etc/sysctl.conf << EOF

# Rogers Green Restaurant Scraper optimizations
net.core.somaxconn = 65536
net.core.netdev_max_backlog = 5000
net.ipv4.tcp_max_syn_backlog = 65536
net.ipv4.tcp_keepalive_time = 600
net.ipv4.tcp_keepalive_probes = 3
net.ipv4.tcp_keepalive_intvl = 90
vm.swappiness = 10
fs.file-max = 2097152
EOF

    sysctl -p
    
    # Set file descriptor limits
    cat >> /etc/security/limits.conf << EOF

# Rogers Green Restaurant Scraper limits
$APP_USER soft nofile 65536
$APP_USER hard nofile 65536
$APP_USER soft nproc 32768
$APP_USER hard nproc 32768
EOF

    log_success "System optimized"
}

show_summary() {
    log_success "=== VPS Setup Complete ==="
    echo
    log_info "Application Details:"
    echo "  - Domain: https://$DOMAIN"
    echo "  - App Directory: $APP_DIR"
    echo "  - App User: $APP_USER"
    echo "  - Database: restaurant_scraper"
    echo
    log_info "Next Steps:"
    echo "  1. Upload your application code to $APP_DIR"
    echo "  2. Install dependencies: cd $APP_DIR && npm install --production"
    echo "  3. Configure environment: cp .env.example .env && edit .env"
    echo "  4. Run database migrations: npm run migrate"
    echo "  5. Start application: pm2 start ecosystem.config.js"
    echo "  6. Save PM2 configuration: pm2 save"
    echo
    log_info "Useful Commands:"
    echo "  - Check app status: pm2 status"
    echo "  - View logs: pm2 logs $APP_NAME"
    echo "  - Restart app: pm2 restart $APP_NAME"
    echo "  - Check nginx: systemctl status nginx"
    echo "  - Check database: systemctl status postgresql"
    echo
    log_warning "IMPORTANT: Change the database password in your .env file!"
    echo "Current password: secure_password_change_this"
}

main() {
    log_info "Starting Rogers Green Restaurant Scraper VPS setup..."
    
    check_root
    update_system
    install_dependencies
    setup_user
    setup_database
    setup_firewall
    setup_fail2ban
    deploy_application
    setup_nginx
    setup_ssl
    setup_monitoring
    setup_pm2
    optimize_system
    
    show_summary
}

# Run main function
main "$@"