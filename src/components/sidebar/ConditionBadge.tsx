'use client';

/**
 * The pill saying what a trail was last like.
 *
 * Shared by the sidebar and the pane so both hide a stale report on the same
 * rule. Colour comes off the vocabulary row, so recolouring a condition in the
 * admin repaints every badge.
 */
import { cn } from '@/lib/utils';
import {
  type ConditionReport,
  conditionAgeLabel,
  isConditionFresh,
} from '@/data/trail-conditions';

export function ConditionBadge({
  className,
  report,
  showAge = false,
  size = 'sm',
}: {
  className?: string;
  report: ConditionReport | undefined;
  /** Append "· 2 days ago". The pane has room for it; a list row does not. */
  showAge?: boolean;
  size?: 'md' | 'sm';
}) {
  if (!report || !isConditionFresh(report.observedAt)) {
    return null;
  }

  const age = conditionAgeLabel(report.observedAt);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap shrink-0',
        size === 'sm' ? 'text-[10px] px-1.5 py-px' : 'text-[11px] px-2 py-0.5',
        className,
      )}
      style={{
        // Tinted from the one colour so a curator only picks one and any new
        // condition still gets a legible badge.
        backgroundColor: `${report.color}1f`,
        color: report.color,
      }}
      title={
        report.source === 'admin'
          ? `${report.name} — reported by the trail steward, ${age}`
          : `${report.name} — reported by a rider, ${age}`
      }
    >
      {/* A steward's word, not a rider's guess. */}
      {report.source === 'admin' && <span aria-hidden="true">★</span>}
      {report.name}
      {showAge && <span className="font-normal opacity-70">· {age}</span>}
    </span>
  );
}
