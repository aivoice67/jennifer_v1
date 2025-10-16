

## Project Overview

Jennifer is a full‑stack AI therapist app that provides empathetic, non‑judgmental support through a conversational interface with speech recognition, multilingual responses, and audio playback. This repository is a Vite + React frontend served by an Express server (for local/prod self‑host) and also includes Vercel Serverless API functions for cloud deployment.

## Tech Stack

### Frontend
- React 18 + Vite
- Routing: React Router v6
- UI: shadcn/ui on top of Radix UI primitives
- Styling: Tailwind CSS (custom config)
- Data fetching/caching: TanStack Query
- Internationalization: i18next + react‑i18next

### Backend
- Node.js + Express (single port dev/prod server)
- Optional Vercel Serverless Functions (`/api/*.ts`) for cloud deploy
- AI: OpenAI Chat Completions
- TTS: ElevenLabs Text‑to‑Speech

### Audio & Media
- Speech recognition: react‑speech‑recognition 4.x
- Waveform visualization and playback: wavesurfer.js
- PDF generation: jsPDF (with canvas rendering for complex scripts like Devanagari)

### Data
- Client‑side persistence via sessionStorage (assessment + conversation)

## Project Structure

```
.
├── api/                  # Vercel serverless API functions (chat, insights, health)
├── server/               # Express server (dev + self‑host prod)
│   ├── logic.ts          # OpenAI + ElevenLabs integrations and domain logic
│   └── server.ts         # Express app, routes, and Vite middleware in dev
├── src/                  # React app (Vite)
│   ├── components/       # UI + feature components (Chat, Assessment, Results, etc.)
│   ├── contexts/         # Auth + Language contexts
│   ├── data/             # Assessment questions, emergency numbers
│   ├── i18n/             # i18next setup and locale JSON files (en, es, fr, hi)
│   ├── pages/            # Misc pages (Login, NotFound)
│   └── services/         # Client API helpers
├── public/               # Static assets (images, fonts, robots.txt)
├── vercel.json           # Vercel build + routing config
└── vite/tailwind configs
```

## Core Features

### 1) Conversational Interface
- Real‑time speech recognition in the user‑selected language
- Records microphone audio and returns AI voice responses (TTS)
- Waveform visualization and playback controls with wavesurfer.js
- Session persistence of conversation history

### 2) Multilingual Support
- UI and AI responses localized via i18next (English, Spanish, French, Hindi)
- Language selection menu with session‑persisted preference
- Server prompts adapt to language and enforce TTS‑friendly output

### 3) Mental Health Assessment
- Pre‑chat assessment captured on the client and stored in sessionStorage
- Answers are injected into system prompts for more personalized support

### 4) Report Generation
- Results page shows assessment + conversation transcript
- Hindi transcript toggle: Devanagari ↔ Hinglish (server transliteration)
- PDF export with jsPDF (uses canvas image rendering for Devanagari)

### 5) Audio Pipeline
- Speech recognition using Web Speech API via react‑speech‑recognition
- ElevenLabs generates spoken audio for AI replies
- Waveform visualization and progress tracking for each message

## API Endpoints

Express (self‑host) and Vercel functions expose the same contracts:

- POST `/api/chat`
   - Request body:
      - `FirstMessage: boolean`
      - `assessment_question_answers: { questionId: number; question: string; answer: string; }[]`
      - `language: string` (e.g., "English" | "Spanish" | "French" | "Hindi")
      - `Transcript?: string` (user message)
      - `ConversationHistory?: { role: 'user'|'assistant'; content: string; timestamp: string }[]`
   - Response: `{ audioData: string /* base64 mp3 */, text: string }`

- POST `/api/insights`
   - Request body: `{ assessmentAnswers: [...], conversationHistory: [...] }`
   - Response: `{ summary: string }`

- POST `/api/hinglish`
   - Request body: `{ transcript: string }` with lines prefixed by `You:`/`Therapist:`
   - Response: `{ transcript: string }` (Devanagari → Roman Hindi transliteration, format preserved)

- GET `/api/health` → `{ ok: true }`

## Environment Variables

Create a `.env` file at the project root for local development:

- `OPENAI_API_KEY` (required) — for Chat Completions (gpt‑4o‑mini)
- `ELEVENLABS_API_KEY` (required) — for TTS
- `PORT` (optional, default 3000) — dev/prod server port
- `NODE_ENV` (set to `production` for `npm start`)

Note: An additional `ELEVENLABS2_API_KEY` is defined in code but not currently used.

On Vercel, set the same env vars in the project settings.

## Getting Started

Prerequisites: Node.js 18+ and a modern browser with microphone access.

1) Install dependencies

Using npm:

```
npm install
```

Or using pnpm:

```
pnpm install
```

Or using bun:

```
bun install
```

2) Run in development (single port: API + Vite frontend)

```
npm run dev
```

The server attaches Vite middleware for the frontend and serves API routes under `/api`.

3) Build for production

```
npm run build
```

Outputs:
- `dist/` (Vite static assets)
- `dist-server/` (compiled Express server)

4) Start production server (self‑host)

```
npm start
```

Visit http://localhost:3000 (or your configured `PORT`).

## Deployment

### Vercel
- `api/*.ts` are deployed as Serverless Functions using `@vercel/node`.
- Static frontend is built via `@vercel/static-build` into `dist/`.
- Routing is configured in `vercel.json`.
- Set `OPENAI_API_KEY` and `ELEVENLABS_API_KEY` in Vercel project settings.

### Self‑hosted
- Build with `npm run build` and run with `npm start`.
- Express serves both static assets and API on a single port.

## Internationalization

- i18next is initialized in `src/i18n/config.ts` with locales under `src/i18n/locales/` (en, es, fr, hi).
- Language is user‑selectable in the UI and persisted in `sessionStorage`.
- Server prompts enforce language‑specific responses and avoid characters that degrade TTS.

## Privacy & Safety

- No server‑side database. Data is stored in the browser via `sessionStorage`.
- Includes emergency numbers by country/region and a safety disclaimer.
- Not a substitute for professional care.

## Notes for Contributors

- Frontend entry: `src/main.tsx` → `src/App.tsx`
- Core features/components: `src/components/AssessmentForm.tsx`, `src/components/ChatInterface.tsx`, `src/components/ResultsPage.tsx`
- API helpers: `src/services/api.ts`
- Express routes: `server/server.ts` (mirrored by `api/*.ts` for Vercel)
- AI/TTS logic: `server/logic.ts`

---
System requirements: Node 18+, microphone‑capable browser, and internet access for API calls.
