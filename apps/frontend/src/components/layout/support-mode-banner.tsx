'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { ShieldAlert, LogOut, Loader2 } from 'lucide-react';

export function SupportModeBanner() {
  const { user, refetchUser } = useAuth();
  const [isExiting, setIsExiting] = useState(false);

  if (!user?.supportModeCompanyId || !user?.supportModeCompany) {
    return null;
  }

  const handleExit = async () => {
    try {
      setIsExiting(true);
      await api.post(`/super-admin/companies/${user.supportModeCompanyId}/support-mode/exit`);
      refetchUser();
      window.location.href = '/dashboard/companies';
    } catch (err) {
      console.error('Failed to exit support mode', err);
      setIsExiting(false);
    }
  };

  return (
    <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 text-white px-4 py-2.5 shadow-md flex items-center justify-between gap-4 z-40 transition-all">
      <div className="flex items-center gap-3">
        <div className="p-1 rounded-md bg-white/20 backdrop-blur-sm">
          <ShieldAlert className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="text-xs font-bold tracking-wide flex items-center gap-2">
            <span>SUPPORT MODE ACTIVE</span>
            <span className="bg-amber-900/40 text-amber-100 text-[10px] px-2 py-0.5 rounded-full font-mono font-medium">
              Audited Session
            </span>
          </div>
          <p className="text-[11px] text-amber-100">
            Impersonating tenant: <span className="font-semibold text-white">{user.supportModeCompany.name}</span> ({user.supportModeCompany.subscriptionTier} tier).
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={handleExit}
        disabled={isExiting}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium text-xs border border-white/20 backdrop-blur-sm transition-all shadow-sm disabled:opacity-50"
      >
        {isExiting ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Exiting...</span>
          </>
        ) : (
          <>
            <LogOut className="h-3.5 w-3.5" />
            <span>Exit Support Mode</span>
          </>
        )}
      </button>
    </div>
  );
}
