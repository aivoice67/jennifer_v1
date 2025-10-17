import dotenv from 'dotenv';
dotenv.config({ path: "/opt/jennifer/.env", override: true });
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { generateTTS, callOpenAIChat, buildSystemPrompt, firstMessageTemplate, ChatMessage, AssessmentAnswer, GetChatResponseParams, ChatResponse, InsightsRequest, InsightsResponse, convertHindiToHinglish } from './logic.js';

// ================== CONFIG ==================
// All config & warnings handled in logic.ts

// ================== APP INIT ==================

const app = express();
// Increase body size limits to accommodate larger payloads (e.g., base64 audio)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cors());

// Serve Vite build in production OR attach Vite middleware in dev so we use ONE port
const isProduction = process.env.NODE_ENV === 'production';
const clientDist = path.join(process.cwd(), 'dist');

let devViteServer: any; // keep reference for dev index transform
async function attachFrontend(app: express.Express) {
  if (isProduction) {
    if (fs.existsSync(clientDist)) {
      app.use(express.static(clientDist));
    }
  } else {
    // Lazy import vite only in development
    const vite = await import('vite');
    devViteServer = await vite.createServer({
      server: { middlewareMode: true },
      appType: 'custom'
    });
    app.use(devViteServer.middlewares);
    // Explicit index + SPA fallback for non-API routes
    app.get(['/', '/index.html'], async (_req, res, next) => {
      try {
        const indexPath = path.join(process.cwd(), 'index.html');
        const raw = await fs.promises.readFile(indexPath, 'utf-8');
        const html = await devViteServer.transformIndexHtml('/', raw);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        next(e);
      }
    });
    app.get(/^(?!\/api\/).+/, async (_req, res, next) => {
      try {
        const indexPath = path.join(process.cwd(), 'index.html');
        const raw = await fs.promises.readFile(indexPath, 'utf-8');
        const html = await devViteServer.transformIndexHtml('/', raw);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        next();
      }
    });
  }
}

// ================== ROUTES ==================

app.post('/api/chat', async (req: Request, res: Response) => {
  const params: GetChatResponseParams = req.body;
  try {
    if (params.FirstMessage) {
      const feeling = params.assessment_question_answers?.[1]?.answer || 'neutral';
      const aiText = firstMessageTemplate(params.language, feeling);
      const audioB64 = await generateTTS(aiText, params.language.toLowerCase());
      const payload: ChatResponse = { audioData: audioB64, text: aiText };
      return res.json(payload);
    }

    const system = buildSystemPrompt(params.language, params.assessment_question_answers || []);
    const userPrompt = params.Transcript || 'Please continue our conversation.';
    const aiText = await callOpenAIChat(system, userPrompt, params.ConversationHistory);
    const audioB64 = await generateTTS(aiText, params.language.toLowerCase());
    return res.json({ audioData: audioB64, text: aiText });
  } catch (err: any) {
    console.error('chat route error', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

app.post('/api/insights', async (req: Request, res: Response) => {
  const body: InsightsRequest = req.body;
  try {
    const assessmentsText = body.assessmentAnswers.map(a => `${a.question}: ${a.answer}`).join('\n');
    const historyText = body.conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n');
    const userPrompt = `Based on the following assessment answers:\n${assessmentsText}\n\nAnd the conversation history:\n${historyText}\n\nProvide a short empathetic summary of the user's state, highlighting strengths and challenges.`;
    const summary = await callOpenAIChat('You are a supportive therapist summarizing user insights.', userPrompt, undefined);
    const payload: InsightsResponse = { summary };
    return res.json(payload);
  } catch (err: any) {
    console.error('insights route error', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// Convert Hindi transcript (Devanagari) to Hinglish (Roman Hindi) preserving 'You:' and 'Therapist:' blocks
app.post('/api/hinglish', async (req: Request, res: Response) => {
  try {
    const { transcript } = req.body as { transcript?: string };
    if (!transcript || typeof transcript !== 'string') {
      return res.status(400).json({ error: 'Invalid transcript' });
    }
    const output = await convertHindiToHinglish(transcript);
    return res.json({ transcript: output });
  } catch (err: any) {
    console.error('hinglish route error', err);
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true }));

async function addSpaFallback(app: express.Express) {
  if (isProduction) {
    app.get('*', (_req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  } else {
    // In dev, let Vite handle 404 -> index fallback automatically
  }
}

// Error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

export async function startServer(port: number) {
  await attachFrontend(app);
  await addSpaFallback(app);
  app.listen(port, () => {
    console.log(`Server (API + Frontend) listening on http://localhost:${port}`);
  });
  return app;
}

// If launched directly (not imported)
// ESM entrypoint detection
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT) || 3000;
  startServer(port);
}
