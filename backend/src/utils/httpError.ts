import type { Response } from 'express';

export function sendError(
  res: Response,
  status: number,
  message: unknown,
  details?: unknown,
) {
  const payload: any = { error: message };
  if (details !== undefined) payload.details = details;
  return res.status(status).json(payload);
}

