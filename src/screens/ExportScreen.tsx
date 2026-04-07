import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  Alert,
} from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getTimestampsByDeck, getManualEntriesByDeck } from '../db/database';
import { colors } from '../constants/colors';
import { formatMs } from '../utils/formatMs';
import { ExportRow, ManualEntryWithCard } from '../types';

type ExportItem =
  | { kind: 'spotify'; row: ExportRow & { card_id?: number } }
  | { kind: 'manual'; row: ManualEntryWithCard };

export default function ExportScreen({ route }: any) {
  const { deckId, deckName } = route.params;
  const [items, setItems] = useState<ExportItem[]>([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [timestamps, manualEntries] = await Promise.all([
      getTimestampsByDeck(deckId),
      getManualEntriesByDeck(deckId),
    ]);
    const merged: ExportItem[] = [
      ...(timestamps as (ExportRow & { card_id: number })[]).map(
        (t) => ({ kind: 'spotify' as const, row: t })
      ),
      ...manualEntries.map((m) => ({ kind: 'manual' as const, row: m })),
    ];
    merged.sort((a, b) => {
      const aId = a.kind === 'spotify' ? (a.row.card_id ?? 0) : a.row.card_id;
      const bId = b.kind === 'spotify' ? (b.row.card_id ?? 0) : b.row.card_id;
      return aId - bId;
    });
    setItems(merged);
  };

  const exportCSV = async () => {
    if (items.length === 0) {
      Alert.alert('Nothing to export', 'No saved songs yet.');
      return;
    }

    setExporting(true);
    try {
      const header =
        'Front,Back,Source,Track,Artist,Timestamp,Note,Mode,Spotify URL,Captured At,Manual Title,Manual Link,Manual Notes';
      const escape = (s: string) =>
        `"${(s ?? '').replace(/"/g, '""')}"`;

      const csvRows = items.map((item) => {
        if (item.kind === 'spotify') {
          const r = item.row;
          return [
            escape(r.front),
            escape(r.back),
            'spotify',
            escape(r.track_name),
            escape(r.artist_name),
            formatMs(r.progress_ms),
            escape(r.note),
            r.capture_mode,
            r.spotify_url,
            r.captured_at,
            '',
            '',
            '',
          ].join(',');
        } else {
          const r = item.row;
          return [
            escape(r.front),
            escape(r.back),
            'manual',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            escape(r.title),
            escape(r.url),
            escape(r.notes),
          ].join(',');
        }
      });

      const csv = [header, ...csvRows].join('\n');
      const safeName = deckName.replace(/[^a-zA-Z0-9]/g, '_');
      const file = new File(Paths.cache, `${safeName}_export.csv`);
      file.write(csv);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'text/csv',
          dialogTitle: 'Export LyriDeck Data',
        });
      } else {
        Alert.alert('Exported', `File saved to:\n${file.uri}`);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to export CSV');
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Export: {deckName}</Text>
      <Text style={styles.subtitle}>
        {items.length} entr{items.length !== 1 ? 'ies' : 'y'} to export
      </Text>

      <Pressable
        style={[styles.exportButton, exporting && styles.disabled]}
        onPress={exportCSV}
        disabled={exporting}
        accessibilityLabel="Export CSV"
        accessibilityRole="button"
        testID="export-csv"
      >
        <Text style={styles.exportButtonText}>
          {exporting ? 'Exporting...' : 'Export CSV'}
        </Text>
      </Pressable>

      {items.length > 0 && (
        <FlatList
          data={items}
          keyExtractor={(_, i) => i.toString()}
          style={{ marginTop: 16 }}
          renderItem={({ item }) => {
            if (item.kind === 'spotify') {
              const r = item.row;
              return (
                <View style={styles.row}>
                  <Text style={styles.rowFront}>{r.front}</Text>
                  <Text style={styles.rowTrack}>
                    {r.track_name} - {r.artist_name}
                  </Text>
                  <Text style={styles.rowTime}>
                    {formatMs(r.progress_ms)}
                    {r.note ? ` (${r.note})` : ''}
                  </Text>
                </View>
              );
            }
            const r = item.row;
            const display = r.title || r.url || '(no title)';
            return (
              <View style={styles.row}>
                <Text style={styles.rowFront}>{r.front}</Text>
                <Text style={styles.rowTrack}>{display}</Text>
                {r.notes ? (
                  <Text style={styles.rowTime}>{r.notes}</Text>
                ) : null}
              </View>
            );
          }}
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
  title: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 14,
    marginBottom: 20,
  },
  exportButton: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 30,
    alignItems: 'center',
  },
  exportButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.5,
  },
  row: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 8,
    marginBottom: 6,
  },
  rowFront: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  rowTrack: {
    color: colors.textPrimary,
    fontSize: 13,
    marginTop: 4,
  },
  rowTime: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
});
