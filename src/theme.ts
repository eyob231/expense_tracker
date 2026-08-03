import { StatusBar, Platform } from 'react-native';

export const theme = {
  colors: {
    background: '#0B0F19',
    surface: '#151E33',
    surfaceSecondary: '#1E294A',
    primary: '#6366F1',
    primaryDark: '#4F46E5',
    accent: '#D946EF',
    success: '#10B981',
    danger: '#EF4444',
    text: '#FFFFFF',
    textMuted: '#94A3B8',
    textDark: '#475569',
    border: '#1E293B',
    borderLight: '#334155',
    cardGlow: 'rgba(99, 102, 241, 0.15)',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 20,
    xl: 28,
  },
  // Safe top offset: ensures content never overlaps the phone's status bar
  statusBarHeight: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 24) : 0,
};
