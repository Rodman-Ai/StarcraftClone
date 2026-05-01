// Movement and path-following.
// - Each unit follows its `path` waypoints if any, snapping to the next once
//   close enough.
// - Soft-separation push is computed from neighbors via the spatial hash.

import { TILE, SIM_DT } from '../config.js';
import { dirFromAngle } from '../render/sprites.js';

const ARRIVE_DIST = 8;

export function updateMovement(game) {
  const dt = SIM_DT;
  for (const e of game.entities) {
    if (e.kind !== 'unit') continue;
    if (e.state !== 'move' && e.state !== 'attackmove'
        && e.state !== 'gather' && e.state !== 'return'
        && e.state !== 'attack' && e.state !== 'build') continue;

    if (!e.path || e.pathIndex >= e.path.length) {
      // No path. If we have a target position, just drift (rare).
      continue;
    }

    const wp = e.path[e.pathIndex];
    const dx = wp.x - e.x;
    const dy = wp.y - e.y;
    const dist = Math.hypot(dx, dy);

    // Are we close enough to advance?
    if (dist < ARRIVE_DIST) {
      e.pathIndex++;
      if (e.pathIndex >= e.path.length) {
        e.path = null;
        e.pathIndex = 0;
        // arrival callback: leave state to caller (combat / gather logic)
        if (e.state === 'move' || e.state === 'attackmove') {
          e.state = 'idle';
        }
        continue;
      }
    }

    // Direction vector
    let vx = dx / Math.max(0.001, dist);
    let vy = dy / Math.max(0.001, dist);

    // Soft-separation from same-team unit neighbors
    let pushX = 0, pushY = 0;
    const r = e.radius * 2.2;
    game.spatial.forEachInRadius(e.x, e.y, r, other => {
      if (other === e) return;
      if (other.kind !== 'unit') return;
      if (other.team !== e.team) return;
      const ddx = e.x - other.x;
      const ddy = e.y - other.y;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 < 0.001) { pushX += (Math.random() - 0.5) * 0.2; pushY += (Math.random() - 0.5) * 0.2; return; }
      const f = (1 - Math.min(1, Math.sqrt(d2) / r));
      pushX += (ddx / Math.sqrt(d2)) * f * 0.6;
      pushY += (ddy / Math.sqrt(d2)) * f * 0.6;
    });

    vx += pushX;
    vy += pushY;
    const vmag = Math.hypot(vx, vy);
    if (vmag > 0.001) { vx /= vmag; vy /= vmag; }

    // Move
    const step = e.speed * dt;
    let nx = e.x + vx * step;
    let ny = e.y + vy * step;

    // Tile collision: if next tile is blocked, project to passable
    const tx = Math.floor(nx / TILE);
    const ty = Math.floor(ny / TILE);
    if (!game.map.isPassable(tx, ty)) {
      // try x or y separately
      const tx2 = Math.floor(nx / TILE);
      const ty1 = Math.floor(e.y / TILE);
      if (game.map.isPassable(tx2, ty1)) {
        ny = e.y;
      } else {
        const tx1 = Math.floor(e.x / TILE);
        const ty2 = Math.floor(ny / TILE);
        if (game.map.isPassable(tx1, ty2)) {
          nx = e.x;
        } else {
          nx = e.x; ny = e.y;
        }
      }
    }

    e.x = nx;
    e.y = ny;

    // Animate
    if (vmag > 0.01) {
      e.facing = dirFromAngle(Math.atan2(vy, vx));
      e.walkTimer += dt;
      if (e.walkTimer > 0.18) {
        e.walkTimer = 0;
        e.walkFrame = (e.walkFrame + 1) % 2;
      }
    }
  }
}
