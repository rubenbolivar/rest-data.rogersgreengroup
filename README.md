# 🚀 Rogers Green Restaurant Scraper

A scalable restaurant data collection system with dynamic zone management, built with Node.js, PostgreSQL, and Bootstrap 5.

**🌐 Live System**: https://rest-data.rogersgreengroup.com

## 🌟 Features

### Core Functionality
- **✅ Dynamic Zone Management** - Add unlimited geographical zones via web interface
- **✅ Google Places API Integration** - Automated restaurant data collection using Google Places API
- **✅ Real-time Scraping Dashboard** - Monitor scraping jobs and progress in real-time
- **✅ Responsive Admin Panel** - Complete zone management with Bootstrap 5
- **✅ PostgreSQL Database** - Scalable data storage with 23 pre-configured zones
- **✅ SSL Security** - Let's Encrypt SSL certificates with auto-renewal

### Advanced Features
- **✅ Zone Templates** - 15 pre-built templates for different area types
- **✅ Priority System** - High/medium/low priority zone classification
- **✅ Data Quality Scoring** - Automatic assessment of restaurant data completeness
- **✅ Anti-duplicate System** - Prevents duplicate restaurants via Google Place ID
- **✅ Audit Trail** - Complete history of zone modifications and scraping jobs
- **✅ Production Deployment** - Fully deployed on VPS with PM2, Nginx, SSL

### Scraping System
- **✅ Real-time Job Management** - Start, monitor, and track scraping jobs
- **✅ Zone Selection Interface** - Multi-select zones with priority filtering
- **✅ Configurable Parameters** - Delay, max results, email extraction settings
- **✅ Progress Monitoring** - Live updates on job status and results
- **✅ Job History** - Complete log of completed scraping operations

## 🛠️ Tech Stack

### Backend
- **Node.js 18+** with Express.js
- **PostgreSQL 14** with native SQL (no ORM)
- **Google Places API** for restaurant discovery
- **Winston** for comprehensive logging
- **PM2** for process management

### Frontend
- **Bootstrap 5.3** responsive framework
- **Bootstrap Icons** for UI elements
- **Vanilla JavaScript** for real-time updates
- **EJS** templating engine

### Deployment & Infrastructure
- **Nginx** reverse proxy with SSL termination
- **Let's Encrypt** SSL certificates
- **PM2** cluster mode with auto-restart
- **UFW** firewall configuration
- **Namecheap VPS** hosting

### Security
- **Helmet.js** - Security headers
- **Rate Limiting** - API abuse prevention
- **CORS** - Cross-origin request control
- **Session Security** - Secure authentication
- **SSL/HTTPS** - End-to-end encryption

## 📋 System Information

### Live URLs
- **🏠 Main Dashboard**: https://rest-data.rogersgreengroup.com
- **🤖 Scraping Panel**: https://rest-data.rogersgreengroup.com/scraping
- **⚙️ Admin Panel**: https://rest-data.rogersgreengroup.com/admin
- **📊 System Status**: https://rest-data.rogersgreengroup.com/api/system/status
- **🗺️ Zones API**: https://rest-data.rogersgreengroup.com/api/zones

### Production Environment
- **Server**: VPS at 66.29.133.107
- **Domain**: rest-data.rogersgreengroup.com
- **SSL**: Let's Encrypt (auto-renewal configured)
- **Database**: PostgreSQL with 23 zones pre-configured
- **Google API**: Places API integrated and functional

## 📊 Pre-configured Zones (23 Total)

### NYC Core (5 zones)
- Manhattan, Brooklyn, Queens, Bronx, Staten Island

### NYC Neighbors (8 zones)
- Jersey City, Hoboken, Yonkers, Long Island City, Williamsburg, Astoria, Flushing, Newark

### Rockland County (10 zones)
- New City, Spring Valley, Suffern, Nyack, Pearl River, Monsey, Nanuet, West Haverstraw, Haverstraw, Stony Point

## 🚀 Quick Start (Local Development)

### 1. Clone and Install

```bash
git clone https://github.com/rubenbolivar/rest-data.rogersgreengroup.git
cd rest-data.rogersgreengroup
npm install
```

### 2. Environment Setup

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Database
DATABASE_URL=postgresql://username:password@localhost:5432/restaurant_scraper
DB_HOST=localhost
DB_PORT=5432
DB_NAME=restaurant_scraper
DB_USER=username
DB_PASSWORD=password

# Google APIs
GOOGLE_PLACES_API_KEY=your_google_places_api_key
GOOGLE_GEOCODING_API_KEY=your_google_geocoding_api_key

# Application
DOMAIN=localhost
PORT=3000
NODE_ENV=development
SESSION_SECRET=your_session_secret
BASE_URL=http://localhost:3000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Scraping Configuration
MAX_CONCURRENT_SCRAPERS=5
SCRAPING_DELAY_MS=2000
PUPPETEER_HEADLESS=true
```

### 3. Database Setup

```bash
# Create database
createdb restaurant_scraper

# Run schema
psql restaurant_scraper < database/schema-complete.sql

# Seed initial data
psql restaurant_scraper < database/seeds/initial-zones.sql
psql restaurant_scraper < database/seeds/zone-templates.sql
```

### 4. Start Development

```bash
npm run dev
```

Visit `http://localhost:3000` for the main dashboard.

## 🤖 Using the Scraping System

### 1. Access Scraping Panel
Go to https://rest-data.rogersgreengroup.com/scraping

### 2. Select Zones
- Choose specific zones or use quick selection buttons
- **All Zones**: Select all 23 zones
- **High Priority**: Select only priority 1 zones
- **NYC Core**: Select Manhattan, Brooklyn, Queens, Bronx, Staten Island

### 3. Configure Parameters
- **Delay**: 2000ms recommended (prevents rate limiting)
- **Max Results**: 100 restaurants per zone
- **Extract Emails**: Future functionality

### 4. Start Scraping
- Click "Iniciar Scraping"
- Monitor progress in "Jobs Activos" section
- View results in real-time

### 5. Monitor Results
- Active jobs show current progress
- History shows completed jobs
- Restaurant data saved automatically to database

## 🔧 Production Deployment

### Current Production Setup

The system is fully deployed and operational:

```bash
# Server Details
Server: 66.29.133.107
Domain: rest-data.rogersgreengroup.com
SSL: Let's Encrypt (auto-renewal configured)
Process Manager: PM2
Web Server: Nginx
Database: PostgreSQL 14

# Check deployment status
pm2 status
systemctl status nginx
systemctl status postgresql
```

### Automated Deployment

For new deployments or updates:

```bash
# Full deployment
./deployment/deploy.sh full

# Update existing deployment
./deployment/deploy.sh update

# Application code only
./deployment/deploy.sh app-only
```

### Manual Deployment Steps

1. **VPS Setup**
```bash
chmod +x deployment/setup-vps.sh
./deployment/setup-vps.sh
```

2. **Application Deployment**
```bash
./deployment/deploy.sh full
```

3. **SSL Configuration** (handled automatically)
```bash
certbot --nginx -d rest-data.rogersgreengroup.com
```

## 📊 Database Schema

### Core Tables
- **zones** - Geographical areas for scraping (23 pre-configured)
- **zone_templates** - Reusable zone configurations (15 templates)
- **restaurants** - Scraped restaurant data
- **scraping_jobs** - Job history and tracking
- **zone_changes** - Audit trail for modifications

### Key Features
- **Auto-incrementing IDs** for all tables
- **Foreign key relationships** maintaining data integrity
- **Indexes** for optimal query performance
- **Triggers** for automatic timestamp updates
- **Check constraints** for data validation

## 🔄 API Endpoints

### Public APIs
- `GET /api/system/status` - System health and configuration
- `GET /api/zones` - List all zones with restaurant counts
- `GET /api/test/google-places` - Test Google Places API
- `GET /health` - Simple health check

### Scraping APIs
- `POST /api/scraping/start` - Start new scraping job
- `GET /api/scraping/status` - Get active jobs status
- `GET /api/scraping/job/:jobId` - Get specific job details

## 🔐 Security Features

### Implemented Security
- **Helmet.js** - Security headers and XSS protection
- **Rate Limiting** - 100 requests per 15 minutes per IP
- **CORS** - Cross-origin request control
- **SSL/HTTPS** - Let's Encrypt certificates
- **Session Security** - Secure session management
- **Input Validation** - SQL injection prevention

### Environment Security
- **UFW Firewall** - Ports 22, 80, 443 only
- **Fail2Ban** - Brute force protection
- **PM2 Security** - Process isolation
- **Database Access** - Restricted user permissions

## 📈 Monitoring & Maintenance

### Application Monitoring
```bash
# PM2 status
pm2 status
pm2 logs restaurant-scraper
pm2 monit

# System resources
htop
df -h
free -h
```

### Database Monitoring
```bash
# Connect to database
psql postgresql://restaurant_user:secure_password_change_this@localhost:5432/restaurant_scraper

# Check data
SELECT COUNT(*) FROM zones WHERE is_active = true;
SELECT COUNT(*) FROM restaurants;
SELECT COUNT(*) FROM zone_templates WHERE is_active = true;
```

### SSL Certificate Renewal
```bash
# Check certificate status
certbot certificates

# Renew if needed (automatic cron job configured)
certbot renew --dry-run
```

## 🐛 Troubleshooting

### Common Issues

**Application Not Starting**
```bash
# Check PM2 logs
pm2 logs restaurant-scraper

# Restart application
pm2 restart restaurant-scraper

# Check port availability
netstat -tlnp | grep :3000
```

**Database Connection Issues**
```bash
# Check PostgreSQL status
systemctl status postgresql

# Test connection
psql postgresql://restaurant_user:secure_password_change_this@localhost:5432/restaurant_scraper -c "SELECT NOW();"
```

**SSL Certificate Issues**
```bash
# Check certificate status
certbot certificates

# Renew certificate
certbot renew --dry-run
```

**Nginx Issues**
```bash
# Test configuration
nginx -t

# Check status
systemctl status nginx

# View logs
tail -f /var/log/nginx/error.log
```

## 📊 System Statistics

### Current Data (as of deployment)
- **✅ 23 Active Zones** (NYC metro + Rockland County)
- **✅ 15 Zone Templates** (various area types)
- **✅ 0 Restaurants** (ready for scraping)
- **✅ Google Places API** configured and tested
- **✅ SSL Certificate** valid and auto-renewing

### Performance Metrics
- **Response Time**: < 200ms average
- **Uptime**: 99.9% target
- **API Rate Limit**: 100 requests/15min per IP
- **Database Connections**: Pool of 20 connections
- **Memory Usage**: ~50MB average

## 🔮 Future Enhancements

### Planned Features
- **Email Extraction** - Web scraping for contact information
- **CSV Import/Export** - Bulk zone management
- **Advanced Filtering** - Cuisine type, rating, price level
- **Scheduling System** - Automated periodic scraping
- **Data Visualization** - Charts and maps for analytics
- **API Rate Optimization** - Intelligent request management

### Potential Expansions
- **Multi-language Support** - Spanish, French markets
- **Review Integration** - Yelp, TripAdvisor data
- **Social Media Data** - Instagram, Facebook integration
- **Machine Learning** - Cuisine classification and recommendations
- **Mobile App** - iOS/Android companion
- **Third-party APIs** - External service integrations

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For support or questions:
- **GitHub Issues**: [Repository Issues](https://github.com/rubenbolivar/rest-data.rogersgreengroup/issues)
- **Live System**: https://rest-data.rogersgreengroup.com
- **Email**: admin@rogersgreengroup.com

## 📞 Contact

**Rogers Green Group**
- **Website**: https://rest-data.rogersgreengroup.com
- **Repository**: https://github.com/rubenbolivar/rest-data.rogersgreengroup
- **Developer**: Rubén Bolívar

---

**🎉 System Status: LIVE and OPERATIONAL**

Built with ❤️ for Rogers Green Group - Restaurant Data Intelligence Platform