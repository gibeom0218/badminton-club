import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AttendanceHeatmap } from '@/components/ui/AttendanceHeatmap';
import { StateView } from '@/components/ui/StateView';
import { colors, fonts, spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import type {
  Gender,
  Member,
  MemberAttendance,
  MemberInput,
} from '@/types/api';

const GENDER_OPTIONS: Gender[] = ['남', '여'];

/** 웹에서는 Alert.alert 가 동작하지 않는 경우가 많아 분기 처리 */
function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

function showConfirm(
  title: string,
  message: string,
  onConfirm: () => void,
) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n${message}`)) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: '취소', style: 'cancel' },
    { text: '삭제', style: 'destructive', onPress: onConfirm },
  ]);
}

function formatWinRate(wins: number, losses: number): string {
  const total = wins + losses;
  if (total === 0) return '승률 -';
  return `승률 ${Math.round((wins / total) * 100)}%`;
}

function winRatePercent(wins: number, losses: number): number | null {
  const total = wins + losses;
  if (total === 0) return null;
  return Math.round((wins / total) * 100);
}

function formatMemberMeta(member: Member): string {
  const parts: string[] = [];
  if (member.gender === '남' || member.gender === '여') {
    parts.push(member.gender);
  }
  if (member.age !== null && member.age !== undefined) {
    parts.push(`${member.age}세`);
  }
  if (member.grade?.trim()) {
    parts.push(member.grade.trim());
  }
  const wins = member.wins ?? 0;
  const losses = member.losses ?? 0;
  parts.push(`${wins}승 ${losses}패`);
  parts.push(formatWinRate(wins, losses));
  return parts.join(' · ');
}

function parseFormAge(ageText: string): number | null | 'invalid' {
  const trimmed = ageText.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0 || n > 150) return 'invalid';
  return n;
}

type FormMode = 'create' | 'edit';

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>('create');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [ageText, setAgeText] = useState('');
  const [grade, setGrade] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [search, setSearch] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);

  const membersQuery = useQuery({
    queryKey: ['members'],
    queryFn: api.getMembers,
  });

  const memberAttendancesQuery = useQuery({
    queryKey: ['members', selectedMemberId, 'attendances'],
    queryFn: () => api.getMemberAttendances(selectedMemberId!),
    enabled: selectedMemberId != null,
  });

  const createMutation = useMutation({
    mutationFn: (payload: MemberInput) => api.createMember(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
      closeModal();
    },
    onError: (err: Error) => showAlert('등록 실패', err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: MemberInput }) =>
      api.updateMember(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
      closeModal();
    },
    onError: (err: Error) => showAlert('수정 실패', err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.deleteMember(id),
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['members'] });
      if (selectedMemberId === deletedId) {
        setSelectedMemberId(null);
      }
    },
    onError: (err: Error) => showAlert('삭제 실패', err.message),
  });

  const members = membersQuery.data ?? [];
  const selectedMember =
    selectedMemberId == null
      ? null
      : (members.find((m) => m.id === selectedMemberId) ?? null);
  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => m.name.toLowerCase().includes(q));
  }, [members, search]);

  const heroOpacity = useSharedValue(0);
  const heroTranslate = useSharedValue(18);
  const saving = createMutation.isPending || updateMutation.isPending;

  useEffect(() => {
    heroOpacity.value = withTiming(1, { duration: 520 });
    heroTranslate.value = withDelay(40, withTiming(0, { duration: 520 }));
  }, [heroOpacity, heroTranslate]);

  const heroAnimStyle = useAnimatedStyle(() => ({
    opacity: heroOpacity.value,
    transform: [{ translateY: heroTranslate.value }],
  }));

  function resetForm() {
    setName('');
    setAgeText('');
    setGrade('');
    setGender(null);
    setEditingId(null);
  }

  function openCreate() {
    setFormMode('create');
    resetForm();
    setModalVisible(true);
  }

  function openEdit(member: Member) {
    setFormMode('edit');
    setEditingId(member.id);
    setName(member.name);
    setAgeText(
      member.age === null || member.age === undefined ? '' : String(member.age),
    );
    setGrade(member.grade ?? '');
    setGender(
      member.gender === '남' || member.gender === '여' ? member.gender : null,
    );
    setModalVisible(true);
  }

  function closeModal() {
    setModalVisible(false);
    resetForm();
  }

  function submitForm() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      showAlert('안내', '이름을 입력하세요.');
      return;
    }

    const age = parseFormAge(ageText);
    if (age === 'invalid') {
      showAlert('안내', '나이는 0~150 사이 정수로 입력하세요.');
      return;
    }

    const payload: MemberInput = {
      name: trimmedName,
      age,
      grade: grade.trim() || null,
      gender,
    };

    if (formMode === 'create') {
      createMutation.mutate(payload);
      return;
    }

    if (editingId == null) {
      showAlert('안내', '수정할 회원을 찾을 수 없습니다.');
      return;
    }
    updateMutation.mutate({ id: editingId, payload });
  }

  function confirmDelete(member: Member) {
    showConfirm(
      '회원 삭제',
      `"${member.name}" 회원을 삭제할까요?`,
      () => deleteMutation.mutate(member.id),
    );
  }

  if (selectedMemberId != null) {
    return (
      <>
        <MemberDetailView
          member={selectedMember}
          attendances={memberAttendancesQuery.data ?? []}
          attendancesLoading={memberAttendancesQuery.isLoading}
          attendancesError={memberAttendancesQuery.error?.message}
          loading={membersQuery.isLoading || membersQuery.isFetching}
          error={membersQuery.error?.message}
          deleting={
            deleteMutation.isPending &&
            deleteMutation.variables === selectedMemberId
          }
          onBack={() => setSelectedMemberId(null)}
          onEdit={() => {
            if (selectedMember) openEdit(selectedMember);
          }}
          onDelete={() => {
            if (selectedMember) confirmDelete(selectedMember);
          }}
          onRefresh={() => {
            membersQuery.refetch();
            memberAttendancesQuery.refetch();
          }}
          refreshing={
            membersQuery.isRefetching || memberAttendancesQuery.isRefetching
          }
          topInset={insets.top}
          bottomInset={insets.bottom}
        />

        <Modal visible={modalVisible} animationType="slide" transparent>
          <View style={styles.modalBackdrop}>
            <View
              style={[
                styles.modalCard,
                { paddingBottom: Math.max(insets.bottom, 20) },
              ]}
            >
              <Text style={styles.modalTitle}>회원 정보 수정</Text>
              <Text style={styles.modalHint}>
                이름·성별·나이·급수를 수정합니다
              </Text>

              <Text style={styles.fieldLabel}>이름</Text>
              <TextInput
                style={styles.input}
                placeholder="이름"
                placeholderTextColor={colors.textSecondary}
                value={name}
                onChangeText={setName}
                maxLength={50}
                autoFocus
              />

              <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
                성별
              </Text>
              <View style={styles.genderRow}>
                {GENDER_OPTIONS.map((option) => {
                  const selected = gender === option;
                  return (
                    <Pressable
                      key={option}
                      accessibilityRole="button"
                      style={[
                        styles.genderBtn,
                        selected && styles.genderBtnSelected,
                      ]}
                      onPress={() =>
                        setGender((prev) => (prev === option ? null : option))
                      }
                    >
                      <Text
                        style={[
                          styles.genderBtnText,
                          selected && styles.genderBtnTextSelected,
                        ]}
                      >
                        {option}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>나이</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="예: 28"
                    placeholderTextColor={colors.textSecondary}
                    value={ageText}
                    onChangeText={setAgeText}
                    keyboardType="number-pad"
                    maxLength={3}
                  />
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>급수</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="예: A조 / 초심"
                    placeholderTextColor={colors.textSecondary}
                    value={grade}
                    onChangeText={setGrade}
                    maxLength={50}
                  />
                </View>
              </View>

              <View style={styles.modalActions}>
                <Pressable style={styles.cancelBtn} onPress={closeModal}>
                  <Text style={styles.cancelText}>취소</Text>
                </Pressable>
                <Pressable
                  style={[styles.saveBtn, saving && styles.disabled]}
                  disabled={saving}
                  onPress={submitForm}
                >
                  {saving ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.saveText}>저장</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.court, colors.courtMid, '#147A55']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 20 }]}
      >
        <View style={styles.courtLines} pointerEvents="none">
          <View style={[styles.courtLine, styles.courtLineTop]} />
          <View style={[styles.courtLine, styles.courtLineMid]} />
          <View style={styles.courtCircle} />
        </View>

        <Image
          source={require('../../assets/images/shuttlecock.jpg')}
          style={[styles.shuttlecock, { top: insets.top + 12 }]}
          resizeMode="cover"
          accessibilityLabel="셔틀콕"
        />

        <Animated.View style={[styles.heroCopy, heroAnimStyle]}>
          <Text style={styles.eyebrow}>CLUB DIRECTORY</Text>
          <Text style={styles.brand}>BADMINTON</Text>
          <Text style={styles.brandSub}>동호회 회원</Text>
          <View style={styles.heroActions}>
            <View style={styles.countPill}>
              <Text style={styles.countValue}>{members.length}</Text>
              <Text style={styles.countLabel}>명 활동 중</Text>
            </View>
            <Pressable style={styles.addBtn} onPress={openCreate}>
              <Text style={styles.addBtnText}>+ 등록</Text>
            </Pressable>
          </View>
        </Animated.View>
      </LinearGradient>

      <View style={styles.sheet}>
        <StateView
          loading={membersQuery.isLoading}
          error={membersQuery.error?.message}
          empty={!membersQuery.isLoading && members.length === 0}
          emptyText="상단의 + 등록으로 첫 회원을 추가하세요."
        >
          <FlatList
            data={filteredMembers}
            keyExtractor={(item) => String(item.id)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[
              styles.list,
              { paddingBottom: insets.bottom + 28 },
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={membersQuery.isRefetching}
                tintColor={colors.primary}
                colors={[colors.primary]}
                onRefresh={() => membersQuery.refetch()}
              />
            }
            ListHeaderComponent={
              <Animated.View entering={FadeInUp.duration(400).delay(120)}>
                <Text style={styles.sectionTitle}>회원 목록</Text>
                <View style={styles.searchBox}>
                  <TextInput
                    style={styles.searchInput}
                    placeholder="이름 검색"
                    placeholderTextColor={colors.textSecondary}
                    value={search}
                    onChangeText={setSearch}
                    autoCorrect={false}
                    autoCapitalize="none"
                    clearButtonMode="while-editing"
                  />
                  {search.length > 0 && (
                    <Pressable
                      style={styles.clearBtn}
                      onPress={() => setSearch('')}
                      hitSlop={8}
                    >
                      <Text style={styles.clearText}>지우기</Text>
                    </Pressable>
                  )}
                </View>
                <Text style={styles.searchMeta}>
                  {search.trim()
                    ? `${filteredMembers.length}명 검색됨 / 전체 ${members.length}명`
                    : `전체 ${members.length}명`}
                </Text>
              </Animated.View>
            }
            ListEmptyComponent={
              <View style={styles.searchEmpty}>
                <Text style={styles.searchEmptyText}>
                  “{search.trim()}”에 해당하는 회원이 없습니다
                </Text>
              </View>
            }
            renderItem={({ item, index }) => (
              <MemberRow
                member={item}
                index={index}
                deleting={
                  deleteMutation.isPending &&
                  deleteMutation.variables === item.id
                }
                onPress={() => setSelectedMemberId(item.id)}
                onEdit={() => openEdit(item)}
                onDelete={() => confirmDelete(item)}
              />
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        </StateView>

        {!membersQuery.isLoading &&
          !membersQuery.error &&
          members.length === 0 && (
            <View style={styles.emptyAction}>
              <Pressable style={styles.emptyAddBtn} onPress={openCreate}>
                <Text style={styles.emptyAddText}>회원 등록하기</Text>
              </Pressable>
            </View>
          )}
      </View>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              { paddingBottom: Math.max(insets.bottom, 20) },
            ]}
          >
            <Text style={styles.modalTitle}>
              {formMode === 'create' ? '새 회원 등록' : '회원 정보 수정'}
            </Text>
            <Text style={styles.modalHint}>
              {formMode === 'create'
                ? '이름·성별·나이·급수를 입력해 등록합니다'
                : '이름·성별·나이·급수를 수정합니다'}
            </Text>

            <Text style={styles.fieldLabel}>이름</Text>
            <TextInput
              style={styles.input}
              placeholder="이름"
              placeholderTextColor={colors.textSecondary}
              value={name}
              onChangeText={setName}
              maxLength={50}
              autoFocus
            />

            <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>성별</Text>
            <View style={styles.genderRow}>
              {GENDER_OPTIONS.map((option) => {
                const selected = gender === option;
                return (
                  <Pressable
                    key={option}
                    accessibilityRole="button"
                    style={[
                      styles.genderBtn,
                      selected && styles.genderBtnSelected,
                    ]}
                    onPress={() =>
                      setGender((prev) => (prev === option ? null : option))
                    }
                  >
                    <Text
                      style={[
                        styles.genderBtnText,
                        selected && styles.genderBtnTextSelected,
                      ]}
                    >
                      {option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.fieldRow}>
              <View style={styles.fieldHalf}>
                <Text style={styles.fieldLabel}>나이</Text>
                <TextInput
                  style={styles.input}
                  placeholder="예: 28"
                  placeholderTextColor={colors.textSecondary}
                  value={ageText}
                  onChangeText={setAgeText}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              </View>
              <View style={styles.fieldHalf}>
                <Text style={styles.fieldLabel}>급수</Text>
                <TextInput
                  style={styles.input}
                  placeholder="예: A조 / 초심"
                  placeholderTextColor={colors.textSecondary}
                  value={grade}
                  onChangeText={setGrade}
                  maxLength={50}
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={closeModal}>
                <Text style={styles.cancelText}>취소</Text>
              </Pressable>
              <Pressable
                style={[styles.saveBtn, saving && styles.disabled]}
                disabled={saving}
                onPress={submitForm}
              >
                {saving ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.saveText}>저장</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function MemberDetailView({
  member,
  attendances,
  attendancesLoading,
  attendancesError,
  loading,
  error,
  deleting,
  onBack,
  onEdit,
  onDelete,
  onRefresh,
  refreshing,
  topInset,
  bottomInset,
}: {
  member: Member | null;
  attendances: MemberAttendance[];
  attendancesLoading: boolean;
  attendancesError?: string;
  loading: boolean;
  error?: string;
  deleting: boolean;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  topInset: number;
  bottomInset: number;
}) {
  const wins = member?.wins ?? 0;
  const losses = member?.losses ?? 0;
  const total = wins + losses;
  const rate = winRatePercent(wins, losses);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.court, colors.courtMid, '#147A55']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.detailHero, { paddingTop: topInset + 12 }]}
      >
        <Pressable style={styles.backBtn} onPress={onBack} hitSlop={8}>
          <Text style={styles.backText}>← 목록</Text>
        </Pressable>

        {member ? (
          <>
            <View style={styles.detailAvatar}>
              <Text style={styles.detailAvatarText}>
                {member.name.slice(0, 1)}
              </Text>
            </View>
            <Text style={styles.detailName}>{member.name}</Text>
            <Text style={styles.detailSub}>
              {[
                member.gender,
                member.age != null ? `${member.age}세` : null,
                member.grade?.trim() || null,
              ]
                .filter(Boolean)
                .join(' · ') || '기본 정보 없음'}
            </Text>
          </>
        ) : (
          <Text style={styles.detailName}>
            {loading ? '불러오는 중…' : '회원을 찾을 수 없습니다'}
          </Text>
        )}
      </LinearGradient>

      <View style={[styles.detailBody, { paddingBottom: bottomInset + 24 }]}>
        <StateView
          loading={loading && !member}
          error={error}
          empty={!loading && !member}
          emptyText="목록으로 돌아가 다시 선택해 주세요."
        >
          {member && (
            <ScrollView
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  tintColor={colors.primary}
                  colors={[colors.primary]}
                  onRefresh={onRefresh}
                />
              }
              contentContainerStyle={styles.detailScroll}
            >
              <Animated.View entering={FadeInUp.duration(320)}>
              <Text style={styles.detailSection}>전적</Text>
              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{wins}</Text>
                  <Text style={styles.statLabel}>승</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{losses}</Text>
                  <Text style={styles.statLabel}>패</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>
                    {rate == null ? '-' : `${rate}%`}
                  </Text>
                  <Text style={styles.statLabel}>승률</Text>
                </View>
              </View>
              <Text style={styles.statHint}>총 {total}경기</Text>

              <Text style={[styles.detailSection, styles.detailSectionSpaced]}>
                출석
              </Text>
              {attendancesLoading && attendances.length === 0 ? (
                <View style={styles.heatmapLoading}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : attendancesError ? (
                <Text style={styles.heatmapError}>{attendancesError}</Text>
              ) : (
                <AttendanceHeatmap attendances={attendances} />
              )}

              <Text style={[styles.detailSection, styles.detailSectionSpaced]}>
                프로필
              </Text>
              <View style={styles.profileList}>
                <View style={styles.profileRow}>
                  <Text style={styles.profileKey}>성별</Text>
                  <Text style={styles.profileValue}>
                    {member.gender ?? '-'}
                  </Text>
                </View>
                <View style={styles.profileRow}>
                  <Text style={styles.profileKey}>나이</Text>
                  <Text style={styles.profileValue}>
                    {member.age != null ? `${member.age}세` : '-'}
                  </Text>
                </View>
                <View style={styles.profileRow}>
                  <Text style={styles.profileKey}>급수</Text>
                  <Text style={styles.profileValue}>
                    {member.grade?.trim() || '-'}
                  </Text>
                </View>
              </View>

              <View style={styles.detailActions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.detailEditBtn,
                    pressed && styles.actionPressed,
                  ]}
                  onPress={onEdit}
                >
                  <Text style={styles.detailEditText}>정보 수정</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    styles.detailDeleteBtn,
                    pressed && styles.actionPressed,
                  ]}
                  onPress={onDelete}
                  disabled={deleting}
                >
                  {deleting ? (
                    <ActivityIndicator color={colors.danger} />
                  ) : (
                    <Text style={styles.detailDeleteText}>회원 삭제</Text>
                  )}
                </Pressable>
              </View>
              </Animated.View>
            </ScrollView>
          )}
        </StateView>
      </View>
    </View>
  );
}

function MemberRow({
  member,
  index,
  deleting,
  onPress,
  onEdit,
  onDelete,
}: {
  member: Member;
  index: number;
  deleting: boolean;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(380).delay(80 + Math.min(index, 12) * 45)}
    >
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.actionPressed]}
        onPress={onPress}
      >
        <LinearGradient colors={['#1A8F60', '#0F5C45']} style={styles.avatar}>
          <Text style={styles.avatarText}>{member.name.slice(0, 1)}</Text>
        </LinearGradient>
        <View style={styles.info}>
          <Text style={styles.name}>{member.name}</Text>
          <Text style={styles.meta}>{formatMemberMeta(member)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.editBtn,
            pressed && styles.actionPressed,
          ]}
          onPress={(e) => {
            e?.stopPropagation?.();
            onEdit();
          }}
          hitSlop={8}
        >
          <Text style={styles.editText}>수정</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.deleteBtn,
            pressed && styles.actionPressed,
          ]}
          onPress={(e) => {
            e?.stopPropagation?.();
            onDelete();
          }}
          disabled={deleting}
          hitSlop={8}
        >
          {deleting ? (
            <ActivityIndicator size="small" color={colors.danger} />
          ) : (
            <Text style={styles.deleteText}>삭제</Text>
          )}
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  hero: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
    overflow: 'hidden',
    position: 'relative',
  },
  courtLines: {
    ...StyleSheet.absoluteFillObject,
  },
  courtLine: {
    position: 'absolute',
    left: 24,
    right: 24,
    height: 1,
    backgroundColor: 'rgba(184, 224, 106, 0.28)',
  },
  courtLineTop: {
    top: '38%',
  },
  courtLineMid: {
    top: '62%',
  },
  courtCircle: {
    position: 'absolute',
    right: -40,
    top: 24,
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1.5,
    borderColor: 'rgba(184, 224, 106, 0.22)',
  },
  shuttlecock: {
    position: 'absolute',
    right: -18,
    width: 168,
    height: 168,
    opacity: 0.88,
    transform: [{ rotate: '22deg' }],
    zIndex: 1,
  },
  heroCopy: {
    zIndex: 2,
    paddingRight: 96,
  },
  eyebrow: {
    fontFamily: fonts.display,
    fontSize: 14,
    letterSpacing: 3,
    color: colors.lime,
    marginBottom: 6,
  },
  brand: {
    fontFamily: fonts.display,
    fontSize: 52,
    lineHeight: 54,
    color: colors.textOnDark,
    letterSpacing: 1,
  },
  brandSub: {
    marginTop: 2,
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    color: colors.textOnDarkMuted,
  },
  heroActions: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  countPill: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(184, 224, 106, 0.35)',
  },
  countValue: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.lime,
    lineHeight: 30,
  },
  countLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textOnDark,
  },
  addBtn: {
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
    marginTop: -18,
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
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: fonts.body,
    color: colors.text,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },
  clearBtn: {
    paddingLeft: 8,
    paddingVertical: 8,
  },
  clearText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.primary,
  },
  searchMeta: {
    marginBottom: spacing.md,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
  },
  searchEmpty: {
    paddingVertical: 36,
    alignItems: 'center',
  },
  searchEmptyText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: {
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    color: colors.white,
  },
  info: {
    flex: 1,
  },
  name: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.text,
  },
  meta: {
    marginTop: 3,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    minHeight: 16,
  },
  editBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 48,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(22, 138, 90, 0.1)',
    marginRight: 6,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  editText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.primary,
  },
  deleteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 48,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(192, 57, 43, 0.08)',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  actionPressed: {
    opacity: 0.7,
  },
  deleteText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.danger,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.line,
    marginLeft: 62,
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
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 14,
  },
  emptyAddText: {
    fontFamily: fonts.bodyBold,
    color: colors.white,
    fontSize: 15,
  },
  detailHero: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 28,
  },
  backBtn: {
    alignSelf: 'flex-start',
    marginBottom: 14,
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  backText: {
    fontFamily: fonts.bodyMedium,
    color: colors.lime,
    fontSize: 14,
  },
  detailAvatar: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: 'rgba(184, 224, 106, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(184, 224, 106, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  detailAvatarText: {
    fontFamily: fonts.bodyBold,
    fontSize: 28,
    color: colors.lime,
  },
  detailName: {
    fontFamily: fonts.bodyBold,
    fontSize: 28,
    color: colors.textOnDark,
  },
  detailSub: {
    marginTop: 4,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textOnDarkMuted,
  },
  detailBody: {
    flex: 1,
    marginTop: -12,
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  detailScroll: {
    paddingBottom: 8,
  },
  detailSection: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  detailSectionSpaced: {
    marginTop: spacing.lg,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 16,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: fonts.display,
    fontSize: 32,
    lineHeight: 34,
    color: colors.primary,
  },
  statLabel: {
    marginTop: 4,
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textSecondary,
  },
  statHint: {
    marginTop: 10,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
  },
  heatmapLoading: {
    paddingVertical: 28,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  heatmapError: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.danger,
  },
  profileList: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  profileRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  profileKey: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.textSecondary,
  },
  profileValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.text,
  },
  detailActions: {
    marginTop: spacing.xl,
    gap: 10,
  },
  detailEditBtn: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  detailEditText: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.white,
  },
  detailDeleteBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(192, 57, 43, 0.08)',
  },
  detailDeleteText: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.danger,
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
  fieldLabelSpaced: {
    marginTop: 12,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 10,
  },
  genderBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
  },
  genderBtnSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  genderBtnText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.textSecondary,
  },
  genderBtnTextSelected: {
    color: colors.primary,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  fieldHalf: {
    flex: 1,
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
    minWidth: 80,
    alignItems: 'center',
  },
  saveText: {
    fontFamily: fonts.bodyBold,
    color: colors.white,
  },
  disabled: {
    opacity: 0.6,
  },
});
