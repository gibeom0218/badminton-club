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
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MonthCalendar } from '@/components/ui/MonthCalendar';
import { StateView } from '@/components/ui/StateView';
import { colors, fonts, spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import type { Match, Member, Session } from '@/types/api';

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDisplayDate(isoDate: string): string {
  // API는 YYYY-MM-DD를 주지만, ISO datetime이 오면 로컬 날짜 기준으로 표시
  const raw = String(isoDate ?? '');
  if (/^\d{4}-\d{2}-\d{2}/.test(raw) && !raw.includes('T')) {
    const [y, m, d] = raw.slice(0, 10).split('-');
    return `${y}.${m}.${d}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}.${m}.${d}`;
  }
  return raw;
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
  const [place, setPlace] = useState('일광초등학교');
  const [sessionDate, setSessionDate] = useState(todayIsoDate());
  const [memberSearch, setMemberSearch] = useState('');
  const [detailTab, setDetailTab] = useState<'attendance' | 'matches'>(
    'attendance',
  );
  const [matchModalVisible, setMatchModalVisible] = useState(false);
  const [teamA1, setTeamA1] = useState<number | null>(null);
  const [teamA2, setTeamA2] = useState<number | null>(null);
  const [teamB1, setTeamB1] = useState<number | null>(null);
  const [teamB2, setTeamB2] = useState<number | null>(null);
  const [scoreA, setScoreA] = useState('');
  const [scoreB, setScoreB] = useState('');
  const [pickingSlot, setPickingSlot] = useState<
    'a1' | 'a2' | 'b1' | 'b2' | null
  >(null);
  const [playerSearch, setPlayerSearch] = useState('');

  const slotLabels: Record<'a1' | 'a2' | 'b1' | 'b2', string> = {
    a1: 'A팀 선수 1',
    a2: 'A팀 선수 2',
    b1: 'B팀 선수 1',
    b2: 'B팀 선수 2',
  };

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

  const matchesQuery = useQuery({
    queryKey: ['sessions', selectedId, 'matches'],
    queryFn: () => api.getMatches(selectedId!),
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

  const createMatchMutation = useMutation({
    mutationFn: ({
      sessionId,
      payload,
    }: {
      sessionId: number;
      payload: Parameters<typeof api.createMatch>[1];
    }) => api.createMatch(sessionId, payload),
    onSuccess: () => {
      if (selectedId != null) {
        queryClient.invalidateQueries({
          queryKey: ['sessions', selectedId, 'matches'],
        });
      }
      queryClient.invalidateQueries({ queryKey: ['members'] });
      closeMatchModal();
    },
    onError: (err: Error) => showAlert('경기 등록 실패', err.message),
  });

  const deleteMatchMutation = useMutation({
    mutationFn: ({
      sessionId,
      matchId,
    }: {
      sessionId: number;
      matchId: number;
    }) => api.deleteMatch(sessionId, matchId),
    onSuccess: () => {
      if (selectedId != null) {
        queryClient.invalidateQueries({
          queryKey: ['sessions', selectedId, 'matches'],
        });
      }
      queryClient.invalidateQueries({ queryKey: ['members'] });
    },
    onError: (err: Error) => showAlert('경기 삭제 실패', err.message),
  });

  const sessions = sessionsQuery.data ?? [];
  const selected = sessionDetailQuery.data ?? null;
  const members = membersQuery.data ?? [];
  const matches = matchesQuery.data ?? [];

  const attendedMembers = useMemo(() => {
    const ids = new Set(selected?.attended_member_ids ?? []);
    return members.filter((m) => ids.has(m.id));
  }, [members, selected?.attended_member_ids]);

  const attendanceList = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    const attendedIds = new Set(selected?.attended_member_ids ?? []);
    const filtered = q
      ? members.filter((m) => m.name.toLowerCase().includes(q))
      : members;
    return [...filtered].sort((a, b) => {
      const aOn = attendedIds.has(a.id) ? 0 : 1;
      const bOn = attendedIds.has(b.id) ? 0 : 1;
      if (aOn !== bOn) return aOn - bOn;
      return a.name.localeCompare(b.name, 'ko');
    });
  }, [members, memberSearch, selected?.attended_member_ids]);

  const pickerCandidates = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    const selectedIds = new Set(
      [teamA1, teamA2, teamB1, teamB2].filter((id): id is number => id != null),
    );
    const list = q
      ? attendedMembers.filter((m) => m.name.toLowerCase().includes(q))
      : attendedMembers;
    return [...list].sort((a, b) => {
      const aTaken = selectedIds.has(a.id) ? 1 : 0;
      const bTaken = selectedIds.has(b.id) ? 1 : 0;
      if (aTaken !== bTaken) return aTaken - bTaken;
      return a.name.localeCompare(b.name, 'ko');
    });
  }, [attendedMembers, playerSearch, teamA1, teamA2, teamB1, teamB2]);

  function openCreate() {
    setTitle('정기 모임');
    setPlace('일광초등학교');
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

  function openMatchModal() {
    setTeamA1(null);
    setTeamA2(null);
    setTeamB1(null);
    setTeamB2(null);
    setScoreA('');
    setScoreB('');
    setPickingSlot(null);
    setPlayerSearch('');
    setMatchModalVisible(true);
  }

  function closeMatchModal() {
    setMatchModalVisible(false);
    setPickingSlot(null);
    setPlayerSearch('');
  }

  function openPlayerPicker(slot: 'a1' | 'a2' | 'b1' | 'b2') {
    setPlayerSearch('');
    setPickingSlot(slot);
  }

  function closePlayerPicker() {
    setPickingSlot(null);
    setPlayerSearch('');
  }

  function memberName(id: number | null): string {
    if (id == null) return '선수 선택';
    return members.find((m) => m.id === id)?.name ?? `회원 #${id}`;
  }

  function currentSlotMemberId(
    slot: 'a1' | 'a2' | 'b1' | 'b2' | null,
  ): number | null {
    if (slot === 'a1') return teamA1;
    if (slot === 'a2') return teamA2;
    if (slot === 'b1') return teamB1;
    if (slot === 'b2') return teamB2;
    return null;
  }

  function assignPlayer(slot: 'a1' | 'a2' | 'b1' | 'b2', memberId: number) {
    const taken = [teamA1, teamA2, teamB1, teamB2].filter(
      (id) => id != null && id !== currentSlotMemberId(slot),
    );
    if (taken.includes(memberId)) {
      showAlert('안내', '이미 다른 자리에 선택된 회원입니다.');
      return;
    }
    if (slot === 'a1') setTeamA1(memberId);
    if (slot === 'a2') setTeamA2(memberId);
    if (slot === 'b1') setTeamB1(memberId);
    if (slot === 'b2') setTeamB2(memberId);
    closePlayerPicker();
  }

  function submitMatch() {
    if (selectedId == null) return;
    if (teamA1 == null || teamA2 == null || teamB1 == null || teamB2 == null) {
      showAlert('안내', 'A팀·B팀 선수 4명을 모두 선택하세요.');
      return;
    }
    const a = Number(scoreA);
    const b = Number(scoreB);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
      showAlert('안내', '점수는 0 이상 정수로 입력하세요.');
      return;
    }
    if (a === b) {
      showAlert('안내', '동점은 등록할 수 없습니다.');
      return;
    }
    createMatchMutation.mutate({
      sessionId: selectedId,
      payload: {
        team_a_player1: teamA1,
        team_a_player2: teamA2,
        team_b_player1: teamB1,
        team_b_player2: teamB2,
        score_a: a,
        score_b: b,
      },
    });
  }

  function confirmDeleteMatch(match: Match) {
    if (selectedId == null) return;
    const message = `${match.score_a}:${match.score_b} 경기를 삭제할까요?`;
    if (Platform.OS === 'web') {
      if (window.confirm(message)) {
        deleteMatchMutation.mutate({
          sessionId: selectedId,
          matchId: match.id,
        });
      }
      return;
    }
    Alert.alert('경기 삭제', message, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () =>
          deleteMatchMutation.mutate({
            sessionId: selectedId,
            matchId: match.id,
          }),
      },
    ]);
  }

  if (selectedId != null) {
    return (
      <>
        <SessionDetailView
          session={selected}
          detailTab={detailTab}
          onDetailTabChange={setDetailTab}
          members={attendanceList}
          attendedMembers={attendedMembers}
          matches={matches}
          loading={
            sessionDetailQuery.isLoading ||
            membersQuery.isLoading ||
            (!!selectedId && sessionDetailQuery.isFetching && !selected)
          }
          matchesLoading={matchesQuery.isLoading}
          error={
            sessionDetailQuery.error?.message ??
            membersQuery.error?.message ??
            matchesQuery.error?.message
          }
          search={memberSearch}
          onSearchChange={setMemberSearch}
          onToggle={toggleAttendance}
          toggling={
            addAttendanceMutation.isPending ||
            removeAttendanceMutation.isPending
          }
          onOpenMatchModal={openMatchModal}
          onDeleteMatch={confirmDeleteMatch}
          deletingMatch={deleteMatchMutation.isPending}
          onBack={() => {
            setSelectedId(null);
            setMemberSearch('');
            setDetailTab('attendance');
            closeMatchModal();
          }}
          onRefresh={() => {
            sessionDetailQuery.refetch();
            membersQuery.refetch();
            matchesQuery.refetch();
          }}
          refreshing={
            sessionDetailQuery.isRefetching ||
            membersQuery.isRefetching ||
            matchesQuery.isRefetching
          }
          bottomInset={insets.bottom}
          topInset={insets.top}
        />

        <Modal
          visible={matchModalVisible}
          animationType="slide"
          transparent
        >
          <View style={styles.modalBackdrop}>
            <View
              style={[
                styles.modalCard,
                { paddingBottom: Math.max(insets.bottom, 20) },
              ]}
            >
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.modalTitle}>경기 등록</Text>
                <Text style={styles.modalHint}>
                  출석한 회원만 선택할 수 있습니다 (2 vs 2)
                </Text>

                {attendedMembers.length < 4 ? (
                  <Text style={styles.matchWarn}>
                    출석 인원이 4명 이상이어야 경기를 등록할 수 있습니다.
                  </Text>
                ) : (
                  <>
                    <Text style={styles.fieldLabel}>A팀</Text>
                    <View style={styles.teamRow}>
                      <Pressable
                        style={[
                          styles.playerPick,
                          teamA1 != null && styles.playerPickFilled,
                        ]}
                        onPress={() => openPlayerPicker('a1')}
                      >
                        <Text style={styles.playerPickLabel}>선수 1</Text>
                        <Text style={styles.playerPickText}>
                          {memberName(teamA1)}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.playerPick,
                          teamA2 != null && styles.playerPickFilled,
                        ]}
                        onPress={() => openPlayerPicker('a2')}
                      >
                        <Text style={styles.playerPickLabel}>선수 2</Text>
                        <Text style={styles.playerPickText}>
                          {memberName(teamA2)}
                        </Text>
                      </Pressable>
                    </View>

                    <Text style={[styles.fieldLabel, styles.fieldSpaced]}>
                      B팀
                    </Text>
                    <View style={styles.teamRow}>
                      <Pressable
                        style={[
                          styles.playerPick,
                          teamB1 != null && styles.playerPickFilled,
                        ]}
                        onPress={() => openPlayerPicker('b1')}
                      >
                        <Text style={styles.playerPickLabel}>선수 1</Text>
                        <Text style={styles.playerPickText}>
                          {memberName(teamB1)}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.playerPick,
                          teamB2 != null && styles.playerPickFilled,
                        ]}
                        onPress={() => openPlayerPicker('b2')}
                      >
                        <Text style={styles.playerPickLabel}>선수 2</Text>
                        <Text style={styles.playerPickText}>
                          {memberName(teamB2)}
                        </Text>
                      </Pressable>
                    </View>

                    <Text style={[styles.fieldLabel, styles.fieldSpaced]}>
                      점수
                    </Text>
                    <View style={styles.scoreRow}>
                      <TextInput
                        style={[styles.input, styles.scoreInput]}
                        value={scoreA}
                        onChangeText={setScoreA}
                        placeholder="A"
                        placeholderTextColor={colors.textSecondary}
                        keyboardType="number-pad"
                      />
                      <Text style={styles.scoreColon}>:</Text>
                      <TextInput
                        style={[styles.input, styles.scoreInput]}
                        value={scoreB}
                        onChangeText={setScoreB}
                        placeholder="B"
                        placeholderTextColor={colors.textSecondary}
                        keyboardType="number-pad"
                      />
                    </View>
                  </>
                )}

                <View style={styles.modalActions}>
                  <Pressable style={styles.cancelBtn} onPress={closeMatchModal}>
                    <Text style={styles.cancelText}>취소</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.saveBtn,
                      (createMatchMutation.isPending ||
                        attendedMembers.length < 4) &&
                        styles.disabled,
                    ]}
                    disabled={
                      createMatchMutation.isPending ||
                      attendedMembers.length < 4
                    }
                    onPress={submitMatch}
                  >
                    {createMatchMutation.isPending ? (
                      <ActivityIndicator color={colors.white} />
                    ) : (
                      <Text style={styles.saveText}>등록</Text>
                    )}
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal
          visible={pickingSlot != null}
          animationType="slide"
          transparent
          onRequestClose={closePlayerPicker}
        >
          <View style={styles.modalBackdrop}>
            <View
              style={[
                styles.pickerSheet,
                { paddingBottom: Math.max(insets.bottom, 16) },
              ]}
            >
              <View style={styles.pickerHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>
                    {pickingSlot ? slotLabels[pickingSlot] : '선수 선택'}
                  </Text>
                  <Text style={styles.modalHint}>
                    이름으로 검색한 뒤 탭해서 선택하세요
                  </Text>
                </View>
                <Pressable onPress={closePlayerPicker} hitSlop={8}>
                  <Text style={styles.clearText}>닫기</Text>
                </Pressable>
              </View>

              <View style={styles.searchBox}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="이름 검색"
                  placeholderTextColor={colors.textSecondary}
                  value={playerSearch}
                  onChangeText={setPlayerSearch}
                  autoCorrect={false}
                  autoCapitalize="none"
                  autoFocus
                />
                {playerSearch.length > 0 && (
                  <Pressable onPress={() => setPlayerSearch('')} hitSlop={8}>
                    <Text style={styles.clearText}>지우기</Text>
                  </Pressable>
                )}
              </View>

              <Text style={styles.searchResultHint}>
                {playerSearch.trim()
                  ? `"${playerSearch.trim()}" 결과 ${pickerCandidates.length}명`
                  : `출석 회원 ${pickerCandidates.length}명`}
              </Text>

              <FlatList
                data={pickerCandidates}
                keyExtractor={(item) => String(item.id)}
                keyboardShouldPersistTaps="handled"
                style={styles.pickerList}
                contentContainerStyle={
                  pickerCandidates.length === 0
                    ? styles.pickerListEmpty
                    : { paddingBottom: 8 }
                }
                ListEmptyComponent={
                  <View style={styles.emptyBox}>
                    <Text style={styles.emptyText}>
                      {playerSearch.trim()
                        ? '검색 결과가 없습니다'
                        : '출석한 회원이 없습니다'}
                    </Text>
                  </View>
                }
                ItemSeparatorComponent={() => (
                  <View style={styles.separator} />
                )}
                renderItem={({ item }) => {
                  const currentId = currentSlotMemberId(pickingSlot);
                  const takenElsewhere =
                    [teamA1, teamA2, teamB1, teamB2].includes(item.id) &&
                    item.id !== currentId;
                  const isCurrent = item.id === currentId;
                  return (
                    <Pressable
                      style={({ pressed }) => [
                        styles.pickerRow,
                        isCurrent && styles.pickerRowCurrent,
                        takenElsewhere && styles.pickerRowDisabled,
                        pressed && !takenElsewhere && styles.pressed,
                      ]}
                      disabled={takenElsewhere}
                      onPress={() => {
                        if (pickingSlot == null) return;
                        assignPlayer(pickingSlot, item.id);
                      }}
                    >
                      <View style={styles.pickerAvatar}>
                        <Text style={styles.pickerAvatarText}>
                          {item.name.slice(0, 1)}
                        </Text>
                      </View>
                      <View style={styles.memberInfo}>
                        <Text style={styles.pickerName}>{item.name}</Text>
                        <Text style={styles.memberMeta}>
                          {takenElsewhere
                            ? '다른 자리에 선택됨'
                            : isCurrent
                              ? '현재 선택'
                              : `${item.wins ?? 0}승 ${item.losses ?? 0}패`}
                        </Text>
                      </View>
                      {isCurrent && (
                        <Text style={styles.checkboxMarkOn}>✓</Text>
                      )}
                    </Pressable>
                  );
                }}
              />
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
        style={[styles.hero, { paddingTop: insets.top + 18 }]}
      >
        <Text style={styles.eyebrow}>SESSIONS</Text>
        <Text style={styles.brand}>정기 모임</Text>
        <Text style={styles.brandSub}>출석과 경기 결과를 한곳에서 관리하세요</Text>
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
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.modalTitle}>새 모임</Text>
              <Text style={styles.modalHint}>
                sessions 테이블에 저장됩니다
              </Text>

              <Text style={styles.fieldLabel}>날짜</Text>
              <Text style={styles.dateSelected}>
                {formatDisplayDate(sessionDate)}
              </Text>
              <MonthCalendar
                key={createVisible ? 'open' : 'closed'}
                value={sessionDate}
                onChange={setSessionDate}
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
                placeholder="일광초등학교"
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
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SessionDetailView({
  session,
  detailTab,
  onDetailTabChange,
  members,
  attendedMembers,
  matches,
  loading,
  matchesLoading,
  error,
  search,
  onSearchChange,
  onToggle,
  toggling,
  onOpenMatchModal,
  onDeleteMatch,
  deletingMatch,
  onBack,
  onRefresh,
  refreshing,
  bottomInset,
  topInset,
}: {
  session: Session | null;
  detailTab: 'attendance' | 'matches';
  onDetailTabChange: (tab: 'attendance' | 'matches') => void;
  members: Member[];
  attendedMembers: Member[];
  matches: Match[];
  loading: boolean;
  matchesLoading: boolean;
  error?: string;
  search: string;
  onSearchChange: (v: string) => void;
  onToggle: (memberId: number) => void;
  toggling: boolean;
  onOpenMatchModal: () => void;
  onDeleteMatch: (match: Match) => void;
  deletingMatch: boolean;
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
              <Text style={styles.checkSummaryLabel}>명 출석</Text>
              <Text style={styles.checkSummarySep}>·</Text>
              <Text style={styles.checkSummaryValue}>{matches.length}</Text>
              <Text style={styles.checkSummaryLabel}>경기</Text>
            </View>
          </>
        ) : (
          <Text style={styles.checkTitle}>모임 불러오는 중…</Text>
        )}

        <View style={styles.segment}>
          <Pressable
            style={[
              styles.segmentBtn,
              detailTab === 'attendance' && styles.segmentBtnOn,
            ]}
            onPress={() => onDetailTabChange('attendance')}
          >
            <Text
              style={[
                styles.segmentText,
                detailTab === 'attendance' && styles.segmentTextOn,
              ]}
            >
              출석
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.segmentBtn,
              detailTab === 'matches' && styles.segmentBtnOn,
            ]}
            onPress={() => onDetailTabChange('matches')}
          >
            <Text
              style={[
                styles.segmentText,
                detailTab === 'matches' && styles.segmentTextOn,
              ]}
            >
              경기
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.checkBody}>
        {detailTab === 'attendance' ? (
          <View style={styles.tabPanel}>
            <View style={styles.searchBox}>
              <TextInput
                style={styles.searchInput}
                placeholder="이름 검색"
                placeholderTextColor={colors.textSecondary}
                value={search}
                onChangeText={onSearchChange}
                autoCorrect={false}
                autoCapitalize="none"
                clearButtonMode="while-editing"
              />
              {search.length > 0 && (
                <Pressable onPress={() => onSearchChange('')} hitSlop={8}>
                  <Text style={styles.clearText}>지우기</Text>
                </Pressable>
              )}
            </View>
            <Text style={styles.searchResultHint}>
              {search.trim()
                ? `"${search.trim()}" 결과 ${members.length}명`
                : `전체 ${members.length}명 · 출석한 회원이 위에 표시됩니다`}
            </Text>

            <StateView
              loading={loading}
              error={error}
              empty={!loading && members.length === 0 && !search.trim()}
              emptyText="등록된 회원이 없습니다. 회원 탭에서 먼저 추가하세요."
            >
              <FlatList
                style={styles.flexList}
                data={members}
                keyExtractor={(item) => String(item.id)}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
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
                        style={[
                          styles.avatar,
                          checked && styles.avatarChecked,
                        ]}
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
                          {[
                            item.gender,
                            item.grade,
                            `${item.wins ?? 0}승 ${item.losses ?? 0}패`,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.checkbox,
                          checked && styles.checkboxOn,
                        ]}
                      >
                        {checked && (
                          <Text style={styles.checkboxMark}>✓</Text>
                        )}
                      </View>
                    </Pressable>
                  );
                }}
              />
            </StateView>
          </View>
        ) : (
          <>
            <View style={styles.matchToolbar}>
              <Text style={styles.matchCount}>
                {attendedMembers.length}명 출석 · {matches.length}경기
              </Text>
              <Pressable style={styles.matchAddBtn} onPress={onOpenMatchModal}>
                <Text style={styles.matchAddText}>+ 경기 등록</Text>
              </Pressable>
            </View>

            <StateView
              loading={matchesLoading || loading}
              error={error}
              empty={!matchesLoading && matches.length === 0}
              emptyText="아직 경기가 없습니다. 출석 후 경기를 등록하세요."
            >
              <FlatList
                data={matches}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={{ paddingBottom: bottomInset + 24 }}
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    tintColor={colors.primary}
                    colors={[colors.primary]}
                    onRefresh={onRefresh}
                  />
                }
                ItemSeparatorComponent={() => (
                  <View style={styles.separator} />
                )}
                renderItem={({ item }) => {
                  const aWon = item.score_a > item.score_b;
                  return (
                    <View style={styles.matchRow}>
                      <View style={styles.matchTeams}>
                        <Text
                          style={[
                            styles.matchTeamLine,
                            aWon && styles.matchWinner,
                          ]}
                        >
                          {item.team_a_player1_name} · {item.team_a_player2_name}
                        </Text>
                        <Text style={styles.matchVs}>vs</Text>
                        <Text
                          style={[
                            styles.matchTeamLine,
                            !aWon && styles.matchWinner,
                          ]}
                        >
                          {item.team_b_player1_name} · {item.team_b_player2_name}
                        </Text>
                      </View>
                      <View style={styles.matchRight}>
                        <Text style={styles.matchScore}>
                          {item.score_a}:{item.score_b}
                        </Text>
                        <Pressable
                          disabled={deletingMatch}
                          onPress={() => onDeleteMatch(item)}
                          hitSlop={8}
                        >
                          <Text style={styles.matchDelete}>삭제</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                }}
              />
            </StateView>
          </>
        )}
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
    maxHeight: '92%',
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
  dateSelected: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.primary,
    marginBottom: spacing.sm,
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
  checkSummarySep: {
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: colors.textOnDarkMuted,
    marginHorizontal: 2,
  },
  segment: {
    marginTop: 16,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  segmentBtnOn: {
    backgroundColor: colors.lime,
  },
  segmentText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.textOnDarkMuted,
  },
  segmentTextOn: {
    color: colors.court,
    fontFamily: fonts.bodyBold,
  },
  matchToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  matchCount: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textSecondary,
  },
  matchAddBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  matchAddText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.white,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  matchTeams: {
    flex: 1,
  },
  matchTeamLine: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textSecondary,
  },
  matchWinner: {
    fontFamily: fonts.bodyBold,
    color: colors.text,
  },
  matchVs: {
    marginVertical: 2,
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.textSecondary,
  },
  matchRight: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  matchScore: {
    fontFamily: fonts.display,
    fontSize: 28,
    color: colors.primary,
    lineHeight: 30,
  },
  matchDelete: {
    marginTop: 4,
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.danger,
  },
  matchWarn: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.danger,
    marginBottom: spacing.md,
  },
  teamRow: {
    flexDirection: 'row',
    gap: 8,
  },
  playerPick: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.background,
  },
  playerPickFilled: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  playerPickLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 2,
    textAlign: 'center',
  },
  playerPickText: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
  },
  pickerSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    height: '78%',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 4,
  },
  pickerList: {
    flex: 1,
  },
  pickerListEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  pickerRowCurrent: {
    backgroundColor: colors.primarySoft,
    marginHorizontal: -8,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  pickerRowDisabled: {
    opacity: 0.45,
  },
  pickerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  pickerAvatarText: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.primary,
  },
  pickerName: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.text,
  },
  checkboxMarkOn: {
    fontFamily: fonts.bodyBold,
    fontSize: 18,
    color: colors.primary,
  },
  searchResultHint: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  tabPanel: {
    flex: 1,
  },
  flexList: {
    flex: 1,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scoreInput: {
    flex: 1,
    textAlign: 'center',
  },
  scoreColon: {
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    color: colors.text,
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
