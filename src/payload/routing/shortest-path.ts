import { MinHeap } from './min-heap';

export interface SearchEdge {
  to: number;
}

/** A* traversal shared by distance-only tracing and weighted route planning. */
export function shortestPath<Edge extends SearchEdge>(
  start: number,
  end: number,
  neighbours: (node: number) => Edge[],
  heuristic: (node: number) => number,
  edgeCost: (edge: Edge) => number,
): { edge: Edge; node: number }[] | null {
  if (start === end) return [];
  const costs = new Map<number, number>([[start, 0]]);
  const previous = new Map<number, { edge: Edge; from: number }>();
  const settled = new Set<number>();
  const queue = new MinHeap();
  queue.push(start, heuristic(start));
  // Each graph node is settled once. Stale heap entries are skipped.
  while (queue.size > 0) {
    const node = queue.pop();
    if (settled.has(node)) continue;
    if (node === end) break;
    settled.add(node);
    const base = costs.get(node) ?? Number.POSITIVE_INFINITY;
    for (const edge of neighbours(node)) {
      const next = base + edgeCost(edge);
      if (next < (costs.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        costs.set(edge.to, next);
        previous.set(edge.to, { edge, from: node });
        queue.push(edge.to, next + heuristic(edge.to));
      }
    }
  }
  if (!previous.has(end)) return null;
  const hops: { edge: Edge; node: number }[] = [];
  // A predecessor chain contains at most one hop per settled node plus the goal.
  for (let node = end; node !== start; ) {
    const step = previous.get(node);
    if (!step) return null;
    hops.push({ edge: step.edge, node });
    node = step.from;
  }
  return hops.reverse();
}
