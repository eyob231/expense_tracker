import { NativeModules, NativeEventEmitter, PermissionsAndroid, Platform, Alert } from 'react-native';
import { parseSMS, looksLikeBankAlert, Transaction } from './parser';
import { addTransactionIfNew, getCategoryMappings } from './storage';

const { SmsModule } = NativeModules;

// Only create the event emitter if the native module exists (Android only)
const smsEventEmitter = SmsModule ? new NativeEventEmitter(SmsModule) : null;

// Known bank/service sender IDs. Used for reporting, not as a hard filter —
// messages from unrecognised senders are still attempted so a bank we don't
// know about isn't silently ignored.
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

export function isFromKnownBank(address: string): boolean {
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

/**
 * Try to turn a raw SMS into a stored transaction.
 * Returns the parsed transaction, or null when the message isn't a bank alert.
 */
async function importSms(
  address: string,
  body: string,
  date: number,
): Promise<Transaction | null> {
  // Known senders go straight to the parser; unknown senders must at least
  // look like a bank alert so promotional SMS never gets imported.
  if (!isFromKnownBank(address) && !looksLikeBankAlert(body)) {
    return null;
  }
  const mappings = await getCategoryMappings();
  const parsed = parseSMS(body, address, date, mappings);
  if (!parsed) return null;
  const added = await addTransactionIfNew(parsed);
  return added ? parsed : null;
}

/**
 * Import messages that arrived while the app wasn't running. The native
 * receiver queues them in shared preferences so nothing is lost.
 */
export async function drainPendingSms(): Promise<number> {
  if (Platform.OS !== 'android' || !SmsModule?.getPendingSms) return 0;
  try {
    const pending: { address: string; body: string; date: number }[] =
      (await SmsModule.getPendingSms()) || [];
    if (!pending.length) return 0;
    let imported = 0;
    for (const sms of pending) {
      try {
        const tx = await importSms(sms.address, sms.body, sms.date);
        if (tx) imported++;
      } catch (e) {
        console.warn('[SMS Queue] Failed to import queued message:', e);
      }
    }
    await SmsModule.clearPendingSms();
    console.log(`[SMS Queue] Imported ${imported} of ${pending.length} queued messages.`);
    return imported;
  } catch (e) {
    console.error('[SMS Queue] Error draining pending messages:', e);
    return 0;
  }
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

    // Calculate timestamp for 90 days ago
    const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
    const minDate = Date.now() - NINETY_DAYS_MS;

    // Fetch up to 1000 messages or until minDate is reached
    const smsList: { address: string; body: string; date: number }[] = await SmsModule.getSmsList({
      limit: 1000,
      minDate: minDate,
    });
    console.log(`[SMS Sync] Total inbox messages fetched: ${smsList.length}`);
    if (onProgress) onProgress('Filtering bank messages...', 0, smsList.length);

    // Prefer known bank senders, but also keep unrecognised senders whose
    // message clearly looks like a bank alert.
    const candidates = smsList.filter(
      sms => isFromKnownBank(sms.address) || looksLikeBankAlert(sms.body),
    );
    const senders = [...new Set(candidates.map(s => s.address))];
    console.log(`[SMS Sync] Candidate messages: ${candidates.length} from: ${senders.join(', ')}`);

    let imported = 0;
    let processedCount = 0;

    const mappings = await getCategoryMappings();

    for (const sms of candidates) {
      const parsed = parseSMS(sms.body, sms.address, sms.date, mappings);
      if (parsed && await addTransactionIfNew(parsed)) {
        imported++;
      }
      processedCount++;
      if (onProgress) {
        onProgress(`Processing… ${processedCount}/${candidates.length}`, processedCount, candidates.length);
      }
    }

    // Pick up anything the receiver stashed while the app was closed.
    const queued = await drainPendingSms();
    imported += queued;

    if (onProgress) onProgress('Finalizing sync…', processedCount, candidates.length);
    console.log(`[SMS Sync] Done. ${imported} imported of ${candidates.length} candidate messages.`);
    return { imported, total: candidates.length };
  } catch (error) {
    console.error('[SMS Sync] Error:', error);
    if (onProgress) onProgress('Error occurred.', 0, 0);
    return { imported: 0, total: 0 };
  }
}

// ── Live SMS listening ─────────────────────────────────────────────
// A single native subscription is shared app-wide so new messages are
// captured no matter which screen is open.

type SmsListener = (tx: Transaction) => void;

const listeners = new Set<SmsListener>();
let nativeSubscriptionStarted = false;

function ensureNativeSubscription() {
  if (nativeSubscriptionStarted || Platform.OS !== 'android' || !smsEventEmitter) return;
  nativeSubscriptionStarted = true;
  smsEventEmitter.addListener(
    'onSmsReceived',
    async (event: { address: string; body: string; date: number }) => {
      try {
        const tx = await importSms(event.address, event.body, event.date);
        if (tx) listeners.forEach(l => l(tx));
      } catch (e) {
        console.error('Failed to process incoming SMS event:', e);
      }
    },
  );
}

/** Subscribe to newly detected bank transactions. Returns an unsubscribe fn. */
export function subscribeToIncomingSms(onNewTransaction: SmsListener): () => void {
  ensureNativeSubscription();
  listeners.add(onNewTransaction);
  return () => {
    listeners.delete(onNewTransaction);
  };
}
