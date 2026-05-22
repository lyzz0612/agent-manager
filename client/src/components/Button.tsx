import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';
import { colors, radii, spacing, typography } from '../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  testID?: string;
}

export function Button(props: ButtonProps): React.ReactElement {
  const variant = props.variant ?? 'primary';
  const disabled = props.disabled || props.loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        if (disabled) return;
        props.onPress();
      }}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant].container,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        props.style,
      ]}
      testID={props.testID}
    >
      {props.loading ? (
        <ActivityIndicator color={variantStyles[variant].text.color as string} />
      ) : (
        <Text style={[styles.text, variantStyles[variant].text]}>{props.title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  text: {
    ...typography.label,
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
});

const variantStyles: Record<ButtonVariant, { container: ViewStyle; text: { color: string } }> = {
  primary: {
    container: { backgroundColor: colors.primary },
    text: { color: colors.primaryText },
  },
  secondary: {
    container: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.border,
    },
    text: { color: colors.text },
  },
  danger: {
    container: { backgroundColor: colors.danger },
    text: { color: colors.dangerText },
  },
  ghost: {
    container: { backgroundColor: 'transparent' },
    text: { color: colors.primary },
  },
};
