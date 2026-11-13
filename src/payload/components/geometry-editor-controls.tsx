import { cn } from '@/lib/utils';
import { partsOf, type PointRef } from '@/payload/osm/line-edits';
import type { RouteStatus } from './route-tool';

/** Follow trails' controls, and what the network is doing. */
export function RouteBar({
  isManual,
  onCancel,
  onFinish,
  onToggleManual,
  status,
}: {
  isManual: boolean;
  onCancel: () => void;
  onFinish: () => void;
  onToggleManual?: () => void;
  status: RouteStatus;
}) {
  const networkText =
    status.networkMessage ??
    (status.network === 'ready' ? 'Network loaded for this area.' : null);
  return (
    <div
      aria-label={onToggleManual ? 'Route construction' : 'Follow trails'}
      className="mb-2 flex flex-wrap items-center gap-1.5"
      role="group"
    >
      {onToggleManual && (
        <ModeButton
          active={isManual}
          disabled={false}
          label="Manual points"
          onClick={onToggleManual}
        />
      )}
      <ModeButton
        active={false}
        disabled={status.waypoints < 2}
        isToggle={false}
        label="Finish route"
        onClick={onFinish}
      />
      <ModeButton
        active={false}
        disabled={status.waypoints === 0}
        isToggle={false}
        label="Cancel route"
        onClick={onCancel}
      />
      {networkText && (
        <span
          aria-live="polite"
          className={cn(
            'text-[0.8rem]',
            status.network === 'error'
              ? 'text-[color:var(--theme-error-500,#c00)]'
              : 'text-[color:var(--theme-elevation-600)]',
          )}
        >
          {networkText}
        </span>
      )}
      {status.note && (
        <span
          aria-live="polite"
          className="basis-full text-[0.8rem] text-[color:var(--theme-warning-600,#b45309)]"
        >
          {status.note}
        </span>
      )}
    </div>
  );
}

/** Select points' operations, with the selection they will act on. */
export function SelectBar({
  onClear,
  onDelete,
  onJoin,
  onReverse,
  onSelectAll,
  onSimplify,
  onSplit,
  onTolerance,
  pieces,
  selection,
  toleranceMeters,
}: {
  onClear: () => void;
  onDelete: () => void;
  onJoin: () => void;
  onReverse: () => void;
  onSelectAll: () => void;
  onSimplify: () => void;
  onSplit: () => void;
  onTolerance: (meters: number) => void;
  pieces: number;
  selection: PointRef[];
  toleranceMeters: number;
}) {
  const selectedPieces = partsOf(selection).length;
  const hasSelection = selection.length > 0;
  const summary = hasSelection
    ? `${plural(selection.length, 'point')} selected${pieces > 1 ? ` on ${plural(selectedPieces, 'piece')}` : ''}`
    : 'Nothing selected — tools act on the whole line';

  return (
    <div
      aria-label="Point tools"
      className="mb-2 flex flex-wrap items-center gap-1.5"
      role="group"
    >
      <span className="mr-1 text-[0.8rem] text-[color:var(--theme-elevation-600)]">
        {summary}
      </span>
      <ModeButton
        active={false}
        isToggle={false}
        label="Select all"
        onClick={onSelectAll}
      />
      <ModeButton
        active={false}
        disabled={!hasSelection}
        isToggle={false}
        label="Clear"
        onClick={onClear}
      />
      <span
        aria-hidden
        className="mx-1 h-4 w-px bg-[var(--theme-elevation-150)]"
      />
      <ModeButton
        active={false}
        disabled={!hasSelection}
        isToggle={false}
        label="Delete points"
        onClick={onDelete}
      />
      <ModeButton
        active={false}
        disabled={!hasSelection}
        isToggle={false}
        label="Split at points"
        onClick={onSplit}
      />
      <ModeButton
        active={false}
        disabled={hasSelection ? selectedPieces < 2 : pieces < 2}
        isToggle={false}
        label="Join pieces"
        onClick={onJoin}
      />
      <ModeButton
        active={false}
        isToggle={false}
        label="Reverse"
        onClick={onReverse}
      />
      <span className="inline-flex items-center gap-1">
        <ModeButton
          active={false}
          isToggle={false}
          label="Simplify"
          onClick={onSimplify}
        />
        <select
          aria-label="Simplify tolerance"
          className="rounded-[var(--style-radius-s,4px)] border border-solid border-[color:var(--theme-elevation-150)] bg-[var(--theme-elevation-50)] px-1 py-1 text-[0.8rem] text-[color:var(--theme-elevation-800)]"
          onChange={(event) => onTolerance(Number(event.target.value))}
          value={toleranceMeters}
        >
          {SIMPLIFY_TOLERANCES_M.map((meters) => (
            <option key={meters} value={meters}>
              {meters} m
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}

export function ModeButton({
  active,
  disabled,
  isToggle = true,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  isToggle?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={isToggle ? active : undefined}
      className={cn(
        'rounded-[var(--style-radius-s,4px)] border border-solid border-[color:var(--theme-elevation-150)] px-2.5 py-1 text-[0.8rem] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--theme-elevation-800)] disabled:cursor-not-allowed disabled:opacity-50',
        active
          ? 'bg-[var(--theme-elevation-800)] text-[color:var(--theme-elevation-0)]'
          : 'bg-[var(--theme-elevation-50)] text-[color:var(--theme-elevation-800)] hover:bg-[var(--theme-elevation-100)]',
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

export function plural(count: number, noun: string): string {
  return `${count.toLocaleString()} ${noun}${count === 1 ? '' : 's'}`;
}

/** The default 3 m tolerance matches GPX import. */
const SIMPLIFY_TOLERANCES_M = [1, 3, 5, 10, 20] as const;
