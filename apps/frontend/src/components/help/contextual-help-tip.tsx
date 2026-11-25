'use client';

import React, { useEffect, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';

interface ContextualHelpTipProps {
  id: string;
  userId?: string;
  title: string;
  description: string;
}

export function ContextualHelpTip({ id, userId, title, description }: ContextualHelpTipProps) {
  const storageKey = userId ? `zenhr_tip_${id}_${userId}` : null;
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!storageKey) return;
    try {
      setDismissed(window.localStorage.getItem(storageKey) === '1');
    } catch {
      setDismissed(false);
    }
  }, [storageKey]);

  const handleDismiss = (next: boolean) => {
    setDismissed(next);
    if (!storageKey) return;
    try {
      if (next) {
        window.localStorage.setItem(storageKey, '1');
      } else {
        window.localStorage.removeItem(storageKey);
      }
    } catch {
      // Ignore storage errors
    }
  };

  if (dismissed) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => handleDismiss(false)}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          Show {title}
        </button>
      </div>
    );
  }

  return (
    <div
      role="note"
      aria-label={title}
      className="flex items-start justify-between gap-3 rounded-xl border border-indigo-200/80 dark:border-indigo-900/50 bg-indigo-50/60 dark:bg-indigo-950/30 px-4 py-3 text-xs text-indigo-950 dark:text-indigo-200"
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <HelpCircle className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <span className="font-semibold">{title}: </span>
          <span className="text-indigo-900/90 dark:text-indigo-200/90">{description}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => handleDismiss(true)}
        aria-label={`Dismiss ${title}`}
        className="rounded p-0.5 text-indigo-500 hover:text-indigo-700 dark:text-indigo-300 dark:hover:text-white shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
