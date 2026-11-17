// MIZANE — Écriture incrémentale cloud sécurisée.
import { createClient } from "npm:@supabase/supabase-js@2";
const allowedOrigins = new Set(["https://mounzirgampene-dot.github.io","http://localhost:8000"]);
const validUuid=(v:unknown):v is string=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
Deno.serve(async(req)=>{
 const origin=req.headers.get("Origin");
 const cors={...(origin&&allowedOrigins.has(origin)?{"Access-Control-Allow-Origin":origin}:{}),"Vary":"Origin","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
 const json=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}});
 const fail=(status:number,message:string)=>json(status,{error:message});
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return fail(405,"Méthode non autorisée.");
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)return fail(500,"Configuration serveur incomplète.");
 const auth=req.headers.get("Authorization")??"",jwt=auth.replace(/^Bearer\s+/i,"");
 if(!jwt||jwt===auth)return fail(401,"Authentification requise.");
 const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
 const {data:authData,error:authError}=await admin.auth.getUser(jwt),actor=authData.user;
 if(authError||!actor)return fail(401,"Session invalide ou expirée.");
 let body:Record<string,unknown>;
 try{const raw=await req.text();if(new TextEncoder().encode(raw).byteLength>1_000_000)return fail(413,"Lot de synchronisation trop volumineux.");const parsed=JSON.parse(raw);if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))return fail(400,"Corps de requête invalide.");body=parsed as Record<string,unknown>;}catch{return fail(400,"JSON invalide.");}
 const companyId=body.company_id,operationId=body.operation_id,changes=body.changes;
 if(!validUuid(companyId))return fail(400,"Identifiant d'entreprise invalide.");
 if(!validUuid(operationId))return fail(400,"Identifiant de lot invalide.");
 if(!Array.isArray(changes)||changes.length<1||changes.length>100)return fail(400,"Le lot doit contenir entre 1 et 100 changements.");
 const {data:membership,error:membershipError}=await admin.from("company_memberships").select("role,status").eq("company_id",companyId).eq("user_id",actor.id).maybeSingle();
 if(membershipError){console.error("push-accounting-changes membership:",membershipError.message);return fail(500,"Impossible de vérifier les autorisations.");}
 if(!membership||membership.status!=="active"||!["admin","accountant"].includes(membership.role))return fail(403,"Seuls un administrateur ou un comptable actif peuvent modifier la comptabilité.");
 const {data,error}=await admin.rpc("apply_accounting_changes",{p_company_id:companyId,p_actor_user_id:actor.id,p_operation_id:operationId,p_changes:changes});
 if(error){if(error.code==="42501")return fail(403,"Accès comptable refusé.");if(error.code==="23505")return fail(409,"Identifiant de lot déjà utilisé avec un contenu différent.");if(["22023","23514","23503","22P02","23502"].includes(error.code))return fail(422,error.message);console.error("push-accounting-changes RPC:",error.code,error.message);return fail(500,"La synchronisation a échoué. Les opérations du lot ont été annulées.");}
 return json(200,data as Record<string,unknown>);
});