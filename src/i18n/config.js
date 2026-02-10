import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import it from './locales/it.json';

// Rileva lingua dal browser o localStorage
const getBrowserLanguage = () => {
  const savedLang = localStorage.getItem('appLanguage');
  if (savedLang) return savedLang;
  
  const browserLang = navigator.language.split('-')[0];
  return ['it', 'en'].includes(browserLang) ? browserLang : 'en';
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      it: { translation: it }
    },
    lng: getBrowserLanguage(),
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false // React già fa escape dell'HTML
    },
    react: {
      useSuspense: false
    }
  });

export default i18n;
