-- Ejecutar TODO en SQL Editor del proyecto existente. No reinstalar setup.sql.
-- Logos normalizados PNG incluidos en la ficha privada; no usa un bucket público.
begin;
alter table public.nexo_workspace add column if not exists school_tools jsonb not null default '[]'::jsonb;
create or replace function public.nexo_tool_name_key(p_name text) returns text
language sql immutable set search_path='' as $$
 select btrim(regexp_replace(lower(regexp_replace(normalize(p_name,NFD),U&'[\0300-\036f]','','g')),'[^a-z0-9]+',' ','g'));
$$;
create or replace function public.nexo_validate_tools(p_items jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Formato del catálogo de herramientas incompatible';end if;
 if jsonb_array_length(p_items)>100 or octet_length(p_items::text)>16500000 then raise exception 'Máximo 100 fichas de herramientas';end if;
 if exists(select 1 from jsonb_array_elements(p_items) t where
  jsonb_typeof(t) is distinct from 'object'
  or jsonb_typeof(t->'id') is distinct from 'string' or length(t->>'id') not between 1 and 120 or length(btrim(t->>'id'))=0
  or jsonb_typeof(t->'schoolId') is distinct from 'string' or length(t->>'schoolId') not between 1 and 120 or length(btrim(t->>'schoolId'))=0
  or jsonb_typeof(t->'name') is distinct from 'string' or length(t->>'name') not between 1 and 120 or length(btrim(t->>'name'))=0
  or jsonb_typeof(t->'category') is distinct from 'string' or length(t->>'category') not between 1 and 80 or length(btrim(t->>'category'))=0
  or jsonb_typeof(t->'description') is distinct from 'string' or length(t->>'description')>2000
  or jsonb_typeof(t->'notes') is distinct from 'string' or length(t->>'notes')>1000
  or jsonb_typeof(t->'website') is distinct from 'string' or length(t->>'website')>500
  or (t->>'website'<>'' and (t->>'website' !~ '^https://[^/@[:space:]]+([/?#].*)?$' or t->>'website' ~ '^https://[^/]*@'))
  or jsonb_typeof(t->'status') is distinct from 'string' or t->>'status' not in ('available','in_progress','required')
  or jsonb_typeof(t->'logo') is distinct from 'string' or length(t->>'logo')>160000 or t->>'logo' !~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$'
 ) then raise exception 'Revisá los datos y cargá un logo de imagen válido para cada herramienta';end if;
 if exists(select 1 from jsonb_array_elements(p_items) t group by t->>'id' having count(*)>1)
  or exists(select 1 from jsonb_array_elements(p_items) t group by t->>'schoolId',public.nexo_tool_name_key(t->>'name') having count(*)>1)
 then raise exception 'Herramienta repetida en la misma sede';end if;
end $$;

create or replace function public.nexo_tools_load() returns jsonb
language plpgsql security definer set search_path='' as $$
declare member_role text;items jsonb;rev bigint;
begin
 select role into member_role from public.nexo_members where user_id=auth.uid();
 if member_role is null then raise exception 'NEXO_FORBIDDEN';end if;
 select revision,school_tools into rev,items from public.nexo_workspace where id;
 if member_role='requester' then
  items:=coalesce((select jsonb_agg(t) from jsonb_array_elements(items)t where exists(select 1 from public.nexo_site_members s where s.user_id=auth.uid() and s.school_id=t->>'schoolId')),'[]'::jsonb);
 end if;
 return jsonb_build_object('revision',rev,'items',items);
end $$;

create or replace function public.nexo_tool_save(p_action text,p_tool jsonb,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare member_role text;items jsonb;rev bigint;tool_id text;
begin
 select role into member_role from public.nexo_members where user_id=auth.uid() for share;
 if member_role is null or member_role not in ('admin','coordinator') then raise exception 'NEXO_FORBIDDEN';end if;
 select revision,school_tools into rev,items from public.nexo_workspace where id for update;
 if p_expected_revision is null or p_expected_revision<>rev then raise exception 'NEXO_CONFLICT';end if;
 tool_id:=p_tool->>'id';
 if tool_id is null or length(tool_id) not between 1 and 120 then raise exception 'Identificador de herramienta inválido';end if;
 if p_action='delete' then
  if not exists(select 1 from jsonb_array_elements(items)t where t->>'id'=tool_id) then raise exception 'La herramienta ya no existe. Actualizá los datos';end if;
 elsif p_action='upsert' then
  perform public.nexo_validate_tools(jsonb_build_array(p_tool));
  if not exists(select 1 from public.nexo_schools s where s.id=p_tool->>'schoolId') then raise exception 'El colegio ya no existe';end if;
 else raise exception 'Acción de herramienta inválida';end if;
 items:=coalesce((select jsonb_agg(t) from jsonb_array_elements(items)t where t->>'id'<>tool_id),'[]'::jsonb);
 if p_action='upsert' then items:=items||jsonb_build_array(p_tool);end if;
 perform public.nexo_validate_tools(items);
 update public.nexo_workspace set school_tools=items,revision=revision+1,updated_at=now(),updated_by=auth.uid() where id returning revision into rev;
 return jsonb_build_object('revision',rev);
end $$;

create or replace function public.nexo_restore_with_tools(p_inventory jsonb,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare saved jsonb;
begin
 if to_regprocedure('public.nexo_restore_with_planning(jsonb,bigint)') is not null then
  saved:=public.nexo_restore_with_planning(p_inventory-'schoolTools',p_expected_revision);
 else saved:=public.nexo_save(p_inventory-'schoolTools',p_expected_revision);end if;
 if p_inventory ? 'schoolTools' then
  perform public.nexo_validate_tools(p_inventory->'schoolTools');
  update public.nexo_workspace set school_tools=p_inventory->'schoolTools',revision=revision+1,updated_at=now(),updated_by=auth.uid() where id returning jsonb_build_object('revision',revision) into saved;
 end if;
 return saved;
end $$;
revoke all on function public.nexo_validate_tools(jsonb),public.nexo_tools_load(),public.nexo_tool_save(text,jsonb,bigint),public.nexo_restore_with_tools(jsonb,bigint) from public,anon,authenticated;
revoke all on function public.nexo_tool_name_key(text) from public,anon,authenticated;
grant execute on function public.nexo_tools_load(),public.nexo_tool_save(text,jsonb,bigint),public.nexo_restore_with_tools(jsonb,bigint) to authenticated;
commit;
