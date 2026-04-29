/**
 * securityLogger — Logs security-relevant HTTP responses (401, 403, 429).
 *
 * Mount this middleware BEFORE routes so it can intercept every response.
 * Each entry is written as a JSON line to stderr via console.warn so that
 * PM2's error log captures it automatically.
 *
 * Log format:
 *   {"ts":"…","level":"SECURITY","status":401,"method":"POST","path":"/api/v1/auth/login","ip":"1.2.3.4","ua":"…"}
 *
 * To filter security events from PM2 logs:
 *   pm2 logs --err | grep SECURITY
 */

import { Request, Response, NextFunction } from 'express';

const SECURITY_STATUSES = new Set([401, 403, 429]);

export const securityLogger = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  res.on('finish', () => {
    if (!SECURITY_STATUSES.has(res.statusCode)) return;

    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      '-';

    const entry = {
      ts:     new Date().toISOString(),
      level:  'SECURITY',
      status: res.statusCode,
      method: req.method,
      path:   req.path,
      ip,
      ua:     (req.headers['user-agent'] ?? '').slice(0, 120),
    };

    console.warn(JSON.stringify(entry));
  });

  next();
};
