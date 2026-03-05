/**
 * Privacy Policy & Disclaimer
 * Pagina standalone (no auth), aperta in nuovo tab dal footer di Login/Signup
 */

import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';

export function PrivacyPage() {
    const { t } = useTranslation();

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-12">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-3 mb-10">
                    <div className="w-10 h-10 bg-gradient-to-br from-brand to-blue-500 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Lock className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <span className="text-xs text-gray-500 font-medium tracking-wide uppercase">OwnVault</span>
                        <h1 className="text-2xl font-bold text-white leading-tight">{t('privacy.title')}</h1>
                    </div>
                </div>

                {/* Content */}
                <div className="glass rounded-3xl p-8 border border-slate-800 shadow-2xl space-y-6 text-gray-300 text-sm leading-relaxed">
                    <p>{t('privacy.intro')}</p>
                    <p>{t('privacy.storage')}</p>
                    <p>{t('privacy.noTracking')}</p>

                    <div>
                        <p className="mb-3">{t('privacy.thirdPartiesIntro')}</p>
                        <ul className="list-disc list-outside ml-5 space-y-2 text-gray-400">
                            <li>{t('privacy.hibp')}</li>
                            <li>{t('privacy.gdrive')}</li>
                        </ul>
                    </div>

                    <p>{t('privacy.userControl')}</p>

                    <p className="text-gray-400 italic">{t('privacy.disclaimer')}</p>

                    <p className="border-t border-slate-700 pt-6 text-gray-400">{t('privacy.acceptance')}</p>
                </div>
            </div>
        </div>
    );
}
