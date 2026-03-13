# Search Current Track in Decks

## Overview

Allow users to quickly find which card(s) match the song currently playing on Spotify, from anywhere in the app.

## New Screen: TrackSearchResultsScreen

### Data Flow

1. Call `getPlaybackState()` to get the currently playing track (track_id, name, artist, album art)
2. **Phase 1 (exact):** Query `timestamps` table for cards linked to that `track_id`, joined with `cards` and `decks`
3. **Phase 2 (fuzzy fallback):** If no Phase 1 results, show an editable search input pre-filled with the track name. User can adjust the query. Searches card front/back text across all decks via `LIKE` matching.

### UI Layout

- **Header area:** Current track info (album art, name, artist)
- **Phase 1 results:** List of matching cards — card front text (truncated), deck name, clip count badge. Current deck sorted first when `deckId` is passed.
- **Phase 2 fallback:** "No saved matches for this track" message + editable search input pre-filled with track name. Results show matching cards from all decks.
- **Nothing playing:** "No track currently playing" + retry button
- **No results:** "No matching cards found" message

Tapping a card navigates to CaptureScreen with that card + current track.

### Entry Points

- **DeckImportScreen:** "Now Playing" icon button near the Spotify auth bar
- **CardQueueScreen:** Icon button in the header right area

Both buttons hidden when `accessToken` is null.

### Navigation

Standard stack navigation (Approach A). TrackSearchResults sits in the same stack as other screens. Back arrow returns to the origin screen (DeckImport or CardQueue). Same depth pattern as existing CardQueue -> SongCandidates -> Capture flow.

Route params: `{ deckId?: number, deckName?: string }` — optional, for sorting current deck first.

### New Database Queries

- `getCardsByTrackId(trackId)` — joins timestamps, cards, decks to return cards with deck info
- `searchCardsByText(query)` — `LIKE` search across card front/back, joined with decks

### Error Handling

- No active playback: message + retry button
- Spotify API error (401, 429): error message with retry, uses existing `fetchWithRetry` pattern
- No Spotify auth: buttons hidden/disabled

## Future Work (out of scope)

- **C2: Separate track resolution storage** — Add a `card_tracks` table to record track-to-card associations during playlist generation, without marking cards as "matched." This would make Phase 1 matches much more common for playlist-generated decks.
