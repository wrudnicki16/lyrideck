export interface AnkiCard {
  id: number;
  deckId: number;
  front: string;
  back: string;
  tags: string;
  status: 'pending' | 'matched' | 'skipped';
}

export interface Deck {
  id: number;
  name: string;
  importedAt: string;
  cardCount: number;
}

export interface SpotifyTrack {
  id: string;
  name: string;
  artists: { name: string }[];
  album: {
    name: string;
    images: { url: string; width: number; height: number }[];
  };
  uri: string;
  external_urls: { spotify: string };
  duration_ms: number;
}

export interface Timestamp {
  id: number;
  cardId: number;
  trackId: string;
  trackName: string;
  artistName: string;
  albumArt: string;
  spotifyUrl: string;
  spotifyUri: string;
  progressMs: number;
  note: string;
  captureMode: 'auto' | 'manual';
  capturedAt: string;
}

export interface PlaybackState {
  is_playing: boolean;
  progress_ms: number;
  item: SpotifyTrack | null;
  context: { type: string; uri: string } | null;
}

// --- DB row types used across screens ---

export interface CardRow {
  id: number;
  front: string;
  back: string;
  tags: string;
  status: string;
  manual_entry_id?: number | null;
}

export interface DeckRow {
  id: number;
  name: string;
  imported_at: string;
  card_count: number;
  search_field: string | null;
  status_filter: string | null;
  lyrics_only: number;
}

export interface TrackParam {
  id: string;
  name: string;
  artists: string;
  albumArt: string;
  spotifyUrl: string;
  spotifyUri: string;
  durationMs: number;
}

export interface TimestampRow {
  id: number;
  progress_ms: number;
  note: string;
  capture_mode: string;
  captured_at: string;
}

export interface ParsedCard {
  front: string;
  back: string;
  tags: string;
}

export interface ExportRow {
  front: string;
  back: string;
  track_name: string;
  artist_name: string;
  progress_ms: number;
  note: string;
  capture_mode: string;
  spotify_url: string;
  captured_at: string;
}

export interface CardWithDeck {
  card_id: number;
  front: string;
  back: string;
  status: string;
  deck_id: number;
  deck_name: string;
  clip_count: number;
}

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

export interface CardParam {
  id: number;
  front: string;
  back: string;
  status: string;
  searchText: string;
  hasManualEntry: boolean;
}
