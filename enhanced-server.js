const express = require('express');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
            scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
            imgSrc: ["'self'", 'data:', 'https:'],
            fontSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        },
    },
}));

app.use(cors());

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Database connection test
const { Pool } = require('pg');
let db = null;

try {
    db = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
} catch (error) {
    console.log('Database connection error:', error.message);
}

// Routes

// Home route
app.get('/', async (req, res) => {
    try {
        let zones = 0;
        let restaurants = 0;
        
        if (db) {
            const zonesResult = await db.query('SELECT COUNT(*) as count FROM zones WHERE is_active = true');
            zones = zonesResult.rows[0]?.count || 0;
            
            const restaurantsResult = await db.query('SELECT COUNT(*) as count FROM restaurants');
            restaurants = restaurantsResult.rows[0]?.count || 0;
        }
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Rogers Green Restaurant Database</title>
                <meta charset='utf-8'>
                <meta name='viewport' content='width=device-width, initial-scale=1'>
                <link href='https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css' rel='stylesheet'>
                <link href='https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.2/font/bootstrap-icons.css' rel='stylesheet'>
            </head>
            <body>
                <div class='container mt-5'>
                    <div class='row justify-content-center'>
                        <div class='col-md-8'>
                            <div class='card shadow'>
                                <div class='card-body text-center'>
                                    <h1 class='card-title'><i class='bi bi-shop'></i> Rogers Green Restaurant Database</h1>
                                    <p class='card-text'>Sistema escalable de recolección de datos de restaurantes con gestión dinámica de zonas</p>
                                    <div class='row mt-4'>
                                        <div class='col-md-6'>
                                            <div class='card bg-primary text-white'>
                                                <div class='card-body'>
                                                    <h3>${zones}</h3>
                                                    <p>Zonas Activas</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div class='col-md-6'>
                                            <div class='card bg-success text-white'>
                                                <div class='card-body'>
                                                    <h3>${restaurants}</h3>
                                                    <p>Restaurantes</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class='mt-4'>
                                        <a href='/admin' class='btn btn-primary me-2'><i class='bi bi-gear'></i> Panel Administrativo</a>
                                        <a href='/api/system/status' class='btn btn-outline-secondary'><i class='bi bi-info-circle'></i> Estado del Sistema</a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send('Error loading dashboard: ' + error.message);
    }
});

// API Routes

// System status
app.get('/api/system/status', async (req, res) => {
    try {
        let dbStatus = 'disconnected';
        let dbInfo = null;
        
        if (db) {
            const result = await db.query('SELECT NOW() as current_time, version() as version');
            dbStatus = 'connected';
            dbInfo = result.rows[0];
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

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Rogers Green Restaurant Scraper Server running on port ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV}`);
    console.log(`🔗 URL: ${process.env.BASE_URL || 'http://localhost:' + PORT}`);
    console.log(`🗄️  Database: ${db ? 'Connected' : 'Disconnected'}`);
    console.log(`🔑 Google Places API: ${process.env.GOOGLE_PLACES_API_KEY ? 'Configured' : 'Not configured'}`);
});