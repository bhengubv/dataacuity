#
# Circle OS Main Makefile
# Include this in device makefiles to enable Circle OS
#
# Usage in device makefile:
#   $(call inherit-product, vendor/circle/circle.mk)
#

# Include common configuration
$(call inherit-product, vendor/circle/config/common.mk)

# Include SELinux policies
-include vendor/circle/sepolicy/sepolicy.mk

# Include Circle OS services configuration
-include vendor/circle/config/services.mk

# Include Circle OS apps configuration
-include vendor/circle/config/apps.mk
