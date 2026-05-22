import React from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, layout, spacing } from '../theme';

interface ScreenProps {
  children: React.ReactNode;
  scrollable?: boolean;
  contentStyle?: ViewStyle;
}

/**
 * Page-level container that:
 *   - Applies the dark theme background.
 *   - Centres content with a max width on wide screens (Web).
 *   - Optionally wraps content in a ScrollView.
 */
export function Screen(props: ScreenProps): React.ReactElement {
  const Wrapper = props.scrollable !== false ? ScrollView : View;
  const wrapperProps =
    props.scrollable !== false
      ? { contentContainerStyle: [styles.scrollContent, props.contentStyle] }
      : { style: [styles.content, props.contentStyle] };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <Wrapper {...(wrapperProps as object)}>
        <View style={styles.inner}>{props.children}</View>
      </Wrapper>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.lg,
    alignItems: 'center',
  },
  content: {
    flex: 1,
    padding: spacing.lg,
    alignItems: 'center',
  },
  inner: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
  },
});
