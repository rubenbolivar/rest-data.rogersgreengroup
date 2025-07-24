-- 🆕 ZONE TEMPLATES
-- Reusable templates for different types of geographical areas

-- Clear existing templates
TRUNCATE TABLE zone_templates RESTART IDENTITY;

INSERT INTO zone_templates (template_name, description, default_radius, default_search_terms, default_cuisine_focus, default_priority, config_json, is_active) VALUES

('US_Metropolitan', 'Large US metropolitan area', 15000, 
 ARRAY['restaurant', 'food', 'dining'], 
 ARRAY['diverse', 'international'], 
 1, 
 '{"population_density": "high", "parking": "limited", "public_transport": true, "tourist_area": true, "business_district": true}', 
 true),

('US_Suburban', 'US suburban area', 7000, 
 ARRAY['restaurant', 'family restaurant', 'casual dining'], 
 ARRAY['american', 'family-friendly'], 
 2, 
 '{"population_density": "medium", "parking": "available", "family_oriented": true, "chain_restaurants": true}', 
 true),

('US_Small_City', 'Small US city or town', 5000, 
 ARRAY['restaurant', 'diner', 'local restaurant'], 
 ARRAY['american', 'comfort food'], 
 2, 
 '{"population_density": "low", "parking": "abundant", "local_focus": true, "diners": true}', 
 true),

('Tourist_Area', 'Tourist destination or vacation spot', 8000, 
 ARRAY['restaurant', 'cafe', 'seafood restaurant', 'fine dining'], 
 ARRAY['seafood', 'fine dining', 'local specialties'], 
 1, 
 '{"seasonal": true, "tourism_focused": true, "higher_prices": true, "vacation_dining": true}', 
 true),

('College_Town', 'University or college area', 6000, 
 ARRAY['restaurant', 'pizza', 'fast food', 'student dining'], 
 ARRAY['pizza', 'fast casual', 'budget-friendly'], 
 2, 
 '{"student_focused": true, "budget_friendly": true, "late_night": true, "delivery_focused": true}', 
 true),

('Kosher_Community', 'Orthodox Jewish community', 5000, 
 ARRAY['kosher restaurant', 'kosher', 'restaurant', 'jewish food'], 
 ARRAY['kosher', 'jewish', 'middle eastern'], 
 2, 
 '{"kosher_focus": true, "sabbath_aware": true, "religious_dietary": true, "community_focused": true}', 
 true),

('Asian_District', 'Chinatown or Asian community area', 6000, 
 ARRAY['restaurant', 'asian restaurant', 'chinese restaurant', 'korean restaurant'], 
 ARRAY['chinese', 'korean', 'japanese', 'vietnamese', 'thai'], 
 2, 
 '{"ethnic_focus": "asian", "language_barriers": true, "authentic_cuisine": true, "cultural_specific": true}', 
 true),

('Business_District', 'Central business district or financial area', 5000, 
 ARRAY['restaurant', 'lunch spot', 'business dining', 'quick service'], 
 ARRAY['quick service', 'business lunch', 'upscale casual'], 
 1, 
 '{"business_focused": true, "lunch_rush": true, "expense_account": true, "quick_service": true}', 
 true),

('Waterfront_Area', 'Coastal or waterfront location', 7000, 
 ARRAY['restaurant', 'seafood restaurant', 'waterfront dining', 'marina restaurant'], 
 ARRAY['seafood', 'fresh fish', 'waterfront views'], 
 2, 
 '{"waterfront": true, "seafood_focus": true, "scenic_dining": true, "seasonal_hours": true}', 
 true),

('Historic_District', 'Historic downtown or heritage area', 4000, 
 ARRAY['restaurant', 'historic restaurant', 'local cuisine'], 
 ARRAY['traditional', 'local specialties', 'heritage cuisine'], 
 2, 
 '{"historic_focus": true, "local_heritage": true, "traditional_cuisine": true, "tourist_interest": true}', 
 true),

('Entertainment_District', 'Theater, nightlife, or entertainment area', 6000, 
 ARRAY['restaurant', 'late night dining', 'pre-theater dining', 'nightlife'], 
 ARRAY['fine dining', 'late night', 'cocktail focused'], 
 1, 
 '{"entertainment_focused": true, "late_hours": true, "pre_post_show": true, "nightlife": true}', 
 true),

('Shopping_Center', 'Mall or major shopping area', 5000, 
 ARRAY['restaurant', 'food court', 'chain restaurant', 'family dining'], 
 ARRAY['chain restaurants', 'fast casual', 'family dining'], 
 2, 
 '{"shopping_focused": true, "chain_heavy": true, "family_oriented": true, "food_court": true}', 
 true),

('International_Airport', 'Airport or transportation hub area', 8000, 
 ARRAY['restaurant', 'airport dining', 'quick service', 'grab and go'], 
 ARRAY['quick service', 'international', 'grab and go'], 
 3, 
 '{"airport_focused": true, "quick_service": true, "international_travelers": true, "limited_time": true}', 
 true),

('Resort_Area', 'Vacation resort or luxury destination', 10000, 
 ARRAY['restaurant', 'resort dining', 'fine dining', 'vacation dining'], 
 ARRAY['fine dining', 'resort cuisine', 'luxury dining'], 
 2, 
 '{"resort_focused": true, "luxury_dining": true, "vacation_pricing": true, "seasonal": true}', 
 true),

('Rural_Town', 'Small rural town or farming community', 8000, 
 ARRAY['restaurant', 'diner', 'family restaurant', 'country cooking'], 
 ARRAY['american', 'comfort food', 'home cooking'], 
 3, 
 '{"rural_focus": true, "comfort_food": true, "local_community": true, "family_owned": true}', 
 true);

-- Verify the templates
SELECT 
    template_name,
    description,
    default_radius/1000.0 as radius_km,
    array_length(default_search_terms, 1) as search_terms_count,
    array_length(default_cuisine_focus, 1) as cuisine_focus_count,
    CASE default_priority 
        WHEN 1 THEN 'High' 
        WHEN 2 THEN 'Medium' 
        WHEN 3 THEN 'Low' 
    END as priority_level
FROM zone_templates 
WHERE is_active = true
ORDER BY template_name;