import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { env } from './env.js';
import { registerAiExerciseCorrectionRoutes } from './routes/aiExerciseCorrections.js';
import { registerPdfExportRoutes } from './routes/pdfExport.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(multipart, {
  limits: {
    fileSize: env.MAX_FILE_SIZE_MB * 1024 * 1024,
    files: 1,
  },
});

app.get('/api/v1/health', async () => ({ ok: true }));

await registerAiExerciseCorrectionRoutes(app);
await registerPdfExportRoutes(app);

await app.listen({ port: env.PORT, host: '0.0.0.0' });

