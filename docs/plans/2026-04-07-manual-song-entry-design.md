# Manual Song Entry

## Overview

Allow users to associate cards with songs by typing a title and/or pasting a link, without requiring a Spotify connection. Manual entries coexist with the existing Spotify-matching flow but are stored separately and treated as mutually exclusive on a per-card basis (a card has either a Spotify match or a manual entry, never both).

The primary motivations are:
1. Users without Spotify can still complete the matching flow.
2. Spotify-connected users can manually enter songs that aren't on Spotify.

## Goals & Non-Goals

**Goals:**
- Manual entry available from `SongCandidatesScreen` for any card, with or without Spotify
- Two optional fields (title, link) — at least one required to save
- Optional notes, hidden behind an `+ Add note` button to keep the form minimal
- Tap-to-open behavior on saved links via an inline icon
- Mutual exclusivity: saving a manual entry replaces any Spotify match for the same card, and vice versa
- Manual entries are visually distinguishable in the deck list (link icon instead of status dot)
- Playlist creation skips manual entries with a warning; export includes them in the CSV

**Non-Goals:**
- Multiple manual entries per card (one-per-card enforced at the DB level)
- Fetching page titles from URLs (the user provides the title or it's blank)
- Embedded preview/playback of manual links (we open them in the system browser)
- Migrating existing Spotify matches into manual entries

## User Flow

### New manual entry (from `SongCandidatesScreen`)

The screen has two modes: **search mode** (existing) and **manual mode** (new). They never coexist — switching modes hides one set of UI and shows the other in the same vertical region. Nothing else in the layout shifts.

- **No Spotify token:** the existing "Please log in with Spotify to search for songs" view is removed. Manual mode is the default and only mode. The form is rendered directly under the card preview. The global "Connect Spotify" button at the top of the app stays available.
- **Spotify token present:** search mode is the default. A new `Enter manually` pill button is rendered just below the search input. Tapping it switches to manual mode. A `Cancel` button in manual mode switches back.

After save, the card is marked `matched`. If `reviewMode === true` (came from Match Cards), advance to next pending card. Otherwise pop back to `CardQueueScreen`.

### Editing an existing manual entry (from `CardQueueScreen`)

Tapping a manually-matched card in the deck list navigates to a new `ManualEntry` screen (not `SongCandidates`, not `Capture`). The form is pre-filled. Save updates the row and pops back. Cancel pops back without committing.

### Switching from manual back to Spotify search

`ManualEntry` shows a `Spotify` button in the navigation header right (only when `accessToken !== null`). Tapping it navigates to `SongCandidates` with the same params `CardQueueScreen` would pass. If the user picks a Spotify track from there and completes the Capture flow, the manual entry is deleted as part of the Spotify save (handled by the mutual exclusivity helper).

## The Form (shared component)

A new component `src/components/ManualEntryForm.tsx` used by both `SongCandidatesScreen` (manual mode) and `ManualEntryScreen`. Vertical layout:

1. **Song title** — `TextInput`, single line, placeholder `Title`. No `(optional)` label.
2. **Link** — `TextInput`, single line, placeholder `https:// or spotify:`. When the field contains text matching `/^(https?:\/\/|spotify:)/i`, an `open-outline` Ionicon is rendered inset on the right side. Tapping the icon calls `Linking.openURL(link.trim())`. Tapping anywhere else in the field puts the cursor in for editing.
3. **`+ Add note` button** — text-only button. Tapping it hides itself and reveals a multiline notes `TextInput` in its place, starting at 1 row, growing as the user types. When editing an existing entry that already has notes, the textarea is shown expanded by default with no `+ Add note` button.
4. **Save button** — full width, primary color. Disabled when `title.trim() === '' && url.trim() === ''`. Enabled the moment either has content.
5. **Cancel button** — secondary color. Returns to whichever state the user came from without committing.

The disabled-Save behavior is the only signal that one of title/link is required. No helper text.

**Props:**
```ts
interface ManualEntryFormProps {
  cardId: number;
  initial?: { title: string; url: string; notes: string };
  onSaved: () => void;
  onCancel: () => void;
}
```

The component owns its own state and handles the upsert. It does NOT know about navigation, review mode, `accessToken`, or whether it's a new vs existing entry — that's all decided by the parent via callbacks. The "Spotify" header right button on `ManualEntryScreen` is rendered by *the screen*, not by `ManualEntryForm`, since the form is navigation-agnostic.

## Data Model

### New table

```sql
CREATE TABLE IF NOT EXISTS manual_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
);
```

- `card_id UNIQUE` enforces one manual entry per card at the DB level.
- `title`, `url`, `notes` are `NOT NULL DEFAULT ''` — empty string means absent. Avoids null checks throughout the app.
- The `UNIQUE` constraint creates an implicit index covering single-card lookups.
- Created via `CREATE TABLE IF NOT EXISTS` in the existing `initDatabase` function — no migration code needed.

### New types (in `src/types/index.ts`)

```ts
export interface ManualEntry {
  id: number;
  card_id: number;
  title: string;
  url: string;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ManualEntryWithCard extends ManualEntry {
  front: string;
  back: string;
}
```

`CardRow` gets a new optional `manual_entry_id?: number | null` field. `CardParam` (used by playlist creation) gets `hasManualEntry: boolean`.

### New DB functions

```ts
export async function upsertManualEntry(entry: {
  cardId: number;
  title: string;
  url: string;
  notes: string;
}): Promise<number>;

export async function getManualEntryForCard(
  cardId: number
): Promise<ManualEntry | null>;

export async function deleteManualEntryForCard(cardId: number): Promise<void>;

export async function getManualEntriesByDeck(
  deckId: number
): Promise<ManualEntryWithCard[]>;
```

`upsertManualEntry` uses `INSERT INTO manual_entries (...) VALUES (...) ON CONFLICT(card_id) DO UPDATE SET ...` so callers don't need to check whether an entry already exists.

### Mutual exclusivity helper

```ts
async function clearOtherMatchSources(
  cardId: number,
  keep: 'manual' | 'spotify'
): Promise<void>
```

- `keep === 'manual'` → deletes all `timestamps` and `card_tracks` rows for the card
- `keep === 'spotify'` → deletes the `manual_entries` row for the card

Called by `upsertManualEntry` (after the upsert) and `insertTimestamp` (after the insert). Deliberately NOT called by `insertCardTrack` — that function is a passive backfill from playlist generation, not an explicit user match.

### Updated `getCardsByDeck`

```sql
SELECT c.*, me.id as manual_entry_id
FROM cards c
LEFT JOIN manual_entries me ON me.card_id = c.id
WHERE c.deck_id = ?
ORDER BY c.id
```

The `LEFT JOIN` is applied to both the filtered (`status = ?`) and unfiltered branches of the existing function. `manual_entry_id` is the entry's id when present, null otherwise. `CardQueueScreen` uses this for the status icon — the tap handler only needs `manual_entry_id` as a truthy/falsy flag, since `ManualEntryScreen` re-fetches the full entry on mount via `getManualEntryForCard(cardId)`.

### What does NOT change

- `getTrackForCard` stays Spotify-only. The `CardQueueScreen` tap handler checks `manual_entry_id` first, then falls through.
- `getNextPendingCard` and `getPendingCardCount` filter on `status = 'pending'`, and a manually-matched card has `status = 'matched'`, so they naturally exclude manual matches. Consequence: in review mode, after saving a manual entry, `advanceToNext()` skips the just-saved card without any special handling — the existing pending-only filter does the work.

## Screens

### `SongCandidatesScreen` changes

- New state: `manualMode: boolean` — initially `false`
- When `accessToken === null`, `manualMode` is locked to `true` and the existing "Please log in" view is removed.
- When `accessToken !== null`, default is search mode. A new `Enter manually` pill button appears below the search input. Tapping it sets `manualMode = true`.
- When `manualMode === true`, the search input, results `FlatList`, loading spinner, no-results message, and skip button are hidden. `ManualEntryForm` is rendered in their place. The card preview at the top is unchanged.
- The form's `onCancel` returns to search mode (or, when no token, does nothing — there's no Cancel button rendered).
- The form's `onSaved` calls the existing `advanceToNext()` if `reviewMode === true`, or `navigation.goBack()` otherwise.

No new route params.

### New `ManualEntryScreen`

`src/screens/ManualEntryScreen.tsx`. Receives `accessToken` via the same wrapper pattern as `SongCandidatesScreen`/`CaptureScreen`.

**Route params:**
- `cardId: number`
- `cardFront: string`
- `cardBack: string`
- `searchField: 'front' | 'back'`

The screen loads the manual entry on mount via `getManualEntryForCard(cardId)`. There's no `manualEntryId` param — the `manual_entry_id` field on `CardRow` is only used by `CardQueueScreen` to decide *whether* to navigate here, not as a fetch handle.

**Layout:**
1. Card preview (same `cardInfo` block as `SongCandidatesScreen`)
2. `ManualEntryForm` with `initial` populated from the loaded entry

**Header right button** (set via `navigation.setOptions` based on `accessToken`):
- When `accessToken !== null`: a `Spotify` text button. Tapping it navigates to `SongCandidates` with `{ cardId, cardFront, cardBack, searchField }` (no `reviewMode`).
- When `accessToken === null`: no header right button.

**On save:** `navigation.goBack()` → `CardQueueScreen` → `useFocusEffect` reloads.
**On cancel:** `navigation.goBack()` immediately.

Screen title: `Manual Entry`.

### `AppNavigator` change

One new `Stack.Screen`:

```tsx
<Stack.Screen name="ManualEntry" options={{ title: 'Manual Entry' }}>
  {(props: any) => (
    <ManualEntryScreen {...props} accessToken={accessToken} />
  )}
</Stack.Screen>
```

### `CardQueueScreen` changes

**Tap handler logic** (in order):
1. If `status === 'matched'` AND `item.manual_entry_id` is truthy → navigate to `ManualEntry` with `{ cardId, cardFront, cardBack, searchField }` and return
2. Else if `status === 'matched'` → fetch track via `getTrackForCard` → navigate to `Capture` (existing behavior)
3. Else → navigate to `SongCandidates` (existing behavior)

**Status indicator:**

```tsx
{item.status === 'matched' && item.manual_entry_id ? (
  <Ionicons name="link-outline" size={14} color={colors.primary} style={styles.statusIcon} />
) : (
  <View style={[styles.statusDot, { backgroundColor: statusColor(item.status) }]} />
)}
```

A new `statusIcon` style block with `marginLeft: 10` matches the dot's horizontal slot. Icon name is subject to visual approval — `link-outline` is the proposed default; alternatives include `globe-outline`, `pencil-outline`, `document-text-outline`.

## Playlist Creation

**`CardQueueScreen.handleCreatePlaylist`** adds an early-block:

```ts
const manualEntryCount = displayedCards.filter((c) => c.manual_entry_id).length;
const spotifyEligibleCount = displayedCards.length - manualEntryCount;

if (spotifyEligibleCount === 0) {
  Alert.alert(
    'No Spotify cards',
    'All displayed cards are manual entries. Spotify playlists require Spotify tracks.'
  );
  return;
}
```

**Confirmation modal** shows the Spotify-eligible count and a warning when any manual entries are present:

```tsx
<Text style={styles.modalBody}>
  Create a Spotify playlist from {spotifyEligibleCount} card{spotifyEligibleCount !== 1 ? 's' : ''}?
</Text>
{manualEntryCount > 0 && (
  <Text style={styles.modalWarning}>
    {manualEntryCount} manual entr{manualEntryCount !== 1 ? 'ies' : 'y'} will be skipped (not on Spotify).
  </Text>
)}
```

A new `modalWarning` style — same `fontSize` as `modalHint`, color `colors.warning`, no italic.

**`handleSubmitPlaylistName`** adds `hasManualEntry: !!c.manual_entry_id` to each `cardParams` entry. `CardParam` type gains the field.

**`PlaylistProgressScreen.run`** adds one branch at the top of its loop:

```ts
if (card.hasManualEntry) {
  skippedCount++;
  setProgress(i + 1);
  setSkipped(skippedCount);
  continue;
}
```

The existing "X cards skipped" UI naturally surfaces these alongside the existing "no Spotify results" skips. They're indistinguishable in the UI today, which is fine — both mean "this card didn't end up in the playlist."

## Export

**`ExportScreen`** fetches both timestamps and manual entries, merges them, and renders unified rows.

```ts
type ExportItem =
  | { kind: 'spotify'; row: ExportRow }
  | { kind: 'manual'; row: ManualEntryWithCard };
```

```ts
const [timestamps, manualEntries] = await Promise.all([
  getTimestampsByDeck(deckId),
  getManualEntriesByDeck(deckId),
]);
setItems([
  ...timestamps.map((t) => ({ kind: 'spotify' as const, row: t })),
  ...manualEntries.map((m) => ({ kind: 'manual' as const, row: m })),
].sort((a, b) => a.row.card_id - b.row.card_id));
```

**Preview list** switches on `item.kind`:
- `'spotify'` → existing layout
- `'manual'` → `front` / `title || url || '(no title)'` / `notes` if present

**Empty state and count** use `items.length` instead of `rows.length`.

**CSV format** — one header row, fixed columns, source flag:

```
Front,Back,Source,Track,Artist,Timestamp,Note,Mode,Spotify URL,Captured At,Manual Title,Manual Link,Manual Notes
```

Each row populates either the Spotify columns (4–10) or the manual columns (11–13), with the others empty. Rows are sorted by `card_id`. Existing CSV consumers won't break — the columns they currently use are still in the same positions.

## Testing

All testing is via Maestro flows in `.maestro/`. No unit tests (no Jest setup in this project).

### New flows

**`.maestro/manual-entry-no-spotify.yaml`** (group: `manual-entry`)
- Launch app, dismiss dev menu (`90%,35%` coordinate), tap into the seeded sample deck
- Tap a pending card → assert the manual entry form is visible (no "Please log in" message)
- Type a title, assert Save is enabled, tap Save
- Assert back on the deck and the card now shows the link icon
- Tap the same card → assert `Manual Entry` screen with title pre-filled

**`.maestro/manual-entry-edit.yaml`** (group: `manual-entry`)
- The "pre-create a manual entry" steps are inlined at the top of this file (rather than factored into a `.maestro/setup/` flow), since they're short and only used by this single test.
- Inline create: launch app, dismiss dev menu, tap into the seeded sample deck, tap a pending card, type a title, save.
- Then: from `CardQueueScreen`, tap the manually-matched card → assert `Manual Entry` opens
- Verify form fields pre-filled with previous values
- Edit the title, save, assert updated value on re-tap

**`.maestro/manual-entry-with-spotify.yaml`** (group: `manual-entry-spotify`, requires `spotify-auth` setup)
- Tap a card → assert `SongCandidates` (search mode) with results visible
- Tap `Enter manually` pill → assert results hidden, manual form visible
- Type title, type link → assert open icon appears
- Tap `+ Add note`, type a note, save → assert link icon on the card

### Test groups in `run-maestro-tests.sh`

```bash
manual-entry)         echo "|manual-entry-no-spotify,manual-entry-edit" ;;
manual-entry-spotify) echo "|manual-entry-with-spotify" ;;
```

Both added to `ALL_GROUPS`. The Spotify variant has no setup flow — it relies on Spotify auth persisting across launches from a prior session (the same pattern used by `playlist-creation.yaml`, `match-cards-flow.yaml`, etc.).

### What's NOT tested

- Unit tests for new DB functions (no Jest in this project)
- CSV column structure (hard to assert file contents in Maestro)
- The `clearOtherMatchSources` helper directly (exercised indirectly by future switch-to-spotify flow)
- The `spotifyEligibleCount === 0` early-block in `handleCreatePlaylist`

## Files Touched

**New files:**
- `src/components/ManualEntryForm.tsx` — shared form component
- `src/screens/ManualEntryScreen.tsx` — edit screen for existing manual entries
- `.maestro/manual-entry-no-spotify.yaml`
- `.maestro/manual-entry-edit.yaml`
- `.maestro/manual-entry-with-spotify.yaml`

**Modified files:**
- `src/db/database.ts` — new table, new functions, helper, `getCardsByDeck` query update, `insertTimestamp` calls helper
- `src/types/index.ts` — `ManualEntry`, `ManualEntryWithCard`, `CardRow.manual_entry_id`, `CardParam.hasManualEntry`
- `src/screens/SongCandidatesScreen.tsx` — `manualMode` state, `Enter manually` pill, conditional rendering, removed "Please log in" view
- `src/screens/CardQueueScreen.tsx` — tap handler branch for manual entries, status icon conditional, playlist `spotifyEligibleCount` block, modal warning text, `hasManualEntry` in `cardParams`
- `src/screens/PlaylistProgressScreen.tsx` — skip-manual-entry branch in `run` loop
- `src/screens/ExportScreen.tsx` — fetch both sources, unified rendering, new CSV columns
- `src/navigation/AppNavigator.tsx` — new `ManualEntry` screen
- `run-maestro-tests.sh` — two new groups, added to `ALL_GROUPS`

## Future Work (out of scope)

- **Distinct skip categories in playlist creation** — currently manual-entry skips and no-result skips share one counter. Could be split into "X manual, Y no results" if user feedback shows confusion.
- **"Spotify only" deck filter** — a new filter pill on `CardQueueScreen` to hide manual entries from view, parallel to the existing status filters.
- **Page title fetch** — auto-fill the title field when a URL is pasted, by fetching `<title>` from the HTML. Network-dependent, edge cases for non-HTML URLs.
- **Switching from manual to Spotify e2e test** — listed as nice-to-have in Section 6 but skipped from the initial PR.
- **Importing manual entries from CSV** — parallel to the existing APKG/CSV deck import, allowing bulk creation of manual entries from a spreadsheet.
