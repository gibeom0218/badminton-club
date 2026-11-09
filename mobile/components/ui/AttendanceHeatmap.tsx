import { useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, fonts, spacing } from '@/constants/theme';
import type { MemberAttendance } from '@/types/api';

const WEEK_COUNT = 20;
const DAY_LABELS = ['일', '', '화', '', '목', '', '토'];
const CELL = 12;
const GAP = 3;
const LABEL_WIDTH = 18;

function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatTooltipDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${y}.${m}.${d}`;
}

function cellColor(count: number): string {
  if (count <= 0) return '#E4EEE8';
  if (count === 1) return '#9BD4B5';
  if (count === 2) return '#4CAA7A';
  return colors.court;
}

type DayCell = {
  iso: string;
  count: number;
  inRange: boolean;
  weekIndex: number;
  dayIndex: number;
};

type TooltipState = {
  iso: string;
  text: string;
  left: number;
  top: number;
};

type Props = {
  attendances: MemberAttendance[];
};

export function AttendanceHeatmap({ attendances }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [scrollX, setScrollX] = useState(0);

  const { weeks, monthLabels, totalDays } = useMemo(() => {
    const countByDate = new Map<string, number>();
    for (const row of attendances) {
      const key = String(row.session_date).slice(0, 10);
      countByDate.set(key, (countByDate.get(key) ?? 0) + 1);
    }

    const today = startOfLocalDay(new Date());
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - end.getDay()));

    const start = new Date(end);
    start.setDate(start.getDate() - (WEEK_COUNT * 7 - 1));

    const builtWeeks: DayCell[][] = [];
    const labels: Array<{ index: number; text: string }> = [];
    let cursor = new Date(start);
    let lastMonth = -1;

    for (let w = 0; w < WEEK_COUNT; w += 1) {
      const col: DayCell[] = [];
      for (let d = 0; d < 7; d += 1) {
        const iso = toLocalIso(cursor);
        const inRange = cursor.getTime() <= today.getTime();
        const count = inRange ? (countByDate.get(iso) ?? 0) : 0;
        if (d === 0) {
          const month = cursor.getMonth();
          if (month !== lastMonth) {
            labels.push({ index: w, text: `${month + 1}월` });
            lastMonth = month;
          }
        }
        col.push({
          iso,
          count,
          inRange,
          weekIndex: w,
          dayIndex: d,
        });
        cursor.setDate(cursor.getDate() + 1);
      }
      builtWeeks.push(col);
    }

    return {
      weeks: builtWeeks,
      monthLabels: labels,
      totalDays: attendances.length,
    };
  }, [attendances]);

  function showTooltip(day: DayCell) {
    if (day.count <= 0) return;
    const text = formatTooltipDate(day.iso);

    // 격자 기준 좌표 → 스크롤 보정 후 칸 오른쪽 위에 고정 (레이아웃 점유 없음)
    const left =
      LABEL_WIDTH +
      2 +
      day.weekIndex * (CELL + GAP) +
      CELL +
      6 -
      scrollX;
    const top = 16 + 4 + day.dayIndex * (CELL + GAP) - 4;

    setTooltip({ iso: day.iso, text, left, top });
  }

  function hideTooltip(iso?: string) {
    setTooltip((prev) => {
      if (!prev) return null;
      if (iso && prev.iso !== iso) return prev;
      return null;
    });
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>출석 잔디</Text>
        <Text style={styles.count}>{totalDays}회</Text>
      </View>
      <Text style={styles.hint}>최근 {WEEK_COUNT}주 · 초록은 출석한 날</Text>

      <View style={styles.gridWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          onScroll={(e) => setScrollX(e.nativeEvent.contentOffset.x)}
          scrollEventThrottle={16}
          onMomentumScrollEnd={() => hideTooltip()}
        >
          <View>
            <View style={styles.monthRow}>
              {monthLabels.map((label) => (
                <Text
                  key={`${label.index}-${label.text}`}
                  style={[
                    styles.monthLabel,
                    { left: label.index * (CELL + GAP) + LABEL_WIDTH },
                  ]}
                >
                  {label.text}
                </Text>
              ))}
            </View>

            <View style={styles.gridRow}>
              <View style={styles.dayLabels}>
                {DAY_LABELS.map((label, idx) => (
                  <Text key={`d-${idx}`} style={styles.dayLabel}>
                    {label}
                  </Text>
                ))}
              </View>
              <View style={styles.weeks}>
                {weeks.map((week, wi) => (
                  <View key={`w-${wi}`} style={styles.weekCol}>
                    {week.map((day) => {
                      if (!day.inRange) {
                        return <View key={day.iso} style={styles.cell} />;
                      }
                      const attended = day.count > 0;
                      return (
                        <Pressable
                          key={day.iso}
                          accessibilityRole="button"
                          accessibilityLabel={`${formatTooltipDate(day.iso)}${
                            attended ? `, ${day.count}회 출석` : ', 출석 없음'
                          }`}
                          disabled={!attended}
                          onHoverIn={() => showTooltip(day)}
                          onHoverOut={() => hideTooltip(day.iso)}
                          onPress={() => {
                            if (!attended) return;
                            if (tooltip?.iso === day.iso) {
                              hideTooltip(day.iso);
                            } else {
                              showTooltip(day);
                            }
                          }}
                          style={[
                            styles.cell,
                            { backgroundColor: cellColor(day.count) },
                            Platform.OS === 'web'
                              ? ({
                                  cursor: attended ? 'pointer' : 'default',
                                } as object)
                              : null,
                          ]}
                        />
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>
          </View>
        </ScrollView>

        {tooltip ? (
          <View
            pointerEvents="none"
            style={[
              styles.floatingTooltip,
              { left: Math.max(4, tooltip.left), top: tooltip.top },
            ]}
          >
            <Text style={styles.floatingTooltipText}>{tooltip.text}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.legend}>
        <Text style={styles.legendText}>적음</Text>
        {[0, 1, 2, 3].map((level) => (
          <View
            key={level}
            style={[styles.legendCell, { backgroundColor: cellColor(level) }]}
          />
        ))}
        <Text style={styles.legendText}>많음</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: colors.text,
  },
  count: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.primary,
  },
  hint: {
    marginTop: 2,
    marginBottom: spacing.sm,
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textSecondary,
  },
  gridWrap: {
    position: 'relative',
  },
  floatingTooltip: {
    position: 'absolute',
    zIndex: 20,
    maxWidth: 200,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(11, 61, 46, 0.94)',
  },
  floatingTooltipText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    color: colors.textOnDark,
  },
  scrollContent: {
    paddingRight: 4,
  },
  monthRow: {
    height: 16,
    marginLeft: LABEL_WIDTH,
    marginBottom: 4,
    position: 'relative',
  },
  monthLabel: {
    position: 'absolute',
    top: 0,
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.textSecondary,
  },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  dayLabels: {
    width: LABEL_WIDTH,
    marginRight: 2,
  },
  dayLabel: {
    height: CELL,
    marginBottom: GAP,
    fontFamily: fonts.body,
    fontSize: 9,
    lineHeight: CELL,
    color: colors.textSecondary,
  },
  weeks: {
    flexDirection: 'row',
    gap: GAP,
  },
  weekCol: {
    width: CELL,
    gap: GAP,
  },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: 3,
  },
  legend: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  legendText: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.textSecondary,
    marginHorizontal: 2,
  },
  legendCell: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
});
