// MIZANE — Lecture PDF et rapprochement prudent des justificatifs.
const PDFJS_VERSION = "4.10.38";
const PDFJS_MODULE = "https://cdn.jsdelivr.net/npm/pdfjs-dist@" + PDFJS_VERSION + "/build/pdf.min.mjs";
const PDFJS_WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@" + PDFJS_VERSION + "/build/pdf.worker.min.mjs";
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 20;
const MAX_SCANNED_PAGES = 4;
const MAX_EXTRACTED_TEXT = 48000;
let pdfJsPromise = null;

export function isSupportedDocumentFile(file) {
  if (!file || typeof file !== "object") return false;
  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  return ["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(type) || name.endsWith(".pdf");
}

async function loadPdfJs() {
  if (!pdfJsPromise) pdfJsPromise = import(PDFJS_MODULE).then(pdfjs => {
    if (!pdfjs?.getDocument || !pdfjs?.GlobalWorkerOptions) throw new Error("Bibliothèque PDF indisponible.");
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return pdfjs;
  }).catch(error => {
    pdfJsPromise = null;
    throw new Error("Le lecteur PDF n’a pas pu être chargé. Vérifiez la connexion Internet puis réessayez. " + (error?.message || ""));
  });
  return pdfJsPromise;
}

async function renderPdfPage(page, maxDimension = 1400) {
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(1.5, maxDimension / Math.max(base.width, base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Rendu PDF impossible dans ce navigateur.");
  await page.render({ canvasContext: context, viewport }).promise;
  const dataUrl = canvas.toDataURL("image/jpeg", 0.76);
  canvas.width = 1;
  canvas.height = 1;
  return dataUrl;
}

export async function extractPdfDocument(file) {
  if (!file || !(file.type === "application/pdf" || String(file.name || "").toLowerCase().endsWith(".pdf"))) {
    throw new Error("Sélectionnez un fichier PDF.");
  }
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_PDF_BYTES) {
    throw new Error("Le PDF doit peser au maximum 20 Mo.");
  }
  const pdfjs = await loadPdfJs();
  let pdf;
  try {
    pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), useSystemFonts: true }).promise;
  } catch (error) {
    throw new Error("PDF illisible ou protégé : " + (error?.message || "lecture impossible."));
  }
  const pagesToRead = Math.min(Number(pdf.numPages) || 0, MAX_PDF_PAGES);
  const textPages = [];
  const images = [];
  const scannedPageNumbers = [];
  let truncatedText = false;
  for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = (content.items || []).map(item => typeof item.str === "string" ? item.str : "").filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    if (pageText.length >= 24) textPages.push("PAGE " + pageNumber + "\n" + pageText);
    else {
      scannedPageNumbers.push(pageNumber);
      if (images.length < MAX_SCANNED_PAGES) images.push(await renderPdfPage(page));
    }
  }
  const text = textPages.join("\n\n").slice(0, MAX_EXTRACTED_TEXT);
  truncatedText = textPages.join("\n\n").length > MAX_EXTRACTED_TEXT;
  if (!text && !images.length) throw new Error("Aucun texte ni contenu lisible n’a été trouvé dans ce PDF.");
  return {
    text,
    images,
    pageCount: Number(pdf.numPages) || pagesToRead,
    processedPages: pagesToRead,
    omittedPages: Math.max(0, (Number(pdf.numPages) || 0) - pagesToRead),
    scannedPages: scannedPageNumbers,
    omittedScannedPages: Math.max(0, scannedPageNumbers.length - images.length),
    truncatedText,
  };
}

const roundMoney = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokens = value => new Set(normalize(value).split(/\s+/).filter(word => word.length > 2));
function textSimilarity(left, right) {
  const a = tokens(left), b = tokens(right);
  if (!a.size || !b.size) return 0;
  let common = 0;
  for (const word of a) if (b.has(word)) common++;
  return Math.round(common / Math.max(a.size, b.size) * 20);
}
function dayDistance(left, right) {
  const a = Date.parse(left), b = Date.parse(right);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) / 86400000 : Infinity;
}
function validAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? roundMoney(number) : null;
}

export function documentFactsFromProposal(proposal, defaultCurrency = "") {
  const raw = proposal?.aiReview?.documentFacts || proposal?.documentFacts || {};
  const lineTotal = (proposal?.lines || []).reduce((sum, line) => sum + (Number(line?.debit) || 0), 0);
  const total = validAmount(raw.total ?? raw.amount) ?? validAmount(lineTotal);
  return {
    date: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || proposal?.date || "")) ? String(raw.date || proposal.date) : "",
    total,
    currency: String(raw.currency || defaultCurrency || "").trim().toUpperCase(),
    reference: String(raw.reference || proposal?.reference || "").trim(),
    counterparty: String(raw.counterparty || raw.supplier || raw.customer || "").trim(),
  };
}

function entryAmounts(entry, defaultCurrency) {
  const totals = new Map();
  for (const line of entry.lines || []) {
    const currency = String(line.currency || defaultCurrency || "").trim().toUpperCase();
    if (!currency) continue;
    totals.set(currency, roundMoney((totals.get(currency) || 0) + (Number(line.debit) || 0)));
  }
  return [...totals.entries()].map(([currency, amount]) => ({ currency, amount }));
}
function amountScore(expected, actual) {
  if (expected == null) return 0;
  const difference = Math.abs(expected - actual);
  if (difference <= 0.02) return 50;
  if (difference <= Math.max(0.05, expected * 0.01)) return 42;
  if (difference <= Math.max(0.1, expected * 0.02)) return 30;
  return -100;
}
function dateScore(days) {
  if (!Number.isFinite(days) || days > 45) return -100;
  return days <= 1 ? 25 : days <= 7 ? 20 : days <= 30 ? 12 : 5;
}
function matchReason(amount, days, similarity, currencyKnown, dateKnown) {
  const reasons = [];
  if (amount != null) reasons.push("montant compatible");
  if (Number.isFinite(days)) reasons.push("date à " + Math.round(days) + " jour(s)");
  if (similarity > 0) reasons.push("libellé ou référence similaire");
  if (!currencyKnown) reasons.push("devise non confirmée");
  if (!dateKnown) reasons.push("date non confirmée");
  return reasons.join(" · ");
}

export function matchDocumentToRecords(facts, store) {
  const total = validAmount(facts?.total);
  const currency = String(facts?.currency || "").trim().toUpperCase();
  const date = String(facts?.date || "");
  const searchText = [facts?.reference, facts?.counterparty].filter(Boolean).join(" ");
  const entryMatches = [];
  for (const entry of store?.entries || []) {
    if (entry.reversed || entry.reverseOf) continue;
    const days = date ? dayDistance(date, entry.date) : Infinity;
    if (Number.isFinite(days) && days > 45) continue;
    const amounts = entryAmounts(entry, store?.settings?.currency);
    const comparable = currency ? amounts.filter(item => item.currency === currency) : amounts.length === 1 ? amounts : [];
    if ((currency && amounts.length && !comparable.length) || (!currency && amounts.length > 1)) continue;
    const bestAmount = total == null ? 0 : Math.max(-100, ...comparable.map(item => amountScore(total, item.amount)));
    if (bestAmount < 0) continue;
    const label = [entry.reference, ...(entry.lines || []).flatMap(line => [line.label, line.third])].filter(Boolean).join(" ");
    const similarity = textSimilarity(searchText, label);
    const score = Math.max(0, bestAmount) + Math.max(0, dateScore(days)) + similarity - (currency ? 0 : 10) - (date ? 0 : 10);
    if (score < 35) continue;
    entryMatches.push({
      entryId: entry.id, date: entry.date, reference: entry.reference || "",
      amount: comparable.find(item => total != null && amountScore(total, item.amount) === bestAmount)?.amount ?? comparable[0]?.amount ?? null,
      currency: currency || comparable[0]?.currency || "", confidence: Math.min(99, score),
      reason: matchReason(total, days, similarity, Boolean(currency), Boolean(date)),
    });
  }
  entryMatches.sort((a, b) => b.confidence - a.confidence || Number(a.entryId) - Number(b.entryId));

  const bankMatches = [];
  for (const session of store?.settings?.bankReconciliations || []) {
    for (let lineIndex = 0; lineIndex < (session.lines || []).length; lineIndex++) {
      const line = session.lines[lineIndex];
      const lineCurrency = String(line.currency || "").trim().toUpperCase();
      if (currency && (!lineCurrency || lineCurrency !== currency)) continue;
      const days = date ? dayDistance(date, line.date) : Infinity;
      if (Number.isFinite(days) && days > 45) continue;
      const lineAmount = Math.abs(Number(line.amount) || 0);
      const amount = total == null ? 0 : amountScore(total, lineAmount);
      if (amount < 0 || (total == null && !searchText)) continue;
      const similarity = textSimilarity(searchText, line.label || "");
      const score = Math.max(0, amount) + Math.max(0, dateScore(days)) + similarity - (currency ? 0 : 10) - (date ? 0 : 10);
      if (score < 35) continue;
      bankMatches.push({
        sessionId: session.id || "", sourceFile: session.sourceFile || "Relevé bancaire",
        lineIndex, date: line.date, label: line.label || "", amount: lineAmount,
        currency: lineCurrency, status: line.status || "unmatched",
        matchedEntryIds: (line.matches || []).map(item => item.entryId).concat(line.match ? [line.match] : []),
        confidence: Math.min(99, score), reason: matchReason(total, days, similarity, Boolean(currency && lineCurrency), Boolean(date)),
      });
    }
  }
  bankMatches.sort((a, b) => b.confidence - a.confidence || a.date.localeCompare(b.date));
  return { entryMatches: entryMatches.slice(0, 5), bankMatches: bankMatches.slice(0, 5) };
}
