export const PLANNING_STATUSES = [
  {id:'confirmed',name:'Confirmado',tone:'green'},
  {id:'in_progress',name:'En proceso',tone:'amber'},
  {id:'rejected',name:'Descontinuado/Rechazado',tone:'red'}
];
const text = (value,max) => typeof value==='string' && value.trim().length>0 && value.length<=max;
export function validatePlanningModel(model){
  if(!model || model.version!==2 || !Array.isArray(model.entries) || model.entries.length>5000 || !Array.isArray(model.excludedResourceIds) || model.excludedResourceIds.length>5000)throw Error('El plan 2027 no tiene un formato válido.');
  const ids=new Set(),codes=new Set(),origins=new Set(),excluded=new Set();
  for(const id of model.excludedResourceIds){if(!text(id,120)||excluded.has(id))throw Error('Hay exclusiones inválidas o repetidas en el plan.');excluded.add(id);}
  for(const e of model.entries){
    if(!e||!text(e.id,200)||ids.has(e.id)||!text(e.name,120)||!text(e.code,60)||codes.has(e.code.trim().toLowerCase())||!text(e.schoolId,120)||!text(e.schoolName,120)||!text(e.categoryId,120)||!text(e.categoryName,120)||!Number.isInteger(e.baselineQuantity)||e.baselineQuantity<0||e.baselineQuantity>1000000||typeof e.notes!=='string'||e.notes.length>500)throw Error('Revisá los datos del recurso: nombre, código único, colegio, categoría y observaciones.');
    ids.add(e.id);codes.add(e.code.trim().toLowerCase());
    if(e.originResourceId!=null){if(!text(e.originResourceId,120)||origins.has(e.originResourceId)||excluded.has(e.originResourceId))throw Error('Un recurso de 2026 está repetido o excluido en el plan.');origins.add(e.originResourceId);}
    if(!PLANNING_STATUSES.some(s=>s.id===e.status))throw Error('Elegí Confirmado, En proceso o Descontinuado/Rechazado.');
    if(e.status==='confirmed'){
      if(!Number.isInteger(e.quantity)||e.quantity<0||e.quantity>1000000)throw Error('Completá una cantidad confirmada entera entre 0 y 1.000.000.');
    }else if(e.quantity!==null)throw Error('Solo los recursos confirmados pueden tener una cantidad para 2027.');
  }
  return model;
}
export function planningBaseEntry(resource,data,legacy){
  const confirmed=['same','more','less'].includes(legacy?.choice);
  return {id:'base:'+resource.id,originResourceId:resource.id,name:resource.name,code:resource.code,schoolId:resource.schoolId,schoolName:data.schools.find(s=>s.id===resource.schoolId)?.name||'Colegio archivado',categoryId:resource.categoryId,categoryName:data.categories.find(c=>c.id===resource.categoryId)?.name||'Categoría archivada',baselineQuantity:legacy?.baselineQuantity??resource.quantity,status:confirmed?'confirmed':legacy?.choice==='discontinue'?'rejected':'in_progress',quantity:confirmed?legacy.quantity:null,notes:legacy?.notes||'',groupId:resource.groupId||null};
}
export function planningModel(data){
  const model=data.planning2027?structuredClone(data.planning2027):{version:2,entries:[],excludedResourceIds:[]};
  const represented=new Set(model.entries.map(e=>e.originResourceId).filter(Boolean));
  for(const resource of data.resources){
    if(!represented.has(resource.id)&&!model.excludedResourceIds.includes(resource.id))model.entries.push(planningBaseEntry(resource,data,(data.plans2027||[]).find(p=>p.resourceId===resource.id)));
  }
  return model;
}
export function nextPlanningCode(entries){
  let highest=0n;for(const entry of entries){const m=/^P27-(\d+)$/i.exec(entry.code);if(m&&BigInt(m[1])>highest)highest=BigInt(m[1]);}
  const code='P27-'+(highest+1n).toString().padStart(4,'0');if(code.length>60)throw Error('La secuencia de códigos del plan llegó a su límite.');return code;
}
export function setPlanningStatus(entry,status){
  if(!PLANNING_STATUSES.some(s=>s.id===status))throw Error('Estado de planificación inválido.');
  return {...entry,status,quantity:status==='confirmed'?(entry.quantity??''):null};
}
export function duplicatePlanningEntry(entry,entries,id){
  return {...entry,id,originResourceId:null,baselineQuantity:0,code:nextPlanningCode(entries),copiedFrom:entry.id};
}
export function removePlanningEntry(model,id){
  const next=structuredClone(model),row=next.entries.find(e=>e.id===id);if(!row)return next;
  next.entries=next.entries.filter(e=>e.id!==id);if(row.originResourceId&&!next.excludedResourceIds.includes(row.originResourceId))next.excludedResourceIds.push(row.originResourceId);return next;
}

