'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  Bot,
  User,
  Send,
  Sparkles,
  Lock,
  ArrowRight,
  ShieldAlert,
  HelpCircle,
  Clock,
  FileText,
  Package,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

const PRESET_PROMPTS = [
  {
    icon: Clock,
    label: 'Probation Leave Policy',
    prompt: 'What is the probation duration before an employee can request leave?',
  },
  {
    icon: FileText,
    label: 'Sick Leave Prescriptions',
    prompt: 'What are the rules regarding doctor prescriptions for sick leave?',
  },
  {
    icon: Package,
    label: 'Equipment Requests',
    prompt: 'How do I submit an equipment or software resource request?',
  },
  {
    icon: Clock,
    label: 'Break Overstay Alerts',
    prompt: 'How does the Work Timer break overstay alert engine work?',
  },
];

export default function AiAssistantPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: 'Hello! I am your ZenHR AI Assistant powered by Google Gemini. I can assist you with HR policies, leave entitlements, probation rules, and workplace workflows. How can I help you today?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fetch subscription tier
  const { data: subscription } = useQuery({
    queryKey: ['subscription-current'],
    queryFn: () => api.get<any>('/subscriptions/current'),
  });

  const isPremium = subscription?.tier === 'PREMIUM';

  // Auto-scroll to bottom of chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: (text: string) =>
      api.post<{ reply: string; model: string }>('/ai/chat', { message: text }),
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          sender: 'assistant',
          text: data.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    },
    onError: (err: any) => {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          sender: 'assistant',
          text: `Error: ${err.message || 'Unable to connect to Gemini AI services.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    },
  });

  const handleSendMessage = (textToSend?: string) => {
    const query = textToSend || inputText;
    if (!query.trim() || sendMutation.isPending) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!textToSend) setInputText('');
    sendMutation.mutate(query);
  };

  return (
    <div className="space-y-4 max-w-4xl mx-auto h-[calc(100vh-8rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span>ZenHR Gemini Assistant</span>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm">
                AI POWERED
              </span>
            </h1>
            <p className="text-xs text-gray-500">
              Grounded enterprise HR policy assistant with privacy & security guardrails.
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-xs text-gray-400">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>Gemini 2.0 Flash</span>
        </div>
      </div>

      {/* Basic Tier Locked Banner */}
      {!isPremium && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-xs text-amber-900 dark:text-amber-200">
            <Lock className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div>
              <p className="font-semibold">Premium Feature Locked</p>
              <p className="text-amber-700 dark:text-amber-300/80 mt-0.5">
                The Gemini AI Assistant is exclusively available on ZenHR Premium. Upgrade your plan to
                enable interactive onboarding, leave guidance, and policy queries.
              </p>
            </div>
          </div>
          <Link
            href="/dashboard/billing"
            className="flex-shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 text-white shadow-sm"
          >
            Upgrade Plan
          </Link>
        </div>
      )}

      {/* Chat Messages Feed */}
      <div className="flex-1 overflow-y-auto space-y-4 p-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
        {messages.map((m) => {
          const isUser = m.sender === 'user';
          return (
            <div
              key={m.id}
              className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                  isUser
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-sm'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div
                className={`max-w-xl rounded-2xl p-4 text-xs leading-relaxed shadow-sm whitespace-pre-line ${
                  isUser
                    ? 'bg-primary-600 text-white rounded-tr-none'
                    : 'bg-gray-50 dark:bg-gray-800/60 text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-gray-800 rounded-tl-none'
                }`}
              >
                {m.text}
                <div
                  className={`mt-1.5 text-[10px] text-right ${
                    isUser ? 'text-primary-200' : 'text-gray-400'
                  }`}
                >
                  {m.timestamp}
                </div>
              </div>
            </div>
          );
        })}

        {sendMutation.isPending && (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center flex-shrink-0 shadow-sm">
              <Bot className="w-4 h-4" />
            </div>
            <div className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl rounded-tl-none p-3.5 border border-gray-100 dark:border-gray-800 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary-600 animate-bounce" />
              <div className="w-2 h-2 rounded-full bg-primary-600 animate-bounce [animation-delay:0.2s]" />
              <div className="w-2 h-2 rounded-full bg-primary-600 animate-bounce [animation-delay:0.4s]" />
              <span className="text-xs text-gray-400 ml-1">Consulting ZenHR knowledge base...</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Preset Prompt Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {PRESET_PROMPTS.map((p, idx) => {
          const Icon = p.icon;
          return (
            <button
              key={idx}
              onClick={() => handleSendMessage(p.prompt)}
              disabled={sendMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-[11px] font-medium text-gray-600 dark:text-gray-300 hover:border-primary-500 hover:text-primary-600 whitespace-nowrap shadow-sm transition flex-shrink-0"
            >
              <Icon className="w-3 h-3 text-primary-500" />
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="flex items-center gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-2 shadow-sm"
      >
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Ask a question about HR policies, leave balances, or workflows..."
          className="flex-1 px-3 py-2 text-xs bg-transparent border-0 focus:outline-none text-gray-900 dark:text-white"
        />
        <button
          type="submit"
          disabled={!inputText.trim() || sendMutation.isPending}
          className="p-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-50 shadow-sm transition"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
