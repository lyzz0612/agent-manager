import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { AppText } from '../components/Text';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { Button } from '../components/Button';
import { StatusPill } from '../components/StatusPill';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAgent } from '../hooks/useAgent';
import { useAuth } from '../store/auth';
import {
  formatActionKind,
  formatAgentStatus,
  formatTimestamp,
} from '../utils/formatting';
import { describeError } from '../api/errors';
import { colors, spacing } from '../theme';
import type { MachinesStackParamList } from '../navigation/types';
import type { ActionKind, DoctorCheck } from '../api/types';

type Nav = NativeStackNavigationProp<MachinesStackParamList, 'AgentDetail'>;
type Rt = RouteProp<MachinesStackParamList, 'AgentDetail'>;

const ALL_ACTIONS: ActionKind[] = ['detect', 'install', 'upgrade', 'doctor', 'uninstall'];

export function AgentDetailScreen(): React.ReactElement {
  const route = useRoute<Rt>();
  const navigation = useNavigation<Nav>();
  const { api } = useAuth();
  const { machineId, agentType } = route.params;
  const { agent, loading, error } = useAgent(machineId, agentType);

  const [submitting, setSubmitting] = useState<ActionKind | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmUninstall, setConfirmUninstall] = useState(false);

  const triggerAction = async (kind: ActionKind) => {
    if (!api) return;
    setSubmitting(kind);
    setActionError(null);
    try {
      const action = await api.createAction(machineId, { agentType, kind });
      navigation.navigate('ActionResult', { machineId, actionId: action.id });
    } catch (err) {
      setActionError(describeError(err));
    } finally {
      setSubmitting(null);
      setConfirmUninstall(false);
    }
  };

  const onUninstallTap = () => setConfirmUninstall(true);

  if (loading && !agent) {
    return (
      <Screen>
        <AppText variant="body">加载中…</AppText>
      </Screen>
    );
  }

  if (!agent) {
    return (
      <Screen>
        <AppText variant="body" color={colors.danger}>
          {error ?? '未能加载 Agent 详情。'}
        </AppText>
      </Screen>
    );
  }

  const statusTone =
    agent.status === 'installed'
      ? 'success'
      : agent.status === 'broken'
      ? 'danger'
      : agent.status === 'not_installed'
      ? 'warning'
      : 'muted';

  return (
    <ScrollView style={{ backgroundColor: colors.background }}>
      <Screen scrollable={false}>
        <View style={styles.header}>
          <AppText variant="title" numberOfLines={1}>
            {agent.displayName || agent.type}
          </AppText>
          <StatusPill label={formatAgentStatus(agent.status)} tone={statusTone} />
        </View>

        {error ? (
          <AppText variant="caption" color={colors.danger} style={{ marginBottom: spacing.md }}>
            {error}
          </AppText>
        ) : null}

        <Card>
          <Field label="类型" value={agent.type} />
          <Field label="版本" value={agent.version ?? '—'} />
          <Field label="路径" value={agent.binaryPath ?? '—'} />
          <Field
            label="PATH"
            value={
              agent.pathStatus === 'on_path'
                ? '已加入 PATH'
                : agent.pathStatus === 'off_path'
                ? '未加入 PATH'
                : '未知'
            }
          />
          <Field label="最近检测" value={formatTimestamp(agent.lastDetectedAt)} />
        </Card>

        <Card>
          <AppText variant="heading" style={styles.cardTitle}>
            配置
          </AppText>
          <Field label="配置文件" value={agent.configExists ? '存在' : '不存在'} />
          <Field
            label="认证"
            value={
              agent.authState === 'authenticated'
                ? '已认证'
                : agent.authState === 'unauthenticated'
                ? '未认证'
                : '未知'
            }
          />
          <Field label="配置摘要" value={agent.configSummary ?? '—'} />
          <AppText variant="caption" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
            v1 仅展示只读摘要，不提供配置写入。
          </AppText>
        </Card>

        <Card>
          <AppText variant="heading" style={styles.cardTitle}>
            Doctor
          </AppText>
          {agent.doctor.length === 0 ? (
            <AppText variant="body" color={colors.textMuted}>
              暂无 Doctor 结果。运行下方「体检」获取。
            </AppText>
          ) : (
            agent.doctor.map((check: DoctorCheck) => (
              <View key={check.id} style={styles.doctorRow}>
                <StatusPill
                  label={check.status.toUpperCase()}
                  tone={
                    check.status === 'ok'
                      ? 'success'
                      : check.status === 'warn'
                      ? 'warning'
                      : check.status === 'fail'
                      ? 'danger'
                      : 'muted'
                  }
                />
                <View style={{ flex: 1 }}>
                  <AppText variant="body">{check.label}</AppText>
                  {check.message ? (
                    <AppText variant="caption" color={colors.textMuted}>
                      {check.message}
                    </AppText>
                  ) : null}
                </View>
              </View>
            ))
          )}
          {agent.doctorRanAt ? (
            <AppText variant="caption" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
              最近一次体检：{formatTimestamp(agent.doctorRanAt)}
            </AppText>
          ) : null}
        </Card>

        <Card>
          <AppText variant="heading" style={styles.cardTitle}>
            管理动作
          </AppText>
          {actionError ? (
            <AppText variant="caption" color={colors.danger} style={{ marginBottom: spacing.sm }}>
              {actionError}
            </AppText>
          ) : null}
          <View style={styles.actionsGrid}>
            {ALL_ACTIONS.map((kind) => {
              if (kind === 'uninstall') {
                return (
                  <Button
                    key={kind}
                    title={formatActionKind(kind)}
                    variant="danger"
                    onPress={onUninstallTap}
                    loading={submitting === kind}
                    disabled={submitting !== null}
                  />
                );
              }
              return (
                <Button
                  key={kind}
                  title={formatActionKind(kind)}
                  variant={kind === 'install' ? 'primary' : 'secondary'}
                  onPress={() => triggerAction(kind)}
                  loading={submitting === kind}
                  disabled={submitting !== null}
                />
              );
            })}
          </View>
        </Card>

        <ConfirmDialog
          visible={confirmUninstall}
          title="卸载 Agent"
          message={`确认卸载「${agent.displayName || agent.type}」？\n该 Agent 将从目标机器上移除，相关命令会失效。`}
          confirmLabel="卸载"
          cancelLabel="取消"
          destructive
          confirming={submitting === 'uninstall'}
          onConfirm={() => triggerAction('uninstall')}
          onCancel={() => setConfirmUninstall(false)}
        />
      </Screen>
    </ScrollView>
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
  cardTitle: {
    marginBottom: spacing.md,
  },
  doctorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
