import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  X,
  XCircle,
} from 'lucide-react';
import { FeedbackBannerItem, FeedbackSeverity } from '../types/diagnostics';

interface FeedbackBannerProps {
  items: FeedbackBannerItem[];
  onDismiss: (id: string) => void;
}

const SEVERITY_STYLES: Record<
  FeedbackSeverity,
  {
    container: string;
    iconColor: string;
    label: string;
    labelClass: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  success: {
    container: 'bg-[#F0FDF4] border-[#BBF7D0] text-[#14532D]',
    iconColor: 'text-[#166534]',
    label: 'Success',
    labelClass: 'text-[#166534]',
    Icon: CheckCircle2,
  },
  warning: {
    container: 'bg-[#FFFBEB] border-[#FDE68A] text-[#78350F]',
    iconColor: 'text-[#B45309]',
    label: 'Action Needed',
    labelClass: 'text-[#B45309]',
    Icon: AlertTriangle,
  },
  error: {
    container: 'bg-[#FEF2F2] border-[#FECACA] text-[#7F1D1D]',
    iconColor: 'text-[#DC2626]',
    label: 'Failed',
    labelClass: 'text-[#DC2626]',
    Icon: XCircle,
  },
  info: {
    container: 'bg-[#F8FAFC] border-[#CBD5E1] text-[#0F172A]',
    iconColor: 'text-[#1D4ED8]',
    label: 'Info',
    labelClass: 'text-[#1D4ED8]',
    Icon: Info,
  },
};

export function FeedbackBanner({ items, onDismiss }: FeedbackBannerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (items.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="max-w-7xl w-full mx-auto px-4 sm:px-6 pt-4 space-y-2.5"
    >
      {items.map((item) => {
        const cfg = SEVERITY_STYLES[item.severity];
        const Icon = cfg.Icon;
        const isExpanded = expandedId === item.id;

        return (
          <div
            key={item.id}
            className={`rounded-xl border px-4 py-3 transition-all ${cfg.container}`}
          >
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.iconColor}`} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className={`font-semibold ${cfg.labelClass}`}>{cfg.label}</span>
                    <span aria-hidden="true" className="opacity-40">
                      ·
                    </span>
                    <span className="font-semibold text-[#111827]">{item.title}</span>
                    {item.code && (
                      <>
                        <span aria-hidden="true" className="opacity-40">
                          ·
                        </span>
                        <span className="font-mono text-[11px] opacity-75">{item.code}</span>
                      </>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed text-[#374151]">{item.message}</p>

                  {item.details && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-[#4B5563] hover:text-[#111827] cursor-pointer"
                      >
                        {isExpanded ? (
                          <>
                            <ChevronUp className="w-3 h-3" />
                            Hide technical details
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3" />
                            View technical details
                          </>
                        )}
                      </button>
                      {isExpanded && (
                        <pre className="mt-1.5 p-2.5 rounded-lg bg-white/80 border border-black/10 text-[11px] font-mono text-[#1F2937] overflow-x-auto whitespace-pre-wrap">
                          {item.details}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {item.recoveryActions?.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    onClick={action.onClick}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      action.variant === 'primary'
                        ? 'bg-[#111827] text-white hover:bg-[#1F2937]'
                        : 'bg-white text-[#111827] border border-black/15 hover:border-black/35'
                    }`}
                  >
                    {action.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => onDismiss(item.id)}
                  aria-label="Dismiss notification"
                  className="p-1.5 rounded-lg text-[#4B5563] hover:text-[#111827] hover:bg-black/5 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
