// MIZANE — Import sécurisé des relevés bancaires CSV et OFX.
const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
const round = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

function parseDate(value) {
  const raw = String(value || "").trim();
  let match = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) return validDate(match[1], match[2], match[3]);
  match = raw.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{2,4})$/);
  if (match) {
    const year = match[3].length === 2 ? "20" + match[3] : match[3];
    return validDate(year, match[2], match[1]);
  }
  match = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if (match) return validDate(match[1], match[2], match[3]);
  return null;
}
function validDate(year, month, day) {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null;
  return date.toISOString().slice(0, 10);
}
function parseAmount(value) {
  let raw = String(value ?? "").trim().replace(/[\s\u00a0\u202f]/g, "").replace(/[€$£]/g, "");
  if (!raw) return null;
  const negative = /^\(.*\)$/.test(raw) || raw.endsWith("-");
  raw = raw.replace(/[()]/g, "").replace(/-$/, "").replace(/^\+/, "");
  if (raw.includes(",") && raw.includes(".")) {
    if (raw.lastIndexOf(",") > raw.lastIndexOf(".")) raw = raw.replace(/\./g, "").replace(",", ".");
    else raw = raw.replace(/,/g, "");
  } else if (raw.includes(",")) {
    const parts = raw.split(",");
    raw = parts.length === 2 && parts[1].length <= 2 ? parts[0].replace(/\./g, "") + "." + parts[1] : parts.join("");
  } else if ((raw.match(/\./g) || []).length > 1) {
    const parts = raw.split(".");
    raw = parts.slice(0, -1).join("") + "." + parts.at(-1);
  }
  const amount = Number(raw);
  return Number.isFinite(amount) ? round(negative ? -Math.abs(amount) : amount) : null;
}
function splitCSVLine(line, delimiter) {
  const cells = [];
  let value = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && quoted && line[i + 1] === '"') { value += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { cells.push(value.trim()); value = ""; }
    else value += char;
  }
  cells.push(value.trim());
  return cells;
}
function detectDelimiter(line) {
  const candidates = [";", ",", "\t", "|"];
  return candidates.map(delimiter => ({ delimiter, count: splitCSVLine(line, delimiter).length }))
    .sort((a,b) => b.count-a.count)[0].delimiter;
}
function rowKey(line) {
  return line.fitId ? "FITID:" + line.fitId : [line.date, normalize(line.reference || ""), normalize(line.label), line.amount, line.currency || ""].join("|");
}
function deduplicate(lines) {
  const seen = new Set(), unique = [], duplicates = [];
  for (const line of lines) {
    const key = rowKey(line);
    if (seen.has(key)) duplicates.push(line);
    else { seen.add(key); unique.push(line); }
  }
  return { lines: unique, duplicates };
}
function parseCSV(text) {
  const rawLines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
  if (rawLines.length < 2) return { lines: [], errors: ["Le fichier CSV doit contenir un en-tête et au moins une opération."], format: "csv" };
  const delimiter = detectDelimiter(rawLines[0]);
  const headers = splitCSVLine(rawLines[0], delimiter).map(normalize);
  const find = names => headers.findIndex(header => names.includes(header));
  const dateIndex = find(["date","date operation","date valeur","date comptable","booking date","transaction date","dtposted"]);
  const labelIndex = find(["libelle","libelle operation","description","label","name","memo","communication","detail","details"]);
  const amountIndex = find(["montant","amount","transaction amount","sum"]);
  const debitIndex = find(["debit","debit amount","montant debit"]);
  const creditIndex = find(["credit","credit amount","montant credit"]);
  const referenceIndex = find(["reference","ref","reference operation","numero","n operation","fitid","id"]);
  const currencyIndex = find(["devise","currency","monnaie"]);
  if (dateIndex < 0 || labelIndex < 0 || (amountIndex < 0 && debitIndex < 0 && creditIndex < 0)) {
    return { lines: [], errors: ["Colonnes requises introuvables : date, libellé et montant (ou débit/crédit)."], format: "csv" };
  }
  const rows = [], errors = [];
  for (let i = 1; i < rawLines.length; i++) {
    const cells = splitCSVLine(rawLines[i], delimiter);
    const date = parseDate(cells[dateIndex]);
    const label = cells[labelIndex] || "";
    let amount = amountIndex >= 0 ? parseAmount(cells[amountIndex]) : null;
    if (amountIndex < 0) {
      const debit = debitIndex >= 0 ? parseAmount(cells[debitIndex]) : 0;
      const credit = creditIndex >= 0 ? parseAmount(cells[creditIndex]) : 0;
      amount = debit === null || credit === null ? null : round(Math.abs(credit) - Math.abs(debit));
    }
    if (!date || amount === null || amount === 0) {
      errors.push("Ligne " + (i + 1) + " ignorée : date ou montant invalide.");
      continue;
    }
    rows.push({ date, label, amount, reference: referenceIndex >= 0 ? cells[referenceIndex] || "" : "", currency: currencyIndex >= 0 ? String(cells[currencyIndex] || "").toUpperCase() : "", sourceRow: i + 1 });
  }
  const result = deduplicate(rows);
  return { ...result, errors, format: "csv" };
}
function parseOFX(text) {
  const source = String(text || "").replace(/^\uFEFF/, "");
  if (!/<OFX[\s>]/i.test(source)) return { lines: [], duplicates: [], errors: ["Le contenu ne semble pas être un fichier OFX valide."], format: "ofx" };
  const currency = source.match(/<CURDEF>\s*([^<\r\n]+)/i)?.[1]?.trim().toUpperCase() || "";
  const rows = [], errors = [];
  const blocks = source.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>|<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|$)/gi) || [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const get = tag => block.match(new RegExp("<" + tag + ">\\s*([^<\\r\\n]+)", "i"))?.[1]?.trim() || "";
    const date = parseDate(get("DTPOSTED"));
    const amount = parseAmount(get("TRNAMT"));
    const fitId = get("FITID");
    const label = get("NAME") || get("MEMO") || get("PAYEE") || "";
    if (!date || amount === null || amount === 0) { errors.push("Opération OFX " + (i + 1) + " ignorée : date ou montant invalide."); continue; }
    rows.push({ date, label, amount, reference: fitId, fitId, currency, transactionType: get("TRNTYPE"), sourceRow: i + 1 });
  }
  const result = deduplicate(rows);
  return { ...result, errors, format: "ofx" };
}
export function parseBankStatement(text, format = "auto") {
  const source = String(text || "");
  const selected = format === "auto" ? (/<OFX[\s>]/i.test(source) ? "ofx" : "csv") : format;
  if (selected === "ofx") return parseOFX(source);
  if (selected === "csv") return parseCSV(source);
  return { lines: [], duplicates: [], errors: ["Format non pris en charge. Utilisez CSV ou OFX."], format: selected };
}
export function bankStatementLineKey(line) {
  return rowKey(line);
}
