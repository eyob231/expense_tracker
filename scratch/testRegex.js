const body = "Dear EYOB, your CBE Birr account has been credited with 10.00Br. from Eyob Solomon Bahita on 02/08/26 11:17,Txn ID DH251K45XQL. Your balance is 38.84Br. Thank you!";
const balanceRegex = /(?:balance\s*(?:is)?\s*(?:ETB|Birr|ብር)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?))|(?:ቀሪ\s*ሂሳብዎ?\s*(?:ETB|Birr|ብር)?\s*(\d+(?:,\d{3})*(?:\.\d{2})?))/i;
const match = body.match(balanceRegex);
console.log('Match:', match);
