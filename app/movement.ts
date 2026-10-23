// World layout for the 3D garden, in metres on the ground plane (x = east, z = south).
// The player starts on the path at z = 14 facing north towards the pagoda.
// Every solid thing the player can bump into is listed here, so the 3D scene and
// the collision rules always come from the same numbers.
export type Position = { x: number; z: number };

export const BOUNDS = { minX: -27, maxX: 27, minZ: -27, maxZ: 25 };
export const START: Position = { x: 0, z: 14 };
export const START_HEADING = Math.PI; // facing -z (north)

export const PAGODA = { x: 0, z: -15, r: 7.2 };
export const SHOP = { x: -17, z: -6, hw: 5.2, hd: 3.6 }; // open front faces +z
export const TABLE = { x: -12, z: 11, r: 2.3 };
export const POND = { x: 14, z: 12, rx: 8, rz: 6 };
export const POSTS: Position[] = [
  { x: -24, z: -1 },
  { x: -6.5, z: -4 },
  { x: 6.5, z: -4 },
  { x: 24, z: -1 },
];
export const FRIENDS = {
  one: { x: -20.5, z: 12.2, heading: Math.PI / 2 },
  two: { x: -14.6, z: 9.2, heading: Math.PI * 0.2 },
  three: { x: -9.4, z: 9.2, heading: -Math.PI * 0.2 },
};

// Where each activity happens. The marker floats above this point.
export const SPOTS: Record<string, Position> = {
  lantern: { x: -18.5, z: 0.4 },
  fireworks: { x: -13.5, z: 0.4 },
  candles: { x: 0, z: -5.3 },
  balloon: { x: 13, z: -6 },
  lotus: { x: 4.6, z: 12.4 },
  eat: { x: -12, z: 15 },
  gift: { x: -18.5, z: 15.4 },
};
export const SPOT_RADIUS = 5;
// Which way the player turns after walking to each spot (radians, 0 = facing +z / south).
export const SPOT_FACING: Record<string, number> = {
  lantern: Math.PI,
  fireworks: Math.PI,
  candles: Math.PI,
  balloon: Math.PI,
  lotus: Math.PI / 2,
  eat: Math.PI,
  gift: Math.atan2(FRIENDS.one.x - SPOTS.gift.x, FRIENDS.one.z - SPOTS.gift.z),
};

/** Grid A* over the walkable area; returns waypoints (excluding the start) or null. */
export function findPath(from: Position, to: Position): Position[] | null {
  const CELL = 0.5,
    cols = Math.round((BOUNDS.maxX - BOUNDS.minX) / CELL) + 1,
    rows = Math.round((BOUNDS.maxZ - BOUNDS.minZ) / CELL) + 1;
  const cellOf = (p: Position) => [
    Math.min(cols - 1, Math.max(0, Math.round((p.x - BOUNDS.minX) / CELL))),
    Math.min(rows - 1, Math.max(0, Math.round((p.z - BOUNDS.minZ) / CELL))),
  ];
  const centre = (c: number, r: number): Position => ({
    x: BOUNDS.minX + c * CELL,
    z: BOUNDS.minZ + r * CELL,
  });
  const walk = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      walk[r * cols + c] = isWalkable(centre(c, r)) ? 1 : 2;
  const ok = (c: number, r: number) =>
    c >= 0 && r >= 0 && c < cols && r < rows && walk[r * cols + c] === 1;
  let [sc, sr] = cellOf(from);
  let [gc, gr] = cellOf(to);
  // Snap a blocked goal (e.g. a tap on the water) to the nearest walkable cell.
  if (!ok(gc, gr)) {
    let best = -1,
      bestD = Infinity;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (walk[r * cols + c] === 1) {
          const d = (c - gc) ** 2 + (r - gr) ** 2;
          if (d < bestD) (bestD = d), (best = r * cols + c);
        }
    if (best < 0) return null;
    (gc = best % cols), (gr = Math.floor(best / cols));
  }
  if (!ok(sc, sr)) walk[sr * cols + sc] = 1;
  const goal = gr * cols + gc,
    start = sr * cols + sc;
  const g = new Float32Array(cols * rows).fill(Infinity),
    came = new Int32Array(cols * rows).fill(-1),
    closed = new Uint8Array(cols * rows);
  const open: number[] = [start];
  g[start] = 0;
  const h = (i: number) =>
    Math.hypot((i % cols) - gc, Math.floor(i / cols) - gr);
  const f = (i: number) => g[i] + h(i);
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (f(open[i]) < f(open[bi])) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur === goal) break;
    closed[cur] = 1;
    const cc = cur % cols,
      cr = Math.floor(cur / cols);
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nc = cc + dc,
          nr = cr + dr;
        if (!ok(nc, nr) || (dc && dr && (!ok(cc + dc, cr) || !ok(cc, cr + dr))))
          continue;
        const ni = nr * cols + nc;
        if (closed[ni]) continue;
        const ng = g[cur] + (dc && dr ? Math.SQRT2 : 1);
        if (ng < g[ni]) {
          g[ni] = ng;
          came[ni] = cur;
          if (!open.includes(ni)) open.push(ni);
        }
      }
  }
  if (goal !== start && came[goal] < 0) return null;
  const cells: Position[] = [];
  for (let i = goal; i !== start && i >= 0; i = came[i])
    cells.unshift(centre(i % cols, Math.floor(i / cols)));
  if (ok(...(cellOf(to) as [number, number])))
    cells[cells.length - 1] = { ...to };
  // String-pulling: drop waypoints that are in direct line of sight.
  const clear = (a: Position, b: Position) => {
    const n = Math.ceil(distance(a, b) / 0.2);
    for (let i = 1; i <= n; i++)
      if (
        !isWalkable({
          x: a.x + ((b.x - a.x) * i) / n,
          z: a.z + ((b.z - a.z) * i) / n,
        })
      )
        return false;
    return true;
  };
  const out: Position[] = [];
  let anchor = from;
  for (let i = 0; i < cells.length; i++) {
    const next = cells[i + 1];
    if (!next || !clear(anchor, next)) {
      out.push(cells[i]);
      anchor = cells[i];
    }
  }
  return out;
}

const BODY = 0.45; // player's collision radius

export function distance(a: Position, b: Position) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
export function isNearTable(p: Position): boolean {
  return distance(p, TABLE) <= TABLE.r + 3.2;
}
export function isNearSpot(p: Position, id: string): boolean {
  return distance(p, SPOTS[id]) <= SPOT_RADIUS;
}
export function isWalkable(p: Position): boolean {
  if (
    p.x < BOUNDS.minX ||
    p.x > BOUNDS.maxX ||
    p.z < BOUNDS.minZ ||
    p.z > BOUNDS.maxZ
  )
    return false;
  if (distance(p, PAGODA) < PAGODA.r + BODY) return false;
  if (
    Math.abs(p.x - SHOP.x) < SHOP.hw + BODY &&
    Math.abs(p.z - SHOP.z) < SHOP.hd + BODY
  )
    return false;
  if (distance(p, TABLE) < TABLE.r + BODY) return false;
  for (const post of POSTS) if (distance(p, post) < 0.35 + BODY) return false;
  for (const f of Object.values(FRIENDS))
    if (distance(p, f) < 0.4 + BODY) return false;
  const ex = (p.x - POND.x) / (POND.rx + BODY),
    ez = (p.z - POND.z) / (POND.rz + BODY);
  return ex * ex + ez * ez >= 1;
}
export function moveCharacter(
  from: Position,
  dx: number,
  dz: number,
): Position {
  let p = { ...from };
  // Small steps stop a long frame from jumping through a wall.
  const steps = Math.max(
    1,
    Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.1),
  );
  for (let i = 0; i < steps; i++) {
    const x = p.x + dx / steps,
      z = p.z + dz / steps;
    if (isWalkable({ x, z })) {
      p = { x, z };
      continue;
    }
    // Keep the unblocked direction so the player slides along edges.
    if (isWalkable({ x, z: p.z })) p.x = x;
    else if (isWalkable({ x: p.x, z })) p.z = z;
  }
  return p;
}
