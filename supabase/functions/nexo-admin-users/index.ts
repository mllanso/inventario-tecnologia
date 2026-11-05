import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {createAdminHandler} from './handler.js';
const url=Deno.env.get('SUPABASE_URL')!;
const anon=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')||'{}').default||Deno.env.get('SUPABASE_ANON_KEY')!;
const service=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}').default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const options={auth:{persistSession:false,autoRefreshToken:false}};
Deno.serve(createAdminHandler({
 userClient:(authorization: string)=>createClient(url,anon,{...options,global:{headers:{Authorization:authorization}}}),
 adminClient:createClient(url,service,options),
 allowedOrigin:Deno.env.get('NEXO_APP_ORIGIN')||'https://mllanso.github.io'
}));
