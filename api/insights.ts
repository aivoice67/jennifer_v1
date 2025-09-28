import type { VercelRequest, VercelResponse } from '@vercel/node';
import { callOpenAIChat, InsightsRequest } from '../server/logic.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = req.body as InsightsRequest;
    if (!body) return res.status(400).json({ error: 'Invalid payload' });
    const assessmentsText = body.assessmentAnswers.map(a => `${a.question}: ${a.answer}`).join('\n');
    const historyText = body.conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n');
    const userPrompt = `Based on the following assessment answers:\n${assessmentsText}\n\nAnd the conversation history:\n${historyText}\n\nProvide a short empathetic summary of the user's state, highlighting strengths and challenges.`;
    const summary = await callOpenAIChat('You are a supportive therapist summarizing user insights.', userPrompt, undefined);
    return res.status(200).json({ summary });
  } catch (e: any) {
    console.error('insights function error', e);
    return res.status(500).json({ error: e.message || 'Internal Error' });
  }
}