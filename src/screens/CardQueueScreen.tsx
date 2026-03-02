import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getCardsByDeck, updateDeckSearchField, getTrackForCard, getNextPendingCard } from '../db/database';
import { colors } from '../constants/colors';
import FilterPill from '../components/FilterPill';
import ConfirmationModal from '../components/ConfirmationModal';
import { isLyrics } from '../utils/isLyrics';
import { CardRow } from '../types';

export default function CardQueueScreen({ route, navigation }: any) {
  const { deckId, deckName, searchField: initialSearchField } = route.params;
  const [cards, setCards] = useState<CardRow[]>([]);
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [searchField, setSearchField] = useState<'front' | 'back'>(
    initialSearchField ?? 'back'
  );

  const [lyricsOnly, setLyricsOnly] = useState(false);

  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [playlistName, setPlaylistName] = useState(deckName);

  const toggleSearchField = async () => {
    const next = searchField === 'back' ? 'front' : 'back';
    setSearchField(next);
    await updateDeckSearchField(deckId, next);
  };

  const displayedCards = lyricsOnly
    ? cards.filter((c) => {
      const text = searchField === 'front' ? c.front : c.back;
      return isLyrics(text);
    })
    : cards;

  const handleCreatePlaylist = () => {
    if (displayedCards.length === 0) {
      Alert.alert('No cards', 'There are no cards with the current filters.');
      return;
    }
    setShowPlaylistModal(true);
  };

  const handleConfirmPlaylist = () => {
    setShowPlaylistModal(false);
    setPlaylistName(deckName);
    setShowNameModal(true);
  };

  const handleSubmitPlaylistName = () => {
    if (!playlistName.trim()) return;
    setShowNameModal(false);
    const cardParams = displayedCards.map((c) => ({
      id: c.id,
      front: c.front,
      back: c.back,
      status: c.status,
      searchText: searchField === 'front' ? c.front : c.back,
    }));
    navigation.navigate('PlaylistProgress', {
      playlistName: playlistName.trim(),
      cards: cardParams,
    });
  };

  const handleStartMatchCards = async () => {
    const first = await getNextPendingCard(deckId, null, searchField, lyricsOnly);
    if (!first) {
      Alert.alert('No pending cards', 'All cards matching current filters have been processed.');
      return;
    }
    navigation.navigate('SongCandidates', {
      cardId: first.id,
      cardFront: first.front,
      cardBack: first.back,
      searchField,
      reviewMode: true,
      deckId,
      lyricsOnly,
    });
  };

  useFocusEffect(
    useCallback(() => {
      loadCards();
    }, [filter])
  );

  const loadCards = async () => {
    const c = await getCardsByDeck(deckId, filter);
    setCards(c as CardRow[]);
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'matched':
        return colors.spotifyGreen;
      case 'skipped':
        return colors.textMuted;
      default:
        return colors.textSecondary;
    }
  };

  const filters = [
    { label: 'All', value: undefined },
    { label: 'Pending', value: 'pending' },
    { label: 'Matched', value: 'matched' },
    { label: 'Skipped', value: 'skipped' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{deckName}</Text>
        <TouchableOpacity
          style={styles.playlistButton}
          onPress={handleCreatePlaylist}
        >
          <Text style={styles.playlistButtonText}>Playlist</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.matchButton}
          onPress={handleStartMatchCards}
        >
          <Text style={styles.matchButtonText}>Match Cards</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.exportButton}
          onPress={() =>
            navigation.navigate('Export', { deckId, deckName })
          }
        >
          <Text style={styles.exportText}>Export</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        {filters.map((f) => (
          <FilterPill
            key={f.label}
            label={f.label}
            active={filter === f.value}
            onPress={() => setFilter(f.value)}
          />
        ))}
      </View>

      <View style={styles.searchFieldRow}>
        <Text style={styles.searchFieldLabel}>Search by:</Text>
        <FilterPill label="Front" active={searchField === 'front'} onPress={toggleSearchField} />
        <FilterPill label="Back" active={searchField === 'back'} onPress={toggleSearchField} />
        <FilterPill label="Lyrics" active={lyricsOnly} onPress={() => setLyricsOnly(!lyricsOnly)} />
      </View>

      {displayedCards.length === 0 ? (
        <Text style={styles.emptyText}>No cards to show.</Text>
      ) : (
        <FlatList
          data={displayedCards}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.cardItem}
              onPress={async () => {
                if (item.status === 'matched') {
                  const row = await getTrackForCard(item.id);
                  if (row) {
                    navigation.navigate('Capture', {
                      cardId: item.id,
                      cardFront: item.front,
                      cardBack: item.back,
                      searchField,
                      track: {
                        id: row.track_id,
                        name: row.track_name,
                        artists: row.artist_name,
                        albumArt: row.album_art,
                        spotifyUrl: row.spotify_url,
                        spotifyUri: row.spotify_uri,
                        durationMs: 0,
                      },
                    });
                    return;
                  }
                }
                navigation.navigate('SongCandidates', {
                  cardId: item.id,
                  cardFront: item.front,
                  cardBack: item.back,
                  searchField,
                });
              }}
            >
              <View style={styles.cardContent}>
                <Text style={styles.cardFront} numberOfLines={1}>
                  {item.front}
                </Text>
                <Text style={styles.cardBack} numberOfLines={1}>
                  {item.back}
                </Text>
              </View>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: statusColor(item.status) },
                ]}
              />
            </TouchableOpacity>
          )}
        />
      )}

      <ConfirmationModal
        visible={showPlaylistModal}
        title="Create Playlist"
        onCancel={() => setShowPlaylistModal(false)}
        onConfirm={handleConfirmPlaylist}
        confirmLabel="Continue"
      >
        <Text style={styles.modalBody}>
          Create a Spotify playlist from {displayedCards.length} card
          {displayedCards.length !== 1 ? 's' : ''}?
        </Text>
        <Text style={styles.modalHint}>
          Adjust your filters to change which songs are included.
        </Text>
      </ConfirmationModal>

      <ConfirmationModal
        visible={showNameModal}
        title="Playlist Name"
        onCancel={() => setShowNameModal(false)}
        onConfirm={handleSubmitPlaylistName}
        confirmLabel="Create"
      >
        <TextInput
          style={styles.nameInput}
          value={playlistName}
          onChangeText={setPlaylistName}
          placeholder="Enter playlist name"
          placeholderTextColor="#666"
          autoFocus
          onSubmitEditing={handleSubmitPlaylistName}
          returnKeyType="done"
        />
      </ConfirmationModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    flex: 1,
  },
  exportButton: {
    backgroundColor: colors.buttonSecondary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  exportText: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 13,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  searchFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  searchFieldLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  emptyText: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 40,
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
    color: colors.spotifyGreen,
    fontSize: 15,
    fontWeight: '600',
  },
  cardBack: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 2,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: 10,
  },
  playlistButton: {
    backgroundColor: colors.spotifyGreen,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  playlistButtonText: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 13,
  },
  matchButton: {
    backgroundColor: colors.danger,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  matchButtonText: {
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 13,
  },
  modalBody: {
    color: colors.textSecondary,
    fontSize: 15,
    marginBottom: 8,
  },
  modalHint: {
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: 20,
    fontStyle: 'italic',
  },
  nameInput: {
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontSize: 16,
    padding: 14,
    borderRadius: 8,
    marginBottom: 20,
  },
});
