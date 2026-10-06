// js/config.js — Konstanten, Karte, Waffen, Power-Ups
'use strict';

// --- Supabase (anonymer Key ist öffentlich, RLS schützt die Tabelle) ---
const SUPABASE_URL = 'https://hnuilozoehvmosgumrsc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhudWlsb3pvZWh2bW9zZ3VtcnNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEyNzY3NTEsImV4cCI6MjEwNjg1Mjc1MX0.ztp_BEa420xSujbBCWLz1QHLOL4YDHE-jWQmP8ucTBo';

const CFG = {
  WORLD: { w: 2400, h: 1600 },
  R: 20,              // Spieler-Radius
  MAX_HP: 100,
  MAX_SHIELD: 50,
  SPEED: 255,         // px/s
  SPEED_MULT: 1.55,   // Power-Up: Tempo
  NET_MS: 50,         // 20 Updates/Sekunde
  SYNC_MS: 4000,      // Host-Herzschlag für Match-Sync
  RESPAWN_MS: 2500,
  PROTECT_MS: 2000,   // Spawn-Schutz
  SHIELD_MS: 12000,
  SPEED_MS: 8000,
  PU_MS: 15000,       // Power-Up Respawn nach Einsammeln
  STALE_MS: 5000,
  START_GRACE_MS: 800, // Schutz am Match-Anfang: keine Auto-Ende-Prüfung, bis alle Syncs/ Moves eingetroffen sind
  LOBBY_REGEN: 15,    // HP/s in der Lobby
  ZONE_R0: 1500,      // BR-Zone Start-Radius (deckt die Ecken)
  ZONE_DPS0: 6,
  ZONE_DPS1: 20,
  KILLFEED_MS: 5000,
  SCORE_TABLE: 'scores',
  NAME_MAX: 14,
};

const MODES = {
  ffa: { key: 'ffa', name: 'Deathmatch', desc: '3 Min. – wer hat die meisten Kills?', dur: 180000 },
  br:  { key: 'br',  name: 'Battle Royale', desc: 'Die Zone schrumpft – letzter Überlebender gewinnt!', dur: 300000, zoneMs: 240000 },
  tdm: { key: 'tdm', name: 'Team-Deathmatch', desc: '3 Min. – Rot gegen Blau!', dur: 180000 },
};
const MODE_KEYS = ['ffa', 'br', 'tdm'];

const TEAM_COLORS = ['#ff5252', '#40c4ff'];
const TEAM_NAMES = ['Rot', 'Blau'];
const PALETTE = ['#ff5252', '#40c4ff', '#69f0ae', '#ffd740', '#e040fb', '#ff6e40', '#18ffff', '#b2ff59', '#f48fb1', '#8c9eff'];

const WEAPONS = {
  pistol:  { key: 'pistol',  name: 'Pistole',        short: 'PIST', slot: 1, dmg: 14, spd: 900,  rate: 240,  spread: 0.04,  pel: 1, size: 4,   life: 1.2,  color: '#ffd54a' },
  shotgun: { key: 'shotgun', name: 'Schrotflinte',   short: 'SG',   slot: 2, dmg: 10, spd: 800,  rate: 720,  spread: 0.24,  pel: 5, size: 3.5, life: 0.55, color: '#ff9a3c' },
  sniper:  { key: 'sniper',  name: 'Sniper',         short: 'SNIP', slot: 3, dmg: 50, spd: 1700, rate: 1100, spread: 0.006, pel: 1, size: 5,   life: 1.4,  color: '#7fdcff' },
  rocket:  { key: 'rocket',  name: 'Raketenwerfer',  short: 'RAK',  slot: 4, dmg: 60, spd: 540,  rate: 1500, spread: 0,     pel: 1, size: 7,   life: 2.2,  color: '#ff5a5a', splash: 120 },
};
const WEAPON_ORDER = ['pistol', 'shotgun', 'sniper', 'rocket'];

// Map: feste Wände (AABB) – identisch auf allen Clients
const WALLS = [
  { x: 1140, y: 740,  w: 120, h: 120 }, // Center-Block
  { x: 340,  y: 300,  w: 400, h: 40 },  // Decken oben links
  { x: 1660, y: 300,  w: 400, h: 40 },  // Decken oben rechts
  { x: 340,  y: 1220, w: 400, h: 40 },  // Decken unten links
  { x: 1660, y: 1220, w: 400, h: 40 },  // Decken unten rechts
  { x: 700,  y: 640,  w: 40,  h: 320 }, // Pillar links
  { x: 1660, y: 640,  w: 40,  h: 320 }, // Pillar rechts
  { x: 900,  y: 430,  w: 600, h: 36 },  // Mittelbalken oben
  { x: 900,  y: 1134, w: 600, h: 36 },  // Mittelbalken unten
  { x: 120,  y: 120,  w: 160, h: 160 }, // Ecken-Bunker
  { x: 2120, y: 120,  w: 160, h: 160 },
  { x: 120,  y: 1320, w: 160, h: 160 },
  { x: 2120, y: 1320, w: 160, h: 160 },
  { x: 480,  y: 780,  w: 80,  h: 80 },  // Kisten
  { x: 1840, y: 780,  w: 80,  h: 80 },
  { x: 960,  y: 160,  w: 80,  h: 80 },
  { x: 1360, y: 160,  w: 80,  h: 80 },
  { x: 960,  y: 1360, w: 80,  h: 80 },
  { x: 1360, y: 1360, w: 80,  h: 80 },
];

// Spawn-Punkte (freie Flächen, geprüft gegen Wände)
const SPAWNS = [
  { x: 200,  y: 600 },  { x: 2200, y: 600 },
  { x: 200,  y: 1000 }, { x: 2200, y: 1000 },
  { x: 600,  y: 200 },  { x: 1800, y: 200 },
  { x: 600,  y: 1400 }, { x: 1800, y: 1400 },
  { x: 1200, y: 300 },  { x: 1200, y: 1350 },
];

// Power-Up Spawnplätze
const PU_SLOTS = [
  { x: 1200, y: 560 },  { x: 1200, y: 1040 },
  { x: 560,  y: 600 },  { x: 1840, y: 600 },
  { x: 560,  y: 1000 }, { x: 1840, y: 1000 },
  { x: 1050, y: 800 },  { x: 1350, y: 800 },
];

const PU_TYPES = ['health', 'shield', 'speed', 'weapon_shotgun', 'weapon_sniper', 'weapon_rocket'];
const PU_INFO = {
  health:         { label: '+HP', color: '#69f0ae' },
  shield:         { label: 'SCHILD', color: '#40c4ff' },
  speed:          { label: 'TURBO', color: '#ffd740' },
  weapon_shotgun: { label: 'SG',  color: '#ff9a3c' },
  weapon_sniper:  { label: 'SNIP', color: '#7fdcff' },
  weapon_rocket:  { label: 'RAK', color: '#ff5a5a' },
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
