// D1-backed sliding window rate limiter.
//
// Used to protect unauthenticated endpoints (login, register,
// change-password) from brute-force and enumeration attacks.
//
// Each (key, windowSeconds) pair gets one row in rate_limit_counters.
// On each call we check whether the current window has expired; if so
// we reset the counter, otherwise we increment. The whole thing fits
// in a single UPSERT so it's one D1 round-trip per guarded request.
//
// Usage:
//   const ok = await checkRateLimit(env.DB, `login:${ip}`, 10, 300);
//   if (!ok) return err('Too many attempts. Try again later.', 429, request);

const DEFAULT_MAX    = 10;   // max attempts
const DEFAULT_WINDOW = 300;  // seconds (5 minutes)

/**
 * Returns true if the request is within the allowed rate, false if exceeded.
 *
 * @param {D1Database} db
 * @param {string} key         - unique key, e.g. "login:1.2.3.4"
 * @param {number} maxAttempts - attempts allowed per window (default 10)
 * @param {number} windowSecs  - window length in seconds (default 300)
 */
export async function checkRateLimit(db, key, maxAttempts = DEFAULT_MAX, windowSecs = DEFAULT_WINDOW) {
  const now = Math.floor(Date.now() / 1000);

  // Upsert: on first insert, window_start = now, count = 1.
  // On conflict: if the window has expired reset it; otherwise increment.
  await db.prepare(`
    INSERT INTO rate_limit_counters (key, window_start, count)
    VALUES (?, ?, 1)
    ON CONFLICT(key) DO UPDATE SET
      window_start = CASE WHEN (? - window_start) >= ? THEN ? ELSE window_start END,
      count        = CASE WHEN (? - window_start) >= ? THEN 1 ELSE count + 1 END
  `).bind(key, now, now, windowSecs, now, now, windowSecs).run();

  const row = await db.prepare(
    'SELECT count FROM rate_limit_counters WHERE key = ?'
  ).bind(key).first();

  return row ? row.count <= maxAttempts : true;
}

/**
 * Extracts the client IP from Cloudflare request headers.
 * Falls back to 'unknown' if the header is absent (local dev).
 */
export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0].trim()
    || 'unknown';
}
