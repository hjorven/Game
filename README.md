# ARENA – 2D Top-Down Multiplayer Shooter

Ein Free-for-all Shooter im Brawl-Stars-Stil, komplett im Browser lauffähig:
HTML5-Canvas + Supabase Realtime. Läuft auf iPad (Touch), Handy und PC –
gehostet kostenlos über GitHub Pages.

**Live-Demo:** [hjorven.github.io/Game/](https://hjorven.github.io/Game/)

## Features

- **Eine große Welt für alle:** Seite öffnen → Namen eingeben → „Spielen" → sofort
  loslegen. Kein Lobby-/Raum-System, kein Match-Ende, kein Host.
- **Welt skaliert mit der Spielerzahl** (weiche Animation, quadratisch, 1600–6000 px)
- **Deterministische Seed-Welt:** gleiche Hindernisse/Spawns/Loot auf allen Clients,
  neue Chunks entstehen nur außen dazu
- **Loot:** Heilung (+50 HP), Schild, Munition und Waffen-Kisten
  (Schrotflinte, Sniper, Raketenwerfer) – seltene Waffen seltener, längere Respawn-Zeit
- **2 Waffen-Slots:** Pistole (unbegrenzt) als Start, Kiste füllt den freien Slot,
  bei vollen Slots ersetzt sie die aktuelle Waffe; Umschalten mit `1`/`2`
- **Tod → Waffe droppt** am Todestort (andere können sie aufheben),
  Respawn nach 3 s nur mit Pistole
- **Dual-Stick-Steuerung** für Touch (linker Daumen Bewegen, rechter Zielen & Schiessen,
  Antippen aufs Ziel = gezielter Schuss) – am PC mit WASD + Maus
- **Spawn-Schutz, Killfeed, Live-Tabelle (Tab), Minimap, Kamera-Follow, Screen-Shake**
- **WebAudio-Sounds** ohne externe Dateien (Mute-Button)

## Steuerung

| Aktion | PC | iPad / Handy |
|---|---|---|
| Bewegen | `W A S D` / Pfeiltasten | linker Daumen (virtueller Stick) |
| Zielen | Maus | rechter Daumen (virtueller Stick) |
| Schiessen | Maus-Klick / `Leertaste` | rechten Stick halten oder aufs Ziel tippen |
| Waffe wechseln | `1`–`2` | Waffen-Chips unten |
| Tabelle | `Tab` | „Tabelle"-Button |
| Ton | `M` | „Ton"-Button |

## Setup in 2 Schritten

### 1. Zugangsdaten eintragen

In [`js/config.js`](js/config.js) oben die Werte deines Supabase-Projekts einsetzen:

```js
const SUPABASE_URL = 'https://DEIN-PROJEKT.supabase.co';
const SUPABASE_KEY = 'DEIN-ANON-KEY';   // Settings → API → anon public
```

> Das Spiel braucht **keine Datenbank** – genutzt werden nur Realtime-Broadcast
> und Presence. Der anonyme Key darf öffentlich im Code liegen.

### 2. Auf GitHub Pages veröffentlichen

1. Code ins Repo pushen
2. Repo → **Settings → Pages → Source: `main` Branch, `/ (root)`** speichern
3. Nach ~1 Minute ist das Spiel unter `https://HJORVEN.github.io/Game/` erreichbar

**Gaming-Abend:** Link teilen – alle öffnen ihn und spielen sofort in derselben Welt.

## Technik

### Netzwerk-Events (Supabase Broadcast, fester Kanal `arena_world`)

| Event | Wer sendet | Inhalt | Frequenz |
|---|---|---|---|
| `move` | alle | id, name, x, y, winkel, hp, schild, waffe, k/d, alive | 20/s |
| `shoot` | Schütze | Bullet-Start (x, y), Winkel, Waffe | pro Schuss |
| `explode` | Schütze/Opfer | Explosions-Position, Bullet-ID (dedupliziert) | pro Rakete |
| `hit` | Opfer | Angreifer, Schaden, neue HP | pro Treffer |
| `death` | Opfer | Opfer + Mörder → Killfeed & Kill-Kredit | pro Tod |
| `pickup` | Einsammler | Pickup-Slot, Respawn-Zeitpunkt | pro Pickup |
| `drop` / `dropgone` | Todester / Einsammler | Waffen-Drop (id, waffe, x, y) | pro Tod/Aufheben |
| `syncreq`/`syncans` | Beitreter / niedrigste Presence-ID | Pickup- + Drop-Stand | bei Beitritt |

**Prinzipien:**

- **Weltkoordinaten** statt Bildschirmkoordinaten → Clients unterschiedlicher
  Größe sehen dasselbe; Kamera folgt dem lokalen Spieler
- **Opfer-Autorität** für Schaden: Jeder Client rechnet Schaden an sich selbst aus –
  keine Doppel-Treffer, keine Manipulation über den Angreifer
- **Interpolation** entfernter Spieler (runde Positionswechsel)
- **Presence** für Spielerliste + Weltgröße; niedrigste ID antwortet auf Sync-Anfragen
- Nur Spieler in **Sichtweite** werden detailliert gesendet (Supabase-Limit ~20/s)

### Projektstruktur

```
index.html      Markup + CSS + Boot
js/config.js    Konstanten, Waffen, Weltgrößen, Supabase-Keys
js/world.js     Seed-Welt: Chunks, Hindernisse, Spawns, Loot-Slots, Skalierung
js/audio.js     WebAudio-Sounds
js/net.js       Supabase-Client, Kanal, Presence, Sync
js/input.js     Tastatur, Maus, virtuelle Joysticks
js/render.js    Canvas-Rendering, Minimap, Effekte
js/ui.js        Startbildschirm, HUD, Killfeed, Tabelle
js/game.js      Spiellogik, Loot, Netzwerk-Handler
```

## Known limitations / Ideas

- Server-seitige Autorität gibt es nicht (Browser-für-Browser) – für den Freundeskreis ok
- Kein Chat, keine Rangliste/Highscores
- Ideen: Chat-/Ping-System, weitere Waffen, Seasons/Global-Rangliste
