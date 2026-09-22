import React, { useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Theme } from '../theme';
import { useTheme, useThemedStyles } from '../themeContext';

interface AmountKeypadProps {
  value: string;
  onChange: (val: string) => void;
}

const KEYS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['.', '0', '⌫'],
];

const GAP = 10;
const SIDE_PADDING = 16;
const MAX_CONTENT_WIDTH = 420;

export default function AmountKeypad({ value, onChange }: AmountKeypadProps) {
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, MAX_CONTENT_WIDTH) - SIDE_PADDING * 2;
  const keyWidth = Math.floor((contentWidth - GAP * 2) / 3);

  const handleKey = (key: string) => {
    if (key === '⌫') {
      onChange(value.slice(0, -1));
      return;
    }
    // Only one decimal point allowed
    if (key === '.' && value.includes('.')) return;
    // Max 2 decimal places
    const dotIdx = value.indexOf('.');
    if (dotIdx !== -1 && value.length - dotIdx > 2) return;
    // Don't allow leading zeros
    if (value === '0' && key !== '.') {
      onChange(key);
      return;
    }
    onChange(value + key);
  };

  return (
    <View style={styles.wrap}>
      {KEYS.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map(key => (
            <KeyButton
              key={key}
              label={key}
              width={keyWidth}
              onPress={() => handleKey(key)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function KeyButton({
  label,
  width,
  onPress,
}: {
  label: string;
  width: number;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const scale = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.92, duration: 60, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 90, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  const isBackspace = label === '⌫';

  return (
    <Animated.View style={{ width, transform: [{ scale }] }}>
      <TouchableOpacity
        style={[styles.key, isBackspace && styles.keyBackspace]}
        onPress={handlePress}
        activeOpacity={0.7}
        accessibilityLabel={isBackspace ? 'Backspace' : `Key ${label}`}
        accessibilityRole="button"
      >
        {isBackspace ? (
          <Icon name="backspace-outline" size={24} color={theme.colors.danger} />
        ) : (
          <Text style={styles.keyText}>{label}</Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const createStyles = (theme: Theme) => StyleSheet.create({
  wrap: {
    gap: GAP,
    paddingHorizontal: SIDE_PADDING,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    gap: GAP,
  },
  key: {
    height: 58,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyBackspace: {
    backgroundColor: theme.colors.dangerSubtle,
  },
  keyText: {
    ...theme.typography.h2,
    color: theme.colors.text,
    fontWeight: '600',
  },
});
