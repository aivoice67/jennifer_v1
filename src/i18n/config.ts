import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation resources
import en from './locales/en.json';
import fr from './locales/fr.json';
import es from './locales/es.json';
import hi from './locales/hi.json';

const resources = {
  en: { translation: en },
  fr: { translation: fr },
  es: { translation: es },
  hi: { translation: hi },
};

// Language code mapping for different representations
export const LANGUAGE_CODES: Record<string, string> = {
  'English': 'en',
  'French': 'fr',
  'Spanish': 'es',
  'Hindi': 'hi',
  'en': 'en',
  'fr': 'fr',
  'es': 'es',
  'hi': 'hi',
};

// Reverse mapping for display names
export const LANGUAGE_NAMES: Record<string, string> = {
  'en': 'English',
  'fr': 'French',
  'es': 'Spanish',
  'hi': 'Hindi',
};

export const SUPPORTED_LANGUAGES = ['en', 'fr', 'es', 'hi'];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    debug: process.env.NODE_ENV === 'development',
    
    detection: {
      order: ['sessionStorage', 'localStorage', 'navigator'],
      lookupSessionStorage: 'jennifer_language_code',
      lookupLocalStorage: 'jennifer_language_code',
      caches: ['sessionStorage', 'localStorage'],
    },

    interpolation: {
      escapeValue: false, // React already escapes values
    },
  });

export default i18n;
