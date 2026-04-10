import React, { useState, useEffect, useLayoutEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import { useSpotify } from '../hooks/useSpotify';
import TrackCard from '../components/TrackCard';
import { SpotifyTrack } from '../types';
import { getTracksWithClipsForCard, updateCardStatus, getNextPendingCard, getPendingCardCount, upsertManualEntry } from '../db/database';
import { colors } from '../constants/colors';
import ManualEntryForm from '../components/ManualEntryForm';

interface Props {
  route: any;
  navigation: any;
  accessToken: string | null;
}

export default function SongCandidatesScreen({
  route,
  navigation,
  accessToken,
}: Props) {
  const { cardId, cardFront, cardBack, searchField, reviewMode, deckId, lyricsOnly } = route.params;
  const { searchTracks, getTracksByIds } = useSpotify(accessToken);
  const initialQuery = searchField === 'front' ? cardFront : cardBack;
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SpotifyTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [tracksWithClips, setTracksWithClips] = useState<Map<string, number>>(new Map());
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [manualMode, setManualMode] = useState(!accessToken);

  useEffect(() => {
    if (reviewMode && deckId != null) {
      getPendingCardCount(deckId, searchField ?? 'back', !!lyricsOnly).then(setPendingCount);
    }
  }, [cardId]);

  useEffect(() => {
    const init = async () => {
      const rows = await getTracksWithClipsForCard(cardId);
      const map = new Map<string, number>();
      for (const row of rows) {
        map.set(row.track_id, row.clip_count);
      }
      setTracksWithClips(map);
      if (accessToken && initialQuery) {
        await doSearch(initialQuery, map);
      }
    };
    init();
  }, [accessToken, cardId]);

  useEffect(() => {
    if (!accessToken) {
      setManualMode(true);
    }
  }, [accessToken]);

  useLayoutEffect(() => {
    if (manualMode && accessToken) {
      navigation.setOptions({
        headerRight: () => (
          <Pressable
            onPress={() => setManualMode(false)}
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
  }, [manualMode, accessToken, navigation]);

  const reviewParams = reviewMode
    ? { reviewMode: true, deckId, lyricsOnly }
    : {};

  const advanceToNext = async () => {
    const next = await getNextPendingCard(deckId, cardId, searchField ?? 'back', !!lyricsOnly);
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
    navigation.replace('SongCandidates', {
      cardId: next.id,
      cardFront: next.front,
      cardBack: next.back,
      searchField,
      ...reviewParams,
    });
  };

  const handleSkip = async () => {
    await updateCardStatus(cardId, 'skipped');
    await advanceToNext();
  };

  const doSearch = async (q: string, clipsMap?: Map<string, number>) => {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    const tracks = await searchTracks(q.trim());

    // Fetch previously-saved tracks that aren't in search results
    const savedTrackIds = Array.from((clipsMap ?? tracksWithClips).keys());
    const missingIds = savedTrackIds.filter(
      (id) => !tracks.some((t) => t.id === id)
    );
    if (missingIds.length > 0) {
      const savedTracks = await getTracksByIds(missingIds);
      tracks.unshift(...savedTracks);
    }

    setResults(tracks);
    setLoading(false);

    // Auto-skip when no results in review mode
    if (reviewMode && tracks.length === 0) {
      await updateCardStatus(cardId, 'skipped');
      await advanceToNext();
    }
  };

  const handleSelect = (track: SpotifyTrack) => {
    navigation.navigate('Capture', {
      cardId,
      cardFront,
      cardBack,
      searchField,
      ...reviewParams,
      track: {
        id: track.id,
        name: track.name,
        artists: track.artists.map((a) => a.name).join(', '),
        albumArt:
          track.album.images[1]?.url ?? track.album.images[0]?.url ?? '',
        spotifyUrl: track.external_urls.spotify,
        spotifyUri: track.uri,
        durationMs: track.duration_ms,
      },
    });
  };

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
          onSave={async (data) => {
            await upsertManualEntry({
              cardId,
              title: data.title,
              url: data.url,
              notes: data.notes,
            });
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
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
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
  searchRow: {
    marginBottom: 12,
  },
  searchInput: {
    backgroundColor: colors.surfaceLight,
    color: colors.textPrimary,
    fontSize: 16,
    padding: 12,
    borderRadius: 8,
  },
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
  headerBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerBtnText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  noResults: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 40,
  },
  progressText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
  },
  skipButton: {
    backgroundColor: colors.buttonSecondary,
    padding: 12,
    borderRadius: 24,
    alignItems: 'center',
    marginBottom: 12,
  },
  skipButtonText: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 14,
  },
});
