# Waze-like Features Technical Specification
## DataAcuity Maps - Crowd-Sourced Navigation Platform

**Version:** 1.0
**Date:** 2026-01-12
**Status:** Implementation Ready

---

## 1. Architecture Overview

### Data Flow
```
Mobile App (TagMe) → TagMe API → Staging DB → Airbyte ETL → Maps DB → Maps API → Frontend
                                      ↓
                              Anonymization Layer
```

### Key Principle
**All crowd-sourced data flows through the TagMe API** to ensure:
- Privacy protection via anonymization
- Centralized data validation
- Rate limiting and abuse prevention
- Audit trail for all submissions

---

## 2. Feature Categories

### 2.1 Crowd-Sourced Road Reports
Real-time reports from users about road conditions.

#### Report Types
| Type | Icon | Auto-Expire | Description |
|------|------|-------------|-------------|
| `traffic_jam` | 🚗 | 30 min | Traffic congestion |
| `traffic_moderate` | 🚙 | 20 min | Moderate traffic |
| `accident` | 💥 | 2 hours | Vehicle accident |
| `hazard_road` | ⚠️ | 4 hours | Road hazard (pothole, debris) |
| `hazard_weather` | 🌧️ | 2 hours | Weather hazard |
| `police` | 👮 | 1 hour | Police presence/speed trap |
| `closure` | 🚧 | 24 hours | Road closure |
| `construction` | 🏗️ | 7 days | Construction zone |
| `camera` | 📷 | Permanent | Speed camera (verified) |
| `fuel_price` | ⛽ | 24 hours | Fuel price update |

#### TagMe API Endpoint: `/ingest/report`
```json
{
  "report_type": "traffic_jam",
  "latitude": -26.2041,
  "longitude": 28.0473,
  "direction": 180,
  "severity": 3,
  "description": "Heavy traffic after accident",
  "photo_url": "optional",
  "device_id_hash": "abc123..."
}
```

### 2.2 Report Verification System
Users can confirm or dismiss reports to improve accuracy.

#### Verification Actions
- **Thumbs Up**: Confirms report is still valid (+1 confidence)
- **Thumbs Down**: Report no longer valid (-1 confidence)
- **Not There**: Report should be removed (-3 confidence)

#### Auto-Expiry Rules
- Reports expire based on type (see table above)
- Confidence score < -5 triggers immediate removal
- High-confidence reports (>10) get extended lifetime

### 2.3 Reviews System (via TagMe)

#### TagMe API Endpoint: `/ingest/review`
```json
{
  "poi_id": 12345,
  "poi_type": "restaurant",
  "latitude": -26.2041,
  "longitude": 28.0473,
  "rating": 4,
  "text": "Great food, slow service",
  "tags": ["good-food", "slow-service"],
  "photos": ["url1", "url2"],
  "visit_date": "2026-01-10",
  "device_id_hash": "abc123..."
}
```

### 2.4 Map Edits (Corrections & Additions)

#### Edit Types
| Type | Description | Verification Required |
|------|-------------|----------------------|
| `road_missing` | Report missing road | Admin review |
| `road_wrong` | Road direction/type wrong | Admin review |
| `turn_restriction` | Incorrect turn restriction | Admin review |
| `speed_limit` | Speed limit update | 3 confirmations |
| `place_closed` | Business permanently closed | 3 confirmations |
| `place_moved` | Business relocated | Admin review |
| `name_change` | Place name changed | 3 confirmations |

#### TagMe API Endpoint: `/ingest/map_edit`
```json
{
  "edit_type": "speed_limit",
  "latitude": -26.2041,
  "longitude": 28.0473,
  "road_name": "N1 Highway",
  "current_value": 120,
  "suggested_value": 100,
  "evidence": "New signs installed",
  "photo_url": "optional",
  "device_id_hash": "abc123..."
}
```

---

## 3. Gamification System

### 3.1 Points System
| Action | Points |
|--------|--------|
| Submit verified report | +10 |
| Report confirmed by others | +5 |
| Review submitted | +15 |
| Map edit accepted | +50 |
| Drive 10km with app | +5 |
| Report dismissed as invalid | -5 |
| Daily login streak | +2 per day |

### 3.2 Levels
| Level | Name | Points Required | Badge |
|-------|------|-----------------|-------|
| 1 | Newbie | 0 | 🌱 |
| 2 | Explorer | 100 | 🧭 |
| 3 | Navigator | 500 | 🗺️ |
| 4 | Road Warrior | 2,000 | ⚔️ |
| 5 | Local Legend | 10,000 | 🏆 |
| 6 | Map Master | 50,000 | 👑 |

### 3.3 Achievements
| Badge | Name | Requirement |
|-------|------|-------------|
| 🚨 | First Responder | First to report 10 incidents |
| 🦉 | Night Owl | 50 reports between 10pm-6am |
| 📸 | Photographer | 100 photos submitted |
| ⭐ | Reviewer | 50 reviews submitted |
| 🏠 | Local Expert | 500 reports in same area |
| 🛣️ | Road Tripper | Drove 1,000km with app |
| 🎯 | Sharp Eye | 100 reports verified accurate |

### 3.4 Leaderboards
- Weekly Top Contributors
- Monthly Champions
- All-Time Leaders
- City/Region Leaders

---

## 4. Traffic-Aware Routing

### 4.1 Traffic Data Sources
1. **Crowd-sourced reports** (primary)
2. **HERE Traffic API** (commercial backup)
3. **Historical patterns** (ML-based predictions)
4. **Event data** (concerts, sports, etc.)

### 4.2 ETA Calculation
```
ETA = Base Travel Time + Traffic Delay + Incident Delay + Weather Factor
```

### 4.3 Route Optimization
- Calculate multiple routes
- Score each route: time, distance, traffic, incidents
- Re-route automatically on new incidents
- User preference: fastest vs shortest vs avoid tolls

### 4.4 Real-time Updates
- Check for new incidents every 30 seconds during navigation
- Alert user to significant ETA changes (>5 min)
- Suggest alternative routes when beneficial

---

## 5. Database Schema (Staging)

### staging.road_reports
```sql
CREATE TABLE staging.road_reports (
    id SERIAL PRIMARY KEY,
    ingestion_id UUID NOT NULL,
    report_type VARCHAR(50) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    direction INTEGER,
    severity INTEGER DEFAULT 1,
    description TEXT,
    photo_url TEXT,
    device_id_hash VARCHAR(64),
    confidence_score INTEGER DEFAULT 0,
    expires_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ DEFAULT NOW(),
    verified_count INTEGER DEFAULT 0,
    dismissed_count INTEGER DEFAULT 0
);

CREATE INDEX idx_road_reports_location ON staging.road_reports
    USING gist (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326));
CREATE INDEX idx_road_reports_expires ON staging.road_reports(expires_at);
CREATE INDEX idx_road_reports_type ON staging.road_reports(report_type);
```

### staging.report_verifications
```sql
CREATE TABLE staging.report_verifications (
    id SERIAL PRIMARY KEY,
    report_id INTEGER REFERENCES staging.road_reports(id),
    action VARCHAR(20) NOT NULL, -- 'confirm', 'dismiss', 'not_there'
    device_id_hash VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### staging.user_points
```sql
CREATE TABLE staging.user_points (
    id SERIAL PRIMARY KEY,
    device_id_hash VARCHAR(64) NOT NULL UNIQUE,
    total_points INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    reports_submitted INTEGER DEFAULT 0,
    reports_verified INTEGER DEFAULT 0,
    reviews_submitted INTEGER DEFAULT 0,
    km_driven DOUBLE PRECISION DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### staging.user_achievements
```sql
CREATE TABLE staging.user_achievements (
    id SERIAL PRIMARY KEY,
    device_id_hash VARCHAR(64) NOT NULL,
    achievement_id VARCHAR(50) NOT NULL,
    earned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(device_id_hash, achievement_id)
);
```

### staging.reviews
```sql
CREATE TABLE staging.reviews (
    id SERIAL PRIMARY KEY,
    ingestion_id UUID NOT NULL,
    poi_id INTEGER,
    poi_type VARCHAR(100),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    text TEXT,
    tags TEXT[],
    photos TEXT[],
    visit_date DATE,
    device_id_hash VARCHAR(64),
    helpful_count INTEGER DEFAULT 0,
    received_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 6. API Endpoints Summary

### TagMe API (Ingestion)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/ingest/report` | Submit road report |
| POST | `/ingest/report/verify` | Verify/dismiss report |
| POST | `/ingest/review` | Submit place review |
| POST | `/ingest/map_edit` | Submit map correction |
| POST | `/ingest/drive_session` | Log drive session for points |

### Maps API (Read)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reports/nearby` | Get active reports near location |
| GET | `/api/reports/route` | Get reports along a route |
| GET | `/api/reviews/{poi_id}` | Get reviews for POI |
| GET | `/api/user/profile` | Get user points/badges |
| GET | `/api/leaderboard` | Get leaderboard |
| GET | `/api/route/traffic-aware` | Get route with traffic |

---

## 7. Implementation Phases

### Phase 1: Road Reports (Week 1-2)
- [ ] Database schema for reports
- [ ] TagMe API endpoints for reports
- [ ] Maps API endpoints to read reports
- [ ] Frontend: Report submission UI
- [ ] Frontend: Report display layer on map
- [ ] Report verification flow

### Phase 2: Reviews via TagMe (Week 2-3)
- [ ] Reviews schema in staging
- [ ] TagMe API endpoint for reviews
- [ ] Migrate existing reviews API
- [ ] Frontend: Review submission in place panel

### Phase 3: Gamification (Week 3-4)
- [ ] Points and levels schema
- [ ] Achievements system
- [ ] Leaderboard API
- [ ] Frontend: Profile page
- [ ] Frontend: Achievement notifications

### Phase 4: Traffic-Aware Routing (Week 4-5)
- [ ] Traffic layer combining sources
- [ ] Modified OSRM routing with traffic weights
- [ ] ETA calculation with traffic
- [ ] Re-routing logic
- [ ] Frontend: Traffic-aware navigation

### Phase 5: Map Edits (Week 5-6)
- [ ] Map edit schema
- [ ] TagMe API for edits
- [ ] Admin review dashboard
- [ ] Community verification flow

---

## 8. Privacy Considerations

### Anonymization
- Device IDs are hashed before storage
- Location data is aggregated after 24 hours
- Individual trips are never stored permanently
- Reviews are linked to hashed IDs only

### Data Retention
- Raw location pings: 7 days
- Reports: Until expired + 30 days archive
- Reviews: Permanent (anonymized)
- Points/Badges: Permanent (anonymized)

---

## 9. Mobile App Integration (TagMe)

### Required Updates
1. Report submission UI
2. Report verification UI
3. Points/badges display
4. Achievement notifications
5. Drive session tracking
6. Review submission flow

### Push Notifications
- New incident ahead on route
- Your report was verified
- You earned a new badge
- Weekly points summary

---

## 10. Success Metrics

| Metric | Target |
|--------|--------|
| Daily active reporters | 1,000+ |
| Report accuracy rate | >85% |
| Average report verification time | <5 min |
| User retention (30-day) | >40% |
| Reports per km driven | 0.1+ |

---

*Document prepared for DataAcuity Maps development team*
