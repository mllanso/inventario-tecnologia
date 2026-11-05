-- Requiere los módulos anuales existentes. No crea cuentas Auth ni borra datos.
begin;
create table if not exists public.nexo_user_directory(
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default '' check(length(display_name)<=120),
 last_role text not null default 'viewer' check(last_role in ('admin','coordinator','viewer','requester')),
 version integer not null default 0,updated_at timestamptz not null default now()
);
insert into public.nexo_user_directory(user_id,last_role) select user_id,role from public.nexo_members on conflict do nothing;
create table if not exists public.nexo_admin_events(
 id bigint generated always as identity primary key,created_at timestamptz not null default now(),
 actor_id uuid,actor_email text not null,entity text not null,entity_id text not null,
 action text not null,fields jsonb not null,before_data jsonb,after_data jsonb,reason text
);
create index if not exists nexo_admin_events_actor on public.nexo_admin_events(actor_id,id desc);
alter table public.nexo_user_directory enable row level security;
alter table public.nexo_admin_events enable row level security;
revoke all on public.nexo_user_directory,public.nexo_admin_events from public,anon,authenticated;

create or replace function public.nexo_admin_authorize() returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.nexo_members where user_id=auth.uid() and role in ('admin','coordinator')) then raise exception 'NEXO_FORBIDDEN';end if;
 return auth.uid();
end$$;

-- Nunca guardar contraseñas, tokens, archivos ni importes en esta bitácora.
create or replace function public.nexo_audit_safe(value jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select value-array['password','encrypted_password','token','logo','images','groupImage','unit_price','unitPrice','unitCostCents','total_cents','totalCents','cents','cycle_details','school_tools','planning_2027_v2','plans_2027']
$$;
create or replace function public.nexo_audit_diff(kind text,item_id text,previous jsonb,current_value jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare fields jsonb;actor text;clean_before jsonb;clean_after jsonb;
begin
 if previous is not distinct from current_value then return;end if;
 select coalesce(jsonb_agg(k order by k),'[]'::jsonb) into fields from
 (select key k from jsonb_each(coalesce(previous,'{}'::jsonb)) union select key from jsonb_each(coalesce(current_value,'{}'::jsonb)))keys
 where previous->k is distinct from current_value->k and k not in ('id','user_id','position','version','updated_at','updated_by','created_at');
 if jsonb_array_length(fields)=0 then return;end if;
 select email into actor from auth.users where id=auth.uid();
 clean_before:=public.nexo_audit_safe(previous);clean_after:=public.nexo_audit_safe(current_value);
 if kind in ('Presupuestos','Importes estimados') then clean_before:=null;clean_after:=null;end if;
 insert into public.nexo_admin_events(actor_id,actor_email,entity,entity_id,action,fields,before_data,after_data,reason)
 values(auth.uid(),coalesce(actor,'Administración SQL'),kind,coalesce(item_id,'sin-id'),case when previous is null then 'Alta' when current_value is null then 'Baja' else 'Modificación' end,fields,clean_before,clean_after,nullif(current_setting('nexo.admin_reason',true),''));
end$$;
create or replace function public.nexo_audit_rows() returns trigger
language plpgsql security definer set search_path='' as $$
declare previous jsonb;current_value jsonb;item jsonb;
begin
 if TG_OP<>'INSERT' then previous:=to_jsonb(old);end if;
 if TG_OP<>'DELETE' then current_value:=to_jsonb(new);end if;
 item:=coalesce(current_value,previous);
 if TG_TABLE_NAME='nexo_members' and TG_OP<>'DELETE' then
  insert into public.nexo_user_directory(user_id,last_role) values((item->>'user_id')::uuid,item->>'role') on conflict(user_id) do update set last_role=excluded.last_role,version=public.nexo_user_directory.version+1,updated_at=now() where public.nexo_user_directory.last_role is distinct from excluded.last_role;
 end if;
 perform public.nexo_audit_diff(TG_ARGV[0],coalesce(item->>'id',concat_ws(':',item->>'user_id',item->>'school_id')),previous,current_value);
 return null;
end$$;
create or replace function public.nexo_audit_workspace() returns trigger
language plpgsql security definer set search_path='' as $$
declare config text[];previous jsonb;current_value jsonb;item_id text;before_items jsonb;after_items jsonb;
begin
 foreach config slice 1 in array array[['planning_2027_v2','Planificación'],['school_tools','Herramientas']] loop
  previous:=to_jsonb(old)->config[1];current_value:=to_jsonb(new)->config[1];
  if previous is not distinct from current_value then continue;end if;
  if config[1]='planning_2027_v2' then previous:=previous->'entries';current_value:=current_value->'entries';end if;
  select coalesce(jsonb_object_agg(e->>'id',e),'{}'::jsonb) into before_items from jsonb_array_elements(coalesce(previous,'[]'::jsonb))e;
  select coalesce(jsonb_object_agg(e->>'id',e),'{}'::jsonb) into after_items from jsonb_array_elements(coalesce(current_value,'[]'::jsonb))e;
  for item_id in select jsonb_object_keys(before_items||after_items) loop perform public.nexo_audit_diff(config[2],item_id,before_items->item_id,after_items->item_id);end loop;
 end loop;
 foreach config slice 1 in array array[['resourceMeta','Metadatos de recurso'],['budgets','Presupuestos'],['estimates','Importes estimados']] loop
  before_items:=coalesce(old.cycle_details->config[1],'{}'::jsonb);after_items:=coalesce(new.cycle_details->config[1],'{}'::jsonb);
  if before_items is not distinct from after_items then continue;end if;
  for item_id in select jsonb_object_keys(before_items||after_items) loop
   previous:=before_items->item_id;current_value:=after_items->item_id;
   if config[1]<>'resourceMeta' then
    if previous is not null then previous:=jsonb_build_object('importe',previous);end if;
    if current_value is not null then current_value:=jsonb_build_object('importe',current_value);end if;
   end if;
   perform public.nexo_audit_diff(config[2],item_id,previous,current_value);
  end loop;
 end loop;
 return null;
end$$;
do $$declare config text[];begin
 foreach config slice 1 in array array[
 ['nexo_resources','Inventario'],['nexo_schools','Colegios'],['nexo_categories','Categorías'],['nexo_groups','Agrupaciones'],
 ['nexo_contracts','Contratos'],['nexo_requests','Solicitudes'],['nexo_transfers','Transferencias'],
 ['nexo_members','Roles de usuario'],['nexo_site_members','Sedes de usuario'],['nexo_business_permissions','Permisos de usuario'],['nexo_user_directory','Perfil de usuario']
 ] loop
  execute format('drop trigger if exists nexo_admin_audit on public.%I',config[1]);
  execute format('create trigger nexo_admin_audit after insert or update or delete on public.%I for each row execute function public.nexo_audit_rows(%L)',config[1],config[2]);
 end loop;
end$$;
drop trigger if exists nexo_admin_audit on public.nexo_workspace;
create trigger nexo_admin_audit after update on public.nexo_workspace for each row execute function public.nexo_audit_workspace();

create or replace function public.nexo_admin_users(p_search text default '',p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform public.nexo_admin_authorize();
 if p_offset is null or p_offset<0 or length(p_search)>200 then raise exception 'Filtro inválido';end if;
 with accounts as (
  select d.user_id id,u.email,d.display_name name,coalesce(m.role,d.last_role) role,m.user_id is not null active,d.version,
  lower(u.email)='mllanso@northfield.edu.ar' protected,
  coalesce(p.finance,false) finance,coalesce(p.procurement,false) procurement,
  coalesce((select jsonb_agg(jsonb_build_object('schoolId',s.school_id,'canReceive',s.can_receive)) from public.nexo_site_members s where s.user_id=d.user_id),'[]'::jsonb) sites
  from public.nexo_user_directory d join auth.users u on u.id=d.user_id left join public.nexo_members m on m.user_id=d.user_id
  left join public.nexo_business_permissions p on p.user_id=d.user_id
  where position(lower(coalesce(p_search,'')) in lower(u.email||' '||d.display_name))>0
 ) select jsonb_build_object('total',(select count(*) from accounts),'users',coalesce((select jsonb_agg(a) from (select * from accounts order by active desc,email offset p_offset limit 50)a),'[]'::jsonb),
 'schools',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.nexo_schools),'[]'::jsonb),
 'auditSince',(select min(created_at) from public.nexo_admin_events)) into result;
 return result;
end$$;

create or replace function public.nexo_admin_prepare_user(p_email text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid;v integer;
begin
 perform public.nexo_admin_authorize();
 if p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Correo inválido';end if;
 select id into uid from auth.users where lower(email)=lower(btrim(p_email));
 if exists(select 1 from public.nexo_members where user_id=uid) then raise exception 'El usuario ya tiene acceso';end if;
 select version into v from public.nexo_user_directory where user_id=uid;
 return jsonb_build_object('id',uid,'version',coalesce(v,0));
end$$;

create or replace function public.nexo_admin_save_user(p_user_id uuid,p_profile jsonb,p_expected_version integer,p_action text default 'save') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid;existing_role text;next_role text;user_email text;v integer;site jsonb;why text;
begin
 actor:=public.nexo_admin_authorize();
 perform 1 from public.nexo_workspace where id for update;
 actor:=public.nexo_admin_authorize();
 select email into user_email from auth.users where id=p_user_id;
 if user_email is null then raise exception 'Usuario inexistente';end if;
 select role into existing_role from public.nexo_members where user_id=p_user_id;
 select version into v from public.nexo_user_directory where user_id=p_user_id;
 if coalesce(v,0) is distinct from p_expected_version then raise exception 'NEXO_CONFLICT';end if;
 if lower(user_email)='mllanso@northfield.edu.ar' then raise exception 'La cuenta principal está protegida';end if;
 if p_action not in ('save','deactivate') or p_action is null then raise exception 'Acción inválida';end if;
 why:=btrim(coalesce(p_profile->>'reason',''));if length(why) not between 1 and 1000 then raise exception 'Indicá un motivo';end if;
 perform set_config('nexo.admin_reason',why,true);
 if p_action='deactivate' then
  if actor=p_user_id then raise exception 'No podés desactivar tu propia cuenta';end if;
  if existing_role is null then raise exception 'El acceso ya está desactivado';end if;
  insert into public.nexo_user_directory(user_id,last_role) values(p_user_id,existing_role) on conflict do nothing;
  update public.nexo_user_directory set last_role=existing_role,version=version+1,updated_at=now() where user_id=p_user_id;
  delete from public.nexo_members where user_id=p_user_id;
  delete from public.nexo_business_permissions where user_id=p_user_id;
  delete from public.nexo_site_members where user_id=p_user_id;
 else
  next_role:=p_profile->>'role';
  perform public.nexo_admin_validate_profile(p_profile);
  if actor=p_user_id and next_role is distinct from existing_role then raise exception 'No podés cambiar tu propio rol';end if;
  insert into public.nexo_user_directory(user_id,display_name,last_role) values(p_user_id,btrim(p_profile->>'name'),next_role)
   on conflict(user_id) do update set display_name=excluded.display_name,last_role=excluded.last_role;
  insert into public.nexo_members(user_id,role) values(p_user_id,next_role) on conflict(user_id) do update set role=excluded.role;
  insert into public.nexo_business_permissions(user_id,finance,procurement) values(p_user_id,(p_profile->>'finance')::boolean,(p_profile->>'procurement')::boolean)
   on conflict(user_id) do update set finance=excluded.finance,procurement=excluded.procurement;
  delete from public.nexo_site_members where user_id=p_user_id;
  for site in select * from jsonb_array_elements(p_profile->'sites') loop insert into public.nexo_site_members values(p_user_id,site->>'schoolId',(site->>'canReceive')::boolean);end loop;
  update public.nexo_user_directory set version=version+1,updated_at=now() where user_id=p_user_id;
 end if;
 return jsonb_build_object('ok',true,'id',p_user_id);
end$$;

create or replace function public.nexo_admin_validate_profile(p_profile jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare site jsonb;role_name text;
begin
 perform public.nexo_admin_authorize();role_name:=p_profile->>'role';
 if role_name is null or role_name not in ('admin','coordinator','viewer','requester') then raise exception 'Rol inválido';end if;
 if jsonb_typeof(p_profile->'name') is distinct from 'string' or length(btrim(p_profile->>'name')) not between 1 and 120 then raise exception 'Nombre inválido';end if;
 if jsonb_typeof(p_profile->'finance') is distinct from 'boolean' or jsonb_typeof(p_profile->'procurement') is distinct from 'boolean' then raise exception 'Permisos inválidos';end if;
 if role_name='requester' and ((p_profile->>'finance')::boolean or (p_profile->>'procurement')::boolean) then raise exception 'Un solicitante no puede administrar compras ni finanzas';end if;
 if role_name='viewer' and (p_profile->>'procurement')::boolean then raise exception 'Un lector no puede administrar compras';end if;
 if length(btrim(coalesce(p_profile->>'reason',''))) not between 1 and 1000 then raise exception 'Indicá un motivo';end if;
 if jsonb_typeof(p_profile->'sites') is distinct from 'array' then raise exception 'Sedes inválidas';end if;
 if jsonb_array_length(p_profile->'sites')>100 or (role_name='requester' and jsonb_array_length(p_profile->'sites')=0) then raise exception 'Asigná las sedes del usuario';end if;
 if exists(select 1 from jsonb_array_elements(p_profile->'sites')s group by s->>'schoolId' having count(*)>1) then raise exception 'Sedes repetidas';end if;
 for site in select * from jsonb_array_elements(p_profile->'sites') loop
  if not exists(select 1 from public.nexo_schools where id=site->>'schoolId') or jsonb_typeof(site->'canReceive') is distinct from 'boolean' then raise exception 'Sede inválida';end if;
 end loop;
 return true;
end$$;

create or replace function public.nexo_admin_audit(p_actor uuid default null,p_before bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform public.nexo_admin_authorize();
 return jsonb_build_object('events',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('target',coalesce(
  case when e.entity in ('Roles de usuario','Perfil de usuario','Permisos de usuario','Sedes de usuario') then (select email from auth.users where id::text=split_part(e.entity_id,':',1)) end,
  nullif(e.after_data->>'name',''),nullif(e.before_data->>'name',''),
  (select name from public.nexo_resources where id=e.entity_id),e.entity_id)))
  from (select * from public.nexo_admin_events where (p_actor is null or actor_id=p_actor) and (p_before is null or id<p_before) order by id desc limit 100)e),'[]'::jsonb));
end$$;
revoke all on function public.nexo_admin_authorize(),public.nexo_audit_safe(jsonb),public.nexo_audit_diff(text,text,jsonb,jsonb),public.nexo_audit_rows(),public.nexo_audit_workspace(),public.nexo_admin_users(text,integer),public.nexo_admin_prepare_user(text),public.nexo_admin_save_user(uuid,jsonb,integer,text),public.nexo_admin_audit(uuid,bigint) from public,anon,authenticated;
grant execute on function public.nexo_admin_authorize(),public.nexo_admin_users(text,integer),public.nexo_admin_prepare_user(text),public.nexo_admin_save_user(uuid,jsonb,integer,text),public.nexo_admin_audit(uuid,bigint) to authenticated;
revoke all on function public.nexo_admin_validate_profile(jsonb) from public,anon,authenticated;
grant execute on function public.nexo_admin_validate_profile(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
