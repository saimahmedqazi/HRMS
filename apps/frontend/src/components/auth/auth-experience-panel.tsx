'use client';

import { useState } from 'react';

const sampleQuotes = [
  {
    quote:
      '“A clearer view of our people and everyday HR work, all in one place.”',
    attribution: 'Sample testimonial · HR team lead',
  },
  {
    quote:
      '“The leave and attendance workflows make routine tasks easier to follow.”',
    attribution: 'Sample testimonial · People operations',
  },
  {
    quote:
      '“Managers and employees can find the tools they need without the paperwork.”',
    attribution: 'Sample testimonial · Department manager',
  },
];

export function AuthExperiencePanel() {
  const [activeQuote, setActiveQuote] = useState(0);
  const changeQuote = (direction: number) => {
    setActiveQuote((current) => (current + direction + sampleQuotes.length) % sampleQuotes.length);
  };

  const current = sampleQuotes[activeQuote];

  return (
    <section
      aria-label="ZenHR introduction"
      className="relative flex h-[260px] min-h-[260px] overflow-hidden bg-slate-950 text-white sm:h-[300px] lg:h-screen lg:min-h-[620px]"
      style={{
        backgroundImage:
          "linear-gradient(115deg, rgba(8, 19, 43, .92) 0%, rgba(17, 38, 79, .72) 52%, rgba(10, 22, 48, .78) 100%), url('/zenhr-auth-hero.webp')",
        backgroundSize: 'cover',
        backgroundPosition: 'center 42%',
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-slate-950/50" />
      <div className="relative z-10 flex w-full flex-col justify-between p-5 sm:p-8 lg:p-12 xl:p-16">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold shadow-lg shadow-blue-950/40">
            Z
          </span>
          <span className="text-lg font-semibold tracking-tight">ZenHR</span>
        </div>

        <div className="max-w-xl">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-200 sm:text-xs">
            People, work, in sync
          </p>
          <h2 className="max-w-lg text-2xl font-semibold leading-tight tracking-tight sm:text-3xl lg:text-4xl xl:text-5xl">
            Make everyday people operations feel simpler.
          </h2>

          <div
            className="mt-4 max-w-lg sm:mt-7"
            role="region"
            aria-roledescription="carousel"
            aria-label="Sample testimonials"
          >
            <div className="mb-2 inline-flex rounded-full border border-white/25 bg-slate-950/40 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-blue-100 sm:text-[10px]">
              Fictional demo quote
            </div>
            <div aria-live="polite" aria-atomic="true" key={activeQuote}>
              <p className="text-sm leading-relaxed text-white/90 sm:text-base">{current.quote}</p>
              <p className="mt-1.5 text-[10px] text-blue-100/80 sm:mt-2 sm:text-xs">
                {current.attribution}
              </p>
            </div>

            <div className="mt-3 flex items-center gap-3 sm:mt-4">
              <button
                type="button"
                onClick={() => changeQuote(-1)}
                aria-label="Previous sample testimonial"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-slate-950/30 text-sm transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <span aria-hidden="true">←</span>
              </button>
              <div className="flex items-center gap-1.5" aria-label={`Slide ${activeQuote + 1} of ${sampleQuotes.length}`}>
                {sampleQuotes.map((item, index) => (
                  <button
                    key={item.attribution}
                    type="button"
                    onClick={() => setActiveQuote(index)}
                    aria-label={`Show sample testimonial ${index + 1}`}
                    aria-current={activeQuote === index ? 'true' : undefined}
                    className={`h-2 rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                      activeQuote === index ? 'w-5 bg-white' : 'w-2 bg-white/50 hover:bg-white/80'
                    }`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => changeQuote(1)}
                aria-label="Next sample testimonial"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/30 bg-slate-950/30 text-sm transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <span aria-hidden="true">→</span>
              </button>
              <span className="sr-only">These quotes are fictional examples for the project demo.</span>
            </div>
          </div>
        </div>

        <p className="hidden text-xs text-white/60 lg:block">A connected workspace for growing teams.</p>
      </div>
    </section>
  );
}
