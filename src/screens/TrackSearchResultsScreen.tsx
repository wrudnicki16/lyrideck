import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  Image,
  StyleSheet,
  ActivityIndicator,
  Linking,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSpotify } from '../hooks/useSpotify';
import { getCardsByTrackId, searchCardsByText } from '../db/database';
import { colors } from '../constants/colors';
import { CardWithDeck, SpotifyTrack, TrackParam } from '../types';

interface Props {
  route: any;
  navigation: any;
  accessToken: string | null;
}

export default function TrackSearchResultsScreen({
  route,
  navigation,
  accessToken,
}: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const albumSize = Math.round(screenWidth * 2 / 3);
  const { deckId } = (route.params ?? {}) as { deckId?: number };
  const { getPlaybackState, skipToNext, skipToPrevious, pausePlayback, resumePlayback } = useSpotify(accessToken);

  const [loading, setLoading] = useState(true);
  const [currentTrack, setCurrentTrack] = useState<SpotifyTrack | null>(null);
  const [results, setResults] = useState<CardWithDeck[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFallback, setShowFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasContext, setHasContext] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [controlsDisabled, setControlsDisabled] = useState(false);
  const trackIdRef = useRef<string | null>(null);

  useEffect(() => {
    fetchCurrentTrack();
  }, []);

  // Poll for track changes every 5 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      const state = await getPlaybackState();
      if (!state?.item) return; // Ignore null responses (paused/inactive) — keep showing last track
      const newTrackId = state.item.id;
      setHasContext(state.context != null);
      setIsPlaying(state.is_playing);
      if (newTrackId !== trackIdRef.current) {
        setCurrentTrack(state.item);
        setError(null);
        trackIdRef.current = newTrackId;
        await searchByTrackId(state.item);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [deckId]);

  const fetchCurrentTrack = async () => {
    setLoading(true);
    setError(null);
    const state = await getPlaybackState();
    if (!state?.item) {
      setCurrentTrack(null);
      setLoading(false);
      setError('No track currently playing');
      return;
    }
    setCurrentTrack(state.item);
    trackIdRef.current = state.item.id;
    setHasContext(state.context != null);
    setIsPlaying(state.is_playing);
    await searchByTrackId(state.item);
  };

  const searchByTrackId = async (track: SpotifyTrack) => {
    const matches = await getCardsByTrackId(track.id);
    if (matches.length > 0) {
      setResults(sortResults(matches));
      setShowFallback(false);
    } else {
      const trackName = track.name;
      setSearchQuery(trackName);
      setShowFallback(true);
      await runTextSearch(trackName);
    }
    setLoading(false);
  };

  const runTextSearch = async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const matches = await searchCardsByText(query.trim());
    setResults(sortResults(matches));
  };

  const sortResults = (cards: CardWithDeck[]): CardWithDeck[] => {
    if (deckId == null) return cards;
    return [...cards].sort((a, b) => {
      if (a.deck_id === deckId && b.deck_id !== deckId) return -1;
      if (b.deck_id === deckId && a.deck_id !== deckId) return 1;
      return 0;
    });
  };

  const handlePlayPause = async () => {
    if (controlsDisabled) return;
    const success = isPlaying ? await pausePlayback() : await resumePlayback();
    if (success) {
      setIsPlaying(!isPlaying);
    } else {
      setControlsDisabled(true);
    }
  };

  const handleSkip = async (direction: 'next' | 'previous') => {
    if (controlsDisabled) return;
    const success = direction === 'next' ? await skipToNext() : await skipToPrevious();
    if (!success) {
      setControlsDisabled(true);
      return;
    }
    // Wait briefly for Spotify to update, then fetch the new track
    setTimeout(async () => {
      const state = await getPlaybackState();
      if (state?.item && state.item.id !== trackIdRef.current) {
        setCurrentTrack(state.item);
        trackIdRef.current = state.item.id;
        setError(null);
        await searchByTrackId(state.item);
      }
    }, 500);
  };

  const handleSubmitSearch = () => {
    runTextSearch(searchQuery);
  };

  const buildTrackParam = (track: SpotifyTrack): TrackParam => ({
    id: track.id,
    name: track.name,
    artists: track.artists.map((a) => a.name).join(', '),
    albumArt: track.album.images?.[0]?.url ?? '',
    spotifyUrl: track.external_urls.spotify,
    spotifyUri: track.uri,
    durationMs: track.duration_ms,
  });

  const handleSelectCard = (card: CardWithDeck) => {
    if (!currentTrack) return;
    navigation.navigate('Capture', {
      cardId: card.card_id,
      cardFront: card.front,
      cardBack: card.back,
      track: buildTrackParam(currentTrack),
    });
  };

  const artistText = currentTrack
    ? currentTrack.artists.map((a) => a.name).join(', ')
    : '';
  const albumArt = currentTrack?.album.images?.[0]?.url ?? '';

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Checking playback...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable
          style={styles.retryButton}
          onPress={fetchCurrentTrack}
          accessibilityLabel="Retry"
          accessibilityRole="button"
          testID="retry-btn"
        >
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Current track info */}
      <Pressable
        style={styles.trackHeader}
        onPress={() => Linking.openURL('spotify://')}
        accessibilityLabel="Open in Spotify"
        accessibilityRole="button"
        testID="open-track-in-spotify"
      >
        {albumArt ? (
          <Image source={{ uri: albumArt }} style={[styles.albumArt, { width: albumSize, height: albumSize }]} />
        ) : null}
        <Text style={styles.trackName} numberOfLines={2}>
          {currentTrack?.name}
        </Text>
        <Text style={styles.artistName}>{artistText}</Text>
      </Pressable>

      {/* Playback controls */}
      <View style={[styles.controlsRow, { width: albumSize }]}>
        <Pressable
          style={styles.skipButton}
          onPress={hasContext && !controlsDisabled ? () => handleSkip('previous') : undefined}
          disabled={!hasContext || controlsDisabled}
          accessibilityLabel="Previous track"
          accessibilityRole="button"
          testID="previous-track"
        >
          <Ionicons name="play-skip-back" size={24} color={hasContext && !controlsDisabled ? colors.textPrimary : colors.textMuted} />
        </Pressable>
        <Pressable
          style={[styles.playPauseButton, controlsDisabled && { opacity: 0.4 }]}
          onPress={controlsDisabled ? undefined : handlePlayPause}
          disabled={controlsDisabled}
          accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
          accessibilityRole="button"
          testID="play-pause"
        >
          <Ionicons name={isPlaying ? 'pause' : 'play'} size={32} color={controlsDisabled ? colors.textMuted : colors.textPrimary} />
        </Pressable>
        <Pressable
          style={styles.skipButton}
          onPress={hasContext && !controlsDisabled ? () => handleSkip('next') : undefined}
          disabled={!hasContext || controlsDisabled}
          accessibilityLabel="Next track"
          accessibilityRole="button"
          testID="next-track"
        >
          <Ionicons name="play-skip-forward" size={24} color={hasContext && !controlsDisabled ? colors.textPrimary : colors.textMuted} />
        </Pressable>
      </View>
      {controlsDisabled && (
        <Text style={styles.premiumHint}>Playback controls require Spotify Premium</Text>
      )}

      {/* Fallback search input */}
      {showFallback && (
        <>
          <Text style={styles.fallbackMessage}>
            No saved matches for this track
          </Text>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSubmitSearch}
            placeholder="Search cards..."
            placeholderTextColor={colors.textMuted}
            returnKeyType="search"
            autoCorrect={false}
            testID="search-input"
          />
        </>
      )}

      {/* Results */}
      {results.length === 0 ? (
        <Text style={styles.noResults}>No matching cards found</Text>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.card_id.toString()}
          renderItem={({ item }) => (
            <Pressable
              style={styles.cardItem}
              onPress={() => handleSelectCard(item)}
              accessibilityRole="button"
              testID="result-card"
            >
              <View style={styles.cardContent}>
                <Text style={styles.cardFront} numberOfLines={1}>
                  {item.front}
                </Text>
                <Text style={styles.cardBack} numberOfLines={1}>
                  {item.back}
                </Text>
                <Text style={styles.deckLabel}>{item.deck_name}</Text>
              </View>
              {item.clip_count > 0 && (
                <View style={styles.clipBadge}>
                  <Text style={styles.clipBadgeText}>
                    {item.clip_count} clip{item.clip_count !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}
            </Pressable>
          )}
        />
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
  centered: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 12,
  },
  errorText: {
    color: colors.textSecondary,
    fontSize: 16,
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  retryButtonText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  trackHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  albumArt: {
    borderRadius: 8,
    marginBottom: 12,
  },
  trackName: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  artistName: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  skipButton: {
    padding: 8,
  },
  playPauseButton: {
    padding: 12,
    backgroundColor: colors.surface,
    borderRadius: 28,
  },
  premiumHint: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 12,
  },
  fallbackMessage: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 8,
  },
  searchInput: {
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontSize: 16,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  noResults: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
  },
  cardItem: {
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 10,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
  },
  cardFront: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  cardBack: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 2,
  },
  deckLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  clipBadge: {
    backgroundColor: colors.primaryTransparent,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 8,
  },
  clipBadgeText: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '600',
  },
});
