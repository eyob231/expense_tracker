import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient as SvgLinearGradient,
  Path,
  Polyline,
  Stop,
} from 'react-native-svg';
import { useIsFocused, useRoute } from '@react-navigation/native';
import {
  getTransactions,
  addTransaction,
  clearSmsTransactionsAndResetSync,
} from '../storage';
import { Transaction } from '../parser';
import { Theme, CATEGORY_META } from '../theme';
import { useTheme, useThemedStyles } from '../themeContext';
import AddTransactionModal from '../components/AddTransactionModal';
import ReviewQueueModal from '../components/ReviewQueueModal';
import { syncDeviceSms, subscribeToIncomingSms } from '../deviceSms';
import { SkeletonBalanceCard, SkeletonTxCard } from '../components/SkeletonCard';
import SectionHeader from '../components/SectionHeader';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

// ── Count-up animation hook ────────────────────────────────────────
function useCountUp(target: number, duration = 900) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const start = prev.current;
    const diff = target - start;
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + diff * eased);
      if (progress < 1) requestAnimationFrame(tick);
      else prev.current = target;
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return display;
}

// ── Mini sparkline (lightweight SVG) ───────────────────────────────
function Sparkline({
  values,
  color = '#fff',
  width = 88,
  height = 40,
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return null;

  const max = Math.max(...values, 1);
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => ({
    x: i * stepX,
    y: height - 4 - (v / max) * (height - 12),
  }));

  const line = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area =
    `M ${points[0].x.toFixed(1)},${height} L ` +
    points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ') +
    ` L ${points[points.length - 1].x.toFixed(1)},${height} Z`;
  const last = points[points.length - 1];

  return (
    <Svg width={width} height={height}>
      <Defs>
        <SvgLinearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.35} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </SvgLinearGradient>
      </Defs>
      <Path d={area} fill="url(#sparkFill)" />
      <Polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={last.x} cy={last.y} r={2.5} fill={color} />
    </Svg>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────
// We only auto-open the labelling sheet once per app launch — nagging on every
// tab switch would be worse than not asking at all. And even then we ask about
// just the newest couple of transactions, never the whole backlog.
let reviewPromptedThisLaunch = false;
const MAX_LAUNCH_PROMPT = 2;

export default function DashboardScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const isFocused = useIsFocused();
  const route = useRoute();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [showReviewQueue, setShowReviewQueue] = useState(false);
  // The slice of unreviewed transactions currently being asked about.
  // Kept as its own state so the sheet never blows up mid-animation when the
  // underlying transaction list refreshes.
  const [reviewBatch, setReviewBatch] = useState<Transaction[]>([]);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const [syncProgress, setSyncProgress] = useState(0);
  const [showSyncOptions, setShowSyncOptions] = useState(false);
  const [syncResult, setSyncResult] = useState<{ title: string; message: string } | null>(null);

  // Balance visibility
  const [isBalanceHidden, setIsBalanceHidden] = useState(false);
  const [isCbeHidden, setIsCbeHidden] = useState(false);

  // Whether auto-import is live, so the user knows messages are watched
  const [smsEnabled, setSmsEnabled] = useState<boolean | null>(null);

  // Tracks whether the first data load has settled (used for the launch prompt)
  const firstLoadRef = useRef(false);

  useEffect(() => {
    if (isFocused) loadData();
  }, [isFocused]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS)
      .then(setSmsEnabled)
      .catch(() => setSmsEnabled(false));
  }, [isFocused]);

  // Open add modal from FAB (via navigation param)
  useEffect(() => {
    const params = route.params as { openAdd?: boolean } | undefined;
    if (params?.openAdd) {
      setIsModalVisible(true);
    }
  }, [route.params]);

  useEffect(() => {
    const unsubscribe = subscribeToIncomingSms(() => loadData());
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  const loadData = async () => {
    setLoading(true);
    const list = await getTransactions();
    setTransactions(list);
    setLoading(false);
  };

  const runSync = async (isResync: boolean) => {
    setIsSyncing(true);
    setSyncStatus('Initializing…');
    setSyncProgress(0);
    if (isResync) {
      setSyncStatus('Clearing old records…');
      await clearSmsTransactionsAndResetSync();
    }
    const { imported, total } = await syncDeviceSms((stage: any, current: number, tot: number) => {
      setSyncStatus(typeof stage === 'string' ? stage : 'Reading…');
      if (tot > 0) setSyncProgress(current / tot);
    });
    await loadData();
    setSyncStatus('Done!');
    setSyncProgress(1);
    setTimeout(() => {
      setIsSyncing(false);
      setSyncStatus('');
      setSyncProgress(0);
      setSyncResult({
        title: isResync ? '✅ Re-sync Complete' : (total > 0 ? '✅ Sync Complete' : 'Nothing New'),
        message: total > 0
          ? `Found ${total} bank messages.\nImported ${imported} new transactions.`
          : 'No new bank SMS found in the last 30 days.',
      });
    }, 900);
  };

  // ── Derived data ─────────────────────────────────────────────────
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const thisMonthTx = transactions.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });

  const totalIncome = thisMonthTx.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
  const totalExpense = thisMonthTx.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
  const netBalance = totalIncome - totalExpense;

  const unreviewedTx = transactions.filter(t => !t.isReviewed && !t.isManual);

  const openReview = (list: Transaction[]) => {
    if (list.length === 0) return;
    setReviewBatch(list);
    setShowReviewQueue(true);
  };

  const closeReview = () => {
    // Keep `reviewBatch` populated — clearing it here would unmount the sheet
    // mid-close-animation and leave a blank frame. Just refresh the ledger.
    setShowReviewQueue(false);
    loadData();
  };

  // On launch, if SMS import produced unreviewed transactions, ask the user to
  // label them using the existing bottom sheet instead of leaving them to find
  // the banner themselves. Only the first completed load counts, so a message
  // arriving later never yanks a sheet up while the user is reading.
  useEffect(() => {
    if (loading || firstLoadRef.current) return;
    firstLoadRef.current = true;
    if (reviewPromptedThisLaunch || unreviewedTx.length === 0) return;
    reviewPromptedThisLaunch = true;
    const timer = setTimeout(() => {
      openReview(unreviewedTx.slice(0, MAX_LAUNCH_PROMPT));
    }, 700);
    return () => clearTimeout(timer);
  }, [loading, unreviewedTx]);

  // Account balances (most recent reading per bank)
  const cbeBalance = transactions.find(t => t.sender.toLowerCase() === 'cbe' && t.balance > 0)?.balance;
  const telebirrBalance = transactions.find(t => t.sender.toLowerCase() === 'telebirr' && t.balance > 0)?.balance;
  const cbeBirrBalance = transactions.find(t => t.sender.toLowerCase() === 'cbe birr' && t.balance > 0)?.balance;

  // Sparkline: last 7 daily totals
  const sparkValues = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return transactions
      .filter(t => {
        const td = new Date(t.date);
        return td.getDate() === d.getDate() && td.getMonth() === d.getMonth();
      })
      .filter(t => t.type === 'debit')
      .reduce((s, t) => s + t.amount, 0);
  });

  // Recent transactions grouped by day
  const recentTx = transactions.slice(0, 8);

  const groupByDay = (txs: Transaction[]) => {
    const groups: Record<string, Transaction[]> = {};
    txs.forEach(tx => {
      const d = new Date(tx.date);
      const key = d.toDateString();
      if (!groups[key]) groups[key] = [];
      groups[key].push(tx);
    });
    return Object.entries(groups);
  };

  const dayLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const grouped = groupByDay(recentTx);

  // Quick stats
  const dayOfMonth = now.getDate();
  const avgPerDay = dayOfMonth > 0 ? totalExpense / dayOfMonth : 0;
  const biggestSpend = thisMonthTx
    .filter(t => t.type === 'debit')
    .reduce((max, t) => Math.max(max, t.amount), 0);

  // Count-up animations
  const animatedSpent = useCountUp(totalExpense);
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle={theme.isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── HEADER ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>
              {now.getHours() < 12 ? 'Good morning ☀️' : now.getHours() < 17 ? 'Good afternoon ☀️' : 'Good evening 🌙'}
            </Text>
            <Text style={styles.headerTitle}>Expense Tracker</Text>
            {Platform.OS === 'android' && (
              <View style={styles.statusRow}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: smsEnabled === false ? theme.colors.amber : theme.colors.success },
                  ]}
                />
                <Text style={styles.statusText}>
                  {smsEnabled === false ? 'SMS access off — sync manually' : 'Auto-importing bank SMS'}
                </Text>
              </View>
            )}
          </View>
          <TouchableOpacity
            style={styles.syncBtn}
            onPress={() => setShowSyncOptions(true)}
            disabled={isSyncing}
            accessibilityLabel="Sync SMS"
            accessibilityRole="button"
          >
            {isSyncing
              ? <ActivityIndicator size="small" color={theme.colors.primary} />
              : <Icon name="refresh" size={20} color={theme.colors.primary} />}
          </TouchableOpacity>
        </View>

        {loading ? (
          <>
            <SkeletonBalanceCard />
            <SkeletonTxCard />
            <SkeletonTxCard />
            <SkeletonTxCard />
          </>
        ) : (
          <>
            {/* ── SPEND CARD ── */}
            <View style={styles.balanceCard}>
              {/* Teal ambient blob */}
              <View style={styles.balanceGlow} />

              <View style={styles.balanceTop}>
                <View style={styles.balanceTopLeft}>
                  <Text style={styles.balanceCaption}>
                    SPENT · {now.toLocaleString('default', { month: 'long' }).toUpperCase()}
                  </Text>
                  <View style={styles.balanceAmtRow}>
                    <Text style={styles.balanceSign}>−</Text>
                    <Text style={styles.balanceCurrency}>Br </Text>
                    <Text
                      style={styles.balanceAmount}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.6}
                    >
                      {isBalanceHidden ? '••••••' : fmt(animatedSpent)}
                    </Text>
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setIsBalanceHidden(h => !h)}
                      accessibilityLabel={isBalanceHidden ? 'Show amounts' : 'Hide amounts'}
                    >
                      <Icon
                        name={isBalanceHidden ? 'eye-off-outline' : 'eye-outline'}
                        size={18}
                        color="rgba(255,255,255,0.7)"
                      />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.sparkWrap}>
                  <Sparkline values={sparkValues} />
                  <Text style={styles.sparkCaption}>LAST 7 DAYS</Text>
                </View>
              </View>

              <View style={styles.balanceDivider} />

              <View style={styles.balanceStats}>
                <View style={styles.balanceStat}>
                  <View style={[styles.statDot, { backgroundColor: theme.colors.success }]} />
                  <View>
                    <Text style={styles.statCaption}>INCOME</Text>
                    <Text
                      style={[styles.statAmt, { color: theme.colors.success }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {isBalanceHidden ? '••••' : `+Br ${fmt(totalIncome)}`}
                    </Text>
                  </View>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.balanceStat}>
                  <View style={[styles.statDot, { backgroundColor: '#fff' }]} />
                  <View>
                    <Text style={styles.statCaption}>LEFT OVER</Text>
                    <Text
                      style={[styles.statAmt, { color: netBalance < 0 ? theme.colors.danger : '#fff' }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {isBalanceHidden
                        ? '••••'
                        : `${netBalance < 0 ? '−' : '+'}Br ${fmt(Math.abs(netBalance))}`}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* ── QUICK STATS ── */}
            <View style={styles.quickStats}>
              <QuickStat label="AVG / DAY" value={`Br ${fmt(avgPerDay)}`} />
              <View style={styles.quickStatsDivider} />
              <QuickStat label="BIGGEST" value={`Br ${fmt(biggestSpend)}`} />
              <View style={styles.quickStatsDivider} />
              <QuickStat label="THIS MONTH" value={`${thisMonthTx.length}`} />
            </View>

            {/* ── REVIEW QUEUE BANNER ── */}
            {unreviewedTx.length > 0 && (
              <TouchableOpacity
                style={styles.reviewBanner}
                onPress={() => openReview(unreviewedTx)}
                activeOpacity={0.8}
                accessibilityLabel={`Review ${unreviewedTx.length} new SMS transactions`}
              >
                <View style={styles.reviewBannerIcon}>
                  <Icon name="message-badge-outline" size={22} color={theme.colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reviewBannerTitle}>
                    {unreviewedTx.length} new SMS transaction{unreviewedTx.length !== 1 ? 's' : ''} to review
                  </Text>
                  <Text style={styles.reviewBannerSub}>Label them one by one →</Text>
                </View>
                <View style={styles.reviewBannerBadge}>
                  <Text style={styles.reviewBannerBadgeText}>{unreviewedTx.length}</Text>
                </View>
              </TouchableOpacity>
            )}

            {/* ── ACCOUNT BALANCES ── */}
            {(cbeBalance !== undefined || cbeBirrBalance !== undefined || telebirrBalance !== undefined) && (
              <>
                <View style={styles.sectionHeaderWrap}>
                  <SectionHeader label="Account balances" sub="Latest reading" />
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bankScroll}>
                  {cbeBalance !== undefined && (
                    <BankCard
                      emoji="🏦"
                      name="CBE"
                      balance={cbeBalance}
                      color={theme.colors.bankCbe}
                      hidden={isCbeHidden}
                      onToggle={() => setIsCbeHidden(h => !h)}
                    />
                  )}
                  {cbeBirrBalance !== undefined && (
                    <BankCard
                      emoji="🟢"
                      name="CBE Birr"
                      balance={cbeBirrBalance}
                      color={theme.colors.bankCbeBirr}
                      hidden={isCbeHidden}
                      onToggle={() => setIsCbeHidden(h => !h)}
                    />
                  )}
                  {telebirrBalance !== undefined && (
                    <BankCard
                      emoji="📱"
                      name="Telebirr"
                      balance={telebirrBalance}
                      color={theme.colors.bankTelebirr}
                      hidden={isCbeHidden}
                      onToggle={() => setIsCbeHidden(h => !h)}
                    />
                  )}
                </ScrollView>
              </>
            )}

            {/* ── RECENT ACTIVITY ── */}
            <View style={styles.sectionHeaderWrap}>
              <SectionHeader
                label="Recent activity"
                sub={`${transactions.length} total`}
                large
              />
            </View>

            {recentTx.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconWrap}>
                  <Icon name="message-text-clock-outline" size={28} color={theme.colors.primary} />
                </View>
                <Text style={styles.emptyTitle}>No transactions yet</Text>
                <Text style={styles.emptyHint}>
                  Bank messages are logged automatically as they arrive. Import your recent ones to get started.
                </Text>
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => runSync(false)}
                  accessibilityLabel="Import bank messages"
                  accessibilityRole="button"
                >
                  <Icon name="refresh" size={16} color="#fff" />
                  <Text style={styles.emptyBtnText}>Import bank messages</Text>
                </TouchableOpacity>
              </View>
            ) : (
              grouped.map(([dateStr, txs]) => (
                <View key={dateStr}>
                  <View style={styles.dayHeaderRow}>
                    <View style={styles.dayDot} />
                    <Text style={styles.dayHeader}>{dayLabel(dateStr)}</Text>
                    <Text style={styles.dayTotal}>
                      {txs.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0) > 0
                        ? `-Br ${fmt(txs.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0))}`
                        : ''}
                    </Text>
                  </View>
                  {txs.map((tx, idx) => (
                    <TxRow key={tx.id} tx={tx} isLast={idx === txs.length - 1} />
                  ))}
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* ── SYNC PROGRESS OVERLAY ── */}
      {isSyncing && (
        <Modal transparent visible animationType="fade">
          <View style={styles.syncOverlay}>
            <View style={styles.syncBox}>
              <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginBottom: 16 }} />
              <Text style={styles.syncTitle}>Syncing SMS</Text>
              <Text style={styles.syncStatus}>{syncStatus}</Text>
              <View style={styles.syncProgressBg}>
                <View style={[styles.syncProgressFill, { width: `${Math.max(2, syncProgress * 100)}%` }]} />
              </View>
              <Text style={styles.syncPct}>{Math.round(syncProgress * 100)}%</Text>
            </View>
          </View>
        </Modal>
      )}

      {/* ── SYNC OPTIONS ── */}
      {showSyncOptions && (
        <Modal transparent visible animationType="slide">
          <View style={styles.sheetOverlay}>
            <View style={styles.sheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Sync Bank SMS</Text>
              <Text style={styles.sheetDesc}>
                {'• Sync New — import messages not yet stored.\n• Re-sync All — clear old records and re-import everything.'}
              </Text>
              <TouchableOpacity
                style={styles.sheetPrimary}
                onPress={() => { setShowSyncOptions(false); runSync(false); }}
              >
                <Icon name="refresh" size={18} color="#fff" />
                <Text style={styles.sheetPrimaryText}>Sync New</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sheetDanger}
                onPress={() => { setShowSyncOptions(false); runSync(true); }}
              >
                <Icon name="database-refresh-outline" size={18} color={theme.colors.danger} />
                <Text style={styles.sheetDangerText}>Re-sync All</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetCancel} onPress={() => setShowSyncOptions(false)}>
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* ── SYNC RESULT ── */}
      {syncResult && (
        <Modal transparent visible animationType="fade">
          <View style={styles.syncOverlay}>
            <View style={styles.syncBox}>
              <Text style={styles.syncResultTitle}>{syncResult.title}</Text>
              <Text style={styles.syncStatus}>{syncResult.message}</Text>
              <TouchableOpacity
                style={styles.sheetPrimary}
                onPress={() => setSyncResult(null)}
              >
                <Text style={styles.sheetPrimaryText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* ── ADD TRANSACTION ── */}
      <AddTransactionModal
        visible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        onAdd={async (tx) => { await addTransaction(tx); loadData(); }}
      />

      {/* ── REVIEW QUEUE ── */}
      <ReviewQueueModal
        visible={showReviewQueue}
        queue={reviewBatch}
        remaining={Math.max(0, unreviewedTx.length - reviewBatch.length)}
        onClose={closeReview}
        onDone={closeReview}
      />
    </SafeAreaView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

function QuickStat({ label, value }: { label: string; value: string }) {
  const quickStatStyles = useThemedStyles(createQuickStatStyles);
  return (
    <View style={quickStatStyles.item}>
      <Text style={quickStatStyles.label}>{label}</Text>
      <Text style={quickStatStyles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const createQuickStatStyles = (theme: Theme) => StyleSheet.create({
  item: { flex: 1, alignItems: 'center' },
  label: {
    ...theme.typography.overline,
    fontSize: 9,
    color: theme.colors.textMuted,
    marginBottom: 4,
  },
  value: { ...theme.typography.title, color: theme.colors.textSecondary },
});

function BankCard({
  emoji, name, balance, color, hidden, onToggle,
}: {
  emoji: string; name: string; balance: number;
  color: string; hidden: boolean; onToggle: () => void;
}) {
  const { theme } = useTheme();
  const bankStyles = useThemedStyles(createBankStyles);
  return (
    <View style={[bankStyles.card, theme.shadow.sm]}>
      <View style={[bankStyles.iconWrap, { backgroundColor: color + '20' }]}>
        <Text style={{ fontSize: 20 }}>{emoji}</Text>
      </View>
      <View style={bankStyles.nameRow}>
        <Text style={bankStyles.name}>{name}</Text>
        <TouchableOpacity onPress={onToggle} accessibilityLabel={`Toggle ${name} balance visibility`}>
          <Icon name={hidden ? 'eye-off-outline' : 'eye-outline'} size={14} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>
      <Text style={[bankStyles.balance, { color }]}>
        {hidden ? '••••' : balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
      </Text>
      <Text style={bankStyles.currency}>ETB</Text>
    </View>
  );
}

const createBankStyles = (theme: Theme) => StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    width: 120,
    marginRight: 10,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  nameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  name: { color: theme.colors.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  balance: { fontSize: 17, fontWeight: '900' },
  currency: { color: theme.colors.textMuted, fontSize: 9, fontWeight: '600', marginTop: 2 },
});

function TxRow({ tx, isLast }: { tx: Transaction; isLast: boolean }) {
  const { theme } = useTheme();
  const txStyles = useThemedStyles(createTxStyles);
  const meta = CATEGORY_META[tx.category] ?? { emoji: '🏷️', color: theme.colors.textMuted };
  const isDebit = tx.type === 'debit';
  return (
    <View style={[txStyles.row, !isLast && txStyles.rowBorder]}>
      <View style={[txStyles.icon, { backgroundColor: meta.color + '20' }]}>
        <Text style={{ fontSize: 20 }}>{meta.emoji}</Text>
      </View>
      <View style={txStyles.mid}>
        <Text style={txStyles.desc} numberOfLines={1}>{tx.description}</Text>
        <View style={txStyles.metaRow}>
          <Text style={txStyles.metaText}>
            {new Date(tx.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <View style={[txStyles.catChip, { backgroundColor: meta.color + '18' }]}>
            <Text style={[txStyles.catChipText, { color: meta.color }]}>{tx.category}</Text>
          </View>
          {!tx.isReviewed && !tx.isManual && (
            <View style={txStyles.newBadge}>
              <Text style={txStyles.newBadgeText}>NEW</Text>
            </View>
          )}
        </View>
      </View>
      <View style={txStyles.right}>
        <Text style={[txStyles.amt, isDebit ? txStyles.debit : txStyles.credit]}>
          {isDebit ? '-' : '+'}Br {tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </Text>
        {tx.sender && (
          <Text style={txStyles.sender}>{tx.sender.toUpperCase()}</Text>
        )}
      </View>
    </View>
  );
}

const createTxStyles = (theme: Theme) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.surface,
    marginBottom: 2,
    borderRadius: theme.borderRadius.md,
  },
  rowBorder: { marginBottom: 2 },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  mid: { flex: 1 },
  desc: { color: theme.colors.text, fontSize: 14, fontWeight: '600', marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  metaText: { color: theme.colors.textMuted, fontSize: 11 },
  catChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  catChipText: { fontSize: 10, fontWeight: '700' },
  newBadge: {
    backgroundColor: theme.colors.amberSubtle,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  newBadgeText: { color: theme.colors.amber, fontSize: 9, fontWeight: '800' },
  right: { alignItems: 'flex-end' },
  amt: { fontSize: 14, fontWeight: '800' },
  debit: { color: theme.colors.danger },
  credit: { color: theme.colors.success },
  sender: { color: theme.colors.textMuted, fontSize: 10, marginTop: 2 },
});

// ── Styles ──────────────────────────────────────────────────────────
const createStyles = (theme: Theme) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  scroll: { paddingBottom: 100 },

  // Header
  header: {
    paddingTop: theme.statusBarHeight + 12,
    paddingHorizontal: 20,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: { flex: 1, paddingRight: 12 },
  greeting: { color: theme.colors.textMuted, fontSize: 13, fontWeight: '600' },
  headerTitle: { color: theme.colors.text, fontSize: 24, fontWeight: '800', marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '600' },
  syncBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadow.sm,
  },

  // Balance card
  balanceCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.primaryDeep,
    padding: 24,
    overflow: 'hidden',
    position: 'relative',
    ...theme.shadow.accent,
  },
  balanceGlow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  balanceTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
    gap: 12,
  },
  balanceTopLeft: { flex: 1, minWidth: 0 },
  balanceSign: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 26,
    fontWeight: '800',
    marginRight: -4,
  },
  sparkWrap: { alignItems: 'center', gap: 4, flexShrink: 0 },
  sparkCaption: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
  balanceCaption: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  balanceAmtRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    flexShrink: 1,
  },
  balanceCurrency: {
    color: 'rgba(255,255,255,0.60)',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  balanceAmount: {
    color: '#fff',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: -1.4,
    flexShrink: 1,
  },
  eyeBtn: { padding: 8, marginLeft: 4 },
  balanceDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 16,
  },
  balanceStats: { flexDirection: 'row', alignItems: 'center' },
  balanceStat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  statDot: { width: 8, height: 8, borderRadius: 4 },
  statCaption: { color: 'rgba(255,255,255,0.78)', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  statAmt: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 8 },

  // Review banner
  // Quick stats
  quickStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 14,
    paddingHorizontal: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    ...theme.shadow.sm,
  },
  quickStatsDivider: {
    width: 1,
    height: 26,
    backgroundColor: theme.colors.border,
  },

  reviewBanner: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: theme.colors.primarySubtle,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reviewBannerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primaryGlow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewBannerTitle: { color: theme.colors.text, fontSize: 14, fontWeight: '700' },
  reviewBannerSub: { color: theme.colors.primary, fontSize: 12, marginTop: 2 },
  reviewBannerBadge: {
    backgroundColor: theme.colors.primaryDeep,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewBannerBadgeText: { color: theme.colors.onPrimary, fontSize: 13, fontWeight: '800' },

  // Section headers
  sectionHeaderWrap: { marginHorizontal: 16, marginBottom: 10, marginTop: 4 },

  // Account balances
  bankScroll: { paddingLeft: 16, marginBottom: 20 },

  // Day groups
  dayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 6,
  },
  dayDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.primary },
  dayHeader: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '700', flex: 1 },
  dayTotal: { color: theme.colors.danger, fontSize: 11, fontWeight: '700' },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 32 },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.primarySubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '800', marginBottom: 6 },
  emptyHint: { color: theme.colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.primaryDeep,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 20,
    paddingVertical: 12,
    marginTop: 18,
    ...theme.shadow.accent,
  },
  emptyBtnText: { color: theme.colors.onPrimary, fontSize: 14, fontWeight: '800' },

  // Sync overlays
  syncOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  syncBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: 32,
    width: '100%',
    alignItems: 'center',
    ...theme.shadow.md,
  },
  syncTitle: { color: theme.colors.text, fontSize: 18, fontWeight: '800', marginBottom: 8 },
  syncResultTitle: { color: theme.colors.text, fontSize: 22, fontWeight: '800', marginBottom: 8 },
  syncStatus: { color: theme.colors.textMuted, fontSize: 13, marginBottom: 20, textAlign: 'center', lineHeight: 20 },
  syncProgressBg: {
    width: '100%',
    height: 6,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  syncProgressFill: { height: '100%', backgroundColor: theme.colors.primary, borderRadius: 3 },
  syncPct: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' },

  // Bottom sheets
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    padding: 24,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: { color: theme.colors.text, fontSize: 20, fontWeight: '800', marginBottom: 10 },
  sheetDesc: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 20, marginBottom: 20 },
  sheetPrimary: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    padding: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sheetPrimaryText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  sheetDanger: {
    borderRadius: theme.borderRadius.md,
    padding: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
    borderWidth: 1.5,
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerSubtle,
  },
  sheetDangerText: { color: theme.colors.danger, fontSize: 16, fontWeight: '700' },
  sheetCancel: {
    padding: 16,
    alignItems: 'center',
  },
  sheetCancelText: { color: theme.colors.textMuted, fontSize: 15, fontWeight: '600' },
});
