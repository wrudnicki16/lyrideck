import { Linking } from 'react-native';
import { openSpotifyLink } from './openSpotifyLink';

const mockCanOpenURL = jest.fn<Promise<boolean>, [string]>();
const mockOpenURL = jest.fn<Promise<string>, [string]>();

beforeEach(() => {
  mockCanOpenURL.mockReset().mockResolvedValue(false);
  mockOpenURL.mockReset().mockResolvedValue('');
  Linking.canOpenURL = mockCanOpenURL;
  Linking.openURL = mockOpenURL;
});

describe('openSpotifyLink', () => {
  it('no-ops when both uri and url are null', async () => {
    await openSpotifyLink(null, null);
    expect(mockCanOpenURL).not.toHaveBeenCalled();
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  it('opens URI when supported', async () => {
    mockCanOpenURL.mockResolvedValue(true);

    await openSpotifyLink('spotify:track:123', 'https://open.spotify.com/track/123');

    expect(mockCanOpenURL).toHaveBeenCalledWith('spotify:track:123');
    expect(mockOpenURL).toHaveBeenCalledWith('spotify:track:123');
  });

  it('falls back to URL when URI is not supported', async () => {
    mockCanOpenURL.mockResolvedValue(false);

    await openSpotifyLink('spotify:track:123', 'https://open.spotify.com/track/123');

    expect(mockCanOpenURL).toHaveBeenCalledWith('spotify:track:123');
    expect(mockOpenURL).toHaveBeenCalledWith('https://open.spotify.com/track/123');
  });

  it('falls back to URL when canOpenURL throws', async () => {
    mockCanOpenURL.mockRejectedValue(new Error('fail'));

    await openSpotifyLink('spotify:track:123', 'https://open.spotify.com/track/123');

    expect(mockOpenURL).toHaveBeenCalledWith('https://open.spotify.com/track/123');
  });

  it('opens URL directly when uri is null', async () => {
    await openSpotifyLink(null, 'https://open.spotify.com/track/123');

    expect(mockCanOpenURL).not.toHaveBeenCalled();
    expect(mockOpenURL).toHaveBeenCalledWith('https://open.spotify.com/track/123');
  });

  it('tries URI only when url is null', async () => {
    mockCanOpenURL.mockResolvedValue(true);

    await openSpotifyLink('spotify:track:123', null);

    expect(mockOpenURL).toHaveBeenCalledWith('spotify:track:123');
  });

  it('no-ops when uri is unsupported and url is null', async () => {
    mockCanOpenURL.mockResolvedValue(false);

    await openSpotifyLink('spotify:track:123', null);

    expect(mockCanOpenURL).toHaveBeenCalledWith('spotify:track:123');
    expect(mockOpenURL).not.toHaveBeenCalled();
  });
});
