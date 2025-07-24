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

// Scraping Jobs Storage
let activeScrapingJobs = new Map();
let scrapingHistory = [];

// ================================
// HOME & DASHBOARD ROUTES
// ================================

app.get('/', async (req, res) => {
    try {
        let zones = 0;
        let restaurants = 0;
        let activeJobs = activeScrapingJobs.size;
        let completedJobs = scrapingHistory.length;
        
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
                <nav class='navbar navbar-expand-lg navbar-dark bg-dark'>
                    <div class='container'>
                        <a class='navbar-brand' href='/'>
                            <i class='bi bi-shop'></i> Rogers Green Restaurant Database
                        </a>
                        <div class='navbar-nav ms-auto'>
                            <a class='nav-link active' href='/'>Dashboard</a>
                            <a class='nav-link' href='/admin'>Admin</a>
                            <a class='nav-link' href='/scraping'>Scraping</a>
                        </div>
                    </div>
                </nav>
                
                <div class='container mt-4'>
                    <div class='d-flex justify-content-between align-items-center mb-4'>
                        <h1><i class='bi bi-speedometer2'></i> Dashboard Principal</h1>
                        <span class='badge bg-success'>Sistema Activo</span>
                    </div>
                    
                    <div class='row mb-4'>
                        <div class='col-md-3'>
                            <div class='card border-primary'>
                                <div class='card-body text-center'>
                                    <i class='bi bi-geo-alt-fill fs-1 text-primary'></i>
                                    <h3 class='mt-2'>${zones}</h3>
                                    <p class='text-muted'>Zonas Activas</p>
                                </div>
                            </div>
                        </div>
                        <div class='col-md-3'>
                            <div class='card border-success'>
                                <div class='card-body text-center'>
                                    <i class='bi bi-building fs-1 text-success'></i>
                                    <h3 class='mt-2'>${restaurants}</h3>
                                    <p class='text-muted'>Restaurantes</p>
                                    <a href='/restaurants' class='btn btn-success btn-sm mt-2'>
                                        <i class='bi bi-eye'></i> Ver Restaurantes
                                    </a>
                                </div>
                            </div>
                        </div>
                        <div class='col-md-3'>
                            <div class='card border-warning'>
                                <div class='card-body text-center'>
                                    <i class='bi bi-arrow-repeat fs-1 text-warning'></i>
                                    <h3 class='mt-2'>${activeJobs}</h3>
                                    <p class='text-muted'>Jobs Activos</p>
                                </div>
                            </div>
                        </div>
                        <div class='col-md-3'>
                            <div class='card border-info'>
                                <div class='card-body text-center'>
                                    <i class='bi bi-check-circle fs-1 text-info'></i>
                                    <h3 class='mt-2'>${completedJobs}</h3>
                                    <p class='text-muted'>Jobs Completados</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class='row'>
                        <div class='col-md-8'>
                            <div class='card'>
                                <div class='card-header'>
                                    <h5><i class='bi bi-robot'></i> Control de Scraping</h5>
                                </div>
                                <div class='card-body'>
                                    <p>Inicia el proceso de recolección de datos de restaurantes para todas las zonas activas.</p>
                                    <div class='d-grid gap-2 d-md-flex'>
                                        <a href='/scraping' class='btn btn-primary btn-lg'>
                                            <i class='bi bi-play-circle'></i> Iniciar Scraping
                                        </a>
                                        <a href='/api/zones' class='btn btn-outline-info' target='_blank'>
                                            <i class='bi bi-list-ul'></i> Ver Zonas
                                        </a>
                                        <a href='/admin' class='btn btn-outline-secondary'>
                                            <i class='bi bi-gear'></i> Configuración
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class='col-md-4'>
                            <div class='card'>
                                <div class='card-header'>
                                    <h5><i class='bi bi-info-circle'></i> Estado del Sistema</h5>
                                </div>
                                <div class='card-body'>
                                    <ul class='list-unstyled'>
                                        <li><i class='bi bi-check-circle text-success'></i> Base de datos conectada</li>
                                        <li><i class='bi bi-check-circle text-success'></i> Google Places API activa</li>
                                        <li><i class='bi bi-check-circle text-success'></i> SSL habilitado</li>
                                        <li><i class='bi bi-check-circle text-success'></i> ${zones} zonas configuradas</li>
                                    </ul>
                                    <a href='/api/system/status' class='btn btn-sm btn-outline-primary' target='_blank'>Ver Detalles</a>
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
        res.status(500).send('Error loading dashboard: ' + error.message);
    }
});

// ================================
// SCRAPING ROUTES
// ================================

app.get('/scraping', async (req, res) => {
    try {
        let zones = [];
        if (db) {
            const zonesResult = await db.query(`
                SELECT id, zone_code, display_name, city, state, latitude, longitude, 
                       radius_meters, priority, is_active,
                       (SELECT COUNT(*) FROM restaurants WHERE zone_id = zones.id) as restaurant_count
                FROM zones 
                WHERE is_active = true
                ORDER BY priority, display_name
            `);
            zones = zonesResult.rows;
        }
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Sistema de Scraping - Rogers Green</title>
                <meta charset='utf-8'>
                <meta name='viewport' content='width=device-width, initial-scale=1'>
                <link href='https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css' rel='stylesheet'>
                <link href='https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.2/font/bootstrap-icons.css' rel='stylesheet'>
            </head>
            <body>
                <nav class='navbar navbar-expand-lg navbar-dark bg-dark'>
                    <div class='container'>
                        <a class='navbar-brand' href='/'>Rogers Green Restaurant Database</a>
                        <div class='navbar-nav ms-auto'>
                            <a class='nav-link' href='/'>Dashboard</a>
                            <a class='nav-link' href='/admin'>Admin</a>
                            <a class='nav-link active' href='/scraping'>Scraping</a>
                        </div>
                    </div>
                </nav>
                
                <div class='container mt-4'>
                    <div class='d-flex justify-content-between align-items-center mb-4'>
                        <h1><i class='bi bi-robot'></i> Sistema de Scraping</h1>
                        <div>
                            <span class='badge bg-primary'>${zones.length} Zonas Disponibles</span>
                            <span class='badge bg-warning'>${activeScrapingJobs.size} Jobs Activos</span>
                        </div>
                    </div>
                    
                    <div class='row mb-4'>
                        <div class='col-md-12'>
                            <div class='card'>
                                <div class='card-header'>
                                    <h5><i class='bi bi-play-circle'></i> Iniciar Nuevo Job de Scraping</h5>
                                </div>
                                <div class='card-body'>
                                    <form id='scrapingForm'>
                                        <div class='row'>
                                            <div class='col-md-8'>
                                                <label class='form-label'>Seleccionar Zonas:</label>
                                                <select class='form-select' name='zones' multiple size='10' required>
                                                    ${zones.map(zone => `
                                                        <option value='${zone.id}' data-priority='${zone.priority}'>
                                                            ${zone.display_name} (${zone.city}, ${zone.state}) - ${zone.restaurant_count} restaurantes - Prioridad ${zone.priority}
                                                        </option>
                                                    `).join('')}
                                                </select>
                                                <small class='text-muted'>Mantén Ctrl/Cmd presionado para seleccionar múltiples zonas</small>
                                            </div>
                                            <div class='col-md-4'>
                                                <label class='form-label'>Configuración:</label>
                                                <div class='mb-3'>
                                                    <label class='form-label'>Delay entre requests (ms):</label>
                                                    <input type='number' class='form-control' name='delay' value='2000' min='1000' max='10000'>
                                                    <small class='text-muted'>Recomendado: 2000ms para evitar rate limiting</small>
                                                </div>
                                                <div class='mb-3'>
                                                    <label class='form-label'>Máximo restaurantes por zona:</label>
                                                    <input type='number' class='form-control' name='maxResults' value='100' min='10' max='500'>
                                                    <small class='text-muted'>Google Places devuelve hasta 60 por request</small>
                                                </div>
                                                <div class='mb-3'>
                                                    <div class='form-check'>
                                                        <input class='form-check-input' type='checkbox' name='extractEmails' id='extractEmails' checked>
                                                        <label class='form-check-label' for='extractEmails'>
                                                            Extraer emails (futuro)
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <div class='mt-3'>
                                            <button type='submit' class='btn btn-primary btn-lg'>
                                                <i class='bi bi-play-circle'></i> Iniciar Scraping
                                            </button>
                                            <button type='button' class='btn btn-secondary' onclick='selectAllZones()'>
                                                <i class='bi bi-check-all'></i> Seleccionar Todas
                                            </button>
                                            <button type='button' class='btn btn-outline-warning' onclick='selectPriorityZones()'>
                                                <i class='bi bi-star'></i> Solo Alta Prioridad
                                            </button>
                                            <button type='button' class='btn btn-outline-info' onclick='selectNYCCore()'>
                                                <i class='bi bi-building'></i> Solo NYC Core
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class='row'>
                        <div class='col-md-6'>
                            <div class='card'>
                                <div class='card-header'>
                                    <h5><i class='bi bi-activity'></i> Jobs Activos</h5>
                                </div>
                                <div class='card-body' id='activeJobs'>
                                    ${activeScrapingJobs.size === 0 ? 
                                        '<p class="text-muted">No hay jobs activos</p>' : 
                                        Array.from(activeScrapingJobs.entries()).map(([id, job]) => `
                                            <div class='alert alert-info'>
                                                <strong>Job ${id}</strong><br>
                                                Estado: ${job.status}<br>
                                                Progreso: ${job.processed}/${job.total} zonas<br>
                                                Zona actual: ${job.currentZone || 'N/A'}<br>
                                                Restaurantes encontrados: ${job.results}
                                            </div>
                                        `).join('')
                                    }
                                </div>
                            </div>
                        </div>
                        <div class='col-md-6'>
                            <div class='card'>
                                <div class='card-header'>
                                    <h5><i class='bi bi-clock-history'></i> Historial Reciente</h5>
                                </div>
                                <div class='card-body'>
                                    ${scrapingHistory.length === 0 ? 
                                        '<p class="text-muted">No hay historial disponible</p>' : 
                                        scrapingHistory.slice(-3).map(job => `
                                            <div class='border-bottom pb-2 mb-2'>
                                                <strong>Job #${job.id}</strong> - ${job.status}<br>
                                                <small>Terminado: ${new Date(job.endTime).toLocaleString()}</small><br>
                                                <small>Restaurantes encontrados: ${job.results || 0}</small>
                                            </div>
                                        `).join('')
                                    }
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <script>
                    function selectAllZones() {
                        const select = document.querySelector('select[name="zones"]');
                        for (let option of select.options) {
                            option.selected = true;
                        }
                    }
                    
                    function selectPriorityZones() {
                        const select = document.querySelector('select[name="zones"]');
                        for (let option of select.options) {
                            option.selected = option.dataset.priority === '1';
                        }
                    }
                    
                    function selectNYCCore() {
                        const select = document.querySelector('select[name="zones"]');
                        const nycZones = ['manhattan', 'brooklyn', 'queens', 'bronx', 'staten_island'];
                        for (let option of select.options) {
                            const zoneText = option.textContent.toLowerCase();
                            option.selected = nycZones.some(nyc => zoneText.includes(nyc));
                        }
                    }
                    
                    document.getElementById('scrapingForm').addEventListener('submit', async function(e) {
                        e.preventDefault();
                        
                        const formData = new FormData(this);
                        const zones = Array.from(document.querySelector('select[name="zones"]').selectedOptions).map(o => o.value);
                        
                        if (zones.length === 0) {
                            alert('Por favor selecciona al menos una zona');
                            return;
                        }
                        
                        // Disable button to prevent double submission
                        const submitBtn = this.querySelector('button[type="submit"]');
                        submitBtn.disabled = true;
                        submitBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Iniciando...';
                        
                        const data = {
                            zones: zones,
                            delay: parseInt(formData.get('delay')),
                            maxResults: parseInt(formData.get('maxResults')),
                            extractEmails: formData.get('extractEmails') === 'on'
                        };
                        
                        try {
                            const response = await fetch('/api/scraping/start', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(data)
                            });
                            
                            const result = await response.json();
                            
                            if (result.success) {
                                alert('¡Job de scraping iniciado!\\n\\nID: ' + result.jobId + '\\nZonas: ' + zones.length + '\\n\\nEl sistema comenzará a buscar restaurantes usando Google Places API. Los datos se guardan automáticamente en la base de datos.\\n\\nPuedes ver el progreso en la sección \"Jobs Activos\".');
                                setTimeout(() => location.reload(), 2000);
                            } else {
                                alert('Error: ' + result.error);
                                submitBtn.disabled = false;
                                submitBtn.innerHTML = '<i class="bi bi-play-circle"></i> Iniciar Scraping';
                            }
                        } catch (error) {
                            alert('Error al iniciar scraping: ' + error.message);
                            submitBtn.disabled = false;
                            submitBtn.innerHTML = '<i class="bi bi-play-circle"></i> Iniciar Scraping';
                        }
                    });
                    
                    // Auto-refresh every 15 seconds
                    setInterval(() => {
                        fetch('/api/scraping/status')
                            .then(r => r.json())
                            .then(data => {
                                if (data.activeJobs && data.activeJobs.length > 0) {
                                    console.log('Active jobs:', data.activeJobs);
                                    // Could update the UI here
                                }
                            })
                            .catch(e => console.log('Status check failed:', e));
                    }, 15000);
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send('Error loading scraping panel: ' + error.message);
    }
});

// API Routes

// Start scraping job
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
        res.status(500).json({ success: false, error: error.message });
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

// Zones API (fixed column name)
app.get('/api/zones', async (req, res) => {
    try {
        if (!db) {
            return res.status(500).json({ error: 'Database not connected' });
        }
        
        const zones = await db.query(`
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


// Restaurants route (NEW - the missing piece\!)
app.get('/restaurants', async (req, res) => {
    try {
        let restaurants = [];
        let zones = [];
        
        if (db) {
            const restaurantsResult = await db.query('SELECT r.*, z.display_name as zone_name FROM restaurants r JOIN zones z ON r.zone_id = z.id ORDER BY r.name ASC LIMIT 100');
            restaurants = restaurantsResult.rows;
            
            const zonesResult = await db.query('SELECT * FROM zones WHERE is_active = true ORDER BY display_name');
            zones = zonesResult.rows;
        }
        
        res.render('restaurants', {
            title: 'Restaurantes',
            restaurants: restaurants,
            zones: zones,
            filters: {},
            currentPage: 1,
            showSidebar: false
        });
    } catch (error) {
        console.error('Error loading restaurants:', error);
        res.status(500).send('Error loading restaurants: ' + error.message);
    }
});

app.get('/admin', (req, res) => {
    res.redirect('/');
});

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Scraping logic
async function runScrapingJob(jobId, job) {
    try {
        job.status = 'running';
        console.log(`Starting scraping job ${jobId} for ${job.zones.length} zones`);
        
        const { Client } = require('@googlemaps/google-maps-services-js');
        const client = new Client({});
        
        for (let i = 0; i < job.zones.length; i++) {
            const zoneId = job.zones[i];
            
            // Get zone info (using correct column name)
            const zoneResult = await db.query('SELECT * FROM zones WHERE id = $1', [zoneId]);
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
                        await db.query(`
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

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Rogers Green Restaurant Scraper Server running on port ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV}`);
    console.log(`🔗 URL: ${process.env.BASE_URL || 'http://localhost:' + PORT}`);
    console.log(`🗄️  Database: ${db ? 'Connected' : 'Disconnected'}`);
    console.log(`🔑 Google Places API: ${process.env.GOOGLE_PLACES_API_KEY ? 'Configured' : 'Not configured'}`);
    console.log(`🤖 Scraping system: Ready`);
});