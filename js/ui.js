// js/ui.js — DOM-Overlay: Startbildschirm, HUD, Killfeed, Tabelle
'use strict';

const UI = {
  els: {},
  _acc: 0,
  _accBoard: 0,
  _noticeTimer: null,
  _deadShown: false,

  init() {
    this.els = {
      hud: document.getElementById('hud'),
      hpFill: document.getElementById('hpFill'),
      hpText: document.getElementById('hpText'),
      shWrap: document.getElementById('shWrap'),
      shFill: document.getElementById('shFill'),
      buffs: document.getElementById('buffs'),
      kd: document.getElementById('kd'),
      weapons: document.getElementById('weapons'),
      killfeed: document.getElementById('killfeed'),
      dead: document.getElementById('dead'),
      notice: document.getElementById('notice'),
      board: document.getElementById('board'),
      boardBody: document.getElementById('boardBody'),
      btnBoard: document.getElementById('btnBoard'),
      btnBoardClose: document.getElementById('btnBoardClose'),
      btnMute: document.getElementById('btnMute'),
      lobby: document.getElementById('lobby'),
      netStatus: document.getElementById('netStatus'),
      nameIn: document.getElementById('nameIn'),
      btnStart: document.getElementById('btnStart'),
      loading: document.getElementById('loading')
    };

    // Event Listener
    this.els.btnStart.addEventListener('click', () => {
      Game.startGame();
    });

    this.els.nameIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        Game.startGame();
      }
    });

    this.els.btnBoard.addEventListener('click', () => this.toggleBoard());
    this.els.btnBoardClose.addEventListener('click', () => this.toggleBoard());
    this.els.btnMute.addEventListener('click', () => this.toggleMute());

    // Nickname
    if (S.me && S.me.name) this.els.nameIn.value = S.me.name;

    // Startansicht anzeigen & Ladebildschirm entfernen
    this.enterStart();
    if (this.els.loading) this.els.loading.remove();
  },

  setNetStatus(text, isErr = false) {
    if (!this.els.netStatus) return;
    this.els.netStatus.textContent = text;
    this.els.netStatus.className = isErr ? 'err' : '';
  },

  syncWeaponChips() {
    const e = this.els;
    if (!e.weapons) return;
    const me = S.me;
    if (!me) return;

    e.weapons.textContent = '';
    me.slots.forEach((w, i) => {
      const btn = document.createElement('button');
      btn.className = 'wchip';
      
      const key = document.createElement('span');
      key.className = 'key';
      key.textContent = String(i + 1);

      const nm = document.createElement('span');
      nm.className = 'wname';

      if (w && WEAPONS[w]) {
        btn.dataset.w = w;
        const W = WEAPONS[w];
        nm.textContent = W.short || W.name;

        if (W.ammoMax) {
          const am = document.createElement('span');
          am.className = 'ammo';
          if (me.reloadUntil > S.now && me.weapon === w) {
            am.textContent = 'R';
            const bar = document.createElement('span');
            bar.className = 'rbar';
            btn.appendChild(bar);
            btn.classList.add('reloading');
          } else {
            am.textContent = (me.ammo[w] | 0);
          }
          btn.appendChild(am);
        }

        btn.classList.toggle('sel', me.weapon === w && me.alive);
        btn.disabled = !me.alive;
        btn.addEventListener('click', () => Game.setWeapon(w));
      } else {
        nm.textContent = '–';
        btn.classList.add('locked');
        btn.disabled = true;
      }

      btn.append(key, nm);
      e.weapons.appendChild(btn);
    });
  },

  reloadDone() {
    const chip = this.els.weapons.querySelector('.wchip.sel');
    if (chip) {
      chip.classList.add('flashing');
      setTimeout(() => chip.classList.remove('flashing'), 650);
    }
  },

  enterStart() {
    this.els.lobby.classList.remove('hidden');
    this.els.hud.classList.add('hidden');
    this.els.dead.classList.add('hidden');
    this.els.board.classList.add('hidden');
  },

  enterGame() {
    this.els.lobby.classList.add('hidden');
    this.els.hud.classList.remove('hidden');
    this.els.dead.classList.add('hidden');
    this.els.board.classList.add('hidden');
    this.syncWeaponChips();
  },

  toggleBoard() {
    S.boardOpen = !S.boardOpen;
    this.els.board.classList.toggle('hidden', !S.boardOpen);
    if (S.boardOpen) this.updateBoard();
  },

  toggleMute() {
    const isOn = Sfx.toggle();
    this.els.btnMute.textContent = isOn ? 'Ton: an' : 'Ton: aus';
    this.els.btnMute.classList.toggle('off', !isOn);
  },

  setNotice(text, ms = 2000) {
    const el = this.els.notice;
    if (!el) return;
    el.textContent = text;
    el.classList.remove('hide');
    clearTimeout(this._noticeTimer);
    this._noticeTimer = setTimeout(() => {
      el.classList.add('hide');
    }, ms);
  },

  addKillfeed(info) {
    const kf = this.els.killfeed;
    if (!kf) return;
    const item = document.createElement('div');
    item.className = 'kf';
    if (info.self) {
      item.innerHTML = `<span style="color:${info.vc}">${info.v}</span> ist gestorben`;
    } else {
      item.innerHTML = `<span style="color:${info.kc}">${info.k}</span> ☠ <span style="color:${info.vc}">${info.v}</span>`;
    }
    kf.appendChild(item);
    setTimeout(() => {
      item.style.opacity = '0';
      item.style.transition = 'opacity 0.3s';
      setTimeout(() => item.remove(), 300);
    }, CFG.KILLFEED_MS || 4000);

    while (kf.children.length > 5) {
      kf.firstChild.remove();
    }
  },

  updateBoard() {
    const data = Game.standings();
    let html = '<table><thead><tr><th>Spieler</th><th>Kills</th><th>Tode</th></tr></thead><tbody>';
    for (const r of data.rows) {
      const cls = [];
      if (r.isMe) cls.push('me');
      if (!r.alive) cls.push('out');
      const classAttr = cls.length ? ` class="${cls.join(' ')}"` : '';
      const deadMark = r.alive ? '' : ' ☠';

      html += `<tr${classAttr}><td>${r.name}${deadMark}</td><td>${r.kills}</td><td>${r.deaths}</td></tr>`;
    }
    html += '</tbody></table>';
    this.els.boardBody.innerHTML = html;
  },

  update(dt) {
    if (S.state !== 'playing') return;
    const me = S.me;
    if (!me) return;

    this._acc += dt;
    if (this._acc > 0.08) {
      this._acc = 0;

      // HP-Leiste
      const hpPct = Math.max(0, Math.min(100, (me.hp / CFG.MAX_HP) * 100));
      this.els.hpFill.style.width = hpPct + '%';
      this.els.hpText.textContent = Math.max(0, Math.round(me.hp));

      // Schild-Leiste
      const shPct = Math.max(0, Math.min(100, (me.shield / CFG.MAX_SHIELD) * 100));
      this.els.shWrap.classList.toggle('hidden', shPct <= 0);
      this.els.shFill.style.width = shPct + '%';

      // Respawn- / Toten-Anzeige
      if (!me.alive && !this._deadShown) {
        this.els.dead.classList.remove('hidden');
        this._deadShown = true;
      } else if (me.alive && this._deadShown) {
        this.els.dead.classList.add('hidden');
        this._deadShown = false;
      }

      if (!me.alive) {
        const left = Math.max(0, Math.ceil((me.deadUntil - S.now) / 1000));
        this.els.dead.innerHTML = `ELIMINIERT — Respawn in ${left}s`;
      }

      // K/D Anzeige
      this.els.kd.textContent = `K ${me.kills} · D ${me.deaths}`;
    }

    if (S.boardOpen) {
      this._accBoard += dt;
      if (this._accBoard > 0.8) {
        this._accBoard = 0;
        this.updateBoard();
      }
    }
  }
};
