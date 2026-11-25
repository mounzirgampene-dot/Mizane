// MIZANE — Coffre fiscal privé, partagé entre les membres d'une entreprise.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";
const ACTIVE_COMPANY_KEY="mizane_active_company_v1";
let clientPromise;
async function client(){
 if(!clientPromise)clientPromise=Promise.resolve(createClient(SUPABASE_URL,SUPABASE_ANON_KEY));
 return clientPromise;
}
export async function getTaxEvidenceCloudContext(){
 const companyId=localStorage.getItem(ACTIVE_COMPANY_KEY)||"";
 if(!companyId)return null;
 const supabase=await client();
 const {data:sessionData,error:sessionError}=await supabase.auth.getSession();
 if(sessionError)throw sessionError;
 const user=sessionData?.session?.user;
 if(!user)throw new Error("Une entreprise est sélectionnée, mais aucune session n'est ouverte. Connectez-vous au portail MIZANE pour accéder au coffre partagé.");
 const {data:membership,error}=await supabase.from("company_memberships").select("role,status").eq("company_id",companyId).eq("user_id",user.id).maybeSingle();
 if(error)throw error;
 if(!membership||membership.status!=="active")throw new Error("Votre compte n'a pas d'accès actif à l'entreprise sélectionnée.");
 return {supabase,companyId,user,role:membership.role,canWrite:["admin","accountant"].includes(membership.role)};
}
function mapRow(row){
 return {id:row.id,declarationId:row.declaration_id,category:row.category,fileName:row.file_name,mimeType:row.mime_type,size:Number(row.file_size),referenceDate:row.reference_date,notes:row.notes||"",uploadedAt:row.created_at,status:row.status,storage:"supabase_storage",companyId:row.company_id,verifiedAt:row.verified_at,verifiedBy:row.verified_by};
}
function pathSegment(value){return encodeURIComponent(String(value||"").slice(0,180)).replace(/%2F/gi,"%252F");}
function safeFileName(value){return String(value||"justificatif").split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]+/g,"_").slice(0,120)||"justificatif";}
export async function listCloudTaxEvidence(){
 const ctx=await getTaxEvidenceCloudContext();
 if(!ctx)return null;
 const {data,error}=await ctx.supabase.from("company_tax_documents").select("id,company_id,declaration_id,category,file_name,mime_type,file_size,reference_date,notes,status,uploaded_by,verified_by,verified_at,created_at").eq("company_id",ctx.companyId).order("created_at",{ascending:false});
 if(error)throw error;
 return {companyId:ctx.companyId,role:ctx.role,documents:(data||[]).map(mapRow)};
}
export async function uploadCloudTaxEvidence({file,document}){
 const ctx=await getTaxEvidenceCloudContext();
 if(!ctx)return null;
 if(!ctx.canWrite)throw new Error("Le rôle Lecteur ne permet pas de joindre des justificatifs.");
 const name=ctx.companyId+"/"+pathSegment(document.declarationId)+"/"+document.id+"/"+safeFileName(document.fileName);
 const {error:uploadError}=await ctx.supabase.storage.from("tax-evidence").upload(name,file,{contentType:document.mimeType,upsert:false,cacheControl:"3600"});
 if(uploadError)throw uploadError;
 const row={id:document.id,company_id:ctx.companyId,declaration_id:document.declarationId,category:document.category,file_name:document.fileName,mime_type:document.mimeType,file_size:document.size,reference_date:document.referenceDate||null,notes:document.notes||"",storage_path:name,status:"pending_review",uploaded_by:ctx.user.id};
 const {data,error}=await ctx.supabase.from("company_tax_documents").insert(row).select("id,company_id,declaration_id,category,file_name,mime_type,file_size,reference_date,notes,status,uploaded_by,verified_by,verified_at,created_at").single();
 if(error){await ctx.supabase.storage.from("tax-evidence").remove([name]);throw error;}
 return mapRow(data);
}
export async function downloadCloudTaxEvidence(documentId){
 const ctx=await getTaxEvidenceCloudContext();
 if(!ctx)throw new Error("Aucune entreprise active pour télécharger ce justificatif.");
 const {data:row,error:rowError}=await ctx.supabase.from("company_tax_documents").select("storage_path,file_name").eq("id",documentId).eq("company_id",ctx.companyId).single();
 if(rowError)throw rowError;
 const {data,error}=await ctx.supabase.storage.from("tax-evidence").download(row.storage_path);
 if(error)throw error;
 return {blob:data,fileName:row.file_name};
}
export async function verifyCloudTaxEvidence(documentId){
 const ctx=await getTaxEvidenceCloudContext();
 if(!ctx||!ctx.canWrite)throw new Error("Droits administrateur ou comptable requis pour vérifier un justificatif.");
 const now=new Date().toISOString();
 const {data,error}=await ctx.supabase.from("company_tax_documents").update({status:"verified",verified_by:ctx.user.id,verified_at:now,updated_at:now}).eq("id",documentId).eq("company_id",ctx.companyId).select("id,company_id,declaration_id,category,file_name,mime_type,file_size,reference_date,notes,status,uploaded_by,verified_by,verified_at,created_at").single();
 if(error)throw error;
 return mapRow(data);
}
export async function deleteCloudTaxEvidence(documentId){
 const ctx=await getTaxEvidenceCloudContext();
 if(!ctx||!ctx.canWrite)throw new Error("Droits administrateur ou comptable requis pour retirer un justificatif.");
 const {data:row,error:readError}=await ctx.supabase.from("company_tax_documents").select("storage_path").eq("id",documentId).eq("company_id",ctx.companyId).single();
 if(readError)throw readError;
 const {error:removeError}=await ctx.supabase.storage.from("tax-evidence").remove([row.storage_path]);
 if(removeError)throw removeError;
 const {error:deleteError}=await ctx.supabase.from("company_tax_documents").delete().eq("id",documentId).eq("company_id",ctx.companyId);
 if(deleteError)throw deleteError;
 return true;
}
