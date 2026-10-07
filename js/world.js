// js/world.js — Deterministische Welt aus Seed: Chunks, Hindernisse, Spawns, Pickups
'use strict';

const World = (() => {
  const SEED = 0x5eeda11;
  const CHUNK = 400;      // Chunk-Größe (px)
  const MARGIN = 30;      // Abstand Hindernis → Chunk-Rand (> CFG.R)
  const EDGE = 120;       // Spawn-Sicherheitsabstand zur Weltkante
  const SPAWN_STEP = 200; // Raster für Spawn-Punkte
  const GROW_S = 1.6;     // Zeitkonstante für Größen-Animation (s)

  const chunks = new Map();  // "cx,cy" -> [AABB]
  const walls = [];          // flache Liste (nur additiv, nie umsortiert)
  const spawns = [];
  const puSlots = [];
  let size = worldSize(1);   // aktuelle (animierte) Seitenlänge, quadratisch
  let target = size;
  let genSide = 0;           // erzeugte Chunk-Rasterseite

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Gleicher Seed für alle Clients → identische Welt
  function hash2(cx, cy) {
    let hs = SEED >>> 0;
    hs = Math.imul(hs ^ (cx + 0x9e37), 0x85ebca6b) >>> 0;
    hs = Math.imul(hs ^ (cy + 0x7f4a), 0xc2b2ae35) >>> 0;
    return (hs ^ (hs >>> 13)) >>> 0;
  }

  function genChunk(cx, cy) {
    const key = cx + ',' + cy;
    if (chunks.has(key)) return;
    const rnd = mulberry32(hash2(cx, cy));
    const list = [];
    const roll = rnd();
    const count = roll < 0.28 ? 0 : roll < 0.78 ? 1 : 2;
    const x0 = cx * CHUNK, y0 = cy * CHUNK;
    for (let i = 0; i < count; i++) {
      const t = rnd();
      let bw, bh;
      if (t < 0.4) { bw = 70 + Math.floor(rnd() * 41); bh = bw; }                                    // Kiste
      else if (t < 0.7) { bw = 170 + Math.floor(rnd() * 131); bh = 36 + Math.floor(rnd() * 9); }     // Balken
      else { bw = 36 + Math.floor(rnd() * 9); bh = 170 + Math.floor(rnd() * 131); }                   // Säule
      const maxX = CHUNK - 2 * MARGIN - bw;
      const maxY = CHUNK - 2 * MARGIN - bh;
      if (maxX <= 0 || maxY <= 0) continue;
      const wall = {
        x: x0 + MARGIN + Math.floor(rnd() * (maxX + 1)),
        y: y0 + MARGIN + Math.floor(rnd() * (maxY + 1)),
        w: bw, h: bh,
      };
      list.push(wall);
      walls.push(wall);
    }
    chunks.set(key, list);
  }

  function spotFree(x, y, pad) {
    for (const wl of walls) {
      const cx = clamp(x, wl.x, wl.x + wl.w);
      const cy = clamp(y, wl.y, wl.y + wl.h);
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy < pad * pad) return false;
    }
    return true;
  }

  // Fester Loot-Typ pro Slot-Index (gewichtet, deterministisch) – stabil über die Laufzeit
  function slotTypeFor(i) {
    const rnd = mulberry32(hash2(i + 1, 0x7107));
    const r = rnd() * 100;
    let acc = 0;
    for (const [type, w] of PU_WEIGHTS) {
      acc += w;
      if (r < acc) return type;
    }
    return 'health';
  }

  // Spawn- und Pickup-Plätze aus dem Hindernis-Raster (deterministisch)
  function rebuildDerived() {
    spawns.length = 0;
    for (let x = EDGE; x <= size - EDGE; x += SPAWN_STEP) {
      for (let y = EDGE; y <= size - EDGE; y += SPAWN_STEP) {
        if (spotFree(x, y, 70)) spawns.push({ x, y });
      }
    }
    puSlots.length = 0;
    // Mehr Slots auf der Karte generieren (10 bis 20 Slots):
    const want = clamp(Math.round(size * size / 200000), 10, 20);
    if (spawns.length) {
      for (let i = 0; i < want; i++) {
        const idx = Math.floor((i + 0.5) * spawns.length / want) % spawns.length;
        const s = spawns[idx];
        puSlots.push({ x: s.x, y: s.y, type: getRandomPUType() });
      }
    }
  }

  // Neue Chunks außen dazu generieren – bestehende bleiben unverändert
  function ensureGen() {
    const side = Math.ceil(size / CHUNK);
    if (side === genSide) return;
    for (let cx = 0; cx < side; cx++) {
      for (let cy = 0; cy < side; cy++) genChunk(cx, cy);
    }
    genSide = side;
    rebuildDerived();
  }

  // Zielgröße aus Presence-Spielerzahl
  function setTarget(players) {
    target = worldSize(players);
  }

  // Weiche Größen-Animation + Chunk-Nachschub
  function update(dt) {
    if (size === target) return;
    const k = Math.min(1, dt / GROW_S * 3);
    size += (target - size) * k;
    if (Math.abs(target - size) < 1) size = target;
    ensureGen();
  }

  function key(cx, cy) { return cx + ',' + cy; }

  function inWall(x, y) {
    const list = chunks.get(key(Math.floor(x / CHUNK), Math.floor(y / CHUNK)));
    if (!list) return false;
    for (const wl of list) if (x >= wl.x &&
