import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StateView } from '@/components/ui/StateView';
import { colors, fonts, spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import type { Member, Session } from '@/types/api';

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplayDate(isoDate: string): string {
  const raw = isoDate.slice(0, 10);
  const [y, m, d] = raw.split('-');
  if (!y || !m || !d) return isoDate;
  return `${y}.${m}.${d}`;
}

function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

export default function AttendanceScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [createVisible, setCreateVisible] = useState(false);
  const [title, setTitle] = useState('정기 모임');
  const [place, setPlace] = useState('');
  const [sessionDate, setSessionDate] = useState(todayIsoDate());
  const [memberSearch, setMemberSearch] = useState('');

  const sessionsQuery = useQuery({
    queryKey: ['sessions'],
    queryFn: api.getSessions,
  });

  const sessionDetailQuery = useQuery({
    queryKey: ['sessions', selectedId],
    queryFn: () => api.getSession(selectedId!),
    enabled: selectedId != null,
  });

  const membersQuery = useQuery({
    queryKey: ['members'],
    queryFn: api.getMembers,
    enabled: selectedId != null,
  });

  const createMutation = useMutation({
    mutationFn: api.createSession,
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      setCreateVisible(false);
      setSelectedId(created.id);
      setMemberSearch('');
    },
    onError: (err: Error) => showAlert('모임 생성 실패', err.message),
  });

  const addAttendanceMutation = useMutation({
    mutationFn: ({
      sessionId,
      memberId,
    }: {
      sessionId: number;
      memberId: number;
    }) => api.addAttendance(sessionId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      if (selectedId != null) {
        queryClient.invalidateQueries({ queryKey: ['sessions', selectedId] });
      }
    },
    onError: (err: Error) => showAlert('출석 등록 실패', err.message),
  });

  const removeAttendanceMutation = useMutation({
    mutationFn: ({
      sessionId,
      memberId,
    }: {
      sessionId: number;
      memberId: number;
    }) => api.removeAttendance(sessionId, memberId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      if (selectedId != null) {
        queryClient.invalidateQueries({ queryKey: ['sessions', selectedId] });
      }
    },
    onError: (err: Error) => showAlert('출석 해제 실패', err.message),
  });

  const sessions = sessionsQuery.data ?? [];
  const selected = sessionDetailQuery.data ?? null;
  const members = membersQuery.data ?? [];

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.name.toLowerCase().includes(q));
  }, [members, memberSearch]);

  function openCreate() {
    setTitle('정기 모임');
    setPlace('');
    setSessionDate(todayIsoDate());
    setCreateVisible(true);
  }

  function submitCreate() {
    const date = sessionDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      showAlert('안내', '날짜는 YYYY-MM-DD 형식으로 입력하세요.');
      return;
    }
    createMutation.mutate({
      session_date: date,
      title: title.trim() || '정기 모임',
      place: place.trim() || null,
    });
  }

  function toggleAttendance(memberId: number) {
    if (selectedId == null || !selected) return;
    const attended = selected.attended_member_ids ?? [];
    const exists = attended.includes(memberId);
    if (exists) {
      removeAttendanceMutation.mutate({ sessionId: selectedId, memberId });
    } else {
      addAttendanceMutation.mutate({ sessionId: selectedId, memberId });
    }
  }

  if (selectedId != null) {
    return (
      <AttendanceCheckView
        session={selected}
        members={filteredMembers}
        loading={
          sessionDetailQuery.isLoading ||
          membersQuery.isLoading ||
          (!!selectedId && sessionDetailQuery.isFetching && !selected)
        }
        error={
          sessionDetailQuery.error?.message ?? membersQuery.error?.message
        }
        search={memberSearch}
        onSearchChange={setMemberSearch}
        onToggle={toggleAttendance}
        toggling={
          addAttendanceMutation.isPending || removeAttendanceMutation.isPending
        }
        onBack={() => {
          setSelectedId(null);
          setMemberSearch('');
        }}
        onRefresh={() => {
          sessionDetailQuery.refetch();
          membersQuery.refetch();
        }}
        refreshing={
          sessionDetailQuery.isRefetching || membersQuery.isRefetching
        }
        bottomInset={insets.bottom}
        topInset={insets.top}
      />
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.court, colors.courtMid, '#147A55']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 18 }]}
      >
        <Text style={styles.eyebrow}>ATTENDANCE</Text>
        <Text style={styles.brand}>출석 체크</Text>
        <Text style={styles.brandSub}>모임을 만들고 참석자를 체크하세요</Text>
        <Pressable style={styles.addBtn} onPress={openCreate}>
          <Text style={styles.addBtnText}>+ 모임 만들기</Text>
        </Pressable>
      </LinearGradient>

      <View style={styles.sheet}>
        <StateView
          loading={sessionsQuery.isLoading}
          error={sessionsQuery.error?.message}
          empty={!sessionsQuery.isLoading && sessions.length === 0}
          emptyText="아직 모임이 없습니다. 모임을 만들어 보세요."
        >
          <FlatList
            data={sessions}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={[
              styles.list,
              { paddingBottom: insets.bottom + 24 },
            ]}
            refreshControl={
              <RefreshControl
                refreshing={sessionsQuery.isRefetching}
                tintColor={colors.primary}
                colors={[colors.primary]}
                onRefresh={() => sessionsQuery.refetch()}
              />
            }
            ListHeaderComponent={
              <Text style={styles.sectionTitle}>모임 목록</Text>
            }
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.sessionRow,
                  pressed && styles.pressed,
                ]}
                onPress={() => setSelectedId(item.id)}
              >
                <View style={styles.sessionLeft}>
                  <Text style={styles.sessionDate}>
                    {formatDisplayDate(item.session_date)}
                  </Text>
                  <Text style={styles.sessionTitle}>{item.title}</Text>
                  {!!item.place && (
                    <Text style={styles.sessionPlace}>{item.place}</Text>
                  )}
                </View>
                <View style={styles.sessionRight}>
                  <Text style={styles.attendCount}>{item.attend_count}</Text>
                  <Text style={styles.attendLabel}>명 출석</Text>
                </View>
              </Pressable>
            )}
          />
        </StateView>

        {!sessionsQuery.isLoading &&
          !sessionsQuery.error &&
          sessions.length === 0 && (
            <View style={styles.emptyAction}>
              <Pressable style={styles.emptyAddBtn} onPress={openCreate}>
                <Text style={styles.emptyAddText}>첫 모임 만들기</Text>
              </Pressable>
            </View>
          )}
      </View>

      <Modal visible={createVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { paddingBottom: Math.max(insets.bottom, 20) },
            ]}
          >
            <Text style={styles.modalTitle}>새 모임</Text>
            <Text style={styles.modalHint}>
              sessions 테이블에 저장됩니다
            </Text>

            <Text style={styles.fieldLabel}>날짜 (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={sessionDate}
              onChangeText={setSessionDate}
              placeholder="2026-10-28"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
            />

            <Text style={[styles.fieldLabel, styles.fieldSpaced]}>제목</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="정기 모임"
              placeholderTextColor={colors.textSecondary}
            />

            <Text style={[styles.fieldLabel, styles.fieldSpaced]}>장소</Text>
            <TextInput
              style={styles.input}
              value={place}
              onChangeText={setPlace}
              placeholder="선택 입력"
              placeholderTextColor={colors.textSecondary}
            />

            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => setCreateVisible(false)}
              >
                <Text style={styles.cancelText}>취소</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.saveBtn,
                  createMutation.isPending && styles.disabled,
                ]}
                disabled={createMutation.isPending}
                onPress={submitCreate}
              >
                {createMutation.isPending ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.saveText}>만들기</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function AttendanceCheckView({
  session,
  members,
  loading,
  error,
  search,
  onSearchChange,
  onToggle,
  toggling,
  onBack,
  onRefresh,
  refreshing,
  bottomInset,
  topInset,
}: {
  session: Session | null;
  members: Member[];
  loading: boolean;
  error?: string;
  search: string;
  onSearchChange: (v: string) => void;
  onToggle: (memberId: number) => void;
  toggling: boolean;
  onBack: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  bottomInset: number;
  topInset: number;
}) {
  const attendedSet = useMemo(
    () => new Set(session?.attended_member_ids ?? []),
    [session?.attended_member_ids],
  );

  return (
    <View style={styles.container}>
      <View style={[styles.checkHeader, { paddingTop: topInset + 12 }]}>
        <Pressable style={styles.backBtn} onPress={onBack} hitSlop={8}>
          <Text style={styles.backText}>← 목록</Text>
        </Pressable>
        {session ? (
          <>
            <Text style={styles.checkDate}>
              {formatDisplayDate(session.session_date)}
            </Text>
            <Text style={styles.checkTitle}>{session.title}</Text>
            {!!session.place && (
              <Text style={styles.checkPlace}>{session.place}</Text>
            )}
            <View style={styles.checkSummary}>
              <Text style={styles.checkSummaryValue}>
                {session.attend_count}
              </Text>
              <Text style={styles.checkSummaryLabel}>명 출석 중</Text>
            </View>
          </>
        ) : (
          <Text style={styles.checkTitle}>모임 불러오는 중…</Text>
        )}
      </View>

      <View style={styles.checkBody}>
        <View style={styles.searchBox}>
          <TextInput
            style={styles.searchInput}
            placeholder="회원 이름 검색"
            placeholderTextColor={colors.textSecondary}
            value={search}
            onChangeText={onSearchChange}
            autoCorrect={false}
            autoCapitalize="none"
          />
          {search.length > 0 && (
            <Pressable onPress={() => onSearchChange('')} hitSlop={8}>
              <Text style={styles.clearText}>지우기</Text>
            </Pressable>
          )}
        </View>

        <StateView
          loading={loading}
          error={error}
          empty={!loading && members.length === 0 && !search.trim()}
          emptyText="등록된 회원이 없습니다. 회원 탭에서 먼저 추가하세요."
        >
          <FlatList
            data={members}
            keyExtractor={(item) => String(item.id)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                tintColor={colors.primary}
                colors={[colors.primary]}
                onRefresh={onRefresh}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>
                  “{search.trim()}” 검색 결과가 없습니다
                </Text>
              </View>
            }
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item }) => {
              const checked = attendedSet.has(item.id);
              return (
                <Pressable
                  style={({ pressed }) => [
                    styles.memberRow,
                    pressed && styles.pressed,
                  ]}
                  disabled={toggling || !session}
                  onPress={() => onToggle(item.id)}
                >
                  <View
                    style={[styles.avatar, checked && styles.avatarChecked]}
                  >
                    <Text
                      style={[
                        styles.avatarText,
                        checked && styles.avatarTextChecked,
                      ]}
                    >
                      {item.name.slice(0, 1)}
                    </Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{item.name}</Text>
                    <Text style={styles.memberMeta}>
                      {[item.gender, item.grade].filter(Boolean).join(' · ') ||
                        ' '}
                    </Text>
                  </View>
                  <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                    {checked && <Text style={styles.checkboxMark}>✓</Text>}
                  </View>
                </Pressable>
              );
            }}
          />
        </StateView>
      </View>
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
    paddingBottom: 34,
  },
  eyebrow: {
    fontFamily: fonts.display,
    fontSize: 14,
    letterSpacing: 3,
    color: colors.lime,
    marginBottom: 6,
  },
  brand: {
    fontFamily: fonts.bodyBold,
    fontSize: 28,
    color: colors.textOnDark,
  },
  brandSub: {
    marginTop: 4,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textOnDarkMuted,
  },
  addBtn: {
    marginTop: 16,
    alignSelf: 'flex-start',
    backgroundColor: colors.lime,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
  },
  addBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.court,
  },
  sheet: {
    flex: 1,
    marginTop: -16,
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  sectionTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    color: colors.text,
    marginBottom: spacing.md,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  sessionLeft: {
    flex: 1,
  },
  sessionDate: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.primary,
    marginBottom: 2,
  },
  sessionTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.text,
  },
  sessionPlace: {
    marginTop: 2,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
  },
  sessionRight: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  attendCount: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.primary,
    lineHeight: 30,
  },
  attendLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
  },
  pressed: {
    opacity: 0.7,
  },
  emptyBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyAction: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 48,
    alignItems: 'center',
  },
  emptyAddBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyAddText: {
    fontFamily: fonts.bodyBold,
    color: colors.white,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
  },
  modalTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    color: colors.text,
  },
  modalHint: {
    marginTop: 4,
    marginBottom: spacing.md,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
  },
  fieldLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  fieldSpaced: {
    marginTop: 12,
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
    backgroundColor: colors.background,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  cancelText: {
    fontFamily: fonts.bodyMedium,
    color: colors.textSecondary,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: 88,
    alignItems: 'center',
  },
  saveText: {
    fontFamily: fonts.bodyBold,
    color: colors.white,
  },
  disabled: {
    opacity: 0.6,
  },
  checkHeader: {
    backgroundColor: colors.court,
    paddingHorizontal: spacing.lg,
    paddingBottom: 20,
  },
  backBtn: {
    alignSelf: 'flex-start',
    marginBottom: 10,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  backText: {
    fontFamily: fonts.bodyMedium,
    color: colors.lime,
    fontSize: 14,
  },
  checkDate: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.lime,
  },
  checkTitle: {
    marginTop: 2,
    fontFamily: fonts.bodyBold,
    fontSize: 24,
    color: colors.textOnDark,
  },
  checkPlace: {
    marginTop: 2,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textOnDarkMuted,
  },
  checkSummary: {
    marginTop: 14,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(184, 224, 106, 0.35)',
  },
  checkSummaryValue: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: colors.lime,
    lineHeight: 28,
  },
  checkSummaryLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textOnDark,
  },
  checkBody: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: spacing.md,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: fonts.body,
    color: colors.text,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  clearText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.primary,
    paddingLeft: 8,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarChecked: {
    backgroundColor: colors.primary,
  },
  avatarText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.primary,
  },
  avatarTextChecked: {
    color: colors.white,
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.text,
  },
  memberMeta: {
    marginTop: 2,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    minHeight: 16,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  checkboxOn: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  checkboxMark: {
    color: colors.white,
    fontFamily: fonts.bodyBold,
    fontSize: 14,
  },
});
