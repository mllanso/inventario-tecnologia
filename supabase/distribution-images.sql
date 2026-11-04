-- Ejecutar después de annual-cycles.sql. Repetible y sin borrar datos.
begin;
create or replace function public.nexo_valid_resource_images(images jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(images) is distinct from 'array' then return false;end if;
 if jsonb_array_length(images)>5 then return false;end if;
 return not exists(select 1 from jsonb_array_elements(images)x where
  jsonb_typeof(x)<>'string' or length(x#>>'{}')>160000 or
  (x#>>'{}') !~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$');
end$$;

create or replace function public.nexo_distribute_resources(p_payload jsonb,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;previous_ids text[];meta jsonb;images jsonb;
begin
 if auth.uid() is null then raise exception 'NEXO_FORBIDDEN';end if;
 images:=coalesce(p_payload->'images','[]'::jsonb);
 if not public.nexo_valid_resource_images(images) then raise exception 'Imágenes inválidas: máximo cinco PNG normalizados';end if;
 -- La misma exclusión que usa la operación original protege stock y metadatos.
 perform 1 from public.nexo_workspace where id for update;
 select coalesce(array_agg(id),'{}'::text[]) into previous_ids from public.nexo_resources;
 -- Conserva permisos, validaciones, auditoría e idempotencia existentes.
 result:=public.nexo_business_action('distribute',p_payload,p_key);
 if jsonb_array_length(images)>0 then
  select coalesce(jsonb_object_agg(id,jsonb_build_object('images',images)),'{}'::jsonb) into meta
   from public.nexo_resources where not(id=any(previous_ids));
  if meta<>'{}'::jsonb then
   update public.nexo_workspace set cycle_details=jsonb_set(cycle_details,'{resourceMeta}',coalesce(cycle_details->'resourceMeta','{}'::jsonb)||meta) where id;
  end if;
 end if;
 return result;
end$$;

-- Incorporar imágenes a guardados y restauraciones sin reemplazar las funciones
-- de permisos/revisión. La modificación es idempotente y exige la versión anual.
do $$declare signature text;definition text;old_fragment text;new_fragment text;
begin
 old_fragment:='''valuationState'',r->''valuationState''';
 new_fragment:='''valuationState'',r->''valuationState'',''images'',r->''images''';
 foreach signature in array array['public.nexo_cycle_save_inventory(jsonb,bigint)','public.nexo_restore_with_cycles(jsonb,bigint)'] loop
  definition:=pg_get_functiondef(signature::regprocedure);
  if position(new_fragment in definition)=0 then
   if position(old_fragment in definition)=0 then raise exception 'Versión anual incompatible: %',signature;end if;
   definition:=replace(definition,old_fragment,new_fragment);
   execute definition;
  end if;
 end loop;
end$$;

create or replace function public.nexo_check_resource_media() returns trigger
language plpgsql set search_path='' as $$
begin
 if exists(select 1 from jsonb_each(coalesce(new.cycle_details->'resourceMeta','{}'::jsonb))e
  where e.value ? 'images' and not public.nexo_valid_resource_images(e.value->'images')) then
  raise exception 'Imágenes de recursos inválidas';
 end if;
 return new;
end$$;
drop trigger if exists nexo_check_resource_media on public.nexo_workspace;
create trigger nexo_check_resource_media before update of cycle_details on public.nexo_workspace
 for each row execute function public.nexo_check_resource_media();

revoke all on function public.nexo_valid_resource_images(jsonb),public.nexo_check_resource_media(),public.nexo_distribute_resources(jsonb,uuid) from public,anon,authenticated;
grant execute on function public.nexo_distribute_resources(jsonb,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
