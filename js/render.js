// js/render.js — Canvas-Rendering: Welt, Spieler, Minimap, Joysticks, Effekte
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

    // Welt-Transform
    const sc = S.cam.scale;
    ctx.setTransform(dpr * sc, 0, 0, dpr * sc,
      dpr * (this.w / 2 - S.cam.x * sc + shx),
      dpr * (this.h / 2 - S.cam.y * sc + shy));

    this.drawFloor(ctx);
    this.drawWalls(ctx);
    this.drawPowerups(ctx);
    this.drawDrops(ctx);
    this.drawBullets(ctx);
    for (const r of Object.values(S.remotes)) this.drawPlayer(ctx, r, false);
    this.drawPlayer(ctx, S.me, true);
    this.drawParticles(ctx);
    this.drawHitmarker(ctx);

    // Screen-Overlay
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawTapAim(ctx);
    this.drawMinimap(ctx);
    this.drawSticks(ctx);
    this.drawVignette(ctx);
  },

  drawFloor(ctx) {
    const W = World.w, H = World.h;
    ctx.fillStyle = '#10131a';
    ctx.fillRect(-600, -600, W + 1200, H + 1200);
    ctx.fillStyle = '#1b212b';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 80; x < W; x += 80) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 80; y < H; y += 80) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    for (let x = 400; x < W; x += 400) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 400; y < H; y += 400) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    ctx.strokeStyle = '#46566b';
    ctx.lineWidth = 6;
    ctx.strokeRect(0, 0, W, H);
  },

  drawWalls(ctx) {
    for (const w of World.walls) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(w.x + 4, w.y + 6, w.w, w.h);
      ctx.fillStyle = '#2d3a4a';
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fillRect(w.x, w.y, w.w, 5);
      ctx.strokeStyle = '#4a5d74';
      ctx.lineWidth = 2;
      ctx.strokeRect(w.x + 1, w.y + 1, w.w - 2, w.h - 2);
    }
  },

  drawPowerups(ctx) {
    const now = S.now;
    for (const p of S.powerups) {
      const info = PU_INFO[p.type];
      const bob = Math.sin(now / 320 + p.slot * 1.7) * 4;
      if (now < p.hiddenUntil) {
        const frac = clamp(1 - (p.hiddenUntil - now) / puRespawnMs(p.type), 0, 1);
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = info.color;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 5]);
        ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
        ctx.stroke();
        ctx.globalAlpha = 1;
        continue;
      }
      const y = p.y + bob;
      ctx.save();
      ctx.shadowColor = info.color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#141a22';
      ctx.beginPath(); ctx.arc(p.x, y, 13, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = info.color;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = info.color;
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(info.label, p.x, y + 0.5);
    }
  },

  // Vom Tod gefallene Waffen
  drawDrops(ctx) {
    const now = S.now;
    for (const d of S.drops) {
      const W = WEAPONS[d.w];
      if (!W) continue;
      const y = d.y + Math.sin(now / 320 + d.x * 0.01) * 4;
      ctx.save();
      ctx.shadowColor = W.color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#141a22';
      ctx.beginPath(); ctx.arc(d.x, y, 14, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = W.color;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = W.color;
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(W.short, d.x, y + 0.5);
    }
  },

  drawBullets(ctx) {
    for (const b of S.bullets) {
      if (b.w === 'sniper') {
        ctx.strokeStyle = b.color;
        ctx.lineWidth = b.size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, b.size - 3);
        ctx.stroke();
      } else if (b.w === 'rocket') {
        ctx.fillStyle = 'rgba(255,140,60,0.5)';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.size + 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffe0b2';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.size - 3, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = b.color;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.size * 2, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fffde7';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2); ctx.fill();
      }
    }
  },

  drawPlayer(ctx, p, isMe) {
    const R = CFG.R;
    if (!p.alive) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = '#90a4ae';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, 13, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p.x - 6, p.y - 6); ctx.lineTo(p.x + 6, p.y + 6);
      ctx.moveTo(p.x + 6, p.y - 6); ctx.lineTo(p.x - 6, p.y + 6);
      ctx.stroke();
      ctx.restore();
      return;
    }

    const body = p.color;
    const W = WEAPONS[p.weapon] || WEAPONS.pistol;
    const barrel = 24 + (p.weapon === 'sniper' ? 15 : p.weapon === 'rocket' ? 9 : 0);

    ctx.save();
    ctx.translate(p.x, p.y);

    // Schatten
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(2, 6, R, R * 0.75, 0, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.rotate(p.angle);
    // Waffe
    ctx.fillStyle = '#cfd8dc';
    ctx.fillRect(3, -3.5, barrel, 7);
    ctx.fillStyle = '#78909c';
    ctx.fillRect(2, 3, 9, 5);
    if (p.muzzle > 0) {
      ctx.globalAlpha = clamp(p.muzzle / 0.07, 0, 1);
      ctx.fillStyle = W.color;
      ctx.beginPath();
      ctx.moveTo(barrel + 4, 0);
      ctx.lineTo(barrel + 4 + 15, -7);
      ctx.lineTo(barrel + 4 + 22, 0);
      ctx.lineTo(barrel + 4 + 15, 7);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Körper
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fillStyle = body; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.stroke();
    ctx.beginPath(); ctx.arc(-6, -7, R * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fill();

    if (isMe) {
      ctx.beginPath(); ctx.arc(0, 0, R + 4, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.stroke();
    }
    if (p.flash > 0) {
      ctx.globalAlpha = clamp(p.flash / 0.16, 0, 1) * 0.65;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fillStyle = '#ff5252'; ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (p.shield > 0) {
      ctx.beginPath(); ctx.arc(0, 0, R + 7, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(64,196,255,0.95)'; ctx.lineWidth = 3; ctx.stroke();
    }
    if (isMe && S.now < S.me.protectUntil) {
      const a = 0.35 + 0.3 * Math.sin(S.now / 90);
      ctx.beginPath(); ctx.arc(0, 0, R + 11, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${a.toFixed(2)})`; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();

    // Namenszug + HP
    const hpRatio = clamp(p.hp / CFG.MAX_HP, 0, 1);
    const bw = 44;
    const bx = p.x - bw / 2, by = p.y - R - 18;

    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = isMe ? '#ffffff' : 'rgba(255,255,255,0.9)';
    ctx.fillText(p.name || '', p.x, by - 6);

    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, 7);
    ctx.fillStyle = hpRatio > 0.5 ? '#69f0ae' : hpRatio > 0.25 ? '#ffd740' : '#ff5252';
    ctx.fillRect(bx, by, bw * hpRatio, 5);
    if (p.shield > 0) {
      const sw = bw * clamp(p.shield / CFG.MAX_SHIELD, 0, 1);
      ctx.fillStyle = '#40c4ff';
      ctx.fillRect(bx, by - 5, sw, 3);
    }
  },

  drawParticles(ctx) {
    for (const p of S.particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      if (p.ring) {
        const t = 1 - a;
        ctx.globalAlpha = a * 0.9;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 + 5 * a;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size + (p.r1 - p.size) * t, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * a), 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  },

  drawHitmarker(ctx) {
    if (S.hitmarker <= 0 || !S.me.alive) return;
    const a = clamp(S.hitmarker, 0, 1);
    const x = S.me.x, y = S.me.y, r = CFG.R + 10;
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - r, y - r + 6); ctx.lineTo(x - r + 7, y - r + 13);
    ctx.moveTo(x + r, y - r + 6); ctx.lineTo(x + r - 7, y - r + 13);
    ctx.moveTo(x - r, y + r - 6); ctx.lineTo(x - r + 7, y + r - 13);
    ctx.moveTo(x + r, y + r - 6); ctx.lineTo(x + r - 7, y + r - 13);
    ctx.stroke();
    ctx.globalAlpha = 1;
  },

  drawTapAim(ctx) {
    const t = Input.tapAim;
    if (!t || performance.now() >= t.until) return;
    const a = clamp((t.until - performance.now()) / 450, 0, 1);
    ctx.globalAlpha = a;
    ctx.strokeStyle = '#ff8a65';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(t.x, t.y, 16, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(t.x - 22, t.y); ctx.lineTo(t.x - 8, t.y);
    ctx.moveTo(t.x + 8, t.y); ctx.lineTo(t.x + 22, t.y);
    ctx.moveTo(t.x, t.y - 22); ctx.lineTo(t.x, t.y - 8);
    ctx.moveTo(t.x, t.y + 8); ctx.lineTo(t.x, t.y + 22);
    ctx.stroke();
    ctx.globalAlpha = 1;
  },

  drawMinimap(ctx) {
    const mw = Math.min(168, this.w * 0.34);
    const mh = mw * (World.h / World.w);
    const mx = this.w - mw - 12;
    const my = 54;
    const sx = mw / World.w, sy = mh / World.h;

    ctx.save();
    ctx.fillStyle = 'rgba(8,10,14,0.8)';
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(mx, my, mw, mh, 6); else ctx.rect(mx, my, mw, mh);
    ctx.fill(); ctx.stroke();

    ctx.beginPath();
    ctx.rect(mx, my, mw, mh);
    ctx.clip();

    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (const w of World.walls) ctx.fillRect(mx + w.x * sx, my + w.y * sy, Math.max(2, w.w * sx), Math.max(2, w.h * sy));

    for (const p of S.powerups) {
      if (S.now < p.hiddenUntil) continue;
      ctx.fillStyle = PU_INFO[p.type].color;
      ctx.fillRect(mx + p.x * sx - 1.5, my + p.y * sy - 1.5, 3, 3);
    }

    const drawDot = (x, y, color, isSelf, stale) => {
      ctx.globalAlpha = stale ? 0.4 : 1;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(mx + x * sx, my + y * sy, isSelf ? 4 : 3, 0, Math.PI * 2); ctx.fill();
      if (isSelf) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };
    for (const r of Object.values(S.remotes)) {
      if (!r.alive) continue;
      drawDot(r.x, r.y, r.color, false, r.stale);
    }
    if (S.me.alive) drawDot(S.me.x, S.me.y, '#ffffff', true, false);

    ctx.restore();
  },

  drawSticks(ctx) {
    const drawStick = (s, baseColor, knobColor) => {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = baseColor;
      ctx.beginPath(); ctx.arc(s.ox, s.oy, Input.STICK_R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2; ctx.stroke();
      const dx = s.x - s.ox, dy = s.y - s.oy;
      const d = Math.hypot(dx, dy) || 1;
      const kd = Math.min(d, Input.STICK_R);
      ctx.fillStyle = knobColor;
      ctx.beginPath(); ctx.arc(s.ox + (dx / d) * kd, s.oy + (dy / d) * kd, 24, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    };

    if (Input.moveStick) drawStick(Input.moveStick, 'rgba(80,140,255,0.25)', 'rgba(120,170,255,0.75)');
    if (Input.aimStick) drawStick(Input.aimStick, 'rgba(255,100,80,0.25)', 'rgba(255,140,110,0.8)');

    if (Input.isTouch && !Input.moveStick && !Input.aimStick) {
      ctx.globalAlpha = 0.09;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.w * 0.15, this.h - 95, 46, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(this.w * 0.85, this.h - 95, 46, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.3;
      ctx.font = '10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('BEWEGEN', this.w * 0.15, this.h - 40);
      ctx.fillText('ZIELLEN', this.w * 0.85, this.h - 40);
      ctx.globalAlpha = 1;
    }
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
    g.addColorStop(0, 'rgba(255,30,30,0)');
    g.addColorStop(1, `rgba(255,30,30,${(inten * 0.7).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  },
};
