// js/render.js — Canvas-Rendering: Dark Zinc Design (Anti-AI UI Guidelines)
'use strict';

const Render = {
  canvas: null,
  ctx: null,
  w: 0, h: 0, dpr: 1,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
  },

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.canvas.style.width = this.w + 'px';
    this.canvas.style.height = this.h + 'px';
    S.cam.scale = clamp(Math.min(this.w, this.h) / 650, 0.55, 1.25);
  },

  worldToScreen(x, y) {
    return { x: (x - S.cam.x) * S.cam.scale + this.w / 2, y: (y - S.cam.y) * S.cam.scale + this.h / 2 };
  },
  screenToWorld(x, y) {
    return { x: (x - this.w / 2) / S.cam.scale + S.cam.x, y: (y - this.h / 2) / S.cam.scale + S.cam.y };
  },

  frame() {
    const ctx = this.ctx, dpr = this.dpr;
    const shx = (Math.random() - 0.5) * S.shake;
    const shy = (Math.random() - 0.5) * S.shake;

    const sc = S.cam.scale;
    ctx.setTransform(dpr * sc, 0, 0, dpr * sc,
      dpr * (this.w / 2 - S.cam.x * sc + shx),
      dpr * (this.h / 2 - S.cam.y * sc + shy));

    this.drawFloor(ctx);
    this.drawWalls(ctx);
    this.drawGrenadePreview(ctx);
    this.drawPowerups(ctx);
    this.drawDrops(ctx);
    this.drawBullets(ctx);
    for (const r of Object.values(S.remotes)) this.drawPlayer(ctx, r, false);
    this.drawPlayer(ctx, S.me, true);
    this.drawParticles(ctx);
    this.drawHitmarker(ctx);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawTapAim(ctx);
    this.drawMinimap(ctx);
    this.drawSticks(ctx);
    this.drawVignette(ctx);
  },

  drawFloor(ctx) {
    const W = World.w, H = World.h;
    // Void außerhalb der Map: Dark Zinc-950 (#09090b)
    ctx.fillStyle = '#09090b';
    ctx.fillRect(-600, -600, W + 1200, H + 1200);

    // Spielfläche: Dark Zinc-900 (#18181b)
    ctx.fillStyle = '#18181b';
    ctx.fillRect(0, 0, W, H);

    // Dezentes 80px Raster: Zinc-800 (#27272a)
    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 80; x < W; x += 80) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 80; y < H; y += 80) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    // Kartenrand: Präziser Rahmen in Zinc-700 (#3f3f46)
    ctx.strokeStyle = '#3f3f46';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, W, H);
  },

  drawWalls(ctx) {
    for (const w of World.walls) {
      // Flacher, fester Versatzschatten statt Unschärfe-Glow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(w.x + 3, w.y + 4, w.w, w.h);

      // Wandfläche: Zinc-800 (#27272a)
      ctx.fillStyle = '#27272a';
      ctx.fillRect(w.x, w.y, w.w, w.h);

      // Kante: Zinc-700 (#3f3f46)
      ctx.strokeStyle = '#3f3f46';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(w.x, w.y, w.w, w.h);
    }
  },

  drawPowerups(ctx) {
    const now = S.now;
    for (const p of S.powerups) {
      const info = PU_INFO[p.type];
      const bob = Math.sin(now / 320 + p.slot * 1.7) * 3;
      if (now < p.hiddenUntil) continue;
      const y = p.y + bob;

      // Schlichter Badge ohne Glow
      ctx.fillStyle = '#18181b';
      ctx.beginPath(); ctx.arc(p.x, y, 13, 0, Math.PI * 2); ctx.fill();

      ctx.strokeStyle = info.color || '#3f3f46';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#fafafa';
      ctx.font = '600 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(info.label, p.x, y + 0.5);
    }
  },

  drawDrops(ctx) {
    const now = S.now;
    for (const d of S.drops) {
      const W = WEAPONS[d.w];
      if (!W) continue;
      const y = d.y + Math.sin(now / 320 + d.x * 0.01) * 3;

      ctx.fillStyle = '#18181b';
      ctx.beginPath(); ctx.arc(d.x, y, 14, 0, Math.PI * 2); ctx.fill();

      ctx.strokeStyle = W.color || '#3f3f46';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#fafafa';
      ctx.font = '700 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(W.short, d.x, y + 0.5);
    }
  },

  drawBullets(ctx) {
    for (const b of S.bullets) {
      if (b.isArc) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.size * 0.7, 0, Math.PI * 2); ctx.fill();
        const drawY = b.y - (b.z || 0);
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.arc(b.x, drawY, b.size, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2); ctx.fill();
      }
    }
  },

  drawPlayer(ctx, p, isMe) {
    const R = CFG.R;

    if (!p.alive) {
      ctx.strokeStyle = '#52525b';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, R * 0.6, 0, Math.PI * 2); ctx.stroke();
      return;
    }

    ctx.save();
    ctx.translate(p.x, p.y);

    // Ausrichtungs-Zeiger
    ctx.rotate(p.angle);
    ctx.fillStyle = '#d4d4d8';
    ctx.fillRect(0, -2.5, R + 9, 5);

    // Spieler-Kreis
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = '#18181b';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Eigener Spieler-Indikator
    if (isMe) {
      ctx.beginPath();
      ctx.arc(0, 0, R + 4, 0, Math.PI * 2);
      ctx.strokeStyle = '#fafafa';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Schild-Ring
    if (p.shield > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, R + 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();

    // Name & HP-Leiste
    const bw = 36;
    const bx = p.x - bw / 2, by = p.y - R - 12;

    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fafafa';
    ctx.fillText(p.name || '', p.x, by - 4);

    const hpRatio = clamp(p.hp / CFG.MAX_HP, 0, 1);
    ctx.fillStyle = '#27272a';
    ctx.fillRect(bx, by, bw, 4);
    ctx.fillStyle = hpRatio > 0.4 ? '#4ade80' : '#f87171';
    ctx.fillRect(bx, by, bw * hpRatio, 4);
  },

  drawParticles(ctx) {
    for (const p of S.particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  drawHitmarker(ctx) {
    if (S.hitmarker <= 0 || !S.me.alive) return;
    const x = S.me.x, y = S.me.y, r = CFG.R + 8;
    ctx.strokeStyle = '#fafafa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - r, y - r); ctx.lineTo(x - r + 6, y - r + 6);
    ctx.moveTo(x + r, y - r); ctx.lineTo(x + r - 6, y - r + 6);
    ctx.moveTo(x - r, y + r); ctx.lineTo(x - r + 6, y + r - 6);
    ctx.moveTo(x + r, y + r); ctx.lineTo(x + r - 6, y + r - 6);
    ctx.stroke();
  },

  drawTapAim(ctx) {
    const t = Input.tapAim;
    if (!t || performance.now() >= t.until) return;
    ctx.strokeStyle = '#f97316';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(t.x, t.y, 14, 0, Math.PI * 2); ctx.stroke();
  },

  drawMinimap(ctx) {
    const mw = Math.min(168, this.w * 0.34);
    const mh = mw * (World.h / World.w);
    const mx = this.w - mw - 12;
    const my = 54;
    const sx = mw / World.w, sy = mh / World.h;

    ctx.save();
    ctx.fillStyle = 'rgba(24, 24, 27, 0.9)'; // Zinc-900
    ctx.strokeStyle = '#3f3f46'; // Zinc-700
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(mx, my, mw, mh, 4); else ctx.rect(mx, my, mw, mh);
    ctx.fill(); ctx.stroke();

    ctx.beginPath();
    ctx.rect(mx, my, mw, mh);
    ctx.clip();

    ctx.fillStyle = '#3f3f46';
    for (const w of World.walls) ctx.fillRect(mx + w.x * sx, my + w.y * sy, Math.max(2, w.w * sx), Math.max(2, w.h * sy));

    const drawDot = (x, y, color, isSelf) => {
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(mx + x * sx, my + y * sy, isSelf ? 4 : 3, 0, Math.PI * 2); ctx.fill();
    };
    for (const r of Object.values(S.remotes)) {
      if (!r.alive) continue;
      drawDot(r.x, r.y, r.color, false);
    }
    if (S.me.alive) drawDot(S.me.x, S.me.y, '#fafafa', true);

    ctx.restore();
  },

  drawSticks(ctx) {
    const drawStick = (s, baseColor, knobColor) => {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = baseColor;
      ctx.beginPath(); ctx.arc(s.ox, s.oy, Input.STICK_R, 0, Math.PI * 2); ctx.fill();
      const dx = s.x - s.ox, dy = s.y - s.oy;
      const d = Math.hypot(dx, dy) || 1;
      const kd = Math.min(d, Input.STICK_R);
      ctx.fillStyle = knobColor;
      ctx.beginPath(); ctx.arc(s.ox + (dx / d) * kd, s.oy + (dy / d) * kd, 24, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    };

    if (Input.moveStick) drawStick(Input.moveStick, 'rgba(63, 63, 70, 0.3)', 'rgba(161, 161, 170, 0.8)');
    if (Input.aimStick) drawStick(Input.aimStick, 'rgba(63, 63, 70, 0.3)', 'rgba(248, 113, 113, 0.8)');
  },

  drawVignette(ctx) {
    const me = S.me;
    let inten = clamp(S.dmgFlash, 0, 1) * 0.75;
    if (S.state === 'playing' && me.alive && me.hp < 35) {
      inten = Math.max(inten, (0.35 - me.hp / 100) * (0.7 + 0.3 * Math.sin(S.now / 200)));
    }
    if (inten <= 0.02) return;
    const R = Math.hypot(this.w, this.h) * 0.62;
    const g = ctx.createRadialGradient(this.w / 2, this.h / 2, R * 0.45, this.w / 2, this.h / 2, R);
    g.addColorStop(0, 'rgba(220, 38, 38, 0)');
    g.addColorStop(1, `rgba(220, 38, 38, ${(inten * 0.6).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  },

  drawGrenadePreview(ctx) {
    const me = S.me;
    if (S.state !== 'playing' || !me.alive) return;
    const W = WEAPONS[me.weapon];
    if (!W || !W.isArc) return;

    const aim = Input.aimInfo();
    let targetDist = W.maxRange || 350;
    if ((aim.source === 'mouse' || aim.source === 'tap') && aim.screen) {
      const wPos = this.screenToWorld(aim.screen.x, aim.screen.y);
      const d = dist(me.x, me.y, wPos.x, wPos.y);
      targetDist = Math.min(d, W.maxRange || 350);
    }

    const bx = me.x + Math.cos(me.angle) * (CFG.R + 10);
    const by = me.y + Math.sin(me.angle) * (CFG.R + 10);
    const tx = bx + Math.cos(me.angle) * targetDist;
    const ty = by + Math.sin(me.angle) * targetDist;

    ctx.save();
    ctx.strokeStyle = '#a1a1aa'; // Zinc-400 gestrichelter Bogen
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(bx, by);

    const steps = 15;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = bx + (tx - bx) * t;
      const py = by + (ty - by) * t;
      const pz = Math.sin(t * Math.PI) * 45;
      ctx.lineTo(px, py - pz);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    const splashR = W.splash || 90;
    ctx.fillStyle = 'rgba(248, 113, 113, 0.12)';
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.arc(tx, ty, splashR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }
};
