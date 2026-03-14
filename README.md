# PUSTARA - Backend Repository
## Perpustakaan Nusantara
 
Pustara merupakan aplikasi perpustakaan digital generasi baru yang menggabungkan AI recommendation system, fitur review sosial, dan tracking progres membaca untuk menciptakan ekosistem literasi digital yang interaktif dan modern.

**Repository ini khusus untuk Backend.** Frontend disimpan di repository terpisah.

---

## Tech Stack
- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: Firebase Realtime Database
- **Authentication**: Firebase Authentication

---

## Setup & Installation

### Prerequisites
- Node.js v18 atau lebih tinggi
- npm atau yarn
- Firebase project credentials

### Development
```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Docker
```bash
# Build dan run dengan Docker Compose
docker-compose up -d

# Stop services
docker-compose down
```

---

## Project Structure
```
backend/
├── index.js              # Entry point
├── package.json          # Dependencies
├── config/               # Konfigurasi aplikasi
│   └── firebase.js
├── constants/            # Konstanta aplikasi
│   └── config.js
├── middleware/           # Express middleware
│   └── auth.js
├── providers/            # External service providers
│   └── firebaseProvider.js
├── routes/               # API routes
│   └── auth.js
└── services/            # Business logic
    └── authService.js
```
 
 
## Tim Kwetiaw
 
**Ketua Kelompok**   : Ameliana Hardianti Utari - 23/513968/TK/56455

**Anggota 1**   : Syifa Alifiya - 23/517440/TK/56918

**Anggota 2**   : Kayana Anindya Azaria - 23/521475/TK/57528

 
---
 
## Konteks Akademis
 
Senior Project – Teknologi Informasi  
Departemen Teknologi Elektro dan Teknologi Informasi, Fakultas Teknik, Universitas Gadjah Mada
