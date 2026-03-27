#!/bin/bash
# ============================================================================
# 📖 Reading Session API - Testing Guide
# ============================================================================
# Base URL: http://localhost:3000
# All endpoints require Firebase Authorization header
# ============================================================================

# 🔵 Replace these with actual values:
TOKEN="your-firebase-token-here"
BOOK_ID="your-book-uuid-here"
USER_ID="your-user-uid-here"
SESSION_ID="your-session-uuid-here"

# ============================================================================
# 1️⃣  START A NEW READING SESSION
# ============================================================================
# POST /reading/start/:bookId
# Memulai sesi membaca baru untuk buku tertentu
# Returns: session object dengan session_id

curl -X POST http://localhost:3000/reading/start/$BOOK_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "total_pages": 350
  }'

# Response:
# {
#   "message": "Reading session started",
#   "session": {
#     "id": "550e8400-e29b-41d4-a716-446655440000",
#     "book_id": "...",
#     "status": "reading",
#     "current_page": 0,
#     "total_pages": 350,
#     "progress_percentage": 0,
#     "started_at": "2026-03-27T10:30:00Z",
#     "reading_time_minutes": 0
#   }
# }

# ============================================================================
# 2️⃣  GET ALL READING SESSIONS (User's Active Sessions)
# ============================================================================
# GET /reading/sessions?status=reading&limit=10&offset=0
# Ambil semua sesi membaca user dengan status tertentu

curl -X GET "http://localhost:3000/reading/sessions?status=reading&limit=10" \
  -H "Authorization: Bearer $TOKEN"

# Query Parameters:
# - status: 'reading' | 'paused' | 'finished' (optional, default: 'reading')
# - limit: number (default: 10)
# - offset: number (default: 0)

# Response:
# {
#   "sessions": [
#     {
#       "id": "...",
#       "book_id": "...",
#       "title": "Laskar Pelangi",
#       "authors": ["Andrea Hirata"],
#       "current_page": 45,
#       "total_pages": 350,
#       "progress_percentage": 12.86,
#       "status": "reading",
#       "started_at": "2026-03-27T10:30:00Z",
#       "last_read_at": "2026-03-27T11:45:00Z",
#       "reading_time_minutes": 75
#     }
#   ],
#   "total": 1
# }

# ============================================================================
# 3️⃣  GET SPECIFIC SESSION DETAILS
# ============================================================================
# GET /reading/:sessionId
# Ambil detail lengkap satu sesi tertentu

curl -X GET http://localhost:3000/reading/$SESSION_ID \
  -H "Authorization: Bearer $TOKEN"

# Response includes book description, detailed progress info, etc.

# ============================================================================
# 4️⃣  UPDATE READING PROGRESS
# ============================================================================
# PUT /reading/update/:sessionId
# Update progress: halaman saat ini, waktu membaca, atau status

# Contoh 1: Update halaman saja
curl -X PUT http://localhost:3000/reading/update/$SESSION_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "current_page": 125
  }'

# Contoh 2: Update halaman + waktu membaca
curl -X PUT http://localhost:3000/reading/update/$SESSION_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "current_page": 125,
    "reading_time_minutes": 90
  }'

# Contoh 3: Pause sesi (tanpa update halaman, cuma ubah status)
curl -X PUT http://localhost:3000/reading/update/$SESSION_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "paused"
  }'

# Request Body:
# {
#   "current_page": number (optional),
#   "reading_time_minutes": number (optional),
#   "status": "reading" | "paused" (optional, default: "reading")
# }

# Response:
# {
#   "message": "Reading progress updated",
#   "session": {
#     "id": "...",
#     "book_id": "...",
#     "current_page": 125,
#     "total_pages": 350,
#     "progress_percentage": 35.71,
#     "status": "reading",
#     "last_read_at": "2026-03-27T12:00:00Z",
#     "reading_time_minutes": 90
#   }
# }

# ============================================================================
# 5️⃣  FINISH READING SESSION
# ============================================================================
# POST /reading/finish/:sessionId
# Tandai sesi membaca sebagai selesai (100% progress)

curl -X POST http://localhost:3000/reading/finish/$SESSION_ID \
  -H "Authorization: Bearer $TOKEN"

# Response:
# {
#   "message": "Reading session finished",
#   "session": {
#     "id": "...",
#     "book_id": "...",
#     "current_page": 350,
#     "total_pages": 350,
#     "progress_percentage": 100,
#     "status": "finished",
#     "started_at": "2026-03-27T10:30:00Z",
#     "finished_at": "2026-03-27T16:45:00Z",
#     "reading_time_minutes": 315
#   }
# }

# ============================================================================
# 📊 TESTING WORKFLOW
# ============================================================================
# 1. Get a book ID from /books endpoint:
#    curl http://localhost:3000/books -H "Authorization: Bearer $TOKEN"
#
# 2. Start reading session:
#    curl -X POST http://localhost:3000/reading/start/[BOOK_ID]
#
# 3. Update progress multiple times (simulate reading):
#    curl -X PUT http://localhost:3000/reading/update/[SESSION_ID] -d '{"current_page":50}'
#    curl -X PUT http://localhost:3000/reading/update/[SESSION_ID] -d '{"current_page":100}'
#
# 4. Check sessions:
#    curl http://localhost:3000/reading/sessions
#
# 5. Finish reading:
#    curl -X POST http://localhost:3000/reading/finish/[SESSION_ID]
#
# 6. Verify finished status:
#    curl http://localhost:3000/reading/sessions?status=finished

# ============================================================================
# 🔐 ERROR CODES
# ============================================================================
# 400 - Bad Request (invalid parameters, active session exists, etc.)
# 404 - Not Found (book, session, or user not found)
# 500 - Internal Server Error

# ============================================================================
# 📝 DATABASE SCHEMA (reading_sessions table)
# ============================================================================
# Columns:
# - id (UUID): Primary key
# - user_id (UUID): FK to users
# - book_id (UUID): FK to books
# - current_page (INTEGER): Current page being read
# - total_pages (INTEGER): Total pages in book
# - progress_percentage (DECIMAL): Calculated percentage (0-100)
# - started_at (TIMESTAMP): When session started
# - last_read_at (TIMESTAMP): Last update time
# - finished_at (TIMESTAMP): When session completed (NULL if ongoing)
# - status (VARCHAR): 'reading' | 'paused' | 'finished'
# - reading_time_minutes (INTEGER): Total minutes spent reading

# Constraints:
# - UNIQUE(user_id, book_id): Only one active session per book per user
# - CHECK: status IN ('reading', 'paused', 'finished')
# - ON DELETE CASCADE: If user/book deleted, sessions are deleted too

# Indexes (for performance):
# - idx_reading_sessions_user_id
# - idx_reading_sessions_book_id
# - idx_reading_sessions_status
# - idx_reading_sessions_started_at

# ============================================================================
