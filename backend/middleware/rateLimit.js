/**
 * Redis-based Rate Limiter Middleware
 * 
 * Supports two strategies:
 * 1. IP-based: For public routes (login/register) - lenient, shared campus NAT-friendly
 * 2. User ID-based: For protected routes (AI chat, activity) - strict per-user limits
 */

const Redis = require("@upstash/redis").Redis;
const CONFIG = require("../constants/config");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

/**
 * Extract client IP from request
 * Handles proxies (X-Forwarded-For, CF-Connecting-IP)
 */
function getClientIP(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return (
    req.headers["cf-connecting-ip"] ||
    req.headers["x-real-ip"] ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

/**
 * IP-based Rate Limiter
 * For public routes: lenient limits to avoid campus-wide IP blocks
 * 
 * @param {number} windowSeconds - Time window in seconds (default: 60)
 * @param {number} maxRequests - Max requests per window (default: 10)
 * @returns {Function} Express middleware
 */
function createIPRateLimiter(windowSeconds = 60, maxRequests = 10) {
  return async (req, res, next) => {
    try {
      const ip = getClientIP(req);
      const key = `rl:ip:${ip}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }

      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - count));
      res.setHeader("X-RateLimit-Reset", Math.ceil(Date.now() / 1000) + windowSeconds);

      if (count > maxRequests) {
        return res.status(429).json({
          success: false,
          error: "Too many requests. Please try again later.",
          retryAfter: windowSeconds,
        });
      }

      next();
    } catch (err) {
      console.error("Rate limiter error:", err);
      // On error, allow request to proceed (fail open)
      next();
    }
  };
}

/**
 * User ID-based Rate Limiter
 * For protected routes: strict per-user limits
 * Requires req.user.uid to be set by authentication middleware
 * 
 * @param {number} windowSeconds - Time window in seconds (default: 60)
 * @param {number} maxRequests - Max requests per window (default: 10)
 * @returns {Function} Express middleware
 */
function createUserRateLimiter(windowSeconds = 60, maxRequests = 10) {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.uid) {
        return res.status(401).json({
          success: false,
          error: "Authentication required",
        });
      }

      const userId = req.user.uid;
      const key = `rl:user:${userId}`;
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }

      res.setHeader("X-RateLimit-Limit", maxRequests);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - count));
      res.setHeader("X-RateLimit-Reset", Math.ceil(Date.now() / 1000) + windowSeconds);

      if (count > maxRequests) {
        return res.status(429).json({
          success: false,
          error: `Rate limit exceeded. Max ${maxRequests} requests per ${windowSeconds}s.`,
          retryAfter: windowSeconds,
        });
      }

      next();
    } catch (err) {
      console.error("Rate limiter error:", err);
      // On error, allow request to proceed (fail open)
      next();
    }
  };
}

/**
 * Combined Rate Limiter
 * Uses IP-based (lenient) for unauthenticated requests,
 * switches to User ID-based (strict) once authenticated
 * 
 * Useful for progressive enforcement without blocking shared IPs
 */
function createSmartRateLimiter(
  ipWindowSeconds = 60,
  ipMaxRequests = 20,
  userWindowSeconds = 60,
  userMaxRequests = 10
) {
  return async (req, res, next) => {
    try {
      if (req.user && req.user.uid) {
        const userId = req.user.uid;
        const key = `rl:user:${userId}`;
        const count = await redis.incr(key);
        if (count === 1) {
          await redis.expire(key, userWindowSeconds);
        }

        res.setHeader("X-RateLimit-Limit", userMaxRequests);
        res.setHeader("X-RateLimit-Remaining", Math.max(0, userMaxRequests - count));
        res.setHeader("X-RateLimit-Reset", Math.ceil(Date.now() / 1000) + userWindowSeconds);

        if (count > userMaxRequests) {
          return res.status(429).json({
            success: false,
            error: `Rate limit exceeded. Max ${userMaxRequests} requests per ${userWindowSeconds}s.`,
            retryAfter: userWindowSeconds,
          });
        }
      } else {
        // Fall back to IP-based limit
        const ip = getClientIP(req);
        const key = `rl:ip:${ip}`;
        const count = await redis.incr(key);

        if (count === 1) {
          await redis.expire(key, ipWindowSeconds);
        }

        res.setHeader("X-RateLimit-Limit", ipMaxRequests);
        res.setHeader("X-RateLimit-Remaining", Math.max(0, ipMaxRequests - count));
        res.setHeader("X-RateLimit-Reset", Math.ceil(Date.now() / 1000) + ipWindowSeconds);

        if (count > ipMaxRequests) {
          return res.status(429).json({
            success: false,
            error: `Too many requests. Please try again later.`,
            retryAfter: ipWindowSeconds,
          });
        }
      }

      next();
    } catch (err) {
      console.error("Rate limiter error:", err);
      next();
    }
  };
}

module.exports = {
  createIPRateLimiter,
  createUserRateLimiter,
  createSmartRateLimiter,
  getClientIP,
};
