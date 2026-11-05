const roles=new Set(['admin','coordinator','viewer','requester']);
export function validateNewUser(body){
 if(!body||typeof body.email!=='string'||body.email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(body.email))throw Error('Ingresá un correo válido.');
 if(typeof body.password!=='string'||body.password.length<12||body.password.length>128)throw Error('La contraseña inicial debe tener entre 12 y 128 caracteres.');
 if(!roles.has(body.role)||typeof body.name!=='string'||!body.name.trim()||body.name.length>120||typeof body.reason!=='string'||!body.reason.trim()||body.reason.length>1000)throw Error('Completá nombre, rol y motivo válidos.');
 if(!Array.isArray(body.sites)||body.sites.length>100||typeof body.finance!=='boolean'||typeof body.procurement!=='boolean')throw Error('Revisá las sedes y los permisos.');
 return {...body,email:body.email.trim().toLowerCase()};
}
// Las dependencias se inyectan para probar sin tocar el Auth real.
export function createAdminHandler({userClient,adminClient,allowedOrigin='https://mllanso.github.io'}){
 return async request=>{
  const headers={'Access-Control-Allow-Origin':allowedOrigin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin','Content-Type':'application/json','Cache-Control':'no-store'};
  const response=(status,body)=>new Response(JSON.stringify(body),{status,headers});
  if(request.headers.get('origin')&&request.headers.get('origin')!==allowedOrigin)return response(403,{error:'Origen no autorizado.'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(request.method!=='POST')return response(405,{error:'Método no permitido.'});
  const authorization=request.headers.get('Authorization')||'';
  if(!/^Bearer \S+$/i.test(authorization))return response(401,{error:'Iniciá sesión nuevamente.'});
  try{
   const client=userClient(authorization),token=authorization.slice(7);
   const auth=await client.auth.getUser(token);
   if(auth.error||!auth.data?.user)return response(401,{error:'La sesión no es válida.'});
   // Nunca confiar en user_metadata, el rol del navegador o un user_id del body.
   const allowed=await client.rpc('nexo_admin_authorize');
   if(allowed.error)return response(403,{error:'No tenés permiso para administrar usuarios.'});
   const text=await request.text();if(text.length>16000)return response(413,{error:'Formulario demasiado grande.'});
   let body;try{body=validateNewUser(JSON.parse(text));}catch(error){return response(400,{error:error.message});}
   const {password,email,...profile}=body;
   const valid=await client.rpc('nexo_admin_validate_profile',{p_profile:profile});
   if(valid.error)return response(400,{error:valid.error.message});
   const existing=await client.rpc('nexo_admin_prepare_user',{p_email:body.email});
   if(existing.error)return response(400,{error:existing.error.message});
   let id=existing.data.id,created=false;
   if(!id){
    const result=await adminClient.auth.admin.createUser({email:body.email,password:body.password,email_confirm:true});
    if(result.error||!result.data?.user)return response(400,{error:'No se pudo crear la cuenta. Verificá si el correo ya existe o la contraseña cumple la política de Supabase.'});
    id=result.data.user.id;created=true;
   }
   const saved=await client.rpc('nexo_admin_save_user',{p_user_id:id,p_profile:profile,p_expected_version:existing.data.version,p_action:'save'});
   if(saved.error)return response(409,{error:'La cuenta existe en Supabase pero no se habilitó el acceso. Corregí el formulario y reintentá. '+saved.error.message});
   return response(200,{ok:true,id,created,message:created?'Usuario creado y habilitado.':'Acceso habilitado para la cuenta existente. Su contraseña anterior se conserva.'});
  }catch{return response(500,{error:'No se pudo confirmar el alta. Actualizá la lista antes de reintentar.'});}
 };
}
