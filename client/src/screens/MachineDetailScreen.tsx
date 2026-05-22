import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Screen } from '../components/Screen';
import { AppText } from '../components/Text';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { StatusPill } from '../components/StatusPill';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useMachine } from '../hooks/useMachine';
import { useAuth } from '../store/auth';
import {
  formatAgentStatus,
  formatMachineStatus,
  formatPlatform,
  formatTimestamp,
} from '../utils/formatting';
import { describeError } from '../api/errors';
import { colors, spacing } from '../theme';
import type { MachinesStackParamList } from '../navigation/types';
import type { AgentSummary } from '../api/types';

type Nav = NativeStackNavigationProp<MachinesStackParamList, 'MachineDetail'>;
type Rt = RouteProp<MachinesStackParamList, 'MachineDetail'>;

export function MachineDetailScreen(): React.ReactElement {
  const route = useRoute<Rt>();
  const navigation = useNavigation<Nav>();
  const { api } = useAuth();
  const { machineId } = route.params;
  const { machine, agents, loading, error, refresh } = useMachine(machineId);

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const beginEdit = () => {
    setDraftName(machine?.displayName ?? '');
    setNameError(null);
    setEditing(true);
  };

  const saveName = async () => {
    if (!api || !machine) return;
    const next = draftName.trim();
    if (!next) {
      setNameError('显示名不能为空');
      return;
    }
    setSavingName(true);
    setNameError(null);
    try {
      await api.updateMachine(machine.id, { displayName: next });
      await refresh();
      setEditing(false);
    } catch (err) {
      setNameError(describeError(err));
    } finally {
      setSavingName(false);
    }
  };

  const doDelete = async () => {
    if (!api || !machine) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteMachine(machine.id);
      setConfirmDelete(false);
      navigation.goBack();
    } catch (err) {
      setDeleteError(describeError(err));
    } finally {
      setDeleting(false);
    }
  };

  if (loading && !machine) {
    return (
      <Screen>
        <AppText variant="body">加载中…</AppText>
      </Screen>
    );
  }

  if (!machine) {
    return (
      <Screen>
        <AppText variant="body" color={colors.danger}>
          {error ?? '机器不存在或已被删除。'}
        </AppText>
      </Screen>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }}>
      <Screen scrollable={false}>
        <View style={styles.header}>
          <AppText variant="title" numberOfLines={1}>
            {machine.displayName || machine.hostname}
          </AppText>
          <StatusPill
            label={formatMachineStatus(machine.status)}
            tone={machine.status === 'online' ? 'success' : 'muted'}
          />
        </View>

        {error ? (
          <AppText variant="caption" color={colors.danger} style={{ marginBottom: spacing.md }}>
            {error}
          </AppText>
        ) : null}

        <Card>
          <Field label="机器 ID" value={machine.id} />
          <Field label="主机名" value={machine.hostname} />
          <Field label="平台" value={formatPlatform(machine.os, machine.arch)} />
          <Field label="最近在线" value={formatTimestamp(machine.lastSeenAt)} />
          <Field label="注册时间" value={formatTimestamp(machine.registeredAt)} />
        </Card>

        <Card>
          <AppText variant="heading" style={styles.cardTitle}>
            显示名
          </AppText>
          {editing ? (
            <>
              <TextField
                label="显示名"
                value={draftName}
                onChangeText={setDraftName}
                errorText={nameError ?? undefined}
                editable={!savingName}
              />
              <View style={styles.actionsRow}>
                <Button
                  title="取消"
                  variant="secondary"
                  onPress={() => setEditing(false)}
                  disabled={savingName}
                />
                <Button title="保存" onPress={saveName} loading={savingName} />
              </View>
            </>
          ) : (
            <View style={styles.actionsRow}>
              <AppText variant="body" style={{ flex: 1 }}>
                {machine.displayName || '未设置'}
              </AppText>
              <Button title="编辑" variant="secondary" onPress={beginEdit} />
            </View>
          )}
        </Card>

        <Card>
          <AppText variant="heading" style={styles.cardTitle}>
            Agent
          </AppText>
          {agents.length === 0 ? (
            <AppText variant="body" color={colors.textMuted}>
              Server 暂未返回任何 Agent 类型。
            </AppText>
          ) : (
            agents.map((agent) => (
              <AgentRow
                key={agent.type}
                agent={agent}
                onPress={() =>
                  navigation.navigate('AgentDetail', {
                    machineId,
                    agentType: agent.type,
                  })
                }
              />
            ))
          )}
        </Card>

        <Card>
          <AppText variant="heading" style={styles.cardTitle}>
            危险操作
          </AppText>
          <AppText variant="caption" color={colors.textMuted} style={{ marginBottom: spacing.md }}>
            删除后该机器会从列表中移除，再次接入需要在机器上重新 login。
          </AppText>
          {deleteError ? (
            <AppText variant="caption" color={colors.danger} style={{ marginBottom: spacing.sm }}>
              {deleteError}
            </AppText>
          ) : null}
          <Button
            title="删除机器"
            variant="danger"
            onPress={() => setConfirmDelete(true)}
          />
        </Card>

        <ConfirmDialog
          visible={confirmDelete}
          title="删除机器"
          message={`确认删除「${machine.displayName || machine.hostname}」？\n该机器会从控制台移除，再次接入需要在机器上重新 login。`}
          confirmLabel="删除"
          cancelLabel="取消"
          destructive
          confirming={deleting}
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      </Screen>
    </ScrollView>
  );
}

function AgentRow(props: { agent: AgentSummary; onPress: () => void }): React.ReactElement {
  const { agent, onPress } = props;
  const tone =
    agent.status === 'installed'
      ? 'success'
      : agent.status === 'broken'
      ? 'danger'
      : agent.status === 'not_installed'
      ? 'warning'
      : 'muted';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      testID={`agent-row-${agent.type}`}
      style={({ pressed }) => [styles.agentRow, pressed && { opacity: 0.85 }]}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="body">{agent.displayName || agent.type}</AppText>
        <AppText variant="caption" color={colors.textMuted}>
          {agent.version ? `版本 ${agent.version}` : '版本未知'}
        </AppText>
      </View>
      <StatusPill label={formatAgentStatus(agent.status)} tone={tone} />
    </Pressable>
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
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  agentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
