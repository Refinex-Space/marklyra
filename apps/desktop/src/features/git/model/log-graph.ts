/**
 * Commit graph lanes for the log view (like IDEA / `git log --graph`). Pure TypeScript, no DOM.
 *
 * Each row is drawn in two halves around the commit node: `up` edges run from the row top to the
 * node height, `down` edges from the node height to the row bottom. Lanes keep their color for as
 * long as they live; freed columns are reused by new lanes, and one interior gap per row is closed
 * by shifting the lanes to its right one column left (a diagonal in the bottom half).
 */

/** Lane columns; drawn from `from` at one end of the half-row to `to` at the other. */
export interface GraphEdge {
  from: number;
  to: number;
  color: number;
}

export interface GraphRow {
  /** Column of this commit's node. */
  lane: number;
  /** Color index of the node (stable along a branch line); consumers use `% palette.length`. */
  color: number;
  /** Top half: from lane at row top (y=0) to lane at node height (y=0.5). */
  up: GraphEdge[];
  /** Bottom half: from lane at node height (y=0.5) to lane at row bottom (y=1). */
  down: GraphEdge[];
  /** Number of lanes used in this row (max column + 1 across up/down/node). */
  width: number;
  /** parents.length > 1 */
  merge: boolean;
}

interface Lane {
  /** The commit this lane is waiting for. */
  oid: string;
  color: number;
}

function firstFree(lanes: readonly (Lane | null)[]): number {
  const index = lanes.indexOf(null);
  return index === -1 ? lanes.length : index;
}

/**
 * Lays out commits given in display order (children before parents, as `git log --date-order`
 * emits). Parents missing from the list keep their lane running to the end. O(rows * lanes).
 */
export function layoutGraph(
  commits: readonly { oid: string; parents: readonly string[] }[],
): GraphRow[] {
  let lanes: (Lane | null)[] = [];
  let nextColor = 0;
  const rows: GraphRow[] = [];
  for (const commit of commits) {
    let lane = lanes.findIndex((entry) => entry?.oid === commit.oid);
    let color: number;
    if (lane === -1) {
      lane = firstFree(lanes);
      color = nextColor++;
    } else {
      color = lanes[lane]?.color ?? 0;
    }

    const up: GraphEdge[] = [];
    const next: (Lane | null)[] = [];
    lanes.forEach((entry, column) => {
      if (!entry) {
        next.push(null);
        return;
      }
      const converges = entry.oid === commit.oid;
      up.push({ from: column, to: converges ? lane : column, color: entry.color });
      next.push(converges ? null : entry);
    });
    while (next.length <= lane) next.push(null);

    // Edges leaving the node, as [slot in `next`, color].
    const outgoing: [number, number][] = [];
    const parents = [...new Set(commit.parents)];
    const [first, ...others] = parents;
    if (first !== undefined) {
      next[lane] = { oid: first, color };
      outgoing.push([lane, color]);
    }
    for (const parent of others) {
      let slot = next.findIndex((entry) => entry?.oid === parent);
      let edgeColor: number;
      if (slot === -1) {
        slot = firstFree(next);
        edgeColor = nextColor++;
        next[slot] = { oid: parent, color: edgeColor };
      } else {
        edgeColor = next[slot]?.color ?? 0;
      }
      outgoing.push([slot, edgeColor]);
    }

    while (next.length > 0 && next[next.length - 1] === null) next.pop();
    const gap = next.indexOf(null);
    const shifted = (column: number): number => (gap !== -1 && column > gap ? column - 1 : column);

    const down: GraphEdge[] = [];
    lanes.forEach((entry, column) => {
      if (entry && entry.oid !== commit.oid) {
        down.push({ from: column, to: shifted(column), color: entry.color });
      }
    });
    for (const [slot, edgeColor] of outgoing) {
      down.push({ from: lane, to: shifted(slot), color: edgeColor });
    }
    if (gap !== -1) next.splice(gap, 1);

    let width = lane + 1;
    for (const edge of up) width = Math.max(width, edge.from + 1, edge.to + 1);
    for (const edge of down) width = Math.max(width, edge.from + 1, edge.to + 1);
    rows.push({ lane, color, up, down, width, merge: commit.parents.length > 1 });
    lanes = next;
  }
  return rows;
}
