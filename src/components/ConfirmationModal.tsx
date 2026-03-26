import React from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import { colors } from '../constants/colors';

interface ConfirmationModalProps {
  visible: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  children: React.ReactNode;
}

export default function ConfirmationModal({
  visible,
  title,
  onCancel,
  onConfirm,
  confirmLabel = 'Confirm',
  children,
}: ConfirmationModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.title}>{title}</Text>
          {children}
          <View style={styles.buttons}>
            <Pressable style={styles.cancel} onPress={onCancel} accessibilityLabel="Cancel" accessibilityRole="button" testID="modal-cancel">
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.confirm} onPress={onConfirm} accessibilityLabel={confirmLabel} accessibilityRole="button" testID="modal-confirm">
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.modalOverlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    backgroundColor: colors.modal,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
  },
  cancel: {
    flex: 1,
    padding: 12,
    borderRadius: 24,
    backgroundColor: colors.buttonSecondary,
    alignItems: 'center',
  },
  cancelText: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  confirm: {
    flex: 1,
    padding: 12,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
  },
  confirmText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
});
