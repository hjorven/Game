// js/ui.js — DOM-Overlay: Startbildschirm, HUD, Killfeed, Tabelle
'use strict';

const UI = {
  els: {},
  _noticeTimer: null,
  _acc: 0,
  _accBoard: 0,

  init() {
    const $ = (id) => document.getElementById(id);
    this.els = {
      hud: $('hud'), hpFill: $('hpFill'), hpText: $('hpText'),
      shWrap: $('shWrap'), shFill: $('shFill'), buffs: $('buffs'),
      kd: $('kd'),
      weapons: $('weapons'), dead: $('dead'), killfeed: $('killfeed'), notice: $('notice'),
      btnBoard: $('btnBoard'), btnMute: $('btnMute'),
      board: $('board'), boardBody: $('boardBody'), btnBoardClose: $('btnBoardClose'),
      lobby: $('lobby'), nameIn: $('nameIn'), btnStart: $('btnStart'),
      netStatus: $('netStatus'),
      loading: $('loading'),
    };
    const e = this.els;

    // Name
    e.nameIn.value = S.me.name;
    e.nameIn.maxLength = CFG.NAME_MAX;
    e.nameIn.addEventListener('change', () => Game.setName(e.nameIn.value));
    e.nameIn.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') e.nameIn.blur(); });

    // Start
    e.btnStart.addEventListener('click', () => Game.startGame());

    // Waffen-Chips (dynamisch aus den 2 Slots)
    e.weapons.addEventListener('click', (ev) => {
      const chip = ev.target.closest('.wchip');
      if (chip && chip.dataset.w) Game.setWeapon(chip.dataset.w);
    });

    // Buttons
    e.btnBoard.addEventListener('click', () => this.toggleBoard());
    e.btnBoardClose.addEventListener('click', () => this.toggleBoard());
    e.btnMute.addEventListener('click', () => this.toggleMute());

    e.btnMute.textContent = Sfx.enabled ? 'Ton: an' : 'Ton: aus';
    e.btnMute.classList.toggle('off', !Sfx.enabled);

    this.enterStart();
    if (e.loading) e.loading.remove();
  },

  // ---------- Status ----------

  setNetStatus(text, isErr) {
    const el = this.els.netStatus;
    if (!el) return;
    el.textContent = 'Server: ' + text;
    el.classList.toggle('err', !!isErr);
  },

  syncWeaponChips() {
    const e = this.els;
    if (!e.weapons) return;
    const me = S.me;
    const sig = me.slots.join(',') + '|' + me.weapon + '|' + me.alive +
      '|' + me.slots.map((w) => (w && WEAPONS[w].ammoMax ? me.ammo[w] | 0 : 0)).join(',');
    if (e.weapons.dataset.sig === sig) return;
    e.weapons.dataset.sig = sig;
    e.weapons.textContent = '';
    me.slots.forEach((w, i) => {
      const btn = document.createElement('button');
      btn.className = 'wchip';
      btn.dataset.slot = String(i + 1);
      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = String(i + 1);
      const nm = document.createElement('span');
      nm.className = 'wname';
      if (w) {
        btn.dataset.w = w;
        const W = WEAPONS[w];
        nm.textContent = W.short + (W.ammoMax ? ' ' + (me.ammo[w] | 0) : '');
        btn.classList.toggle('sel', me.weapon === w && me.alive);
        btn.disabled = !me.alive;
      } else {
        nm.textContent = '–';
        btn.classList.add('locked');
        btn.disabled = true;
      }
      btn.append(key, nm);
      e.weapons.appendChild(btn);
    });
  },

  // ---------- Zustandswechsel ----------

  enterGame() {
    this.els.lobby.classList.add('hidden');
    this.els.hud.classList.remove('hidden');
    if (S.boardOpen) this.toggleBoard();
    this.syncWeaponChips();
  },

  enterStart() {
    this.els.lobby.classList.remove('hidden');
    this.els.hud.classList.add('hidden');
    if (S.boardOpen) this.toggleBoard();
    this.els.nameIn.value = S.me.name;
  },

  // ---------- HUD ----------

  addKillfeed(o) {
    const kf = this.els.killfeed;
    if (!kf) return;
    const mk = (text, color) => {
      const s = document.createElement('span');
      s.textContent = text;
      if (color) s.style.color = color;
      return s;
    };
    const div = document.createElement('div');
    div.className = 'kf';
    if (o.self) { div.append(mk(o.v, o.vc), mk(' – Selbstschuss')); }
    else { div.append(mk(o.k, o.kc), mk('  ›  '), mk(o.v, o.vc)); }
    kf.prepend(div);
    while (kf.children.length > 6) kf.lastChild.remove();
    setTimeout(() => div.remove(), CFG.KILLFEED_MS);
  },

  setNotice(text, ms) {
    const el = this.els.notice;
    if (!el) return;
    clearTimeout(this._noticeTimer);
    el.textContent = text;
    el.classList.remove('hide');
    this._noticeTimer = setTimeout(() => el.classList.add('hide'), ms || 2000);
  },

  toggleBoard() {
    S.boardOpen = !S.boardOpen;
    this.els.board.classList.toggle('hidden', !S.boardOpen);
    if (S.boardOpen) this.renderStandings();
    Sfx.play('ui');
  },

  toggleMute() {
    const on = Sfx.toggle();
    this.els.btnMute.textContent = on ? 'Ton: an' : 'Ton: aus';
    this.els.btnMute.classList.toggle('off', !on);
  },

  renderStandings() {
    const st = Game.standings();
    const e = this.els;
    e.boardBody.textContent = '';
    const tbl = document.createElement('table');
    tbl.innerHTML = '<thead><tr><th>#</th><th>Spieler</th><th>Kills</th><th>Deaths</th></tr></thead>';
    const tbody = document.createElement('tbody');
    st.rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      if (r.isMe) tr.className = 'me';
      const cells = [String(i + 1), r.name, String(r.kills | 0), String(r.deaths | 0)];
      cells.forEach((t) => { const td = document.createElement('td'); td.textContent = t; tr.appendChild(td); });
      if (!r.alive) tr.classList.add('out');
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    e.boardBody.appendChild(tbl);
  },

  // ---------- Frame-Update ----------

  update(dt) {
    const e = this.els;
    const me = S.me;
    if (!e.hud) return;

    const hp = clamp(me.hp, 0, CFG.MAX_HP);
    e.hpFill.style.width = (hp / CFG.MAX_HP * 100) + '%';
    e.hpText.textContent = Math.ceil(hp);
    const shOn = me.shield > 0 && S.now < me.shieldUntil;
    e.shWrap.classList.toggle('hidden', !shOn);
    if (shOn) e.shFill.style.width = (me.shield / CFG.MAX_SHIELD * 100) + '%';

    // toaktive Infos (gedrosselt)
    this._acc += dt;
    if (this._acc >= 0.2) {
      this._acc = 0;
      this._tick();
    }

    // Board live aktualisieren
    if (S.boardOpen) {
      this._accBoard += dt;
      if (this._accBoard >= 0.5) { this._accBoard = 0; this.renderStandings(); }
    }
  },

  _tick() {
    const e = this.els;
    const me = S.me;

    e.kd.textContent = 'K ' + me.kills + ' · D ' + me.deaths;

    // Buffs
    const buffs = [];
    if (me.shield > 0 && S.now < me.shieldUntil) buffs.push('Schild ' + Math.ceil((me.shieldUntil - S.now) / 1000) + 's');
    const b = buffs.join(' · ');
    if (e.buffs.textContent !== b) e.buffs.textContent = b;

    // Tot-Banner
    if (S.state === 'playing' && !me.alive) {
      const left = Math.max(0, (me.deadUntil - S.now) / 1000);
      e.dead.classList.remove('hidden');
      e.dead.textContent = 'Eliminiert – Spawn in ' + left.toFixed(1) + 's';
    } else if (!e.dead.classList.contains('hidden')) {
      e.dead.classList.add('hidden');
    }
  },
};
