/**
 * Recommendations Routes
 * Proxy to FastAPI AI server on Hugging Face.
 * * Improvements:
 * - Send user_gender, user_age, context (last_book_id, recent_books) to FastAPI
 * - Track every recommendation interaction to Redis via pushActivity
 * - Fetch user survey before calling AI to make recommendations more personalized
 */

const express = require('express');
const { pushActivity, getUserRecentBooks } = require('../services/redis');
const UserSurveyService = require('../services/userSurveyService');

const getAiUrl = () => process.env.FASTAPI_URL || 'http://localhost:8001';

const asyncHandler = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(err => {
    console.error('Recommendations route error:', err.message);
    res.status(500).json({ success: false, error: err.message || 'Internal server error' });
  });

async function proxyToAI(method, path, body = null) {
  const url = `${getAiUrl()}${path}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.HF_TOKEN}`,
    },
  };
  if (body) options.body = JSON.stringify(body);

  console.log(`[AI Proxy] ${method} → ${url}`);
  const response = await fetch(url, options);
  const data     = await response.json();

  if (!response.ok) {
    const err = new Error(data.detail || `AI service error: ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return data;
}

/**
 * Fetch user survey data (gender, age, genre pref) from the DB.
 * Graceful fallback — if it fails, return {} so the process continues.
 */
async function getUserSurveyContext(uid) {
  try {
    const result = await UserSurveyService.getSurveyByUid(uid);
    if (result.success && result.data) {
      return {
        user_gender: result.data.gender      || null,
        user_age:    result.data.age         || null,
        genre_pref:  result.data.favoriteGenre || null,
      };
    }
  } catch (e) {
    console.warn('[Survey] Failed to fetch user survey:', e.message);
  }
  return {};
}

function createRecommendationsRoutes(verifyTokenMiddleware) {
  const router = express.Router();

  // ── POST /recommendations/chat ────────────────────────────────────────────
  router.post(
    '/chat',
    verifyTokenMiddleware,
    asyncHandler(async (req, res) => {
      const {
        query,
        top_n = 10,
        attached_book_title,
        attached_book_desc,
        context: clientContext = {},
      } = req.body;

      if (!query || query.trim() === '') {
        return res.status(400).json({ success: false, error: 'query is required' });
      }

      const uid = req.user.uid;

      // Fetch survey + recent books in parallel
      const [surveyCtx, recentBooks] = await Promise.all([
        getUserSurveyContext(uid),
        getUserRecentBooks(uid, 10),
      ]);

      const result = await proxyToAI('POST', '/recommendations/chat', {
        message:             query,
        user_id:             uid,
        n:                   top_n,
        attached_book_title: attached_book_title || null,
        attached_book_desc:  attached_book_desc  || null,
        user_gender:         surveyCtx.user_gender,
        user_age:            surveyCtx.user_age,
        chat_history:        req.body.chat_history || [],   // ← forward history from FE
        context: {
          ...clientContext,
          genre_pref:   surveyCtx.genre_pref,
          recent_books: recentBooks,
        },
      });

      res.json({ success: true, data: result });
    })
  );

  // ── POST /recommendations/direct ──────────────────────────────────────────
  // Called from the book detail page → "You might also like"
  router.post(
    '/direct',
    verifyTokenMiddleware,
    asyncHandler(async (req, res) => {
      const { book_id, seed_title, top_n = 10 } = req.body;
      const bid = book_id || seed_title;
      if (!bid) return res.status(400).json({ success: false, error: 'book_id is required' });

      const uid = req.user.uid;

      // Track that the user viewed recommendations from this book (weak signal)
      pushActivity(uid, bid, 'view').catch(() => {});

      const result = await proxyToAI('POST', '/recommendations/direct', {
        book_id:  bid,
        user_id:  uid,
        n:        top_n,
      });

      res.json({ success: true, data: result });
    })
  );

  // ── POST /recommendations/activity ────────────────────────────────────────
  // New endpoint — FE calls this whenever a user interacts with a book
  // (view, read, like, bookmark, share, review)
  router.post(
    '/activity',
    verifyTokenMiddleware,
    asyncHandler(async (req, res) => {
      const { book_id, action } = req.body;
      const validActions = ['view', 'read', 'like', 'bookmark', 'share', 'review'];

      if (!book_id || !validActions.includes(action)) {
        return res.status(400).json({
          success: false,
          error: `book_id and action (${validActions.join('/')}) are required`,
        });
      }

      const uid = req.user.uid;

      // 1. Push to Redis (trending + stream + user recent)
      const redisOk = await pushActivity(uid, book_id, action);

      // 2. Forward to FastAPI /activity so that FastAPI also updates its cache
      proxyToAI('POST', '/activity', {
        user_id: uid,
        book_id: String(book_id),
        action,
      }).catch(e => console.warn('[AI Proxy] /activity forward error:', e.message));

      res.json({ success: true, tracked: redisOk, action, book_id });
    })
  );

  // ── GET /recommendations/cold-start ───────────────────────────────────────
  router.get(
    '/cold-start',
    verifyTokenMiddleware,
    asyncHandler(async (req, res) => {
      const { top_n = 10 } = req.query;

      // Use user survey if available
      const surveyCtx = await getUserSurveyContext(req.user.uid);
      const language  = surveyCtx.genre_pref === 'id' ? 'id' : undefined;

      const params = new URLSearchParams({ n: top_n });
      if (language) params.set('language', language);

      const result = await proxyToAI('GET', `/recommendations/cold-start?${params}`);
      res.json({ success: true, data: result });
    })
  );

  // ── GET /recommendations/trending ─────────────────────────────────────────
  router.get(
    '/trending',
    verifyTokenMiddleware,
    asyncHandler(async (req, res) => {
      const { top_n = 10 } = req.query;
      const result = await proxyToAI('GET', `/recommendations/trending?n=${top_n}`);
      res.json({ success: true, data: result });
    })
  );

  // ── GET /recommendations/health ───────────────────────────────────────────
  router.get(
    '/health',
    asyncHandler(async (req, res) => {
      try {
        const result = await proxyToAI('GET', '/health');
        res.json({ success: true, ai_service: 'up', data: result });
      } catch (err) {
        res.status(503).json({ success: false, ai_service: 'down', error: err.message });
      }
    })
  );

  return router;
}

module.exports = createRecommendationsRoutes;