// Worker gather → return → deposit cycle.

import { SIM_DT, HARVEST_AMOUNT, HARVEST_TIME, TILE, TEAM } from '../config.js';
import { findPath, smoothPath } from '../world/pathfind.js';
import { distSq } from '../entities/entity.js';

const GATHER_RANGE = 22;
const DEPOSIT_RANGE = 36;

export function updateGather(game) {
  const dt = SIM_DT;
  for (const e of game.entities) {
    if (e.kind !== 'unit') continue;
    if (e.state !== 'gather' && e.state !== 'return') continue;

    if (e.state === 'gather') {
      const node = e.target;
      if (!node || node.kind !== 'resource' || node.amount <= 0) {
        // pick another nearby crystal if possible
        const newNode = game.spatial.closest(e.x, e.y, 200, o => o.kind === 'resource' && o.amount > 0);
        if (newNode) {
          e.target = newNode;
          repathToTile(game, e, newNode.tx, newNode.ty);
        } else {
          e.state = 'idle';
          e.target = null;
          e.path = null;
        }
        continue;
      }
      const d2 = distSq(e, node);
      if (d2 < GATHER_RANGE * GATHER_RANGE) {
        // harvesting
        e.path = null;
        e.pathIndex = 0;
        e.gatherTimer = (e.gatherTimer || 0) + dt;
        if (e.gatherTimer >= HARVEST_TIME) {
          e.gatherTimer = 0;
          const take = Math.min(HARVEST_AMOUNT, node.amount);
          node.amount -= take;
          e.carrying += take;
          e.carryingFrom = node;
          // Return to base
          e.state = 'return';
          if (!e.homeBase || e.homeBase.hp <= 0) {
            e.homeBase = findNearestDepot(game, e);
          }
          if (e.homeBase) {
            repathToTile(game, e, e.homeBase.tx + 1, e.homeBase.ty + 1);
          } else {
            e.state = 'idle';
          }
        }
      } else if (!e.path || e.pathIndex >= e.path.length) {
        repathToTile(game, e, node.tx, node.ty);
      }
    } else if (e.state === 'return') {
      const base = e.homeBase;
      if (!base || base.hp <= 0) {
        e.homeBase = findNearestDepot(game, e);
        if (!e.homeBase) { e.state = 'idle'; continue; }
        repathToTile(game, e, e.homeBase.tx + 1, e.homeBase.ty + 1);
        continue;
      }
      const d2 = distSq(e, base);
      if (d2 < (DEPOSIT_RANGE + base.radius) * (DEPOSIT_RANGE + base.radius)) {
        // deposit
        const player = game.players[e.team];
        player.resources += e.carrying;
        e.carrying = 0;
        // Go back to source
        if (e.carryingFrom && e.carryingFrom.amount > 0) {
          e.target = e.carryingFrom;
          e.state = 'gather';
          repathToTile(game, e, e.carryingFrom.tx, e.carryingFrom.ty);
        } else {
          // find another node
          const next = game.spatial.closest(e.x, e.y, 400, o => o.kind === 'resource' && o.amount > 0);
          if (next) {
            e.target = next;
            e.carryingFrom = next;
            e.state = 'gather';
            repathToTile(game, e, next.tx, next.ty);
          } else {
            e.state = 'idle';
            e.target = null;
          }
        }
      } else if (!e.path || e.pathIndex >= e.path.length) {
        repathToTile(game, e, base.tx + 1, base.ty + 1);
      }
    }
  }
}

function repathToTile(game, e, tx, ty) {
  const path = findPath(game.map, e.x, e.y, tx, ty);
  if (path) {
    e.path = smoothPath(path);
    e.pathIndex = 0;
  }
}

function findNearestDepot(game, unit) {
  let best = null;
  let bestD = Infinity;
  for (const ent of game.entities) {
    if (ent.kind !== 'building') continue;
    if (ent.team !== unit.team) continue;
    if (ent.state !== 'built') continue;
    if (ent.type !== 'garage' && ent.type !== 'fedhq') continue;
    const d = (ent.x - unit.x) ** 2 + (ent.y - unit.y) ** 2;
    if (d < bestD) { bestD = d; best = ent; }
  }
  return best;
}
