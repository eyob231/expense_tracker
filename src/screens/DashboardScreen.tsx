import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { getTransactions, addTransaction, updateTransaction, clearSmsTransactionsAndResetSync, saveCategoryMapping } from '../storage';
import { Transaction, Category } from '../parser';
import { theme } from '../theme';
import AddTransactionModal from '../components/AddTransactionModal';
import { syncDeviceSms, subscribeToIncomingSms } from '../deviceSms';
import { PieChart } from 'react-native-chart-kit';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const CATEGORY_EMOJIS: { [key in Category]: string } = {
  'Food & Dining': '🍔',
  'Shopping': '🛍️',
  'Transportation': '🚗',
  'Salary': '💰',
  'UPI Transfers': '📲',
  'Other': '🏷️',
};

const CATEGORY_COLORS: { [key in Category]: string } = {
  'Food & Dining': '#F97316',
  'Shopping': '#A855F7',
  'Transportation': '#3B82F6',
  'Salary': '#10B981',
  'UPI Transfers': '#6366F1',
  'Other': '#64748B',
};

const CATEGORIES: Category[] = Object.keys(CATEGORY_EMOJIS) as Category[];

export default function DashboardScreen() {
  const isFocused = useIsFocused();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  
  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [syncProgress, setSyncProgress] = useState(0);
  
  // Custom Alert Modals
  const [showSyncOptions, setShowSyncOptions] = useState(false);
  const [syncResult, setSyncResult] = useState<{title: string; message: string} | null>(null);

  // Transaction Modal State
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [isSelectedTxNew, setIsSelectedTxNew] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category>('Other');
  const [editDescription, setEditDescription] = useState('');
  const [editType, setEditType] = useState<'credit' | 'debit'>('debit');
  const [isBalanceHidden, setIsBalanceHidden] = useState(true);
  const [isCbeHidden, setIsCbeHidden] = useState(true);
  const [isCbeBirrHidden, setIsCbeBirrHidden] = useState(true);
  const [isTelebirrHidden, setIsTelebirrHidden] = useState(true);

  useEffect(() => {
    if (isFocused) loadData();
  }, [isFocused]);

  useEffect(() => {
    const unsubscribe = subscribeToIncomingSms((tx) => {
      loadData();
      setSelectedCategory(tx.category as Category);
      setEditDescription(tx.description);
      setEditType(tx.type);
      setIsSelectedTxNew(true);
      setSelectedTx(tx);
    });
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  const loadData = async () => {
    const list = await getTransactions();
    setTransactions(list);
  };

  const runSync = async (isResync: boolean) => {
    setIsSyncing(true);
    setSyncStatus('Initializing...');
    setSyncProgress(0);

    const onProgress = (stage: string, current: number, total: number) => {
      setSyncStatus(stage);
      if (total > 0) {
        setSyncProgress(current / total);
      }
    };

    if (isResync) {
      setSyncStatus('Clearing old records...');
      await clearSmsTransactionsAndResetSync();
    }

    const { imported, total } = await syncDeviceSms(onProgress);
    await loadData();
    
    setSyncStatus('Done!');
    setSyncProgress(1);
    
    // Give user a second to see 100%
    setTimeout(() => {
      setIsSyncing(false);
      setSyncStatus('');
      setSyncProgress(0);
      
      if (isResync) {
        setSyncResult({ title: '✅ Re-sync Complete', message: `Re-imported ${imported} of ${total} messages.` });
      } else {
        setSyncResult({
          title: total > 0 ? '✅ Sync Complete' : 'Nothing New',
          message: total > 0
            ? `Found ${total} bank messages.\nImported ${imported} new transactions.`
            : 'No new bank SMS found in the last 30 days.'
        });
      }
    }, 1000);
  };

  const handleSync = () => {
    setShowSyncOptions(true);
  };

  const handleAddTransaction = async (newTx: Transaction) => {
    const updated = await addTransaction(newTx);
    setTransactions(updated);
  };

  const saveNewTransactionCategory = async () => {
    if (!selectedTx) return;

    const finalDesc = editDescription.trim() || selectedTx.description;

    // Save mapping if it was changed
    if (selectedTx.category !== selectedCategory || selectedTx.description !== finalDesc) {
      await saveCategoryMapping(selectedTx.description, selectedCategory);
    }
    
    const updatedTx = { ...selectedTx, type: editType, category: selectedCategory, description: finalDesc, isReviewed: true };
    await updateTransaction(updatedTx);
    setSelectedTx(null);
    loadData();
  };

  const totalIncome = transactions.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
  const totalExpense = transactions.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
  const netBalance = totalIncome - totalExpense;
  const txCount = transactions.length;

  // Latest Balances
  const cbeBalance = transactions.find(t => t.sender.toLowerCase() === 'cbe' && t.balance > 0)?.balance;
  const telebirrBalance = transactions.find(t => t.sender.toLowerCase() === 'telebirr' && t.balance > 0)?.balance;
  const cbeBirrBalance = transactions.find(t => t.sender.toLowerCase().includes('cbe birr') && t.balance > 0)?.balance;

  const categoryTotals: { [key in Category]?: number } = {};
  transactions.filter(t => t.type === 'debit').forEach(t => {
    const cat = t.category as Category;
    categoryTotals[cat] = (categoryTotals[cat] || 0) + t.amount;
  });
  
  const sortedCategories = (Object.entries(categoryTotals) as [Category, number][])
    .filter(([c]) => c !== 'Salary')
    .sort((a, b) => b[1] - a[1]);

  // Chart data
  const chartData = sortedCategories.map(([cat, amount]) => ({
    name: cat,
    amount: amount,
    color: CATEGORY_COLORS[cat] || theme.colors.primary,
    legendFontColor: theme.colors.textMuted,
    legendFontSize: 11,
  }));

  const recentTx = transactions.slice(0, 5);

  const maskAmount = (value: number, fractionDigits = 2): string => {
    if (isBalanceHidden) return '••••••';
    return value.toLocaleString('en-US', { minimumFractionDigits: fractionDigits });
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── HEADER ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerLabel}>MY WALLET</Text>
            <Text style={styles.headerTitle}>Financial Hub</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={handleSync} disabled={isSyncing}>
              <Text style={styles.iconBtnText}>🔄</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={() => setIsModalVisible(true)}>
              <Text style={styles.addBtnText}>＋ Add</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── BALANCE CARD ── */}
        <View style={styles.balanceCard}>
          <View style={styles.balanceCardGlow} />
          <Text style={styles.balanceCaption}>TOTAL NET BALANCE</Text>
          <View style={styles.balanceAmountRow}>
            <Text style={[styles.balanceAmount, !isBalanceHidden && netBalance < 0 && { color: theme.colors.danger }]}>
              {!isBalanceHidden && (netBalance < 0 ? '-' : '+')}
              {maskAmount(Math.abs(netBalance))}
              {!isBalanceHidden && <Text style={styles.balanceCurrency}> ETB</Text>}
            </Text>
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setIsBalanceHidden(h => !h)}>
              <Text style={styles.eyeBtnText}>{isBalanceHidden ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.balanceDivider} />

          <View style={styles.balanceRow}>
            <View style={styles.balanceStat}>
              <View style={[styles.statDot, { backgroundColor: theme.colors.success }]} />
              <View>
                <Text style={styles.statCaption}>INCOME</Text>
                <Text style={[styles.statAmount, { color: theme.colors.success }]}>
                  {isBalanceHidden ? '••••••' : `+${totalIncome.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                </Text>
              </View>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.balanceStat}>
              <View style={[styles.statDot, { backgroundColor: theme.colors.danger }]} />
              <View>
                <Text style={styles.statCaption}>EXPENSES</Text>
                <Text style={[styles.statAmount, { color: theme.colors.danger }]}>
                  {isBalanceHidden ? '••••••' : `-${totalExpense.toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── ACCOUNT BALANCES ── */}
        {(cbeBalance !== undefined || cbeBirrBalance !== undefined || telebirrBalance !== undefined) && (
          <>
            <Text style={styles.sectionLabel}>ACCOUNT BALANCES</Text>
            <View style={styles.bankCardsRow}>
              {cbeBalance !== undefined && (
                <View style={[styles.bankCard, { borderLeftColor: '#1a6fc4' }]}>
                  <View style={styles.bankCardIconWrap}>
                    <Text style={styles.bankCardEmoji}>🏦</Text>
                  </View>
                  <View style={styles.bankCardNameRow}>
                    <Text style={styles.bankCardName}>CBE</Text>
                    <TouchableOpacity onPress={() => setIsCbeHidden(h => !h)}>
                      <Text style={styles.bankCardEye}>{isCbeHidden ? '🙈' : '👁️'}</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.bankCardBalance}>{isCbeHidden ? '••••' : cbeBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
                  <Text style={styles.bankCardCurrency}>ETB</Text>
                </View>
              )}
              {cbeBirrBalance !== undefined && (
                <View style={[styles.bankCard, { borderLeftColor: '#059669' }]}>
                  <View style={styles.bankCardIconWrap}>
                    <Text style={styles.bankCardEmoji}>🟢</Text>
                  </View>
                  <View style={styles.bankCardNameRow}>
                    <Text style={styles.bankCardName}>CBE Birr</Text>
                    <TouchableOpacity onPress={() => setIsCbeBirrHidden(h => !h)}>
                      <Text style={styles.bankCardEye}>{isCbeBirrHidden ? '🙈' : '👁️'}</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.bankCardBalance}>{isCbeBirrHidden ? '••••' : cbeBirrBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
                  <Text style={styles.bankCardCurrency}>ETB</Text>
                </View>
              )}
              {telebirrBalance !== undefined && (
                <View style={[styles.bankCard, { borderLeftColor: '#7c3aed' }]}>
                  <View style={styles.bankCardIconWrap}>
                    <Text style={styles.bankCardEmoji}>📱</Text>
                  </View>
                  <View style={styles.bankCardNameRow}>
                    <Text style={styles.bankCardName}>Telebirr</Text>
                    <TouchableOpacity onPress={() => setIsTelebirrHidden(h => !h)}>
                      <Text style={styles.bankCardEye}>{isTelebirrHidden ? '🙈' : '👁️'}</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.bankCardBalance}>{isTelebirrHidden ? '••••' : telebirrBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
                  <Text style={styles.bankCardCurrency}>ETB</Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* ── SPENDING CHART ── */}
        {chartData.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Spending by Category</Text>
              <Text style={styles.cardSub}>{totalExpense.toFixed(0)} ETB total</Text>
            </View>
            <View style={styles.chartContainer}>
              <PieChart
                data={chartData}
                width={SCREEN_WIDTH - 64}
                height={160}
                chartConfig={{
                  backgroundColor: theme.colors.surface,
                  backgroundGradientFrom: theme.colors.surface,
                  backgroundGradientTo: theme.colors.surface,
                  color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                }}
                accessor={"amount"}
                backgroundColor={"transparent"}
                paddingLeft={"0"}
                center={[10, 0]}
                hasLegend={true}
                absolute
              />
            </View>
          </View>
        )}

        {/* ── QUICK INSIGHT PILLS ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillsRow}>
          {[
            { label: 'This Month', value: transactions.filter(t => {
              const d = new Date(t.date);
              const now = new Date();
              return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            }).length + ' txns' },
            { label: 'Avg Expense', value: (totalExpense / Math.max(1, transactions.filter(t=>t.type==='debit').length)).toFixed(0) + ' ETB' },
            { label: 'Top Category', value: sortedCategories[0]?.[0] || 'N/A' },
          ].map(pill => (
            <View key={pill.label} style={styles.pill}>
              <Text style={styles.pillLabel}>{pill.label}</Text>
              <Text style={styles.pillValue}>{pill.value}</Text>
            </View>
          ))}
        </ScrollView>

        {/* ── RECENT TRANSACTIONS ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Recent Activity</Text>
            <Text style={styles.cardSub}>{recentTx.length} of {txCount}</Text>
          </View>
          {recentTx.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>📭</Text>
              <Text style={styles.emptyText}>No transactions yet.</Text>
              <Text style={styles.emptyHint}>Tap 🔄 Sync to import bank SMS messages.</Text>
            </View>
          ) : (
            recentTx.map((tx, idx) => {
              const isDebit = tx.type === 'debit';
              const icon = CATEGORY_EMOJIS[tx.category as Category] || '🏷️';
              const catColor = CATEGORY_COLORS[tx.category as Category] || '#64748B';
              return (
                <TouchableOpacity 
                  key={tx.id} 
                  style={[styles.txRow, idx === recentTx.length - 1 && { borderBottomWidth: 0 }]}
                  activeOpacity={0.7}
                  onPress={() => {
                    setIsSelectedTxNew(false);
                    setSelectedCategory(tx.category as Category);
                    setEditDescription(tx.description);
                    setEditType(tx.type);
                    setSelectedTx(tx);
                  }}
                >
                  <View style={[styles.txIcon, { backgroundColor: catColor + '20' }]}>
                    <Text style={styles.txEmoji}>{icon}</Text>
                  </View>
                  <View style={styles.txMid}>
                    <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>
                    <Text style={styles.txMeta}>
                      {new Date(tx.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      {' · '}{tx.sender.toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.txRight}>
                    <Text style={[styles.txAmt, isDebit ? styles.debit : styles.credit]}>
                      {isDebit ? '-' : '+'}{tx.amount.toFixed(2)}
                    </Text>
                    <Text style={styles.txCurrency}>ETB</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Sync Progress Overlay Modal */}
      {isSyncing && (
        <Modal transparent visible={isSyncing} animationType="fade">
          <View style={styles.syncOverlay}>
            <View style={styles.syncBox}>
              <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginBottom: 16 }} />
              <Text style={styles.syncTitle}>Syncing SMS</Text>
              <Text style={styles.syncStatusText}>{syncStatus}</Text>
              <View style={styles.syncProgressBg}>
                <View style={[styles.syncProgressFill, { width: `${Math.max(2, syncProgress * 100)}%` }]} />
              </View>
              <Text style={styles.syncProgressPct}>{Math.round(syncProgress * 100)}%</Text>
            </View>
          </View>
        </Modal>
      )}

      {/* Sync Options Modal */}
      {showSyncOptions && (
        <Modal transparent visible={showSyncOptions} animationType="fade">
          <View style={styles.alertOverlay}>
            <View style={styles.alertBoxCentered}>
              <Text style={styles.alertEmoji}>🔄</Text>
              <Text style={[styles.alertTitle, { marginBottom: 12, textAlign: 'center' }]}>Sync Bank SMS</Text>
              <Text style={[styles.alertDesc, { textAlign: 'center', marginBottom: 24 }]}>
                • Sync New — import messages not yet stored.{'\n'}
                • Re-sync All — clear old records and re-import with full message details.
              </Text>
              
              <View style={{ width: '100%', gap: 12 }}>
                <TouchableOpacity style={styles.saveBtn} onPress={() => { setShowSyncOptions(false); runSync(false); }}>
                  <Text style={styles.saveBtnText}>Sync New</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: theme.colors.danger }]} onPress={() => { setShowSyncOptions(false); runSync(true); }}>
                  <Text style={styles.saveBtnText}>Re-sync All</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.saveBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.border }]} onPress={() => setShowSyncOptions(false)}>
                  <Text style={[styles.saveBtnText, { color: theme.colors.text }]}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Sync Result Modal */}
      {syncResult && (
        <Modal transparent visible={!!syncResult} animationType="fade">
          <View style={styles.alertOverlay}>
            <View style={styles.alertBoxCentered}>
              <Text style={[styles.alertTitle, { marginBottom: 12, textAlign: 'center', fontSize: 20 }]}>{syncResult.title}</Text>
              <Text style={[styles.alertDesc, { textAlign: 'center', marginBottom: 24 }]}>{syncResult.message}</Text>
              <TouchableOpacity style={[styles.saveBtn, { width: '100%' }]} onPress={() => setSyncResult(null)}>
                <Text style={styles.saveBtnText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* Transaction Details Modal */}
      {selectedTx && (
        <Modal transparent visible={!!selectedTx} animationType="slide">
          <View style={styles.alertOverlay}>
            <View style={styles.alertBoxBottom}>
              <View style={[styles.alertHeader, editType === 'debit' ? styles.alertHeaderDanger : styles.alertHeaderSuccess]}>
                <Text style={styles.alertEmoji}>{editType === 'debit' ? '📉' : '📈'}</Text>
                <Text style={styles.alertTitle}>{isSelectedTxNew ? 'New Transaction Detected' : 'Transaction Details'}</Text>
              </View>
              
              <View style={styles.alertContent}>
                <Text style={[styles.alertAmount, { color: editType === 'debit' ? theme.colors.danger : theme.colors.success }]}>
                  {editType === 'debit' ? '-' : '+'}{selectedTx.amount.toFixed(2)} <Text style={{fontSize: 16}}>ETB</Text>
                </Text>

                {/* ── TYPE TOGGLE ── */}
                <Text style={styles.catPickerLabel}>Transaction Type:</Text>
                <View style={styles.typeToggleRow}>
                  <TouchableOpacity
                    style={[styles.typeToggleBtn, editType === 'credit' && styles.typeToggleBtnActiveIncome]}
                    onPress={() => setEditType('credit')}
                  >
                    <Text style={styles.typeToggleIcon}>📈</Text>
                    <Text style={[styles.typeToggleText, editType === 'credit' && { color: theme.colors.success }]}>Income</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.typeToggleBtn, editType === 'debit' && styles.typeToggleBtnActiveExpense]}
                    onPress={() => setEditType('debit')}
                  >
                    <Text style={styles.typeToggleIcon}>📉</Text>
                    <Text style={[styles.typeToggleText, editType === 'debit' && { color: theme.colors.danger }]}>Expense</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.catPickerLabel}>Name / Description:</Text>
                <TextInput
                  style={styles.descInput}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  placeholder="e.g. Salary, Uber, Eyob"
                  placeholderTextColor={theme.colors.textMuted}
                />
                {selectedTx.rawMessage ? (
                  <Text style={styles.alertRaw}>{selectedTx.rawMessage}</Text>
                ) : null}

                <Text style={styles.catPickerLabel}>Categorize as:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catPicker}>
                  {CATEGORIES.map(cat => {
                    const isSelected = selectedCategory === cat;
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.catPill, isSelected && { borderColor: CATEGORY_COLORS[cat], backgroundColor: CATEGORY_COLORS[cat] + '20' }]}
                        onPress={() => setSelectedCategory(cat)}
                      >
                        <Text style={styles.catPillEmoji}>{CATEGORY_EMOJIS[cat]}</Text>
                        <Text style={[styles.catPillText, isSelected && { color: CATEGORY_COLORS[cat] }]}>{cat}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <TouchableOpacity style={styles.saveBtn} onPress={saveNewTransactionCategory}>
                  <Text style={styles.saveBtnText}>Save & Close</Text>
                </TouchableOpacity>
                {!isSelectedTxNew && (
                  <TouchableOpacity style={[styles.saveBtn, { backgroundColor: 'transparent', marginTop: 8 }]} onPress={() => setSelectedTx(null)}>
                    <Text style={[styles.saveBtnText, { color: theme.colors.textMuted }]}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </Modal>
      )}

      <AddTransactionModal
        visible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        onAdd={handleAddTransaction}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { paddingHorizontal: 16, paddingBottom: 32 },

  // Header
  header: { paddingTop: theme.statusBarHeight + 12, marginBottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLabel: { color: theme.colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  headerTitle: { color: theme.colors.text, fontSize: 22, fontWeight: '800', marginTop: 2 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, justifyContent: 'center', alignItems: 'center' },
  iconBtnText: { fontSize: 16 },
  addBtn: { backgroundColor: theme.colors.primary, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20 },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },

  // Balance card
  balanceCard: { backgroundColor: theme.colors.surface, borderRadius: 24, padding: 24, marginBottom: 16, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden', position: 'relative' },
  balanceCardGlow: { position: 'absolute', top: -60, right: -60, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(99,102,241,0.08)' },
  balanceCaption: { color: theme.colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  balanceAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, marginBottom: 4 },
  balanceAmount: { color: theme.colors.text, fontSize: 38, fontWeight: '800' },
  eyeBtn: { padding: 6 },
  eyeBtnText: { fontSize: 22 },
  balanceCurrency: { fontSize: 18, color: theme.colors.textMuted },
  balanceDivider: { height: 1, backgroundColor: theme.colors.border, width: '100%', marginVertical: 20 },
  balanceRow: { flexDirection: 'row', alignItems: 'center' },
  balanceStat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  statDot: { width: 8, height: 8, borderRadius: 4 },
  statCaption: { color: theme.colors.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  statAmount: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: theme.colors.border, marginHorizontal: 4 },

  // Account Balances section
  sectionLabel: { color: theme.colors.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 10 },
  bankCardsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  bankCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderLeftWidth: 3,
  },
  bankCardIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  bankCardEmoji: { fontSize: 18 },
  bankCardName: { color: theme.colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  bankCardNameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  bankCardEye: { fontSize: 12 },
  bankCardBalance: { color: theme.colors.text, fontSize: 16, fontWeight: '900' },
  bankCardCurrency: { color: theme.colors.textMuted, fontSize: 10, fontWeight: '600', marginTop: 2 },

  chartContainer: { alignItems: 'center', justifyContent: 'center', marginVertical: 8 },
  pillsRow: { marginBottom: 16 },
  pill: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 10, marginRight: 10 },
  pillLabel: { color: theme.colors.textMuted, fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
  pillValue: { color: theme.colors.text, fontSize: 14, fontWeight: '800', marginTop: 2 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: theme.colors.border },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 },
  cardTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '800' },
  cardSub: { color: theme.colors.textMuted, fontSize: 12 },
  txRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  txIcon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  txEmoji: { fontSize: 22 },
  txMid: { flex: 1 },
  txDesc: { color: theme.colors.text, fontSize: 14, fontWeight: '600' },
  txMeta: { color: theme.colors.textMuted, fontSize: 11, marginTop: 3 },
  txRight: { alignItems: 'flex-end' },
  txAmt: { fontSize: 16, fontWeight: '800' },
  txCurrency: { color: theme.colors.textMuted, fontSize: 10, marginTop: 2 },
  debit: { color: theme.colors.danger },
  credit: { color: theme.colors.success },
  emptyState: { paddingVertical: 32, alignItems: 'center' },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: theme.colors.text, fontSize: 16, fontWeight: '700' },
  emptyHint: { color: theme.colors.textMuted, fontSize: 13, marginTop: 6, textAlign: 'center' },

  // Overlays
  syncOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.8)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  syncBox: { backgroundColor: theme.colors.surface, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, padding: 32, width: '100%', alignItems: 'center' },
  syncTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '800', marginBottom: 8 },
  syncStatusText: { color: theme.colors.textMuted, fontSize: 13, marginBottom: 20, textAlign: 'center' },
  syncProgressBg: { width: '100%', height: 6, backgroundColor: theme.colors.border, borderRadius: 3, overflow: 'hidden', marginBottom: 8 },
  syncProgressFill: { height: '100%', backgroundColor: theme.colors.primary, borderRadius: 3 },
  syncProgressPct: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' },

  // Custom Alert Modal
  alertOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.7)', justifyContent: 'center' },
  alertBoxCentered: { backgroundColor: theme.colors.surfaceSecondary, borderRadius: 24, padding: 32, margin: 24, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border },
  alertBoxBottom: { backgroundColor: theme.colors.surfaceSecondary, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', marginTop: 'auto' },
  alertHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, gap: 10 },
  alertHeaderDanger: { backgroundColor: theme.colors.danger + '20' },
  alertHeaderSuccess: { backgroundColor: theme.colors.success + '20' },
  alertEmoji: { fontSize: 24 },
  alertTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '800' },
  alertContent: { padding: 24 },
  alertAmount: { color: theme.colors.text, fontSize: 32, fontWeight: '900', marginBottom: 4 },
  alertDesc: { color: theme.colors.textMuted, fontSize: 14, marginBottom: 16, lineHeight: 20 },
  descInput: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: theme.colors.text,
    fontSize: 14,
    marginBottom: 16,
  },
  alertRaw: { color: theme.colors.textMuted, fontSize: 12, fontStyle: 'italic', marginBottom: 24, lineHeight: 18 },
  catPickerLabel: { color: theme.colors.text, fontSize: 14, fontWeight: '700', marginBottom: 12 },
  catPicker: { flexDirection: 'row', marginBottom: 24 },
  catPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, marginRight: 10, gap: 6 },
  catPillEmoji: { fontSize: 16 },
  catPillText: { color: theme.colors.text, fontSize: 13, fontWeight: '700' },
  saveBtn: { backgroundColor: theme.colors.primary, padding: 16, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  // Type toggle
  typeToggleRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  typeToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  typeToggleBtnActiveIncome: {
    borderColor: theme.colors.success,
    backgroundColor: theme.colors.success + '18',
  },
  typeToggleBtnActiveExpense: {
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.danger + '18',
  },
  typeToggleIcon: { fontSize: 18 },
  typeToggleText: { color: theme.colors.textMuted, fontSize: 14, fontWeight: '700' },
});
