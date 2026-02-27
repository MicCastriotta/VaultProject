import { useTranslation } from 'react-i18next';
import { Globe } from 'lucide-react';

export function LanguageSelector() {
  const { i18n, t } = useTranslation();

  const languages = [
    { code: 'en', name: 'English', flag: '🇬🇧' },
    { code: 'it', name: 'Italiano', flag: '🇮🇹' }
  ];

  const handleLanguageChange = (langCode) => {
    i18n.changeLanguage(langCode);
    localStorage.setItem('appLanguage', langCode);
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
      <div className="p-4 border-b border-slate-700">
        <h2 className="font-semibold text-gray-200 flex items-center gap-2">
          <Globe size={20} />
          {t('settings.language')}
        </h2>
      </div>
      <div className="p-4">
        <p className="text-sm text-gray-400 mb-3">
          {t('settings.selectLanguage')}
        </p>
        <select
          value={i18n.language}
          onChange={(e) => handleLanguageChange(e.target.value)}
          className="w-full px-3 py-3 bg-slate-900/60 border border-slate-700 rounded-lg text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {languages.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.flag} {lang.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
