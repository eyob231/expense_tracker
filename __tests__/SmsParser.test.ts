import { parseSMS } from '../src/parser';

describe('SMS Parsing Engine Tests', () => {
  
  test('Parses English Telebirr Debit SMS correctly', () => {
    const smsBody = 'Your telebirr account transaction of ETB 150.00 debit for payment to CBE Birr on 2026-08-01 16:15:33. Your current balance is ETB 1,000.50. Transaction ID: TX2608010015.';
    const tx = parseSMS(smsBody, 'telebirr');
    
    expect(tx).not.toBeNull();
    if (tx) {
      expect(tx.amount).toBe(150.00);
      expect(tx.type).toBe('debit');
      expect(tx.balance).toBe(1000.50);
      expect(tx.id).toBe('TX2608010015');
      expect(tx.description).toBe('Paid to CBE Birr');
      expect(tx.category).toBe('UPI Transfers');
    }
  });

  test('Parses Amharic Telebirr Debit SMS correctly', () => {
    const smsBody = 'የTelebirr ሂሳብዎ በ 2026-08-01 16:15:33 በ ወጪ በ ETB 50.00 ተቀናሽ ሆኗል። ቀሪ ሂሳብዎ ETB 700.25 ነው። የግብይት መለያው TX2608010015 ነው።';
    const tx = parseSMS(smsBody, '8036');
    
    expect(tx).not.toBeNull();
    if (tx) {
      expect(tx.amount).toBe(50.00);
      expect(tx.type).toBe('debit');
      expect(tx.balance).toBe(700.25);
      expect(tx.id).toBe('TX2608010015');
    }
  });

  test('Parses English Telebirr Credit SMS correctly', () => {
    const smsBody = 'Your telebirr account has been credited with ETB 200.00 from 0911223344 on 2026-08-01 16:00:12. Your current balance is ETB 750.25. Transaction ID: TX2608010012.';
    const tx = parseSMS(smsBody, 'telebirr');
    
    expect(tx).not.toBeNull();
    if (tx) {
      expect(tx.amount).toBe(200.00);
      expect(tx.type).toBe('credit');
      expect(tx.balance).toBe(750.25);
      expect(tx.id).toBe('TX2608010012');
      expect(tx.description).toBe('Received from 0911223344');
    }
  });

  test('Parses English CBE Debit SMS correctly', () => {
    const smsBody = 'Dear customer, ETB 500.00 has been debited to your account 1000******1234 on 01-08-2026 12:30 PM. Your current balance is ETB 10,500.50. Ref: FT2612345678.';
    const tx = parseSMS(smsBody, 'CBE');
    
    expect(tx).not.toBeNull();
    if (tx) {
      expect(tx.amount).toBe(500.00);
      expect(tx.type).toBe('debit');
      expect(tx.balance).toBe(10500.50);
      expect(tx.id).toBe('FT2612345678');
      expect(tx.description).toBe('Debit from Acc: 1000******1234');
    }
  });

  test('Parses English CBE Credit SMS correctly', () => {
    const smsBody = 'Dear customer, ETB 20,000.00 has been credited to your account 1000******1234 on 01-08-2026 09:15 AM. Your current balance is ETB 30,500.50. Ref: FT2698765432.';
    const tx = parseSMS(smsBody, 'CBE');
    
    expect(tx).not.toBeNull();
    if (tx) {
      expect(tx.amount).toBe(20000.00);
      expect(tx.type).toBe('credit');
      expect(tx.balance).toBe(30500.50);
      expect(tx.id).toBe('FT2698765432');
      expect(tx.description).toBe('Credit to Acc: 1000******1234');
    }
  });

  test('Fallback parser parses unknown format correctly', () => {
    const smsBody = 'Alert: Account *999 received deposit of Birr 100.50. Reference: RF9876. New Bal: Birr 400.00';
    const tx = parseSMS(smsBody, 'UNKNOWN_BANK');
    
    expect(tx).not.toBeNull();
    if (tx) {
      expect(tx.amount).toBe(100.50);
      expect(tx.type).toBe('credit');
      expect(tx.id).toBe('RF9876');
      expect(tx.balance).toBe(400.00);
    }
  });
});
