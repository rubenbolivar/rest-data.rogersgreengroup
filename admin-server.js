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
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Database connection
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

// Admin Panel Route
app.get('/admin', async (req, res) => {
    try {
        let stats = {
            total_zones: 0,
            active_zones: 0,
            total_restaurants: 0,
            active_templates: 0
        };
        
        if (db) {
            const result = await db.query(`
                SELECT 
                    (SELECT COUNT(*) FROM zones) as total_zones,
                    (SELECT COUNT(*) FROM zones WHERE is_active = true) as active_zones,
                    (SELECT COUNT(*) FROM restaurants) as total_restaurants,
                    (SELECT COUNT(*) FROM zone_templates WHERE is_active = true) as active_templates
            `);
            stats = result.rows[0] || stats;
        }
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Panel Administrativo - Rogers Green Restaurant Database</title>
                <meta charset='utf-8'>
                <meta name='viewport' content='width=device-width, initial-scale=1'>
                <link href='https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css' rel='stylesheet'>
                <link href='https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.2/font/bootstrap-icons.css' rel='stylesheet'>
                <style>
                    .stat-card { border-left: 4px solid; }
                    .stat-card.primary { border-left-color: #0d6efd; }
                    .stat-card.success { border-left-color: #198754; }
                    .stat-card.warning { border-left-color: #ffc107; }
                    .stat-card.info { border-left-color: #0dcaf0; }
                </style>
            </head>
            <body>
                <nav class='navbar navbar-expand-lg navbar-dark bg-dark'>
                    <div class='container'>
                        <a class='navbar-brand' href='/'>
                            <i class='bi bi-shop'></i> Rogers Green Restaurant Database
                        </a>
                        <div class='navbar-nav ms-auto'>
                            <a class='nav-link' href='/'>Dashboard</a>
                            <a class='nav-link active' href='/admin'>Admin</a>
                        </div>
                    </div>
                </nav>
                
                <div class='container mt-4'>
                    <div class='d-flex justify-content-between align-items-center mb-4'>
                        <h1><i class='bi bi-shield-check'></i> Panel Administrativo</h1>
                        <span class='badge bg-success'>Sistema Activo</span>
                    </div>
                    
                    <!-- Statistics Cards -->
                    <div class='row mb-4'>
                        <div class='col-md-3'>
                            <div class='card stat-card primary'>
                                <div class='card-body text-center'>
                                    <i class='bi bi-geo-alt-fill fs-2 text-primary'></i>
                                    <h3 class='mt-2'>${stats.active_zones}</h3>
                                    <p class='text-muted'>Zonas Activas</p>
                                </div>
                            </div>
                        </div>
                        <div class='col-md-3'>
                            <div class='card stat-card success'>
                                <div class='card-body text-center'>
                                    <i class='bi bi-building fs-2 text-success'></i>
                                    <h3 class='mt-2'>${stats.total_restaurants}</h3>
                                    <p class='text-muted'>Restaurantes</p>
                                </div>
                            </div>
                        </div>
                        <div class='col-md-3'>
                            <div class='card stat-card warning'>
                                <div class='card-body text-center'>
                                    <i class='bi bi-collection fs-2 text-warning'></i>
                                    <h3 class='mt-2'>${stats.active_templates}</h3>
                                    <p class='text-muted'>Templates</p>
                                </div>
                            </div>
                        </div>
                        <div class='col-md-3'>
                            <div class='card stat-card info'>
                                <div class='card-body text-center'>
                                    <i class='bi bi-database fs-2 text-info'></i>
                                    <h3 class='mt-2'>${stats.total_zones}</h3>
                                    <p class='text-muted'>Total Zonas</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Management Cards -->
                    <div class='row'>
                        <div class='col-md-4'>
                            <div class='card h-100'>
                                <div class='card-header bg-primary text-white'>
                                    <h5 class='mb-0'><i class='bi bi-geo-alt'></i> Gestión de Zonas</h5>
                                </div>
                                <div class='card-body'>
                                    <p>Administrar zonas geográficas para scraping de restaurantes</p>
                                    <ul class='list-unstyled'>
                                        <li><i class='bi bi-check-circle text-success'></i> Ver zonas activas</li>
                                        <li><i class='bi bi-check-circle text-success'></i> Agregar nuevas zonas</li>
                                        <li><i class='bi bi-check-circle text-success'></i> Editar configuraciones</li>
                                        <li><i class='bi bi-check-circle text-success'></i> Import/Export CSV</li>
                                    </ul>
                                </div>
                                <div class='card-footer'>
                                    <a href='/admin/zones' class='btn btn-primary w-100'>Gestionar Zonas</a>
                                </div>
                            </div>
                        </div>
                        
                        <div class='col-md-4'>
                            <div class='card h-100'>
                                <div class='card-header bg-success text-white'>
                                    <h5 class='mb-0'><i class='bi bi-database'></i> Base de Datos</h5>
                                </div>
                                <div class='card-body'>
                                    <p>Ver estadísticas y gestionar datos del sistema</p>
                                    <ul class='list-unstyled'>
                                        <li><i class='bi bi-bar-chart text-primary'></i> Estadísticas detalladas</li>
                                        <li><i class='bi bi-table text-primary'></i> Vista de datos</li>
                                        <li><i class='bi bi-download text-primary'></i> Exportar datos</li>
                                        <li><i class='bi bi-gear text-primary'></i> Configuración</li>
                                    </ul>
                                </div>
                                <div class='card-footer'>
                                    <a href='/api/stats' class='btn btn-success w-100' target='_blank'>Ver Estadísticas</a>
                                </div>
                            </div>
                        </div>
                        
                        <div class='col-md-4'>
                            <div class='card h-100'>
                                <div class='card-header bg-info text-white'>
                                    <h5 class='mb-0'><i class='bi bi-gear'></i> Sistema</h5>
                                </div>
                                <div class='card-body'>
                                    <p>Estado del sistema y herramientas de monitoreo</p>
                                    <ul class='list-unstyled'>
                                        <li><i class='bi bi-activity text-warning'></i> Estado del servidor</li>
                                        <li><i class='bi bi-hdd text-warning'></i> Uso de recursos</li>
                                        <li><i class='bi bi-shield-check text-warning'></i> Seguridad</li>
                                        <li><i class='bi bi-cloud-check text-warning'></i> APIs externas</li>
                                    </ul>
                                </div>
                                <div class='card-footer'>
                                    <a href='/api/system/status' class='btn btn-info w-100' target='_blank'>Estado del Sistema</a>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Quick Actions -->
                    <div class='row mt-4'>
                        <div class='col-12'>
                            <div class='card'>
                                <div class='card-header'>
                                    <h5 class='mb-0'><i class='bi bi-lightning'></i> Acciones Rápidas</h5>
                                </div>
                                <div class='card-body'>
                                    <div class='row'>
                                        <div class='col-md-3'>
                                            <a href='/api/zones' class='btn btn-outline-primary w-100 mb-2' target='_blank'>
                                                <i class='bi bi-list-ul'></i> Ver API Zonas
                                            </a>
                                        </div>
                                        <div class='col-md-3'>
                                            <a href='/api/test/google-places' class='btn btn-outline-success w-100 mb-2' target='_blank'>
                                                <i class='bi bi-map'></i> Test Google Places
                                            </a>
                                        </div>
                                        <div class='col-md-3'>
                                            <a href='/health' class='btn btn-outline-info w-100 mb-2' target='_blank'>
                                                <i class='bi bi-heart-pulse'></i> Health Check
                                            </a>
                                        </div>
                                        <div class='col-md-3'>
                                            <button class='btn btn-outline-warning w-100 mb-2' onclick='alert("Funcionalidad próximamente")'>
                                                <i class='bi bi-tools'></i> Herramientas
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <script src='https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js'></script>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send('Error loading admin panel: ' + error.message);
    }
});

// API Routes
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

app.get('/api/zones', async (req, res) => {
    try {
        if (!db) {
            return res.status(500).json({ error: 'Database not connected' });
        }
        
        const zones = await db.query(`
            SELECT 
                zone_id, zone_code, display_name, city, state, country,
                latitude, longitude, radius_meters, priority, is_active,
                created_at, updated_at,
                (SELECT COUNT(*) FROM restaurants WHERE zone_id = zones.zone_id) as restaurant_count
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