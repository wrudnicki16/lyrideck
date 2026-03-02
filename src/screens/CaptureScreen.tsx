import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
} from 'react-native';
import { useSpotify } from '../hooks/useSpotify';
import TimestampPicker from '../components/TimestampPicker';
import {
  insertTimestamp,
  getTimestampsForCardAndTrack,
  deleteTimestamp,
  updateCardStatus,
  getNextPendingCard,
  getPendingCardCount,
} from '../db/database';
import { CommonActions } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { colors } from '../constants/colors';
import { formatMs } from '../utils/formatMs';
import { openSpotifyLink } from '../utils/openSpotifyLink';
import { TrackParam, TimestampRow } from '../types';

interface Props {
  route: any;
  navigation: any;
  accessToken: string | null;
}

export default function CaptureScreen({
  route,
  navigation,
  accessToken,
}: Props) {
  const { cardId, cardFront, cardBack, track, searchField, reviewMode, deckId, lyricsOnly } = route.params as {
    cardId: number;
    cardFront: string;
    cardBack: string;
    track: TrackParam;
    searchField?: string;
    reviewMode?: boolean;
    deckId?: number;
    lyricsOnly?: boolean;
  };

  const { getPlaybackState, playTrack } = useSpotify(accessToken);
  const [timestamps, setTimestamps] = useState<TimestampRow[]>([]);
  const [showManual, setShowManual] = useState(false);
  const [autoStatus, setAutoStatus] = useState<string>('');
  const [pendingCount, setPendingCount] = useState<number | null>(null);

  useEffect(() => {
    if (reviewMode && deckId != null) {
      getPendingCardCount(deckId, (searchField as 'front' | 'back') ?? 'back', !!lyricsOnly).then(setPendingCount);
    }
  }, []);

  useEffect(() => {
    loadTimestamps();
  }, []);

  const loadTimestamps = async () => {
    const ts = await getTimestampsForCardAndTrack(cardId, track.id);
    setTimestamps(ts as TimestampRow[]);
  };

  const handleAutoCapture = async () => {
    setAutoStatus('Reading playback...');
    const state = await getPlaybackState();

    if (state?.item && state.progress_ms !== undefined) {
      // Auto-capture succeeded
      const isMatchingTrack = state.item.id === track.id;
      await saveTimestamp(
        state.progress_ms,
        isMatchingTrack ? '' : `Playing: ${state.item.name}`,
        'auto'
      );
      setAutoStatus('');
    } else {
      // Fall back to manual
      setAutoStatus('No active playback detected. Use manual entry.');
      setShowManual(true);
    }
  };

  const saveTimestamp = async (
    ms: number,
    note: string,
    mode: 'auto' | 'manual'
  ) => {
    await insertTimestamp({
      cardId,
      trackId: track.id,
      trackName: track.name,
      artistName: track.artists,
      albumArt: track.albumArt,
      spotifyUrl: track.spotifyUrl,
      spotifyUri: track.spotifyUri,
      progressMs: ms,
      note,
      captureMode: mode,
    });
    await updateCardStatus(cardId, 'matched');
    await loadTimestamps();
    setShowManual(false);
    setAutoStatus('');
  };

  const handleMarkAtZero = async () => {
    await saveTimestamp(0, '', 'manual');
  };

  const handleManualSubmit = async (ms: number, note: string) => {
    await saveTimestamp(ms, note, 'manual');
  };

  const handleOpenInSpotify = () =>
    openSpotifyLink(track.spotifyUri, track.spotifyUrl);

  const copyTimestamp = async (ms: number) => {
    const formatted = formatMs(ms);
    if (Clipboard && Clipboard.setStringAsync) {
      await Clipboard.setStringAsync(formatted);
    }
    Alert.alert('Copied', `Timestamp ${formatted} copied to clipboard`);
  };

  const handleJump = async (ms: number) => {
    const success = await playTrack(track.spotifyUri, ms);
    if (!success) {
      Alert.alert(
        'Cannot Jump',
        'Playback requires Spotify Premium and an active device. Scrub manually to ' +
          formatMs(ms)
      );
    }
  };

  const handleDelete = (id: number) => {
    Alert.alert('Delete', 'Remove this timestamp?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTimestamp(id);
          await loadTimestamps();
        },
      },
    ]);
  };

  const reviewParams = reviewMode
    ? { reviewMode: true, deckId, lyricsOnly }
    : {};

  const handleNextCard = async () => {
    const next = await getNextPendingCard(deckId!, cardId, (searchField as 'front' | 'back') ?? 'back', !!lyricsOnly);
    if (!next) {
      Alert.alert('All done!', 'No more pending cards to process.', [
        { text: 'OK', onPress: () => navigation.navigate('CardQueue') },
      ]);
      return;
    }
    const state = navigation.getState();
    // Find the last route before SongCandidates in the stack
    const songIdx = state.routes.findIndex((r: any) => r.name === 'SongCandidates');
    const baseRoutes = songIdx > 0 ? state.routes.slice(0, songIdx) : state.routes.slice(0, -2);
    navigation.dispatch(
      CommonActions.reset({
        index: baseRoutes.length,
        routes: [
          ...baseRoutes,
          {
            name: 'SongCandidates',
            params: {
              cardId: next.id,
              cardFront: next.front,
              cardBack: next.back,
              searchField,
              ...reviewParams,
            },
          },
        ],
      })
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Track info */}
      <View style={styles.trackHeader}>
        {track.albumArt ? (
          <Image
            source={{ uri: track.albumArt }}
            style={styles.albumArt}
          />
        ) : null}
        <View style={styles.trackInfo}>
          <Text style={styles.trackName} numberOfLines={2}>
            {track.name}
          </Text>
          <Text style={styles.artistName}>{track.artists}</Text>
        </View>
      </View>

      {/* Card context */}
      <View style={styles.cardContext}>
        <Text style={styles.cardLabel}>Card:</Text>
        <Text style={styles.cardFront}>{cardFront}</Text>
        <Text style={styles.cardBack}>{cardBack}</Text>
      </View>

      {/* Actions */}
      <TouchableOpacity style={styles.openButton} onPress={handleOpenInSpotify}>
        <Text style={styles.openButtonText}>Open in Spotify</Text>
      </TouchableOpacity>

      <View style={styles.captureRow}>
        <TouchableOpacity
          style={[styles.captureButton, { flex: 1 }]}
          onPress={handleAutoCapture}
        >
          <Text style={styles.captureButtonText}>Mark Timestamp</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.markZeroButton}
          onPress={handleMarkAtZero}
        >
          <Text style={styles.markZeroButtonText}>Mark at 0:00</Text>
        </TouchableOpacity>
      </View>

      {autoStatus ? (
        <Text style={styles.statusText}>{autoStatus}</Text>
      ) : null}

      <TouchableOpacity
        style={styles.manualLink}
        onPress={() => setShowManual(true)}
      >
        <Text style={styles.manualLinkText}>Enter time manually</Text>
      </TouchableOpacity>

      {searchField ? (
        <TouchableOpacity
          style={styles.manualLink}
          onPress={() =>
            navigation.navigate('SongCandidates', {
              cardId,
              cardFront,
              cardBack,
              searchField,
              ...reviewParams,
            })
          }
        >
          <Text style={styles.manualLinkText}>Search for different track</Text>
        </TouchableOpacity>
      ) : null}

      {reviewMode && timestamps.length > 0 && (
        <TouchableOpacity style={styles.nextCardButton} onPress={handleNextCard}>
          <Text style={styles.nextCardButtonText}>Next Card</Text>
        </TouchableOpacity>
      )}

      {reviewMode && pendingCount != null && (
        <Text style={styles.progressText}>{pendingCount} card{pendingCount !== 1 ? 's' : ''} remaining</Text>
      )}

      {showManual && (
        <TimestampPicker
          onSubmit={handleManualSubmit}
          onCancel={() => setShowManual(false)}
        />
      )}

      {/* Saved timestamps */}
      {timestamps.length > 0 && (
        <>
          <Text style={styles.savedTitle}>Saved Clips</Text>
          {timestamps.map((item) => (
            <View key={item.id} style={styles.tsItem}>
              <View style={styles.tsInfo}>
                <Text style={styles.tsTime}>
                  {formatMs(item.progress_ms)}
                </Text>
                {item.note ? (
                  <Text style={styles.tsNote}>{item.note}</Text>
                ) : null}
                <Text style={styles.tsMode}>
                  {item.capture_mode === 'auto' ? 'Auto' : 'Manual'}
                </Text>
              </View>
              <View style={styles.tsActions}>
                <TouchableOpacity
                  onPress={() => copyTimestamp(item.progress_ms)}
                >
                  <Text style={styles.tsActionText}>Copy</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleJump(item.progress_ms)}
                >
                  <Text style={styles.tsActionText}>Jump</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(item.id)}>
                  <Text style={[styles.tsActionText, { color: colors.danger }]}>
                    Del
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </>
      )}

      <Text style={styles.attribution}>
        Content provided by Spotify. Tap "Open in Spotify" to listen.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  trackHeader: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  albumArt: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  trackInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  trackName: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  artistName: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 4,
  },
  cardContext: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  cardLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 4,
  },
  cardFront: {
    color: colors.spotifyGreen,
    fontSize: 14,
    fontWeight: '600',
  },
  cardBack: {
    color: colors.textPrimary,
    fontSize: 14,
    marginTop: 2,
  },
  openButton: {
    backgroundColor: colors.spotifyGreen,
    padding: 16,
    borderRadius: 30,
    alignItems: 'center',
    marginBottom: 10,
  },
  openButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  captureRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  captureButton: {
    backgroundColor: colors.danger,
    padding: 18,
    borderRadius: 30,
    alignItems: 'center',
  },
  captureButtonText: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  markZeroButton: {
    backgroundColor: colors.buttonSecondary,
    padding: 18,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markZeroButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  statusText: {
    color: colors.warning,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
  },
  manualLink: {
    alignItems: 'center',
    marginBottom: 16,
  },
  manualLinkText: {
    color: colors.textSecondary,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  savedTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  tsItem: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 8,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tsInfo: {
    flex: 1,
  },
  tsTime: {
    color: colors.spotifyGreen,
    fontSize: 18,
    fontWeight: '700',
  },
  tsNote: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  tsMode: {
    color: colors.buttonSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  tsActions: {
    flexDirection: 'row',
    gap: 12,
  },
  tsActionText: {
    color: colors.spotifyGreen,
    fontSize: 13,
    fontWeight: '600',
  },
  attribution: {
    color: colors.buttonSecondary,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 12,
  },
  progressText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
  },
  nextCardButton: {
    backgroundColor: colors.spotifyGreen,
    padding: 16,
    borderRadius: 30,
    alignItems: 'center',
    marginBottom: 12,
  },
  nextCardButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
});
