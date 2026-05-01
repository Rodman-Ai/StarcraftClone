// Simple BFS on the tile grid with a small per-frame cache.
// We use BFS (not A*) because the map is small and BFS is dead simple.
// 4-connected (no diagonals through corners) keeps movement clean.

import { TILE } from '../config.js';

const MAX_NODES = 800;

// Cache key = `${gx},${gy}` of the goal tile; we store a parents array
// keyed by tile index, computed in a single backward BFS from the goal.
// Multiple units sharing a goal can reuse the same map.
const cache = new Map();
const CACHE_TTL = 1.0; // seconds
let cacheTime = 0;

export function tickCache(dt) {
  cacheTime += dt;
  if (cacheTime > CACHE_TTL) {
    cache.clear();
    cacheTime = 0;
  }
}

export function clearPathCache() { cache.clear(); cacheTime = 0; }

function bfsFromGoal(map, goalIdx) {
  const w = map.w, h = map.h;
  const parent = new Int32Array(w * h);
  parent.fill(-1);
  parent[goalIdx] = goalIdx;
  const queue = [goalIdx];
  let head = 0;
  let visited = 0;
  while (head < queue.length && visited < MAX_NODES) {
    const cur = queue[head++];
    visited++;
    const cx = cur % w;
    const cy = (cur / w) | 0;
    const neigh = [
      [cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1],
    ];
    for (let i = 0; i < neigh.length; i++) {
      const [nx, ny] = neigh[i];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nIdx = ny * w + nx;
      if (parent[nIdx] !== -1) continue;
      // For pathing toward a goal we still need to allow walking through the
      // goal tile itself even if marked occupied (e.g. a crystal). The unit
      // will stop adjacent. We treat the goal as walkable here:
      if (nIdx !== goalIdx && !map.isPassable(nx, ny)) continue;
      parent[nIdx] = cur;
      queue.push(nIdx);
    }
  }
  return parent;
}

// Returns an array of world-space waypoints from (sx, sy) toward goal tile.
// If goal is unreachable, returns null.
export function findPath(map, startWX, startWY, goalTX, goalTY) {
  if (!map.inBounds(goalTX, goalTY)) return null;
  const goalIdx = goalTY * map.w + goalTX;
  let parent = cache.get(goalIdx);
  if (!parent) {
    parent = bfsFromGoal(map, goalIdx);
    cache.set(goalIdx, parent);
  }

  const sTx = Math.floor(startWX / TILE);
  const sTy = Math.floor(startWY / TILE);
  if (!map.inBounds(sTx, sTy)) return null;
  let cur = sTy * map.w + sTx;

  // If start tile has no parent, find nearest reachable neighbor that does.
  if (parent[cur] === -1) {
    let best = -1;
    let bestDist = Infinity;
    for (let r = 1; r < 6 && best === -1; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const nx = sTx + dx, ny = sTy + dy;
          if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
          const nIdx = ny * map.w + nx;
          if (parent[nIdx] !== -1) {
            const d = dx * dx + dy * dy;
            if (d < bestDist) { bestDist = d; best = nIdx; }
          }
        }
      }
    }
    if (best === -1) return null;
    cur = best;
  }

  const points = [];
  let safety = 200;
  while (safety-- > 0) {
    const cx = cur % map.w;
    const cy = (cur / map.w) | 0;
    points.push({ x: cx * TILE + TILE / 2, y: cy * TILE + TILE / 2 });
    if (cur === goalIdx) break;
    const next = parent[cur];
    if (next === cur || next === -1) break;
    cur = next;
  }

  // Drop the first point if we're already on it
  if (points.length > 1) {
    const p0 = points[0];
    const dx = p0.x - startWX;
    const dy = p0.y - startWY;
    if (dx * dx + dy * dy < (TILE * 0.4) ** 2) points.shift();
  }
  return points;
}

// Smooth: collapse colinear waypoints (helps with the BFS produced staircase).
export function smoothPath(points) {
  if (!points || points.length < 3) return points;
  const out = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    const c = points[i + 1];
    const ax = b.x - a.x, ay = b.y - a.y;
    const bx = c.x - b.x, by = c.y - b.y;
    // skip if direction unchanged (parallel)
    if (Math.abs(ax * by - ay * bx) < 0.01) continue;
    out.push(b);
  }
  out.push(points[points.length - 1]);
  return out;
}
