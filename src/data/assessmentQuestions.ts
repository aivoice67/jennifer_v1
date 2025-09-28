import i18n from '@/i18n/config';

export interface Question {
  id: number;
  question: string;
  options: string[];
  type: 'single' | 'country';
}

// Helper function to get translated question
export const getTranslatedQuestion = (questionId: number): string => {
  return i18n.t(`assessment.questions.${questionId}.question`);
};

// Helper function to get translated options
export const getTranslatedOptions = (questionId: number): string[] => {
  const question = assessmentQuestions.find(q => q.id === questionId);
  if (!question) return [];
  
  return question.options.map(option => {
    const key = option.toLowerCase().replace(/[^a-z0-9]/g, '_');
    return i18n.t(`assessment.questions.${questionId}.options.${key}`, { defaultValue: option });
  });
};

// Helper function to get translated country name
export const getTranslatedCountry = (country: string): string => {
  return i18n.t(`countries.${country}`, { defaultValue: country });
};

export const assessmentQuestions: Question[] = [
  {
    id: 1,
    question: "What language do you want to proceed in?",
    options: ["English", "French", "Spanish", "Hindi"],
    type: 'single'
  },
  {
    id: 2,
    question: "How are you feeling today?",
    options: ["Calm", "Anxious", "Sad", "Angry", "Overwhelmed", "Other"],
    type: 'single'
  },
  {
    id: 3,
    question: "What brings you here today?",
    options: ["Stress", "Relationships", "Self-reflection", "Building confidence", "Challenges", "Other"],
    type: 'single'
  },
  {
    id: 4,
    question: "What's your biggest challenge right now?",
    options: ["Work", "Relationships", "Motivation", "Managing emotions", "Confidence", "Other"],
    type: 'single'
  },
  {
    id: 5,
    question: "How often do you feel overwhelmed?",
    options: ["Daily", "Weekly", "Monthly", "Rarely", "Never"],
    type: 'single'
  },
  {
    id: 6,
    question: "How's your energy level today?",
    options: ["High", "Moderate", "Low", "Very Low"],
    type: 'single'
  },
  {
    id: 7,
    question: "How do you usually handle difficult moments?",
    options: ["Talking", "Exercise", "Self-care", "Hobbies", "Avoidance", "Other"],
    type: 'single'
  },
  {
    id: 8,
    question: "What does your typical day look like?",
    options: ["Productive", "Busy", "Unstructured", "Relaxed", "Other"],
    type: 'single'
  },
  {
    id: 9,
    question: "How do you feel about sharing your emotions?",
    options: ["Very comfortable", "Somewhat comfortable", "Not comfortable", "Uncomfortable"],
    type: 'single'
  },
  {
    id: 10,
    question: "Where are you located?",
    options: ["United States", "Canada", "United Kingdom", "Australia", "Germany", "France", "Spain", "India", "Other"],
    type: 'country'
  }
];

export interface AssessmentAnswer {
  questionId: number;
  question: string;
  answer: string;
}

export const getStoredAssessment = (): AssessmentAnswer[] => {
  const stored = sessionStorage.getItem('jennifer_assessment');
  return stored ? JSON.parse(stored) : [];
};

export const storeAssessmentAnswer = (questionId: number, question: string, answer: string) => {
  const current = getStoredAssessment();
  const updated = current.filter(a => a.questionId !== questionId);
  updated.push({ questionId, question, answer });
  sessionStorage.setItem('jennifer_assessment', JSON.stringify(updated));
};

export const clearAssessment = () => {
  sessionStorage.removeItem('jennifer_assessment');
  sessionStorage.removeItem('jennifer_language');
  sessionStorage.removeItem('jennifer_conversation');
};