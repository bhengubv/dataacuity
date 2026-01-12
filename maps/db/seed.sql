-- DataAcuity Historical Maps - Seed Data
-- Initial dataset: South African cities + Biblical locations

-- ============================================
-- Create initial admin user
-- ============================================

INSERT INTO users (email, display_name, role, expertise_areas) VALUES
('tbengu@thegeek.co.za', 'Admin', 'admin', ARRAY['south_africa', 'biblical_history']),
('system@dataacuity.co.za', 'System', 'admin', ARRAY['all']);

-- ============================================
-- SOUTH AFRICAN CITIES
-- ============================================

-- Cape Town
INSERT INTO places (current_name, geometry, place_type, country_code, created_by)
VALUES ('Cape Town', ST_SetSRID(ST_MakePoint(18.4241, -33.9249), 4326), 'city', 'ZA', 1);

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'Kaapstad', 'Kaapstad', 'Afrikaans', 1652, NULL, 'official', 'Dutch/Afrikaans speakers', 'Dutch East India Company records'
FROM places WHERE current_name = 'Cape Town';

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, '//Hui !Gaeb', '//Hui !Gaeb', 'Khoi', NULL, 1652, 'indigenous', 'Khoi people', 'Oral histories and early colonial records'
FROM places WHERE current_name = 'Cape Town';

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'Camissa', 'Camissa', 'Khoi', NULL, 1652, 'indigenous', 'Khoi people', 'Place of sweet waters - Khoi name'
FROM places WHERE current_name = 'Cape Town';

-- Johannesburg
INSERT INTO places (current_name, geometry, place_type, country_code, created_by)
VALUES ('Johannesburg', ST_SetSRID(ST_MakePoint(28.0473, -26.2041), 4326), 'city', 'ZA', 1);

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'Egoli', 'eGoli', 'Zulu', 1886, NULL, 'colloquial', 'Zulu speakers', 'Means "Place of Gold"'
FROM places WHERE current_name = 'Johannesburg';

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'Gauteng', 'Gauteng', 'Sotho', 1886, NULL, 'colloquial', 'Sotho speakers', 'Means "Place of Gold"'
FROM places WHERE current_name = 'Johannesburg';

-- Durban
INSERT INTO places (current_name, geometry, place_type, country_code, created_by)
VALUES ('Durban', ST_SetSRID(ST_MakePoint(31.0218, -29.8587), 4326), 'city', 'ZA', 1);

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'eThekwini', 'eThekwini', 'Zulu', NULL, NULL, 'indigenous', 'Zulu people', 'Means "the bay/lagoon"'
FROM places WHERE current_name = 'Durban';

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'Port Natal', 'Port Natal', 'English', 1824, 1835, 'colonial', 'British settlers', 'Named on Christmas Day (Natal)'
FROM places WHERE current_name = 'Durban';

-- Pretoria
INSERT INTO places (current_name, geometry, place_type, country_code, created_by)
VALUES ('Pretoria', ST_SetSRID(ST_MakePoint(28.1881, -25.7461), 4326), 'city', 'ZA', 1);

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'Tshwane', 'Tshwane', 'Tswana', NULL, NULL, 'indigenous', 'Tswana people', 'Named after Chief Tshwane'
FROM places WHERE current_name = 'Pretoria';

-- Bloemfontein
INSERT INTO places (current_name, geometry, place_type, country_code, created_by)
VALUES ('Bloemfontein', ST_SetSRID(ST_MakePoint(26.2041, -29.1211), 4326), 'city', 'ZA', 1);

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'Mangaung', 'Mangaung', 'Sotho', NULL, NULL, 'indigenous', 'Sotho people', 'Means "place of cheetahs"'
FROM places WHERE current_name = 'Bloemfontein';

-- Port Elizabeth / Gqeberha
INSERT INTO places (current_name, geometry, place_type, country_code, created_by)
VALUES ('Gqeberha', ST_SetSRID(ST_MakePoint(25.8913, -33.9608), 4326), 'city', 'ZA', 1);

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'Port Elizabeth', 'Port Elizabeth', 'English', 1820, 2021, 'colonial', 'British settlers', 'Named after Elizabeth Donkin'
FROM places WHERE current_name = 'Gqeberha';

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'Gqeberha', 'Gqeberha', 'Xhosa', NULL, NULL, 'indigenous', 'Xhosa people', 'Refers to the Baakens River'
FROM places WHERE current_name = 'Gqeberha';

-- ============================================
-- BIBLICAL / ANCIENT LOCATIONS
-- ============================================

-- Jerusalem
INSERT INTO places (current_name, geometry, place_type, country_code, created_by)
VALUES ('Jerusalem', ST_SetSRID(ST_MakePoint(35.2137, 31.7683), 4326), 'city', 'IL', 1);

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'Yerushalayim', 'ירושלים', 'Hebrew', -1000, NULL, 'official', 'Israelites/Jews', 'Hebrew Bible'
FROM places WHERE current_name = 'Jerusalem';

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'Salem', 'שלם', 'Hebrew', -2000, -1000, 'ancient', 'Canaanites', 'Genesis 14:18 - City of Melchizedek'
FROM places WHERE current_name = 'Jerusalem';

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'Jebus', 'יבוס', 'Hebrew', -1400, -1000, 'ancient', 'Jebusites', 'Judges 19:10 - Before David conquered it'
FROM places WHERE current_name = 'Jerusalem';

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'City of David', 'עיר דוד', 'Hebrew', -1000, -586, 'religious', 'Israelites', '2 Samuel 5:7'
FROM places WHERE current_name = 'Jerusalem';

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'Aelia Capitolina', 'Aelia Capitolina', 'Latin', 135, 324, 'colonial', 'Romans', 'Roman Emperor Hadrian renamed it'
FROM places WHERE current_name = 'Jerusalem';

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'Al-Quds', 'القدس', 'Arabic', 638, NULL, 'official', 'Arabs/Muslims', 'Means "The Holy"'
FROM places WHERE current_name = 'Jerusalem';

-- Bethlehem
INSERT INTO places (current_name, geometry, place_type, country_code, created_by)
VALUES ('Bethlehem', ST_SetSRID(ST_MakePoint(35.2076, 31.7054), 4326), 'town', 'PS', 1);

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'Beit Lechem', 'בית לחם', 'Hebrew', -1400, NULL, 'official', 'Israelites', 'Means "House of Bread"'
FROM places WHERE current_name = 'Bethlehem';

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'Ephrath', 'אפרת', 'Hebrew', -1800, -1400, 'ancient', 'Canaanites', 'Genesis 35:19'
FROM places WHERE current_name = 'Bethlehem';

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'Bayt Lahm', 'بيت لحم', 'Arabic', 638, NULL, 'official', 'Arabs', 'Arabic name'
FROM places WHERE current_name = 'Bethlehem';

-- Nazareth
INSERT INTO places (current_name, geometry, place_type, country_code, created_by)
VALUES ('Nazareth', ST_SetSRID(ST_MakePoint(35.3039, 32.6996), 4326), 'city', 'IL', 1);

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'Natzrat', 'נצרת', 'Hebrew', -200, NULL, 'official', 'Jews', 'Hebrew name'
FROM places WHERE current_name = 'Nazareth';

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'An-Nasira', 'الناصرة', 'Arabic', 638, NULL, 'official', 'Arabs', 'Arabic name'
FROM places WHERE current_name = 'Nazareth';

-- Babylon
INSERT INTO places (current_name, geometry, place_type, country_code, created_by)
VALUES ('Babylon', ST_SetSRID(ST_MakePoint(44.4275, 32.5363), 4326), 'ancient_city', 'IQ', 1);

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'Bab-ilim', 'Bāb-ilim', 'Akkadian', -2300, -539, 'official', 'Babylonians', 'Means "Gate of God"'
FROM places WHERE current_name = 'Babylon';

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'Babel', 'בבל', 'Hebrew', -2000, NULL, 'religious', 'Israelites', 'Hebrew Bible - Tower of Babel'
FROM places WHERE current_name = 'Babylon';

-- Nineveh
INSERT INTO places (current_name, geometry, place_type, country_code, created_by)
VALUES ('Nineveh', ST_SetSRID(ST_MakePoint(43.1536, 36.3594), 4326), 'ancient_city', 'IQ', 1);

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'Ninua', 'Ninua', 'Akkadian', -2500, -612, 'official', 'Assyrians', 'Capital of Assyrian Empire'
FROM places WHERE current_name = 'Nineveh';

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'Nineveh', 'נינוה', 'Hebrew', -800, NULL, 'religious', 'Israelites', 'Book of Jonah'
FROM places WHERE current_name = 'Nineveh';

-- Egypt (Memphis)
INSERT INTO places (current_name, geometry, place_type, country_code, created_by)
VALUES ('Memphis', ST_SetSRID(ST_MakePoint(31.2547, 29.8481), 4326), 'ancient_city', 'EG', 1);

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'Ineb-Hedj', 'Ineb-Hedj', 'Egyptian', -3100, -2700, 'official', 'Ancient Egyptians', 'Means "White Walls"'
FROM places WHERE current_name = 'Memphis';

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'Men-nefer', 'Men-nefer', 'Egyptian', -2700, -640, 'official', 'Ancient Egyptians', 'Means "Enduring Beauty"'
FROM places WHERE current_name = 'Memphis';

INSERT INTO place_names (place_id, name, name_native, language, year_start, year_end, name_type, used_by, source_title)
SELECT id, 'Noph', 'נוף', 'Hebrew', -1500, NULL, 'religious', 'Israelites', 'Isaiah 19:13, Jeremiah 2:16'
FROM places WHERE current_name = 'Memphis';

-- ============================================
-- SAMPLE EVENTS
-- ============================================

-- David captures Jerusalem
INSERT INTO events (name, description, event_type, year, place_id, categories, source_title, contributed_by)
SELECT
    'David captures Jerusalem',
    'King David of Israel captures Jerusalem from the Jebusites and makes it his capital',
    'military',
    -1000,
    id,
    ARRAY['biblical', 'military', 'political'],
    '2 Samuel 5:6-10',
    1
FROM places WHERE current_name = 'Jerusalem';

-- Destruction of First Temple
INSERT INTO events (name, description, event_type, year, month, day, place_id, categories, source_title, contributed_by)
SELECT
    'Destruction of First Temple',
    'Nebuchadnezzar II of Babylon destroys Solomon''s Temple',
    'destruction',
    -586,
    7,
    9,
    id,
    ARRAY['biblical', 'religious', 'military'],
    '2 Kings 25',
    1
FROM places WHERE current_name = 'Jerusalem';

-- Birth of Jesus
INSERT INTO events (name, description, event_type, year, place_id, categories, source_title, contributed_by)
SELECT
    'Birth of Jesus',
    'According to Christian tradition, Jesus of Nazareth is born in Bethlehem',
    'religious',
    -4,
    id,
    ARRAY['biblical', 'religious', 'christianity'],
    'Gospel of Matthew, Gospel of Luke',
    1
FROM places WHERE current_name = 'Bethlehem';

-- Fall of Babylon
INSERT INTO events (name, description, event_type, year, place_id, categories, source_title, contributed_by)
SELECT
    'Fall of Babylon to Persia',
    'Cyrus the Great of Persia conquers Babylon',
    'military',
    -539,
    id,
    ARRAY['biblical', 'military', 'political'],
    'Daniel 5, Cyrus Cylinder',
    1
FROM places WHERE current_name = 'Babylon';

-- Dutch arrive at Cape
INSERT INTO events (name, description, event_type, year, month, day, place_id, categories, source_title, contributed_by)
SELECT
    'Dutch East India Company arrives',
    'Jan van Riebeeck establishes a refreshment station for the VOC at the Cape',
    'founding',
    1652,
    4,
    6,
    id,
    ARRAY['colonial', 'south_africa', 'political'],
    'VOC Records',
    1
FROM places WHERE current_name = 'Cape Town';

-- Discovery of Gold in Johannesburg
INSERT INTO events (name, description, event_type, year, place_id, categories, source_title, contributed_by)
SELECT
    'Gold discovered on Witwatersrand',
    'George Harrison discovers gold, leading to the founding of Johannesburg',
    'founding',
    1886,
    id,
    ARRAY['south_africa', 'economic'],
    'South African historical records',
    1
FROM places WHERE current_name = 'Johannesburg';

-- ============================================
-- MAP LAYERS
-- ============================================

INSERT INTO map_layers (name, description, layer_type, category, default_visible) VALUES
('Modern Borders', 'Current country boundaries', 'base', 'Modern', true),
('Biblical Locations', 'Places mentioned in the Bible', 'overlay', 'Biblical', false),
('South African Cities', 'Major cities in South Africa', 'overlay', 'Modern', true),
('Roman Empire (117 CE)', 'Roman Empire at greatest extent', 'historical', 'Classical', false),
('Pre-Colonial Africa', 'African kingdoms before colonization', 'historical', 'Pre-Colonial', false),
('Colonial Africa (1914)', 'Africa under European colonial rule', 'historical', 'Colonial', false);
