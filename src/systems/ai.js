// Galactic Federation AI — small FSM running at ~1 Hz.

import { SIM_DT, TILE, TEAM, AI, BUILDING_DEFS, UNIT_DEFS, MAP_W, MAP_H } from '../config.js';
import { findPath, smoothPath } from '../world/pathfind.js';
import { tryQueueUnit, computeSupplyRoom } from './training.js';
import { createBuilding } from '../entities/entity.js';

const TICK_INTERVAL = 1 / AI.tickHz;

export function updateAI(game) {
  const ai = game.aiState;
  ai.tick += SIM_DT;
  // Resource trickle bonus
  game.players[TEAM.ENEMY].resources += AI.trickleBonus * SIM_DT;
  if (ai.tick < TICK_INTERVAL) return;
  ai.tick = 0;

  const enemyEntities = countEntities(game, TEAM.ENEMY);
  const playerEntities = countEntities(game, TEAM.PLAYER);
  const playerHQ = findHQ(game, TEAM.PLAYER);
  const enemyHQ = findHQ(game, TEAM.ENEMY);

  // If we lost HQ, nothing more to do
  if (!enemyHQ) return;

  // ECONOMY: maintain at least minWorkers fed drones
  if (enemyEntities.workers < AI.minWorkers) {
    queueAtType(game, 'fedhq', 'fedworker');
  }

  // BARRACKS: build one if we don't have any
  if (enemyEntities.barracks === 0
      && game.players[TEAM.ENEMY].resources >= BUILDING_DEFS.fedbarracks.cost) {
    placeBuildingNearby(game, 'fedbarracks', enemyHQ);
  }

  // Build a second Garage for supply if running low
  computeSupplyRoom(game, TEAM.ENEMY);
  const room = game.players[TEAM.ENEMY].supplyCap - game.players[TEAM.ENEMY].supplyUsed;
  if (room < 3 && enemyEntities.hqs < 2
      && game.players[TEAM.ENEMY].resources >= BUILDING_DEFS.fedhq.cost) {
    placeBuildingNearby(game, 'fedhq', enemyHQ);
  }

  // ARMY: train soldiers + a commander or two
  if (enemyEntities.barracks > 0) {
    const wantsCommander = enemyEntities.commanders < 2;
    if (wantsCommander && game.players[TEAM.ENEMY].resources >= UNIT_DEFS.fedcommander.cost) {
      queueAtType(game, 'fedbarracks', 'fedcommander');
    } else {
      queueAtType(game, 'fedbarracks', 'fedsoldier');
    }
  }

  // ATTACK behavior: when army is large enough, send everyone toward player
  const army = enemyEntities.combatUnits;
  if (army >= AI.attackArmySize && playerHQ) {
    sendArmyAt(game, playerHQ);
    ai.attackCooldown = 8;
  } else if (ai.attackCooldown > 0) {
    ai.attackCooldown -= TICK_INTERVAL;
  }

  // Defensive: if enemy spotted near base, bring units back
  for (const e of game.entities) {
    if (e.team !== TEAM.PLAYER) continue;
    const d = (e.x - enemyHQ.x) ** 2 + (e.y - enemyHQ.y) ** 2;
    if (d < 250 * 250 && (e.kind === 'unit' || e.kind === 'building')) {
      // alert: send some units back to defend
      for (const u of game.entities) {
        if (u.team !== TEAM.ENEMY || u.kind !== 'unit') continue;
        if (UNIT_DEFS[u.type].role === 'worker') continue;
        const dd = (u.x - enemyHQ.x) ** 2 + (u.y - enemyHQ.y) ** 2;
        if (dd > 350 * 350) {
          // far away — recall toward HQ
          const tx = Math.floor((enemyHQ.x + (Math.random() - 0.5) * 60) / TILE);
          const ty = Math.floor((enemyHQ.y + (Math.random() - 0.5) * 60) / TILE);
          const path = findPath(game.map, u.x, u.y, tx, ty);
          if (path) { u.path = smoothPath(path); u.pathIndex = 0; u.state = 'move'; u.target = null; }
        }
      }
      break;
    }
  }
}

function queueAtType(game, buildingType, unitType) {
  for (const b of game.entities) {
    if (b.kind !== 'building') continue;
    if (b.team !== TEAM.ENEMY) continue;
    if (b.type !== buildingType) continue;
    if (b.state !== 'built') continue;
    if (b.trainQueue.length >= 2) continue;
    if (tryQueueUnit(game, b, unitType)) return true;
  }
  return false;
}

function placeBuildingNearby(game, type, anchor) {
  const def = BUILDING_DEFS[type];
  // Try a spiral of tile positions around anchor
  const ax = anchor.tx + 1;
  const ay = anchor.ty + 1;
  for (let r = 4; r < 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const tx = ax + dx;
        const ty = ay + dy;
        if (tx < 1 || ty < 1 || tx + def.tilesW > MAP_W - 1 || ty + def.tilesH > MAP_H - 1) continue;
        if (game.map.canPlaceBuilding(tx, ty, def.tilesW, def.tilesH)) {
          // Spend resources, place complete (AI doesn't bother with construction)
          game.players[TEAM.ENEMY].resources -= def.cost;
          const b = createBuilding(type, TEAM.ENEMY, tx, ty);
          b.state = 'built';
          b.buildProgress = 1;
          game.map.setOccupiedRect(tx, ty, def.tilesW, def.tilesH, 1);
          game.entities.push(b);
          return true;
        }
      }
    }
  }
  return false;
}

function sendArmyAt(game, target) {
  for (const u of game.entities) {
    if (u.team !== TEAM.ENEMY || u.kind !== 'unit') continue;
    if (UNIT_DEFS[u.type].role === 'worker') continue;
    if (u.state === 'attack' && u.target && u.target.team === TEAM.PLAYER) continue;
    const tx = Math.floor((target.x + (Math.random() - 0.5) * 80) / TILE);
    const ty = Math.floor((target.y + (Math.random() - 0.5) * 80) / TILE);
    const path = findPath(game.map, u.x, u.y, tx, ty);
    if (path) {
      u.path = smoothPath(path);
      u.pathIndex = 0;
      u.state = 'attackmove';
      u.target = null;
    }
  }
}

function countEntities(game, team) {
  const r = { workers: 0, soldiers: 0, commanders: 0, combatUnits: 0, hqs: 0, barracks: 0 };
  for (const e of game.entities) {
    if (e.team !== team) continue;
    if (e.kind === 'unit') {
      const role = UNIT_DEFS[e.type].role;
      if (role === 'worker') r.workers++;
      else r.combatUnits++;
      if (e.type === 'fedcommander' || e.type === 'rick') r.commanders++;
      if (e.type === 'fedsoldier' || e.type === 'birdperson') r.soldiers++;
    } else if (e.kind === 'building') {
      if (e.type === 'fedhq' || e.type === 'garage') r.hqs++;
      if (e.type === 'fedbarracks' || e.type === 'barracks') r.barracks++;
    }
  }
  return r;
}

function findHQ(game, team) {
  for (const e of game.entities) {
    if (e.kind === 'building' && e.team === team
        && (e.type === 'garage' || e.type === 'fedhq')
        && e.hp > 0) return e;
  }
  return null;
}
