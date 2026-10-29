import { describe, expect, it, vi } from 'vitest';
import { createRouteEditorController } from './editor-controller';
import { buildRouteGraph, type Position } from './graph';
import { appendWaypoint, EMPTY_PLAN, type RoutePlan } from './plan';

const A: Position = [-121.4, 44];
const B: Position = [-121.399, 44.001];
const C: Position = [-121.398, 44.002];

function setup(initial = EMPTY_PLAN) {
  const network = {
    ensure: vi.fn().mockResolvedValue(undefined),
    graphFor: vi.fn().mockReturnValue(null),
  };
  const write = vi.fn();
  const controller = createRouteEditorController(initial, network, write);
  return { controller, network, write };
}

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function planThrough(...points: Position[]): RoutePlan {
  return points.reduce(
    (plan, point) => appendWaypoint(plan, point).plan,
    EMPTY_PLAN,
  );
}

async function settled(controller: ReturnType<typeof setup>['controller']) {
  await vi.waitFor(() => expect(controller.getSnapshot().routing).toBe(0));
}

describe('route editor controller', () => {
  it('owns waypoint edits, straight legs, reverse, loops, and history', async () => {
    const { controller } = setup();
    await controller.addWaypoint(A);
    await controller.addWaypoint(B);
    await controller.addWaypoint(C);
    await settled(controller);
    await controller.setLegMode(0, 'straight');
    expect(controller.getSnapshot().plan.legs[0]).toMatchObject({
      mode: 'straight',
      coordinates: [A, B],
    });
    await controller.reverse();
    await controller.closeLoop();
    expect(controller.getSnapshot().plan.waypoints).toEqual([C, B, A, C]);
    await controller.removeWaypoint(1);
    expect(controller.getSnapshot().plan.waypoints).toEqual([C, A, C]);
    controller.undo();
    expect(controller.getSnapshot().plan.waypoints).toEqual([C, B, A, C]);
    controller.redo();
    expect(controller.getSnapshot().plan.waypoints).toEqual([C, A, C]);
    await controller.clear();
    expect(controller.getSnapshot()).toMatchObject({
      plan: EMPTY_PLAN,
      canRedo: false,
      canUndo: true,
    });
    await settled(controller);
  });

  it('routes over the injected network and retains source metadata', async () => {
    const { controller, network } = setup();
    network.graphFor.mockReturnValue(
      buildRouteGraph({
        trails: [],
        ways: [
          {
            id: 1,
            name: 'Path',
            class: 'cycleway',
            hasBikeLane: false,
            nodes: [1, 2, 3],
            coordinates: [A, B, C],
          },
        ],
      }),
    );
    await controller.addWaypoint(A);
    await controller.addWaypoint(C);
    await settled(controller);
    const leg = controller.getSnapshot().plan.legs[0];
    expect(leg.coordinates).toEqual([A, B, C]);
    expect(leg.isUnrouted).toBeUndefined();
    expect(leg.steps[0].source).toMatchObject({ kind: 'osm', name: 'Path' });
  });

  it('commits clicks in order even if later snaps finish first', async () => {
    const { controller, network, write } = setup();
    const first = deferred();
    const second = deferred();
    network.ensure
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const a = controller.addWaypoint(A);
    const b = controller.addWaypoint(B);
    second.resolve();
    await Promise.resolve();
    expect(write).not.toHaveBeenCalled();
    first.resolve();
    await Promise.all([a, b]);
    expect(controller.getSnapshot().plan.waypoints).toEqual([A, B]);
    await settled(controller);
  });

  it('keeps the latest drag even when an earlier snap resolves first', async () => {
    const { controller, network, write } = setup(planThrough(A, B));
    const first = deferred();
    const second = deferred();
    network.ensure
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const oldDrag = controller.moveWaypoint(1, B, A);
    const newDrag = controller.moveWaypoint(1, B, C);
    first.resolve();
    await oldDrag;
    expect(write).not.toHaveBeenCalled();
    second.resolve();
    await newDrag;
    expect(controller.getSnapshot().plan.waypoints).toEqual([A, C]);
  });

  it('invalidates a pending drag when the document is replaced', async () => {
    const { controller, network, write } = setup(planThrough(A, B));
    const pending = deferred();
    network.ensure.mockReturnValueOnce(pending.promise);
    const drag = controller.moveWaypoint(1, B, C);
    const replacement = planThrough(C);
    controller.replacePlan(replacement);
    pending.resolve();
    await drag;
    expect(controller.getSnapshot()).toMatchObject({
      plan: replacement,
      canUndo: false,
      canRedo: false,
    });
    expect(write).not.toHaveBeenCalled();
  });

  it('does not apply old routing results to a replacement document', async () => {
    const { controller, network, write } = setup();
    await controller.addWaypoint(A);
    const pending = deferred();
    network.ensure
      .mockResolvedValueOnce(undefined)
      .mockReturnValueOnce(pending.promise);
    await controller.addWaypoint(B);
    expect(controller.getSnapshot().routing).toBe(1);
    const replacement = planThrough(C);
    controller.replacePlan(replacement);
    write.mockClear();
    pending.resolve();
    await vi.waitFor(() => expect(network.graphFor).toHaveBeenCalledTimes(3));
    expect(controller.getSnapshot()).toMatchObject({
      plan: replacement,
      routing: 0,
    });
    expect(write).not.toHaveBeenCalled();
  });

  it('survives effect teardown and reactivation without reviving old clicks', async () => {
    const { controller, network } = setup();
    const pending = deferred();
    network.ensure.mockReturnValueOnce(pending.promise);
    const oldClick = controller.addWaypoint(A);
    controller.dispose();
    controller.activate();
    await controller.addWaypoint(C);
    pending.resolve();
    await oldClick;
    expect(controller.getSnapshot().plan.waypoints).toEqual([C]);
  });

  it('leaves a pending leg unchanged when switched to a deliberate straight line', async () => {
    const { controller, network } = setup();
    await controller.addWaypoint(A);
    const pending = deferred();
    network.ensure
      .mockResolvedValueOnce(undefined)
      .mockReturnValueOnce(pending.promise);
    await controller.addWaypoint(B);
    await controller.setLegMode(0, 'straight');
    pending.resolve();
    await settled(controller);
    expect(controller.getSnapshot().plan.legs[0]).toEqual({
      coordinates: [A, B],
      mode: 'straight',
      steps: [expect.objectContaining({ source: { kind: 'straight' } })],
    });
  });

  it('blocks commands and pending snaps while read-only', async () => {
    const { controller, network, write } = setup(planThrough(A, B));
    const pending = deferred();
    network.ensure.mockReturnValueOnce(pending.promise);
    const click = controller.addWaypoint(C);
    controller.setReadOnly(true);
    await controller.clear();
    controller.undo();
    pending.resolve();
    await click;
    expect(controller.getSnapshot().plan.waypoints).toEqual([A, B]);
    expect(write).not.toHaveBeenCalled();
  });
});
