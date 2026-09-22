import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Category, Transaction } from '../parser';
import { Theme, CATEGORY_META } from '../theme';
import { useTheme, useThemedStyles } from '../themeContext';
import AmountKeypad from './AmountKeypad';

interface AddTransactionModalProps {
  visible: boolean;
  onClose: () => void;
  onAdd: (transaction: Transaction) => void;
}

const CATEGORIES: Category[] = [
  'Food & Dining', 'Shopping', 'Transportation', 'Salary', 'UPI Transfers', 'Other',
];

export default function AddTransactionModal({
  visible,
  onClose,
  onAdd,
}: AddTransactionModalProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'debit' | 'credit'>('debit');
  const [category, setCategory] = useState<Category>('Other');
  const [step, setStep] = useState<'amount' | 'details'>('amount');

  const reset = () => {
    setAmount('');
    setDescription('');
    setType('debit');
    setCategory('Other');
    setStep('amount');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleNext = () => {
    const n = parseFloat(amount);
    if (isNaN(n) || n <= 0) return;
    setStep('details');
  };

  const handleSubmit = () => {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0 || !description.trim()) return;

    const newTx: Transaction = {
      id: `MAN_${Date.now()}`,
      amount: parsedAmount,
      type,
      date: new Date().toISOString(),
      balance: 0,
      description: description.trim(),
      sender: 'manual',
      category,
      isReviewed: true,
      isManual: true,
    };

    onAdd(newTx);
    reset();
    onClose();
  };

  const isDebit = type === 'debit';
  const accentColor = isDebit ? theme.colors.danger : theme.colors.success;
  const amtDisplay = amount ? `Br ${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: amount.includes('.') ? (amount.split('.')[1]?.length ?? 0) : 0 })}` : 'Br 0';

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <TouchableOpacity style={styles.dismiss} onPress={handleClose} activeOpacity={1} />
        <View style={styles.sheet}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Type toggle */}
          <View style={styles.typeWrap}>
            {(['debit', 'credit'] as const).map(t => {
              const active = type === t;
              const col = t === 'debit' ? theme.colors.danger : theme.colors.success;
              return (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.typeBtn,
                    active && { backgroundColor: col + '20', borderColor: col },
                  ]}
                  onPress={() => setType(t)}
                  accessibilityRole="button"
                  accessibilityLabel={t === 'debit' ? 'Expense' : 'Income'}
                >
                  <Text style={styles.typeEmoji}>{t === 'debit' ? '📉' : '📈'}</Text>
                  <Text style={[styles.typeText, active && { color: col, fontWeight: '800' }]}>
                    {t === 'debit' ? 'Expense' : 'Income'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {step === 'amount' ? (
            <>
              {/* Big amount display */}
              <View style={styles.amtDisplay}>
                <Text style={[styles.amtText, { color: accentColor }]} numberOfLines={1} adjustsFontSizeToFit>
                  {amount || '0'}
                </Text>
                <Text style={styles.amtCurrency}>ETB</Text>
              </View>

              {/* Keypad */}
              <AmountKeypad value={amount} onChange={setAmount} />

              {/* Next */}
              <TouchableOpacity
                style={[
                  styles.nextBtn,
                  { backgroundColor: parseFloat(amount) > 0 ? theme.colors.primaryDeep : theme.colors.surfaceElevated },
                ]}
                onPress={handleNext}
                disabled={!amount || parseFloat(amount) <= 0}
                accessibilityLabel="Continue to details"
              >
                <Text style={[
                  styles.nextBtnText,
                  { color: parseFloat(amount) > 0 ? theme.colors.onPrimary : theme.colors.textMuted },
                ]}>
                  Continue →
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <ScrollView
              contentContainerStyle={styles.detailsBody}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Amount recap pill */}
              <TouchableOpacity
                style={[styles.amtPill, { backgroundColor: accentColor + '18', borderColor: accentColor }]}
                onPress={() => setStep('amount')}
                accessibilityLabel="Edit amount"
              >
                <Text style={[styles.amtPillText, { color: accentColor }]}>
                  {isDebit ? '-' : '+'}{amtDisplay}
                </Text>
                <Text style={[styles.amtPillEdit, { color: accentColor }]}>✏️</Text>
              </TouchableOpacity>

              {/* Description — one input, with quick-pick chips below */}
              <Text style={styles.fieldLabel}>Description</Text>
              <TextInputInline value={description} onChange={setDescription} />
              <View style={styles.descRow}>
                {['Salary', 'Transfer', 'Shop', 'Food', 'Taxi', 'Fuel'].map(s => {
                  const active = description === s;
                  return (
                    <TouchableOpacity
                      key={s}
                      style={[styles.descChip, active && styles.descChipActive]}
                      onPress={() => setDescription(active ? '' : s)}
                      accessibilityLabel={`Set description to ${s}`}
                    >
                      <Text style={[styles.descChipText, active && styles.descChipTextActive]}>{s}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Category grid */}
              <Text style={styles.fieldLabel}>Category</Text>
              <View style={styles.catGrid}>
                {CATEGORIES.map(cat => {
                  const meta = CATEGORY_META[cat] ?? { emoji: '🏷️', color: theme.colors.primary };
                  const active = category === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[
                        styles.catItem,
                        active && { borderColor: meta.color, backgroundColor: meta.color + '18' },
                      ]}
                      onPress={() => setCategory(cat)}
                      accessibilityLabel={`Category ${cat}`}
                      accessibilityRole="button"
                    >
                      <View style={[styles.catIconCircle, { backgroundColor: meta.color + '20' }]}>
                        <Text style={{ fontSize: 22 }}>{meta.emoji}</Text>
                      </View>
                      <Text
                        style={[styles.catLabel, active && { color: meta.color, fontWeight: '700' }]}
                        numberOfLines={1}
                      >
                        {cat}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Save */}
              <TouchableOpacity
                style={[
                  styles.saveBtn,
                  { backgroundColor: description.trim() ? theme.colors.primaryDeep : theme.colors.surfaceElevated },
                ]}
                onPress={handleSubmit}
                disabled={!description.trim()}
                accessibilityLabel="Save transaction"
              >
                <Text style={[
                  styles.saveBtnText,
                  { color: description.trim() ? theme.colors.onPrimary : theme.colors.textMuted },
                ]}>
                  Save Transaction
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Inline real TextInput component
function TextInputInline({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <TextInput
      style={styles.realInput}
      value={value}
      onChangeText={onChange}
      placeholder="e.g. Grocery, Salary deposit…"
      placeholderTextColor={theme.colors.textMuted}
    />
  );
}

const createStyles = (theme: Theme) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  dismiss: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    backgroundColor: theme.colors.surfaceSecondary,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingTop: 12,
    paddingBottom: 36,
    maxHeight: '92%',
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: theme.colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },

  // Type toggle
  typeWrap: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  typeEmoji: { fontSize: 16 },
  typeText: { color: theme.colors.textMuted, fontSize: 14, fontWeight: '600' },

  // Amount display (step 1)
  amtDisplay: {
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  amtText: {
    fontSize: 54,
    fontWeight: '900',
    letterSpacing: -2,
  },
  amtCurrency: {
    color: theme.colors.textMuted,
    fontSize: 20,
    fontWeight: '700',
    alignSelf: 'flex-end',
    marginBottom: 8,
  },
  nextBtn: {
    marginHorizontal: 20,
    marginTop: 12,
    height: 52,
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadow.accent,
  },
  nextBtnText: { fontSize: 17, fontWeight: '800' },

  // Details step
  detailsBody: { paddingHorizontal: 20, paddingBottom: 16 },
  amtPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    borderWidth: 1.5,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginBottom: 20,
    gap: 8,
  },
  amtPillText: { fontSize: 22, fontWeight: '800' },
  amtPillEdit: { fontSize: 16 },
  fieldLabel: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 4,
  },
  descRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
    marginBottom: 6,
  },
  descChip: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  descChipActive: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primary,
  },
  descChipText: { color: theme.colors.textSecondary, fontSize: 13, fontWeight: '600' },
  descChipTextActive: { color: theme.colors.primary, fontWeight: '700' },
  realInput: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.text,
    fontSize: 15,
  },

  // Category grid
  catGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  catItem: {
    flexBasis: '30%',
    flexGrow: 1,
    maxWidth: '33%',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    padding: 12,
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.surface,
  },
  catIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  catLabel: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },

  // Save
  saveBtn: {
    height: 54,
    borderRadius: theme.borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadow.accent,
  },
  saveBtnText: { fontSize: 16, fontWeight: '800' },
});
