/**
 * Doit être importé en tout premier depuis `index.ts`.
 * PM2 / shell peuvent définir GROQ_API_KEY="" : dotenv considère alors que la
 * variable existe et ne lit pas la valeur depuis api/.env → Groq "non configuré".
 */
import dotenv from 'dotenv';

for (const k of [
  'GROQ_API_KEY',
  'WHISPER_GROQ_API_KEY',
  'SUMMARY_AI_GROQ_API_KEY',
  // OpenAI keys (course summaries uses SUMARRY_OPENAI_API_KEY first)
  'OPENAI_API_KEY',
  'SUMARRY_OPENAI_API_KEY',
] as const) {
  if (process.env[k] === '') delete process.env[k];
}

dotenv.config();
