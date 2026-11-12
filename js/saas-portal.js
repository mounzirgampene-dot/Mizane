import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

const root = document.querySelector("#portal");
const toastNode = document.querySelector("#portal-toast");
const ACTIVE_COMPANY_KEY = "mizane_active_company_v1";
let supabase;
let session = null;
let memberships = [];
let activeCompanyId = localStorage.getItem(ACTIVE_COMPANY_KEY) || "";

const esc = (value = "") => String(value).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const roleLabel = (role) => ({admin:"Administrateur",accountant:"Comptable",reader:"Lecteur"}[role] || role);
function toast(message){toastNode.textContent=message;toastNode.classList.add("show");setTimeout(()=>toastNode.classList.remove("show"),3500)}
function showError(error){const msg=error?.message||String(error);toast(msg);const box=root.querySelector("[data-error]");if(box){box.textContent=msg;box.classList.remove("hidden")}}
function busy(button,on){if(button){button.disabled=on;button.dataset.oldText ||= button.textContent;button.textContent=on?"Patientez…":button.dataset.oldText}}
function configError(){
 root.innerHTML=`<section class="panel"><p class="eyebrow">Configuration requise</p><h1>Connecter MIZANE à Supabase</h1><p>Le portail SaaS est séparé de l'application comptable locale. Pour l'activer, configurez l'URL du projet et la clé publique Supabase.</p><div class="notice">Copiez <code>js/supabase-config.example.js</code> vers <code>js/supabase-config.js</code>, puis remplacez les deux valeurs d'exemple. Utilisez uniquement la clé publique anon/publishable.</div><div class="actions"><a class="button secondary" href="index.html">Ouvrir la comptabilité locale</a></div></section>`;
}
function authView(mode="login"){
 const signup=mode==="signup";
 root.innerHTML=`<section class="panel"><p class="eyebrow">MIZANE · Compte utilisateur unique</p><h1>${signup?"Créer votre compte":"Connexion à votre espace"}</h1><p>Un seul compte peut accéder à plusieurs entreprises, avec un rôle indépendant dans chacune.</p><div class="tabs"><button data-mode="login" aria-pressed="${!signup}">Connexion</button><button class="secondary" data-mode="signup" aria-pressed="${signup}">Créer un compte</button></div><form id="auth-form"><div class="field ${signup?"":"hidden"}" id="name-field"><label for="display-name">Nom complet</label><input id="display-name" autocomplete="name" maxlength="100" ${signup?"required":"disabled"}></div><div class="field"><label for="email">Adresse e-mail</label><input id="email" type="email" autocomplete="email" required></div><div class="field"><label for="password">Mot de passe</label><input id="password" type="password" minlength="8" autocomplete="${signup?"new-password":"current-password"}" required></div><p class="notice hidden" data-error></p><div class="actions"><button type="submit">${signup?"Créer mon compte":"Se connecter"}</button><button type="button" class="secondary" data-action="forgot">Mot de passe oublié</button></div></form><p class="muted">L'application comptable locale reste accessible indépendamment du compte SaaS.</p><a href="index.html">← Retour à la comptabilité locale</a></section>`;
}
function dashboardView(){
 const active=memberships.find(x=>x.company.id===activeCompanyId);
 root.innerHTML=`<section class="panel"><div class="topline"><div><p class="eyebrow">Espace personnel</p><h1>Bonjour, ${esc(session.user.user_metadata?.display_name||session.user.email)}</h1><p class="muted">${esc(session.user.email)}</p></div><button class="secondary" data-action="logout">Déconnexion</button></div><p>Vos entreprises et vos autorisations sont gérées séparément. Changer d'entreprise ne nécessite pas de déconnexion.</p></section>
 <section class="panel"><div class="topline"><h2>Mes entreprises</h2><button data-action="show-create">＋ Créer une entreprise</button></div><div class="company-list">${memberships.length?memberships.map(({company,role,status})=>`<article class="company ${company.id===activeCompanyId?"active":""}"><div class="topline"><h3>${esc(company.legal_name)}</h3><span class="role">${esc(roleLabel(role))}</span></div><p class="company-meta">${esc(company.country_code)} · ${esc(company.base_currency)} · ${esc(company.accounting_standard)}</p><p class="company-meta">Statut : ${esc(status==="active"?"Actif":"Suspendu")}</p><button class="${company.id===activeCompanyId?"":"secondary"}" data-action="select-company" data-id="${company.id}" ${status!=="active"?"disabled":""}>${company.id===activeCompanyId?"Entreprise active":"Ouvrir cet espace"}</button></article>`).join(""):`<div class="empty">Aucune entreprise associée à ce compte. Créez votre premier espace ou acceptez une invitation.</div>`}</div></section>
 ${active?`<section class="panel"><p class="eyebrow">Espace sélectionné</p><h2>${esc(active.company.legal_name)}</h2><p>Votre rôle : <strong>${esc(roleLabel(active.role))}</strong>. La sélection est mémorisée sur cet appareil.</p><div class="actions"><a class="button" href="index.html">Ouvrir la comptabilité locale</a><button class="secondary" data-action="show-invite" ${active.role!=="admin"?"disabled":""}>Inviter un collaborateur</button></div><p class="muted">La comptabilité locale n'est pas encore synchronisée avec cet espace cloud. Ne saisissez pas de données de production en supposant qu'elles sont synchronisées.</p></section>`: ""}
 <section class="panel"><h2>Accepter une invitation</h2><form id="accept-form"><div class="field"><label for="invite-token">Jeton d'invitation</label><input id="invite-token" autocomplete="off" minlength="64" maxlength="64" required placeholder="Coller le jeton reçu de l'administrateur"></div><button type="submit">Accepter l'invitation</button><p class="muted">Vous devez être connecté avec l'adresse e-mail à laquelle l'invitation a été envoyée.</p></form></section>
 <section id="create-panel" class="panel hidden"><h2>Créer une entreprise</h2><form id="create-form" class="form-grid">
 <div class="field full"><label for="legal-name">Raison sociale</label><input id="legal-name" required minlength="2" maxlength="180"></div>
 <div class="field"><label for="country">Code pays (2 lettres)</label><input id="country" value="MA" pattern="[A-Za-z]{2}" required></div>
 <div class="field"><label for="currency">Devise (3 lettres)</label><input id="currency" value="MAD" pattern="[A-Za-z]{3}" required></div>
 <div class="field"><label for="standard">Référentiel comptable</label><select id="standard"><option value="CGNC">CGNC — Maroc</option><option value="SYSCOHADA">SYSCOHADA</option><option value="PCG">PCG — France</option></select></div>
 <div class="field"><label for="timezone">Fuseau horaire</label><input id="timezone" value="Africa/Casablanca" required></div>
 <div class="field full actions"><button type="submit">Créer l'espace</button><button type="button" class="secondary" data-action="hide-create">Annuler</button></div><p class="notice hidden" data-error></p></form></section>
 <section id="invite-panel" class="panel hidden"><h2>Inviter un collaborateur</h2><form id="invite-form"><div class="field"><label for="invite-email">E-mail du collaborateur</label><input id="invite-email" type="email" required></div><div class="field"><label for="invite-role">Rôle</label><select id="invite-role"><option value="accountant">Comptable</option><option value="reader">Lecteur</option></select></div><button type="submit">Créer l'invitation</button><p class="muted">L'envoi automatique par e-mail n'est pas encore activé. Un jeton à transmettre par un canal sûr sera affiché.</p><div id="invite-result" class="notice hidden"></div></form></section>`;
}
async function refresh(){
 const {data: rows,error}=await supabase.from("company_memberships").select("company_id,role,status").eq("user_id",session.user.id).eq("status","active");
 if(error) throw error;
 const ids=(rows||[]).map(x=>x.company_id);
 let companies=[];
 if(ids.length){const result=await supabase.from("companies").select("id,legal_name,country_code,base_currency,accounting_standard,timezone").in("id",ids);if(result.error)throw result.error;companies=result.data||[]}
 const byId=new Map(companies.map(c=>[c.id,c]));
 memberships=(rows||[]).filter(m=>byId.has(m.company_id)).map(m=>({company:byId.get(m.company_id),role:m.role,status:m.status}));
 if(!memberships.some(m=>m.company.id===activeCompanyId))activeCompanyId=memberships[0]?.company.id||"";
 if(activeCompanyId)localStorage.setItem(ACTIVE_COMPANY_KEY,activeCompanyId);else localStorage.removeItem(ACTIVE_COMPANY_KEY);
 dashboardView();
 const pendingToken=new URLSearchParams(location.search).get("invitation");
 if(pendingToken){const tokenField=root.querySelector("#invite-token");if(tokenField){tokenField.value=pendingToken;toast("Invitation détectée : vérifiez le jeton et acceptez-la.")}}
}
async function edge(action,payload={}){
 const {data,error}=await supabase.functions.invoke("manage-company-members",{body:{action,...payload}});
 if(error)throw error;if(data?.error)throw new Error(data.error);return data;
}
root.addEventListener("click",async(e)=>{
 const mode=e.target.closest("[data-mode]");if(mode){authView(mode.dataset.mode);return}
 const button=e.target.closest("[data-action]");if(!button)return;
 const action=button.dataset.action;
 try{
  if(action==="forgot"){const email=root.querySelector("#email")?.value.trim();if(!email)throw new Error("Saisissez d'abord votre adresse e-mail.");const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});if(error)throw error;toast("E-mail de réinitialisation envoyé si le compte existe.");}
  if(action==="logout"){const {error}=await supabase.auth.signOut();if(error)throw error;session=null;memberships=[];authView();}
  if(action==="show-create")root.querySelector("#create-panel").classList.remove("hidden");
  if(action==="hide-create")root.querySelector("#create-panel").classList.add("hidden");
  if(action==="show-invite")root.querySelector("#invite-panel").classList.remove("hidden");
  if(action==="select-company"){activeCompanyId=button.dataset.id;localStorage.setItem(ACTIVE_COMPANY_KEY,activeCompanyId);dashboardView();}
 }catch(error){showError(error)}
});
root.addEventListener("submit",async(e)=>{
 e.preventDefault();const form=e.target;const submit=form.querySelector('button[type="submit"]');busy(submit,true);
 try{
  if(form.id==="auth-form"){
   const email=form.querySelector("#email").value.trim();const password=form.querySelector("#password").value;const signup=!!form.querySelector("#display-name")&&!form.querySelector("#name-field").classList.contains("hidden");
   if(signup){const display_name=form.querySelector("#display-name").value.trim();const {data,error}=await supabase.auth.signUp({email,password,options:{data:{display_name},emailRedirectTo:location.origin+location.pathname}});if(error)throw error;if(!data.session){toast("Compte créé. Vérifiez votre boîte e-mail pour confirmer l'inscription.");authView("login");return}session=data.session;await refresh();}
   else{const {data,error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;session=data.session;await refresh();}
  }
  if(form.id==="create-form"){
   const {data,error}=await supabase.rpc("create_company",{p_legal_name:form.querySelector("#legal-name").value.trim(),p_country_code:form.querySelector("#country").value.toUpperCase(),p_base_currency:form.querySelector("#currency").value.toUpperCase(),p_accounting_standard:form.querySelector("#standard").value,p_timezone:form.querySelector("#timezone").value.trim()});if(error)throw error;activeCompanyId=data;await refresh();toast("Entreprise créée. Vous êtes administrateur de cet espace.");
  }
  if(form.id==="accept-form"){
   const result=await edge("accept_invitation",{invitation_token:form.querySelector("#invite-token").value.trim()});activeCompanyId=result.company_id;await refresh();toast("Invitation acceptée.");
  }
  if(form.id==="invite-form"){
   const active=memberships.find(m=>m.company.id===activeCompanyId);if(!active||active.role!=="admin")throw new Error("Droits administrateur requis.");
   const result=await edge("create_invitation",{company_id:activeCompanyId,email:form.querySelector("#invite-email").value.trim(),role:form.querySelector("#invite-role").value});
   const link=location.origin+location.pathname+"?invitation="+encodeURIComponent(result.invitation_token);
   const target=root.querySelector("#invite-result");target.innerHTML=`Invitation créée pour <strong>${esc(result.invitation.email)}</strong>. Expiration : ${esc(new Date(result.invitation.expires_at).toLocaleString("fr-FR"))}.<br><label>Jeton à transmettre par un canal sûr</label><input readonly value="${esc(result.invitation_token)}"><button type="button" class="secondary" data-action="copy-token">Copier le jeton</button><p class="muted">Le destinataire doit se connecter avec l'adresse e-mail indiquée, puis coller ce jeton dans « Accepter une invitation ».</p>`;target.dataset.token=result.invitation_token;target.classList.remove("hidden");
  }
 }catch(error){showError(error)}finally{busy(submit,false)}
});
root.addEventListener("click",async(e)=>{const b=e.target.closest('[data-action="copy-token"]');if(b){try{await navigator.clipboard.writeText(root.querySelector("#invite-result").dataset.token);toast("Jeton copié.")}catch{toast("Copie impossible : sélectionnez le jeton manuellement.")}}});
async function start(){
 if(!SUPABASE_URL.startsWith("https://")||SUPABASE_URL.includes("VOTRE-PROJET")||!SUPABASE_ANON_KEY||SUPABASE_ANON_KEY.includes("VOTRE_CLE")){configError();return}
 supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
 const {data,error}=await supabase.auth.getSession();if(error)throw error;session=data.session;
 if(session)await refresh();else authView(new URLSearchParams(location.search).has("signup")?"signup":"login");
 supabase.auth.onAuthStateChange((_event,next)=>{session=next;if(!session){memberships=[];authView()}});
 const token=new URLSearchParams(location.search).get("invitation");if(token){const field=root.querySelector("#invite-token");if(field){field.value=token;toast("Invitation détectée : vérifiez le jeton et acceptez-la.")}}
}
start().catch(showError);
