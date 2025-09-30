import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { assessmentQuestions, storeAssessmentAnswer, getStoredAssessment } from '@/data/assessmentQuestions';
import EmergencyNumbers from '@/data/emergencyNumbers';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/contexts/LanguageContext';

const AssessmentForm = () => {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string>('');
  const [otherText, setOtherText] = useState<string>('');
  const [answers, setAnswers] = useState<Map<number, string>>(new Map());
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { changeLanguage } = useLanguage();

  useEffect(() => {
    // Load existing answers from session storage
    const stored = getStoredAssessment();
    const answerMap = new Map();
    stored.forEach(answer => {
      answerMap.set(answer.questionId, answer.answer);
    });
    setAnswers(answerMap);
    
    // Set current answer if exists
    const currentAnswer = answerMap.get(assessmentQuestions[currentQuestion].id);
    if (currentAnswer) {
      setSelectedAnswer(currentAnswer);
    }
  }, [currentQuestion]);

  const handleAnswerSelect = (answer: string) => {
    setSelectedAnswer(answer);
    const q = assessmentQuestions[currentQuestion];
    if (answer !== 'Other') {
      setOtherText('');
      const updatedAnswers = new Map(answers);
      updatedAnswers.set(q.id, answer);
      setAnswers(updatedAnswers);

      // Store localized answer (storeAssessmentAnswer internally localizes)
      storeAssessmentAnswer(q.id, q.question, answer);

      // Handle language selection for the first question (language names are canonical English)
      if (currentQuestion === 0) {
        sessionStorage.setItem('jennifer_language', answer);
        changeLanguage(answer);
      }
    } else {
      // Mark selection of Other waiting for free text
      const updatedAnswers = new Map(answers);
      updatedAnswers.set(q.id, '');
      setAnswers(updatedAnswers);
    }
  };

  const handleOtherTextChange = (text: string) => {
    setOtherText(text);
    const q = assessmentQuestions[currentQuestion];
    if (selectedAnswer === 'Other' && text.trim()) {
      const trimmed = text.trim();
      const updatedAnswers = new Map(answers);
      updatedAnswers.set(q.id, trimmed);
      setAnswers(updatedAnswers);
      storeAssessmentAnswer(q.id, q.question, trimmed, { freeText: true });
    }
  };

  const handleCountrySelect = (country: string) => {
    setSelectedAnswer(country);
    const q = assessmentQuestions[currentQuestion];
    const updatedAnswers = new Map(answers);
    updatedAnswers.set(q.id, country);
    setAnswers(updatedAnswers);
    storeAssessmentAnswer(q.id, q.question, country); // country stored canonical english inside function
  };

  const handleNext = () => {
    if (currentQuestion < assessmentQuestions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
      const nextAnswer = answers.get(assessmentQuestions[currentQuestion + 1].id) || '';
      setSelectedAnswer(nextAnswer);
      setOtherText('');
    } else {
      // Assessment complete, navigate to chat
      navigate('/chat');
    }
  };

  const question = assessmentQuestions[currentQuestion];
  const isNextEnabled = selectedAnswer !== '' && (selectedAnswer !== 'Other' || otherText.trim() !== '');
  const countries = Object.keys(EmergencyNumbers).sort();

  // Get translated question and options
  const getTranslatedQuestion = (questionId: number) => {
    return t(`assessment.questions.${questionId}.question`);
  };

  const getTranslatedOption = (questionId: number, optionKey: string) => {
    const key = optionKey.toLowerCase().replace(/[^a-z0-9]/g, '_');
    return t(`assessment.questions.${questionId}.options.${key}`, { defaultValue: optionKey });
  };

  const getTranslatedCountry = (country: string) => {
    return t(`countries.${country}`, { defaultValue: country });
  };

  return (
    <div className="min-h-screen p-4 bg-gradient-to-r from-[#8a820b] via-[#24afcb] to-[#1e2652] flex items-center justify-center">
      <div className="w-full max-w-4xl p-6 sm:p-10 lg:p-20 bg-white rounded-lg shadow-lg mx-auto">
        <h2 className="text-2xl font-semibold mb-6 text-center font-sans">
          {getTranslatedQuestion(question.id)}
        </h2>

        {question.type === 'country' ? (
          <div className="mb-6">
            <Select value={selectedAnswer} onValueChange={handleCountrySelect}>
              <SelectTrigger className="w-full max-w-md mx-auto">
                <SelectValue placeholder={t('assessment.questions.10.placeholder')} />
              </SelectTrigger>
              <SelectContent>
                {countries.map((country) => (
                  <SelectItem key={country} value={country}>
                    {getTranslatedCountry(country)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3 justify-center mb-6">
            {question.options.map((option) => (
              <button
                key={option}
                onClick={() => handleAnswerSelect(option)}
                className={`w-full sm:w-auto px-12 py-6 border-2 text-center transition-all duration-200 text-[12px] rounded-2xl font-sans ${
                  selectedAnswer === option
                    ? 'bg-[#Adff2f] border-black'
                    : 'bg-white border-black'
                }`}
              >
                {getTranslatedOption(question.id, option)}
              </button>
            ))}

            {selectedAnswer === 'Other' && (
              <div className="w-full mt-4">
                <Input
                  type="text"
                  placeholder={t('assessment.ui.specify_placeholder')}
                  value={otherText}
                  onChange={(e) => handleOtherTextChange(e.target.value)}
                  className="w-full p-3 border-2 border-black rounded-lg min-h-[80px] sm:min-h-[100px]"
                />
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-center gap-4 mt-8">
          <button
            onClick={handleNext}
            disabled={!isNextEnabled}
            className={`w-full sm:w-auto text-center px-6 sm:px-10 py-3 sm:py-4 rounded-lg border-2 shadow-md ${
              isNextEnabled
                ? 'border-2 border-black shadow-[6px_6px_6px] rounded-lg bg-gray-300'
                : 'bg-gray-300 border-gray-400 cursor-not-allowed text-gray-400'
            }`}
          >
            {currentQuestion === assessmentQuestions.length - 1
              ? t('assessment.ui.start_chat')
              : t('assessment.ui.next')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssessmentForm;