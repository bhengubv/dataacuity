#
# Circle OS Common Configuration
# Included by all Circle OS builds
#

# ============================================================
# CIRCLE OS VERSION
# ============================================================

CIRCLE_VERSION_MAJOR := 1
CIRCLE_VERSION_MINOR := 0
CIRCLE_VERSION_PATCH := 0
CIRCLE_VERSION := $(CIRCLE_VERSION_MAJOR).$(CIRCLE_VERSION_MINOR).$(CIRCLE_VERSION_PATCH)

# Build type: UNOFFICIAL, OFFICIAL, EXPERIMENTAL
CIRCLE_BUILDTYPE ?= UNOFFICIAL

# Build date
CIRCLE_BUILD_DATE := $(shell date -u +%Y%m%d)

# ============================================================
# PRODUCT CONFIGURATION
# ============================================================

PRODUCT_BRAND := CircleOS
PRODUCT_MODEL := Circle Device

# ============================================================
# CIRCLE OS PACKAGES
# ============================================================

# Core Circle services (built into framework)
# These are in frameworks/base/services/core/java/com/circleos/server/

# Circle OS apps
PRODUCT_PACKAGES += \
    CircleSettings \
    CircleLauncher

# Future packages (uncomment when ready)
# PRODUCT_PACKAGES += \
#     CircleMessages \
#     CirclePrivacyDashboard \
#     CircleBrowser

# ============================================================
# CIRCLE OS OVERLAYS
# ============================================================

PRODUCT_PACKAGE_OVERLAYS += \
    vendor/circle/overlay/common

# ============================================================
# SYSTEM PROPERTIES
# ============================================================

# Circle OS identification
PRODUCT_SYSTEM_DEFAULT_PROPERTIES += \
    ro.circle.version=$(CIRCLE_VERSION) \
    ro.circle.version.major=$(CIRCLE_VERSION_MAJOR) \
    ro.circle.version.minor=$(CIRCLE_VERSION_MINOR) \
    ro.circle.buildtype=$(CIRCLE_BUILDTYPE) \
    ro.circle.build.date=$(CIRCLE_BUILD_DATE)

# Privacy defaults (THE CORE VALUE)
PRODUCT_SYSTEM_DEFAULT_PROPERTIES += \
    persist.circle.privacy.enabled=true \
    persist.circle.privacy.network_permission=true \
    persist.circle.privacy.scoped_contacts=true \
    persist.circle.privacy.scoped_storage=true \
    persist.circle.privacy.sensor_permission=true \
    persist.circle.privacy.clipboard_monitor=true \
    persist.circle.privacy.clipboard_clear_timeout=60000

# Firewall defaults
PRODUCT_SYSTEM_DEFAULT_PROPERTIES += \
    persist.circle.firewall.enabled=true \
    persist.circle.firewall.lobby_mode=balanced \
    persist.circle.firewall.block_trackers=true

# Security defaults
PRODUCT_SYSTEM_DEFAULT_PROPERTIES += \
    persist.circle.security.pin_scramble=true \
    persist.circle.security.auto_reboot_hours=18

# Community defense (opt-in)
PRODUCT_SYSTEM_DEFAULT_PROPERTIES += \
    persist.circle.community.enabled=false \
    persist.circle.community.threat_sharing=false

# ============================================================
# DISABLE GOOGLE BY DEFAULT
# ============================================================

# No Google Setup Wizard
PRODUCT_SYSTEM_DEFAULT_PROPERTIES += \
    ro.setupwizard.mode=DISABLED

# No Google Mobile Services version
PRODUCT_SYSTEM_DEFAULT_PROPERTIES += \
    ro.com.google.gmsversion=

# Block Google domains by default (user can enable)
PRODUCT_SYSTEM_DEFAULT_PROPERTIES += \
    persist.circle.firewall.block_google=false

# ============================================================
# DATA MINIMIZATION
# ============================================================

# Return zeros for advertising ID
PRODUCT_SYSTEM_DEFAULT_PROPERTIES += \
    persist.circle.privacy.fake_adid=true

# Randomize device identifiers
PRODUCT_SYSTEM_DEFAULT_PROPERTIES += \
    persist.circle.privacy.fake_imei=true \
    persist.circle.privacy.fake_serial=true

# MAC address randomization
PRODUCT_SYSTEM_DEFAULT_PROPERTIES += \
    persist.circle.network.mac_randomize=true

# ============================================================
# DNS PRIVACY
# ============================================================

PRODUCT_SYSTEM_DEFAULT_PROPERTIES += \
    persist.circle.dns.mode=doh \
    persist.circle.dns.provider=quad9

# ============================================================
# PERFORMANCE
# ============================================================

# Enable ccache for builds
PRODUCT_SYSTEM_DEFAULT_PROPERTIES += \
    persist.sys.dalvik.vm.lib.2=libart.so

# ============================================================
# THREAT INTELLIGENCE
# ============================================================

# Data Acuity API endpoint
PRODUCT_SYSTEM_DEFAULT_PROPERTIES += \
    ro.circle.threat.feed_url=https://api.dataacuity.co.za/v1/threat/feed \
    ro.circle.threat.submit_url=https://api.dataacuity.co.za/v1/threat/submit

# ============================================================
# BRANDING
# ============================================================

# Boot animation (to be created)
# PRODUCT_COPY_FILES += \
#     vendor/circle/bootanimation/bootanimation.zip:$(TARGET_COPY_OUT_PRODUCT)/media/bootanimation.zip
