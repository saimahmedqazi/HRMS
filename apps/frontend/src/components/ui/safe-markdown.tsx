'use client';

import React from 'react';
import Link from 'next/link';

const SAFE_INTERNAL_ROUTE_RE = /^\/dashboard(?:\/[a-zA-Z0-9\-_]+)*(?:\?[a-zA-Z0-9\-_=&]+)?$/;

const ROUTE_MODULE_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ['/dashboard/employees', 'employees'],
  ['/dashboard/team-members', 'team-members'],
  ['/dashboard/departments', 'departments'],
  ['/dashboard/attendance', 'attendance'],
  ['/dashboard/my-attendance', 'my-attendance'],
  ['/dashboard/work-timer', 'work-timer'],
  ['/dashboard/leave-approvals', 'leave-approvals'],
  ['/dashboard/my-leave', 'my-leave'],
  ['/dashboard/leave', 'leave'],
  ['/dashboard/payroll-view', 'payroll-view'],
  ['/dashboard/my-payslips', 'my-payslips'],
  ['/dashboard/payroll', 'payroll'],
  ['/dashboard/bulk-import', 'bulk-import'],
  ['/dashboard/resources', 'resources'],
  ['/dashboard/ai-assistant', 'ai-assistant'],
  ['/dashboard/my-profile', 'my-profile'],
  ['/dashboard/support-mode', 'support-mode'],
  ['/dashboard/companies', 'companies'],
  ['/dashboard/billing', 'billing'],
  ['/dashboard/notifications', 'notifications'],
  ['/dashboard/settings', 'settings'],
];

function isAuthorizedDashboardRoute(pathOnly: string, allowedModules?: string[]): boolean {
  if (!allowedModules) return true;
  if (pathOnly === '/dashboard' || pathOnly === '/dashboard/') {
    return allowedModules.includes('dashboard');
  }
  const required = ROUTE_MODULE_PREFIXES.find(
    ([prefix]) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`),
  )?.[1];
  return !required || allowedModules.includes(required);
}

function isSafeInternalRoute(href: string, allowedModules?: string[]): boolean {
  const trimmed = href.trim();
  if (!trimmed || trimmed.includes('%')) return false;
  let decoded = trimmed;
  try {
    decoded = decodeURIComponent(trimmed);
  } catch {
    return false;
  }
  if (!decoded.startsWith('/dashboard')) return false;
  if (decoded.startsWith('//') || decoded.includes('\\') || decoded.includes('@') || decoded.includes('..')) {
    return false;
  }
  const lower = decoded.toLowerCase();
  if (
    lower.includes('javascript:') ||
    lower.includes('data:') ||
    lower.includes('vbscript:') ||
    lower.includes('redirect=') ||
    lower.includes('next=') ||
    lower.includes('url=')
  ) {
    return false;
  }
  if (!SAFE_INTERNAL_ROUTE_RE.test(trimmed)) return false;
  const pathOnly = trimmed.split('?')[0];
  return isAuthorizedDashboardRoute(pathOnly, allowedModules);
}

function renderInline(text: string, keyPrefix: string, allowedModules?: string[]): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Match inline code, bold, italic, or markdown link
  const tokenRe = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\n]+\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 0;

  while ((match = tokenRe.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-${idx++}`;

    if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code
          key={key}
          className="rounded bg-black/10 dark:bg-white/10 px-1 py-0.5 font-mono text-[11px] break-all"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(
        <strong key={key} className="font-semibold text-gray-900 dark:text-white">
          {renderInline(token.slice(2, -2), `${key}-b`, allowedModules)}
        </strong>,
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    } else if (token.startsWith('[')) {
      const closeBracket = token.indexOf('](');
      if (closeBracket !== -1) {
        const label = token.slice(1, closeBracket);
        const href = token.slice(closeBracket + 2, -1);
        if (isSafeInternalRoute(href, allowedModules)) {
          nodes.push(
            <Link
              key={key}
              href={href}
              className="font-semibold text-primary-600 dark:text-primary-400 underline underline-offset-2 hover:text-primary-700 dark:hover:text-primary-300 break-words"
            >
              {label}
            </Link>,
          );
        } else {
          // Reject unsafe, external, or unauthorized URLs: render label as plain text only
          nodes.push(<span key={key}>{label}</span>);
        }
      } else {
        nodes.push(token);
      }
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

export function SafeMarkdown({ content, allowedModules }: { content: string; allowedModules?: string[] }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];
      const cls =
        level === 1
          ? 'text-sm font-bold text-gray-900 dark:text-white mt-2 mb-1'
          : level === 2
            ? 'text-xs font-bold text-gray-900 dark:text-white mt-2 mb-1'
            : 'text-xs font-semibold text-gray-900 dark:text-white mt-1.5 mb-0.5';
      blocks.push(
        <p key={`h-${i}`} className={cls}>
          {renderInline(headingText, `h-${i}`, allowedModules)}
        </p>,
      );
      i += 1;
      continue;
    }

    // Unordered list
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      const start = i;
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${start}`} className="list-disc pl-4 space-y-1 my-1">
          {items.map((item, idx) => (
            <li key={`li-${start}-${idx}`} className="break-words">
              {renderInline(item, `ul-${start}-${idx}`, allowedModules)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      const start = i;
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol key={`ol-${start}`} className="list-decimal pl-4 space-y-1 my-1">
          {items.map((item, idx) => (
            <li key={`oli-${start}-${idx}`} className="break-words">
              {renderInline(item, `ol-${start}-${idx}`, allowedModules)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // Paragraph (coalesce consecutive plain lines)
    const paraLines: string[] = [];
    const start = i;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,3})\s+/.test(lines[i].trim()) &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i += 1;
    }
    blocks.push(
      <p key={`p-${start}`} className="my-1 break-words">
        {paraLines.map((pLine, idx) => (
          <React.Fragment key={`pl-${start}-${idx}`}>
            {idx > 0 && <br />}
            {renderInline(pLine, `p-${start}-${idx}`, allowedModules)}
          </React.Fragment>
        ))}
      </p>,
    );
  }

  return <div className="space-y-1 min-w-0 break-words">{blocks}</div>;
}
