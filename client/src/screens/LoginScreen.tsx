import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Screen } from '../components/Screen';
import { AppText } from '../components/Text';
import { TextField } from '../components/TextField';
import { Button } from '../components/Button';
import { useAuth } from '../store/auth';
import { describeError } from '../api/errors';
import { spacing } from '../theme';

export function LoginScreen(): React.ReactElement {
  const { login, lastServerUrl } = useAuth();
  const [serverUrl, setServerUrl] = useState(lastServerUrl ?? '');
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await login(serverUrl, token);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = serverUrl.trim().length > 0 && token.trim().length > 0 && !submitting;

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">登录到 Agent Manager</AppText>
        <AppText variant="caption" style={{ marginTop: spacing.sm }}>
          填写您的 Server URL 和访问 Token。Client 只会保存一个 Server。
        </AppText>
      </View>

      <TextField
        label="Server URL"
        value={serverUrl}
        onChangeText={setServerUrl}
        placeholder="https://server.example.com"
        keyboardType="url"
        testID="login-server-url"
      />
      <TextField
        label="Token"
        value={token}
        onChangeText={setToken}
        placeholder="访问 Token"
        secureTextEntry
        testID="login-token"
      />

      {error ? (
        <AppText variant="caption" color="#EF4444" style={{ marginBottom: spacing.md }}>
          {error}
        </AppText>
      ) : null}

      <Button
        title="登录"
        onPress={onSubmit}
        disabled={!canSubmit}
        loading={submitting}
        testID="login-submit"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.xl,
  },
});
