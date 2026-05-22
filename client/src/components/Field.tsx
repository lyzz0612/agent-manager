import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme';

interface FieldProps {
  label: string;
  value?: React.ReactNode;
  children?: React.ReactNode;
}

export function Field(props: FieldProps): React.ReactElement {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{props.label}</Text>
      {props.children ? (
        <View style={styles.value}>{props.children}</View>
      ) : (
        <Text style={styles.valueText}>{toText(props.value)}</Text>
      )}
    </View>
  );
}

function toText(value: React.ReactNode): string {
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.xs,
    gap: spacing.md,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    width: 96,
  },
  value: {
    flex: 1,
  },
  valueText: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
});
