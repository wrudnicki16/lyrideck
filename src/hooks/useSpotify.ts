import { SPOTIFY_API_BASE } from '../config/spotify';
import { SpotifyTrack, PlaybackState } from '../types';

export function useSpotify(accessToken: string | null) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  const fetchWithRetry = async (
    url: string,
    options: RequestInit,
    maxRetries = 3
  ): Promise<Response> => {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const res = await fetch(url, options);
      if (res.status !== 429 || attempt === maxRetries) return res;
      const retryAfter = parseInt(res.headers.get('Retry-After') ?? '1', 10);
      await new Promise((r) => setTimeout(r, retryAfter * 1000 * (attempt + 1)));
    }
    throw new Error('Max retries exceeded');
  };

  const searchTracks = async (
    query: string,
    limit: number = 10
  ): Promise<SpotifyTrack[]> => {
    if (!accessToken) return [];
    try {
      const res = await fetch(
        `${SPOTIFY_API_BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}`,
        { headers }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return data.tracks?.items ?? [];
    } catch {
      return [];
    }
  };

  const getPlaybackState = async (): Promise<PlaybackState | null> => {
    if (!accessToken) return null;
    try {
      const res = await fetch(`${SPOTIFY_API_BASE}/me/player`, { headers });
      if (res.status === 204 || !res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  };

  const seekToPosition = async (positionMs: number): Promise<boolean> => {
    if (!accessToken) return false;
    try {
      const res = await fetch(
        `${SPOTIFY_API_BASE}/me/player/seek?position_ms=${positionMs}`,
        { method: 'PUT', headers }
      );
      return res.ok;
    } catch {
      return false;
    }
  };

  const playTrack = async (
    spotifyUri: string,
    positionMs: number
  ): Promise<boolean> => {
    if (!accessToken) return false;
    try {
      const res = await fetch(`${SPOTIFY_API_BASE}/me/player/play`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ uris: [spotifyUri], position_ms: positionMs }),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const createPlaylist = async (
    name: string
  ): Promise<{ id: string; uri: string; external_urls: { spotify: string } } | null> => {
    if (!accessToken) return null;
    try {
      const res = await fetchWithRetry(`${SPOTIFY_API_BASE}/me/playlists`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name, public: true }),
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  };

  const addTracksToPlaylist = async (
    playlistId: string,
    uris: string[]
  ): Promise<boolean> => {
    if (!accessToken) return false;
    try {
      for (let i = 0; i < uris.length; i += 100) {
        const batch = uris.slice(i, i + 100);
        const res = await fetchWithRetry(
          `${SPOTIFY_API_BASE}/playlists/${playlistId}/items`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ uris: batch }),
          }
        );
        if (!res.ok) return false;
      }
      return true;
    } catch {
      return false;
    }
  };

  const getTracksByIds = async (ids: string[]): Promise<SpotifyTrack[]> => {
    if (!accessToken || ids.length === 0) return [];
    try {
      const res = await fetch(
        `${SPOTIFY_API_BASE}/tracks?ids=${ids.join(',')}`,
        { headers }
      );
      if (!res.ok) return [];
      const data = await res.json();
      return data.tracks?.filter(Boolean) ?? [];
    } catch {
      return [];
    }
  };

  return {
    searchTracks,
    getTracksByIds,
    getPlaybackState,
    seekToPosition,
    playTrack,
    createPlaylist,
    addTracksToPlaylist,
  };
}
