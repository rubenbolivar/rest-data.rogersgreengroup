# 🚀 Rogers Green Restaurant Scraper - Deployment Guide

## Quick Deployment to VPS (66.29.133.107)

### Prerequisites
- **sshpass** installed on your local machine
- Google Places API Key: `AIzaSyAdab6wLyhoVPyvz5qeKv3W2kAonXWb7PM`
- VPS Access: IP `66.29.133.107`, User `root`, Password `SqqwW6pLHx380Y7l1E`

### Install sshpass (if not installed)

**macOS:**
```bash
brew install hudochenkov/sshpass/sshpass
```

**Linux/Ubuntu:**
```bash
sudo apt-get install sshpass
```

## 🎯 One-Command Deployment

From your project directory, run:

```bash
./deployment/deploy.sh full
```

This will:
1. ✅ Set up the VPS (Ubuntu packages, Node.js, PostgreSQL, Nginx)
2. ✅ Deploy application code
3. ✅ Configure environment variables
4. ✅ Set up database with initial data
5. ✅ Start application with PM2
6. ✅ Configure SSL certificate for `rest-data.rogersgreengroup.com`

## 🔄 Update Existing Deployment

For code updates only:
```bash
./deployment/deploy.sh update
```

For application files only:
```bash
./deployment/deploy.sh app-only
```

## 🧪 Test Deployment

```bash
./deployment/deploy.sh test
```

## 📋 Manual Steps (if needed)

### 1. VPS Access
```bash
sshpass -p 'SqqwW6pLHx380Y7l1E' ssh root@66.29.133.107
```

### 2. Check Application Status
```bash
pm2 status
pm2 logs restaurant-scraper
```

### 3. Database Access
```bash
psql postgresql://restaurant_user:secure_password_change_this@localhost:5432/restaurant_scraper
```

### 4. Nginx Status
```bash
systemctl status nginx
sudo nginx -t
```

## 🌐 DNS Configuration

Point your domain to the VPS:
- **A Record**: `rest-data.rogersgreengroup.com` → `66.29.133.107`
- **CNAME**: `www.rest-data.rogersgreengroup.com` → `rest-data.rogersgreengroup.com`

## 🔐 Post-Deployment Security

1. **Change Database Password**
   ```bash
   # On VPS
   cd /opt/restaurant-scraper
   nano .env
   # Update DB_PASSWORD and DATABASE_URL
   pm2 restart restaurant-scraper
   ```

2. **Update Session Secret**
   ```bash
   # Generate new secret
   openssl rand -base64 32
   # Update SESSION_SECRET in .env
   ```

## 📊 Application URLs

- **Main Dashboard**: https://rest-data.rogersgreengroup.com
- **Admin Panel**: https://rest-data.rogersgreengroup.com/admin
- **Zone Management**: https://rest-data.rogersgreengroup.com/admin/zones
- **API Status**: https://rest-data.rogersgreengroup.com/api/system/status

## 🛠️ Initial Setup Tasks

### 1. Add Your First Zone
1. Go to https://rest-data.rogersgreengroup.com/admin/zones
2. Click "Add Zone"
3. Fill in zone details or use a template
4. Start scraping from the dashboard

### 2. Import Multiple Zones
1. Download sample CSV: https://rest-data.rogersgreengroup.com/admin/zones/sample.csv
2. Modify with your zones
3. Import via "Import CSV" button

### 3. Start Scraping
1. Go to main dashboard
2. Click "Start Scraping"
3. Select zones to scrape
4. Monitor progress in real-time

## 🐛 Troubleshooting

### Application Not Starting
```bash
# Check PM2 logs
pm2 logs restaurant-scraper

# Restart application
pm2 restart restaurant-scraper

# Check if port 3000 is in use
netstat -tlnp | grep :3000
```

### Database Connection Issues
```bash
# Check PostgreSQL status
systemctl status postgresql

# Test connection
psql postgresql://restaurant_user:secure_password_change_this@localhost:5432/restaurant_scraper -c "SELECT NOW();"
```

### SSL Certificate Issues
```bash
# Renew certificate
certbot renew --dry-run

# Check certificate status
certbot certificates
```

### Memory Issues
```bash
# Check memory usage
free -h
htop

# Restart application to free memory
pm2 restart restaurant-scraper
```

## 📈 Monitoring

### PM2 Monitoring
```bash
pm2 monit                    # Real-time monitoring
pm2 status                   # Process status
pm2 logs restaurant-scraper  # Application logs
```

### System Monitoring
```bash
htop                         # System resources
df -h                        # Disk usage
systemctl status nginx       # Nginx status
```

### Log Files
- **Application**: `/opt/restaurant-scraper/logs/`
- **Nginx**: `/var/log/nginx/`
- **PostgreSQL**: `/var/log/postgresql/`

## 🔄 Backup & Restore

### Database Backup
```bash
pg_dump postgresql://restaurant_user:secure_password_change_this@localhost:5432/restaurant_scraper > backup.sql
```

### Database Restore
```bash
psql postgresql://restaurant_user:secure_password_change_this@localhost:5432/restaurant_scraper < backup.sql
```

## 📞 Support

If you encounter issues:
1. Check the logs: `pm2 logs restaurant-scraper`
2. Verify services: `systemctl status nginx postgresql`
3. Test manually: `curl http://localhost:3000/api/system/status`

---

**🎉 Your Rogers Green Restaurant Scraper is now live at https://rest-data.rogersgreengroup.com!**