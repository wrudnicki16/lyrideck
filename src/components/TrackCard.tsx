import React from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from 'react-native';
import { SpotifyTrack } from '../types';
import { colors } from '../constants/colors';

interface Props {
  track: SpotifyTrack;
  onSelect?: (track: SpotifyTrack) => void;
  clipCount?: number;
}

export default function TrackCard({ track, onSelect, clipCount }: Props) {
  const albumArt = track.album.images[1]?.url ?? track.album.images[0]?.url;
  const artists = track.artists.map((a) => a.name).join(', ');

  const openInSpotify = async () => {
    try {
      const supported = await Linking.canOpenURL(track.uri);
      if (supported) {
        await Linking.openURL(track.uri);
      } else {
        await Linking.openURL(track.external_urls.spotify);
      }
    } catch {
      await Linking.openURL(track.external_urls.spotify);
    }
  };

  return (
    <View style={styles.container}>
      {albumArt && (
        <Image source={{ uri: albumArt }} style={styles.albumArt} />
      )}
      <View style={styles.info}>
        <Text style={styles.trackName} numberOfLines={1}>
          {track.name}
        </Text>
        <Text style={styles.artistName} numberOfLines={1}>
          {artists}
        </Text>
        <Text style={styles.albumName} numberOfLines={1}>
          {track.album.name}
        </Text>
      </View>
      {clipCount != null && clipCount > 0 && (
        <View style={styles.clipBadge}>
          <Text style={styles.clipBadgeText}>
            {clipCount} clip{clipCount !== 1 ? 's' : ''} saved
          </Text>
        </View>
      )}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.openButton} onPress={openInSpotify}>
          <Text style={styles.openButtonText}>Open</Text>
        </TouchableOpacity>
        {onSelect && (
          <TouchableOpacity
            style={styles.selectButton}
            onPress={() => onSelect(track)}
          >
            <Text style={styles.selectButtonText}>Select</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.attribution}>
        Content provided by Spotify. Tap Open to listen on Spotify.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  albumArt: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 10,
  },
  info: {
    marginBottom: 10,
  },
  trackName: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  artistName: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 2,
  },
  albumName: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  openButton: {
    backgroundColor: colors.spotifyGreen,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    flex: 1,
    alignItems: 'center',
  },
  openButtonText: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  selectButton: {
    backgroundColor: colors.buttonSecondary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    flex: 1,
    alignItems: 'center',
  },
  selectButtonText: {
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  clipBadge: {
    backgroundColor: colors.spotifyGreenTransparent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  clipBadgeText: {
    color: colors.spotifyGreen,
    fontSize: 12,
    fontWeight: '600',
  },
  attribution: {
    color: colors.buttonSecondary,
    fontSize: 10,
    textAlign: 'center',
  },
});
