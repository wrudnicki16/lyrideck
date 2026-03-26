import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
  Linking,
} from 'react-native';
import { useSpotify } from '../hooks/useSpotify';
import TimestampPicker from '../components/TimestampPicker';
import {
  insertTimestamp,
  getTimestampsForCardAndTrack,
  deleteTimestamp,
  getTimestampCountForCard,
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
          const remaining = await getTimestampCountForCard(cardId);
          if (remaining === 0) {
            await updateCardStatus(cardId, 'pending');
          }
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
        {
          text: 'OK', onPress: () => {
            const state = navigation.getState();
            const idx = state.routes.findIndex((r: any) => r.name === 'CardQueue');
            if (idx >= 0) {
              navigation.pop(state.routes.length - 1 - idx);
            } else {
              navigation.goBack();
            }
          }
        },
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
      <Pressable
        style={styles.trackHeader}
        onPress={() => Linking.openURL('spotify://')}
        accessibilityLabel="Open in Spotify"
        accessibilityRole="button"
      >
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
      </Pressable>

      {/* Card context */}
      <View style={styles.cardContext}>
        <Text style={styles.cardLabel}>Card:</Text>
        <Text style={styles.cardFront}>{cardFront}</Text>
        <Text style={styles.cardBack}>{cardBack}</Text>
      </View>

      {/* Actions */}
      <Pressable style={styles.openButton} onPress={handleOpenInSpotify} accessibilityLabel="Play in Spotify" accessibilityRole="button" testID="open-in-spotify">
        <Text style={styles.openButtonText}>Play in Spotify</Text>
      </Pressable>

      <View style={styles.captureRow}>
        <Pressable
          style={[styles.captureButton, { flex: 1 }]}
          onPress={handleAutoCapture}
          accessibilityLabel="Mark Timestamp"
          accessibilityRole="button"
          testID="mark-timestamp"
        >
          <Text style={styles.captureButtonText}>Mark Timestamp</Text>
        </Pressable>
        <Pressable
          style={styles.markZeroButton}
          onPress={handleMarkAtZero}
          accessibilityLabel="Mark at 0:00"
          accessibilityRole="button"
          testID="mark-at-zero"
        >
          <Text style={styles.markZeroButtonText}>Mark at 0:00</Text>
        </Pressable>
      </View>

      {autoStatus ? (
        <Text style={styles.statusText}>{autoStatus}</Text>
      ) : null}

      <Pressable
        style={styles.manualLink}
        onPress={() => setShowManual(true)}
        accessibilityLabel="Enter time manually"
        accessibilityRole="button"
        testID="enter-time-manually"
      >
        <Text style={styles.manualLinkText}>Enter time manually</Text>
      </Pressable>

      {searchField ? (
        <Pressable
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
          accessibilityLabel="Search for different track"
          accessibilityRole="button"
          testID="search-different-track"
        >
          <Text style={styles.manualLinkText}>Search for different track</Text>
        </Pressable>
      ) : null}

      {reviewMode && timestamps.length > 0 && (
        <Pressable style={styles.nextCardButton} onPress={handleNextCard} accessibilityLabel="Next Card" accessibilityRole="button" testID="next-card">
          <Text style={styles.nextCardButtonText}>Next Card</Text>
        </Pressable>
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
                <Pressable
                  onPress={() => copyTimestamp(item.progress_ms)}
                  accessibilityLabel="Copy"
                  accessibilityRole="button"
                  testID="copy-clip"
                >
                  <Text style={styles.tsActionText}>Copy</Text>
                </Pressable>
                <Pressable
                  onPress={() => handleJump(item.progress_ms)}
                  accessibilityLabel="Jump"
                  accessibilityRole="button"
                  testID="jump-clip"
                >
                  <Text style={styles.tsActionText}>Jump</Text>
                </Pressable>
                <Pressable onPress={() => handleDelete(item.id)} accessibilityLabel="Del" accessibilityRole="button" testID="delete-clip">
                  <Text style={[styles.tsActionText, { color: colors.danger }]}>
                    Del
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}
        </>
      )}

      <Text style={styles.attribution}>
        Content provided by Spotify. Tap "Play in Spotify" to listen.
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
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  cardBack: {
    color: colors.textPrimary,
    fontSize: 14,
    marginTop: 2,
  },
  openButton: {
    backgroundColor: colors.primary,
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
    color: colors.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  tsNote: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  tsMode: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  tsActions: {
    flexDirection: 'row',
    gap: 12,
  },
  tsActionText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  attribution: {
    color: colors.textMuted,
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
    backgroundColor: colors.primary,
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
