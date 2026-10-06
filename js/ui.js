// js/ui.js — DOM-Overlay: Lobby, HUD, Killfeed, Scoreboard, Highscores
'use strict';

const UI = {
  els: {},
  _noticeTimer: null,
  _acc: 0,
  _accBoard: 0,
  _room: 'main',

  init(room) {
    this._room = room;
    const $ = (id) => document.getElementById(id);
    this.els = {
      hud: $('hud'), hpFill: $('hpFill'), hpText: $('hpText'),
      shWrap: $('shWrap'), shFill: $('shFill'), buffs: $('buffs'),
      modeLbl: $('modeLbl'), subLbl: $('subLbl'), timer: $('timer'), kd: $('kd'),
      weapons: $('weapons'), dead: $('dead'), killfeed: $('killfeed'), notice: $('notice'),
      btnBoard: $('btnBoard'), btnMute: $('btnMute'),
      board: $('board'), boardTeams: $('boardTeams'), boardBody: $('boardBody'), btnBoardClose: $('btnBoardClose'),
      lobby: $('lobby'), nameIn: $('nameIn'), roomIn: $('roomIn'), btnRoom: $('btnRoom'),
      shareLink: $('shareLink'), btnCopy: $('btnCopy'), modeCards: $('modeCards'),
      btnStart: $('btnStart'), hostNote: $('hostNote'), roster: $('roster'),
      netStatus: $('netStatus'), scoresBody: $('scoresBody'), scoresNote: $('scoresNote'),
      results: $('results'), resTitle: $('resTitle'), resSub: $('resSub'), resBody: $('resBody'),
      btnAgain: $('btnAgain'), btnToLobby: $('btnToLobby'), resWait: $('resWait'),
      loading: $('loading'),
    };
    const e = this.els;

    // Lobby: Name
    e.nameIn.value = S.me.name;
    e.nameIn.maxLength = CFG.NAME_MAX;
    e.nameIn.addEventListener('change', () => Game.setName(e.nameIn.value));
    e.nameIn.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') e.nameIn.blur(); });

    // Lobby: Raum
    e.roomIn.value = room;
    const share = location.origin + location.pathname + '?room=' + room;
    e.shareLink.textContent = share;
    const joinRoom = () => {
      const v = (e.roomIn.value || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'main';
      if (v !== room) location.search = '?room=' + v;
    };
    e.btnRoom.addEventListener('click', joinRoom);
    e.roomIn.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') joinRoom(); });
    e.btnCopy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(share); this.setNotice('Link kopiert!', 1800); }
      catch (err) { this.setNotice('Kopieren nicht möglich – Link manuell teilen', 2600); }
      Sfx.play('ui');
    });

    // Lobby: Modus & Start
    e.modeCards.querySelectorAll('.mcard').forEach((c) => {
      c.addEventListener('click', () => Game.setMode(c.dataset.m));
    });
    e.btnStart.addEventListener('click', () => Game.startMatch(S.mode));

    // Waffen-Chips
    e.weapons.querySelectorAll('.wchip').forEach((c) => {
      c.addEventListener('click', () => Game.setWeapon(c.dataset.w));
    });

    // Buttons
    e.btnBoard.addEventListener('click', () => this.toggleBoard());
    e.btnBoardClose.addEventListener('click', () => this.toggleBoard());
    e.btnMute.addEventListener('click', () => this.toggleMute());
    e.btnAgain.addEventListener('click', () => { if (Game.isHost()) Game.startMatch(S.mode); });
    e.btnToLobby.addEventListener('click', () => { if (Game.isHost()) Game.toLobby(); });

    e.btnMute.textContent = Sfx.enabled ? 'Ton: an' : 'Ton: aus';
    e.btnMute.classList.toggle('off', !Sfx.enabled);

    this.enterLobby();
    if (e.loading) e.loading.remove();
  },

  // ---------- Status / Roster ----------

  setNetStatus(text, isErr) {
    const el = this.els.netStatus;
    if (!el) return;
    el.textContent = 'Server: ' + text;
    el.classList.toggle('err', !!isErr);
  },

  renderRoster() {
    const el = this.els.roster;
    if (!el) return;
    const list = Net.roster();
    el.textContent = '';
    const head = document.createElement('div');
    head.className = 'roster-head';
    head.textContent = 'Spieler im Raum „' + Net.room + '“ (' + list.length + ')';
    el.appendChild(head);
    for (const p of list) {
      const row = document.createElement('div');
      row.className = 'roster-row' + (p.id === MY_ID ? ' me' : '');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = p.color;
      const name = document.createElement('span');
      name.className = 'rname';
      name.textContent = p.name + (p.id === MY_ID ? ' (du)' : '');
      row.append(dot, name);
      if (p.id === S.hostId) {
        const crown = document.createElement('span');
        crown.className = 'host-tag';
        crown.textContent = 'HOST';
        row.appendChild(crown);
      }
      el.appendChild(row);
    }
  },

  syncModeCards() {
    const e = this.els;
    if (!e.modeCards) return;
    const host = Game.isHost();
    const canEdit = host && S.state === 'lobby';
    e.modeCards.querySelectorAll('.mcard').forEach((c) => {
      c.classList.toggle('sel', c.dataset.m === S.mode);
      c.disabled = !canEdit;
    });
    if (S.state === 'lobby') {
      e.btnStart.disabled = !host;
      e.btnStart.textContent = host ? 'Runde starten – ' + MODES[S.mode].name : 'Wartet auf Host …';
      e.hostNote.textContent = host ? 'Du bist Host.' : 'Jemand anderes startet die Runde.';
    }
    this.renderRoster();
  },

  syncWeaponChips() {
    const e = this.els;
    if (!e.weapons) return;
    e.weapons.querySelectorAll('.wchip').forEach((c) => {
      const w = c.dataset.w;
      const owned = S.state === 'playing' ? !!S.me.owned[w] : true;
      c.classList.toggle('locked', !owned);
      c.classList.toggle('sel', S.me.weapon === w);
      c.disabled = !owned || !S.me.alive;
      const key = c.querySelector('.key');
      if (key) key.textContent = WEAPONS[w].slot;
    });
  },

  // ---------- Zustandswechsel ----------

  enterMatch() {
    this.els.lobby.classList.add('hidden');
    this.els.results.classList.add('hidden');
    this.els.hud.classList.remove('hidden');
    if (S.boardOpen) this.toggleBoard();
    this.syncWeaponChips();
    this.renderRoster();
  },

  enterLobby() {
    this.els.lobby.classList.remove('hidden');
    this.els.results.classList.add('hidden');
    this.els.hud.classList.add('hidden');
    if (S.boardOpen) this.toggleBoard();
    this.els.nameIn.value = S.me.name;
    this.syncModeCards();
    this.renderRoster();
    this.refreshHighscores();
  },

  showResults(res) {
    const e = this.els;
    e.results.classList.remove('hidden');
    if (!res) {
      e.resTitle.textContent = 'Runde beendet';
      e.resSub.textContent = 'Ergebnis wird geladen …';
      e.resBody.textContent = '';
      this._syncResultButtons();
      return;
    }
    const meWon = res.winnerId === MY_ID || (res.mode === 'tdm' && res.winnerTeam >= 0 && S.me.team === res.winnerTeam);
    if (meWon) e.resTitle.textContent = 'DU gewinnst!';
    else if (res.mode === 'tdm') e.resTitle.textContent = 'Team ' + res.winnerName + ' gewinnt!';
    else if (res.mode === 'br') e.resTitle.textContent = res.winnerName + ' überlebt!';
    else e.resTitle.textContent = res.winnerName + ' gewinnt!';
    e.resSub.textContent = MODES[res.mode] ? MODES[res.mode].name : res.mode;

    e.resBody.textContent = '';
    const tbl = document.createElement('table');
    tbl.innerHTML = '<thead><tr><th>#</th><th>Spieler</th><th>Kills</th><th>Deaths</th></tr></thead>';
    const tbody = document.createElement('tbody');
    res.entries.forEach((en, i) => {
      const tr = document.createElement('tr');
      if (en.id === MY_ID) tr.className = 'me';
      const cells = [
        String(i + 1),
        (res.mode === 'tdm' ? '[' + TEAM_NAMES[en.team || 0] + '] ' : '') + en.name + (en.id === MY_ID ? ' (du)' : ''),
        String(en.kills | 0),
        String(en.deaths | 0),
      ];
      cells.forEach((t) => { const td = document.createElement('td'); td.textContent = t; tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    e.resBody.appendChild(tbl);
    this._syncResultButtons();
    setTimeout(() => this.refreshHighscores(), 2500);
  },

  _syncResultButtons() {
    const host = Game.isHost();
    this.els.btnAgain.disabled = !host;
    this.els.btnToLobby.disabled = !host;
    this.els.resWait.classList.toggle('hidden', host);
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
    if (o.zone) { div.append(mk(o.v, o.vc), mk(' – Zone')); }
    else if (o.self) { div.append(mk(o.v, o.vc), mk(' – Selbstschuss')); }
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
    e.boardTeams.textContent = '';
    if (st.teamScores) {
      const wrap = document.createElement('div');
      wrap.className = 'team-scores';
      for (const t of st.teamScores) {
        const chip = document.createElement('span');
        chip.className = 'tchip';
        chip.style.color = t.color;
        chip.textContent = t.name + ' ' + t.kills;
        wrap.appendChild(chip);
      }
      e.boardTeams.appendChild(wrap);
    }
    e.boardBody.textContent = '';
    const tbl = document.createElement('table');
    tbl.innerHTML = '<thead><tr><th>#</th><th>Spieler</th><th>Kills</th><th>Deaths</th></tr></thead>';
    const tbody = document.createElement('tbody');
    st.rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      if (r.isMe) tr.className = 'me';
      const cells = [String(i + 1), r.name + (r.isHost ? ' ★' : ''), String(r.kills | 0), String(r.deaths | 0)];
      cells.forEach((t) => { const td = document.createElement('td'); td.textContent = t; tr.appendChild(td); });
      if (!r.alive && st.mode === 'br') tr.classList.add('out');
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    e.boardBody.appendChild(tbl);
  },

  // ---------- Highscores ----------

  async refreshHighscores() {
    const e = this.els;
    if (!e.scoresBody) return;
    const rows = await Net.fetchScores();
    e.scoresBody.textContent = '';
    if (rows === null) {
      e.scoresNote.textContent = 'Highscores nicht verfügbar – Supabase-Tabelle anlegen (siehe README).';
      e.scoresNote.classList.remove('hidden');
      return;
    }
    if (!rows.length) {
      e.scoresNote.textContent = 'Noch keine Einträge – spielt eine Runde!';
      e.scoresNote.classList.remove('hidden');
      return;
    }
    e.scoresNote.classList.add('hidden');
    const short = { ffa: 'FFA', br: 'BR', tdm: 'TDM' };
    rows.forEach((r, i) => {
      const tr = document.createElement('tr');
      let date = '';
      try {
        const d = new Date(r.played_at);
        date = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' +
               d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      } catch (err) { date = ''; }
      const cells = [String(i + 1), r.player_name, String(r.kills), short[r.mode] || r.mode || '', date];
      cells.forEach((t) => { const td = document.createElement('td'); td.textContent = t; tr.appendChild(td); });
      if (r.won) tr.className = 'won';
      e.scoresBody.appendChild(tr);
    });
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
    const now = Date.now();

    e.modeLbl.textContent = MODES[S.mode] ? MODES[S.mode].name : S.mode;

    if (S.state === 'playing') {
      const left = Math.max(0, S.endAt - now);
      const m = Math.floor(left / 60000);
      const s = Math.floor(left / 1000) % 60;
      const str = m + ':' + (s < 10 ? '0' : '') + s;
      if (e.timer.textContent !== str) e.timer.textContent = str;
      if (S.mode === 'br') {
        const t = clamp((now - S.startTs) / MODES.br.zoneMs, 0, 1);
        e.subLbl.textContent = 'Zone: ' + Math.round((1 - t) * 100) + '%';
      } else {
        e.subLbl.textContent = '';
      }
    } else {
      if (e.timer.textContent !== '--:--') e.timer.textContent = '--:--';
      e.subLbl.textContent = '';
    }

    e.kd.textContent = 'K ' + me.kills + ' · D ' + me.deaths;

    // Buffs
    const buffs = [];
    if (me.shield > 0 && S.now < me.shieldUntil) buffs.push('Schild ' + Math.ceil((me.shieldUntil - S.now) / 1000) + 's');
    if (S.now < me.speedUntil) buffs.push('Turbo ' + Math.ceil((me.speedUntil - S.now) / 1000) + 's');
    const b = buffs.join(' · ');
    if (e.buffs.textContent !== b) e.buffs.textContent = b;

    // Tot-Banner
    if (S.state === 'playing' && !me.alive) {
      e.dead.classList.remove('hidden');
      if (S.mode === 'br') {
        const sn = Game.spectateName();
        e.dead.textContent = 'Ausgeschieden – Zuschauen' + (sn ? ' (Kamera: ' + sn + ')' : '');
      } else {
        const left = Math.max(0, (me.deadUntil - S.now) / 1000);
        e.dead.textContent = 'Eliminiert – Spawn in ' + left.toFixed(1) + 's';
      }
    } else if (!e.dead.classList.contains('hidden')) {
      e.dead.classList.add('hidden');
    }

    // Buttons sichtbar?
    const inMatch = S.state === 'playing' || S.state === 'ended';
    e.btnBoard.style.display = inMatch ? '' : 'none';
    if (S.state === 'ended') this._syncResultButtons();
    if (S.state === 'lobby') {
      const host = Game.isHost();
      if (e.btnStart.disabled === host) { // Host-Status hat sich geändert
        e.btnStart.disabled = !host;
        e.btnStart.textContent = host ? 'Runde starten – ' + MODES[S.mode].name : 'Wartet auf Host …';
        e.hostNote.textContent = host ? 'Du bist Host.' : 'Jemand anderes startet die Runde.';
      }
    }
  },
};
