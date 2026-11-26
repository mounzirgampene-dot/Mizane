// MIZANE — Archivage local des justificatifs liés aux écritures comptables.
const DB_NAME="mizane_accounting_documents_v1", STORE_NAME="files";
const MAX_FILE_SIZE=20*1024*1024, MAX_IMAGE_SIZE=15*1024*1024;
const MIME_BY_EXTENSION={pdf:"application/pdf",jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp"};
export function resolveAccountingDocumentMimeType(file){
 const supplied=String(file?.type||"").toLowerCase().trim();
 if(Object.values(MIME_BY_EXTENSION).includes(supplied))return supplied;
 return MIME_BY_EXTENSION[String(file?.name||"").split(".").pop().toLowerCase()]||"";
}
export function createAccountingDocumentMetadata({id,file,entryIds,uploadedAt=new Date().toISOString()}={}){
 const errors=[],fileName=String(file?.name||"").trim(),size=Number(file?.size),mimeType=resolveAccountingDocumentMimeType(file);
 const ids=[...new Set((Array.isArray(entryIds)?entryIds:[]).map(Number))];
 if(!id)errors.push("Identifiant de justificatif manquant.");
 if(!fileName)errors.push("Nom de fichier manquant.");
 if(!Number.isSafeInteger(size)||size<=0)errors.push("Fichier vide ou taille invalide.");
 if(size>MAX_FILE_SIZE)errors.push("La taille maximale d’un document est de 20 Mo.");
 if(mimeType.startsWith("image/")&&size>MAX_IMAGE_SIZE)errors.push("La taille maximale d’une image est de 15 Mo.");
 if(!mimeType)errors.push("Format refusé : utilisez PDF, JPEG, PNG ou WebP.");
 if(!ids.length||ids.some(value=>!Number.isSafeInteger(value)||value<=0))errors.push("Au moins une écriture valide doit être associée au justificatif.");
 if(errors.length)return {ok:false,errors};
 return {ok:true,document:{id:String(id),entryIds:ids,fileName:fileName.slice(0,240),mimeType,size,uploadedAt,storage:"device_indexeddb"}};
}
function openDb(){
 if(typeof indexedDB==="undefined")return Promise.reject(new Error("Le stockage documentaire local n’est pas disponible sur cet appareil."));
 return new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE_NAME))request.result.createObjectStore(STORE_NAME,{keyPath:"id"});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error||new Error("Ouverture du coffre local impossible."));});
}
function runTransaction(db,mode,action){
 return new Promise((resolve,reject)=>{const tx=db.transaction(STORE_NAME,mode),request=action(tx.objectStore(STORE_NAME));let result;
 if(request){request.onsuccess=()=>{result=request.result;};request.onerror=()=>reject(request.error||new Error("Opération documentaire impossible."));}
 tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error||new Error("Transaction documentaire impossible."));tx.onabort=()=>reject(tx.error||new Error("Transaction documentaire interrompue."));
 });
}
export async function putLocalAccountingDocument({id,file,entryIds}={}){
 const checked=createAccountingDocumentMetadata({id,file,entryIds});if(!checked.ok)throw new Error(checked.errors.join(" "));
 const db=await openDb();try{await runTransaction(db,"readwrite",store=>store.put({...checked.document,blob:file}));}finally{db.close();}
 return checked.document;
}
export async function listLocalAccountingDocuments(entryId){
 const db=await openDb();try{const rows=await runTransaction(db,"readonly",store=>store.getAll());return(rows||[]).filter(row=>row.entryIds?.includes(Number(entryId))).map(row=>{const metadata={...row};delete metadata.blob;return metadata;});}finally{db.close();}
}
export async function getLocalAccountingDocument(id){
 const db=await openDb();try{const row=await runTransaction(db,"readonly",store=>store.get(String(id)));return row?{blob:row.blob,fileName:row.fileName}:null;}finally{db.close();}
}
export async function deleteLocalAccountingDocument(id){
 const db=await openDb();try{await runTransaction(db,"readwrite",store=>store.delete(String(id)));}finally{db.close();}
}
