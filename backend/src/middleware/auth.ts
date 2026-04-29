import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { checkHasAccess } from '../services/subscriptionService';

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string };
}

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or malformed token' });
    return;
  }
  const token = header.slice(7);

  // ── Dual-secret graceful rotation ─────────────────────────────────────────
  // During a rotation window JWT_SECRET_OLD (previous secret) is also accepted,
  // allowing existing sessions to stay valid for one cycle after rotation.
  const secrets = [process.env.JWT_SECRET!, process.env.JWT_SECRET_OLD].filter(Boolean) as string[];

  for (const secret of secrets) {
    try {
      const payload = jwt.verify(token, secret) as JwtPayload;
      req.user = { id: payload.sub, email: payload.email, role: payload.role };
      next();
      return;
    } catch {
      // try next secret
    }
  }

  res.status(401).json({ error: 'Token invalid or expired' });
};

export const requireRole = (...roles: string[]) =>
  (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };

/**
 * Middleware: verifies the authenticated user has an active subscription
 * (trial, paid, or bonus days still remaining).
 * Admins/moderators bypass the check.
 * Returns HTTP 402 with subscription info if access is denied.
 */
export const checkSubscription = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!req.user) { res.status(401).json({ error: 'Not authenticated' }); return; }
  // Admins and moderators always have access
  if (['admin', 'moderator'].includes(req.user.role)) { next(); return; }
  try {
    const hasAccess = await checkHasAccess(req.user.id);
    if (hasAccess) { next(); return; }
    res.status(402).json({
      error: 'subscription_expired',
      message: 'Your free trial has ended. Please subscribe or upload files to earn free days.',
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
};
