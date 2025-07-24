const express = require('express');
const path = require('path');
const session = require('express-session');
const fileUpload = require('express-fileupload');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Import services and routes
const db = require('./src/services/databaseService');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://unpkg.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://code.jquery.com", "https://unpkg.com"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "https://cdn.jsdelivr.net"],
            connectSrc: ["'self'"],
        },
    },
}));

app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? process.env.BASE_URL : true,
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// File upload middleware
app.use(fileUpload({
    limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 }, // 10MB
    useTempFiles: true,
    tempFileDir: '/tmp/'
}));

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Flash messages middleware
app.use((req, res, next) => {
    res.locals.messages = req.session.messages || {};
    req.session.messages = {};
    
    req.flash = function(type, message) {
        if (!req.session.messages) req.session.messages = {};
        if (!req.session.messages[type]) req.session.messages[type] = [];
        req.session.messages[type].push(message);
    };
    
    next();
});

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Content-For helper for EJS
app.locals.contentFor = function(name) {
    return function(text) {
        if (!this._sections) this._sections = {};
        this._sections[name] = text;
        return '';
    };
};

// Make contentFor available in templates
app.use((req, res, next) => {
    res.locals.contentFor = function(name) {
        return function(text) {
            if (!res.locals._sections) res.locals._sections = {};
            res.locals._sections[name] = text;
            return '';
        };
    };
    next();
});

// Routes
const adminRoutes = require('./src/routes/admin');

// Mount routes
app.use('/admin', adminRoutes);

// Main dashboard route
app.get('/', async (req, res) => {
    try {
        const stats = await db.getDashboardStats();
        const recentZones = await db.query(`
            SELECT * FROM zone_stats 
            WHERE is_active = true 
            ORDER BY created_at DESC 
            LIMIT 5
        `);
        
        res.render('dashboard', {
            title: 'Dashboard',
            stats,
            recentZones: recentZones.rows,
            showSidebar: false
        });
    } catch (error) {
        console.error('Error loading dashboard:', error);
        res.status(500).render('error', {
            error: 'Error loading dashboard',
            message: error.message
        });
    }
});

// Restaurants page
app.get('/restaurants', async (req, res) => {
    try {
        const { zone, cuisine, has_email, page = 1 } = req.query;
        const limit = 50;
        const offset = (page - 1) * limit;
        
        let query = `
            SELECT r.*, z.display_name as zone_name 
            FROM restaurants r
            JOIN zones z ON r.zone_id = z.id
            WHERE 1=1
        `;
        const params = [];
        let paramCount = 1;
        
        if (zone) {
            query += ` AND r.zone_id = $${paramCount}`;
            params.push(zone);
            paramCount++;
        }
        
        if (cuisine) {
            query += ` AND r.cuisine_type ILIKE $${paramCount}`;
            params.push(`%${cuisine}%`);
            paramCount++;
        }
        
        if (has_email === 'true') {
            query += ` AND r.has_email = true`;
        }
        
        query += ` ORDER BY r.name ASC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
        params.push(limit, offset);
        
        const restaurants = await db.query(query, params);
        
        // Get zones for filter
        const zones = await db.getAllZones();
        
        res.render('restaurants', {
            title: 'Restaurants',
            restaurants: restaurants.rows,
            zones: zones.rows,
            filters: { zone, cuisine, has_email },
            currentPage: parseInt(page),
            showSidebar: false
        });
    } catch (error) {
        console.error('Error loading restaurants:', error);
        res.status(500).render('error', {
            error: 'Error loading restaurants',
            message: error.message
        });
    }
});

// Scraping page
app.get('/scraping', async (req, res) => {
    try {
        const activeJobs = await db.getActiveScrapingJobs();
        const zones = await db.getAllZones();
        
        res.render('scraping', {
            title: 'Scraping Jobs',
            activeJobs: activeJobs.rows,
            zones: zones.rows,
            showSidebar: false
        });
    } catch (error) {
        console.error('Error loading scraping page:', error);
        res.status(500).render('error', {
            error: 'Error loading scraping page',
            message: error.message
        });
    }
});

// API Routes
app.get('/api/system/status', (req, res) => {
    res.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const stats = await db.getDashboardStats();
        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// API route for starting scraping
app.post('/api/scraping/start/:zoneId', async (req, res) => {
    try {
        const { zoneId } = req.params;
        
        // TODO: Implement actual scraping job creation
        const job = await db.createScrapingJob({
            zone_id: zoneId,
            job_type: 'full_scrape',
            total_items: 0
        });
        
        res.json({
            success: true,
            job,
            message: 'Scraping job started successfully'
        });
    } catch (error) {
        console.error('Error starting scraping job:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Error handling middleware
app.use((req, res, next) => {
    res.status(404).render('error', {
        error: '404 - Page Not Found',
        message: 'The requested page could not be found.',
        showSidebar: false
    });
});

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    
    res.status(err.status || 500).render('error', {
        error: err.status === 500 ? 'Internal Server Error' : err.message,
        message: process.env.NODE_ENV === 'development' ? err.stack : 'Something went wrong.',
        showSidebar: false
    });
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`🚀 Rogers Green Restaurant Scraper running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`⚙️  Admin Panel: http://localhost:${PORT}/admin`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
        db.close();
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Process terminated');
        db.close();
    });
});

module.exports = app;