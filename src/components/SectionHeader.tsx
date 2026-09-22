import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Theme } from '../theme';
import { useThemedStyles } from '../themeContext';

interface SectionHeaderProps {
  label: string;
  sub?: string;
  /** Use the larger heading style for primary sections. */
  large?: boolean;
}

export default function SectionHeader({ label, sub, large }: SectionHeaderProps) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.wrap}>
      <View style={[styles.dot, large && styles.dotLarge]} />
      <Text style={[styles.label, large && styles.labelLarge]}>{label}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  );
}

const createStyles = (theme: Theme) => StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 2,
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.primary,
  },
  dotLarge: { width: 8, height: 8, borderRadius: 4 },
  label: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    flex: 1,
  },
  labelLarge: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0,
  },
  sub: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
});
