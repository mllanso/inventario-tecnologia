export const localDate=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
export const movementKey=m=>m.group_id?'group:'+m.group_id:'lot:'+m.resource_ref;
export const movementName=kind=>({opening:'Saldo inicial',distribute:'Distribución multisede',adjustment:'Ajuste de inventario',transfer_create:'Reserva de transferencia',transfer_accept:'Transferencia recibida',transfer_reject:'Transferencia rechazada',transfer_cancel:'Transferencia cancelada',request_receive:'Recepción de compra',group_merge:'Unificación de agrupaciones',group_update:'Edición de agrupación'})[kind]||'Movimiento de inventario';
function validDate(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;}
export function buildInsights(data,business,filters,year,cutoff){
 if(!validDate(filters.from)||!validDate(filters.to)||filters.from>filters.to)throw Error('Indicá un rango de fechas válido.');
 if(filters.from<year+'-01-01'||filters.to>year+'-12-31'||filters.to>cutoff)throw Error('El rango debe estar dentro del ciclo y de la fecha de los datos disponibles.');
 const rows=(business.movements||[]).filter(m=>{const day=localDate(m.created_at);return day>=filters.from&&day<=filters.to&&(!filters.schools.length||filters.schools.includes(m.school_id))&&(!filters.resources.length||filters.resources.includes(movementKey(m)));}).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||Number(a.id)-Number(b.id));
 const schoolName=id=>data.schools.find(s=>s.id===id)?.name||id||'Sede sin identificar';
 const timeline=new Map(),distribution=new Map();let incoming=0,outgoing=0;
 for(const m of rows){const delta=Number(m.delta);if(!Number.isFinite(delta))throw Error('Hay movimientos con cantidades inválidas.');const month=localDate(m.created_at).slice(0,7);if(!timeline.has(month))timeline.set(month,{month,incoming:0,outgoing:0});const t=timeline.get(month);if(delta>0){incoming+=delta;t.incoming+=delta;}else{outgoing-=delta;t.outgoing-=delta;}
  // Distribución de actividad: unidades movilizadas, no stock existente.
  const id=filters.distribution==='resources'?movementKey(m):m.school_id;
  const label=filters.distribution==='resources'?(data.groups||[]).find(g=>'group:'+g.id===id)?.name||m.resource_name:schoolName(id);
  const item=distribution.get(id)||{id,label,units:0};item.units+=Math.abs(delta);distribution.set(id,item);
 }
 const start=new Date(filters.from.slice(0,7)+'-01T12:00:00Z'),end=filters.to.slice(0,7);
 const series=[];while(start.toISOString().slice(0,7)<=end){const month=start.toISOString().slice(0,7);series.push(timeline.get(month)||{month,incoming:0,outgoing:0});start.setUTCMonth(start.getUTCMonth()+1);}
 return {filters:structuredClone(filters),year,cutoff,rows,series,distribution:[...distribution.values()].sort((a,b)=>b.units-a.units),incoming,outgoing,net:incoming-outgoing,schools:new Set(rows.map(m=>m.school_id)).size,schoolName};
}
export function resourceChoices(data,movements,schools=[]){
 const result=new Map();for(const m of movements){if(schools.length&&!schools.includes(m.school_id))continue;const id=movementKey(m);if(!result.has(id))result.set(id,{id,name:(data.groups||[]).find(g=>'group:'+g.id===id)?.name||m.resource_name||'Recurso archivado'});}return [...result.values()].sort((a,b)=>a.name.localeCompare(b.name,'es'));
}
