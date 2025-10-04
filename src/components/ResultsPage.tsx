import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import jsPDF from 'jspdf';
import { getStoredAssessment, clearAssessment, AssessmentAnswer } from '@/data/assessmentQuestions';
import { ChatMessage, generateInsightsSummary, convertTranscriptToHinglish } from '@/services/api';
import { useLanguage } from '@/contexts/LanguageContext';
import { Skeleton } from '@/components/ui/skeleton';

const ResultsPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentLanguageCode } = useLanguage();
  const [assessmentAnswers, setAssessmentAnswers] = useState<AssessmentAnswer[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ChatMessage[]>([]);
  const [insightsSummary, setInsightsSummary] = useState<string>('');
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [hinglishTranscript, setHinglishTranscript] = useState<string | null>(null);
  const [isConverting, setIsConverting] = useState(false);

  // Sanitize a single line for PDF rendering to avoid unwanted spacing/hidden characters
  const sanitizeLine = (input: string): string => {
    if (!input) return '';
    // Remove zero-width characters and BOM/NO-BREAK SPACE
    const withoutHidden = input.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, ' ');
    // Normalize unicode and collapse excessive whitespace
    const normalized = withoutHidden.normalize('NFKC').replace(/\s+/g, ' ').trim();
    return normalized;
  };

  useEffect(() => {
    // Load data from session storage
    const assessment = getStoredAssessment();
    setAssessmentAnswers(assessment);

    const conversation = sessionStorage.getItem('jennifer_conversation');
    if (conversation) {
      setConversationHistory(JSON.parse(conversation));
    }
  }, []);

  // When language is Hindi and we have a conversation, build a single transcript preserving labels
  // and request Hinglish conversion only for on-screen display.
  useEffect(() => {
    const shouldConvert = currentLanguageCode === 'hi' && conversationHistory.length > 0;
    if (!shouldConvert) {
      setHinglishTranscript(null);
      return;
    }
    // Build transcript string with exact labels 'You:' and 'Therapist:'
    const full = conversationHistory
      .map(m => `${m.role === 'user' ? 'You:' : 'Therapist:'} ${m.content}`)
      .join('\n');
    setIsConverting(true);
    convertTranscriptToHinglish(full)
      .then(setHinglishTranscript)
      .catch(err => {
        console.error('Hinglish conversion failed:', err);
        setHinglishTranscript(null);
      })
      .finally(() => setIsConverting(false));
  }, [currentLanguageCode, conversationHistory]);

  const handleGenerateInsights = async () => {
    setIsGeneratingInsights(true);
    try {
      const summary = await generateInsightsSummary(assessmentAnswers, conversationHistory);
      setInsightsSummary(summary);
    } catch (error) {
      console.error('Error generating insights:', error);
      setInsightsSummary('Unable to generate insights at this time. Please try again later.');
    }
    setIsGeneratingInsights(false);
  };

  const generatePDF = async () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const maxLineWidth = pageWidth - margin * 2;
    let yPosition = 20;

    // Title
    doc.setFontSize(20);
    doc.text('Jennifer AI Therapy Session Report', margin, yPosition);
    yPosition += 20;

    // Date
    doc.setFontSize(12);
    doc.text(`Session Date: ${new Date().toLocaleDateString()}`, margin, yPosition);
    yPosition += 20;

    // Assessment Results
    doc.setFontSize(16);
    doc.text('Assessment Results', margin, yPosition);
    yPosition += 10;

    doc.setFontSize(11);
    assessmentAnswers.forEach((answer) => {
      if (yPosition > 270) {
        doc.addPage();
        yPosition = 20;
      }

      let questionText = doc.splitTextToSize(`Q: ${answer.question}`, maxLineWidth);
      doc.text(questionText, margin, yPosition);
      yPosition += questionText.length * 6;

      let answerText = doc.splitTextToSize(`A: ${answer.answer}`, maxLineWidth);
      doc.text(answerText, margin, yPosition);
      yPosition += answerText.length * 6 + 8;
    });

    // Transcript
    if (conversationHistory.length > 0) {
      if (yPosition > 230) {
        doc.addPage();
        yPosition = 20;
      }

      doc.setFontSize(16);
      doc.text('Conversation Transcript', margin, yPosition);
      yPosition += 12;

      doc.setFontSize(11);

      if (currentLanguageCode === 'hi') {
        // Ensure we have a Hinglish transcript for PDF
        let pdfTranscript = hinglishTranscript;
        if (!pdfTranscript) {
          try {
            const full = conversationHistory
              .map(m => `${m.role === 'user' ? 'You:' : 'Therapist:'} ${m.content}`)
              .join('\n');
            pdfTranscript = await convertTranscriptToHinglish(full);
          } catch (e) {
            console.error('Hinglish conversion for PDF failed:', e);
          }
        }

        if (pdfTranscript) {
          const lines = pdfTranscript.split(/\r?\n/).map(sanitizeLine);
          for (const line of lines) {
            if (yPosition > 270) {
              doc.addPage();
              yPosition = 20;
            }
            const wrapped = doc.splitTextToSize(line, maxLineWidth);
            doc.text(wrapped, margin, yPosition);
            yPosition += wrapped.length * 6 + 4;
          }
        } else {
          // Fallback to original if conversion not available
          conversationHistory.forEach((message) => {
            if (yPosition > 270) {
              doc.addPage();
              yPosition = 20;
            }
            const speaker = message.role === 'user' ? 'You:' : 'Therapist:';
            const wrappedText = doc.splitTextToSize(sanitizeLine(`${speaker} ${message.content}`), maxLineWidth);
            doc.text(wrappedText, margin, yPosition);
            yPosition += wrappedText.length * 6 + 4;
          });
        }
      } else {
        // Non-Hindi: original per-message transcript
        conversationHistory.forEach((message) => {
          if (yPosition > 270) {
            doc.addPage();
            yPosition = 20;
          }
          const speaker = message.role === 'user' ? 'You:' : 'Therapist:';
          const wrappedText = doc.splitTextToSize(sanitizeLine(`${speaker} ${message.content}`), maxLineWidth);
          doc.text(wrappedText, margin, yPosition);
          yPosition += wrappedText.length * 6 + 4;
        });
      }
    }

    doc.save('jennifer-therapy-session-report.pdf');
  };

  const handleDeleteAndReset = () => {
    clearAssessment();
    navigate('/');
  };

  return (
    <div className="bg-teal-900 min-h-screen flex flex-col items-center lg:p-6 p-2">
      <div className="bg-teal-100 lg:p-6 p-2 rounded-lg shadow-md w-full overflow-hidden max-w-5xl">
        <h1 className="text-2xl font-bold mb-6 text-center text-teal-900">
          {t('results.title')}
        </h1>

        {/* Assessment Results Table */}
        <table className="w-full border-collapse border border-gray-400 mb-6 bg-white/90">
          <thead>
            <tr className="bg-gray-200">
              <th className="border border-gray-400 px-4 py-2 text-left text-sm font-semibold text-teal-900">
                {t('assessment.questions')}
              </th>
              <th className="border border-gray-400 px-4 py-2 text-left text-sm font-semibold text-teal-900">
                {t('results.summary')}
              </th>
            </tr>
          </thead>
          <tbody>
            {assessmentAnswers.map((answer, index) => (
              <tr key={index} className="odd:bg-white even:bg-gray-50">
                <td className="border border-gray-300 px-4 py-2 text-sm text-gray-800 align-top">
                  {answer.question}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-sm text-gray-900 font-medium align-top">
                  {answer.answer}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Generate Insights Button */}
        <div className="text-center mt-25">
          
          
        </div>

        {/* Transcript Section */}
        {conversationHistory.length > 0 && (
          <div className="mt-6 p-4 border-t border-gray-400">
            <h2 className="font-bold text-xl text-teal-900">Transcript</h2>
            <div className="mt-2 max-h-60 overflow-y-auto pr-2 whitespace-pre-wrap text-sm text-gray-800">
              {currentLanguageCode === 'hi' ? (
                // For Hindi: show loader while converting; show Hinglish when ready; otherwise fallback to original
                isConverting ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                ) : (
                  hinglishTranscript !== null ? (
                    <>{hinglishTranscript}</>
                  ) : (
                    <>
                      {conversationHistory.map((message, index) => (
                        <p key={index} className="mt-1">
                          <strong>{message.role === 'user' ? t('you') ?? 'You' : t('therapist') ?? 'Therapist'}:</strong>{' '}
                          {message.content}
                        </p>
                      ))}
                    </>
                  )
                )
              ) : (
                // Non-Hindi: original behavior
                <>
                  {conversationHistory.map((message, index) => (
                    <p key={index} className="mt-1">
                      <strong>{message.role === 'user' ? t('you') ?? 'You' : t('therapist') ?? 'Therapist'}:</strong>{' '}
                      {message.content}
                    </p>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="text-center mt-6 flex flex-col sm:flex-row gap-4 sm:justify-center">
          <button
            onClick={generatePDF}
            className="bg-white px-6 py-2 rounded-lg shadow-md border border-gray-300 hover:bg-gray-100"
          >
            {t('results.export_pdf')}
          </button>
          <button
            onClick={handleDeleteAndReset}
            className="bg-black text-white px-6 py-2 rounded-lg shadow-md hover:bg-gray-800"
          >
            {t('results.start_over')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResultsPage;