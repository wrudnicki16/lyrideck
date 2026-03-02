import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';

interface FilterPillProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

export default function FilterPill({ label, active, onPress }: FilterPillProps) {
  return (
    <TouchableOpacity
      style={[styles.pill, active && styles.pillActive]}
      onPress={onPress}
    >
      <Text style={[styles.text, active && styles.textActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surfaceLight,
  },
  pillActive: {
    backgroundColor: colors.spotifyGreen,
  },
  text: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  textActive: {
    color: colors.textPrimary,
  },
});
