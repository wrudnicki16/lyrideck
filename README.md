# Anki2Spotify

A React Native (Expo) app that bridges your Anki flashcard decks with Spotify. Import a deck, find songs that match each card's content, and save precise timestamps for where that word or phrase appears in the music. Works for both Free and Premium Spotify users.

---

## Origin

The idea started from a dream - I wanted an app like Duolingo that could teach languages and also have a section for catchy tunes that get words and phrases stuck in your head. Maybe that was a little too daunting of task for a single developer, so I thought about something more attainable I could do. That's when I wound up with the current idea I have - *Make an app that takes a flashcard deck like Anki and searches for songs that match the back of the card — whether it's a word or phrase — and submit the time in minutes/seconds of where it occurs.*

This I could do, with some intentional tradeoffs:

- **No lyrics in v1.** Spotify's public API doesn't expose lyrics or lyric timestamps (those are licensed from Musixmatch and not available to third-party apps). Rather than fight that constraint, the app trusts the user to listen and tap "Mark Timestamp" when they hear the match.
- **Free + Premium.** Spotify's playback-control endpoints are Premium-only. The app reads playback state when available (auto-capture) and falls back to manual `mm:ss` entry when it isn't — so Free users are never blocked.
- **Deep-linking to the exact time.** Spotify track URIs don't support `t=` parameters for songs (only podcast episodes do). The workaround: for Premium users with an active device, the app calls the Spotify Seek API to jump directly to the saved timestamp. For everyone else, the timestamp is displayed prominently so the user can scrub manually.

---

## Features

### Deck Management
- Import Anki decks — supports both `.apkg` (Anki's native zipped SQLite format, including Anki 23+ zstd-compressed databases) and CSV (tab- or comma-separated, with or without a header row, strips `#` metadata directives)
- Preview up to 20 cards before confirming import
- View all decks on the home screen with card counts
- Long-press a deck to delete it (cascades to cards and timestamps)

### Card Queue
- Browse all cards for a deck; filter by status: **All / Pending / Matched / Skipped**
- Toggle the Spotify search term between the card **Front** and **Back** (persisted per deck)
- "Lyrics only" filter hides cards whose search field is fewer than 3 words
  * Why? Spotify returns only song titles, artists, and album matches for 1-2 words
- Tapping a **matched** card skips the search screen and goes directly to the Capture screen showing the previously saved track
- Tapping a **pending** card opens the Song Candidates search
- **Match Cards** — sequential review mode that auto-advances through pending cards (respects current filters). Cards with no Spotify results are auto-skipped. After capturing a timestamp, a "Next Card" button advances to the next pending card without navigating back to the queue
- **Playlist** — generate a Spotify playlist from the currently displayed cards. Uses the first search result per card to build the playlist in bulk

### Song Search
- Spotify track search auto-runs on arrival using the card's search field
- Editable query — tweak and re-run without leaving the screen
- Results show album art, track name, and artist

### Timestamp Capture
- **Auto-capture:** reads Spotify's current playback state and records `progress_ms` in one tap
- **Mark at 0:00:** instantly saves a zero-second timestamp for users who just want to match a song and move on
- **Manual entry:** `mm:ss` picker always available as a fallback
- **Jump (Premium):** calls Spotify's seek endpoint to start playback at the exact saved timestamp
- **Open in Spotify:** deep-links to the track via `spotify:track:` URI with HTTPS fallback
- **Copy timestamp:** copies `m:ss` to clipboard
- Multiple clips can be saved per card (useful for multiple occurrences of a phrase)
- Delete individual clips
- "Search for different track" link navigates back to Song Candidates without losing context

### Export
- Per-deck CSV export: `Front, Back, Track, Artist, Timestamp, Note, Mode, Spotify URL, Captured At`
- Shared via the native share sheet (or path shown if sharing is unavailable)

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Expo (managed workflow), TypeScript |
| Navigation | `@react-navigation/native-stack` |
| Database | `expo-sqlite` (WAL mode) |
| File I/O | `expo-document-picker`, `expo-file-system` |
| APKG parsing | `jszip`, `fzstd` (zstd decompression for Anki 23+ databases) |
| Sharing | `expo-sharing` |
| Auth | `expo-web-browser` — Authorization Code + PKCE flow |
| Spotify API | Web API — search, playback state, seek, play |
| Clipboard | `expo-clipboard` |

---

## Data Model

```
decks
  id, name, imported_at, search_field ('front' | 'back')

cards
  id, deck_id → decks, front, back, tags, status ('pending' | 'matched' | 'skipped')

timestamps
  id, card_id → cards
  track_id, track_name, artist_name, album_art, spotify_url, spotify_uri
  progress_ms, note, capture_mode ('auto' | 'manual'), captured_at
```

---

## Screen Flow

```
DeckImportScreen
  └── CardQueueScreen
        ├── SongCandidatesScreen  (pending cards, or "Search for different track")
        │     └── CaptureScreen
        ├── CaptureScreen             (matched cards — skips search)
        ├── SongCandidatesScreen      (Match Cards — sequential review mode)
        │     └── CaptureScreen       (Next Card loops back to SongCandidates)
        ├── PlaylistProgressScreen    (Playlist — bulk playlist creation)
        └── ExportScreen
```

---

## Spotify Auth

- Authorization Code + PKCE (implicit flow deprecated by Spotify)
- Redirect URI: `makeRedirectUri()` with no path — matches `exp://...exp.direct` registered in the Spotify Developer Dashboard
- Scopes used: `user-read-playback-state`, `user-modify-playback-state`, `playlist-modify-public`, `playlist-modify-private`
- `WebBrowser.openAuthSessionAsync` with `showInRecents: false` so the browser auto-closes after redirect



See also: [Alternatives Originally Considered](docs/alternatives-considered.md)

