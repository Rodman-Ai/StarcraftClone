// Centralized tunables for the RTS.

export const TILE = 24;             // tile size in pixels (world units)
export const MAP_W = 64;            // tiles
export const MAP_H = 48;            // tiles

export const SIM_HZ = 30;
export const SIM_DT = 1 / SIM_HZ;

export const TEAM = { PLAYER: 0, ENEMY: 1, NEUTRAL: 2 };

export const TEAM_COLOR = {
  [TEAM.PLAYER]: '#4cd0c2',
  [TEAM.ENEMY]: '#ff5a5a',
  [TEAM.NEUTRAL]: '#9a9fbf',
};

export const PALETTE = {
  morty: '#ffe97a',
  mortyHair: '#a36b2c',
  mortyShirt: '#ffe97a',
  rickHair: '#cfd6ff',
  rickCoat: '#b9e6f0',
  birdBody: '#f7f3e8',
  birdBeak: '#ffb24a',
  fedBody: '#7fc24a',
  fedHelm: '#3a5e22',
  crystal: '#73e6ff',
  crystalDark: '#1f5e7a',
  ground: '#2a3a2a',
  grass: '#3a5a32',
  grass2: '#46693a',
  rock: '#5a5e72',
  outline: '#0b0d18',
};

export const UNIT_DEFS = {
  morty: {
    label: 'Morty',
    role: 'worker',
    hp: 40,
    speed: 70,           // px/s
    radius: 7,
    sight: 140,
    cost: 50,
    supply: 1,
    buildTime: 6,
    canHarvest: true,
    canAttack: true,
    attackDamage: 3,
    attackRange: 18,
    attackCooldown: 1.4,
    attackKind: 'melee',
  },
  rick: {
    label: 'Rick',
    role: 'hero',
    hp: 140,
    speed: 80,
    radius: 8,
    sight: 200,
    cost: 150,
    supply: 3,
    buildTime: 14,
    canHarvest: false,
    canAttack: true,
    attackDamage: 18,
    attackRange: 110,
    attackCooldown: 1.0,
    attackKind: 'ranged',
    projectileSpeed: 360,
    projectileColor: '#9bff5a',
  },
  birdperson: {
    label: 'Bird Person',
    role: 'ranged',
    hp: 70,
    speed: 95,
    radius: 7,
    sight: 180,
    cost: 90,
    supply: 2,
    buildTime: 10,
    canHarvest: false,
    canAttack: true,
    attackDamage: 10,
    attackRange: 90,
    attackCooldown: 1.1,
    attackKind: 'ranged',
    projectileSpeed: 320,
    projectileColor: '#ffd44a',
  },
  // Enemy units (re-skins)
  fedworker: {
    label: 'Fed Drone',
    role: 'worker',
    hp: 40,
    speed: 70,
    radius: 7,
    sight: 140,
    cost: 50,
    supply: 1,
    buildTime: 6,
    canHarvest: true,
    canAttack: true,
    attackDamage: 3,
    attackRange: 18,
    attackCooldown: 1.4,
    attackKind: 'melee',
  },
  fedsoldier: {
    label: 'Fed Soldier',
    role: 'ranged',
    hp: 70,
    speed: 80,
    radius: 7,
    sight: 180,
    cost: 90,
    supply: 2,
    buildTime: 10,
    canHarvest: false,
    canAttack: true,
    attackDamage: 9,
    attackRange: 80,
    attackCooldown: 1.2,
    attackKind: 'ranged',
    projectileSpeed: 300,
    projectileColor: '#ff8a4a',
  },
  fedcommander: {
    label: 'Gromflomite',
    role: 'hero',
    hp: 140,
    speed: 75,
    radius: 8,
    sight: 200,
    cost: 150,
    supply: 3,
    buildTime: 14,
    canHarvest: false,
    canAttack: true,
    attackDamage: 16,
    attackRange: 90,
    attackCooldown: 1.0,
    attackKind: 'ranged',
    projectileSpeed: 320,
    projectileColor: '#ff5a5a',
  },
};

export const BUILDING_DEFS = {
  garage: {
    label: 'Garage',
    hp: 800,
    cost: 350,
    buildTime: 20,
    tilesW: 3, tilesH: 3,
    isHQ: true,
    suppliesProvided: 8,
    canDeposit: true,
    trains: ['morty'],
  },
  barracks: {
    label: 'Barracks',
    hp: 500,
    cost: 150,
    buildTime: 18,
    tilesW: 3, tilesH: 3,
    isHQ: false,
    suppliesProvided: 4,
    trains: ['rick', 'birdperson'],
  },
  // Enemy versions (visually different palette)
  fedhq: {
    label: 'Federation HQ',
    hp: 800,
    cost: 350,
    buildTime: 20,
    tilesW: 3, tilesH: 3,
    isHQ: true,
    suppliesProvided: 8,
    canDeposit: true,
    trains: ['fedworker'],
  },
  fedbarracks: {
    label: 'Fed Barracks',
    hp: 500,
    cost: 150,
    buildTime: 18,
    tilesW: 3, tilesH: 3,
    isHQ: false,
    suppliesProvided: 4,
    trains: ['fedsoldier', 'fedcommander'],
  },
};

export const RESOURCE_PER_NODE = 1500;
export const HARVEST_AMOUNT = 8;
export const HARVEST_TIME = 2.0;     // seconds to harvest one trip
export const STARTING_RESOURCES = 200;
export const STARTING_WORKERS = 4;

export const AI = {
  tickHz: 1,
  minWorkers: 6,
  attackArmySize: 5,
  resourceFloorBuild: 200,
  trickleBonus: 0.2, // resources per second
};

export const CAMERA = {
  panSpeed: 360,    // px/s when arrow keys held
  edgePan: 0,       // disabled to avoid surprise on touch
  minZoom: 0.5,
  maxZoom: 1.6,
  defaultZoom: 1.0,
};

export const COLORS = {
  selectionPlayer: '#4cd0c2',
  selectionEnemy: '#ff5a5a',
  hpFull: '#4cd065',
  hpMid: '#ffe97a',
  hpLow: '#ff5a5a',
  bgGrid: '#1f2940',
  buildOk: 'rgba(76, 208, 194, 0.4)',
  buildBad: 'rgba(255, 90, 90, 0.4)',
};
