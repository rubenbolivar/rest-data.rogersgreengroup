const express = require('express');
const router = express.Router();
const zoneController = require('../controllers/zoneController');

// Dashboard administrativo
router.get('/', zoneController.adminDashboard);

// CRUD Zonas
router.get('/zones', zoneController.listZones);
router.get('/zones/new', zoneController.newZoneForm);
router.post('/zones', zoneController.createZone);
router.get('/zones/:id/edit', zoneController.editZoneForm);
router.put('/zones/:id', zoneController.updateZone);
router.delete('/zones/:id', zoneController.deleteZone);

// Funciones avanzadas de zonas
router.post('/zones/bulk-import', zoneController.bulkImportZones);
router.post('/zones/from-template', zoneController.createFromTemplate);
router.get('/zones/geocode', zoneController.geocodeAddress);
router.post('/zones/:id/duplicate', zoneController.duplicateZone);
router.post('/zones/:id/toggle-status', zoneController.toggleZoneStatus);

// Templates
router.get('/zone-templates', zoneController.listTemplates);
router.post('/zone-templates', zoneController.createTemplate);
router.get('/zone-templates/:id', zoneController.getTemplateDetails);

// Export/Import
router.get('/zones/export', zoneController.exportZonesCSV);
router.get('/zones/sample.csv', zoneController.downloadSampleCSV);

module.exports = router;