import React, { useState, useEffect } from 'react';
import {
  Dimensions,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { getTransactions } from '../storage';
import { Transaction } from '../parser';
import { Theme, CATEGORY_META } from '../theme';
import { useTheme, useThemedStyles } from '../themeContext';
import { PieChart } from 'react-native-chart-kit';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function getMonthLabel(offset: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - offset);
  return d.toLocaleString('default', { month: 'short' });
}

export default function InsightsScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const isFocused = useIsFocused();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [, setLoading] = useState(true);

  useEffect(() => {
    if (isFocused) loadData();
  }, [isFocused]);

  const loadData = async () => {
    setLoading(true);
    const list = await getTransactions();
    setTransactions(list);
    setLoading(false);
  };

  // ── Compute stats ──────────────────────────────────────────────
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const prevMonth = thisMonth === 0 ? 11 : thisMonth - 1;
  const prevYear = thisMonth === 0 ? thisYear - 1 : thisYear;

  const inRange = (tx: Transaction, month: number, year: number) => {
    const d = new Date(tx.date);
    return d.getMonth() === month && d.getFullYear() === year;
  };

  const thisMonthTx = transactions.filter(t => inRange(t, thisMonth, thisYear));
  const prevMonthTx = transactions.filter(t => inRange(t, prevMonth, prevYear));

  const totalExpense = (list: Transaction[]) =>
    list.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
  const totalIncome = (list: Transaction[]) =>
    list.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);

  const thisExpense = totalExpense(thisMonthTx);
  const prevExpense = totalExpense(prevMonthTx);
  const thisIncome = totalIncome(thisMonthTx);

  // Category totals (this month, expenses only)
  const catTotals: Record<string, number> = {};
  thisMonthTx.filter(t => t.type === 'debit').forEach(t => {
    catTotals[t.category] = (catTotals[t.category] || 0) + t.amount;
  });

  const sortedCats = Object.entries(catTotals)
    .filter(([c]) => c !== 'Salary')
    .sort(([, a], [, b]) => b - a);

  const maxCat = sortedCats[0]?.[1] ?? 1;

  // Top merchants (deduplicated by description)
  const merchantMap: Record<string, number> = {};
  thisMonthTx.filter(t => t.type === 'debit').forEach(t => {
    merchantMap[t.description] = (merchantMap[t.description] || 0) + t.amount;
  });
  const topMerchants = Object.entries(merchantMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  // Chart data
  const chartData = sortedCats.map(([cat, amount]) => {
    const meta = CATEGORY_META[cat] ?? { emoji: '🏷️', color: theme.colors.chart[0] };
    return {
      name: cat,
      amount,
      color: meta.color,
      legendFontColor: theme.colors.textMuted,
      legendFontSize: 10,
    };
  });

  // Month-over-month delta
  const delta = thisExpense - prevExpense;
  const deltaSign = delta < 0 ? '-' : '+';
  const deltaColor = delta < 0 ? theme.colors.success : theme.colors.danger;

  const isEmpty = thisMonthTx.length === 0;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle={theme.isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerLabel}>INSIGHTS</Text>
          <Text style={styles.headerTitle}>Spending Overview</Text>
        </View>

        {isEmpty ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📊</Text>
            <Text style={styles.emptyTitle}>No data yet</Text>
            <Text style={styles.emptyHint}>
              Sync your SMS or add transactions to see insights here.
            </Text>
          </View>
        ) : (
          <>
            {/* ── Monthly summary pills ── */}
            <View style={styles.summaryRow}>
              <View style={[styles.summaryPill, { backgroundColor: theme.colors.successSubtle }]}>
                <Text style={styles.summaryPillLabel}>Income</Text>
                <Text style={[styles.summaryPillAmt, { color: theme.colors.success }]}>
                  Br {thisIncome.toLocaleString('en-US', { minimumFractionDigits: 0 })}
                </Text>
              </View>
              <View style={[styles.summaryPill, { backgroundColor: theme.colors.dangerSubtle }]}>
                <Text style={styles.summaryPillLabel}>Spent</Text>
                <Text style={[styles.summaryPillAmt, { color: theme.colors.danger }]}>
                  Br {thisExpense.toLocaleString('en-US', { minimumFractionDigits: 0 })}
                </Text>
              </View>
              <View style={[styles.summaryPill, { backgroundColor: theme.colors.primarySubtle }]}>
                <Text style={styles.summaryPillLabel}>Saved</Text>
                <Text style={[styles.summaryPillAmt, { color: theme.colors.primary }]}>
                  Br {(thisIncome - thisExpense).toLocaleString('en-US', { minimumFractionDigits: 0 })}
                </Text>
              </View>
            </View>

            {/* ── Spending donut ── */}
            {chartData.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Spending by Category</Text>
                <Text style={styles.cardSub}>{getMonthLabel(0)}</Text>
                <View style={styles.chartWrap}>
                  <PieChart
                    data={chartData}
                    width={SCREEN_WIDTH - 48}
                    height={180}
                    chartConfig={{
                      backgroundColor: 'transparent',
                      backgroundGradientFrom: theme.colors.surface,
                      backgroundGradientTo: theme.colors.surface,
                      color: (opacity = 1) => `rgba(255,255,255,${opacity})`,
                    }}
                    accessor="amount"
                    backgroundColor="transparent"
                    paddingLeft="0"
                    center={[10, 0]}
                    hasLegend={true}
                    absolute={false}
                  />
                </View>

                {/* Category bars */}
                {sortedCats.map(([cat, amount]) => {
                  const meta = CATEGORY_META[cat] ?? { emoji: '🏷️', color: theme.colors.primary };
                  const pct = amount / maxCat;
                  return (
                    <View key={cat} style={styles.barRow}>
                      <Text style={styles.barEmoji}>{meta.emoji}</Text>
                      <View style={styles.barMid}>
                        <Text style={styles.barLabel}>{cat}</Text>
                        <View style={styles.barTrack}>
                          <View
                            style={[
                              styles.barFill,
                              { width: `${Math.round(pct * 100)}%`, backgroundColor: meta.color },
                            ]}
                          />
                        </View>
                      </View>
                      <Text style={[styles.barAmt, { color: meta.color }]}>
                        {amount.toLocaleString('en-US', { minimumFractionDigits: 0 })}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* ── Top merchants ── */}
            {topMerchants.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Top Merchants</Text>
                <Text style={styles.cardSub}>{getMonthLabel(0)} · expenses</Text>
                {topMerchants.map(([merchant, amount], i) => (
                  <View key={merchant} style={styles.merchantRow}>
                    <View style={styles.merchantRank}>
                      <Text style={styles.merchantRankText}>#{i + 1}</Text>
                    </View>
                    <Text style={styles.merchantName} numberOfLines={1}>{merchant}</Text>
                    <Text style={styles.merchantAmt}>
                      Br {amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* ── Month-over-month ── */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Month-over-Month</Text>
              <Text style={styles.cardSub}>Spending comparison</Text>

              <View style={styles.momRow}>
                {/* Prev month bar */}
                <View style={styles.momBar}>
                  <Text style={styles.momBarLabel}>{getMonthLabel(1)}</Text>
                  <View style={styles.momBarTrack}>
                    <View
                      style={[
                        styles.momBarFill,
                        {
                          height: prevExpense > 0
                            ? `${Math.round((prevExpense / Math.max(prevExpense, thisExpense)) * 100)}%`
                            : '4%',
                          backgroundColor: theme.colors.textMuted,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.momBarAmt}>
                    {prevExpense > 0
                      ? `${(prevExpense / 1000).toFixed(1)}k`
                      : '—'}
                  </Text>
                </View>

                {/* Delta chip */}
                <View style={styles.momDelta}>
                  <Text style={[styles.momDeltaText, { color: deltaColor }]}>
                    {deltaSign}Br{Math.abs(delta).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                  </Text>
                  <Text style={styles.momDeltaSub}>vs last mo.</Text>
                </View>

                {/* This month bar */}
                <View style={styles.momBar}>
                  <Text style={styles.momBarLabel}>{getMonthLabel(0)}</Text>
                  <View style={styles.momBarTrack}>
                    <View
                      style={[
                        styles.momBarFill,
                        {
                          height: thisExpense > 0
                            ? `${Math.round((thisExpense / Math.max(prevExpense, thisExpense)) * 100)}%`
                            : '4%',
                          backgroundColor: theme.colors.primary,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.momBarAmt}>
                    {thisExpense > 0
                      ? `${(thisExpense / 1000).toFixed(1)}k`
                      : '—'}
                  </Text>
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { paddingHorizontal: 16, paddingBottom: 100 },

  header: {
    paddingTop: theme.statusBarHeight + 12,
    marginBottom: 20,
  },
  headerLabel: {
    color: theme.colors.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 26,
    fontWeight: '800',
    marginTop: 2,
  },

  // Summary pills
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  summaryPill: {
    flex: 1,
    borderRadius: theme.borderRadius.md,
    padding: 14,
    alignItems: 'center',
  },
  summaryPillLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  summaryPillAmt: {
    fontSize: 14,
    fontWeight: '900',
  },

  // Cards
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 20,
    marginBottom: 16,
    ...theme.shadow.sm,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  cardSub: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginTop: 2,
    marginBottom: 16,
  },
  chartWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },

  // Category bars
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  barEmoji: { fontSize: 18, width: 24, textAlign: 'center' },
  barMid: { flex: 1, gap: 4 },
  barLabel: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600' },
  barTrack: {
    height: 6,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 3 },
  barAmt: { fontSize: 13, fontWeight: '800', minWidth: 48, textAlign: 'right' },

  // Merchants
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: 10,
  },
  merchantRank: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.colors.primarySubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  merchantRankText: { color: theme.colors.primary, fontSize: 11, fontWeight: '800' },
  merchantName: { color: theme.colors.text, fontSize: 14, fontWeight: '600', flex: 1 },
  merchantAmt: { color: theme.colors.danger, fontSize: 13, fontWeight: '800' },

  // Month-over-month
  momRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    height: 160,
    gap: 0,
  },
  momBar: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
  },
  momBarLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  momBarTrack: {
    width: 36,
    flex: 1,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 6,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  momBarFill: {
    width: '100%',
    borderRadius: 6,
  },
  momBarAmt: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  momDelta: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingBottom: 28,
  },
  momDeltaText: { fontSize: 14, fontWeight: '900' },
  momDeltaSub: { color: theme.colors.textMuted, fontSize: 10, marginTop: 2 },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  emptyEmoji: { fontSize: 56, marginBottom: 16 },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptyHint: {
    color: theme.colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
});
