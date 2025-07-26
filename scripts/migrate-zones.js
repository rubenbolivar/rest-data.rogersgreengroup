#!/usr/bin/env node

/**
 * Migration script to convert existing zone configurations to dynamic system
 * This script helps migrate from hardcoded zones to the new database-driven system
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

class ZoneMigrationScript {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });
    }

    async run() {
        try {
            console.log('🚀 Starting Zone Migration Script...');
            console.log('📊 Checking database connection...');
            
            await this.testConnection();
            
            console.log('✅ Database connection successful');
            console.log('📋 Checking existing zones...');
            
            const existingZones = await this.checkExistingZones();
            console.log(`📍 Found ${existingZones.length} existing zones`);
            
            if (existingZones.length === 0) {
                console.log('🆕 No existing zones found, running initial setup...');
                await this.runInitialSetup();
            } else {
                console.log('🔄 Existing zones found, checking for updates...');
                await this.updateExistingZones();
            }
            
            console.log('📊 Generating zone statistics...');
            await this.generateStats();
            
            console.log('✅ Zone migration completed successfully!');
            
        } catch (error) {
            console.error('❌ Migration failed:', error.message);
            process.exit(1);
        } finally {
            await this.pool.end();
        }
    }

    async testConnection() {
        const client = await this.pool.connect();
        try {
            const result = await client.query('SELECT NOW()');
            console.log(`⏰ Database time: ${result.rows[0].now}`);
        } finally {
            client.release();
        }
    }

    async checkExistingZones() {
        const result = await this.pool.query('SELECT * FROM zones ORDER BY created_at');
        return result.rows;
    }

    async runInitialSetup() {
        console.log('📥 Loading schema...');
        
        // The schema should already be loaded, but we'll verify tables exist
        const tables = await this.pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('zones', 'zone_templates', 'restaurants', 'scraping_jobs')
        `);
        
        console.log(`📋 Found ${tables.rows.length} required tables`);
        
        if (tables.rows.length < 4) {
            throw new Error('Missing required database tables. Please run the schema first.');
        }
        
        // Load initial zones
        console.log('🌍 Loading initial zones...');
        await this.loadInitialZones();
        
        // Load zone templates
        console.log('📄 Loading zone templates...');
        await this.loadZoneTemplates();
    }

    async loadInitialZones() {
        const initialZones = [
            // NYC Core
            { code: 'manhattan', name: 'Manhattan, NYC', city: 'New York', state: 'NY', lat: 40.7831, lng: -73.9712, radius: 8000, priority: 1, region: 'New York Metropolitan Area' },
            { code: 'brooklyn', name: 'Brooklyn, NYC', city: 'Brooklyn', state: 'NY', lat: 40.6782, lng: -73.9442, radius: 12000, priority: 1, region: 'New York Metropolitan Area' },
            { code: 'queens', name: 'Queens, NYC', city: 'Queens', state: 'NY', lat: 40.7282, lng: -73.7949, radius: 15000, priority: 1, region: 'New York Metropolitan Area' },
            { code: 'bronx', name: 'Bronx, NYC', city: 'Bronx', state: 'NY', lat: 40.8448, lng: -73.8648, radius: 12000, priority: 1, region: 'New York Metropolitan Area' },
            { code: 'staten_island', name: 'Staten Island, NYC', city: 'Staten Island', state: 'NY', lat: 40.5795, lng: -74.1502, radius: 10000, priority: 2, region: 'New York Metropolitan Area' },
            
            // NYC Neighbors
            { code: 'jersey_city', name: 'Jersey City, NJ', city: 'Jersey City', state: 'NJ', lat: 40.7178, lng: -74.0431, radius: 8000, priority: 2, region: 'New York Metropolitan Area' },
            { code: 'hoboken', name: 'Hoboken, NJ', city: 'Hoboken', state: 'NJ', lat: 40.7439, lng: -74.0323, radius: 3000, priority: 2, region: 'New York Metropolitan Area' },
            { code: 'yonkers', name: 'Yonkers, NY', city: 'Yonkers', state: 'NY', lat: 40.9312, lng: -73.8988, radius: 8000, priority: 2, region: 'Westchester County' },
            { code: 'long_island_city', name: 'Long Island City, NY', city: 'Long Island City', state: 'NY', lat: 40.7505, lng: -73.9370, radius: 5000, priority: 2, region: 'New York Metropolitan Area' },
            { code: 'williamsburg', name: 'Williamsburg, Brooklyn', city: 'Brooklyn', state: 'NY', lat: 40.7081, lng: -73.9571, radius: 4000, priority: 2, region: 'New York Metropolitan Area' },
            { code: 'astoria', name: 'Astoria, Queens', city: 'Queens', state: 'NY', lat: 40.7722, lng: -73.9196, radius: 6000, priority: 2, region: 'New York Metropolitan Area' },
            { code: 'flushing', name: 'Flushing, Queens', city: 'Queens', state: 'NY', lat: 40.7674, lng: -73.8330, radius: 5000, priority: 2, region: 'New York Metropolitan Area' },
            { code: 'newark', name: 'Newark, NJ', city: 'Newark', state: 'NJ', lat: 40.7357, lng: -74.1724, radius: 10000, priority: 2, region: 'New York Metropolitan Area' },
            
            // Rockland County
            { code: 'new_city_rockland', name: 'New City, NY', city: 'New City', state: 'NY', lat: 41.1476, lng: -73.9890, radius: 8000, priority: 2, region: 'Rockland County' },
            { code: 'spring_valley', name: 'Spring Valley, NY', city: 'Spring Valley', state: 'NY', lat: 41.1126, lng: -74.0437, radius: 6000, priority: 2, region: 'Rockland County' },
            { code: 'suffern', name: 'Suffern, NY', city: 'Suffern', state: 'NY', lat: 41.1146, lng: -74.1496, radius: 5000, priority: 2, region: 'Rockland County' },
            { code: 'nyack', name: 'Nyack, NY', city: 'Nyack', state: 'NY', lat: 41.0909, lng: -73.9179, radius: 4000, priority: 2, region: 'Rockland County' },
            { code: 'pearl_river', name: 'Pearl River, NY', city: 'Pearl River', state: 'NY', lat: 41.0590, lng: -74.0196, radius: 4000, priority: 2, region: 'Rockland County' },
            { code: 'monsey', name: 'Monsey, NY', city: 'Monsey', state: 'NY', lat: 41.1084, lng: -74.0687, radius: 5000, priority: 2, region: 'Rockland County', cuisine: ['kosher'] },
            { code: 'nanuet', name: 'Nanuet, NY', city: 'Nanuet', state: 'NY', lat: 41.0870, lng: -74.0135, radius: 4000, priority: 2, region: 'Rockland County' },
            { code: 'west_haverstraw', name: 'West Haverstraw, NY', city: 'West Haverstraw', state: 'NY', lat: 41.2090, lng: -73.9829, radius: 3000, priority: 3, region: 'Rockland County' },
            { code: 'haverstraw', name: 'Haverstraw, NY', city: 'Haverstraw', state: 'NY', lat: 41.1959, lng: -73.9665, radius: 4000, priority: 3, region: 'Rockland County' },
            { code: 'stony_point', name: 'Stony Point, NY', city: 'Stony Point', state: 'NY', lat: 41.2290, lng: -73.9871, radius: 3000, priority: 3, region: 'Rockland County' }
        ];

        let inserted = 0;
        for (const zone of initialZones) {
            try {
                const searchTerms = zone.cuisine && zone.cuisine.includes('kosher') 
                    ? ['kosher restaurant', 'kosher', 'restaurant']
                    : ['restaurant'];
                    
                const cuisineFocus = zone.cuisine || [];

                await this.pool.query(`
                    INSERT INTO zones (
                        zone_code, display_name, country, state, city, region,
                        latitude, longitude, radius_meters, search_terms, cuisine_focus,
                        priority, timezone, is_active, created_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                    ON CONFLICT (zone_code) DO NOTHING
                `, [
                    zone.code, zone.name, 'US', zone.state, zone.city, zone.region,
                    zone.lat, zone.lng, zone.radius, searchTerms, cuisineFocus,
                    zone.priority, 'America/New_York', true, 'migration_script'
                ]);
                
                inserted++;
                console.log(`  ✅ ${zone.name} (${zone.code})`);
                
            } catch (error) {
                console.log(`  ❌ Failed to insert ${zone.name}: ${error.message}`);
            }
        }
        
        console.log(`📍 Inserted ${inserted} zones`);
    }

    async loadZoneTemplates() {
        const templates = [
            {
                name: 'US_Metropolitan',
                description: 'Large US metropolitan area',
                radius: 15000,
                terms: ['restaurant', 'food', 'dining'],
                cuisine: ['diverse', 'international'],
                priority: 1
            },
            {
                name: 'US_Suburban',
                description: 'US suburban area',
                radius: 7000,
                terms: ['restaurant', 'family restaurant'],
                cuisine: ['american', 'family-friendly'],
                priority: 2
            },
            {
                name: 'Tourist_Area',
                description: 'Tourist destination or vacation spot',
                radius: 8000,
                terms: ['restaurant', 'cafe', 'fine dining'],
                cuisine: ['fine dining', 'local specialties'],
                priority: 1
            },
            {
                name: 'Kosher_Community',
                description: 'Orthodox Jewish community',
                radius: 5000,
                terms: ['kosher restaurant', 'kosher', 'restaurant'],
                cuisine: ['kosher', 'jewish', 'middle eastern'],
                priority: 2
            }
        ];

        let inserted = 0;
        for (const template of templates) {
            try {
                await this.pool.query(`
                    INSERT INTO zone_templates (
                        template_name, description, default_radius, 
                        default_search_terms, default_cuisine_focus, default_priority
                    ) VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (template_name) DO NOTHING
                `, [
                    template.name, template.description, template.radius,
                    template.terms, template.cuisine, template.priority
                ]);
                
                inserted++;
                console.log(`  ✅ ${template.name}`);
                
            } catch (error) {
                console.log(`  ❌ Failed to insert template ${template.name}: ${error.message}`);
            }
        }
        
        console.log(`📄 Inserted ${inserted} zone templates`);
    }

    async updateExistingZones() {
        // Update cuisine focus for specific zones
        const updates = [
            { code: 'monsey', cuisine: ['kosher', 'jewish'], terms: ['kosher restaurant', 'kosher', 'restaurant'] },
            { code: 'flushing', cuisine: ['asian', 'chinese', 'korean'], terms: ['restaurant', 'asian restaurant', 'chinese restaurant'] },
            { code: 'queens', cuisine: ['diverse', 'international'], terms: ['restaurant', 'food', 'dining'] },
            { code: 'brooklyn', cuisine: ['diverse', 'international'], terms: ['restaurant', 'food', 'dining'] },
            { code: 'astoria', cuisine: ['diverse', 'international'], terms: ['restaurant', 'food', 'dining'] }
        ];

        let updated = 0;
        for (const update of updates) {
            try {
                const result = await this.pool.query(`
                    UPDATE zones 
                    SET cuisine_focus = $1, search_terms = $2, updated_at = CURRENT_TIMESTAMP
                    WHERE zone_code = $3
                `, [update.cuisine, update.terms, update.code]);
                
                if (result.rowCount > 0) {
                    updated++;
                    console.log(`  ✅ Updated ${update.code}`);
                }
                
            } catch (error) {
                console.log(`  ❌ Failed to update ${update.code}: ${error.message}`);
            }
        }
        
        console.log(`🔄 Updated ${updated} zones`);
    }

    async generateStats() {
        const stats = await this.pool.query(`
            SELECT 
                COUNT(*) as total_zones,
                COUNT(CASE WHEN is_active THEN 1 END) as active_zones,
                COUNT(CASE WHEN priority = 1 THEN 1 END) as high_priority,
                COUNT(CASE WHEN priority = 2 THEN 1 END) as medium_priority,
                COUNT(CASE WHEN priority = 3 THEN 1 END) as low_priority
            FROM zones
        `);
        
        const templates = await this.pool.query('SELECT COUNT(*) as total_templates FROM zone_templates WHERE is_active = true');
        
        const restaurants = await this.pool.query('SELECT COUNT(*) as total_restaurants FROM restaurants');
        
        console.log('\n📊 Zone Migration Statistics:');
        console.log(`   🌍 Total Zones: ${stats.rows[0].total_zones}`);
        console.log(`   ✅ Active Zones: ${stats.rows[0].active_zones}`);
        console.log(`   🔴 High Priority: ${stats.rows[0].high_priority}`);
        console.log(`   🟡 Medium Priority: ${stats.rows[0].medium_priority}`);
        console.log(`   ⚪ Low Priority: ${stats.rows[0].low_priority}`);
        console.log(`   📄 Zone Templates: ${templates.rows[0].total_templates}`);
        console.log(`   🍽️  Restaurants: ${restaurants.rows[0].total_restaurants}`);
        console.log('');
    }
}

// Run migration if called directly
if (require.main === module) {
    const migration = new ZoneMigrationScript();
    migration.run().catch(console.error);
}

module.exports = ZoneMigrationScript;