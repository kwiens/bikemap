'use client';

/**
 * The report form: what it was like, and when. No account.
 *
 * Listens for `CONDITION_REPORT_OPEN` rather than taking props, so one copy at
 * the page root serves every place that opens it.
 *
 * Nothing here is a real check — the server decides. What's here is the part
 * that has to be in the markup (the honeypot) and enough to save a round trip.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { activeCityId } from '@/config/map.config';
import { useTrailConditions } from '@/components/TrailConditionsProvider';
import type { ConditionReport } from '@/data/trail-conditions';
import { MAP_EVENTS } from '@/events';
import { cn } from '@/lib/utils';

/** `<input type="date">` wants `YYYY-MM-DD` in the *viewer's* timezone. */
function toDateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

interface OpenDetail {
  slug: string;
  trailName: string;
}

export function ConditionReportModal() {
  const { options, recordLocal, refresh } = useTrailConditions();
  const [target, setTarget] = useState<OpenDetail | null>(null);
  const [condition, setCondition] = useState('');
  const [observedAt, setObservedAt] = useState(() =>
    toDateInputValue(new Date()),
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const honeypotRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  const close = useCallback(() => {
    setTarget(null);
    setError(null);
    setSubmitting(false);
  }, []);

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const detail = (event as CustomEvent).detail as OpenDetail;
      setTarget(detail);
      setError(null);
      // Reset on every open, or a page left open past midnight offers
      // yesterday as today.
      setObservedAt(toDateInputValue(new Date()));
    };
    window.addEventListener(MAP_EVENTS.CONDITION_REPORT_OPEN, handleOpen);
    return () =>
      window.removeEventListener(MAP_EVENTS.CONDITION_REPORT_OPEN, handleOpen);
  }, []);

  // Escape closes, as it does for any dialog.
  useEffect(() => {
    if (!target) {
      return;
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [target, close]);

  // Focus the one field that needs an answer.
  useEffect(() => {
    if (target) {
      selectRef.current?.focus();
    }
  }, [target]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!target || submitting) {
      return;
    }
    if (!condition) {
      setError('Pick a condition.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/map/conditions?city=${activeCityId}`, {
        body: JSON.stringify({
          condition,
          observedAt,
          slug: target.slug,
          // Off the DOM: nothing types into this, so there's no onChange.
          website: honeypotRef.current?.value ?? '',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });

      const data = (await response.json()) as {
        error?: string;
        report?: ConditionReport;
      };

      if (!response.ok) {
        // The server's messages are written for a person; show them rather than
        // inventing a generic one.
        setError(data.error ?? 'That did not go through. Please try again.');
        setSubmitting(false);
        return;
      }

      if (data.report) {
        recordLocal(target.slug, data.report);
      } else {
        // The honeypot path answers `{ ok: true }` with no report — unreachable
        // for a real person, but a no-op beats a crash if it is reached.
        refresh();
      }

      window.dispatchEvent(
        new CustomEvent(MAP_EVENTS.TOAST, {
          detail: { message: `Thanks — ${target.trailName} updated` },
        }),
      );
      close();
    } catch {
      setError('Could not reach the server. Please try again.');
      setSubmitting(false);
    }
  }

  if (!target) {
    return null;
  }

  const selected = options.find((option) => option.value === condition);

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/60 backdrop-blur-[4px] px-5 py-10 animate-welcome-fade-in">
      {/* Click-away as a real button behind the card, rather than a handler on
          the backdrop. Hidden from assistive tech — the × is the close control,
          and announcing two would be worse. */}
      <button
        aria-hidden="true"
        className="absolute inset-0 cursor-default"
        onClick={close}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-labelledby="condition-report-title"
        aria-modal="true"
        className="relative bg-white rounded-3xl w-full max-w-[380px] px-6 pt-5 pb-5 shadow-[0_24px_48px_rgba(0,0,0,0.25)] animate-welcome-slide-up"
        role="dialog"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="min-w-0">
            <h2
              className="text-lg font-bold text-app-secondary leading-tight"
              id="condition-report-title"
            >
              How was it?
            </h2>
            <p className="text-[13px] text-gray-500 truncate">
              {target.trailName}
            </p>
          </div>
          <button
            aria-label="Close"
            className="ml-auto shrink-0 bg-transparent border-none cursor-pointer text-gray-400 text-xl px-1 hover:text-gray-600"
            onClick={close}
            type="button"
          >
            <FontAwesomeIcon icon={faTimes} />
          </button>
        </div>

        <form onSubmit={submit}>
          {/* The honeypot. Off-screen rather than `display: none`, which the
              better bots skip, and unreachable by keyboard or screen reader so
              nobody trips it by accident. */}
          <input
            aria-hidden="true"
            autoComplete="off"
            className="absolute left-[-9999px] w-px h-px opacity-0"
            defaultValue=""
            name="website"
            ref={honeypotRef}
            tabIndex={-1}
            type="text"
          />

          <label
            className="block text-[13px] font-semibold text-app-secondary mb-1"
            htmlFor="condition-report-condition"
          >
            Condition
          </label>
          <select
            className="w-full py-2 px-3 border border-gray-300 rounded-lg text-sm text-app-secondary bg-white outline-none focus:border-app-primary focus:ring-2 focus:ring-app-primary/30"
            id="condition-report-condition"
            onChange={(event) => setCondition(event.target.value)}
            ref={selectRef}
            required
            value={condition}
          >
            <option disabled value="">
              Pick one…
            </option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.name}
              </option>
            ))}
          </select>
          {/* The curator's own words for what this means locally. */}
          {selected?.description && (
            <p className="text-[11px] text-gray-500 mt-1">
              {selected.description}
            </p>
          )}

          <label
            className="block text-[13px] font-semibold text-app-secondary mt-4 mb-1"
            htmlFor="condition-report-date"
          >
            When did you ride it?
          </label>
          <input
            className="w-full py-2 px-3 border border-gray-300 rounded-lg text-sm text-app-secondary bg-white outline-none focus:border-app-primary focus:ring-2 focus:ring-app-primary/30"
            id="condition-report-date"
            max={toDateInputValue(new Date())}
            onChange={(event) => setObservedAt(event.target.value)}
            type="date"
            value={observedAt}
          />

          {error && (
            <p className="text-[12px] text-red-600 mt-3" role="alert">
              {error}
            </p>
          )}

          <button
            className={cn(
              'w-full mt-5 py-2.5 rounded-xl border-none text-app-secondary font-semibold text-[15px] transition-opacity',
              submitting
                ? 'bg-gray-200 cursor-wait opacity-70'
                : 'bg-app-primary cursor-pointer hover:opacity-90',
            )}
            disabled={submitting}
            type="submit"
          >
            {submitting ? 'Sending…' : 'Send report'}
          </button>
          <p className="text-[11px] text-gray-400 text-center mt-2">
            No account needed. Reports show on the map straight away.
          </p>
        </form>
      </div>
    </div>
  );
}
