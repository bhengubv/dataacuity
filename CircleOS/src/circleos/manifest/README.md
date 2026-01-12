# Circle OS Manifest

This repository contains the repo manifest for Circle OS.

## Quick Start

```bash
# Create build directory
mkdir ~/circle-os && cd ~/circle-os

# Initialize with Circle OS manifest
repo init -u https://github.com/circleos/manifest.git -b circle-14.0 --depth=1

# Sync all repositories
repo sync -c -j$(nproc) --force-sync --no-clone-bundle --no-tags

# Set up build environment
source build/envsetup.sh

# Build for emulator
lunch sdk_phone_x86_64-userdebug
m -j$(nproc)

# Run emulator
emulator
```

## Alternative: Use with AOSP

If you prefer to use vanilla AOSP and add Circle OS on top:

```bash
# Initialize with AOSP
repo init -u https://android.googlesource.com/platform/manifest -b android-14.0.0_r50 --depth=1

# Add Circle OS local manifest
mkdir -p .repo/local_manifests
curl -o .repo/local_manifests/circle.xml \
    https://raw.githubusercontent.com/circleos/manifest/circle-14.0/local/circle.xml

# Sync
repo sync -c -j$(nproc) --force-sync --no-clone-bundle --no-tags
```

## Branch Strategy

| Branch | Android Version | Status |
|--------|-----------------|--------|
| circle-14.0 | Android 14 | Active |

## Support

- Issues: https://github.com/circleos/manifest/issues
- Docs: https://circleos.org/docs

---

*Circle OS — "You're NOT the product. Trust!"*
