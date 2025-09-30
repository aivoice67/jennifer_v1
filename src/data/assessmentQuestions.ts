import i18n from '@/i18n/config';

// Utility: generate a stable key for an option (same logic used in UI translation lookup)
export const generateOptionKey = (option: string) => option.toLowerCase().replace(/[^a-z0-9]/g, '_');

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
  /** Localized question text (in the language active at time of storage) */
  question: string;
  /** Localized answer text (in the language active at time of storage OR free text) */
  answer: string;
  /** Canonical option key (derived from original English option) for re-localization. For country question (id 10) this is the English country name. */
  optionKey?: string;
  /** Indicates user supplied free text (e.g. "Other") which should NOT be auto-translated on language change */
  freeText?: boolean;
}

/**
 * Retrieve stored assessment answers. This performs a light upgrade for legacy
 * entries (that only had plain English question+answer) by inferring optionKey
 * where possible so later re-localization works.
 */
export const getStoredAssessment = (): AssessmentAnswer[] => {
  const stored = sessionStorage.getItem('jennifer_assessment');
  if (!stored) return [];
  try {
    const parsed: AssessmentAnswer[] = JSON.parse(stored);
    return parsed.map(a => {
      // If already has optionKey or marked freeText, keep as-is
      if (a.optionKey || a.freeText) return a;

      // Attempt to infer optionKey from English option list
      const questionDef = assessmentQuestions.find(q => q.id === a.questionId);
      if (!questionDef) return a; // Unknown question id
      if (questionDef.id === 10) {
        // country question: treat stored answer (likely English country) as canonical
        return { ...a, optionKey: a.answer };
      }
      const maybeOption = questionDef.options.find(opt => opt === a.answer);
      if (maybeOption) {
        return { ...a, optionKey: generateOptionKey(maybeOption) };
      }
      // If answer not found in options, consider it free text
      return { ...a, freeText: true };
    });
  } catch {
    return [];
  }
};

/**
 * Store (or replace) an assessment answer using localized strings for question & answer.
 * The canonical option key is preserved to allow dynamic re-localization when language changes.
 */
export const storeAssessmentAnswer = (questionId: number, _question: string, rawAnswer: string, opts?: { freeText?: boolean }) => {
  const currentLang = i18n.language || 'en';
  const questionKey = `assessment.questions.${questionId}.question`;
  const localizedQuestion = i18n.t(questionKey);

  const isCountry = questionId === 10; // special handling for country list
  const questionDef = assessmentQuestions.find(q => q.id === questionId);

  let optionKey: string | undefined;
  let localizedAnswer = rawAnswer; // default (free text)
  let freeText = opts?.freeText || false;

  if (!freeText) {
    if (isCountry) {
      // rawAnswer should be English country name (canonical) -> translate
      optionKey = rawAnswer; // keep English country name as canonical identifier
      localizedAnswer = i18n.t(`countries.${rawAnswer}`, { defaultValue: rawAnswer });
    } else if (questionDef && questionDef.options.includes(rawAnswer)) {
      optionKey = generateOptionKey(rawAnswer);
      localizedAnswer = i18n.t(`assessment.questions.${questionId}.options.${optionKey}`, { defaultValue: rawAnswer });
    } else {
      // Not a recognized option => treat as free text
      freeText = true;
    }
  }

  const current = getStoredAssessment();
  const existingIndex = current.findIndex(a => a.questionId === questionId);
  const newEntry: AssessmentAnswer = {
    questionId,
    question: localizedQuestion,
    answer: localizedAnswer,
    optionKey,
    freeText,
  };
  let updated: AssessmentAnswer[];
  if (existingIndex !== -1) {
    // Replace in-place to preserve original order
    updated = [...current];
    updated[existingIndex] = newEntry;
  } else {
    updated = [...current, newEntry];
  }
  sessionStorage.setItem('jennifer_assessment', JSON.stringify(updated));
  // Also persist the language used, so we know last localization language
  sessionStorage.setItem('jennifer_assessment_lang', currentLang);
};

/** Relocalize stored assessment answers into a new target language */
export const relocalizeStoredAssessment = (targetLanguageCode: string) => {
  const stored = getStoredAssessment();
  if (!stored.length) return;

  const originalLang = i18n.language;
  const changeLanguageNeeded = originalLang !== targetLanguageCode;

  const localize = () => {
    return stored.map(a => {
      if (a.freeText) {
        // Only update question localization; answer remains user-provided text
        return {
          ...a,
          question: i18n.t(`assessment.questions.${a.questionId}.question`),
        };
      }
      if (a.optionKey) {
        let localizedAnswer: string;
        if (a.questionId === 10) {
          localizedAnswer = i18n.t(`countries.${a.optionKey}`, { defaultValue: a.optionKey });
        } else {
          localizedAnswer = i18n.t(`assessment.questions.${a.questionId}.options.${a.optionKey}`, { defaultValue: a.answer });
        }
        return {
          ...a,
            question: i18n.t(`assessment.questions.${a.questionId}.question`),
            answer: localizedAnswer,
        };
      }
      return a; // fallback
    });
  };

  // If i18n already at target language just localize. Otherwise temporarily change & revert.
  const proceed = () => {
    const relocalized = localize();
    sessionStorage.setItem('jennifer_assessment', JSON.stringify(relocalized));
    sessionStorage.setItem('jennifer_assessment_lang', targetLanguageCode);
  };

  if (changeLanguageNeeded) {
    // We avoid awaiting external change; we assume caller already changed i18n.
    proceed();
  } else {
    proceed();
  }
};

export const clearAssessment = () => {
  sessionStorage.removeItem('jennifer_assessment');
  sessionStorage.removeItem('jennifer_language');
  sessionStorage.removeItem('jennifer_conversation');
};