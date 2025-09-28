import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGUAGE_CODES, LANGUAGE_NAMES } from '@/i18n/config';

interface LanguageContextType {
  currentLanguage: string;
  currentLanguageCode: string;
  changeLanguage: (language: string) => Promise<void>;
  supportedLanguages: Array<{ code: string; name: string; displayName: string }>;
  isLoading: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

interface LanguageProviderProps {
  children: ReactNode;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
  const { i18n } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  
  // Define supported languages
  const supportedLanguages = [
    { code: 'en', name: 'English', displayName: 'English' },
    { code: 'fr', name: 'French', displayName: 'Français' },
    { code: 'es', name: 'Spanish', displayName: 'Español' },
    { code: 'hi', name: 'Hindi', displayName: 'हिंदी' },
  ];

  const currentLanguageCode = i18n.language || 'en';
  const currentLanguage = LANGUAGE_NAMES[currentLanguageCode] || 'English';

  useEffect(() => {
    // Load saved language from session storage
    const savedLanguage = sessionStorage.getItem('jennifer_language');
    const savedLanguageCode = sessionStorage.getItem('jennifer_language_code');
    
    if (savedLanguageCode && LANGUAGE_CODES[savedLanguageCode]) {
      changeLanguage(savedLanguageCode);
    } else if (savedLanguage && LANGUAGE_CODES[savedLanguage]) {
      changeLanguage(LANGUAGE_CODES[savedLanguage]);
    }
  }, []);

  const changeLanguage = async (languageInput: string): Promise<void> => {
    setIsLoading(true);
    
    try {
      // Convert language name to code if needed
      let languageCode = languageInput;
      if (LANGUAGE_CODES[languageInput]) {
        languageCode = LANGUAGE_CODES[languageInput];
      }
      
      // Validate language code
      if (!supportedLanguages.find(lang => lang.code === languageCode)) {
        console.error('Unsupported language:', languageInput);
        return;
      }

      // Change i18n language
      await i18n.changeLanguage(languageCode);
      
      // Save to session storage
      const languageName = LANGUAGE_NAMES[languageCode];
      sessionStorage.setItem('jennifer_language', languageName);
      sessionStorage.setItem('jennifer_language_code', languageCode);
      
      console.log('Language changed to:', languageName, `(${languageCode})`);
    } catch (error) {
      console.error('Error changing language:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const contextValue: LanguageContextType = {
    currentLanguage,
    currentLanguageCode,
    changeLanguage,
    supportedLanguages,
    isLoading,
  };

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
};
