'use client';

import React, { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className = '', disabled, ...props }, ref) {
    const [isVisible, setIsVisible] = useState(false);

    return (
      <div className="relative">
        <input
          {...props}
          ref={ref}
          type={isVisible ? 'text' : 'password'}
          disabled={disabled}
          className={`${className} pr-10`}
        />
        <button
          type="button"
          aria-label={isVisible ? 'Hide password' : 'Show password'}
          aria-pressed={isVisible}
          disabled={disabled}
          onClick={() => setIsVisible((visible) => !visible)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 transition hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed dark:text-slate-400 dark:hover:text-slate-100"
        >
          {isVisible ? <EyeOff aria-hidden="true" className="h-4 w-4" /> : <Eye aria-hidden="true" className="h-4 w-4" />}
        </button>
      </div>
    );
  },
);

PasswordInput.displayName = 'PasswordInput';
