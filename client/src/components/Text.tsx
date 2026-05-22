import React from 'react';
import { StyleProp, Text as RNText, StyleSheet, TextStyle } from 'react-native';
import { colors, typography } from '../theme';

type Variant = 'title' | 'heading' | 'body' | 'caption' | 'label' | 'mono';

interface Props {
  variant?: Variant;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
  numberOfLines?: number;
}

export function AppText(props: Props): React.ReactElement {
  const variant = props.variant ?? 'body';
  return (
    <RNText
      style={[
        styles.base,
        typography[variant],
        { color: props.color ?? colors.text },
        props.style,
      ]}
      numberOfLines={props.numberOfLines}
    >
      {props.children}
    </RNText>
  );
}

const styles = StyleSheet.create({
  base: {},
});
