// MIZANE — Internationalisation : traduction de l'interface après rendu.
// Les vues restent écrites en français ; ce module traduit les textes exacts
// (noeuds de texte et placeholders) vers la langue choisie dans Paramètres.
// Ajouter une langue : une colonne dans RAW + un id dans LANGS.

export const LANGS = [
  ["fr", "Français"],
  ["en", "English"],
  ["es", "Español"],
  ["ar", "العربية"],
];

// Format d'une ligne : français;anglais;espagnol;arabe
const RAW = `Tableau de bord;Dashboard;Panel de control;لوحة التحكم
Saisie;Entry;Registro;الإدخال
Écritures;Entries;Asientos;القيود
Grand livre;General ledger;Libro mayor;دفتر الأستاذ
Balance;Trial balance;Balanza;ميزان المراجعة
Résultat;Income statement;Cuenta de resultados;حساب النتائج
Bilan;Balance sheet;Balance;الميزانية
Tiers;Third parties;Terceros;الأطراف
Outils;Tools;Herramientas;الأدوات
Assistant IA;AI assistant;Asistente IA;المساعد الذكي
Paramètres;Settings;Ajustes;الإعدادات
Saisie d'écriture;Journal entry;Registro de asiento;إدخال القيد
Balance générale;Trial balance;Balanza general;ميزان المراجعة العام
Compte de résultat;Income statement;Cuenta de resultados;حساب النتائج
Outils comptables;Accounting tools;Herramientas contables;الأدوات المحاسبية
🤖 Assistant IA;🤖 AI assistant;🤖 Asistente IA;🤖 المساعد الذكي
🏢 Société & internationalisation;🏢 Company & internationalization;🏢 Empresa e internacionalización;🏢 الشركة والتدويل
🔐 Confidentialité;🔐 Privacy;🔐 Privacidad;🔐 الخصوصية
💾 Données;💾 Data;💾 Datos;💾 البيانات
🏦 Rapprochement bancaire;🏦 Bank reconciliation;🏦 Conciliación bancaria;🏦 التسوية البنكية
📓 Clôture d'exercice & à-nouveaux;📓 Year-end closing & opening balances;📓 Cierre de ejercicio y saldos iniciales;📓 إقفال السنة والأرصدة المدورة
🏢 Immobilisations & amortissements;🏢 Fixed assets & depreciation;🏢 Inmovilizado y amortizaciones;🏢 الأصول الثابتة والإهلاك
🤖 Saisie intelligente;🤖 Smart entry;🤖 Registro inteligente;🤖 الإدخال الذكي
💬 Conversation;💬 Conversation;💬 Conversación;💬 المحادثة
🔎 Audit intelligent;🔎 Smart audit;🔎 Auditoría inteligente;🔎 التدقيق الذكي
📥 Remplir la comptabilité depuis un texte;📥 Fill the books from text;📥 Rellenar la contabilidad desde un texto;📥 تعبئة المحاسبة من نص
État de la comptabilité;Accounting status;Estado de la contabilidad;حالة المحاسبة
Tiers (clients & fournisseurs);Third parties (customers & suppliers);Terceros (clientes y proveedores);الأطراف (العملاء والموردون)
Anomalies (moteur local);Anomalies (local engine);Anomalías (motor local);الحالات الشاذة (المحرك المحلي)
Contrôle d'équilibre du bilan;Balance sheet check;Control de equilibrio del balance;التحقق من توازن الميزانية
Enregistrer;Save;Guardar;حفظ
Envoyer;Send;Enviar;إرسال
Valider l'écriture;Validate entry;Validar el asiento;اعتماد القيد
Ajouter;Add;Añadir;إضافة
Fermer;Close;Cerrar;إغلاق
Annuler;Cancel;Cancelar;إلغاء
🖨 Imprimer;🖨 Print;🖨 Imprimir;🖨 طباعة
⬇ Exporter CSV;⬇ Export CSV;⬇ Exportar CSV;⬇ تصدير CSV
⬇ Excel;⬇ Excel;⬇ Excel;⬇ Excel
⬇ CSV;⬇ CSV;⬇ CSV;⬇ CSV
⬇ Exporter la sauvegarde (JSON);⬇ Export backup (JSON);⬇ Exportar copia (JSON);⬇ تصدير النسخة الاحتياطية (JSON)
⬆ Importer une sauvegarde;⬆ Import backup;⬆ Importar copia;⬆ استيراد نسخة احتياطية
Charger la démonstration;Load demo data;Cargar la demostración;تحميل البيانات التجريبية
Tout effacer;Erase all;Borrar todo;حذف الكل
＋ Ligne;＋ Line;＋ Línea;＋ سطر
➕ Nouvelle écriture;➕ New entry;➕ Nuevo asiento;➕ قيد جديد
🤖 Proposer avec l'IA;🤖 Suggest with AI;🤖 Proponer con IA;🤖 اقتراح بالذكاء الاصطناعي
Proposer l'écriture;Suggest entry;Proponer el asiento;اقتراح القيد
🖨 Imprimer le journal;🖨 Print journal;🖨 Imprimir el diario;🖨 طباعة اليومية
Rapprocher;Reconcile;Conciliar;تسوية
Valider la clôture;Validate closing;Validar el cierre;اعتماد الإقفال
Clôturer et générer les à-nouveaux;Close and generate opening balances;Cerrar y generar saldos iniciales;الإقفال وتوليد الأرصدة المدورة
Générer la dotation de l'exercice;Generate yearly depreciation;Generar la dotación del ejercicio;توليد قسط الإهلاك السنوي
Charger dans le formulaire;Load into form;Cargar en el formulario;تحميل في النموذج
Charger des données de démonstration;Load demo data;Cargar datos de demostración;تحميل بيانات تجريبية
Charger la démo;Load demo;Cargar la demo;تحميل العرض التجريبي
🤖 Ouvrir l'assistant IA;🤖 Open AI assistant;🤖 Open AI assistant;🤖 فتح المساعد الذكي
📷 Joindre une photo;📷 Attach a photo;📷 Adjuntar una foto;📷 إرفاق صورة
Afficher;Show;Mostrar;عرض
Contrepasser;Reverse;Revertir;عكس القيد
❓ Aide — journaux et comptes;❓ Help — journals and accounts;❓ Ayuda — diarios y cuentas;❓ مساعدة — اليوميات والحسابات
Voir le plan complet;View full chart of accounts;Ver el plan completo;عرض دليل الحسابات كاملاً
⏳ Analyse en cours…;⏳ Analyzing…;⏳ Analizando…;⏳ جارٍ التحليل…
⏳ Interrogation de l'IA…;⏳ Asking the AI…;⏳ Consultando la IA…;⏳ جارٍ سؤال الذكاء الاصطناعي…
Date;Date;Fecha;التاريخ
Journal;Journal;Diario;اليومية
Compte;Account;Cuenta;الحساب
Libellé;Label;Etiqueta;البيان
Débit;Debit;Debe;مدين
Crédit;Credit;Haber;دائن
Type;Type;Tipo;النوع
Nom;Name;Nombre;الاسم
Email;Email;Correo;البريد الإلكتروني
Téléphone;Phone;Teléfono;الهاتف
Montant;Amount;Importe;المبلغ
Valeur;Value;Valor;القيمة
Valeur (HT);Value (excl. tax);Valor (sin IVA);القيمة (بدون ضريبة)
Taux;Rate;Tasa;المعدل
Durée;Duration;Duración;المدة
Durée (années);Duration (years);Duración (años);المدة (سنوات)
Méthode;Method;Método;الطريقة
Linéaire;Straight-line;Lineal;القسط الثابت
Dégressif;Declining balance;Degresivo;القسط المتناقص
Cumul;Cumulative;Acumulado;التراكمي
Déjà amorti;Already depreciated;Ya amortizado;مهلك مسبقاً
VNC;Net book value;Valor neto contable;القيمة الصافية
Annuité;Annual charge;Cuota anual;القسط السنوي
Année;Year;Año;السنة
Solde;Balance;Saldo;الرصيد
Totaux;Totals;Totales;الإجماليات
Total débit;Total debit;Total debe;مجموع المدين
Total crédit;Total credit;Total haber;مجموع الدائن
Total actif;Total assets;Total activo;مجموع الأصول
Total passif;Total liabilities;Total pasivo;مجموع الخصوم
Total charges;Total expenses;Total gastos;مجموع المصروفات
Total produits;Total income;Total ingresos;مجموع الإيرادات
Solde débiteur;Debit balance;Saldo deudor;رصيد مدين
Solde créditeur;Credit balance;Saldo acreedor;رصيد دائن
Actif;Assets;Activo;الأصول
Passif;Liabilities;Pasivo;الخصوم
Charges;Expenses;Gastos;المصروفات
Produits;Income;Ingresos;الإيرادات
Charges (exercice);Expenses (period);Gastos (ejercicio);المصروفات (الفترة)
Produits (exercice);Income (period);Ingresos (ejercicio);الإيرادات (الفترة)
Trésorerie (classe 5);Cash (class 5);Tesorería (clase 5);النقدية (الفئة 5)
Détail;Detail;Detalle;التفاصيل
Référence;Reference;Referencia;المرجع
Réf.;Ref.;Ref.;مرجع.
Pièce / référence;Document / reference;Documento / referencia;المستند / المرجع
Nom de la société;Company name;Nombre de la empresa;اسم الشركة
Pays (plan, devise, TVA choisis automatiquement);Country (plan, currency, VAT chosen automatically);País (plan, moneda, IVA automáticos);البلد (الدليل والعملة والضريبة تلقائياً)
Plan comptable;Chart of accounts;Plan contable;دليل الحسابات
Devise;Currency;Moneda;العملة
Début d'exercice;Fiscal year start;Inicio del ejercicio;بداية السنة المالية
Fin d'exercice;Fiscal year end;Fin del ejercicio;نهاية السنة المالية
Fournisseur;Provider;Proveedor;المزود
Modèle;Model;Modelo;النموذج
Clé API;API key;Clave API;مفتاح API
Endpoint (compatible OpenAI);Endpoint (OpenAI-compatible);Endpoint (compatible OpenAI);نقطة النهاية (متوافقة مع OpenAI)
Nouveau compte (numéro);New account (number);Nueva cuenta (número);حساب جديد (رقم)
Nouvel exercice — début;New fiscal year — start;Nuevo ejercicio — inicio;السنة المالية الجديدة — البداية
Nouvel exercice — fin;New fiscal year — end;Nuevo ejercicio — fin;السنة المالية الجديدة — النهاية
Compte immobilisation;Accumulated depreciation account;Cuenta de amortización;حساب الإهلاك
Date de mise en service;In-service date;Fecha de puesta en servicio;تاريخ بدء الاستخدام
Langue;Language;Idioma;اللغة
Plan;Chart;Plan;الدليل
Anomalies;Anomalies;Anomalías;الحالات الشاذة
Comptes inconnus;Unknown accounts;Cuentas desconocidas;حسابات غير معروفة
Déséquilibres;Imbalances;Desequilibrios;اختلالات
Aucune écriture.;No entries.;Sin asientos.;لا توجد قيود.
Aucun tiers enregistré.;No third parties saved.;Sin terceros guardados.;لا توجد أطراف محفوظة.
Aucune immobilisation enregistrée.;No fixed assets saved.;Sin inmovilizado guardado.;لا توجد أصول ثابتة محفوظة.
Aucune charge;No expense;Sin gastos;لا توجد مصروفات
Aucun produit;No income;Sin ingresos;لا توجد إيرادات
Aucune photo (optionnel);No photo (optional);Sin foto (opcional);لا توجد صورة (اختياري)
MIZANE — Comptabilité générale;MIZANE — General accounting;MIZANE — Contabilidad general;ميزان — المحاسبة العامة`;

export const DICT = {};
const LANG_IDS = LANGS.slice(1).map(([id]) => id);
for (const id of LANG_IDS) DICT[id] = {};
for (const line of RAW.split("\n")) {
  const p = line.split(";");
  if (p.length !== 4 || !p[0]) continue;
  LANG_IDS.forEach((id, i) => { DICT[id][p[0]] = p[i + 1]; });
}

let current = "fr";

export function setLang(l) {
  current = LANGS.some(([id]) => id === l) ? l : "fr";
  if (typeof document !== "undefined") {
    document.documentElement.lang = current;
    document.documentElement.dir = current === "ar" ? "rtl" : "ltr";
  }
}

export function lang() {
  return current;
}

// Traduit une chaîne d'interface française exacte ; repli : texte français.
export function t(fr) {
  if (current === "fr") return fr;
  return DICT[current]?.[fr] ?? fr;
}

// Traduit les noeuds de texte et placeholders exacts dans les racines données.
export function applyI18n(roots) {
  const dict = DICT[current];
  if (!dict || typeof document === "undefined") return;
  for (const root of roots) {
    if (!root) continue;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const tr = dict[n.nodeValue.trim()];
      if (tr) n.nodeValue = tr;
    }
    for (const el of root.querySelectorAll("[placeholder]")) {
      const tr = dict[el.getAttribute("placeholder")];
      if (tr) el.setAttribute("placeholder", tr);
    }
  }
}
