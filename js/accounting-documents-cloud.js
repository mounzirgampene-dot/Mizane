// MIZANE — Coffre privé des justificatifs comptables, partagé par entreprise.
import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
import {SUPABASE_URL,SUPABASE_ANON_KEY} from "./supabase-config.js";
import {createAccountingDocumentMetadata} from "./accounting-documents.js";
const ACTIVE_COMPANY_KEY="mizane_active_company_v1",BUCKET="accounting-evidence";
let clientPromise;
async function client(){if(!clientPromise)clientPromise=Promise.resolve(createClient(SUPABASE_URL,SUPABASE_ANON_KEY));return clientPromise;}
async function context(){
 const companyId=localStorage.getItem(ACTIVE_COMPANY_KEY)||"";if(!companyId)return null;
 const supabase=await client(),{data:sessionData,error:sessionError}=await supabase.auth.getSession();if(sessionError)throw sessionError;
 const user=sessionData?.session?.user;if(!user)throw new Error("Connectez-vous au portail MIZANE pour accéder au coffre documentaire partagé.");
 const {data:membership,error}=await supabase.from("company_memberships").select("role,status").eq("company_id",companyId).eq("user_id",user.id).maybeSingle();if(error)throw error;
 if(!membership||membership.status!=="active")throw new Error("Votre compte n’a pas d’accès actif à l’entreprise sélectionnée.");
 return{supabase,companyId,user,role:membership.role,canWrite:["admin","accountant"].includes(membership.role)};
}
function safeFileName(value){return String(value||"justificatif").split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]+/g,"_").slice(0,120)||"justificatif";}
function mapDocument(row){return{id:row.id,fileName:row.file_name,mimeType:row.mime_type,size:Number(row.file_size),uploadedAt:row.created_at,storage:"supabase_storage"};}
export async function uploadCloudAccountingDocument({file,entryLocalIds}={}){
 const ctx=await context();if(!ctx)return null;if(!ctx.canWrite)throw new Error("Le rôle Lecteur ne permet pas de joindre des pièces comptables.");
 const localIds=[...new Set((entryLocalIds||[]).map(Number))],id=globalThis.crypto?.randomUUID?.();
 const checked=createAccountingDocumentMetadata({id,file,entryIds:localIds});if(!checked.ok)throw new Error(checked.errors.join(" "));
 const {data:entries,error:entryError}=await ctx.supabase.from("accounting_entries").select("id,source_local_id").eq("company_id",ctx.companyId).in("source_local_id",localIds);if(entryError)throw entryError;
 const byLocalId=new Map((entries||[]).map(row=>[Number(row.source_local_id),row.id]));
 const missing=localIds.filter(value=>!byLocalId.has(value));if(missing.length)throw new Error("Certaines écritures ne sont pas encore synchronisées dans l’espace professionnel. La pièce reste conservée localement.");
 const path=ctx.companyId+"/"+id+"/"+safeFileName(file.name);
 const {error:uploadError}=await ctx.supabase.storage.from(BUCKET).upload(path,file,{contentType:checked.document.mimeType,upsert:false,cacheControl:"0"});if(uploadError)throw uploadError;
 const row={id,company_id:ctx.companyId,file_name:checked.document.fileName,mime_type:checked.document.mimeType,file_size:checked.document.size,storage_path:path,uploaded_by:ctx.user.id};
 const {error:insertError}=await ctx.supabase.from("accounting_documents").insert(row);
 if(insertError){await ctx.supabase.storage.from(BUCKET).remove([path]);throw insertError;}
 const links=[...byLocalId.values()].map(entryId=>({company_id:ctx.companyId,document_id:id,entry_id:entryId,uploaded_by:ctx.user.id}));
 const {error:linkError}=await ctx.supabase.from("accounting_document_entry_links").insert(links);
 if(linkError){await ctx.supabase.from("accounting_documents").delete().eq("company_id",ctx.companyId).eq("id",id);await ctx.supabase.storage.from(BUCKET).remove([path]);throw linkError;}
 return{id,fileName:row.file_name,mimeType:row.mime_type,size:row.file_size,uploadedAt:new Date().toISOString(),storage:"supabase_storage"};
}
export async function listCloudAccountingDocumentsForEntry(entryLocalId){
 const ctx=await context();if(!ctx)return null;
 const {data:entry,error:entryError}=await ctx.supabase.from("accounting_entries").select("id").eq("company_id",ctx.companyId).eq("source_local_id",Number(entryLocalId)).maybeSingle();if(entryError)throw entryError;if(!entry)return[];
 const {data:links,error:linkError}=await ctx.supabase.from("accounting_document_entry_links").select("document_id").eq("company_id",ctx.companyId).eq("entry_id",entry.id);if(linkError)throw linkError;
 const ids=[...new Set((links||[]).map(row=>row.document_id))];if(!ids.length)return[];
 const {data:documents,error:documentError}=await ctx.supabase.from("accounting_documents").select("id,file_name,mime_type,file_size,created_at").eq("company_id",ctx.companyId).in("id",ids).order("created_at",{ascending:false});if(documentError)throw documentError;
 return(documents||[]).map(mapDocument);
}
export async function downloadCloudAccountingDocument(documentId){
 const ctx=await context();if(!ctx)throw new Error("Aucune entreprise active pour télécharger ce justificatif.");
 const {data:row,error:rowError}=await ctx.supabase.from("accounting_documents").select("storage_path,file_name").eq("company_id",ctx.companyId).eq("id",documentId).single();if(rowError)throw rowError;
 const {data,error}=await ctx.supabase.storage.from(BUCKET).download(row.storage_path);if(error)throw error;return{blob:data,fileName:row.file_name};
}
export async function deleteCloudAccountingDocument(documentId){
 const ctx=await context();if(!ctx||!ctx.canWrite)throw new Error("Droits administrateur ou comptable requis pour supprimer une pièce.");
 const {data:row,error:readError}=await ctx.supabase.from("accounting_documents").select("storage_path").eq("company_id",ctx.companyId).eq("id",documentId).single();if(readError)throw readError;
 const {error:removeError}=await ctx.supabase.storage.from(BUCKET).remove([row.storage_path]);if(removeError)throw removeError;
 const {error:deleteError}=await ctx.supabase.from("accounting_documents").delete().eq("company_id",ctx.companyId).eq("id",documentId);if(deleteError)throw deleteError;return true;
}
