const { Client } = require('@googlemaps/google-maps-services-js');
const axios = require('axios');

class GeocodingService {
    constructor() {
        this.googleClient = new Client({});
        this.logger = require('winston').createLogger({
            level: 'info',
            format: require('winston').format.combine(
                require('winston').format.timestamp(),
                require('winston').format.json()
            ),
            transports: [
                new require('winston').transports.Console(),
                new require('winston').transports.File({ filename: 'logs/geocoding.log' })
            ]
        });
    }

    // Geocodificar usando Google Geocoding API
    async geocodeLocation(address) {
        try {
            if (!process.env.GOOGLE_GEOCODING_API_KEY) {
                throw new Error('Google Geocoding API key not configured');
            }

            const response = await this.googleClient.geocode({
                params: {
                    address: address,
                    key: process.env.GOOGLE_GEOCODING_API_KEY,
                },
            });

            if (response.data.status === 'OK' && response.data.results.length > 0) {
                const result = response.data.results[0];
                const location = result.geometry.location;
                
                // Extraer componentes de dirección
                const addressComponents = result.address_components;
                const extractComponent = (types) => {
                    const component = addressComponents.find(comp => 
                        comp.types.some(type => types.includes(type))
                    );
                    return component ? component.long_name : null;
                };

                const geocodeResult = {
                    lat: location.lat,
                    lng: location.lng,
                    formatted_address: result.formatted_address,
                    city: extractComponent(['locality', 'administrative_area_level_3']),
                    state: extractComponent(['administrative_area_level_1']),
                    country: extractComponent(['country']),
                    county: extractComponent(['administrative_area_level_2']),
                    postal_code: extractComponent(['postal_code']),
                    neighborhood: extractComponent(['neighborhood', 'sublocality']),
                    accuracy: result.geometry.location_type,
                    place_id: result.place_id
                };

                this.logger.info('Geocoding successful', { 
                    address, 
                    result: geocodeResult 
                });

                return geocodeResult;
            } else {
                throw new Error(`Geocoding failed: ${response.data.status}`);
            }
        } catch (error) {
            this.logger.error('Google geocoding error', { 
                address, 
                error: error.message 
            });
            
            // Fallback a servicio gratuito
            return await this.geocodeWithFallback(address);
        }
    }

    // Geocodificación inversa (coordenadas a dirección)
    async reverseGeocode(lat, lng) {
        try {
            if (!process.env.GOOGLE_GEOCODING_API_KEY) {
                return await this.reverseGeocodeWithFallback(lat, lng);
            }

            const response = await this.googleClient.reverseGeocode({
                params: {
                    latlng: `${lat},${lng}`,
                    key: process.env.GOOGLE_GEOCODING_API_KEY,
                },
            });

            if (response.data.status === 'OK' && response.data.results.length > 0) {
                const result = response.data.results[0];
                const addressComponents = result.address_components;
                
                const extractComponent = (types) => {
                    const component = addressComponents.find(comp => 
                        comp.types.some(type => types.includes(type))
                    );
                    return component ? component.long_name : null;
                };

                const reverseResult = {
                    formatted_address: result.formatted_address,
                    street_number: extractComponent(['street_number']),
                    street_name: extractComponent(['route']),
                    city: extractComponent(['locality', 'administrative_area_level_3']),
                    state: extractComponent(['administrative_area_level_1']),
                    country: extractComponent(['country']),
                    county: extractComponent(['administrative_area_level_2']),
                    postal_code: extractComponent(['postal_code']),
                    neighborhood: extractComponent(['neighborhood', 'sublocality']),
                    place_id: result.place_id
                };

                this.logger.info('Reverse geocoding successful', { 
                    lat, lng, 
                    result: reverseResult 
                });

                return reverseResult;
            } else {
                throw new Error(`Reverse geocoding failed: ${response.data.status}`);
            }
        } catch (error) {
            this.logger.error('Google reverse geocoding error', { 
                lat, lng, 
                error: error.message 
            });
            
            return await this.reverseGeocodeWithFallback(lat, lng);
        }
    }

    // Geocodificación usando servicio gratuito (fallback)
    async geocodeWithFallback(address) {
        try {
            // Usar Nominatim (OpenStreetMap) como fallback gratuito
            const response = await axios.get('https://nominatim.openstreetmap.org/search', {
                params: {
                    q: address,
                    format: 'json',
                    limit: 1,
                    addressdetails: 1
                },
                headers: {
                    'User-Agent': 'RestaurantScraper/1.0 (contact@rogersgreengroup.com)'
                }
            });

            if (response.data && response.data.length > 0) {
                const result = response.data[0];
                const addr = result.address || {};

                const fallbackResult = {
                    lat: parseFloat(result.lat),
                    lng: parseFloat(result.lon),
                    formatted_address: result.display_name,
                    city: addr.city || addr.town || addr.village,
                    state: addr.state,
                    country: addr.country,
                    county: addr.county,
                    postal_code: addr.postcode,
                    neighborhood: addr.neighbourhood || addr.suburb,
                    accuracy: 'APPROXIMATE',
                    source: 'nominatim'
                };

                this.logger.info('Fallback geocoding successful', { 
                    address, 
                    result: fallbackResult 
                });

                return fallbackResult;
            } else {
                throw new Error('No results found');
            }
        } catch (error) {
            this.logger.error('Fallback geocoding error', { 
                address, 
                error: error.message 
            });
            throw new Error('Geocoding failed: Unable to find location');
        }
    }

    // Geocodificación inversa con fallback
    async reverseGeocodeWithFallback(lat, lng) {
        try {
            const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
                params: {
                    lat: lat,
                    lon: lng,
                    format: 'json',
                    addressdetails: 1
                },
                headers: {
                    'User-Agent': 'RestaurantScraper/1.0 (contact@rogersgreengroup.com)'
                }
            });

            if (response.data) {
                const result = response.data;
                const addr = result.address || {};

                const fallbackResult = {
                    formatted_address: result.display_name,
                    street_number: addr.house_number,
                    street_name: addr.road,
                    city: addr.city || addr.town || addr.village,
                    state: addr.state,
                    country: addr.country,
                    county: addr.county,
                    postal_code: addr.postcode,
                    neighborhood: addr.neighbourhood || addr.suburb,
                    source: 'nominatim'
                };

                this.logger.info('Fallback reverse geocoding successful', { 
                    lat, lng, 
                    result: fallbackResult 
                });

                return fallbackResult;
            } else {
                throw new Error('No results found');
            }
        } catch (error) {
            this.logger.error('Fallback reverse geocoding error', { 
                lat, lng, 
                error: error.message 
            });
            throw new Error('Reverse geocoding failed: Unable to find address');
        }
    }

    // Validar coordenadas
    validateCoordinates(lat, lng) {
        const latitude = parseFloat(lat);
        const longitude = parseFloat(lng);

        if (isNaN(latitude) || isNaN(longitude)) {
            return { valid: false, error: 'Coordinates must be numbers' };
        }

        if (latitude < -90 || latitude > 90) {
            return { valid: false, error: 'Latitude must be between -90 and 90' };
        }

        if (longitude < -180 || longitude > 180) {
            return { valid: false, error: 'Longitude must be between -180 and 180' };
        }

        return { valid: true, lat: latitude, lng: longitude };
    }

    // Calcular distancia entre dos puntos (fórmula de Haversine)
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000; // Radio de la Tierra en metros
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lng2 - lng1) * Math.PI / 180;

        const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ/2) * Math.sin(Δλ/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c; // Distancia en metros
    }

    // Obtener información de timezone basada en coordenadas
    async getTimezone(lat, lng) {
        try {
            if (!process.env.GOOGLE_GEOCODING_API_KEY) {
                return this.getTimezoneByApproximation(lat, lng);
            }

            const response = await axios.get('https://maps.googleapis.com/maps/api/timezone/json', {
                params: {
                    location: `${lat},${lng}`,
                    timestamp: Math.floor(Date.now() / 1000),
                    key: process.env.GOOGLE_GEOCODING_API_KEY
                }
            });

            if (response.data.status === 'OK') {
                return {
                    timezone: response.data.timeZoneId,
                    name: response.data.timeZoneName,
                    offset: response.data.rawOffset + response.data.dstOffset
                };
            } else {
                return this.getTimezoneByApproximation(lat, lng);
            }
        } catch (error) {
            this.logger.error('Timezone lookup error', { lat, lng, error: error.message });
            return this.getTimezoneByApproximation(lat, lng);
        }
    }

    // Aproximación de timezone basada en coordenadas (para fallback)
    getTimezoneByApproximation(lat, lng) {
        // Aproximaciones básicas para zonas horarias de Estados Unidos
        if (lat >= 24 && lat <= 50 && lng >= -125 && lng <= -66) {
            if (lng >= -90) return { timezone: 'America/New_York', name: 'Eastern Time' };
            if (lng >= -105) return { timezone: 'America/Chicago', name: 'Central Time' };
            if (lng >= -120) return { timezone: 'America/Denver', name: 'Mountain Time' };
            return { timezone: 'America/Los_Angeles', name: 'Pacific Time' };
        }
        
        // Canadá aproximado
        if (lat >= 42 && lat <= 70 && lng >= -141 && lng <= -52) {
            if (lng >= -90) return { timezone: 'America/Toronto', name: 'Eastern Time (Canada)' };
            if (lng >= -105) return { timezone: 'America/Winnipeg', name: 'Central Time (Canada)' };
            return { timezone: 'America/Vancouver', name: 'Pacific Time (Canada)' };
        }

        // Default fallback
        return { 
            timezone: 'America/New_York', 
            name: 'Eastern Time (Default)',
            note: 'Approximated timezone - verify manually'
        };
    }

    // Batch geocoding para múltiples direcciones
    async batchGeocode(addresses, options = {}) {
        const { delay = 100, maxConcurrent = 5 } = options;
        const results = [];
        
        // Procesar en lotes para respetar rate limits
        for (let i = 0; i < addresses.length; i += maxConcurrent) {
            const batch = addresses.slice(i, i + maxConcurrent);
            const promises = batch.map(async (address, index) => {
                try {
                    // Delay para evitar rate limiting
                    if (delay > 0) {
                        await new Promise(resolve => setTimeout(resolve, delay * index));
                    }
                    
                    const result = await this.geocodeLocation(address);
                    return { address, success: true, result };
                } catch (error) {
                    return { address, success: false, error: error.message };
                }
            });

            const batchResults = await Promise.all(promises);
            results.push(...batchResults);

            // Pausa entre lotes
            if (i + maxConcurrent < addresses.length && delay > 0) {
                await new Promise(resolve => setTimeout(resolve, delay * 5));
            }
        }

        return results;
    }

    // Sugerir coordenadas para una ciudad conocida
    getCityCoordinates(city, state) {
        const knownCities = {
            'New York,NY': { lat: 40.7831, lng: -73.9712 },
            'Brooklyn,NY': { lat: 40.6782, lng: -73.9442 },
            'Queens,NY': { lat: 40.7282, lng: -73.7949 },
            'Bronx,NY': { lat: 40.8448, lng: -73.8648 },
            'Staten Island,NY': { lat: 40.5795, lng: -74.1502 },
            'Jersey City,NJ': { lat: 40.7178, lng: -74.0431 },
            'Hoboken,NJ': { lat: 40.7439, lng: -74.0323 },
            'Miami,FL': { lat: 25.7617, lng: -80.1918 },
            'Los Angeles,CA': { lat: 34.0522, lng: -118.2437 },
            'Chicago,IL': { lat: 41.8781, lng: -87.6298 },
            'Houston,TX': { lat: 29.7604, lng: -95.3698 },
            'Phoenix,AZ': { lat: 33.4484, lng: -112.0740 },
            'Philadelphia,PA': { lat: 39.9526, lng: -75.1652 },
            'San Antonio,TX': { lat: 29.4241, lng: -98.4936 },
            'San Diego,CA': { lat: 32.7157, lng: -117.1611 },
            'Dallas,TX': { lat: 32.7767, lng: -96.7970 }
        };

        const key = `${city},${state}`;
        return knownCities[key] || null;
    }
}

module.exports = new GeocodingService();