export interface Transaction {
  id: string;
  amount: number;
  type: 'credit' | 'debit';
  date: string;
  balance: number;
  description: string;
  sender: string;
  category: string;
  isReviewed: boolean;
  isManual: boolean;
  rawMessage?: string;
}

export type Category = 'Food & Dining' | 'Shopping' | 'Transportation' | 'Salary' | 'UPI Transfers' | 'Other';

/** A user-defined auto-categorization rule. Keys are keywords matched against a message. */
export interface CategoryRule {
  category: Category;
  /** Optional display name that replaces the parsed description (e.g. "Eyob" for a phone number). */
  name?: string;
}

export type CategoryMappings = Record<string, CategoryRule>;

const CATEGORY_KEYWORDS: { [key in Category]: string[] } = {
  'Food & Dining': ['swiggy', 'zomato', 'restaurant', 'cafe', 'food', 'pizza', 'burger', 'eats', 'sheger', 'yene', 'hotel', 'grocery', 'supermarket'],
  'Shopping': ['sheger', 'amazon', 'shein', 'boutique', 'mall', 'clothing', 'shoes', 'electronics', 'gift', 'market', 'store', 'shop'],
  'Transportation': ['uber', 'ride', 'taxi', 'fuel', 'petrol', 'gas', 'metro', 'bus', 'train', 'flight', 'ticket', 'oil', 'garage', 'fano', 'yego'],
  'Salary': ['salary', 'wage', 'payroll', 'freelance', 'bonus', 'commission', 'allowance', 'dividend'],
  'UPI Transfers': ['transfer', 'p2p', 'send to', 'received from', 'sent to', 'pay to', 'paid to', 'cbe birr', 'telebirr', 'ከ', 'ወደ', 'ማስተላለፍ'],
  'Other': []
};

/** Normalize a keyword / haystack so matching is case- and whitespace-insensitive. */
export function normalizeText(value: string): string {
  return (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Pick a category for a transaction.
 *
 * User-defined rules always win and are matched against BOTH the raw SMS body
 * and the derived description — this is what makes rules for frequent accounts
 * (phone numbers, account numbers, payee names) actually work. When several
 * rules match, the most specific (longest keyword) one wins.
 */
export function autoCategorize(
  description: string,
  type: 'credit' | 'debit',
  mappings: CategoryMappings = {},
  rawBody = '',
): CategoryRule {
  const haystack = normalizeText(`${rawBody} ${description}`);

  let bestHit: { rule: CategoryRule; len: number } | null = null;
  for (const [keyword, rule] of Object.entries(mappings)) {
    const needle = normalizeText(keyword);
    if (!needle) continue;
    if (haystack.includes(needle) && (!bestHit || needle.length > bestHit.len)) {
      bestHit = { rule, len: needle.length };
    }
  }
  if (bestHit) return bestHit.rule;

  const descLower = normalizeText(description);

  if (type === 'credit') {
    if (CATEGORY_KEYWORDS['Salary'].some(kw => descLower.includes(kw))) return { category: 'Salary' };
  }

  let bestCategory: Category = 'Other';
  let maxScore = 0;

  for (const cat in CATEGORY_KEYWORDS) {
    const category = cat as Category;
    if (category === 'Other' || category === 'Salary') continue;
    let score = 0;
    for (const keyword of CATEGORY_KEYWORDS[category]) {
      if (descLower.includes(keyword)) score++;
    }
    if (score > maxScore) { maxScore = score; bestCategory = category; }
  }

  return { category: bestCategory };
}

function parseAmount(str: string): number {
  if (!str) return 0;
  const cleaned = str.replace(/,/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Generate a deterministic ID from the SMS body + timestamp.
 * This ensures the same real SMS always gets the same ID regardless of
 * how many times we sync, preventing duplicate imports.
 */
function deterministicId(prefix: string, body: string, timestamp: number): string {
  // Simple but effective: take first 40 chars (stripped) + timestamp rounded to minute
  // Rounding to minute handles slight timestamp differences for the same SMS
  const bodyKey = body.replace(/\s+/g, '').slice(0, 40);
  const minuteTs = Math.floor(timestamp / 60000); // round to nearest minute
  let hash = 0;
  const str = `${bodyKey}${minuteTs}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit int
  }
  const hashStr = Math.abs(hash).toString(36).toUpperCase().padStart(8, '0');
  return `${prefix}_${hashStr}`;
}

/**
 * A number followed by one of these is a bundle/airtime quantity, not money.
 * Telebirr messages routinely mix "1024 MB" with "Br 50.00", and treating the
 * data figure as a birr amount both invents transactions and corrupts the
 * balance, which in turn makes the real balance look like the amount.
 */
const NOT_A_UNIT =
  '(?![\\s.]*(?:MB|GB|KB|TB|PB|Mbps|Gbps|Kbps|mb|gb|kb|tb|mbps|gbps|kbps|minutes?|mins?|seconds?|secs?|hours?|hrs?|sms|days?|nights?|calls?)\\b)';

const NUMBER = '\\d+(?:,\\d{3})*(?:\\.\\d{1,2})?';
const CURRENCY = '(?:ETB|Birr|ብር|USD|\\$|Br\\.?)';

/** A number must not match as the prefix of a bigger one (1,024 must not match as 1). */
const NUMBER_END = '(?![\\d,]|\\.\\d)';

/** Currency-adjacent numbers, ignoring any number that has a data/time unit after it. */
function extractNumericAmounts(body: string): number[] {
  const amountRegex = new RegExp(
    `(?:${CURRENCY}\\s*(${NUMBER})${NUMBER_END}${NOT_A_UNIT})` +
      `|(?:(${NUMBER})${NUMBER_END}${NOT_A_UNIT}\\s*${CURRENCY})`,
    'gi',
  );
  const amounts: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = amountRegex.exec(body)) !== null) {
    const val = parseAmount(match[1] || match[2]);
    if (val > 0) amounts.push(val);
  }
  return amounts;
}

const WORD_ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const WORD_TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const WORD_SCALES: Record<string, number> = {
  hundred: 100, thousand: 1_000, million: 1_000_000, billion: 1_000_000_000,
};

/** Turn ["one","hundred","fifty"] into 150. Returns null if any word is unknown. */
export function wordsToNumber(words: string[]): number | null {
  let total = 0;
  let current = 0;
  let matched = false;

  for (const raw of words) {
    const word = raw.toLowerCase();
    if (word === 'and') continue;
    if (word in WORD_ONES) {
      current += WORD_ONES[word];
      matched = true;
    } else if (word in WORD_TENS) {
      current += WORD_TENS[word];
      matched = true;
    } else if (word in WORD_SCALES) {
      const scale = WORD_SCALES[word];
      if (scale === 100) {
        current = (current || 1) * 100;
      } else {
        total += (current || 1) * scale;
        current = 0;
      }
      matched = true;
    } else {
      return null;
    }
  }

  return matched ? total + current : null;
}

/** Amounts written as words before a currency token, e.g. "one hundred fifty birr". */
function extractWordAmounts(body: string): number[] {
  const word = '(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|and)';
  const re = new RegExp(`\\b((?:${word}[\\s,-]+)*${word})\\s*(?=${CURRENCY})`, 'gi');
  const amounts: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    const value = wordsToNumber(match[1].split(/[\s,-]+/).filter(Boolean));
    if (value && value > 0) amounts.push(value);
  }
  return amounts;
}

// Helper to parse all amounts in the text and return the best transaction amount
function extractMainAmount(body: string, balanceAmount: number): number {
  const amounts = [...extractNumericAmounts(body), ...extractWordAmounts(body)];

  // Filter out the balance if it was captured
  let validAmounts = amounts.filter(a => Math.abs(a - balanceAmount) > 0.01);

  // If no valid amounts left, maybe the balance was the only amount (shouldn't happen for tx)
  if (validAmounts.length === 0 && amounts.length > 0) validAmounts = amounts;

  // The main transaction amount is usually the largest number (VAT/fees are smaller)
  return validAmounts.length > 0 ? Math.max(...validAmounts) : 0;
}

/**
 * The money balance. Deliberately skips numbers followed by a data unit so a
 * message like "data balance is 1024 MB … your balance is Br 50.00" reports
 * 50, not 1024.
 */
const BALANCE_REGEX = new RegExp(
  `(?:balance|bal)\\s*(?:is|:)?\\s*(?:${CURRENCY})?\\s*(${NUMBER})${NUMBER_END}${NOT_A_UNIT}` +
    `|(?:ቀሪ\\s*ሂሳብዎ?)[\\s\\S]{0,14}?(${NUMBER})${NUMBER_END}${NOT_A_UNIT}`,
  'i',
);

function extractBalance(body: string): number {
  const match = body.match(BALANCE_REGEX);
  return match ? parseAmount(match[1] || match[2]) : 0;
}

const DEBIT_RE = /\b(debit(?:ed)?|transferred|transfer(?:\s+to)?|sent|paid|payment|withdraw(?:n|al)?|charge(?:d)?|deducted|purchase|spent)\b/i;
const CREDIT_RE = /\b(received|credited|credit|deposited|deposit|refund(?:ed)?|reversal)\b/i;

function detectType(body: string): 'credit' | 'debit' {
  const bodyLower = body.toLowerCase();
  // Debit keywords take priority — "debited" must not be read as a credit.
  const isDebit = DEBIT_RE.test(body) || bodyLower.includes('ወጪ') || bodyLower.includes('ተቀናሽ');
  const isCredit = !isDebit && (CREDIT_RE.test(body) || bodyLower.includes('ገቢ') || bodyLower.includes('ታድሷል') || bodyLower.includes('ተሞልቷል'));
  return isCredit ? 'credit' : 'debit';
}

/** Pull the counterparty out of a message: phone number, account number, or a name. */
export function extractCounterparty(rawMessage: string | undefined, description: string): string | null {
  const text = `${rawMessage || ''} ${description}`;

  // Ethiopian mobile numbers: 09xxxxxxxx / 07xxxxxxxx (optionally +251…)
  const phone = text.match(/(?:\+?251|0)([79]\d{8})\b/);
  if (phone) return `0${phone[1]}`;

  // Masked account numbers, e.g. 1000******1234
  const maskedAcct = text.match(/\b(\d{2,6}\*{2,}\d{2,4})\b/);
  if (maskedAcct) return maskedAcct[1];

  // Plain account numbers, e.g. "account 1000123456"
  const acct = text.match(/\baccount\s*(?:number)?\s*[:#]?\s*(\d{6,})\b/i);
  if (acct) return acct[1];

  // Fall back to the payee/sender captured in the description
  const named = description.match(/^(?:paid to|sent to|received from|debit from acc:|credit to acc:)\s*(.+)$/i);
  if (named) return named[1].trim();

  return null;
}

export interface FrequentAccount {
  /** Stable key used to match future messages. */
  key: string;
  /** Human-friendly label. */
  label: string;
  count: number;
  total: number;
  lastDate: string;
  /** The category used by the most recent transaction for this account. */
  category: Category;
  /** Transactions belonging to this account. */
  txIds: string[];
}

/**
 * Group transactions by counterparty and return the most frequently seen
 * accounts first. Used to offer one-tap categorization rules.
 */
export function getFrequentAccounts(transactions: Transaction[], limit = 12): FrequentAccount[] {
  const map = new Map<string, FrequentAccount>();

  // Newest first so `category` reflects the latest choice.
  const sorted = [...transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  for (const tx of sorted) {
    if (tx.isManual) continue;
    const key = extractCounterparty(tx.rawMessage, tx.description);
    if (!key) continue;
    const label = key;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      existing.total += tx.amount;
      existing.txIds.push(tx.id);
    } else {
      map.set(key, {
        key,
        label,
        count: 1,
        total: tx.amount,
        lastDate: tx.date,
        category: tx.category as Category,
        txIds: [tx.id],
      });
    }
  }

  return [...map.values()]
    .filter(a => a.count >= 1)
    .sort((a, b) => (b.count - a.count) || (b.total - a.total))
    .slice(0, limit);
}

/**
 * Loose check for messages that look like a bank alert even when the sender ID
 * isn't one we recognise. Keeps us from importing random promotional SMS.
 */
export function looksLikeBankAlert(body: string): boolean {
  const lower = body.toLowerCase();
  const hasMoney = /(?:etb|birr|ብር|br\.?)/i.test(body) && /\d/.test(body);
  if (!hasMoney) return false;
  const hints = [
    'balance', 'bal', 'account', 'a/c', 'ref', 'transaction', 'txn', 'debit',
    'credit', 'transfer', 'telebirr', 'cbe', 'ቀሪ', 'ሂሳብ', 'ግብይት', 'መለያ',
  ];
  return hints.some(h => lower.includes(h));
}

export type BankId = 'cbe' | 'cbe birr' | 'telebirr' | 'other';

const TELEBIRR_NAME = /(?:telebirr|telebir|ቴሌብር)/i;
const CBE_BIRR_NAME = /(?:cbe[\s_-]*birr|cbebirr)/i;
const CBE_NAME = /(?:commercial\s+bank\s+of\s+ethiopia|cbe|ንግድ\s*ባንክ|የኢትዮጵያ\s*ንግድ\s*ባንክ)/i;

/**
 * Which bank a *sender address* obviously belongs to, or null when the address
 * is numeric/unknown. Ordered so that "CBE Birr" is never read as plain CBE.
 */
function bankFromAddress(address: string): BankId | null {
  const addr = (address || '').toLowerCase();
  if (!addr) return null;
  if (TELEBIRR_NAME.test(addr) || addr.includes('8036')) return 'telebirr';
  if (CBE_BIRR_NAME.test(addr)) return 'cbe birr';
  if (CBE_NAME.test(addr)) return 'cbe';
  return null;
}

/**
 * Whichever bank brand appears first in the body wins — a message introduces
 * itself ("Your telebirr account…") before it names the counterparty
 * ("…payment to CBE Birr"), so position is the reliable signal.
 */
function bankFromBody(body: string): BankId | null {
  const hits: { bank: BankId; index: number }[] = [];
  const tele = body.search(TELEBIRR_NAME);
  const birr = body.search(CBE_BIRR_NAME);
  const cbe = body.search(CBE_NAME);
  if (tele >= 0) hits.push({ bank: 'telebirr', index: tele });
  if (birr >= 0) hits.push({ bank: 'cbe birr', index: birr });
  if (cbe >= 0) hits.push({ bank: 'cbe', index: cbe });
  if (hits.length === 0) return null;
  // On a tie the more specific brand wins (cbe birr over cbe).
  return hits.sort((a, b) => a.index - b.index)[0].bank;
}

/**
 * Classify a message as CBE, CBE Birr, Telebirr or unknown.
 *
 * A named sender ID wins outright. Otherwise the body's own branding decides,
 * and only then do we fall back to short codes — note that 127/126 belong to
 * **Telebirr**, not CBE, which is why balances must never be guessed from an
 * unclassified message.
 */
export function detectBank(body: string, senderAddress: string): BankId {
  const fromAddress = bankFromAddress(senderAddress);
  if (fromAddress) return fromAddress;
  const fromBody = bankFromBody(body);
  if (fromBody) return fromBody;
  if (/^\+?\s*(?:127|126)$/.test((senderAddress || '').trim())) return 'telebirr';
  return 'other';
}

/**
 * Speech from a message that *owns* a brand, as opposed to merely naming it.
 * "your telebirr account" means the money is Telebirr's; "payment to Telebirr"
 * inside a CBE alert does not.
 */
const OWNS_TELEBIRR = /(?:your\s+telebirr\s+(?:account|wallet)|telebirr\s+(?:account|wallet)|የ\s*telebirr\s*ሂሳብ|ቴሌብር\s*ሂሳብ)/i;
const OWNS_CBE = /(?:commercial\s+bank\s+of\s+ethiopia|ንግድ\s*ባንክ|(?:your|የ)\s*cbe\s*(?:account|wallet|ሂሳብ))/i;

/**
 * Best-effort repair of a *stored* sender label. The original address is not
 * kept, so the body has to prove which bank it belongs to.
 *
 * Scoped to the one label the old classifier got wrong: Telebirr alerts that
 * arrived from short code 127 were filed under CBE, which put a Telebirr
 * balance in the CBE card. A CBE alert that merely names Telebirr as the payee
 * still owns CBE branding, so it is left untouched.
 */
export function repairSenderFromBody(rawMessage: string | undefined, storedSender: string): BankId | null {
  const stored = normalizeText(storedSender) as BankId;
  if (stored !== 'cbe' && stored !== 'cbe birr') return null;
  if (!rawMessage) return null;
  if (OWNS_CBE.test(rawMessage)) return null;
  return OWNS_TELEBIRR.test(rawMessage) ? 'telebirr' : null;
}

const MASKED_ACCOUNT_RE = /\b(\d{2,6}\*{2,}\d{2,4})\b/;
const PLAIN_ACCOUNT_RE = /\baccount\s*(?:number)?\s*[:#]?\s*(\d{6,})\b/i;

/** The account a balance belongs to: a masked account number if the SMS has one. */
function extractAccount(rawMessage: string | undefined, description: string): string | null {
  const text = `${description} ${rawMessage || ''}`;
  const masked = text.match(MASKED_ACCOUNT_RE);
  if (masked) return masked[1];
  const plain = text.match(PLAIN_ACCOUNT_RE);
  return plain ? plain[1] : null;
}

export interface AccountBalance {
  /** Stable key: bank + account, so each account keeps its own reading. */
  key: string;
  bank: BankId;
  /** Display name, disambiguated with the account suffix when needed. */
  label: string;
  account?: string;
  balance: number;
  /** Date of the message the reading came from. */
  date: string;
}

const BANK_LABEL: Partial<Record<BankId, string>> = {
  cbe: 'CBE',
  'cbe birr': 'CBE Birr',
  telebirr: 'Telebirr',
};

const BANK_ORDER: Partial<Record<BankId, number>> = { cbe: 0, 'cbe birr': 1, telebirr: 2 };

/**
 * Current balance for each account, taken **only** from messages that carried a
 * balance for that same account. A message with no balance is skipped rather
 * than treated as zero, and a balance reading is never borrowed from another
 * bank's (or another account's) message — that is what made the CBE card show
 * whichever message happened to arrive last.
 */
export function getAccountBalances(transactions: Transaction[]): AccountBalance[] {
  const groups = new Map<string, AccountBalance>();

  for (const tx of transactions) {
    if (tx.isManual) continue;
    if (!tx.balance || tx.balance <= 0) continue;
    const bank = normalizeText(String(tx.sender || '')) as BankId;
    if (!BANK_LABEL[bank]) continue;

    const account =
      bank === 'telebirr' ? undefined : extractAccount(tx.rawMessage, tx.description) || undefined;
    const key = `${bank}|${account || 'main'}`;
    const time = new Date(tx.date).getTime();
    const existing = groups.get(key);
    if (existing && new Date(existing.date).getTime() >= time) continue;
    groups.set(key, {
      key,
      bank,
      label: BANK_LABEL[bank] as string,
      account,
      balance: tx.balance,
      date: tx.date,
    });
  }

  const list = [...groups.values()].sort(
    (a, b) =>
      (BANK_ORDER[a.bank] as number) - (BANK_ORDER[b.bank] as number) ||
      new Date(b.date).getTime() - new Date(a.date).getTime(),
  );

  // Only spell out "··1234" when a bank genuinely has several accounts.
  const perBank = new Map<string, number>();
  for (const entry of list) perBank.set(entry.bank, (perBank.get(entry.bank) || 0) + 1);

  return list.map(entry => {
    if ((perBank.get(entry.bank) || 0) < 2 || !entry.account) return entry;
    return { ...entry, label: `${entry.label} ··${entry.account.replace(/\D/g, '').slice(-4)}` };
  });
}

export function parseSMS(
  body: string,
  sender: string,
  timestamp?: number,
  mappings: CategoryMappings = {},
): Transaction | null {
  const bodyLower = body.toLowerCase();
  const txKeywords = ['credit', 'debit', 'transfer', 'sent', 'received', 'paid', 'payment', 'deposit', 'withdraw', 'charge', 'deduct', 'purchase', 'bought', 'buy', 'ተቀናሽ', 'ገቢ', 'ወጪ', 'ታድሷል', 'ተሞልቷል', 'ወደ', 'ከ'];
  if (!txKeywords.some(kw => bodyLower.includes(kw))) {
    return null; // Ignore non-transaction messages like OTPs or promos
  }

  const ts = timestamp || Date.now();
  const dateStr = new Date(ts).toISOString();
  const type = detectType(body);
  const bank = detectBank(body, sender);

  // 1. TELEBIRR PARSING RULES
  if (bank === 'telebirr') {
    const balance = extractBalance(body);
    const amount = extractMainAmount(body, balance);
    if (amount <= 0) return null; // not a money movement (e.g. a data bundle notice)

    // Use the Transaction ID from the SMS if present; else generate a deterministic fallback
    const txIdRegex = /(?:Transaction\s*ID\s*[:\s]\s*(\w+))|(?:መለያው?\s*(\w+)\s*ነው)/i;
    const txIdMatch = body.match(txIdRegex);
    const txId = txIdMatch ? (txIdMatch[1] || txIdMatch[2]) : deterministicId('TB', body, ts);

    let description = 'Telebirr Transaction';
    if (type === 'debit') {
      const m = body.match(/(?:paid|payment|transfer|transferred|sent)\s*to\s*([^.]+?)(?=\s+on\s+|$)/i)
        || body.match(/(?:ወደ\s*([^.]+?)\s*(?:በ|$))/i);
      if (m) description = `Paid to ${m[1].trim()}`;
    } else {
      const m = body.match(/(?:received\s*from|credited\s*with[\s\S]*?from)\s*([^.]+?)(?=\s+on\s+|$)/i)
        || body.match(/(?:ከ\s*([^.]+?)\s*(?:በ|$))/i);
      if (m) description = `Received from ${m[1].trim()}`;
    }

    const rule = autoCategorize(description, type, mappings, body);
    return { id: txId, amount, type, date: dateStr, balance, description: rule.name || description, sender: 'telebirr', category: rule.category, isReviewed: false, isManual: false, rawMessage: body };
  }

  // 2. CBE PARSING RULES
  if (bank === 'cbe' || bank === 'cbe birr') {
    const balance = extractBalance(body);
    const amount = extractMainAmount(body, balance);
    if (amount <= 0) return null;

    // Prefer explicit Ref number; fallback to deterministic hash
    const refRegex = /(?:Ref\s*[:\s]\s*(\w+))|(?:ማጣቀሻ\s*[:\s]\s*(\w+))/i;
    const refMatch = body.match(refRegex);
    const refId = refMatch ? (refMatch[1] || refMatch[2]) : deterministicId('CBE', body, ts);

    // Identify the account this message belongs to (masked or plain).
    const acctMatch = body.match(/\baccount\s*(?:number)?\s*[:#]?\s*((?:[\d*]{2,}\*{2,}[\d*]{2,})|(?:[\d*]{6,}))/i);
    const acct = acctMatch?.[1];

    let description: string;
    if (acct) {
      // Using the account number keeps each account distinct in the ledger.
      description = type === 'debit' ? `Debit from Acc: ${acct}` : `Credit to Acc: ${acct}`;
    } else if (type === 'credit') {
      const fromMatch = body.match(/(?:received|credited)[\s\S]{0,30}?from\s+([A-Za-z][\w\s.'-]{1,40}?)(?=\s+on\b|\s*,|\s*\.|$)/i);
      description = fromMatch ? `Received from ${fromMatch[1].trim()}` : 'Credit to CBE';
    } else {
      const toMatch = body.match(/(?:paid|sent|transferred|debited)\s*(?:to)?\s+([A-Za-z][\w\s.'-]{1,40}?)(?=\s+on\b|\s*,|\s*\.|$)/i);
      description = toMatch ? `Paid to ${toMatch[1].trim()}` : 'Debit from CBE';
    }

    const rule = autoCategorize(description, type, mappings, body);
    return { id: refId, amount, type, date: dateStr, balance, description: rule.name || description, sender: bank, category: rule.category, isReviewed: false, isManual: false, rawMessage: body };
  }

  // 3. GENERIC FALLBACK PARSER
  // To avoid missing generic fallback cases, we do a quick check if there's any amount.
  const hasCurrency = /(?:ETB|Birr|ብር|USD|\$|Br\.?)/i.test(body);
  if (hasCurrency) {
    const balance = extractBalance(body);
    const amount = extractMainAmount(body, balance);
    if (amount > 0) {
      const refRegex = /(?:Ref(?:erence)?|TxID|Transaction|ID|ማጣቀሻ)\s*[:\s]\s*(\w+)/i;
      const refMatch = body.match(refRegex);
      const id = refMatch ? refMatch[1] : deterministicId('GEN', body, ts);

      const description = `SMS from ${sender}`;

      const rule = autoCategorize(description, type, mappings, body);
      return { id, amount, type, date: dateStr, balance, description: rule.name || description, sender, category: rule.category, isReviewed: false, isManual: false, rawMessage: body };
    }
  }

  return null;
}
