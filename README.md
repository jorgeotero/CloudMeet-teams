# CloudMeet Teams 👥🏢

A free, open-source multi-tenant meeting and team scheduler that runs on Cloudflare's free tier. An open-source Calendly and Cal.com Teams alternative with Google Calendar and Outlook Calendar integration.

> Forked and enhanced from [dennisklappe/CloudMeet](https://github.com/dennisklappe/CloudMeet).

---

## 🌟 What's New in CloudMeet Teams

This fork expands CloudMeet from a single-user tool into a **multi-user, organization-wide team scheduling platform**:

* 🏢 **Multi-Tenant Organizations & Teams**:
  * Role-based access control (`Owner`, `Admin`, `Member`).
  * Organization-scoped team booking links (`/org/{orgSlug}/{userSlug}/{eventSlug}`) alongside personal links (`/u/{userSlug}/{eventSlug}`).
  * Team member invitation flow with automated onboarding via Google OAuth.
* 📅 **Master Team Calendar**:
  * Unified agenda view displaying bookings across all advisors and team members.
  * Real-time status filters (`confirmed`, `rescheduled`, `canceled`) and member-specific views.
* 🏛️ **Offline Meeting Rooms**:
  * Prevent double-booking physical conference rooms or meeting spaces in your office across different hosts.
* ⏱️ **Buffer Time Support**:
  * Configurable `before_buffer_minutes` and `after_buffer_minutes` per event type to prevent back-to-back meeting fatigue.
* 🪝 **Outbound Webhooks (HMAC-SHA256)**:
  * Real-time cryptographically signed webhooks dispatched on `booking.created`, `booking.canceled`, and `booking.rescheduled` to integrate with CRMs, Zapier, or backend APIs.
* 🖼️ **Iframe Embed Mode & postMessage**:
  * Clean `?embed=true` mode for embedding booking forms into external apps, client portals, or websites with full `window.postMessage` event communication.
* 📱 **Attendee Phone & Custom Metadata**:
  * Support for phone numbers and custom metadata JSON in bookings.
* 🤖 **Machine-to-Machine (M2M) API**:
  * REST API endpoints authenticated via `X-API-Key` or Bearer token for programmatically provisioning companies, inviting members, and managing schedules.
* ⚡ **100% Serverless Edge Architecture**:
  * Runs entirely on Cloudflare Pages, Cloudflare D1 (SQL), Cloudflare KV, and Cloudflare Workers Cron.

---

## Features

- Google Calendar and Outlook Calendar integration
- Use Google alone, Outlook alone, or both calendars together
- Automatic event creation with Google Meet or Microsoft Teams links
- Multiple event types with custom durations, buffers, and offline meeting rooms
- Configurable email notifications via Emailit (confirmation, cancellation, reminders)
- One-click deploy and automated CI/CD via GitHub Actions
- Runs entirely on Cloudflare's free tier (no monthly hosting fees)

---

## Quick Start

### 1. Create Cloudflare API Token

1. Go to [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Select **Edit Cloudflare Workers** template
4. Under **Account Resources**, select your account
5. Click **+ Add more** and add: **Account → D1 → Edit**
6. Click **Continue to summary** → **Create Token**
7. Copy the token.

### 2. Setup Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable **Google Calendar API** under APIs & Services
4. Create an **OAuth 2.0 Client ID** (Web application)
5. Add Authorized JavaScript origins: `https://your-domain.pages.dev`
6. Add Authorized redirect URI: `https://your-domain.pages.dev/auth/callback`
7. Save your **Client ID** and **Client Secret**.

### 3. Add Repository Secrets

In your GitHub repository, go to **Settings** > **Secrets and variables** > **Actions** and add:

| Secret | Required | Description |
|--------|----------|-------------|
| `CLOUDFLARE_API_TOKEN` | Yes | Your Cloudflare API token |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Your Cloudflare Account ID |
| `ADMIN_EMAIL` | Yes | Your admin Google email address |
| `APP_URL` | Yes | Your production URL (`https://your-domain.pages.dev` or custom domain) |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth Client Secret |
| `JWT_SECRET` | Yes | Random 64-char hex string (`openssl rand -hex 32`) |
| `CRON_SECRET` | Yes | Random 32-char hex string (`openssl rand -hex 16`) |
| `EMAIL_FROM` | No | Sender email address for notifications |
| `EMAILIT_API_KEY` | No | Optional Emailit API key for automated emails |

### 4. Deploy

Go to **Actions** > **Deploy to Cloudflare Pages** > Click **Run workflow**.

GitHub Actions will automatically provision your D1 database, KV store, apply SQL migrations, build the application, and deploy to Cloudflare Pages.

---

## License

MIT License. See [LICENSE](LICENSE) for details.
