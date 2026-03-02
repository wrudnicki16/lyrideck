import { Linking } from 'react-native';

export async function openSpotifyLink(
  uri: string | null,
  url: string | null
): Promise<void> {
  if (!uri && !url) return;
  try {
    if (uri) {
      const supported = await Linking.canOpenURL(uri);
      if (supported) {
        await Linking.openURL(uri);
        return;
      }
    }
    if (url) await Linking.openURL(url);
  } catch {
    if (url) await Linking.openURL(url);
  }
}
