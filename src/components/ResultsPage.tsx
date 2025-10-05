import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import jsPDF from 'jspdf';
import { getStoredAssessment, clearAssessment, AssessmentAnswer } from '@/data/assessmentQuestions';
import { ChatMessage, generateInsightsSummary, convertTranscriptToHinglish } from '@/services/api';
import { useLanguage } from '@/contexts/LanguageContext';

const ResultsPage = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { currentLanguageCode } = useLanguage();
  const [assessmentAnswers, setAssessmentAnswers] = useState<AssessmentAnswer[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ChatMessage[]>([]);
  const [insightsSummary, setInsightsSummary] = useState<string>('');
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);
  const [hinglishTranscript, setHinglishTranscript] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [displayMode, setDisplayMode] = useState<'devanagari' | 'hinglish'>('devanagari');
  const [devanagariTranscript, setDevanagariTranscript] = useState<string>('');
  const devanagariFontLoadedRef = useRef<boolean>(false);

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

  // Build Devanagari transcript string for display/PDF and reset toggle when Hindi changes or history updates
  useEffect(() => {
    if (currentLanguageCode === 'hi' && conversationHistory.length > 0) {
      // Build transcript with localized labels for on-screen Devanagari display
      const localizedYou = t('you') ?? 'You';
      const localizedTherapist = t('therapist') ?? 'Therapist';
      const dev = conversationHistory
        .map(m => `${m.role === 'user' ? localizedYou : localizedTherapist}: ${m.content}`)
        .join('\n');
      setDevanagariTranscript(dev);
      // Reset to Devanagari view by default when language/history changes
      setDisplayMode('devanagari');
    }
    if (currentLanguageCode !== 'hi') {
      // Clear Hindi-specific state when leaving Hindi
      setDisplayMode('devanagari');
      setHinglishTranscript(null);
      setDevanagariTranscript('');
    }
  }, [currentLanguageCode, conversationHistory, t]);

  // Helper: build canonical English-label transcript for API
  const buildEnglishLabelTranscript = (): string => {
    return conversationHistory
      .map(m => `${m.role === 'user' ? 'You:' : 'Therapist:'} ${m.content}`)
      .join('\n');
  };

  // Toggle transcript between Devanagari and Hinglish (Hindi only)
  const handleToggleTranscript = async () => {
    if (currentLanguageCode !== 'hi') return;
    if (displayMode === 'devanagari') {
      // Switch to Hinglish: fetch once if not cached
      if (!hinglishTranscript) {
        try {
          setIsTranslating(true);
          const full = buildEnglishLabelTranscript();
          const converted = await convertTranscriptToHinglish(full);
          setHinglishTranscript(converted);
        } catch (err) {
          console.error('Hinglish conversion failed:', err);
          return; // stay in Devanagari on failure
        } finally {
          setIsTranslating(false);
        }
      }
      setDisplayMode('hinglish');
    } else {
      // Switch back to Devanagari without API
      setDisplayMode('devanagari');
    }
  };

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

  // Ensure a Devanagari-capable font is available in jsPDF; attempt local then multiple CDNs
  const ensureDevanagariFont = async (doc: jsPDF) => {
    if (devanagariFontLoadedRef.current) return;
    const candidates: Array<{ url: string; vfsName: string; family: string }> = [
      // Local preferred
      { url: '/fonts/NotoSansDevanagari-Regular.ttf', vfsName: 'NotoSansDevanagari-Regular.ttf', family: 'NotoSansDevanagari' },
      { url: '/fonts/Hind-Regular.ttf', vfsName: 'Hind-Regular.ttf', family: 'Hind' },
      // Raw GitHub (often CORS-allowed)
      { url: 'https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf', vfsName: 'NotoSansDevanagari-Regular.ttf', family: 'NotoSansDevanagari' },
      { url: 'https://raw.githubusercontent.com/itfoundry/hind/master/fonts/ttf/Hind-Regular.ttf', vfsName: 'Hind-Regular.ttf', family: 'Hind' },
    ];
    for (const cand of candidates) {
      try {
        const res = await fetch(cand.url, { mode: 'cors' });
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        // Convert to base64 via DataURL for safety
        const dataUrl: string = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(new Blob([buf], { type: 'font/ttf' }));
        });
        const b64 = dataUrl.split(',')[1];
        // Register font with jsPDF
        doc.addFileToVFS(cand.vfsName, b64);
        doc.addFont(cand.vfsName, cand.family, 'normal');
        // Use this family name consistently when setting the font
        devanagariFontLoadedRef.current = true;
        return;
      } catch (e) {
        console.warn('Failed to load Devanagari font from', cand.url, e);
      }
    }
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
        if (displayMode === 'hinglish') {
          // Use current Hinglish view
          let pdfTranscript = hinglishTranscript;
          if (!pdfTranscript) {
            // As a last resort, try converting now
            try {
              pdfTranscript = await convertTranscriptToHinglish(buildEnglishLabelTranscript());
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
          }
        } else {
          // Devanagari view: ensure Unicode-capable font is loaded
          await ensureDevanagariFont(doc);
          if (devanagariFontLoadedRef.current) {
            // Try both commonly loaded families in case of fallback registration
            try { doc.setFont('NotoSansDevanagari', 'normal'); } catch { try { doc.setFont('Hind', 'normal'); } catch {}
            }
            const lines = devanagariTranscript.split(/\r?\n/).map(sanitizeLine);
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
            // Fallback: render Devanagari via canvas to ensure proper glyph shaping and decoding
            const renderDevanagariTranscriptAsImages = async () => {
              const pageHeight = doc.internal.pageSize.getHeight();
              const pxPerMm = 96 / 25.4; // approximate CSS px per mm at 96 DPI
              const contentWidthMm = pageWidth - margin * 2;
              const contentWidthPx = Math.round(contentWidthMm * pxPerMm);
              const contentHeightMm = pageHeight - margin * 2;
              const contentHeightPx = Math.round(contentHeightMm * pxPerMm);

              // Word wrap helper respecting spaces; fallback to character wrap if no spaces
              const wrapText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
                const words = text.split(/\s+/);
                const lines: string[] = [];
                if (words.length === 0) return lines;
                let line = words[0] || '';
                for (let i = 1; i < words.length; i++) {
                  const testLine = line + ' ' + words[i];
                  if (ctx.measureText(testLine).width <= maxWidth) {
                    line = testLine;
                  } else {
                    // If a single word is longer than maxWidth, break by characters
                    if (ctx.measureText(words[i]).width > maxWidth) {
                      lines.push(line);
                      let remainder = words[i];
                      while (ctx.measureText(remainder).width > maxWidth && remainder.length > 0) {
                        let cut = 1;
                        while (cut < remainder.length && ctx.measureText(remainder.slice(0, cut)).width <= maxWidth) {
                          cut++;
                        }
                        lines.push(remainder.slice(0, cut - 1));
                        remainder = remainder.slice(cut - 1);
                      }
                      line = remainder;
                    } else {
                      lines.push(line);
                      line = words[i];
                    }
                  }
                }
                lines.push(line);
                return lines;
              };

              // Prepare transcript lines
              const rawLines = devanagariTranscript.split(/\r?\n/).map(sanitizeLine);
              const fontPx = 16;
              const lineHeightPx = Math.round(fontPx * 1.4);
              const fontFamily = 'Noto Sans Devanagari, Mangal, Nirmala UI, Devanagari Sangam MN, sans-serif';

              // Start transcript on a fresh page to avoid overlap with previous content block
              doc.addPage();

              let yPx = 0;
              let canvas = document.createElement('canvas');
              canvas.width = contentWidthPx;
              canvas.height = contentHeightPx;
              let ctx = canvas.getContext('2d');
              if (!ctx) return;
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.fillStyle = '#000000';
              ctx.font = `${fontPx}px ${fontFamily}`;
              ctx.textBaseline = 'top';

              const flushPage = () => {
                const dataUrl = canvas.toDataURL('image/png');
                const imgHeightMm = canvas.height / pxPerMm;
                doc.addImage(dataUrl, 'PNG', margin, margin, contentWidthMm, imgHeightMm);
                // Prepare next page canvas
                doc.addPage();
                canvas = document.createElement('canvas');
                canvas.width = contentWidthPx;
                canvas.height = contentHeightPx;
                ctx = canvas.getContext('2d');
                if (!ctx) return;
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#000000';
                ctx.font = `${fontPx}px ${fontFamily}`;
                ctx.textBaseline = 'top';
                yPx = 0;
              };

              for (const raw of rawLines) {
                const wrapped = wrapText(ctx, raw, contentWidthPx);
                for (const ln of wrapped) {
                  if (yPx + lineHeightPx > contentHeightPx) {
                    flushPage();
                  }
                  ctx.fillText(ln, 0, yPx);
                  yPx += lineHeightPx;
                }
                // Add a small gap between transcript lines
                yPx += Math.round(lineHeightPx * 0.2);
              }
              // Flush the last partial page without adding an extra blank page
              if (yPx > 0) {
                const usedHeightPx = Math.max(yPx, 1);
                const finalCanvas = document.createElement('canvas');
                finalCanvas.width = contentWidthPx;
                finalCanvas.height = usedHeightPx;
                const fctx = finalCanvas.getContext('2d');
                if (!fctx || !ctx) return;
                fctx.fillStyle = '#ffffff';
                fctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
                fctx.drawImage(canvas, 0, 0, contentWidthPx, usedHeightPx, 0, 0, contentWidthPx, usedHeightPx);
                const dataUrl = finalCanvas.toDataURL('image/png');
                const imgHeightMm = finalCanvas.height / pxPerMm;
                doc.addImage(dataUrl, 'PNG', margin, margin, contentWidthMm, imgHeightMm);
              }
            };

            console.warn('Falling back to canvas-based rendering for Devanagari PDF transcript.');
            await renderDevanagariTranscriptAsImages();
          }
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
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-xl text-teal-900">Transcript</h2>
              {currentLanguageCode === 'hi' && (
                <button
                  onClick={handleToggleTranscript}
                  disabled={isTranslating}
                  className="bg-white px-3 py-1.5 rounded-md shadow-sm border border-gray-300 hover:bg-gray-100 text-sm"
                >
                  {isTranslating
                    ? 'Translating…'
                    : displayMode === 'devanagari'
                      ? 'Translate to Hinglish'
                      : 'Translate to Devanagari'}
                </button>
              )}
            </div>
            <div className="mt-2 max-h-60 overflow-y-auto pr-2 whitespace-pre-wrap text-sm text-gray-800">
              {currentLanguageCode === 'hi' ? (
                displayMode === 'hinglish' ? (
                  <>{hinglishTranscript ?? ''}</>
                ) : (
                  <>{devanagariTranscript}</>
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