/**
 * Dynamic Zone Configuration System
 * This module handles configuration for different zone types and provides
 * utilities for managing zone-specific settings
 */

const db = require('../services/databaseService');

class ZoneConfigManager {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Get zone configuration with caching
     */
    async getZoneConfig(zoneId) {
        const cacheKey = `zone_${zoneId}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }
        
        const zone = await db.getZoneById(zoneId);
        if (!zone) {
            throw new Error('Zone not found');
        }
        
        const config = {
            ...zone,
            searchConfig: this.buildSearchConfig(zone),
            scrapingConfig: this.buildScrapingConfig(zone),
            validationRules: this.buildValidationRules(zone)
        };
        
        this.cache.set(cacheKey, {
            data: config,
            timestamp: Date.now()
        });
        
        return config;
    }

    /**
     * Build search configuration for Google Places API
     */
    buildSearchConfig(zone) {
        const baseConfig = {
            location: `${zone.latitude},${zone.longitude}`,
            radius: zone.radius_meters,
            type: 'restaurant',
            language: 'en'
        };

        // Add search terms
        const searchTerms = zone.search_terms || ['restaurant'];
        
        // Build cuisine-specific searches if specified
        const cuisineTypes = zone.cuisine_focus || [];
        
        return {
            ...baseConfig,
            queries: this.generateSearchQueries(searchTerms, cuisineTypes),
            maxResults: this.calculateMaxResults(zone),
            priceRange: this.determinePriceRange(zone)
        };
    }

    /**
     * Generate search queries based on terms and cuisine focus
     */
    generateSearchQueries(searchTerms, cuisineTypes) {
        const queries = [];
        
        // Base restaurant searches
        searchTerms.forEach(term => {
            queries.push({ keyword: term, type: 'restaurant' });
        });
        
        // Cuisine-specific searches
        cuisineTypes.forEach(cuisine => {
            queries.push({ 
                keyword: `${cuisine} restaurant`, 
                type: 'restaurant',
                cuisine: cuisine 
            });
        });
        
        // Add establishment type searches for broader coverage
        const establishmentTypes = [
            'meal_takeaway',
            'meal_delivery', 
            'cafe',
            'bar',
            'food'
        ];
        
        establishmentTypes.forEach(type => {
            queries.push({ type: type });
        });
        
        return queries;
    }

    /**
     * Calculate maximum results based on zone characteristics
     */
    calculateMaxResults(zone) {
        const baseMax = 200;
        
        // Adjust based on priority
        let multiplier = 1;
        if (zone.priority === 1) multiplier = 1.5;
        if (zone.priority === 3) multiplier = 0.75;
        
        // Adjust based on area size
        const areaKm2 = Math.PI * Math.pow(zone.radius_meters / 1000, 2);
        if (areaKm2 > 100) multiplier *= 1.2;
        if (areaKm2 < 10) multiplier *= 0.8;
        
        // Adjust based on population density estimate
        if (zone.population) {
            const density = zone.population / areaKm2;
            if (density > 5000) multiplier *= 1.3; // High density
            if (density < 1000) multiplier *= 0.7; // Low density
        }
        
        return Math.round(baseMax * multiplier);
    }

    /**
     * Determine price range to search for
     */
    determinePriceRange(zone) {
        // Default to all price levels
        let priceRange = [0, 1, 2, 3, 4];
        
        // Adjust based on zone characteristics
        const notes = (zone.notes || '').toLowerCase();
        
        if (notes.includes('upscale') || notes.includes('luxury') || notes.includes('fine dining')) {
            priceRange = [2, 3, 4]; // Mid to high-end
        } else if (notes.includes('budget') || notes.includes('affordable') || notes.includes('student')) {
            priceRange = [0, 1, 2]; // Budget to mid-range
        } else if (notes.includes('tourist') || notes.includes('business district')) {
            priceRange = [1, 2, 3, 4]; // Skip very cheap options
        }
        
        return priceRange;
    }

    /**
     * Build scraping configuration
     */
    buildScrapingConfig(zone) {
        return {
            emailExtractionEnabled: true,
            websiteScrapingEnabled: true,
            socialMediaEnabled: false,
            maxRetries: 3,
            delayBetweenRequests: this.calculateDelay(zone),
            userAgents: this.getUserAgents(),
            timeout: 30000,
            concurrency: this.calculateConcurrency(zone)
        };
    }

    /**
     * Calculate delay between requests based on zone priority
     */
    calculateDelay(zone) {
        const baseDelay = 2000; // 2 seconds
        
        // Higher priority zones can scrape faster
        if (zone.priority === 1) return baseDelay * 0.75; // 1.5s
        if (zone.priority === 3) return baseDelay * 1.5;  // 3s
        
        return baseDelay;
    }

    /**
     * Calculate concurrency level
     */
    calculateConcurrency(zone) {
        const baseConcurrency = 3;
        
        if (zone.priority === 1) return baseConcurrency + 2; // 5
        if (zone.priority === 3) return Math.max(1, baseConcurrency - 1); // 2
        
        return baseConcurrency;
    }

    /**
     * Get user agents for web scraping
     */
    getUserAgents() {
        return [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15'
        ];
    }

    /**
     * Build validation rules for restaurant data
     */
    buildValidationRules(zone) {
        const rules = {
            required: ['name', 'address'],
            optional: ['phone', 'email', 'website', 'cuisine_type'],
            validation: {
                name: {
                    minLength: 2,
                    maxLength: 255,
                    pattern: /^[a-zA-Z0-9\s\-'&.()]+$/
                },
                email: {
                    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
                },
                phone: {
                    pattern: /^[\+]?[\d\s\-\(\)\.]{10,}$/
                },
                website: {
                    pattern: /^https?:\/\/.+/
                }
            },
            customRules: this.getCustomValidationRules(zone)
        };
        
        return rules;
    }

    /**
     * Get custom validation rules based on zone characteristics
     */
    getCustomValidationRules(zone) {
        const rules = [];
        
        // Kosher restaurant validation
        if (zone.cuisine_focus && zone.cuisine_focus.includes('kosher')) {
            rules.push({
                name: 'kosher_validation',
                check: (restaurant) => {
                    const name = restaurant.name.toLowerCase();
                    const keywords = ['kosher', 'glatt', 'hebrew', 'jewish', 'synagogue'];
                    return keywords.some(keyword => name.includes(keyword)) ||
                           (restaurant.cuisine_type && restaurant.cuisine_type.toLowerCase().includes('kosher'));
                },
                weight: 10 // Bonus points for kosher indicators
            });
        }
        
        // Chain restaurant detection
        rules.push({
            name: 'chain_detection',
            check: (restaurant) => {
                const name = restaurant.name.toLowerCase();
                const chains = [
                    'mcdonalds', 'burger king', 'subway', 'starbucks', 'dunkin',
                    'pizza hut', 'dominos', 'kfc', 'taco bell', 'wendys'
                ];
                return !chains.some(chain => name.includes(chain));
            },
            weight: 5 // Prefer local restaurants
        });
        
        // Business hours validation
        rules.push({
            name: 'business_hours',
            check: (restaurant) => {
                // Prefer restaurants with business hours information
                return restaurant.business_hours !== undefined;
            },
            weight: 3
        });
        
        return rules;
    }

    /**
     * Get zone-specific scraping schedule
     */
    getScrapingSchedule(zone) {
        const schedules = {
            1: { // High priority
                frequency: 'daily',
                time: '02:00',
                maxDuration: 4 * 60 * 60 * 1000 // 4 hours
            },
            2: { // Medium priority
                frequency: 'weekly',
                time: '03:00',
                maxDuration: 6 * 60 * 60 * 1000 // 6 hours
            },
            3: { // Low priority
                frequency: 'monthly',
                time: '04:00',
                maxDuration: 8 * 60 * 60 * 1000 // 8 hours
            }
        };
        
        return schedules[zone.priority] || schedules[2];
    }

    /**
     * Get data export configuration
     */
    getExportConfig(zone) {
        return {
            formats: ['csv', 'json', 'xlsx'],
            includeFields: [
                'name', 'address', 'phone', 'email', 'website',
                'cuisine_type', 'rating', 'price_level', 'zone_name'
            ],
            filenameTemplate: `${zone.zone_code}_restaurants_{timestamp}`,
            compression: true,
            maxRecords: 10000
        };
    }

    /**
     * Clear cache for a specific zone or all zones
     */
    clearCache(zoneId = null) {
        if (zoneId) {
            this.cache.delete(`zone_${zoneId}`);
        } else {
            this.cache.clear();
        }
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            size: this.cache.size,
            entries: Array.from(this.cache.keys()),
            timeout: this.cacheTimeout
        };
    }
}

// Zone type templates for quick setup
const ZONE_TEMPLATES = {
    metropolitan: {
        defaultRadius: 15000,
        searchTerms: ['restaurant', 'food', 'dining'],
        cuisineFocus: ['diverse', 'international'],
        priority: 1,
        expectedDensity: 'high'
    },
    
    suburban: {
        defaultRadius: 7000,
        searchTerms: ['restaurant', 'family restaurant'],
        cuisineFocus: ['american', 'family-friendly'],
        priority: 2,
        expectedDensity: 'medium'
    },
    
    rural: {
        defaultRadius: 12000,
        searchTerms: ['restaurant', 'diner', 'local restaurant'],
        cuisineFocus: ['american', 'comfort food'],
        priority: 3,
        expectedDensity: 'low'
    },
    
    tourist: {
        defaultRadius: 8000,
        searchTerms: ['restaurant', 'cafe', 'fine dining'],
        cuisineFocus: ['fine dining', 'local specialties'],
        priority: 1,
        expectedDensity: 'high'
    },
    
    kosher: {
        defaultRadius: 5000,
        searchTerms: ['kosher restaurant', 'kosher', 'restaurant'],
        cuisineFocus: ['kosher', 'jewish', 'middle eastern'],
        priority: 2,
        expectedDensity: 'medium'
    }
};

module.exports = {
    ZoneConfigManager,
    ZONE_TEMPLATES
};