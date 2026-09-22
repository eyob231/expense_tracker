import React, { useState, useEffect } from 'react';
import {
  FlatList,
  Modal,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { getTransactions, deleteTransaction, updateTransaction } from '../storage';
import { Transaction, Category } from '../parser';
import { Theme, CATEGORY_META } from '../theme';
import { useTheme, useThemedStyles } from '../themeContext';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { SkeletonTxCard } from '../components/SkeletonCard';

const CATEGORIES: Category[] = [
  'Food & Dining', 'Shopping', 'Transportation', 'Salary', 'UPI Transfers', 'Other',
];

const FILTER_TABS = [
  { key: 'all',    label: 'All' },
  { key: 'debit',  label: 'Expenses' },
  { key: 'credit', label: 'Income' },
  ...CATEGORIES.map(c => ({ key: c, label: c })),
];

const PAGE_SIZE = 15;

function dayLabel(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TransactionsScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const isFocused = useIsFocused();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [editCategory, setEditCategory] = useState<Category>('Other');
  const [editDescription, setEditDescription] = useState('');

  useEffect(() => { if (isFocused) loadData(); }, [isFocused]);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [search, activeFilter]);

  const loadData = async () => {
    setLoading(true);
    const list = await getTransactions();
    setTransactions(list);
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    Alert.alert('Delete Transaction', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const updated = await deleteTransaction(id);
          setTransactions(updated);
          if (selectedTx?.id === id) setSelectedTx(null);
        },
      },
    ]);
  };

  const handleUpdate = async () => {
    if (!selectedTx) return;
    const updated = await updateTransaction({
      ...selectedTx,
      category: editCategory,
      description: editDescription,
      isReviewed: true,
    });
    setTransactions(updated);
    setSelectedTx(null);
  };

  const filtered = transactions.filter(tx => {
    const q = search.toLowerCase();
    const matchSearch =
      tx.description.toLowerCase().includes(q) || tx.sender.toLowerCase().includes(q);
    let matchFilter = true;
    if (activeFilter === 'debit') matchFilter = tx.type === 'debit';
    else if (activeFilter === 'credit') matchFilter = tx.type === 'credit';
    else if (activeFilter !== 'all') matchFilter = tx.category === activeFilter;
    return matchSearch && matchFilter;
  });

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // Totals for whatever is currently filtered — the numbers that matter most
  const filteredExpense = filtered.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
  const filteredIncome = filtered.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);

  // Group by day for section-style display
  const grouped: { dateStr: string; txs: Transaction[] }[] = [];
  visible.forEach(tx => {
    const dateStr = new Date(tx.date).toDateString();
    const existing = grouped.find(g => g.dateStr === dateStr);
    if (existing) existing.txs.push(tx);
    else grouped.push({ dateStr, txs: [tx] });
  });

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle={theme.isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />

      {/* ── HEADER ── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.pageLabel}>LEDGER</Text>
          <Text style={styles.pageTitle}>All Transactions</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.countChip}>{filtered.length}</Text>
        </View>
      </View>

      {/* ── SEARCH ── */}
      <View style={styles.searchWrap}>
        <Icon name="magnify" size={18} color={theme.colors.textMuted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search transactions…"
          placeholderTextColor={theme.colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} accessibilityLabel="Clear search">
            <Icon name="close-circle" size={16} color={theme.colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── FILTER CHIPS ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
        alwaysBounceHorizontal={false}
      >
        {FILTER_TABS.map(f => {
          const active = activeFilter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setActiveFilter(f.key)}
              accessibilityRole="button"
              accessibilityLabel={`Filter by ${f.label}`}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── FILTERED SUMMARY ── */}
      {!loading && filtered.length > 0 && (
        <View style={styles.summaryStrip}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>SPENT</Text>
            <Text style={[styles.summaryValue, { color: theme.colors.danger }]}>
              Br {fmt(filteredExpense)}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>RECEIVED</Text>
            <Text style={[styles.summaryValue, { color: theme.colors.success }]}>
              Br {fmt(filteredIncome)}
            </Text>
          </View>
        </View>
      )}

      {/* ── LIST ── */}
      {loading ? (
        <View style={styles.body}>
          {[...Array(6)].map((_, i) => <SkeletonTxCard key={i} />)}
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🔍</Text>
          <Text style={styles.emptyTitle}>No transactions found</Text>
          <Text style={styles.emptyHint}>Try a different search or filter</Text>
        </View>
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={item => item.dateStr}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          renderItem={({ item: group }) => (
            <View>
              {/* Day header */}
              <View style={styles.dayRow}>
                <View style={styles.dayDot} />
                <Text style={styles.dayLabel}>{dayLabel(group.dateStr)}</Text>
                <View style={styles.dayLine} />
                <Text style={styles.dayTotal}>
                  {group.txs.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0) > 0
                    ? `-Br ${fmt(group.txs.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0))}`
                    : ''}
                </Text>
              </View>
              {group.txs.map(tx => {
                const meta = CATEGORY_META[tx.category] ?? { emoji: '🏷️', color: theme.colors.textMuted };
                const isDebit = tx.type === 'debit';
                return (
                  <TouchableOpacity
                    key={tx.id}
                    style={styles.txCard}
                    onPress={() => {
                      setSelectedTx(tx);
                      setEditCategory(tx.category as Category);
                      setEditDescription(tx.description);
                    }}
                    activeOpacity={0.75}
                    accessibilityLabel={`${tx.description} ${isDebit ? 'expense' : 'income'} ${tx.amount} ETB`}
                  >
                    <View style={[styles.txIcon, { backgroundColor: meta.color + '20' }]}>
                      <Text style={{ fontSize: 20 }}>{meta.emoji}</Text>
                    </View>
                    <View style={styles.txMid}>
                      <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>
                      <View style={styles.txMetaRow}>
                        <Text style={styles.txMeta}>
                          {new Date(tx.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                          {' · '}{tx.sender.toUpperCase()}
                        </Text>
                        {tx.isManual && (
                          <View style={styles.badgeManual}>
                            <Text style={styles.badgeManualText}>Manual</Text>
                          </View>
                        )}
                        {!tx.isReviewed && !tx.isManual && (
                          <View style={styles.badgeNew}>
                            <Text style={styles.badgeNewText}>New</Text>
                          </View>
                        )}
                      </View>
                    </View>
                    <View style={styles.txRight}>
                      <Text style={[styles.txAmt, isDebit ? styles.debit : styles.credit]}>
                        {isDebit ? '-' : '+'}Br {fmt(tx.amount)}
                      </Text>
                      {tx.balance > 0 && (
                        <Text style={styles.txBal}>Bal {fmt(tx.balance)}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          onEndReached={hasMore ? () => setVisibleCount(c => c + PAGE_SIZE) : undefined}
          onEndReachedThreshold={0.4}
          ListFooterComponent={() => (
            <View style={styles.listFooter}>
              <Text style={styles.listFooterText}>
                Showing {visible.length} of {filtered.length}
              </Text>
              {hasMore && (
                <TouchableOpacity
                  style={styles.loadMoreBtn}
                  onPress={() => setVisibleCount(c => c + PAGE_SIZE)}
                  accessibilityLabel="Load more transactions"
                >
                  <Icon name="chevron-down" size={16} color={theme.colors.primary} />
                  <Text style={styles.loadMoreText}>Load more</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        />
      )}

      {/* ── EDIT BOTTOM SHEET ── */}
      {selectedTx && (
        <Modal transparent visible animationType="slide" onRequestClose={() => setSelectedTx(null)}>
          <View style={styles.sheetOverlay}>
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />

              {/* Amount badge */}
              <View style={[
                styles.amtBadge,
                selectedTx.type === 'debit' ? styles.amtBadgeDebit : styles.amtBadgeCredit,
              ]}>
                <Text style={styles.amtBadgeText}>
                  {selectedTx.type === 'debit' ? '📉 -' : '📈 +'}Br {fmt(selectedTx.amount)}
                </Text>
              </View>

              <Text style={styles.sheetTitle}>
                {selectedTx.type === 'debit' ? 'Expense' : 'Income'} · {selectedTx.sender.toUpperCase()}
              </Text>
              <Text style={styles.sheetDate}>
                {new Date(selectedTx.date).toLocaleString(undefined, {
                  weekday: 'short', month: 'short', day: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </Text>

              <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetBody}>
                {/* Raw SMS */}
                {selectedTx.rawMessage ? (
                  <>
                    <Text style={styles.fieldLabel}>📨 Original SMS</Text>
                    <View style={styles.rawBox}>
                      <Text style={styles.rawText}>{selectedTx.rawMessage}</Text>
                    </View>
                  </>
                ) : null}

                {selectedTx.balance > 0 && (
                  <View style={styles.balRow}>
                    <Text style={styles.balLabel}>Balance after</Text>
                    <Text style={styles.balValue}>Br {fmt(selectedTx.balance)}</Text>
                  </View>
                )}

                <Text style={styles.fieldLabel}>✏️ Description</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholderTextColor={theme.colors.textMuted}
                />

                <Text style={styles.fieldLabel}>🏷️ Category</Text>
                <View style={styles.catGrid}>
                  {CATEGORIES.map(cat => {
                    const meta = CATEGORY_META[cat] ?? { emoji: '🏷️', color: theme.colors.primary };
                    const active = editCategory === cat;
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.catItem, active && { borderColor: meta.color, backgroundColor: meta.color + '18' }]}
                        onPress={() => setEditCategory(cat)}
                      >
                        <Text style={styles.catEmoji}>{meta.emoji}</Text>
                        <Text style={[styles.catText, active && { color: meta.color, fontWeight: '700' }]}>
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              <View style={styles.sheetActions}>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleDelete(selectedTx.id)}
                  accessibilityLabel="Delete transaction"
                >
                  <Icon name="trash-can-outline" size={18} color={theme.colors.danger} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setSelectedTx(null)}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={handleUpdate}>
                  <Text style={styles.saveBtnText}>Save ✓</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const createStyles = (theme: Theme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  body: { paddingHorizontal: 16 },

  // Header
  header: {
    paddingTop: theme.statusBarHeight + 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pageLabel: { color: theme.colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  pageTitle: { color: theme.colors.text, fontSize: 24, fontWeight: '800', marginTop: 2 },
  headerRight: {},
  countChip: {
    backgroundColor: theme.colors.primarySubtle,
    color: theme.colors.primary,
    fontSize: 13,
    fontWeight: '800',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    overflow: 'hidden',
  },

  // Search
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 14,
    height: 46,
    ...theme.shadow.sm,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 15,
  },

  // Filters
  filterScroll: { marginBottom: 12, minHeight: 42 },
  filterContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  filterChip: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 16,
    paddingVertical: 9,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primaryDeep,
    borderColor: theme.colors.primaryDeep,
  },
  filterChipText: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '600', includeFontPadding: false },
  filterChipTextActive: { color: theme.colors.onPrimary, fontWeight: '700', includeFontPadding: false },

  // List
  listContent: { paddingHorizontal: 16, paddingBottom: 100 },

  // Day groups
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  dayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.primary },
  dayLabel: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '700' },
  dayLine: { flex: 1, height: 1, backgroundColor: theme.colors.border },
  dayTotal: { color: theme.colors.danger, fontSize: 11, fontWeight: '700' },

  // Transaction card
  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: 14,
    marginBottom: 6,
    ...theme.shadow.sm,
  },
  txIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  txMid: { flex: 1 },
  txDesc: { color: theme.colors.text, fontSize: 14, fontWeight: '600', marginBottom: 4 },
  txMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  txMeta: { color: theme.colors.textMuted, fontSize: 11 },
  badgeManual: {
    backgroundColor: 'rgba(217,70,239,0.12)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  badgeManualText: { color: '#D946EF', fontSize: 9, fontWeight: '800' },
  badgeNew: {
    backgroundColor: theme.colors.amberSubtle,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  badgeNewText: { color: theme.colors.amber, fontSize: 9, fontWeight: '800' },
  txRight: { alignItems: 'flex-end' },
  txAmt: { fontSize: 14, fontWeight: '800' },
  debit: { color: theme.colors.danger },
  credit: { color: theme.colors.success },
  txBal: { color: theme.colors.textMuted, fontSize: 10, marginTop: 2 },

  // Filtered summary
  summaryStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
  },
  summaryItem: { flex: 1 },
  summaryLabel: {
    ...theme.typography.overline,
    color: theme.colors.textMuted,
    marginBottom: 3,
  },
  summaryValue: { ...theme.typography.title },
  summaryDivider: {
    width: 1,
    height: 28,
    backgroundColor: theme.colors.border,
    marginHorizontal: 12,
  },

  // List footer
  listFooter: { alignItems: 'center', paddingTop: 20, gap: 12 },
  listFooterText: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '600' },
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primarySubtle,
  },
  loadMoreText: { color: theme.colors.primary, fontSize: 13, fontWeight: '800' },

  // Empty
  empty: { flex: 1, alignItems: 'center', paddingTop: 80 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '800', marginBottom: 6 },
  emptyHint: { color: theme.colors.textMuted, fontSize: 13 },

  // Edit bottom sheet
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 36,
    maxHeight: '90%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  amtBadge: {
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    marginBottom: 10,
  },
  amtBadgeDebit: { backgroundColor: theme.colors.dangerSubtle },
  amtBadgeCredit: { backgroundColor: theme.colors.successSubtle },
  amtBadgeText: { color: theme.colors.text, fontSize: 22, fontWeight: '800' },
  sheetTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  sheetDate: { color: theme.colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 2, marginBottom: 16 },
  sheetBody: { flexGrow: 0 },
  fieldLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginTop: 14,
  },
  rawBox: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    marginBottom: 4,
  },
  rawText: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 },
  balRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.sm,
    padding: 12,
    marginBottom: 4,
  },
  balLabel: { color: theme.colors.textMuted, fontSize: 13, fontWeight: '600' },
  balValue: { color: theme.colors.text, fontSize: 13, fontWeight: '700' },
  fieldInput: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.text,
    fontSize: 15,
  },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  catItem: {
    flexBasis: '31%',
    flexGrow: 1,
    maxWidth: '33%',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    padding: 10,
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.background,
  },
  catEmoji: { fontSize: 20 },
  catText: { color: theme.colors.textMuted, fontSize: 10, fontWeight: '600', textAlign: 'center' },
  sheetActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    alignItems: 'center',
  },
  deleteBtn: {
    width: 46,
    height: 46,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: { color: theme.colors.textMuted, fontSize: 15, fontWeight: '700' },
  saveBtn: {
    flex: 2,
    height: 46,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.successDeep,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadow.sm,
  },
  saveBtnText: { color: theme.colors.onPrimary, fontSize: 15, fontWeight: '800' },
});
