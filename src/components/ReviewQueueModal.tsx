import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Transaction, Category, extractCounterparty } from '../parser';
import { updateTransaction, saveCategoryMapping, applyRuleToExisting } from '../storage';
import { Theme, CATEGORY_META } from '../theme';
import { useTheme, useThemedStyles } from '../themeContext';

interface ReviewQueueModalProps {
  visible: boolean;
  queue: Transaction[];
  /** How many more unreviewed transactions are waiting outside this batch. */
  remaining?: number;
  onClose: () => void;
  onDone: () => void;
}

const CATEGORIES: Category[] = [
  'Food & Dining',
  'Shopping',
  'Transportation',
  'Salary',
  'UPI Transfers',
  'Other',
];

export default function ReviewQueueModal({
  visible,
  queue,
  remaining = 0,
  onClose,
  onDone,
}: ReviewQueueModalProps) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);

  const [idx, setIdx] = useState(0);
  const [editCategory, setEditCategory] = useState<Category>('Other');
  const [editDesc, setEditDesc] = useState('');
  const [editType, setEditType] = useState<'credit' | 'debit'>('debit');
  const [confirmed, setConfirmed] = useState(0);

  const sparkleScale = useRef(new Animated.Value(0)).current;
  const sparkleOpacity = useRef(new Animated.Value(0)).current;

  const current = queue[idx];

  useEffect(() => {
    if (visible) {
      setIdx(0);
      setConfirmed(0);
    }
  }, [visible]);

  useEffect(() => {
    if (current) {
      setEditCategory(current.category as Category);
      setEditDesc(current.description);
      setEditType(current.type);
    }
  }, [current]);

  const showSparkle = () => {
    sparkleScale.setValue(0);
    sparkleOpacity.setValue(1);
    Animated.parallel([
      Animated.spring(sparkleScale, { toValue: 1.4, useNativeDriver: true }),
      Animated.timing(sparkleOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  };

  const advance = () => {
    if (idx < queue.length - 1) setIdx(i => i + 1);
    else onDone();
  };

  const handleConfirm = async () => {
    if (!current) return;
    await updateTransaction({
      ...current,
      category: editCategory,
      description: editDesc.trim() || current.description,
      type: editType,
      isReviewed: true,
    });
    if (editCategory !== current.category) {
      // Key the rule on the counterparty (phone / account / payee) when we can,
      // so future messages for the same account are categorized automatically.
      const keyword = extractCounterparty(current.rawMessage, current.description) || current.description;
      await saveCategoryMapping(keyword, editCategory);
      await applyRuleToExisting(keyword, editCategory);
    }
    showSparkle();
    setConfirmed(c => c + 1);
    advance();
  };

  if (!current) return null;

  const isDebit = editType === 'debit';
  const progress = queue.length > 0 ? (idx / queue.length) * 100 : 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdropWrap}>
        {/* Tapping outside the sheet dismisses it and reveals the screen behind */}
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Dismiss" />

        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.title}>Label transaction</Text>
              <Text style={styles.subtitle}>
                {idx + 1} of {queue.length}
                {confirmed > 0 ? ` · ${confirmed} labeled` : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="close" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Source */}
            <View style={styles.sourceRow}>
              <View style={styles.sourceIcon}>
                <Text style={styles.sourceEmoji}>📱</Text>
              </View>
              <View style={styles.sourceText}>
                <Text style={styles.sourceLabel} numberOfLines={1}>
                  SMS from {current.sender.toUpperCase()}
                </Text>
                <Text style={styles.sourceDate}>
                  {new Date(current.date).toLocaleString(undefined, {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </Text>
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.amount,
                  { color: isDebit ? theme.colors.danger : theme.colors.success },
                ]}
              >
                {isDebit ? '−' : '+'}Br {current.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </Text>

              {/* Sparkle overlay */}
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.sparkle,
                  { transform: [{ scale: sparkleScale }], opacity: sparkleOpacity },
                ]}
              >
                <Text style={styles.sparkleText}>✨</Text>
              </Animated.View>
            </View>

            {current.rawMessage ? (
              <View style={styles.rawBox}>
                <Text style={styles.rawText} numberOfLines={3}>{current.rawMessage}</Text>
              </View>
            ) : null}

            {/* Type */}
            <View style={styles.typeRow}>
              {(['debit', 'credit'] as const).map(t => {
                const active = editType === t;
                const col = t === 'credit' ? theme.colors.success : theme.colors.danger;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeBtn, active && { borderColor: col, backgroundColor: col + '22' }]}
                    onPress={() => setEditType(t)}
                    accessibilityRole="button"
                    accessibilityLabel={t === 'credit' ? 'Mark as income' : 'Mark as expense'}
                  >
                    <Text style={styles.typeEmoji}>{t === 'credit' ? '📈' : '📉'}</Text>
                    <Text style={[styles.typeText, active && { color: col }]}>
                      {t === 'credit' ? 'Income' : 'Expense'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Description */}
            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={styles.descInput}
              value={editDesc}
              onChangeText={setEditDesc}
              placeholder="e.g. Salary, Transfer to Eyob"
              placeholderTextColor={theme.colors.textMuted}
            />

            {/* Category */}
            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.catGrid}>
              {CATEGORIES.map(cat => {
                const meta = CATEGORY_META[cat] ?? { emoji: '🏷️', color: theme.colors.textMuted };
                const active = editCategory === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.catItem,
                      active && { borderColor: meta.color, backgroundColor: meta.color + '18' },
                    ]}
                    onPress={() => setEditCategory(cat)}
                    accessibilityRole="button"
                    accessibilityLabel={`Category ${cat}`}
                  >
                    <Text style={styles.catEmoji}>{meta.emoji}</Text>
                    <Text
                      style={[styles.catLabel, active && { color: meta.color }]}
                      numberOfLines={1}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.skipBtn}
              onPress={advance}
              accessibilityLabel="Skip this transaction"
            >
              <Text style={styles.skipBtnText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={handleConfirm}
              accessibilityLabel="Confirm transaction"
            >
              <Icon name="check" size={18} color={theme.colors.onPrimary} />
              <Text style={styles.confirmBtnText}>Confirm</Text>
            </TouchableOpacity>
          </View>

          {remaining > 0 && (
            <Text style={styles.remainingNote}>
              {remaining} more waiting in the Ledger
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (theme: Theme) => StyleSheet.create({
  // Sheet occupies the lower 50–75% of the screen, so the list stays visible behind it.
  backdropWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },

  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingTop: 10,
    maxHeight: '75%',
    minHeight: '55%',
    ...theme.shadow.lg,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderStrong,
    alignSelf: 'center',
    marginBottom: 12,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  headerText: { flex: 1 },
  title: { ...theme.typography.h2, fontSize: 18, color: theme.colors.text },
  subtitle: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 2 },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },

  progressBg: {
    height: 3,
    backgroundColor: theme.colors.surfaceElevated,
    marginHorizontal: 20,
    borderRadius: 2,
    marginBottom: 4,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: theme.colors.primary, borderRadius: 2 },

  scroll: { flexShrink: 1 },
  body: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },

  sourceRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  sourceIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.colors.primarySubtle,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sourceEmoji: { fontSize: 17 },
  sourceText: { flex: 1, minWidth: 0 },
  sourceLabel: { ...theme.typography.label, fontSize: 12.5, color: theme.colors.textSecondary },
  sourceDate: { ...theme.typography.caption, color: theme.colors.textMuted, marginTop: 2 },
  amount: { fontSize: 20, fontWeight: '900', letterSpacing: -0.6, flexShrink: 0 },

  sparkle: { position: 'absolute', alignSelf: 'center', left: '45%', zIndex: 10 },
  sparkleText: { fontSize: 44 },

  rawBox: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.sm,
    padding: 10,
    marginBottom: 14,
  },
  rawText: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    lineHeight: 17,
    fontStyle: 'italic',
  },

  typeRow: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  typeEmoji: { fontSize: 15 },
  typeText: { ...theme.typography.label, color: theme.colors.textMuted },

  fieldLabel: {
    ...theme.typography.overline,
    color: theme.colors.textMuted,
    marginTop: 12,
    marginBottom: 8,
  },
  descInput: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 11,
    ...theme.typography.body,
    color: theme.colors.text,
  },

  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catItem: {
    width: '31.5%',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.background,
  },
  catEmoji: { fontSize: 17 },
  catLabel: {
    ...theme.typography.caption,
    fontSize: 10,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },

  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  skipBtn: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceElevated,
    alignItems: 'center',
  },
  skipBtnText: { ...theme.typography.title, color: theme.colors.textSecondary },
  confirmBtn: {
    flex: 2,
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 15,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primaryDeep,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.shadow.accent,
  },
  confirmBtnText: { ...theme.typography.title, color: theme.colors.onPrimary },

  remainingNote: {
    ...theme.typography.caption,
    color: theme.colors.textMuted,
    textAlign: 'center',
    paddingTop: 10,
    paddingBottom: 20,
  },
});
