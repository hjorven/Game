// js/net.js — Supabase Realtime: Broadcast, Presence
'use strict';

const MY_ID = 'p' + Math.random().toString(36).slice(2, 10);

const Net = {
  sb: null,
  channel: null,
  connected: false,

  init() {
    if (!window.supabase) {
      UI.setNetStatus('SDK nicht geladen!', true);
      return;
    }
    this.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    this.channel = this.sb.channel('arena_world', {
      config: { broadcast: { self: false }, presence: { key: MY_ID } },
    });

    this.channel
      .on('broadcast', { event: 'move' },     (e) => Game.onMove(e.payload))
      .on('broadcast', { event: 'shoot' },    (e) => Game.onShoot(e.payload))
      .on('broadcast', { event: 'explode' },  (e) => Game.onExplode(e.payload))
      .on('broadcast', { event: 'hit' },      (e) => Game.onHit(e.payload))
      .on('broadcast', { event: 'death' },    (e) => Game.onDeath(e.payload))
      .on('broadcast', { event: 'pickup' },   (e) => Game.onPickup(e.payload))
      .on('broadcast', { event: 'drop' },     (e) => Game.onDrop(e.payload))
      .on('broadcast', { event: 'dropgone' }, (e) => Game.onDropGone(e.payload))
      .on('broadcast', { event: 'syncreq' },  (e) => Game.onSyncReq(e.payload))
      .on('broadcast', { event: 'syncans' },  (e) => Game.onSyncAns(e.payload))
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
  // (sonst bleibt der Client dauerhaft unsichtbar)
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

  // Niedrigste Presence-ID = zuständig für Sync-Antworten (stabil, identisch auf allen Clients)
  syncAnswerer() {
    if (!this.channel) return MY_ID;
    const keys = Object.keys(this.channel.presenceState());
    if (!keys.length) return MY_ID;
    keys.sort();
    return keys[0];
  },
};
