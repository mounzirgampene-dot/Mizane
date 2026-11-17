// MIZANE — Synchronisation bidirectionnelle locale/cloud avec résolution prudente des conflits.
const LOCAL_KEY = "mizane_v1";
const SHADOW_PREFIX = "mizane_sync_shadow_v1:";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let running = false;

function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
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
function ensureIds(store) {
  const assign = items => {
    for (const item of items || []) if (!UUID_RE.test(String(item.client_uid || ""))) item.client_uid = uuid();
  };
  assign(store.settings?.customAccounts); assign(store.thirds); assign(store.assets); assign(store.entries);
}
function localSnapshot(store) {
  ensureIds(store);
  const settings = cleanSecrets({...store.settings});
  delete settings.customAccounts;
  const reverseUid = new Map((store.entries||[]).map(e=>[Number(e.id),e.client_uid]));
  const records = {
    settings: { "settings": { data: { settings, next_entry_id: Number(store.nextId)||1 } } },
    custom_account: Object.fromEntries((store.settings.customAccounts||[]).map(x=>[x.client_uid,{data:{code:String(x.code||""),label:String(x.label||""),account_type:String(x.type||"")}}])),
    third: Object.fromEntries((store.thirds||[]).map(x=>[x.client_uid,{data:{name:String(x.name||""),third_type:String(x.type||"autre"),phone:String(x.phone||""),email:String(x.email||"")}}])),
    asset: Object.fromEntries((store.assets||[]).map(x=>[x.client_uid,{data:{name:String(x.name||""),account_code:String(x.account||""),amount:Number(x.amount)||0,years:Number(x.years)||0,method:String(x.method||"lineaire"),service_date:String(x.date||""),amortized:Number(x.amortized)||0}}])),
    entry: Object.fromEntries((store.entries||[]).map(x=>[x.client_uid,{data:{
      entry_date:String(x.date||""),journal:String(x.journal||""),reference:String(x.reference||""),
      is_reversed:!!x.reversed,reverse_of_client_uid:x.reverseOf==null?null:(reverseUid.get(Number(x.reverseOf))||null),
      lines:(x.lines||[]).map(l=>({account_code:String(l.account||""),label:String(l.label||""),third_name:String(l.third||""),debit:Number(l.debit)||0,credit:Number(l.credit)||0}))
    }}]}))
  };
  return records;
}
async function readCloud(supabase, companyId) {
  const all={settings:null,custom_accounts:[],thirds:[],assets:[],entries:[]};
  let offset=0, first=true;
  do {
    const {data,error}=await supabase.functions.invoke("read-accounting",{body:{company_id:companyId,limit:100,offset,changes_since:0}});
    if(error) throw await edgeError(error,"Lecture cloud impossible.");
    if(!data||data.company_id!==companyId) throw new Error("Réponse cloud incohérente.");
    if(first){all.settings=data.settings;all.custom_accounts=data.custom_accounts||[];all.thirds=data.thirds||[];all.assets=data.assets||[];first=false;}
    all.entries.push(...(data.entries||[]));
    if(data.pagination?.has_more){offset=data.pagination.next_offset;if(!Number.isInteger(offset))throw new Error("Pagination cloud invalide.");}
    else break;
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
  if(cloud.settings)out.settings.settings={data:{settings:cleanSecrets(cloud.settings.settings||{}),next_entry_id:Number(cloud.settings.next_entry_id)||1},version:Number(cloud.settings.sync_version)||1};
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
    for(const [k,v] of Object.entries(store.settings||{})) if(/^(aiKey|aiKeyEnc|apiKey|apiKeyEnc|providerApiKey|providerApiKeyEnc)$/i.test(k))localSecrets[k]=v;
    store.settings={...clone(remote.data.settings||{}),...localSecrets,customAccounts:store.settings.customAccounts||[]};
    store.nextId=Math.max(Number(store.nextId)||1,Number(remote.data.next_entry_id)||1);
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
async function pushBatches(supabase,companyId,operations) {
  for(let i=0;i<operations.length;i+=100) {
    const operationUid=uuid();
    const {data,error}=await supabase.functions.invoke("push-accounting-changes",{body:{
      company_id:companyId,operation_uid:operationUid,operations:operations.slice(i,i+100)
    }});
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
    for(const [uid,item] of Object.entries(records[kind]||{}))clean[kind][uid]={data:clone(item.data),version:Number(item.version)||1};
  }
  localStorage.setItem(SHADOW_PREFIX+companyId,JSON.stringify(clean));
}
function localObject(records,kind,uid) {
  if(kind==="settings")return records.settings.settings?.data||null;
  return records[kind]?.[uid]?.data||null;
}
function remoteObject(records,kind,uid) {
  if(kind==="settings")return records.settings.settings||null;
  return records[kind]?.[uid]?.data||null;
}
export async function syncAccounting(supabase, companyId, role) {
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
    const cloud=await readCloud(supabase,companyId);
    if(!cloud.settings)throw new Error("La comptabilité cloud n'a pas encore été initialisée. Effectuez d'abord l'import initial.");
    const remote=remoteSnapshot(cloud,store);
    const current=localSnapshot(store);
    const shadow=getShadow(companyId);
    if(!shadow) {
      const kinds=["settings","custom_account","third","asset","entry"];
      const same=kinds.every(kind=>{
        const a=current[kind]||{},b=remote[kind]||{};
        const keys=new Set([...Object.keys(a),...Object.keys(b)]);
        return [...keys].every(uid=>equal(localObject(current,kind,uid),remoteObject(remote,kind,uid)));
      });
      if(!same)throw new Error("Première synchronisation : les données locales diffèrent déjà du cloud. Aucune modification n'a été envoyée ni téléchargée. Vérifiez que cet appareil contient bien la comptabilité ayant servi à l'import initial.");
      saveShadow(companyId,remote);
      localStorage.setItem(LOCAL_KEY,JSON.stringify(store));
      return {pushed:0,pulled:0,conflicts:0,initialized:true};
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
        const baseData=base?.data??null, localData=localRec?.data??null, cloudData=cloudRec?.data??null;
        const localChanged=!equal(localData,baseData);
        const cloudChanged=!equal(cloudData,baseData);
        if(localChanged&&cloudChanged&&!equal(localData,cloudData)) {
          throw new Error("Conflit simultané détecté ("+kind+(kind==="settings"?"":":"+uid)+"). Les deux versions sont conservées ; choisissez manuellement laquelle garder avant de relancer.");
        }
        if(localChanged&&!cloudChanged) {
          if(role==="reader")throw new Error("Votre rôle est en lecture seule. Des modifications locales existent et ne peuvent pas être envoyées.");
          const action=localData===null?"delete":"upsert";
          const data=kind==="settings"?(localData?{settings:localData.settings,next_entry_id:localData.next_entry_id}:{}):(localData||{});
          operations.push(makeOperation(kind,uid,action,base?.version||0,data));
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
        const localAfter=kind==="settings"?(localNow.settings.settings||null):(localNow[kind]?.[uid]?.data||null);
        if(!equal(localAfter,before?.data??null) && !equal(localAfter,after?.data??null)) {
          throw new Error("Les données locales ont changé pendant la synchronisation. Relancez-la après vérification.");
        }
        if(!equal(localAfter,after?.data??null))installRemote(store,kind,uid,after,finalRemote);
      }
    }
    localStorage.setItem(LOCAL_KEY,JSON.stringify(store));
    saveShadow(companyId,finalShadow);
    return {pushed:operations.length,pulled,conflicts:0,initialized:false};
  } finally { running=false; }
}
