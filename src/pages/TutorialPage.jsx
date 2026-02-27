/**
 * TutorialPage
 * Shown only on first launch (before master password is created).
 * Carousel of 3 slides explaining the app's key features.
 */

import { useState, useRef } from 'react';
import { Lock, ShieldCheck, UploadCloud, ChevronRight } from 'lucide-react';

const SLIDES = [
    {
        icon: Lock,
        iconColor: 'from-blue-500 to-brand',
        title: 'Master Password',
        description:
            'Choose a single password that will be used to encrypt all your web accounts and credit, debit or prepaid cards.',
    },
    {
        icon: ShieldCheck,
        iconColor: 'from-green-500 to-emerald-400',
        title: 'Zero Knowledge',
        description:
            'No plaintext data is ever saved. Security is further strengthened by biometric authentication or two-factor authentication.',
    },
    {
        icon: UploadCloud,
        iconColor: 'from-purple-500 to-indigo-400',
        title: 'Backup & Restore',
        description:
            'Backup or restore your encrypted database at any time — ideal in case of device change or loss.',
    },
];

export function TutorialPage({ onDone }) {
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
            className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-between px-6 py-12 select-none"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            {/* Skip button */}
            <div className="w-full flex justify-end">
                <button
                    onClick={onDone}
                    className="text-sm text-gray-400 hover:text-gray-200 transition px-2 py-1"
                >
                    Skip
                </button>
            </div>

            {/* Slide content */}
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-8 max-w-sm w-full">
                {/* Icon */}
                <div
                    className={`w-28 h-28 rounded-3xl bg-gradient-to-br ${slide.iconColor} flex items-center justify-center shadow-2xl`}
                >
                    <Icon className="w-14 h-14 text-white" strokeWidth={1.5} />
                </div>

                {/* Text */}
                <div className="space-y-4">
                    <h2 className="text-2xl font-bold text-white tracking-wide">
                        {slide.title}
                    </h2>
                    <p className="text-gray-400 text-base leading-relaxed">
                        {slide.description}
                    </p>
                </div>
            </div>

            {/* Bottom controls */}
            <div className="w-full max-w-sm flex items-center justify-between">
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
                    {isLast ? 'Get Started' : 'Next'}
                    <ChevronRight size={16} />
                </button>
            </div>
        </div>
    );
}
