const { Pool } = require('pg');
const winston = require('winston');

class DatabaseService {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.errors({ stack: true }),
                winston.format.json()
            ),
            transports: [
                new winston.transports.Console(),
                new winston.transports.File({ filename: 'logs/database.log' })
            ]
        });

        this.pool.on('error', (err) => {
            this.logger.error('Unexpected error on idle client', err);
            process.exit(-1);
        });
    }

    async query(text, params = []) {
        const start = Date.now();
        try {
            const res = await this.pool.query(text, params);
            const duration = Date.now() - start;
            this.logger.info('Executed query', { 
                query: text.substring(0, 100), 
                duration, 
                rows: res.rowCount 
            });
            return res;
        } catch (error) {
            this.logger.error('Database query error', { 
                query: text.substring(0, 100), 
                params, 
                error: error.message 
            });
            throw error;
        }
    }

    async getClient() {
        return await this.pool.connect();
    }

    async transaction(callback) {
        const client = await this.getClient();
        try {
            await client.query('BEGIN');
            const result = await callback(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // Zone-related queries
    async getAllZones(includeInactive = false) {
        const whereClause = includeInactive ? '' : 'WHERE is_active = true';
        const query = `
            SELECT * FROM zone_stats 
            ${whereClause}
            ORDER BY priority ASC, display_name ASC
        `;
        return await this.query(query);
    }

    async getZoneById(id) {
        const query = 'SELECT * FROM zones WHERE id = $1';
        const result = await this.query(query, [id]);
        return result.rows[0];
    }

    async getZoneByCode(zoneCode) {
        const query = 'SELECT * FROM zones WHERE zone_code = $1';
        const result = await this.query(query, [zoneCode]);
        return result.rows[0];
    }

    async createZone(zoneData) {
        const {
            zone_code, display_name, country, state, city, region,
            latitude, longitude, radius_meters, search_terms, cuisine_focus,
            priority, timezone, population, is_active, notes, created_by
        } = zoneData;

        const query = `
            INSERT INTO zones (
                zone_code, display_name, country, state, city, region,
                latitude, longitude, radius_meters, search_terms, cuisine_focus,
                priority, timezone, population, is_active, notes, created_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            RETURNING *
        `;

        const values = [
            zone_code, display_name, country, state, city, region,
            latitude, longitude, radius_meters, search_terms, cuisine_focus,
            priority, timezone, population, is_active, notes, created_by
        ];

        return await this.query(query, values);
    }

    async updateZone(id, zoneData) {
        const fields = [];
        const values = [];
        let paramCount = 1;

        for (const [key, value] of Object.entries(zoneData)) {
            if (value !== undefined && key !== 'id') {
                fields.push(`${key} = $${paramCount}`);
                values.push(value);
                paramCount++;
            }
        }

        if (fields.length === 0) {
            throw new Error('No fields to update');
        }

        const query = `
            UPDATE zones 
            SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramCount}
            RETURNING *
        `;
        
        values.push(id);
        return await this.query(query, values);
    }

    async deleteZone(id) {
        // First, check if there are restaurants in this zone
        const checkQuery = 'SELECT COUNT(*) as count FROM restaurants WHERE zone_id = $1';
        const checkResult = await this.query(checkQuery, [id]);
        
        if (parseInt(checkResult.rows[0].count) > 0) {
            throw new Error('Cannot delete zone with existing restaurants');
        }

        const query = 'DELETE FROM zones WHERE id = $1 RETURNING *';
        return await this.query(query, [id]);
    }

    // Restaurant-related queries
    async getRestaurantsByZone(zoneId, filters = {}) {
        let query = `
            SELECT r.*, z.display_name as zone_name 
            FROM restaurants r
            JOIN zones z ON r.zone_id = z.id
            WHERE r.zone_id = $1
        `;
        const params = [zoneId];
        let paramCount = 2;

        if (filters.has_email) {
            query += ` AND r.has_email = $${paramCount}`;
            params.push(filters.has_email);
            paramCount++;
        }

        if (filters.cuisine_type) {
            query += ` AND r.cuisine_type ILIKE $${paramCount}`;
            params.push(`%${filters.cuisine_type}%`);
            paramCount++;
        }

        if (filters.min_rating) {
            query += ` AND r.rating >= $${paramCount}`;
            params.push(filters.min_rating);
            paramCount++;
        }

        query += ' ORDER BY r.name ASC';
        return await this.query(query, params);
    }

    async createRestaurant(restaurantData) {
        const {
            name, address, phone, email, website, cuisine_type, rating, price_level,
            zone_id, city, state, country, latitude, longitude, google_place_id,
            google_types, source
        } = restaurantData;

        const query = `
            INSERT INTO restaurants (
                name, address, phone, email, website, cuisine_type, rating, price_level,
                zone_id, city, state, country, latitude, longitude, google_place_id,
                google_types, source, last_scraped
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP)
            RETURNING *
        `;

        const values = [
            name, address, phone, email, website, cuisine_type, rating, price_level,
            zone_id, city, state, country, latitude, longitude, google_place_id,
            google_types, source
        ];

        return await this.query(query, values);
    }

    async updateRestaurant(id, restaurantData) {
        const fields = [];
        const values = [];
        let paramCount = 1;

        for (const [key, value] of Object.entries(restaurantData)) {
            if (value !== undefined && key !== 'id') {
                fields.push(`${key} = $${paramCount}`);
                values.push(value);
                paramCount++;
            }
        }

        if (fields.length === 0) {
            throw new Error('No fields to update');
        }

        const query = `
            UPDATE restaurants 
            SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramCount}
            RETURNING *
        `;
        
        values.push(id);
        return await this.query(query, values);
    }

    // Scraping jobs queries
    async createScrapingJob(jobData) {
        const { zone_id, job_type, total_items } = jobData;
        const query = `
            INSERT INTO scraping_jobs (zone_id, job_type, total_items, status, started_at)
            VALUES ($1, $2, $3, 'running', CURRENT_TIMESTAMP)
            RETURNING *
        `;
        return await this.query(query, [zone_id, job_type, total_items]);
    }

    async updateScrapingJob(id, updates) {
        const fields = [];
        const values = [];
        let paramCount = 1;

        for (const [key, value] of Object.entries(updates)) {
            if (value !== undefined && key !== 'id') {
                fields.push(`${key} = $${paramCount}`);
                values.push(value);
                paramCount++;
            }
        }

        const query = `
            UPDATE scraping_jobs 
            SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE id = $${paramCount}
            RETURNING *
        `;
        
        values.push(id);
        return await this.query(query, values);
    }

    async getActiveScrapingJobs() {
        const query = 'SELECT * FROM active_scraping_jobs ORDER BY created_at DESC';
        return await this.query(query);
    }

    // Zone templates queries
    async getZoneTemplates() {
        const query = 'SELECT * FROM zone_templates WHERE is_active = true ORDER BY template_name';
        return await this.query(query);
    }

    async getZoneTemplateById(id) {
        const query = 'SELECT * FROM zone_templates WHERE id = $1';
        const result = await this.query(query, [id]);
        return result.rows[0];
    }

    // Statistics and dashboard queries
    async getDashboardStats() {
        const queries = [
            'SELECT COUNT(*) as total_zones FROM zones WHERE is_active = true',
            'SELECT COUNT(*) as total_restaurants FROM restaurants',
            'SELECT COUNT(*) as restaurants_with_email FROM restaurants WHERE has_email = true',
            'SELECT COUNT(*) as active_jobs FROM scraping_jobs WHERE status IN (\'pending\', \'running\')',
            `SELECT 
                priority,
                COUNT(*) as zone_count,
                SUM(restaurant_count) as total_restaurants
             FROM zone_stats 
             WHERE is_active = true 
             GROUP BY priority 
             ORDER BY priority`,
            `SELECT 
                country,
                state,
                COUNT(*) as zone_count,
                SUM(restaurant_count) as total_restaurants
             FROM zone_stats 
             WHERE is_active = true 
             GROUP BY country, state 
             ORDER BY total_restaurants DESC 
             LIMIT 10`
        ];

        const results = await Promise.all(queries.map(query => this.query(query)));
        
        return {
            totalZones: parseInt(results[0].rows[0].total_zones),
            totalRestaurants: parseInt(results[1].rows[0].total_restaurants),
            restaurantsWithEmail: parseInt(results[2].rows[0].restaurants_with_email),
            activeJobs: parseInt(results[3].rows[0].active_jobs),
            priorityStats: results[4].rows,
            locationStats: results[5].rows
        };
    }

    async logZoneChange(zoneId, changeType, oldValues, newValues, changedBy = 'system') {
        const query = `
            INSERT INTO zone_changes (zone_id, changed_by, change_type, old_values, new_values)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        
        return await this.query(query, [
            zoneId, 
            changedBy, 
            changeType, 
            JSON.stringify(oldValues), 
            JSON.stringify(newValues)
        ]);
    }

    async close() {
        await this.pool.end();
    }
}

module.exports = new DatabaseService();