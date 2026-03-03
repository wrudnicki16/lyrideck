#!/usr/bin/env node
/**
 * Generates a minimal valid .apkg test fixture.
 *
 * An .apkg is a zip file containing a SQLite database named `collection.anki2`.
 * This script uses the system `sqlite3` CLI to create the DB and `jszip`
 * (already a project dependency) to package it.
 *
 * Usage: node .maestro/testdata/create-test-apkg.js
 * Output: .maestro/testdata/test-deck.apkg
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const OUT_DIR = path.join(__dirname);
const DB_PATH = path.join(OUT_DIR, '_tmp_collection.anki2');
const APKG_PATH = path.join(OUT_DIR, 'test-deck.apkg');

// Two test decks
const DECKS = {
  1: { id: 1, name: 'Spanish Vocabulary' },
  2: { id: 2, name: 'Music Theory' },
};

// Three test notes: 2 in deck 1, 1 in deck 2
// Fields are separated by \x1f (unit separator)
const NOTES = [
  { id: 1, flds: 'Hola\x1fHello', tags: ' greetings ' },
  { id: 2, flds: 'Adiós\x1fGoodbye', tags: ' greetings ' },
  { id: 3, flds: 'Chord\x1fThree or more notes played together', tags: ' basics ' },
];

const CARDS = [
  { id: 1, nid: 1, did: 1 },
  { id: 2, nid: 2, did: 1 },
  { id: 3, nid: 3, did: 2 },
];

function buildSql() {
  const lines = [];

  // col table (old-format deck metadata)
  lines.push(`CREATE TABLE col (
    id INTEGER PRIMARY KEY,
    decks TEXT NOT NULL DEFAULT '{}'
  );`);
  lines.push(`INSERT INTO col (id, decks) VALUES (1, '${JSON.stringify(DECKS)}');`);

  // notes table (minimal columns required by parseApkg)
  lines.push(`CREATE TABLE notes (
    id INTEGER PRIMARY KEY,
    mid INTEGER NOT NULL DEFAULT 0,
    flds TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT ''
  );`);
  for (const n of NOTES) {
    const flds = n.flds.replace(/'/g, "''");
    const tags = n.tags.replace(/'/g, "''");
    lines.push(`INSERT INTO notes (id, mid, flds, tags) VALUES (${n.id}, 1, '${flds}', '${tags}');`);
  }

  // cards table (minimal columns required by parseApkg)
  lines.push(`CREATE TABLE cards (
    id INTEGER PRIMARY KEY,
    nid INTEGER NOT NULL,
    did INTEGER NOT NULL
  );`);
  for (const c of CARDS) {
    lines.push(`INSERT INTO cards (id, nid, did) VALUES (${c.id}, ${c.nid}, ${c.did});`);
  }

  return lines.join('\n');
}

async function main() {
  // 1. Create SQLite DB via system sqlite3
  const sql = buildSql();
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  execSync(`sqlite3 "${DB_PATH}"`, { input: sql });
  console.log('Created SQLite DB:', DB_PATH);

  // 2. Read DB bytes and zip as collection.anki2
  const dbBytes = fs.readFileSync(DB_PATH);
  const zip = new JSZip();
  zip.file('collection.anki2', dbBytes);

  const apkgBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(APKG_PATH, apkgBuffer);
  console.log('Created test fixture:', APKG_PATH);
  console.log(`  ${NOTES.length} notes across ${Object.keys(DECKS).length} decks`);

  // 3. Cleanup temp DB
  fs.unlinkSync(DB_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
