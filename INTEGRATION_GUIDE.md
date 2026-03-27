# 📚 Pustara Backend Integration Guide

## ✅ What's Been Implemented

### 1. **Admin Role System**
```
Database: Add 'role' column to users table
Values: 'user' | 'admin'
Control: Authentication via Firebase, Authorization via database role check
```

**Setup:**
```bash
cd backend
node scripts/add-admin-role.js  # Adds role column & indexes
```

**Make user admin:**
```sql
UPDATE users SET role = 'admin' WHERE email = 'your-email@example.com';
```

---

### 2. **Files Upload to Azure Blob**

**Endpoint:** `POST /books`  
Protected: ✅ Requires `verifyToken` + `authorizeAdmin`

**Request:**
```bash
curl -X POST http://localhost:3000/books \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "title=Laskar Pelangi" \
  -F "authors=Andrea Hirata" \
  -F "genres=Fiction,Indonesian" \
  -F "description=Novel tentang persahabatan..." \
  -F "year=2005" \
  -F "pages=529" \
  -F "language=id" \
  -F "bookFile=@/path/to/file.pdf"
```

**Fields:**
- `title` (required) - Book title string
- `authors` (required) - Comma-separated or array: `["Author 1", "Author 2"]`
- `genres` (required) - Comma-separated or array: `["Genre1", "Genre2"]`
- `description` (optional) - Book description
- `year` (optional) - Publication year (integer)
- `pages` (optional) - Total pages (integer)
- `language` (optional) - Language code, default: 'id'
- `bookFile` (file) - PDF file upload

**Response:**
```json
{
  "success": true,
  "message": "Book created successfully",
  "data": {
    "id": "uuid",
    "title": "Laskar Pelangi",
    "authors": ["Andrea Hirata"],
    "genres": ["Fiction", "Indonesian"],
    "file_url": "https://pustara.blob.core.windows.net/books/...",
    "file_size": 5242880,
    "is_active": true
  }
}
```

---

### 3. **Read Books (Public)**

**GET /books?page=1&limit=10&genre=Fiction**
```bash
curl http://localhost:3000/books
```

**GET /books/search?q=laskar**
```bash
curl "http://localhost:3000/books/search?q=laskar"
```

**GET /books/:id**
```bash
curl http://localhost:3000/books/550e8400-e29b-41d4-a716-446655440000
```

**GET /books/:id/file** (Download PDF)
```bash
curl http://localhost:3000/books/550e8400-e29b-41d4-a716-446655440000/file
```

---

### 4. **Update/Delete Book (Admin Only)**

**PUT /books/:id** - Update metadata
```bash
curl -X PUT http://localhost:3000/books/BOOK_ID \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Title",
    "description": "New description"
  }'
```

**DELETE /books/:id** - Soft delete
```bash
curl -X DELETE http://localhost:3000/books/BOOK_ID \
  -H "Authorization: Bearer TOKEN"
```

---

### 5. **Reading Session Tracking (Integrated)**

**POST /reading/start/:bookId** - Start reading
```bash
curl -X POST http://localhost:3000/reading/start/BOOK_ID \
  -H "Authorization: Bearer TOKEN"
```

Returns session ID for tracking

**PUT /reading/update/:sessionId** - Update reading progress
```bash
curl -X PUT http://localhost:3000/reading/update/SESSION_ID \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "current_page": 125,
    "reading_time_minutes": 30
  }'
```

Auto-calculates: `progress_percentage = (current_page / total_pages) * 100`

---

### 6. **Analytics Dashboard**

**GET /stats/active-users?hours=24**
```json
{
  "active_users": 15,
  "books_being_read": 20,
  "avg_progress": 42.5,
  "time_period_hours": 24
}
```

**GET /stats/reading-time?period=week**
```json
{
  "total_minutes_read": 4500,
  "avg_minutes_per_session": 75,
  "total_sessions": 60,
  "unique_readers": 20,
  "period": "week"
}
```

**GET /stats/top-books?limit=10**
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Laskar Pelangi",
      "reader_count": 42,
      "total_reading_minutes": 5400,
      "avg_progress": 78.5
    }
  ]
}
```

**GET /stats/dashboard** - All stats combined
```json
{
  "active_users_24h": 15,
  "books_being_read": 20,
  "reading_this_week": { ... },
  "top_books": [ ... ]
}
```

---

## 📋 Middleware Flow

```
CLIENT REQUEST
    ↓
POST /books → [fileUpload] → [verifyToken] → [authorizeAdmin] → booksController.createBook
    ↓
GET /stats → [analyticsRoutes] → analytics data
    ↓
POST /reading/start → [verifyToken] → readingSessionController.startReadingSession
```

---

## 🚀 How to Deploy

### 1. **Initialize Admin Role** (One-time)
```bash
cd backend
npm install
node scripts/add-admin-role.js
```

### 2. **Optional: Seed Admin User**
Open database and run:
```sql
UPDATE users SET role = 'admin' WHERE email = 'your-admin-email@example.com';
```

### 3. **Start Backend**
```bash
npm start
```

Server should output:
```
✅ Server running on port 3000
📊 Database: Neon PostgreSQL
🔐 Firebase Auth: Active
```

---

## 🧪 Quick Test Checklist

- [ ] GET /books (public - no auth needed)
- [ ] POST /books (admin - need token + admin role)
- [ ] GET /stats/active-users (public analytics)
- [ ] POST /reading/start/:bookId (need token)
- [ ] GET /reading/sessions (need token)
- [ ] PUT /reading/update/:sessionId (need token)

---

## ⚠️ Known Issues & TODOs

- [ ] Admin role must be set manually in database (no self-registration as admin)
- [ ] File size limit: 50MB (configurable in index.js)
- [ ] PDF only (can extend to other formats)
- [ ] Notifications not yet implemented
- [ ] Rate limiting not yet added

---

## 🔗 Database Schema

### users table (updated)
```sql
ALTER TABLE users ADD COLUMN role VARCHAR(20) DEFAULT 'user';
```

### books table (existing)
```
id, title, authors[], genres[], description, year, pages, language,
file_url, file_size, file_type, is_active, created_at, updated_at
```

### reading_sessions table (existing)
```
id, user_id, book_id, current_page, total_pages, progress_percentage,
started_at, last_read_at, finished_at, status, reading_time_minutes
```

---

## 📞 Support

For issues:
1. Check logs in terminal
2. Verify Firebase token validity
3. Confirm admin role in database
4. Check file size < 50MB
5. Verify Azure Blob credentials in .env

