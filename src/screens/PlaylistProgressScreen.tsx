import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { useSpotify } from '../hooks/useSpotify';
import { getTrackForCard } from '../db/database';
import { colors } from '../constants/colors';
import { openSpotifyLink } from '../utils/openSpotifyLink';
import { CardParam } from '../types';

interface Props {
  route: any;
  navigation: any;
  accessToken: string | null;
}

type Phase = 'resolving' | 'creating' | 'done' | 'error';

export default function PlaylistProgressScreen({
  route,
  navigation,
  accessToken,
}: Props) {
  const { playlistName, cards } = route.params as {
    playlistName: string;
    cards: CardParam[];
  };

  const {
    searchTracks,
    createPlaylist,
    addTracksToPlaylist,
  } = useSpotify(accessToken);

  const [phase, setPhase] = useState<Phase>('resolving');
  const [progress, setProgress] = useState(0);
  const [total] = useState(cards.length);
  const [skipped, setSkipped] = useState(0);
  const [playlistUrl, setPlaylistUrl] = useState<string | null>(null);
  const [playlistUri, setPlaylistUri] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const cancelledRef = useRef(false);

  useEffect(() => {
    run();
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const run = async () => {
    // Phase 1: Resolve track URIs
    const uris: string[] = [];
    let skippedCount = 0;

    for (let i = 0; i < cards.length; i++) {
      if (cancelledRef.current) return;
      const card = cards[i];
      let uri: string | null = null;

      if (card.status === 'matched') {
        const track = await getTrackForCard(card.id);
        uri = track?.spotify_uri ?? null;
      }

      if (!uri) {
        const results = await searchTracks(card.searchText, 1);
        uri = results[0]?.uri ?? null;
      }

      if (uri) {
        uris.push(uri);
      } else {
        skippedCount++;
      }

      setProgress(i + 1);
      setSkipped(skippedCount);
    }

    if (cancelledRef.current) return;

    if (uris.length === 0) {
      setErrorMessage('No tracks could be found for any cards.');
      setPhase('error');
      return;
    }

    // Phase 2: Create playlist
    setPhase('creating');

    const playlist = await createPlaylist(playlistName);
    if (!playlist) {
      setErrorMessage('Failed to create playlist on Spotify.');
      setPhase('error');
      return;
    }

    const success = await addTracksToPlaylist(playlist.id, uris);
    if (!success) {
      setErrorMessage(
        'Playlist was created but some tracks failed to add. Check Spotify.'
      );
      setPlaylistUrl(playlist.external_urls.spotify);
      setPlaylistUri(playlist.uri);
      setPhase('error');
      return;
    }

    setPlaylistUrl(playlist.external_urls.spotify);
    setPlaylistUri(playlist.uri);
    setPhase('done');
  };

  const handleOpenInSpotify = () =>
    openSpotifyLink(playlistUri, playlistUrl);

  return (
    <View style={styles.container}>
      <Text style={styles.playlistName}>{playlistName}</Text>

      {phase === 'resolving' && (
        <>
          <Text style={styles.statusText}>
            Resolving tracks... {progress}/{total}
          </Text>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${total > 0 ? (progress / total) * 100 : 0}%` },
              ]}
            />
          </View>
          {skipped > 0 && (
            <Text style={styles.skippedText}>
              {skipped} card{skipped !== 1 ? 's' : ''} skipped (no results)
            </Text>
          )}
        </>
      )}

      {phase === 'creating' && (
        <Text style={styles.statusText}>Creating playlist...</Text>
      )}

      {phase === 'done' && (
        <>
          <Text style={styles.successText}>
            Playlist created with {total - skipped} track
            {total - skipped !== 1 ? 's' : ''}!
          </Text>
          {skipped > 0 && (
            <Text style={styles.skippedText}>
              {skipped} card{skipped !== 1 ? 's' : ''} skipped (no results found)
            </Text>
          )}
          <TouchableOpacity style={styles.spotifyButton} onPress={handleOpenInSpotify}>
            <Text style={styles.spotifyButtonText}>Open in Spotify</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => navigation.popToTop()}
          >
            <Text style={styles.doneButtonText}>Back to Decks</Text>
          </TouchableOpacity>
        </>
      )}

      {phase === 'error' && (
        <>
          <Text style={styles.errorText}>{errorMessage}</Text>
          {playlistUrl && (
            <TouchableOpacity
              style={styles.spotifyButton}
              onPress={handleOpenInSpotify}
            >
              <Text style={styles.spotifyButtonText}>Open in Spotify</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.doneButtonText}>Go Back</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playlistName: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 32,
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: 16,
    marginBottom: 16,
  },
  progressBarBg: {
    width: '100%',
    height: 6,
    backgroundColor: colors.surfaceLight,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.spotifyGreen,
    borderRadius: 3,
  },
  skippedText: {
    color: colors.warning,
    fontSize: 13,
    marginBottom: 8,
  },
  successText: {
    color: colors.spotifyGreen,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 24,
    textAlign: 'center',
  },
  errorText: {
    color: colors.danger,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  spotifyButton: {
    backgroundColor: colors.spotifyGreen,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 30,
    marginBottom: 12,
    width: '100%',
    alignItems: 'center',
  },
  spotifyButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  doneButton: {
    backgroundColor: colors.buttonSecondary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 30,
    width: '100%',
    alignItems: 'center',
  },
  doneButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
});
