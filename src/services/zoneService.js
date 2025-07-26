const db = require('./databaseService');
const geocodingService = require('./geocodingService');
const csvParser = require('csv-parser');
const fs = require('fs');
const path = require('path');

class ZoneService {
    constructor() {
        this.logger = require('winston').createLogger({
            level: 'info',
            format: require('winston').format.combine(
                require('winston').format.timestamp(),
                require('winston').format.json()
            ),
            transports: [
                new require('winston').transports.Console(),
                new require('winston').transports.File({ filename: 'logs/zones.log' })
            ]
        });
    }

    // Obtener todas las zonas activas con estadísticas
    async getActiveZonesWithStats() {
        try {
            const result = await db.getAllZones(false);
            return result.rows;
        } catch (error) {
            this.logger.error('Error fetching active zones with stats', { error: error.message });
            throw error;
        }
    }

    // Obtener todas las zonas (incluidas inactivas)
    async getAllZones() {
        try {
            const result = await db.getAllZones(true);
            return result.rows;
        } catch (error) {
            this.logger.error('Error fetching all zones', { error: error.message });
            throw error;
        }
    }

    // Obtener zona por ID
    async getZoneById(id) {
        try {
            return await db.getZoneById(id);
        } catch (error) {
            this.logger.error('Error fetching zone by ID', { id, error: error.message });
            throw error;
        }
    }

    // Crear zona con validación anti-duplicados
    async createZone(zoneData) {
        try {
            // Validar zona cercana existente
            const nearbyZone = await this.findNearbyZone(
                zoneData.latitude, 
                zoneData.longitude, 
                10000 // 10km radius for duplicate check
            );
            
            if (nearbyZone) {
                throw new Error(`Similar zone "${nearbyZone.display_name}" exists nearby (${nearbyZone.distance}m away)`);
            }

            // Auto-generar zone_code si no se proporciona
            if (!zoneData.zone_code) {
                zoneData.zone_code = this.generateZoneCode(zoneData.city, zoneData.state);
            }

            // Verificar que el zone_code sea único
            const existingZone = await db.getZoneByCode(zoneData.zone_code);
            if (existingZone) {
                zoneData.zone_code = await this.generateUniqueZoneCode(zoneData.city, zoneData.state);
            }

            // Procesar arrays desde strings si es necesario
            if (typeof zoneData.search_terms === 'string') {
                zoneData.search_terms = zoneData.search_terms.split(',').map(term => term.trim());
            }
            if (typeof zoneData.cuisine_focus === 'string') {
                zoneData.cuisine_focus = zoneData.cuisine_focus.split(',').map(term => term.trim()).filter(term => term);
            }

            // Crear zona
            const result = await db.createZone(zoneData);
            const newZone = result.rows[0];
            
            // Registrar en historial
            await db.logZoneChange(newZone.id, 'created', null, newZone, zoneData.created_by);
            
            this.logger.info('Zone created successfully', { 
                zoneId: newZone.id, 
                zoneCode: newZone.zone_code,
                displayName: newZone.display_name 
            });
            
            return newZone;
        } catch (error) {
            this.logger.error('Error creating zone', { 
                zoneData: { ...zoneData, created_by: undefined }, 
                error: error.message 
            });
            throw error;
        }
    }

    // Actualizar zona
    async updateZone(id, zoneData) {
        try {
            // Obtener datos actuales para el historial
            const oldZone = await db.getZoneById(id);
            if (!oldZone) {
                throw new Error('Zone not found');
            }

            // Procesar arrays desde strings si es necesario
            if (typeof zoneData.search_terms === 'string') {
                zoneData.search_terms = zoneData.search_terms.split(',').map(term => term.trim());
            }
            if (typeof zoneData.cuisine_focus === 'string') {
                zoneData.cuisine_focus = zoneData.cuisine_focus.split(',').map(term => term.trim()).filter(term => term);
            }

            // Actualizar zona
            const result = await db.updateZone(id, zoneData);
            const updatedZone = result.rows[0];

            // Registrar en historial
            await db.logZoneChange(id, 'updated', oldZone, updatedZone, zoneData.updated_by || 'system');

            this.logger.info('Zone updated successfully', { 
                zoneId: id, 
                changes: Object.keys(zoneData) 
            });

            return updatedZone;
        } catch (error) {
            this.logger.error('Error updating zone', { id, error: error.message });
            throw error;
        }
    }

    // Eliminar zona
    async deleteZone(id) {
        try {
            const zone = await db.getZoneById(id);
            if (!zone) {
                throw new Error('Zone not found');
            }

            const result = await db.deleteZone(id);
            
            // Registrar en historial
            await db.logZoneChange(id, 'deleted', zone, null, 'admin');

            this.logger.info('Zone deleted successfully', { 
                zoneId: id, 
                zoneName: zone.display_name 
            });

            return result.rows[0];
        } catch (error) {
            this.logger.error('Error deleting zone', { id, error: error.message });
            throw error;
        }
    }

    // Alternar estado activo/inactivo
    async toggleZoneStatus(id) {
        try {
            const zone = await db.getZoneById(id);
            if (!zone) {
                throw new Error('Zone not found');
            }

            const newStatus = !zone.is_active;
            const result = await db.updateZone(id, { is_active: newStatus });

            // Registrar en historial
            const changeType = newStatus ? 'activated' : 'deactivated';
            await db.logZoneChange(id, changeType, { is_active: zone.is_active }, { is_active: newStatus }, 'admin');

            this.logger.info('Zone status toggled', { 
                zoneId: id, 
                newStatus,
                zoneName: zone.display_name 
            });

            return result.rows[0];
        } catch (error) {
            this.logger.error('Error toggling zone status', { id, error: error.message });
            throw error;
        }
    }

    // Import masivo desde CSV
    async importZonesFromCSV(csvFile) {
        return new Promise((resolve, reject) => {
            const zones = [];
            const errors = [];
            let processedCount = 0;
            let successCount = 0;

            fs.createReadStream(csvFile.path)
                .pipe(csvParser())
                .on('data', async (row) => {
                    try {
                        // Mapear columnas CSV a campos de zona
                        const zoneData = {
                            display_name: row.display_name || row.name,
                            city: row.city,
                            state: row.state,
                            country: row.country || 'US',
                            latitude: parseFloat(row.latitude || row.lat),
                            longitude: parseFloat(row.longitude || row.lng || row.lon),
                            radius_meters: parseInt(row.radius_meters || row.radius || 5000),
                            priority: parseInt(row.priority || 2),
                            search_terms: row.search_terms ? row.search_terms.split(',').map(t => t.trim()) : ['restaurant'],
                            cuisine_focus: row.cuisine_focus ? row.cuisine_focus.split(',').map(t => t.trim()) : [],
                            notes: row.notes || '',
                            timezone: row.timezone || 'America/New_York',
                            population: row.population ? parseInt(row.population) : null,
                            created_by: 'csv_import'
                        };

                        // Validaciones básicas
                        if (!zoneData.display_name || !zoneData.city || !zoneData.state) {
                            errors.push(`Row ${processedCount + 1}: Missing required fields (display_name, city, state)`);
                            return;
                        }

                        if (isNaN(zoneData.latitude) || isNaN(zoneData.longitude)) {
                            errors.push(`Row ${processedCount + 1}: Invalid coordinates`);
                            return;
                        }

                        if (zoneData.latitude < -90 || zoneData.latitude > 90) {
                            errors.push(`Row ${processedCount + 1}: Invalid latitude (must be between -90 and 90)`);
                            return;
                        }

                        if (zoneData.longitude < -180 || zoneData.longitude > 180) {
                            errors.push(`Row ${processedCount + 1}: Invalid longitude (must be between -180 and 180)`);
                            return;
                        }

                        zones.push(zoneData);
                    } catch (error) {
                        errors.push(`Row ${processedCount + 1}: ${error.message}`);
                    }
                    processedCount++;
                })
                .on('end', async () => {
                    try {
                        // Procesar zonas en lotes para evitar conflictos
                        for (const zoneData of zones) {
                            try {
                                await this.createZone(zoneData);
                                successCount++;
                            } catch (error) {
                                errors.push(`Zone "${zoneData.display_name}": ${error.message}`);
                            }
                        }

                        // Limpiar archivo temporal
                        fs.unlinkSync(csvFile.path);

                        this.logger.info('CSV import completed', { 
                            totalRows: processedCount,
                            successCount,
                            errorCount: errors.length 
                        });

                        resolve({
                            success: true,
                            totalRows: processedCount,
                            successCount,
                            errorCount: errors.length,
                            errors
                        });
                    } catch (error) {
                        reject(error);
                    }
                })
                .on('error', (error) => {
                    reject(error);
                });
        });
    }

    // Duplicar zona
    async duplicateZone(originalId, newDisplayName) {
        try {
            const originalZone = await db.getZoneById(originalId);
            if (!originalZone) {
                throw new Error('Original zone not found');
            }

            // Crear datos para la nueva zona
            const newZoneData = {
                ...originalZone,
                display_name: newDisplayName,
                zone_code: this.generateZoneCode(newDisplayName, originalZone.state),
                notes: `Duplicated from: ${originalZone.display_name}`,
                created_by: 'duplication'
            };

            // Remover campos que no deben copiarse
            delete newZoneData.id;
            delete newZoneData.created_at;
            delete newZoneData.updated_at;

            return await this.createZone(newZoneData);
        } catch (error) {
            this.logger.error('Error duplicating zone', { originalId, error: error.message });
            throw error;
        }
    }

    // Crear zona desde template
    async createFromTemplate(templateId, customData) {
        try {
            const template = await db.getZoneTemplateById(templateId);
            if (!template) {
                throw new Error('Template not found');
            }

            // Combinar datos del template con datos personalizados
            const zoneData = {
                radius_meters: customData.radius_meters || template.default_radius,
                search_terms: customData.search_terms || template.default_search_terms,
                cuisine_focus: customData.cuisine_focus || template.default_cuisine_focus,
                priority: customData.priority || template.default_priority,
                notes: `Created from template: ${template.template_name}${customData.notes ? '. ' + customData.notes : ''}`,
                ...customData,
                created_by: 'template'
            };

            return await this.createZone(zoneData);
        } catch (error) {
            this.logger.error('Error creating zone from template', { templateId, error: error.message });
            throw error;
        }
    }

    // Generar código único de zona
    generateZoneCode(city, state) {
        const cityCode = city.toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
        const stateCode = state.toLowerCase().replace(/[^a-z0-9]/g, '');
        return `${cityCode}_${stateCode}`;
    }

    // Generar código único de zona (con verificación de duplicados)
    async generateUniqueZoneCode(city, state) {
        let baseCode = this.generateZoneCode(city, state);
        let counter = 1;
        let uniqueCode = baseCode;

        while (await db.getZoneByCode(uniqueCode)) {
            uniqueCode = `${baseCode}_${counter}`;
            counter++;
        }

        return uniqueCode;
    }

    // Encontrar zona cercana (anti-duplicados)
    async findNearbyZone(lat, lng, radiusMeters) {
        try {
            // Usar la fórmula de Haversine aproximada para PostgreSQL
            const query = `
                SELECT *, 
                       (6371000 * acos(cos(radians($1)) * cos(radians(latitude)) * 
                                     cos(radians(longitude) - radians($2)) + 
                                     sin(radians($1)) * sin(radians(latitude)))) as distance
                FROM zones 
                WHERE (6371000 * acos(cos(radians($1)) * cos(radians(latitude)) * 
                                    cos(radians(longitude) - radians($2)) + 
                                    sin(radians($1)) * sin(radians(latitude)))) < $3
                AND is_active = true
                ORDER BY distance
                LIMIT 1
            `;

            const result = await db.query(query, [lat, lng, radiusMeters]);
            return result.rows[0] || null;
        } catch (error) {
            this.logger.error('Error finding nearby zone', { lat, lng, radiusMeters, error: error.message });
            return null;
        }
    }

    // Templates
    async getZoneTemplates() {
        try {
            const result = await db.getZoneTemplates();
            return result.rows;
        } catch (error) {
            this.logger.error('Error fetching zone templates', { error: error.message });
            throw error;
        }
    }

    async createTemplate(templateData) {
        try {
            const query = `
                INSERT INTO zone_templates (
                    template_name, description, default_radius, default_search_terms,
                    default_cuisine_focus, default_priority, config_json
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *
            `;

            const values = [
                templateData.template_name,
                templateData.description,
                templateData.default_radius || 5000,
                templateData.default_search_terms || ['restaurant'],
                templateData.default_cuisine_focus || [],
                templateData.default_priority || 2,
                templateData.config_json || {}
            ];

            const result = await db.query(query, values);
            
            this.logger.info('Zone template created', { 
                templateName: templateData.template_name 
            });
            
            return result.rows[0];
        } catch (error) {
            this.logger.error('Error creating zone template', { error: error.message });
            throw error;
        }
    }

    // Export/Import
    async exportZonesCSV() {
        try {
            const zones = await this.getAllZones();
            
            const csvHeaders = [
                'zone_code', 'display_name', 'country', 'state', 'city', 'region',
                'latitude', 'longitude', 'radius_meters', 'search_terms', 'cuisine_focus',
                'priority', 'timezone', 'population', 'is_active', 'notes'
            ];

            const csvRows = zones.map(zone => [
                zone.zone_code,
                zone.display_name,
                zone.country,
                zone.state,
                zone.city,
                zone.region || '',
                zone.latitude,
                zone.longitude,
                zone.radius_meters,
                zone.search_terms ? zone.search_terms.join(', ') : '',
                zone.cuisine_focus ? zone.cuisine_focus.join(', ') : '',
                zone.priority,
                zone.timezone,
                zone.population || '',
                zone.is_active,
                zone.notes || ''
            ]);

            const csvContent = [csvHeaders, ...csvRows]
                .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
                .join('\n');

            return csvContent;
        } catch (error) {
            this.logger.error('Error exporting zones CSV', { error: error.message });
            throw error;
        }
    }

    // Generar CSV de muestra
    generateSampleCSV() {
        const sampleData = [
            ['display_name', 'city', 'state', 'country', 'latitude', 'longitude', 'radius_meters', 'priority', 'search_terms', 'cuisine_focus', 'notes'],
            ['Miami Beach, FL', 'Miami Beach', 'FL', 'US', '25.7907', '-80.1300', '8000', '1', 'restaurant, seafood restaurant', 'seafood, latin', 'Tourist area with beach dining'],
            ['Boston North End', 'Boston', 'MA', 'US', '42.3647', '-71.0542', '3000', '2', 'restaurant, italian restaurant', 'italian, european', 'Historic Italian neighborhood'],
            ['Austin Downtown', 'Austin', 'TX', 'US', '30.2672', '-97.7431', '6000', '1', 'restaurant, bbq, food truck', 'bbq, tex-mex, food trucks', 'Music and food scene']
        ];

        return sampleData
            .map(row => row.map(cell => `"${cell}"`).join(','))
            .join('\n');
    }
}

module.exports = new ZoneService();