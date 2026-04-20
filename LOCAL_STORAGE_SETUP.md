# 📚 Local Storage Setup untuk Development

> Development menggunakan **local filesystem storage** untuk PDF books. Production akan swap ke **Azure Blob Storage**.

## ✅ Setup Sudah Complete

### 1. **Provider Created** ✅
- `backend/providers/localStorageProvider.js`
- Mirrors Azure Blob interface (easy swap)
- Automatically creates `/backend/uploads/` directory

### 2. **Books Controller Updated** ✅
- `backend/controllers/booksController.js`
- Swapped to local storage (Azure commented out)
- Same upload/download logic

### 3. **Express Server Updated** ✅
- `backend/index.js`
- Serves `/uploads/` as static files
- Books accessible at `http://localhost:3000/uploads/filename.pdf`

### 4. **Sample Data Ready** ✅
- `backend/scripts/seed-books.js`
- 10 Indonesian books with metadata
- Ready to seed database

---

## 🚀 Getting Started

### Step 1: Seed Books ke Database

```bash
cd backend
node scripts/seed-books.js
```

**Expected output:**
```
🌱 Starting book seeding...

✅ Laskar Pelangi by Andrea Hirata
✅ Bumi Manusia by Pramoedya Ananta Toer
✅ Cantik Itu Luka by Eka Kurniawan
...
✨ Seeded 10/10 books successfully!
```

### Step 2: Start Backend

```bash
npm start
# atau
docker-compose up
```

### Step 3: Upload a PDF (Optional)

```bash
curl -X POST http://localhost:3000/admin/books \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "title=My Book" \
  -F "authors=Author Name" \
  -F "genres=Fiction" \
  -F "bookFile=@/path/to/book.pdf"
```

### Step 4: Try Endpoints

```bash
# Get trending books
curl http://localhost:3000/books/trending?limit=6

# Search books
curl "http://localhost:3000/books/search?q=laskar"

# Get all books
curl http://localhost:3000/books

# Download book
curl http://localhost:3000/books/{book_id}/file
```

---

## 📂 Storage Structure

```
pustara-be/
├── backend/
│   ├── uploads/           # 📁 Local PDFs stored here
│   │   ├── uuid-timestamp.pdf
│   │   └── uuid-timestamp.pdf
│   ├── controllers/
│   ├── providers/
│   │   ├── localStorageProvider.js   # 🆕 Development
│   │   └── azureBlobProvider.js      # 📝 Commented out (production)
│   └── index.js           # Updated with /uploads static serve
```

**Files in database:**
- `file_url`: `http://localhost:3000/uploads/uuid-timestamp.pdf`
- `file_type`: `application/pdf`
- `file_size`: bytes

---

## 🔄 Production Swap (Azure Blob)

When ready for production:

### 1. **Uncomment Azure in booksController.js**
```javascript
// Uncomment these lines:
const azureBlob = require('../providers/azureBlobProvider');

// Comment out these lines:
// const storage = require('../providers/localStorageProvider');
```

### 2. **Update upload calls**
```javascript
// Change:
fileUrl = await storage.uploadFile(fileName, file.data, fileType);

// To:
fileUrl = await azureBlob.uploadFile(fileName, file.data, fileType);
```

### 3. **Update download calls**
```javascript
// Change:
const stream = await storage.downloadFile(fileName);

// To:
const stream = await azureBlob.downloadFile(fileName);
```

### 4. **Add .env variables**
```env
AZURE_STORAGE_CONNECTION_STRING=your_connection_string
AZURE_STORAGE_CONTAINER_NAME=books
```

---

## 🎯 Book Metadata via OpenLibrary

Seeded books use **OpenLibrary cover IDs**:
- `cover_id`: Integer ID untuk fetch di OpenLibrary
- URL: `https://covers.openlibrary.org/b/id/{cover_id}-M.jpg`

Frontend `useTrendingBooks` hook menggunakan ini untuk fetch covers.

---

## 📝 Database Schema

```sql
CREATE TABLE books (
  id UUID PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  authors JSONB,              -- ["Author 1", "Author 2"]
  genres JSONB,               -- ["Fiction", "Indonesia"]
  description VARCHAR(2000),
  year INT,
  pages INT,
  cover_id INT,               -- OpenLibrary ID
  avg_rating NUMERIC(3,2),
  rating_count INT,
  file_url TEXT,              -- Local: http://localhost:3000/uploads/xxx.pdf
  file_type VARCHAR(50),      -- application/pdf
  file_size INT,
  is_active BOOLEAN,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

---

## ⚠️ Important Notes

- **Git**: `/backend/uploads/` tidak di-commit (.gitignore)
- **Size Limit**: Max 50MB per file (express-fileupload limit)
- **Development Only**: `/uploads` endpoint tidak ada auth untuk convenience
- **Trending Score**: `(rating * 0.7) + (active_readers * 0.1)`

---

## 🆘 Troubleshooting

**Error: "File not found"**
- Ensure backend running dan `/uploads` endpoint accessible
- Check: `curl http://localhost:3000/uploads/` should return 404 (folder exists)

**Error: "Storage upload error"**
- Check folder permissions: `chmod 755 backend/uploads/`
- Ensure `/backend/uploads/` directory exists

**Database kosong**
- Run: `node scripts/seed-books.js`

---

## 📊 Data Flow

```
User Upload PDF
    ↓
booksController.createBook()
    ↓
storage.uploadFile() → saves to /backend/uploads/
    ↓
Database insert → file_url = http://localhost:3000/uploads/uuid.pdf
    ↓
Frontend useTrendingBooks() fetch
    ↓
GET /books/trending → returns trending_score ordered books
    ↓
User clicks download
    ↓
GET /books/{id}/file → streams from /uploads/ to browser
```

---

**Next Steps:**
- ✅ Database seeded
- ✅ Local storage ready
- 🔄 Upload & test some PDFs
- 📊 Check trending endpoint
- 🎨 Frontend integration complete
