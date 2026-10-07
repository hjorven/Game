// js/world.js — Deterministische Welt mit garantierten Korridoren (kein Einsperren möglich)
'use strict';

const World = (() => {
  const SEED = 0x5eeda11;
  const CHUNK = 400;      // Chunk-Größe (px)
  const MARGIN = 75;      // Freier Rand pro Chunk -> garantiert 150px breite Wege zwischen allen Chunks!
  const EDGE = 120;       // Spawn-Sicherheitsabstand zur Weltkante
  const SPAWN_STEP = 200; // Raster für Spawn-Punkte
  const GROW_S = 1.6;     // Zeitkonstante für Größen-Animation (s)

  const chunks = new Map();  // "cx,cy" -> [AABB]
  const walls = [];          // flache Liste aller Hindernisse
  const spawns = [];
  const puSlots = [];
  let size = worldSize(1);   // aktuelle Seitenlänge
  let target = size;
  let genSide = 0;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

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
    // 0 bis 2 Hindernisse pro Chunk
    const count = roll < 0.35 ? 0 : roll < 0.80 ? 1 : 2;
    const x0 = cx * CHUNK, y0 = cy * CHUNK;

    for (let i = 0; i < count; i++) {
      const t = rnd();
      let bw, bh;
      if (t < 0.4) { bw = 50 + Math.floor(rnd() * 30); bh = bw; }                                    // Kiste
      else if (t < 0.7) { bw = 120 + Math.floor(rnd() * 80); bh = 30 + Math.floor(rnd() * 10); }      // Balken
      else { bw = 30 + Math.floor(rnd() * 10); bh = 120 + Math.floor(rnd() * 80); }                   // Säule

      const maxX = CHUNK - 2 * MARGIN - bw;
      const maxY = CHUNK - 2 * MARGIN - bh;
      if (maxX <= 0 || maxY <= 0) continue;

      const wall = {
        x: x0 + MARGIN + Math.floor(rnd() * (maxX + 1)),
        y: y0 + MARGIN + Math.floor(rnd() * (maxY + 1)),
        w: bw, h: bh,
      };

      // Prüfen, ob Hindernisse im selben Chunk sich nicht gegenseitig blockieren
      let overlap = false;
      for (const existing of list) {
        if (wall.x < existing.x + existing.w + 40 &&
            wall.x + wall.w + 40 > existing.x &&
            wall.y < existing.y + existing.h + 40 &&
            wall.y + wall.h + 40 > existing.y) {
          overlap = true;
          break;
        }
      }

      if (!overlap) {
        list.push(wall);
        walls.push(wall);
      }
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

  function rebuildDerived() {
    spawns.length = 0;
    for (let x = EDGE; x <= size - EDGE; x += SPAWN_STEP) {
      for (let y = EDGE; y <= size - EDGE; y += SPAWN_STEP) {
        if (spotFree(x, y, 60)) spawns.push({ x, y });
      }
    }
    puSlots.length = 0;
    const want = clamp(Math.round(size * size / 200000), 10, 20);
    if (spawns.length) {
      for (let i = 0; i < want; i++) {
        const idx = Math.floor((i + 0.5) * spawns.length / want) % spawns.length;
        const s = spawns[idx];
        puSlots.push({ x: s.x, y: s.y, type: getRandomPUType() });
      }
    }
  }

  function ensureGen() {
    const side = Math.ceil(size / CHUNK);
    if (side === genSide) return;
    for (let cx = 0; cx < side; cx++) {
      for (let cy = 0; cy < side; cy++) genChunk(cx, cy);
    }
    genSide = side;
    rebuildDerived();
  }

  function setTarget(players) {
    target = worldSize(players);
  }

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
    for (const wl of list) if (x >= wl.x && x <= wl.x + wl.w && y >= wl.y && y <= wl.y + wl.h) return true;
    return false;
  }

  function nearWalls(x, y) {
    const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
    const out = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const list = chunks.get(key(cx + dx, cy + dy));
        if (list) for (const wl of list) out.push(wl);
      }
    }
    return out;
  }

  ensureGen();

  return {
    get w() { return size; },
    get h() { return size; },
    get target() { return target; },
    get walls() { return walls; },
    get spawns() { return spawns; },
    get puSlots() { return puSlots; },
    setTarget, update, inWall, nearWalls,
    chunkKey: key, CHUNK,
  };
})();
