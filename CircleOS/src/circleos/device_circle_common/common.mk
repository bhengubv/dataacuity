#
# Circle OS Common Device Configuration
# Include this in all Circle OS device makefiles
#

# Inherit Circle OS vendor configuration
$(call inherit-product, vendor/circle/circle.mk)

# ============================================================
# SECURITY TIER CONFIGURATION
# ============================================================
# Override in device-specific makefile:
#   CIRCLE_SECURITY_TIER := 1  (Pixel, Circle Native)
#   CIRCLE_SECURITY_TIER := 2  (Treble, unlocked bootloader)
#   CIRCLE_SECURITY_TIER := 3  (P30 Lite, exploit boot)

CIRCLE_SECURITY_TIER ?= 2

PRODUCT_SYSTEM_DEFAULT_PROPERTIES += \
    ro.circle.security.tier=$(CIRCLE_SECURITY_TIER)

# ============================================================
# KERNEL HARDENING (defaults)
# ============================================================

# These may be overridden by device-specific configs

PRODUCT_SYSTEM_DEFAULT_PROPERTIES += \
    ro.circle.kernel.hardened=true

# ============================================================
# INIT SCRIPTS
# ============================================================

PRODUCT_COPY_FILES += \
    device/circle/common/init/init.circle.rc:$(TARGET_COPY_OUT_VENDOR)/etc/init/init.circle.rc

# ============================================================
# PERMISSIONS
# ============================================================

PRODUCT_COPY_FILES += \
    device/circle/common/permissions/circle_permissions.xml:$(TARGET_COPY_OUT_VENDOR)/etc/permissions/circle_permissions.xml

# ============================================================
# THREAT INTEL DATABASE (seed)
# ============================================================

PRODUCT_COPY_FILES += \
    device/circle/common/threatintel/threat_intel_seed.db:$(TARGET_COPY_OUT_SYSTEM)/circle/threatintel/threat_intel.db
