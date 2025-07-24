#!/bin/bash

# Rogers Green Restaurant Scraper - Deployment Script
# Deploy to VPS: 66.29.133.107

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
VPS_IP="66.29.133.107"
VPS_USER="root"
VPS_PASSWORD="SqqwW6pLHx380Y7l1E"
APP_DIR="/opt/restaurant-scraper"
DOMAIN="rest-data.rogersgreengroup.com"

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

# Check if sshpass is installed
check_sshpass() {
    if ! command -v sshpass &> /dev/null; then
        log_error "sshpass is required but not installed."
        log_info "Install it with: brew install hudochenkov/sshpass/sshpass (macOS) or apt-get install sshpass (Linux)"
        exit 1
    fi
}

# Function to run commands on VPS
run_remote() {
    sshpass -p "$VPS_PASSWORD" ssh -o StrictHostKeyChecking=no "$VPS_USER@$VPS_IP" "$1"
}

# Function to copy files to VPS
copy_to_vps() {
    sshpass -p "$VPS_PASSWORD" scp -o StrictHostKeyChecking=no -r "$1" "$VPS_USER@$VPS_IP:$2"
}

# Initial VPS setup
setup_vps() {
    log_info "Setting up VPS for first time deployment..."
    
    # Copy setup script to VPS
    copy_to_vps "deployment/setup-vps.sh" "/tmp/"
    
    # Make executable and run
    run_remote "chmod +x /tmp/setup-vps.sh && /tmp/setup-vps.sh"
    
    log_success "VPS setup completed"
}

# Deploy application code
deploy_application() {
    log_info "Deploying application to VPS..."
    
    # Create application directory if it doesn't exist
    run_remote "mkdir -p $APP_DIR"
    
    # Copy application files (excluding node_modules, logs, etc.)
    log_info "Copying application files..."
    
    # Create temporary deployment directory
    TEMP_DIR="/tmp/restaurant-scraper-deploy"
    mkdir -p "$TEMP_DIR"
    
    # Copy files, excluding unnecessary directories
    rsync -av --exclude='node_modules' \
              --exclude='.git' \
              --exclude='logs' \
              --exclude='*.log' \
              --exclude='.DS_Store' \
              --exclude='screenshots' \
              ./ "$TEMP_DIR/"
    
    # Copy to VPS
    copy_to_vps "$TEMP_DIR/" "$APP_DIR/"
    
    # Clean up temp directory
    rm -rf "$TEMP_DIR"
    
    log_success "Application files copied"
}

# Setup environment and dependencies
setup_environment() {
    log_info "Setting up environment and installing dependencies..."
    
    # Create .env file on VPS
    run_remote "cd $APP_DIR && cat > .env << 'EOF'
# Database Configuration
DATABASE_URL=postgresql://restaurant_user:secure_password_change_this@localhost:5432/restaurant_scraper
DB_HOST=localhost
DB_PORT=5432
DB_NAME=restaurant_scraper
DB_USER=restaurant_user
DB_PASSWORD=secure_password_change_this

# Google APIs
GOOGLE_PLACES_API_KEY=AIzaSyAdab6wLyhoVPyvz5qeKv3W2kAonXWb7PM
GOOGLE_GEOCODING_API_KEY=AIzaSyAdab6wLyhoVPyvz5qeKv3W2kAonXWb7PM

# Server Configuration
PORT=3000
NODE_ENV=production
SESSION_SECRET=rogers_green_super_secret_session_key_2024_production
BASE_URL=https://rest-data.rogersgreengroup.com
DOMAIN=rest-data.rogersgreengroup.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Scraping Configuration
MAX_CONCURRENT_SCRAPERS=5
SCRAPING_DELAY_MS=2000
PUPPETEER_HEADLESS=true

# Security
JWT_SECRET=rogers_green_jwt_secret_2024_production_change_this
BCRYPT_ROUNDS=12

# File Upload Limits
MAX_FILE_SIZE=10485760

# Logging
LOG_LEVEL=info
LOG_FILE=logs/app.log
EOF"

    # Install dependencies
    run_remote "cd $APP_DIR && npm install --production"
    
    # Create necessary directories
    run_remote "cd $APP_DIR && mkdir -p logs uploads tmp"
    
    # Set proper ownership
    run_remote "chown -R restaurant:restaurant $APP_DIR"
    
    log_success "Environment setup completed"
}

# Setup database
setup_database() {
    log_info "Setting up database..."
    
    # Run database schema
    run_remote "cd $APP_DIR && psql postgresql://restaurant_user:secure_password_change_this@localhost:5432/restaurant_scraper < database/schema-complete.sql"
    
    # Run initial seed data
    run_remote "cd $APP_DIR && psql postgresql://restaurant_user:secure_password_change_this@localhost:5432/restaurant_scraper < database/seeds/initial-zones.sql"
    
    # Run zone templates
    run_remote "cd $APP_DIR && psql postgresql://restaurant_user:secure_password_change_this@localhost:5432/restaurant_scraper < database/seeds/zone-templates.sql"
    
    log_success "Database setup completed"
}

# Start application with PM2
start_application() {
    log_info "Starting application with PM2..."
    
    # Copy PM2 configuration
    run_remote "cd $APP_DIR && cp deployment/ecosystem.config.js ecosystem.config.js"
    
    # Stop existing PM2 processes (if any)
    run_remote "pm2 delete restaurant-scraper 2>/dev/null || true"
    
    # Start application
    run_remote "cd $APP_DIR && pm2 start ecosystem.config.js --env production"
    
    # Save PM2 configuration
    run_remote "pm2 save"
    
    # Setup PM2 startup script
    run_remote "pm2 startup systemd -u restaurant --hp $APP_DIR"
    
    log_success "Application started with PM2"
}

# Test deployment
test_deployment() {
    log_info "Testing deployment..."
    
    # Wait for application to start
    sleep 10
    
    # Test local connection
    if run_remote "curl -f http://localhost:3000/api/system/status"; then
        log_success "Application is responding locally"
    else
        log_error "Application is not responding locally"
        return 1
    fi
    
    # Test external connection (if domain is set up)
    if curl -f "https://$DOMAIN/api/system/status" &>/dev/null; then
        log_success "Application is accessible externally at https://$DOMAIN"
    else
        log_warning "External access test failed - check DNS and SSL configuration"
    fi
    
    # Check PM2 status
    run_remote "pm2 status"
    
    log_success "Deployment test completed"
}

# Show deployment summary
show_summary() {
    log_success "=== Deployment Complete ==="
    echo
    log_info "Application Details:"
    echo "  🌐 URL: https://$DOMAIN"
    echo "  🖥️  VPS: $VPS_IP"
    echo "  📁 Directory: $APP_DIR"
    echo "  🔧 Admin Panel: https://$DOMAIN/admin"
    echo
    log_info "Useful Commands (run on VPS):"
    echo "  📊 Check status: pm2 status"
    echo "  📝 View logs: pm2 logs restaurant-scraper"
    echo "  🔄 Restart app: pm2 restart restaurant-scraper"
    echo "  🔍 Monitor: pm2 monit"
    echo "  🐛 Debug logs: tail -f $APP_DIR/logs/combined.log"
    echo
    log_info "Database Access:"
    echo "  🗄️  psql postgresql://restaurant_user:secure_password_change_this@localhost:5432/restaurant_scraper"
    echo
    log_warning "Next Steps:"
    echo "  1. 🔐 Change database password in .env file"
    echo "  2. 🌍 Update DNS to point $DOMAIN to $VPS_IP"
    echo "  3. 📧 Test email scraping functionality"
    echo "  4. 📊 Access admin panel to add zones"
    echo "  5. 🚀 Start your first scraping job!"
}

# Update deployment (for subsequent deployments)
update_deployment() {
    log_info "Updating existing deployment..."
    
    # Stop application
    run_remote "pm2 stop restaurant-scraper"
    
    # Deploy new code
    deploy_application
    
    # Install any new dependencies
    run_remote "cd $APP_DIR && npm install --production"
    
    # Restart application
    run_remote "pm2 restart restaurant-scraper"
    
    log_success "Update deployment completed"
}

# Main deployment function
main() {
    local action="${1:-full}"
    
    log_info "Starting Rogers Green Restaurant Scraper deployment..."
    log_info "Target VPS: $VPS_IP"
    log_info "Domain: $DOMAIN"
    echo
    
    check_sshpass
    
    case $action in
        "full")
            log_info "Performing full deployment..."
            setup_vps
            deploy_application
            setup_environment
            setup_database
            start_application
            test_deployment
            show_summary
            ;;
        "update")
            log_info "Performing update deployment..."
            update_deployment
            test_deployment
            log_success "Update completed"
            ;;
        "app-only")
            log_info "Deploying application code only..."
            deploy_application
            run_remote "pm2 restart restaurant-scraper"
            test_deployment
            log_success "Application update completed"
            ;;
        "test")
            log_info "Testing deployment..."
            test_deployment
            ;;
        *)
            log_error "Unknown action: $action"
            echo "Usage: $0 [full|update|app-only|test]"
            echo "  full     - Complete setup and deployment"
            echo "  update   - Update existing deployment"
            echo "  app-only - Deploy application code only"
            echo "  test     - Test existing deployment"
            exit 1
            ;;
    esac
}

# Run main function with arguments
main "$@"