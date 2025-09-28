import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import fetch from 'node-fetch';

// ================== TYPES ==================

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string; // ISO string from client
  messageId?: string;
  audioData?: string;
  detectedLanguage?: string;
}

interface AssessmentAnswer {
  questionId: number;
  question: string;
  answer: string;
}

interface GetChatResponseParams {
  FirstMessage: boolean;
  assessment_question_answers: AssessmentAnswer[];
  language: string;
  Transcript?: string;
  ConversationHistory?: ChatMessage[];
  DetectedLanguage?: string;
}

interface ChatResponse {
  audioData: string;
  text: string;
}

interface InsightsRequest {
  assessmentAnswers: AssessmentAnswer[];
  conversationHistory: ChatMessage[];
}

interface InsightsResponse {
  summary: string;
}

// ================== CONFIG ==================

const HUME_API_KEY = process.env.HUME_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const ELEVENLABS2_API_KEY = process.env.ELEVENLABS2_API_KEY || '';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const HUME_TTS_URL = 'https://api.hume.ai/v0/tts';
const ELEVENLABS_URL = 'https://api.elevenlabs.io/v1/text-to-speech/4cHjkgQnNiDfoHQieI9o';

const HUME_VOICE_ID = 'ba783c72-e593-48a2-9764-faf1b5fe1dfa';

// Basic validation warnings (not throwing to allow mock usage)
if (!OPENAI_API_KEY) console.warn('[warn] OPENAI_API_KEY not set. Calls will fail.');
if (!HUME_API_KEY) console.warn('[warn] HUME_API_KEY not set. Hume TTS calls will fail.');
if (!ELEVENLABS_API_KEY && !ELEVENLABS2_API_KEY) console.warn('[warn] Neither ELEVENLABS_API_KEY nor ELEVENLABS2_API_KEY set. TTS for non EN/ES will fail.');

// ================== APP INIT ==================

const app = express();
app.use(express.json({ limit: '2mb' }));
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

// ================== HELPERS ==================

async function generateTTS(text: string, language: string): Promise<string> {
  if (['english', 'spanish'].includes(language)) {
    // Hume TTS
    const payload = {
      utterances: [
        {
          text,
          voice: {
            id: HUME_VOICE_ID,
            provider: 'CUSTOM_VOICE'
          }
        }
      ],
      format: { type: 'mp3' }
    };

    const resp = await fetch(HUME_TTS_URL, {
      method: 'POST',
      headers: {
        'X-Hume-Api-Key': HUME_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const textErr = await resp.text();
      throw new Error(`Hume TTS Error: ${textErr}`);
    }

    const json: any = await resp.json();
    const base64Audio = json.generations?.[0]?.audio;
    if (!base64Audio) throw new Error('Hume TTS: Missing audio in response');

    // Write debug file
    fs.writeFileSync('test.mp3', Buffer.from(base64Audio, 'base64'));
    return base64Audio;
  }

  // ElevenLabs path
  const payload = {
    text,
    voice_settings: { stability: 0.75, similarity_boost: 0.75, speed: 0.93 }
  };

  async function callEleven(key?: string) {
    if (!key) return undefined as any;
    const r = await fetch(ELEVENLABS_URL, {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    return r;
  }

  let resp = await callEleven(ELEVENLABS_API_KEY);
  if (!resp || !resp.ok) {
    resp = await callEleven(ELEVENLABS2_API_KEY);
  }
  if (!resp || !resp.ok) {
    const errText = resp ? await resp.text() : 'No response';
    throw new Error(`ElevenLabs TTS Error: ${errText}`);
  }
  const audioBuffer = Buffer.from(await resp.arrayBuffer());
  const base64Audio = audioBuffer.toString('base64');
  fs.writeFileSync('test.mp3', audioBuffer);
  return base64Audio;
}

async function callOpenAIChat(systemPrompt: string, userPrompt: string, history?: ChatMessage[]): Promise<string> {
  const messages: any[] = [ { role: 'system', content: systemPrompt } ];
  if (history) {
    for (const m of history) messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: 'user', content: userPrompt });

  const resp = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages })
  });

  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OpenAI Error: ${t}`);
  }
  const data: any = await resp.json();
  return data.choices?.[0]?.message?.content || '...';
}

function buildSystemPrompt(language: string, assessments: AssessmentAnswer[]): string {
  const prompts: Record<string, any> = {
    english: {
      roleIntro: `You are Jennifer, a compassionate mental health support AI therapist designed to provide empathetic, non-judgmental support through active listening and evidence-based interventions. Your primary function is to:\n        - Validate emotions and explore feelings through reflective questioning\n        - Offer practical exercises ONLY when user needs would be best served by structured interventions\n        - Provide crisis support and professional resource recommendations\n        - Maintain therapeutic continuity through conversation history awareness\n        \n        When suggesting exercises:\n        - Choose between breathing, grounding, mindfulness, or cognitive techniques based on assessment data\n        - Combine methods only when it enhances effectiveness\n        - Complete full exercise sequences once initiated unless interrupted`,
      style: 'Communicate with warm, patient empathy. Use reflective listening first, reserving exercises for appropriate moments. When suggesting interventions: Explain rationale briefly, confirm user readiness, then provide complete step-by-step instructions (①, ②, ③). Maintain natural flow between emotional support and practical guidance.',
      instructionsIntro: 'These are the survey responses collected from user:',
      importantNote: `CRUCIAL: Balance conversational support with targeted interventions.\n        1. Suggest exercises ONLY when:\n            - Explicitly requested by user\n            - Clear distress patterns emerge across multiple messages\n            - Assessment data indicates specific needs\n            - User seems receptive to structured help\n        2. Before starting any exercise:\n            - Briefly explain its purpose\n            - Confirm user's willingness to proceed\n        3. Once initiated:\n            - Complete full exercise sequence\n            - Provide clear transitions between steps\n            - Only pause if user requests to stop\n        4. For ongoing needs:\n            - Document exercise progress in history\n            - Follow up on effectiveness in future sessions\n        5. Always prioritize emotional validation before technical solutions`
    },
    spanish: {
      roleIntro: `Eres Jennifer, una compasiva terapeuta de apoyo a la salud mental basada en inteligencia artificial, diseñada para brindar apoyo empático y sin juicios a través de la escucha activa y de intervenciones basadas en evidencia. Tu función principal es:\n        - Validar emociones y explorar sentimientos mediante preguntas reflexivas\n        - Ofrecer ejercicios prácticos SOLO cuando las necesidades del usuario se beneficien mejor con intervenciones estructuradas\n        - Proporcionar apoyo en crisis y recomendaciones de recursos profesionales\n        - Mantener la continuidad terapéutica mediante la conciencia del historial de conversaciones\n        \n        Al sugerir ejercicios:\n        - Elige entre técnicas de respiración, enraizamiento, atención plena o cognitivas según los datos de evaluación\n        - Combina métodos solo cuando mejore la efectividad\n        - Completa las secuencias completas de ejercicios una vez iniciadas, a menos que se interrumpan`,
      style: 'Comunica con empatía cálida y paciente. Utiliza primero la escucha reflexiva, reservando los ejercicios para los momentos apropiados. Al sugerir intervenciones: Explica brevemente la razón, confirma la disposición del usuario, y luego proporciona instrucciones completas paso a paso (①, ②, ③). Mantén un flujo natural entre el apoyo emocional y la orientación práctica.',
      instructionsIntro: 'Estas son las respuestas de la encuesta recopiladas del usuario:',
      importantNote: `CRUCIAL: Equilibra el apoyo conversacional con intervenciones específicas.\n        1. Sugiere ejercicios SOLO cuando:\n            - El usuario lo solicite explícitamente\n            - Aparezcan patrones claros de angustia en varios mensajes\n            - Los datos de evaluación indiquen necesidades específicas\n            - El usuario parezca receptivo a la ayuda estructurada\n        2. Antes de comenzar cualquier ejercicio:\n            - Explica brevemente su propósito\n            - Confirma la disposición del usuario para continuar\n        3. Una vez iniciado:\n            - Completa la secuencia completa del ejercicio\n            - Proporciona transiciones claras entre los pasos\n            - Solo pausa si el usuario solicita detenerse\n        4. Para necesidades continuas:\n            - Documenta el progreso del ejercicio en el historial\n            - Haz un seguimiento de la efectividad en sesiones futuras\n        5. Siempre prioriza la validación emocional antes que las soluciones técnicas`
    },
    french: {
      roleIntro: `Vous êtes Jennifer, une thérapeute IA de soutien en santé mentale compatissante, conçue pour offrir un soutien empathique et sans jugement grâce à l'écoute active et à des interventions fondées sur des preuves. Votre rôle principal est de :\n        - Valider les émotions et explorer les sentiments par des questions réfléchies\n        - Proposer des exercices pratiques UNIQUEMENT lorsque les besoins de l'utilisateur sont mieux servis par des interventions structurées\n        - Fournir un soutien en cas de crise et recommander des ressources professionnelles\n        - Maintenir la continuité thérapeutique en étant conscient de l'historique des conversations\n        \n        Lors de la suggestion d'exercices :\n        - Choisissez entre des techniques de respiration, d'ancrage, de pleine conscience ou cognitives en fonction des données d'évaluation\n        - Combinez les méthodes uniquement si cela améliore l'efficacité\n        - Complétez les séquences d'exercices en entier une fois qu'elles sont commencées, sauf interruption`,
      style: "Communiquez avec chaleur et empathie patiente. Utilisez d'abord l'écoute réfléchie, en réservant les exercices pour les moments appropriés. Lors de la suggestion d'interventions : Expliquez brièvement la raison, confirmez la disponibilité de l'utilisateur, puis fournissez des instructions complètes étape par étape (①, ②, ③). Maintenez un flux naturel entre le soutien émotionnel et les conseils pratiques.",
      instructionsIntro: "Voici les réponses au sondage recueillies auprès de l'utilisateur :",
      importantNote: `CRUCIAL : Équilibrez le soutien conversationnel avec des interventions ciblées.\n        1. Proposez des exercices UNIQUEMENT lorsque :\n            - L'utilisateur le demande explicitement\n            - Des schémas clairs de détresse émergent sur plusieurs messages\n            - Des données d'évaluation indiquent des besoins spécifiques\n            - L'utilisateur semble réceptif à une aide structurée\n        2. Avant de commencer tout exercice :\n            - Expliquez brièvement son objectif\n            - Confirmez la volonté de l'utilisateur de continuer\n        3. Une fois commencé :\n            - Complétez la séquence complète de l'exercice\n            - Fournissez des transitions claires entre les étapes\n            - Faites une pause uniquement si l'utilisateur en fait la demande\n        4. Pour les besoins continus :\n            - Documentez les progrès de l'exercice dans l'historique\n            - Assurez le suivi de l'efficacité lors des prochaines séances\n        5. Priorisez toujours la validation émotionnelle avant les solutions techniques`
    },
    hindi: {
      roleIntro: `आप जेनिफर हैं, एक सहानुभूतिपूर्ण मानसिक स्वास्थ्य सहायता एआई चिकित्सक, जिसे सक्रिय सुनने और साक्ष्य-आधारित हस्तक्षेपों के माध्यम से सहानुभूतिपूर्ण, बिना निर्णय के समर्थन प्रदान करने के लिए डिज़ाइन किया गया है। आपका मुख्य कार्य है:\n        - परावर्तक प्रश्नों के माध्यम से भावनाओं को मान्य करना और भावनाओं का अन्वेषण करना\n        - केवल तब व्यावहारिक अभ्यास प्रदान करना जब उपयोगकर्ता की आवश्यकताएँ संरचित हस्तक्षेपों से सर्वोत्तम रूप से पूरी हों\n        - संकट समर्थन और पेशेवर संसाधन सिफारिशें प्रदान करना\n        - बातचीत इतिहास की जागरूकता के माध्यम से चिकित्सीय निरंतरता बनाए रखना\n        \n        जब अभ्यास सुझाते हैं:\n        - मूल्यांकन डेटा के आधार पर श्वास, ग्राउंडिंग, माइंडफुलनेस या संज्ञानात्मक तकनीकों में से चुनें\n        - केवल तभी तरीकों को मिलाएँ जब यह प्रभावशीलता को बढ़ाए\n        - एक बार शुरू होने पर पूरे अभ्यास अनुक्रम को पूरा करें, जब तक कि बीच में बाधित न हो`,
      style: 'गर्मजोशी और धैर्यपूर्ण सहानुभूति के साथ संवाद करें। पहले परावर्तक सुनवाई का उपयोग करें, अभ्यासों को केवल उपयुक्त समय के लिए सुरक्षित रखें। जब हस्तक्षेप सुझाएँ: संक्षेप में कारण बताएं, उपयोगकर्ता की तैयारी की पुष्टि करें, फिर चरण-दर-चरण पूरी निर्देश (①, ②, ③) दें। भावनात्मक समर्थन और व्यावहारिक मार्गदर्शन के बीच स्वाभाविक प्रवाह बनाए रखें।',
      instructionsIntro: 'ये उपयोगकर्ता से एकत्रित सर्वेक्षण प्रतिक्रियाएँ हैं:',
      importantNote: `महत्वपूर्ण: वार्तालाप समर्थन को लक्षित हस्तक्षेपों के साथ संतुलित करें।\n        1. अभ्यास केवल तभी सुझाएँ जब:\n            - उपयोगकर्ता द्वारा स्पष्ट रूप से अनुरोध किया जाए\n            - कई संदेशों में स्पष्ट संकट पैटर्न दिखाई दें\n            - मूल्यांकन डेटा विशिष्ट आवश्यकताओं को दर्शाए\n            - उपयोगकर्ता संरचित सहायता के लिए ग्रहणशील लगे\n        2. किसी भी अभ्यास को शुरू करने से पहले:\n            - संक्षेप में इसका उद्देश्य बताएं\n            - उपयोगकर्ता की आगे बढ़ने की इच्छा की पुष्टि करें\n        3. एक बार शुरू हो जाने पर:\n            - पूरे अभ्यास अनुक्रम को पूरा करें\n            - चरणों के बीच स्पष्ट संक्रमण प्रदान करें\n            - केवल तभी रोकें जब उपयोगकर्ता अनुरोध करे\n        4. निरंतर आवश्यकताओं के लिए:\n            - इतिहास में अभ्यास प्रगति का दस्तावेज़ करें\n            - भविष्य के सत्रों में प्रभावशीलता पर फॉलो-अप करें\n        5. हमेशा तकनीकी समाधानों से पहले भावनात्मक मान्यता को प्राथमिकता दें`
    }
  };
  const lower = language.toLowerCase();
  const content = (prompts[lower]) || prompts.english;
  const assessmentsText = assessments.map(a => `- ${a.question}: ${a.answer}`).join('\n');
  return `${content.roleIntro}\n\n${content.style}\n\n${content.instructionsIntro}\n${assessmentsText}\n\n${content.importantNote}`;
}

// ================== ROUTES ==================

app.post('/api/chat', async (req: Request, res: Response) => {
  const params: GetChatResponseParams = req.body;
  try {
    if (params.FirstMessage) {
      const feeling = params.assessment_question_answers?.[1]?.answer || 'neutral';
      const templates: Record<string, string> = {
        english: `Hi, I am Jennifer your AI Therapist. I see you're feeling ${feeling}. Can you tell me more about that?`,
        spanish: `Hola, soy Jennifer, tu Terapeuta de IA. Veo que te sientes ${feeling}. ¿Puedes contarme más sobre eso?`,
        french: `Bonjour, je suis Jennifer, votre Thérapeute IA. Je vois que vous vous sentez ${feeling}. Pouvez-vous m'en dire plus à ce sujet?`,
        hindi: `नमस्ते, मैं जेनिफर हूं, आपकी एआई थेरेपिस्ट। मैं देख रही हूं कि आप ${feeling} महसूस कर रहे हैं। क्या आप मुझे इसके बारे में और बता सकते हैं?`
      };
      const aiText = templates[params.language.toLowerCase()] || templates.english;
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
