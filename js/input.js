// js/input.js — Tastatur, Maus, virtuelle Joysticks (Touch/Apple Pencil)
'use strict';

const Input = {
  isTouch: false,
  keys: {},
  mouse: { x: 0, y: 0, down: false, has: false },
  moveStick: null,   // { id, ox, oy, x, y, t0 }
  aimStick: null,    // { id, ox, oy, x, y, t0, moved }
  tapAim: null,      // { x, y, until } (Screen-Koordinaten)
  canvas: null,
  onWeaponSlot: null, // wird von Game gesetzt
  onReload: null,     // wird von Game gesetzt

  STICK_R: 62,        // visueller Radius
  STICK_DEAD: 10,     // Totzone in px

  init(canvas) {
    this.canvas = canvas;

    const onTouchStart = () => { this.isTouch = true; };

    canvas.addEventListener('pointerdown', (e) => {
      Sfx.resume();
      if (e.pointerType === 'mouse') {
        if (e.button === 0) this.mouse.down = true;
        return;
      }
      onTouchStart();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
      const half = window.innerWidth / 2;
      if (e.clientX < half) {
        if (!this.moveStick) this.moveStick = this.newStick(e);
        else if (!this.aimStick) this.aimStick = this.newStick(e);
      } else {
        if (!this.aimStick) this.aimStick = this.newStick(e);
        else if (!this.moveStick) this.moveStick = this.newStick(e);
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
        this.mouse.has = true;
      }
      if (this.moveStick && e.pointerId === this.moveStick.id) this.updStick(this.moveStick, e);
      if (this.aimStick && e.pointerId === this.aimStick.id) this.updStick(this.aimStick, e);
    });

    const up = (e) => {
      if (e.pointerType === 'mouse') { this.mouse.down = false; return; }
      if (this.moveStick && e.pointerId === this.moveStick.id) this.moveStick = null;
      if (this.aimStick && e.pointerId === this.aimStick.id) {
        // Kurzes Antippen ohne Ziehen = auf Zielpunkt schiessen
        const s = this.aimStick;
        if (s.moved < 14 && performance.now() - s.t0 < 300) {
          this.tapAim = { x: s.ox, y: s.oy, until: performance.now() + 450 };
        }
        this.aimStick = null;
      }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.mouse.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return; // Tippen nicht stören
      Sfx.resume();
      const k = e.key.toLowerCase();
      this.keys[k] = true;
      if (k === ' ') e.preventDefault();
      if (k >= '1' && k <= '2' && this.onWeaponSlot) this.onWeaponSlot(+k);
      if (k === 'r' && this.onReload) this.onReload();
      if (k === 'tab') { e.preventDefault(); UI.toggleBoard(); }
      if (k === 'm' && UI.toggleMute) UI.toggleMute();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.key.toLowerCase()] = false; });
    window.addEventListener('blur', () => {
      this.keys = {};
      this.mouse.down = false;
      this.moveStick = null;
      this.aimStick = null;
    });
    document.addEventListener('pointerdown', () => Sfx.resume(), { once: false });
    // iOS Safari: Pinch-Zoom / Frame-Gesten unterdrücken
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
  },

  newStick(e) {
    return { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), moved: 0 };
  },
  updStick(s, e) {
    s.moved = Math.max(s.moved, dist(s.ox, s.oy, e.clientX, e.clientY));
    s.x = e.clientX;
    s.y = e.clientY;
  },

  // Bewegungsvektor (Tastatur + linker Stick), Betrag 0..1
  moveVector() {
    let x = 0, y = 0;
    if (this.keys['w'] || this.keys['arrowup']) y -= 1;
    if (this.keys['s'] || this.keys['arrowdown']) y += 1;
    if (this.keys['a'] || this.keys['arrowleft']) x -= 1;
    if (this.keys['d'] || this.keys['arrowright']) x += 1;
    let mag = 0;
    if (x || y) { const l = Math.hypot(x, y); x /= l; y /= l; mag = 1; }
    const s = this.moveStick;
    if (s) {
      const dx = s.x - s.ox, dy = s.y - s.oy;
      const d = Math.hypot(dx, dy);
      if (d > this.STICK_DEAD) {
        const m = Math.min(1, (d - this.STICK_DEAD) / (this.STICK_R - this.STICK_DEAD));
        x = (dx / d) * m; y = (dy / d) * m; mag = Math.max(mag, m);
      }
    }
    return { x, y, mag };
  },

  // Zielen: { source:'stick'|'tap'|'mouse', angle, active }
  aimInfo() {
    const s = this.aimStick;
    if (s) {
      const dx = s.x - s.ox, dy = s.y - s.oy;
      const d = Math.hypot(dx, dy);
      if (d > this.STICK_DEAD) {
        return { source: 'stick', angle: Math.atan2(dy, dx), active: true, mag: Math.min(1, d / this.STICK_R) };
      }
      return { source: 'stick', angle: null, active: false, mag: 0 };
    }
    if (this.tapAim && performance.now() < this.tapAim.until) {
      return { source: 'tap', screen: this.tapAim, active: true, mag: 1 };
    }
    if (this.mouse.has) {
      return { source: 'mouse', screen: this.mouse, active: this.mouse.down || !!this.keys[' '], mag: 1 };
    }
    // Nur Tastatur (keine Maus benutzt): halte Leertaste zum Schiessen
    if (this.keys[' ']) {
      return { source: 'key', active: true, mag: 1 };
    }
    return { source: 'none', active: false, mag: 0 };
  },

  clearTapAim() { this.tapAim = null; },
};
