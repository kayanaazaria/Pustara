/**
 * Recommendations Routes
 * Proxy to FastAPI AI server on Hugging Face.
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
 * Udah disesuaikan dengan kebutuhan Model C (Demographic) FastAPI v4.1
 */
async function getUserSurveyContext(uid) {
  try {
    const result = await UserSurveyService.getSurveyByUid(uid);
    if (result.success && result.data) {
      // Pastikan format umurnya sesuai dengan yg diminta FastAPI: "<20", "21-30", "31-40", atau ">40"
      let ageGroup = null;
      const exactAge = parseInt(result.data.age);
      if (!isNaN(exactAge)) {
        if (exactAge < 20) ageGroup = "<20";
        else if (exactAge <= 30) ageGroup = "21-30";
        else if (exactAge <= 40) ageGroup = "31-40";
        else ageGroup = ">40";
      } else {
        ageGroup = result.data.age; // Kalau dari DB udah string format age group
      }

      // Pastikan preferred_genres bentuknya Array
      let genresArray = [];
      if (typeof result.data.favoriteGenre === 'string') {
        genresArray = result.data.favoriteGenre.split(',').map(g => g.trim());
      } else if (Array.isArray(result.data.favoriteGenre)) {
        genresArray = result.data.favoriteGenre;
      }

      return {
        user_gender:      result.data.gender || null, // "L", "P", "X"
        user_age:         result.data.age ? String(result.data.age) : null, // Buat prompt Groq
        user_age_group:   ageGroup, // Buat Model C
        preferred_genres: genresArray.length > 0 ? genresArray : null,
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
        user_age_group:      surveyCtx.user_age_group,   // ✅ TAMBAHAN BARU
        preferred_genres:    surveyCtx.preferred_genres, // ✅ TAMBAHAN BARU
        chat_history:        req.body.chat_history || [],
        context: {
          ...clientContext,
          genre_pref:   surveyCtx.preferred_genres ? surveyCtx.preferred_genres.join(',') : null,
          recent_books: recentBooks,
        },
      });

      res.json({ success: true, data: result });
    })
  );

  // ── POST /recommendations/direct ──────────────────────────────────────────
  router.post(
    '/direct',
    verifyTokenMiddleware,
    asyncHandler(async (req, res) => {
      const { book_id, seed_title, top_n = 10 } = req.body;
      const bid = book_id || seed_title;
      if (!bid) return res.status(400).json({ success: false, error: 'book_id is required' });

      const uid = req.user.uid;
      pushActivity(uid, bid, 'view').catch(() => {});

      // ✅ TAMBAHAN BARU: Kirim demographic hint biar direct reko-nya personal buat user cold
      const surveyCtx = await getUserSurveyContext(uid);

      const result = await proxyToAI('POST', '/recommendations/direct', {
        book_id:          bid,
        user_id:          uid,
        n:                top_n,
        user_gender:      surveyCtx.user_gender,
        user_age_group:   surveyCtx.user_age_group,
        preferred_genres: surveyCtx.preferred_genres
      });

      res.json({ success: true, data: result });
    })
  );

  // ── POST /recommendations/activity ────────────────────────────────────────
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

      const redisOk = await pushActivity(uid, book_id, action);

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
      const { top_n = 10, language } = req.query;
      const surveyCtx = await getUserSurveyContext(req.user.uid);
      
      const params = new URLSearchParams({ n: top_n });
      if (language) params.set('language', language);
      
      // ✅ TAMBAHAN BARU: Kirim survey ke query params FastAPI
      if (surveyCtx.user_gender) params.set('gender', surveyCtx.user_gender);
      if (surveyCtx.user_age_group) params.set('age_group', surveyCtx.user_age_group);
      if (surveyCtx.preferred_genres) params.set('genres', surveyCtx.preferred_genres.join(','));

      const result = await proxyToAI('GET', `/recommendations/cold-start?${params.toString()}`);
      res.json({ success: true, data: result });
    })
  );

  // ── GET /recommendations/trending ─────────────────────────────────────────
  router.get(
    '/trending',
    verifyTokenMiddleware,
    asyncHandler(async (req, res) => {
      const { top_n = 10 } = req.query;
      const surveyCtx = await getUserSurveyContext(req.user.uid);

      const params = new URLSearchParams({ n: top_n });
      
      // ✅ TAMBAHAN BARU: Kirim survey buat trending blend Model C
      if (surveyCtx.user_gender) params.set('gender', surveyCtx.user_gender);
      if (surveyCtx.user_age_group) params.set('age_group', surveyCtx.user_age_group);

      const result = await proxyToAI('GET', `/recommendations/trending?${params.toString()}`);
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