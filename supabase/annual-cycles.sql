-- Requiere business.sql, planning-2027-v2.sql y school-tools.sql ya instalados.
-- Conserva los datos y comienza el archivo anual a partir de esta instalación.
begin;
alter table public.nexo_workspace add column if not exists cycle_details jsonb not null default '{"resourceMeta":{},"budgets":{},"estimates":{}}'::jsonb;
alter table public.nexo_resources drop constraint if exists nexo_resources_acquisition_year_check;
alter table public.nexo_resources add constraint nexo_resources_acquisition_year_check check(acquisition_year between 1980 and 2100);
do $$begin execute replace(pg_get_functiondef('public.nexo_business_action(text,jsonb,uuid)'::regprocedure),'2026','extract(year from now() at time zone ''America/Argentina/Buenos_Aires'')::integer');end$$;
create table if not exists public.nexo_cycle_frames(
 year integer primary key check(year between 2000 and 2100),captured_at timestamptz not null,
 revision bigint not null,document jsonb not null
);
alter table public.nexo_cycle_frames enable row level security;
revoke all on public.nexo_cycle_frames from public,anon,authenticated;

create or replace function public.nexo_cycle_document() returns jsonb language plpgsql security definer set search_path='' as $$
declare inv jsonb;biz jsonb;details jsonb;
begin
 select cycle_details into details from public.nexo_workspace where id;
 select jsonb_build_object('version',1,'currency','USD','businessVersion',1,
 'schools',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'location',s.location,'costCenter',s.cost_center) order by s.position) from public.nexo_schools s),'[]'::jsonb),
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.position) from public.nexo_categories c),'[]'::jsonb),
 'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'categoryId',g.category_id)) from public.nexo_groups g where g.merged_into is null),'[]'::jsonb),
 'resources',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'code',r.code,'schoolId',r.school_id,'categoryId',r.category_id,'state',r.state,'use',r.frequency,'year',r.acquisition_year,'quantity',r.quantity,'target',r.target,'unitPrice',r.unit_price,'groupId',r.group_id,'contractId',r.contract_id,'trafficStatus',r.traffic_status,'reserved',coalesce((select sum(t.quantity) from public.nexo_transfers t where t.resource_id=r.id and t.status='pending'),0))||coalesce(details->'resourceMeta'->r.id,'{}'::jsonb) order by r.position) from public.nexo_resources r),'[]'::jsonb),
 'plans2027',w.plans_2027,'planning2027',w.planning_2027_v2,'schoolTools',w.school_tools,'cycleDetails',details) into inv from public.nexo_workspace w where id;
 select jsonb_build_object(
 'contracts',coalesce((select jsonb_agg(c) from public.nexo_contracts c),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(q order by q.created_at desc) from public.nexo_requests q),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(e order by e.created_at) from public.nexo_request_events e),'[]'::jsonb),
 'transfers',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('origin_id',r.school_id,'resource_name',r.name)) from public.nexo_transfers t join public.nexo_resources r on r.id=t.resource_id),'[]'::jsonb),
 'receipts',coalesce((select jsonb_agg(r) from public.nexo_receipts r),'[]'::jsonb),
 'movements',coalesce((select jsonb_agg(m order by m.created_at,m.id) from public.nexo_movements m),'[]'::jsonb)) into biz;
 return jsonb_build_object('inventory',inv,'business',biz);
end $$;
create or replace function public.nexo_cycle_capture() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.nexo_cycle_frames f join public.nexo_workspace w on w.id where f.year=extract(year from now() at time zone 'America/Argentina/Buenos_Aires')::integer and f.revision=w.revision) then return null;end if;
 insert into public.nexo_cycle_frames(year,captured_at,revision,document)
 select extract(year from now() at time zone 'America/Argentina/Buenos_Aires')::integer,now(),revision,public.nexo_cycle_document() from public.nexo_workspace where id
 on conflict(year) do update set captured_at=excluded.captured_at,revision=excluded.revision,document=excluded.document;
 return null;
end $$;
drop trigger if exists nexo_capture_annual on public.nexo_workspace;
create constraint trigger nexo_capture_annual after update on public.nexo_workspace deferrable initially deferred for each row execute function public.nexo_cycle_capture();
insert into public.nexo_cycle_frames(year,captured_at,revision,document)
 select extract(year from now() at time zone 'America/Argentina/Buenos_Aires')::integer,now(),revision,public.nexo_cycle_document() from public.nexo_workspace where id
 on conflict(year) do nothing;

create or replace function public.nexo_cycle_load(p_year integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare access jsonb;frame public.nexo_cycle_frames;inv jsonb;biz jsonb;rev bigint;scope jsonb;is_requester boolean;
begin
 access:=public.nexo_business_access();if access is null then raise exception 'NEXO_FORBIDDEN';end if;
 if p_year is null or p_year not between 2000 and 2100 then raise exception 'Ciclo inválido';end if;
 select * into frame from public.nexo_cycle_frames where year<=p_year order by year desc limit 1;
 inv:=coalesce(frame.document->'inventory',jsonb_build_object('version',1,'currency','USD','businessVersion',1,'schools','[]'::jsonb,'categories','[]'::jsonb,'resources','[]'::jsonb,'groups','[]'::jsonb,'plans2027','[]'::jsonb,'planning2027',jsonb_build_object('version',2,'entries','[]'::jsonb,'excludedResourceIds','[]'::jsonb),'schoolTools','[]'::jsonb,'cycleDetails','{}'::jsonb));
 biz:=coalesce(frame.document->'business',jsonb_build_object('contracts','[]'::jsonb,'requests','[]'::jsonb,'events','[]'::jsonb,'transfers','[]'::jsonb,'movements','[]'::jsonb,'receipts','[]'::jsonb));
 is_requester:=access->>'role'='requester';
 if is_requester then
  select coalesce(jsonb_agg(s->>'schoolId'),'[]'::jsonb) into scope from jsonb_array_elements(access->'sites')s;
  inv:=jsonb_set(inv,'{schools}',coalesce((select jsonb_agg(s) from jsonb_array_elements(inv->'schools')s where scope ? (s->>'id')),'[]'::jsonb));
  inv:=jsonb_set(inv,'{resources}',coalesce((select jsonb_agg(r||jsonb_build_object('unitPrice',null)) from jsonb_array_elements(inv->'resources')r where scope ? (r->>'schoolId')),'[]'::jsonb));
  inv:=jsonb_set(inv,'{schoolTools}',coalesce((select jsonb_agg(t-'unitCostCents') from jsonb_array_elements(inv->'schoolTools')t where scope ? (t->>'schoolId')),'[]'::jsonb));
  inv:=jsonb_set(inv,'{plans2027}',coalesce((select jsonb_agg(p) from jsonb_array_elements(inv->'plans2027')p where exists(select 1 from jsonb_array_elements(inv->'resources')r where r->>'id'=p->>'resourceId')),'[]'::jsonb));
  inv:=jsonb_set(inv,'{planning2027}',jsonb_build_object('version',2,'entries',coalesce((select jsonb_agg(p) from jsonb_array_elements(inv->'planning2027'->'entries')p where scope ? (p->>'schoolId')),'[]'::jsonb),'excludedResourceIds','[]'::jsonb));
  biz:=jsonb_set(biz,'{requests}',coalesce((select jsonb_agg(q) from jsonb_array_elements(biz->'requests')q where scope ? (q->>'school_id') or q->>'requester'=auth.uid()::text),'[]'::jsonb));
  biz:=jsonb_set(biz,'{events}',coalesce((select jsonb_agg(e) from jsonb_array_elements(biz->'events')e where exists(select 1 from jsonb_array_elements(biz->'requests')q where q->>'id'=e->>'request_id')),'[]'::jsonb));
  biz:=jsonb_set(biz,'{transfers}',coalesce((select jsonb_agg(t) from jsonb_array_elements(biz->'transfers')t where scope ? (t->>'origin_id') or scope ? (t->>'destination_id')),'[]'::jsonb));
  biz:=biz||jsonb_build_object('contracts','[]'::jsonb,'movements','[]'::jsonb,'receipts','[]'::jsonb);
  inv:=jsonb_set(inv,'{cycleDetails}','{}'::jsonb);
 elsif not (access->>'finance')::boolean then inv:=jsonb_set(inv,'{cycleDetails}',(inv->'cycleDetails')-'budgets'-'estimates');end if;
 select revision into rev from public.nexo_workspace where id;
 return jsonb_build_object('revision',rev,'role',access->>'role','inventory',inv,'business',biz||jsonb_build_object('access',access),'cycle',jsonb_build_object('year',p_year,'cutoff',make_date(p_year,12,31),'snapshotAt',frame.captured_at,'available',frame.year is not null,'readOnly',p_year<>extract(year from now() at time zone 'America/Argentina/Buenos_Aires')::integer,'firstYear',(select min(year) from public.nexo_cycle_frames)));
end $$;

create or replace function public.nexo_cycle_action(p_action text,p_payload jsonb,p_year integer,p_expected_revision bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare access jsonb;rev bigint;details jsonb;items jsonb;key text;amount numeric;
begin
 access:=public.nexo_business_access();if access is null or access->>'role' not in ('admin','coordinator') then raise exception 'NEXO_FORBIDDEN';end if;
 if p_year is null or p_year<>extract(year from now() at time zone 'America/Argentina/Buenos_Aires')::integer then raise exception 'El ciclo está cerrado para edición';end if;
 select revision,cycle_details into rev,details from public.nexo_workspace where id for update;
 if p_expected_revision is null or rev<>p_expected_revision then raise exception 'NEXO_CONFLICT';end if;
 key:=p_payload->>'id';
 if p_action in ('budget','estimate') then
  if not (access->>'finance')::boolean then raise exception 'Sin permiso financiero';end if;
  amount:=(p_payload->>'cents')::numeric;if amount is null or amount<0 or amount>100000000000000 or trunc(amount)<>amount then raise exception 'Importe inválido';end if;
  if p_action='budget' then
   if not exists(select 1 from public.nexo_schools where id=key) then raise exception 'Colegio inexistente';end if;
   details:=jsonb_set(details,array['budgets'],coalesce(details->'budgets','{}'::jsonb)||jsonb_build_object(p_year::text||':'||key,amount));
  else
   if not exists(select 1 from public.nexo_requests where id=key::uuid) then raise exception 'Solicitud inexistente';end if;
   details:=jsonb_set(details,array['estimates'],coalesce(details->'estimates','{}'::jsonb)||jsonb_build_object(key,amount));
  end if;
  update public.nexo_workspace set cycle_details=details where id;
 elsif p_action='plan_note' then
  if jsonb_typeof(p_payload->'notes') is distinct from 'string' or length(p_payload->>'notes')>500 then raise exception 'Observación inválida';end if;
  select planning_2027_v2 into items from public.nexo_workspace where id;
  if not exists(select 1 from jsonb_array_elements(items->'entries')e where e->>'id'=key) then raise exception 'Guardá primero la fila nueva antes de agregar observaciones';end if;
  items:=jsonb_set(items,'{entries}',(select jsonb_agg(case when e->>'id'=key then e||jsonb_build_object('notes',p_payload->>'notes') else e end) from jsonb_array_elements(items->'entries')e));
  update public.nexo_workspace set planning_2027_v2=items where id;
 elsif p_action='tool_note' then
  if jsonb_typeof(p_payload->'notes') is distinct from 'string' or length(p_payload->>'notes')>1000 then raise exception 'Observación inválida';end if;
  select school_tools into items from public.nexo_workspace where id;
  if not exists(select 1 from jsonb_array_elements(items)e where e->>'id'=key) then raise exception 'Guardá primero la herramienta nueva';end if;
  items:=(select jsonb_agg(case when e->>'id'=key then e||jsonb_build_object('notes',p_payload->>'notes') else e end) from jsonb_array_elements(items)e);
  update public.nexo_workspace set school_tools=items where id;
 else raise exception 'Acción de ciclo inválida';end if;
 update public.nexo_workspace set revision=revision+1,updated_at=now(),updated_by=auth.uid() where id returning revision into rev;
 return jsonb_build_object('revision',rev);
end $$;

create or replace function public.nexo_cycle_save_inventory(p_inventory jsonb,p_expected_revision bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;meta jsonb;old_meta jsonb;
begin
 if exists(select 1 from jsonb_array_elements(p_inventory->'resources')r where (r->>'year')::integer>extract(year from now() at time zone 'America/Argentina/Buenos_Aires')::integer) then raise exception 'Año de adquisición futuro';end if;
 result:=public.nexo_save(p_inventory-'cycleDetails',p_expected_revision);
 select cycle_details->'resourceMeta' into old_meta from public.nexo_workspace where id;
 select coalesce(jsonb_object_agg(r->>'id',coalesce(old_meta->(r->>'id'),'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object('assetKind',r->'assetKind','valuationState',r->'valuationState'))),'{}'::jsonb) into meta from jsonb_array_elements(p_inventory->'resources')r;
 if exists(select 1 from jsonb_each(meta) e where (e.value ? 'assetKind' and e.value->>'assetKind' not in ('Hardware','Licencias','Mobiliario','Sin clasificar')) or (e.value ? 'valuationState' and e.value->>'valuationState' not in ('En uso','Depósito','Amortizado','Sin clasificar'))) then raise exception 'Clasificación patrimonial inválida';end if;
 update public.nexo_workspace set cycle_details=jsonb_set(cycle_details,'{resourceMeta}',meta) where id;
 return result;
end $$;
do $$begin if to_regprocedure('public.nexo_validate_tools_core(jsonb)') is null then alter function public.nexo_validate_tools(jsonb) rename to nexo_validate_tools_core;end if;end$$;
create or replace function public.nexo_validate_tools(p_items jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.nexo_validate_tools_core(p_items);
 if exists(select 1 from jsonb_array_elements(p_items)t where
  (t ? 'provider' and (jsonb_typeof(t->'provider')<>'string' or length(t->>'provider')>120))
  or (t->>'licences' is not null and (jsonb_typeof(t->'licences')<>'number' or (t->>'licences')::numeric<0 or (t->>'licences')::numeric>1000000 or trunc((t->>'licences')::numeric)<>(t->>'licences')::numeric))
  or (t->>'unitCostCents' is not null and (jsonb_typeof(t->'unitCostCents')<>'number' or (t->>'unitCostCents')::numeric<0 or (t->>'unitCostCents')::numeric>1000000000 or trunc((t->>'unitCostCents')::numeric)<>(t->>'unitCostCents')::numeric))
 )then raise exception 'Datos de software inválidos';end if;
end$$;
do $$begin if to_regprocedure('public.nexo_tool_save_base(text,jsonb,bigint)') is null then alter function public.nexo_tool_save(text,jsonb,bigint) rename to nexo_tool_save_base;end if;end$$;
create or replace function public.nexo_tool_save(p_action text,p_tool jsonb,p_expected_revision bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare previous jsonb;
begin
 if p_action='upsert' then select t into previous from public.nexo_workspace w cross join lateral jsonb_array_elements(w.school_tools)t where w.id and t->>'id'=p_tool->>'id';end if;
 if p_action='upsert' then perform public.nexo_validate_tools(jsonb_build_array(coalesce(previous,'{}'::jsonb)||p_tool));end if;
 return public.nexo_tool_save_base(p_action,coalesce(previous,'{}'::jsonb)||p_tool,p_expected_revision);
end$$;
create or replace function public.nexo_restore_with_cycles(p_inventory jsonb,p_expected_revision bigint) returns jsonb language plpgsql security definer set search_path='' as $$
declare saved jsonb;details jsonb;meta jsonb;old_meta jsonb;a jsonb;
begin
 a:=public.nexo_business_access();
 if p_inventory ? 'cycleDetails' then
  details:=p_inventory->'cycleDetails';
  if jsonb_typeof(details)<>'object' or (details ? 'budgets' and jsonb_typeof(details->'budgets')<>'object') or (details ? 'estimates' and jsonb_typeof(details->'estimates')<>'object') then raise exception 'Respaldo financiero inválido';end if;
  if (details ? 'budgets' or details ? 'estimates') and not coalesce((a->>'finance')::boolean,false) then raise exception 'Sin permiso financiero';end if;
  if exists(select 1 from jsonb_each(coalesce(details->'budgets','{}'::jsonb)||coalesce(details->'estimates','{}'::jsonb))e where jsonb_typeof(e.value)<>'number' or (e.value#>>'{}')::numeric<0 or (e.value#>>'{}')::numeric>100000000000000 or trunc((e.value#>>'{}')::numeric)<>(e.value#>>'{}')::numeric) then raise exception 'Importes de respaldo inválidos';end if;
 end if;
 select cycle_details->'resourceMeta' into old_meta from public.nexo_workspace where id;
 saved:=public.nexo_restore_with_tools(p_inventory-'cycleDetails',p_expected_revision);
 select coalesce(jsonb_object_agg(r->>'id',coalesce(old_meta->(r->>'id'),'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object('assetKind',r->'assetKind','valuationState',r->'valuationState'))),'{}'::jsonb) into meta from jsonb_array_elements(p_inventory->'resources')r;
 if exists(select 1 from jsonb_each(meta)e where e.value ? 'assetKind' and e.value->>'assetKind' not in ('Hardware','Licencias','Mobiliario','Sin clasificar') or e.value ? 'valuationState' and e.value->>'valuationState' not in ('En uso','Depósito','Amortizado','Sin clasificar')) then raise exception 'Clasificación inválida';end if;
 update public.nexo_workspace set cycle_details=(cycle_details||coalesce(details,'{}'::jsonb))||jsonb_build_object('resourceMeta',meta),revision=revision+1,updated_at=now(),updated_by=auth.uid() where id returning jsonb_build_object('revision',revision) into saved;
 return saved;
end$$;
revoke all on function public.nexo_cycle_document(),public.nexo_cycle_capture(),public.nexo_cycle_load(integer),public.nexo_cycle_action(text,jsonb,integer,bigint),public.nexo_cycle_save_inventory(jsonb,bigint) from public,anon,authenticated;
revoke all on function public.nexo_validate_tools(jsonb),public.nexo_validate_tools_core(jsonb),public.nexo_restore_with_cycles(jsonb,bigint) from public,anon,authenticated;
revoke all on function public.nexo_tool_save_base(text,jsonb,bigint),public.nexo_tool_save(text,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.nexo_tool_save(text,jsonb,bigint) to authenticated;
grant execute on function public.nexo_restore_with_cycles(jsonb,bigint) to authenticated;
grant execute on function public.nexo_cycle_load(integer),public.nexo_cycle_action(text,jsonb,integer,bigint),public.nexo_cycle_save_inventory(jsonb,bigint) to authenticated;
commit;
