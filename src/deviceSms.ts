import { NativeModules, NativeEventEmitter, PermissionsAndroid, Platform, Alert } from 'react-native';
import { parseSMS, Transaction } from './parser';
import { addTransaction, getCategoryMappings } from './storage';

const { SmsModule } = NativeModules;

// Only create the event emitter if the native module exists (Android only)
const smsEventEmitter = SmsModule ? new NativeEventEmitter(SmsModule) : null;

// Known bank/service sender IDs to filter for when syncing past messages
// Add your bank's sender IDs here
const KNOWN_BANK_SENDERS = [
  // User's banks (primary)
  'cbe',          // Commercial Bank of Ethiopia
  '127',          // CBE short code
  'cbebirr',      // CBE Birr mobile wallet
  'cbe_birr',
  'cbe-birr',
  // Telebirr
  'telebirr',
  'telebir',
  '8036',         // Telebirr short code
  'et-birr',
  // Other Ethiopian banks
  'awash',
  'awashbank',
  'dashen',
  'abyssinia',
  'boa',
  'hibret',
  'nib',
  'bunna',
  'enat',
  'oromia',
  'amhara',
  'wegagen',
  'lion',
  'zemen',
];

function isFromKnownBank(address: string): boolean {
  const addrLower = (address || '').toLowerCase();
  return KNOWN_BANK_SENDERS.some(sender => addrLower.includes(sender));
}

export async function requestSmsPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  try {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.READ_SMS,
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
    ]);

    const readGranted = granted[PermissionsAndroid.PERMISSIONS.READ_SMS] === PermissionsAndroid.RESULTS.GRANTED;
    const receiveGranted = granted[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] === PermissionsAndroid.RESULTS.GRANTED;

    return readGranted && receiveGranted;
  } catch (err) {
    console.warn('Permission request error:', err);
    return false;
  }
}

export async function checkAndRequestPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  return new Promise(resolve => {
    Alert.alert(
      'SMS Permission Required',
      'This app needs access to your SMS messages to automatically detect and import bank transactions from Telebirr, CBE, and other Ethiopian banks.\n\nYour messages are processed locally — nothing is sent to any server.',
      [
        {
          text: 'Deny',
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: 'Allow',
          onPress: async () => {
            const result = await requestSmsPermissions();
            resolve(result);
          },
        },
      ],
    );
  });
}

export async function syncDeviceSms(
  onProgress?: (stage: string, current: number, total: number) => void
): Promise<{ imported: number; total: number }> {
  if (Platform.OS !== 'android' || !SmsModule) {
    console.log('[SMS Sync] Skipped: not Android or SmsModule not available');
    return { imported: 0, total: 0 };
  }

  const hasPermission = await requestSmsPermissions();
  if (!hasPermission) {
    console.log('[SMS Sync] Skipped: permission not granted');
    return { imported: 0, total: 0 };
  }

  try {
    console.log('[SMS Sync] Fetching inbox messages...');
    if (onProgress) onProgress('Scanning inbox...', 0, 0);
    
    // Calculate timestamp for 30 days ago
    const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    const minDate = Date.now() - THIRTY_DAYS_MS;

    // Fetch up to 1000 messages or until minDate is reached
    const smsList: { address: string; body: string; date: number }[] = await SmsModule.getSmsList({ 
      limit: 1000,
      minDate: minDate 
    });
    console.log(`[SMS Sync] Total inbox messages fetched: ${smsList.length}`);
    if (onProgress) onProgress('Filtering bank messages...', 0, smsList.length);

    // Pre-filter to only known bank senders
    const bankMessages = smsList.filter(sms => isFromKnownBank(sms.address));
    console.log(`[SMS Sync] Bank messages found: ${bankMessages.length} from senders: ${[...new Set(bankMessages.map(s => s.address))].join(', ')}`);

    let imported = 0;
    let processedCount = 0;

    const mappings = await getCategoryMappings();

    for (const sms of bankMessages) {
      if (onProgress) onProgress(`Analyzing message from ${sms.address}...`, processedCount, bankMessages.length);
      const parsed = parseSMS(sms.body, sms.address, sms.date, mappings);
      if (parsed) {
        await addTransaction(parsed);
        imported++;
      }
      processedCount++;
      if (onProgress) {
        onProgress(`Processing... ${processedCount}/${bankMessages.length}`, processedCount, bankMessages.length);
      }
    }

    if (onProgress) onProgress('Finalizing sync...', processedCount, bankMessages.length);
    console.log(`[SMS Sync] Done. ${imported} imported of ${bankMessages.length} bank messages.`);
    return { imported, total: bankMessages.length };
  } catch (error) {
    console.error('[SMS Sync] Error:', error);
    if (onProgress) onProgress('Error occurred.', 0, 0);
    return { imported: 0, total: 0 };
  }
}

export function subscribeToIncomingSms(
  onNewTransaction: (tx: Transaction) => void
): (() => void) | null {
  if (Platform.OS !== 'android' || !smsEventEmitter) return null;

  const subscription = smsEventEmitter.addListener('onSmsReceived', async (event: { address: string; body: string; date: number }) => {
    try {
      // Only process messages from known banks
      if (!isFromKnownBank(event.address)) return;

      const mappings = await getCategoryMappings();
      const parsed = parseSMS(event.body, event.address, event.date, mappings);
      if (parsed) {
        await addTransaction(parsed);
        onNewTransaction(parsed);
      }
    } catch (e) {
      console.error('Failed to process incoming SMS event:', e);
    }
  });

  return () => {
    subscription.remove();
  };
}
