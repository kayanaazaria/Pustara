/**
 * PRODUCTION-READY IMPLEMENTATION EXAMPLE
 * getTrendingBooks - Error Handling Best Practices
 */

// ============================================================================
// ❌ ANTI-PATTERN (Jangan lakukan ini)
// ============================================================================

// Bad Example 1: No error handling
exports.getTrendingBooks_Bad1 = async (req, res) => {
  const { limit = 10 } = req.query;
  const result = await db.executeQuery(query, [limit]);
  res.json({ success: true, data: toRows(result) });
};

// Bad Example 2: Generic error message
exports.getTrendingBooks_Bad2 = async (req, res) => {
  try {
    const result = await db.executeQuery(query, [limit]);
    res.json({ success: true, data: toRows(result) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error' });
  }
};

// Bad Example 3: No logging, hard to debug
exports.getTrendingBooks_Bad3 = async (req, res) => {
  try {
    const result = await db.executeQuery(query, [limit]);
    res.json({ success: true, data: toRows(result) });
  } catch (error) {
    console.error(error); // Stack trace spam
    res.status(500).json({ success: false, error: error.message });
  }
};

// Bad Example 4: Service failure crashes API
exports.getTrendingBooks_Bad4 = async (req, res) => {
  try {
    const result = await db.executeQuery(query, [limit]);
    const trends = await externalService.fetch(result); // Can throw!
    res.json({ success: true, data: trends });
  } catch (error) {
    throw error; // Unhandled - crashes entire request!
  }
};

// ============================================================================
// ✅ BEST PRACTICE (Production-Ready)
// ============================================================================

const logger = console; // atau use winston/pino di production

exports.getTrendingBooks = async (req, res) => {
  const requestId = `[TRENDING-${Date.now()}-${Math.random().toString(36).substr(2, 9)}]`;
  
  try {
    // 1. LOG INPUT
    logger.log(`${requestId} Started GET /books/trending`);
    logger.log(`${requestId} Query params:`, { ...req.query });

    // 2. VALIDATE INPUT
    const { limit = 10, offset = 0, sort = 'avg_rating' } = req.query;
    const limitNum = sanitizePagination(limit, 10, 1, 100);
    const offsetNum = sanitizePagination(offset, 0, 0, 100000);
    
    if (limitNum === null || offsetNum === null) {
      logger.warn(`${requestId} Invalid pagination params`);
      return res.status(400).json({
        success: false,
        error: { type: 'INVALID_PARAMS', message: 'Invalid limit or offset' },
      });
    }

    // 3. LOG DATABASE OPERATION
    logger.log(`${requestId} Querying database: limit=${limitNum}, offset=${offsetNum}`);
    const startTime = Date.now();
    
    const query = `
      SELECT * FROM books 
      WHERE is_active = true
      ORDER BY ${sanitizeSort(sort)} DESC
      LIMIT $1 OFFSET $2
    `;
    
    const result = await db.executeQuery(query, [limitNum, offsetNum]);
    const rows = toRows(result);
    const queryTime = Date.now() - startTime;

    // 4. LOG SUCCESS
    logger.log(`${requestId} ✅ Query succeeded in ${queryTime}ms, fetched ${rows.length} books`);

    // 5. TRANSFORM DATA (with error handling)
    const booksData = rows
      .map((book, idx) => {
        try {
          return withDownloadUrl(book, req);
        } catch (mapErr) {
          logger.error(`${requestId} Error transforming book[${idx}] ${book?.id}:`, mapErr.message);
          // Return book as-is if transform fails (don't crash entire response)
          return book;
        }
      })
      .filter(Boolean); // Remove nulls

    // 6. LOG RESPONSE
    logger.log(`${requestId} ✅ Transformed ${booksData.length} books`);

    // 7. RESPOND WITH METADATA
    res.json({
      success: true,
      data: booksData,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        count: booksData.length,
        total: rows.length, // Approximation
      },
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
        queryTimeMs: queryTime,
        source: 'database',
      },
    });

  } catch (error) {
    const errorId = `${requestId}-ERROR`;
    
    // 8. COMPREHENSIVE ERROR LOGGING
    logger.error(`${errorId} ❌ Exception caught:`, {
      type: error.constructor.name,
      message: error.message,
      code: error.code,
      errno: error.errno,
      firstLine: error.stack?.split('\n')[0],
      query: error.query?.substring(0, 100), // DB query if available
      timestamp: new Date().toISOString(),
    });

    // 9. GRACEFUL FALLBACK
    // Never crash - return 500 with empty data array
    res.status(500).json({
      success: false,
      error: {
        type: classifyError(error), // DATABASE_ERROR, TIMEOUT, etc
        message: getDatabaseErrorMessage(error),
        detail: process.env.NODE_ENV === 'development' ? error.message : undefined,
        requestId: errorId,
      },
      data: [], // Empty array fallback
      pagination: {
        limit: 10,
        offset: 0,
        count: 0,
        total: 0,
      },
      meta: {
        timestamp: new Date().toISOString(),
        source: 'fallback',
      },
    });
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Classify database errors untuk better error handling
 */
function classifyError(error) {
  const message = error.message?.toLowerCase() || '';
  const code = error.code || '';

  if (message.includes('timeout') || message.includes('deadlock')) {
    return 'DATABASE_TIMEOUT';
  }
  if (code === 'ECONNREFUSED' || code === 'EHOSTUNREACH') {
    return 'DATABASE_UNREACHABLE';
  }
  if (message.includes('connection') || message.includes('pool')) {
    return 'CONNECTION_POOL_ERROR';
  }
  if (message.includes('query') || message.includes('syntax')) {
    return 'QUERY_ERROR';
  }
  
  return 'DATABASE_ERROR';
}

/**
 * User-friendly error message (tidak leak internal details)
 */
function getDatabaseErrorMessage(error) {
  const type = classifyError(error);
  
  const messages = {
    DATABASE_TIMEOUT: 'Request timed out. Please try again.',
    DATABASE_UNREACHABLE: 'Database service unavailable. Please try again later.',
    CONNECTION_POOL_ERROR: 'Connection pool exhausted. Please try again.',
    QUERY_ERROR: 'Invalid query. Please contact support.',
    DATABASE_ERROR: 'Database error. Please try again.',
  };
  
  return messages[type] || 'An error occurred. Please try again.';
}

/**
 * Sanitize sort parameter to prevent SQL injection
 */
function sanitizeSort(sort) {
  const allowed = ['avg_rating', 'created_at', 'title', 'year', 'pages'];
  return allowed.includes(sort) ? sort : 'created_at';
}

/**
 * Helper untuk sanitize pagination (copy dari code asli)
 */
function sanitizePagination(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

// ============================================================================
// FETCH WITH TIMEOUT (untuk external API calls)
// ============================================================================

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// CIRCUIT BREAKER PATTERN (untuk external services)
// ============================================================================

class CircuitBreaker {
  constructor(fn, options = {}) {
    this.fn = fn;
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.failures = 0;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  async call(...args) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        console.log('Circuit breaker: attempting to recover');
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await this.fn(...args);
      
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failures = 0;
        console.log('Circuit breaker: recovered');
      }
      
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();

      if (this.failures >= this.failureThreshold) {
        this.state = 'OPEN';
        console.error(`Circuit breaker: opened after ${this.failures} failures`);
      }

      throw error;
    }
  }
}

// Usage:
// const aiProxy = new CircuitBreaker(proxyToAI, { failureThreshold: 3 });
// await aiProxy.call('GET', '/recommendations/trending');

// ============================================================================
// SUMMARY: Production-Ready Checklist
// ============================================================================

/*
✅ ALWAYS:
  - Log with request ID for tracing
  - Validate input parameters
  - Use try-catch around async operations
  - Classify errors for better handling
  - Return user-friendly error messages
  - Include metadata in response (timestamp, requestId, source)
  - Don't expose internal error details to clients
  - Implement graceful fallback (empty data instead of crash)
  - Set timeout for external API calls
  - Monitor error patterns in logs

❌ NEVER:
  - Log sensitive data (passwords, tokens, etc)
  - Throw errors without catching
  - Return raw error messages to client
  - Crash the entire service for one request
  - Make assumptions about external services
  - Skip input validation
  - Ignore network timeouts
  - Return 500 with empty response

🔄 CONSIDER:
  - Circuit breaker for external services
  - Retry logic with exponential backoff
  - Request rate limiting
  - Caching for frequently accessed data
  - Database connection pooling
  - Error reporting/monitoring (Sentry, DataDog, etc)
*/
