# Circle OS Master Plan

> **"Slow is smooth. Smooth is fast. Fast leads to delivery."**

Complete implementation plan for Circle OS — from AOSP fork to deployed privacy-first mobile OS.

---

## Table of Contents

1. [Vision](#1-vision)
2. [Architecture Overview](#2-architecture-overview)
3. [Development Phases](#3-development-phases)
4. [Phase 0: Foundation](#phase-0-foundation)
5. [Phase 1: AOSP Fork](#phase-1-aosp-fork)
6. [Phase 2: Privacy Framework](#phase-2-privacy-framework)
7. [Phase 3: Security Hardening](#phase-3-security-hardening)
8. [Phase 4: Firewall & Network Control](#phase-4-firewall--network-control)
9. [Phase 5: Threat Intelligence](#phase-5-threat-intelligence)
10. [Phase 6: Malware Jail](#phase-6-malware-jail)
11. [Phase 7: Mesh Networking](#phase-7-mesh-networking)
12. [Phase 8: UI Shell & Apps](#phase-8-ui-shell--apps)
13. [Phase 9: Device Porting](#phase-9-device-porting)
14. [Phase 10: Testing & Release](#phase-10-testing--release)
15. [Data Acuity Backend](#data-acuity-backend)
16. [Team Structure](#team-structure)
17. [Success Metrics](#success-metrics)

---

## 1. Vision

### What Circle OS Is

A **privacy-respecting mobile operating system** that:

- Runs on existing Android devices (P30 Lite reference)
- Dual-boots alongside Android — coexist, don't conquer
- Runs Android apps under Circle's privacy rules
- Is honest about security limitations per device tier
- Works for ages 8 to 80

### Core Promise

> "You're NOT the product. Trust!"

**Users will:**
- KNOW what apps do with their data
- CONTROL what apps can access
- CHOOSE to share with communities they trust

### What Success Looks Like

```
Individual: "I understand what my phone is doing."
Family:     "My children are safe online."
Community:  "Our stokvel communicates without banks profiling us."
Society:    "African communities own their digital future."
```

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────┐
│             APPLICATIONS                 │
│  (Circle Apps + Android Apps via ART)   │
├─────────────────────────────────────────┤
│            CIRCLE UI SHELL              │
│   (Launcher, SystemUI, Settings)        │
├─────────────────────────────────────────┤
│          ANDROID RUNTIME (ART)          │
│      (For Android app compatibility)    │
├─────────────────────────────────────────┤
│          CIRCLE SYSTEM SERVICES         │
│  ┌─────────────────────────────────┐    │
│  │ CirclePrivacyManagerService     │    │
│  │ CircleFirewallService           │    │
│  │ CirclePermissionService         │    │
│  │ ThreatIntelService              │    │
│  │ MalwareJailService              │    │
│  │ CircleMeshService               │    │
│  └─────────────────────────────────┘    │
├─────────────────────────────────────────┤
│      HARDWARE ABSTRACTION LAYER         │
│         (HAL, Treble compatible)        │
├─────────────────────────────────────────┤
│              LINUX KERNEL               │
│    (Hardened, device-specific BSP)      │
└─────────────────────────────────────────┘
```

### Security Tiers (Honest Assessment)

| Tier | Hardware | Protection Level |
|------|----------|------------------|
| **1** | Circle Native, Pixel | Full verified boot, hardware attestation |
| **2** | Treble devices | Strong software protection, no HW attestation |
| **3** | P30 Lite (exploit boot) | Best effort, still better than stock Android |

Users see their tier clearly in Settings.

---

## 3. Development Phases

```
PHASE 0: Foundation          → Environment, tooling, repositories
    ↓
PHASE 1: AOSP Fork           → Get vanilla AOSP building
    ↓
PHASE 2: Privacy Framework   → THE CORE VALUE (network permission, scopes)
    ↓
PHASE 3: Security Hardening  → Kernel hardening, SELinux, encryption
    ↓
PHASE 4: Firewall            → VPN-based control, Traffic Lobby
    ↓
PHASE 5: Threat Intel        → Local threat DB, Data Acuity sync
    ↓
PHASE 6: Malware Jail        → Containment, honeypots (optional feature)
    ↓
PHASE 7: Mesh Networking     → Phone-to-phone comms (optional feature)
    ↓
PHASE 8: UI Shell & Apps     → Launcher, Settings, Circle apps
    ↓
PHASE 9: Device Porting      → P30 Lite, Pixels, other devices
    ↓
PHASE 10: Testing & Release  → QA, beta, stable release
```

---

## Phase 0: Foundation

### Goals
- Development environment ready
- Git repositories created
- CI/CD pipelines configured
- Documentation structure

### Tasks

```
□ Set up build server (Ubuntu 22.04, 64GB RAM, 500GB SSD)
□ Install AOSP build dependencies
□ Create GitHub organization: circleos
□ Create core repositories:
  - circleos/manifest
  - circleos/platform_frameworks_base
  - circleos/platform_build
  - circleos/vendor_circle
  - circleos/device_circle_common
□ Set up GitHub Actions for CI
□ Create documentation structure
□ Set up issue/project tracking
```

### Deliverables
- [ ] Build environment operational
- [ ] All repositories created
- [ ] CI pipeline runs on push
- [ ] CONTRIBUTING.md written

---

## Phase 1: AOSP Fork

### Goals
- Fork Android 14 AOSP
- Build successfully for emulator
- Create Circle OS branch structure

### Tasks

```
□ Initialize repo with Android 14 (android-14.0.0_r50)
□ Complete repo sync (~200GB, 2-6 hours)
□ Fork critical repositories:
  - frameworks/base → circle-14.0 branch
  - build/make → circle-14.0 branch
  - packages/apps/Settings → circle-14.0 branch
□ Create local manifest (circle.xml)
□ Create vendor/circle overlay structure
□ Create device/circle/common configs
□ Build for emulator (sdk_phone_x86_64-userdebug)
□ Boot emulator successfully
□ Verify: adb shell getprop shows Circle properties
```

### Key Files

```
.repo/local_manifests/circle.xml    # Points to Circle forks
vendor/circle/config/common.mk      # Circle OS configuration
vendor/circle/circle.mk             # Main vendor makefile
device/circle/common/common.mk      # Common device config
```

### Deliverables
- [ ] AOSP builds without modification
- [ ] Circle branches exist on all forked repos
- [ ] Emulator boots with ro.circle.version property
- [ ] No Google services included

---

## Phase 2: Privacy Framework

### Goals
**This is the core value proposition of Circle OS.**

Implement:
1. Network permission (apps cannot access internet by default)
2. Scoped contacts (share 3, not 300)
3. Scoped storage (apps see only what you share)
4. Privacy Dashboard (see everything apps do)
5. Sensor permissions (accelerometer, gyroscope, etc.)

### Components

```
frameworks/base/services/core/java/com/circleos/server/privacy/
├── CirclePrivacyManagerService.java    # Central privacy enforcement
├── CirclePermissionService.java        # Extended permission model
├── NetworkPermissionEnforcer.java      # Per-app network control
├── ScopedContactsProvider.java         # Contact scoping
├── ScopedStorageProvider.java          # Storage scoping
├── PrivacyLogger.java                  # Audit trail
└── PrivacyRulesEngine.java             # Policy enforcement
```

### 2.1 Network Permission

**The single most important privacy feature.**

```java
// Default: apps have NO network access
// Must request "Network" permission like camera/mic
// User sees: "App wants to access the Internet"

Implementation:
- Netfilter rules per-UID
- Default DROP for app UIDs
- Whitelist on permission grant
```

### 2.2 Scoped Contacts

```java
// "Contacts" permission grants ZERO contacts by default
// User adds specific contacts to app's scope
// App only sees scoped contacts

Implementation:
- Custom ContentProvider wrapper
- Per-app contact visibility table
- System UI for scoping
```

### 2.3 Scoped Storage

```java
// No access to shared storage by default
// App requests specific files via system picker
// App receives access ONLY to selected items

Implementation:
- Storage Access Framework enforced
- No legacy storage mode
- Per-app file grants
```

### 2.4 Privacy Dashboard

```
┌─────────────────────────────────────────┐
│ PRIVACY DASHBOARD                       │
├─────────────────────────────────────────┤
│ Permission usage last 24h:              │
│ 📍 Location:     3 apps                 │
│ 📷 Camera:       1 app                  │
│ 🎤 Microphone:   2 apps                 │
│ 🌐 Network:      15 apps                │
│                                         │
│ [View by app] [View timeline]           │
└─────────────────────────────────────────┘
```

### 2.5 Sensor Permissions

```java
// NEW permissions not in stock Android:
- ACCELEROMETER
- GYROSCOPE
- BAROMETER
- MAGNETOMETER
- STEP_COUNTER

// Why: sensors can fingerprint users
// Implementation: HAL wrapper with permission check
```

### Tasks

```
□ Implement CirclePrivacyManagerService
□ Implement network permission enforcement (netfilter)
□ Implement scoped contacts provider
□ Implement scoped storage enforcement
□ Implement sensor permission checks
□ Create Privacy Dashboard UI
□ Implement permission usage logging
□ Implement clipboard monitoring
□ Add permission auto-revoke (30 days unused)
□ Integration tests for all privacy features
```

### Deliverables
- [ ] New app cannot access network without permission
- [ ] New app with contacts permission sees 0 contacts until scoped
- [ ] Privacy Dashboard shows all permission usage
- [ ] All access logged locally (encrypted)

---

## Phase 3: Security Hardening

### Goals
Implement GrapheneOS-level security where hardware allows.

### 3.1 Kernel Hardening

```
Required configs:
- CONFIG_SECURITY_SELINUX=y
- CONFIG_DM_VERITY=y
- CONFIG_HARDENED_USERCOPY=y
- CONFIG_FORTIFY_SOURCE=y
- CONFIG_STACKPROTECTOR_STRONG=y
- CONFIG_CFI_CLANG=y (where supported)
- CONFIG_SHADOW_CALL_STACK=y (where supported)

Disabled:
- CONFIG_KALLSYMS (restricted)
- CONFIG_DEBUG_FS (production)
- CONFIG_KPROBES
```

### 3.2 hardened_malloc

```
- Replace standard allocator with GrapheneOS hardened_malloc
- Guard pages between allocations
- Randomized allocation
- Quarantine for freed memory
- System-wide default
```

### 3.3 SELinux Policies

```
- Strict policy based on AOSP
- No permissive domains in production
- Custom domains for Circle services:
  - circle_privacy
  - circle_firewall
  - circle_mesh
```

### 3.4 Encryption

```
File-Based Encryption (FBE):
- AES-256-XTS for file contents
- Per-profile keys (main, work, kid mode)

Metadata Encryption:
- dm-default-key enabled

Network:
- TLS 1.3 minimum
- Certificate pinning for Circle services
- DNS over HTTPS by default
```

### 3.5 Authentication

```
PIN/Password:
- Minimum 6 digits
- PIN scrambling (randomized keypad)
- Exponential lockout

Duress Features:
- Duress PIN (triggers wipe)
- Emergency lockdown (5x power)
- Auto-reboot after N hours
```

### Tasks

```
□ Apply kernel hardening configs
□ Integrate hardened_malloc
□ Write Circle SELinux policies
□ Enable file-based encryption
□ Enable metadata encryption
□ Implement PIN scrambling
□ Implement duress PIN
□ Implement auto-reboot timeout
□ Enable DNS-over-HTTPS
□ Implement certificate pinning
```

### Deliverables
- [ ] Kernel builds with hardening options
- [ ] SELinux enforcing with no denials
- [ ] All storage encrypted
- [ ] Duress features functional

---

## Phase 4: Firewall & Network Control

### Goals
Per-app network control with Traffic Lobby for suspicious connections.

### Architecture

```
┌───────────────────────────────────────────────┐
│              CIRCLE FIREWALL                  │
├───────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  POLICY  │  │ TRAFFIC  │  │  THREAT  │    │
│  │  ENGINE  │  │  LOBBY   │  │  SCANNER │    │
│  └──────────┘  └──────────┘  └──────────┘    │
│                                               │
│  ┌───────────────────────────────────────┐   │
│  │         LOCAL VPN SERVICE             │   │
│  │      (intercepts all traffic)         │   │
│  └───────────────────────────────────────┘   │
└───────────────────────────────────────────────┘
```

### 4.1 Policy Engine

```java
class AppNetworkPolicy {
    String packageName;
    boolean networkAllowed;        // Master switch
    boolean wifiAllowed;
    boolean mobileAllowed;
    List<String> allowedDomains;   // Whitelist
    List<String> blockedDomains;   // Blacklist
    TrafficLobbyMode lobbyMode;    // PARANOID, BALANCED, RELAXED
}
```

### 4.2 Traffic Lobby

```
Instead of binary ALLOW/BLOCK:
  ALLOW → Let through immediately
  LOBBY → Hold for inspection, then decide
  BLOCK → Drop immediately

Lobby Triggers:
- Unknown domain (first connection)
- Direct IP connection (no DNS)
- Beacon pattern (regular intervals)
- Large upload (potential exfiltration)
- New app probation (first 24h)
- Threat intel match
```

### 4.3 VPN-Based Interception

```java
// Local VPN (no external server)
// Traffic: App → VPN → Firewall → Network

class CircleVpnService extends VpnService {
    // Intercept ALL traffic
    // Inspect packets before exit
    // Block/allow/lobby decisions
    // All processing on-device
}
```

### 4.4 DNS Interception

```java
class CircleDnsInterceptor {
    // 1. Log domain requests per app
    // 2. Block known-bad domains
    // 3. Apply DNS-over-HTTPS
    // 4. Enforce per-app domain whitelists
}
```

### Components

```
frameworks/base/services/core/java/com/circleos/server/firewall/
├── CircleFirewallService.java
├── PolicyEngine.java
├── TrafficLobby.java
├── ThreatScanner.java
├── VpnInterceptor.java
├── DnsInterceptor.java
├── ConnectionLogger.java
└── db/
    ├── PolicyDatabase.java
    └── ConnectionLogDatabase.java
```

### Tasks

```
□ Implement CircleFirewallService
□ Implement VPN-based traffic interception
□ Implement PolicyEngine
□ Implement TrafficLobby logic
□ Implement DNS interception
□ Implement connection logging (SQLCipher)
□ Create Firewall settings UI
□ Create Traffic Lobby notification UI
□ Integration with Privacy Dashboard
□ Tests for all firewall rules
```

### Deliverables
- [ ] All app traffic routed through firewall
- [ ] Per-app network policies enforced
- [ ] Traffic Lobby holds suspicious connections
- [ ] All connections logged in Privacy Dashboard

---

## Phase 5: Threat Intelligence

### Goals
Local threat database with optional Data Acuity sync.

### Components

```
frameworks/base/services/core/java/com/circleos/server/threatintel/
├── ThreatIntelService.java
├── ThreatDatabase.java          # SQLCipher
├── ThreatFeedSync.java          # Sync from Data Acuity
├── ThreatAnonymizer.java        # Anonymize outgoing reports
├── ThreatReporter.java          # Submit (opt-in)
├── CanaryManager.java           # Canary tokens
└── FirewallIntegration.java
```

### 5.1 Local Threat Database

```sql
-- /data/circle/threat_intel/threat.db (encrypted)

threat_domains (domain, threat_type, severity, campaign)
threat_ips (ip, cidr, threat_type, severity)
threat_hashes (hash, threat_type, malware_family)
campaigns (id, name, actor_type, targets)
```

### 5.2 Threat Feed Sync

```
Source: api.dataacuity.co.za/v1/threat/feed
Schedule: Daily (background)
Content: Domains, IPs, hashes with severity

ALL Circle devices receive threat feed (regardless of sharing)
```

### 5.3 Community Defense (Opt-In)

```
If user opts in:
- Anonymized threat reports sent to Data Acuity
- No device identifiers
- No user content
- Only attack indicators (C2 IPs, malware hashes)

"Every attack on one user makes the whole network smarter."
```

### 5.4 Canary Tokens

```java
enum CanaryType {
    EMAIL,       // Unique email in honeypot
    PHONE,       // Unique phone number
    DOCUMENT,    // PDF with beacon
    DNS          // Unique hostname
}

// When canary triggered → device notified
// Evidence of data theft
```

### Tasks

```
□ Implement ThreatIntelService
□ Create ThreatDatabase (SQLCipher)
□ Implement ThreatFeedSync
□ Implement ThreatAnonymizer
□ Implement ThreatReporter (opt-in)
□ Implement CanaryManager
□ Integrate with CircleFirewallService
□ Create Community Defense settings UI
□ Bundle initial threat database (seed)
```

### Deliverables
- [ ] Threat database populated and updating
- [ ] Firewall blocks known-bad domains/IPs
- [ ] Opt-in reporting works (anonymized)
- [ ] Canary tokens functional

---

## Phase 6: Malware Jail

### Goals
Contain suspected malware, generate fake data, collect intelligence.

**Note:** This is an advanced feature. Implement after core privacy framework.

### Components

```
frameworks/base/services/core/java/com/circleos/server/malwarejail/
├── MalwareJailService.java
├── JailController.java          # Work profile isolation
├── HoneypotManager.java         # Fake contacts, photos
├── SyscallInterceptor.java      # seccomp + ptrace
├── C2Sinkhole.java              # Fake C2 server
├── IntelCollector.java          # Gather malware behavior
└── ReportGenerator.java
```

### Concept

```
1. User suspects app is malware
2. "Send to Malware Jail" option
3. App runs in isolated work profile
4. App sees fake data (honeypot)
5. Network goes to C2 sinkhole
6. All behavior logged
7. User gets intelligence report
8. Optional: share anonymously with community
```

### Tasks

```
□ Implement work profile isolation
□ Implement HoneypotManager (fake data generation)
□ Implement SyscallInterceptor (seccomp)
□ Implement C2Sinkhole
□ Implement IntelCollector
□ Create Malware Jail UI
□ Create intelligence report generator
□ Integration with ThreatReporter
```

---

## Phase 7: Mesh Networking

### Goals
Phone-to-phone communication without internet.

**Note:** This is an advanced feature. Implement after core functionality.

### Components

```
frameworks/base/services/core/java/com/circleos/server/mesh/
├── CircleMeshService.java
├── MeshDaemon.java
├── transport/
│   ├── ITransport.java
│   ├── WifiDirectTransport.java
│   └── BluetoothTransport.java
├── routing/
│   ├── RoutingTable.java
│   └── GossipRouter.java
├── crypto/
│   ├── MeshCrypto.java           # X25519 + XChaCha20
│   └── KeyManager.java
└── storage/
    ├── MessageStore.java         # Store-and-forward
    └── PeerStore.java
```

### Features

```
- WiFi Direct transport
- Bluetooth LE transport
- Multi-hop routing (gossip protocol)
- End-to-end encryption
- Store-and-forward (message delivery when peer reconnects)
- No central server
```

### Tasks

```
□ Implement WiFiDirectTransport
□ Implement BluetoothTransport
□ Implement RoutingTable
□ Implement GossipRouter
□ Implement MeshCrypto (X25519/XChaCha20-Poly1305)
□ Implement MessageStore (SQLCipher)
□ Create CircleMessages app
□ Multi-hop delivery tests
```

---

## Phase 8: UI Shell & Apps

### Goals
Circle-branded user interface, essential apps.

### 8.1 Launcher

```
- Clean home screen
- App drawer (swipe up)
- Widgets support
- Age-adaptive (Standard/Kid/Elder modes)
```

### 8.2 SystemUI

```
- Status bar with privacy indicators
  🟢 Location | 🟠 Microphone | 🔴 Camera | 🔵 Network
- Quick settings tiles
- Notification shade (privacy-aware)
```

### 8.3 Settings

```
packages/apps/CircleSettings/
├── PrivacyDashboardFragment.kt
├── FirewallSettingsFragment.kt
├── SecuritySettingsFragment.kt
├── CommunityDefenseFragment.kt
├── MalwareJailFragment.kt
└── MeshSettingsFragment.kt
```

### 8.4 Essential Apps

```
□ Browser (privacy-focused, Chromium-based)
□ Camera
□ Gallery
□ Files
□ Messages (standard SMS)
□ CircleMessages (mesh/E2E)
□ Calendar
□ Clock
□ Calculator
□ Contacts
```

### 8.5 Onboarding

```
Welcome → Language → WiFi → Privacy Intro →
PIN → Biometrics → Privacy Defaults → Age Mode → Done

Key screens:
- Privacy introduction (explain Circle's value)
- Privacy defaults (network permission, tracker blocking)
- Age mode selection (Standard/Kid/Elder)
```

### Tasks

```
□ Implement Circle Launcher
□ Modify SystemUI for privacy indicators
□ Create CircleSettings app
□ Implement Privacy Dashboard
□ Create onboarding wizard
□ Port/create essential apps
□ Implement age modes (Standard/Kid/Elder)
□ Apply Circle design system (colors, typography)
```

---

## Phase 9: Device Porting

### Goals
Port Circle OS to real hardware.

### 9.1 Target Devices

| Device | Tier | Priority | Notes |
|--------|------|----------|-------|
| **Pixel 6/7** | 1 | High | Best security, easiest port |
| **Generic Treble** | 2 | High | GSI image, wide compatibility |
| **P30 Lite** | 3 | Medium | Reference device, exploit boot |

### 9.2 Device Tree Structure

```
device/circle/
├── common/                # Shared configs
├── pixel/
│   ├── oriole/           # Pixel 6
│   └── bluejay/          # Pixel 6a
├── treble/
│   └── arm64_ab/         # Generic Treble
└── huawei/
    └── p30lite/          # MAR-LX1A
```

### 9.3 Porting Steps (per device)

```
1. Obtain device tree (from LineageOS or other source)
2. Obtain vendor blobs (extracted from stock)
3. Adapt device tree for Circle OS
4. Build and test basic boot
5. Test hardware (camera, sensors, modem)
6. Test Circle features (firewall, privacy)
7. Security hardening (device-specific)
8. Performance optimization
9. Release candidate testing
```

### Tasks

```
□ Create Pixel 6 device tree
□ Test Pixel 6 build
□ Create Generic Treble GSI
□ Test GSI on reference devices
□ Create P30 Lite device tree
□ Test P30 Lite build
□ Document porting process
□ Create device support matrix
```

---

## Phase 10: Testing & Release

### 10.1 Testing Requirements

```
Unit Tests:
- All Circle services (80% coverage minimum)
- Privacy framework components
- Firewall rules engine
- Crypto operations

Integration Tests:
- Network permission enforcement
- Scoped contacts/storage
- Threat blocking
- Traffic Lobby workflow

Security Tests:
- Penetration testing
- SELinux policy audit
- Crypto implementation review
- Privacy audit

Device Tests:
- Hardware functionality (per device)
- Battery impact
- Performance benchmarks
```

### 10.2 Release Process

```
1. Alpha (internal)
   - Feature complete
   - Major bugs fixed
   - Internal testing

2. Beta (limited public)
   - Bug bounty program
   - Community testing
   - Documentation finalized

3. Release Candidate
   - All critical bugs fixed
   - Security audit complete
   - Performance acceptable

4. Stable Release
   - Public release
   - Update channel established
   - Support infrastructure ready
```

### 10.3 Update Cadence

```
- Monthly security patches
- Critical vulnerabilities: 72-hour emergency patch
- Feature updates: quarterly
- Major versions: annually (aligned with AOSP)
```

### Tasks

```
□ Write unit tests (80% coverage)
□ Write integration test suite
□ Security penetration testing
□ Privacy audit
□ Performance profiling
□ Beta program setup
□ Bug bounty program
□ Documentation completion
□ Release infrastructure (OTA)
□ Support infrastructure
```

---

## Data Acuity Backend

### Overview

Data Acuity is the threat intelligence backend. Built separately from Circle OS.

```
Platform:    .NET 8 / ASP.NET Core
Database:    PostgreSQL 16
Cache:       Redis 7
Search:      Elasticsearch 8
Hosting:     Docker / The Geek Network infrastructure
```

### API Endpoints

```
POST /v1/threat/submit        # Receive reports from Circle OS
GET  /v1/threat/feed          # Serve threat feed
POST /v1/canary/register      # Register canary tokens
POST /v1/canary/trigger       # Record triggers
GET  /v1/stats/public         # Public statistics
GET  /v1/ioc/lookup           # IOC lookup (authenticated)
```

### Build Order

```
1. Database schema + migrations
2. Core entities (IOC, Campaign, ThreatReport)
3. IntakeService (process reports)
4. FeedGenerator (create threat feeds)
5. API controllers
6. Canary infrastructure
7. External feed integration (AbuseIPDB, PhishTank)
8. Docker deployment
```

See `chapters/22_data_acuity_platform.txt` for full specification.

---

## Team Structure

### Recommended Roles

```
Core OS Team:
- Lead: AOSP/Linux expert
- Privacy Framework: Android framework developer
- Security: Security engineer (kernel, SELinux)
- Firewall: Networking + Android developer

Features Team:
- Threat Intel: Backend + security developer
- UI/UX: Android UI developer + designer
- Apps: Android app developers

Device Team:
- Porting Lead: Device porting expert
- Per-device porters as needed

Backend Team:
- Data Acuity: .NET developer
- Infrastructure: DevOps engineer

QA Team:
- Test Lead: Manual + automated testing
- Security Tester: Penetration testing
```

---

## Success Metrics

### Phase Milestones

| Phase | Success Criteria |
|-------|------------------|
| 0 | Build environment operational |
| 1 | AOSP builds and boots in emulator |
| 2 | Network permission enforced, scoped contacts work |
| 3 | SELinux enforcing, encryption enabled |
| 4 | Firewall blocks traffic, Lobby holds suspicious |
| 5 | Threat DB updates, blocks known-bad |
| 6 | Malware Jail contains test app |
| 7 | Messages deliver over 2-hop mesh |
| 8 | Full UI functional, onboarding complete |
| 9 | Boots on Pixel 6, P30 Lite |
| 10 | Beta users report <5 critical bugs |

### User Metrics (Post-Launch)

```
Adoption:
- Downloads
- Active devices
- Geographic distribution

Privacy:
- Average apps with network permission denied
- Tracker domains blocked per day
- Privacy Dashboard usage

Security:
- Threats blocked per device
- Security incidents reported
- Update adoption rate

Community:
- Community Defense opt-in rate
- Threat reports submitted
- Active contributors
```

---

## Quick Reference: Chapter Mapping

| Chapter | Topic | Implementation Phase |
|---------|-------|---------------------|
| 01 | Vision | All |
| 02 | Non-goals | All |
| 03 | Security Model | Phase 3 |
| 04 | Privacy Framework | Phase 2 |
| 05 | Hardware | Phase 9 |
| 06 | Boot | Phase 3 |
| 07 | System Architecture | Phase 1-2 |
| 08 | Android Compatibility | Phase 2 |
| 09 | Data Continuity | Phase 8 |
| 10 | Updates & Recovery | Phase 10 |
| 11 | Onboarding | Phase 8 |
| 12 | Age Modes | Phase 8 |
| 13 | Accessibility | Phase 8 |
| 14 | Offline & Low Resource | Phase 8-9 |
| 15 | Circle Store | Phase 8 |
| 16 | Developer Guide | Phase 10 |
| 17 | Device Porting | Phase 9 |
| 18 | Mesh Networking | Phase 7 |
| 19 | Firewall & Traffic Lobby | Phase 4 |
| 20 | Malware Jail | Phase 6 |
| 21 | Threat Telemetry | Phase 5 |
| 22 | Data Acuity | Backend |
| 23 | Brand & Design | Phase 8 |

---

## Next Steps

1. **Complete Phase 0** — Set up build environment
2. **Complete Phase 1** — Get AOSP building
3. **Start Phase 2** — Implement privacy framework (the core value)

```bash
# Start here:
cd /c/Dev/Operating\ System/CircleOS
cat docs/01_AOSP_FORK_GUIDE.md
```

---

*Circle OS Master Plan v1.0 — January 2026*

*"The individual is sovereign. The community is chosen. The technology is ours."*
