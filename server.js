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
const { Pool } = require('pg');

// Initialize direct database connection for scraping (fallback)
let directDb = null;
try {
    directDb = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
} catch (error) {
    console.log('Direct database connection error:', error.message);
}

// Scraping Jobs Storage
let activeScrapingJobs = new Map();
let scrapingHistory = [];

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
        const dbConn = directDb || db;
        let zones = [];
        
        if (dbConn) {
            const zonesResult = await dbConn.query(`
                SELECT id, zone_code, display_name, city, state, latitude, longitude, 
                       radius_meters, priority, is_active,
                       (SELECT COUNT(*) FROM restaurants WHERE zone_id = zones.id) as restaurant_count
                FROM zones 
                WHERE is_active = true
                ORDER BY priority, display_name
            `);
            zones = zonesResult.rows;
        }
        
        res.render('scraping', {
            title: 'Sistema de Scraping',
            zones: zones,
            activeJobs: Array.from(activeScrapingJobs.values()),
            showSidebar: false
        });
    } catch (error) {
        console.error('Error loading scraping page:', error);
        res.status(500).render('error', {
            error: 'Error loading scraping page',
            message: error.message,
            showSidebar: false
        });
    }
});

// API Routes (Enhanced system status)
app.get('/api/system/status', async (req, res) => {
    try {
        let dbStatus = 'disconnected';
        let dbInfo = null;
        
        const dbConn = directDb || db;
        if (dbConn) {
            try {
                const result = await dbConn.query('SELECT NOW() as current_time, version() as version');
                dbStatus = 'connected';
                dbInfo = result.rows[0];
            } catch (dbError) {
                console.error('Database status check failed:', dbError);
            }
        }
        
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            environment: process.env.NODE_ENV,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            database: {
                status: dbStatus,
                info: dbInfo
            },
            scraping: {
                activeJobs: activeScrapingJobs.size,
                completedJobs: scrapingHistory.length,
                totalProcessed: scrapingHistory.reduce((sum, job) => sum + (job.results || 0), 0)
            },
            features: {
                googlePlacesAPI: !!process.env.GOOGLE_PLACES_API_KEY,
                geocodingAPI: !!process.env.GOOGLE_GEOCODING_API_KEY,
                ssl: req.secure || req.headers['x-forwarded-proto'] === 'https'
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
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

// API route for starting scraping (enhanced with multi-zone support)
app.post('/api/scraping/start', async (req, res) => {
    try {
        const { zones, delay = 2000, maxResults = 100, extractEmails = true } = req.body;
        
        if (!zones || zones.length === 0) {
            return res.status(400).json({ success: false, error: 'No zones specified' });
        }
        
        const jobId = Date.now().toString();
        const job = {
            id: jobId,
            zones: zones,
            delay: delay,
            maxResults: maxResults,
            extractEmails: extractEmails,
            status: 'starting',
            processed: 0,
            total: zones.length,
            results: 0,
            startTime: new Date(),
            currentZone: null
        };
        
        activeScrapingJobs.set(jobId, job);
        
        // Start the scraping process (non-blocking)
        runScrapingJob(jobId, job);
        
        res.json({ 
            success: true, 
            jobId: jobId,
            message: `Job iniciado para ${zones.length} zonas`
        });
        
    } catch (error) {
        console.error('Error starting scraping job:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// API route for single zone scraping (backward compatibility)
app.post('/api/scraping/start/:zoneId', async (req, res) => {
    try {
        const { zoneId } = req.params;
        const { delay = 2000, maxResults = 100, extractEmails = true } = req.body;
        
        // Create single-zone job directly (no self-fetch)
        const jobId = Date.now().toString();
        const job = {
            id: jobId,
            zones: [zoneId],
            delay: delay,
            maxResults: maxResults,
            extractEmails: extractEmails,
            status: 'starting',
            processed: 0,
            total: 1,
            results: 0,
            startTime: new Date(),
            currentZone: null
        };
        
        activeScrapingJobs.set(jobId, job);
        
        // Start the scraping process (non-blocking)
        runScrapingJob(jobId, job);
        
        res.json({ 
            success: true, 
            jobId: jobId,
            message: `Job iniciado para zona ${zoneId}`
        });
        
    } catch (error) {
        console.error('Error starting single zone scraping job:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get scraping status
app.get('/api/scraping/status', (req, res) => {
    const activeJobs = Array.from(activeScrapingJobs.entries()).map(([id, job]) => ({
        id,
        status: job.status,
        processed: job.processed,
        total: job.total,
        results: job.results,
        currentZone: job.currentZone
    }));
    
    res.json({
        activeJobs: activeJobs,
        totalActiveJobs: activeScrapingJobs.size,
        recentHistory: scrapingHistory.slice(-5)
    });
});

// Test Google Places API
app.get('/api/test/google-places', async (req, res) => {
    try {
        const { Client } = require('@googlemaps/google-maps-services-js');
        const client = new Client({});
        
        const response = await client.placesNearby({
            params: {
                location: '40.7831,-73.9712',
                radius: 1000,
                type: 'restaurant',
                key: process.env.GOOGLE_PLACES_API_KEY
            }
        });
        
        res.json({
            status: 'success',
            results_count: response.data.results?.length || 0,
            sample_results: response.data.results?.slice(0, 3) || [],
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Zones API with restaurant counts
app.get('/api/zones', async (req, res) => {
    try {
        const dbConn = directDb || db;
        if (!dbConn) {
            return res.status(500).json({ error: 'Database not connected' });
        }
        
        const zones = await dbConn.query(`
            SELECT 
                id, zone_code, display_name, city, state, country,
                latitude, longitude, radius_meters, priority, is_active,
                created_at, updated_at,
                (SELECT COUNT(*) FROM restaurants WHERE zone_id = zones.id) as restaurant_count
            FROM zones 
            ORDER BY priority, display_name
        `);
        
        res.json({
            zones: zones.rows,
            total: zones.rows.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            error: error.message,
            timestamp: new Date().toISOString()
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
        if (db && db.close) db.close();
        if (directDb) directDb.end();
    });
});

// Scraping logic function
async function runScrapingJob(jobId, job) {
    try {
        job.status = 'running';
        console.log(`Starting scraping job ${jobId} for ${job.zones.length} zones`);
        
        const { Client } = require('@googlemaps/google-maps-services-js');
        const client = new Client({});
        
        const dbConn = directDb || db;
        if (!dbConn) {
            throw new Error('No database connection available');
        }
        
        for (let i = 0; i < job.zones.length; i++) {
            const zoneId = job.zones[i];
            
            // Get zone info (using correct column name 'id')
            const zoneResult = await dbConn.query('SELECT * FROM zones WHERE id = $1', [zoneId]);
            if (zoneResult.rows.length === 0) continue;
            
            const zone = zoneResult.rows[0];
            job.currentZone = zone.display_name;
            
            console.log(`Processing zone: ${zone.display_name}`);
            
            try {
                // Search for restaurants using Google Places API
                const response = await client.placesNearby({
                    params: {
                        location: `${zone.latitude},${zone.longitude}`,
                        radius: zone.radius_meters,
                        type: 'restaurant',
                        key: process.env.GOOGLE_PLACES_API_KEY
                    }
                });
                
                const restaurants = response.data.results || [];
                console.log(`Found ${restaurants.length} restaurants in ${zone.display_name}`);
                
                // Save restaurants to database
                for (const restaurant of restaurants.slice(0, job.maxResults)) {
                    try {
                        await dbConn.query(`
                            INSERT INTO restaurants (
                                zone_id, google_place_id, name, address, latitude, longitude,
                                rating, price_level, phone, website, created_at
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
                            ON CONFLICT (google_place_id) DO NOTHING
                        `, [
                            zone.id, // Using correct column name
                            restaurant.place_id,
                            restaurant.name,
                            restaurant.vicinity || restaurant.formatted_address,
                            restaurant.geometry?.location?.lat,
                            restaurant.geometry?.location?.lng,
                            restaurant.rating,
                            restaurant.price_level,
                            null, // phone - would need Places Details API
                            null, // website - would need Places Details API
                        ]);
                        
                        job.results++;
                    } catch (dbError) {
                        console.error('Error saving restaurant:', dbError.message);
                    }
                }
                
            } catch (apiError) {
                console.error(`Error processing zone ${zone.display_name}:`, apiError.message);
            }
            
            job.processed++;
            
            // Delay between zones
            if (i < job.zones.length - 1) {
                await new Promise(resolve => setTimeout(resolve, job.delay));
            }
        }
        
        job.status = 'completed';
        job.endTime = new Date();
        job.currentZone = null;
        
        // Move to history
        scrapingHistory.push({ ...job });
        activeScrapingJobs.delete(jobId);
        
        console.log(`Job ${jobId} completed. Found ${job.results} restaurants.`);
        
    } catch (error) {
        console.error(`Job ${jobId} failed:`, error);
        job.status = 'failed';
        job.error = error.message;
        job.endTime = new Date();
        
        // Move to history even if failed
        scrapingHistory.push({ ...job });
        activeScrapingJobs.delete(jobId);
    }
}

module.exports = app;