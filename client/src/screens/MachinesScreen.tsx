import React from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { AppText } from '../components/Text';
import { Card } from '../components/Card';
import { StatusPill } from '../components/StatusPill';
import { useMachines } from '../hooks/useMachines';
import { formatMachineStatus, formatPlatform } from '../utils/formatting';
import { colors, spacing } from '../theme';
import type { MachinesStackParamList } from '../navigation/types';
import type { Machine } from '../api/types';

type Nav = NativeStackNavigationProp<MachinesStackParamList, 'Machines'>;

export function MachinesScreen(): React.ReactElement {
  const { machines, loading, refreshing, error, refresh } = useMachines();
  const navigation = useNavigation<Nav>();

  return (
    <Screen scrollable={false}>
      <AppText variant="title" style={styles.title}>
        机器
      </AppText>
      {error ? (
        <AppText variant="caption" color={colors.danger} style={styles.error}>
          {error}
        </AppText>
      ) : null}
      <FlatList
        style={styles.list}
        data={machines}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MachineRow
            machine={item}
            onPress={() => navigation.navigate('MachineDetail', { machineId: item.id })}
          />
        )}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void refresh();
            }}
            tintColor={colors.text}
          />
        }
        ListEmptyComponent={
          <Card>
            <AppText variant="body" color={colors.textMuted}>
              {loading ? '加载中…' : '尚未注册机器。请在目标机器上运行 Runner 完成注册。'}
            </AppText>
          </Card>
        }
        contentContainerStyle={styles.listContent}
      />
    </Screen>
  );
}

function MachineRow(props: { machine: Machine; onPress: () => void }): React.ReactElement {
  const { machine, onPress } = props;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={`machine-row-${machine.id}`}
      style={({ pressed }) => [
        styles.row,
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={styles.rowHeader}>
        <AppText variant="heading" numberOfLines={1}>
          {machine.displayName || machine.hostname}
        </AppText>
        <StatusPill
          label={formatMachineStatus(machine.status)}
          tone={machine.status === 'online' ? 'success' : 'muted'}
        />
      </View>
      <AppText variant="caption" color={colors.textMuted}>
        {formatPlatform(machine.os, machine.arch)}
      </AppText>
      {machine.hostname && machine.hostname !== machine.displayName ? (
        <AppText variant="caption" color={colors.textMuted}>
          {machine.hostname}
        </AppText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: spacing.md,
  },
  list: {
    width: '100%',
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  error: {
    marginBottom: spacing.md,
  },
  row: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
