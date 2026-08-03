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

const CATEGORY_KEYWORDS: { [key in Category]: string[] } = {
  'Food & Dining': ['swiggy', 'zomato', 'restaurant', 'cafe', 'food', 'pizza', 'burger', 'eats', 'sheger', 'yene', 'hotel', 'grocery', 'supermarket'],
  'Shopping': ['sheger', 'amazon', 'shein', 'boutique', 'mall', 'clothing', 'shoes', 'electronics', 'gift', 'market', 'store', 'shop'],
  'Transportation': ['uber', 'ride', 'taxi', 'fuel', 'petrol', 'gas', 'metro', 'bus', 'train', 'flight', 'ticket', 'oil', 'garage', 'fano', 'yego'],
  'Salary': ['salary', 'wage', 'payroll', 'freelance', 'bonus', 'commission', 'allowance', 'dividend'],
  'UPI Transfers': ['transfer', 'p2p', 'send to', 'received from', 'sent to', 'pay to', 'paid to', 'cbe birr', 'telebirr', 'ከ', 'ወደ', 'ማስተላለፍ'],
  'Other': []
};

export function autoCategorize(description: string, type: 'credit' | 'debit', mappings: Record<string, { category: Category; name?: string }> = {}): { category: Category; name?: string } {
  const descLower = description.toLowerCase();
  
  // 1. Check user mappings first
  for (const [keyword, rule] of Object.entries(mappings)) {
    if (descLower.includes(keyword)) {
      return rule;
    }
  }

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

  if (bestCategory === 'Other') {
    if (descLower.includes('transfer') || descLower.includes('sent to') || descLower.includes('received from') || descLower.includes('p2p') || descLower.includes('ወደ') || descLower.includes('ከ')) {
      return { category: 'UPI Transfers' };
    }
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

// Helper to parse all amounts in the text and return the best transaction amount
function extractMainAmount(body: string, balanceAmount: number): number {
  // Match both 'ETB 1000', '1000 ETB', and '10.00Br.'
  const amountRegex = /(?:(?:ETB|Birr|ብር|USD|\$|Br\.?)\s*(\d+(?:,\d{3})*(?:\.\d{2})?))|(?:(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:ETB|Birr|ብር|USD|\$|Br\.?))/gi;
  let match;
  let amounts: number[] = [];
  
  while ((match = amountRegex.exec(body)) !== null) {
    const val = parseAmount(match[1] || match[2]);
    if (val > 0) amounts.push(val);
  }

  // Filter out the balance if it was captured
  let validAmounts = amounts.filter(a => Math.abs(a - balanceAmount) > 0.01);
  
  // If no valid amounts left, maybe the balance was the only amount (shouldn't happen for tx)
  if (validAmounts.length === 0 && amounts.length > 0) validAmounts = amounts;

  // The main transaction amount is usually the largest number (VAT/fees are smaller)
  return validAmounts.length > 0 ? Math.max(...validAmounts) : 0;
}

export function parseSMS(body: string, sender: string, timestamp?: number, mappings: Record<string, { category: Category; name?: string }> = {}): Transaction | null {
  const bodyLower = body.toLowerCase();
  const txKeywords = ['credit', 'debit', 'transfer', 'sent', 'received', 'paid', 'payment', 'deposit', 'withdraw', 'charge', 'deduct', 'ገቢ', 'ወጪ', 'ታድሷል', 'ተሞልቷል'];
  if (!txKeywords.some(kw => bodyLower.includes(kw))) {
    return null; // Ignore non-transaction messages like OTPs or promos
  }

  const senderLower = sender.toLowerCase();
  const ts = timestamp || Date.now();
  const dateStr = new Date(ts).toISOString();

  // 1. TELEBIRR PARSING RULES
  if (senderLower.includes('telebirr') || senderLower.includes('8036')) {
    // Debit keywords take priority: transferred/transfer/sent/paid/payment/withdraw/charge/deducted
    const isDebit = /\b(transferred|transfer(?:\s+to)?|sent|paid|payment|withdraw|charge|deducted|ወጪ)\b/i.test(body)
      || body.includes('ወጪ');
    // Credit keywords: received/credited/deposited/credit/ታድሷል/ተሞልቷ
    const isCredit = !isDebit && (
      /\b(received|credited|credit|deposited)\b/i.test(body)
      || body.includes('ገቢ') || body.includes('ታድሷል') || body.includes('ተሞልቷል')
    );
    const type: 'credit' | 'debit' = isCredit ? 'credit' : 'debit';

    const balanceRegex = /(?:balance\s*(?:is)?\s*(?:ETB|Birr|ብር|Br\.?)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?))|(?:ቀሪ\s*ሂሳብዎ?\s*(?:ETB|Birr|ብር|Br\.?)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?))/i;
    const balanceMatch = body.match(balanceRegex);
    const balance = balanceMatch ? parseAmount(balanceMatch[1] || balanceMatch[2]) : 0;

    const amount = extractMainAmount(body, balance);

    // Use the Transaction ID from the SMS if present; else generate a deterministic fallback
    const txIdRegex = /(?:Transaction\s*ID\s*[:\s]\s*(\w+))|(?:መለያው?\s*(\w+)\s*ነው)/i;
    const txIdMatch = body.match(txIdRegex);
    const txId = txIdMatch ? (txIdMatch[1] || txIdMatch[2]) : deterministicId('TB', body, ts);

    let description = 'Telebirr Transaction';
    if (type === 'debit') {
      const m = body.match(/(?:payment\s*to|transfer\s*to|sent\s*to)\s*([^.]+?)(?=\s+on\s+|$)/i)
        || body.match(/(?:ወደ\s*([^.]+?)\s*(?:በ|$))/i);
      if (m) description = `Paid to ${m[1].trim()}`;
    } else {
      const m = body.match(/(?:received\s*from|credited\s*with.*from)\s*([^.]+?)(?=\s+on\s+|$)/i)
        || body.match(/(?:ከ\s*([^.]+?)\s*(?:በ|$))/i);
      if (m) description = `Received from ${m[1].trim()}`;
    }

    const rule = autoCategorize(description, type, mappings);
    return { id: txId, amount, type, date: dateStr, balance, description: rule.name || description, sender: 'telebirr', category: rule.category, isReviewed: false, isManual: false, rawMessage: body };
  }

  // 2. CBE PARSING RULES
  if (senderLower.includes('cbe') || senderLower.includes('cbebirr') || senderLower.includes('cbe_birr') || senderLower === '127') {
    // Debit keywords take priority
    const isDebit = /\b(transferred|transfer(?:\s+to)?|sent|paid|payment|withdraw|charge|deducted|ወጪ)\b/i.test(body)
      || body.includes('ወጪ');
    // Credit keywords
    const isCredit = !isDebit && (
      /\b(received|credited|credit|deposited)\b/i.test(body)
      || body.includes('ገቢ')
    );
    const type: 'credit' | 'debit' = isCredit ? 'credit' : 'debit';

    const balanceRegex = /(?:balance\s*(?:is)?\s*(?:ETB|Birr|ብር)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?))|(?:ቀሪ\s*ሂሳብዎ?\s*(?:ETB|Birr|ብር)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?))/i;
    const balanceMatch = body.match(balanceRegex);
    const balance = balanceMatch ? parseAmount(balanceMatch[1] || balanceMatch[2]) : 0;

    const amount = extractMainAmount(body, balance);

    // Prefer explicit Ref number; fallback to deterministic hash
    const refRegex = /(?:Ref\s*[:\s]\s*(\w+))|(?:ማጣቀሻ\s*[:\s]\s*(\w+))/i;
    const refMatch = body.match(refRegex);
    const refId = refMatch ? (refMatch[1] || refMatch[2]) : deterministicId('CBE', body, ts);

    let description = type === 'debit' ? `Debit from CBE` : `Credit to CBE`;
    
    // Try to extract sender/recipient name for CBE Birr transfers
    if (type === 'credit') {
      const fromMatch = body.match(/from\s+([A-Za-z\s]+)\s+on/i) || body.match(/from\s+([A-Za-z\s]+)\s*,/i);
      if (fromMatch) description = `Received from ${fromMatch[1].trim()}`;
    } else {
      const toMatch = body.match(/to\s+([A-Za-z\s]+)\s+on/i) || body.match(/to\s+([A-Za-z\s]+)\s*,/i);
      if (toMatch) description = `Sent to ${toMatch[1].trim()}`;
    }

    const rule = autoCategorize(description, type, mappings);
    return { id: refId, amount, type, date: dateStr, balance, description: rule.name || description, sender: senderLower.includes('cbebirr') || senderLower.includes('cbe_birr') ? 'cbe birr' : 'cbe', category: rule.category, isReviewed: false, isManual: false, rawMessage: body };
  }

  // 3. GENERIC FALLBACK PARSER
  // To avoid missing generic fallback cases, we do a quick check if there's any amount.
  const hasCurrency = /(?:ETB|Birr|ብር|USD|\$|Br\.?)/i.test(body);
  if (hasCurrency) {
    const balanceRegex = /(?:balance|bal|ቀሪ\s*ሂሳብ)\s*(?:is|:|፡)?\s*(?:ETB|Birr|USD|Br\.?)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/i;
    const balanceMatch = body.match(balanceRegex);
    const balance = balanceMatch ? parseAmount(balanceMatch[1]) : 0;
    
    const amount = extractMainAmount(body, balance);
    if (amount > 0) {
      // Debit keywords take priority
      const isDebit = /\b(transferred|transfer(?:\s+to)?|sent|paid|payment|withdraw|charge|deducted)\b/i.test(body)
        || body.includes('ወጪ');
      // Credit keywords
      const isCredit = !isDebit && (
        /\b(received|credited|credit|deposited)\b/i.test(body)
        || body.includes('ገቢ') || body.includes('ታድሷል')
      );
      const type: 'credit' | 'debit' = isCredit ? 'credit' : 'debit';

      const refRegex = /(?:Ref(?:erence)?|TxID|Transaction|ID|ማጣቀሻ)\s*[:\s]\s*(\w+)/i;
      const refMatch = body.match(refRegex);
      const id = refMatch ? refMatch[1] : deterministicId('GEN', body, ts);

      const description = `SMS from ${sender}`;

      const rule = autoCategorize(description, type, mappings);
      return { id, amount, type, date: dateStr, balance, description: rule.name || description, sender, category: rule.category, isReviewed: false, isManual: false, rawMessage: body };
    }
  }

  return null;
}
