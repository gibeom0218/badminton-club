import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, spacing } from '@/constants/theme';

interface Props {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  emptyText?: string;
  children: ReactNode;
}

export function StateView({
  loading,
  error,
  empty,
  emptyText = '데이터가 없습니다.',
  children,
}: Props) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.hint}>회원 불러오는 중</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>연결에 실패했습니다</Text>
        <Text style={styles.errorBody}>{error}</Text>
      </View>
    );
  }

  if (empty) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>아직 회원이 없습니다</Text>
        <Text style={styles.empty}>{emptyText}</Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colors.background,
  },
  hint: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontFamily: fonts.bodyMedium,
  },
  errorTitle: {
    fontSize: 17,
    fontFamily: fonts.bodyBold,
    color: colors.danger,
    marginBottom: spacing.sm,
  },
  errorBody: {
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    fontFamily: fonts.body,
  },
  emptyTitle: {
    fontSize: 17,
    fontFamily: fonts.bodyBold,
    color: colors.text,
    marginBottom: 6,
  },
  empty: {
    color: colors.textSecondary,
    fontSize: 14,
    fontFamily: fonts.body,
  },
});
