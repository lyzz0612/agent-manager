import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { Screen } from '../components/Screen';
import { AppText } from '../components/Text';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { StatusPill } from '../components/StatusPill';
import { useAction } from '../hooks/useAction';
import {
  formatActionKind,
  formatActionStatus,
  formatTimestamp,
} from '../utils/formatting';
import { colors, spacing } from '../theme';
import type { MachinesStackParamList } from '../navigation/types';

type Rt = RouteProp<MachinesStackParamList, 'ActionResult'>;

export function ActionResultScreen(): React.ReactElement {
  const route = useRoute<Rt>();
  const { machineId, actionId } = route.params;
  const { action, loading, error } = useAction(machineId, actionId);

  if (loading && !action) {
    return (
      <Screen>
        <AppText variant="body">加载中…</AppText>
      </Screen>
    );
  }

  if (!action) {
    return (
      <Screen>
        <AppText variant="body" color={colors.danger}>
          {error ?? '动作不存在。'}
        </AppText>
      </Screen>
    );
  }

  const tone =
    action.status === 'succeeded'
      ? 'success'
      : action.status === 'failed'
      ? 'danger'
      : action.status === 'cancelled'
      ? 'muted'
      : action.status === 'running'
      ? 'info'
      : 'warning';

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">
          {formatActionKind(action.kind)} · {action.agentType}
        </AppText>
        <StatusPill label={formatActionStatus(action.status)} tone={tone} />
      </View>

      {error ? (
        <AppText variant="caption" color={colors.danger} style={{ marginBottom: spacing.md }}>
          {error}
        </AppText>
      ) : null}

      <Card>
        <Field label="动作 ID" value={action.id} />
        <Field label="机器" value={action.machineId} />
        <Field label="创建时间" value={formatTimestamp(action.createdAt)} />
        <Field label="开始时间" value={formatTimestamp(action.startedAt)} />
        <Field label="结束时间" value={formatTimestamp(action.finishedAt)} />
      </Card>

      <Card>
        <AppText variant="heading" style={{ marginBottom: spacing.sm }}>
          结果摘要
        </AppText>
        <AppText variant="body" color={colors.text}>
          {action.summary?.trim() ? action.summary : '—'}
        </AppText>
        <AppText variant="caption" color={colors.textMuted} style={{ marginTop: spacing.md }}>
          v1 仅展示简短结果摘要。完整日志请在 Runner 或 Server 端查看。
        </AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
});
