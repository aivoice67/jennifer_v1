import fs from 'fs';
import fetch from 'node-fetch';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  messageId?: string;
  audioData?: string;
  detectedLanguage?: string;
}

export interface AssessmentAnswer {
  questionId: number;
  question: string;
  answer: string;
}

export interface GetChatResponseParams {
  FirstMessage: boolean;
  assessment_question_answers: AssessmentAnswer[];
  language: string;
  Transcript?: string;
  ConversationHistory?: ChatMessage[];
  DetectedLanguage?: string;
}

export interface ChatResponse { audioData: string; text: string; }
export interface InsightsRequest { assessmentAnswers: AssessmentAnswer[]; conversationHistory: ChatMessage[]; }
export interface InsightsResponse { summary: string; }

const HUME_API_KEY = process.env.HUME_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const ELEVENLABS2_API_KEY = process.env.ELEVENLABS2_API_KEY || '';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const HUME_TTS_URL = 'https://api.hume.ai/v0/tts';
const ELEVENLABS_URL = 'https://api.elevenlabs.io/v1/text-to-speech/4cHjkgQnNiDfoHQieI9o';
const HUME_VOICE_ID = 'ba783c72-e593-48a2-9764-faf1b5fe1dfa';

export async function generateTTS(text: string, language: string): Promise<string> {
  if (['english', 'spanish'].includes(language)) {
    const payload = { utterances: [{ text, voice: { id: HUME_VOICE_ID, provider: 'CUSTOM_VOICE' }}], format: { type: 'mp3' }};
    const resp = await fetch(HUME_TTS_URL, { method: 'POST', headers: { 'X-Hume-Api-Key': HUME_API_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!resp.ok) throw new Error(`Hume TTS Error: ${await resp.text()}`);
    const json: any = await resp.json();
    const base64Audio = json.generations?.[0]?.audio;
    if (!base64Audio) throw new Error('Hume TTS: Missing audio');
    try { fs.writeFileSync('/tmp/test.mp3', Buffer.from(base64Audio, 'base64')); } catch {}
    return base64Audio;
  }
  const payload = { text, voice_settings: { stability: 0.75, similarity_boost: 0.75, speed: 0.93 } };
  async function callEleven(key?: string) {
    if (!key) return undefined as any;
    return fetch(ELEVENLABS_URL, { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  }
  let resp = await callEleven(ELEVENLABS_API_KEY);
  if (!resp || !resp.ok) resp = await callEleven(ELEVENLABS2_API_KEY);
  if (!resp || !resp.ok) throw new Error(`ElevenLabs TTS Error: ${resp ? await resp.text() : 'No response'}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  try { fs.writeFileSync('/tmp/test.mp3', buf); } catch {}
  return buf.toString('base64');
}

export async function callOpenAIChat(systemPrompt: string, userPrompt: string, history?: ChatMessage[]): Promise<string> {
  const messages: any[] = [{ role: 'system', content: systemPrompt }];
  if (history) history.forEach(m => messages.push({ role: m.role, content: m.content }));
  messages.push({ role: 'user', content: userPrompt });
  const resp = await fetch(OPENAI_URL, { method: 'POST', headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-4o-mini', messages }) });
  if (!resp.ok) throw new Error(`OpenAI Error: ${await resp.text()}`);
  const data: any = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

export function buildSystemPrompt(language: string, assessments: AssessmentAnswer[]): string {
  // (Identical to server.ts version - keep single source here if further edits needed)
  const prompts: Record<string, any> = {
    english: { roleIntro: 'You are Jennifer, a compassionate mental health support AI therapist designed to provide empathetic, non-judgmental support through active listening and evidence-based interventions.', style: 'Communicate with warm, patient empathy.', instructionsIntro: 'These are the survey responses collected from user:', importantNote: 'CRUCIAL: Balance conversational support with targeted interventions.' },
    spanish: { roleIntro: 'Eres Jennifer...', style: 'Comunica con empatía cálida...', instructionsIntro: 'Estas son las respuestas de la encuesta recopiladas del usuario:', importantNote: 'CRUCIAL: Equilibra el apoyo conversacional...' },
    french: { roleIntro: 'Vous êtes Jennifer...', style: 'Communiquez avec chaleur...', instructionsIntro: "Voici les réponses au sondage recueillies auprès de l'utilisateur :", importantNote: 'CRUCIAL : Équilibrez le soutien conversationnel...' },
    hindi: { roleIntro: 'आप जेनिफर हैं...', style: 'गर्मजोशी और धैर्यपूर्ण सहानुभूति...', instructionsIntro: 'ये उपयोगकर्ता से एकत्रित सर्वेक्षण प्रतिक्रियाएँ हैं:', importantNote: 'महत्वपूर्ण: वार्तालाप समर्थन को लक्षित हस्तक्षेपों...' }
  };
  const lower = language.toLowerCase();
  const content = prompts[lower] || prompts.english;
  const assessmentsText = assessments.map(a => `- ${a.question}: ${a.answer}`).join('\n');
  return `${content.roleIntro}\n\n${content.style}\n\n${content.instructionsIntro}\n${assessmentsText}\n\n${content.importantNote}`;
}

export function firstMessageTemplate(language: string, feeling: string) {
  const templates: Record<string,string> = {
    english: `Hi, I am Jennifer your AI Therapist. I see you're feeling ${feeling}. Can you tell me more about that?`,
    spanish: `Hola, soy Jennifer, tu Terapeuta de IA. Veo que te sientes ${feeling}. ¿Puedes contarme más sobre eso?`,
    french: `Bonjour, je suis Jennifer, votre Thérapeute IA. Je vois que vous vous sentez ${feeling}. Pouvez-vous m'en dire plus à ce sujet?`,
    hindi: `नमस्ते, मैं जेनिफर हूं, आपकी एआई थेरेपिस्ट। मैं देख रही हूं कि आप ${feeling} महसूस कर रहे हैं। क्या आप मुझे इसके बारे में और बता सकते हैं?`
  };
  return templates[language.toLowerCase()] || templates.english;
}