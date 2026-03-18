import * as SQLite from 'expo-sqlite';
import { CardWithDeck } from '../types';
import { isLyrics } from '../utils/isLyrics';

let db: SQLite.SQLiteDatabase;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync('anki2spotify.db');
    await initDatabase(db);
  }
  return db;
}

async function initDatabase(database: SQLite.SQLiteDatabase): Promise<void> {
  await database.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS decks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_id INTEGER NOT NULL,
      front TEXT NOT NULL,
      back TEXT NOT NULL,
      tags TEXT DEFAULT '',
      status TEXT DEFAULT 'pending',
      FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS timestamps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      track_id TEXT NOT NULL,
      track_name TEXT NOT NULL,
      artist_name TEXT NOT NULL,
      album_art TEXT DEFAULT '',
      spotify_url TEXT NOT NULL,
      spotify_uri TEXT NOT NULL,
      progress_ms INTEGER NOT NULL,
      note TEXT DEFAULT '',
      capture_mode TEXT DEFAULT 'manual',
      captured_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
    );
  `);

  // Add search_field column to existing decks tables (safe to fail if already exists)
  try {
    await database.execAsync(
      `ALTER TABLE decks ADD COLUMN search_field TEXT DEFAULT 'back'`
    );
  } catch (_) {
    // Column already exists
  }

  // Add filter and lyrics_only columns to existing decks tables
  try {
    await database.execAsync(
      `ALTER TABLE decks ADD COLUMN status_filter TEXT DEFAULT NULL`
    );
  } catch (_) {
    // Column already exists
  }
  try {
    await database.execAsync(
      `ALTER TABLE decks ADD COLUMN lyrics_only INTEGER DEFAULT 0`
    );
  } catch (_) {
    // Column already exists
  }

  // Card-track associations (from playlist generation)
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS card_tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      track_id TEXT NOT NULL,
      track_name TEXT NOT NULL,
      artist_name TEXT NOT NULL,
      album_art TEXT DEFAULT '',
      spotify_url TEXT NOT NULL,
      spotify_uri TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
      UNIQUE(card_id, track_id)
    );
  `);
}

// --- Deck operations ---

export async function insertDeck(name: string): Promise<number> {
  const database = await getDatabase();
  const result = await database.runAsync(
    'INSERT INTO decks (name) VALUES (?)',
    name
  );
  return result.lastInsertRowId;
}

export async function getAllDecks(): Promise<any[]> {
  const database = await getDatabase();
  return database.getAllAsync(`
    SELECT d.id, d.name, d.imported_at, d.search_field, d.status_filter, d.lyrics_only, COUNT(c.id) as card_count
    FROM decks d
    LEFT JOIN cards c ON c.deck_id = d.id
    GROUP BY d.id
    ORDER BY d.imported_at DESC
  `);
}

export async function updateDeckSearchField(
  deckId: number,
  field: 'front' | 'back'
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('UPDATE decks SET search_field = ? WHERE id = ?', [
    field,
    deckId,
  ]);
}

export async function updateDeckStatusFilter(
  deckId: number,
  filter: string | null
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('UPDATE decks SET status_filter = ? WHERE id = ?', [
    filter,
    deckId,
  ]);
}

export async function updateDeckLyricsOnly(
  deckId: number,
  lyricsOnly: boolean
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('UPDATE decks SET lyrics_only = ? WHERE id = ?', [
    lyricsOnly ? 1 : 0,
    deckId,
  ]);
}

export async function deleteDeck(deckId: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM cards WHERE deck_id = ?', deckId);
  await database.runAsync('DELETE FROM decks WHERE id = ?', deckId);
}

// --- Card operations ---

export async function insertCards(
  deckId: number,
  cards: { front: string; back: string; tags: string }[]
): Promise<void> {
  const database = await getDatabase();
  const insertSql = await database.prepareAsync(
    'INSERT INTO cards (deck_id, front, back, tags) VALUES ($deckId, $front, $back, $tags)'
  );
  try {
    for (const card of cards) {
      await insertSql.executeAsync({
        $deckId: deckId,
        $front: card.front,
        $back: card.back,
        $tags: card.tags,
      });
    }
  } finally {
    await insertSql.finalizeAsync();
  }
}

export async function getCardsByDeck(
  deckId: number,
  status?: string
): Promise<any[]> {
  const database = await getDatabase();
  if (status) {
    return database.getAllAsync(
      'SELECT * FROM cards WHERE deck_id = ? AND status = ? ORDER BY id',
      [deckId, status]
    );
  }
  return database.getAllAsync(
    'SELECT * FROM cards WHERE deck_id = ? ORDER BY id',
    deckId
  );
}

export async function updateCardStatus(
  cardId: number,
  status: string
): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('UPDATE cards SET status = ? WHERE id = ?', [
    status,
    cardId,
  ]);
}

// --- Timestamp operations ---

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
  return result.lastInsertRowId;
}

export async function getTimestampsByCard(cardId: number): Promise<any[]> {
  const database = await getDatabase();
  return database.getAllAsync(
    'SELECT * FROM timestamps WHERE card_id = ? ORDER BY captured_at DESC',
    cardId
  );
}

export async function getTimestampsForCardAndTrack(
  cardId: number,
  trackId: string
): Promise<any[]> {
  const database = await getDatabase();
  return database.getAllAsync(
    'SELECT * FROM timestamps WHERE card_id = ? AND track_id = ? ORDER BY captured_at DESC',
    [cardId, trackId]
  );
}

export async function getTracksWithClipsForCard(
  cardId: number
): Promise<
  {
    track_id: string;
    track_name: string;
    artist_name: string;
    album_art: string;
    spotify_url: string;
    spotify_uri: string;
    clip_count: number;
  }[]
> {
  const database = await getDatabase();
  return database.getAllAsync(
    `SELECT track_id, track_name, artist_name, album_art, spotify_url, spotify_uri, COUNT(*) as clip_count
     FROM timestamps
     WHERE card_id = ?
     GROUP BY track_id
     ORDER BY MAX(captured_at) DESC`,
    cardId
  ) as any;
}

export async function getTimestampsByDeck(deckId: number): Promise<any[]> {
  const database = await getDatabase();
  return database.getAllAsync(
    `SELECT t.*, c.front, c.back
     FROM timestamps t
     JOIN cards c ON c.id = t.card_id
     WHERE c.deck_id = ?
     ORDER BY c.id, t.captured_at`,
    deckId
  );
}

export async function getTrackForCard(cardId: number): Promise<{
  track_id: string;
  track_name: string;
  artist_name: string;
  album_art: string;
  spotify_url: string;
  spotify_uri: string;
} | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync(
    `SELECT track_id, track_name, artist_name, album_art, spotify_url, spotify_uri
     FROM timestamps WHERE card_id = ? ORDER BY captured_at DESC LIMIT 1`,
    cardId
  );
  return row as any ?? null;
}

export async function deleteTimestamp(id: number): Promise<void> {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM timestamps WHERE id = ?', id);
}

export async function getTimestampCountForCard(cardId: number): Promise<number> {
  const database = await getDatabase();
  const row: any = await database.getFirstAsync(
    'SELECT COUNT(*) as count FROM timestamps WHERE card_id = ?',
    cardId
  );
  return row?.count ?? 0;
}

// --- Review mode helpers ---

export async function getNextPendingCard(
  deckId: number,
  currentCardId: number | null,
  searchField: 'front' | 'back',
  lyricsOnly: boolean
): Promise<{ id: number; front: string; back: string; status: string } | null> {
  const database = await getDatabase();
  const rows: any[] = await database.getAllAsync(
    `SELECT id, front, back, status FROM cards
     WHERE deck_id = ? AND status = 'pending' AND id > ?
     ORDER BY id`,
    [deckId, currentCardId ?? 0]
  );
  if (!lyricsOnly) return rows[0] ?? null;
  const field = searchField === 'front' ? 'front' : 'back';
  return rows.find((r) => isLyrics(r[field])) ?? null;
}

export async function getPendingCardCount(
  deckId: number,
  searchField: 'front' | 'back',
  lyricsOnly: boolean
): Promise<number> {
  const database = await getDatabase();
  const rows: any[] = await database.getAllAsync(
    `SELECT front, back FROM cards WHERE deck_id = ? AND status = 'pending'`,
    deckId
  );
  if (!lyricsOnly) return rows.length;
  const field = searchField === 'front' ? 'front' : 'back';
  return rows.filter((r) => isLyrics(r[field])).length;
}

// --- Card-track associations ---

export async function insertCardTrack(ct: {
  cardId: number;
  trackId: string;
  trackName: string;
  artistName: string;
  albumArt: string;
  spotifyUrl: string;
  spotifyUri: string;
}): Promise<void> {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT OR IGNORE INTO card_tracks (card_id, track_id, track_name, artist_name, album_art, spotify_url, spotify_uri)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [ct.cardId, ct.trackId, ct.trackName, ct.artistName, ct.albumArt, ct.spotifyUrl, ct.spotifyUri]
  );
}

// --- Track search queries ---

export async function getCardsByTrackId(trackId: string): Promise<CardWithDeck[]> {
  const database = await getDatabase();
  return database.getAllAsync(
    `SELECT card_id, front, back, status, deck_id, deck_name, clip_count FROM (
       SELECT c.id as card_id, c.front, c.back, c.status,
              d.id as deck_id, d.name as deck_name,
              COUNT(t.id) as clip_count
       FROM timestamps t
       JOIN cards c ON c.id = t.card_id
       JOIN decks d ON d.id = c.deck_id
       WHERE t.track_id = ?
       GROUP BY c.id
       UNION
       SELECT c.id as card_id, c.front, c.back, c.status,
              d.id as deck_id, d.name as deck_name,
              0 as clip_count
       FROM card_tracks ct
       JOIN cards c ON c.id = ct.card_id
       JOIN decks d ON d.id = c.deck_id
       WHERE ct.track_id = ?
       AND c.id NOT IN (SELECT card_id FROM timestamps WHERE track_id = ?)
     )
     ORDER BY clip_count DESC`,
    [trackId, trackId, trackId]
  ) as Promise<CardWithDeck[]>;
}

export async function searchCardsByText(query: string): Promise<CardWithDeck[]> {
  const database = await getDatabase();
  const pattern = `%${query}%`;
  return database.getAllAsync(
    `SELECT c.id as card_id, c.front, c.back, c.status,
            d.id as deck_id, d.name as deck_name,
            COALESCE(tc.clip_count, 0) as clip_count
     FROM cards c
     JOIN decks d ON d.id = c.deck_id
     LEFT JOIN (
       SELECT card_id, COUNT(*) as clip_count
       FROM timestamps GROUP BY card_id
     ) tc ON tc.card_id = c.id
     WHERE c.front LIKE ? OR c.back LIKE ?
     ORDER BY clip_count DESC, c.id`,
    [pattern, pattern]
  ) as Promise<CardWithDeck[]>;
}
