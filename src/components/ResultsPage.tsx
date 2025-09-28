import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import jsPDF from 'jspdf';
import { getStoredAssessment, clearAssessment, AssessmentAnswer } from '@/data/assessmentQuestions';
import { ChatMessage, generateInsightsSummary } from '@/services/api';

const ResultsPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [assessmentAnswers, setAssessmentAnswers] = useState<AssessmentAnswer[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ChatMessage[]>([]);
  const [insightsSummary, setInsightsSummary] = useState<string>('');
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);

  useEffect(() => {
    // Load data from session storage
    const assessment = getStoredAssessment();
    setAssessmentAnswers(assessment);

    const conversation = sessionStorage.getItem('jennifer_conversation');
    if (conversation) {
      setConversationHistory(JSON.parse(conversation));
    }
  }, []);

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

  const generatePDF = () => {
    const doc = new jsPDF();
    let yPosition = 20;
    
    // Title
    doc.setFontSize(20);
    doc.text('Jennifer AI Therapy Session Report', 20, yPosition);
    yPosition += 20;
    
    // Date
    doc.setFontSize(12);
    doc.text(`Session Date: ${new Date().toLocaleDateString()}`, 20, yPosition);
    yPosition += 20;
    
    // Assessment Results
    doc.setFontSize(16);
    doc.text('Assessment Results', 20, yPosition);
    yPosition += 10;
    
    doc.setFontSize(10);
    assessmentAnswers.forEach((answer) => {
      if (yPosition > 250) {
        doc.addPage();
        yPosition = 20;
      }
      
      doc.text(`Q: ${answer.question}`, 20, yPosition);
      yPosition += 7;
      doc.text(`A: ${answer.answer}`, 20, yPosition);
      yPosition += 15;
    });
    
    // Insights Summary
    if (insightsSummary) {
      if (yPosition > 200) {
        doc.addPage();
        yPosition = 20;
      }
      
      doc.setFontSize(16);
      doc.text('Insights Summary', 20, yPosition);
      yPosition += 10;
      
      doc.setFontSize(10);
      const splitSummary = doc.splitTextToSize(insightsSummary, 170);
      doc.text(splitSummary, 20, yPosition);
      yPosition += splitSummary.length * 7 + 20;
    }
    
    // Transcript
    if (conversationHistory.length > 0) {
      if (yPosition > 200) {
        doc.addPage();
        yPosition = 20;
      }
      
      doc.setFontSize(16);
      doc.text('Conversation Transcript', 20, yPosition);
      yPosition += 10;
      
      doc.setFontSize(10);
      conversationHistory.forEach((message) => {
        if (yPosition > 250) {
          doc.addPage();
          yPosition = 20;
        }
        
        const speaker = message.role === 'user' ? 'You:' : 'Therapist:';
        doc.text(`${speaker} ${message.content}`, 20, yPosition);
        yPosition += 10;
      });
    }
    
    doc.save('jennifer-therapy-session-report.pdf');
  };

  const handleDeleteAndReset = () => {
    clearAssessment();
    navigate('/');
  };

  return (
    <div className="min-h-screen jennifer-gradient p-4">
      <div className="max-w-4xl mx-auto">
        <div className="assessment-card">
          <h1 className="text-3xl font-bold text-center mb-8 text-card-foreground">
            {t('results.title')}
          </h1>
          
          {/* Assessment Results Table */}
          <div className="mb-8">
            <div className="bg-white/80 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('assessment.questions')}</th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">{t('results.summary')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {assessmentAnswers.map((answer, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 text-sm text-gray-900">{answer.question}</td>
                      <td className="px-6 py-4 text-sm text-gray-900 font-medium">{answer.answer}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Generate Insights Button */}
          <div className="text-center mb-8">
            <button
              onClick={handleGenerateInsights}
              disabled={isGeneratingInsights}
              className="choice-button selected"
            >
              {isGeneratingInsights ? t('common.loading') : t('results.recommendations')}
            </button>
          </div>

          {/* Insights Summary */}
          {insightsSummary && (
            <div className="mb-8">
              <h3 className="text-xl font-semibold mb-4">{t('results.summary')}</h3>
              <div className="bg-white/80 rounded-lg p-6">
                <p className="text-gray-700 leading-relaxed">{insightsSummary}</p>
              </div>
            </div>
          )}

          {/* Transcript Section */}
          {conversationHistory.length > 0 && (
            <div className="mb-8">
              <h3 className="text-xl font-semibold mb-4">Transcript</h3>
              <div className="bg-white/80 rounded-lg p-6 max-h-60 overflow-y-auto">
                {conversationHistory.map((message, index) => (
                  <div key={index} className="mb-4">
                    <div className="font-semibold text-gray-700">
                      {message.role === 'user' ? 'You:' : 'Therapist:'}
                    </div>
                    <div className="text-gray-600 ml-4">{message.content}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-center space-x-4">
            <button
              onClick={generatePDF}
              className="choice-button selected"
            >
              {t('results.export_pdf')}
            </button>
            
            <button
              onClick={handleDeleteAndReset}
              className="px-6 py-3 rounded-2xl bg-gray-900 text-white font-medium hover:bg-gray-800 transition-colors"
            >
              {t('results.start_over')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResultsPage;