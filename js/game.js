// js/game.js — Spielzustand, Logik, Netzwerk-Handler
'use strict';

const S = {
  state: 'start', // start | playing
  me: {
    id: MY_ID, name: 'Spieler', color: '#fff',
    x: 600, y: 200, angle: 0,
    hp: CFG.MAX_HP, shield: 0, alive: true,
    weapon: 'pistol',
    slots: ['pistol', null],   // 2 Waffen-Slots (Slot 0 = Pistole, nie ersetzbar)
    ammo: { pistol: Infinity },
    kills: 0, deaths: 0,
    protectUntil: 0, shieldUntil: 0, deadUntil: 0,
    lastShot: 0, muzzle: 0, flash: 0, dirty: false,
    reloadUntil: 0,    // Zeitpunkt, ab dem die aktuelle Waffe nachgeladen ist (0 = nicht laden)
  },
  remotes: {},
  bullets: [],
  particles: [],
  powerups: [],
  drops: [],        // Waffen-Drops vom Tod anderer Spieler
  seenExplosions: new Set(),
  cam: { x: 600, y: 200, scale: 1 },
  shake: 0, hitmarker: 0, dmgFlash: 0,
  boardOpen: false,
  lastNet: 0, now: 0,
};

// ---------------- Helfer ----------------

function pointInWall(x, y) {
  return World.inWall(x, y);
}

function resolveEntity(e) {
  for (const w of World.nearWalls(e.x, e.y)) {
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

function pickSpawn() {
  const me = S.me;
  const list = World.spawns;
  let best = list[0] || { x: World.w / 2, y: World.h / 2 }, bestScore = -1;
  for (const sp of list) {
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
  if (S.state !== 'playing' || !me.alive) return;
  const W = WEAPONS[me.weapon];
  if (me.reloadUntil > now) return;
  if (now - me.lastShot < W.rate) return;
  if (W.ammoMax) {
    if ((me.ammo[W.key] || 0) <= 0) {
      me.reloadUntil = now + W.reloadMs;
      me.reloadW = W.key;
      me.dirty = true;
      UI.syncWeaponChips();
      Sfx.play('reload');
      UI.setNotice('Lade nach …', 1200);
      return;
    }
    me.ammo[W.key]--;
    UI.syncWeaponChips();
  }
  me.lastShot = now;
  me.muzzle = 0.07;
  const bx = me.x + Math.cos(me.angle) * (CFG.R + 10);
  const by = me.y + Math.sin(me.angle) * (CFG.R + 10);

  let tx = null, ty = null;
  if (W.isArc) {
    const aim = Input.aimInfo();
    let targetDist = W.maxRange || 350;
    if ((aim.source === 'mouse' || aim.source === 'tap') && aim.screen) {
      const wPos = Render.screenToWorld(aim.screen.x, aim.screen.y);
      const d = dist(me.x, me.y, wPos.x, wPos.y);
      targetDist = Math.min(d, W.maxRange || 350);
    }
    tx = r1(bx + Math.cos(me.angle) * targetDist);
    ty = r1(by + Math.sin(me.angle) * targetDist);
  }

  const evt = {
    id: MY_ID + '-' + now.toString(36) + Math.random().toString(36).slice(2, 6),
    o: MY_ID, w: me.weapon, x: r1(bx), y: r1(by), a: r2(me.angle),
    tx, ty
  };
  Net.send('shoot', evt);
  spawnBullets(evt);
  S.shake = Math.min(12, S.shake + (me.weapon === 'sniper' || me.weapon === 'rocket' || me.weapon === 'magnum' ? 4 : me.weapon === 'grenade' ? 3 : 1.5));
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

    const b = {
      eid: evt.id, id: evt.id + '_' + i, o: evt.o, w: evt.w,
      x: evt.x, y: evt.y, px: evt.x, py: evt.y,
      vx: Math.cos(a) * W.spd, vy: Math.sin(a) * W.spd,
      life: W.life, dmg: W.dmg, size: W.size, color: W.color, splash: W.splash || 0,
    };

    if (W.isArc && evt.tx != null && evt.ty != null) {
      b.isArc = true;
      b.sx = evt.x; b.sy = evt.y;
      b.tx = evt.tx; b.ty = evt.ty;
      b.totalDist = dist(evt.x, evt.y, evt.tx, evt.ty);
      b.travelled = 0;
    }

    S.bullets.push(b);
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

    if (b.isArc) {
      const step = Math.sqrt(b.vx * b.vx + b.vy * b.vy) * dt;
      b.travelled += step;
      const t = Math.min(1, b.travelled / (b.totalDist || 1));
      b.x = b.sx + (b.tx - b.sx) * t;
      b.y = b.sy + (b.ty - b.sy) * t;
      b.z = Math.sin(t * Math.PI) * 55; // Bogenhöhe in Pixeln

      if (Math.random() < 0.4) {
        addP({ x: b.x, y: b.y - b.z, vx: (Math.random() - 0.5) * 15, vy: (Math.random() - 0.5) * 15, life: 0.25, maxLife: 0.25, color: 'rgba(200,200,200,0.6)', size: 3 });
      }

      if (t >= 1) {
        if (!S.seenExplosions.has(b.eid)) {
          triggerExplode(b, b.tx, b.ty);
        }
        S.bullets.splice(i, 1);
      }
    } else {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      if (b.splash && Math.random() < 0.75) {
        addP({ x: b.x, y: b.y, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30, life: 0.4, maxLife: 0.4, color: 'rgba(180,180,180,0.8)', size: 4 + Math.random() * 3 });
      }

      const wall = pointInWall(b.x, b.y);
      const out = b.x < 0 || b.x > World.w || b.y < 0 || b.y > World.h;
      const hitMe = b.o !== MY_ID && me.alive && S.state === 'playing' &&
        segCircle(b.px, b.py, b.x, b.y, me.x, me.y, CFG.R + b.size * 0.5);
      const expired = b.life <= 0;

      if (wall || out || hitMe || expired) {
        if (b.splash && !S.seenExplosions.has(b.eid)) {
          const ex = clamp(b.x, 2, World.w - 2), ey = clamp(b.y, 2, World.h - 2);
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
}

// ---------------- Schaden & Tod ----------------

function damageMe(dmg, fromId) {
  const me = S.me;
  if (S.state !== 'playing' || !me.alive || dmg <= 0) return;
  if (fromId && fromId !== MY_ID && S.now < me.protectUntil) return;
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
  me.shield = 0; me.shieldUntil = 0;
  me.reloadUntil = 0; me.reloadW = null;
  me.dirty = true;
  const dropW = me.weapon !== 'pistol' ? me.weapon : me.slots.find((w) => w && w !== 'pistol');
  if (dropW) {
    const d = { id: MY_ID + '-' + me.deaths, w: dropW, x: r1(me.x), y: r1(me.y) };
    S.drops.push(d);
    Net.send('drop', d);
  }
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
  me.slots = ['pistol', null];
  me.ammo = { pistol: Infinity };
  me.reloadUntil = 0; me.reloadW = null;
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
  if (!killerId || killerId === victimId) UI.addKillfeed({ v: v.name, vc: v.color, self: true });
  else {
    const k = who(killerId);
    UI.addKillfeed({ k: k.name, kc: k.color, v: v.name, vc: v.color });
  }
}

// ---------------- Loot: Pickups & Waffen ----------------

function puRespawnMs(type) {
  return type.startsWith('weapon_') ? CFG.WEAPON_MS : CFG.PU_MS;
}

function initPowerups() {
  S.powerups = World.puSlots.map((s, i) => ({ slot: i, x: s.x, y: s.y, type: s.type, respawns: 0, hiddenUntil: 0 }));
}

function adoptPU(pu) {
  if (!pu) return;
  for (const row of pu) {
    const p = S.powerups[row[0]];
    if (!p) continue;
    if (row[1] === p.respawns && row[2] === p.hiddenUntil) continue;
    p.respawns = row[1];
    p.hiddenUntil = row[2];
  }
}

function updatePowerups() {
  const me = S.me;
  syncPickupSlots();
  if (!me.alive) return;
  for (const p of S.powerups) {
    if (S.now < p.hiddenUntil) continue;
    if (dist2(me.x, me.y, p.x, p.y) < (CFG.R + 18) * (CFG.R + 18)) {
      collectPowerup(p);
      break;
    }
  }
  for (let i = S.drops.length - 1; i >= 0; i--) {
    const d = S.drops[i];
    if (dist2(me.x, me.y, d.x, d.y) < (CFG.R + 20) * (CFG.R + 20)) {
      if (giveWeapon(d.w)) {
        S.drops.splice(i, 1);
        Net.send('dropgone', { id: d.id });
        sparkAt(d.x, d.y, WEAPONS[d.w].color, 12);
        UI.setNotice(WEAPONS[d.w].name + ' aufgehoben!', 1400);
        Sfx.play('pickup');
        me.dirty = true;
      }
      break;
    }
  }
}

function syncPickupSlots() {
  const slots = World.puSlots;
  if (S.powerups.length === slots.length && S._puSig === slots.length + ':' + slots[0].x) return;
  S._puSig = slots.length + ':' + slots[0].x;
  const next = slots.map((s, i) => {
    const old = S.powerups[i];
    if (old) { old.x = s.x; old.y = s.y; return old; }
    return { slot: i, x: s.x, y: s.y, type: s.type, respawns: 0, hiddenUntil: 0 };
  });
  S.powerups = next;
}

function collectPowerup(p) {
  const info = PU_INFO[p.type];
  applyPickup(p.type);
  sparkAt(p.x, p.y, info.color, 12);
  p.respawns++;
  p.hiddenUntil = S.now + puRespawnMs(p.type);

  const nextType = getRandomPUType();
  p.type = nextType;

  Net.send('pickup', { slot: p.slot, r: p.respawns, t: p.hiddenUntil, nextType });
  S.me.dirty = true;
  Sfx.play('pickup');
  UI.setNotice(info.label + ' eingesammelt!', 1300);
}

function applyPickup(type) {
  const me = S.me;
  if (type === 'health') me.hp = Math.min(CFG.MAX_HP, me.hp + 50);
  else if (type === 'shield') { me.shield = CFG.MAX_SHIELD; me.shieldUntil = S.now + CFG.SHIELD_MS; }
  else if (type === 'ammo') {
    for (const w of me.slots) if (w && WEAPONS[w].ammoMax) me.ammo[w] = WEAPONS[w].ammoMax;
    UI.syncWeaponChips();
  } else if (type.startsWith('weapon_')) {
    giveWeapon(type.slice(7));
  }
}

function giveWeapon(w) {
  const me = S.me;
  if (!WEAPONS[w]) return false;
  if (me.reloadUntil) { me.reloadUntil = 0; me.reloadW = null; UI.syncWeaponChips(); }
  if (me.slots.includes(w)) { me.weapon = w; me.dirty = true; UI.syncWeaponChips(); return false; }
  const free = me.slots.indexOf(null);
  const idx = free >= 0 ? free : me.slots.indexOf(me.weapon);
  if (idx < 0) return false;
  me.slots[idx] = w;
  me.ammo[w] = WEAPONS[w].ammoMax || Infinity;
  me.weapon = w;
  me.dirty = true;
  UI.syncWeaponChips();
  return true;
}

// ---------------- Sync ----------------

function syncPayload() {
  return {
    to: null,
    pu: S.powerups.map((p) => [p.slot, p.respawns, p.hiddenUntil]),
    dr: S.drops.map((d) => [d.id, d.w, d.x, d.y]),
  };
}

function requestSync() {
  Net.send('syncreq', { i: MY_ID });
}

// ---------------- Start ----------------

function startGameState() {
  const me = S.me;
  S.state = 'playing';
  me.alive = true;
  me.hp = CFG.MAX_HP;
  me.shield = 0; me.shieldUntil = 0;
  me.weapon = 'pistol';
  me.slots = ['pistol', null];
  me.ammo = { pistol: Infinity };
  me.reloadUntil = 0; me.reloadW = null;
  me.kills = 0; me.deaths = 0;
  const sp = pickSpawn();
  me.x = sp.x; me.y = sp.y;
  me.protectUntil = S.now + CFG.PROTECT_MS;
  me.deadUntil = 0;
  me.dirty = true;
  S.bullets.length = 0;
  S.seenExplosions.clear();
  UI.enterGame();
  UI.syncWeaponChips();
  UI.setNotice('VIEL ERFOLG!', 2000);
  Sfx.play('start');
  requestSync();
}

// ---------------- Kamera ----------------

function updateCamera(dt) {
  const k = 1 - Math.exp(-dt * 7);
  S.cam.x += (S.me.x - S.cam.x) * k;
  S.cam.y += (S.me.y - S.cam.y) * k;
  const hw = (Render.w / 2) / S.cam.scale, hh = (Render.h / 2) / S.cam.scale;
  S.cam.x = World.w > hw * 2 ? clamp(S.cam.x, hw, World.w - hw) : World.w / 2;
  S.cam.y = World.h > hh * 2 ? clamp(S.cam.y, hh, World.h - hh) : World.h / 2;
}

// ---------------- Haupt-Update ----------------

function update(dt) {
  const now = Date.now();
  S.now = now;
  const me = S.me;

  if (now - (S.lastScale || 0) >= 1000) {
    S.lastScale = now;
    World.setTarget(Net.roster().length);
  }
  World.update(dt);

  const mv = Input.moveVector();
  const speed = CFG.SPEED;
  if (S.state === 'playing' && me.alive) {
    if (mv.mag > 0) {
      me.x += mv.x * speed * dt;
      me.y += mv.y * speed * dt;
      resolveEntity(me);
    }
    me.x = clamp(me.x, CFG.R, World.w - CFG.R);
    me.y = clamp(me.y, CFG.R, World.h - CFG.R);
  }

  const aim = Input.aimInfo();
  let fire = false;
  if (S.state === 'playing' && me.alive) {
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
      if (mv.mag > 0) me.angle = Math.atan2(mv.y, mv.x);
      fire = true;
    } else if (mv.mag > 0) {
      me.angle = Math.atan2(mv.y, mv.x);
    }
  }
  if (fire) tryFire(now);

  if (me.reloadUntil && now >= me.reloadUntil) {
    const RW = WEAPONS[me.reloadW] || WEAPONS[me.weapon];
    if (RW.ammoMax && me.slots.includes(RW.key)) me.ammo[RW.key] = RW.ammoMax;
    me.reloadUntil = 0;
    me.reloadW = null;
    me.dirty = true;
    UI.syncWeaponChips();
    UI.reloadDone();
    Sfx.play('reloadDone');
  }

  updateBullets(dt);
  if (S.state === 'playing') {
    updatePowerups();
    if (!me.alive && now >= me.deadUntil) respawnMe();
  }

  if (me.shieldUntil && now > me.shieldUntil) { me.shield = 0; me.shieldUntil = 0; }
  me.muzzle = Math.max(0, me.muzzle - dt);
  me.flash = Math.max(0, me.flash - dt);
  S.hitmarker = Math.max(0, S.hitmarker - dt * 3);
  S.dmgFlash = Math.max(0, S.dmgFlash - dt * 1.6);
  S.shake = Math.max(0, S.shake - dt * 26);

  // Remote-Interpolation & automatisches Aufräumen inaktiver Spieler
  const ki = 1 - Math.exp(-dt * 14);
  const ka = 1 - Math.exp(-dt * 12);
  const st = Net.channel ? Net.channel.presenceState() : {};

  for (const id of Object.keys(S.remotes)) {
    const r = S.remotes[id];

    // Entfernen, wenn der Spieler nicht mehr in Presence ist ODER seit 6 Sekunden gar nichts mehr gesendet hat
    if (!st[id] || (now - r.last > 6000)) {
      delete S.remotes[id];
      continue;
    }

    r.x += (r.tx - r.x) * ki;
    r.y += (r.ty - r.y) * ki;
    if (r.ta != null) r.angle = lerpAngle(r.angle, r.ta, ka);
    if (r.flash > 0) r.flash -= dt;
    if (r.muzzle > 0) r.muzzle -= dt;
    r.stale = now - r.last > CFG.STALE_MS;
  }

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

  if (S.state === 'playing' && (now - S.lastNet >= CFG.NET_MS || me.dirty)) {
    S.lastNet = now;
    me.dirty = false;
    Net.send('move', {
      i: MY_ID, n: me.name, c: me.color, x: r1(me.x), y: r1(me.y), a: r2(me.angle),
      h: Math.max(0, Math.round(me.hp)), s: Math.round(me.shield),
      al: me.alive ? 1 : 0, w: me.weapon, k: me.kills, d: me.deaths,
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
      weapon: p.w || 'pistol', kills: p.k | 0, deaths: p.d | 0,
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
  r.kills = p.k | 0; r.deaths = p.d | 0;
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
  if (p.nextType) pu.type = p.nextType;
  sparkAt(pu.x, pu.y, PU_INFO[pu.type].color, 10);
}

function onDrop(p) {
  if (!p || !p.id) return;
  if (S.drops.some((d) => d.id === p.id)) return;
  S.drops.push({ id: p.id, w: p.w, x: p.x, y: p.y });
}

function onDropGone(p) {
  if (!p || !p.id) return;
  const i = S.drops.findIndex((d) => d.id === p.id);
  if (i >= 0) S.drops.splice(i, 1);
}

function onSyncReq(p) {
  if (!p || p.i === MY_ID) return;
  if (Net.syncAnswerer() !== MY_ID) return;
  const ans = syncPayload();
  ans.to = p.i;
  Net.send('syncans', ans);
}

function onSyncAns(p) {
  if (!p) return;
  if (p.to && p.to !== MY_ID) return;
  if (p.pu) adoptPU(p.pu);
  if (p.dr) adoptDrops(p.dr);
}

function adoptDrops(rows) {
  for (const r of rows) {
    const d = { id: r[0], w: r[1], x: r[2], y: r[3] };
    if (!d.id || S.drops.some((x) => x.id === d.id)) continue;
    S.drops.push(d);
  }
}

function onPresence() {
  if (!Net.channel) return;
  const st = Net.channel.presenceState();
  for (const id of Object.keys(S.remotes)) {
    if (!st[id]) delete S.remotes[id];
  }
}

// ---------------- Public API ----------------

const Game = {
  init() {
    Sfx.init();
    let name = '';
    try { name = localStorage.getItem('ba_name') || ''; } catch (e) { /* egal */ }
    S.me.name = name || ('Spieler-' + MY_ID.slice(0, 4));
    S.me.color = colorForId(MY_ID);
    const sp = World.spawns[Math.floor(Math.random() * World.spawns.length)] || { x: World.w / 2, y: World.h / 2 };
    S.me.x = sp.x; S.me.y = sp.y;
    S.cam.x = sp.x; S.cam.y = sp.y;
    initPowerups();

    const canvas = document.getElementById('c');
    Render.init(canvas);
    UI.init();
    Input.init(canvas);
    Input.onWeaponSlot = (n) => Game.setWeaponBySlot(n);
    Input.onReload = () => Game.reload();
    Net.init();
    requestAnimationFrame(frame);
  },

  update,
  onMove, onShoot, onExplode, onHit, onDeath, onPickup, onDrop, onDropGone, onSyncReq, onSyncAns, onPresence,

  setName(n) {
    n = (n || '').trim().slice(0, CFG.NAME_MAX);
    if (!n) n = 'Spieler-' + MY_ID.slice(0, 4);
    if (n === S.me.name) return;
    S.me.name = n;
    try { localStorage.setItem('ba_name', n); } catch (e) { /* egal */ }
    Net.track();
    S.me.dirty = true;
  },

  startGame() {
    if (S.state === 'playing') return;
    S.me.name = (document.getElementById('nameIn').value || '').trim().slice(0, CFG.NAME_MAX) || S.me.name;
    try { localStorage.setItem('ba_name', S.me.name); } catch (e) { /* egal */ }
    Net.track();
    startGameState();
  },

  setWeapon(w) {
    const me = S.me;
    if (!WEAPONS[w] || !me.alive) return;
    if (!me.slots.includes(w)) return;
    if (me.weapon === w) return;
    if (me.reloadUntil) { me.reloadUntil = 0; me.reloadW = null; }
    me.weapon = w;
    me.dirty = true;
    Sfx.play('ui');
    UI.syncWeaponChips();
  },

  reload() {
    const me = S.me;
    if (S.state !== 'playing' || !me.alive) return;
    const W = WEAPONS[me.weapon];
    if (!W.ammoMax) return;
    if ((me.ammo[W.key] || 0) >= W.ammoMax) return;
    if (me.reloadUntil > S.now) return;
    me.reloadUntil = S.now + W.reloadMs;
    me.reloadW = W.key;
    me.dirty = true;
    Sfx.play('reload');
    UI.syncWeaponChips();
  },

  setWeaponBySlot(n) {
    const w = S.me.slots[n - 1];
    if (w) Game.setWeapon(w);
  },

  standings() {
    const me = S.me;
    const list = [{ id: MY_ID, name: me.name, kills: me.kills, deaths: me.deaths, alive: me.alive }];
    for (const r of Object.values(S.remotes)) {
      list.push({ id: r.id, name: r.name, kills: r.kills, deaths: r.deaths, alive: r.alive });
    }
    list.sort((a, b) => (b.kills - a.kills) || (a.deaths - b.deaths));
    list.forEach((e) => { e.isMe = e.id === MY_ID; });
    return { rows: list };
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
