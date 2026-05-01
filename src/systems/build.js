// Building construction progression.  A worker assigned to a half-built
// building walks to it and "builds" it over time.  We just auto-progress
// once a worker is adjacent.

import { SIM_DT, BUILDING_DEFS, TILE } from '../config.js';
import { distSq } from '../entities/entity.js';

export function updateBuild(game) {
  const dt = SIM_DT;
  for (const e of game.entities) {
    if (e.kind !== 'unit') continue;
    if (e.state !== 'build') continue;
    const b = e.target;
    if (!b || b.kind !== 'building' || b.hp <= 0 || b.state === 'built') {
      e.state = 'idle';
      e.target = null;
      continue;
    }
    const reach = Math.max(b.tilesW, b.tilesH) * TILE / 2 + 6;
    if (distSq(e, b) < reach * reach) {
      // Building
      e.path = null;
      e.pathIndex = 0;
      const def = BUILDING_DEFS[b.type];
      const rate = 1 / def.buildTime; // progress per second
      b.buildProgress = Math.min(1, b.buildProgress + rate * dt);
      b.hp = Math.min(b.maxHp, b.hp + (b.maxHp / def.buildTime) * dt);
      if (b.buildProgress >= 1) {
        b.state = 'built';
        b.hp = b.maxHp;
        e.state = 'idle';
        e.target = null;
      }
    }
  }
}
