import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { insertDeck, insertCards, getAllDecks, deleteDeck } from '../db/database';
import { parseApkg, ApkgResult } from '../utils/parseApkg';
import { colors } from '../constants/colors';
import { ParsedCard, DeckRow } from '../types';

function parseCSV(text: string): ParsedCard[] {
  const lines = text.trim().split('\n');
  if (lines.length === 0) return [];

  // Filter out Anki metadata directives (lines starting with #)
  const dataLines = lines.filter((l) => !l.trimStart().startsWith('#'));
  if (dataLines.length === 0) return [];

  // Detect separator (tab or comma)
  const sep = dataLines[0].includes('\t') ? '\t' : ',';
  const cards: ParsedCard[] = [];

  // Check if first line is a header
  const firstLine = dataLines[0].toLowerCase();
  const startIdx =
    firstLine.includes('front') || firstLine.includes('back') ? 1 : 0;

  for (let i = startIdx; i < dataLines.length; i++) {
    const line = dataLines[i].trim();
    if (!line) continue;

    const parts = line.split(sep);
    cards.push({
      front: (parts[0] ?? '').trim().replace(/^"|"$/g, ''),
      back: (parts[1] ?? '').trim().replace(/^"|"$/g, ''),
      tags: (parts[2] ?? '').trim().replace(/^"|"$/g, ''),
    });
  }

  return cards;
}

export default function DeckImportScreen({ navigation }: any) {
  const [preview, setPreview] = useState<ParsedCard[]>([]);
  const [fileName, setFileName] = useState('');
  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [apkgResult, setApkgResult] = useState<ApkgResult | null>(null);
  const [selectedDeckIds, setSelectedDeckIds] = useState<number[]>([]);
  const [apkgDeckCards, setApkgDeckCards] = useState<
    Array<{ deckName: string; cards: { front: string; back: string; tags: string }[] }>
  >([]);

  useEffect(() => {
    loadDecks();
  }, []);

  const loadDecks = async () => {
    const d = await getAllDecks();
    setDecks(d as DeckRow[]);
  };

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const file = result.assets[0];
      setFileName(file.name);

      if (file.name.toLowerCase().endsWith('.apkg')) {
        setLoading(true);
        try {
          const parsed = await parseApkg(file.uri);
          if (parsed.decks.length === 0) {
            Alert.alert('No cards found', 'No cards found in the selected decks.');
            return;
          }
          setApkgResult(parsed);
          setSelectedDeckIds(parsed.decks.map((d) => d.id));
        } catch (err: any) {
          Alert.alert('Import Error', err?.message || "Could not read this file. Make sure it's a valid .apkg export from Anki.");
        } finally {
          setLoading(false);
        }
      } else {
        const fsFile = new File(file.uri);
        const content = await fsFile.text();
        const cards = parseCSV(content);
        setPreview(cards);
      }
    } catch {
      Alert.alert('Error', 'Failed to read file');
    }
  };

  const toggleSelectDeck = (id: number) => {
    setSelectedDeckIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const confirmDeckSelection = () => {
    if (!apkgResult) return;
    if (selectedDeckIds.length === 0) {
      Alert.alert('Select at least one deck');
      return;
    }
    const selectedDecks = apkgResult.decks.filter((d) =>
      selectedDeckIds.includes(d.id)
    );
    const deckCards = selectedDecks.map((d) => ({
      deckName: d.name,
      cards: apkgResult.notesByDeck[d.id] ?? [],
    }));
    const allCards = deckCards.flatMap((d) => d.cards);
    if (allCards.length === 0) {
      Alert.alert('No cards found', 'No cards found in the selected decks.');
      return;
    }
    setApkgDeckCards(deckCards);
    setPreview(allCards);
    setApkgResult(null);
  };

  const confirmImport = async () => {
    if (preview.length === 0) return;
    setLoading(true);
    try {
      if (apkgDeckCards.length > 0) {
        // APKG import: one deck per Anki deck
        let totalCards = 0;
        for (const { deckName, cards } of apkgDeckCards) {
          const deckId = await insertDeck(deckName);
          await insertCards(deckId, cards);
          totalCards += cards.length;
        }
        const deckWord = apkgDeckCards.length === 1 ? 'deck' : 'decks';
        Alert.alert(
          'Success',
          `Imported ${totalCards} cards across ${apkgDeckCards.length} ${deckWord}`
        );
      } else {
        // CSV import: existing behavior
        const deckName =
          fileName.replace(/\.(csv|txt)$/i, '') || 'Imported Deck';
        const deckId = await insertDeck(deckName);
        await insertCards(deckId, preview);
        Alert.alert('Success', `Imported ${preview.length} cards into "${deckName}"`);
      }
      setPreview([]);
      setFileName('');
      setApkgDeckCards([]);
      await loadDecks();
    } catch {
      Alert.alert('Error', 'Failed to import deck');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDeck = (deckId: number, name: string) => {
    Alert.alert('Delete Deck', `Delete "${name}" and all its cards?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteDeck(deckId);
          await loadDecks();
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Anki2Spotify</Text>

      {preview.length === 0 && !apkgResult ? (
        <>
          <TouchableOpacity style={styles.importButton} onPress={pickFile}>
            <Text style={styles.importButtonText}>Import Deck</Text>
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>Your Decks</Text>
          {decks.length === 0 ? (
            <Text style={styles.emptyText}>
              No decks yet. Import a file to get started.
            </Text>
          ) : (
            <FlatList
              data={decks}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.deckCard}
                  onPress={() =>
                    navigation.navigate('CardQueue', {
                      deckId: item.id,
                      deckName: item.name,
                      searchField: item.search_field ?? 'back',
                    })
                  }
                  onLongPress={() => handleDeleteDeck(item.id, item.name)}
                >
                  <Text style={styles.deckName}>{item.name}</Text>
                  <Text style={styles.deckInfo}>
                    {item.card_count} cards
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}
        </>
      ) : apkgResult ? (
        <>
          <Text style={styles.sectionTitle}>
            Select Decks to Import
          </Text>
          <FlatList
            data={apkgResult.decks}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.deckSelectRow}
                onPress={() => toggleSelectDeck(item.id)}
              >
                <View
                  style={[
                    styles.checkbox,
                    selectedDeckIds.includes(item.id) && styles.checkboxSelected,
                  ]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.deckName}>{item.name}</Text>
                  <Text style={styles.deckInfo}>{item.noteCount} cards</Text>
                </View>
              </TouchableOpacity>
            )}
          />
          <View style={styles.previewActions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setApkgResult(null);
                setSelectedDeckIds([]);
                setFileName('');
              }}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmButton}
              onPress={confirmDeckSelection}
            >
              <Text style={styles.confirmText}>
                Import {selectedDeckIds.length} deck{selectedDeckIds.length !== 1 ? 's' : ''}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.sectionTitle}>
            Preview: {fileName} ({preview.length} cards)
          </Text>
          <FlatList
            data={preview.slice(0, 20)}
            keyExtractor={(_, i) => i.toString()}
            renderItem={({ item }) => (
              <View style={styles.previewCard}>
                <Text style={styles.previewFront}>{item.front}</Text>
                <Text style={styles.previewBack}>{item.back}</Text>
                {item.tags ? (
                  <Text style={styles.previewTags}>{item.tags}</Text>
                ) : null}
              </View>
            )}
            ListFooterComponent={
              preview.length > 20 ? (
                <Text style={styles.moreText}>
                  ...and {preview.length - 20} more cards
                </Text>
              ) : null
            }
          />
          <View style={styles.previewActions}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setPreview([]);
                setFileName('');
                setApkgDeckCards([]);
              }}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, loading && styles.disabled]}
              onPress={confirmImport}
              disabled={loading}
            >
              <Text style={styles.confirmText}>
                {loading ? 'Importing...' : 'Confirm Import'}
              </Text>
            </TouchableOpacity>
          </View>
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
  header: {
    color: colors.spotifyGreen,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 24,
    marginTop: 8,
  },
  importButton: {
    backgroundColor: colors.spotifyGreen,
    padding: 16,
    borderRadius: 30,
    alignItems: 'center',
    marginBottom: 24,
  },
  importButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 40,
  },
  deckCard: {
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 10,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deckName: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  deckInfo: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  previewCard: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 8,
    marginBottom: 6,
  },
  previewFront: {
    color: colors.spotifyGreen,
    fontSize: 14,
    fontWeight: '600',
  },
  previewBack: {
    color: colors.textPrimary,
    fontSize: 14,
    marginTop: 4,
  },
  previewTags: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  moreText: {
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 8,
  },
  previewActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    paddingBottom: 20,
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 30,
    backgroundColor: colors.buttonSecondary,
    alignItems: 'center',
  },
  cancelText: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    padding: 14,
    borderRadius: 30,
    backgroundColor: colors.spotifyGreen,
    alignItems: 'center',
  },
  confirmText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.5,
  },
  deckSelectRow: {
    backgroundColor: colors.surface,
    padding: 14,
    borderRadius: 10,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: colors.buttonSecondary,
    backgroundColor: 'transparent',
  },
  checkboxSelected: {
    backgroundColor: colors.spotifyGreen,
    borderColor: colors.spotifyGreen,
  },
});
