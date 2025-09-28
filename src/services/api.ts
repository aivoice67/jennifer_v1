import axios from 'axios';

const API_BASE_URL = ''; // same-origin; prefix with /api in requests

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  messageId?: string;
  audioData?: string;
  detectedLanguage?: string;
}

export interface ChatResponse {
  audioData: string; // base64 encoded audio
  text: string;
}

export interface GetChatResponseParams {
  FirstMessage: boolean;
  assessment_question_answers: Array<{
    questionId: number;
    question: string;
    answer: string;
  }>;
  language: string;
  Transcript?: string;
  ConversationHistory?: ChatMessage[];
  DetectedLanguage?: string;
}

export const getChatResponse = async (params: GetChatResponseParams): Promise<ChatResponse> => {
  try {
    const response = await axios.post(`/api/chat`, params);
    return response.data;
  } catch (error) {
    console.error('Chat API error:', error);
    // Return mock response for development
    return {
      audioData: 'mock_base64_audio_data',
      text: params.FirstMessage 
        ? "Hello! I'm Jennifer, your AI therapist. I'm here to listen and support you through our conversation today."
        : "I understand. Please tell me more about how you're feeling."
    };
  }
};

export const generateInsightsSummary = async (
  assessmentAnswers: Array<{
    questionId: number;
    question: string;
    answer: string;
  }>,
  conversationHistory: ChatMessage[]
): Promise<string> => {
  try {
    const response = await axios.post(`/api/insights`, {
      assessmentAnswers,
      conversationHistory
    });
    return response.data.summary;
  } catch (error) {
    console.error('Insights API error:', error);
    return "Based on your assessment and our conversation, I can see that you're taking important steps toward understanding yourself better. Your responses indicate areas of both challenge and strength that we can continue to explore in future sessions.";
  }
};