# Backend Developer Handoff Guide

Ini panduan untuk melanjutkan development backend setelah survey/personalization system setup.

---

## 🚀 Getting Started

### 1. Pull Latest Changes
```bash
cd pustara-be
git fetch origin
git checkout 513968
git pull origin 513968
```

### 2. Install Dependencies
```bash
npm install
cd backend
npm install
```

### 3. Start Docker Backend
```bash
docker-compose up --build
```

Harusnya lihat logs:
```
✅ Azure SQL Database connected
✅ Users table ready  
✅ UserSurvey table ready
```

---

## ✅ Current Status

### ✔️ COMPLETED
- ✅ **Azure SQL Database** - Connected & working
- ✅ **Database Schema** - Users & UserSurvey tables auto-created
- ✅ **User Service** - CRUD operations for Users
- ✅ **Survey Service** - CRUD operations for UserSurvey
- ✅ **Authentication** - Firebase token verification
- ✅ **Auto-Sync** - User auto-created di SQL saat login
- ✅ **Survey Routes** - save, get, update endpoints
- ✅ **CORS Support** - Frontend dapat komunikasi dengan backend
- ✅ **Enhanced Logging** - Better debugging visibility

---

## 📊 Database Schema

### Users Table
```sql
CREATE TABLE Users (
  id INT PRIMARY KEY IDENTITY(1,1),
  uid NVARCHAR(255) UNIQUE NOT NULL,
  email NVARCHAR(255) UNIQUE NOT NULL,
  displayName NVARCHAR(255),
  photoURL NVARCHAR(MAX),
  createdAt DATETIME DEFAULT GETDATE(),
  updatedAt DATETIME DEFAULT GETDATE()
);
```

### UserSurvey Table
```sql
CREATE TABLE UserSurvey (
  id INT PRIMARY KEY IDENTITY(1,1),
  userId INT NOT NULL,
  favoriteGenre NVARCHAR(100),
  age NVARCHAR(50),
  gender NVARCHAR(50),
  createdAt DATETIME DEFAULT GETDATE(),
  updatedAt DATETIME DEFAULT GETDATE(),
  FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
);
```

---

## 🛠️ What's Next for BE Developer

### Phase 1: Data Validation & Cleanup (URGENT)

#### Task 1.1: Verify Current Data
```sql
-- Check Users table
SELECT COUNT(*) as user_count FROM Users;
SELECT * FROM Users;

-- Check UserSurvey table
SELECT COUNT(*) as survey_count FROM UserSurvey;
SELECT u.email, us.* FROM UserSurvey us
JOIN Users u ON us.userId = u.id;
```

**What to look for:**
- [ ] All users memiliki valid `uid` & `email`
- [ ] Tidak ada duplicate users (uid unique constraint)
- [ ] All surveys linked ke valid user (FK constraint)
- [ ] Timestamps correct (createdAt, updatedAt)

#### Task 1.2: Input Validation
**Add validation di services:**

```javascript
// In userSurveyService.js saveSurvey method
if (!favoriteGenre && !age && !gender) {
  return {
    success: false,
    error: "At least one field must be provided"
  };
}

// Validate genre format
const validGenres = ['Fiksi', 'Fiksi Ilmiah', 'Misteri', 'Self-Help', ...];
const genres = surveyData.favoriteGenre?.split(',') || [];
const invalidGenres = genres.filter(g => !validGenres.includes(g));
if (invalidGenres.length > 0) {
  return {
    success: false,
    error: `Invalid genres: ${invalidGenres.join(', ')}`
  };
}
```

#### Task 1.3: Error Handling Improvements
- [ ] Add try-catch di database.js getPool()
- [ ] Handle connection timeout gracefully
- [ ] Add retry logic untuk transient failures
- [ ] Better error messages (not just database error)

---

### Phase 2: Core Features (NEXT)

#### Task 2.1: Book Management System
**Files to create:**

```
backend/
├── config/
│   └── books.js              ← Sample books data (or seed script)
├── services/
│   └── bookService.js        ← Book CRUD operations
└── routes/
    └── books.js              ← GET /books endpoints
```

**Book table schema:**
```sql
CREATE TABLE Books (
  id INT PRIMARY KEY IDENTITY(1,1),
  title NVARCHAR(255) NOT NULL,
  author NVARCHAR(255),
  genre NVARCHAR(100),
  description NVARCHAR(MAX),
  coverURL NVARCHAR(MAX),
  ageRating INT,  -- 5, 10, 12, 15, 18
  rating FLOAT,
  pageCount INT,
  publishedYear INT,
  createdAt DATETIME DEFAULT GETDATE(),
  updatedAt DATETIME DEFAULT GETDATE()
);

CREATE INDEX idx_genre ON Books(genre);
CREATE INDEX idx_ageRating ON Books(ageRating);
```

**Endpoints:**
```
GET    /books                    (all books, paginated)
GET    /books/?genre=Fiksi       (filter by genre)
GET    /books/?ageRating=12      (filter by age)
GET    /books/:id                (single book details)
POST   /books                    (admin only, create book)
PUT    /books/:id                (admin only, update book)
DELETE /books/:id                (admin only, delete book)
```

#### Task 2.2: Recommendations Algorithm
**File:** `backend/services/recommendationService.js`

```javascript
class RecommendationService {
  static async getRecommendations(uid, limit = 10) {
    // 1. Get user's survey preferences
    const userSurvey = await UserSurveyService.getSurveyByUid(uid);
    if (!userSurvey.success) {
      return { success: false, error: "User preferences not found" };
    }
    
    // 2. Get books matching genres
    const genreBooks = await this.getBooksByGenres(
      userSurvey.data.favoriteGenre.split(',')
    );
    
    // 3. Filter by age rating
    const ageBooks = await this.getBooksByAgeRating(
      userSurvey.data.age
    );
    
    // 4. Combine & sort by rating
    const recommended = this.rankBooks(genreBooks, ageBooks);
    
    return {
      success: true,
      data: recommended.slice(0, limit)
    };
  }

  static async getBooksByGenres(genres) {
    // Query books dengan genre matching
  }

  static async getBooksByAgeRating(ageRange) {
    // Map age range ke ageRating
    // < 20 Tahun → 5, 10, 12
    // 21 - 30 Tahun → 12, 15, 18
    // etc
  }

  static rankBooks(genreBooks, ageBooks) {
    // Combine & rank by relevance
  }
}
```

**Endpoint:**
```
GET    /recommendations        (protected, for current user)
GET    /recommendations?limit=20
```

#### Task 2.3: User Activity Tracking (Optional)
```sql
CREATE TABLE UserActivity (
  id INT PRIMARY KEY IDENTITY(1,1),
  userId INT NOT NULL,
  action NVARCHAR(50),  -- 'view', 'read', 'favorite', 'rate'
  bookId INT,
  rating INT,  -- 1-5
  createdAt DATETIME DEFAULT GETDATE(),
  FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE,
  FOREIGN KEY (bookId) REFERENCES Books(id)
);
```

### Phase 3: Admin Features (LATER)

#### Task 3.1: Admin Panel Backend
**Routes:**
```
POST   /admin/books             (create book)
PUT    /admin/books/:id         (update book)
DELETE /admin/books/:id         (delete book)
GET    /admin/analytics/users   (user stats)
GET    /admin/analytics/surveys (survey stats)
```

#### Task 3.2: Bulk Data Import
```javascript
// Create endpoint untuk bulk import books
POST   /admin/books/import      (CSV file upload)
```

---

## 🔗 Frontend Integration Points

Frontend akan panggil ini endpoints:

```javascript
// Get user + survey data
GET /survey/profile
Response: {
  user: { id, email, displayName, photoURL, createdAt },
  survey: { id, age, gender, favoriteGenre }
}

// Get recommended books (BARU - need to implement)
GET /recommendations
Response: {
  data: [
    {
      id: 1,
      title: "Laskar Pelangi",
      author: "Andrea Hirata",
      genre: "Fiksi",
      ageRating: 12,
      coverURL: "https://...",
      rating: 4.5
    },
    ...
  ]
}

// Get specific book details (BARU - need to implement)
GET /books/:id
Response: {
  data: { id, title, author, genre, description, ... }
}
```

---

## 📁 Backend Architecture

```
backend/
├── config/
│   ├── database.js             ✅ Azure SQL connection
│   ├── firebase.js             ✅ Firebase Admin SDK
│   ├── books.js                ⏳ TODO: Sample books data
│   └── constants/
│       └── config.js           ✅ Constants
├── providers/
│   └── firebaseProvider.js     ✅ Firebase API wrapper
├── services/
│   ├── userService.js          ✅ User CRUD
│   ├── userSurveyService.js    ✅ Survey CRUD
│   ├── authService.js          ✅ Token verification
│   ├── bookService.js          ⏳ TODO: Book CRUD
│   ├── recommendationService.js ⏳ TODO: Recommendations
│   └── analyticsService.js     ⏳ TODO: User stats
├── routes/
│   ├── auth.js                 ✅ Auth endpoints
│   ├── survey.js               ✅ Survey endpoints
│   ├── books.js                ⏳ TODO: Book endpoints
│   ├── recommendations.js      ⏳ TODO: Recommendations
│   └── admin.js                ⏳ TODO: Admin endpoints
├── middleware/
│   ├── auth.js                 ✅ Token verification
│   └── admin.js                ⏳ TODO: Admin check
├── index.js                    ✅ Express setup
└── package.json                ✅ Dependencies
```

---

## 🚨 Common Issues & Solutions

### Issue: "Connection timeout" error
**Cause:** Azure SQL firewall blocking atau slow connection
**Solution:**
1. Check Azure portal firewall rules
2. Add your IP: `Settings → Networking → Firewall rules`
3. Or allow all Azure services: `Allow Azure services and resources`

### Issue: "Duplicate key value" error
**Cause:** Trying to insert same uid twice
**Solution:**
1. Check getUserByUid() sebelum createUser()
2. Update endpoint if user sudah exist
3. Verify unique constraint di table schema

### Issue: Token verification fails
**Cause:** Firebase Token expired atau invalid
**Solution:**
1. Check Firebase key path (firebase-adminsdk-*.json)
2. Verify token format: "Bearer <token>"
3. Check token expiration (expires_in: 3600 seconds)

---

## 💾 Database Maintenance

### Backup Strategy
```bash
# Manual backup via Azure Portal
# Settings → Backup & Restore → Create backup

# Or use Azure CLI
az sql db bacpup create \
  --resource-group pustara \
  --server pustara-server \
  --name pustara_db \
  --backup-name "backup-$(date +%Y%m%d)"
```

### Monitoring Queries
```sql
-- Check database size
SELECT
  DB_NAME() as database_name,
  SUM(CAST(FILEPROPERTY(name, 'SpaceUsed') AS BIGINT)) / 1024.0 / 1024.0 AS used_mb

-- Check slow queries
SELECT TOP 10
  qt.text,
  qs.execution_count,
  qs.total_elapsed_time / 1000000 AS elapsed_time_sec
FROM sys.dm_exec_query_stats qs
CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) qt
ORDER BY qs.total_elapsed_time DESC
```

---

## 📝 Development Checklist

- [ ] Pull branch 513968
- [ ] Verify Azure SQL connected & tables exist
- [ ] Test all survey endpoints with Postman
- [ ] Validate input data
- [ ] Improve error handling
- [ ] Create Books table & data
- [ ] Build bookService & book routes
- [ ] Implement recommendations algorithm
- [ ] Add admin endpoints
- [ ] Performance testing (load tests)
- [ ] Security audit (SQL injection, auth)
- [ ] Write API documentation
- [ ] Create pull request ke development branch

---

## 🔐 Security Checklist

- [ ] Never expose Firebase private key
- [ ] Validate all user inputs
- [ ] Use parameterized queries (mssql already does this)
- [ ] Add rate limiting untuk API endpoints
- [ ] Implement admin role checking
- [ ] Sanitize error messages (don't expose DB structure)
- [ ] Use HTTPS in production (Azure App Service enables this)
- [ ] Hash passwords (Firebase already handles)

---

## 📚 Useful Queries

```sql
-- Find users without survey
SELECT u.* FROM Users u
LEFT JOIN UserSurvey us ON u.id = us.userId
WHERE us.id IS NULL;

-- Find duplicate users
SELECT uid, COUNT(*) as count
FROM Users
GROUP BY uid
HAVING COUNT(*) > 1;

-- Get survey completion rate
SELECT
  COUNT(DISTINCT u.id) as total_users,
  COUNT(DISTINCT us.userId) as users_with_survey,
  CAST(COUNT(DISTINCT us.userId) AS FLOAT) / COUNT(DISTINCT u.id) * 100 as completion_rate
FROM Users u
LEFT JOIN UserSurvey us ON u.id = us.userId;
```

---

## 🤝 Communication with Frontend Dev

**What frontend dev will ask:**

1. **Book Endpoints:**
   - "Can you add GET /books endpoint?"
   - "Can you filter books by genre?"

2. **Recommendations:**
   - "Can you add personalized recommendations?"
   - "How to sort by rating/popularity?"

3. **Performance:**
   - "Queries too slow, can you optimize?"
   - "Can we add pagination?"

**Answer quickly & clearly!**

---

## 📞 Questions?

- Check ARCHITECTURE.md untuk flow details
- Check Azure SQL documentation: https://learn.microsoft.com/en-us/sql/
- Check mssql npm package: https://github.com/tediousjs/node-mssql

Good luck! 🚀
