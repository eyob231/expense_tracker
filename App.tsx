import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  Platform,
  PermissionsAndroid,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { theme } from './src/theme';
import DashboardScreen from './src/screens/DashboardScreen';
import TransactionsScreen from './src/screens/TransactionsScreen';
import SimulatorScreen from './src/screens/SimulatorScreen';
import {
  checkAndRequestPermissions,
  syncDeviceSms,
  subscribeToIncomingSms,
} from './src/deviceSms';
import {
  hasAskedForSmsPermission,
  markSmsPermissionAsked,
  hasCompletedInitialSync,
  markInitialSyncDone,
} from './src/storage';

const Tab = createBottomTabNavigator();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  let emoji = '📊';
  if (label === 'Transactions') emoji = '🧾';
  if (label === 'Parse') emoji = '⚡';

  return (
    <View style={styles.tabIconContainer}>
      <Text style={[styles.tabEmoji, { opacity: focused ? 1 : 0.5 }]}>{emoji}</Text>
      <Text 
        style={[styles.tabLabel, focused ? styles.tabLabelActive : styles.tabLabelInactive]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {label}
      </Text>
    </View>
  );
}

export default function App() {
  const [isBooting, setIsBooting] = useState(true);
  const [bootStatus, setBootStatus] = useState('Loading...');

  useEffect(() => {
    initApp();
  }, []);

  const initApp = async () => {
    if (Platform.OS !== 'android') {
      setIsBooting(false);
      return;
    }

    try {
      // Check if we've already asked for permissions in a previous session
      const alreadyAsked = await hasAskedForSmsPermission();
      const alreadySynced = await hasCompletedInitialSync();

      if (!alreadyAsked) {
        // First time: show rationale and ask
        setBootStatus('Requesting SMS permission...');
        const granted = await checkAndRequestPermissions();
        await markSmsPermissionAsked();

        if (granted && !alreadySynced) {
          await doInitialSync();
        } else if (!granted) {
          setBootStatus('Permission denied.\nTap 🔄 Sync on the dashboard when ready.');
          await new Promise<void>(resolve => setTimeout(resolve, 1500));
        }
      } else {
        // Permission was already asked — check if we have it now silently
        const readGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);

        if (readGranted && !alreadySynced) {
          // Has permission but hasn't synced yet — do it now
          await doInitialSync();
        } else if (readGranted && alreadySynced) {
          // Already synced — quick startup
          setBootStatus('Welcome back! Listening for new transactions...');
          await new Promise<void>(resolve => setTimeout(resolve, 600));
        } else {
          setBootStatus('Tap 🔄 Sync to import bank messages.');
          await new Promise<void>(resolve => setTimeout(resolve, 800));
        }
      }
    } catch (e) {
      console.error('[App] Init error:', e);
    } finally {
      setIsBooting(false);
    }
  };

  const doInitialSync = async () => {
    setBootStatus('Scanning inbox for bank messages...\nThis may take a moment.');
    console.log('[App] Starting initial SMS sync...');

    const { imported, total } = await syncDeviceSms((current, total) => {
      setBootStatus(`Processing bank messages...\n${current} / ${total}`);
    });

    await markInitialSyncDone();
    console.log(`[App] Initial sync done: ${imported} imported of ${total} bank messages found.`);

    if (total > 0) {
      setBootStatus(`✓ Imported ${imported} of ${total} bank transactions`);
    } else {
      setBootStatus('No bank SMS messages found in inbox.\nAdd manually or use Simulator.');
    }
    await new Promise<void>(resolve => setTimeout(resolve, 1400));
  };

  if (isBooting) {
    return (
      <View style={styles.bootScreen}>
        <Text style={styles.bootLogo}>💳</Text>
        <Text style={styles.bootTitle}>Expense Tracker</Text>
        <Text style={styles.bootSubtitle}>Telebirr · CBE · Ethiopian Banks</Text>
        <ActivityIndicator
          size="large"
          color={theme.colors.primary}
          style={styles.bootSpinner}
        />
        <Text style={styles.bootStatus}>{bootStatus}</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: styles.tabBar,
            tabBarShowLabel: false,
          }}
        >
          <Tab.Screen
            name="Home"
            component={DashboardScreen}
            options={{
              tabBarIcon: ({ focused }) => <TabIcon label="Home" focused={focused} />,
            }}
          />
          <Tab.Screen
            name="Transactions"
            component={TransactionsScreen}
            options={{
              tabBarIcon: ({ focused }) => <TabIcon label="Transactions" focused={focused} />,
            }}
          />
          <Tab.Screen
            name="Parse"
            component={SimulatorScreen}
            options={{
              tabBarIcon: ({ focused }) => <TabIcon label="Parse" focused={focused} />,
            }}
          />
        </Tab.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  bootScreen: {
    flex: 1,
    backgroundColor: theme.colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  bootLogo: {
    fontSize: 64,
    marginBottom: 16,
  },
  bootTitle: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  bootSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 14,
    marginTop: 6,
    textAlign: 'center',
  },
  bootSpinner: {
    marginTop: 40,
    marginBottom: 20,
  },
  bootStatus: {
    color: theme.colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  tabBar: {
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    height: Platform.OS === 'ios' ? 80 : 70, // Slight height tweak for different OS
    paddingBottom: Platform.OS === 'ios' ? 20 : 10,
    paddingTop: 10,
  },
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 100, // Fixed width to give text room to scale down instead of wrap
  },
  tabEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  tabLabelActive: {
    color: theme.colors.primary,
  },
  tabLabelInactive: {
    color: theme.colors.textMuted,
  },
});
