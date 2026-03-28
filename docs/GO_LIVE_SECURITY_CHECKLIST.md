# Pustara Go-Live Security Checklist (5 Minutes)

Use this checklist right before production deploy.

## 1) Secrets and Environment
- [ ] No hardcoded secrets in tracked files (docker-compose, code, docs).
- [ ] Production env values are set in platform secrets (not committed .env files).
- [ ] DATABASE_URL is not set when using Azure SQL mode.
- [ ] NODE_ENV and NEON_CLOUD_MODE match intended database target.
- [ ] SMTP credentials are configured if email alerts are required.

## 2) Database Safety
- [ ] Latest backup exists and is restorable (at least one recent .sql.gz).
- [ ] PITR window is confirmed (Neon free: 6 hours).
- [ ] Books row-drop alert thresholds are configured.
- [ ] Destructive scripts are not executed without dry run first.
- [ ] Unique index guard for books dedupe is present.

## 3) Access and Auth
- [ ] Admin endpoints are protected by auth and admin middleware.
- [ ] Firebase credentials and service account are loaded from secure env.
- [ ] API keys are rotated if ever exposed in history or logs.

## 4) Deployment and Runtime
- [ ] Docker image uses env-driven config (no forced dummy mode).
- [ ] Health endpoint returns OK after deploy.
- [ ] Logs show correct DB mode and no auth/connection errors.
- [ ] Background jobs and reindex key validation behave as expected.

## 5) Monitoring and Alerts
- [ ] Deletion alert emails are enabled and tested.
- [ ] Backup failure alert emails are enabled and tested.
- [ ] Row-drop anomaly alert emails are enabled and tested.
- [ ] At least one on-call recipient is configured in ALERT_EMAIL_TO.

## Quick Validation Commands
Run in backend directory:

- npm run backup:db
- npm run dedupe:books
- npm run dedupe:books:near

## Sign-off
- [ ] Tech owner approved
- [ ] DBA/Backend approved
- [ ] Deploy owner approved
- [ ] Rollback plan ready
