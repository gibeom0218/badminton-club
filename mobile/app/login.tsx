import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/contexts/AuthContext';
import { colors, fonts, spacing } from '@/constants/theme';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, loading, login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && user) {
    return <Redirect href="/(tabs)" />;
  }

  async function onSubmit() {
    const id = username.trim();
    if (!id || !password) {
      setError('아이디와 비밀번호를 입력하세요.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login(id, password);
      router.replace('/(tabs)' as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.court, colors.courtMid, '#147A55']}
        style={[styles.hero, { paddingTop: insets.top + 48 }]}
      >
        <Text style={styles.eyebrow}>BADMINTON CLUB</Text>
        <Text style={styles.title}>로그인</Text>
        <Text style={styles.sub}>
          관리자는 수정 가능 · 일반은 조회만 가능합니다
        </Text>
      </LinearGradient>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}
      >
        <Text style={styles.label}>아이디</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="admin 또는 guest"
          placeholderTextColor={colors.textSecondary}
        />

        <Text style={[styles.label, styles.labelSpaced]}>비밀번호</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="비밀번호"
          placeholderTextColor={colors.textSecondary}
          onSubmitEditing={onSubmit}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, submitting && styles.disabled]}
          disabled={submitting || loading}
          onPress={onSubmit}
        >
          {submitting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.buttonText}>로그인</Text>
          )}
        </Pressable>

        <Text style={styles.hint}>
          admin / admin123 · guest / guest123
        </Text>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  hero: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 36,
  },
  eyebrow: {
    fontFamily: fonts.display,
    fontSize: 14,
    letterSpacing: 2,
    color: colors.lime,
  },
  title: {
    marginTop: 8,
    fontFamily: fonts.bodyBold,
    fontSize: 32,
    color: colors.textOnDark,
  },
  sub: {
    marginTop: 6,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textOnDarkMuted,
  },
  sheet: {
    flex: 1,
    marginTop: -16,
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  label: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  labelSpaced: {
    marginTop: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: fonts.body,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  error: {
    marginTop: 12,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.danger,
  },
  button: {
    marginTop: 22,
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.white,
  },
  disabled: {
    opacity: 0.6,
  },
  hint: {
    marginTop: 16,
    textAlign: 'center',
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
  },
});
