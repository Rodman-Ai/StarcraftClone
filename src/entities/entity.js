// Entity factories and shared helpers.
// Entities are plain objects with a `kind` discriminator.

import { TILE, UNIT_DEFS, BUILDING_DEFS, RESOURCE_PER_NODE } from '../config.js';

let nextId = 1;
export function genId() { return nextId++; }

export function createUnit(type, team, x, y) {
  const def = UNIT_DEFS[type];
  if (!def) throw new Error('Unknown unit type: ' + type);
  return {
    id: genId(),
    kind: 'unit',
    type,
    team,
    x, y,
    radius: def.radius,
    hp: def.hp,
    maxHp: def.hp,
    speed: def.speed,
    sight: def.sight,
    state: 'idle',     // idle | move | attack | gather | return | attackmove
    target: null,      // entity ref
    targetPos: null,   // {x,y}
    path: null,        // [{x,y}, ...]
    pathIndex: 0,
    facing: 0,         // dir 0..3
    walkFrame: 0,
    walkTimer: 0,
    attackCd: 0,
    carrying: 0,       // resource amount (workers)
    carryingFrom: null,
    homeBase: null,    // building ref where worker deposits
    selected: false,
    flash: 0,          // damage flash timer
  };
}

export function createBuilding(type, team, tx, ty) {
  const def = BUILDING_DEFS[type];
  if (!def) throw new Error('Unknown building: ' + type);
  return {
    id: genId(),
    kind: 'building',
    type,
    team,
    tx, ty,
    tilesW: def.tilesW,
    tilesH: def.tilesH,
    x: tx * TILE + (def.tilesW * TILE) / 2,
    y: ty * TILE + (def.tilesH * TILE) / 2,
    radius: (def.tilesW * TILE) / 2,
    hp: def.hp,
    maxHp: def.hp,
    state: 'built',     // building | built
    buildProgress: 1,
    builderId: null,
    trainQueue: [],     // [{type, timeLeft, totalTime}]
    rallyPoint: null,
    selected: false,
    flash: 0,
  };
}

export function createCrystal(tx, ty) {
  return {
    id: genId(),
    kind: 'resource',
    resourceType: 'darkmatter',
    tx, ty,
    x: tx * TILE + TILE / 2,
    y: ty * TILE + TILE / 2,
    amount: RESOURCE_PER_NODE,
    radius: 12,
    shimmer: 0,
    flash: 0,
  };
}

export function createProjectile(fromX, fromY, target, damage, speed, color, team) {
  return {
    id: genId(),
    kind: 'projectile',
    team,
    x: fromX, y: fromY,
    target,
    damage,
    speed,
    color,
    dead: false,
  };
}

export function isHostile(a, b) {
  if (!a || !b) return false;
  if (a.team === b.team) return false;
  if (b.team === 2) return false; // neutral resources
  return true;
}

export function distSq(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return dx * dx + dy * dy;
}
