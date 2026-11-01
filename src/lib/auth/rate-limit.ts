import { query, execute } from "@/lib/db";
export { getClientIp, getTrustedClientIp } from "@/lib/ip";

interface RateLimitOptions {
  action: string;
  identifier: string; // IP address, email, or user ID
  maxAttempts: number;
  windowSeconds: number;
}

/**
 * Check if an action by an identifier has exceeded the allowed rate limit.
 * Automatically cleans up events older than windowSeconds.
 */
export async function checkRateLimit(options: RateLimitOptions): Promise<{
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds: number;
}> {
  const { action, identifier, maxAttempts, windowSeconds } = options;
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowSeconds * 1000);

  // Clean old events opportunistically for this action + identifier
  await execute(
    "DELETE FROM rate_limit_events WHERE action = ? AND identifier = ? AND created_at < ?",
    [action, identifier, windowStart]
  ).catch(() => {});

  // Count recent events
  const rows = await query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM rate_limit_events 
     WHERE action = ? AND identifier = ? AND created_at >= ?`,
    [action, identifier, windowStart]
  );

  const currentAttempts = rows[0]?.count || 0;
  const remaining = Math.max(0, maxAttempts - currentAttempts);

  if (currentAttempts >= maxAttempts) {
    // Find earliest attempt in window to calculate retryAfterSeconds
    const oldest = await query<{ created_at: Date }>(
      `SELECT created_at FROM rate_limit_events 
       WHERE action = ? AND identifier = ? AND created_at >= ?
       ORDER BY created_at ASC LIMIT 1`,
      [action, identifier, windowStart]
    );

    const oldestTime = oldest[0]?.created_at ? new Date(oldest[0].created_at).getTime() : windowStart.getTime();
    const elapsedSeconds = Math.floor((now.getTime() - oldestTime) / 1000);
    const retryAfter = Math.max(1, windowSeconds - elapsedSeconds);

    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterSeconds: retryAfter,
    };
  }

  return {
    allowed: true,
    remainingAttempts: remaining,
    retryAfterSeconds: 0,
  };
}

/**
 * Record a rate limit attempt (e.g. failed login, password reset request).
 */
export async function recordRateLimitEvent(action: string, identifier: string): Promise<void> {
  await execute(
    "INSERT INTO rate_limit_events (action, identifier) VALUES (?, ?)",
    [action, identifier]
  );
}

/**
 * Reset rate limit events (e.g. upon successful authentication).
 */
export async function resetRateLimitEvents(action: string, identifier: string): Promise<void> {
  await execute(
    "DELETE FROM rate_limit_events WHERE action = ? AND identifier = ?",
    [action, identifier]
  );
}
