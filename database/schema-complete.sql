-- 🚀 RESTAURANT SCRAPER - COMPLETE DATABASE SCHEMA
-- Scalable restaurant scraping system with dynamic zone management
-- Created for Rogers Green Group - rest-data.rogersgreengroup.com

-- Drop existing tables if they exist (for fresh setup)
DROP TABLE IF EXISTS zone_changes CASCADE;
DROP TABLE IF EXISTS scraping_jobs CASCADE;
DROP TABLE IF EXISTS restaurants CASCADE;
DROP TABLE IF EXISTS zone_templates CASCADE;
DROP TABLE IF EXISTS zones CASCADE;

-- 🆕 TABLA PRINCIPAL DE ZONAS (Sistema dinámico)
CREATE TABLE zones (
    id SERIAL PRIMARY KEY,
    zone_code VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    
    -- Jerarquía geográfica
    country VARCHAR(50) NOT NULL DEFAULT 'US',
    state VARCHAR(50) NOT NULL,
    city VARCHAR(100) NOT NULL,
    region VARCHAR(100), -- County, Metropolitan Area, etc.
    
    -- Coordenadas y área de búsqueda
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    radius_meters INTEGER NOT NULL DEFAULT 5000,
    
    -- Configuración de scraping
    search_terms TEXT[] DEFAULT ARRAY['restaurant'],
    cuisine_focus TEXT[], -- ['kosher'] para Monsey, ['seafood'] para coastal
    priority INTEGER DEFAULT 1, -- 1=Alta, 2=Media, 3=Baja
    
    -- Metadatos operativos
    timezone VARCHAR(50) DEFAULT 'America/New_York',
    population INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    
    -- Audit trail
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    
    -- Constraints
    CONSTRAINT zones_priority_check CHECK (priority BETWEEN 1 AND 3),
    CONSTRAINT zones_radius_check CHECK (radius_meters > 0)
);

-- Índices para performance
CREATE INDEX idx_zones_country_state ON zones(country, state);
CREATE INDEX idx_zones_active ON zones(is_active);
CREATE INDEX idx_zones_priority ON zones(priority);
CREATE INDEX idx_zones_location ON zones(latitude, longitude);

-- 🆕 TABLA DE TEMPLATES DE ZONAS
CREATE TABLE zone_templates (
    id SERIAL PRIMARY KEY,
    template_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    default_radius INTEGER DEFAULT 5000,
    default_search_terms TEXT[] DEFAULT ARRAY['restaurant'],
    default_cuisine_focus TEXT[],
    default_priority INTEGER DEFAULT 2,
    config_json JSONB,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE
);

-- 🆕 TABLA DE HISTORIAL DE CAMBIOS
CREATE TABLE zone_changes (
    id SERIAL PRIMARY KEY,
    zone_id INTEGER REFERENCES zones(id) ON DELETE CASCADE,
    changed_by VARCHAR(100),
    change_type VARCHAR(50), -- 'created', 'updated', 'deleted', 'activated', 'deactivated'
    old_values JSONB,
    new_values JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- TABLA DE RESTAURANTES (Actualizada)
CREATE TABLE restaurants (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(255),
    website VARCHAR(255),
    cuisine_type VARCHAR(100),
    rating DECIMAL(3,2),
    price_level INTEGER,
    
    -- 🆕 Referencia a zona dinámica
    zone_id INTEGER REFERENCES zones(id),
    city VARCHAR(100),
    state VARCHAR(50),
    country VARCHAR(50) DEFAULT 'US',
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    
    -- Google Places data
    google_place_id VARCHAR(255) UNIQUE,
    google_types TEXT[],
    
    -- Data quality y metadata
    data_quality_score INTEGER DEFAULT 0,
    source VARCHAR(50) DEFAULT 'google_places',
    has_email BOOLEAN DEFAULT FALSE,
    has_website BOOLEAN DEFAULT FALSE,
    has_phone BOOLEAN DEFAULT FALSE,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_scraped TIMESTAMP,
    
    -- Constraints
    CONSTRAINT restaurants_rating_check CHECK (rating >= 0 AND rating <= 5),
    CONSTRAINT restaurants_price_level_check CHECK (price_level >= 0 AND price_level <= 4)
);

-- Índices optimizados
CREATE INDEX idx_restaurants_zone_cuisine ON restaurants(zone_id, cuisine_type);
CREATE INDEX idx_restaurants_location ON restaurants(latitude, longitude);
CREATE INDEX idx_restaurants_quality ON restaurants(data_quality_score);
CREATE INDEX idx_restaurants_email ON restaurants(has_email);
CREATE INDEX idx_restaurants_google_place ON restaurants(google_place_id);
CREATE INDEX idx_restaurants_name ON restaurants(name);

-- TABLA DE JOBS DE SCRAPING (Actualizada)
CREATE TABLE scraping_jobs (
    id SERIAL PRIMARY KEY,
    zone_id INTEGER REFERENCES zones(id),
    job_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    total_items INTEGER DEFAULT 0,
    processed_items INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    error_messages TEXT[],
    
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_scraping_jobs_status ON scraping_jobs(status);
CREATE INDEX idx_scraping_jobs_zone ON scraping_jobs(zone_id);

-- Función para actualizar timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para auto-actualizar timestamps
CREATE TRIGGER update_zones_updated_at BEFORE UPDATE ON zones
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_restaurants_updated_at BEFORE UPDATE ON restaurants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scraping_jobs_updated_at BEFORE UPDATE ON scraping_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Función para calcular data quality score
CREATE OR REPLACE FUNCTION calculate_data_quality_score()
RETURNS TRIGGER AS $$
BEGIN
    NEW.data_quality_score = 0;
    
    -- Name exists and is meaningful
    IF NEW.name IS NOT NULL AND LENGTH(NEW.name) > 2 THEN
        NEW.data_quality_score = NEW.data_quality_score + 20;
    END IF;
    
    -- Address exists
    IF NEW.address IS NOT NULL AND LENGTH(NEW.address) > 10 THEN
        NEW.data_quality_score = NEW.data_quality_score + 15;
    END IF;
    
    -- Phone exists
    IF NEW.phone IS NOT NULL AND LENGTH(NEW.phone) >= 10 THEN
        NEW.data_quality_score = NEW.data_quality_score + 20;
        NEW.has_phone = TRUE;
    ELSE
        NEW.has_phone = FALSE;
    END IF;
    
    -- Email exists
    IF NEW.email IS NOT NULL AND NEW.email LIKE '%@%' THEN
        NEW.data_quality_score = NEW.data_quality_score + 25;
        NEW.has_email = TRUE;
    ELSE
        NEW.has_email = FALSE;
    END IF;
    
    -- Website exists
    IF NEW.website IS NOT NULL AND (NEW.website LIKE 'http%' OR NEW.website LIKE 'www.%') THEN
        NEW.data_quality_score = NEW.data_quality_score + 15;
        NEW.has_website = TRUE;
    ELSE
        NEW.has_website = FALSE;
    END IF;
    
    -- Rating exists
    IF NEW.rating IS NOT NULL AND NEW.rating > 0 THEN
        NEW.data_quality_score = NEW.data_quality_score + 5;
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para calcular data quality score automáticamente
CREATE TRIGGER calculate_restaurant_quality BEFORE INSERT OR UPDATE ON restaurants
    FOR EACH ROW EXECUTE FUNCTION calculate_data_quality_score();

-- Vistas útiles para el dashboard
CREATE VIEW zone_stats AS
SELECT 
    z.*,
    COUNT(r.id) as restaurant_count,
    COUNT(CASE WHEN r.has_email THEN 1 END) as email_count,
    COUNT(CASE WHEN r.has_website THEN 1 END) as website_count,
    COUNT(CASE WHEN r.has_phone THEN 1 END) as phone_count,
    ROUND(AVG(r.data_quality_score)::numeric, 1) as avg_quality_score,
    CASE 
        WHEN COUNT(r.id) = 0 THEN 0
        ELSE ROUND((COUNT(CASE WHEN r.has_email THEN 1 END)::decimal / COUNT(r.id)) * 100, 1)
    END as email_coverage_percent
FROM zones z
LEFT JOIN restaurants r ON r.zone_id = z.id
GROUP BY z.id, z.zone_code, z.display_name, z.country, z.state, z.city, z.region,
         z.latitude, z.longitude, z.radius_meters, z.search_terms, z.cuisine_focus,
         z.priority, z.timezone, z.population, z.is_active, z.notes,
         z.created_at, z.updated_at, z.created_by;

-- Vista para jobs de scraping activos
CREATE VIEW active_scraping_jobs AS
SELECT 
    sj.*,
    z.display_name as zone_name,
    z.zone_code
FROM scraping_jobs sj
JOIN zones z ON sj.zone_id = z.id
WHERE sj.status IN ('pending', 'running', 'paused');

-- Comentarios en las tablas
COMMENT ON TABLE zones IS 'Dynamic zone management system - supports unlimited geographical areas';
COMMENT ON TABLE zone_templates IS 'Reusable templates for different types of geographical areas';
COMMENT ON TABLE restaurants IS 'Restaurant data with quality scoring and zone association';
COMMENT ON TABLE scraping_jobs IS 'Job queue for scraping operations with progress tracking';
COMMENT ON TABLE zone_changes IS 'Audit trail for all zone modifications';

COMMENT ON COLUMN zones.zone_code IS 'Unique identifier for the zone (lowercase, underscores)';
COMMENT ON COLUMN zones.search_terms IS 'Array of terms to search for in Google Places API';
COMMENT ON COLUMN zones.cuisine_focus IS 'Special cuisine types to focus on in this area';
COMMENT ON COLUMN zones.priority IS '1=High (daily), 2=Medium (weekly), 3=Low (monthly)';

COMMENT ON COLUMN restaurants.data_quality_score IS 'Auto-calculated score 0-100 based on available data fields';
COMMENT ON COLUMN restaurants.google_place_id IS 'Unique Google Places identifier to prevent duplicates';

-- Grant permissions (adjust as needed for your setup)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO restaurant_scraper_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO restaurant_scraper_user;