import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '../components/Screen';
import { AppText } from '../components/Text';
import { Card } from '../components/Card';
import { Field } from '../components/Field';
import { Button } from '../components/Button';
import { TextField } from '../components/TextField';
import { StatusPill } from '../components/StatusPill';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAuth } from '../store/auth';
import { useEvents } from '../store/events';
import { colors, spacing } from '../theme';

const APP_VERSION = '0.1.0 (v1 dev)';

export function SettingsScreen(): React.ReactElement {
  const { session, logout, setServerUrl } = useAuth();
  const { status: wsStatus } = useEvents();

  const [editingUrl, setEditingUrl] = useState(false);
  const [draftUrl, setDraftUrl] = useState('');
  const [confirmUrlChange, setConfirmUrlChange] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [busy, setBusy] = useState(false);

  const beginEditUrl = () => {
    setDraftUrl(session?.serverUrl ?? '');
    setEditingUrl(true);
  };

  const applyUrl = async () => {
    setBusy(true);
    try {
      await setServerUrl(draftUrl);
    } finally {
      setBusy(false);
      setConfirmUrlChange(false);
      setEditingUrl(false);
    }
  };

  const doLogout = async () => {
    setBusy(true);
    try {
      await logout();
    } finally {
      setBusy(false);
      setConfirmLogout(false);
    }
  };

  const wsLabel =
    wsStatus === 'open'
      ? '已连接'
      : wsStatus === 'connecting'
      ? '连接中'
      : wsStatus === 'error'
      ? '错误'
      : wsStatus === 'closed'
      ? '已断开'
      : '空闲';
  const wsTone =
    wsStatus === 'open' ? 'success' : wsStatus === 'error' ? 'danger' : 'muted';

  return (
    <Screen>
      <AppText variant="title" style={styles.title}>
        设置
      </AppText>

      <Card>
        <AppText variant="heading" style={styles.cardTitle}>
          Server
        </AppText>
        {editingUrl ? (
          <>
            <TextField
              label="Server URL"
              value={draftUrl}
              onChangeText={setDraftUrl}
              keyboardType="url"
              placeholder="https://server.example.com"
              editable={!busy}
            />
            <AppText variant="caption" color={colors.textMuted} style={{ marginBottom: spacing.md }}>
              修改 Server URL 会清理当前 Token，需要重新登录。
            </AppText>
            <View style={styles.row}>
              <Button title="取消" variant="secondary" onPress={() => setEditingUrl(false)} />
              <Button
                title="保存并重新登录"
                variant="danger"
                onPress={() => setConfirmUrlChange(true)}
                disabled={!draftUrl.trim() || busy}
              />
            </View>
          </>
        ) : (
          <>
            <Field label="URL" value={session?.serverUrl ?? '—'} />
            <Field label="登录状态" value={session ? '已登录' : '未登录'} />
            <Field label="实时连接">
              <StatusPill label={wsLabel} tone={wsTone} />
            </Field>
            <View style={[styles.row, { marginTop: spacing.md }]}>
              <Button title="修改 Server URL" variant="secondary" onPress={beginEditUrl} />
            </View>
          </>
        )}
      </Card>

      <Card>
        <AppText variant="heading" style={styles.cardTitle}>
          账号
        </AppText>
        <AppText variant="caption" color={colors.textMuted} style={{ marginBottom: spacing.md }}>
          退出登录会清除本机保存的 Token。再次登录需要重新输入 Server URL 和 Token。
        </AppText>
        <Button
          title="退出登录"
          variant="danger"
          onPress={() => setConfirmLogout(true)}
          disabled={!session || busy}
        />
      </Card>

      <Card>
        <AppText variant="heading" style={styles.cardTitle}>
          关于
        </AppText>
        <Field label="客户端版本" value={APP_VERSION} />
        <Field label="构建" value="Expo + React Native Web" />
      </Card>

      <ConfirmDialog
        visible={confirmUrlChange}
        title="修改 Server URL"
        message={`确认将 Server URL 修改为：\n${draftUrl}\n\n当前 Token 会被清除，需要重新登录。`}
        confirmLabel="修改"
        cancelLabel="取消"
        destructive
        confirming={busy}
        onConfirm={applyUrl}
        onCancel={() => setConfirmUrlChange(false)}
      />

      <ConfirmDialog
        visible={confirmLogout}
        title="退出登录"
        message="确认退出登录？本机将不再保留访问 Token。"
        confirmLabel="退出"
        cancelLabel="取消"
        destructive
        confirming={busy}
        onConfirm={doLogout}
        onCancel={() => setConfirmLogout(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    marginBottom: spacing.md,
  },
  cardTitle: {
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
