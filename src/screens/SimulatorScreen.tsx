import React, { useCallback, useState } from 'react';
import {
  Alert,
  PermissionsAndroid,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import {
  parseSMS,
  Transaction,
  Category,
  CategoryRule,
  FrequentAccount,
  getFrequentAccounts,
} from '../parser';
import {
  addTransaction,
  getCategoryMappings,
  saveCategoryMapping,
  deleteCategoryMapping,
  applyRuleToExisting,
  getTransactions,
} from '../storage';
import {
  Theme,
  ThemeMode,
  ACCENTS,
  ACCENT_ORDER,
  CATEGORY_META,
} from '../theme';
import { useTheme, useThemedStyles } from '../themeContext';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const getBanks = (theme: Theme) => [
  { label: 'CBE',     value: 'CBE',      icon: 'bank',         color: theme.colors.bankCbe },
  { label: '127',     value: '127',       icon: 'bank-outline', color: theme.colors.bankCbe },
  { label: 'CBE Birr',value: 'CBEBirr',   icon: 'currency-usd', color: theme.colors.bankCbeBirr },
  { label: 'Telebirr',value: 'telebirr',  icon: 'cellphone',    color: theme.colors.bankTelebirr },
  { label: '8036',    value: '8036',      icon: 'bank-outline', color: theme.colors.textMuted },
];

const CATEGORIES: Category[] = [
  'Food & Dining', 'Shopping', 'Transportation', 'Salary', 'UPI Transfers', 'Other',
];

function SectionCard({
  title, icon, children,
}: { title: string; icon: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  const cardStyles = useThemedStyles(createCardStyles);
  return (
    <View style={cardStyles.wrap}>
      <View style={cardStyles.header}>
        <View style={cardStyles.iconWrap}>
          <Icon name={icon} size={18} color={theme.colors.primary} />
        </View>
        <Text style={cardStyles.title}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

const createCardStyles = (theme: Theme) => StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 20,
    marginBottom: 16,
    ...theme.shadow.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: theme.colors.primarySubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
});

export default function SimulatorScreen() {
  const { theme, mode, accentKey, setMode, setAccent } = useTheme();
  const styles = useThemedStyles(createStyles);
  const banks = getBanks(theme);
  const isFocused = useIsFocused();
  const [sender, setSender] = useState('CBE');
  const [smsBody, setSmsBody] = useState('');
  const [parsedTx, setParsedTx] = useState<Transaction | null>(null);
  const [parseError, setParseError] = useState(false);
  const [simulatorOpen, setSimulatorOpen] = useState(false);

  const [rules, setRules] = useState<Record<string, CategoryRule>>({});
  const [newRuleKeyword, setNewRuleKeyword] = useState('');
  const [newRuleCategory, setNewRuleCategory] = useState<Category>('Salary');

  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [frequent, setFrequent] = useState<FrequentAccount[]>([]);
  const [frequentPicks, setFrequentPicks] = useState<Record<string, Category>>({});

  const loadAll = useCallback(async () => {
    const [mappings, transactions] = await Promise.all([
      getCategoryMappings(),
      getTransactions(),
    ]);
    setRules(mappings);
    setFrequent(getFrequentAccounts(transactions));

    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.READ_SMS,
        );
        setPermissionGranted(granted);
      } catch {
        setPermissionGranted(null);
      }
    }
  }, []);

  React.useEffect(() => { if (isFocused) loadAll(); }, [isFocused, loadAll]);

  const loadRules = async () => {
    const mappings = await getCategoryMappings();
    setRules(mappings);
  };

  /** Save a rule and immediately re-categorize existing matching transactions. */
  const applyRule = async (keyword: string, category: Category) => {
    await saveCategoryMapping(keyword, category);
    const changed = await applyRuleToExisting(keyword, category);
    await loadAll();
    return changed;
  };

  const handleAddRule = async () => {
    const keyword = newRuleKeyword.trim();
    if (!keyword) return;
    const changed = await applyRule(keyword, newRuleCategory);
    setNewRuleKeyword('');
    Alert.alert(
      'Rule saved',
      changed > 0
        ? `New messages are categorized as “${newRuleCategory}”.\n${changed} existing transaction${changed === 1 ? '' : 's'} updated.`
        : `New messages will be categorized as “${newRuleCategory}”.`,
    );
  };

  const handleApplyFrequent = async (account: FrequentAccount) => {
    const category = frequentPicks[account.key] ?? account.category;
    await applyRule(account.key, category);
  };

  const handleDeleteRule = async (keyword: string) => {
    await deleteCategoryMapping(keyword);
    loadRules();
  };

  const handleParse = async () => {
    if (!smsBody.trim()) {
      Alert.alert('Empty Message', 'Please paste an SMS message body first.');
      return;
    }
    const mappings = await getCategoryMappings();
    const parsed = parseSMS(smsBody, sender, Date.now(), mappings);
    setParsedTx(parsed);
    setParseError(!parsed);
  };

  const handleImport = async () => {
    if (!parsedTx) return;
    await addTransaction(parsedTx);
    Alert.alert('✅ Imported', 'Transaction added to your Ledger.');
    setParsedTx(null);
    setSmsBody('');
    setParseError(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle={theme.isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerLabel}>SETTINGS</Text>
          <Text style={styles.headerTitle}>Settings & Tools</Text>
        </View>

        {/* ── Appearance ── */}
        <SectionCard title="Appearance" icon="palette-outline">
          <Text style={styles.cardDesc}>
            Choose a mode and an accent colour. Saved on this device.
          </Text>

          <Text style={styles.fieldLabel}>Mode</Text>
          <View style={styles.modeRow}>
            {([
              { key: 'system', label: 'Auto', icon: 'theme-light-dark' },
              { key: 'light', label: 'Light', icon: 'white-balance-sunny' },
              { key: 'dark', label: 'Dark', icon: 'weather-night' },
            ] as { key: ThemeMode; label: string; icon: string }[]).map(opt => {
              const active = mode === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.modeBtn, active && styles.modeBtnActive]}
                  onPress={() => setMode(opt.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`${opt.label} appearance`}
                >
                  <Icon
                    name={opt.icon}
                    size={15}
                    color={active ? theme.colors.primary : theme.colors.textMuted}
                  />
                  <Text style={[styles.modeBtnText, active && styles.modeBtnTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Accent</Text>
          <View style={styles.accentRow}>
            {ACCENT_ORDER.map(key => {
              const accent = ACCENTS[key];
              const active = accentKey === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.accentSwatch,
                    { backgroundColor: accent.deep },
                    active && styles.accentSwatchActive,
                  ]}
                  onPress={() => setAccent(key)}
                  accessibilityRole="button"
                  accessibilityLabel={`${accent.label} accent`}
                >
                  {active && <Icon name="check-bold" size={15} color="#fff" />}
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.accentHint}>{ACCENTS[accentKey].label} selected</Text>
        </SectionCard>

        {/* ── SMS Permission Status ── */}
        <SectionCard title="SMS Permissions" icon="message-lock-outline">
          <View style={styles.permRow}>
            <View
              style={[
                styles.permIcon,
                permissionGranted === false && { backgroundColor: theme.colors.dangerSubtle },
              ]}
            >
              <Icon
                name={permissionGranted === false ? 'alert-circle-outline' : 'check-circle'}
                size={22}
                color={permissionGranted === false ? theme.colors.danger : theme.colors.success}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.permTitle}>
                Read SMS — {permissionGranted === false ? 'Not granted' : permissionGranted ? 'Granted' : 'Unknown'}
              </Text>
              <Text style={styles.permDesc}>
                {permissionGranted === false
                  ? 'Grant SMS access from Android settings so bank messages import automatically.'
                  : 'Bank messages are read and logged automatically — no manual syncing needed.'}
              </Text>
            </View>
          </View>
        </SectionCard>

        {/* ── Frequent Accounts ── */}
        <SectionCard title="Frequent Accounts" icon="account-multiple-outline">
          <Text style={styles.cardDesc}>
            Accounts and payees seen most often in your messages. Pick a category and the rule
            applies to past and future transactions — no more guessing.
          </Text>

          {frequent.length === 0 ? (
            <View style={styles.freqEmpty}>
              <Text style={styles.freqEmptyText}>
                No accounts detected yet. Sync your bank SMS to build this list.
              </Text>
            </View>
          ) : (
            frequent.map(account => {
              const picked = frequentPicks[account.key] ?? account.category;
              const meta = CATEGORY_META[picked] ?? { emoji: '🏷️', color: theme.colors.primary };
              return (
                <View key={account.key} style={styles.freqCard}>
                  <View style={styles.freqTop}>
                    <View style={styles.freqNameWrap}>
                      <Text style={styles.freqName} numberOfLines={1}>{account.label}</Text>
                      <Text style={styles.freqMeta}>
                        {account.count}× · Br {account.total.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.freqApply, { backgroundColor: meta.color + '20', borderColor: meta.color }]}
                      onPress={() => handleApplyFrequent(account)}
                      accessibilityLabel={`Apply category ${picked} to ${account.label}`}
                    >
                      <Text style={[styles.freqApplyText, { color: meta.color }]}>
                        {meta.emoji} {picked} ✓
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {CATEGORIES.map(cat => {
                      const catMeta = CATEGORY_META[cat] ?? { emoji: '🏷️', color: theme.colors.primary };
                      const active = picked === cat;
                      return (
                        <TouchableOpacity
                          key={cat}
                          style={[styles.freqChip, active && { backgroundColor: catMeta.color + '20', borderColor: catMeta.color }]}
                          onPress={() => setFrequentPicks(p => ({ ...p, [account.key]: cat }))}
                        >
                          <Text style={styles.freqChipEmoji}>{catMeta.emoji}</Text>
                          <Text style={[styles.freqChipText, active && { color: catMeta.color }]}>{cat}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              );
            })
          )}
        </SectionCard>

        {/* ── Smart Category Rules ── */}
        <SectionCard title="Smart Category Rules" icon="tag-text-outline">
          <Text style={styles.cardDesc}>
            Automatically categorize by keyword — phone numbers, names, or merchant IDs.
          </Text>

          {/* Add rule */}
          <TextInput
            style={styles.ruleInput}
            placeholder="e.g. 0911000000 or Uber"
            placeholderTextColor={theme.colors.textMuted}
            value={newRuleKeyword}
            onChangeText={setNewRuleKeyword}
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {CATEGORIES.map(cat => {
              const meta = CATEGORY_META[cat] ?? { emoji: '🏷️', color: theme.colors.primary };
              const active = newRuleCategory === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.ruleCatChip,
                    active && { backgroundColor: meta.color + '20', borderColor: meta.color },
                  ]}
                  onPress={() => setNewRuleCategory(cat)}
                >
                  <Text style={{ fontSize: 14 }}>{meta.emoji}</Text>
                  <Text style={[styles.ruleCatText, active && { color: meta.color }]}>{cat}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity style={styles.addRuleBtn} onPress={handleAddRule}>
            <Icon name="plus" size={16} color="#fff" />
            <Text style={styles.addRuleBtnText}>Add Rule &amp; Apply</Text>
          </TouchableOpacity>

          {Object.entries(rules).length > 0 && (
            <View style={styles.rulesList}>
              {Object.entries(rules).map(([keyword, rule]) => (
                <View key={keyword} style={styles.ruleRow}>
                  <View style={styles.ruleKeywordWrap}>
                    <Text style={styles.ruleKeyword}>{keyword}</Text>
                  </View>
                  <Text style={styles.ruleArrow}>→</Text>
                  <Text style={styles.ruleCat}>{rule.category}</Text>
                  <TouchableOpacity
                    style={styles.ruleDelete}
                    onPress={() => handleDeleteRule(keyword)}
                    accessibilityLabel={`Delete rule for ${keyword}`}
                  >
                    <Icon name="close" size={14} color={theme.colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </SectionCard>

        {/* ── SMS Simulator (collapsible) ── */}
        <TouchableOpacity
          style={[styles.devHeader, simulatorOpen && styles.devHeaderOpen]}
          onPress={() => setSimulatorOpen(o => !o)}
          accessibilityLabel="Toggle SMS simulator"
        >
          <View style={styles.devHeaderLeft}>
            <Icon name="code-braces" size={18} color={theme.colors.amber} />
            <Text style={styles.devHeaderTitle}>Developer · SMS Simulator</Text>
          </View>
          <Icon
            name={simulatorOpen ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={theme.colors.textMuted}
          />
        </TouchableOpacity>

        {simulatorOpen && (
          <View style={styles.devCard}>
            {/* Bank selector */}
            <Text style={styles.fieldLabel}>SENDER / BANK ID</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {banks.map(b => (
                <TouchableOpacity
                  key={b.value}
                  style={[
                    styles.bankChip,
                    sender === b.value && { backgroundColor: b.color + '20', borderColor: b.color },
                  ]}
                  onPress={() => { setSender(b.value); setParsedTx(null); setParseError(false); }}
                >
                  <Icon name={b.icon} size={14} color={sender === b.value ? b.color : theme.colors.textMuted} />
                  <Text style={[styles.bankChipText, sender === b.value && { color: b.color }]}>
                    {b.label}
                  </Text>
                </TouchableOpacity>
              ))}
              <TextInput
                style={styles.customSender}
                value={banks.some(b => b.value === sender) ? '' : sender}
                onChangeText={v => { setSender(v); setParsedTx(null); setParseError(false); }}
                placeholder="Other…"
                placeholderTextColor={theme.colors.textMuted}
              />
            </ScrollView>

            <Text style={styles.fieldLabel}>SMS BODY</Text>
            <TextInput
              style={styles.textArea}
              value={smsBody}
              onChangeText={v => { setSmsBody(v); setParsedTx(null); setParseError(false); }}
              multiline
              numberOfLines={6}
              placeholder={'Paste the full bank SMS here…\n\nExample:\nDear customer, ETB 500.00 has been debited on 02-08-2026.'}
              placeholderTextColor={theme.colors.textMuted}
              textAlignVertical="top"
            />

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => { setSmsBody(''); setParsedTx(null); setParseError(false); }}
              >
                <Text style={styles.clearBtnText}>✕ Clear</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.parseBtn} onPress={handleParse}>
                <Icon name="lightning-bolt" size={16} color="#fff" />
                <Text style={styles.parseBtnText}>Parse SMS</Text>
              </TouchableOpacity>
            </View>

            {parseError && (
              <View style={styles.errorCard}>
                <Icon name="alert-circle-outline" size={28} color={theme.colors.danger} style={{ marginBottom: 8 }} />
                <Text style={styles.errorTitle}>Parsing Failed</Text>
                <Text style={styles.errorBody}>
                  No transaction data could be extracted. Check sender ID and ensure message contains an ETB amount.
                </Text>
              </View>
            )}

            {parsedTx && !parseError && (
              <View style={styles.previewCard}>
                <View style={styles.previewTopRow}>
                  <View style={[
                    styles.typeBadge,
                    parsedTx.type === 'credit' ? styles.typeBadgeCredit : styles.typeBadgeDebit,
                  ]}>
                    <Text style={styles.typeBadgeText}>
                      {parsedTx.type === 'credit' ? '📈 INCOME' : '📉 EXPENSE'}
                    </Text>
                  </View>
                  <Text style={[
                    styles.previewAmt,
                    { color: parsedTx.type === 'credit' ? theme.colors.success : theme.colors.danger },
                  ]}>
                    {parsedTx.type === 'credit' ? '+' : '-'}Br {parsedTx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
                <View style={styles.divider} />
                {([
                  ['Description', parsedTx.description],
                  ['Category', parsedTx.category],
                  ['Sender', parsedTx.sender.toUpperCase()],
                  ['Ref', parsedTx.id],
                  parsedTx.balance > 0 ? ['Balance After', `Br ${parsedTx.balance.toFixed(2)}`] : null,
                ] as ([string, string] | null)[])
                  .filter((row): row is [string, string] => row !== null)
                  .map(([label, value]) => (
                    <View key={label} style={styles.previewRow}>
                      <Text style={styles.previewLabel}>{label}</Text>
                      <Text style={styles.previewValue} numberOfLines={2}>{value}</Text>
                    </View>
                  ))}
                <TouchableOpacity style={styles.importBtn} onPress={handleImport}>
                  <Icon name="database-import-outline" size={18} color="#fff" />
                  <Text style={styles.importBtnText}>Import to Ledger</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
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
  headerLabel: { color: theme.colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  headerTitle: { color: theme.colors.text, fontSize: 26, fontWeight: '800', marginTop: 2 },

  // Permission row
  permRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  permIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.successSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  permTitle: { color: theme.colors.text, fontSize: 14, fontWeight: '700', marginBottom: 4 },
  permDesc: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 },

  cardDesc: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 18, marginBottom: 14 },

  // Appearance
  fieldLabelSpaced: { marginTop: 16 },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  modeBtnActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
  modeBtnText: { ...theme.typography.label, fontSize: 12, color: theme.colors.textMuted },
  modeBtnTextActive: { color: theme.colors.primary },
  accentRow: { flexDirection: 'row', gap: 12, paddingVertical: 2 },
  accentSwatch: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accentSwatchActive: {
    borderWidth: 2,
    borderColor: theme.colors.text,
  },
  accentHint: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '600', marginTop: 8 },

  // Frequent accounts
  freqEmpty: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    padding: 16,
  },
  freqEmptyText: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 19 },
  freqCard: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    padding: 14,
    marginBottom: 10,
    gap: 10,
  },
  freqTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  freqNameWrap: { flex: 1 },
  freqName: { color: theme.colors.text, fontSize: 14, fontWeight: '700' },
  freqMeta: { color: theme.colors.textMuted, fontSize: 11, marginTop: 2 },
  freqApply: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  freqApplyText: { fontSize: 11, fontWeight: '700' },
  freqChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
  },
  freqChipEmoji: { fontSize: 12 },
  freqChipText: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '600' },

  // Rules
  ruleInput: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.text,
    fontSize: 14,
    marginBottom: 10,
  },
  ruleCatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
  },
  ruleCatText: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '600' },
  addRuleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: theme.colors.primaryDeep,
    borderRadius: theme.borderRadius.md,
    paddingVertical: 12,
  },
  addRuleBtnText: { color: theme.colors.onPrimary, fontWeight: '700', fontSize: 14 },
  rulesList: { borderTopWidth: 1, borderColor: theme.colors.border, paddingTop: 14, marginTop: 14, gap: 8 },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ruleKeywordWrap: { flex: 1 },
  ruleKeyword: { color: theme.colors.text, fontWeight: '600', fontSize: 13 },
  ruleArrow: { color: theme.colors.textMuted, fontSize: 14 },
  ruleCat: { color: theme.colors.primary, fontSize: 12, fontWeight: '700', flex: 1 },
  ruleDelete: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: theme.colors.dangerSubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Dev section
  devHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    marginBottom: 2,
    borderWidth: 1,
    borderColor: theme.colors.amberSubtle,
  },
  devHeaderOpen: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  devHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  devHeaderTitle: { color: theme.colors.amber, fontSize: 14, fontWeight: '700' },
  devCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    padding: 20,
    marginBottom: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },

  fieldLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  bankChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  bankChipText: { color: theme.colors.textMuted, fontSize: 13, fontWeight: '600' },
  customSender: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: theme.colors.text,
    fontSize: 13,
    minWidth: 80,
  },
  textArea: {
    backgroundColor: theme.colors.background,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.text,
    padding: 14,
    fontSize: 13,
    minHeight: 120,
    textAlignVertical: 'top',
    lineHeight: 20,
  },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  clearBtn: {
    flex: 1,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: 14,
    alignItems: 'center',
  },
  clearBtnText: { color: theme.colors.textMuted, fontWeight: '700', fontSize: 14 },
  parseBtn: {
    flex: 2,
    flexDirection: 'row',
    gap: 6,
    backgroundColor: theme.colors.primaryDeep,
    borderRadius: theme.borderRadius.md,
    padding: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadow.accent,
  },
  parseBtnText: { color: theme.colors.onPrimary, fontWeight: '800', fontSize: 15 },

  // Error
  errorCard: {
    backgroundColor: theme.colors.dangerSubtle,
    borderWidth: 1,
    borderColor: theme.colors.danger + '40',
    borderRadius: theme.borderRadius.md,
    padding: 20,
    marginTop: 14,
    alignItems: 'center',
  },
  errorTitle: { color: theme.colors.danger, fontSize: 16, fontWeight: '800', marginBottom: 6 },
  errorBody: { color: theme.colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 18 },

  // Preview
  previewCard: {
    backgroundColor: theme.colors.background,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    marginTop: 14,
  },
  previewTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  typeBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  typeBadgeDebit: { backgroundColor: theme.colors.dangerSubtle },
  typeBadgeCredit: { backgroundColor: theme.colors.successSubtle },
  typeBadgeText: { fontSize: 11, fontWeight: '800', color: theme.colors.text },
  previewAmt: { fontSize: 22, fontWeight: '800' },
  divider: { height: 1, backgroundColor: theme.colors.border, marginBottom: 12 },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  previewLabel: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '600', flex: 1 },
  previewValue: { color: theme.colors.text, fontSize: 12, fontWeight: '700', flex: 2, textAlign: 'right' },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.successDeep,
    borderRadius: theme.borderRadius.md,
    padding: 14,
    marginTop: 14,
  },
  importBtnText: { color: theme.colors.onPrimary, fontWeight: '800', fontSize: 14 },
});
