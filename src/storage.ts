import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction } from './parser';

const STORAGE_KEY = '@expense_tracker:transactions';
const PERMISSION_KEY = '@expense_tracker:sms_permission_asked';
const APP_INITIALIZED_KEY = '@expense_tracker:initialized';
const CATEGORY_MAPPINGS_KEY = '@expense_tracker:category_mappings';

export interface CategoryRule { category: Category; name?: string; }

export async function getCategoryMappings(): Promise<Record<string, CategoryRule>> {
  try {
    const jsonValue = await AsyncStorage.getItem(CATEGORY_MAPPINGS_KEY);
    if (!jsonValue) return {};
    const parsed = JSON.parse(jsonValue);
    
    // Migrate old string mappings to object mappings
    const migrated: Record<string, CategoryRule> = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (typeof val === 'string') {
        migrated[key] = { category: val as Category };
      } else {
        migrated[key] = val as CategoryRule;
      }
    }
    return migrated;
  } catch (e) {
    console.error('[Storage] Error reading category mappings:', e);
    return {};
  }
}

export async function saveCategoryMapping(description: string, category: Category, name?: string): Promise<void> {
  try {
    const mappings = await getCategoryMappings();
    const normalizedKey = description.trim().toLowerCase();
    mappings[normalizedKey] = { category, name: name || undefined };
    await AsyncStorage.setItem(CATEGORY_MAPPINGS_KEY, JSON.stringify(mappings));
    console.log(`[Storage] Saved category mapping: "${normalizedKey}" -> ${category} (Name: ${name || 'none'})`);
  } catch (e) {
    console.error('[Storage] Error saving category mapping:', e);
  }
}

export async function deleteCategoryMapping(description: string): Promise<void> {
  try {
    const mappings = await getCategoryMappings();
    const normalizedKey = description.trim().toLowerCase();
    delete mappings[normalizedKey];
    await AsyncStorage.setItem(CATEGORY_MAPPINGS_KEY, JSON.stringify(mappings));
    console.log(`[Storage] Deleted category mapping: "${normalizedKey}"`);
  } catch (e) {
    console.error('[Storage] Error deleting category mapping:', e);
  }
}

export async function getTransactions(): Promise<Transaction[]> {
  try {
    const jsonValue = await AsyncStorage.getItem(STORAGE_KEY);
    if (jsonValue !== null) {
      const parsed = JSON.parse(jsonValue) as Transaction[];
      // Sort newest first
      return parsed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }
    // No seed data — return empty, real SMS sync will populate it
    return [];
  } catch (e) {
    console.error('[Storage] Error reading transactions:', e);
    return [];
  }
}

export async function saveTransactions(transactions: Transaction[]): Promise<void> {
  try {
    const jsonValue = JSON.stringify(transactions);
    await AsyncStorage.setItem(STORAGE_KEY, jsonValue);
  } catch (e) {
    console.error('[Storage] Error saving transactions:', e);
  }
}

export async function addTransaction(transaction: Transaction): Promise<Transaction[]> {
  const transactions = await getTransactions();
  // Avoid duplicate transaction IDs (especially for repeated SMS syncs)
  if (transactions.some(tx => tx.id === transaction.id)) {
    console.log(`[Storage] Duplicate skipped: ${transaction.id}`);
    return transactions;
  }
  const updated = [transaction, ...transactions];
  await saveTransactions(updated);
  console.log(`[Storage] Added transaction: ${transaction.id} (${transaction.amount} ${transaction.type})`);
  return updated;
}

export async function updateTransaction(updatedTx: Transaction): Promise<Transaction[]> {
  const transactions = await getTransactions();
  const updated = transactions.map(tx => tx.id === updatedTx.id ? updatedTx : tx);
  await saveTransactions(updated);
  return updated;
}

export async function deleteTransaction(id: string): Promise<Transaction[]> {
  const transactions = await getTransactions();
  const updated = transactions.filter(tx => tx.id !== id);
  await saveTransactions(updated);
  return updated;
}

export async function clearAllTransactions(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
    console.log('[Storage] All transactions cleared.');
  } catch (e) {
    console.error('[Storage] Error clearing transactions:', e);
  }
}

/**
 * Remove all automatically-imported SMS transactions (keeps manual ones).
 * Also resets the initial-sync flag so the next sync re-imports from scratch
 * with the full rawMessage field included.
 */
export async function clearSmsTransactionsAndResetSync(): Promise<number> {
  try {
    const all = await getTransactions();
    const manualOnly = all.filter(tx => tx.isManual === true);
    await saveTransactions(manualOnly);
    // Reset the initialized flag so App.tsx re-syncs on next launch
    await AsyncStorage.removeItem(APP_INITIALIZED_KEY);
    console.log(`[Storage] Cleared ${all.length - manualOnly.length} SMS transactions. Kept ${manualOnly.length} manual.`);
    return all.length - manualOnly.length;
  } catch (e) {
    console.error('[Storage] Error clearing SMS transactions:', e);
    return 0;
  }
}

// Track whether permission was already asked this session
// (persisted so we don't ask again on re-opens)
export async function hasAskedForSmsPermission(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(PERMISSION_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

export async function markSmsPermissionAsked(): Promise<void> {
  try {
    await AsyncStorage.setItem(PERMISSION_KEY, 'true');
  } catch (e) {
    console.error('[Storage] Error marking permission asked:', e);
  }
}

// Track whether initial inbox sync was done
export async function hasCompletedInitialSync(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(APP_INITIALIZED_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

export async function markInitialSyncDone(): Promise<void> {
  try {
    await AsyncStorage.setItem(APP_INITIALIZED_KEY, 'true');
  } catch (e) {
    console.error('[Storage] Error marking initial sync done:', e);
  }
}
