const { Client } = require('@googlemaps/google-maps-services-js');
const winston = require('winston');
const { ZoneConfigManager } = require('../utils/zoneConfig');

class GooglePlacesService {
    constructor() {
        this.client = new Client({});
        this.zoneConfig = new ZoneConfigManager();
        
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.Console(),
                new winston.transports.File({ filename: 'logs/google-places.log' })
            ]
        });

        // Rate limiting
        this.requestQueue = [];
        this.isProcessing = false;
        this.rateLimitDelay = 100; // ms between requests
    }

    /**
     * Search for restaurants in a specific zone
     */
    async searchRestaurantsInZone(zoneId) {
        try {
            const zoneConfig = await this.zoneConfig.getZoneConfig(zoneId);
            const searchConfig = zoneConfig.searchConfig;
            
            this.logger.info('Starting restaurant search', { 
                zoneId, 
                zoneName: zoneConfig.display_name,
                queries: searchConfig.queries.length 
            });

            const allResults = [];
            const seenPlaceIds = new Set();

            // Process each search query
            for (const query of searchConfig.queries) {
                try {
                    const results = await this.executeSearch(zoneConfig, query);
                    
                    // Deduplicate by place_id
                    const newResults = results.filter(place => {
                        if (seenPlaceIds.has(place.place_id)) {
                            return false;
                        }
                        seenPlaceIds.add(place.place_id);
                        return true;
                    });

                    allResults.push(...newResults);
                    
                    this.logger.info('Search query completed', {
                        query: query.keyword || query.type,
                        results: results.length,
                        newResults: newResults.length,
                        totalUnique: seenPlaceIds.size
                    });

                    // Rate limiting delay
                    await this.delay(this.rateLimitDelay);
                    
                } catch (error) {
                    this.logger.error('Search query failed', {
                        query,
                        error: error.message
                    });
                }
            }

            // Get detailed information for each place
            const detailedResults = await this.getPlaceDetails(allResults, zoneConfig);

            this.logger.info('Zone search completed', {
                zoneId,
                totalFound: allResults.length,
                withDetails: detailedResults.length
            });

            return detailedResults;

        } catch (error) {
            this.logger.error('Zone search failed', { zoneId, error: error.message });
            throw error;
        }
    }

    /**
     * Execute a single search query
     */
    async executeSearch(zoneConfig, query) {
        const params = {
            location: zoneConfig.searchConfig.location,
            radius: zoneConfig.searchConfig.radius,
            key: process.env.GOOGLE_PLACES_API_KEY
        };

        // Add query-specific parameters
        if (query.keyword) {
            params.keyword = query.keyword;
        }
        if (query.type) {
            params.type = query.type;
        }

        try {
            const response = await this.client.placesNearby({ params });
            
            if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
                throw new Error(`Google Places API error: ${response.data.status}`);
            }

            let results = response.data.results || [];

            // Filter by price level if specified
            if (zoneConfig.searchConfig.priceRange) {
                results = results.filter(place => 
                    !place.price_level || 
                    zoneConfig.searchConfig.priceRange.includes(place.price_level)
                );
            }

            // Get additional pages if available
            if (response.data.next_page_token && results.length < zoneConfig.searchConfig.maxResults) {
                await this.delay(2000); // Required delay for next_page_token
                const nextPageResults = await this.getNextPage(response.data.next_page_token);
                results.push(...nextPageResults);
            }

            return results;

        } catch (error) {
            this.logger.error('Places search failed', { query, error: error.message });
            return [];
        }
    }

    /**
     * Get next page of results
     */
    async getNextPage(pageToken) {
        try {
            const response = await this.client.placesNearby({
                params: {
                    pagetoken: pageToken,
                    key: process.env.GOOGLE_PLACES_API_KEY
                }
            });

            if (response.data.status === 'OK') {
                return response.data.results || [];
            }
            
            return [];
        } catch (error) {
            this.logger.error('Next page request failed', { error: error.message });
            return [];
        }
    }

    /**
     * Get detailed information for places
     */
    async getPlaceDetails(places, zoneConfig) {
        const detailedResults = [];
        const batchSize = 10;

        for (let i = 0; i < places.length; i += batchSize) {
            const batch = places.slice(i, i + batchSize);
            const batchPromises = batch.map(place => this.getPlaceDetail(place, zoneConfig));
            
            try {
                const batchResults = await Promise.allSettled(batchPromises);
                
                batchResults.forEach((result, index) => {
                    if (result.status === 'fulfilled' && result.value) {
                        detailedResults.push(result.value);
                    } else {
                        this.logger.warn('Place detail failed', {
                            placeId: batch[index].place_id,
                            error: result.reason?.message
                        });
                    }
                });

                // Rate limiting delay between batches
                if (i + batchSize < places.length) {
                    await this.delay(this.rateLimitDelay * 5);
                }

            } catch (error) {
                this.logger.error('Batch place details failed', { error: error.message });
            }
        }

        return detailedResults;
    }

    /**
     * Get detailed information for a single place
     */
    async getPlaceDetail(place, zoneConfig) {
        const fields = [
            'place_id', 'name', 'formatted_address', 'geometry',
            'formatted_phone_number', 'international_phone_number',
            'website', 'rating', 'price_level', 'types',
            'opening_hours', 'reviews', 'photos'
        ];

        try {
            const response = await this.client.placeDetails({
                params: {
                    place_id: place.place_id,
                    fields: fields.join(','),
                    key: process.env.GOOGLE_PLACES_API_KEY
                }
            });

            if (response.data.status !== 'OK') {
                throw new Error(`Place details error: ${response.data.status}`);
            }

            const details = response.data.result;
            
            // Transform to our restaurant format
            const restaurant = this.transformPlaceToRestaurant(details, zoneConfig);
            
            // Apply validation rules
            if (this.validateRestaurant(restaurant, zoneConfig)) {
                return restaurant;
            }

            return null;

        } catch (error) {
            this.logger.error('Place detail request failed', {
                placeId: place.place_id,
                error: error.message
            });
            return null;
        }
    }

    /**
     * Transform Google Places data to restaurant format
     */
    transformPlaceToRestaurant(place, zoneConfig) {
        // Extract address components
        const addressComponents = this.parseAddress(place.formatted_address);
        
        // Determine cuisine type from Google types and name
        const cuisineType = this.determineCuisineType(place.types, place.name, zoneConfig);

        return {
            name: place.name,
            address: place.formatted_address,
            phone: this.cleanPhoneNumber(place.formatted_phone_number || place.international_phone_number),
            email: null, // Will be extracted via web scraping
            website: this.cleanWebsite(place.website),
            cuisine_type: cuisineType,
            rating: place.rating || null,
            price_level: place.price_level || null,
            
            // Location data
            zone_id: zoneConfig.id,
            city: addressComponents.city || zoneConfig.city,
            state: addressComponents.state || zoneConfig.state,
            country: addressComponents.country || zoneConfig.country,
            latitude: place.geometry?.location?.lat,
            longitude: place.geometry?.location?.lng,
            
            // Google-specific data
            google_place_id: place.place_id,
            google_types: place.types || [],
            
            // Metadata
            source: 'google_places',
            business_hours: place.opening_hours?.weekday_text || null,
            photos: place.photos?.slice(0, 3)?.map(photo => photo.photo_reference) || []
        };
    }

    /**
     * Parse address components from formatted address
     */
    parseAddress(formattedAddress) {
        if (!formattedAddress) return {};

        const parts = formattedAddress.split(',').map(part => part.trim());
        const components = {
            city: null,
            state: null,
            country: null,
            postal_code: null
        };

        // Basic parsing for US addresses
        if (parts.length >= 3) {
            const lastPart = parts[parts.length - 1];
            if (lastPart.includes('USA') || lastPart.includes('United States')) {
                components.country = 'US';
                
                if (parts.length >= 2) {
                    const stateZip = parts[parts.length - 2];
                    const stateZipMatch = stateZip.match(/([A-Z]{2})\s+(\d{5})/);
                    if (stateZipMatch) {
                        components.state = stateZipMatch[1];
                        components.postal_code = stateZipMatch[2];
                    }
                }
                
                if (parts.length >= 3) {
                    components.city = parts[parts.length - 3];
                }
            }
        }

        return components;
    }

    /**
     * Determine cuisine type from Google data
     */
    determineCuisineType(types, name, zoneConfig) {
        if (!types) return null;

        // Map Google types to cuisine types
        const typeMapping = {
            'chinese_restaurant': 'Chinese',
            'italian_restaurant': 'Italian',
            'japanese_restaurant': 'Japanese',
            'korean_restaurant': 'Korean',
            'thai_restaurant': 'Thai',
            'indian_restaurant': 'Indian',
            'mexican_restaurant': 'Mexican',
            'pizza_restaurant': 'Pizza',
            'seafood_restaurant': 'Seafood',
            'steakhouse': 'Steakhouse',
            'barbecue_restaurant': 'BBQ',
            'cafe': 'Cafe',
            'bakery': 'Bakery',
            'fast_food_restaurant': 'Fast Food',
            'meal_delivery': 'Delivery',
            'meal_takeaway': 'Takeaway'
        };

        // Check for exact type matches
        for (const type of types) {
            if (typeMapping[type]) {
                return typeMapping[type];
            }
        }

        // Check cuisine focus for zone-specific classification
        if (zoneConfig.cuisine_focus) {
            const nameLower = name.toLowerCase();
            for (const cuisine of zoneConfig.cuisine_focus) {
                if (nameLower.includes(cuisine.toLowerCase())) {
                    return cuisine.charAt(0).toUpperCase() + cuisine.slice(1);
                }
            }
        }

        // Keyword-based detection from name
        const nameKeywords = {
            'pizza': 'Pizza',
            'chinese': 'Chinese',
            'italian': 'Italian',
            'japanese': 'Japanese',
            'sushi': 'Japanese',
            'korean': 'Korean',
            'thai': 'Thai',
            'indian': 'Indian',
            'mexican': 'Mexican',
            'kosher': 'Kosher',
            'bbq': 'BBQ',
            'steakhouse': 'Steakhouse',
            'seafood': 'Seafood',
            'cafe': 'Cafe',
            'deli': 'Deli',
            'bakery': 'Bakery'
        };

        const nameLower = name.toLowerCase();
        for (const [keyword, cuisine] of Object.entries(nameKeywords)) {
            if (nameLower.includes(keyword)) {
                return cuisine;
            }
        }

        // Default classification
        if (types.includes('restaurant')) {
            return 'Restaurant';
        }

        return null;
    }

    /**
     * Clean phone number format
     */
    cleanPhoneNumber(phone) {
        if (!phone) return null;
        
        // Remove common formatting and keep only digits and +
        const cleaned = phone.replace(/[^\d+]/g, '');
        
        // Validate minimum length
        if (cleaned.length < 10) return null;
        
        return phone; // Return original formatted version
    }

    /**
     * Clean website URL
     */
    cleanWebsite(website) {
        if (!website) return null;
        
        try {
            const url = new URL(website);
            return url.toString();
        } catch (error) {
            // Try adding https:// if missing
            try {
                const url = new URL('https://' + website);
                return url.toString();
            } catch (error2) {
                return null;
            }
        }
    }

    /**
     * Validate restaurant data against zone rules
     */
    validateRestaurant(restaurant, zoneConfig) {
        const rules = zoneConfig.validationRules;
        
        // Check required fields
        for (const field of rules.required) {
            if (!restaurant[field]) {
                return false;
            }
        }

        // Apply validation patterns
        for (const [field, validation] of Object.entries(rules.validation)) {
            const value = restaurant[field];
            if (value) {
                if (validation.minLength && value.length < validation.minLength) {
                    return false;
                }
                if (validation.maxLength && value.length > validation.maxLength) {
                    return false;
                }
                if (validation.pattern && !validation.pattern.test(value)) {
                    return false;
                }
            }
        }

        // Apply custom rules
        for (const rule of rules.customRules) {
            if (!rule.check(restaurant)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Delay utility for rate limiting
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get API usage statistics
     */
    async getApiUsage() {
        // This would typically come from Google Cloud Console
        // For now, return estimated usage based on request logs
        return {
            dailyRequests: 0, // Would need to track this
            monthlyRequests: 0,
            quotaLimit: 1000, // Default quota
            costEstimate: 0
        };
    }

    /**
     * Test API connectivity
     */
    async testConnection() {
        try {
            const response = await this.client.placesNearby({
                params: {
                    location: '40.7831,-73.9712', // NYC coordinates
                    radius: 1000,
                    type: 'restaurant',
                    key: process.env.GOOGLE_PLACES_API_KEY
                }
            });

            return {
                success: response.data.status === 'OK' || response.data.status === 'ZERO_RESULTS',
                status: response.data.status,
                resultCount: response.data.results?.length || 0
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new GooglePlacesService();