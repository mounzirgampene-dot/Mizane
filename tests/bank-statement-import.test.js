import assert from "node:assert/strict";
import { parseBankStatement, bankStatementLineKey } from "../js/bank-statement-import.js";

const csv = `Date;Libellé;Montant;Référence;Devise
26/11/2026;"Virement client; facture 18";1 250,50;VIR-18;MAD
2026-11-27;Paiement fournisseur;-250.00;PAY-4;MAD
2026-11-27;Paiement fournisseur;-250.00;PAY-4;MAD
31/02/2026;Date impossible;10;BAD;MAD
`;
const parsed = parseBankStatement(csv);
assert.equal(parsed.format, "csv");
assert.equal(parsed.lines.length, 2);
assert.equal(parsed.lines[0].date, "2026-11-26");
assert.equal(parsed.lines[0].label, "Virement client; facture 18");
assert.equal(parsed.lines[0].amount, 1250.5);
assert.equal(parsed.lines[1].amount, -250);
assert.equal(parsed.duplicates.length, 1);
assert.equal(parsed.errors.length, 1);
assert.equal(bankStatementLineKey(parsed.lines[0]), bankStatementLineKey(parsed.lines[0]));

const debitCredit = parseBankStatement("Date,Description,Debit,Credit\n2026-11-26,Frais,12.50,\n2026-11-27,Virement,,1000.00");
assert.deepEqual(debitCredit.lines.map(line=>line.amount),[-12.5,1000]);

const ofx = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>MAD</CURDEF><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261125120000<TRNAMT>-45.90<FITID>TX-001<NAME>Frais bancaires
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261126120000<TRNAMT>2500.00<FITID>TX-002<NAME>Virement reçu
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
const ofxParsed = parseBankStatement(ofx);
assert.equal(ofxParsed.format, "ofx");
assert.equal(ofxParsed.lines.length, 2);
assert.equal(ofxParsed.lines[0].amount, -45.9);
assert.equal(ofxParsed.lines[1].amount, 2500);
assert.equal(ofxParsed.lines[1].currency, "MAD");
assert.equal(ofxParsed.lines[1].fitId, "TX-002");

const repeatedFit = parseBankStatement(ofx.replace("TX-002", "TX-001"));
assert.equal(repeatedFit.lines.length, 1);
assert.equal(repeatedFit.duplicates.length, 1);

assert.equal(parseBankStatement("Date;Montant\n2026-11-26;100").errors.length, 1);
console.log("✓ Import relevés : CSV/OFX, dates, montants localisés, débits/crédits, identifiants FITID et doublons.");
