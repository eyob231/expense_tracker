import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  AppStateStatus,
  Platform,
  PermissionsAndroid,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Theme } from './src/theme';
import { ThemeProvider, useTheme, useThemedStyles } from './src/themeContext';
import DashboardScreen from './src/screens/DashboardScreen';
import TransactionsScreen from './src/screens/TransactionsScreen';
import InsightsScreen from './src/screens/InsightsScreen';
import SimulatorScreen from './src/screens/SimulatorScreen';
import {
  checkAndRequestPermissions,
  syncDeviceSms,
  subscribeToIncomingSms,
  drainPendingSms,
} from './src/deviceSms';
import {
  hasAskedForSmsPermission,
  markSmsPermissionAsked,
  hasCompletedInitialSync,
  markInitialSyncDone,
} from './src/storage';

const Tab = createBottomTabNavigator();

// ── Tab configuration ─────────────────────────────────────────────
const TABS = [
  { name: 'Home',         icon: 'home-variant',    label: 'Home' },
  { name: 'Transactions', icon: 'swap-vertical',   label: 'Ledger' },
  { name: 'Insights',    icon: 'chart-donut',      label: 'Insights' },
  { name: 'Settings',    icon: 'cog-outline',      label: 'Settings' },
];

// ── Custom Tab Bar ────────────────────────────────────────────────
function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const onFabPress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();
    navigation.navigate('Home', { openAdd: true } as never);
  };

  return (
    <View style={[styles.tabBarWrapper, { paddingBottom: insets.bottom }]}>
      {/* FAB */}
      <View style={styles.fabContainer}>
        <Animated.View style={[styles.fabWrap, { transform: [{ scale: scaleAnim }] }]}>
          <TouchableOpacity
            style={styles.fab}
            onPress={onFabPress}
            activeOpacity={0.85}
            accessibilityLabel="Add transaction"
            accessibilityRole="button"
          >
            <Icon name="plus" size={28} color={theme.colors.onPrimary} />
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* Tab buttons */}
      <View style={styles.tabBar}>
        {TABS.map((tab, index) => {
          const focused = state.index === index;
          return (
            <TouchableOpacity
              key={tab.name}
              style={styles.tabItem}
              onPress={() => navigation.navigate(tab.name as never)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
            >
              <View style={[styles.tabIconWrap, focused && styles.tabIconWrapFocused]}>
                <Icon
                  name={tab.icon}
                  size={22}
                  color={focused ? theme.colors.primary : theme.colors.textMuted}
                />
              </View>
              <Text style={[styles.tabLabel, focused && styles.tabLabelFocused]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── Boot Screen ───────────────────────────────────────────────────
function BootScreen({ status }: { status: string }) {
  const { theme } = useTheme();
  const styles = useThemedStyles(createStyles);
  const pulse = useRef(new Animated.Value(0.5)).current;
  const rotate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 1100, useNativeDriver: true }),
      ]),
    ).start();
    Animated.loop(
      Animated.timing(rotate, { toValue: 1, duration: 6000, useNativeDriver: true }),
    ).start();
  }, [pulse, rotate]);

  const spin = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.bootScreen}>
      {/* Ambient glow layers */}
      <Animated.View style={[styles.bootGlow1, { opacity: pulse }]} />
      <Animated.View style={[styles.bootGlow2, { opacity: pulse, transform: [{ rotate: spin }] }]} />

      {/* Logo ring */}
      <View style={styles.bootLogoRing}>
        <Icon name="bank-check" size={38} color={theme.colors.primary} />
      </View>

      <Text style={styles.bootTitle}>Expense Tracker</Text>
      <Text style={styles.bootSubtitle}>Telebirr · CBE · Ethiopian Banks</Text>

      <ActivityIndicator size="small" color={theme.colors.primary} style={styles.bootSpinner} />
      <Text style={styles.bootStatus}>{status}</Text>
    </View>
  );
}

// ── Root App ──────────────────────────────────────────────────────
export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

function AppShell() {
  const { theme } = useTheme();
  const [isBooting, setIsBooting] = useState(true);
  const [bootStatus, setBootStatus] = useState('Starting up…');

  // Boot once on mount — initApp intentionally runs a single time.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { initApp(); }, []);

  // Keep the native SMS listener attached for the whole app lifetime, no matter
  // which screen is open, and sweep the queue whenever we come back to the front.
  useEffect(() => {
    const unsubscribe = subscribeToIncomingSms(() => {});
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') drainPendingSms().catch(() => {});
    });
    return () => {
      unsubscribe();
      sub.remove();
    };
  }, []);

  const initApp = async () => {
    if (Platform.OS !== 'android') { setIsBooting(false); return; }

    try {
      const alreadyAsked = await hasAskedForSmsPermission();
      const alreadySynced = await hasCompletedInitialSync();
      const readGranted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_SMS,
      );

      if (!alreadyAsked) {
        setBootStatus('Requesting SMS permission…');
        const granted = await checkAndRequestPermissions();
        await markSmsPermissionAsked();
        if (granted && !alreadySynced) {
          await doInitialSync();
        } else if (!granted) {
          setBootStatus('Permission denied.\nTap Sync on the dashboard when ready.');
          await delay(1500);
        }
      } else if (readGranted) {
        // Pick up anything the receiver captured while the app was closed.
        setBootStatus('Checking for new bank messages…');
        const queued = await drainPendingSms();
        if (queued > 0) {
          await markInitialSyncDone();
          setBootStatus(`Imported ${queued} new message${queued === 1 ? '' : 's'} ✓`);
          await delay(1000);
        } else if (!alreadySynced) {
          await doInitialSync();
        } else {
          setBootStatus('Welcome back — listening for new transactions…');
          await delay(500);
        }
      } else {
        setBootStatus('Tap Sync to import bank messages.');
        await delay(800);
      }
    } catch (e) {
      console.error('[App] Init error:', e);
    } finally {
      setIsBooting(false);
    }
  };

  const doInitialSync = async () => {
    setBootStatus('Scanning inbox for bank messages…');
    const { imported, total } = await syncDeviceSms((stage: string) => {
      setBootStatus(stage || 'Reading messages…');
    });
    await markInitialSyncDone();
    if (total > 0) {
      setBootStatus(`Imported ${imported} of ${total} transactions ✓`);
    } else {
      setBootStatus('No bank SMS found.\nAdd manually or use the Simulator.');
    }
    await delay(1400);
  };

  if (isBooting) return <BootScreen status={bootStatus} />;

  return (
    <SafeAreaProvider>
      <NavigationContainer
        theme={{
          dark: theme.isDark,
          colors: {
            primary: theme.colors.primary,
            background: theme.colors.background,
            card: theme.colors.surface,
            text: theme.colors.text,
            border: theme.colors.border,
            notification: theme.colors.danger,
          },
          fonts: {
            regular: { fontFamily: '', fontWeight: '400' },
            medium: { fontFamily: '', fontWeight: '500' },
            bold: { fontFamily: '', fontWeight: '700' },
            heavy: { fontFamily: '', fontWeight: '800' },
          },
        }}
      >
        <Tab.Navigator
          tabBar={(props) => <CustomTabBar {...props} />}
          screenOptions={{ headerShown: false }}
        >
          <Tab.Screen name="Home"         component={DashboardScreen} />
          <Tab.Screen name="Transactions" component={TransactionsScreen} />
          <Tab.Screen name="Insights"     component={InsightsScreen} />
          <Tab.Screen name="Settings"     component={SimulatorScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ── Styles ─────────────────────────────────────────────────────────
const createStyles = (theme: Theme) => StyleSheet.create({
  // Boot screen
  bootScreen: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  bootGlow1: {
    position: 'absolute',
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: theme.colors.primaryGlow,
  },
  bootGlow2: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    opacity: 0.12,
  },
  bootLogoRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: theme.colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    ...theme.shadow.accent,
  },
  bootTitle: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  bootSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  bootSpinner: { marginTop: 48, marginBottom: 16 },
  bootStatus: {
    color: theme.colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },

  // Tab bar
  tabBarWrapper: {
    backgroundColor: theme.colors.surface,
    ...theme.shadow.md,
  },
  tabBar: {
    flexDirection: 'row',
    height: 60,
    alignItems: 'center',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  tabIconWrap: {
    width: 40,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabIconWrapFocused: {
    backgroundColor: theme.colors.primarySubtle,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  tabLabelFocused: {
    color: theme.colors.primary,
    fontWeight: '700',
  },

  // FAB
  fabContainer: {
    position: 'absolute',
    top: -28,
    alignSelf: 'center',
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabWrap: {
    borderWidth: 4,
    borderColor: theme.colors.surface,
    borderRadius: 32,
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primaryDeep,
    justifyContent: 'center',
    alignItems: 'center',
    ...theme.shadow.accent,
  },
});
