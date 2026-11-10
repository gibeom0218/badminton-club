import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/constants/theme';
import type { AuthUser } from '@/types/api';

type Props = {
  user: AuthUser | null;
  onLogout: () => void;
  /** 히어로(어두운 배경)용인지 */
  onDark?: boolean;
};

export function AccountBadge({ user, onLogout, onDark = true }: Props) {
  if (!user) return null;

  const isAdmin = user.role === 'admin';
  const roleLabel = isAdmin ? '관리자' : '일반';

  return (
    <View style={[styles.wrap, onDark ? styles.wrapDark : styles.wrapLight]}>
      <View style={styles.identity}>
        <View
          style={[
            styles.rolePill,
            isAdmin ? styles.roleAdmin : styles.roleUser,
          ]}
        >
          <FontAwesome
            name={isAdmin ? 'shield' : 'user'}
            size={11}
            color={isAdmin ? colors.court : colors.primary}
          />
          <Text
            style={[
              styles.roleText,
              isAdmin ? styles.roleTextAdmin : styles.roleTextUser,
            ]}
          >
            {roleLabel}
          </Text>
        </View>
        <Text
          style={[styles.username, onDark ? styles.usernameDark : null]}
          numberOfLines={1}
        >
          {user.username}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="로그아웃"
        style={({ pressed }) => [
          styles.logoutBtn,
          onDark ? styles.logoutBtnDark : styles.logoutBtnLight,
          pressed && styles.pressed,
        ]}
        onPress={onLogout}
        hitSlop={6}
      >
        <FontAwesome
          name="sign-out"
          size={13}
          color={onDark ? colors.lime : colors.primary}
        />
        <Text
          style={[
            styles.logoutText,
            onDark ? styles.logoutTextDark : styles.logoutTextLight,
          ]}
        >
          로그아웃
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  wrapDark: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(184, 224, 106, 0.28)',
  },
  wrapLight: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  roleAdmin: {
    backgroundColor: colors.lime,
  },
  roleUser: {
    backgroundColor: colors.primarySoft,
  },
  roleText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
  },
  roleTextAdmin: {
    color: colors.court,
  },
  roleTextUser: {
    color: colors.primary,
  },
  username: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    flexShrink: 1,
  },
  usernameDark: {
    color: colors.textOnDark,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  logoutBtnDark: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  logoutBtnLight: {
    backgroundColor: colors.primarySoft,
  },
  logoutText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
  },
  logoutTextDark: {
    color: colors.lime,
  },
  logoutTextLight: {
    color: colors.primary,
  },
  pressed: {
    opacity: 0.75,
  },
});
