// Building training queues.

import { SIM_DT, BUILDING_DEFS, UNIT_DEFS, TILE } from '../config.js';
import { createUnit } from '../entities/entity.js';
import { findPath, smoothPath } from '../world/pathfind.js';

export function updateTraining(game) {
  const dt = SIM_DT;
  for (const b of game.entities) {
    if (b.kind !== 'building') continue;
    if (b.state !== 'built') continue;
    if (b.trainQueue.length === 0) continue;

    const player = game.players[b.team];
    const cur = b.trainQueue[0];
    cur.timeLeft -= dt;
    if (cur.timeLeft <= 0) {
      const def = UNIT_DEFS[cur.type];
      const spawn = pickSpawnTile(game, b);
      if (spawn) {
        const u = createUnit(cur.type, b.team, spawn.x, spawn.y);
        u.homeBase = b;
        // If rally point set, send unit there via pathfinding
        if (b.rallyPoint) {
          const tx = Math.floor(b.rallyPoint.x / TILE);
          const ty = Math.floor(b.rallyPoint.y / TILE);
          const path = findPath(game.map, u.x, u.y, tx, ty);
          if (path) {
            u.path = smoothPath(path);
            u.pathIndex = 0;
            u.state = 'move';
            u.targetPos = { x: b.rallyPoint.x, y: b.rallyPoint.y };
          }
        } else if (def.role === 'worker') {
          // Auto-gather: workers default to nearest crystal
          const crystal = nearestCrystal(game, u);
          if (crystal) {
            u.target = crystal;
            u.carryingFrom = crystal;
            u.state = 'gather';
            const path = findPath(game.map, u.x, u.y, crystal.tx, crystal.ty);
            if (path) {
              u.path = smoothPath(path);
              u.pathIndex = 0;
            }
          }
        }
        game.entities.push(u);
        player.supplyUsed += def.supply;
      }
      b.trainQueue.shift();
    }
  }
}

function nearestCrystal(game, unit) {
  let best = null;
  let bestD = Infinity;
  for (const e of game.entities) {
    if (e.kind !== 'resource' || e.amount <= 0) continue;
    const d = (e.x - unit.x) ** 2 + (e.y - unit.y) ** 2;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

function pickSpawnTile(game, b) {
  const def = BUILDING_DEFS[b.type];
  // Try tiles around the building footprint
  const candidates = [];
  for (let i = 0; i < def.tilesW + 2; i++) {
    candidates.push({ tx: b.tx - 1 + i, ty: b.ty + def.tilesH });
    candidates.push({ tx: b.tx - 1 + i, ty: b.ty - 1 });
  }
  for (let i = 0; i < def.tilesH + 2; i++) {
    candidates.push({ tx: b.tx - 1, ty: b.ty - 1 + i });
    candidates.push({ tx: b.tx + def.tilesW, ty: b.ty - 1 + i });
  }
  for (const c of candidates) {
    if (game.map.isPassable(c.tx, c.ty)) {
      return { x: c.tx * TILE + TILE / 2, y: c.ty * TILE + TILE / 2 };
    }
  }
  // fallback: edge of building
  return { x: b.x, y: b.y + def.tilesH * TILE / 2 };
}

export function tryQueueUnit(game, building, unitType) {
  if (!BUILDING_DEFS[building.type].trains.includes(unitType)) return false;
  const def = UNIT_DEFS[unitType];
  const player = game.players[building.team];
  if (player.resources < def.cost) {
    if (building.team === 0) game.message('Not enough Dark Matter');
    return false;
  }
  const room = computeSupplyRoom(game, building.team);
  if (room < def.supply) {
    if (building.team === 0) game.message('Not enough supply — build more Garages');
    return false;
  }
  if (building.trainQueue.length >= 5) return false;
  player.resources -= def.cost;
  building.trainQueue.push({
    type: unitType,
    timeLeft: def.buildTime,
    totalTime: def.buildTime,
  });
  return true;
}

export function computeSupplyRoom(game, team) {
  let cap = 0, used = 0;
  for (const e of game.entities) {
    if (e.kind === 'building' && e.team === team && e.state === 'built') {
      cap += BUILDING_DEFS[e.type].suppliesProvided || 0;
    }
    if (e.kind === 'unit' && e.team === team) {
      used += UNIT_DEFS[e.type].supply;
    }
  }
  game.players[team].supplyCap = cap;
  game.players[team].supplyUsed = used;
  return cap - used;
}
