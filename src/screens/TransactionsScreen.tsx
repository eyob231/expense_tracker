import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { getTransactions, deleteTransaction, updateTransaction } from '../storage';
import { Transaction, Category } from '../parser';
import { theme } from '../theme';

const CATEGORY_EMOJIS: { [key in Category]: string } = {
  'Food & Dining': '🍔',
  'Shopping': '🛍️',
  'Transportation': '🚗',
  'Salary': '💰',
  'UPI Transfers': '📲',
  'Other': '🏷️',
};

const CATEGORIES: Category[] = [
  'Food & Dining',
  'Shopping',
  'Transportation',
  'Salary',
  'UPI Transfers',
  'Other',
];

const PAGE_SIZE = 10;

export default function TransactionsScreen() {
  const isFocused = useIsFocused();
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // Filtering & Search state
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('all');

  // Pagination
  const [page, setPage] = useState(1);

  // Edit transaction state
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [editCategory, setEditCategory] = useState<Category>('Other');
  const [editDescription, setEditDescription] = useState('');

  useEffect(() => {
    if (isFocused) {
      loadData();
    }
  }, [isFocused]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, activeFilter]);

  const loadData = async () => {
    const list = await getTransactions();
    setTransactions(list);
  };

  const handleDelete = async (id: string) => {
    Alert.alert('Delete Transaction', 'Are you sure you want to delete this transaction?', [
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
    const updatedTx: Transaction = {
      ...selectedTx,
      category: editCategory,
      description: editDescription,
      isReviewed: true,
    };
    const updated = await updateTransaction(updatedTx);
    setTransactions(updated);
    setSelectedTx(null);
  };

  const filteredTransactions = transactions.filter(tx => {
    const matchesSearch =
      tx.description.toLowerCase().includes(search.toLowerCase()) ||
      tx.sender.toLowerCase().includes(search.toLowerCase());
    
    let matchesFilter = true;
    if (activeFilter === 'debit') matchesFilter = tx.type === 'debit';
    else if (activeFilter === 'credit') matchesFilter = tx.type === 'credit';
    else if (activeFilter !== 'all') matchesFilter = tx.category === activeFilter;

    return matchesSearch && matchesFilter;
  });

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const pagedTransactions = filteredTransactions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const renderTxCard = ({ item: tx }: { item: Transaction }) => {
    const isDebit = tx.type === 'debit';
    const icon = CATEGORY_EMOJIS[tx.category as Category] || '🏷️';
    return (
      <TouchableOpacity
        style={styles.txCard}
        onPress={() => {
          setSelectedTx(tx);
          setEditCategory(tx.category as Category);
          setEditDescription(tx.description);
        }}
        activeOpacity={0.75}
      >
        <View style={styles.txHeader}>
          <View style={[styles.iconContainer, isDebit ? styles.iconDebit : styles.iconCredit]}>
            <Text style={styles.iconText}>{icon}</Text>
          </View>
          <View style={styles.txDetails}>
            <Text style={styles.txDescription} numberOfLines={1}>
              {tx.description}
            </Text>
            <View style={styles.subRow}>
              <Text style={styles.txMeta}>
                {new Date(tx.date).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
              <Text style={[styles.badge, tx.isManual ? styles.badgeManual : styles.badgeSms]}>
                {tx.isManual ? 'Manual' : 'SMS'}
              </Text>
              {!tx.isReviewed && !tx.isManual && (
                <Text style={[styles.badge, styles.badgeUnreviewed]}>New</Text>
              )}
            </View>
          </View>
          <View style={styles.txAmountContainer}>
            <Text style={[styles.txAmount, isDebit ? styles.debitText : styles.creditText]}>
              {isDebit ? '-' : '+'}{tx.amount.toFixed(2)}
            </Text>
            {tx.balance > 0 && (
              <Text style={styles.txBalance}>Bal: {tx.balance.toFixed(2)}</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <View>
      {/* Search Input */}
      <TextInput
        style={styles.searchInput}
        placeholder="Search transactions..."
        placeholderTextColor={theme.colors.textMuted}
        value={search}
        onChangeText={setSearch}
      />

      {/* Filter buttons */}
      <View style={styles.filtersWrapper}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={[
            { key: 'all', label: 'All' },
            { key: 'debit', label: '📉 Expenses' },
            { key: 'credit', label: '📈 Income' },
            ...CATEGORIES.map(c => ({ key: c, label: `${CATEGORY_EMOJIS[c]} ${c}` })),
          ]}
          renderItem={({ item }) => {
            const isActive = activeFilter === item.key;
            return (
              <TouchableOpacity
                style={[styles.filterBtn, isActive && styles.filterBtnActive]}
                onPress={() => setActiveFilter(item.key)}
              >
                <Text style={[styles.filterBtnText, isActive && styles.filterBtnTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          }}
          keyExtractor={item => item.key}
          contentContainerStyle={{ paddingBottom: 4 }}
        />
      </View>

      {/* Count label */}
      <Text style={styles.countLabel}>
        {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
        {(search || activeFilter !== 'all') ? ' (filtered)' : ''}
      </Text>
    </View>
  );

  const renderFooter = () => (
    <View style={styles.paginationRow}>
      <TouchableOpacity
        style={[styles.pageBtn, page === 1 && styles.pageBtnDisabled]}
        onPress={() => setPage(p => Math.max(1, p - 1))}
        disabled={page === 1}
      >
        <Text style={styles.pageBtnText}>‹ Prev</Text>
      </TouchableOpacity>

      <Text style={styles.pageLabel}>
        Page {page} of {totalPages}
      </Text>

      <TouchableOpacity
        style={[styles.pageBtn, page >= totalPages && styles.pageBtnDisabled]}
        onPress={() => setPage(p => Math.min(totalPages, p + 1))}
        disabled={page >= totalPages}
      >
        <Text style={styles.pageBtnText}>Next ›</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <View style={styles.container}>
        {/* Page title — inside container, not floating too high */}
        <View style={styles.titleRow}>
          <Text style={styles.title}>Ledger</Text>
          <Text style={styles.titleSub}>All bank transactions</Text>
        </View>

        <FlatList
          data={pagedTransactions}
          renderItem={renderTxCard}
          keyExtractor={item => item.id}
          ListHeaderComponent={renderHeader}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>🔍</Text>
              <Text style={styles.emptyText}>No matching transactions found.</Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      </View>

      {/* Detail / Edit Modal */}
      {selectedTx && (
        <Modal
          transparent
          visible={!!selectedTx}
          animationType="slide"
          onRequestClose={() => setSelectedTx(null)}
        >
          <View style={styles.modalBg}>
            <View style={styles.modalContent}>
              {/* Drag handle */}
              <View style={styles.modalHandle} />

              {/* Amount badge */}
              <View style={[
                styles.modalAmountBadge,
                selectedTx.type === 'debit' ? styles.modalBadgeDebit : styles.modalBadgeCredit,
              ]}>
                <Text style={styles.modalAmountText}>
                  {selectedTx.type === 'debit' ? '📉 -' : '📈 +'}{selectedTx.amount.toFixed(2)} ETB
                </Text>
              </View>

              <Text style={styles.modalTitle}>
                {selectedTx.type === 'debit' ? 'Expense' : 'Income'} · {selectedTx.sender.toUpperCase()}
              </Text>
              <Text style={styles.modalDate}>
                {new Date(selectedTx.date).toLocaleString(undefined, {
                  weekday: 'short', year: 'numeric', month: 'short',
                  day: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
              </Text>

              {/* Scrollable body */}
              <ScrollView
                style={styles.modalScrollBody}
                showsVerticalScrollIndicator={false}
              >
                {/* Full raw SMS — always shown prominently */}
                <Text style={styles.modalLabel}>📨 Original SMS Message</Text>
                <View style={styles.rawMsgBox}>
                  <Text style={styles.rawMsgText}>
                    {selectedTx.rawMessage
                      ? selectedTx.rawMessage
                      : '(No original SMS stored — transaction was added manually)'}
                  </Text>
                </View>

                {selectedTx.balance > 0 && (
                  <View style={styles.balanceRow}>
                    <Text style={styles.balanceLabel}>Balance after</Text>
                    <Text style={styles.balanceValue}>{selectedTx.balance.toFixed(2)} ETB</Text>
                  </View>
                )}

                <Text style={styles.modalLabel}>✏️ Edit Description</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholderTextColor={theme.colors.textMuted}
                />

                <Text style={styles.modalLabel}>🏷️ Category</Text>
                <View style={styles.categoryPicker}>
                  {CATEGORIES.map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.pickerBtn, editCategory === cat && styles.pickerBtnActive]}
                      onPress={() => setEditCategory(cat)}
                    >
                      <Text style={[styles.pickerText, editCategory === cat && styles.pickerTextActive]}>
                        {CATEGORY_EMOJIS[cat]} {cat}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.deleteBtn]}
                  onPress={() => handleDelete(selectedTx.id)}
                >
                  <Text style={styles.actionBtnText}>🗑 Delete</Text>
                </TouchableOpacity>

                <View style={{ flex: 1 }} />

                <TouchableOpacity
                  style={[styles.actionBtn, styles.cancelBtn]}
                  onPress={() => setSelectedTx(null)}
                >
                  <Text style={[styles.actionBtnText, { color: theme.colors.textMuted }]}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.saveBtn]}
                  onPress={handleUpdate}
                >
                  <Text style={styles.actionBtnText}>Save ✓</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: theme.spacing.md,
  },
  titleRow: {
    paddingTop: theme.statusBarHeight + theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  title: {
    color: theme.colors.text,
    fontSize: 26,
    fontWeight: '800',
  },
  titleSub: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  listContent: {
    paddingBottom: theme.spacing.xl,
  },
  searchInput: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.text,
    padding: theme.spacing.md,
    fontSize: 15,
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  filtersWrapper: {
    marginBottom: theme.spacing.sm,
  },
  filterBtn: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: theme.borderRadius.md,
    marginRight: theme.spacing.sm,
  },
  filterBtnActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterBtnText: {
    color: theme.colors.textMuted,
    fontWeight: '600',
    fontSize: 12,
  },
  filterBtnTextActive: {
    color: '#fff',
  },
  dividerVertical: {
    width: 1,
    backgroundColor: theme.colors.border,
    marginHorizontal: theme.spacing.sm,
    height: '100%',
  },
  countLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    marginBottom: theme.spacing.sm,
    fontWeight: '600',
  },
  txCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  txHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: theme.borderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  iconDebit: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  iconCredit: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  iconText: {
    fontSize: 22,
  },
  txDetails: {
    flex: 1,
  },
  txDescription: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    flexWrap: 'wrap',
  },
  txMeta: {
    color: theme.colors.textMuted,
    fontSize: 11,
    marginRight: 6,
  },
  badge: {
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 4,
    overflow: 'hidden',
  },
  badgeManual: {
    backgroundColor: 'rgba(217, 70, 239, 0.15)',
    color: theme.colors.accent,
  },
  badgeSms: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    color: theme.colors.primary,
  },
  badgeUnreviewed: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    color: '#F59E0B',
  },
  txAmountContainer: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 16,
    fontWeight: '800',
  },
  txBalance: {
    color: theme.colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  debitText: {
    color: theme.colors.danger,
  },
  creditText: {
    color: theme.colors.success,
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: 14,
  },
  // Pagination
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.lg,
    gap: 16,
  },
  pageBtn: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.md,
  },
  pageBtnDisabled: {
    opacity: 0.3,
  },
  pageBtnText: {
    color: theme.colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  pageLabel: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  // Modal
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderColor: theme.colors.border,
    borderTopWidth: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 12,
    paddingBottom: 32,
    maxHeight: '90%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalAmountBadge: {
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 24,
    marginBottom: 10,
  },
  modalBadgeDebit: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  modalBadgeCredit: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  modalAmountText: {
    fontSize: 24,
    fontWeight: '800',
    color: theme.colors.text,
  },
  modalTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  modalDate: {
    color: theme.colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 3,
    marginBottom: theme.spacing.md,
  },
  modalScrollBody: {
    flexGrow: 0,
  },
  rawMsgBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  rawMsgText: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 22,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.sm,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  balanceLabel: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  balanceValue: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  modalLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: theme.spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  modalInput: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.text,
    padding: theme.spacing.md,
    fontSize: 15,
  },
  categoryPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  pickerBtn: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    width: '48%',
    alignItems: 'center',
  },
  pickerBtnActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.18)',
    borderColor: theme.colors.primary,
  },
  pickerText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  pickerTextActive: {
    color: theme.colors.text,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    marginTop: theme.spacing.lg,
    gap: 8,
  },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  deleteBtn: {
    backgroundColor: theme.colors.danger,
  },
  cancelBtn: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  saveBtn: {
    backgroundColor: theme.colors.success,
  },
});
