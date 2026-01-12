# Contributing to Circle OS

> **"Slow is smooth. Smooth is fast. Fast leads to delivery."**

Thank you for your interest in contributing to Circle OS. This document outlines how to contribute effectively.

---

## Code of Conduct

- Be respectful and inclusive
- Focus on technical merit
- Assume good intent
- Help others learn

---

## How to Contribute

### Reporting Issues

1. Check existing issues first
2. Use issue templates when available
3. Include:
   - Device and OS version
   - Steps to reproduce
   - Expected vs actual behavior
   - Logs if applicable

### Submitting Code

1. Fork the repository
2. Create a feature branch from `circle-14.0`
3. Make your changes
4. Write tests (80% coverage minimum)
5. Submit a pull request

### Branch Naming

```
feature/short-description
fix/issue-number-description
docs/what-changed
```

### Commit Messages

```
type: Short description (50 chars max)

Longer explanation if needed. Wrap at 72 characters.
Explain what and why, not how.

Fixes #123
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

---

## Development Setup

See `docs/01_AOSP_FORK_GUIDE.md` for build environment setup.

```bash
# Clone and sync
repo init -u https://github.com/circleos/manifest.git -b circle-14.0
repo sync -c -j$(nproc)

# Build
source build/envsetup.sh
lunch sdk_phone_x86_64-userdebug
m -j$(nproc)
```

---

## Code Standards

### General

- Security and privacy are non-negotiable
- Accessibility is required, not optional
- Document limitations honestly
- No hardcoded secrets
- All user data encrypted at rest

### Kotlin (Circle OS)

- Use coroutines for async operations
- Use sealed classes for states
- Follow Android Kotlin style guide

### C# (Data Acuity)

- Use records for DTOs
- Use async/await everywhere
- Use dependency injection

---

## Review Process

1. All PRs require at least one review
2. CI must pass (build + tests)
3. Security-sensitive changes require security team review
4. Privacy-impacting changes require privacy team review

---

## Areas Needing Help

- Device porting (new devices)
- Accessibility testing
- Translation/localization
- Documentation improvements
- Security auditing

---

## Questions?

- Issues: GitHub Issues
- Engineering: engineering@circlefoundation.org

---

*Circle OS — "You're NOT the product. Trust!"*
