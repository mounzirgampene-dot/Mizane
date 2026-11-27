// MIZANE — Administration éditoriale de la Boussole.
// Les contrôles d'interface améliorent l'ergonomie ; l'Edge Function reste l'autorité d'accès.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";
import { lang } from "./i18n.js";

const LANGS = ["fr", "ar", "en"];
const COPY = {
  fr: {
    button:"Administration Boussole", title:"Administration éditoriale",
    intro:"Rédaction, relecture et publication contrôlées. Les versions FR, AR et EN d'une même édition sont requises pour publier.",
    close:"Fermer", scope:"Espace", global:"Documents globaux", company:"Documents de l'entreprise",
    reload:"Actualiser", create:"Nouveau document", noDocs:"Aucun document dans cet espace.",
    slug:"Identifiant (slug)", titleField:"Titre", locale:"Langue", summary:"Résumé",
    content:"Contenu Markdown", createDraft:"Créer le brouillon", cancel:"Annuler",
    selectDoc:"Sélectionnez un document.", edition:"Édition", newEdition:"Nouvelle édition", addLocale:"Ajouter cette langue à l'édition",
    save:"Enregistrer le brouillon", submit:"Soumettre en relecture", changes:"Demander des corrections",
    approve:"Approuver", publish:"Publier les trois langues", archive:"Archiver", restore:"Restaurer",
    preview:"Aperçu texte", status:"État", versions:"Versions linguistiques",
    missing:"Version absente", notReady:"Publication impossible : les trois langues doivent être approuvées dans la même édition.",
    access:"Aucun rôle éditorial actif dans cet espace.", unavailable:"Service éditorial indisponible ou non encore activé.",
    saved:"Opération enregistrée.", confirmArchive:"Archiver ce document ?", reviewNote:"Note de relecture (facultatif)",
    minutes:"Durée estimée (minutes)", level:"Niveau pédagogique", beginner:"Débutant", intermediate:"Intermédiaire", advanced:"Avancé",
    draft:"Brouillon", review:"En relecture", approved:"Approuvé", published:"Publié", archived:"Archivé", withdrawn:"Retiré",
    fr:"Français", ar:"العربية", en:"English", error:"Une erreur est survenue."
  },
  en: {
    button:"Boussole administration", title:"Editorial administration",
    intro:"Controlled drafting, review and publication. FR, AR and EN versions of the same edition are required for publication.",
    close:"Close", scope:"Workspace", global:"Global documents", company:"Company documents",
    reload:"Refresh", create:"New document", noDocs:"No documents in this workspace.",
    slug:"Identifier (slug)", titleField:"Title", locale:"Language", summary:"Summary",
    content:"Markdown content", createDraft:"Create draft", cancel:"Cancel",
    selectDoc:"Select a document.", edition:"Edition", newEdition:"New edition", addLocale:"Add this language to the edition",
    save:"Save draft", submit:"Submit for review", changes:"Request changes",
    approve:"Approve", publish:"Publish all three languages", archive:"Archive", restore:"Restore",
    preview:"Text preview", status:"Status", versions:"Language versions",
    missing:"Version missing", notReady:"Cannot publish: all three languages must be approved in the same edition.",
    access:"No active editorial role in this workspace.", unavailable:"Editorial service unavailable or not yet enabled.",
    saved:"Operation saved.", confirmArchive:"Archive this document?", reviewNote:"Review note (optional)",
    minutes:"Estimated duration (minutes)", level:"Learning level", beginner:"Beginner", intermediate:"Intermediate", advanced:"Advanced",
    draft:"Draft", review:"In review", approved:"Approved", published:"Published", archived:"Archived", withdrawn:"Withdrawn",
    fr:"French", ar:"Arabic", en:"English", error:"An error occurred."
  },
  ar: {
    button:"إدارة بوصلة ميزان", title:"الإدارة التحريرية",
    intro:"تحرير ومراجعة ونشر مضبوط. يلزم اعتماد النسخ الفرنسية والعربية والإنجليزية من الإصدار نفسه قبل النشر.",
    close:"إغلاق", scope:"النطاق", global:"الوثائق العامة", company:"وثائق المؤسسة",
    reload:"تحديث", create:"وثيقة جديدة", noDocs:"لا توجد وثائق في هذا النطاق.",
    slug:"المعرّف", titleField:"العنوان", locale:"اللغة", summary:"الملخص",
    content:"المحتوى بصيغة Markdown", createDraft:"إنشاء مسودة", cancel:"إلغاء",
    selectDoc:"اختر وثيقة.", edition:"الإصدار", newEdition:"إصدار جديد", addLocale:"إضافة هذه اللغة إلى الإصدار",
    save:"حفظ المسودة", submit:"إرسال للمراجعة", changes:"طلب تعديلات",
    approve:"اعتماد", publish:"نشر اللغات الثلاث", archive:"أرشفة", restore:"استعادة",
    preview:"معاينة نصية", status:"الحالة", versions:"النسخ اللغوية",
    missing:"النسخة غير موجودة", notReady:"لا يمكن النشر: يجب اعتماد اللغات الثلاث في الإصدار نفسه.",
    access:"لا يوجد دور تحريري نشط في هذا النطاق.", unavailable:"الخدمة التحريرية غير متاحة أو لم تُفعّل بعد.",
    saved:"تم حفظ العملية.", confirmArchive:"هل تريد أرشفة هذه الوثيقة؟", reviewNote:"ملاحظة المراجعة (اختياري)",
    minutes:"المدة التقديرية (بالدقائق)", level:"المستوى التعليمي", beginner:"مبتدئ", intermediate:"متوسط", advanced:"متقدم",
    draft:"مسودة", review:"قيد المراجعة", approved:"معتمد", published:"منشور", archived:"مؤرشف", withdrawn:"مسحوب",
    fr:"Français", ar:"العربية", en:"English", error:"حدث خطأ."
  }
};
let clientPromise;
let initialized = false;
let button, dialog, body, closeButton;
let availableScopes = [];
let activeScope = null;
let documents = [];
let activeDocument = null;
let activeVersions = [];
let activeEdition = 1;
let activeLocale = "fr";
let activeVersion = null;

const copy = () => COPY[LANGS.includes(lang()) ? lang() : "fr"];
const companyId = () => localStorage.getItem("mizane_active_company_v1");
const make = (tag, cls, value) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (value !== undefined && value !== null) node.textContent = String(value);
  return node;
};
const field = (labelText, control) => {
  const wrap = make("label", "boussole-editor-field");
  wrap.append(make("span", "", labelText), control);
  return wrap;
};
const input = (value = "", type = "text") => {
  const node = make("input");
  node.type = type; node.value = value; node.maxLength = type === "text" ? 240 : 200000;
  return node;
};
const textarea = (value = "") => {
  const node = make("textarea");
  node.value = value; node.rows = 10;
  return node;
};
const select = (items, selected) => {
  const node = make("select");
  for (const [value, label] of items) {
    const option = make("option", "", label); option.value = value; option.selected = value === selected; node.append(option);
  }
  return node;
};
const buttonNode = (label, action, cls = "secondary small") => {
  const node = make("button", cls, label); node.type = "button"; node.dataset.editorAction = action; return node;
};
async function getClient() {
  if (!clientPromise) clientPromise = import("https://esm.sh/@supabase/supabase-js@2")
    .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
  return clientPromise;
}
async function invoke(action, payload = {}) {
  const supabase = await getClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData?.session?.access_token) throw new Error(copy().access);
  const { data, error } = await supabase.functions.invoke("boussole-editor", { body: { action, ...payload } });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data || {};
}
function scopePayload(scope) {
  return scope.type === "company"
    ? { scope: "company", company_id: scope.companyId }
    : { scope: "global" };
}
function statusLabel(status) { return copy()[status] || status || "—"; }
function showMessage(message, isError = false) {
  const node = body?.querySelector(".boussole-editor-message");
  if (node) { node.textContent = message; node.dataset.error = String(isError); }
}
async function probeScopes() {
  const scopes = [];
  const activeCompany = companyId();
  if (activeCompany) {
    try {
      const data = await invoke("list", { scope: "company", company_id: activeCompany });
      scopes.push({ type: "company", companyId: activeCompany, roles: data.roles || [] });
    } catch (error) {
      if (!String(error?.message || "").includes("403") && !String(error?.message || "").includes("role")) console.warn("Boussole editor company scope:", error?.message || error);
    }
  }
  try {
    const data = await invoke("list", { scope: "global" });
    scopes.push({ type: "global", companyId: null, roles: data.roles || [] });
  } catch (error) {
    if (!String(error?.message || "").includes("403") && !String(error?.message || "").includes("role")) console.warn("Boussole editor global scope:", error?.message || error);
  }
  return scopes;
}
async function loadDocuments() {
  const data = await invoke("list", scopePayload(activeScope));
  documents = data.documents || [];
  activeDocument = null; activeVersions = []; activeVersion = null;
  render();
}
async function loadDocument(id) {
  const data = await invoke("get", { ...scopePayload(activeScope), document_id: id });
  activeDocument = data.document;
  activeVersions = data.versions || [];
  const editions = [...new Set(activeVersions.map(version => version.version_number))].sort((a,b) => b-a);
  activeEdition = editions[0] || activeDocument.current_published_version || 1;
  activeLocale = LANGS.find(locale => activeVersions.some(v => v.version_number === activeEdition && v.locale === locale)) || "fr";
  selectActiveVersion();
  render();
}
function selectActiveVersion() {
  activeVersion = activeVersions.find(v => v.version_number === activeEdition && v.locale === activeLocale) || null;
}
function render() {
  const c = copy();
  dialog.dir = lang() === "ar" ? "rtl" : "ltr";
  body.replaceChildren();
  const header = make("div", "boussole-editor-toolbar");
  const scopeSelect = select(availableScopes.map((scope,index) => [String(index), scope.type === "global" ? c.global : c.company]), String(Math.max(0, availableScopes.indexOf(activeScope))));
  scopeSelect.setAttribute("aria-label", c.scope);
  scopeSelect.addEventListener("change", async () => { activeScope = availableScopes[Number(scopeSelect.value)]; try { await loadDocuments(); } catch (error) { showMessage(error.message || c.error, true); } });
  const createButton = buttonNode(c.create, "new");
  createButton.disabled = !(activeScope.roles || []).some(role => role === "author" || role === "admin");
  header.append(field(c.scope, scopeSelect), buttonNode(c.reload, "reload"), createButton);
  body.append(header);
  body.append(make("p", "boussole-editor-intro", c.intro));
  body.append(make("p", "boussole-editor-message"));
  const layout = make("div", "boussole-editor-layout");
  const list = make("section", "boussole-editor-list");
  list.append(make("h3", "", c.title));
  if (!documents.length) list.append(make("p", "muted", c.noDocs));
  for (const doc of documents) {
    const item = buttonNode("", "open");
    item.dataset.documentId = doc.id;
    item.classList.add("boussole-editor-document");
    item.append(make("strong", "", doc.slug), make("span", "", statusLabel(doc.status)));
    list.append(item);
  }
  const editor = make("section", "boussole-editor-workspace");
  if (!activeDocument) editor.append(make("p", "muted", c.selectDoc));
  else renderDocumentEditor(editor);
  layout.append(list, editor); body.append(layout);
}
function renderDocumentEditor(root) {
  const c = copy(), doc = activeDocument;
  root.append(make("h3", "", doc.slug), make("p", "muted", c.status + ": " + statusLabel(doc.status)));
  const editions = [...new Set(activeVersions.map(v => v.version_number))].sort((a,b) => b-a);
  const editionSelect = select(editions.map(n => [String(n), c.edition + " " + n]), String(activeEdition));
  editionSelect.addEventListener("change", () => { activeEdition = Number(editionSelect.value); selectActiveVersion(); render(); });
  const localeSelect = select(LANGS.map(locale => [locale, c[locale]]), activeLocale);
  localeSelect.addEventListener("change", () => { activeLocale = localeSelect.value; selectActiveVersion(); render(); });
  root.append(field(c.edition, editionSelect), field(c.locale, localeSelect));
  const rolesForDoc = activeScope.roles || [];
  const canCreateEdition = rolesForDoc.includes("author") || rolesForDoc.includes("admin");
  if (doc.status === "published" && canCreateEdition) root.append(buttonNode(c.newEdition, "new-edition"));
  const statusGrid = make("div", "boussole-editor-language-status");
  for (const locale of LANGS) {
    const version = activeVersions.find(v => v.version_number === activeEdition && v.locale === locale);
    statusGrid.append(make("span", version ? "is-present" : "is-missing", c[locale] + " : " + (version ? statusLabel(version.status) : c.missing)));
  }
  root.append(make("h4", "", c.versions), statusGrid);
  if (!activeVersion) {
    root.append(make("p", "muted", c.missing));
    const addButton = buttonNode(c.addLocale, "add-locale");
    addButton.disabled = !(activeScope.roles || []).some(role => role === "author" || role === "admin");
    root.append(addButton);
  } else {
    const title = input(activeVersion.title);
    const summary = textarea(activeVersion.summary || ""); summary.rows = 3;
    const content = textarea(activeVersion.content_markdown || "");
    const level = select([["", "—"],["beginner",c.beginner],["intermediate",c.intermediate],["advanced",c.advanced]], activeVersion.learning_level || "");
    const minutes = input(activeVersion.estimated_minutes ?? "", "number"); minutes.min = "1"; minutes.max = "1440";
    root.append(field(c.titleField, title), field(c.summary, summary), field(c.content, content),
      field(c.level, level), field(c.minutes, minutes));
    const preview = make("pre", "boussole-editor-preview", content.value);
    root.append(make("h4", "", c.preview), preview);
    content.addEventListener("input", () => { preview.textContent = content.value; });
    const actions = make("div", "boussole-editor-actions");
    const roles = activeScope.roles || [];
    const canAuthor = roles.includes("author") || roles.includes("admin");
    const canReview = roles.includes("reviewer") || roles.includes("admin");
    const canPublish = roles.includes("publisher") || roles.includes("admin");
    const payload = () => ({
      document_id: doc.id, version_id: activeVersion.id, locale: activeLocale,
      title: title.value, summary: summary.value, content_markdown: content.value,
      learning_level: level.value || null, estimated_minutes: minutes.value ? Number(minutes.value) : null,
      structured_content: activeVersion.structured_content || {}, source_references: activeVersion.source_references || []
    });
    if (activeVersion.status === "draft" && canAuthor) actions.append(buttonNode(c.save, "save"), buttonNode(c.submit, "submit"));
    if (activeVersion.status === "review" && canReview) actions.append(buttonNode(c.changes, "changes"), buttonNode(c.approve, "approve"));
    const editionVersions = activeVersions.filter(v => v.version_number === activeEdition);
    const triReady = LANGS.every(locale => editionVersions.some(v => v.locale === locale && v.status === "approved"));
    if (activeVersion.status === "approved" && canPublish) {
      const publish = buttonNode(c.publish, "publish"); publish.disabled = !triReady; publish.title = triReady ? "" : c.notReady; actions.append(publish);
    }
    if (doc.status === "published" && canPublish) actions.append(buttonNode(c.archive, "archive"));
    if (doc.status === "archived" && canPublish) actions.append(buttonNode(c.restore, "restore"));
    root.append(actions);
    root.dataset.versionPayload = "ready";
    root._editorPayload = payload;
  }
}
function renderNewDocument() {
  const c = copy();
  const form = make("form", "boussole-editor-new");
  const slug = input(""); slug.maxLength = 180; slug.required = true;
  const title = input(""); title.required = true;
  const locale = select(LANGS.map(code => [code, c[code]]), lang() === "ar" || lang() === "en" ? lang() : "fr");
  const summary = textarea(""); summary.rows = 2;
  const content = textarea("");
  form.append(field(c.slug, slug), field(c.titleField, title), field(c.locale, locale),
    field(c.summary, summary), field(c.content, content));
  const actions = make("div", "boussole-editor-actions");
  const submit = make("button", "", c.createDraft); submit.type = "submit";
  actions.append(submit, buttonNode(c.cancel, "cancel")); form.append(actions);
  form.addEventListener("submit", async event => {
    event.preventDefault(); submit.disabled = true;
    try {
      const payload = {
        ...scopePayload(activeScope), visibility: activeScope.type,
        company_id: activeScope.type === "company" ? activeScope.companyId : null,
        slug: slug.value.trim(), locale: locale.value, title: title.value.trim(),
        summary: summary.value, content_markdown: content.value,
      };
      const result = await invoke("create_draft", payload);
      await loadDocuments();
      if (result.result?.document_id) await loadDocument(result.result.document_id);
      showMessage(c.saved);
    } catch (error) { showMessage(error.message || c.error, true); submit.disabled = false; }
  });
  body.replaceChildren(make("h3", "", c.create), form, make("p", "boussole-editor-message"));
}
async function handleAction(action) {
  const c = copy();
  try {
    if (action === "reload") { await loadDocuments(); return; }
    if (action === "new") { renderNewDocument(); return; }
    if (action === "cancel") { render(); return; }
    if (action === "open") { await loadDocument(eventDocumentId); return; }
    if (action === "add-locale") {
      const current = activeVersions.find(v => v.version_number === activeEdition && v.locale === activeLocale);
      if (current) return;
      await invoke("create_locale_version", { ...scopePayload(activeScope), document_id: activeDocument.id, locale: activeLocale, title: c[activeLocale] });
      await loadDocument(activeDocument.id); showMessage(c.saved); return;
    }
    if (action === "new-edition") {
      const nextEdition = Number(activeDocument.current_published_version || 0) + 1;
      if (activeVersions.some(v => v.version_number === nextEdition && v.locale === activeLocale)) {
        activeEdition = nextEdition; selectActiveVersion(); render(); return;
      }
      const source = activeVersions.find(v => v.version_number === activeDocument.current_published_version && v.locale === activeLocale);
      await invoke("create_locale_version", {
        ...scopePayload(activeScope), document_id: activeDocument.id, locale: activeLocale,
        title: source?.title || c[activeLocale], summary: source?.summary || "",
        content_markdown: source?.content_markdown || "",
        learning_level: source?.learning_level || null,
        estimated_minutes: source?.estimated_minutes || null,
        structured_content: source?.structured_content || {},
        source_references: source?.source_references || []
      });
      await loadDocument(activeDocument.id); showMessage(c.saved); return;
    }
    if (!activeDocument || !activeVersion) return;
    const payload = body.querySelector(".boussole-editor-workspace")?._editorPayload?.();
    if (action === "save") await invoke("update_draft", { ...scopePayload(activeScope), ...payload });
    if (action === "submit") await invoke("submit_review", { ...scopePayload(activeScope), document_id: activeDocument.id, version_id: activeVersion.id });
    if (action === "changes") {
      const note = window.prompt(c.reviewNote) || "";
      await invoke("request_changes", { ...scopePayload(activeScope), document_id: activeDocument.id, version_id: activeVersion.id, review_note: note });
    }
    if (action === "approve") await invoke("approve", { ...scopePayload(activeScope), document_id: activeDocument.id, version_id: activeVersion.id });
    if (action === "publish") await invoke("publish", { ...scopePayload(activeScope), document_id: activeDocument.id, version_id: activeVersion.id });
    if (action === "archive") {
      if (!window.confirm(c.confirmArchive)) return;
      await invoke("archive", { ...scopePayload(activeScope), document_id: activeDocument.id });
    }
    if (action === "restore") await invoke("restore", { ...scopePayload(activeScope), document_id: activeDocument.id });
    await loadDocument(activeDocument.id);
    showMessage(c.saved);
  } catch (error) { showMessage(error.message || c.error, true); }
}
let eventDocumentId = null;
export async function initBoussoleEditor() {
  if (initialized) return;
  button = document.getElementById("boussole-editor-toggle");
  dialog = document.getElementById("boussole-editor-dialog");
  body = document.getElementById("boussole-editor-body");
  closeButton = document.getElementById("boussole-editor-close");
  if (!button || !dialog || !body || !closeButton) return;
  button.hidden = true;
  closeButton.addEventListener("click", () => dialog.close());
  button.addEventListener("click", async () => {
    button.textContent = copy().button;
    dialog.querySelector("#boussole-editor-title").textContent = copy().title;
    closeButton.textContent = copy().close;
    dialog.showModal();
    try { await loadDocuments(); }
    catch (error) { body.replaceChildren(make("p", "boussole-editor-message", error.message || copy().error)); }
  });
  body.addEventListener("click", async event => {
    const target = event.target.closest("[data-editor-action]");
    if (!target) return;
    if (target.dataset.editorAction === "open") eventDocumentId = target.dataset.documentId;
    await handleAction(target.dataset.editorAction);
  });
  try {
    availableScopes = await probeScopes();
    if (!availableScopes.length) return;
    activeScope = availableScopes[0];
    button.textContent = copy().button;
    button.hidden = false;
    initialized = true;
  } catch (error) { console.warn("Boussole editorial access not available:", error?.message || error); }
}
