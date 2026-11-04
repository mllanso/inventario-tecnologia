-- Requiere annual-cycles.sql y distribution-images.sql. Conserva datos.
begin;
create or replace function public.nexo_group_update(p_payload jsonb,p_key uuid,p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;meta jsonb;rev bigint;gid text;
begin
 if auth.uid() is null then raise exception 'NEXO_FORBIDDEN';end if;
 select revision into rev from public.nexo_workspace where id for update;
 -- Reintentos confirmados no deben volver a aplicar imágenes sobre cambios nuevos.
 if exists(select 1 from public.nexo_action_keys where user_id=auth.uid() and key=p_key) then
  return public.nexo_business_action('group_update',p_payload,p_key);
 end if;
 if rev is distinct from p_expected_revision then raise exception 'NEXO_CONFLICT';end if;
 if jsonb_typeof(p_payload->'name') is distinct from 'string' or length(btrim(p_payload->>'name')) not between 1 and 120 then raise exception 'Indicá un nombre de hasta 120 caracteres';end if;
 gid:=p_payload->>'id';
 if not exists(select 1 from public.nexo_groups where id=gid and merged_into is null) then raise exception 'Agrupación inexistente o unificada';end if;
 if p_payload ? 'image' then
  if jsonb_typeof(p_payload->'image') is distinct from 'string' then raise exception 'Imagen inválida';end if;
  if p_payload->>'image'<>'' and not public.nexo_valid_resource_images(jsonb_build_array(p_payload->'image')) then raise exception 'Imagen inválida';end if;
 end if;
 result:=public.nexo_business_action('group_update',p_payload,p_key);
 if p_payload ? 'image' then
  select coalesce(jsonb_object_agg(r.id,coalesce(w.cycle_details->'resourceMeta'->r.id,'{}'::jsonb)||jsonb_build_object('groupImage',p_payload->'image')),'{}'::jsonb)
   into meta from public.nexo_resources r cross join public.nexo_workspace w where w.id and r.group_id=gid;
  update public.nexo_workspace set cycle_details=jsonb_set(cycle_details,'{resourceMeta}',coalesce(cycle_details->'resourceMeta','{}'::jsonb)||meta) where id;
 end if;
 return result;
end$$;

-- Conservar también el logo representativo al restaurar un respaldo.
do $$declare signature text;definition text;old_fragment text;new_fragment text;
begin
 old_fragment:='''images'',r->''images''';new_fragment:='''images'',r->''images'',''groupImage'',r->''groupImage''';
 foreach signature in array array['public.nexo_cycle_save_inventory(jsonb,bigint)','public.nexo_restore_with_cycles(jsonb,bigint)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position(new_fragment in definition)=0 then
   if position(old_fragment in definition)=0 then raise exception 'Instalá primero distribution-images.sql';end if;
   execute replace(definition,old_fragment,new_fragment);
  end if;
 end loop;
end$$;

create or replace function public.nexo_check_resource_media() returns trigger
language plpgsql set search_path='' as $$
begin
 if exists(select 1 from jsonb_each(coalesce(new.cycle_details->'resourceMeta','{}'::jsonb))e
  where (e.value ? 'images' and not public.nexo_valid_resource_images(e.value->'images'))
  or (e.value ? 'groupImage' and (jsonb_typeof(e.value->'groupImage') is distinct from 'string'
    or (e.value->>'groupImage'<>'' and not public.nexo_valid_resource_images(jsonb_build_array(e.value->'groupImage')))))) then
  raise exception 'Imágenes de recursos inválidas';
 end if;
 return new;
end$$;
revoke all on function public.nexo_group_update(jsonb,uuid,bigint) from public,anon,authenticated;
grant execute on function public.nexo_group_update(jsonb,uuid,bigint) to authenticated;
notify pgrst,'reload schema';
commit;
