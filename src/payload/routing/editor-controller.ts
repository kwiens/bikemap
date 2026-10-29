import { createEditHistory } from '@/payload/osm/edit-history';
import { MAX_LEG_CELLS, type CellKey } from './cells';
import {
  snapToGraph,
  SNAP_METERS,
  type Position,
  type RouteGraph,
} from './graph';
import { cellsAround, cellsForLeg } from './network-store';
import {
  appendWaypoint,
  closeLoop,
  EMPTY_PLAN,
  insertWaypoint,
  MAX_WAYPOINTS,
  moveWaypoint,
  removeWaypoint,
  replacePendingLeg,
  reversePlan,
  setLegMode,
  straightLeg,
  unroutedLegs,
  type LegMode,
  type PlanEdit,
  type RouteLeg,
  type RoutePlan,
} from './plan';
import { routeLeg } from './router';

interface EditorNetwork {
  ensure(keys: CellKey[]): Promise<void>;
  graphFor(keys: CellKey[]): RouteGraph | null;
}

export interface RouteEditorState {
  plan: RoutePlan;
  canUndo: boolean;
  canRedo: boolean;
  routing: number;
  note: string | null;
}

export interface RouteEditorController {
  getSnapshot(): RouteEditorState;
  subscribe(listener: () => void): () => void;
  /** Reattach after React's effect replay without replacing the document. */
  activate(): void;
  dispose(): void;
  setReadOnly(readOnly: boolean): void;
  replacePlan(plan: RoutePlan): void;
  ensureCells(keys: CellKey[]): Promise<boolean>;
  addWaypoint(point: Position, legIndex?: number): Promise<void>;
  moveWaypoint(index: number, from: Position, to: Position): Promise<void>;
  removeWaypoint(index: number, point?: Position): Promise<void>;
  setLegMode(index: number, mode: LegMode): Promise<void>;
  reverse(): Promise<void>;
  closeLoop(): Promise<void>;
  clear(): Promise<void>;
  undo(): void;
  redo(): void;
}

/** Owns the editable document and async work; knows nothing about Mapbox or Payload. */
export function createRouteEditorController(
  initial: RoutePlan,
  network: EditorNetwork,
  onPlanChange: (plan: RoutePlan) => void,
): RouteEditorController {
  let state: RouteEditorState = {
    plan: initial,
    canUndo: false,
    canRedo: false,
    routing: 0,
    note: null,
  };
  // Plans are immutable. Preserve leg identities for pending-result checks.
  const history = createEditHistory<RoutePlan>((value) => value);
  const listeners = new Set<() => void>();
  let isDisposed = false;
  let isReadOnly = false;
  let session = 0;
  let editGeneration = 0;
  let clickQueue = Promise.resolve();

  function update(patch: Partial<RouteEditorState>) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }
  function cancelClicks() {
    editGeneration += 1;
    clickQueue = Promise.resolve();
  }
  function isCurrent(startedSession: number) {
    return !isDisposed && startedSession === session;
  }
  function showPlan(plan: RoutePlan) {
    state = {
      ...state,
      plan,
      canUndo: history.canUndo(),
      canRedo: history.canRedo(),
    };
    onPlanChange(plan);
    for (const listener of listeners) listener();
  }
  async function ensureCells(keys: CellKey[]): Promise<boolean> {
    const startedSession = session;
    try {
      await network.ensure(keys);
      return true;
    } catch (error) {
      if (isCurrent(startedSession))
        update({
          note: `Some trails and roads could not be loaded from OpenStreetMap: ${message(error)}. Legs there are drawn straight; move a waypoint to retry.`,
        });
      return false;
    }
  }
  async function snapPoint(point: Position): Promise<Position> {
    const keys = cellsAround(point);
    await ensureCells(keys);
    const graph = network.graphFor(keys);
    return (
      (graph ? snapToGraph(graph, point, SNAP_METERS)?.point : null) ?? point
    );
  }
  async function routeOne(
    from: Position,
    to: Position,
    mode: LegMode,
  ): Promise<RouteLeg> {
    if (mode === 'straight') return straightLeg(from, to, mode);
    const keys = cellsForLeg(from, to);
    if (keys.length > MAX_LEG_CELLS) {
      update({
        note: 'Two waypoints are too far apart to route between. Add a waypoint in between.',
      });
      return straightLeg(from, to, 'network');
    }
    await ensureCells(keys);
    const graph = network.graphFor(keys);
    return graph
      ? routeLeg(graph, from, to, mode)
      : straightLeg(from, to, mode);
  }
  async function routeLegs(target: RoutePlan, indexes: number[]) {
    if (indexes.length === 0) return;
    const startedSession = session;
    update({ routing: state.routing + 1 });
    try {
      const routed = await Promise.all(
        indexes.map(async (index) => {
          const from = target.waypoints[index];
          const to = target.waypoints[index + 1];
          const leg = target.legs[index];
          return from && to && leg
            ? { index, leg: await routeOne(from, to, leg.mode) }
            : null;
        }),
      );
      if (!isCurrent(startedSession) || isReadOnly) return;
      let next = state.plan;
      for (const result of routed) {
        if (result)
          next = replacePendingLeg(next, target, result.index, result.leg);
      }
      if (next !== state.plan) showPlan(next);
    } catch (error) {
      if (isCurrent(startedSession))
        update({
          note: `The route could not be calculated: ${message(error)}`,
        });
    } finally {
      if (isCurrent(startedSession)) update({ routing: state.routing - 1 });
    }
  }
  async function apply(
    edit: (plan: RoutePlan) => PlanEdit,
    keepQueuedClicks = false,
  ) {
    if (isDisposed || isReadOnly) return;
    if (!keepQueuedClicks) cancelClicks();
    const before = state.plan;
    const { plan, reroute } = edit(before);
    if (plan === before) return;
    history.push(before);
    state = { ...state, note: null };
    showPlan(plan);
    await routeLegs(plan, reroute);
  }
  function stepHistory(direction: 'undo' | 'redo') {
    if (isDisposed || isReadOnly) return;
    cancelClicks();
    const target = history[direction](state.plan);
    if (!target) return;
    showPlan(target);
    void routeLegs(target, unroutedLegs(target));
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    activate() {
      isDisposed = false;
    },
    dispose() {
      isDisposed = true;
      session += 1;
      cancelClicks();
      state = { ...state, routing: 0 };
    },
    setReadOnly(readOnly) {
      isReadOnly = readOnly;
    },
    replacePlan(plan) {
      session += 1;
      cancelClicks();
      history.clear();
      update({ plan, canUndo: false, canRedo: false, routing: 0, note: null });
    },
    ensureCells,
    addWaypoint(point, legIndex = -1) {
      if (isDisposed || isReadOnly) return Promise.resolve();
      const from = state.plan.waypoints[legIndex];
      const to = state.plan.waypoints[legIndex + 1];
      const generation = editGeneration;
      // Start snaps together, but commit in click order. Observe rejection now,
      // even if an earlier click is still waiting on its own network cell.
      const snapped = snapPoint(point).then(
        (position) => ({ position, error: null }),
        (error: unknown) => ({ position: null, error }),
      );
      clickQueue = clickQueue.then(async () => {
        const result = await snapped;
        if (isDisposed || isReadOnly || generation !== editGeneration) return;
        if (!result.position) {
          update({
            note: `Could not place route waypoint: ${message(result.error)}`,
          });
          return;
        }
        if (state.plan.waypoints.length >= MAX_WAYPOINTS) {
          update({
            note: `A route can have at most ${MAX_WAYPOINTS} waypoints.`,
          });
          return;
        }
        const index =
          from && to
            ? state.plan.legs.findIndex(
                (_, i) =>
                  state.plan.waypoints[i] === from &&
                  state.plan.waypoints[i + 1] === to,
              )
            : -1;
        if (from && to && index < 0) {
          update({
            note: 'That leg changed while loading. Click it again to insert a waypoint.',
          });
          return;
        }
        const position = result.position;
        void apply(
          (current) =>
            index >= 0
              ? insertWaypoint(current, index, position)
              : appendWaypoint(current, position),
          true,
        );
      });
      return clickQueue;
    },
    async moveWaypoint(index, from, to) {
      if (isDisposed || isReadOnly) return;
      // The latest drag supersedes earlier snaps as soon as it starts.
      cancelClicks();
      const generation = editGeneration;
      try {
        const position = await snapPoint(to);
        if (isDisposed || isReadOnly || generation !== editGeneration) return;
        await apply((current) =>
          moveWaypoint(current, waypointIndex(current, index, from), position),
        );
      } catch (error) {
        if (!isDisposed && generation === editGeneration)
          update({ note: `Could not move route waypoint: ${message(error)}` });
      }
    },
    removeWaypoint(index, point) {
      return apply((current) =>
        removeWaypoint(
          current,
          point ? waypointIndex(current, index, point) : index,
        ),
      );
    },
    setLegMode: (index, mode) =>
      apply((current) => setLegMode(current, index, mode)),
    reverse: () => apply(reversePlan),
    closeLoop: () => apply(closeLoop),
    clear: () => apply(() => ({ plan: EMPTY_PLAN, reroute: [] })),
    undo: () => stepHistory('undo'),
    redo: () => stepHistory('redo'),
  };
}

function waypointIndex(
  plan: RoutePlan,
  index: number,
  point: Position,
): number {
  function same(candidate: Position | undefined) {
    return candidate?.[0] === point[0] && candidate?.[1] === point[1];
  }
  return same(plan.waypoints[index]) ? index : plan.waypoints.findIndex(same);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
