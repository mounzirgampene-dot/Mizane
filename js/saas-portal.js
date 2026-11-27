import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";
import { syncAccounting, restoreAccountingFromCloud } from "./accounting-sync.js";
import { bindCompanyStorage, getCompanyStorageStatus, getCompanySessionLock, lockCompanyStorage, unlockCompanyStorage } from "./company-storage.js";

const root = document.querySelector("#portal");
const toastNode = document.querySelector("#portal-toast");
const ACTIVE_COMPANY_KEY = "mizane_active_company_v1";
const ACTIVE_USER_KEY = "mizane_active_user_v1";
let supabase;
let session = null;
let memberships = [];
let activeCompanyId = localStorage.getItem(ACTIVE_COMPANY_KEY) || "";
let pendingInvitationToken = new URLSearchParams(location.hash.slice(1)).get("invitation") || "";
let passwordRecoveryMode = false;
let accountingCloudReady = false;
let loginCountdownTimer = null;
const LOGIN_LOCK_KEY = "mizane_login_lock_v1";
const recoveryLinkDetected = new URLSearchParams(location.hash.slice(1)).get("type") === "recovery";
if (pendingInvitationToken) history.replaceState(null, "", location.pathname + location.search);

const esc = (value = "") => String(value).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const roleLabel = (role) => ({admin:"Administrateur",accountant:"Comptable",reader:"Lecteur"}[role] || role);
function toast(message){toastNode.textContent=message;toastNode.classList.add("show");setTimeout(()=>toastNode.classList.remove("show"),3500)}
function showError(error){const msg=error?.message||String(error);toast(msg);const box=root.querySelector("[data-error]");if(box){box.textContent=msg;box.classList.remove("hidden")}}
function busy(button,on){if(button){button.disabled=on;button.dataset.oldText ||= button.textContent;button.textContent=on?"Patientez…":button.dataset.oldText}}
function loginLockStorageKey(email){return LOGIN_LOCK_KEY+":"+String(email||"").trim().toLowerCase()}
function readLoginLock(email){try{return JSON.parse(localStorage.getItem(loginLockStorageKey(email))||"{\"failures\":0,\"level\":0,\"lockUntil\":0}")}catch{return {failures:0,level:0,lockUntil:0}}}
function writeLoginLock(email,state){localStorage.setItem(loginLockStorageKey(email),JSON.stringify(state))}
function clearLoginLock(email){localStorage.removeItem(loginLockStorageKey(email))}
function registerLoginFailure(email){const state=readLoginLock(email);state.failures=(state.failures||0)+1;if(state.failures>=5){const delays=[30,60,120];const seconds=delays[Math.min(state.level||0,2)];state.failures=0;state.lockUntil=Date.now()+seconds*1000;state.level=Math.min((state.level||0)+1,2);writeLoginLock(email,state);updateLoginLockUI();return seconds}writeLoginLock(email,state);return 0}
function updateLoginLockUI(){const form=root.querySelector("#auth-form"),notice=root.querySelector("#login-lockout");if(!form||!notice)return;const email=form.querySelector("#email")?.value||"",state=readLoginLock(email),remaining=Math.max(0,Math.ceil((state.lockUntil-Date.now())/1000)),submit=form.querySelector("button[type=submit]");if(remaining>0){notice.textContent="Trop de tentatives de connexion. Vous pourrez réessayer dans "+remaining+" seconde"+(remaining>1?"s":"")+".";notice.classList.remove("hidden");if(submit){submit.disabled=true;submit.textContent="Réessayez dans "+remaining+" s"}}else{notice.textContent="";notice.classList.add("hidden");if(submit){submit.disabled=false;submit.textContent="Se connecter"}if(state.lockUntil){state.lockUntil=0;writeLoginLock(email,state)}}}
function startLoginLockCountdown(){if(loginCountdownTimer)clearInterval(loginCountdownTimer);updateLoginLockUI();loginCountdownTimer=setInterval(()=>{if(!root.querySelector("#auth-form")){clearInterval(loginCountdownTimer);loginCountdownTimer=null;return}updateLoginLockUI()},250)}

function configError(){
 root.innerHTML=`<section class="panel"><p class="eyebrow">Configuration requise</p><h1>Connecter MIZANE à Supabase</h1><p>Le portail SaaS est séparé de l'application comptable locale. Pour l'activer, configurez l'URL du projet et la clé publique Supabase.</p><div class="notice">Copiez <code>js/supabase-config.example.js</code> vers <code>js/supabase-config.js</code>, puis remplacez les deux valeurs d'exemple. Utilisez uniquement la clé publique anon/publishable.</div><div class="actions"><a class="button secondary" href="/index.html">Ouvrir la comptabilité locale</a></div></section>`;
}
function recoveryView(){
 root.innerHTML=`<section class="panel"><p class="eyebrow">Sécurité du compte</p><h1>Choisir un nouveau mot de passe</h1><p>Choisissez au moins 12 caractères avec une majuscule, une minuscule, un chiffre et un symbole.</p><form id="recovery-form"><div class="field"><label for="new-password">Nouveau mot de passe</label><input id="new-password" type="password" minlength="12" autocomplete="new-password" required></div><div class="field"><label for="confirm-password">Confirmer le mot de passe</label><input id="confirm-password" type="password" minlength="12" autocomplete="new-password" required></div><p class="notice hidden" data-error></p><button type="submit">Enregistrer le nouveau mot de passe</button></form></section>`;
}
function authView(mode="login"){
 const signup=mode==="signup";
 if(loginCountdownTimer){clearInterval(loginCountdownTimer);loginCountdownTimer=null;}
 root.innerHTML=`<section class="panel"><p class="eyebrow">MIZANE · Compte utilisateur unique</p><h1>${signup?"Créer votre compte":"Connexion à votre espace"}</h1><p>Un seul compte peut accéder à plusieurs entreprises, avec un rôle indépendant dans chacune.</p><div class="tabs"><button data-mode="login" aria-pressed="${!signup}">Connexion</button><button class="secondary" data-mode="signup" aria-pressed="${signup}">Créer un compte</button></div><form id="auth-form"><div class="field ${signup?"":"hidden"}" id="name-field"><label for="display-name">Nom complet</label><input id="display-name" autocomplete="name" maxlength="100" ${signup?"required":"disabled"}></div><div class="field"><label for="email">Adresse e-mail</label><input id="email" type="email" autocomplete="email" required></div><div class="field"><label for="password">Mot de passe</label><input id="password" type="password" minlength="${signup?12:8}" autocomplete="${signup?"new-password":"current-password"}" required>${signup?`<div class="password-guidance" id="password-guidance" aria-live="polite"><p>Votre mot de passe doit respecter les critères suivants :</p><ul><li data-password-rule="length">Au moins 12 caractères</li><li data-password-rule="lower">Une lettre minuscule (a-z)</li><li data-password-rule="upper">Une lettre majuscule (A-Z)</li><li data-password-rule="number">Un chiffre (0-9)</li><li data-password-rule="symbol">Un caractère spécial (ex. @, #, !, $)</li></ul></div>`:""}</div><p class="notice hidden" data-error></p><p id="login-lockout" class="notice lockout-notice hidden" role="status" aria-live="polite"></p><div class="actions"><button type="submit">${signup?"Créer mon compte":"Se connecter"}</button><button type="button" class="secondary" data-action="forgot">Mot de passe oublié</button></div></form><p class="muted">L'application comptable locale reste accessible indépendamment du compte SaaS.</p><a href="/index.html">← Retour à la comptabilité locale</a></section>`;
 if(!signup)startLoginLockCountdown();
}
function dashboardView(){
 const active=memberships.find(x=>x.company.id===activeCompanyId);
 const dashboardContent=`<section class="panel"><div class="topline"><div><p class="eyebrow">Espace personnel</p><h1>Bonjour, ${esc(session.user.user_metadata?.display_name||session.user.email)}</h1><p class="muted">${esc(session.user.email)}</p></div><button class="secondary" data-action="logout">Déconnexion</button></div><p>Vos entreprises et vos autorisations sont gérées séparément. Changer d'entreprise ne nécessite pas de déconnexion.</p></section>
 <section class="panel"><div class="topline"><h2>Mes entreprises</h2><button data-action="show-create">＋ Créer une entreprise</button></div><div class="company-list">${memberships.length?memberships.map(({company,role,status})=>`<article class="company ${company.id===activeCompanyId?"active":""}"><div class="topline"><h3>${esc(company.legal_name)}</h3><span class="role">${esc(roleLabel(role))}</span></div><p class="company-meta">${esc(company.country_code)} · ${esc(company.base_currency)} · ${esc(company.accounting_standard)}</p><p class="company-meta">Statut : ${esc(status==="active"?"Actif":"Suspendu")}</p><button class="${company.id===activeCompanyId?"":"secondary"}" data-action="select-company" data-id="${company.id}" ${status!=="active"?"disabled":""}>${company.id===activeCompanyId?"Entreprise active":"Ouvrir cet espace"}</button></article>`).join(""):`<div class="empty">Aucune entreprise associée à ce compte. Créez votre premier espace ou acceptez une invitation.</div>`}</div></section>
 ${active?`<section class="panel"><p class="eyebrow">Espace sélectionné</p><h2>${esc(active.company.legal_name)}</h2><p>Votre rôle : <strong>${esc(roleLabel(active.role))}</strong>. La sélection est mémorisée sur cet appareil.</p><div class="actions"><a class="button" href="/index.html">Ouvrir la comptabilité locale</a><button class="secondary" data-action="show-invite" ${active.role!=="admin"?"disabled":""}>Inviter un collaborateur</button></div><section class="sync-panel" aria-labelledby="sync-heading"><div class="topline"><h3 id="sync-heading">Synchronisation comptable</h3><span class="role">${accountingCloudReady ? "Cloud initialisé" : "Import initial requis"}</span></div>
 <p class="muted">${accountingCloudReady ? "Votre comptabilité est reliée au cloud. Vous pouvez envoyer vos changements locaux et récupérer ceux des autres appareils." : "L'espace cloud existe, mais il ne contient pas encore votre comptabilité. Lancez l'import initial depuis l'appareil qui contient vos données."}</p>
 ${accountingCloudReady && ["admin","accountant","reader"].includes(active.role) ? `<div class="actions"><button data-action="sync-accounting">⇄ Synchroniser maintenant</button><button class="secondary" data-action="restore-cloud">Récupérer les données du cloud sur cet appareil</button></div><p class="muted">La récupération remplace les données comptables locales de cet appareil par la copie cloud. Une sauvegarde JSON locale sera téléchargée avant l’opération. Cette action ne transmet aucune donnée locale au cloud.</p><p class="muted">Les modifications simultanées sont signalées sans écrasement automatique.</p>` : ""}
 ${!accountingCloudReady && ["admin","accountant"].includes(active.role) ? `<div class="actions"><button data-action="import-accounting">Préparer l'import initial de cette comptabilité</button></div>` : ""}
 ${!accountingCloudReady && active.role==="reader" ? `<p class="muted">Un administrateur ou un comptable doit effectuer le premier import.</p>` : ""}
 </section>
 ${active.role==="admin" ? `<div class="danger-zone"><h3>Zone de danger</h3><p class="muted">Supprimer cette entreprise effacera définitivement ses écritures, tiers, immobilisations, paramètres, invitations, justificatifs fiscaux et accès des collaborateurs. Les autres entreprises et les comptes utilisateurs ne seront pas supprimés.</p><button class="danger" data-action="delete-company">Supprimer cette entreprise</button></div>` : ""}</section>`: ""}
 <section class="panel"><h2>Accepter une invitation</h2><form id="accept-form"><div class="field"><label for="invite-token">Jeton d'invitation</label><input id="invite-token" autocomplete="off" minlength="64" maxlength="64" required placeholder="Coller le jeton reçu de l'administrateur"></div><button type="submit">Accepter l'invitation</button><p class="muted">Vous devez être connecté avec l'adresse e-mail à laquelle l'invitation a été envoyée.</p></form></section>
 <section id="create-panel" class="panel hidden"><h2>Créer une entreprise</h2><form id="create-form" class="form-grid">
 <div class="field full"><label for="legal-name">Raison sociale</label><input id="legal-name" required minlength="2" maxlength="180"></div>
 <div class="field"><label for="country">Code pays (2 lettres)</label><input id="country" value="MA" pattern="[A-Za-z]{2}" required></div>
 <div class="field"><label for="currency">Devise (3 lettres)</label><input id="currency" value="MAD" pattern="[A-Za-z]{3}" required></div>
 <div class="field"><label for="standard">Référentiel comptable</label><select id="standard"><option value="CGNC">CGNC — Maroc</option><option value="SYSCOHADA">SYSCOHADA</option><option value="PCG">PCG — France</option></select></div>
 <div class="field"><label for="timezone">Fuseau horaire</label><input id="timezone" value="Africa/Casablanca" required></div>
 <div class="field full actions"><button type="submit">Créer l'espace</button><button type="button" class="secondary" data-action="hide-create">Annuler</button></div><p class="notice hidden" data-error></p></form></section>
 <section id="invite-panel" class="panel hidden"><h2>Inviter un collaborateur</h2><form id="invite-form"><div class="field"><label for="invite-email">E-mail du collaborateur</label><input id="invite-email" type="email" required></div><div class="field"><label for="invite-role">Rôle</label><select id="invite-role"><option value="accountant">Comptable</option><option value="reader">Lecteur</option></select></div><button type="submit">Créer l'invitation</button><p class="muted">MIZANE créera un lien sécurisé que vous pourrez copier et transmettre vous-même (WhatsApp, SMS ou autre). Le lien expire après 7 jours et ne peut être utilisé qu'une seule fois.</p><div id="invite-result" class="notice hidden"></div></form></section>
 ${active&&active.role==="admin"?"<section class=\"panel\"><div class=\"topline\"><div><p class=\"eyebrow\">Administration</p><h2>Collaborateurs</h2></div><button class=\"secondary\" data-action=\"reload-management\">Actualiser</button></div><p class=\"muted\">Les changements de rôle et de statut s’appliquent uniquement à cette entreprise. Le dernier administrateur actif ne peut pas être retiré ni rétrogradé.</p><div id=\"members-list\" class=\"empty\">Chargement des membres…</div><h2 style=\"margin-top:24px\">Invitations en attente</h2><div id=\"invitations-list\" class=\"empty\">Chargement des invitations…</div></section>":""}`;
 const sidebar=active&&["admin","accountant"].includes(active.role)?`<aside class="portal-sidebar" aria-label="Navigation des travaux"><p class="portal-sidebar-label">ESPACE COMPTABLE</p><button class="portal-side-link" data-action="show-dashboard">Vue générale</button><button class="portal-side-link" data-action="show-work">Mes travaux</button><button class="portal-side-link" data-action="show-history">Historique des actions</button></aside>`:"";
 root.innerHTML=`<div class="portal-layout ${sidebar?"has-sidebar":"no-sidebar"}">${sidebar}<div class="portal-content">${dashboardContent}<section id="workspace-panel" class="panel hidden" aria-live="polite"></section></div></div>`;
}
async function importAccountingSnapshot(button){
 const active=memberships.find(m=>m.company.id===activeCompanyId);
 if(!active||!["admin","accountant"].includes(active.role))throw new Error("Droits administrateur ou comptable requis.");
 let raw=localStorage.getItem("mizane_v1");
 if(!raw)throw new Error("Aucune comptabilité locale n'a été trouvée sur cet appareil.");
 let snapshot;
 try{snapshot=JSON.parse(raw)}catch{throw new Error("Les données comptables locales sont illisibles. Exportez une sauvegarde et vérifiez-la avant de continuer.")}
 if(!snapshot||typeof snapshot!=="object"||!snapshot.settings||!Array.isArray(snapshot.entries)){
  throw new Error("La structure de la comptabilité locale n'est pas reconnue.");
 }
 if(snapshot.thirds!=null&&!Array.isArray(snapshot.thirds))throw new Error("La liste des tiers locaux est invalide.");
 if(snapshot.assets!=null&&!Array.isArray(snapshot.assets))throw new Error("La liste des immobilisations locales est invalide.");
 const makeUid=()=>globalThis.crypto?.randomUUID?globalThis.crypto.randomUUID():([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
 const ensureIds=items=>{for(const item of items||[])if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(item.client_uid||"")))item.client_uid=makeUid();};
 ensureIds(snapshot.settings.customAccounts);ensureIds(snapshot.thirds);ensureIds(snapshot.assets);ensureIds(snapshot.entries);
 raw=JSON.stringify(snapshot);
 localStorage.setItem("mizane_v1",raw);
 const localName=String(snapshot.settings.companyName||"Entreprise locale");
 const cloudName=active.company.legal_name;
 const mismatch=localName.trim().toLowerCase()!==cloudName.trim().toLowerCase();
 const details=[
  "Vous allez importer une copie initiale de la comptabilité de cet appareil vers l'entreprise cloud sélectionnée.",
  "",
  "Entreprise locale : "+localName,
  "Entreprise cloud : "+cloudName,
  "Écritures : "+snapshot.entries.length,
  "Tiers : "+(snapshot.thirds||[]).length,
  "Immobilisations : "+(snapshot.assets||[]).length,
  "",
  mismatch ? "ATTENTION : les noms des deux entreprises sont différents. Vérifiez que vous avez sélectionné le bon espace." : "",
  "Une sauvegarde JSON sera téléchargée avant l'envoi. Les clés API IA ne seront pas transférées.",
  "Cet import est unique : il ne met pas encore en place une synchronisation continue.",
  "Continuer ?"
 ].filter(Boolean).join("\n");
 if(!confirm(details))return;
 const backup=new Blob([raw],{type:"application/json"});
 const link=document.createElement("a");
 const backupUrl=URL.createObjectURL(backup);
 link.href=backupUrl;
 link.download="mizane-sauvegarde-avant-cloud-"+new Date().toISOString().slice(0,10)+".json";
 document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(backupUrl),5000);
 busy(button,true);
 try{
  const {data,error}=await supabase.functions.invoke("sync-accounting",{
   body:{company_id:activeCompanyId,snapshot}
  });
  if(error){
   let message=error.message||"Échec de l'import comptable.";
   try{
    const response=error.context;
    const body=response&&typeof response.clone==="function"?await response.clone().json():null;
    if(body?.error)message=body.error;
   }catch{}
   throw new Error(message);
  }
  if(data?.imported!==true)throw new Error("Le serveur n'a pas confirmé l'import comptable.");
  await refresh();
  // La première lecture cloud vérifie l'import et établit le shadow local.
  const initialSync = await syncAccounting(supabase, activeCompanyId, active.role);
  bindCompanyStorage(activeCompanyId, session.user.id);
  toast("Import initial terminé et espace local associé : "+data.entries+" écriture(s), "+data.lines+" ligne(s), "+data.thirds+" tiers et "+data.assets+" immobilisation(s).");
  return initialSync;
 }finally{busy(button,false)}
}
async function restoreCloudToThisDevice(button){
 const active=memberships.find(m=>m.company.id===activeCompanyId);
 if(!active||active.status!=="active")throw new Error("Vous devez être membre actif de cette entreprise.");
 const raw=localStorage.getItem("mizane_v1");
 const details=[
  "Cette opération va remplacer la comptabilité locale de cet appareil par la copie cloud de l'entreprise sélectionnée.",
  "",
  "Entreprise : "+active.company.legal_name,
  "Sauvegarde locale : "+(raw?"disponible et téléchargée avant restauration":"aucune donnée locale trouvée"),
  "",
  "Aucune donnée locale ne sera envoyée au cloud.",
  "Les anciennes données locales seront conservées dans un fichier JSON téléchargé.",
  "Continuer ?"
 ].join("\\n");
 if(!confirm(details))return;
 if(raw){
  const blob=new Blob([raw],{type:"application/json"});
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download="mizane-sauvegarde-locale-avant-restauration-"+new Date().toISOString().slice(0,10)+".json";
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
 }
 busy(button,true);
 try{
  const result=await restoreAccountingFromCloud(supabase,activeCompanyId);
  // L'appareil ne devient associé à l'entreprise qu'après une restauration cloud complète.
  bindCompanyStorage(activeCompanyId,session.user.id);
  toast("Récupération terminée : "+result.entries+" écriture(s), "+result.thirds+" tiers, "+result.assets+" immobilisation(s) et "+result.customAccounts+" compte(s) personnalisé(s).");
  // Revenir à l'application comptable après avoir établi l'association vérifiée.
  window.location.assign("/index.html");
 }finally{busy(button,false)}
}
async function refresh(){
 const {data: rows,error}=await supabase.from("company_memberships").select("company_id,role,status").eq("user_id",session.user.id).eq("status","active");
 if(error) throw error;
 const ids=(rows||[]).map(x=>x.company_id);
 let companies=[];
 if(ids.length){const result=await supabase.from("companies").select("id,legal_name,country_code,base_currency,accounting_standard,timezone").in("id",ids);if(result.error)throw result.error;companies=result.data||[]}
 const byId=new Map(companies.map(c=>[c.id,c]));
 memberships=(rows||[]).filter(m=>byId.has(m.company_id)).map(m=>({company:byId.get(m.company_id),role:m.role,status:m.status}));
 const sessionLock=getCompanySessionLock();
 if(sessionLock){
  const lockedMembership=memberships.find(m=>m.company.id===sessionLock.companyId&&m.status==="active");
  const canUnlock=!!lockedMembership&&["admin","accountant"].includes(lockedMembership.role);
  // L'autorisation active sur cette entreprise suffit, même si un autre
  // administrateur/comptable reprend le compte après la déconnexion.
  if(!canUnlock||!unlockCompanyStorage(session.user.id,sessionLock.companyId,{authorizedCompanyMember:true})){
   activeCompanyId="";
   localStorage.removeItem(ACTIVE_COMPANY_KEY);
   localStorage.removeItem(ACTIVE_USER_KEY);
   // Un compte non autorisé ne doit jamais rester connecté sur l'écran verrouillé :
   // on revient au formulaire de connexion pour permettre l'essai du compte administrateur.
   await supabase.auth.signOut();
   session=null;
   memberships=[];
   authView("login");
   toast("Accès comptable verrouillé. Connectez-vous avec le compte administrateur ou comptable autorisé.");
   return;
  }
  activeCompanyId=sessionLock.companyId;
 }else if(!memberships.some(m=>m.company.id===activeCompanyId))activeCompanyId=memberships[0]?.company.id||"";
 localStorage.setItem(ACTIVE_USER_KEY,session.user.id);
 if(activeCompanyId)localStorage.setItem(ACTIVE_COMPANY_KEY,activeCompanyId);else localStorage.removeItem(ACTIVE_COMPANY_KEY);
 accountingCloudReady = false;
 if(activeCompanyId){
  const {data: cloudSettings,error: cloudError}=await supabase.from("accounting_settings").select("company_id").eq("company_id",activeCompanyId).maybeSingle();
  if(cloudError)throw cloudError;
  accountingCloudReady=!!cloudSettings;
 }
 dashboardView();
 if(memberships.some(m=>m.company.id===activeCompanyId&&m.role==="admin"))loadManagement();
 if(pendingInvitationToken){const tokenField=root.querySelector("#invite-token");if(tokenField){tokenField.value=pendingInvitationToken;toast("Invitation détectée : connectez-vous avec l’adresse destinataire, puis acceptez-la.")}}
}
async function edge(action,payload={}){
 const invoke = () => supabase.functions.invoke("manage-company-members",{body:{action,...payload}});
 let result = await invoke();
 // Une Edge Function peut renvoyer 401 avant que le client ait renouvelé
 // un access token devenu invalide. On renouvelle la session une seule fois,
 // puis on rejoue exactement la même action et le même payload.
 const status = Number(result.error?.context?.status ?? result.error?.status ?? 0);
 if(result.error && status === 401){
  const {data: refreshed,error: refreshError}=await supabase.auth.refreshSession();
  if(!refreshError && refreshed?.session){
   session=refreshed.session;
   result=await invoke();
  }
 }
 const {data,error}=result;
 if(error){
  let serverMessage="";
  try{
   const response=error.context;
   const body=response&&typeof response.clone==="function"?await response.clone().json():null;
   serverMessage=body?.error||body?.message||"";
  }catch{}
  if(error.context?.status===409&&/already a member of this company/i.test(serverMessage)){
   throw new Error("Vous êtes déjà membre de cette entreprise. Vous pouvez accéder directement à votre espace sans accepter une nouvelle invitation.");
  }
  throw new Error(serverMessage||error.message||"Une erreur est survenue lors de l’opération.");
 }
 if(data?.error)throw new Error(data.error);return data;
}

function auditActionLabel(action){
 const labels={"accounting.snapshot_imported":"Import initial de la comptabilité","accounting.incremental_sync":"Synchronisation comptable","invitation.created":"Invitation créée","invitation.revoked":"Invitation révoquée","member.role_changed":"Rôle du collaborateur modifié","member.suspended":"Collaborateur suspendu","member.reactivated":"Collaborateur réactivé","member.removed":"Collaborateur retiré"};
 if(labels[action])return labels[action];
 const match=String(action||"").match(/^accounting\.(entry|third|asset|custom_account|settings)\.(upsert|delete)$/);
 if(match){const entities={entry:"Écriture comptable",third:"Tiers",asset:"Immobilisation",custom_account:"Compte personnalisé",settings:"Paramètres comptables"};return entities[match[1]]+(match[2]==="delete"?" supprimé(e)":" créé(e) ou modifié(e)");}
 return String(action||"Action").replaceAll("."," · ");
}
function auditSummary(details){
 const d=details||{};
 if(d.summary&&typeof d.summary==="object"){const s=d.summary;return [s.date,s.journal,s.reference,s.name,s.code,s.label,s.amount!=null?new Intl.NumberFormat("fr-FR",{maximumFractionDigits:2}).format(Number(s.amount)):""].filter(Boolean).join(" · ");}
 if(d.entries!=null)return [d.entries+" écriture(s)",d.lines+" ligne(s)",d.thirds+" tiers",d.assets+" immobilisation(s)",d.custom_accounts+" compte(s)"].join(" · ");
 if(d.operations!=null)return d.operations+" opération(s) comptable(s)";
 if(d.email)return d.email+(d.role?" · "+roleLabel(d.role):"");
 if(d.from||d.to)return [d.from,d.to].filter(Boolean).join(" → ");
 return "";
}
async function loadWorkspace(mode){
 const active=memberships.find(m=>m.company.id===activeCompanyId);
 if(!active||!["admin","accountant"].includes(active.role))throw new Error("Cette rubrique est réservée à l’administrateur et au comptable.");
 const panel=root.querySelector("#workspace-panel");if(!panel)return;
 panel.classList.remove("hidden");
 panel.innerHTML='<p class="eyebrow">'+(mode==="work"?"MES TRAVAUX":"JOURNAL DE L’ENTREPRISE")+'</p><h2>'+(mode==="work"?"Mes travaux":"Historique des actions")+'</h2><p class="muted">Chargement des données…</p>';
 try{
  const result=await edge("list_audit_history",{company_id:activeCompanyId,scope:mode==="work"?"mine":"all"});
  let rows=result.logs||[];
  if(mode==="work")rows=rows.filter(row=>String(row.action||"").startsWith("accounting.")&&row.action!=="accounting.incremental_sync");
  const heading=mode==="work"?"Vos opérations comptables enregistrées dans cet espace.":"Les actions effectuées par les membres de cette entreprise.";
  panel.innerHTML='<div class="topline"><div><p class="eyebrow">'+(mode==="work"?"MES TRAVAUX":"JOURNAL DE L’ENTREPRISE")+'</p><h2>'+(mode==="work"?"Mes travaux":"Historique des actions")+'</h2><p class="muted">'+heading+'</p></div><div class="actions"><a class="button secondary" href="index.html#entries">Ouvrir la comptabilité</a><button class="secondary" data-action="'+(mode==="work"?"show-work":"show-history")+'">Actualiser</button></div></div>'+
   (rows.length?'<div class="history-list">'+rows.map(row=>{const summary=auditSummary(row.details);const actor=row.actor_name||row.actor_email||"Utilisateur";return '<article class="history-item"><div class="history-item-main"><strong>'+esc(auditActionLabel(row.action))+'</strong>'+(summary?'<p class="history-summary">'+esc(summary)+'</p>':'')+'<p class="company-meta">'+(mode==="history"?esc(actor)+" · ":"")+esc(new Date(row.created_at).toLocaleString("fr-FR"))+'</p></div><span class="role">'+esc(row.entity_type||"activité")+'</span></article>';}).join("")+'</div>':'<div class="empty">'+(mode==="work"?"Aucun travail comptable n’a encore été enregistré pour votre compte.":"Aucune action n’a encore été enregistrée pour cette entreprise.")+'</div>');
  panel.scrollIntoView({behavior:"smooth",block:"start"});
 }catch(error){panel.innerHTML='<p class="eyebrow">Historique</p><h2>Impossible de charger les données</h2><p class="notice error">'+esc(error.message)+'</p>';}
}

async function loadManagement(){
 const active=memberships.find(m=>m.company.id===activeCompanyId);
 if(!active||active.role!=="admin")return;
 const membersNode=root.querySelector("#members-list"), invitesNode=root.querySelector("#invitations-list");
 if(!membersNode||!invitesNode)return;
 membersNode.textContent="Chargement…";invitesNode.textContent="Chargement…";
 try{
  const results=await Promise.all([edge("list_company_members",{company_id:activeCompanyId}),edge("list_company_invitations",{company_id:activeCompanyId})]);
  const memberData=results[0],inviteData=results[1];
  membersNode.innerHTML=memberData.members.length?memberData.members.map(m=>'<article class="company"><div class="topline"><div><strong>'+esc(m.display_name||m.email||"Compte utilisateur")+'</strong><div class="company-meta">'+esc(m.email||"Adresse non disponible")+'</div></div><span class="role">'+esc(m.status==="active"?"Actif":"Suspendu")+'</span></div><div class="form-grid"><div class="field"><label>Rôle dans cette entreprise</label><select data-action="change-role" data-user-id="'+esc(m.user_id)+'" '+(m.user_id===session.user.id?"disabled":"")+'><option value="admin" '+(m.role==="admin"?"selected":"")+'>Administrateur</option><option value="accountant" '+(m.role==="accountant"?"selected":"")+'>Comptable</option><option value="reader" '+(m.role==="reader"?"selected":"")+'>Lecteur</option></select></div><div class="field"><label>Statut</label><button class="secondary" data-action="toggle-member-status" data-user-id="'+esc(m.user_id)+'" data-status="'+esc(m.status)+'" '+(m.user_id===session.user.id?"disabled":"")+'>'+(m.status==="active"?"Suspendre":"Réactiver")+'</button></div></div><div class="actions"><button class="danger" data-action="remove-member" data-user-id="'+esc(m.user_id)+'" '+(m.user_id===session.user.id?"disabled":"")+'>Retirer de l’entreprise</button></div></article>').join(""):"<div class=\"empty\">Aucun membre trouvé.</div>";
  invitesNode.innerHTML=inviteData.invitations.length?inviteData.invitations.map(i=>'<article class="company"><div class="topline"><strong>'+esc(i.email)+'</strong><span class="role">'+esc(roleLabel(i.role))+'</span></div><p class="company-meta">Expire le '+esc(new Date(i.expires_at).toLocaleString("fr-FR"))+'</p><button class="danger" data-action="revoke-invitation" data-invitation-id="'+esc(i.id)+'">Révoquer l’invitation</button></article>').join(""):"<div class=\"empty\">Aucune invitation en attente.</div>";
 }catch(error){membersNode.textContent=error.message;invitesNode.textContent="Impossible de charger les invitations."}
}
root.addEventListener("input",(e)=>{
 if(e.target?.id!=="password")return;
 const value=e.target.value;
 const checks={length:value.length>=12,lower:/[a-z]/.test(value),upper:/[A-Z]/.test(value),number:/[0-9]/.test(value),symbol:/[^A-Za-z0-9]/.test(value)};
 for(const [rule,valid] of Object.entries(checks)){
  const item=root.querySelector(`[data-password-rule="${rule}"]`);
  if(item){item.classList.toggle("valid",valid);item.setAttribute("aria-label",item.textContent+(valid?" : satisfait":" : non satisfait"));}
 }
});
root.addEventListener("click",async(e)=>{
 const mode=e.target.closest("[data-mode]");if(mode){authView(mode.dataset.mode);return}
 const button=e.target.closest("[data-action]");if(!button)return;
 const action=button.dataset.action;
 try{
  if(action==="show-dashboard"){const panel=root.querySelector("#workspace-panel");if(panel)panel.classList.add("hidden");return;}
  if(action==="show-work"){await loadWorkspace("work");return;}
  if(action==="show-history"){await loadWorkspace("history");return;}
  if(action==="forgot"){const email=root.querySelector("#email")?.value.trim();if(!email)throw new Error("Saisissez d'abord votre adresse e-mail.");const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});if(error)throw error;toast("E-mail de réinitialisation envoyé si le compte existe.");}
  if(action==="logout"){lockCompanyStorage(session?.user?.id);const {error}=await supabase.auth.signOut();if(error)throw error;session=null;memberships=[];localStorage.removeItem(ACTIVE_COMPANY_KEY);localStorage.removeItem(ACTIVE_USER_KEY);authView();}
  if(action==="show-create")root.querySelector("#create-panel").classList.remove("hidden");
  if(action==="hide-create")root.querySelector("#create-panel").classList.add("hidden");
  if(action==="show-invite")root.querySelector("#invite-panel").classList.remove("hidden");
  if(action==="import-accounting"){
   const localStatus=getCompanyStorageStatus();
   if(localStatus.reason==="mismatch")throw new Error("Les données locales sont déjà associées à une autre entreprise ou à un autre compte. Récupérez d'abord les données cloud de l'entreprise sélectionnée ; l'import croisé est bloqué pour éviter tout mélange.");
   await importAccountingSnapshot(button);return;
  }
  if(action==="restore-cloud"){await restoreCloudToThisDevice(button);return;}
  if(action==="sync-accounting"){
   const localStatus=getCompanyStorageStatus();
   if(!localStatus.ok||localStatus.companyId!==activeCompanyId||localStatus.userId!==session.user.id)throw new Error("Cet appareil n'est pas encore associé de manière vérifiée à cette entreprise. Récupérez d'abord les données cloud sur cet appareil.");
   busy(button,true);
   try{
    const result=await syncAccounting(supabase,activeCompanyId,memberships.find(m=>m.company.id===activeCompanyId)?.role);
    await refresh();
    if(result.initialized)toast("Première synchronisation terminée : "+result.pushed+" opération(s) envoyée(s), "+result.pulled+" élément(s) récupéré(s).");
    else toast("Synchronisation terminée : "+result.pushed+" opération(s) envoyée(s), "+result.pulled+" élément(s) récupéré(s).");
   }finally{busy(button,false)}
   return;
  }
  if(action==="delete-company"){
   const active=memberships.find(m=>m.company.id===activeCompanyId);
   if(!active||active.role!=="admin")throw new Error("Seul un administrateur actif peut supprimer cette entreprise.");
   const expected=active.company.legal_name;
   const typed=prompt("ATTENTION : cette opération effacera définitivement toutes les données de l'entreprise, y compris les écritures comptables.\n\nPour confirmer, saisissez exactement le nom suivant :\n"+expected);
   if(typed===null)return;
   if(typed.trim()!==expected)throw new Error("Le nom saisi ne correspond pas. Aucune suppression n'a été effectuée.");
   if(!confirm("Dernière confirmation : supprimer définitivement « "+expected+" » et toutes ses données ?"))return;
   busy(button,true);
   try{
    await edge("delete_company",{company_id:activeCompanyId});
    activeCompanyId="";
    localStorage.removeItem(ACTIVE_COMPANY_KEY);
    accountingCloudReady=false;
    await refresh();
    toast("Entreprise supprimée définitivement.");
   }finally{busy(button,false)}
   return;
  }
  if(action==="reload-management")await loadManagement();
  if(action==="toggle-member-status"){const next=button.dataset.status==="active"?"suspended":"active";if(!confirm(next==="suspended"?"Suspendre ce collaborateur ?":"Réactiver ce collaborateur ?"))return;await edge("set_member_status",{company_id:activeCompanyId,user_id:button.dataset.userId,status:next});await loadManagement();toast("Statut du collaborateur mis à jour.");}
  if(action==="remove-member"){if(!confirm("Retirer définitivement ce collaborateur de cette entreprise ?"))return;await edge("remove_member",{company_id:activeCompanyId,user_id:button.dataset.userId});await loadManagement();toast("Collaborateur retiré.");}
  if(action==="revoke-invitation"){if(!confirm("Révoquer cette invitation ? Le jeton ne pourra plus être utilisé."))return;await edge("revoke_invitation",{company_id:activeCompanyId,invitation_id:button.dataset.invitationId});await loadManagement();toast("Invitation révoquée.");}
  if(action==="select-company"){activeCompanyId=button.dataset.id;localStorage.setItem(ACTIVE_COMPANY_KEY,activeCompanyId);await refresh();}
 }catch(error){showError(error)}
});
root.addEventListener("change",async(e)=>{
 const select=e.target.closest('[data-action="change-role"]');if(!select)return;
 const nextRole=select.value;if(!confirm("Confirmer le changement de rôle pour cette entreprise ?")){await loadManagement();return}
 try{await edge("set_member_role",{company_id:activeCompanyId,user_id:select.dataset.userId,role:nextRole});await loadManagement();toast("Rôle du collaborateur mis à jour.")}catch(error){showError(error);await loadManagement()}
});
root.addEventListener("submit",async(e)=>{
 e.preventDefault();const form=e.target;const submit=form.querySelector('button[type="submit"]');if(form.id==="auth-form"&&form.querySelector("#name-field")?.classList.contains("hidden")){const lock=readLoginLock(form.querySelector("#email").value.trim());if(lock.lockUntil>Date.now()){updateLoginLockUI();return}}busy(submit,true);
 try{
  if(form.id==="recovery-form"){
   const password=form.querySelector("#new-password").value;
   const confirmation=form.querySelector("#confirm-password").value;
   if(!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/.test(password))throw new Error("Le mot de passe doit contenir au moins 12 caractères, une majuscule, une minuscule, un chiffre et un symbole.");
   if(password!==confirmation)throw new Error("Les deux mots de passe ne correspondent pas.");
   const {error}=await supabase.auth.updateUser({password});if(error)throw error;
   passwordRecoveryMode=false;toast("Mot de passe mis à jour.");await refresh();
  }
  if(form.id==="auth-form"){
   const email=form.querySelector("#email").value.trim();const password=form.querySelector("#password").value;const signup=!!form.querySelector("#display-name")&&!form.querySelector("#name-field").classList.contains("hidden");
   // Apply the same strong-password rule to new accounts and password recovery.
   // Existing users can still sign in with their current password.
   if(signup&&!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}$/.test(password))throw new Error("Le mot de passe doit contenir au moins 12 caractères, une majuscule, une minuscule, un chiffre et un symbole.");
   if(signup){const display_name=form.querySelector("#display-name").value.trim();const {data,error}=await supabase.auth.signUp({email,password,options:{data:{display_name},emailRedirectTo:location.origin+location.pathname}});if(error)throw error;if(!data.session){toast("Compte créé. Vérifiez votre boîte e-mail pour confirmer l'inscription.");authView("login");return}session=data.session;await refresh();}
   else{const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error){if(error.code==="invalid_credentials"||(error.status===400&&/invalid login credentials/i.test(error.message||"")))registerLoginFailure(email);throw error;}clearLoginLock(email);session=data.session;await refresh();}
  }
  if(form.id==="create-form"){
   const {data,error}=await supabase.rpc("create_company",{p_legal_name:form.querySelector("#legal-name").value.trim(),p_country_code:form.querySelector("#country").value.toUpperCase(),p_base_currency:form.querySelector("#currency").value.toUpperCase(),p_accounting_standard:form.querySelector("#standard").value,p_timezone:form.querySelector("#timezone").value.trim()});if(error)throw error;activeCompanyId=data;await refresh();toast("Entreprise créée. Vous êtes administrateur de cet espace.");
  }
  if(form.id==="accept-form"){
   const result=await edge("accept_invitation",{invitation_token:form.querySelector("#invite-token").value.trim()});pendingInvitationToken="";activeCompanyId=result.company_id;await refresh();toast("Invitation acceptée.");
  }
  if(form.id==="invite-form"){
   const active=memberships.find(m=>m.company.id===activeCompanyId);if(!active||active.role!=="admin")throw new Error("Droits administrateur requis.");
   const result=await edge("create_invitation",{company_id:activeCompanyId,email:form.querySelector("#invite-email").value.trim(),role:form.querySelector("#invite-role").value,delivery:"manual"});
   const target=root.querySelector("#invite-result");
   const expires=new Date(result.invitation.expires_at).toLocaleString("fr-FR");
   const link=esc(result.invitation_url);
   target.innerHTML=`Invitation créée pour <strong>${esc(result.invitation.email)}</strong>. Elle expire le ${esc(expires)}.<div class="field" style="margin-top:12px"><label for="created-invitation-link">Lien à transmettre au collaborateur</label><input id="created-invitation-link" type="url" readonly value="${link}"></div><div class="actions"><button type="button" data-action="copy-invitation-link" data-link="${link}">Copier le lien</button><a class="button secondary" href="${link}" target="_blank" rel="noopener">Ouvrir le lien</a></div><p class="muted">Transmettez ce lien uniquement à ${esc(result.invitation.email)}.</p>`;
   target.classList.remove("hidden");form.reset();await loadManagement();
  }
 }catch(error){showError(error)}finally{busy(submit,false);if(form.id==="auth-form"&&form.querySelector("#name-field")?.classList.contains("hidden"))updateLoginLockUI()}
});
root.addEventListener("click",async(e)=>{const b=e.target.closest('[data-action="copy-invitation-link"]');if(b){try{await navigator.clipboard.writeText(b.dataset.link);toast("Lien d’invitation copié.")}catch{const field=root.querySelector("#created-invitation-link");field?.select();toast("Sélectionnez le lien puis copiez-le manuellement.")}}});
async function start(){
 if(!SUPABASE_URL.startsWith("https://")||SUPABASE_URL.includes("VOTRE-PROJET")||!SUPABASE_ANON_KEY||SUPABASE_ANON_KEY.includes("VOTRE_CLE")){configError();return}
 supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 supabase.auth.onAuthStateChange((event,next)=>{
  const previousUserId=session?.user?.id;
  if(!next&&previousUserId)lockCompanyStorage(previousUserId);
  session=next;
  if(event==="PASSWORD_RECOVERY" || (recoveryLinkDetected && next)){passwordRecoveryMode=true;recoveryView();return}
  if(!session){passwordRecoveryMode=false;memberships=[];localStorage.removeItem(ACTIVE_COMPANY_KEY);localStorage.removeItem(ACTIVE_USER_KEY);authView()}
 });
 const {data,error}=await supabase.auth.getSession();if(error)throw error;session=data.session;
 const hashParams=new URLSearchParams(location.hash.slice(1));
 if(passwordRecoveryMode || (recoveryLinkDetected && session) || (hashParams.get("type")==="recovery" && session)){passwordRecoveryMode=true;recoveryView();return}
 if(session)await refresh();else authView(new URLSearchParams(location.search).has("signup")?"signup":"login");
 if(pendingInvitationToken){const field=root.querySelector("#invite-token");if(field){field.value=pendingInvitationToken;toast("Invitation détectée : connectez-vous avec l’adresse destinataire, puis acceptez-la.")}}
}
start().catch(showError);
