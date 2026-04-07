# Manual Song Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to associate cards with songs by typing a title and/or pasting a link, with or without a Spotify connection. Manual entries are stored separately from Spotify matches but are mutually exclusive on a per-card basis.

**Architecture:** New `manual_entries` SQLite table with one-row-per-card, a shared `ManualEntryForm` component, a new `ManualEntryScreen` for editing existing entries, and an in-place "manual mode" toggle on `SongCandidatesScreen`. The existing playlist creation and CSV export flows are extended to recognize manual entries.

**Tech Stack:** React Native, expo-sqlite, `expo-linking` (already a transitive dep via React Native), `@expo/vector-icons` (Ionicons, already used)

**Spec:** `docs/plans/2026-04-07-manual-song-entry-design.md`

---

### Task 1: Database layer

**Files:**
- Modify: `src/types/index.ts` (add new types, extend `CardRow` and `CardParam`)
- Modify: `src/db/database.ts` (new table, helper, new functions, query update, `insertTimestamp` wiring)

- [ ] **Step 1: Add new types to `src/types/index.ts`**

Add after the `CardWithDeck` interface (line 116):

```typescript
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

Update the existing `CardRow` interface (lines 54-60) to add `manual_entry_id`:

```typescript
export interface CardRow {
  id: number;
  front: string;
  back: string;
  tags: string;
  status: string;
  manual_entry_id?: number | null;
}
```

Update the existing `CardParam` interface (lines 118-124) to add `hasManualEntry`:

```typescript
export interface CardParam {
  id: number;
  front: string;
  back: string;
  status: string;
  searchText: string;
  hasManualEntry: boolean;
}
```

- [ ] **Step 2: Add the `manual_entries` table to `initDatabase`**

In `src/db/database.ts`, find the `card_tracks` table creation block (lines 78-92, ends with the closing backtick before line 93). Add a new `database.execAsync` block immediately after it:

```typescript
  // Manual entries (user-typed song title / link / notes for cards without Spotify)
  await database.execAsync(`
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
  `);
```

- [ ] **Step 3: Update the import line at the top of `src/db/database.ts`**

Find line 2:

```typescript
import { CardWithDeck } from '../types';
```

Replace with:

```typescript
import { CardWithDeck, ManualEntry, ManualEntryWithCard } from '../types';
```

- [ ] **Step 4: Add the `clearOtherMatchSources` private helper**

Add immediately after `initDatabase` (after line 93, before the `// --- Sample deck ---` comment):

```typescript
// --- Mutual exclusivity helper ---

async function clearOtherMatchSources(
  cardId: number,
  keep: 'manual' | 'spotify'
): Promise<void> {
  const database = await getDatabase();
  if (keep === 'manual') {
    await database.runAsync('DELETE FROM timestamps WHERE card_id = ?', cardId);
    await database.runAsync('DELETE FROM card_tracks WHERE card_id = ?', cardId);
  } else {
    await database.runAsync('DELETE FROM manual_entries WHERE card_id = ?', cardId);
  }
}
```

- [ ] **Step 5: Update `getCardsByDeck` to LEFT JOIN `manual_entries`**

Find the existing `getCardsByDeck` function (lines 215-230). Replace the entire function with:

```typescript
export async function getCardsByDeck(
  deckId: number,
  status?: string
): Promise<any[]> {
  const database = await getDatabase();
  if (status) {
    return database.getAllAsync(
      `SELECT c.*, me.id as manual_entry_id
       FROM cards c
       LEFT JOIN manual_entries me ON me.card_id = c.id
       WHERE c.deck_id = ? AND c.status = ?
       ORDER BY c.id`,
      [deckId, status]
    );
  }
  return database.getAllAsync(
    `SELECT c.*, me.id as manual_entry_id
     FROM cards c
     LEFT JOIN manual_entries me ON me.card_id = c.id
     WHERE c.deck_id = ?
     ORDER BY c.id`,
    deckId
  );
}
```

- [ ] **Step 6: Wire `clearOtherMatchSources` into `insertTimestamp`**

Find the existing `insertTimestamp` function (lines 245-275). Add the helper call after the result is captured but before the return. Replace the function with:

```typescript
export async function insertTimestamp(ts: {
  cardId: number;
  trackId: string;
  trackName: string;
  artistName: string;
  albumArt: string;
  spotifyUrl: string;
  spotifyUri: string;
  progressMs: number;
  note: string;
  captureMode: string;
}): Promise<number> {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO timestamps (card_id, track_id, track_name, artist_name, album_art, spotify_url, spotify_uri, progress_ms, note, capture_mode)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ts.cardId,
      ts.trackId,
      ts.trackName,
      ts.artistName,
      ts.albumArt,
      ts.spotifyUrl,
      ts.spotifyUri,
      ts.progressMs,
      ts.note,
      ts.captureMode,
    ]
  );
  await clearOtherMatchSources(ts.cardId, 'spotify');
  return result.lastInsertRowId;
}
```

- [ ] **Step 7: Add the four new manual-entry functions**

Add at the end of `src/db/database.ts` (after `searchCardsByText`, line 463):

```typescript
// --- Manual entry operations ---

export async function upsertManualEntry(entry: {
  cardId: number;
  title: string;
  url: string;
  notes: string;
}): Promise<number> {
  const database = await getDatabase();
  const result = await database.runAsync(
    `INSERT INTO manual_entries (card_id, title, url, notes, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(card_id) DO UPDATE SET
       title = excluded.title,
       url = excluded.url,
       notes = excluded.notes,
       updated_at = datetime('now')`,
    [entry.cardId, entry.title, entry.url, entry.notes]
  );
  await clearOtherMatchSources(entry.cardId, 'manual');
  await database.runAsync(
    `UPDATE cards SET status = 'matched' WHERE id = ?`,
    entry.cardId
  );
  return result.lastInsertRowId;
}

export async function getManualEntryForCard(
  cardId: number
): Promise<ManualEntry | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync(
    'SELECT * FROM manual_entries WHERE card_id = ?',
    cardId
  );
  return (row as ManualEntry) ?? null;
}

export async function deleteManualEntryForCard(cardId: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM manual_entries WHERE card_id = ?', cardId);
}

export async function getManualEntriesByDeck(
  deckId: number
): Promise<ManualEntryWithCard[]> {
  const database = await getDatabase();
  return database.getAllAsync(
    `SELECT me.*, c.front, c.back
     FROM manual_entries me
     JOIN cards c ON c.id = me.card_id
     WHERE c.deck_id = ?
     ORDER BY c.id`,
    deckId
  ) as Promise<ManualEntryWithCard[]>;
}
```

Note: `upsertManualEntry` does THREE things in sequence inside the function:
1. Upsert the row
2. Clear any conflicting Spotify match (timestamps + card_tracks for the same card)
3. Set the card's `status` to `'matched'`

This means callers of `upsertManualEntry` get the status update for free — neither `ManualEntryForm` nor `ManualEntryScreen` needs to call `updateCardStatus` separately.

- [ ] **Step 8: Verify the file compiles**

Run:

```bash
npx tsc --noEmit
```

Expected: no new TypeScript errors. (Pre-existing errors in unrelated files are fine; the goal is to confirm the new code is type-safe.)

- [ ] **Step 9: Commit**

```bash
git add src/db/database.ts src/types/index.ts
git commit -m "Add manual_entries table and DB layer"
```

---

### Task 2: `ManualEntryForm` shared component

**Files:**
- Create: `src/components/ManualEntryForm.tsx`

- [ ] **Step 1: Create the file**

Write the entire file:

```typescript
import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  Pressable,
  StyleSheet,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { upsertManualEntry } from '../db/database';

interface ManualEntryFormProps {
  cardId: number;
  initial?: { title: string; url: string; notes: string };
  onSaved: () => void;
  onCancel: () => void;
}

const URL_REGEX = /^(https?:\/\/|spotify:)/i;

export default function ManualEntryForm({
  cardId,
  initial,
  onSaved,
  onCancel,
}: ManualEntryFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [notesVisible, setNotesVisible] = useState(
    !!(initial?.notes && initial.notes.length > 0)
  );
  const [saving, setSaving] = useState(false);

  const canSave =
    !saving && (title.trim().length > 0 || url.trim().length > 0);
  const showOpenIcon = URL_REGEX.test(url.trim());

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await upsertManualEntry({
        cardId,
        title: title.trim(),
        url: url.trim(),
        notes: notes.trim(),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleOpenLink = () => {
    Linking.openURL(url.trim());
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Title"
        placeholderTextColor={colors.textMuted}
        returnKeyType="next"
        testID="input-manual-title"
      />

      <View style={styles.linkRow}>
        <TextInput
          style={[styles.input, styles.linkInput]}
          value={url}
          onChangeText={setUrl}
          placeholder="https:// or spotify:"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          testID="input-manual-link"
        />
        {showOpenIcon && (
          <Pressable
            style={styles.openIcon}
            onPress={handleOpenLink}
            accessibilityLabel="Open link"
            accessibilityRole="button"
            testID="open-manual-link"
          >
            <Ionicons
              name="open-outline"
              size={20}
              color={colors.textSecondary}
            />
          </Pressable>
        )}
      </View>

      {notesVisible ? (
        <TextInput
          style={[styles.input, styles.notesInput]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes"
          placeholderTextColor={colors.textMuted}
          multiline
          testID="input-manual-notes"
        />
      ) : (
        <Pressable
          style={styles.addNoteButton}
          onPress={() => setNotesVisible(true)}
          accessibilityLabel="Add note"
          accessibilityRole="button"
          testID="add-note-btn"
        >
          <Text style={styles.addNoteText}>+ Add note</Text>
        </Pressable>
      )}

      <Pressable
        style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={!canSave}
        accessibilityLabel="Save"
        accessibilityRole="button"
        testID="save-manual-btn"
      >
        <Text style={styles.saveButtonText}>Save</Text>
      </Pressable>

      <Pressable
        style={styles.cancelButton}
        onPress={onCancel}
        accessibilityLabel="Cancel"
        accessibilityRole="button"
        testID="cancel-manual-btn"
      >
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
  },
  input: {
    backgroundColor: colors.surfaceLight,
    color: colors.textPrimary,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  linkRow: {
    position: 'relative',
    justifyContent: 'center',
  },
  linkInput: {
    paddingRight: 44,
  },
  openIcon: {
    position: 'absolute',
    right: 10,
    top: 0,
    bottom: 12,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notesInput: {
    minHeight: 44,
    textAlignVertical: 'top',
  },
  addNoteButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    marginBottom: 12,
  },
  addNoteText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
    marginTop: 4,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  cancelButton: {
    backgroundColor: colors.buttonSecondary,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
});
```

- [ ] **Step 2: Verify the file compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ManualEntryForm.tsx
git commit -m "Add ManualEntryForm shared component"
```

---

### Task 3: `ManualEntryScreen` and navigator registration

**Files:**
- Create: `src/screens/ManualEntryScreen.tsx`
- Modify: `src/navigation/AppNavigator.tsx`

- [ ] **Step 1: Create `ManualEntryScreen.tsx`**

```typescript
import React, { useEffect, useState, useLayoutEffect } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { colors } from '../constants/colors';
import { getManualEntryForCard } from '../db/database';
import ManualEntryForm from '../components/ManualEntryForm';
import { ManualEntry } from '../types';

interface Props {
  route: any;
  navigation: any;
  accessToken: string | null;
}

export default function ManualEntryScreen({
  route,
  navigation,
  accessToken,
}: Props) {
  const { cardId, cardFront, cardBack, searchField } = route.params as {
    cardId: number;
    cardFront: string;
    cardBack: string;
    searchField: 'front' | 'back';
  };

  const [entry, setEntry] = useState<ManualEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const row = await getManualEntryForCard(cardId);
      setEntry(row);
      setLoading(false);
    };
    load();
  }, [cardId]);

  useLayoutEffect(() => {
    if (accessToken) {
      navigation.setOptions({
        headerRight: () => (
          <Pressable
            onPress={() =>
              navigation.replace('SongCandidates', {
                cardId,
                cardFront,
                cardBack,
                searchField,
              })
            }
            accessibilityLabel="Search Spotify"
            accessibilityRole="button"
            testID="header-spotify-btn"
            style={styles.headerBtn}
          >
            <Text style={styles.headerBtnText}>Spotify</Text>
          </Pressable>
        ),
      });
    } else {
      navigation.setOptions({ headerRight: undefined });
    }
  }, [accessToken, navigation, cardId, cardFront, cardBack, searchField]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.cardInfo}>
        <Text style={styles.cardFront}>{cardFront}</Text>
        <Text style={styles.cardBack}>{cardBack}</Text>
      </View>

      <ManualEntryForm
        cardId={cardId}
        initial={
          entry
            ? { title: entry.title, url: entry.url, notes: entry.notes }
            : undefined
        }
        onSaved={() => navigation.goBack()}
        onCancel={() => navigation.goBack()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardInfo: {
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 10,
    marginBottom: 12,
  },
  cardFront: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  cardBack: {
    color: colors.textPrimary,
    fontSize: 14,
    marginTop: 4,
  },
  headerBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerBtnText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
});
```

Note on `navigation.replace` (not `.navigate`): tapping "Spotify" from `ManualEntryScreen` should swap the current screen rather than push another one onto the stack. If the user picks a Spotify track and goes through Capture, the back stack should land them on `CardQueueScreen`, not back at `ManualEntry`.

- [ ] **Step 2: Add the import to `AppNavigator.tsx`**

In `src/navigation/AppNavigator.tsx`, add after the `TrackSearchResultsScreen` import (line 9):

```typescript
import ManualEntryScreen from '../screens/ManualEntryScreen';
```

- [ ] **Step 3: Register the screen**

Add after the `TrackSearchResults` `Stack.Screen` block (after line 71), before `</Stack.Navigator>`:

```typescript
      <Stack.Screen
        name="ManualEntry"
        options={{ title: 'Manual Entry' }}
      >
        {(props: any) => (
          <ManualEntryScreen {...props} accessToken={accessToken} />
        )}
      </Stack.Screen>
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/screens/ManualEntryScreen.tsx src/navigation/AppNavigator.tsx
git commit -m "Add ManualEntryScreen and register in navigator"
```

---

### Task 4: `SongCandidatesScreen` — manual mode integration

**Files:**
- Modify: `src/screens/SongCandidatesScreen.tsx`

- [ ] **Step 1: Add the new import**

In `src/screens/SongCandidatesScreen.tsx`, add after the existing component imports (after line 16, before the `interface Props`):

```typescript
import ManualEntryForm from '../components/ManualEntryForm';
```

- [ ] **Step 2: Add `manualMode` state**

Find the existing state declarations (lines 32-37). Add immediately after `setPendingCount`:

```typescript
  const [manualMode, setManualMode] = useState(!accessToken);
```

The initial value `!accessToken` means: if there's no Spotify token, the screen starts in manual mode (the only mode available in that case).

- [ ] **Step 3: Replace the "Please log in" early return**

Find the "Please log in" block (lines 142-150):

```typescript
  if (!accessToken) {
    return (
      <View style={styles.container}>
        <Text style={styles.authMessage}>
          Please log in with Spotify to search for songs.
        </Text>
      </View>
    );
  }
```

**Delete this entire block.** The screen no longer shows a "Please log in" message — instead, when there's no token, `manualMode` is `true` (from Step 2) and the manual form is rendered (Step 4).

- [ ] **Step 4: Replace the body of the main return statement**

The current return (lines 152-215) renders: progress text, card info, search row, optional skip button, then results (loading / empty / FlatList).

Replace the entire return block with:

```typescript
  return (
    <View style={styles.container}>
      {reviewMode && pendingCount != null && (
        <Text style={styles.progressText}>{pendingCount} card{pendingCount !== 1 ? 's' : ''} remaining</Text>
      )}

      <View style={styles.cardInfo}>
        <Text style={styles.cardFront}>{cardFront}</Text>
        <Text style={styles.cardBack}>{cardBack}</Text>
      </View>

      {manualMode ? (
        <ManualEntryForm
          cardId={cardId}
          onSaved={async () => {
            if (reviewMode) {
              await advanceToNext();
            } else {
              navigation.goBack();
            }
          }}
          onCancel={() => {
            if (accessToken) {
              setManualMode(false);
            }
          }}
        />
      ) : (
        <>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search Spotify..."
              placeholderTextColor={colors.textMuted}
              onSubmitEditing={() => doSearch(query)}
              returnKeyType="search"
              numberOfLines={1}
              multiline={false}
              testID="input-search"
            />
          </View>

          <Pressable
            style={styles.manualPill}
            onPress={() => setManualMode(true)}
            accessibilityLabel="Enter manually"
            accessibilityRole="button"
            testID="enter-manually-btn"
          >
            <Text style={styles.manualPillText}>Enter manually</Text>
          </Pressable>

          {reviewMode && (
            <Pressable style={styles.skipButton} onPress={handleSkip} accessibilityLabel="Skip" accessibilityRole="button" testID="skip-btn">
              <Text style={styles.skipButtonText}>Skip</Text>
            </Pressable>
          )}

          {loading ? (
            <ActivityIndicator
              size="large"
              color={colors.primary}
              style={{ marginTop: 40 }}
            />
          ) : results.length === 0 && searched ? (
            <Text style={styles.noResults}>
              No tracks found. Try a different search.
            </Text>
          ) : (
            <FlatList
              data={[...results].sort((a, b) => {
                const aClips = tracksWithClips.get(a.id) ?? 0;
                const bClips = tracksWithClips.get(b.id) ?? 0;
                if (aClips > 0 && bClips === 0) return -1;
                if (aClips === 0 && bClips > 0) return 1;
                return 0;
              })}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TrackCard
                  track={item}
                  onSelect={handleSelect}
                  clipCount={tracksWithClips.get(item.id)}
                />
              )}
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          )}
        </>
      )}
    </View>
  );
```

Note: the `onCancel` handler is a no-op when `accessToken` is null (the user can't switch out of manual mode in that case — the `Cancel` button on the form does nothing for them, which is fine because the back arrow in the navigation header already gets them out).

- [ ] **Step 5: Add the manual pill styles**

Find the `StyleSheet.create` block. Add these styles near the existing `searchRow`/`searchInput` styles:

```typescript
  manualPill: {
    alignSelf: 'center',
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    marginBottom: 12,
  },
  manualPillText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
```

- [ ] **Step 6: Remove the now-unused `authMessage` style**

Find the `authMessage` style block in `StyleSheet.create` (around line 250):

```typescript
  authMessage: {
    color: colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 60,
  },
```

Delete this block — it was only used by the deleted "Please log in" view.

- [ ] **Step 7: Verify**

```bash
npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add src/screens/SongCandidatesScreen.tsx
git commit -m "Add manual mode to SongCandidatesScreen"
```

---

### Task 5: `CardQueueScreen` — tap handler and status icon

**Files:**
- Modify: `src/screens/CardQueueScreen.tsx`

- [ ] **Step 1: Update the tap handler**

In `src/screens/CardQueueScreen.tsx`, find the `Pressable.onPress` block inside `renderItem` (lines 237-265). Replace it with:

```typescript
              onPress={async () => {
                if (item.status === 'matched') {
                  if (item.manual_entry_id) {
                    navigation.navigate('ManualEntry', {
                      cardId: item.id,
                      cardFront: item.front,
                      cardBack: item.back,
                      searchField,
                    });
                    return;
                  }
                  const row = await getTrackForCard(item.id);
                  if (row) {
                    navigation.navigate('Capture', {
                      cardId: item.id,
                      cardFront: item.front,
                      cardBack: item.back,
                      searchField,
                      track: {
                        id: row.track_id,
                        name: row.track_name,
                        artists: row.artist_name,
                        albumArt: row.album_art,
                        spotifyUrl: row.spotify_url,
                        spotifyUri: row.spotify_uri,
                        durationMs: 0,
                      },
                    });
                    return;
                  }
                }
                navigation.navigate('SongCandidates', {
                  cardId: item.id,
                  cardFront: item.front,
                  cardBack: item.back,
                  searchField,
                });
              }}
```

- [ ] **Step 2: Update the status indicator render**

Find the existing status dot block inside `renderItem` (lines 275-281):

```typescript
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: statusColor(item.status) },
                ]}
              />
```

Replace with:

```typescript
              {item.status === 'matched' && item.manual_entry_id ? (
                <Ionicons
                  name="link-outline"
                  size={14}
                  color={colors.primary}
                  style={styles.statusIcon}
                />
              ) : (
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: statusColor(item.status) },
                  ]}
                />
              )}
```

- [ ] **Step 3: Add the `statusIcon` style**

Find the `statusDot` style block (around line 435) in the `StyleSheet.create`. Add immediately after:

```typescript
  statusIcon: {
    marginLeft: 10,
  },
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/screens/CardQueueScreen.tsx
git commit -m "Show link icon and route to ManualEntry for manual cards"
```

---

### Task 6: Playlist creation — skip manual entries with warning

**Files:**
- Modify: `src/screens/CardQueueScreen.tsx`
- Modify: `src/screens/PlaylistProgressScreen.tsx`

- [ ] **Step 1: Update `handleCreatePlaylist` in `CardQueueScreen.tsx`**

Find the existing `handleCreatePlaylist` (lines 61-67):

```typescript
  const handleCreatePlaylist = () => {
    if (displayedCards.length === 0) {
      Alert.alert('No cards', 'There are no cards with the current filters.');
      return;
    }
    setShowPlaylistModal(true);
  };
```

Replace with:

```typescript
  const handleCreatePlaylist = () => {
    if (displayedCards.length === 0) {
      Alert.alert('No cards', 'There are no cards with the current filters.');
      return;
    }
    const manualCount = displayedCards.filter((c) => c.manual_entry_id).length;
    const eligibleCount = displayedCards.length - manualCount;
    if (eligibleCount === 0) {
      Alert.alert(
        'No Spotify cards',
        'All displayed cards are manual entries. Spotify playlists require Spotify tracks.'
      );
      return;
    }
    setShowPlaylistModal(true);
  };
```

- [ ] **Step 2: Update the playlist confirmation modal body**

Find the `<ConfirmationModal>` for `showPlaylistModal` (lines 286-300). The current children are:

```typescript
        <Text style={styles.modalBody}>
          Create a Spotify playlist from {displayedCards.length} card
          {displayedCards.length !== 1 ? 's' : ''}?
        </Text>
        <Text style={styles.modalHint}>
          Adjust your filters to change which songs are included.
        </Text>
```

Replace with:

```typescript
        {(() => {
          const manualCount = displayedCards.filter((c) => c.manual_entry_id).length;
          const eligibleCount = displayedCards.length - manualCount;
          return (
            <>
              <Text style={styles.modalBody}>
                Create a Spotify playlist from {eligibleCount} card
                {eligibleCount !== 1 ? 's' : ''}?
              </Text>
              {manualCount > 0 && (
                <Text style={styles.modalWarning}>
                  {manualCount} manual entr{manualCount !== 1 ? 'ies' : 'y'} will be skipped (not on Spotify).
                </Text>
              )}
              <Text style={styles.modalHint}>
                Adjust your filters to change which songs are included.
              </Text>
            </>
          );
        })()}
```

- [ ] **Step 3: Add the `modalWarning` style**

Find the existing `modalHint` style (around line 479) in `StyleSheet.create`. Add immediately before:

```typescript
  modalWarning: {
    color: colors.warning,
    fontSize: 13,
    marginBottom: 8,
  },
```

- [ ] **Step 4: Pass `hasManualEntry` through `cardParams`**

Find the `handleSubmitPlaylistName` function (lines 75-89). Update the `cardParams` map (lines 78-84):

```typescript
    const cardParams = displayedCards.map((c) => ({
      id: c.id,
      front: c.front,
      back: c.back,
      status: c.status,
      searchText: searchField === 'front' ? c.front : c.back,
      hasManualEntry: !!c.manual_entry_id,
    }));
```

(`CardParam` already gained the `hasManualEntry` field in Task 1 Step 1.)

- [ ] **Step 5: Add the skip-manual branch in `PlaylistProgressScreen.run`**

In `src/screens/PlaylistProgressScreen.tsx`, find the start of the `for` loop in `run` (lines 59-95). Add a new branch immediately after the cancellation check:

```typescript
    for (let i = 0; i < cards.length; i++) {
      if (cancelledRef.current) return;
      const card = cards[i];

      if (card.hasManualEntry) {
        skippedCount++;
        setProgress(i + 1);
        setSkipped(skippedCount);
        continue;
      }

      let uri: string | null = null;
      // ... rest of existing loop body unchanged ...
```

The full updated loop body should look like:

```typescript
    for (let i = 0; i < cards.length; i++) {
      if (cancelledRef.current) return;
      const card = cards[i];

      if (card.hasManualEntry) {
        skippedCount++;
        setProgress(i + 1);
        setSkipped(skippedCount);
        continue;
      }

      let uri: string | null = null;

      if (card.status === 'matched') {
        const track = await getTrackForCard(card.id);
        uri = track?.spotify_uri ?? null;
      }

      if (!uri) {
        const results = await searchTracks(card.searchText, 1);
        if (results[0]) {
          const t = results[0];
          uri = t.uri;
          await insertCardTrack({
            cardId: card.id,
            trackId: t.id,
            trackName: t.name,
            artistName: t.artists.map((a) => a.name).join(', '),
            albumArt: t.album.images?.[0]?.url ?? '',
            spotifyUrl: t.external_urls.spotify,
            spotifyUri: t.uri,
          });
        }
      }

      if (uri && !uris.includes(uri)) {
        uris.push(uri);
      } else if (!uri) {
        skippedCount++;
      }

      setProgress(i + 1);
      setSkipped(skippedCount);
    }
```

- [ ] **Step 6: Verify**

```bash
npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/screens/CardQueueScreen.tsx src/screens/PlaylistProgressScreen.tsx
git commit -m "Skip manual entries during playlist creation with warning"
```

---

### Task 7: Export — include manual entries in CSV

**Files:**
- Modify: `src/screens/ExportScreen.tsx`

- [ ] **Step 1: Update imports**

In `src/screens/ExportScreen.tsx`, find the existing imports (lines 1-15). Replace with:

```typescript
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  Alert,
} from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getTimestampsByDeck, getManualEntriesByDeck } from '../db/database';
import { colors } from '../constants/colors';
import { formatMs } from '../utils/formatMs';
import { ExportRow, ManualEntryWithCard } from '../types';
```

- [ ] **Step 2: Add the `ExportItem` discriminated union and update state**

Find the existing component body (line 17 onwards). Replace the state and `loadData` with:

```typescript
type ExportItem =
  | { kind: 'spotify'; row: ExportRow & { card_id?: number } }
  | { kind: 'manual'; row: ManualEntryWithCard };

export default function ExportScreen({ route }: any) {
  const { deckId, deckName } = route.params;
  const [items, setItems] = useState<ExportItem[]>([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [timestamps, manualEntries] = await Promise.all([
      getTimestampsByDeck(deckId),
      getManualEntriesByDeck(deckId),
    ]);
    const merged: ExportItem[] = [
      ...(timestamps as (ExportRow & { card_id: number })[]).map(
        (t) => ({ kind: 'spotify' as const, row: t })
      ),
      ...manualEntries.map((m) => ({ kind: 'manual' as const, row: m })),
    ];
    merged.sort((a, b) => {
      const aId = a.kind === 'spotify' ? (a.row.card_id ?? 0) : a.row.card_id;
      const bId = b.kind === 'spotify' ? (b.row.card_id ?? 0) : b.row.card_id;
      return aId - bId;
    });
    setItems(merged);
  };
```

Note: `getTimestampsByDeck` already selects `t.*` (which includes `card_id`), so the cast widens the existing type without changing the underlying query. We don't need to update `database.ts` or `ExportRow` for this — the cast handles it locally.

- [ ] **Step 3: Update `exportCSV` to write the new column structure**

Replace the existing `exportCSV` function (lines 31-76) with:

```typescript
  const exportCSV = async () => {
    if (items.length === 0) {
      Alert.alert('Nothing to export', 'No saved songs yet.');
      return;
    }

    setExporting(true);
    try {
      const header =
        'Front,Back,Source,Track,Artist,Timestamp,Note,Mode,Spotify URL,Captured At,Manual Title,Manual Link,Manual Notes';
      const escape = (s: string) =>
        `"${(s ?? '').replace(/"/g, '""')}"`;

      const csvRows = items.map((item) => {
        if (item.kind === 'spotify') {
          const r = item.row;
          return [
            escape(r.front),
            escape(r.back),
            'spotify',
            escape(r.track_name),
            escape(r.artist_name),
            formatMs(r.progress_ms),
            escape(r.note),
            r.capture_mode,
            r.spotify_url,
            r.captured_at,
            '',
            '',
            '',
          ].join(',');
        } else {
          const r = item.row;
          return [
            escape(r.front),
            escape(r.back),
            'manual',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            escape(r.title),
            escape(r.url),
            escape(r.notes),
          ].join(',');
        }
      });

      const csv = [header, ...csvRows].join('\n');
      const safeName = deckName.replace(/[^a-zA-Z0-9]/g, '_');
      const file = new File(Paths.cache, `${safeName}_export.csv`);
      file.write(csv);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'text/csv',
          dialogTitle: 'Export LyriDeck Data',
        });
      } else {
        Alert.alert('Exported', `File saved to:\n${file.uri}`);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to export CSV');
    } finally {
      setExporting(false);
    }
  };
```

- [ ] **Step 4: Update the preview list and subtitle**

Replace the JSX `return` block (lines 78-118) with:

```typescript
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Export: {deckName}</Text>
      <Text style={styles.subtitle}>
        {items.length} entr{items.length !== 1 ? 'ies' : 'y'} to export
      </Text>

      <Pressable
        style={[styles.exportButton, exporting && styles.disabled]}
        onPress={exportCSV}
        disabled={exporting}
        accessibilityLabel="Export CSV"
        accessibilityRole="button"
        testID="export-csv"
      >
        <Text style={styles.exportButtonText}>
          {exporting ? 'Exporting...' : 'Export CSV'}
        </Text>
      </Pressable>

      {items.length > 0 && (
        <FlatList
          data={items}
          keyExtractor={(_, i) => i.toString()}
          style={{ marginTop: 16 }}
          renderItem={({ item }) => {
            if (item.kind === 'spotify') {
              const r = item.row;
              return (
                <View style={styles.row}>
                  <Text style={styles.rowFront}>{r.front}</Text>
                  <Text style={styles.rowTrack}>
                    {r.track_name} - {r.artist_name}
                  </Text>
                  <Text style={styles.rowTime}>
                    {formatMs(r.progress_ms)}
                    {r.note ? ` (${r.note})` : ''}
                  </Text>
                </View>
              );
            }
            const r = item.row;
            const display = r.title || r.url || '(no title)';
            return (
              <View style={styles.row}>
                <Text style={styles.rowFront}>{r.front}</Text>
                <Text style={styles.rowTrack}>{display}</Text>
                {r.notes ? (
                  <Text style={styles.rowTime}>{r.notes}</Text>
                ) : null}
              </View>
            );
          }}
        />
      )}
    </View>
  );
```

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/screens/ExportScreen.tsx
git commit -m "Include manual entries in deck export"
```

---

### Task 8: Maestro test flows + test runner groups

**Files:**
- Create: `.maestro/manual-entry-no-spotify.yaml`
- Create: `.maestro/manual-entry-edit.yaml`
- Create: `.maestro/manual-entry-with-spotify.yaml`
- Modify: `run-maestro-tests.sh`

- [ ] **Step 1: Create `manual-entry-no-spotify.yaml`**

```yaml
appId: host.exp.exponent
---

# Manual Entry (no Spotify) - On a fresh app, manually enter a song for a card
# Sample deck is auto-seeded when there are no decks, so no import setup needed.

- launchApp
- extendedWaitUntil:
    visible: "Expo Go"
    timeout: 30000
- openLink: "${EXPO_URL}"

# Dismiss Expo Go developer menu
- extendedWaitUntil:
    visible: "Continue"
    timeout: 5000
    optional: true
- tapOn:
    point: "90%,35%"
    optional: true

- assertVisible: "LyriDeck"

# Open the auto-seeded sample deck
- assertVisible: "Sample Deck — Spanish"
- tapOn: "Sample Deck — Spanish"

# Tap the first pending card
- assertVisible: "Hola"
- tapOn:
    id: "card-item"
    index: 0

# Manual entry form should be visible (no Spotify token, no "Please log in" message)
- extendedWaitUntil:
    visible:
      id: "input-manual-title"
    timeout: 5000

# Type a title
- tapOn:
    id: "input-manual-title"
- inputText: "Despacito"

# Save
- tapOn:
    id: "save-manual-btn"

# Back on the deck — the card should now be matched
- assertVisible: "Hola"

# Tap the same card to edit — should land on Manual Entry screen
- tapOn:
    id: "card-item"
    index: 0
- assertVisible: "Manual Entry"

# Form should be pre-filled
- assertVisible: "Despacito"
```

- [ ] **Step 2: Create `manual-entry-edit.yaml`**

```yaml
appId: host.exp.exponent
---

# Manual Entry Edit - Create an entry, edit it, verify the update persists.
# Inline create steps (rather than a setup flow) since they're only used here.

- launchApp
- extendedWaitUntil:
    visible: "Expo Go"
    timeout: 30000
- openLink: "${EXPO_URL}"

# Dismiss Expo Go developer menu
- extendedWaitUntil:
    visible: "Continue"
    timeout: 5000
    optional: true
- tapOn:
    point: "90%,35%"
    optional: true

- assertVisible: "LyriDeck"

# --- Inline create ---
- tapOn: "Sample Deck — Spanish"
- tapOn:
    id: "card-item"
    index: 0
- extendedWaitUntil:
    visible:
      id: "input-manual-title"
    timeout: 5000
- tapOn:
    id: "input-manual-title"
- inputText: "Despacito"
- tapOn:
    id: "save-manual-btn"

# --- Edit ---
# Tap the same card again
- tapOn:
    id: "card-item"
    index: 0
- assertVisible: "Manual Entry"
- assertVisible: "Despacito"

# Clear and type a new title
- tapOn:
    id: "input-manual-title"
- eraseText: 10
- inputText: "Macarena"

# Save
- tapOn:
    id: "save-manual-btn"

# Back on deck. Re-tap and verify the new title.
- tapOn:
    id: "card-item"
    index: 0
- assertVisible: "Manual Entry"
- assertVisible: "Macarena"
```

- [ ] **Step 3: Create `manual-entry-with-spotify.yaml`**

```yaml
appId: host.exp.exponent
---

# Manual Entry (Spotify connected) - Switch to manual mode from search,
# fill title + link + note, save.
#
# PRECONDITION: Spotify must already be authenticated from a prior session.
# Auth cannot be automated by Maestro (it requires entering credentials in a
# WebBrowser). Connect Spotify manually before running this test, or run after
# any other Spotify-dependent test in the same suite.

- launchApp
- extendedWaitUntil:
    visible: "Expo Go"
    timeout: 30000
- openLink: "${EXPO_URL}"

# Dismiss Expo Go developer menu
- extendedWaitUntil:
    visible: "Continue"
    timeout: 5000
    optional: true
- tapOn:
    point: "90%,35%"
    optional: true

# Connect Spotify (relies on auth persistence from the test session)
- tapOn:
    id: "connect-spotify"
- waitForAnimationToEnd:
    timeout: 2000
- tapOn:
    point: "50%,79%"
    optional: true

- assertVisible: "Spotify Connected"

# Open the sample deck
- tapOn: "Sample Deck — Spanish"
- tapOn:
    id: "card-item"
    index: 0

# In search mode — search input should be visible
- extendedWaitUntil:
    visible:
      id: "input-search"
    timeout: 5000

# Switch to manual mode
- tapOn:
    id: "enter-manually-btn"

# Manual form is now visible
- extendedWaitUntil:
    visible:
      id: "input-manual-title"
    timeout: 5000

# Type a title
- tapOn:
    id: "input-manual-title"
- inputText: "Despacito"

# Type a link → open icon should appear
- tapOn:
    id: "input-manual-link"
- inputText: "https://youtu.be/kJQP7kiw5Fk"
- assertVisible:
    id: "open-manual-link"

# Add a note
- tapOn:
    id: "add-note-btn"
- tapOn:
    id: "input-manual-notes"
- inputText: "feat Daddy Yankee"

# Save
- tapOn:
    id: "save-manual-btn"

# Back on the deck — card matched
- assertVisible: "Hola"
```

- [ ] **Step 4: Add the new groups to `run-maestro-tests.sh`**

In `run-maestro-tests.sh`, find the `group_def` function (around line 65). Add two new cases inside the `case "$1" in` block, after the `sample-deck)` line (line 79):

```bash
    manual-entry)         echo "|manual-entry-no-spotify,manual-entry-edit" ;;
    manual-entry-spotify) echo "|manual-entry-with-spotify" ;;
```

Then update the `ALL_GROUPS` variable (around line 84). Replace:

```bash
ALL_GROUPS="fresh-app navigation capture match skip playlist destructive now-playing now-playing-no-music filters playlist-new manual-create sample-deck"
```

With:

```bash
ALL_GROUPS="fresh-app navigation capture match skip playlist destructive now-playing now-playing-no-music filters playlist-new manual-create sample-deck manual-entry manual-entry-spotify"
```

- [ ] **Step 5: Verify the tests run end-to-end**

Start the Expo dev server in one terminal:

```bash
npx expo start
```

In another terminal, run the no-spotify group first (most reliable, no auth precondition):

```bash
EXPO_URL=exp://YOUR_LAN_IP:8081 ./run-maestro-tests.sh --group manual-entry
```

Expected: both `manual-entry-no-spotify` and `manual-entry-edit` pass.

Then, with Spotify already connected from a prior test or manual login, run the Spotify variant:

```bash
EXPO_URL=exp://YOUR_LAN_IP:8081 ./run-maestro-tests.sh --group manual-entry-spotify
```

Expected: `manual-entry-with-spotify` passes. If the auth assertion fails, log into Spotify manually in the app and re-run.

- [ ] **Step 6: Commit**

```bash
git add .maestro/manual-entry-no-spotify.yaml .maestro/manual-entry-edit.yaml .maestro/manual-entry-with-spotify.yaml run-maestro-tests.sh
git commit -m "Add e2e tests for manual song entry"
```

---

### Task 9: Manual smoke test and final verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server (if not already running)**

```bash
npx expo start
```

- [ ] **Step 2: Test the no-Spotify flow**

1. Launch the app in Expo Go without connecting Spotify (or after logging out)
2. Open the auto-seeded `Sample Deck — Spanish`
3. Tap "Hola" → should land on Find Songs / manual form (no "Please log in" message)
4. Type "Test Title" → Save button enables → tap Save
5. Verify back on deck and "Hola" now shows the link icon
6. Tap "Hola" again → should open Manual Entry screen with "Test Title" pre-filled
7. Verify there's NO "Spotify" header right button (since not connected)
8. Tap back

- [ ] **Step 3: Test the Spotify-connected flow**

1. Connect Spotify from the auth bar
2. Tap into the same sample deck → tap a different pending card (e.g. "Adiós")
3. Should land in search mode with Spotify results visible
4. Tap "Enter manually" pill → search results disappear, form appears
5. Type a link `https://youtu.be/kJQP7kiw5Fk` → verify the open icon appears in the link field
6. Tap the open icon → should open the URL in the system browser → close it and return to the app
7. Tap "+ Add note" → notes field appears
8. Type a note, hit Save
9. Verify the card now shows the link icon
10. Tap the manually-matched card → Manual Entry screen → verify the "Spotify" button is in the header right (since now connected)
11. Tap "Spotify" header button → should land on Find Songs in search mode → back

- [ ] **Step 4: Test mutual exclusivity**

1. From the deck, tap the manual-matched card → Manual Entry → tap "Spotify" header button → Find Songs
2. Pick a Spotify track → go through Capture → save a clip
3. Back on the deck — the card should now show the regular dot (not the link icon), confirming the manual entry was replaced
4. Tap the same card → should now navigate to Capture (not ManualEntry)

- [ ] **Step 5: Test playlist creation with mixed deck**

1. Create one or two manual entries on cards in the same deck
2. Make sure the deck also has at least one Spotify-matched card
3. Tap "Playlist" in the deck header
4. Verify the modal shows: "Create a Spotify playlist from N cards?" where N excludes manual entries
5. Verify the warning text "X manual entries will be skipped (not on Spotify)" is shown
6. Cancel the modal — no playlist created

- [ ] **Step 6: Test export with mixed deck**

1. From the same deck, tap "Export"
2. Verify the count includes both spotify timestamps AND manual entries
3. Tap "Export CSV" → share sheet appears
4. Save the CSV somewhere and open it — verify it has the new column structure (Source column, Manual Title/Link/Notes columns) and rows for both kinds

- [ ] **Step 7: Commit any fixes**

If any issue is found during smoke testing, fix it and commit:

```bash
git add -A
git commit -m "Fix issues found during manual song entry smoke test"
```

If everything works, no commit is needed.

---

## Summary

After all 9 tasks, the feature is complete:

- Manual entries can be created from `SongCandidatesScreen` with or without Spotify
- They can be edited from a new `ManualEntryScreen`
- The deck list distinguishes them visually
- Playlist creation skips them with a warning
- CSV export includes them in dedicated columns
- E2E tests cover the core flows

The plan is intentionally TDD-light because the project has no Jest setup. Each task ends with a `npx tsc --noEmit` type check (where applicable) and a commit. Smoke testing is consolidated in Task 9.
