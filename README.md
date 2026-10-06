# ARENA – 2D Top-Down Multiplayer Shooter

Ein Multiplayer-Shooter im Brawl-Stars-Stil, komplett im Browser lauffähig:
HTML5-Canvas + Supabase Realtime. Läuft auf iPad (Touch/Joints), Handy und PC –
gehostet kostenlos über GitHub Pages.

**Live-Demo:** [hjorven.github.io/Game/](https://hjorven.github.io/Game/)

## Features

- **Echtzeit-Multiplayer** über Supabase Realtime (Broadcast, ~20 Updates/s)
- **Drei Spielmodi:**
  - **Deathmatch (FFA)** – 3 Minuten, wer die meisten Kills hat
  - **Battle Royale** – schrumpfende Zone, letzter Überlebender gewinnt
  - **Team-Deathmatch** – Rot gegen Blau, automatische Teamaufteilung
- **Dual-Stick-Steuerung** für Touch (linker Daumen Bewegen, rechter Zielen & Schiessen,
  Antippen aufs Ziel = gezielter Schuss) – am PC mit WASD + Maus
- **Vier Waffen:** Pistole, Schrotflinte (5 Patronen), Sniper, Raketenwerfer (Flächenschaden)
  – im Match per Power-Up freischaltbar, in der Lobby alle sofort testbar
- **Map mit Hindernissen:** Wände, Deckungen und Kisten (AABB-Kollision, Schuss-Blockade)
- **Power-Ups:** +50 HP, Schild, Turbo und Waffen- Drops (alle 15 s Respawn)
- **Spawn-Schutz, Killfeed, Live-Tabelle (Tab), Minimap, Kamera-Follow, Screen-Shake**
- **Räume:** `?room=XYZ` – mehrere Gruppen können parallel in getrennten Räumen spielen
- **Highscore-Tabelle** in Supabase (Top 10 pro Raum, inkl. Sieger-Flag)
- **WebAudio-Sounds** ohne externe Dateien (Mute-Button)

## Steuerung

| Aktion | PC | iPad / Handy |
|---|---|---|
| Bewegen | `W A S D` / Pfeiltasten | linker Daumen (virtueller Stick) |
| Zielen | Maus | rechter Daumen (virtueller Stick) |
| Schiessen | Maus-Klick / `Leertaste` | rechten Stick halten oder aufs Ziel tippen |
| Waffe wechseln | `1`–`4` | Waffen-Chips unten |
| Tabelle | `Tab` | „Tabelle“-Button |
| Ton | `M` | „Ton“-Button |

## Setup in 3 Schritten

### 1. Supabase-Datenbank anlegen

1. Auf [supabase.com](https://supabase.com) einloggen → neues Projekt
2. **SQL Editor** öffnen → Inhalt von [`supabase-schema.sql`](supabase-schema.sql) einfügen → **Run**

Die Highscore-Funktion funktioniert auch ohne Tabelle (es kommt dann nur ein Hinweis).

### 2. Zugangsdaten eintragen

In [`js/config.js`](js/config.js) oben die Werte deines Projekts einsetzen:

```js
const SUPABASE_URL = 'https://DEIN-PROJEKT.supabase.co';
const SUPABASE_KEY = 'DEIN-ANON-KEY';   // Settings → API → anon public
```

> Der anonyme Key darf öffentlich im Code liegen – die RLS-Richtlinien aus der
> SQL-Datei erlauben nur Lesen und Einfügen, kein Ändern oder Löschen.

### 3. Auf GitHub Pages veröffentlichen

1. Code ins Repo pushen
2. Repo → **Settings → Pages → Source: `main` Branch, `/ (root)`** speichern
3. Nach ~1 Minute ist das Spiel unter `https://HJORVEN.github.io/Game/` erreichbar

**Gaming-Abend:** Link teilen (oder Raum-Link aus der Lobby kopieren) – alle öffnen ihn,
der erste Spieler ist Host und startet die Runde.

## Spielablauf

1. **Lobby:** Namen eingeben, Modus wählen, Raum-Link teilen
2. **Host startet** – alle bekommen per Realtime-Sync die Runde
3. **Match läuft:** Kills sammeln, Power-Ups einsammeln, in BR die Zone meiden
4. **Ergebnis:** Sieger + Scoreboard; der Host speichert die Ergebnisse in Supabase
5. **Nochmal** (gleicher Modus direkt neu) oder **Zur Lobby**

## Technik

### Netzwerk-Events (Supabase Broadcast, Raum `arena_<room>`)

| Event | Wer sendet | Inhalt | Frequenz |
|---|---|---|---|
| `move` | alle | id, name, x, y, winkel, hp, schild, waffe, k/d, team, alive | 20/s |
| `shoot` | Schütze | Bullet-Start (x, y), Winkel, Waffe | pro Schuss |
| `explode` | Schütze/Opfer | Explosions-Position, Bullet-ID (dedupliziert) | pro Rakete |
| `hit` | Opfer | Angreifer, Schaden, neue HP | pro Treffer |
| `death` | Opfer | Opfer + Mörder → Killfeed & Kill-Kredit | pro Tod |
| `pickup` | Einsammler | Power-Up-Slot, Respawn-Zeitpunkt | pro Pickup |
| `sync` | Host | Match-State, Timer, Teams, Power-Up-Stand | alle 4 s + bei Wechsel |

**Prinzipien:**

- **Weltkoordinaten** (2400×1600) statt Bildschirmkoordinaten → Clients unterschiedlicher
  Größe sehen dasselbe; Kamera folgt dem lokalen Spieler
- **Opfer-Autorität** für Schaden: Jeder Client rechnet Schaden an sich selbst aus –
  keine Doppel-Treffer, keine Manipulation über den Angreifer
- **Interpolation** entfernter Spieler (runde Positionswechsel)
- **Presence** für Spielerliste + Host-Wahl (niedrigste ID ist Host, automatische Nachfolge)
- **Host-Sync** alle 4 s → auch Spieler, die später beitreten, landen in der laufenden Runde

### Projektstruktur

```
index.html            Markup + CSS + Boot
js/config.js          Konstanten, Karte, Waffen, Supabase-Keys
js/audio.js           WebAudio-Sounds
js/net.js             Supabase-Client, Channel, Highscores
js/input.js           Tastatur, Maus, virtuelle Joysticks
js/render.js          Canvas-Rendering, Minimap, Effekte
js/ui.js              Lobby, HUD, Killfeed, Scoreboard
js/game.js            Spiellogik, Match-Regeln, Netzwerk-Handler
supabase-schema.sql   Highscore-Tabelle mit RLS
```

## Known limitations / Ideas

- Server-seitige Autorität gibt es nicht (Browser-für-Browser) – für den Freundeskreis ok
- Kein Matchmaking: Raumschlüssel ist die Einladung
- Ideen: Explosionen mit Abstandsschaden-Visuals, Waffen-Drops auf der Map,
  Chat-/Ping-System, Spectator-Kamera-Wahl, Seasons/Global-Rangliste
