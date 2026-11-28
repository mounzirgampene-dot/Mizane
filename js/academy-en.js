// MIZANE — English Academy curriculum (offline-first, editorially maintained).
export const ACADEMY_EN = {
  start: {
    title:"Getting started with MIZANE",
    description:"Understand the workspace, navigation and core working principles.",
    lessons:[
      ["Discover the workspace","MIZANE brings accounting, commercial and management functions together in an organized workspace. Before entering anything, check the active company, country, currency and fiscal year."],
      ["Navigate the sections","The navigation opens the different modules. The dashboard provides an overview, while specialized sections let you enter, review and consult transactions."],
      ["Follow a reliable workflow","Work in sequence: prepare supporting documents, enter transactions, check them, approve them and then review the reports. Never confuse fictional demo data with real records."]
    ],
    quiz:[
      {question:"What should you check before entering your first transaction?",options:["The company, country, currency and fiscal year","The screen color","The number of open tabs"],explanation:"These settings determine the working context and the rules suggested by the application."},
      {question:"Which workflow is the safest?",options:["Approve first, then look for documents","Prepare, enter, review and approve","Export without checking"],explanation:"Preparation and review must take place before approval."}
    ]
  },
  company: {
    title:"Company configuration",
    description:"Set the accounting context and protect the company workspace.",
    lessons:[
      ["Company identity and jurisdiction","Enter the legal name, country and reference contact details. The country guides the suggested accounting framework; it does not replace checking the regulations that apply."],
      ["Fiscal year and currency","Check the fiscal-year start and end dates, accounting currency and conversion settings. A comparison is meaningful only when its periods and currencies are consistent."],
      ["Access and responsibilities","Assign roles according to actual responsibilities. The principle of least privilege limits each user to the actions they need; read-only profiles should not receive data-entry rights."]
    ],
    quiz:[
      {question:"What is the main purpose of the configured country?",options:["To guide the accounting framework and regulatory context","To choose the dashboard color","To create journal entries automatically"],explanation:"The country helps suggest an appropriate framework, which must still be verified."},
      {question:"Which principle should guide role assignment?",options:["Give everyone every permission","Least privilege","Use one shared account"],explanation:"Each profile should receive only the permissions required for its responsibilities."}
    ]
  },
  accounting: {
    title:"General accounting",
    description:"Master supporting documents, journals, entries and essential controls.",
    lessons:[
      ["Prepare supporting documents","Every journal entry should be based on an identifiable document: an invoice, receipt, statement or authorized internal record. Note its date, reference, third party and amount before entering it."],
      ["Build a journal entry","Choose the appropriate journal and accounts, then enter descriptions and amounts. Total debits must equal total credits; also check the accounting period and linked document."],
      ["Review and consult","After approval, consult the journal, general ledger and trial balance. Look for suspense accounts, unusual balances, duplicates and missing documents before producing reports."]
    ],
    quiz:[
      {question:"Which equality must a balanced journal entry satisfy?",options:["Debit = credit","Assets = revenue","VAT = profit"],explanation:"Equal debits and credits are the fundamental balance check."},
      {question:"What normally supports an accounting transaction?",options:["An identifiable supporting document","An assumption","An unrecorded verbal comment"],explanation:"Traceability requires a retained and identifiable supporting document."}
    ]
  },
  commercial: {
    title:"Commercial management",
    description:"Manage customers, suppliers, sales, purchases and commercial documents.",
    lessons:[
      ["Identify business partners","Create or select the correct customer or supplier. Check the legal name, contact details, relevant tax references and associated control accounts."],
      ["Review invoices and purchases","Before approval, check line items, quantities, unit prices, discounts, taxes, currency, due dates and attachments. Distinguish drafts, approved documents, credit notes and payments."],
      ["Connect commerce and accounting","Review generated journal entries, third-party accounts and any stock movements. An invoice alone does not prove that payment was made or goods were delivered."]
    ],
    quiz:[
      {question:"Before approving an invoice, what should you check?",options:["Quantities and unit prices","Only the title","Only the document color"],explanation:"Line items and their parameters determine amounts and taxes."},
      {question:"Does an issued invoice automatically prove payment?",options:["Yes, always","No, payment must be tracked separately","Only if it is printed"],explanation:"Invoicing and cash collection are two distinct events."}
    ]
  },
  stock: {
    title:"Inventory management",
    description:"Understand items, warehouses, movements, reservations and stock counts.",
    lessons:[
      ["Configure inventory items","Distinguish physical goods from services. Check the base unit, conversions, warehouse and tracking method: none, batch or serial number."],
      ["Track inventory movements","Receipts, issues, transfers, adjustments and reservations must have a documented origin. Check the item, warehouse, quantity, unit and link to the invoice or order."],
      ["Count and value inventory","Compare the physical count with theoretical stock, explain every discrepancy and obtain approval for adjustments. Check the valuation method and FIFO layers or weighted average cost according to the configuration."]
    ],
    quiz:[
      {question:"An item tracked by serial number requires…",options:["An individually traceable identifier","Only an aggregate quantity","No additional checks"],explanation:"Each tracked unit must retain its identity and history."},
      {question:"What should you do with a stock-count discrepancy?",options:["Correct it without supporting evidence","Explain it and obtain approval","Always ignore it"],explanation:"A discrepancy must be documented before any adjustment."}
    ]
  },
  treasury: {
    title:"Cash management and reconciliation",
    description:"Track cash flows, due dates, banks and forecasts.",
    lessons:[
      ["Track receipts and payments","Record every payment with its date, method, reference and allocation. Distinguish partial payments, advances, refunds and offsets."],
      ["Reconcile bank statements","Import or review the bank statement, identify matching transactions and examine outstanding items. Do not force a match when dates or amounts differ."],
      ["Forecast cash flows","Build a forecast from available balances, receivables, payables and expected due dates. Separate confirmed cash flows from estimates and update assumptions."]
    ],
    quiz:[
      {question:"A bank reconciliation should be based on…",options:["Verifiable transactions and references","An assumed equality","Only today's date"],explanation:"Reconciliation links accounting transactions to movements shown on the bank statement."},
      {question:"A cash-flow forecast should distinguish…",options:["Confirmed cash flows and estimates","Customers and colors","Entries and users"],explanation:"Assumptions must remain visible and open to revision."}
    ]
  },
  analytics: {
    title:"Management accounting",
    description:"Structure dimensions, projects, costs and budgets to support decisions.",
    lessons:[
      ["Define analytical dimensions","Choose dimensions that support management: department, activity, project, site or responsibility center. Avoid multiplying dimensions without a clear management objective."],
      ["Allocate expenses and revenue","Define consistent, documented allocation rules. Allocation keys should reflect a reasonable economic relationship and be applied consistently."],
      ["Compare budget and actual results","Analyze variances in value and percentage, identify their causes, and distinguish volume, price and timing effects. A variance should lead to an explanation, not an automatic conclusion."]
    ],
    quiz:[
      {question:"An analytical dimension should be selected according to…",options:["A genuine management need","The maximum number of fields","An aesthetic preference"],explanation:"A useful dimension supports a decision or clarifies responsibility."},
      {question:"What should variance analysis begin with?",options:["Finding the causes","Immediate punishment","Deleting the data"],explanation:"Understand the contributing factors before drawing conclusions."}
    ]
  },
  management: {
    title:"Financial management",
    description:"Read statements, indicators, margins, budgets and financing needs.",
    lessons:[
      ["Read financial statements","The balance sheet shows a position at a specific date; the income statement measures performance over a period. Check the accounting framework, period and consistency of balances."],
      ["Understand financial balances","Working capital, working capital requirements and net cash position help explain how the operating cycle is financed. Interpret them together and over time."],
      ["Turn figures into decisions","Connect indicators to actions: collections, supplier terms, cost control, inventory or investment. Document assumptions and monitor the results."]
    ],
    quiz:[
      {question:"What does a balance sheet mainly describe?",options:["A financial position at a given date","All cash flows for a year without a date","Sales only"],explanation:"A balance sheet is a statement of financial position at a closing or reporting date."},
      {question:"Working capital, working capital requirements and net cash should be…",options:["Interpreted together","Ignored separately","Replaced by revenue"],explanation:"These indicators complement one another when assessing financial balances."}
    ]
  },
  ai: {
    title:"AI and responsible use",
    description:"Understand limitations, consent and the verification of AI responses.",
    lessons:[
      ["Distinguish the guide from AI","The local document guide can work without AI. A generative assistant is a separate service that may process information you send to it; activation must be explicit."],
      ["Protect information","Do not send personal, financial or confidential data without specific authorization. Share only what is strictly necessary and check the provider, purpose and retention period."],
      ["Verify results","An AI response may be incomplete or incorrect. Require verifiable references, compare applicable rules and have sensitive decisions reviewed by a qualified person."]
    ],
    quiz:[
      {question:"Does the local guide require an AI provider?",options:["No, it can work without AI","Yes, always","Only at night"],explanation:"The local guide and the AI assistant are separate features."},
      {question:"How should you handle a sensitive AI response?",options:["Verify it against sources and with a qualified person","Treat it as an official decision","Share it without checking"],explanation:"AI can assist, but it does not replace verification or accountability."}
    ]
  },
  documents: {
    title:"Documents and supporting records",
    description:"Classify, retrieve, protect and link supporting documents.",
    lessons:[
      ["Classify supporting documents","Use a consistent naming scheme: fiscal year, journal, date, third party and reference. Avoid ambiguous names and retain originals according to applicable rules."],
      ["Link documents to transactions","Attach each supporting document to the corresponding journal entry or commercial document. Check that the link opens the correct file and that the version is readable."],
      ["Secure and back up documents","Restrict access, encrypt backups where supported and regularly test restoration. Do not delete an old document vault before inventory and reconciliation."]
    ],
    quiz:[
      {question:"A supporting document should be…",options:["Identifiable and linked to the transaction","Named at random","Stored without controls"],explanation:"Consistent classification makes evidence easier to retrieve and verify."},
      {question:"Before deleting an old document vault, you should…",options:["Inventory it and reconcile its contents","Delete first and search later","Only rename the files"],explanation:"Recovery and verification must come before deletion."}
    ]
  }
};
