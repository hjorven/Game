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
      btnStart: document.getElementById('btnStart')
    };

    // Event Listener
    this.els.btnStart.addEventListener('click', () => {
      const name = this.els.nameIn.value.trim() || 'Spieler';
      Game.start(name);
    });

    this.els.nameIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const name = this.els.nameIn.value.trim() || 'Spieler';
        Game.start(name);
      }
    });

    this.els.btnBoard.addEventListener('click', () => this.toggleBoard());
    this.els.btnBoardClose.addEventListener('click', () => this.toggleBoard());
    this.els.btnMute.addEventListener('click', () => this.toggleMute());

    // Nickname aus LocalStorage laden
    const savedName = localStorage.getItem('arena_nick');
    if (savedName) this.els.nameIn.value = savedName;
  },

  setNetStatus(text, isErr = false) {
    if (!this.els.netStatus) return;
    this.els.netStatus.textContent = text;
    this.els.netStatus.className = isErr ? 'err' : '';
  },

  renderWeapons() {
    const e = this.els;
    if (!e.weapons) return;
    e.weapons.innerHTML = '';
    const me = S.me;
    if (!me) return;

    Object.keys(WEAPONS).forEach((wKey, idx) => {
      const w = WEAPONS[wKey];
      const btn = document.createElement('button');
      btn.className = 'wchip';
      
      const isSel = me.weapon === wKey;
      if (isSel) btn.classList.add('sel');
      if (!me.weaponsOwned || !me.weaponsOwned.includes(wKey)) {
        btn.classList.add('locked');
      }

      const ammoText = me.ammo && me.ammo[wKey] !== undefined ? me.ammo[wKey] : w.ammoMax;

      btn.innerHTML = `
        <span class="key">${idx + 1}</span>
        <span class="wname">${w.short || w.name}</span>
        <span class="ammo">${ammoText}</span>
      `;

      btn.addEventListener('click', () => {
        if (me.alive) Game.selectWeapon(wKey);
      });

      e.weapons.appendChild(btn);
    });
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
    this.renderWeapons();
  },

  toggleBoard() {
    S.boardOpen = !S.boardOpen;
    this.els.board.classList.toggle('hidden', !S.boardOpen);
    if (S.boardOpen) this.updateBoard();
  },

  toggleMute() {
    const isOn = AudioSys.toggle();
    this.els.btnMute.textContent = isOn ? 'Ton: an' : 'Ton: aus';
    this.els.btnMute.classList.toggle('off', !isOn);
  },

  setNotice(text, ms = 2000) {
    const el = this.els.notice;
    el.textContent = text;
    el.classList.remove('hide');
    clearTimeout(this._noticeTimer);
    this._noticeTimer = setTimeout(() => {
      el.classList.add('hide');
    }, ms);
  },

  addKillfeed(info) {
    const kf = this.els.killfeed;
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
