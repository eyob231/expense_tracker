import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import { Theme } from '../theme';
import { useTheme, useThemedStyles } from '../themeContext';

interface SkeletonCardProps {
  height?: number;
  width?: number | string;
  borderRadius?: number;
  style?: ViewStyle;
}

export function SkeletonLine({ height = 14, width = '100%', borderRadius = 7, style }: SkeletonCardProps) {
  const { theme } = useTheme();
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(shimmer, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
    ).start();
  }, [shimmer]);

  const opacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });

  return (
    <Animated.View
      style={[
        {
          height,
          width: width as any,
          borderRadius,
          backgroundColor: theme.colors.surfaceElevated,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function SkeletonTxCard() {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.txCard}>
      <SkeletonLine height={44} width={44} borderRadius={14} style={{ marginRight: 12 }} />
      <View style={{ flex: 1, gap: 8 }}>
        <SkeletonLine height={14} width="65%" />
        <SkeletonLine height={11} width="40%" />
      </View>
      <View style={{ alignItems: 'flex-end', gap: 8 }}>
        <SkeletonLine height={16} width={64} />
        <SkeletonLine height={10} width={28} />
      </View>
    </View>
  );
}

export function SkeletonBalanceCard() {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.balanceCard}>
      <SkeletonLine height={10} width="40%" style={{ marginBottom: 12 }} />
      <SkeletonLine height={44} width="70%" style={{ marginBottom: 24 }} />
      <View style={styles.row}>
        <SkeletonLine height={14} width="40%" />
        <SkeletonLine height={14} width="40%" />
      </View>
    </View>
  );
}

const createStyles = (theme: Theme) => StyleSheet.create({
  txCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: 16,
    marginBottom: 8,
  },
  balanceCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: 24,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
