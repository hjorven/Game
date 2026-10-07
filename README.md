# ARENA – 2D Top-Down Multiplayer Shooter

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
