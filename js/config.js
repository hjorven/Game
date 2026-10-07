// js/config.js — Konstanten, Karte, Waffen, Power-Ups
'use strict';

// --- Supabase (anonymer Key ist öffentlich, RLS schützt die Tabelle) ---
const SUPABASE_URL = 'https://hnuilozoehvmosgumrsc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhudWlsb3pvZWh2bW9zZ3VtcnNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyNzY3NTEsImV4cCI6MjEwNjg1Mjc1MX0.ztp_BEa420xSujbBCWLz1QHLOL4YDHE-jWQmP8ucTBo';

const CFG = {
  R: 20,              // Spieler-Radius
  MAX_HP: 100,
  MAX_SHIELD: 50,
  SPEED: 255,         // px/s
  NET_MS: 50,         // 20 Updates/Sekunde
  RESPAWN_MS: 3000,
  PROTECT_MS: 2000,   // Spawn-Schutz
  SHIELD_MS: 12000,
  PU_MS: 15000,       // Item-Respawn (HP/Schild/Munition)
  WEAPON_MS: 30000,   // Waffen-Kisten-Respawn (seltener → länger)
  STALE_MS: 5000,
  KILLFEED_MS: 5000,
  NAME_MAX: 14,
};

// Weltgröße (quadratisch) aus der Spielerzahl – weich animiert in js/world.js
const WORLD_MIN = 1600;
const WORLD_MAX = 6000;
const worldSize = (players) => clamp(Math.round(WORLD_MIN + 350 * Math.sqrt(Math.max(1, players))), WORLD_MIN, WORLD_MAX);

const PALETTE = ['#ff5252', '#40c4ff', '#69f0ae', '#ffd740', '#e040fb', '#ff6e40', '#18ffff', '#b2ff59', '#f48fb1', '#8c9eff'];

const WEAPONS = {
  pistol:  { key: 'pistol',  name: 'Pistole',        short: 'PIST', slot: 1, dmg: 14, spd: 900,  rate: 240,  spread: 0.04,  pel: 1, size: 4,   life: 1.2,  color: '#ffd54a' },
  shotgun: { key: 'shotgun', name: 'Schrotflinte',   short: 'SG',   slot: 2, dmg: 10, spd: 800,  rate: 720,  spread: 0.24,  pel: 5, size: 3.5, life: 0.55, color: '#ff9a3c', ammoMax: 24, reloadMs: 1600 },
  sniper:  { key: 'sniper',  name: 'Sniper',         short: 'SNIP', slot: 3, dmg: 50, spd: 1700, rate: 1100, spread: 0.006, pel: 1, size: 5,   life: 1.4,  color: '#7fdcff', ammoMax: 12, reloadMs: 1900 },
  smg:     { key: 'smg',     name: 'Maschinenpistole', short: 'SMG', slot: 5, dmg: 8,  spd: 950,  rate: 85,   spread: 0.10,  pel: 1, size: 3,   life: 0.8,  color: '#b388ff', ammoMax: 45, reloadMs: 1500 },
  magnum:  { key: 'magnum',  name: 'Magnum',         short: 'MAG',  slot: 6, dmg: 36, spd: 1200, rate: 560,  spread: 0.015, pel: 1, size: 5,   life: 1.0,  color: '#ff80ab', ammoMax: 6,  reloadMs: 1700 },
  grenade: { key: 'grenade', name: 'Granatwerfer',   short: 'GRN',  slot: 7, dmg: 45, spd: 460,  rate: 900,  spread: 0,     pel: 1, size: 6,   life: 1.2,  color: '#9ccc65', splash: 90, ammoMax: 8, reloadMs: 2000, isArc: true, maxRange: 380 },
  rocket:  { key: 'rocket',  name: 'Raketenwerfer',  short: 'RAK',  slot: 4, dmg: 60, spd: 540,  rate: 1500, spread: 0,     pel: 1, size: 7,   life: 2.2,  color: '#ff5a5a', splash: 120, ammoMax: 6, reloadMs: 2300 },
};

// Power-Up Spawnplätze: aus der Seed-Welt (js/world.js: World.puSlots)

// Loot: feste Typ-Zuordnung pro Seed-Slot (js/world.js: slotTypeFor)
// Gewichte: Items häufig, seltene Waffen selten (Summe 100)
const PU_WEIGHTS = [
  ['health', 26], ['shield', 17], ['ammo', 17],
  ['weapon_shotgun', 11], ['weapon_smg', 9], ['weapon_magnum', 7],
  ['weapon_sniper', 6], ['weapon_grenade', 4], ['weapon_rocket', 3],
];
const PU_INFO = {
  health:         { label: '+HP',  color: '#69f0ae' },
  shield:         { label: 'SCHILD', color: '#40c4ff' },
  ammo:           { label: 'AMMO', color: '#ffee58' },
  weapon_shotgun: { label: 'SG',   color: '#ff9a3c' },
  weapon_sniper:  { label: 'SNIP', color: '#7fdcff' },
  weapon_smg:     { label: 'SMG',  color: '#b388ff' },
  weapon_magnum:  { label: 'MAG',  color: '#ff80ab' },
  weapon_grenade: { label: 'GRN',  color: '#9ccc65' },
  weapon_rocket:  { label: 'RAK',  color: '#ff5a5a' },
};

// --- kleine Helfer ---
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const dist = (ax, ay, bx, by) => Math.sqrt(dist2(ax, ay, bx, by));
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const lerpAngle = (a, b, t) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
const colorForId = (id) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

function getRandomPUType() {
  const r = Math.random() * 100;
  let acc = 0;
  for (const [type, w] of PU_WEIGHTS) {
    acc += w;
    if (r < acc) return type;
  }
  return 'health';
}
