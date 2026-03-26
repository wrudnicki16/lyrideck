import React from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import * as Sentry from '@sentry/react-native';
import { useSpotifyAuth } from './src/hooks/useSpotifyAuth';
import AppNavigator from './src/navigation/AppNavigator';
import { colors } from './src/constants/colors';

Sentry.init({
  dsn: 'https://5e93b869492da52eba4b256550b89bb6@o4511033353306112.ingest.us.sentry.io/4511033356517376',

  // Disable ALL performance monitoring
  tracesSampleRate: 0,
  enableAutoPerformanceTracing: false,
  enableAppStartTracking: false,
  enableNativeFramesTracking: false,
  enableStallTracking: false,

  // Disable replays
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,

  // Disable breadcrumbs (reduce noise)
  enableAutoSessionTracking: true, // keep session tracking for crash-free rate
  attachScreenshot: false,
  attachViewHierarchy: false,

  // Enable native crash handling
  enableNative: true,
  enableNativeCrashHandling: true,
  enableNdk: true,

  environment: __DEV__ ? 'development' : 'production',
});

function ErrorFallback() {
  return (
    <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#060a18' }}>
      <Text style={{ color: '#fff', fontSize: 16 }}>Something went wrong. Please restart the app.</Text>
    </SafeAreaView>
  );
}

function AppContent() {
  const { accessToken, isAuthenticated, login, logout, isReady } = useSpotifyAuth();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <Sentry.ErrorBoundary fallback={ErrorFallback}>
        <NavigationContainer
          theme={{
            dark: true,
            colors: {
              primary: '#4d7cff',
              background: '#060a18',
              card: '#060a18',
              text: '#fff',
              border: '#1f2640',
              notification: '#4d7cff',
            },
            fonts: {
              regular: { fontFamily: 'System', fontWeight: '400' },
              medium: { fontFamily: 'System', fontWeight: '500' },
              bold: { fontFamily: 'System', fontWeight: '700' },
              heavy: { fontFamily: 'System', fontWeight: '900' },
            },
          }}
        >
          {/* Spotify auth bar */}
          <View style={styles.authBar}>
            {isAuthenticated ? (
              <View style={styles.authRow}>
                <View style={styles.connectedDot} />
                <Text style={styles.authText}>Spotify Connected</Text>
                <Pressable onPress={logout} accessibilityLabel="Logout" accessibilityRole="button" testID="logout">
                  <Text style={styles.logoutText}>Logout</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                style={[styles.loginButton, !isReady && styles.loginButtonDisabled]}
                onPress={login}
                disabled={!isReady}
                accessibilityLabel="Connect Spotify"
                accessibilityRole="button"
                testID="connect-spotify"
              >
                <Text style={styles.loginText}>
                  {isReady ? 'Connect Spotify' : 'Loading...'}
                </Text>
              </Pressable>
            )}
          </View>

          <AppNavigator accessToken={accessToken} />
        </NavigationContainer>
      </Sentry.ErrorBoundary>
    </SafeAreaView>
  );
}

function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

export default Sentry.wrap(App);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  authBar: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceLight,
  },
  authRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  connectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginRight: 8,
  },
  authText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  logoutText: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  loginButton: {
    backgroundColor: colors.primary,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: 'center',
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
});
