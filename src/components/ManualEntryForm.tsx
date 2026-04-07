import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  Pressable,
  StyleSheet,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';

interface ManualEntryFormProps {
  initial?: { title: string; url: string; notes: string };
  onSave: (data: { title: string; url: string; notes: string }) => Promise<void>;
  onCancel: () => void;
}

const URL_REGEX = /^(https?:\/\/|spotify:)/i;

export default function ManualEntryForm({
  initial,
  onSave,
  onCancel,
}: ManualEntryFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [notesVisible, setNotesVisible] = useState(
    !!(initial?.notes && initial.notes.length > 0)
  );
  const [saving, setSaving] = useState(false);

  const canSave =
    !saving && (title.trim().length > 0 || url.trim().length > 0);
  const showOpenIcon = URL_REGEX.test(url.trim());

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        url: url.trim(),
        notes: notes.trim(),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenLink = () => {
    Linking.openURL(url.trim());
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Title"
        placeholderTextColor={colors.textMuted}
        returnKeyType="next"
        testID="input-manual-title"
      />

      <View style={styles.linkRow}>
        <TextInput
          style={[styles.input, styles.linkInput]}
          value={url}
          onChangeText={setUrl}
          placeholder="https:// or spotify:"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          testID="input-manual-link"
        />
        {showOpenIcon && (
          <Pressable
            style={styles.openIcon}
            onPress={handleOpenLink}
            accessibilityLabel="Open link"
            accessibilityRole="button"
            testID="open-manual-link"
          >
            <Ionicons
              name="open-outline"
              size={20}
              color={colors.textSecondary}
            />
          </Pressable>
        )}
      </View>

      {notesVisible ? (
        <TextInput
          style={[styles.input, styles.notesInput]}
          value={notes}
          onChangeText={setNotes}
          placeholder="Notes"
          placeholderTextColor={colors.textMuted}
          multiline
          testID="input-manual-notes"
        />
      ) : (
        <Pressable
          style={styles.addNoteButton}
          onPress={() => setNotesVisible(true)}
          accessibilityLabel="Add note"
          accessibilityRole="button"
          testID="add-note-btn"
        >
          <Text style={styles.addNoteText}>+ Add note</Text>
        </Pressable>
      )}

      <Pressable
        style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
        onPress={handleSave}
        disabled={!canSave}
        accessibilityLabel="Save"
        accessibilityRole="button"
        testID="save-manual-btn"
      >
        <Text style={styles.saveButtonText}>Save</Text>
      </Pressable>

      <Pressable
        style={styles.cancelButton}
        onPress={onCancel}
        accessibilityLabel="Cancel"
        accessibilityRole="button"
        testID="cancel-manual-btn"
      >
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
  },
  input: {
    backgroundColor: colors.surfaceLight,
    color: colors.textPrimary,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  linkRow: {
    position: 'relative',
    justifyContent: 'center',
  },
  linkInput: {
    paddingRight: 44,
  },
  openIcon: {
    position: 'absolute',
    right: 10,
    top: 0,
    bottom: 12,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notesInput: {
    minHeight: 44,
    textAlignVertical: 'top',
  },
  addNoteButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    marginBottom: 12,
  },
  addNoteText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: 'center',
    marginTop: 4,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  cancelButton: {
    backgroundColor: colors.buttonSecondary,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
});
