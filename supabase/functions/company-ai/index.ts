import { createClient } from "npm:@supabase/supabase-js@2";

const origins = new Set(["https://mounzirgampene-dot.github.io","http://localhost:8000"]);
const allowedOrigin = (origin: string | null) => Boolean(origin && (origins.has(origin) || /^https:\/\/[a-z0-9-]+\.mizane-preview\.pages\.dev$/i.test(origin) || origin === "https://mizane-test-preview.pages.dev" || /^https:\/\/[a-z0-9-]+\.mizane-test-preview\.pages\.dev$/i.test(origin)));
const providers = {
  mistral: { endpoint:"https://api.mistral.ai/v1/chat/completions", models:["mistral-small-latest","mistral-medium-latest","mistral-large-latest","open-mistral-nemo","ministral-8b-latest","pixtral-12b-2409"] },
  groq: { endpoint:"https://api.groq.com/openai/v1/chat/completions", models:["llama-3.3-70b-versatile","meta-llama/llama-4-scout-17b-16e-instruct","openai/gpt-oss-120b","llama-3.1-8b-instant"] },
  gemini: { endpoint:"https://generativelanguage.googleapis.com/v1beta", models:["gemini-3.8-flash","gemini-3.7-flash","gemini-3.5-flash"] },
};
const AI_ALLOWED_ROLES = new Set(["admin","accountant"]);
const validUuid=(v)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
Deno.serve(async (req)=>{
 const origin=req.headers.get("Origin");
 const cors={...(allowedOrigin(origin)?{"Access-Control-Allow-Origin":origin}:{}),"Vary":"Origin","Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
 const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}});
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json(405,{error:"Méthode non autorisée."});
 const url=Deno.env.get("SUPABASE_URL"), service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!service)return json(500,{error:"Configuration serveur incomplète."});
 const auth=req.headers.get("Authorization")||"", jwt=auth.replace(/^Bearer\s+/i,"");
 if(!jwt||jwt===auth)return json(401,{error:"Authentification requise."});
 const admin=createClient(url,service,{auth:{autoRefreshToken:false,persistSession:false}});
 const {data:authData,error:authError}=await admin.auth.getUser(jwt);
 if(authError||!authData.user)return json(401,{error:"Session invalide ou expirée."});
 let body;
 try{const raw=await req.text();if(new TextEncoder().encode(raw).byteLength>12_000_000)return json(413,{error:"Requête trop volumineuse."});body=JSON.parse(raw);}catch{return json(400,{error:"JSON invalide."});}
 const companyId=body.company_id, provider=body.provider, action=body.action;
 if(!validUuid(companyId))return json(400,{error:"Entreprise invalide."});
 if(!Object.hasOwn(providers,provider))return json(400,{error:"Fournisseur IA non pris en charge."});
 const {data:member,error:memberError}=await admin.from("company_memberships").select("role,status").eq("company_id",companyId).eq("user_id",authData.user.id).maybeSingle();
 if(memberError)return json(500,{error:"Vérification des droits impossible."});
 if(!member||member.status!=="active"||!AI_ALLOWED_ROLES.has(member.role))return json(403,{error:"L’assistant IA connecté est réservé aux administrateurs et aux comptables de cette entreprise."});
 if(action==="configure"){
   if(!["admin","accountant"].includes(member.role))return json(403,{error:"Seuls l’administrateur et le comptable peuvent configurer la clé IA."});
   if(typeof body.api_key!=="string"||body.api_key.length>4096)return json(400,{error:"Clé API invalide."});
   const {data,error}=await admin.rpc("mizane_set_company_ai_secret",{p_company_id:companyId,p_provider:provider,p_api_key:body.api_key});
   if(error){console.error("AI credential save:",error.message);return json(500,{error:"Impossible d'enregistrer la clé IA dans le coffre sécurisé."});}
   return json(200,{configured:true,provider});
 }
 if(action==="delete"){
   if(!["admin","accountant"].includes(member.role))return json(403,{error:"Seuls l’administrateur et le comptable peuvent supprimer la clé IA."});
   const {data,error}=await admin.rpc("mizane_delete_company_ai_secret",{p_company_id:companyId,p_provider:provider});
   if(error){console.error("AI credential delete:",error.message);return json(500,{error:"Impossible de supprimer la clé IA."});}
   return json(200,{configured:false,provider});
 }
 if(action==="status"){
   if(!["admin","accountant"].includes(member.role))return json(403,{error:"Accès réservé à l’administrateur et au comptable."});
   const configured=[];
   for(const id of Object.keys(providers)){
     const {data,error}=await admin.rpc("mizane_get_company_ai_secret",{p_company_id:companyId,p_provider:id});
     if(error){console.error("AI credential status:",error.message);return json(500,{error:"État de configuration indisponible."});}
     if(data)configured.push(id);
   }
   return json(200,{providers:configured,role:member.role});
 }
 if(action!=="chat")return json(400,{error:"Action inconnue."});
 if(!Array.isArray(body.messages)||body.messages.length<1||body.messages.length>30)return json(400,{error:"Historique de conversation invalide."});
 const model=String(body.model||providers[provider].models[0]);
 if(!providers[provider].models.includes(model))return json(400,{error:"Modèle non autorisé."});
 const {data:key,error:keyError}=await admin.rpc("mizane_get_company_ai_secret",{p_company_id:companyId,p_provider:provider});
 if(keyError){console.error("AI credential read:",keyError.message);return json(500,{error:"Clé IA indisponible."});}
 if(!key)return json(409,{error:"Aucune clé IA n'est configurée pour cette entreprise."});
 const messages=body.messages;
 if(messages.some(m=>!m||!["system","user","assistant"].includes(m.role)))return json(400,{error:"Format de conversation invalide."});
 try{
   let response, text="";
   if(provider==="gemini"){
     const contents=messages.filter(m=>m.role!=="system").map(m=>({role:m.role==="assistant"?"model":"user",parts:(typeof m.content==="string"?[{text:m.content}]:(m.content||[]).map(p=>p.type==="text"?{text:p.text}:{inline_data:{mime_type:(p.image_url?.url||p.image_url||"").match(/^data:([^;]+);/)?.[1]||"image/jpeg",data:(p.image_url?.url||p.image_url||"").split(",")[1]||""}}))}));
     const system=messages.filter(m=>m.role==="system").map(m=>typeof m.content==="string"?m.content:"").join("\n");
     const geminiPayload=JSON.stringify({systemInstruction:{parts:[{text:system}]},contents,generationConfig:{temperature:Number(body.temperature??0.2),...(body.json?{response_mime_type:"application/json"}:{})}});
     let geminiTimedOut=false;
     for(let attempt=0;attempt<2;attempt++){
       try{
         response=await fetch(`${providers.gemini.endpoint}/models/${model}:generateContent`,{method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},signal:AbortSignal.timeout(12000),body:geminiPayload});
       }catch(error){
         geminiTimedOut=error instanceof Error&&(error.name==="TimeoutError"||error.name==="AbortError");
         if(attempt===0){await new Promise(resolve=>setTimeout(resolve,500));continue;}
         console.error("Gemini request failed:",geminiTimedOut?"timeout":"network");
         return json(geminiTimedOut?504:502,{error:geminiTimedOut?"Gemini met trop de temps à répondre. Réessayez dans quelques instants.":"Connexion au fournisseur Gemini impossible.",retryable:true,provider,model});
       }
       if(response.ok)break;
       const retryable=[500,502,503,504].includes(response.status);
       if(!retryable||attempt===1){
         text=await response.text();
         if(response.status===503)return new Response(JSON.stringify({error:"Gemini est temporairement saturé. Réessayez dans quelques instants.",retryable:true,provider,model}),{status:503,headers:{...cors,"Content-Type":"application/json; charset=utf-8","Retry-After":"3"}});
         return json(502,{error:`Erreur Gemini ${response.status} : ${text.slice(0,240)}`});
       }
       await new Promise(resolve=>setTimeout(resolve,500));
     }
     const data=await response.json();text=(data.candidates?.[0]?.content?.parts||[]).map(p=>p.text||"").join("");
   }else{
     const openAiMessages=messages.map(m=>({...m,content:Array.isArray(m.content)?m.content.map(p=>p.type==="image_url"&&typeof p.image_url==="string"?{...p,image_url:{url:p.image_url}}:p):m.content}));
     response=await fetch(providers[provider].endpoint,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},signal:AbortSignal.timeout(25000),body:JSON.stringify({model,temperature:Number(body.temperature??0.2),messages:openAiMessages,...(body.json?{response_format:{type:"json_object"}}:{})})});
     if(!response.ok){text=await response.text();return json(502,{error:`Erreur IA ${response.status} : ${text.slice(0,240)}`});}
     const data=await response.json();text=data.choices?.[0]?.message?.content||"";
   }
   return json(200,{content:text,provider,model});
 }catch(error){console.error("MIZANE AI upstream:",error instanceof Error?error.message:"unknown");return json(502,{error:"Le fournisseur IA est momentanément inaccessible."});}
});