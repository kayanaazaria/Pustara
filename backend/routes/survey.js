/**
 * Survey Routes
 * Handles: save survey, get survey, update survey
 */

const express = require("express");
const CONFIG = require("../constants/config");
const UserSurveyService = require("../services/userSurveyService");

/**
 * Async error handler wrapper
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error(`Route error: ${err.message}`);
    res.status(500).json({ success: false, error: CONFIG.ERRORS.INTERNAL_SERVER_ERROR });
  });
};

/**
 * Create survey routes
 * @param {Function} verifyTokenMiddleware - Token verification middleware
 * @returns {Router} Express router
 */
function createSurveyRoutes(verifyTokenMiddleware) {
  const router = express.Router();

  // POST /survey/save - Save or update user survey
  router.post(
    "/save",
    verifyTokenMiddleware,
    asyncHandler(async (req, res) => {
      const uid = req.user.uid;
      const email = req.user.email; // ← Get email dari token!
      
      // Auto-create user kalau belum ada
      const userService = require("../services/userService");
      let userResult = await userService.getUserByUid(uid);
      
      if (!userResult.data) {
        console.log(`⚠️ User not found, creating with email: ${email}`);
        const createResult = await userService.createUser(uid, email);
        if (!createResult.success) {
          return res.status(400).json(createResult);
        }
      }
      
      // Now save survey
      const result = await UserSurveyService.saveSurvey(uid, req.body);
      res.status(result.success ? 201 : 400).json(result);
    })
  );

  // GET /survey/my-survey - Get user's survey
  router.get(
    "/my-survey",
    verifyTokenMiddleware,
    asyncHandler(async (req, res) => {
      const uid = req.user.uid;
      const result = await UserSurveyService.getSurveyByUid(uid);
      res.status(result.success ? 200 : 404).json(result);
    })
  );

  // GET /survey/profile - Get user profile with survey data
  router.get(
    "/profile",
    verifyTokenMiddleware,
    asyncHandler(async (req, res) => {
      const uid = req.user.uid;
      const result = await UserSurveyService.getUserWithSurvey(uid);
      res.status(result.success ? 200 : 404).json(result);
    })
  );

  // PUT /survey/update - Update survey
  router.put(
    "/update",
    verifyTokenMiddleware,
    asyncHandler(async (req, res) => {
      const uid = req.user.uid;
      
      // Get user first to get userId
      const userService = require("./userService");
      const userResult = await userService.getUserByUid(uid);
      
      if (!userResult.success || !userResult.data) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      const result = await UserSurveyService.updateSurvey(userResult.data.id, req.body);
      res.status(result.success ? 200 : 400).json(result);
    })
  );

  return router;
}

module.exports = createSurveyRoutes;
