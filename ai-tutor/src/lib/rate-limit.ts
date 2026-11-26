type Bucket = { count: number; resetAt: number };

const globalForLimiter = globalThis as unknown as {
  otpLimiter: Map<string, Bucket> | undefined;
};

const buckets: Map<string, Bucket> = globalForLimiter.otpLimiter ?? new Map();
if (process.env.NODE_ENV !== "production") globalForLimiter.otpLimiter = buckets;

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 10;

export function checkOtpSendLimit(key: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }

  if (bucket.count >= MAX_PER_WINDOW) {
    return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true, retryAfter: 0 };
}
