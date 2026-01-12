# DataAcuity SSO Setup Guide

This guide walks you through setting up Single Sign-On (SSO) with multiple identity providers.

## Overview

DataAcuity uses Keycloak as the central identity provider, which federates authentication to:
- Google
- Microsoft (Azure AD)
- GitHub
- LinkedIn
- Email/Password (built-in)

## Quick Start

### 1. Start Keycloak

```bash
cd /home/geektrading/suite

# Create .env file with OAuth credentials (see sections below)
cp .env.example .env
nano .env  # Edit with your credentials

# Start Keycloak
docker compose -f keycloak/docker-compose.yml up -d

# Check logs
docker logs -f keycloak
```

### 2. Reload Nginx

```bash
sudo systemctl reload nginx
```

### 3. Access Keycloak Admin

- URL: https://auth.dataacuity.co.za/admin
- Username: `admin`
- Password: (from KEYCLOAK_ADMIN_PASSWORD in .env)

---

## OAuth Provider Setup

### Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Navigate to **APIs & Services > Credentials**
4. Click **Create Credentials > OAuth 2.0 Client IDs**
5. Configure consent screen if prompted
6. Application type: **Web application**
7. Authorized redirect URIs:
   ```
   https://auth.dataacuity.co.za/realms/dataacuity/broker/google/endpoint
   ```
8. Copy Client ID and Client Secret

Add to `.env`:
```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
```

---

### Microsoft (Azure AD) OAuth

1. Go to [Azure Portal](https://portal.azure.com/)
2. Navigate to **Azure Active Directory > App registrations**
3. Click **New registration**
4. Configure:
   - Name: `DataAcuity SSO`
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
   - Redirect URI: Web - `https://auth.dataacuity.co.za/realms/dataacuity/broker/microsoft/endpoint`
5. Copy **Application (client) ID**
6. Go to **Certificates & secrets > New client secret**
7. Copy the secret value

Add to `.env`:
```env
MICROSOFT_CLIENT_ID=your-application-id
MICROSOFT_CLIENT_SECRET=your-client-secret
```

---

### GitHub OAuth

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **OAuth Apps > New OAuth App**
3. Configure:
   - Application name: `DataAcuity`
   - Homepage URL: `https://dataacuity.co.za`
   - Authorization callback URL: `https://auth.dataacuity.co.za/realms/dataacuity/broker/github/endpoint`
4. Copy Client ID
5. Generate and copy Client Secret

Add to `.env`:
```env
GITHUB_CLIENT_ID=your-client-id
GITHUB_CLIENT_SECRET=your-client-secret
```

---

### LinkedIn OAuth

1. Go to [LinkedIn Developers](https://www.linkedin.com/developers/apps)
2. Click **Create app**
3. Configure:
   - App name: `DataAcuity`
   - LinkedIn Page: (select your company page)
   - App logo: (upload)
4. Go to **Auth** tab
5. Add redirect URL: `https://auth.dataacuity.co.za/realms/dataacuity/broker/linkedin-openid-connect/endpoint`
6. Request access to **Sign In with LinkedIn using OpenID Connect**
7. Copy Client ID and Client Secret

Add to `.env`:
```env
LINKEDIN_CLIENT_ID=your-client-id
LINKEDIN_CLIENT_SECRET=your-client-secret
```

---

## Email Configuration (for password reset, verification)

For email/password authentication to work properly, configure SMTP:

```env
SMTP_HOST=smtp.gmail.com
SMTP_FROM=noreply@dataacuity.co.za
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

**Gmail App Password:**
1. Enable 2FA on your Google account
2. Go to https://myaccount.google.com/apppasswords
3. Generate an app password for "Mail"

---

## Environment Variables Reference

Complete `.env` example:

```env
# Keycloak
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=your-secure-password
KEYCLOAK_DB_PASSWORD=your-db-password

# Google OAuth
GOOGLE_CLIENT_ID=123456789-abcdef.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxx

# Microsoft OAuth
MICROSOFT_CLIENT_ID=12345678-abcd-efgh-ijkl-1234567890ab
MICROSOFT_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# GitHub OAuth
GITHUB_CLIENT_ID=Iv1.xxxxxxxxxxxx
GITHUB_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# LinkedIn OAuth
LINKEDIN_CLIENT_ID=xxxxxxxxxxxxxx
LINKEDIN_CLIENT_SECRET=xxxxxxxxxxxxxxxx

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_FROM=noreply@dataacuity.co.za
SMTP_USER=notifications@dataacuity.co.za
SMTP_PASSWORD=xxxx-xxxx-xxxx-xxxx
```

---

## Verification

### Test Login Flow

1. Visit https://dataacuity.co.za
2. Click "Sign In" in the top right
3. Choose a provider (Google, Microsoft, GitHub, or LinkedIn)
4. Complete authentication
5. You should be redirected back and logged in

### Check Keycloak Users

1. Go to https://auth.dataacuity.co.za/admin
2. Select "dataacuity" realm
3. Navigate to **Users**
4. You should see users created from OAuth logins

---

## Troubleshooting

### "Invalid redirect_uri"
- Ensure the redirect URI in your OAuth provider matches exactly:
  `https://auth.dataacuity.co.za/realms/dataacuity/broker/{provider}/endpoint`

### "Client not found"
- Make sure Keycloak imported the realm correctly
- Check: `docker logs keycloak | grep -i import`

### Provider not showing on login page
- Verify the provider is enabled in Keycloak admin
- Check that client ID/secret are set in environment

### CORS errors
- Ensure web origins are configured in Keycloak client settings
- Check nginx proxy headers are correct

### SSL/Certificate errors
- Verify Let's Encrypt certificate includes auth.dataacuity.co.za
- Run: `sudo certbot --nginx -d auth.dataacuity.co.za`

---

## Security Best Practices

1. **Use strong passwords** for Keycloak admin
2. **Enable 2FA** in user accounts when possible
3. **Restrict admin access** - Consider IP whitelisting
4. **Regular updates** - Keep Keycloak updated
5. **Monitor logs** - Watch for failed login attempts
6. **Backup realm** - Export realm config regularly

---

## Additional Features

### Adding Apple Sign-In

1. Enroll in Apple Developer Program
2. Create App ID with "Sign in with Apple"
3. Create Services ID
4. Configure in Keycloak:
   - Provider: apple
   - Client ID: Your Services ID
   - Client Secret: Generate JWT from private key

### Enabling 2FA/MFA

1. Go to Keycloak Admin > Authentication
2. Configure OTP Policy (already set up for TOTP)
3. Users can enable in their account settings

### WebAuthn/Passkeys

1. Already configured for dataacuity.co.za domain
2. Users can register security keys in account settings

---

## Support

For issues:
1. Check Keycloak logs: `docker logs keycloak`
2. Check nginx logs: `sudo tail -f /var/log/nginx/error.log`
3. Browser console for JavaScript errors
