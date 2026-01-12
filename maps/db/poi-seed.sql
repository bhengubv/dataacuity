-- =============================================================================
-- South African POI Seed Data
-- Common locations for instant search results
-- =============================================================================

-- Insert categories
INSERT INTO poi_categories (name, icon, color) VALUES
    ('Shopping', 'shopping_cart', '#e91e63'),
    ('Fuel', 'local_gas_station', '#ff5722'),
    ('Hospital', 'local_hospital', '#f44336'),
    ('ATM', 'atm', '#4caf50'),
    ('Restaurant', 'restaurant', '#ff9800'),
    ('Hotel', 'hotel', '#9c27b0'),
    ('Airport', 'flight', '#2196f3'),
    ('University', 'school', '#3f51b5'),
    ('Government', 'account_balance', '#607d8b'),
    ('Entertainment', 'local_activity', '#e91e63'),
    ('Transport', 'directions_bus', '#00bcd4'),
    ('Landmark', 'place', '#795548'),
    ('Beach', 'beach_access', '#00bcd4'),
    ('Nature', 'park', '#4caf50'),
    ('Sports', 'sports_soccer', '#ff5722')
ON CONFLICT (name) DO NOTHING;

-- =============================================================================
-- MAJOR CITIES (High popularity for autocomplete priority)
-- =============================================================================
INSERT INTO pois (name, name_alt, latitude, longitude, category_id, subcategory, city, province, popularity_score) VALUES
-- Gauteng
('Johannesburg', 'Jozi/Egoli', -26.2041, 28.0473, (SELECT id FROM poi_categories WHERE name='Landmark'), 'city', 'Johannesburg', 'Gauteng', 1000),
('Pretoria', 'Tshwane', -25.7461, 28.1881, (SELECT id FROM poi_categories WHERE name='Landmark'), 'city', 'Pretoria', 'Gauteng', 950),
('Sandton', NULL, -26.1076, 28.0567, (SELECT id FROM poi_categories WHERE name='Landmark'), 'suburb', 'Johannesburg', 'Gauteng', 900),
('Soweto', NULL, -26.2678, 27.8585, (SELECT id FROM poi_categories WHERE name='Landmark'), 'township', 'Johannesburg', 'Gauteng', 850),

-- Western Cape
('Cape Town', 'Kaapstad', -33.9249, 18.4241, (SELECT id FROM poi_categories WHERE name='Landmark'), 'city', 'Cape Town', 'Western Cape', 980),
('Stellenbosch', NULL, -33.9321, 18.8602, (SELECT id FROM poi_categories WHERE name='Landmark'), 'town', 'Stellenbosch', 'Western Cape', 700),
('Paarl', NULL, -33.7342, 18.9622, (SELECT id FROM poi_categories WHERE name='Landmark'), 'town', 'Paarl', 'Western Cape', 600),
('Franschhoek', NULL, -33.9133, 19.1169, (SELECT id FROM poi_categories WHERE name='Landmark'), 'town', 'Franschhoek', 'Western Cape', 650),

-- KwaZulu-Natal
('Durban', 'eThekwini', -29.8587, 31.0218, (SELECT id FROM poi_categories WHERE name='Landmark'), 'city', 'Durban', 'KwaZulu-Natal', 920),
('Pietermaritzburg', NULL, -29.6006, 30.3794, (SELECT id FROM poi_categories WHERE name='Landmark'), 'city', 'Pietermaritzburg', 'KwaZulu-Natal', 700),
('Umhlanga', NULL, -29.7230, 31.0849, (SELECT id FROM poi_categories WHERE name='Landmark'), 'suburb', 'Durban', 'KwaZulu-Natal', 750),
('Ballito', NULL, -29.5390, 31.2140, (SELECT id FROM poi_categories WHERE name='Landmark'), 'town', 'Ballito', 'KwaZulu-Natal', 600),

-- Eastern Cape
('Port Elizabeth', 'Gqeberha', -33.9608, 25.6022, (SELECT id FROM poi_categories WHERE name='Landmark'), 'city', 'Gqeberha', 'Eastern Cape', 800),
('East London', 'Buffalo City', -33.0292, 27.8546, (SELECT id FROM poi_categories WHERE name='Landmark'), 'city', 'East London', 'Eastern Cape', 700),

-- Free State
('Bloemfontein', NULL, -29.0852, 26.1596, (SELECT id FROM poi_categories WHERE name='Landmark'), 'city', 'Bloemfontein', 'Free State', 750),

-- Other provinces
('Polokwane', 'Pietersburg', -23.9045, 29.4688, (SELECT id FROM poi_categories WHERE name='Landmark'), 'city', 'Polokwane', 'Limpopo', 650),
('Nelspruit', 'Mbombela', -25.4753, 30.9694, (SELECT id FROM poi_categories WHERE name='Landmark'), 'city', 'Mbombela', 'Mpumalanga', 650),
('Kimberley', NULL, -28.7323, 24.7623, (SELECT id FROM poi_categories WHERE name='Landmark'), 'city', 'Kimberley', 'Northern Cape', 600),
('Rustenburg', NULL, -25.6667, 27.2420, (SELECT id FROM poi_categories WHERE name='Landmark'), 'city', 'Rustenburg', 'North West', 600),
('Mahikeng', 'Mafikeng', -25.8652, 25.6442, (SELECT id FROM poi_categories WHERE name='Landmark'), 'city', 'Mahikeng', 'North West', 550);

-- =============================================================================
-- SHOPPING MALLS
-- =============================================================================
INSERT INTO pois (name, name_alt, latitude, longitude, category_id, subcategory, address, city, province, popularity_score) VALUES
-- Gauteng Malls
('Sandton City', NULL, -26.1078, 28.0520, (SELECT id FROM poi_categories WHERE name='Shopping'), 'mall', '83 Rivonia Road, Sandton', 'Johannesburg', 'Gauteng', 900),
('Mall of Africa', NULL, -25.9947, 28.1061, (SELECT id FROM poi_categories WHERE name='Shopping'), 'mall', 'Lone Creek Crescent, Waterfall City', 'Johannesburg', 'Gauteng', 880),
('Menlyn Park Shopping Centre', 'Menlyn', -25.7824, 28.2760, (SELECT id FROM poi_categories WHERE name='Shopping'), 'mall', 'Atterbury Road, Menlyn', 'Pretoria', 'Gauteng', 850),
('Eastgate Shopping Centre', NULL, -26.1833, 28.1167, (SELECT id FROM poi_categories WHERE name='Shopping'), 'mall', '43 Bradford Road, Bedfordview', 'Johannesburg', 'Gauteng', 800),
('Rosebank Mall', NULL, -26.1456, 28.0423, (SELECT id FROM poi_categories WHERE name='Shopping'), 'mall', '50 Bath Avenue, Rosebank', 'Johannesburg', 'Gauteng', 780),
('The Glen Shopping Centre', NULL, -26.2704, 28.0364, (SELECT id FROM poi_categories WHERE name='Shopping'), 'mall', 'Letaba Street, Glenvista', 'Johannesburg', 'Gauteng', 750),
('Clearwater Mall', NULL, -26.1331, 27.9386, (SELECT id FROM poi_categories WHERE name='Shopping'), 'mall', 'Hendrik Potgieter Road, Strubensvalley', 'Johannesburg', 'Gauteng', 720),
('Brooklyn Mall', NULL, -25.7717, 28.2381, (SELECT id FROM poi_categories WHERE name='Shopping'), 'mall', 'cnr Veale and Fehrsen Streets', 'Pretoria', 'Gauteng', 700),

-- Cape Town Malls
('V&A Waterfront', 'Waterfront', -33.9036, 18.4208, (SELECT id FROM poi_categories WHERE name='Shopping'), 'mall', '19 Dock Road, V&A Waterfront', 'Cape Town', 'Western Cape', 920),
('Canal Walk Shopping Centre', 'Canal Walk', -33.8944, 18.5117, (SELECT id FROM poi_categories WHERE name='Shopping'), 'mall', 'Century Boulevard, Century City', 'Cape Town', 'Western Cape', 850),
('Cavendish Square', NULL, -33.9067, 18.4617, (SELECT id FROM poi_categories WHERE name='Shopping'), 'mall', 'Dreyer Street, Claremont', 'Cape Town', 'Western Cape', 750),
('Tyger Valley Centre', NULL, -33.8722, 18.6311, (SELECT id FROM poi_categories WHERE name='Shopping'), 'mall', 'Willie van Schoor Avenue, Bellville', 'Cape Town', 'Western Cape', 720),

-- Durban Malls
('Gateway Theatre of Shopping', 'Gateway', -29.7271, 31.0710, (SELECT id FROM poi_categories WHERE name='Shopping'), 'mall', '1 Palm Boulevard, Umhlanga Ridge', 'Durban', 'KwaZulu-Natal', 880),
('Pavilion Shopping Centre', 'Pavilion', -29.8345, 30.9186, (SELECT id FROM poi_categories WHERE name='Shopping'), 'mall', '5 Lighthouse Road, Westville', 'Durban', 'KwaZulu-Natal', 800),
('La Lucia Mall', NULL, -29.7589, 31.0544, (SELECT id FROM poi_categories WHERE name='Shopping'), 'mall', '15 Meridian Drive, Umhlanga', 'Durban', 'KwaZulu-Natal', 700);

-- =============================================================================
-- AIRPORTS
-- =============================================================================
INSERT INTO pois (name, name_alt, latitude, longitude, category_id, subcategory, address, city, province, popularity_score) VALUES
('OR Tambo International Airport', 'JNB', -26.1367, 28.2411, (SELECT id FROM poi_categories WHERE name='Airport'), 'international', 'O.R. Tambo Airport Road, Kempton Park', 'Johannesburg', 'Gauteng', 950),
('Cape Town International Airport', 'CPT', -33.9648, 18.6017, (SELECT id FROM poi_categories WHERE name='Airport'), 'international', 'Matroosfontein', 'Cape Town', 'Western Cape', 920),
('King Shaka International Airport', 'DUR', -29.6144, 31.1197, (SELECT id FROM poi_categories WHERE name='Airport'), 'international', 'King Shaka Drive, La Mercy', 'Durban', 'KwaZulu-Natal', 880),
('Lanseria International Airport', 'HLA', -25.9385, 27.9261, (SELECT id FROM poi_categories WHERE name='Airport'), 'domestic', 'R512 & R511, Lanseria', 'Johannesburg', 'Gauteng', 750),
('Port Elizabeth Airport', 'PLZ', -33.9849, 25.6173, (SELECT id FROM poi_categories WHERE name='Airport'), 'domestic', 'Allister Miller Drive', 'Gqeberha', 'Eastern Cape', 700),
('Bram Fischer International Airport', 'BFN', -29.0927, 26.3024, (SELECT id FROM poi_categories WHERE name='Airport'), 'domestic', 'Airport Road, Bloemfontein', 'Bloemfontein', 'Free State', 650);

-- =============================================================================
-- HOSPITALS
-- =============================================================================
INSERT INTO pois (name, name_alt, latitude, longitude, category_id, subcategory, address, city, province, popularity_score) VALUES
-- Gauteng
('Netcare Milpark Hospital', 'Milpark', -26.1783, 28.0178, (SELECT id FROM poi_categories WHERE name='Hospital'), 'private', '9 Guild Road, Parktown West', 'Johannesburg', 'Gauteng', 850),
('Charlotte Maxeke Johannesburg Academic Hospital', 'Joburg Gen', -26.1733, 28.0378, (SELECT id FROM poi_categories WHERE name='Hospital'), 'public', 'Jubilee Road, Parktown', 'Johannesburg', 'Gauteng', 800),
('Netcare Sunninghill Hospital', NULL, -26.0333, 28.0589, (SELECT id FROM poi_categories WHERE name='Hospital'), 'private', 'Cnr Witkoppen & Nanyuki Roads', 'Johannesburg', 'Gauteng', 780),
('Life Flora Hospital', 'Flora Clinic', -26.1772, 28.1206, (SELECT id FROM poi_categories WHERE name='Hospital'), 'private', '63 6th Street, Orange Grove', 'Johannesburg', 'Gauteng', 700),
('Steve Biko Academic Hospital', NULL, -25.7289, 28.2053, (SELECT id FROM poi_categories WHERE name='Hospital'), 'public', 'Steve Biko Road, Pretoria', 'Pretoria', 'Gauteng', 780),

-- Western Cape
('Groote Schuur Hospital', NULL, -33.9417, 18.4622, (SELECT id FROM poi_categories WHERE name='Hospital'), 'public', 'Main Road, Observatory', 'Cape Town', 'Western Cape', 850),
('Netcare Christiaan Barnard Memorial Hospital', NULL, -33.9217, 18.4192, (SELECT id FROM poi_categories WHERE name='Hospital'), 'private', '181 Longmarket Street', 'Cape Town', 'Western Cape', 800),
('Red Cross War Memorial Children''s Hospital', 'Red Cross', -33.9439, 18.4683, (SELECT id FROM poi_categories WHERE name='Hospital'), 'public', 'Klipfontein Road, Rondebosch', 'Cape Town', 'Western Cape', 750),

-- KwaZulu-Natal
('Inkosi Albert Luthuli Central Hospital', 'Albert Luthuli', -29.8556, 30.9803, (SELECT id FROM poi_categories WHERE name='Hospital'), 'public', '800 Vusi Mzimela Road, Cato Manor', 'Durban', 'KwaZulu-Natal', 800),
('Netcare St Augustine''s Hospital', NULL, -29.8469, 31.0036, (SELECT id FROM poi_categories WHERE name='Hospital'), 'private', '107 JB Marks Road, Berea', 'Durban', 'KwaZulu-Natal', 780);

-- =============================================================================
-- UNIVERSITIES
-- =============================================================================
INSERT INTO pois (name, name_alt, latitude, longitude, category_id, subcategory, address, city, province, popularity_score) VALUES
('University of Cape Town', 'UCT', -33.9579, 18.4614, (SELECT id FROM poi_categories WHERE name='University'), 'public', 'Rondebosch', 'Cape Town', 'Western Cape', 900),
('University of the Witwatersrand', 'Wits', -26.1917, 28.0306, (SELECT id FROM poi_categories WHERE name='University'), 'public', '1 Jan Smuts Avenue, Braamfontein', 'Johannesburg', 'Gauteng', 890),
('Stellenbosch University', 'US/Maties', -33.9328, 18.8644, (SELECT id FROM poi_categories WHERE name='University'), 'public', 'Victoria Street, Stellenbosch', 'Stellenbosch', 'Western Cape', 850),
('University of Pretoria', 'UP/Tuks', -25.7545, 28.2314, (SELECT id FROM poi_categories WHERE name='University'), 'public', 'Lynnwood Road, Hatfield', 'Pretoria', 'Gauteng', 870),
('University of KwaZulu-Natal', 'UKZN', -29.8675, 30.9800, (SELECT id FROM poi_categories WHERE name='University'), 'public', 'University Road, Westville', 'Durban', 'KwaZulu-Natal', 820),
('University of Johannesburg', 'UJ', -26.1833, 27.9989, (SELECT id FROM poi_categories WHERE name='University'), 'public', 'Auckland Park', 'Johannesburg', 'Gauteng', 800),
('Rhodes University', NULL, -33.3128, 26.5225, (SELECT id FROM poi_categories WHERE name='University'), 'public', 'Drosty Road, Grahamstown', 'Makhanda', 'Eastern Cape', 700),
('Nelson Mandela University', 'NMU', -34.0008, 25.6700, (SELECT id FROM poi_categories WHERE name='University'), 'public', 'University Way, Summerstrand', 'Gqeberha', 'Eastern Cape', 750);

-- =============================================================================
-- TOURIST ATTRACTIONS & LANDMARKS
-- =============================================================================
INSERT INTO pois (name, name_alt, latitude, longitude, category_id, subcategory, address, city, province, popularity_score) VALUES
-- Cape Town
('Table Mountain', NULL, -33.9628, 18.4098, (SELECT id FROM poi_categories WHERE name='Nature'), 'mountain', 'Table Mountain National Park', 'Cape Town', 'Western Cape', 950),
('Robben Island', NULL, -33.8067, 18.3666, (SELECT id FROM poi_categories WHERE name='Landmark'), 'museum', 'Robben Island', 'Cape Town', 'Western Cape', 900),
('Cape Point', NULL, -34.3568, 18.4969, (SELECT id FROM poi_categories WHERE name='Nature'), 'viewpoint', 'Cape Point Nature Reserve', 'Cape Town', 'Western Cape', 850),
('Kirstenbosch National Botanical Garden', 'Kirstenbosch', -33.9881, 18.4328, (SELECT id FROM poi_categories WHERE name='Nature'), 'garden', 'Rhodes Drive, Newlands', 'Cape Town', 'Western Cape', 880),
('Camps Bay Beach', NULL, -33.9508, 18.3778, (SELECT id FROM poi_categories WHERE name='Beach'), 'beach', 'Victoria Road, Camps Bay', 'Cape Town', 'Western Cape', 850),
('Clifton Beach', 'Clifton 4th', -33.9381, 18.3772, (SELECT id FROM poi_categories WHERE name='Beach'), 'beach', 'Victoria Road, Clifton', 'Cape Town', 'Western Cape', 820),
('Bo-Kaap', 'Malay Quarter', -33.9208, 18.4147, (SELECT id FROM poi_categories WHERE name='Landmark'), 'neighborhood', 'Wale Street', 'Cape Town', 'Western Cape', 780),

-- Johannesburg
('Apartheid Museum', NULL, -26.2379, 28.0117, (SELECT id FROM poi_categories WHERE name='Landmark'), 'museum', 'Northern Parkway & Gold Reef Road', 'Johannesburg', 'Gauteng', 850),
('Constitution Hill', NULL, -26.1881, 28.0442, (SELECT id FROM poi_categories WHERE name='Landmark'), 'museum', '11 Kotze Street, Braamfontein', 'Johannesburg', 'Gauteng', 800),
('Gold Reef City', NULL, -26.2342, 28.0142, (SELECT id FROM poi_categories WHERE name='Entertainment'), 'theme_park', 'Shaft 14, Northern Parkway', 'Johannesburg', 'Gauteng', 780),
('Lion Park', NULL, -25.9344, 27.9008, (SELECT id FROM poi_categories WHERE name='Nature'), 'zoo', 'R512, Honeydew', 'Johannesburg', 'Gauteng', 750),
('Mandela House', NULL, -26.2437, 27.9078, (SELECT id FROM poi_categories WHERE name='Landmark'), 'museum', '8115 Vilakazi Street, Orlando West', 'Soweto', 'Gauteng', 800),

-- Durban
('uShaka Marine World', 'uShaka', -29.8681, 31.0450, (SELECT id FROM poi_categories WHERE name='Entertainment'), 'aquarium', '1 King Shaka Avenue, Point', 'Durban', 'KwaZulu-Natal', 850),
('Moses Mabhida Stadium', NULL, -29.8289, 31.0311, (SELECT id FROM poi_categories WHERE name='Sports'), 'stadium', '44 Isaiah Ntshangase Road', 'Durban', 'KwaZulu-Natal', 780),
('Durban Beachfront', 'Golden Mile', -29.8550, 31.0350, (SELECT id FROM poi_categories WHERE name='Beach'), 'beach', 'Marine Parade', 'Durban', 'KwaZulu-Natal', 820),

-- Kruger
('Kruger National Park', 'Kruger', -24.0117, 31.4850, (SELECT id FROM poi_categories WHERE name='Nature'), 'national_park', 'Kruger Park', 'Skukuza', 'Mpumalanga', 950),

-- Garden Route
('Tsitsikamma National Park', NULL, -33.9722, 23.8917, (SELECT id FROM poi_categories WHERE name='Nature'), 'national_park', 'Storms River', 'Storms River', 'Eastern Cape', 800),
('Knysna Heads', NULL, -34.0833, 23.0500, (SELECT id FROM poi_categories WHERE name='Nature'), 'viewpoint', 'Knysna', 'Knysna', 'Western Cape', 780),
('Plettenberg Bay', 'Plett', -34.0527, 23.3716, (SELECT id FROM poi_categories WHERE name='Beach'), 'town', 'Plettenberg Bay', 'Plettenberg Bay', 'Western Cape', 750);

-- =============================================================================
-- STADIUMS
-- =============================================================================
INSERT INTO pois (name, name_alt, latitude, longitude, category_id, subcategory, address, city, province, popularity_score) VALUES
('FNB Stadium', 'Soccer City', -26.2358, 27.9825, (SELECT id FROM poi_categories WHERE name='Sports'), 'stadium', 'Nasrec', 'Johannesburg', 'Gauteng', 850),
('Ellis Park Stadium', 'Emirates Airline Park', -26.2003, 28.0578, (SELECT id FROM poi_categories WHERE name='Sports'), 'stadium', 'Staib Street, Doornfontein', 'Johannesburg', 'Gauteng', 800),
('Loftus Versfeld Stadium', 'Loftus', -25.7522, 28.2231, (SELECT id FROM poi_categories WHERE name='Sports'), 'stadium', 'Kirkness Street, Arcadia', 'Pretoria', 'Gauteng', 780),
('Cape Town Stadium', 'Green Point Stadium', -33.9036, 18.4111, (SELECT id FROM poi_categories WHERE name='Sports'), 'stadium', 'Fritz Sonnenberg Road, Green Point', 'Cape Town', 'Western Cape', 800),
('Newlands Stadium', NULL, -33.9767, 18.4417, (SELECT id FROM poi_categories WHERE name='Sports'), 'stadium', 'Boundary Road, Newlands', 'Cape Town', 'Western Cape', 750);

-- =============================================================================
-- GOVERNMENT BUILDINGS
-- =============================================================================
INSERT INTO pois (name, name_alt, latitude, longitude, category_id, subcategory, address, city, province, popularity_score) VALUES
('Union Buildings', NULL, -25.7417, 28.2128, (SELECT id FROM poi_categories WHERE name='Government'), 'office', 'Government Avenue, Arcadia', 'Pretoria', 'Gauteng', 900),
('Parliament of South Africa', 'Parliament', -33.9283, 18.4178, (SELECT id FROM poi_categories WHERE name='Government'), 'parliament', '120 Plein Street', 'Cape Town', 'Western Cape', 880),
('Johannesburg City Hall', NULL, -26.2050, 28.0442, (SELECT id FROM poi_categories WHERE name='Government'), 'city_hall', 'President Street', 'Johannesburg', 'Gauteng', 700),
('Durban City Hall', NULL, -29.8575, 31.0242, (SELECT id FROM poi_categories WHERE name='Government'), 'city_hall', 'Church Street', 'Durban', 'KwaZulu-Natal', 700);

-- Update all search text
UPDATE pois SET updated_at = NOW();

-- Show counts
SELECT c.name as category, COUNT(*) as count
FROM pois p
JOIN poi_categories c ON p.category_id = c.id
GROUP BY c.name
ORDER BY count DESC;
