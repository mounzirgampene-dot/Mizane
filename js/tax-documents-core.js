// MIZANE — Contrôle documentaire des obligations fiscales.
export function createTaxEvidenceMetadata({id,declarationId,category,file,referenceDate="",notes="",uploadedAt=new Date().toISOString()}={}) {
 const errors=[],name=String(file?.name||"").trim(),size=Number(file?.size);
 if(!id||!declarationId)errors.push("Identifiant de pièce ou de déclaration manquant.");
 if(!String(category||"").trim())errors.push("Catégorie de justificatif obligatoire.");
 if(!name)errors.push("Fichier obligatoire.");
 if(!Number.isFinite(size)||size<=0)errors.push("Fichier vide ou taille invalide.");
 if(size>15*1024*1024)errors.push("La taille maximale par fichier est de 15 Mo.");
 if(referenceDate){const parsed=new Date(referenceDate+"T00:00:00Z");if(!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)||Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==referenceDate)errors.push("Date du justificatif invalide.");}
 if(errors.length)return {ok:false,errors};
 return {ok:true,document:{id:String(id),declarationId:String(declarationId),category:String(category).trim().slice(0,180),fileName:name.slice(0,240),mimeType:String(file.type||"application/octet-stream").slice(0,160),size,referenceDate:referenceDate||null,notes:String(notes||"").trim().slice(0,1000),uploadedAt,status:"pending_review",storage:"device_indexeddb",verifiedAt:null}};
}
export function getTaxEvidenceReadiness(declaration,documents=[]) {
 const required=Array.isArray(declaration?.requiredDocuments)?declaration.requiredDocuments:[];
 const linked=documents.filter(x=>x&&x.declarationId===declaration?.id);
 const verified=new Set(linked.filter(x=>x.status==="verified").map(x=>x.category));
 const missing=required.filter(label=>!verified.has(label));
 return {requiredCount:required.length,linkedCount:linked.length,verifiedCount:required.length-missing.length,missing,ready:missing.length===0&&linked.every(x=>x.status==="verified")};
}
export function canMoveTaxDeclarationToReview(declaration,documents=[]) {
 const readiness=getTaxEvidenceReadiness(declaration,documents);
 return {ok:readiness.ready,readiness,errors:readiness.ready?[]:["Les justificatifs obligatoires doivent être joints et vérifiés avant le passage « À valider »."]};
}
