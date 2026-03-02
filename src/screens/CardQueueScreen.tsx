import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getCardsByDeck, updateDeckSearchField, getTrackForCard, getNextPendingCard } from '../db/database';

interface CardRow {
  id: number;
  front: string;
  back: string;
  tags: string;
  status: string;
}

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
      return text.trim().split(/\s+/).length >= 3;
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
        return '#1DB954';
      case 'skipped':
        return '#727272';
      default:
        return '#b3b3b3';
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
          <TouchableOpacity
            key={f.label}
            style={[
              styles.filterPill,
              filter === f.value && styles.filterPillActive,
            ]}
            onPress={() => setFilter(f.value)}
          >
            <Text
              style={[
                styles.filterPillText,
                filter === f.value && styles.filterPillTextActive,
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.searchFieldRow}>
        <Text style={styles.searchFieldLabel}>Search by:</Text>
        <TouchableOpacity
          style={[
            styles.filterPill,
            searchField === 'front' && styles.filterPillActive,
          ]}
          onPress={toggleSearchField}
        >
          <Text
            style={[
              styles.filterPillText,
              searchField === 'front' && styles.filterPillTextActive,
            ]}
          >
            Front
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterPill,
            searchField === 'back' && styles.filterPillActive,
          ]}
          onPress={toggleSearchField}
        >
          <Text
            style={[
              styles.filterPillText,
              searchField === 'back' && styles.filterPillTextActive,
            ]}
          >
            Back
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterPill,
            lyricsOnly && styles.filterPillActive,
          ]}
          onPress={() => setLyricsOnly(!lyricsOnly)}
        >
          <Text
            style={[
              styles.filterPillText,
              lyricsOnly && styles.filterPillTextActive,
            ]}
          >
            Lyrics
          </Text>
        </TouchableOpacity>
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

      {/* Confirmation modal */}
      <Modal visible={showPlaylistModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Playlist</Text>
            <Text style={styles.modalBody}>
              Create a Spotify playlist from {displayedCards.length} card
              {displayedCards.length !== 1 ? 's' : ''}?
            </Text>
            <Text style={styles.modalHint}>
              Adjust your filters to change which songs are included.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowPlaylistModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirm}
                onPress={handleConfirmPlaylist}
              >
                <Text style={styles.modalConfirmText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Playlist name modal */}
      <Modal visible={showNameModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Playlist Name</Text>
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
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setShowNameModal(false)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirm}
                onPress={handleSubmitPlaylistName}
              >
                <Text style={styles.modalConfirmText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    flex: 1,
  },
  exportButton: {
    backgroundColor: '#535353',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  exportText: {
    color: '#fff',
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
    color: '#b3b3b3',
    fontSize: 13,
    fontWeight: '600',
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#2a2a2a',
  },
  filterPillActive: {
    backgroundColor: '#1DB954',
  },
  filterPillText: {
    color: '#b3b3b3',
    fontSize: 13,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: '#fff',
  },
  emptyText: {
    color: '#727272',
    textAlign: 'center',
    marginTop: 40,
  },
  cardItem: {
    backgroundColor: '#1e1e1e',
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
    color: '#1DB954',
    fontSize: 15,
    fontWeight: '600',
  },
  cardBack: {
    color: '#b3b3b3',
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
    backgroundColor: '#1DB954',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  playlistButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  matchButton: {
    backgroundColor: '#e74c3c',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  matchButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#282828',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  modalBody: {
    color: '#b3b3b3',
    fontSize: 15,
    marginBottom: 8,
  },
  modalHint: {
    color: '#727272',
    fontSize: 13,
    marginBottom: 20,
    fontStyle: 'italic',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancel: {
    flex: 1,
    padding: 12,
    borderRadius: 24,
    backgroundColor: '#535353',
    alignItems: 'center',
  },
  modalCancelText: {
    color: '#fff',
    fontWeight: '600',
  },
  modalConfirm: {
    flex: 1,
    padding: 12,
    borderRadius: 24,
    backgroundColor: '#1DB954',
    alignItems: 'center',
  },
  modalConfirmText: {
    color: '#fff',
    fontWeight: '700',
  },
  nameInput: {
    backgroundColor: '#1e1e1e',
    color: '#fff',
    fontSize: 16,
    padding: 14,
    borderRadius: 8,
    marginBottom: 20,
  },
});
