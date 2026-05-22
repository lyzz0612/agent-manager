import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../theme';
import { Button } from './Button';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  confirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps): React.ReactElement {
  return (
    <Modal
      transparent
      animationType="fade"
      visible={props.visible}
      onRequestClose={props.onCancel}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{props.title}</Text>
          <Text style={styles.message}>{props.message}</Text>
          <View style={styles.actions}>
            <Button
              title={props.cancelLabel ?? '取消'}
              variant="secondary"
              onPress={props.onCancel}
              style={styles.actionButton}
            />
            <Button
              title={props.confirmLabel ?? '确认'}
              variant={props.destructive ? 'danger' : 'primary'}
              loading={props.confirming}
              onPress={props.onConfirm}
              style={styles.actionButton}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
  },
  title: {
    ...typography.heading,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  message: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
  },
  actionButton: {
    minWidth: 96,
  },
});
