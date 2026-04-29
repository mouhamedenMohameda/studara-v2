import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const EnvSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.string().optional(),
  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_FILE_SIZE_MB: z.coerce.number().default(20),
  // Groq (OpenAI-compatible) — used for reasoning + (optionally) vision OCR.
  GROQ_API_KEY: z.string().optional(),
  GROQ_REASONING_MODEL: z.string().default('llama-3.3-70b-versatile'),
  GROQ_VISION_MODEL: z.string().default('llama-4-scout-17b'),

  // Optional fallback (if you still want Gemini for OCR).
  GOOGLE_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;
export const env: Env = EnvSchema.parse(process.env);

