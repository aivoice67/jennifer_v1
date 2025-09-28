import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateTTS, buildSystemPrompt, callOpenAIChat, firstMessageTemplate, GetChatResponseParams } from '../server/logic.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const params = req.body as GetChatResponseParams;
    if (!params || typeof params.FirstMessage === 'undefined') return res.status(400).json({ error: 'Invalid payload' });
    if (params.FirstMessage) {
      const feeling = params.assessment_question_answers?.[1]?.answer || 'neutral';
      const text = firstMessageTemplate(params.language || 'english', feeling);
      const audioData = await generateTTS(text, (params.language||'english').toLowerCase());
      return res.status(200).json({ audioData, text });
    }
    const system = buildSystemPrompt(params.language, params.assessment_question_answers || []);
    const userPrompt = params.Transcript || 'Please continue our conversation.';
    const text = await callOpenAIChat(system, userPrompt, params.ConversationHistory);
    const audioData = await generateTTS(text, (params.language||'english').toLowerCase());
    return res.status(200).json({ audioData, text });
  } catch (e: any) {
    console.error('chat function error', e);
    return res.status(500).json({ error: e.message || 'Internal Error' });
  }
}