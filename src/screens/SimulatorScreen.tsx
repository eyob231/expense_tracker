import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Alert,
} from 'react-native';
import { parseSMS, Transaction, Category } from '../parser';
import { addTransaction, getCategoryMappings, saveCategoryMapping, deleteCategoryMapping, CategoryRule } from '../storage';
import { theme } from '../theme';

const BANKS = [
  { label: 'CBE', value: 'CBE' },
  { label: '127', value: '127' },
  { label: 'CBE Birr', value: 'CBEBirr' },
  { label: 'Telebirr', value: 'telebirr' },
  { label: '8036', value: '8036' },
];

const CATEGORIES: Category[] = [
  'Food & Dining',
  'Shopping',
  'Transportation',
  'Salary',
  'UPI Transfers',
  'Other',
];

export default function SimulatorScreen() {
  const [sender, setSender] = useState('CBE');
  const [smsBody, setSmsBody] = useState('');
  const [parsedTx, setParsedTx] = useState<Transaction | null>(null);
  const [parseError, setParseError] = useState(false);

  // Category Rules State
  const [rules, setRules] = useState<Record<string, CategoryRule>>({});
  const [newRuleKeyword, setNewRuleKeyword] = useState('');
  const [newRuleCategory, setNewRuleCategory] = useState<Category>('Salary');

  React.useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    const mappings = await getCategoryMappings();
    setRules(mappings);
  };

  const handleAddRule = async () => {
    if (!newRuleKeyword.trim()) return;
    await saveCategoryMapping(newRuleKeyword, newRuleCategory);
    setNewRuleKeyword('');
    loadRules();
  };

  const handleDeleteRule = async (keyword: string) => {
    await deleteCategoryMapping(keyword);
    loadRules();
  };

  const handleParse = () => {
    if (!smsBody.trim()) {
      Alert.alert('Empty Message', 'Please paste an SMS message body first.');
      return;
    }
    const parsed = parseSMS(smsBody, sender);
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

  const handleClear = () => {
    setSmsBody('');
    setParsedTx(null);
    setParseError(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Settings & Tools</Text>
          <Text style={styles.subtitle}>
            Manage smart category rules and test SMS parsing.
          </Text>
        </View>

        {/* ── SMART CATEGORY RULES ── */}
        <Text style={styles.sectionTitle}>Smart Category Rules</Text>
        <View style={styles.card}>
          <Text style={styles.cardDesc}>
            Automatically categorize transactions when the sender or description contains specific keywords (e.g. phone numbers, names).
          </Text>
          
          <View style={styles.ruleInputRow}>
            <TextInput
              style={styles.ruleInput}
              placeholder="e.g. 0911000000 or Uber"
              placeholderTextColor={theme.colors.textMuted}
              value={newRuleKeyword}
              onChangeText={setNewRuleKeyword}
            />
            <View style={styles.ruleCatPickerWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {CATEGORIES.map(cat => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.ruleCatPill, newRuleCategory === cat && styles.ruleCatPillActive]}
                    onPress={() => setNewRuleCategory(cat)}
                  >
                    <Text style={[styles.ruleCatText, newRuleCategory === cat && styles.ruleCatTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
            <TouchableOpacity style={styles.addRuleBtn} onPress={handleAddRule}>
              <Text style={styles.addRuleBtnText}>Add</Text>
            </TouchableOpacity>
          </View>

          {Object.entries(rules).length > 0 && (
            <View style={styles.rulesList}>
              {Object.entries(rules).map(([keyword, rule]) => (
                <View key={keyword} style={styles.ruleItem}>
                  <Text style={styles.ruleKeyword}>{keyword}</Text>
                  <View style={styles.ruleRight}>
                    <Text style={styles.ruleCategory}>{rule.category} {rule.name ? `(${rule.name})` : ''}</Text>
                    <TouchableOpacity onPress={() => handleDeleteRule(keyword)} style={styles.deleteRuleBtn}>
                      <Text style={styles.deleteRuleText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── SMS SIMULATOR ── */}
        <Text style={styles.sectionTitle}>SMS Simulator</Text>
        <View style={styles.card}>
          {/* Bank selector */}
          <Text style={styles.label}>SENDER / BANK ID</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bankRow}>
          {BANKS.map(b => (
            <TouchableOpacity
              key={b.value}
              style={[styles.bankChip, sender === b.value && styles.bankChipActive]}
              onPress={() => { setSender(b.value); setParsedTx(null); setParseError(false); }}
            >
              <Text style={[styles.bankChipText, sender === b.value && styles.bankChipTextActive]}>
                {b.label}
              </Text>
            </TouchableOpacity>
          ))}
          {/* Custom sender */}
          <TextInput
            style={styles.customSenderInput}
            value={BANKS.some(b => b.value === sender) ? '' : sender}
            onChangeText={val => { setSender(val); setParsedTx(null); setParseError(false); }}
            placeholder="Other..."
            placeholderTextColor={theme.colors.textMuted}
          />
        </ScrollView>

        {/* SMS Body input */}
        <Text style={styles.label}>SMS BODY</Text>
        <TextInput
          style={styles.textArea}
          value={smsBody}
          onChangeText={val => { setSmsBody(val); setParsedTx(null); setParseError(false); }}
          multiline
          numberOfLines={6}
          placeholder={'Paste the full bank SMS here...\n\nExample:\nDear customer, ETB 500.00 has been\ndebited on 02-08-2026. Ref: FT123456.'}
          placeholderTextColor={theme.colors.textMuted}
          textAlignVertical="top"
        />

        {/* Action row */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
            <Text style={styles.clearBtnText}>✕ Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.parseBtn} onPress={handleParse}>
            <Text style={styles.parseBtnText}>⚡ Parse SMS</Text>
          </TouchableOpacity>
        </View>

        {/* Error state */}
        {parseError && (
          <View style={styles.errorCard}>
            <Text style={styles.errorEmoji}>❌</Text>
            <Text style={styles.errorTitle}>Parsing Failed</Text>
            <Text style={styles.errorBody}>
              No transaction data could be extracted. Check that the sender ID matches and the message contains an ETB amount.
            </Text>
          </View>
        )}

        {/* Parsed Preview */}
        {parsedTx && !parseError && (
          <View style={styles.previewCard}>
            {/* Type badge */}
            <View style={styles.previewTopRow}>
              <View style={[styles.typeBadge, parsedTx.type === 'credit' ? styles.typeBadgeCredit : styles.typeBadgeDebit]}>
                <Text style={styles.typeBadgeText}>
                  {parsedTx.type === 'credit' ? '📈 INCOME' : '📉 EXPENSE'}
                </Text>
              </View>
              <Text style={[styles.previewAmount, parsedTx.type === 'credit' ? styles.creditText : styles.debitText]}>
                {parsedTx.type === 'credit' ? '+' : '-'}{parsedTx.amount.toFixed(2)} ETB
              </Text>
            </View>

            <View style={styles.divider} />

            {/* Fields */}
            <PreviewRow label="Description" value={parsedTx.description} />
            <PreviewRow label="Category" value={parsedTx.category} />
            <PreviewRow label="Sender" value={parsedTx.sender.toUpperCase()} />
            <PreviewRow label="Ref / TX ID" value={parsedTx.id} />
            {parsedTx.balance > 0 && (
              <PreviewRow label="Balance After" value={`${parsedTx.balance.toFixed(2)} ETB`} />
            )}

            {/* Raw message */}
            <Text style={styles.rawLabel}>ORIGINAL SMS</Text>
            <View style={styles.rawBox}>
              <Text style={styles.rawText}>{parsedTx.rawMessage || smsBody}</Text>
            </View>

            <TouchableOpacity style={styles.importBtn} onPress={handleImport}>
              <Text style={styles.importBtnText}>Import to Ledger →</Text>
            </TouchableOpacity>
          </View>
        )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.previewRow}>
      <Text style={styles.previewLabel}>{label}</Text>
      <Text style={styles.previewValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    padding: theme.spacing.md,
    paddingBottom: 60,
  },
  header: {
    paddingTop: theme.statusBarHeight + theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  title: {
    color: theme.colors.text,
    fontSize: 26,
    fontWeight: '800',
  },
  subtitle: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 19,
  },
  label: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: theme.spacing.md,
    textTransform: 'uppercase',
  },
  bankRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.sm,
  },
  bankChip: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginRight: 8,
  },
  bankChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  bankChipText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  bankChipTextActive: {
    color: '#fff',
  },
  customSenderInput: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    color: theme.colors.text,
    fontSize: 13,
    minWidth: 80,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.sm,
  },
  card: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderRadius: 16,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardDesc: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginBottom: theme.spacing.md,
    lineHeight: 18,
  },
  ruleInputRow: {
    marginBottom: theme.spacing.md,
  },
  ruleInput: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: theme.colors.text,
    fontSize: 14,
    marginBottom: 8,
  },
  ruleCatPickerWrap: {
    marginBottom: 12,
  },
  ruleCatPill: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  ruleCatPillActive: {
    backgroundColor: theme.colors.primary + '20',
    borderColor: theme.colors.primary,
  },
  ruleCatText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  ruleCatTextActive: {
    color: theme.colors.primary,
  },
  addRuleBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addRuleBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  rulesList: {
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    paddingTop: theme.spacing.md,
    gap: 8,
  },
  ruleItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  ruleKeyword: {
    color: theme.colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
  ruleRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ruleCategory: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  deleteRuleBtn: {
    backgroundColor: theme.colors.danger + '20',
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteRuleText: {
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: '800',
  },
  textArea: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.text,
    padding: theme.spacing.md,
    fontSize: 14,
    minHeight: 130,
    textAlignVertical: 'top',
    lineHeight: 22,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: theme.spacing.md,
  },
  clearBtn: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  clearBtnText: {
    color: theme.colors.textMuted,
    fontWeight: '700',
    fontSize: 14,
  },
  parseBtn: {
    flex: 2,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  parseBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  // Error
  errorCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.lg,
    marginTop: theme.spacing.lg,
    alignItems: 'center',
  },
  errorEmoji: {
    fontSize: 30,
    marginBottom: 8,
  },
  errorTitle: {
    color: theme.colors.danger,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  errorBody: {
    color: theme.colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  // Preview card
  previewCard: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  previewTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  typeBadge: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  typeBadgeDebit: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  typeBadgeCredit: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  typeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: 0.5,
  },
  previewAmount: {
    fontSize: 22,
    fontWeight: '800',
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  previewLabel: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  previewValue: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    flex: 2,
    textAlign: 'right',
  },
  rawLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: theme.spacing.md,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  rawBox: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  rawText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  importBtn: {
    backgroundColor: theme.colors.success,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    alignItems: 'center',
  },
  importBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 15,
  },
  debitText: { color: theme.colors.danger },
  creditText: { color: theme.colors.success },
});
