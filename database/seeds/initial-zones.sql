-- 🌍 CONFIGURACIÓN INICIAL DE ZONAS
-- Insert the 23 initial zones as specified in the requirements

-- Clear existing data (for fresh setup)
TRUNCATE TABLE zones RESTART IDENTITY CASCADE;

-- 🆕 SEED DATA: Insertar las 23 zonas iniciales
INSERT INTO zones (zone_code, display_name, country, state, city, region, latitude, longitude, radius_meters, priority, notes, created_by) VALUES
-- NYC Core
('manhattan', 'Manhattan, NYC', 'US', 'NY', 'New York', 'New York Metropolitan Area', 40.7831, -73.9712, 8000, 1, 'NYC Core - Highest restaurant density', 'system'),
('brooklyn', 'Brooklyn, NYC', 'US', 'NY', 'Brooklyn', 'New York Metropolitan Area', 40.6782, -73.9442, 12000, 1, 'NYC Core - Large diverse area', 'system'),
('queens', 'Queens, NYC', 'US', 'NY', 'Queens', 'New York Metropolitan Area', 40.7282, -73.7949, 15000, 1, 'NYC Core - Most diverse borough', 'system'),
('bronx', 'Bronx, NYC', 'US', 'NY', 'Bronx', 'New York Metropolitan Area', 40.8448, -73.8648, 12000, 1, 'NYC Core - Growing food scene', 'system'),
('staten_island', 'Staten Island, NYC', 'US', 'NY', 'Staten Island', 'New York Metropolitan Area', 40.5795, -74.1502, 10000, 2, 'NYC Core - Suburban character', 'system'),

-- NYC Neighbors
('jersey_city', 'Jersey City, NJ', 'US', 'NJ', 'Jersey City', 'New York Metropolitan Area', 40.7178, -74.0431, 8000, 2, 'NYC neighbor - Growing dining scene', 'system'),
('hoboken', 'Hoboken, NJ', 'US', 'NJ', 'Hoboken', 'New York Metropolitan Area', 40.7439, -74.0323, 3000, 2, 'Small dense area with many restaurants', 'system'),
('yonkers', 'Yonkers, NY', 'US', 'NY', 'Yonkers', 'Westchester County', 40.9312, -73.8988, 8000, 2, 'Just north of NYC', 'system'),
('long_island_city', 'Long Island City, NY', 'US', 'NY', 'Long Island City', 'New York Metropolitan Area', 40.7505, -73.9370, 5000, 2, 'Queens waterfront area', 'system'),
('williamsburg', 'Williamsburg, Brooklyn', 'US', 'NY', 'Brooklyn', 'New York Metropolitan Area', 40.7081, -73.9571, 4000, 2, 'Trendy Brooklyn neighborhood', 'system'),
('astoria', 'Astoria, Queens', 'US', 'NY', 'Queens', 'New York Metropolitan Area', 40.7722, -73.9196, 6000, 2, 'Diverse Queens neighborhood', 'system'),
('flushing', 'Flushing, Queens', 'US', 'NY', 'Queens', 'New York Metropolitan Area', 40.7674, -73.8330, 5000, 2, 'Asian cuisine concentration', 'system'),
('newark', 'Newark, NJ', 'US', 'NJ', 'Newark', 'New York Metropolitan Area', 40.7357, -74.1724, 10000, 2, 'Major NJ city', 'system'),

-- Rockland County
('new_city_rockland', 'New City, NY', 'US', 'NY', 'New City', 'Rockland County', 41.1476, -73.9890, 8000, 2, 'Rockland County seat', 'system'),
('spring_valley', 'Spring Valley, NY', 'US', 'NY', 'Spring Valley', 'Rockland County', 41.1126, -74.0437, 6000, 2, 'Commercial center', 'system'),
('suffern', 'Suffern, NY', 'US', 'NY', 'Suffern', 'Rockland County', 41.1146, -74.1496, 5000, 2, 'NY/NJ border town', 'system'),
('nyack', 'Nyack, NY', 'US', 'NY', 'Nyack', 'Rockland County', 41.0909, -73.9179, 4000, 2, 'Historic riverside town with dining', 'system'),
('pearl_river', 'Pearl River, NY', 'US', 'NY', 'Pearl River', 'Rockland County', 41.0590, -74.0196, 4000, 2, 'Established suburban community', 'system'),
('monsey', 'Monsey, NY', 'US', 'NY', 'Monsey', 'Rockland County', 41.1084, -74.0687, 5000, 2, 'Large Orthodox Jewish community - kosher focus', 'system'),
('nanuet', 'Nanuet, NY', 'US', 'NY', 'Nanuet', 'Rockland County', 41.0870, -74.0135, 4000, 2, 'Shopping and dining center', 'system'),
('west_haverstraw', 'West Haverstraw, NY', 'US', 'NY', 'West Haverstraw', 'Rockland County', 41.2090, -73.9829, 3000, 3, 'Small historic community', 'system'),
('haverstraw', 'Haverstraw, NY', 'US', 'NY', 'Haverstraw', 'Rockland County', 41.1959, -73.9665, 4000, 3, 'Hudson River community', 'system'),
('stony_point', 'Stony Point, NY', 'US', 'NY', 'Stony Point', 'Rockland County', 41.2290, -73.9871, 3000, 3, 'Residential area with dining', 'system');

-- Update cuisine focus for specific zones
UPDATE zones SET cuisine_focus = ARRAY['kosher', 'jewish'] WHERE zone_code = 'monsey';
UPDATE zones SET cuisine_focus = ARRAY['asian', 'chinese', 'korean'] WHERE zone_code = 'flushing';
UPDATE zones SET cuisine_focus = ARRAY['diverse', 'international'] WHERE zone_code IN ('queens', 'brooklyn', 'astoria');

-- Set special search terms for specific zones
UPDATE zones SET search_terms = ARRAY['restaurant', 'kosher restaurant', 'kosher food'] WHERE zone_code = 'monsey';
UPDATE zones SET search_terms = ARRAY['restaurant', 'asian restaurant', 'chinese restaurant'] WHERE zone_code = 'flushing';

-- Verify the data
SELECT 
    zone_code,
    display_name,
    city || ', ' || state as location,
    priority,
    radius_meters/1000.0 as radius_km,
    CASE WHEN is_active THEN 'Active' ELSE 'Inactive' END as status
FROM zones 
ORDER BY priority ASC, display_name ASC;