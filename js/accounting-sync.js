// MIZANE — Synchronisation bidirectionnelle locale/cloud avec résolution prudente des conflits.
import { buildAccountCache, validateEntry } from "./accounting.js";
import { allAccounts } from "./plans.js";
const LOCAL_KEY = "mizane_v1";
const SHADOW_PREFIX = "mizane_sync_shadow_v1:";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let running = false;

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let i=0;i<16;i++) bytes[i]=Math.floor(Math.random()*256);
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const h = [...bytes].map(x => x.toString(16).padStart(2,"0")).join("");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
function cleanSecrets(value) {
  if (Array.isArray(value)) return value.map(cleanSecrets);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    const k = key.replace(/[^a-z0-9]/gi,"").toLowerCase();
    if (/^(aikey|aikeyenc|apikey|apikeyenc|providerapikey|providerapikeyenc|openaiapikey|openaiapikeyenc|mistralapikey|mistralapikeyenc|groqapikey|groqapikeyenc|googleapikey|googleapikeyenc|secret|accesstoken|refreshtoken)$/.test(k)) continue;
    out[key] = cleanSecrets(item);
  }
  return out;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(k => [k,stable(value[k])]));
}
const signature = value => JSON.stringify(stable(value));
const equal = (a,b) => signature(a) === signature(b);
function fingerprint(value) {
  const input=signature(value);
  let hash=14695981039346656037n;
  for(let i=0;i<input.length;i++){hash^=BigInt(input.charCodeAt(i));hash=BigInt.asUintN(64,hash*1099511628211n);}
  return hash.toString(16);
}
function ensureIds(store) {
  const assign = items => {
    for (const item of items || []) if (!UUID_RE.test(String(item.client_uid || ""))) item.client_uid = uuid();
  };
  assign(store.settings?.customAccounts); assign(store.thirds); assign(store.assets); assign(store.entries);
}
function validateSyncStore(store) {
  const errors = [];
  const collections = [["comptes personnalisés", store.settings.customAccounts || []], ["tiers", store.thirds || []], ["immobilisations", store.assets || []], ["écritures", store.entries || []]];
  for (const [label, items] of collections) {
    const seen = new Set();
    for (const item of items) {
      const uid = String(item.client_uid || "");
      if (!UUID_RE.test(uid)) errors.push(`Identifiant client invalide dans ${label}.`);
      else if (seen.has(uid)) errors.push(`Identifiant client en double dans ${label} : ${uid}.`);
      seen.add(uid);
    }
  }
  const planAccounts = allAccounts(store.settings.plan);
  const planCodes = new Set(planAccounts.map(account => String(account.code)));
  const customCodes = new Set();
  for (const account of store.settings.customAccounts || []) {
    const code = String(account.code || "").trim();
    if (!code) errors.push("Un compte personnalisé ne possède aucun code.");
    else if (customCodes.has(code)) errors.push(`Code de compte personnalisé en double : ${code}.`);
    else if (planCodes.has(code)) errors.push(`Le compte personnalisé ${code} entre en conflit avec le plan comptable.`);
    customCodes.add(code);
  }
  const thirdNames = new Map();
  for (const third of store.thirds || []) {
    const name = String(third.name || "").trim().toLocaleLowerCase();
    if (name) thirdNames.set(name, (thirdNames.get(name) || 0) + 1);
  }
  const accountsStore = { ...store, settings: { ...store.settings, customAccounts: store.settings.customAccounts || [] } };
  buildAccountCache(accountsStore, planAccounts);
  const entryIds = new Set();
  for (const entry of store.entries || []) {
    const id = Number(entry.id);
    if (!Number.isSafeInteger(id) || id <= 0) errors.push("Une écriture possède un numéro interne invalide.");
    else if (entryIds.has(id)) errors.push(`Numéro d'écriture en double : ${id}.`);
    entryIds.add(id);
    const validation = validateEntry(accountsStore, entry);
    if (!validation.ok) for (const message of validation.errors) errors.push(`Écriture #${entry.id ?? "?"} : ${message}`);
    for (const line of entry.lines || []) {
      const name = String(line.third || "").trim().toLocaleLowerCase();
      if (!name) continue;
      const count = thirdNames.get(name) || 0;
      if (!count) errors.push(`Écriture #${entry.id ?? "?"} : le tiers « ${line.third} » est introuvable dans la liste des tiers.`);
      else if (count > 1) errors.push(`Écriture #${entry.id ?? "?"} : le tiers « ${line.third} » est ambigu car son nom est en double.`);
    }
  }
  for (const asset of store.assets || []) {
    const code = String(asset.account || "").trim();
    if (code && !accountsStore.settings.customAccounts.some(a => String(a.code) === code) && !planCodes.has(code)) errors.push(`Immobilisation « ${asset.name || "sans nom"} » : compte ${code} absent du plan comptable.`);
  }
  return [...new Set(errors)];
}

function localSnapshot(store) {
  ensureIds(store);
  const settings = cleanSecrets({...store.settings});
  delete settings.customAccounts;
  const reverseUid = new Map((store.entries||[]).map(e=>[Number(e.id),e.client_uid]));
  const records = {
    settings: { "settings": { data: { settings } } },
    custom_account: Object.fromEntries((store.settings.customAccounts||[]).map(x=>[x.client_uid,{data:{code:String(x.code||""),label:String(x.label||""),account_type:String(x.type||"")}}])),
    third: Object.fromEntries((store.thirds||[]).map(x=>[x.client_uid,{data:{name:String(x.name||""),third_type:String(x.type||"autre"),phone:String(x.phone||""),email:String(x.email||"")}}])),
    asset: Object.fromEntries((store.assets||[]).map(x=>[x.client_uid,{data:{name:String(x.name||""),account_code:String(x.account||""),amount:Number(x.amount)||0,years:Number(x.years)||0,method:String(x.method||"lineaire"),service_date:String(x.date||""),amortized:Number(x.amortized)||0}}])),
    entry: Object.fromEntries((store.entries||[]).map(x=>[x.client_uid,{data:{
      entry_date:String(x.date||""),journal:String(x.journal||""),reference:String(x.reference||""),
      is_reversed:!!x.reversed,reverse_of_client_uid:x.reverseOf==null?null:(reverseUid.get(Number(x.reverseOf))||null),
      lines:(x.lines||[]).map(l=>({account_code:String(l.account||""),label:String(l.label||""),third_name:String(l.third||""),debit:Number(l.debit)||0,credit:Number(l.credit)||0}))
    }}]))
  };
  return records;
}
export function shouldRetryFunctionError(error) {
  const status = Number(error?.context?.status ?? error?.status ?? 0);
  const message = String(error?.message || "");
  return [408, 425, 429, 500, 502, 503, 504].includes(status) ||
    (!status && /network|fetch|timeout|temporar|connection/i.test(message));
}

export async function invokeWithRetry(invoke, options, { maxAttempts = 4, baseDelayMs = 250 } = {}) {
  let lastResult = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try { lastResult = await invoke(options); }
    catch (error) { lastResult = { data: null, error }; }
    if (!lastResult?.error) return lastResult;
    if (!shouldRetryFunctionError(lastResult.error) || attempt === maxAttempts - 1) return lastResult;
    if (baseDelayMs > 0) await new Promise(resolve => setTimeout(resolve, baseDelayMs * (2 ** attempt)));
  }
  return lastResult || { data: null, error: new Error("Échec temporaire de la requête.") };
}

async function readCloud(supabase, companyId) {
  const all={settings:null,custom_accounts:[],thirds:[],assets:[],entries:[]};
  let offset=0, first=true;
  do {
    const {data,error}=await invokeWithRetry(options => supabase.functions.invoke("read-accounting",options),{body:{company_id:companyId,limit:100,offset,changes_since:0}});
    if(error) throw await edgeError(error,"Lecture cloud impossible.");
    if(!data||data.company_id!==companyId) throw new Error("Réponse cloud incohérente.");
    if(first){all.settings=data.settings;all.custom_accounts=data.custom_accounts||[];all.thirds=data.thirds||[];all.assets=data.assets||[];first=false;}
    all.entries.push(...(data.entries||[]));
    if(data.pagination?.has_more){
      const nextOffset=data.pagination.next_offset;
      if(!Number.isInteger(nextOffset)||nextOffset<=offset)throw new Error("Pagination cloud invalide : le curseur n'avance pas.");
      offset=nextOffset;
    } else break;
  } while(true);
  return all;
}
async function edgeError(error,fallback) {
  let message=error?.message||fallback;
  try { const response=error?.context; const body=response&&typeof response.clone==="function"?await response.clone().json():null; if(body?.error)message=body.error; } catch {}
  return new Error(message);
}
function remoteSnapshot(cloud, store) {
  const byRemoteId=new Map((cloud.entries||[]).map(e=>[String(e.id),e.client_uid]));
  const byUidLocalId=new Map((store.entries||[]).map(e=>[e.client_uid,Number(e.id)]));
  const nextIds=new Map();
  let next=Number(store.nextId)||1;
  for(const e of cloud.entries||[]) {
    let id=byUidLocalId.get(e.client_uid);
    if(!id){id=next++;byUidLocalId.set(e.client_uid,id);}
    nextIds.set(e.client_uid,id);
  }
  const out={settings:{},custom_account:{},third:{},asset:{},entry:{}};
  if(cloud.settings)out.settings.settings={data:{settings:cleanSecrets(cloud.settings.settings||{})},version:Number(cloud.settings.sync_version)||1};
  for(const x of cloud.custom_accounts||[])out.custom_account[x.client_uid]={data:{code:x.code,label:x.label,account_type:x.account_type},version:Number(x.sync_version)||1};
  for(const x of cloud.thirds||[])out.third[x.client_uid]={data:{name:x.name,third_type:x.third_type,phone:x.phone||"",email:x.email||""},version:Number(x.sync_version)||1};
  for(const x of cloud.assets||[])out.asset[x.client_uid]={data:{name:x.name,account_code:x.account_code,amount:Number(x.amount)||0,years:Number(x.years)||0,method:x.method||"lineaire",service_date:x.service_date,amortized:Number(x.amortized)||0},version:Number(x.sync_version)||1};
  for(const x of cloud.entries||[])out.entry[x.client_uid]={data:{
    entry_date:x.entry_date,journal:x.journal,reference:x.reference||"",is_reversed:!!x.is_reversed,
    reverse_of_client_uid:x.reverse_of_entry_id==null?null:(byRemoteId.get(String(x.reverse_of_entry_id))||null),
    lines:(x.lines||[]).map(l=>({account_code:l.account_code,label:l.label||"",third_name:l.third_name||"",debit:Number(l.debit)||0,credit:Number(l.credit)||0}))
  },version:Number(x.sync_version)||1};
  out.__ids=nextIds;out.__entryIds=byUidLocalId;out.__nextId=next;
  return out;
}
function installRemote(store, kind, uid, remote, cloud) {
  if(kind==="settings") {
    if(!remote){return;}
    const localSecrets={};
    for(const [k,v] of Object.entries(store.settings||{})) {
      const normalized=k.replace(/[^a-z0-9]/gi,"").toLowerCase();
      if(/^(aikey|aikeyenc|apikey|apikeyenc|providerapikey|providerapikeyenc|openaiapikey|openaiapikeyenc|mistralapikey|mistralapikeyenc|groqapikey|groqapikeyenc|googleapikey|googleapikeyenc)$/.test(normalized))localSecrets[k]=v;
    }
    store.settings={...clone(remote.data.settings||{}),...localSecrets,customAccounts:store.settings.customAccounts||[]};
    return;
  }
  const map={custom_account:store.settings.customAccounts,third:store.thirds,asset:store.assets,entry:store.entries};
  const items=map[kind]||(map[kind]=[]);
  const index=items.findIndex(x=>x.client_uid===uid);
  if(!remote){if(index>=0)items.splice(index,1);return;}
  const d=remote.data;
  if(kind==="custom_account"){
    const item={client_uid:uid,code:d.code,label:d.label,type:d.account_type};
    if(index>=0)items[index]={...items[index],...item};else items.push(item);
  } else if(kind==="third"){
    const item={client_uid:uid,name:d.name,type:d.third_type,phone:d.phone,email:d.email};
    if(index>=0)items[index]={...items[index],...item};else items.push(item);
  } else if(kind==="asset"){
    const item={client_uid:uid,name:d.name,account:d.account_code,amount:d.amount,years:d.years,method:d.method,date:d.service_date,amortized:d.amortized};
    if(index>=0)items[index]={...items[index],...item};else items.push(item);
  } else if(kind==="entry"){
    const id=cloud.__ids.get(uid) || Number(store.nextId)||1;
    const reverseId=d.reverse_of_client_uid ? (cloud.__ids.get(d.reverse_of_client_uid)||null) : null;
    const item={client_uid:uid,id,date:d.entry_date,journal:d.journal,reference:d.reference,reversed:d.is_reversed,reverseOf:reverseId,
      lines:d.lines.map(l=>({account:l.account_code,label:l.label,third:l.third_name,debit:l.debit,credit:l.credit}))};
    if(index>=0)items[index]={...items[index],...item};else items.push(item);
    store.nextId=Math.max(Number(store.nextId)||1,id+1);
  }
}
function makeOperation(kind,uid,action,version,data) {
  return {entity_type:kind,operation:action,client_uid:kind==="settings"?undefined:uid,expected_sync_version:Number(version)||0,data:data||{}};
}
function orderOperations(operations) {
  // Une écriture de contrepassation doit être envoyée après l'écriture d'origine
  // lorsque les deux éléments font partie de la même synchronisation.
  const entryOperations = new Map(
    operations.filter(op => op.entity_type === "entry").map(op => [op.client_uid, op])
  );
  const ordered = [];
  const visiting = new Set();
  const visited = new Set();
  const visit = op => {
    const uid = op.client_uid;
    if (visited.has(uid)) return;
    if (visiting.has(uid)) throw new Error("Les liens de contrepassation contiennent une dépendance circulaire.");
    visiting.add(uid);
    const sourceUid = op.operation === "upsert" ? op.data?.reverse_of_client_uid : null;
    if (sourceUid && entryOperations.has(sourceUid)) {
      const source = entryOperations.get(sourceUid);
      if (source.operation === "delete") {
        throw new Error("Une contrepassation ne peut pas être synchronisée si son écriture d'origine est supprimée dans le même lot.");
      }
      visit(source);
    }
    visiting.delete(uid);
    visited.add(uid);
    ordered.push(op);
  };
  for (const op of entryOperations.values()) visit(op);
  return operations.filter(op => op.entity_type !== "entry").concat(ordered);
}
async function pushBatches(supabase,companyId,operations) {
  const orderedOperations = orderOperations(operations);
  for(let i=0;i<orderedOperations.length;i+=100) {
    const operationUid=uuid();
    const {data,error}=await invokeWithRetry(
      options => supabase.functions.invoke("push-accounting-changes", options),
      {body:{
        company_id:companyId,operation_uid:operationUid,operations:orderedOperations.slice(i,i+100)
      }}
    );
    if(error)throw await edgeError(error,"Envoi cloud impossible.");
    if(data?.conflict||data?.ok===false) {
      const list=(data.conflicts||[]).map(x=>x.entity_type+(x.client_uid?":"+x.client_uid:"")).join(", ");
      throw new Error("Conflit de synchronisation détecté. Aucune donnée conflictuelle n'a été écrasée."+(list?" Éléments : "+list:""));
    }
    if(data?.ok!==true)throw new Error("Le serveur n'a pas confirmé le lot de synchronisation.");
  }
}
function getShadow(companyId) {
  try { const raw=localStorage.getItem(SHADOW_PREFIX+companyId);return raw?JSON.parse(raw):null; } catch { return null; }
}
function saveShadow(companyId, records) {
  const clean={};
  for(const kind of ["settings","custom_account","third","asset","entry"]) {
    clean[kind]={};
    for(const [uid,item] of Object.entries(records[kind]||{}))clean[kind][uid]={hash:fingerprint(item.data),version:Number(item.version)||1};
  }
  localStorage.setItem(SHADOW_PREFIX+companyId,JSON.stringify(clean));
}
async function syncAccountingUnlocked(supabase, companyId, role) {
  if(running)throw new Error("Une synchronisation est déjà en cours sur cet appareil.");
  running=true;
  try {
    if(!companyId)throw new Error("Aucune entreprise cloud sélectionnée.");
    const raw=localStorage.getItem(LOCAL_KEY);
    if(!raw)throw new Error("Aucune comptabilité locale n'a été trouvée sur cet appareil.");
    let store;try{store=JSON.parse(raw);}catch{throw new Error("Les données locales sont illisibles.");}
    if(!store?.settings||!Array.isArray(store.entries))throw new Error("Structure de comptabilité locale non reconnue.");
    if(!Array.isArray(store.thirds))store.thirds=[];
    if(!Array.isArray(store.assets))store.assets=[];
    if(!Array.isArray(store.settings.customAccounts))store.settings.customAccounts=[];
    ensureIds(store);
    const validationErrors = validateSyncStore(store);
    if (validationErrors.length) throw new Error("Synchronisation bloquée : corrigez les anomalies locales avant l’envoi. " + validationErrors.slice(0, 8).join(" "));
    // Les UUID doivent rester stables même si la lecture cloud ou un contrôle de conflit échoue.
    const expectedLocalRaw=JSON.stringify(store);
    localStorage.setItem(LOCAL_KEY,expectedLocalRaw);
    const assertLocalUnchanged=()=>{
      if(localStorage.getItem(LOCAL_KEY)!==expectedLocalRaw) {
        throw new Error("La comptabilité locale a été modifiée dans un autre onglet pendant la synchronisation. Aucune donnée n'a été écrasée ; relancez la synchronisation.");
      }
    };
    const cloud=await readCloud(supabase,companyId);
    if(!cloud.settings)throw new Error("La comptabilité cloud n'a pas encore été initialisée. Effectuez d'abord l'import initial.");
    const remote=remoteSnapshot(cloud,store);
    const current=localSnapshot(store);
    const shadow=getShadow(companyId);
    if(!shadow) {
      const kinds=["settings","custom_account","third","asset","entry"];
      const initialOperations=[];
      let initialPulled=0;
      for(const kind of kinds) {
        const local=current[kind]||{}, cloudRecords=remote[kind]||{};
        if(kind==="settings") {
          if(!equal(local.settings?.data??null,cloudRecords.settings?.data??null)) {
            throw new Error("Première synchronisation : les paramètres locaux diffèrent déjà des paramètres cloud. Aucune donnée n'a été écrasée.");
          }
          continue;
        }
        const keys=new Set([...Object.keys(local),...Object.keys(cloudRecords)]);
        for(const uid of keys) {
          const localRec=local[uid]||null, cloudRec=cloudRecords[uid]||null;
          if(localRec&&cloudRec) {
            if(!equal(localRec.data,cloudRec.data)) {
              throw new Error("Première synchronisation : un élément existe des deux côtés avec des contenus différents ("+kind+":"+uid+"). Aucune donnée n'a été écrasée.");
            }
          } else if(localRec&&!cloudRec) {
            if(role==="reader")throw new Error("Votre rôle est en lecture seule : des éléments locaux attendent leur premier envoi.");
            initialOperations.push(makeOperation(kind,uid,"upsert",0,localRec.data));
          } else if(!localRec&&cloudRec) {
            installRemote(store,kind,uid,cloudRec,remote);
            initialPulled++;
          }
        }
      }
      if(initialOperations.length)await pushBatches(supabase,companyId,initialOperations);
      const initialCloud=await readCloud(supabase,companyId);
      const initialRemote=remoteSnapshot(initialCloud,store);
      assertLocalUnchanged();
      localStorage.setItem(LOCAL_KEY,JSON.stringify(store));
      saveShadow(companyId,initialRemote);
      return {pushed:initialOperations.length,pulled:initialPulled,conflicts:0,initialized:true};
    }
    const operations=[];
    let pulled=0;
    const kinds=["settings","custom_account","third","asset","entry"];
    for(const kind of kinds) {
      const old=shadow[kind]||{};
      const local=current[kind]||{};
      const cloudRecords=remote[kind]||{};
      const keys=new Set([...Object.keys(old),...Object.keys(local),...Object.keys(cloudRecords)]);
      for(const uid of keys) {
        const base=kind==="settings"?(old.settings||null):(old[uid]||null);
        const localRec=kind==="settings"?(local.settings||null):(local[uid]||null);
        const cloudRec=kind==="settings"?(cloudRecords.settings||null):(cloudRecords[uid]||null);
        const localData=localRec?.data??null, cloudData=cloudRec?.data??null;
        const baseHash=base?.hash??fingerprint(base?.data??null);
        const localChanged=fingerprint(localData)!==baseHash;
        const cloudChanged=fingerprint(cloudData)!==baseHash;
        if(localChanged&&cloudChanged&&!equal(localData,cloudData)) {
          throw new Error("Conflit simultané détecté ("+kind+(kind==="settings"?"":":"+uid)+"). Les deux versions sont conservées ; choisissez manuellement laquelle garder avant de relancer.");
        }
        if(localChanged&&!cloudChanged) {
          if(role==="reader")throw new Error("Votre rôle est en lecture seule. Des modifications locales existent et ne peuvent pas être envoyées.");
          const action=localData===null?"delete":"upsert";
          const data=kind==="settings"?(localData?{settings:localData.settings}:{}):(localData||{});
          operations.push(makeOperation(kind,uid,action,cloudRec?.version??base?.version??0,data));
        } else if(cloudChanged&&!localChanged) {
          if(kind==="settings")installRemote(store,kind,uid,cloudRec,remote);
          else installRemote(store,kind,uid,cloudRec,remote);
          pulled++;
        } else if(localChanged&&cloudChanged&&equal(localData,cloudData)) {
          // Même résultat des deux côtés : on adopte la version serveur ci-dessous.
        }
      }
    }
    if(operations.length)await pushBatches(supabase,companyId,operations);
    const finalCloud=await readCloud(supabase,companyId);
    const finalRemote=remoteSnapshot(finalCloud,store);
    // Les changements arrivés pendant le push sont appliqués seulement si aucun
    // changement local concurrent n'est apparu depuis la lecture initiale.
    const finalShadow={settings:{},custom_account:{},third:{},asset:{},entry:{}};
    for(const kind of kinds) {
      if(kind==="settings") {
        const rec=finalRemote.settings.settings;
        if(rec)finalShadow.settings.settings={data:clone(rec.data),version:rec.version};
        continue;
      }
      for(const [uid,rec] of Object.entries(finalRemote[kind]||{}))finalShadow[kind][uid]={data:clone(rec.data),version:rec.version};
    }
    // Pour les pulls et les écritures envoyées, le cloud final devient la base.
    // Les enregistrements locaux ajoutés hors de cette synchronisation restent intacts.
    for(const kind of kinds) {
      const localNow=localSnapshot(store);
      const baseNow=shadow[kind]||{};
      const finalNow=finalRemote[kind]||{};
      const keys=new Set([...Object.keys(baseNow),...Object.keys(finalNow)]);
      for(const uid of keys) {
        const before=kind==="settings"?(baseNow.settings||null):(baseNow[uid]||null);
        const after=kind==="settings"?(finalNow.settings||null):(finalNow[uid]||null);
        const localAfter=kind==="settings"?(localNow.settings.settings?.data||null):(localNow[kind]?.[uid]?.data||null);
        if(fingerprint(localAfter)!==(before?.hash??fingerprint(before?.data??null)) && !equal(localAfter,after?.data??null)) {
          throw new Error("Les données locales ont changé pendant la synchronisation. Relancez-la après vérification.");
        }
        if(!equal(localAfter,after?.data??null))installRemote(store,kind,uid,after,finalRemote);
      }
    }
    assertLocalUnchanged();
    localStorage.setItem(LOCAL_KEY,JSON.stringify(store));
    saveShadow(companyId,finalShadow);
    return {pushed:operations.length,pulled,conflicts:0,initialized:false};
  } finally { running=false; }
}

export async function syncAccounting(supabase, companyId, role) {
  const locks = globalThis.navigator?.locks;
  if (companyId && typeof locks?.request === "function") {
    return locks.request(`mizane-accounting-sync:${companyId}`, { mode: "exclusive" }, () =>
      syncAccountingUnlocked(supabase, companyId, role)
    );
  }
  return syncAccountingUnlocked(supabase, companyId, role);
}

// Restauration explicite : le cloud est la source d'autorité sur un appareil déjà utilisé.
// Cette opération ne pousse jamais de données locales et ne valide pas les anciennes écritures.
async function restoreAccountingFromCloudUnlocked(supabase, companyId) {
  if (running) throw new Error("Une synchronisation est déjà en cours sur cet appareil.");
  running = true;
  try {
    if (!companyId) throw new Error("Aucune entreprise cloud sélectionnée.");
    const raw = localStorage.getItem(LOCAL_KEY);
    let store;
    try {
      store = raw ? JSON.parse(raw) : null;
    } catch {
      store = null;
    }
    if (!store || typeof store !== "object" || Array.isArray(store)) store = {};
    store.settings = store.settings && typeof store.settings === "object" ? store.settings : {};
    store.settings.customAccounts = [];
    store.thirds = [];
    store.assets = [];
    store.entries = [];
    store.nextId = 1;

    const cloud = await readCloud(supabase, companyId);
    if (!cloud.settings) throw new Error("La comptabilité cloud n'est pas initialisée pour cette entreprise.");
    const remote = remoteSnapshot(cloud, store);

    // Les données comptables locales sont remplacées uniquement après lecture cloud complète.
    installRemote(store, "settings", "settings", remote.settings.settings, remote);
    for (const kind of ["custom_account", "third", "asset", "entry"]) {
      for (const [uid, record] of Object.entries(remote[kind] || {})) {
        installRemote(store, kind, uid, record, remote);
      }
    }

    if (localStorage.getItem(LOCAL_KEY) !== raw) {
      throw new Error("Les données locales ont changé pendant la récupération. Aucune donnée n'a été remplacée ; relancez l'opération.");
    }
    localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
    // Le shadow doit correspondre exactement aux données effectivement installées.
    // Les changements cloud ultérieurs seront récupérés lors de la synchronisation suivante.
    saveShadow(companyId, remote);
    return {
      restored: true,
      thirds: store.thirds.length,
      entries: store.entries.length,
      assets: store.assets.length,
      customAccounts: store.settings.customAccounts.length,
    };
  } finally {
    running = false;
  }
}


export async function restoreAccountingFromCloud(supabase, companyId) {
  const locks = globalThis.navigator?.locks;
  if (companyId && typeof locks?.request === "function") {
    return locks.request(`mizane-accounting-sync:${companyId}`, { mode: "exclusive" }, () =>
      restoreAccountingFromCloudUnlocked(supabase, companyId)
    );
  }
  return restoreAccountingFromCloudUnlocked(supabase, companyId);
}


export { cleanSecrets, fingerprint, localSnapshot, orderOperations, validateSyncStore };
