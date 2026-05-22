import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../theme';

export type PillTone = 'success' | 'warning' | 'danger' | 'muted' | 'info';

interface StatusPillProps {
  label: string;
  tone?: PillTone;
}

const toneToColors: Record<PillTone, { bg: string; text: string }> = {
  success: { bg: 'rgba(34,197,94,0.15)', text: colors.success },
  warning: { bg: 'rgba(245,158,11,0.15)', text: colors.warning },
  danger: { bg: 'rgba(239,68,68,0.15)', text: colors.danger },
  muted: { bg: 'rgba(148,163,184,0.15)', text: colors.textMuted },
  info: { bg: 'rgba(59,130,246,0.15)', text: colors.primary },
};

export function StatusPill(props: StatusPillProps): React.ReactElement {
  const tone = props.tone ?? 'muted';
  const palette = toneToColors[tone];
  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <Text style={[styles.text, { color: palette.text }]}>{props.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  text: {
    ...typography.caption,
    fontWeight: '600',
  },
});
