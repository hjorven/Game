// js/net.js — Supabase Realtime: Broadcast, Presence, Highscores
'use strict';

const MY_ID = 'p' + Math.random().toString(36).slice(2, 10);

const Net = {
  sb: null,
  channel: null,
  room: 'main',
  connected: false,

  init(room) {
    this.room = room;
    if (!window.supabase) {
      UI.setNetStatus('SDK nicht geladen!', true);
      return;
    }
    this.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    this.channel = this.sb.channel('arena_' + room, {
      config: { broadcast: { self: false }, presence: { key: MY_ID } },
    });

    this.channel
      .on('broadcast', { event: 'move' },     (e) => Game.onMove(e.payload))
      .on('broadcast', { event: 'shoot' },    (e) => Game.onShoot(e.payload))
      .on('broadcast', { event: 'explode' },  (e) => Game.onExplode(e.payload))
      .on('broadcast', { event: 'hit' },      (e) => Game.onHit(e.payload))
      .on('broadcast', { event: 'death' },    (e) => Game.onDeath(e.payload))
      .on('broadcast', { event: 'pickup' },   (e) => Game.onPickup(e.payload))
      .on('broadcast', { event: 'sync' },     (e) => Game.onSync(e.payload))
      .on('presence',  { event: 'sync' },     () => Game.onPresence())
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          this.connected = true;
          UI.setNetStatus('Verbunden', false);
          Net.track();
          Game.onPresence();
        } else {
          this.connected = false;
          UI.setNetStatus(status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'Verbindung problematisch' : status, true);
          if (err) console.error('Realtime-Fehler:', err);
        }
      });
    setInterval(() => Net.retrack(), 10000);
  },

  send(event, payload) {
    if (!this.channel) return;
    this.channel.send({ type: 'broadcast', event, payload });
  },

  track() {
    if (!this.channel) return;
    const want = { id: MY_ID, name: S.me.name, color: S.me.color };
    const cur = this.channel.presenceState()[MY_ID];
    const meta = cur && cur[cur.length - 1];
    if (meta && meta.name === want.name && meta.color === want.color) return; // unverändert – Server hat uns schon
    this.channel.track(want);
  },

  // Heal: regelmäßig neu tracken, falls das eigene Presence-Event verloren ging
  // (sonst bleibt der Client dauerhaft unsichtbar / hält sich selbst fälschlich für Host)
  retrack() {
    if (!this.channel) return;
    const cur = this.channel.presenceState()[MY_ID];
    if (!cur) this.channel.track({ id: MY_ID, name: S.me.name, color: S.me.color });
  },

  // Alle angemeldeten Spieler (inkl. mir)
  roster() {
    const self = { id: MY_ID, name: S.me.name, color: S.me.color };
    const out = [];
    if (!this.channel) return [self];
    const st = this.channel.presenceState();
    for (const key of Object.keys(st)) {
      const metas = st[key];
      const m = metas[metas.length - 1] || { id: key };
      out.push({ id: m.id || key, name: m.name || 'Unbekannt', color: m.color || colorForId(m.id || key) });
    }
    if (!out.some((p) => p.id === MY_ID)) out.push(self);
    return out;
  },

  // Host = niedrigste ID (stabil, identisch auf allen Clients)
  electHost() {
    if (!this.channel) return MY_ID;
    const keys = Object.keys(this.channel.presenceState());
    if (!keys.length) return MY_ID;
    keys.sort();
    return keys[0];
  },

  // --- Highscores (Supabase-Tabelle "scores", siehe supabase-schema.sql) ---
  async fetchScores() {
    if (!this.sb) return null;
    try {
      const { data, error } = await this.sb
        .from(CFG.SCORE_TABLE)
        .select('player_name, kills, deaths, mode, won, played_at')
        .eq('room', this.room)
        .order('kills', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    } catch (e) {
      console.warn('Highscores konnten nicht geladen werden:', e.message);
      return null;
    }
  },

  async saveScores(results) {
    if (!this.sb || !results || !results.entries) return;
    try {
      const rows = results.entries.map((e) => ({
        room: this.room,
        player_id: e.id,
        player_name: e.name,
        mode: results.mode,
        kills: e.kills | 0,
        deaths: e.deaths | 0,
        won: e.id === results.winnerId || (results.winnerTeam >= 0 && e.team === results.winnerTeam),
        played_at: new Date().toISOString(),
      }));
      const { error } = await this.sb.from(CFG.SCORE_TABLE).insert(rows);
      if (error) throw error;
      UI.refreshHighscores();
    } catch (e) {
      console.warn('Highscores nicht speicherbar:', e.message);
      UI.setNotice('Highscores nicht verfügbar (Tabelle anlegen? Siehe README)', 4000);
    }
  },
};
