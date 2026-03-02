import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
} from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getTimestampsByDeck } from '../db/database';
import { colors } from '../constants/colors';
import { formatMs } from '../utils/formatMs';
import { ExportRow } from '../types';

export default function ExportScreen({ route }: any) {
  const { deckId, deckName } = route.params;
  const [rows, setRows] = useState<ExportRow[]>([]);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const data = await getTimestampsByDeck(deckId);
    setRows(data as ExportRow[]);
  };

  const exportCSV = async () => {
    if (rows.length === 0) {
      Alert.alert('Nothing to export', 'No timestamps saved yet.');
      return;
    }

    setExporting(true);
    try {
      const header =
        'Front,Back,Track,Artist,Timestamp,Note,Mode,Spotify URL,Captured At';
      const csvRows = rows.map((r) => {
        const escape = (s: string) =>
          `"${(s ?? '').replace(/"/g, '""')}"`;
        return [
          escape(r.front),
          escape(r.back),
          escape(r.track_name),
          escape(r.artist_name),
          formatMs(r.progress_ms),
          escape(r.note),
          r.capture_mode,
          r.spotify_url,
          r.captured_at,
        ].join(',');
      });

      const csv = [header, ...csvRows].join('\n');
      const safeName = deckName.replace(/[^a-zA-Z0-9]/g, '_');
      const file = new File(Paths.cache, `${safeName}_export.csv`);
      file.write(csv);

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'text/csv',
          dialogTitle: 'Export Anki2Spotify Data',
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
        {rows.length} timestamp{rows.length !== 1 ? 's' : ''} to export
      </Text>

      <TouchableOpacity
        style={[styles.exportButton, exporting && styles.disabled]}
        onPress={exportCSV}
        disabled={exporting}
      >
        <Text style={styles.exportButtonText}>
          {exporting ? 'Exporting...' : 'Export CSV'}
        </Text>
      </TouchableOpacity>

      {rows.length > 0 && (
        <FlatList
          data={rows}
          keyExtractor={(_, i) => i.toString()}
          style={{ marginTop: 16 }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.rowFront}>{item.front}</Text>
              <Text style={styles.rowTrack}>
                {item.track_name} - {item.artist_name}
              </Text>
              <Text style={styles.rowTime}>
                {formatMs(item.progress_ms)}
                {item.note ? ` (${item.note})` : ''}
              </Text>
            </View>
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
    backgroundColor: colors.spotifyGreen,
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
    color: colors.spotifyGreen,
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
