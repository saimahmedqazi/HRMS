'use client';

import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  CreditCard,
  CheckCircle,
  XCircle,
  Sparkles,
  Zap,
  ArrowRight,
  ShieldCheck,
  AlertTriangle,
  Clock,
  Layers,
} from 'lucide-react';

export default function BillingDashboardPage() {
  const [errorMessage, setErrorMessage] = useState('');

  // Fetch current subscription
  const { data: subscription, isLoading } = useQuery({
    queryKey: ['subscription-current'],
    queryFn: () => api.get<any>('/subscriptions/current'),
  });

  // Create Checkout Session Mutation
  const checkoutMutation = useMutation({
    mutationFn: () =>
      api.post<{ url: string }>('/subscriptions/checkout-session', {
        returnUrl: typeof window !== 'undefined' ? window.location.href : '',
      }),
    onSuccess: (data: any) => {
      if (data?.url) {
        window.location.href = data.url;
      }
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Failed to initiate checkout session.');
    },
  });

  // Create Customer Portal Mutation
  const portalMutation = useMutation({
    mutationFn: () =>
      api.post<{ url: string }>('/subscriptions/portal-session', {
        returnUrl: typeof window !== 'undefined' ? window.location.href : '',
      }),
    onSuccess: (data: any) => {
      if (data?.url) {
        window.location.href = data.url;
      }
    },
    onError: (err: any) => {
      setErrorMessage(err.message || 'Failed to open customer portal.');
    },
  });

  const isPremium = subscription?.tier === 'PREMIUM';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
          Billing & Subscription Plans
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Manage your SaaS subscription tier, payment credentials, and enterprise entitlements.
        </p>
      </div>

      {errorMessage && (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Current Plan Status Card */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Active Tier:
            </span>
            <span
              className={`px-3 py-1 text-xs font-bold rounded-full ${
                isPremium
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm'
                  : 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
              }`}
            >
              {subscription?.tier || 'BASIC'} PLAN
            </span>
            <StatusBadge status={subscription?.status || 'ACTIVE'} />
          </div>

          <p className="text-xs text-gray-500 mt-2">
            {isPremium
              ? 'Your company enjoys full access to Work Timer alerts, Gemini AI Assistant, and bulk import.'
              : 'You are on the Basic tier (limited to 25 employees and core HR workflows).'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!isPremium && (
            <button
              onClick={() => checkoutMutation.mutate()}
              disabled={checkoutMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white shadow-md shadow-orange-500/20"
            >
              <Sparkles className="w-4 h-4" />
              {checkoutMutation.isPending ? 'Redirecting...' : 'Upgrade to Premium ($149/mo)'}
            </button>
          )}

          <button
            onClick={() => portalMutation.mutate()}
            disabled={portalMutation.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 shadow-sm"
          >
            <CreditCard className="w-4 h-4" />
            Billing Portal
          </button>
        </div>
      </div>

      {/* Feature Comparison Matrix */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Basic Tier Card */}
        <div
          className={`bg-white dark:bg-gray-900 border rounded-2xl p-6 shadow-sm relative ${
            !isPremium
              ? 'border-primary-500 ring-2 ring-primary-500/20'
              : 'border-gray-200 dark:border-gray-800'
          }`}
        >
          {!isPremium && (
            <span className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary-50 text-primary-700 dark:bg-primary-950/60 dark:text-primary-300">
              Current Plan
            </span>
          )}

          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Basic Plan</h3>
          <p className="text-xs text-gray-500 mt-1">
            Essential operational HR tools for small startups and teams.
          </p>

          <div className="mt-4 mb-6">
            <span className="text-3xl font-extrabold text-gray-900 dark:text-white">$49</span>
            <span className="text-xs text-gray-500"> / month</span>
          </div>

          <ul className="space-y-3 text-xs text-gray-600 dark:text-gray-300">
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span>Up to 25 Employees</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span>Attendance check-in/out with non-blocking GPS</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span>2-Step Leave Management & Reporting Approvals</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span>Sick Leave Doctor Prescription Uploads</span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span>Monthly Payroll & PDF Payslips</span>
            </li>
            <li className="flex items-center gap-2 text-gray-400">
              <XCircle className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
              <span>Work Timer & Break Overstay Real-Time Alerts (Locked)</span>
            </li>
            <li className="flex items-center gap-2 text-gray-400">
              <XCircle className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
              <span>Google Gemini AI HR Policy Assistant (Locked)</span>
            </li>
            <li className="flex items-center gap-2 text-gray-400">
              <XCircle className="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
              <span>Bulk Excel Employee Import (Locked)</span>
            </li>
          </ul>
        </div>

        {/* Premium Tier Card */}
        <div
          className={`bg-white dark:bg-gray-900 border rounded-2xl p-6 shadow-sm relative ${
            isPremium
              ? 'border-orange-500 ring-2 ring-orange-500/20'
              : 'border-gray-200 dark:border-gray-800'
          }`}
        >
          <span className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm">
            {isPremium ? 'Current Plan' : 'Most Popular'}
          </span>

          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <span>Premium Plan</span>
            <Sparkles className="w-4 h-4 text-amber-500" />
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Complete enterprise suite with AI, Work Timer, and unbounded scale.
          </p>

          <div className="mt-4 mb-6">
            <span className="text-3xl font-extrabold text-gray-900 dark:text-white">$149</span>
            <span className="text-xs text-gray-500"> / month</span>
          </div>

          <ul className="space-y-3 text-xs text-gray-600 dark:text-gray-300">
            <li className="flex items-center gap-2 font-medium">
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span>Unlimited Workforce Headcount</span>
            </li>
            <li className="flex items-center gap-2 font-medium">
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span>All Basic HR Features included</span>
            </li>
            <li className="flex items-center gap-2 font-medium">
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span>Work Timer with Real-Time Break Overstay Alerts (Socket.IO)</span>
            </li>
            <li className="flex items-center gap-2 font-medium">
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span>Google Gemini AI HR Policy Assistant & Onboarding Bot</span>
            </li>
            <li className="flex items-center gap-2 font-medium">
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span>Asynchronous Bulk Excel Workforce Onboarding Pipeline</span>
            </li>
            <li className="flex items-center gap-2 font-medium">
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span>General Cloudinary/S3 Document Storage Vault</span>
            </li>
            <li className="flex items-center gap-2 font-medium">
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <span>Priority Customer Support & Dedicated SLA</span>
            </li>
          </ul>

          {!isPremium && (
            <button
              onClick={() => checkoutMutation.mutate()}
              disabled={checkoutMutation.isPending}
              className="w-full mt-6 py-2.5 px-4 text-xs font-semibold rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white shadow-md shadow-orange-500/20"
            >
              {checkoutMutation.isPending ? 'Redirecting to Stripe...' : 'Upgrade Now with Stripe'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
