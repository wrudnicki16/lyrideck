import { File, Directory, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import JSZip from 'jszip';
import { decompress } from 'fzstd';

export interface AnkiDeck {
  id: number;
  name: string;
  noteCount: number;
}

export interface ApkgCard {
  front: string;
  back: string;
  tags: string;
}

export interface ApkgResult {
  decks: AnkiDeck[];
  notesByDeck: Record<number, ApkgCard[]>;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .trim();
}

export function splitFields(flds: string): string[] {
  return flds.split('\x1f');
}

const TEMP_DB_NAME = 'anki_import_tmp.db';

async function extractDbBytes(zip: JSZip): Promise<{ bytes: Uint8Array; isNewSchema: boolean }> {
  // Prefer collection.anki21b (newer Anki 23+ format: zstd-compressed SQLite)
  const newEntry = zip.file('collection.anki21b');
  if (newEntry) {
    const compressed = await newEntry.async('uint8array');
    return { bytes: decompress(compressed), isNewSchema: true };
  }

  // Fall back to legacy format
  const legacyEntry = zip.file('collection.anki21') ?? zip.file('collection.anki2');
  if (!legacyEntry) throw new Error('No collection database found in package');
  return { bytes: await legacyEntry.async('uint8array'), isNewSchema: false };
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

const MAX_APKG_SIZE = 50 * 1024 * 1024; // 50MB

export async function parseApkg(fileUri: string): Promise<ApkgResult> {
  const sqliteDir = new Directory(Paths.document, 'SQLite');
  const tempDbFile = new File(sqliteDir, TEMP_DB_NAME);
  let db: SQLite.SQLiteDatabase | null = null;

  try {
    // 1. Check file size and read as base64
    const apkgFile = new File(fileUri);
    if (apkgFile.size && apkgFile.size > MAX_APKG_SIZE) {
      throw new Error(
        `This deck is too large (${Math.round(apkgFile.size / 1024 / 1024)}MB). ` +
        'Please re-export from Anki with "Include media" unchecked, or split into smaller decks.'
      );
    }
    const base64 = await apkgFile.base64();

    // 2. Unzip and extract the collection database
    const zip = await JSZip.loadAsync(base64, { base64: true });
    const { bytes: dbBytes, isNewSchema } = await extractDbBytes(zip);

    // 3. Write SQLite bytes to the app's SQLite directory
    if (!sqliteDir.exists) {
      sqliteDir.create({ intermediates: true });
    }
    tempDbFile.write(uint8ToBase64(dbBytes), { encoding: 'base64' });

    // 4. Open and query
    db = await SQLite.openDatabaseAsync(TEMP_DB_NAME);

    // Read deck info — handle both old and new schemas
    let deckMap: Record<string, { id: number; name: string }>;
    if (isNewSchema) {
      // New schema (Anki 23+ / schema 18): separate decks table
      // Deck names use \x1f as hierarchy separator instead of ::
      const deckRows = await db.getAllAsync<{ id: number; name: string }>(
        "SELECT id, replace(name, char(31), '::') as name FROM decks"
      );
      deckMap = {};
      for (const d of deckRows) {
        deckMap[String(d.id)] = { id: d.id, name: d.name };
      }
    } else {
      // Old schema: decks stored as JSON in the col table
      const colRow = await db.getFirstAsync<{ decks: string }>('SELECT decks FROM col');
      if (!colRow) throw new Error('Could not read deck information');
      deckMap = JSON.parse(colRow.decks);
    }

    // Count notes per deck, consistent with the assignment query below.
    // A note with cards in multiple decks is assigned to the lowest deck ID.
    const countRows = await db.getAllAsync<{ did: number; note_count: number }>(
      `SELECT did, COUNT(*) as note_count FROM (
        SELECT MIN(c.did) as did FROM notes n JOIN cards c ON c.nid = n.id GROUP BY n.id
      ) GROUP BY did`
    );
    const countByDeck = new Map(countRows.map((r) => [r.did, r.note_count]));

    // All notes with their deck assignment.
    // A note can have cards in multiple decks; assign to the lowest deck ID.
    const noteRows = await db.getAllAsync<{
      flds: string;
      tags: string;
      did: number;
    }>(
      'SELECT n.flds, n.tags, MIN(c.did) as did FROM notes n JOIN cards c ON c.nid = n.id GROUP BY n.id'
    );

    await db.closeAsync();
    db = null;

    // 5. Build deck list (only decks that have notes)
    const decks: AnkiDeck[] = Object.values(deckMap)
      .map((d) => ({
        id: d.id,
        name: d.name,
        noteCount: countByDeck.get(d.id) ?? 0,
      }))
      .filter((d) => d.noteCount > 0);

    // 6. Build notesByDeck
    const notesByDeck: Record<number, ApkgCard[]> = {};
    for (const row of noteRows) {
      const fields = splitFields(row.flds);
      const front = stripHtml(fields[0] ?? '');
      const back = stripHtml(fields[1] ?? '');
      if (!front && !back) continue;
      if (!notesByDeck[row.did]) notesByDeck[row.did] = [];
      notesByDeck[row.did].push({ front, back, tags: row.tags.trim() });
    }

    return { decks, notesByDeck };
  } finally {
    // Close DB connection if still open (e.g. error after openDatabaseAsync)
    if (db) {
      await db.closeAsync().catch(() => {});
    }
    // Cleanup temp file — silent failure is fine; file is overwritten next import
    try {
      if (tempDbFile.exists) {
        tempDbFile.delete();
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}
