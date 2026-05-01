// Procedural pixel-art sprite atlas. All sprites are drawn once at boot
// onto offscreen canvases, then blitted by the renderer.
//
// Sizes:
//   Units:      32x32 (with several frames for walk + facings)
//   Buildings:  72x72
//   Crystal:    32x32 (3-frame shimmer)
//   Projectiles 8x8
//
// Pixel-art rule: nearest-neighbor scaling, 1px outlines, small palette.

import { PALETTE, TEAM, TEAM_COLOR, TILE } from '../config.js';

export const SPRITES = {};

const UNIT_SIZE = 32;
const BUILDING_SIZE = 72;
const CRYSTAL_SIZE = 32;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { canvas: c, ctx };
}

// Pixel rect
function px(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
}

// Outlined pixel rect (1px outline color = OUT)
function pxo(ctx, x, y, w, h, color, outline = PALETTE.outline) {
  px(ctx, x - 1, y, w + 2, h, outline);
  px(ctx, x, y - 1, w, h + 2, outline);
  px(ctx, x, y, w, h, color);
}

/* ------------------------------------------------------------------ */
/* Unit drawings                                                       */
/* ------------------------------------------------------------------ */
// Each unit has 4 directions × 2 walk frames = 8 frames in a strip.
// Draw a small humanoid 12 px tall in center of 32x32 cell.
//
// Direction codes: 0=down, 1=left, 2=right, 3=up
// Walk frames: 0 (legs neutral), 1 (legs offset)

function drawHumanoid(ctx, cx, cy, dir, frame, opts) {
  const {
    skin, hair, shirt, pants = '#3a3a4a', accent, accent2, eyeColor = '#0b0d18',
  } = opts;

  const legY = 14;
  const bodyY = 7;
  const headY = 1;

  const legOffset = frame === 1 ? 1 : 0;
  // shadow under feet
  px(ctx, cx - 5, cy + legY + 5, 10, 2, 'rgba(0,0,0,0.35)');

  // Legs
  pxo(ctx, cx - 3, cy + legY - legOffset, 2, 4, pants);
  pxo(ctx, cx + 1, cy + legY + legOffset, 2, 4, pants);

  // Body / shirt
  pxo(ctx, cx - 4, cy + bodyY, 8, 7, shirt);

  // Arms
  if (dir === 1) {
    // facing left, near arm forward
    pxo(ctx, cx - 6, cy + bodyY + 1, 2, 5, shirt);
    pxo(ctx, cx + 4, cy + bodyY + 2, 2, 4, shirt);
  } else if (dir === 2) {
    pxo(ctx, cx + 4, cy + bodyY + 1, 2, 5, shirt);
    pxo(ctx, cx - 6, cy + bodyY + 2, 2, 4, shirt);
  } else {
    pxo(ctx, cx - 6, cy + bodyY + 1, 2, 5, shirt);
    pxo(ctx, cx + 4, cy + bodyY + 1, 2, 5, shirt);
  }

  // Head
  pxo(ctx, cx - 3, cy + headY, 6, 6, skin);

  // Hair (only top + sides for down/side; full top for up)
  if (dir === 3) {
    px(ctx, cx - 3, cy + headY, 6, 3, hair);
    px(ctx, cx - 4, cy + headY + 1, 8, 2, hair);
  } else {
    px(ctx, cx - 3, cy + headY, 6, 2, hair);
    px(ctx, cx - 4, cy + headY + 1, 1, 3, hair);
    px(ctx, cx + 3, cy + headY + 1, 1, 3, hair);
  }

  // Eyes (only when facing camera-ish)
  if (dir === 0) {
    px(ctx, cx - 2, cy + headY + 3, 1, 1, eyeColor);
    px(ctx, cx + 1, cy + headY + 3, 1, 1, eyeColor);
  } else if (dir === 1) {
    px(ctx, cx - 2, cy + headY + 3, 1, 1, eyeColor);
  } else if (dir === 2) {
    px(ctx, cx + 1, cy + headY + 3, 1, 1, eyeColor);
  }

  // Optional accent (lab coat lapels, badge)
  if (accent) {
    px(ctx, cx - 1, cy + bodyY + 1, 2, 5, accent);
  }
  if (accent2 && dir === 0) {
    px(ctx, cx + 2, cy + bodyY + 2, 1, 1, accent2);
  }
}

// Bird Person — taller, with beak and bird head
function drawBirdPerson(ctx, cx, cy, dir, frame, opts) {
  const { body, beak = PALETTE.birdBeak, accent = '#a64a2a' } = opts;
  const legY = 14, bodyY = 6, headY = 0;
  const legOffset = frame === 1 ? 1 : 0;

  px(ctx, cx - 5, cy + legY + 5, 10, 2, 'rgba(0,0,0,0.35)');

  // Bird legs (thin)
  pxo(ctx, cx - 3, cy + legY - legOffset, 1, 5, '#5a3a1a');
  pxo(ctx, cx + 2, cy + legY + legOffset, 1, 5, '#5a3a1a');

  // Body
  pxo(ctx, cx - 4, cy + bodyY + 2, 8, 7, body);
  // Wings
  if (dir === 1 || dir === 2) {
    pxo(ctx, cx - 6, cy + bodyY + 4, 2, 4, body);
    pxo(ctx, cx + 4, cy + bodyY + 4, 2, 4, body);
  } else {
    pxo(ctx, cx - 6, cy + bodyY + 3, 2, 5, body);
    pxo(ctx, cx + 4, cy + bodyY + 3, 2, 5, body);
  }

  // Bird head
  pxo(ctx, cx - 3, cy + headY + 1, 6, 5, body);

  // Beak (faces direction)
  if (dir === 1) {
    px(ctx, cx - 5, cy + headY + 3, 2, 2, beak);
  } else if (dir === 2) {
    px(ctx, cx + 3, cy + headY + 3, 2, 2, beak);
  } else if (dir === 3) {
    px(ctx, cx, cy + headY, 1, 2, beak);
  } else {
    px(ctx, cx, cy + headY + 5, 1, 2, beak);
  }

  // Eye
  if (dir !== 3) {
    const ex = dir === 1 ? cx - 2 : (dir === 2 ? cx + 2 : cx - 1);
    px(ctx, ex, cy + headY + 2, 1, 1, '#0b0d18');
  }

  // Accent (red collar)
  px(ctx, cx - 4, cy + bodyY + 2, 8, 1, accent);
}

// Federation soldier-like alien — green bug with helmet
function drawGromflomite(ctx, cx, cy, dir, frame, opts) {
  const { body = PALETTE.fedBody, helm = PALETTE.fedHelm, accent = '#2a3a16' } = opts;
  const legY = 14, bodyY = 7, headY = 1;
  const legOffset = frame === 1 ? 1 : 0;

  px(ctx, cx - 5, cy + legY + 5, 10, 2, 'rgba(0,0,0,0.4)');

  // 4 legs (bug-like)
  pxo(ctx, cx - 4, cy + legY - legOffset, 2, 4, body);
  pxo(ctx, cx + 2, cy + legY + legOffset, 2, 4, body);
  px(ctx, cx - 5, cy + legY + 1, 1, 3, accent);
  px(ctx, cx + 4, cy + legY + 1, 1, 3, accent);

  // Body
  pxo(ctx, cx - 4, cy + bodyY, 8, 7, body);
  // Belt
  px(ctx, cx - 4, cy + bodyY + 5, 8, 1, accent);

  // Arms
  pxo(ctx, cx - 6, cy + bodyY + 2, 2, 4, body);
  pxo(ctx, cx + 4, cy + bodyY + 2, 2, 4, body);

  // Head + helmet
  pxo(ctx, cx - 3, cy + headY, 6, 6, body);
  px(ctx, cx - 3, cy + headY, 6, 2, helm);
  px(ctx, cx - 4, cy + headY + 1, 8, 1, helm);

  // Visor (red)
  if (dir !== 3) {
    px(ctx, cx - 2, cy + headY + 3, 4, 1, '#ff5a5a');
  }
}

// Build a strip 8 frames wide for a unit kind. Returns canvas.
function buildUnitStrip(drawFn, opts) {
  const FRAMES = 8;
  const { canvas, ctx } = makeCanvas(UNIT_SIZE * FRAMES, UNIT_SIZE);
  const cy = 16;
  for (let dir = 0; dir < 4; dir++) {
    for (let f = 0; f < 2; f++) {
      const fi = dir * 2 + f;
      const cx = fi * UNIT_SIZE + UNIT_SIZE / 2;
      drawFn(ctx, cx, cy, dir, f, opts);
    }
  }
  return canvas;
}

/* ------------------------------------------------------------------ */
/* Buildings                                                           */
/* ------------------------------------------------------------------ */
function drawGarage(ctx, ox, oy, opts) {
  const { wall, roof, door, accent, sign } = opts;
  const W = 60, H = 48;
  const x = ox + (BUILDING_SIZE - W) / 2;
  const y = oy + (BUILDING_SIZE - H) / 2 + 4;

  // shadow
  px(ctx, x + 2, y + H, W, 4, 'rgba(0,0,0,0.4)');

  // walls
  pxo(ctx, x, y + 12, W, H - 12, wall);

  // roof (sloped — top trapezoid)
  for (let i = 0; i < 12; i++) {
    px(ctx, x + i, y + i, W - i * 2, 1, roof);
  }
  // roof outline
  px(ctx, x - 1, y + 12, W + 2, 1, PALETTE.outline);

  // door (garage roll-up)
  const dw = 22;
  const dx = x + (W - dw) / 2;
  px(ctx, dx, y + 22, dw, H - 22 - 4, '#22253d');
  for (let i = 0; i < 6; i++) {
    px(ctx, dx, y + 24 + i * 3, dw, 1, '#3a3e5e');
  }
  px(ctx, dx - 1, y + 21, dw + 2, 1, PALETTE.outline);

  // windows
  px(ctx, x + 4, y + 16, 6, 4, accent);
  px(ctx, x + W - 10, y + 16, 6, 4, accent);

  // sign on roof
  px(ctx, x + W / 2 - 6, y + 4, 12, 4, sign);
  px(ctx, x + W / 2 - 5, y + 5, 10, 2, '#fff');

  // little antenna
  px(ctx, x + W - 6, y - 6, 1, 6, '#aaa');
  px(ctx, x + W - 7, y - 7, 3, 1, accent);
}

function drawBarracks(ctx, ox, oy, opts) {
  const { wall, roof, accent, banner } = opts;
  const W = 60, H = 50;
  const x = ox + (BUILDING_SIZE - W) / 2;
  const y = oy + (BUILDING_SIZE - H) / 2 + 4;

  px(ctx, x + 2, y + H, W, 4, 'rgba(0,0,0,0.4)');

  // base walls (concrete bunker)
  pxo(ctx, x, y + 8, W, H - 8, wall);

  // roof flat
  px(ctx, x - 2, y + 6, W + 4, 4, roof);
  px(ctx, x - 3, y + 5, W + 6, 1, PALETTE.outline);

  // crenelations
  for (let i = 0; i < 5; i++) {
    px(ctx, x + 2 + i * 13, y + 2, 6, 4, roof);
    px(ctx, x + 1 + i * 13, y + 1, 8, 1, PALETTE.outline);
  }

  // door
  px(ctx, x + W / 2 - 6, y + 26, 12, H - 26 - 4, '#1a1d3a');
  px(ctx, x + W / 2 - 7, y + 25, 14, 1, PALETTE.outline);
  px(ctx, x + W / 2 - 1, y + 30, 2, 8, accent);

  // banner
  px(ctx, x + 6, y + 14, 8, 14, banner);
  px(ctx, x + W - 14, y + 14, 8, 14, banner);
  px(ctx, x + 8, y + 24, 4, 4, '#fff');
  px(ctx, x + W - 12, y + 24, 4, 4, '#fff');

  // sandbags
  for (let i = 0; i < 6; i++) {
    px(ctx, x + 4 + i * 9, y + H - 4, 8, 3, '#7c6b3a');
  }
}

/* ------------------------------------------------------------------ */
/* Crystal (Dark Matter node)                                         */
/* ------------------------------------------------------------------ */
function drawCrystal(ctx, ox, oy, frame) {
  const cx = ox + CRYSTAL_SIZE / 2;
  const cy = oy + CRYSTAL_SIZE / 2 + 2;
  // base
  px(ctx, cx - 8, cy + 8, 16, 3, 'rgba(0,0,0,0.4)');
  px(ctx, cx - 7, cy + 7, 14, 1, '#1a3040');

  // back small crystal
  pxo(ctx, cx - 6, cy - 4, 4, 8, PALETTE.crystalDark);

  // main crystal — diamond-ish
  for (let i = 0; i < 12; i++) {
    const w = Math.min(8, 12 - Math.abs(i - 4));
    px(ctx, cx - w / 2, cy - 8 + i, w, 1, PALETTE.crystal);
  }
  // outline
  px(ctx, cx - 1, cy - 9, 2, 1, PALETTE.outline);
  px(ctx, cx + 4, cy + 3, 1, 1, PALETTE.outline);
  px(ctx, cx - 5, cy + 3, 1, 1, PALETTE.outline);

  // shimmer based on frame
  const shimmerY = cy - 6 + frame;
  px(ctx, cx - 1, shimmerY, 3, 1, '#fff');
  px(ctx, cx, shimmerY + 1, 1, 1, '#b3f7ff');

  // front small crystal
  pxo(ctx, cx + 2, cy - 2, 3, 6, PALETTE.crystal);
}

function buildCrystalStrip() {
  const FRAMES = 3;
  const { canvas, ctx } = makeCanvas(CRYSTAL_SIZE * FRAMES, CRYSTAL_SIZE);
  for (let f = 0; f < FRAMES; f++) {
    drawCrystal(ctx, f * CRYSTAL_SIZE, 0, f);
  }
  return canvas;
}

/* ------------------------------------------------------------------ */
/* Portal — selection markers, projectiles                            */
/* ------------------------------------------------------------------ */
function buildProjectile(color) {
  const { canvas, ctx } = makeCanvas(8, 8);
  px(ctx, 3, 3, 2, 2, color);
  px(ctx, 2, 3, 1, 2, '#fff');
  px(ctx, 5, 3, 1, 2, color);
  px(ctx, 3, 2, 2, 1, '#fff');
  px(ctx, 3, 5, 2, 1, color);
  return canvas;
}

/* ------------------------------------------------------------------ */
/* Tile palette                                                        */
/* ------------------------------------------------------------------ */
function buildTiles() {
  const TILES = 4; // 0=grass, 1=grass-dark, 2=rock, 3=path
  const T = TILE;
  const { canvas, ctx } = makeCanvas(T * TILES, T);
  // grass
  px(ctx, 0, 0, T, T, PALETTE.grass);
  for (let i = 0; i < 14; i++) {
    const x = (i * 7) % T;
    const y = (i * 11) % T;
    px(ctx, x, y, 1, 1, PALETTE.grass2);
  }
  // grass-dark
  px(ctx, T, 0, T, T, '#2d4628');
  for (let i = 0; i < 10; i++) {
    px(ctx, T + (i * 5) % T, (i * 13) % T, 1, 1, '#1f3a1c');
  }
  // rock
  px(ctx, 2 * T, 0, T, T, PALETTE.rock);
  for (let i = 0; i < 12; i++) {
    px(ctx, 2 * T + (i * 7) % T, (i * 9) % T, 2, 1, '#444858');
  }
  // path (alien purple-y)
  px(ctx, 3 * T, 0, T, T, '#5a3e6e');
  for (let i = 0; i < 10; i++) {
    px(ctx, 3 * T + (i * 7) % T, (i * 5) % T, 1, 1, '#7a5e8e');
  }
  return { canvas, size: T };
}

/* ------------------------------------------------------------------ */
/* Public: build atlas                                                 */
/* ------------------------------------------------------------------ */
export function buildSpriteAtlas() {
  // Player units
  SPRITES.morty = buildUnitStrip(drawHumanoid, {
    skin: '#f7c98a',
    hair: PALETTE.mortyHair,
    shirt: PALETTE.mortyShirt,
    pants: '#3a4ac6',
    accent: null,
  });
  SPRITES.rick = buildUnitStrip(drawHumanoid, {
    skin: '#f5d5a8',
    hair: PALETTE.rickHair,
    shirt: PALETTE.rickCoat,
    pants: '#5a5a3a',
    accent: '#cfd6ff',
  });
  SPRITES.birdperson = buildUnitStrip(drawBirdPerson, {
    body: PALETTE.birdBody,
    beak: PALETTE.birdBeak,
    accent: '#a64a2a',
  });
  // Enemy units
  SPRITES.fedworker = buildUnitStrip(drawGromflomite, {
    body: '#9ad06a',
    helm: '#3a5e22',
    accent: '#1f3a16',
  });
  SPRITES.fedsoldier = buildUnitStrip(drawGromflomite, {
    body: PALETTE.fedBody,
    helm: '#2a4a18',
    accent: '#1a2a10',
  });
  SPRITES.fedcommander = buildUnitStrip(drawGromflomite, {
    body: '#5a8a3a',
    helm: '#1a2a10',
    accent: '#0c1a08',
  });

  // Buildings
  function buildBuilding(drawFn, opts) {
    const { canvas, ctx } = makeCanvas(BUILDING_SIZE, BUILDING_SIZE);
    drawFn(ctx, 0, 0, opts);
    return canvas;
  }
  SPRITES.garage = buildBuilding(drawGarage, {
    wall: '#a6a8b8', roof: '#3a8aff', door: '#1a1d3a',
    accent: '#4cd0c2', sign: '#c34cd0',
  });
  SPRITES.barracks = buildBuilding(drawBarracks, {
    wall: '#7e8294', roof: '#4cd0c2', accent: '#ffe97a', banner: '#3a4ac6',
  });
  SPRITES.fedhq = buildBuilding(drawGarage, {
    wall: '#7a8a6a', roof: '#3a5e22', door: '#0c1a08',
    accent: '#ff5a5a', sign: '#ff5a5a',
  });
  SPRITES.fedbarracks = buildBuilding(drawBarracks, {
    wall: '#5a6a4a', roof: '#3a5e22', accent: '#ff5a5a', banner: '#2a3a16',
  });

  // Crystal
  SPRITES.crystal = buildCrystalStrip();

  // Projectiles by color
  SPRITES.projGreen = buildProjectile('#9bff5a');
  SPRITES.projYellow = buildProjectile('#ffd44a');
  SPRITES.projRed = buildProjectile('#ff5a5a');
  SPRITES.projOrange = buildProjectile('#ff8a4a');

  // Tiles
  SPRITES.tiles = buildTiles();

  // Constants
  SPRITES.UNIT_SIZE = UNIT_SIZE;
  SPRITES.BUILDING_SIZE = BUILDING_SIZE;
  SPRITES.CRYSTAL_SIZE = CRYSTAL_SIZE;
}

// Pick the projectile sprite for a color string.
export function projectileSprite(color) {
  switch (color) {
    case '#9bff5a': return SPRITES.projGreen;
    case '#ffd44a': return SPRITES.projYellow;
    case '#ff5a5a': return SPRITES.projRed;
    case '#ff8a4a': return SPRITES.projOrange;
    default: return SPRITES.projYellow;
  }
}

// Pick a unit-strip frame (dir 0..3, walkFrame 0..1) into rect.
export function unitFrame(dir, walkFrame) {
  const fi = (dir % 4) * 2 + (walkFrame % 2);
  return { sx: fi * UNIT_SIZE, sy: 0, sw: UNIT_SIZE, sh: UNIT_SIZE };
}

// 4-direction from radians
export function dirFromAngle(angle) {
  // angle: 0 = east, π/2 = south. But we use screen coords (y down), so
  // up = -π/2.
  const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  // Slice into 4 quadrants centered on cardinal directions:
  // east (right) → dir 2
  // south (down) → dir 0
  // west (left) → dir 1
  // north (up) → dir 3
  if (a < Math.PI / 4 || a >= Math.PI * 7 / 4) return 2; // right
  if (a < Math.PI * 3 / 4) return 0; // down
  if (a < Math.PI * 5 / 4) return 1; // left
  return 3; // up
}
