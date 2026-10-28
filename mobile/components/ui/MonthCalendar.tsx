import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, spacing } from '@/constants/theme';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIsoLocal(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

type Props = {
  value: string;
  onChange: (isoDate: string) => void;
};

export function MonthCalendar({ value, onChange }: Props) {
  const selected = parseIsoLocal(value);
  const [cursor, setCursor] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1),
  );

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: Array<{ key: string; day: number | null; iso: string | null }> =
      [];

    for (let i = 0; i < firstDow; i += 1) {
      out.push({ key: `e-${i}`, day: null, iso: null });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = toIsoDate(new Date(year, month, day));
      out.push({ key: iso, day, iso });
    }
    while (out.length % 7 !== 0) {
      out.push({ key: `t-${out.length}`, day: null, iso: null });
    }
    return out;
  }, [cursor]);

  const title = `${cursor.getFullYear()}년 ${cursor.getMonth() + 1}월`;
  const todayIso = toIsoDate(new Date());

  function shiftMonth(delta: number) {
    setCursor(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1),
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}
          onPress={() => shiftMonth(-1)}
          accessibilityLabel="이전 달"
        >
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>{title}</Text>
        <Pressable
          style={({ pressed }) => [styles.navBtn, pressed && styles.pressed]}
          onPress={() => shiftMonth(1)}
          accessibilityLabel="다음 달"
        >
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((label) => (
          <Text
            key={label}
            style={[
              styles.weekday,
              label === '일' && styles.sunday,
              label === '토' && styles.saturday,
            ]}
          >
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell) => {
          if (cell.day == null || cell.iso == null) {
            return <View key={cell.key} style={styles.cell} />;
          }
          const isSelected = cell.iso === value.slice(0, 10);
          const isToday = cell.iso === todayIso;
          return (
            <Pressable
              key={cell.key}
              style={({ pressed }) => [
                styles.cell,
                isSelected && styles.cellSelected,
                pressed && !isSelected && styles.pressed,
              ]}
              onPress={() => onChange(cell.iso!)}
            >
              <Text
                style={[
                  styles.dayText,
                  isToday && !isSelected && styles.todayText,
                  isSelected && styles.dayTextSelected,
                ]}
              >
                {cell.day}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    backgroundColor: colors.background,
    padding: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    paddingHorizontal: 4,
  },
  title: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.text,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navText: {
    fontSize: 24,
    lineHeight: 28,
    color: colors.primary,
    fontFamily: fonts.bodyBold,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: colors.textSecondary,
    paddingVertical: 4,
  },
  sunday: {
    color: colors.danger,
  },
  saturday: {
    color: colors.primary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  cellSelected: {
    backgroundColor: colors.primary,
  },
  dayText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: colors.text,
  },
  todayText: {
    color: colors.primary,
    fontFamily: fonts.bodyBold,
  },
  dayTextSelected: {
    color: colors.white,
    fontFamily: fonts.bodyBold,
  },
  pressed: {
    opacity: 0.7,
  },
});
