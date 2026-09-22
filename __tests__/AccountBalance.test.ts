import {
  parseSMS,
  detectBank,
  getAccountBalances,
  repairSenderFromBody,
  Transaction,
} from '../src/parser';

/** Build a transaction the way the real importer would, from an SMS. */
function txFrom(body: string, sender: string, date: string): Transaction {
  const tx = parseSMS(body, sender, new Date(date).getTime());
  if (!tx) throw new Error(`Message did not parse: ${body}`);
  return { ...tx, date: new Date(date).toISOString() };
}

describe('Bank classification', () => {
  test('127 is Telebirr, not CBE', () => {
    expect(detectBank('Your telebirr account transaction of ETB 50.00', '127')).toBe('telebirr');
  });

  test('a competitor name inside the body does not steal the sender ID', () => {
    // Telebirr alerts routinely name the counterparty ("payment to CBE Birr").
    expect(
      detectBank('Your telebirr account transaction of ETB 150.00 debit for payment to CBE Birr', 'telebirr'),
    ).toBe('telebirr');
  });

  test('an unnamed sender is classified from the body, first brand wins', () => {
    expect(detectBank('Your telebirr account has been debited. Transferred to CBE.', '')).toBe('telebirr');
    expect(detectBank('Commercial Bank of Ethiopia: ETB 100 debited. Balance ETB 50.', '')).toBe('cbe');
  });

  test('CBE Birr is never collapsed into CBE', () => {
    expect(detectBank('Your CBE Birr wallet has been debited', 'CBE Birr')).toBe('cbe birr');
    expect(detectBank('Your CBE Birr wallet has been debited', '')).toBe('cbe birr');
  });

  test('an unnamed sender is classified from the CBE branding in the alert', () => {
    const tx = parseSMS(
      'Commercial Bank of Ethiopia: ETB 500.00 has been debited to your account 1000******1234. Your current balance is ETB 10,500.50. Ref: FT1.',
      '847',
    );
    expect(tx?.sender).toBe('cbe');
  });

  test('an unidentifiable message is left unattributed rather than guessed', () => {
    // No branding and no known short code: better to show no card at all than
    // to attribute this balance to a bank we are only guessing at.
    const tx = parseSMS(
      'Dear customer, ETB 500.00 has been debited to your account 1000******1234. Your current balance is ETB 10,500.50. Ref: FT2612345678.',
      '9999',
    );
    expect(tx?.sender).toBe('9999');
    expect(getAccountBalances([{ ...tx!, date: new Date().toISOString() }])).toHaveLength(0);
  });

  test('the 127 short code still resolves to Telebirr when the body is silent', () => {
    const tx = parseSMS(
      'Dear customer, ETB 500.00 has been debited. Your current balance is ETB 10,500.50. Ref: FT2612345678.',
      '127',
    );
    expect(tx?.sender).toBe('telebirr');
  });
});

describe('Repairing stored labels from the body', () => {
  test('a Telebirr alert misfiled under CBE is corrected', () => {
    const body =
      'Your telebirr account transaction of ETB 150.00 debit for payment to CBE Birr. Your current balance is ETB 1,000.50. Transaction ID: TX1.';
    expect(repairSenderFromBody(body, 'cbe')).toBe('telebirr');
    expect(repairSenderFromBody(body, 'cbe birr')).toBe('telebirr');
  });

  test('a genuine CBE alert naming Telebirr as the payee is left alone', () => {
    const body =
      'Commercial Bank of Ethiopia: ETB 500.00 has been debited to your account 1000******1234 and sent to Telebirr 0911223344. Your current balance is ETB 10,500.50. Ref: FT1.';
    expect(repairSenderFromBody(body, 'cbe')).toBeNull();
  });

  test('already-correct labels and manual entries are untouched', () => {
    expect(repairSenderFromBody('Your telebirr account was debited.', 'telebirr')).toBeNull();
    expect(repairSenderFromBody(undefined, 'cbe')).toBeNull();
    // A body that owns no brand must not be guessed at.
    expect(repairSenderFromBody('ETB 500.00 debited. Balance ETB 10,500.50.', 'cbe')).toBeNull();
  });
});

describe('Account balances come from the right message', () => {
  const cbeMsg = (ref: string, amount: number, balance: number, date: string, acct = '1000******1234') =>
    txFrom(
      `Dear customer, ETB ${amount}.00 has been debited to your account ${acct}. Your current balance is ETB ${balance}. Ref: ${ref}.`,
      'CBE',
      date,
    );

  const telebirrMsg = (id: string, amount: number, balance: number, date: string) =>
    txFrom(
      `Your telebirr account transaction of ETB ${amount}.00 debit. Your current balance is ETB ${balance}. Transaction ID: ${id}.`,
      'telebirr',
      date,
    );

  test('a newer Telebirr message never supplies the CBE balance', () => {
    const transactions = [
      telebirrMsg('TX1', 100, 900, '2026-08-03T10:00:00Z'), // newest overall
      cbeMsg('FT1', 500, 10500.5, '2026-08-01T12:30:00Z'),
    ];

    const balances = getAccountBalances(transactions);

    expect(balances.find(b => b.bank === 'cbe')?.balance).toBe(10500.5);
    expect(balances.find(b => b.bank === 'telebirr')?.balance).toBe(900);
  });

  test('a message without a balance does not clobber the last reading', () => {
    const noBalance = parseSMS(
      'Dear customer, ETB 200.00 has been debited to your account 1000******1234. Ref: FT2.',
      'CBE',
      new Date('2026-08-04T09:00:00Z').getTime(),
    )!;

    const balances = getAccountBalances([
      { ...noBalance, date: new Date('2026-08-04T09:00:00Z').toISOString() },
      cbeMsg('FT1', 500, 10500.5, '2026-08-01T12:30:00Z'),
    ]);

    expect(balances).toHaveLength(1);
    expect(balances[0].balance).toBe(10500.5);
  });

  test('a Telebirr message from 127 cannot land in the CBE card', () => {
    const balances = getAccountBalances([
      txFrom(
        'Your telebirr account transaction of ETB 30.00 debit for payment to CBE Birr. Your current balance is ETB 770.00. Transaction ID: TX9.',
        '127',
        '2026-08-05T08:00:00Z',
      ),
      cbeMsg('FT1', 500, 9999, '2026-08-01T12:30:00Z'),
    ]);

    expect(balances.map(b => b.bank).sort()).toEqual(['cbe', 'telebirr']);
    expect(balances.find(b => b.bank === 'cbe')?.balance).toBe(9999);
  });

  test('two CBE accounts keep two separate readings', () => {
    const balances = getAccountBalances([
      cbeMsg('FT1', 500, 10500, '2026-08-01T12:30:00Z', '1000******1234'),
      cbeMsg('FT2', 100, 2500, '2026-08-02T12:30:00Z', '2000******5678'),
      cbeMsg('FT3', 50, 10450, '2026-08-03T12:30:00Z', '1000******1234'),
    ]);

    expect(balances).toHaveLength(2);
    // Each account reports its own most recent reading, not the newest message.
    expect(balances.find(b => b.account === '1000******1234')?.balance).toBe(10450);
    expect(balances.find(b => b.account === '2000******5678')?.balance).toBe(2500);
    // Labels disambiguate once a bank has more than one account.
    expect(balances.every(b => b.label.startsWith('CBE ··'))).toBe(true);
  });

  test('manual transactions and zero balances are ignored', () => {
    const manual: Transaction = {
      ...cbeMsg('FT1', 500, 10500, '2026-08-01T12:30:00Z'),
      isManual: true,
    };
    const zero = { ...cbeMsg('FT2', 10, 0, '2026-08-09T12:30:00Z') };

    expect(getAccountBalances([manual, zero])).toHaveLength(0);
  });
});
