/**
 * TutorialPage
 * Shown only on first launch (before master password is created).
 * Carousel of 3 slides explaining the app's key features.
 */

import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, ShieldCheck, UploadCloud, Share2, ChevronRight } from 'lucide-react';

const SLIDES = [
    { icon: Lock, iconColor: 'from-blue-500 to-brand', titleKey: 'tutorial.masterPassword.title', descKey: 'tutorial.masterPassword.description' },
    { icon: ShieldCheck, iconColor: 'from-green-500 to-emerald-400', titleKey: 'tutorial.zeroKnowledge.title', descKey: 'tutorial.zeroKnowledge.description' },
    { icon: UploadCloud, iconColor: 'from-purple-500 to-indigo-400', titleKey: 'tutorial.backupRestore.title', descKey: 'tutorial.backupRestore.description' },
    { icon: Share2, iconColor: 'from-pink-500 to-rose-400', titleKey: 'tutorial.secureSharing.title', descKey: 'tutorial.secureSharing.description' },
];

export function TutorialPage({ onDone }) {
    const { t } = useTranslation();
    const [current, setCurrent] = useState(0);

    // Touch / swipe state
    const touchStartX = useRef(null);

    function handleTouchStart(e) {
        touchStartX.current = e.touches[0].clientX;
    }

    function handleTouchEnd(e) {
        if (touchStartX.current === null) return;
        const delta = e.changedTouches[0].clientX - touchStartX.current;
        touchStartX.current = null;
        if (delta < -50 && current < SLIDES.length - 1) setCurrent(c => c + 1);
        if (delta > 50 && current > 0) setCurrent(c => c - 1);
    }

    function handleNext() {
        if (current < SLIDES.length - 1) {
            setCurrent(c => c + 1);
        } else {
            onDone();
        }
    }

    const slide = SLIDES[current];
    const Icon = slide.icon;
    const isLast = current === SLIDES.length - 1;

    return (
        <div
            className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center px-6 py-12 md:justify-center md:px-4 md:py-8 select-none"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            {/*
              Mobile: inner div occupa tutta l'altezza (flex-1) e distribuisce
                      i figli con justify-between (skip in alto, controls in basso).
              Desktop: inner div diventa una glass card centrata di larghezza fissa.
            */}
            <div className="flex flex-col justify-between flex-1 w-full max-w-sm md:flex-initial md:glass md:rounded-3xl md:p-8 md:border md:border-slate-800 md:shadow-2xl md:justify-normal md:gap-8">

                {/* Skip button */}
                <div className="flex justify-end">
                    <button
                        onClick={onDone}
                        className="text-sm text-gray-400 hover:text-gray-200 transition px-2 py-1"
                    >
                        {t('tutorial.skip')}
                    </button>
                </div>

                {/* Slide content */}
                <div className="flex-1 md:flex-initial flex flex-col items-center justify-center text-center gap-8">
                    {/* Icon */}
                    <div
                        className={`w-28 h-28 rounded-3xl bg-gradient-to-br ${slide.iconColor} flex items-center justify-center shadow-2xl`}
                    >
                        <Icon className="w-14 h-14 text-white" strokeWidth={1.5} />
                    </div>

                    {/* Text */}
                    <div className="space-y-4">
                        <h2 className="text-2xl font-bold text-white tracking-wide">
                            {t(slide.titleKey)}
                        </h2>
                        <p className="text-gray-400 text-base leading-relaxed">
                            {t(slide.descKey)}
                        </p>
                    </div>
                </div>

                {/* Bottom controls */}
                <div className="flex items-center justify-between">
                    {/* Dot indicators */}
                    <div className="flex gap-2">
                        {SLIDES.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => setCurrent(i)}
                                className={`rounded-full transition-all ${
                                    i === current
                                        ? 'w-6 h-2.5 bg-blue-500'
                                        : 'w-2.5 h-2.5 bg-slate-600 hover:bg-slate-500'
                                }`}
                            />
                        ))}
                    </div>

                    {/* Next / Get Started */}
                    <button
                        onClick={handleNext}
                        className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-semibold text-sm transition-all shadow-lg ${
                            isLast
                                ? 'bg-gradient-to-r from-brand to-blue-500 text-white shadow-blue-900/40'
                                : 'bg-slate-800 text-gray-200 hover:bg-slate-700'
                        }`}
                    >
                        {isLast ? t('tutorial.getStarted') : t('tutorial.next')}
                        <ChevronRight size={16} />
                    </button>
                </div>

            </div>
        </div>
    );
}
