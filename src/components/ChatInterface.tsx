import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Pause, Globe, ChevronDown } from 'lucide-react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import { useTranslation } from 'react-i18next';
import { getChatResponse, ChatMessage } from '@/services/api';
import { getStoredAssessment } from '@/data/assessmentQuestions';
import { getEmergencyNumber } from '@/data/emergencyNumbers';
import { useLanguage } from '@/contexts/LanguageContext';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem } from '@/components/ui/dropdown-menu';

const ChatInterface = () => {
  const navigate = useNavigate();
  const [isRecording, setIsRecording] = useState(false);
  const [conversationHistory, setConversationHistory] = useState<ChatMessage[]>([]);
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const [language, setLanguage] = useState('English');
  const [isFirstMessage, setIsFirstMessage] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState<string>('en-US');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioElementsRef = useRef<{ [key: string]: HTMLAudioElement }>({});

  const { t } = useTranslation();
  const { changeLanguage, supportedLanguages, currentLanguage } = useLanguage();

  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition
  } = useSpeechRecognition();

  // Language detection mapping
  const languageMap = {
    'English': 'en-US',
    'French': 'fr-FR', 
    'Spanish': 'es-ES',
    'Hindi': 'hi-IN'
  };

  const detectLanguageFromText = (text: string): string => {
    // Simple language detection based on common words/patterns
    const englishWords = /\b(the|and|is|in|to|of|a|that|it|with|for|as|was|on|are|you|this|be|at|by|not|or|from|they|we|have|an|had|but|what|can|said|there|use|your|how|our|out|if|up|time|them)\b/gi;
    const frenchWords = /\b(le|la|et|de|un|une|est|dans|pour|que|avec|sur|par|sont|vous|ce|être|à|ne|se|il|elle|nous|tout|mais|plus|même|leur|bien|où|comme)\b/gi;
    const spanishWords = /\b(el|la|de|que|y|a|en|un|es|se|no|te|lo|le|da|su|por|son|con|para|al|del|los|las|me|muy|todo|pero|más|hacer|uno|sobre|mi|antes|tanto)\b/gi;
    const hindiWords = /[\u0900-\u097F]+/g; // Devanagari script

    const englishMatches = (text.match(englishWords) || []).length;
    const frenchMatches = (text.match(frenchWords) || []).length;
    const spanishMatches = (text.match(spanishWords) || []).length;
    const hindiMatches = (text.match(hindiWords) || []).length;

    const maxMatches = Math.max(englishMatches, frenchMatches, spanishMatches, hindiMatches);
    
    if (hindiMatches === maxMatches && hindiMatches > 0) return 'hi-IN';
    if (frenchMatches === maxMatches && frenchMatches > 0) return 'fr-FR';
    if (spanishMatches === maxMatches && spanishMatches > 0) return 'es-ES';
    return 'en-US'; // Default to English
  };

  useEffect(() => {
    // Load language from session storage
    const storedLanguage = sessionStorage.getItem('jennifer_language') || 'English';
    setLanguage(storedLanguage);
    setDetectedLanguage(languageMap[storedLanguage as keyof typeof languageMap] || 'en-US');

    // Load conversation history
    const storedConversation = sessionStorage.getItem('jennifer_conversation');
    if (storedConversation) {
      setConversationHistory(JSON.parse(storedConversation));
      setIsFirstMessage(false);
    } else {
      // Make initial API call
      handleInitialMessage();
    }
  }, []);

  const handleInitialMessage = async () => {
    setIsLoading(true);
    try {
      const assessmentAnswers = getStoredAssessment();
      const response = await getChatResponse({
        FirstMessage: true,
        assessment_question_answers: assessmentAnswers,
        language: currentLanguage
      });

      const newMessage: ChatMessage = {
        role: 'assistant',
        content: response.text,
        timestamp: new Date(),
        audioData: response.audioData,
        messageId: `msg_${Date.now()}`
      };
      
      const updatedHistory = [newMessage];
      setConversationHistory(updatedHistory);
      sessionStorage.setItem('jennifer_conversation', JSON.stringify(updatedHistory));
      setIsFirstMessage(false);
    } catch (error) {
      console.error('Error getting initial message:', error);
      // Fallback welcome message
      const fallbackMessage: ChatMessage = {
        role: 'assistant',
        content: t('chat.messages.welcome'),
        timestamp: new Date(),
        messageId: `msg_${Date.now()}`
      };
      setConversationHistory([fallbackMessage]);
    }
    setIsLoading(false);
  };

  const startRecording = async () => {
    if (!browserSupportsSpeechRecognition) {
      alert('Browser does not support speech recognition.');
      return;
    }

    try {
      // Start audio recording for playback
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        }
      });
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start(1000);

      // Start speech recognition with multi-language support
      resetTranscript();
      
      // Try different languages for detection
      const languagesToTry = ['en-US', 'fr-FR', 'es-ES', 'hi-IN'];
      
      SpeechRecognition.startListening({
        continuous: true,
        language: detectedLanguage,
        interimResults: true
      });

      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Error accessing microphone. Please check your permissions.');
    }
  };

  const stopRecording = async () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      SpeechRecognition.stopListening();

      // Wait a moment for final transcript
      setTimeout(async () => {
        if (transcript && transcript.trim()) {
          // Detect language from transcript
          const detectedLang = detectLanguageFromText(transcript);
          setDetectedLanguage(detectedLang);
          
          // Create audio blob for user message
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm;codecs=opus' });
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            const base64Audio = reader.result as string;
            await sendMessage(transcript, base64Audio, detectedLang);
          };
        } else {
          console.warn('No transcript available');
        }
      }, 500);
    }
  };

  const sendMessage = async (messageText: string, audioData?: string, detectedLang?: string) => {
    setIsLoading(true);
    
    const userMessage: ChatMessage = {
      role: 'user',
      content: messageText,
      timestamp: new Date(),
      audioData: audioData,
      messageId: `msg_${Date.now()}_user`,
      detectedLanguage: detectedLang
    };

    const updatedHistory = [...conversationHistory, userMessage];
    setConversationHistory(updatedHistory);

    try {
      const assessmentAnswers = getStoredAssessment();
      const response = await getChatResponse({
        FirstMessage: false,
        assessment_question_answers: assessmentAnswers,
        language: currentLanguage,
        Transcript: messageText,
        ConversationHistory: updatedHistory.slice(-5), // Last 5 messages
        DetectedLanguage: detectedLang
      });

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.text,
        timestamp: new Date(),
        audioData: response.audioData,
        messageId: `msg_${Date.now()}_assistant`
      };
      
      const finalHistory = [...updatedHistory, assistantMessage];
      setConversationHistory(finalHistory);
      sessionStorage.setItem('jennifer_conversation', JSON.stringify(finalHistory));
    } catch (error) {
      console.error('Error sending message:', error);
    }
    
    setIsLoading(false);
    resetTranscript();
  };

  const playAudio = async (messageId: string, audioData: string) => {
    // Stop any currently playing audio
    Object.values(audioElementsRef.current).forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
    setCurrentPlayingId(null);

    if (!audioData) return;

    try {
      let audioElement = audioElementsRef.current[messageId];

      if (!audioElement) {
        audioElement = new Audio();
        audioElementsRef.current[messageId] = audioElement;

        // Detect correct MIME type (default to mp3 if coming from backend)
        let audioUrl: string;
        if (audioData.startsWith("data:")) {
          audioUrl = audioData; // already has MIME type
        } else {
          audioUrl = `data:audio/mp3;base64,${audioData}`;
        }

        audioElement.src = audioUrl;

        audioElement.onended = () => {
          setCurrentPlayingId(null);
        };

        audioElement.onerror = (err) => {
          console.error("Error playing audio", err);
          setCurrentPlayingId(null);
        };
      }

      setCurrentPlayingId(messageId);
      await audioElement.play();
    } catch (error) {
      console.error("Error playing audio:", error);
      setCurrentPlayingId(null);
    }
  };

  const pauseAudio = (messageId: string) => {
    const audioElement = audioElementsRef.current[messageId];
    if (audioElement) {
      audioElement.pause();
    }
    setCurrentPlayingId(null);
  };

  const handleEndCall = () => {
    // Stop recording if active
    if (isRecording) {
      SpeechRecognition.stopListening();
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
    }
    
    // Stop any playing audio
    Object.values(audioElementsRef.current).forEach(audio => {
      audio.pause();
    });
    navigate('/results');
  };

  const handleLanguageChange = async (newLanguage: string) => {
    setLanguage(newLanguage);
    setDetectedLanguage(languageMap[newLanguage as keyof typeof languageMap] || 'en-US');
    sessionStorage.setItem('jennifer_language', newLanguage);
    await changeLanguage(newLanguage);
  };

  // Enhanced audio waveform visualization
  const AudioWaveform = ({ isPlaying }: { isPlaying: boolean }) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const rafRef = useRef<number | null>(null);
    const barCount = 32; // More bars for smoother look
    const barsRef = useRef<HTMLDivElement[]>([]);
    const phaseRef = useRef(0);

    useEffect(() => {
      const animate = () => {
        const phase = phaseRef.current;
        const speed = 0.08; // base speed of waveform travel
        phaseRef.current = phase + speed;
        const baseAmplitude = 22; // max height delta
        const minHeight = 4; // baseline height
        barsRef.current.forEach((bar, i) => {
          if (!bar) return;
          // Create a traveling sine wave + layered noise for realism
            const progress = (i / barCount) * Math.PI * 2;
            const sine = Math.sin(progress + phase) * 0.6 + Math.sin(progress * 2 + phase * 1.3) * 0.3;
            const noise = (Math.random() - 0.5) * 0.4; // subtle randomness
            const intensity = Math.max(0, Math.min(1, (sine + noise + 1) / 2));
            const targetHeight = isPlaying
              ? minHeight + intensity * baseAmplitude
              : minHeight + Math.sin(progress) * 2; // gentle idle breathing
            const current = parseFloat(bar.dataset.h || '0');
            const eased = current + (targetHeight - current) * 0.25; // smoothing
            bar.style.height = `${eased}px`;
            bar.dataset.h = `${eased}`;
            const opacity = 0.35 + intensity * 0.65;
            bar.style.opacity = `${opacity}`;
        });
        if (isPlaying || phaseRef.current % (Math.PI * 2) < 1000) {
          rafRef.current = requestAnimationFrame(animate);
        }
      };

      if (!containerRef.current) return;
      // Initialize bars if not already
      if (barsRef.current.length === 0) {
        barsRef.current = Array.from(containerRef.current.querySelectorAll('[data-bar="true"]')) as HTMLDivElement[];
      }

      // Kick off animation
      rafRef.current = requestAnimationFrame(animate);
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }, [isPlaying]);

    return (
      <div ref={containerRef} className="flex items-end justify-center h-10 gap-[3px] select-none" aria-label={isPlaying ? 'Audio playing' : 'Audio paused'}>
        {Array.from({ length: barCount }).map((_, i) => {
          const mirrorIndex = i < barCount / 2 ? i : barCount - i - 1;
          const gradientOffset = (mirrorIndex / (barCount / 2));
          // Interpolate between theme greens/teals
          const startColor = '#1fa67a';
          const endColor = '#20b2aa';
          const r1 = parseInt(startColor.slice(1,3),16), g1 = parseInt(startColor.slice(3,5),16), b1 = parseInt(startColor.slice(5,7),16);
          const r2 = parseInt(endColor.slice(1,3),16), g2 = parseInt(endColor.slice(3,5),16), b2 = parseInt(endColor.slice(5,7),16);
          const r = Math.round(r1 + (r2 - r1) * gradientOffset);
          const g = Math.round(g1 + (g2 - g1) * gradientOffset);
          const b = Math.round(b1 + (b2 - b1) * gradientOffset);
          const color = `rgb(${r} ${g} ${b})`;
          return (
            <div
              key={i}
              data-bar="true"
              data-h="6"
              className="w-[4px] rounded-sm transition-[height] duration-150 ease-out bg-gradient-to-b from-white/70 to-white/10 shadow-[0_0_6px_-1px_rgba(255,255,255,0.4)]"
              style={{
                background: `linear-gradient(to top, rgba(${r},${g},${b},0.15), rgba(${r},${g},${b},0.9))`,
                height: '6px'
              }}
            />
          );
        })}
      </div>
    );
  };

  // Get emergency number based on user's location from assessment
  const userLocation = getStoredAssessment().find(a => a.questionId === 10)?.answer || 'United States';
  const emergencyNumber = getEmergencyNumber(userLocation);

  if (!browserSupportsSpeechRecognition) {
    return (
      <div className="min-h-screen jennifer-gradient flex items-center justify-center">
        <div className="text-white text-center">
          <h2 className="text-2xl mb-4">{t('errors.not_found')}</h2>
          <p>{t('chat.messages.speech_not_supported')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen flex justify-center items-center overflow-hidden">
      {/* Chat Window */}
      <div className="absolute w-full max-w-[640px] h-[calc(100vh-100px)] max-h-[calc(100vh-100px)] z-[2] flex flex-col justify-center p-4 md:p-0">
        <div className="flex flex-col h-full">
          
          {/* Language Menu Bar */}
          <div className="z-[3] bg-black/80 relative w-full h-[40px] flex items-center px-4 justify-center">
            <div className="relative">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 text-white text-[12px] font-semibold">
                    <Globe size={16} />
                    {currentLanguage}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="absolute top-[30px] left-0 bg-black/90 w-[120px] rounded-lg overflow-hidden z-10">
                  {supportedLanguages.map((lang) => (
                    <DropdownMenuItem
                      key={lang.code}
                      onClick={() => handleLanguageChange(lang.name)}
                      className={`w-full text-left px-3 py-2 text-[12px] ${
                        currentLanguage === lang.name
                          ? 'bg-[#248A52] text-white'
                          : 'text-white hover:bg-gray-700'
                      }`}
                    >
                      {lang.displayName}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Header */}
          <div className="z-[2] bg-black/60 relative flex-0 w-full h-[45px] flex items-center px-4 justify-between">
            <div className="flex items-center gap-2">
              <img
                src="/jennifer.png"
                alt="Jennifer AI Therapist"
                className="w-[35px] h-[35px] rounded-full"
              />
              <div>
                <div className="text-[12px] font-semibold text-white font-sans">
                  JENNIFER
                </div>
                <div className="text-[#FFFFFF80] font-semibold text-[10px] font-sans">
                  AI THERAPIST
                </div>
              </div>
            </div>
            <button
              className="bg-red-500 text-[10px] rounded-lg h-[22px] w-[63px] text-white"
              onClick={handleEndCall}
            >
              {t('common.close')}
            </button>
          </div>

          {/* Messages Container */}
          <div className="z-[2] bg-black/40 w-full flex-1 overflow-y-auto scroll-container py-4">
            <div className="space-y-4">
              {conversationHistory.map((message, index) => (
                <div
                  key={message.messageId || index}
                  className={`w-full lg:max-w-[460px] max-w-[300px] mx-auto ${
                    message.role === 'assistant'
                      ? 'ml-4 bg-black/40'
                      : 'ml-auto lg:ml-[10rem] bg-gradient-to-br from-[#248A52] to-[#257287]'
                  } rounded-lg p-4 flex flex-col`}
                >
                  <div className="text-white text-sm">{message.content}</div>

                  {/* Audio player */}
                  {message.audioData && (
                    <div className="mt-3 flex items-center gap-3">
                      <button
                        onClick={() =>
                          currentPlayingId === message.messageId
                            ? pauseAudio(message.messageId!)
                            : playAudio(message.messageId!, message.audioData!)
                        }
                        className={`w-[55px] h-[55px] rounded-full border-white border-[2px] text-[30px] transition-colors duration-300 ${
                          currentPlayingId === message.messageId
                            ? 'bg-[greenyellow]'
                            : 'bg-[#20b2aa]'
                        }`}
                      >
                        {currentPlayingId === message.messageId ? (
                          <Pause size={24} className="mx-auto text-black" />
                        ) : (
                          <Play size={24} className="mx-auto text-white" />
                        )}
                      </button>
                      <div className="flex-1">
                        <AudioWaveform
                          isPlaying={currentPlayingId === message.messageId}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="w-full lg:max-w-[460px] max-w-[300px] mx-auto ml-4 bg-black/40 rounded-lg p-4 text-white">
                  {t('chat.ui.thinking')}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="z-[2] bg-black/60 h-[46px] w-full flex justify-between items-center px-4">
            <span className="text-[#ffffffb3] text-[11px]">
              {t('chat.ui.start_recording') || 'Record your message'}
            </span>
            {!isRecording ? (
              <button
                className="bg-[#248a52] text-[10px] rounded-lg h-[22px] w-[63px] text-white"
                onClick={startRecording}
                disabled={isLoading}
              >
                RECORD
              </button>
            ) : (
              <button
                className="bg-[#248a52] text-[10px] rounded-lg h-[22px] w-[63px] text-white"
                onClick={stopRecording}
              >
                STOP
              </button>
            )}
          </div>
        </div>

        {/* Footer Disclaimer */}
        <div className="p-4 text-center text-white/80 text-xs">
          ⚠️ {t('chat.ui.disclaimer')} {emergencyNumber} {t('chat.ui.immediately')}
        </div>
      </div>


      {/* Blurred Background */}
      <div className="fixed top-0 left-0 w-full h-full z-[1] bg-[url('https://images.unsplash.com/photo-1451186859696-371d9477be93?crop=entropy&fit=crop&fm=jpg&h=975&ixlib=rb-0.3.5&q=80&w=1925')] bg-no-repeat bg-cover blur-[80px] scale-[1.2]"></div>
    </div>
  );
};

export default ChatInterface;