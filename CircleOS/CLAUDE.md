# Circle OS & Data Acuity — Claude Code Instructions

> **"Slow is smooth. Smooth is fast. Fast leads to delivery."**

This document provides everything Claude Code needs to autonomously develop Circle OS components and the Data Acuity threat intelligence platform.

---

## PROJECT OVERVIEW

```
CIRCLE OS:         Privacy-first mobile OS (Android-based)
DATA ACUITY:       Threat intelligence platform (backend)
THE GEEK NETWORK:  Parent ecosystem (SDPKT, SleptOn, Bruh!)
```

**Repository Paths (relative to project root):**
```
SPEC ROOT:         ./                     # This specification
SPEC CHAPTERS:     ./chapters/            # Detailed chapters
CIRCLE OS CODE:    ../src/circleos/       # AOSP fork (convention)
DATA ACUITY CODE:  ../src/dataacuity/     # .NET backend (convention)
```

> **Note:** Paths are relative. On your machine, the project root might be
> `C:\Dev\Operating System\CircleOS\` (Windows) or `~/circleos/` (Linux).
> Adapt paths to your environment.

---

## CORE PHILOSOPHY

```
PRIVACY:      User data belongs to users. No tracking. No selling. Ever.
SECURITY:     Defense in depth. Assume breach. Contain and expose.
TRANSPARENCY: Document limitations. No security theater.
COMMUNITY:    Every attack makes everyone smarter.
SOVEREIGNTY:  African-owned, African-controlled, African-serving.
```

---

## BRAND IDENTITY

```
TAGLINE:      "You're NOT the product. Trust!"
MEANING:      Circle of Trust — you're inside, we protect our own
VOICE:        Confident, warm, honest, inclusive
AESTHETIC:    Organised warmth — premium without pretension
```

KEY COLORS:
```
Circle Deep:    #1A1F36    (primary dark)
Circle Warm:    #F5F0EB    (primary light)
Circle Gold:    #D4A574    (accent)
Sage:           #7D9B8A    (success/protected)
Terracotta:     #C17B5D    (warning/attention)
Blocked Red:    #C45C5C    (threats blocked)
```

BRAND PHRASES:
```
Onboarding:     "Welcome to the Circle."
Protected:      "The Circle protected you."
Community:      "47,832 people in your Circle."
```

---

## TECHNOLOGY STACK

### Circle OS (Mobile)

```
PLATFORM:     Android 14 (AOSP fork)
LANGUAGES:    Kotlin (preferred), Java, C/C++ (native)
BUILD:        Gradle, AOSP build system
UI:           Jetpack Compose
ARCHITECTURE: MVVM, Clean Architecture
CRYPTO:       Tink (Google), libsodium
MESH:         WiFi Direct, Bluetooth LE
DATABASE:     SQLite (SQLCipher for encrypted)
```

### Data Acuity (Backend)

```
PLATFORM:     .NET 8 / ASP.NET Core
LANGUAGES:    C#
DATABASE:     PostgreSQL 16
CACHE:        Redis 7
SEARCH:       Elasticsearch 8
QUEUE:        RabbitMQ / Redis Streams
STORAGE:      S3-compatible (Minio)
CONTAINER:    Docker
HOSTING:      The Geek Network infrastructure
```

---

## CHAPTER REFERENCE

| Ch | File | Topic | Implementation |
|----|------|-------|----------------|
| 01-17 | [existing] | Core OS | AOSP fork |
| 18 | 18_mesh_networking.txt | Mesh protocol | CircleMeshService |
| 19 | 19_firewall_lobby.txt | Firewall + Traffic Lobby | CircleFirewallService |
| 20 | 20_malware_jail.txt | Malware containment | MalwareJailService |
| 21 | 21_threat_telemetry.txt | Community defense | ThreatIntelService |
| 22 | 22_data_acuity_platform.txt | Backend platform | DataAcuity.Api |
| 23 | 23_brand_design_system.txt | Brand & UI Design | Design tokens, components |

**Read the chapter BEFORE implementing. Each contains detailed specs.**

---

## DIRECTORY STRUCTURE

### Circle OS (AOSP)

```
frameworks/base/services/core/java/com/circleos/server/
├── mesh/
│   ├── CircleMeshService.java          # Main mesh daemon
│   ├── MeshDaemon.java                 # Background worker
│   ├── transport/
│   │   ├── ITransport.java             # Transport interface
│   │   ├── WifiDirectTransport.java    # WiFi Direct impl
│   │   └── BluetoothTransport.java     # BLE impl
│   ├── routing/
│   │   ├── RoutingTable.java           # Peer routing
│   │   └── GossipRouter.java           # Gossip protocol
│   ├── crypto/
│   │   ├── MeshCrypto.java             # X25519, XChaCha20
│   │   └── KeyManager.java             # Key storage
│   └── storage/
│       ├── MessageStore.java           # Store-and-forward
│       └── PeerStore.java              # Known peers
│
├── firewall/
│   ├── CircleFirewallService.java      # Main firewall
│   ├── PolicyEngine.java               # Per-app policies
│   ├── TrafficLobby.java               # Quarantine system
│   ├── ThreatScanner.java              # YARA + threat intel
│   ├── VpnInterceptor.java             # VPN-based capture
│   ├── DnsInterceptor.java             # DNS filtering
│   └── db/
│       ├── PolicyDatabase.java
│       ├── ThreatIntelDatabase.java
│       └── ConnectionLogDatabase.java
│
├── malwarejail/
│   ├── MalwareJailService.java         # Main jail service
│   ├── JailController.java             # Manage jailed apps
│   ├── HoneypotManager.java            # Fake data generation
│   ├── SyscallInterceptor.java         # seccomp + ptrace
│   ├── C2Sinkhole.java                 # Fake C2 server
│   ├── IntelCollector.java             # Intelligence gathering
│   └── ReportGenerator.java            # User reports
│
└── threatintel/
    ├── ThreatIntelService.java         # Main service
    ├── ThreatDatabase.java             # Local threat DB
    ├── ThreatFeedSync.java             # Feed updates
    ├── ThreatReporter.java             # Submit reports
    ├── CanaryManager.java              # Canary tokens
    └── FirewallIntegration.java        # Connect to firewall

packages/apps/
├── CircleMessages/                     # Mesh messaging app
├── CircleBeacon/                       # Emergency beacon
└── CircleSettings/
    └── src/com/circleos/settings/
        ├── firewall/
        ├── malwarejail/
        └── communitydefense/
```

### Data Acuity (Backend)

```
DataAcuity/
├── src/
│   ├── DataAcuity.Api/                 # Web API
│   │   ├── Controllers/
│   │   │   ├── ThreatController.cs     # POST /threat/submit
│   │   │   ├── CanaryController.cs     # /canary/*
│   │   │   ├── IocController.cs        # /ioc/*
│   │   │   ├── CampaignController.cs   # /campaign/*
│   │   │   └── StatsController.cs      # /stats/*
│   │   └── Middleware/
│   │       ├── RateLimitingMiddleware.cs
│   │       └── ApiKeyAuthMiddleware.cs
│   │
│   ├── DataAcuity.Core/                # Domain logic
│   │   ├── Entities/
│   │   │   ├── IOC.cs
│   │   │   ├── Campaign.cs
│   │   │   ├── ThreatReport.cs
│   │   │   └── CanaryToken.cs
│   │   └── Services/
│   │       ├── IntakeService.cs        # Process reports
│   │       ├── AnalysisEngine.cs       # Correlate threats
│   │       ├── FeedGenerator.cs        # Generate feeds
│   │       └── CorrelationEngine.cs    # Link IOCs
│   │
│   ├── DataAcuity.Infrastructure/      # Data access
│   │   ├── Data/
│   │   │   └── DataAcuityDbContext.cs
│   │   └── ExternalFeeds/
│   │       ├── AbuseCHFeed.cs
│   │       └── PhishTankFeed.cs
│   │
│   └── DataAcuity.Canary/              # Canary servers
│       ├── EmailServer/
│       ├── DnsServer/
│       └── WebBeaconHandler/
│
├── tests/
│   ├── DataAcuity.UnitTests/
│   └── DataAcuity.IntegrationTests/
│
└── docker/
    └── docker-compose.yml
```

---

## KEY APIS

### Circle OS Binder Interfaces

```java
// ICircleMeshService.aidl
interface ICircleMeshService {
    void sendMessage(in byte[] recipientPubKey, in byte[] payload, in MeshMessageOptions options);
    void registerReceiver(String appId, IMessageReceiver callback);
    List<MeshPeer> getNearbyPeers();
    MeshStatus getStatus();
}

// ICircleFirewallService.aidl
interface ICircleFirewallService {
    AppNetworkPolicy getPolicy(String packageName);
    void setPolicy(String packageName, in AppNetworkPolicy policy);
    List<LobbyEntry> getPendingLobbyEntries();
    void resolveLobbyEntry(String entryId, boolean allow);
    List<ConnectionLog> getConnectionLog(long since, int limit);
}

// IMalwareJailService.aidl
interface IMalwareJailService {
    List<JailedApp> getJailedApps();
    JailStatus getJailStatus(String packageName);
    MalwareIntelligence getIntelligence(String packageName);
    byte[] generateReport(String packageName, String format);
    void shareAnonymously(String packageName);
}

// IThreatIntelService.aidl
interface IThreatIntelService {
    ThreatMatch checkDomain(String domain);
    ThreatMatch checkIP(String ip);
    void reportThreat(in ThreatReport report);
    CanaryToken createCanary(CanaryType type);
}
```

### Data Acuity REST API

```
BASE: https://api.dataacuity.co.za/v1

# Public endpoints (no auth)
POST /threat/submit           # Circle OS submits threat report
GET  /threat/feed             # Circle OS fetches threat feed
POST /canary/register         # Register canary token
GET  /stats/public            # Public statistics

# Authenticated endpoints (API key)
GET  /ioc/lookup?type=&value= # Lookup single IOC
POST /ioc/bulk-lookup         # Bulk IOC lookup
GET  /campaign/{id}           # Campaign details
GET  /feed/full               # Full feed (enterprise)
```

---

## DATABASE SCHEMAS

### Circle OS (SQLite)

```sql
-- /data/circle/threat_intel/threat.db
CREATE TABLE threat_domains (
    domain TEXT PRIMARY KEY,
    threat_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    campaign_id TEXT,
    first_seen INTEGER,
    last_updated INTEGER,
    source TEXT
);

CREATE TABLE threat_ips (
    ip TEXT NOT NULL,
    cidr INTEGER DEFAULT 32,
    threat_type TEXT NOT NULL,
    severity TEXT NOT NULL,
    PRIMARY KEY (ip, cidr)
);

-- /data/circle/firewall/connections.db
CREATE TABLE connections (
    id INTEGER PRIMARY KEY,
    timestamp INTEGER NOT NULL,
    app_package TEXT NOT NULL,
    dest_domain TEXT,
    dest_ip TEXT,
    dest_port INTEGER,
    decision TEXT,
    threat_match TEXT
);

-- /data/circle/honeypot/
-- Fake contacts, messages, photos, etc.
```

### Data Acuity (PostgreSQL)

```sql
-- See Chapter 22 for full schema
-- Key tables:
CREATE TABLE iocs (
    id UUID PRIMARY KEY,
    type VARCHAR(20) NOT NULL,           -- ip, domain, hash
    value TEXT NOT NULL,
    threat_type VARCHAR(50),             -- c2, malware, phishing
    severity VARCHAR(20) NOT NULL,       -- low, medium, high, critical
    confidence INTEGER DEFAULT 50,
    first_seen TIMESTAMP WITH TIME ZONE,
    last_seen TIMESTAMP WITH TIME ZONE,
    reports_count INTEGER DEFAULT 1,
    campaign_id UUID REFERENCES campaigns(id),
    source VARCHAR(50)
);

CREATE TABLE campaigns (
    id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    actor_type VARCHAR(50),              -- state, criminal, unknown
    targets TEXT[],
    target_regions VARCHAR(2)[],
    first_seen TIMESTAMP WITH TIME ZONE,
    last_active TIMESTAMP WITH TIME ZONE
);

CREATE TABLE threat_reports (
    id UUID PRIMARY KEY,
    received_at TIMESTAMP WITH TIME ZONE,
    country_code VARCHAR(2),
    threat_type VARCHAR(50),
    severity VARCHAR(20),
    report_data JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE
);

CREATE TABLE canary_tokens (
    id UUID PRIMARY KEY,
    type VARCHAR(20) NOT NULL,           -- email, phone, document, dns
    value TEXT NOT NULL UNIQUE,
    device_hash VARCHAR(64) NOT NULL,
    triggered BOOLEAN DEFAULT FALSE
);

CREATE TABLE canary_triggers (
    id UUID PRIMARY KEY,
    canary_id UUID REFERENCES canary_tokens(id),
    triggered_at TIMESTAMP WITH TIME ZONE,
    source_ip INET,
    user_agent TEXT
);
```

---

## CRYPTOGRAPHIC STANDARDS

```
KEY EXCHANGE:       X25519 ECDH
SYMMETRIC:          XChaCha20-Poly1305
SIGNATURES:         Ed25519
KEY DERIVATION:     HKDF-SHA256
HASHING:            SHA-256, BLAKE2b
TLS:                1.3 only, certificate pinning
DATABASE:           SQLCipher (256-bit AES)
```

---

## IMPLEMENTATION PRIORITIES

### Phase 1: Foundation (Week 1-2)
```
□ ThreatIntelService (local threat DB)
□ Threat feed sync (download from Data Acuity)
□ Basic firewall integration (block known-bad)
□ Data Acuity API scaffolding
```

### Phase 2: Firewall (Week 3-4)
```
□ CircleFirewallService (VPN-based)
□ PolicyEngine (per-app rules)
□ DNS interceptor
□ Connection logging
□ Traffic Lobby (quarantine)
```

### Phase 3: Intelligence (Week 5-6)
```
□ ThreatScanner (YARA rules)
□ ThreatReporter (submit to Data Acuity)
□ CanaryManager (token generation)
□ Data Acuity intake service
```

### Phase 4: Malware Jail (Week 7-8)
```
□ MalwareJailService
□ HoneypotManager (fake data)
□ SyscallInterceptor (seccomp)
□ C2Sinkhole (fake C2)
□ IntelCollector
```

### Phase 5: Mesh (Week 9-12)
```
□ CircleMeshService
□ WiFi Direct transport
□ Bluetooth transport
□ Routing table
□ Store-and-forward
□ CircleMessages app
```

---

## CODE STANDARDS

### Kotlin (Circle OS)

```kotlin
// Use coroutines for async
suspend fun fetchThreatFeed(): ThreatFeed {
    return withContext(Dispatchers.IO) {
        api.getFeed()
    }
}

// Use sealed classes for states
sealed class JailStatus {
    object Active : JailStatus()
    data class Contained(val since: Long) : JailStatus()
    object Removed : JailStatus()
}

// Extension functions for clarity
fun String.toSha256(): String = 
    MessageDigest.getInstance("SHA-256")
        .digest(this.toByteArray())
        .toHexString()
```

### C# (Data Acuity)

```csharp
// Use records for DTOs
public record ThreatReportDto(
    string SchemaVersion,
    string ReportType,
    string Country,
    DateTime Timestamp,
    IndicatorsDto Indicators
);

// Use async/await everywhere
public async Task<SubmitResponse> ProcessReport(ThreatReportDto report)
{
    await ValidateAsync(report);
    var id = await _db.InsertAsync(report);
    await _queue.EnqueueAsync(new AnalysisJob(id));
    return new SubmitResponse { Status = "accepted", ReportId = id };
}

// Use dependency injection
public class IntakeService : IIntakeService
{
    private readonly IDbContext _db;
    private readonly IAnalysisQueue _queue;
    
    public IntakeService(IDbContext db, IAnalysisQueue queue)
    {
        _db = db;
        _queue = queue;
    }
}
```

---

## TESTING REQUIREMENTS

### Unit Tests

```
COVERAGE TARGET: 80%+

Circle OS:
- All crypto functions
- Routing table operations
- Policy evaluation
- Threat matching
- Anonymization

Data Acuity:
- IOC normalization
- Report validation
- Feed generation
- Canary matching
```

### Integration Tests

```
Circle OS:
- Firewall blocks known-bad domain
- Lobby holds suspicious connection
- Jail contains malware
- Mesh delivers message (3-hop)

Data Acuity:
- Submit report → creates IOC
- IOC lookup returns match
- Canary trigger notifies device
- Feed contains recent threats
```

---

## SECURITY CHECKLIST

Before any PR:

```
□ No hardcoded secrets
□ All user data encrypted at rest
□ TLS for all network calls
□ Input validation on all endpoints
□ Rate limiting implemented
□ No PII in logs
□ Audit logging for sensitive operations
□ Memory cleared after crypto operations
```

---

## QUICK DECISIONS

```
"Should I log user data?"       → No. Log events, not content.
"Should I store this forever?"  → No. Set retention policy.
"Should I trust this input?"    → No. Validate everything.
"Should I skip encryption?"     → No. Always encrypt.
"Should I call home?"           → Only if user opted in.
"Should I block or lobby?"      → When in doubt, lobby.
```

---

## ERROR HANDLING

```kotlin
// Circle OS: Use Result type
fun checkThreat(domain: String): Result<ThreatMatch> {
    return runCatching {
        threatDb.lookup(domain) ?: ThreatMatch.None
    }
}
```

```csharp
// Data Acuity: Use problem details
[HttpPost("submit")]
public async Task<IActionResult> Submit([FromBody] ThreatReportDto report)
{
    try {
        var result = await _service.Process(report);
        return Ok(result);
    } catch (ValidationException ex) {
        return BadRequest(new ProblemDetails {
            Title = "Validation Failed",
            Detail = ex.Message
        });
    }
}
```

---

## ENVIRONMENT VARIABLES

### Circle OS (Build)

```bash
CIRCLE_BUILD_TYPE=userdebug
CIRCLE_THREAT_FEED_URL=https://api.dataacuity.co.za/v1/threat/feed
CIRCLE_CANARY_DOMAIN=canary.circelos.org
```

### Data Acuity (Runtime)

```bash
ASPNETCORE_ENVIRONMENT=Production
ConnectionStrings__Default=Host=db;Database=dataacuity;Username=app;Password=${DB_PASSWORD}
Redis__Connection=redis:6379
SDPKT_API_URL=https://api.sdpkt.co.za
SDPKT_API_KEY=<secret>
```

---

## DEPLOYMENT

### Data Acuity

```bash
# Build
docker build -t dataacuity:latest .

# Deploy (The Geek Network infrastructure)
docker-compose up -d

# Migrations
dotnet ef database update
```

### Circle OS

```bash
# Setup AOSP
repo init -u https://github.com/circleos/manifest.git
repo sync -j8

# Build
source build/envsetup.sh
lunch circle_arm64-userdebug
make -j$(nproc)
```

---

## INTEGRATION POINTS

### SDPKT (Side Pocket Wallet)

```csharp
// Pay relay rewards
POST https://api.sdpkt.co.za/api/wallet/credit
{
    "wallet_id": "...",
    "amount": 10.00,
    "currency": "ZAR",
    "reason": "Circle mesh relay reward",
    "source": "dataacuity"
}
```

### SleptOn (App Store)

```
// Distribute Circle OS updates
// Distribute threat feed updates
// Manage relay reward pool
```

---

## MONITORING

```yaml
# Prometheus metrics
dataacuity_reports_received_total
dataacuity_iocs_created_total
dataacuity_active_campaigns
dataacuity_canary_triggers_total
dataacuity_api_latency_seconds
```

---

## LEGAL

```
LICENSE:    GPL v3 (Circle OS), AGPL v3 (Data Acuity)
COPYRIGHT:  Circle Foundation (OS), The Geek (Pty) Ltd (Data Acuity)
```

---

## MANTRA

```
Slow is smooth.
Smooth is fast.
Fast leads to delivery.
Delivery leads to satisfaction.
Satisfaction leads to peace of mind.

For all concerned.
```

---

*Circle OS Specification v2.0 — January 2026*
