import { useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { makeRedirectUri } from 'expo-auth-session';
import { SPOTIFY_CLIENT_ID, SPOTIFY_SCOPES } from '../config/spotify';

function base64URLEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function useSpotifyAuth() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [isPremium, setIsPremium] = useState<boolean | null>(null);

  const redirectUri = makeRedirectUri({ path: 'callback' });

  const login = async () => {
    // Generate PKCE code verifier and challenge
    const randomBytes = await Crypto.getRandomBytesAsync(32);
    const codeVerifier = base64URLEncode(randomBytes.buffer);
    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      codeVerifier,
      { encoding: Crypto.CryptoEncoding.BASE64 },
    );
    const codeChallenge = digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const params = new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: SPOTIFY_SCOPES.join(' '),
      show_dialog: 'true',
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
    });
    const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;

    if (__DEV__) console.log('[SpotifyAuth] Redirect URI:', redirectUri);

    const result = await WebBrowser.openAuthSessionAsync(
      authUrl,
      redirectUri,
      { showInRecents: false },
    );

    if (result.type === 'success' && result.url) {
      const url = new URL(result.url);
      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        if (__DEV__) console.log('[SpotifyAuth] Auth error:', error);
        return;
      }

      if (code) {
        try {
          const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: SPOTIFY_CLIENT_ID,
              grant_type: 'authorization_code',
              code,
              redirect_uri: redirectUri,
              code_verifier: codeVerifier,
            }).toString(),
          });

          const tokenData = await tokenResponse.json();

          if (tokenData.access_token) {
            setAccessToken(tokenData.access_token);
            setExpiresAt(Date.now() + tokenData.expires_in * 1000);

            // Check premium status (product field may be deprecated, so treat failure as unknown)
            try {
              const meRes = await fetch('https://api.spotify.com/v1/me', {
                headers: { Authorization: `Bearer ${tokenData.access_token}` },
              });
              if (meRes.ok) {
                const me = await meRes.json();
                setIsPremium(me.product === 'premium');
              }
            } catch {
              // If /me fails, leave isPremium as null (unknown)
            }
          } else {
            if (__DEV__) console.log('[SpotifyAuth] Token error:', tokenData.error);
          }
        } catch (err) {
          if (__DEV__) console.log('[SpotifyAuth] Token exchange error:', String(err));
        }
      }
    }
  };

  const isTokenValid = accessToken && expiresAt && Date.now() < expiresAt;

  const logout = () => {
    setAccessToken(null);
    setExpiresAt(null);
    setIsPremium(null);
  };

  return { accessToken, isAuthenticated: !!isTokenValid, isPremium, login, logout, isReady: true };
}
