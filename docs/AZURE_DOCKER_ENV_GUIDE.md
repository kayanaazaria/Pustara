# Azure Docker Environment Guide (Pustara Backend)

## Tujuan
Panduan ini menjelaskan lokasi file environment dan cara menjalankan backend dengan Docker di Azure tanpa menyimpan secret di Git.

## Prinsip Utama
1. Jangan commit file env berisi secret.
2. Simpan secret di Azure platform settings (recommended) atau di host server path di luar repo.
3. Container mode dipilih dari environment variable runtime, bukan hardcoded value.

## Opsi A (Recommended): Tanpa File .env di Server
Gunakan Azure App Service / Azure Container Apps environment settings.

### Wajib diisi untuk Azure SQL mode
- NODE_ENV=production
- NEON_CLOUD_MODE=false
- DB_SERVER
- DB_NAME
- DB_USER
- DB_PASSWORD
- PORT=3000
- FIREBASE_PROJECT_ID
- FIREBASE_API_KEY
- FASTAPI_URL
- CRON_SECRET
- RI_SECRET

### Catatan penting
- Jangan isi DATABASE_URL Neon saat mode Azure SQL.
- Jika DATABASE_URL terisi dan mode Neon aktif, backend akan memilih Neon path.

## Opsi B: Pakai File Env di VM (Self-hosted Docker)
Gunakan file template:
- backend/.env.azure.example

Copy ke lokasi aman di server (di luar repo), contoh:
- /opt/pustara/backend/.env.azure

Jalankan compose:

```bash
cd /opt/pustara
cp /path/to/repo/docker-compose.yml .
docker compose --env-file /opt/pustara/backend/.env.azure up -d --build
```

## Mapping Compose yang dipakai
Compose membaca variabel ini dari host env / --env-file:
- NODE_ENV
- NEON_CLOUD_MODE
- FIREBASE_PROJECT_ID
- FIREBASE_API_KEY
- PORT

## Verifikasi cepat setelah deploy
```bash
docker compose ps
docker compose logs -f pustara-backend
```

Pastikan log startup menunjukkan mode database sesuai target:
- Azure SQL saat NODE_ENV bukan neon dan NEON_CLOUD_MODE=false
- Neon saat NODE_ENV=neon atau NEON_CLOUD_MODE=true

## Security Checklist
1. Tidak ada API key hardcoded di docker-compose.yml.
2. Tidak ada file secret yang di-commit.
3. Secret di-rotate jika pernah terlanjur muncul di history.
4. Firewall Azure SQL mengizinkan sumber koneksi yang valid.

Checklist cepat sebelum deploy ada di:
- docs/GO_LIVE_SECURITY_CHECKLIST.md

## Backup Otomatis (Recommended)

### A. Workflow terjadwal (GitHub Actions)
Repository ini menyediakan workflow backup setiap 6 jam.

Secrets yang harus diisi di repository settings:
- DATABASE_URL

Hasil backup disimpan sebagai GitHub Artifact (compressed `.sql.gz`).

### B. Manual backup command (opsional)
Di backend:

```bash
npm run backup:db
```

Env terkait:
- BACKUP_DIR (default: `<backend>/backups`)
- BACKUP_RETENTION_DAYS (default: 7)
- ALERT_BOOKS_DROP_THRESHOLD_PERCENT (default: 70)
- ALERT_BOOKS_MIN_PREVIOUS_ROWS (default: 30)

Backup script juga menyimpan snapshot metrik lokal (`backup-metrics.json`).
Jika total row `books` turun lebih dari threshold (contoh: 100 -> 10 = 90%),
script akan kirim email alert otomatis.

## Email Alert Saat Penghapusan

Backend bisa kirim email saat:
1. Soft-delete buku via endpoint admin.
2. Dedupe script `--apply` menghapus rows.
3. Backup script gagal.

Aktifkan dengan env:
- ALERT_EMAIL_ENABLED=true
- ALERT_EMAIL_FROM
- ALERT_EMAIL_TO (pisahkan dengan koma)
- SMTP_HOST
- SMTP_PORT
- SMTP_SECURE
- SMTP_USER
- SMTP_PASS

Catatan:
- Alert bersifat non-blocking; operasi utama tetap lanjut jika email gagal.
