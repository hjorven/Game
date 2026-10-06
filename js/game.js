// js/game.js — Spielzustand, Logik, Match-Regeln, Netzwerk-Handler
'use strict';

const S = {
  state: 'lobby', // lobby | playing | ended
  mode: 'ffa',
  hostId: MY_ID,
  startTs: 0,
  endAt: 0,
  teams: {},
  results: null,
  me: {
    id: MY_ID, name: 'Spieler', color: '#fff',
    x: 600, y: 200, angle: 0,
    hp: CFG.MAX_HP, shield: 0, alive: true,
    weapon: 'pistol', owned: { pistol: true },
    kills: 0, deaths: 0, team: 0,
    protectUntil: 0, shieldUntil: 0, speedUntil: 0, deadUntil: 0,
    lastShot: 0, muzzle: 0, flash: 0, dirty: false,
  },
  remotes: {},
  bullets: [],
  particles: [],
  powerups: [],
  seenExplosions: new Set(),
  zone: { cx: CFG.WORLD.w / 2, cy: CFG.WORLD.h / 2, r: CFG.ZONE_R0, outside: false },
  cam: { x: 600, y: 200, scale: 1 },
  shake: 0, hitmarker: 0, dmgFlash: 0,
  zoneWarn: false,
  spectateId: null, spectateScan: 0,
  boardOpen: false,
  lastNet: 0, lastSync: 0, now: 0,
};

// ---------------- Helfer ----------------

function pointInWall(x, y) {
  for (const w of WALLS) if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) return true;
  return false;
}

function resolveEntity(e) {
  for (const w of WALLS) {
    const cx = clamp(e.x, w.x, w.x + w.w);
    const cy = clamp(e.y, w.y, w.y + w.h);
    const dx = e.x - cx, dy = e.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < CFG.R * CFG.R) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        e.x = cx + (dx / d) * CFG.R;
        e.y = cy + (dy / d) * CFG.R;
      } else {
        const l = e.x - w.x, r = w.x + w.w - e.x, t = e.y - w.y, b = w.y + w.h - e.y;
        const m = Math.min(l, r, t, b);
        if (m === l) e.x = w.x - CFG.R;
        else if (m === r) e.x = w.x + w.w + CFG.R;
        else if (m === t) e.y = w.y - CFG.R;
        else e.y = w.y + w.h + CFG.R;
      }
    }
  }
}

function segCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((cx - x1) * dx + (cy - y1) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  const px = x1 + dx * t - cx, py = y1 + dy * t - cy;
  return px * px + py * py <= r * r;
}

function teamOf(id) {
  if (id === MY_ID) return S.me.team;
  const r = S.remotes[id];
  return r ? r.team : 0;
}

function pickSpawn() {
  const me = S.me;
  let best = SPAWNS[0], bestScore = -1;
  for (const sp of SPAWNS) {
    let min = Infinity;
    for (const r of Object.values(S.remotes)) {
      if (!r.alive) continue;
      min = Math.min(min, dist2(sp.x, sp.y, r.x, r.y));
    }
    if (min === Infinity) min = Math.random() * 100000;
    const score = min + Math.random() * 20000;
    if (score > bestScore) { bestScore = score; best = sp; }
  }
  return best;
}

// ---------------- Partikel ----------------

function addP(p) { if (S.particles.length < 420) S.particles.push(p); }

function sparkAt(x, y, color, n) {
  n = n || 6;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 220;
    addP({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.3 + Math.random() * 0.2, maxLife: 0.5, color, size: 2 + Math.random() * 2 });
  }
}

function deathBurst(x, y, color) {
  for (let i = 0; i < 20; i++) {
    const a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 260;
    addP({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.5, maxLife: 1, color, size: 2 + Math.random() * 4 });
  }
  addP({ x, y, vx: 0, vy: 0, life: 0.4, maxLife: 0.4, color: '#ffffff', size: 8, ring: true, r1: 70 });
}

function explosionFx(x, y, radius) {
  addP({ x, y, vx: 0, vy: 0, life: 0.4, maxLife: 0.4, color: '#ffab40', size: 12, ring: true, r1: radius });
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2, sp = 80 + Math.random() * 340;
    addP({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35 + Math.random() * 0.45, maxLife: 0.8, color: i % 3 ? '#ff7043' : '#ffd740', size: 3 + Math.random() * 5 });
  }
  S.shake = Math.min(14, S.shake + 9);
  Sfx.play('explode');
}

// ---------------- Schüsse ----------------

function tryFire(now) {
  const me = S.me;
  if (S.state === 'ended' || !me.alive) return;
  const W = WEAPONS[me.weapon];
  if (now - me.lastShot < W.rate) return;
  me.lastShot = now;
  me.muzzle = 0.07;
  const bx = me.x + Math.cos(me.angle) * (CFG.R + 10);
  const by = me.y + Math.sin(me.angle) * (CFG.R + 10);
  const evt = {
    id: MY_ID + '-' + now.toString(36) + Math.random().toString(36).slice(2, 6),
    o: MY_ID, w: me.weapon, x: r1(bx), y: r1(by), a: r2(me.angle),
  };
  Net.send('shoot', evt);
  spawnBullets(evt);
  S.shake = Math.min(12, S.shake + (me.weapon === 'sniper' || me.weapon === 'rocket' ? 4 : 1.5));
  Sfx.play('shot', { weapon: me.weapon });
}

function spawnBullets(evt) {
  const W = WEAPONS[evt.w] || WEAPONS.pistol;
  const n = W.pel;
  for (let i = 0; i < n; i++) {
    let off = 0;
    if (n > 1) off = (i / (n - 1) - 0.5) * W.spread + (Math.random() - 0.5) * W.spread * 0.3;
    else if (W.spread) off = (Math.random() - 0.5) * W.spread;
    const a = evt.a + off;
    S.bullets.push({
      eid: evt.id, id: evt.id + '_' + i, o: evt.o, w: evt.w,
      x: evt.x, y: evt.y, px: evt.x, py: evt.y,
      vx: Math.cos(a) * W.spd, vy: Math.sin(a) * W.spd,
      life: W.life, dmg: W.dmg, size: W.size, color: W.color, splash: W.splash || 0,
    });
  }
}

function triggerExplode(b, x, y) {
  if (S.seenExplosions.has(b.eid)) return;
  rememberExplosion(b.eid);
  Net.send('explode', { b: b.eid, x: r1(x), y: r1(y), o: b.o, w: b.w });
  applyExplosion(x, y, b.w, b.o);
}

function rememberExplosion(id) {
  S.seenExplosions.add(id);
  if (S.seenExplosions.size > 150) {
    const arr = Array.from(S.seenExplosions).slice(-80);
    S.seenExplosions = new Set(arr);
  }
}

function applyExplosion(x, y, weaponKey, ownerId) {
  const W = WEAPONS[weaponKey] || WEAPONS.rocket;
  const R = W.splash || 110;
  explosionFx(x, y, R);
  const me = S.me;
  if (S.state === 'playing' && me.alive) {
    const d = dist(me.x, me.y, x, y);
    if (d < R + CFG.R) {
      const dmg = W.dmg * clamp(1 - Math.max(0, d - CFG.R) / R, 0, 1);
      if (dmg > 1) damageMe(dmg, ownerId);
    }
  }
}

function updateBullets(dt) {
  const me = S.me;
  for (let i = S.bullets.length - 1; i >= 0; i--) {
    const b = S.bullets[i];
    b.px = b.x; b.py = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;

    if (b.w === 'rocket' && Math.random() < 0.75) {
      addP({ x: b.x, y: b.y, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, life: 0.4, maxLife: 0.4, color: 'rgba(180,180,180,0.8)', size: 4 + Math.random() * 3 });
    }

    const wall = pointInWall(b.x, b.y);
    const out = b.x < 0 || b.x > CFG.WORLD.w || b.y < 0 || b.y > CFG.WORLD.h;
    const hitMe = b.o !== MY_ID && me.alive && S.state === 'playing' &&
      segCircle(b.px, b.py, b.x, b.y, me.x, me.y, CFG.R + b.size * 0.5);
    const expired = b.life <= 0;

    if (wall || out || hitMe || expired) {
      if (b.splash && !S.seenExplosions.has(b.eid)) {
        const ex = clamp(b.x, 2, CFG.WORLD.w - 2), ey = clamp(b.y, 2, CFG.WORLD.h - 2);
        triggerExplode(b, ex, ey);
      } else if (hitMe) {
        damageMe(b.dmg, b.o);
        sparkAt(b.x, b.y, '#ff8a80', 8);
      } else if (wall) {
        sparkAt(b.x, b.y, b.color, 5);
      }
      S.bullets.splice(i, 1);
    }
  }
}

// ---------------- Schaden & Tod ----------------

function damageMe(dmg, fromId) {
  const me = S.me;
  if (S.state !== 'playing' || !me.alive || dmg <= 0) return;
  if (fromId && fromId !== MY_ID) {
    if (S.now < me.protectUntil) return;
    if (S.mode === 'tdm' && teamOf(fromId) === me.team) return;
  }
  let d = dmg;
  if (me.shield > 0 && S.now < me.shieldUntil) {
    const abs = Math.min(me.shield, d);
    me.shield -= abs;
    d -= abs;
    if (me.shield <= 0) { me.shield = 0; me.shieldUntil = 0; }
  }
  if (d <= 0) return;
  me.hp -= d;
  me.flash = 0.16;
  S.dmgFlash = Math.min(1, S.dmgFlash + Math.min(0.6, dmg / 50));
  if (fromId && fromId !== MY_ID) {
    Net.send('hit', { v: MY_ID, k: fromId, d: r1(dmg), hp: Math.max(0, Math.round(me.hp)), sh: Math.round(me.shield) });
    Sfx.play('hurt');
  }
  if (me.hp <= 0) die(fromId);
}

function die(killerId) {
  const me = S.me;
  if (!me.alive) return;
  me.alive = false;
  me.hp = 0;
  me.deaths++;
  me.deadUntil = S.now + CFG.RESPAWN_MS;
  me.shield = 0; me.shieldUntil = 0; me.speedUntil = 0;
  me.dirty = true;
  Net.send('death', { v: MY_ID, k: killerId || null });
  feedDeath(MY_ID, killerId);
  deathBurst(me.x, me.y, me.color);
  Sfx.play('death');
  S.shake = Math.min(14, S.shake + 8);
}

function respawnMe() {
  const me = S.me;
  const sp = pickSpawn();
  me.x = sp.x; me.y = sp.y;
  me.alive = true;
  me.hp = CFG.MAX_HP;
  me.weapon = 'pistol';
  me.owned = { pistol: true };
  me.protectUntil = S.now + CFG.PROTECT_MS;
  me.deadUntil = 0;
  me.dirty = true;
  UI.syncWeaponChips();
  Sfx.play('pickup');
}

function feedDeath(victimId, killerId) {
  const who = (id) => id === MY_ID ? { name: S.me.name, color: S.me.color }
    : (S.remotes[id] ? { name: S.remotes[id].name, color: S.remotes[id].color } : { name: 'Unbekannt', color: '#999' });
  const v = who(victimId);
  if (!killerId) UI.addKillfeed({ v: v.name, vc: v.color, zone: true });
  else if (killerId === victimId) UI.addKillfeed({ v: v.name, vc: v.color, self: true });
  else {
    const k = who(killerId);
    UI.addKillfeed({ k: k.name, kc: k.color, v: v.name, vc: v.color });
  }
}

// ---------------- Power-Ups ----------------

function puType(slot, respawns) { return PU_TYPES[(slot + respawns * 3) % PU_TYPES.length]; }

function initPowerups() {
  S.powerups = PU_SLOTS.map((s, i) => ({ slot: i, x: s.x, y: s.y, type: puType(i, 0), respawns: 0, hiddenUntil: 0 }));
}

function adoptPU(pu) {
  if (!pu) return;
  for (const row of pu) {
    const p = S.powerups[row[0]];
    if (!p) continue;
    if (row[1] === p.respawns && row[2] === p.hiddenUntil) continue;
    p.respawns = row[1];
    p.hiddenUntil = row[2];
    p.type = puType(p.slot, p.respawns);
  }
}

function updatePowerups() {
  const me = S.me;
  if (!me.alive) return;
  for (const p of S.powerups) {
    if (S.now < p.hiddenUntil) continue;
    if (dist2(me.x, me.y, p.x, p.y) < (CFG.R + 18) * (CFG.R + 18)) {
      collectPowerup(p);
      break;
    }
  }
}

function collectPowerup(p) {
  const info = PU_INFO[p.type];
  applyPowerup(p.type);
  sparkAt(p.x, p.y, info.color, 12);
  p.respawns++;
  p.hiddenUntil = S.now + CFG.PU_MS;
  p.type = puType(p.slot, p.respawns);
  Net.send('pickup', { slot: p.slot, r: p.respawns, t: p.hiddenUntil });
  S.me.dirty = true;
  Sfx.play('pickup');
  UI.setNotice(info.label + ' eingesammelt!', 1300);
}

function applyPowerup(type) {
  const me = S.me;
  if (type === 'health') me.hp = Math.min(CFG.MAX_HP, me.hp + 50);
  else if (type === 'shield') { me.shield = CFG.MAX_SHIELD; me.shieldUntil = S.now + CFG.SHIELD_MS; }
  else if (type === 'speed') me.speedUntil = S.now + CFG.SPEED_MS;
  else if (type.startsWith('weapon_')) {
    const w = type.slice(8);
    if (WEAPONS[w]) { me.weapon = w; me.owned[w] = true; UI.syncWeaponChips(); }
  }
}

// ---------------- Zone (Battle Royale) ----------------

function updateZone(dt) {
  if (S.mode !== 'br' || S.state !== 'playing') { S.zoneWarn = false; return; }
  const t = clamp((Date.now() - S.startTs) / MODES.br.zoneMs, 0, 1);
  S.zone.r = CFG.ZONE_R0 * (1 - t);
  const me = S.me;
  const outside = me.alive && dist(me.x, me.y, S.zone.cx, S.zone.cy) > S.zone.r;
  S.zoneWarn = outside;
  if (outside) {
    const dps = CFG.ZONE_DPS0 + (CFG.ZONE_DPS1 - CFG.ZONE_DPS0) * t;
    damageMe(dps * dt, null);
  }
}

// ---------------- Match-Ablauf ----------------

function assignTeams() {
  const ids = Net.roster().map((p) => p.id).sort();
  const t = {};
  ids.forEach((id, i) => { t[id] = i % 2; });
  return t;
}

function resetForMatch() {
  const me = S.me;
  me.kills = 0; me.deaths = 0;
  me.alive = true; me.hp = CFG.MAX_HP;
  me.shield = 0; me.shieldUntil = 0; me.speedUntil = 0;
  me.weapon = 'pistol'; me.owned = { pistol: true };
  me.team = S.teams[MY_ID] || 0;
  const sp = pickSpawn();
  me.x = sp.x; me.y = sp.y;
  me.protectUntil = S.now + CFG.PROTECT_MS;
  me.deadUntil = 0;
  me.dirty = true;
  S.bullets.length = 0;
  S.seenExplosions.clear();
  S.spectateId = null;
  for (const r of Object.values(S.remotes)) {
    r.alive = true; r.kills = 0; r.deaths = 0; r.hp = CFG.MAX_HP;
    r.team = S.teams[r.id] || 0;
  }
}

function enterPlaying() {
  S.state = 'playing';
  S.results = null;
  resetForMatch();
  UI.enterMatch();
  UI.syncModeCards();
  UI.syncWeaponChips();
  UI.setNotice(S.mode === 'br' ? 'BATTLE ROYALE – die Zone schrumpft!' : 'Runde gestartet!', 2400);
  Sfx.play('start');
}

function enterLobby() {
  const me = S.me;
  S.state = 'lobby';
  S.results = null;
  S.teams = {};
  S.startTs = 0; S.endAt = 0;
  me.alive = true; me.hp = CFG.MAX_HP;
  me.shield = 0; me.shieldUntil = 0; me.speedUntil = 0;
  me.weapon = 'pistol'; me.owned = { pistol: true };
  me.kills = 0; me.deaths = 0; me.team = 0;
  const sp = pickSpawn();
  me.x = sp.x; me.y = sp.y;
  me.dirty = true;
  S.bullets.length = 0;
  S.zoneWarn = false;
  for (const r of Object.values(S.remotes)) { r.alive = true; r.kills = 0; r.deaths = 0; }
  UI.enterLobby();
  UI.syncModeCards();
  UI.syncWeaponChips();
  Sfx.play('ui');
}

function enterEnded(res) {
  S.state = 'ended';
  if (res) S.results = res;
  S.zoneWarn = false;
  UI.showResults(S.results);
  Sfx.play('end');
}

function currentEntries() {
  const me = S.me;
  const list = [{ id: MY_ID, name: me.name, color: me.color, kills: me.kills, deaths: me.deaths, alive: me.alive, team: me.team }];
  for (const r of Object.values(S.remotes)) {
    list.push({ id: r.id, name: r.name, color: r.color, kills: r.kills, deaths: r.deaths, alive: r.alive, team: r.team });
  }
  return list;
}

function buildResults() {
  const entries = currentEntries();
  const mode = S.mode;
  let winnerId = null, winnerName = '', winnerTeam = -1;
  if (mode === 'tdm') {
    let best = -1, bestT = 0;
    for (const t of [0, 1]) {
      const sum = entries.filter((e) => e.team === t).reduce((a, e) => a + e.kills, 0);
      if (sum > best) { best = sum; bestT = t; }
    }
    winnerTeam = bestT;
    winnerName = TEAM_NAMES[bestT];
    entries.sort((a, b) => a.team - b.team || b.kills - a.kills || a.deaths - b.deaths);
  } else if (mode === 'br') {
    entries.sort((a, b) => (b.alive - a.alive) || (b.kills - a.kills) || (a.deaths - b.deaths));
    const w = entries.find((e) => e.alive) || entries[0];
    if (w) { winnerId = w.id; winnerName = w.name; }
  } else {
    entries.sort((a, b) => (b.kills - a.kills) || (a.deaths - b.deaths));
    const w = entries[0];
    if (w) { winnerId = w.id; winnerName = w.name; }
  }
  return { mode, winnerId, winnerName, winnerTeam, entries, endedAt: Date.now(), room: Net.room };
}

function buildSync() {
  return {
    h: MY_ID, st: S.state, md: S.mode, ts: S.startTs, en: S.endAt, tm: S.teams, res: S.results,
    pu: S.powerups.map((p) => [p.slot, p.respawns, p.hiddenUntil]),
  };
}

function sendSync() {
  S.lastSync = Date.now();
  Net.send('sync', buildSync());
}

function countAlive() {
  let n = S.me.alive ? 1 : 0;
  for (const r of Object.values(S.remotes)) if (r.alive) n++;
  return n;
}

function countPlayers() {
  return 1 + Object.values(S.remotes).filter((r) => S.now - r.last < CFG.STALE_MS * 2).length;
}

function endMatch() {
  if (S.state !== 'playing') return;
  S.results = buildResults();
  enterEnded(S.results);
  sendSync();
  Net.saveScores(S.results);
}

// ---------------- Kamera ----------------

function spectateTarget() {
  const now = S.now;
  if (now > S.spectateScan) {
    S.spectateScan = now + 1000;
    let cur = S.spectateId ? S.remotes[S.spectateId] : null;
    if (cur && cur.alive && !cur.stale) { /* behalten */ }
    else {
      let best = null;
      for (const r of Object.values(S.remotes)) {
        if (!r.alive || r.stale) continue;
        if (!best || r.kills > best.kills || (r.kills === best.kills && r.last > best.last)) best = r;
      }
      S.spectateId = best ? best.id : null;
    }
  }
  const r = S.spectateId ? S.remotes[S.spectateId] : null;
  return r && r.alive ? r : S.me;
}

function updateCamera(dt) {
  let t = S.me;
  if (S.state === 'playing' && S.mode === 'br' && !S.me.alive) t = spectateTarget();
  const k = 1 - Math.exp(-dt * 7);
  S.cam.x += (t.x - S.cam.x) * k;
  S.cam.y += (t.y - S.cam.y) * k;
  const hw = (Render.w / 2) / S.cam.scale, hh = (Render.h / 2) / S.cam.scale;
  S.cam.x = CFG.WORLD.w > hw * 2 ? clamp(S.cam.x, hw, CFG.WORLD.w - hw) : CFG.WORLD.w / 2;
  S.cam.y = CFG.WORLD.h > hh * 2 ? clamp(S.cam.y, hh, CFG.WORLD.h - hh) : CFG.WORLD.h / 2;
}

// ---------------- Haupt-Update ----------------

function update(dt) {
  const now = Date.now();
  S.now = now;
  const me = S.me;

  // Host + Herzschlag
  const h = Net.electHost();
  if (h !== S.hostId) { S.hostId = h; UI.renderRoster(); UI.syncModeCards(); }
  if (S.hostId === MY_ID && now - S.lastSync >= CFG.SYNC_MS) sendSync();

  // Eingabe: Bewegung
  const mv = Input.moveVector();
  const speed = CFG.SPEED * (now < me.speedUntil ? CFG.SPEED_MULT : 1);
  if (me.alive && mv.mag > 0) {
    me.x += mv.x * speed * dt;
    me.y += mv.y * speed * dt;
    resolveEntity(me);
    me.x = clamp(me.x, CFG.R, CFG.WORLD.w - CFG.R);
    me.y = clamp(me.y, CFG.R, CFG.WORLD.h - CFG.R);
  }

  // Eingabe: Zielen & Schiessen
  const aim = Input.aimInfo();
  let fire = false;
  if (me.alive) {
    if (aim.source === 'stick' && aim.active) {
      me.angle = aim.angle;
      fire = true;
    } else if (aim.source === 'tap') {
      const w = Render.screenToWorld(aim.screen.x, aim.screen.y);
      if (dist(me.x, me.y, w.x, w.y) > 8) me.angle = Math.atan2(w.y - me.y, w.x - me.x);
      fire = true;
    } else if (aim.source === 'mouse' && aim.screen) {
      const w = Render.screenToWorld(aim.screen.x, aim.screen.y);
      if (dist(me.x, me.y, w.x, w.y) > 8) me.angle = Math.atan2(w.y - me.y, w.x - me.x);
      fire = aim.active;
    } else if (aim.source === 'key') {
      // Tastatur ohne Maus: Blickrichtung = Bewegungsrichtung, Leertaste schießt
      if (mv.mag > 0) me.angle = Math.atan2(mv.y, mv.x);
      fire = true;
    } else if (mv.mag > 0) {
      me.angle = Math.atan2(mv.y, mv.x);
    }
  }
  if (fire) tryFire(now);

  // Spielwelt
  updateBullets(dt);
  updateZone(dt);
  if (S.state === 'playing') {
    updatePowerups();
    if (!me.alive && S.mode !== 'br' && now >= me.deadUntil) respawnMe();
    if (S.hostId === MY_ID) {
      if (S.mode === 'br') {
        const total = countPlayers();
        // Grace: frisch gestartete Matchs noch nicht beenden – Remote-Alive-Flags
        // kommen erst mit dem nächsten Move-Paket (Reihenfolge-Race nach Rematch)
        const fresh = now - S.startTs < CFG.START_GRACE_MS;
        if ((!fresh && countAlive() <= 1 && total > 1) || now >= S.endAt) endMatch();
      } else if (now >= S.endAt) {
        endMatch();
      }
    }
  } else if (S.state === 'lobby' && me.alive && me.hp < CFG.MAX_HP) {
    me.hp = Math.min(CFG.MAX_HP, me.hp + CFG.LOBBY_REGEN * dt);
  }

  // Abläufe / Decay
  if (me.shieldUntil && now > me.shieldUntil) { me.shield = 0; me.shieldUntil = 0; }
  me.muzzle = Math.max(0, me.muzzle - dt);
  me.flash = Math.max(0, me.flash - dt);
  S.hitmarker = Math.max(0, S.hitmarker - dt * 3);
  S.dmgFlash = Math.max(0, S.dmgFlash - dt * 1.6);
  S.shake = Math.max(0, S.shake - dt * 26);

  // Remote-Interpolation
  const ki = 1 - Math.exp(-dt * 14);
  const ka = 1 - Math.exp(-dt * 12);
  for (const id of Object.keys(S.remotes)) {
    const r = S.remotes[id];
    r.x += (r.tx - r.x) * ki;
    r.y += (r.ty - r.y) * ki;
    if (r.ta != null) r.angle = lerpAngle(r.angle, r.ta, ka);
    if (r.flash > 0) r.flash -= dt;
    if (r.muzzle > 0) r.muzzle -= dt;
    r.stale = now - r.last > CFG.STALE_MS;
  }

  // Partikel
  for (let i = S.particles.length - 1; i >= 0; i--) {
    const p = S.particles[i];
    p.life -= dt;
    if (p.life <= 0) { S.particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const drag = 1 - Math.min(1, dt * 4);
    p.vx *= drag;
    p.vy *= drag;
  }

  updateCamera(dt);

  // Netzwerk senden
  if (now - S.lastNet >= CFG.NET_MS || me.dirty) {
    S.lastNet = now;
    me.dirty = false;
    Net.send('move', {
      i: MY_ID, n: me.name, c: me.color, x: r1(me.x), y: r1(me.y), a: r2(me.angle),
      h: Math.max(0, Math.round(me.hp)), s: Math.round(me.shield),
      al: me.alive ? 1 : 0, w: me.weapon, k: me.kills, d: me.deaths, t: me.team,
    });
  }
}

// ---------------- Netzwerk-Handler ----------------

function onMove(p) {
  if (!p || p.i === MY_ID) return;
  const now = S.now;
  let r = S.remotes[p.i];
  if (!r) {
    S.remotes[p.i] = {
      id: p.i, name: p.n || 'Unbekannt', color: p.c || colorForId(p.i),
      x: p.x, y: p.y, tx: p.x, ty: p.y, ta: p.a, angle: p.a || 0,
      hp: p.h != null ? p.h : CFG.MAX_HP, shield: p.s || 0, alive: p.al !== 0,
      weapon: p.w || 'pistol', kills: p.k | 0, deaths: p.d | 0, team: p.t | 0,
      last: now, flash: 0, muzzle: 0, stale: false,
    };
    return;
  }
  const wasAlive = r.alive;
  const nowAlive = p.al !== 0;
  r.name = p.n || r.name;
  r.color = p.c || r.color;
  r.tx = p.x; r.ty = p.y; r.ta = p.a;
  if ((!wasAlive && nowAlive) || dist(r.x, r.y, p.x, p.y) > 300) { r.x = p.x; r.y = p.y; }
  r.hp = p.h; r.shield = p.s || 0;
  r.alive = nowAlive;
  r.weapon = p.w || 'pistol';
  r.kills = p.k | 0; r.deaths = p.d | 0; r.team = p.t | 0;
  r.last = now;
}

function onShoot(p) {
  if (!p || p.o === MY_ID) return;
  spawnBullets(p);
  const r = S.remotes[p.o];
  if (r) r.muzzle = 0.07;
}

function onExplode(p) {
  if (!p || S.seenExplosions.has(p.b)) return;
  rememberExplosion(p.b);
  applyExplosion(p.x, p.y, p.w, p.o);
}

function onHit(p) {
  if (!p || p.k !== MY_ID) return;
  S.hitmarker = 1;
  Sfx.play('hit');
  const r = S.remotes[p.v];
  if (r) { r.flash = 0.16; r.hp = p.hp; r.shield = p.sh || 0; }
}

function onDeath(p) {
  if (!p || p.v === MY_ID) return;
  const r = S.remotes[p.v];
  if (r) { r.alive = false; r.hp = 0; }
  feedDeath(p.v, p.k);
  if (p.k === MY_ID) {
    S.me.kills++;
    S.hitmarker = 1;
    Sfx.play('kill');
  }
}

function onPickup(p) {
  if (!p) return;
  const pu = S.powerups[p.slot];
  if (!pu) return;
  if (p.r <= pu.respawns && p.t <= pu.hiddenUntil) return;
  pu.respawns = p.r;
  pu.hiddenUntil = p.t;
  pu.type = puType(pu.slot, pu.respawns);
  sparkAt(pu.x, pu.y, PU_INFO[pu.type].color, 10);
}

function onSync(p) {
  if (!p || !p.st) return;
  // Nur Syncs des (vom eigenen Presence-Bild gewählten) Hosts akzeptieren.
  // Verhindert, dass ein verwirrter Self-Host mit leerem Presence-Bild den
  // echten Zustand überschreibt (z. B. ein veraltetes "ended" nach Rematch).
  if (p.h && p.h !== S.hostId) return;
  if (p.pu) adoptPU(p.pu);
  if (p.md && MODES[p.md]) S.mode = p.md;
  if (p.tm) S.teams = p.tm;
  if (p.st === 'playing') {
    if (S.state !== 'playing' || p.ts !== S.startTs) {
      S.startTs = p.ts || Date.now();
      S.endAt = p.en || 0;
      enterPlaying();
    } else {
      S.startTs = p.ts; S.endAt = p.en;
    }
  } else if (p.st === 'lobby') {
    if (S.state !== 'lobby') enterLobby();
    else { S.startTs = 0; S.endAt = 0; S.teams = {}; S.results = null; }
  } else if (p.st === 'ended') {
    if (S.state !== 'ended') enterEnded(p.res);
    else if (p.res) { S.results = p.res; UI.showResults(p.res); }
  }
  UI.syncModeCards();
}

function onPresence() {
  S.hostId = Net.electHost();
  UI.renderRoster();
  if (!Net.channel) return;
  const st = Net.channel.presenceState();
  for (const id of Object.keys(S.remotes)) {
    if (!st[id] && S.now - S.remotes[id].last > 2000) delete S.remotes[id];
  }
}

// ---------------- Public API (UI ruft das an) ----------------

const Game = {
  init() {
    Sfx.init();
    const q = new URLSearchParams(location.search);
    const room = ((q.get('room') || 'main').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)) || 'main';
    let name = '';
    try { name = localStorage.getItem('ba_name') || ''; } catch (e) { /* egal */ }
    S.me.name = name || ('Spieler-' + MY_ID.slice(0, 4));
    S.me.color = colorForId(MY_ID);
    const sp = SPAWNS[Math.floor(Math.random() * SPAWNS.length)];
    S.me.x = sp.x; S.me.y = sp.y;
    S.cam.x = sp.x; S.cam.y = sp.y;
    initPowerups();

    const canvas = document.getElementById('c');
    Render.init(canvas);
    UI.init(room);
    Input.init(canvas);
    Input.onWeaponSlot = (n) => Game.setWeaponBySlot(n);
    Net.init(room);
    UI.refreshHighscores();
    requestAnimationFrame(frame);
  },

  update,
  isHost: () => S.hostId === MY_ID,
  room: () => Net.room,

  onMove, onShoot, onExplode, onHit, onDeath, onPickup, onSync, onPresence,

  setName(n) {
    n = (n || '').trim().slice(0, CFG.NAME_MAX);
    if (!n) n = 'Spieler-' + MY_ID.slice(0, 4);
    if (n === S.me.name) return;
    S.me.name = n;
    try { localStorage.setItem('ba_name', n); } catch (e) { /* egal */ }
    Net.track();
    S.me.dirty = true;
    UI.renderRoster();
  },

  setMode(m) {
    if (!MODES[m] || !Game.isHost() || S.state !== 'lobby') return;
    S.mode = m;
    Sfx.play('ui');
    UI.syncModeCards();
  },

  startMatch(mode) {
    if (!Game.isHost()) return;
    if (S.state !== 'lobby' && S.state !== 'ended') return;
    S.mode = MODES[mode] ? mode : S.mode;
    S.startTs = Date.now();
    S.endAt = S.startTs + MODES[S.mode].dur;
    S.teams = assignTeams();
    S.results = null;
    enterPlaying();
    sendSync();
  },

  toLobby() {
    if (!Game.isHost()) return;
    enterLobby();
    sendSync();
  },

  setWeapon(w) {
    const me = S.me;
    if (!WEAPONS[w] || !me.alive || me.weapon === w) return;
    if (S.state === 'playing' && !me.owned[w]) return;
    me.weapon = w;
    me.dirty = true;
    Sfx.play('ui');
    UI.syncWeaponChips();
  },

  setWeaponBySlot(n) {
    const w = WEAPON_ORDER.find((k) => WEAPONS[k].slot === n);
    if (w) Game.setWeapon(w);
  },

  standings() {
    const es = currentEntries();
    let teamScores = null;
    if (S.mode === 'tdm') {
      teamScores = [0, 1].map((t) => ({
        t, name: TEAM_NAMES[t], color: TEAM_COLORS[t],
        kills: es.filter((e) => e.team === t).reduce((a, e) => a + e.kills, 0),
      }));
      es.sort((a, b) => a.team - b.team || b.kills - a.kills || a.deaths - b.deaths);
    } else if (S.mode === 'br') {
      es.sort((a, b) => (b.alive - a.alive) || (b.kills - a.kills) || (a.deaths - b.deaths));
    } else {
      es.sort((a, b) => (b.kills - a.kills) || (a.deaths - b.deaths));
    }
    es.forEach((e) => { e.isMe = e.id === MY_ID; e.isHost = e.id === S.hostId; });
    return { mode: S.mode, rows: es, teamScores, hostId: S.hostId };
  },

  spectateName() {
    const r = S.spectateId ? S.remotes[S.spectateId] : null;
    return r ? r.name : null;
  },
};

// ---------------- Schleife ----------------

let lastTs = 0;
function frame(ts) {
  const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
  lastTs = ts;
  try {
    Game.update(dt);
    Render.frame(dt);
    UI.update(dt);
  } catch (e) {
    console.error('Frame-Fehler:', e);
  }
  requestAnimationFrame(frame);
}
