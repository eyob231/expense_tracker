import {
  autoCategorize,
  extractCounterparty,
  getFrequentAccounts,
  parseSMS,
  Transaction,
} from '../src/parser';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: 'x',
    amount: 10,
    type: 'debit',
    date: new Date().toISOString(),
    balance: 0,
    description: 'Paid to Someone',
    sender: 'telebirr',
    category: 'Other',
    isReviewed: false,
    isManual: false,
    ...partial,
  };
}

describe('Rule engine', () => {
  test('user rules match the raw SMS body, not just the description', () => {
    const mappings = { '0911223344': { category: 'Salary' as const } };
    const rule = autoCategorize(
      'Paid to CBE Birr',
      'debit',
      mappings,
      'You have transferred ETB 100 to 0911223344 on 01-08-2026.',
    );
    expect(rule.category).toBe('Salary');
  });

  test('the most specific (longest) matching rule wins', () => {
    const mappings = {
      uber: { category: 'Transportation' as const },
      'uber eats': { category: 'Food & Dining' as const },
    };
    const rule = autoCategorize('Paid to Uber Eats', 'debit', mappings);
    expect(rule.category).toBe('Food & Dining');
  });

  test('built-in categorization still runs when no rule matches', () => {
    const rule = autoCategorize('Paid to CBE Birr', 'debit');
    expect(rule.category).toBe('UPI Transfers');
  });
});

describe('extractCounterparty', () => {
  test('pulls an Ethiopian phone number', () => {
    expect(
      extractCounterparty('credited with ETB 200.00 from 0911223344 on 01-08-2026', 'Received from 0911223344'),
    ).toBe('0911223344');
  });

  test('pulls a masked account number', () => {
    expect(
      extractCounterparty(undefined, 'Debit from Acc: 1000******1234'),
    ).toBe('1000******1234');
  });

  test('falls back to the named payee', () => {
    expect(extractCounterparty(undefined, 'Paid to Eyob')).toBe('Eyob');
  });

  test('returns null when nothing identifiable is present', () => {
    expect(extractCounterparty(undefined, 'SMS from UNKNOWN')).toBeNull();
  });
});

describe('getFrequentAccounts', () => {
  test('aggregates by counterparty and sorts by frequency', () => {
    const accounts = getFrequentAccounts([
      tx({ id: '1', rawMessage: 'to 0911223344', description: 'Paid to 0911223344' }),
      tx({ id: '2', rawMessage: 'to 0911223344', description: 'Paid to 0911223344', amount: 50 }),
      tx({ id: '3', rawMessage: 'to 0912000000', description: 'Paid to 0912000000' }),
    ]);

    expect(accounts).toHaveLength(2);
    expect(accounts[0].key).toBe('0911223344');
    expect(accounts[0].count).toBe(2);
    expect(accounts[0].total).toBe(60);
    expect([...accounts[0].txIds].sort()).toEqual(['1', '2']);
  });

  test('ignores manual transactions', () => {
    const accounts = getFrequentAccounts([
      tx({ id: '1', isManual: true, rawMessage: 'to 0911223344', description: 'Paid to 0911223344' }),
    ]);
    expect(accounts).toHaveLength(0);
  });
});

describe('Rules applied during parsing', () => {
  test('a rule for a frequent account renames and categorizes the transaction', () => {
    const mappings = { '0911223344': { category: 'Salary' as const, name: 'Mom' } };
    const parsed = parseSMS(
      'Your telebirr account has been credited with ETB 200.00 from 0911223344 on 2026-08-01 16:00:12. Your current balance is ETB 750.25. Transaction ID: TX2608010012.',
      'telebirr',
      undefined,
      mappings,
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.description).toBe('Mom');
    expect(parsed?.category).toBe('Salary');
  });
});
