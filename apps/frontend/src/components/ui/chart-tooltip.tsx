'use client';

import React from 'react';

export const CHART_TOOLTIP_CURSOR = {
  fill: 'rgba(148, 163, 184, 0.14)',
};

export const AREA_TOOLTIP_CURSOR = {
  stroke: 'rgba(148, 163, 184, 0.45)',
  strokeWidth: 1,
};

interface TooltipPayloadEntry {
  dataKey?: string | number;
  name?: string | number;
  value?: string | number;
  color?: string;
  fill?: string;
}

interface ChartTooltipContentProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string | number;
  valueSuffix?: string;
  labelPrefix?: string;
}

/**
 * Theme-aware Recharts tooltip supporting light/dark modes and narrow mobile viewports.
 */
export function ChartTooltipContent({
  active,
  payload,
  label,
  valueSuffix = '',
  labelPrefix = '',
}: ChartTooltipContentProps) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div
      role="status"
      className="max-w-[min(16rem,72vw)] rounded-lg border border-zinc-200 bg-white/95 p-2.5 text-xs text-zinc-900 shadow-lg backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-100"
    >
      {label !== undefined && label !== null && String(label) !== '' && (
        <p className="mb-1.5 break-words font-semibold text-zinc-900 dark:text-zinc-100">
          {labelPrefix}
          {String(label)}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((entry, idx) => {
          const swatch = entry.color || entry.fill || '#6366F1';
          return (
            <p
              key={`${String(entry.dataKey ?? entry.name ?? idx)}-${idx}`}
              className="flex items-center justify-between gap-3 text-zinc-700 dark:text-zinc-300"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: swatch }}
                />
                <span className="truncate">{entry.name ?? entry.dataKey}</span>
              </span>
              <strong className="shrink-0 font-semibold text-zinc-900 dark:text-zinc-100">
                {entry.value ?? 0}
                {valueSuffix}
              </strong>
            </p>
          );
        })}
      </div>
    </div>
  );
}
