/**
 * Cloudflare Turnstile CAPTCHA middleware
 *
 * Validates req.body.captchaToken for sensitive public auth routes.
 */

const CONFIG = require("../constants/config");

function mapTurnstileErrorMessage(errorCodes = []) {
  if (!Array.isArray(errorCodes) || errorCodes.length === 0) {
    return "CAPTCHA verification failed";
  }

  if (errorCodes.includes("timeout-or-duplicate")) {
    return "CAPTCHA token kedaluwarsa atau sudah digunakan. Silakan verifikasi ulang.";
  }

  if (errorCodes.includes("missing-input-response") || errorCodes.includes("invalid-input-response")) {
    return "Token CAPTCHA tidak valid. Silakan verifikasi ulang.";
  }

  return "CAPTCHA verification failed";
}

async function verifyTurnstileToken(token, remoteIp) {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  if (!secret) {
    // Fail closed for security-sensitive auth paths.
    return { success: false, error: "CAPTCHA secret key is not configured" };
  }

  if (!token || typeof token !== "string") {
    return { success: false, error: "CAPTCHA token is missing" };
  }

  try {
    const body = new URLSearchParams({
      secret,
      response: token,
    });

    if (remoteIp) {
      body.append("remoteip", remoteIp);
    }

    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      return { success: false, error: "CAPTCHA service is unavailable" };
    }

    const data = await response.json();

    if (!data.success) {
      const errorCodes = data["error-codes"] || [];
      return {
        success: false,
        error: mapTurnstileErrorMessage(errorCodes),
        details: errorCodes,
      };
    }

    return { success: true };
  } catch (error) {
    console.error("CAPTCHA verification error:", error.message);
    return { success: false, error: "CAPTCHA verification failed" };
  }
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded && typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }

  return req.headers["cf-connecting-ip"] || req.headers["x-real-ip"] || req.socket.remoteAddress || undefined;
}

function createCaptchaMiddleware() {
  return async (req, res, next) => {
    const token = req.body?.captchaToken;
    const remoteIp = getClientIp(req);
    const result = await verifyTurnstileToken(token, remoteIp);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error || CONFIG.ERRORS.CAPTCHA_FAILED,
        details: result.details || [],
      });
    }

    return next();
  };
}

module.exports = {
  createCaptchaMiddleware,
};
