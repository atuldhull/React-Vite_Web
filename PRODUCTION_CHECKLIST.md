# Production Ops Checklist

## Pre-Deployment

### Environment Variables (Required)
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...           # Never expose to frontend
OPENROUTER_API_KEY=sk-or-v1-...            # AI question generation
SESSION_SECRET=<random-64-char-string>     # Generate: openssl rand -hex 32
CONTACT_EMAIL=<gmail>                      # For nodemailer
CONTACT_APP_PASSWORD=<gmail-app-password>  # Not your Gmail password
RAZORPAY_KEY_ID=rzp_live_...               # Switch from rzp_test_ for prod
RAZORPAY_KEY_SECRET=<secret>
RAZORPAY_WEBHOOK_SECRET=<webhook-secret>
NODE_ENV=production                        # Enables secure cookies, CORS
PORT=3000                                  # Or your hosting port
FRONTEND_URL=https://yourdomain.com        # For CORS whitelist
```

### Secrets Security
- [ ] All secrets in environment variables (never in code)
- [ ] `SESSION_SECRET` is unique, random, 64+ characters
- [ ] Razorpay keys switched from `rzp_test_` to `rzp_live_`
- [ ] `.env.local` is in `.gitignore` (verified)
- [ ] No secrets in git history (`git log --all -p | grep -i "sk-or\|eyJ" | head`)

### Database (Supabase)
- [ ] Run all 12 migrations in order (see `migrations/` folder)
- [ ] Verify tables exist: `students`, `challenges`, `events`, `event_registrations`, `event_attendance`, `achievements`, `notifications`, `friendships`
- [ ] Set yourself as admin: `UPDATE students SET role='admin' WHERE email='your@email.com'`
- [ ] Row Level Security: currently disabled (service role key bypasses) — review if exposing anon key
- [ ] Database backups: enable daily backups in Supabase dashboard (Settings → Database → Backups)

### Migrations Order
```
01_base_tables.sql
02_extended_columns.sql
03_events_site_settings.sql
04_notifications_certificates.sql
05_profile_avatar.sql
06_features_orgs_plans.sql
07_payment_subscriptions.sql
08_messaging_friendships.sql
09_referral_system.sql
10_events_upgrade.sql
11_notification_types.sql
12_qr_checkin.sql
```

## Security

### HTTP Security (Helmet)
- [x] `X-Content-Type-Options: nosniff`
- [x] `X-Frame-Options: SAMEORIGIN`
- [x] `Strict-Transport-Security` (HSTS)
- [x] `X-Powered-By` header removed

### Session Security
- [x] `httpOnly: true` on cookies
- [x] `secure: true` when `NODE_ENV=production`
- [x] `sameSite: "strict"` when `NODE_ENV=production`
- [ ] Use Redis/PostgreSQL session store (currently memory store — restarts lose sessions)

### CORS
- [x] Configured in `server.js`
- [x] Production: restricts to `FRONTEND_URL` only
- [x] Credentials: enabled for session cookies

### Rate Limiting
- [x] Global: 200 req/min per IP on `/api/`
- [x] Auth: 10 attempts/15 min (login/register)
- [x] Contact: 5 submissions/hour
- [ ] Socket.IO: no rate limiting on events (add if abuse detected)

### Socket.IO Security
- [x] Session middleware on socket engine
- [x] `userId` verified from session (not client-supplied)
- [x] Admin room restricted to admin/super_admin roles
- [ ] Add rate limiting on quiz creation events
- [ ] Add rate limiting on chat message events

### Feature Flags
- [x] `checkFeatureFlag()` middleware gates premium features
- [x] Org-level overrides take precedence over plan
- [x] Super admins bypass all flags
- [x] Returns `403 + upgrade_required` for locked features

## Deployment

### Build
```bash
npm run build          # Frontend → public/app/
npm start              # Backend serves frontend + API
```

### Health Check
```bash
curl https://yourdomain.com/api/events        # Should return 200 + JSON
curl https://yourdomain.com/api/achievements   # Should return 200 + JSON
```

### Monitoring
- [ ] Set up uptime monitoring (UptimeRobot, BetterStack — free tier)
- [ ] Monitor `/api/events` endpoint (5-min interval)
- [ ] Set up error alerting (Sentry free tier or console.error → log aggregation)
- [ ] Track response times (add `morgan` or custom timing middleware)

### Performance
- [ ] Enable Supabase connection pooling (Settings → Database → Connection pooling)
- [ ] Consider CDN for static assets (Cloudflare free tier)
- [ ] Enable gzip compression (`compression` npm package)
- [ ] Review bundle size: `app.js` should be <3MB, `app.css` <100KB

### Backups
- [ ] Supabase: enable daily database backups
- [ ] Git: code is on GitHub (verified)
- [ ] Environment: document all env vars in team password manager

## Post-Deployment

### Smoke Tests
- [ ] Homepage loads (scroll video works)
- [ ] Login/register works
- [ ] Arena loads random question
- [ ] Events page shows event list
- [ ] Admin panel accessible (admin role)
- [ ] Notifications appear in real-time
- [ ] Certificate generation works (requires xelatex on server)

### First-Week Monitoring
- [ ] Check error logs daily
- [ ] Monitor Supabase usage (free tier: 500MB DB, 2GB bandwidth)
- [ ] Monitor OpenRouter API usage (AI question generation)
- [ ] Check session store memory usage (switch to Redis if >1000 concurrent users)
