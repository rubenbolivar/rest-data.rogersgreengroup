const zoneService = require('../services/zoneService');
const geocodingService = require('../services/geocodingService');
const db = require('../services/databaseService');

class ZoneController {
    // Listar todas las zonas
    async listZones(req, res) {
        try {
            const zones = await zoneService.getActiveZonesWithStats();
            const templates = await zoneService.getZoneTemplates();
            
            res.render('admin/zones/list', { 
                zones,
                templates,
                title: 'Zone Management'
            });
        } catch (error) {
            console.error('Error loading zones list:', error);
            res.status(500).render('error', { 
                error: 'Error loading zones list',
                message: error.message 
            });
        }
    }

    // Mostrar formulario para nueva zona
    async newZoneForm(req, res) {
        try {
            const templates = await zoneService.getZoneTemplates();
            
            res.render('admin/zones/new', { 
                templates,
                title: 'Add New Zone'
            });
        } catch (error) {
            console.error('Error loading new zone form:', error);
            res.status(500).render('error', { 
                error: 'Error loading form',
                message: error.message 
            });
        }
    }

    // Crear nueva zona
    async createZone(req, res) {
        try {
            const {
                display_name, zone_code, country, state, city, region,
                latitude, longitude, radius_meters, search_terms, cuisine_focus,
                priority, timezone, population, is_active, notes, action
            } = req.body;

            // Validaciones básicas
            if (!display_name || !city || !state || !latitude || !longitude) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: display_name, city, state, latitude, longitude'
                });
            }

            // Validar coordenadas
            const coordValidation = geocodingService.validateCoordinates(latitude, longitude);
            if (!coordValidation.valid) {
                return res.status(400).json({
                    success: false,
                    error: coordValidation.error
                });
            }

            // Preparar datos de zona
            const zoneData = {
                display_name: display_name.trim(),
                zone_code: zone_code ? zone_code.trim() : null,
                country: country || 'US',
                state: state.trim(),
                city: city.trim(),
                region: region ? region.trim() : null,
                latitude: coordValidation.lat,
                longitude: coordValidation.lng,
                radius_meters: parseInt(radius_meters) || 5000,
                search_terms: search_terms ? search_terms.split(',').map(t => t.trim()) : ['restaurant'],
                cuisine_focus: cuisine_focus ? cuisine_focus.split(',').map(t => t.trim()).filter(t => t) : [],
                priority: parseInt(priority) || 2,
                timezone: timezone || 'America/New_York',
                population: population ? parseInt(population) : null,
                is_active: is_active === 'true',
                notes: notes ? notes.trim() : null,
                created_by: 'admin_user' // TODO: Get from session
            };

            const zone = await zoneService.createZone(zoneData);

            // Si la acción es "save_and_scrape", iniciar scraping
            if (action === 'save_and_scrape') {
                // TODO: Iniciar job de scraping
                console.log(`Starting scraping for zone: ${zone.id}`);
            }

            // Responder según el tipo de request
            if (req.headers.accept && req.headers.accept.includes('application/json')) {
                res.json({
                    success: true,
                    zone,
                    message: 'Zone created successfully'
                });
            } else {
                req.flash('success', 'Zone created successfully');
                res.redirect('/admin/zones');
            }
        } catch (error) {
            console.error('Error creating zone:', error);
            
            if (req.headers.accept && req.headers.accept.includes('application/json')) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
            } else {
                req.flash('error', error.message);
                res.redirect('/admin/zones/new');
            }
        }
    }

    // Mostrar formulario para editar zona
    async editZoneForm(req, res) {
        try {
            const { id } = req.params;
            const zone = await zoneService.getZoneById(id);
            
            if (!zone) {
                return res.status(404).render('error', {
                    error: 'Zone not found'
                });
            }

            const templates = await zoneService.getZoneTemplates();
            
            res.render('admin/zones/edit', { 
                zone,
                templates,
                title: `Edit Zone: ${zone.display_name}`
            });
        } catch (error) {
            console.error('Error loading edit zone form:', error);
            res.status(500).render('error', { 
                error: 'Error loading edit form',
                message: error.message 
            });
        }
    }

    // Actualizar zona
    async updateZone(req, res) {
        try {
            const { id } = req.params;
            const updateData = { ...req.body };

            // Remover campos que no deben actualizarse
            delete updateData.id;
            delete updateData.created_at;
            delete updateData.updated_at;

            // Validar coordenadas si se proporcionan
            if (updateData.latitude && updateData.longitude) {
                const coordValidation = geocodingService.validateCoordinates(updateData.latitude, updateData.longitude);
                if (!coordValidation.valid) {
                    return res.status(400).json({
                        success: false,
                        error: coordValidation.error
                    });
                }
                updateData.latitude = coordValidation.lat;
                updateData.longitude = coordValidation.lng;
            }

            // Convertir strings a números
            if (updateData.radius_meters) updateData.radius_meters = parseInt(updateData.radius_meters);
            if (updateData.priority) updateData.priority = parseInt(updateData.priority);
            if (updateData.population) updateData.population = parseInt(updateData.population);
            if (updateData.is_active) updateData.is_active = updateData.is_active === 'true';

            updateData.updated_by = 'admin_user'; // TODO: Get from session

            const zone = await zoneService.updateZone(id, updateData);

            if (req.headers.accept && req.headers.accept.includes('application/json')) {
                res.json({
                    success: true,
                    zone,
                    message: 'Zone updated successfully'
                });
            } else {
                req.flash('success', 'Zone updated successfully');
                res.redirect('/admin/zones');
            }
        } catch (error) {
            console.error('Error updating zone:', error);
            
            if (req.headers.accept && req.headers.accept.includes('application/json')) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
            } else {
                req.flash('error', error.message);
                res.redirect(`/admin/zones/${req.params.id}/edit`);
            }
        }
    }

    // Eliminar zona
    async deleteZone(req, res) {
        try {
            const { id } = req.params;
            
            await zoneService.deleteZone(id);

            res.json({
                success: true,
                message: 'Zone deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting zone:', error);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    // Alternar estado de zona
    async toggleZoneStatus(req, res) {
        try {
            const { id } = req.params;
            
            const zone = await zoneService.toggleZoneStatus(id);

            res.json({
                success: true,
                zone,
                message: `Zone ${zone.is_active ? 'activated' : 'deactivated'} successfully`
            });
        } catch (error) {
            console.error('Error toggling zone status:', error);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    // Duplicar zona
    async duplicateZone(req, res) {
        try {
            const { id } = req.params;
            const { display_name } = req.body;

            if (!display_name) {
                return res.status(400).json({
                    success: false,
                    error: 'Display name is required for duplication'
                });
            }

            const zone = await zoneService.duplicateZone(id, display_name);

            res.json({
                success: true,
                zone,
                message: 'Zone duplicated successfully'
            });
        } catch (error) {
            console.error('Error duplicating zone:', error);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    // Import masivo de zonas desde CSV
    async bulkImportZones(req, res) {
        try {
            if (!req.files || !req.files.csvFile) {
                return res.status(400).json({
                    success: false,
                    error: 'CSV file is required'
                });
            }

            const csvFile = req.files.csvFile;
            
            // Validar tipo de archivo
            if (!csvFile.name.toLowerCase().endsWith('.csv')) {
                return res.status(400).json({
                    success: false,
                    error: 'Only CSV files are allowed'
                });
            }

            const result = await zoneService.importZonesFromCSV(csvFile);

            if (req.headers.accept && req.headers.accept.includes('application/json')) {
                res.json(result);
            } else {
                req.flash('success', `Import completed: ${result.successCount} zones created, ${result.errorCount} errors`);
                if (result.errors.length > 0) {
                    req.flash('warning', 'Some rows had errors: ' + result.errors.slice(0, 3).join('; '));
                }
                res.redirect('/admin/zones');
            }
        } catch (error) {
            console.error('Error importing zones:', error);
            
            if (req.headers.accept && req.headers.accept.includes('application/json')) {
                res.status(400).json({
                    success: false,
                    error: error.message
                });
            } else {
                req.flash('error', 'Import failed: ' + error.message);
                res.redirect('/admin/zones');
            }
        }
    }

    // Crear zona desde template
    async createFromTemplate(req, res) {
        try {
            const { templateId, ...customData } = req.body;

            if (!templateId) {
                return res.status(400).json({
                    success: false,
                    error: 'Template ID is required'
                });
            }

            const zone = await zoneService.createFromTemplate(templateId, customData);

            res.json({
                success: true,
                zone,
                message: 'Zone created from template successfully'
            });
        } catch (error) {
            console.error('Error creating zone from template:', error);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    // Geocodificar dirección
    async geocodeAddress(req, res) {
        try {
            const { address } = req.query;

            if (!address) {
                return res.status(400).json({
                    success: false,
                    error: 'Address parameter is required'
                });
            }

            const result = await geocodingService.geocodeLocation(address);
            
            res.json({
                success: true,
                ...result
            });
        } catch (error) {
            console.error('Error geocoding address:', error);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    // Listar templates de zonas
    async listTemplates(req, res) {
        try {
            const templates = await zoneService.getZoneTemplates();
            
            res.render('admin/zones/templates', { 
                templates,
                title: 'Zone Templates'
            });
        } catch (error) {
            console.error('Error loading templates:', error);
            res.status(500).render('error', { 
                error: 'Error loading templates',
                message: error.message 
            });
        }
    }

    // Crear nuevo template
    async createTemplate(req, res) {
        try {
            const templateData = req.body;
            
            // Procesar arrays
            if (typeof templateData.default_search_terms === 'string') {
                templateData.default_search_terms = templateData.default_search_terms.split(',').map(t => t.trim());
            }
            if (typeof templateData.default_cuisine_focus === 'string') {
                templateData.default_cuisine_focus = templateData.default_cuisine_focus.split(',').map(t => t.trim()).filter(t => t);
            }

            const template = await zoneService.createTemplate(templateData);

            res.json({
                success: true,
                template,
                message: 'Template created successfully'
            });
        } catch (error) {
            console.error('Error creating template:', error);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }

    // Export de zonas a CSV
    async exportZonesCSV(req, res) {
        try {
            const csvContent = await zoneService.exportZonesCSV();
            const filename = `zones_export_${new Date().toISOString().split('T')[0]}.csv`;
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.send(csvContent);
        } catch (error) {
            console.error('Error exporting zones:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Descargar CSV de muestra
    async downloadSampleCSV(req, res) {
        try {
            const sampleCSV = zoneService.generateSampleCSV();
            
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="sample_zones.csv"');
            res.send(sampleCSV);
        } catch (error) {
            console.error('Error generating sample CSV:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // API para obtener detalles de template
    async getTemplateDetails(req, res) {
        try {
            const { id } = req.params;
            const template = await db.getZoneTemplateById(id);
            
            if (!template) {
                return res.status(404).json({
                    success: false,
                    error: 'Template not found'
                });
            }

            res.json(template);
        } catch (error) {
            console.error('Error fetching template details:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    }

    // Dashboard administrativo de zonas
    async adminDashboard(req, res) {
        try {
            const stats = await db.getDashboardStats();
            const recentZones = await db.query(`
                SELECT * FROM zone_stats 
                WHERE is_active = true 
                ORDER BY created_at DESC 
                LIMIT 5
            `);
            const activeJobs = await db.getActiveScrapingJobs();

            res.render('admin/dashboard', {
                title: 'Admin Dashboard',
                stats,
                recentZones: recentZones.rows,
                activeJobs: activeJobs.rows
            });
        } catch (error) {
            console.error('Error loading admin dashboard:', error);
            res.status(500).render('error', {
                error: 'Error loading dashboard',
                message: error.message
            });
        }
    }
}

module.exports = new ZoneController();