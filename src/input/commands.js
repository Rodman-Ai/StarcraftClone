// High-level player commands: select, move, attack, gather, build.
// Translates raw input events into entity state changes.

import { TILE, BUILDING_DEFS, UNIT_DEFS, TEAM } from '../config.js';
import { findPath, smoothPath } from '../world/pathfind.js';
import { tryQueueUnit } from '../systems/training.js';
import { createBuilding } from '../entities/entity.js';

export function commandSelectAt(game, sx, sy, additive = false) {
  const w = game.camera.screenToWorld(sx, sy);
  // Pick the topmost entity within radius
  let best = null;
  let bestPriority = -1;
  for (const e of game.entities) {
    if (e.kind === 'projectile') continue;
    const r = e.kind === 'building' ? Math.max(e.tilesW, e.tilesH) * TILE / 2 : (e.radius + 4);
    const dx = e.x - w.x;
    const dy = e.y - w.y;
    if (dx * dx + dy * dy <= r * r) {
      // Priority: own units > own buildings > enemy unit/building > resource
      let p;
      if (e.team === TEAM.PLAYER && e.kind === 'unit') p = 4;
      else if (e.team === TEAM.PLAYER && e.kind === 'building') p = 3;
      else if (e.kind === 'unit') p = 2;
      else if (e.kind === 'building') p = 1;
      else p = 0;
      if (p > bestPriority) { bestPriority = p; best = e; }
    }
  }
  if (!additive) clearSelection(game);
  if (best) {
    best.selected = true;
    game.selection = [best];
  } else {
    game.selection = [];
  }
}

export function commandBoxSelect(game, x0, y0, x1, y1) {
  const a = game.camera.screenToWorld(Math.min(x0, x1), Math.min(y0, y1));
  const b = game.camera.screenToWorld(Math.max(x0, x1), Math.max(y0, y1));
  clearSelection(game);
  const sel = [];
  for (const e of game.entities) {
    if (e.kind !== 'unit') continue;
    if (e.team !== TEAM.PLAYER) continue;
    if (e.x >= a.x && e.x <= b.x && e.y >= a.y && e.y <= b.y) {
      e.selected = true;
      sel.push(e);
    }
  }
  // If nothing selected, fall back to single-click logic at the box center
  if (sel.length === 0) {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    commandSelectAt(game, cx, cy, false);
  } else {
    game.selection = sel;
  }
}

export function clearSelection(game) {
  for (const e of game.entities) e.selected = false;
  game.selection = [];
}

// Right-click / long-press: contextual command at a screen point.
export function commandContextAt(game, sx, sy) {
  const w = game.camera.screenToWorld(sx, sy);
  if (game.selection.length === 0) return;

  // Detect what's under the cursor
  let target = null;
  for (const e of game.entities) {
    if (e.kind === 'projectile') continue;
    const r = e.kind === 'building' ? Math.max(e.tilesW, e.tilesH) * TILE / 2 : (e.radius + 6);
    const dx = e.x - w.x;
    const dy = e.y - w.y;
    if (dx * dx + dy * dy <= r * r) {
      if (!target) target = e;
      else {
        // prefer non-resource > resource
        if (target.kind === 'resource' && e.kind !== 'resource') target = e;
      }
    }
  }

  const playerSel = game.selection.filter(s => s.team === TEAM.PLAYER && s.kind === 'unit');
  if (playerSel.length === 0) {
    // Maybe selecting a building → set rally point
    for (const b of game.selection) {
      if (b.kind === 'building' && b.team === TEAM.PLAYER) {
        b.rallyPoint = { x: w.x, y: w.y };
        game.cmdMarkers.push({ x: w.x, y: w.y, color: '#ffe97a', life: 0, maxLife: 0.6 });
      }
    }
    return;
  }

  if (target && target.kind === 'resource') {
    commandGather(game, playerSel, target);
    game.cmdMarkers.push({ x: w.x, y: w.y, color: '#73e6ff', life: 0, maxLife: 0.6 });
  } else if (target && target.team !== undefined && target.team !== TEAM.PLAYER && target.team !== TEAM.NEUTRAL) {
    commandAttack(game, playerSel, target);
    game.cmdMarkers.push({ x: w.x, y: w.y, color: '#ff5a5a', life: 0, maxLife: 0.6 });
  } else if (target && target.kind === 'building' && target.team === TEAM.PLAYER) {
    // Friendly building — workers go deposit; others move next to it
    commandMove(game, playerSel, w.x, w.y);
    game.cmdMarkers.push({ x: w.x, y: w.y, color: '#4cd0c2', life: 0, maxLife: 0.6 });
  } else {
    commandMove(game, playerSel, w.x, w.y);
    game.cmdMarkers.push({ x: w.x, y: w.y, color: '#4cd0c2', life: 0, maxLife: 0.6 });
  }
}

export function commandMove(game, units, wx, wy) {
  const tx = Math.floor(wx / TILE);
  const ty = Math.floor(wy / TILE);
  // Spread out destination for grouped units to avoid overlap.
  const offsets = [];
  const n = units.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  for (let i = 0; i < n; i++) {
    const r = (i / cols) | 0;
    const c = i - r * cols;
    offsets.push({
      dx: (c - cols / 2) * 0.7,
      dy: (r - cols / 2) * 0.7,
    });
  }
  units.forEach((u, i) => {
    const off = offsets[i] || { dx: 0, dy: 0 };
    const ttx = Math.max(0, Math.min(game.map.w - 1, tx + Math.round(off.dx)));
    const tty = Math.max(0, Math.min(game.map.h - 1, ty + Math.round(off.dy)));
    const dest = game.map.isPassable(ttx, tty) ? { tx: ttx, ty: tty } : { tx, ty };
    const path = findPath(game.map, u.x, u.y, dest.tx, dest.ty);
    if (path) {
      u.path = smoothPath(path);
      u.pathIndex = 0;
      u.state = 'move';
      u.target = null;
      u.targetPos = { x: wx, y: wy };
    }
  });
}

export function commandAttack(game, units, target) {
  for (const u of units) {
    if (!UNIT_DEFS[u.type].canAttack) continue;
    u.target = target;
    u.state = 'attack';
    u.path = null;
    u.pathIndex = 0;
  }
}

export function commandGather(game, units, node) {
  for (const u of units) {
    const def = UNIT_DEFS[u.type];
    if (!def.canHarvest) {
      // non-workers just move there
      commandMove(game, [u], node.x, node.y);
      continue;
    }
    u.target = node;
    u.carryingFrom = node;
    u.state = u.carrying > 0 ? 'return' : 'gather';
    const tx = u.state === 'return' && u.homeBase ? u.homeBase.tx + 1 : node.tx;
    const ty = u.state === 'return' && u.homeBase ? u.homeBase.ty + 1 : node.ty;
    const path = findPath(game.map, u.x, u.y, tx, ty);
    if (path) {
      u.path = smoothPath(path);
      u.pathIndex = 0;
    }
  }
}

// Place a building. Spends resources, marks under-construction, assigns
// the nearest idle worker as builder.
export function commandPlaceBuilding(game, type, tx, ty) {
  const def = BUILDING_DEFS[type];
  if (!def) return false;
  const player = game.players[TEAM.PLAYER];
  if (player.resources < def.cost) {
    game.message('Not enough Dark Matter');
    return false;
  }
  if (!game.map.canPlaceBuilding(tx, ty, def.tilesW, def.tilesH)) {
    game.message('Cannot build there');
    return false;
  }
  player.resources -= def.cost;
  const b = createBuilding(type, TEAM.PLAYER, tx, ty);
  b.state = 'building';
  b.buildProgress = 0;
  b.hp = Math.max(1, def.hp * 0.1);
  game.map.setOccupiedRect(tx, ty, def.tilesW, def.tilesH, 1);
  game.entities.push(b);

  // Assign nearest worker to construct
  const builder = findNearestIdleWorker(game, b);
  if (builder) {
    builder.state = 'build';
    builder.target = b;
    builder.path = null;
    builder.pathIndex = 0;
    const path = findPath(game.map, builder.x, builder.y, tx + 1, ty + 1);
    if (path) {
      builder.path = smoothPath(path);
      builder.pathIndex = 0;
    }
  }
  return true;
}

function findNearestIdleWorker(game, b) {
  let best = null;
  let bestD = Infinity;
  for (const e of game.entities) {
    if (e.kind !== 'unit' || e.team !== TEAM.PLAYER) continue;
    if (!UNIT_DEFS[e.type].canHarvest) continue;
    const d = (e.x - b.x) ** 2 + (e.y - b.y) ** 2;
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}
