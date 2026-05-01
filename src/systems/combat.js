// Target acquisition + damage + projectiles.

import { SIM_DT, UNIT_DEFS, TEAM } from '../config.js';
import { createProjectile, isHostile, distSq } from '../entities/entity.js';
import { findPath, smoothPath } from '../world/pathfind.js';

export function updateCombat(game) {
  const dt = SIM_DT;
  for (const e of game.entities) {
    if (e.kind !== 'unit') continue;
    const def = UNIT_DEFS[e.type];
    if (!def.canAttack) continue;
    if (e.attackCd > 0) e.attackCd -= dt;
    if (e.flash > 0) e.flash -= dt;

    // Auto-acquire target if idle/attackmove and a hostile is in sight
    if (e.state === 'idle' || e.state === 'attackmove') {
      const target = game.spatial.closest(e.x, e.y, def.sight, o => isHostile(e, o) && (o.kind === 'unit' || o.kind === 'building'));
      if (target) {
        e.target = target;
        e.state = 'attack';
        e.path = null;
        e.pathIndex = 0;
      }
    }

    if (e.state === 'attack' && e.target) {
      if (e.target.hp <= 0 || e.target.kind === undefined) {
        e.target = null;
        e.state = 'idle';
        continue;
      }
      const range = def.attackRange;
      const reach = range + (e.target.kind === 'building' ? e.target.radius : 0);
      const d2 = distSq(e, e.target);
      if (d2 <= reach * reach) {
        e.path = null; e.pathIndex = 0;
        // Face target
        const dx = e.target.x - e.x;
        const dy = e.target.y - e.y;
        e.facing = dirFromAngleLocal(Math.atan2(dy, dx));
        if (e.attackCd <= 0) {
          fireAttack(game, e, e.target);
          e.attackCd = def.attackCooldown;
        }
      } else {
        // Need to close the gap — repath occasionally
        if (!e.path || e.pathIndex >= e.path.length) {
          const tx = Math.floor(e.target.x / 24); // TILE
          const ty = Math.floor(e.target.y / 24);
          const path = findPath(game.map, e.x, e.y, tx, ty);
          if (path) e.path = smoothPath(path);
          e.pathIndex = 0;
        }
      }
    }
  }

  // Update projectiles
  for (const p of game.entities) {
    if (p.kind !== 'projectile' || p.dead) continue;
    if (!p.target || p.target.hp <= 0) {
      p.dead = true;
      continue;
    }
    const dx = p.target.x - p.x;
    const dy = p.target.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 6) {
      damage(game, p.target, p.damage);
      p.dead = true;
      continue;
    }
    const step = p.speed * dt;
    p.x += (dx / d) * step;
    p.y += (dy / d) * step;
  }
}

function fireAttack(game, attacker, target) {
  const def = UNIT_DEFS[attacker.type];
  if (def.attackKind === 'ranged') {
    const proj = createProjectile(attacker.x, attacker.y - 6, target,
      def.attackDamage, def.projectileSpeed, def.projectileColor, attacker.team);
    game.entities.push(proj);
  } else {
    damage(game, target, def.attackDamage);
  }
}

export function damage(game, target, dmg) {
  if (!target || target.hp <= 0) return;
  target.hp -= dmg;
  target.flash = 0.12;
  if (target.hp <= 0) {
    target.hp = 0;
    onDie(game, target);
  }
}

function onDie(game, target) {
  target.dead = true;
  if (target.kind === 'building') {
    game.map.setOccupiedRect(target.tx, target.ty, target.tilesW, target.tilesH, 0);
  }
}

// Local copy so we don't import full sprites module.
function dirFromAngleLocal(angle) {
  const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (a < Math.PI / 4 || a >= Math.PI * 7 / 4) return 2;
  if (a < Math.PI * 3 / 4) return 0;
  if (a < Math.PI * 5 / 4) return 1;
  return 3;
}
