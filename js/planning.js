import {createCSV} from './domain.js?v=20261104-sidebar';
import {planningBaseline,setPlanningBaseline,PLANNING_STATUSES,planningModel,planningBaseEntry,validatePlanningModel,setPlanningStatus,duplicatePlanningEntry,removePlanningEntry,nextPlanningCode} from './planning-domain.js?v=20261104-sidebar';
const $=s=>document.querySelector(s);
const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const options=(items,value)=>items.map(i=>`<option value="${h(i.id)}" ${i.id===value?'selected':''}>${h(i.name)}</option>`).join('');
export class PlanningView{
 constructor({getData,getFilters=()=>({}),canEdit,canDiscard=()=>true,save,bindNotes,refresh,toast,ask,download,cloudEnabled,createRequest}){
  Object.assign(this,{getData,getFilters,canEdit,canDiscard,save,bindNotes,refresh,toast,ask,download,cloudEnabled,createRequest});this.draft=null;this.modified=new Set();
  $('#planning-decision').onchange=()=>this.render();$('#planning-save').onclick=()=>this.saveChanges();$('#planning-add').onclick=()=>this.openEntry();
  $('#planning-discard').onclick=()=>{if(!this.canDiscard())return;const discard=()=>{this.clear();this.render();};if(!this.canEdit()){discard();return;}this.ask('Descartar cambios del plan','Se quitarán las filas agregadas y las modificaciones sin guardar. El inventario 2026 no cambia.',discard);};
  $('#planning-csv').onclick=()=>this.exportCSV();$('#planning-editor-close').onclick=()=>$('#planning-editor').close();
  window.addEventListener('beforeunload',event=>{if(this.hasChanges()){event.preventDefault();event.returnValue='';}});
 }
 clear(){this.draft=null;this.modified.clear();}
 hasChanges(){return this.draft!==null;}
 installed(){return !this.cloudEnabled||this.getData().planning2027?.version===2;}
 model(){return this.draft||planningModel(this.getData());}
 source(entry){return this.getData().resources.find(r=>r.id===entry.originResourceId);}
 baseline(entry){return planningBaseline(entry,this.source(entry));}
 school(entry){return this.getData().schools.find(s=>s.id===entry.schoolId)?.name||entry.schoolName;}
 category(entry){return this.getData().categories.find(c=>c.id===entry.categoryId)?.name||entry.categoryName;}
 rows(){
  const f=this.getFilters(),q=(f.search||'').trim().toLocaleLowerCase('es'),decision=$('#planning-decision').value;
  return this.model().entries.filter(e=>{
   const base=(!f.schools?.length||f.schools.includes(e.schoolId))&&(!f.categories?.length||f.categories.includes(e.categoryId))&&`${e.name} ${e.code} ${this.school(e)} ${this.category(e)}`.toLocaleLowerCase('es').includes(q);
   return base&&(this.modified.has(e.id)||decision==='all'||(decision==='review'?e.originResourceId&&!e.baselineOverride&&this.baseline(e)!==e.baselineQuantity:e.status===decision));
  });
 }
 change(id,field,value){
  const model=structuredClone(this.model()),index=model.entries.findIndex(e=>e.id===id);if(index<0)return;
  model.entries[index]=field==='status'?setPlanningStatus(model.entries[index],value):{...model.entries[index],[field]:value};this.draft=model;this.modified.add(id);this.updateMetrics();this.applyAccess();return model.entries[index];
 }
 delta(entry){if(entry.status!=='confirmed'||entry.quantity===''||entry.quantity==null||!Number.isInteger(Number(entry.quantity)))return '—';const d=Number(entry.quantity)-this.baseline(entry);return (d>0?'+':'')+d;}
 render(){
  const rows=this.rows();$('#planning-migration').hidden=this.installed();
  $('#planning-rows').innerHTML=rows.length?rows.map(e=>{
   const state=PLANNING_STATUSES.find(s=>s.id===e.status),review=e.originResourceId&&this.baseline(e)!==e.baselineQuantity;
   return `<tr data-plan-row="${h(e.id)}"><td><b>${h(e.name)}</b><small>${h(e.code)} · ${e.originResourceId?'Base de 2026':'Nuevo en el plan 2027'}</small></td><td>${h(this.school(e))}<small>${h(this.category(e))}</small></td><td class="baseline-quantity">${this.baseline(e)}${e.baselineOverride?'<small>Base ajustada solo en el plan</small>':''}${!e.originResourceId?'<small>Sin stock creado en 2026</small>':''}</td><td><select data-plan-status-select class="plan-state ${state.tone}" aria-label="Estado 2027 de ${h(e.code)}">${PLANNING_STATUSES.map(s=>`<option value="${s.id}" class="${s.tone}" ${s.id===e.status?'selected':''}>${s.name}</option>`).join('')}</select></td><td><input data-plan-quantity type="number" min="0" max="1000000" step="1" value="${e.status==='confirmed'?h(e.quantity??''):''}" placeholder="${e.status==='confirmed'?'Cantidad confirmada':'No habilitada'}" aria-label="Cantidad 2027 de ${h(e.code)}" ${e.status!=='confirmed'?'disabled':''}></td><td data-plan-delta>${this.delta(e)}</td><td><textarea data-plan-notes maxlength="500" rows="2" placeholder="Observaciones…" aria-label="Observaciones 2027 de ${h(e.code)}">${h(e.notes)}</textarea></td><td data-plan-followup>${this.modified.has(e.id)?'<span class="badge amber">Sin guardar</span>':'<span class="badge neutral">Guardado</span>'}${review?`<small>Revisar base: era ${e.baselineQuantity}</small><button class="text-button" data-plan-review>Actualizar base</button>`:''}</td><td><button type="button" class="row-action" data-plan-edit aria-label="Editar fila ${h(e.code)}">Editar</button><button type="button" class="row-action" data-plan-duplicate aria-label="Duplicar fila ${h(e.code)}">Duplicar</button><button type="button" class="row-action" data-plan-delete aria-label="Eliminar fila ${h(e.code)}">Eliminar</button></td></tr>`;
  }).join(''):'<tr><td class="empty" colspan="9">No hay filas para esta selección. Podés agregar un recurso al plan o restablecer los filtros.</td></tr>';
  $('#planning-rows').querySelectorAll('[data-plan-row]').forEach(row=>{
   const entry=this.model().entries.find(e=>e.id===row.dataset.planRow);
   row.querySelector('[data-plan-status-select]').onchange=event=>{this.change(entry.id,'status',event.target.value);this.render();};
   row.querySelector('[data-plan-quantity]').oninput=event=>{const changed=this.change(entry.id,'quantity',event.target.value);row.querySelector('[data-plan-delta]').textContent=this.delta(changed);row.querySelector('[data-plan-followup]').innerHTML='<span class="badge amber">Sin guardar</span>';};
   if(this.bindNotes&&this.getData().planning2027?.entries.some(e=>e.id===entry.id))this.bindNotes(row.querySelector('[data-plan-notes]'),entry.id);
   row.querySelector('[data-plan-edit]').onclick=()=>this.openEntry(this.model().entries.find(e=>e.id===entry.id));
   row.querySelector('[data-plan-duplicate]').onclick=()=>this.duplicate(entry.id);
   row.querySelector('[data-plan-delete]').onclick=()=>this.remove(entry.id);
   const review=row.querySelector('[data-plan-review]');if(review)review.onclick=()=>{this.change(entry.id,'baselineQuantity',this.baseline(entry));this.render();};
   const extra=entry.status==='confirmed'?Number(entry.quantity)-this.baseline(entry):0;
   if(this.createRequest&&this.getData().businessVersion===1&&extra>0){row.querySelector('[data-plan-followup]').insertAdjacentHTML('beforeend','<button type="button" class="text-button" data-plan-request>Solicitar '+extra+' unidades</button>');row.querySelector('[data-plan-request]').onclick=()=>this.createRequest({...entry,groupId:this.source(entry)?.groupId||entry.groupId||null},extra);}
  });
  $('#planning-count').textContent=`${rows.length} de ${this.model().entries.length} filas del plan · ${this.model().excludedResourceIds.length} recursos de 2026 omitidos`;
  $('#filter-count').textContent=`${rows.length} filas de planificación 2027 en esta selección`;
  this.updateMetrics();this.applyAccess();
 }
 updateMetrics(){
  const rows=this.rows();let units=0,invalid=0;const confirmed=rows.filter(e=>e.status==='confirmed');
  for(const e of confirmed){if(e.quantity!==''&&Number.isInteger(Number(e.quantity))&&Number(e.quantity)>=0&&Number(e.quantity)<=1000000)units+=Number(e.quantity);else invalid++;}
  const cards=[['Base 2026 referenciada',rows.filter(e=>e.originResourceId).reduce((n,e)=>n+this.baseline(e),0),'Las filas nuevas o duplicadas no suman stock'],['Confirmado · Verde',units,`${confirmed.length} filas${invalid?' · '+invalid+' cantidades por completar':''}`],['En proceso · Amarillo',rows.filter(e=>e.status==='in_progress').length,'Sin cantidades cargadas'],['Descontinuado/Rechazado · Rojo',rows.filter(e=>e.status==='rejected').length,'Sin cantidades cargadas']];
  $('#planning-metrics').innerHTML=cards.map(([label,value,note])=>`<article class="kpi"><p class="kpi-label">${label}</p><p class="kpi-value">${value}</p><span class="kpi-note">${note}</span></article>`).join('');
  $('#planning-dirty').textContent=this.hasChanges()?`${this.modified.size} cambios sin guardar`:'Planificación al día';$('#planning-discard').hidden=!this.hasChanges();
 }
 applyAccess(){
  const editable=this.canEdit()&&this.installed();
  $('#planning-rows').querySelectorAll('[data-plan-row]').forEach(row=>{row.querySelectorAll('input,select,textarea,button').forEach(input=>input.disabled=!editable);const entry=this.model().entries.find(e=>e.id===row.dataset.planRow);row.querySelector('[data-plan-quantity]').disabled=!editable||entry.status!=='confirmed';const notes=row.querySelector('[data-plan-notes]');if(!this.getData().planning2027?.entries.some(e=>e.id===entry.id)){notes.disabled=true;notes.placeholder='Guardá primero la estructura de esta fila';notes.title='El autoguardado se habilita después de crear la fila.';}});
  $('#planning-save').disabled=!editable||!this.hasChanges();$('#planning-add').disabled=!editable;$('#planning-discard').disabled=!this.canDiscard();
 }
 duplicate(id){
  if(!this.canEdit()||!this.installed())return;const model=structuredClone(this.model()),entry=model.entries.find(e=>e.id===id);
  model.entries.push(duplicatePlanningEntry(entry,model.entries,crypto.randomUUID()));this.draft=model;this.modified.add(model.entries.at(-1).id);this.render();this.toast('Fila duplicada solo en el plan 2027. Guardá la planificación para conservarla.');
 }
 remove(id){
  if(!this.canEdit()||!this.installed())return;const entry=this.model().entries.find(e=>e.id===id);
  this.ask('Eliminar fila de planificación',`Se quitará “${entry.name}” del plan 2027. No se elimina el recurso ni su cantidad en 2026.`,()=>{this.draft=removePlanningEntry(this.model(),id);this.modified.add(id);this.render();this.toast('Fila quitada del plan. Guardá la planificación para confirmar.');});
 }
 openEntry(entry=null){
  if(!this.canEdit()||!this.installed())return;const data=this.getData(),f=this.getFilters();if(!data.schools.length||!data.categories.length){this.toast('Primero registrá al menos un colegio y una categoría.');return;}
  const original=entry,represented=new Set(this.model().entries.map(e=>e.originResourceId));
  const available=data.resources.filter(r=>!represented.has(r.id));
  const e=entry||{id:crypto.randomUUID(),originResourceId:null,name:'',code:nextPlanningCode(this.model().entries),schoolId:f.schools?.[0]||data.schools[0].id,categoryId:f.categories?.[0]||data.categories[0].id,baselineQuantity:0,status:'in_progress',quantity:null,notes:''};
  $('#planning-editor-title').textContent=entry?'Editar fila del plan 2027':'Agregar recurso al plan 2027';
  $('#planning-editor-fields').innerHTML=`${!original?`<label class="full">Origen<select name="originResourceId"><option value="">Nuevo recurso para 2027 (sin agregar stock)</option>${available.map(r=>`<option value="${h(r.id)}">Recuperar ${h(r.code)} · ${h(r.name)}</option>`).join('')}</select></label>`:''}<label>Nombre del recurso<input name="name" required maxlength="120" value="${h(e.name)}"></label><label>Código del plan<input name="code" required maxlength="60" value="${h(e.code)}"></label><label>Colegio<select name="schoolId" required>${options(data.schools.some(s=>s.id===e.schoolId)?data.schools:[...data.schools,{id:e.schoolId,name:e.schoolName+' (archivado)'}],e.schoolId)}</select></label><label>Categoría<select name="categoryId" required>${options(data.categories.some(c=>c.id===e.categoryId)?data.categories:[...data.categories,{id:e.categoryId,name:e.categoryName+' (archivada)'}],e.categoryId)}</select></label><label>Cantidad actual / Base 2026 del plan<input name="baselineQuantity" type="number" min="0" max="1000000" step="1" required value="${this.baseline(e)}" ${e.originResourceId?'':'disabled'}><small id="planning-baseline-help">${e.originResourceId?'Solo modifica la base de comparación del plan. El inventario conserva su stock.':'Recurso nuevo en el plan: base 0, sin stock de 2026.'}</small></label><label>Estado 2027<select name="status" required>${options(PLANNING_STATUSES,e.status)}</select></label><label>Cantidad 2027<input name="quantity" type="number" min="0" max="1000000" step="1" value="${h(e.quantity??'')}" placeholder="Solo en Confirmado"></label><label class="full">Observaciones<textarea name="notes" maxlength="500" rows="3">${h(e.notes)}</textarea></label>`;
  let selectedSource=e.originResourceId,baseline=e.baselineQuantity,groupId=e.groupId||null;
  const state=()=>{const status=$('#planning-editor [name="status"]').value,input=$('#planning-editor [name="quantity"]');input.disabled=status!=='confirmed';input.required=status==='confirmed';if(status!=='confirmed')input.value='';$('#planning-editor [name="status"]').className='plan-state '+PLANNING_STATUSES.find(s=>s.id===status).tone;};
  $('#planning-editor [name="status"]').onchange=state;state();
  const origin=$('#planning-editor [name="originResourceId"]');if(origin)origin.onchange=event=>{selectedSource=event.target.value||null;const r=data.resources.find(r=>r.id===selectedSource);baseline=r?.quantity||0;const baseInput=$('#planning-editor [name="baselineQuantity"]');baseInput.value=baseline;baseInput.disabled=!selectedSource;$('#planning-baseline-help').textContent=selectedSource?'Solo modifica la base de comparación del plan. El inventario conserva su stock.':'Recurso nuevo en el plan: base 0, sin stock de 2026.';groupId=r?.groupId||null;for(const key of ['name','code','schoolId','categoryId']){if(r)$('#planning-editor [name="'+key+'"]').value=r[key];}if(!r)$('#planning-editor [name="code"]').value=nextPlanningCode(this.model().entries);};
  $('#planning-editor-error').textContent='';$('#planning-editor').showModal();if(original&&this.bindNotes&&this.getData().planning2027?.entries.some(p=>p.id===original.id))this.bindNotes($('#planning-editor [name="notes"]'),original.id);
  $('#planning-editor-form').onsubmit=event=>{event.preventDefault();try{const values=Object.fromEntries(new FormData(event.target));let row={...e,id:original?e.id:selectedSource?'base:'+selectedSource:e.id,originResourceId:selectedSource,name:values.name.trim(),code:values.code.trim(),schoolId:values.schoolId,schoolName:data.schools.find(s=>s.id===values.schoolId)?.name||e.schoolName,categoryId:values.categoryId,categoryName:data.categories.find(c=>c.id===values.categoryId)?.name||e.categoryName,baselineQuantity:baseline,status:values.status,quantity:values.status==='confirmed'?Number(values.quantity):null,notes:values.notes.trim(),groupId};row=setPlanningBaseline(row,selectedSource?Number(values.baselineQuantity):0,data.resources.find(r=>r.id===selectedSource));validatePlanningModel({version:2,entries:[row],excludedResourceIds:[]});const model=structuredClone(this.model());if(model.entries.some(x=>x.id!==row.id&&x.code.trim().toLowerCase()===row.code.toLowerCase()))throw Error('Ese código ya existe en el plan.');const index=model.entries.findIndex(x=>x.id===row.id);if(index>=0)model.entries[index]=row;else model.entries.push(row);model.excludedResourceIds=model.excludedResourceIds.filter(id=>id!==row.originResourceId);this.draft=model;this.modified.add(row.id);$('#planning-editor').close();this.render();this.toast('Fila preparada. Guardá la planificación para conservar los cambios.');}catch(error){$('#planning-editor-error').textContent=error.message;}};
 }
 async saveChanges(){
  if(!this.canEdit()||!this.installed()||!this.hasChanges())return;$('#planning-error').textContent='';
  try{const model=structuredClone(this.model());model.entries=model.entries.map(e=>({...e,quantity:e.status==='confirmed'?(e.quantity===''||e.quantity==null?NaN:Number(e.quantity)):null}));validatePlanningModel(model);if(await this.save(model)){this.clear();this.refresh();this.toast('Planificación 2027 guardada. El inventario 2026 se conserva.');}}
  catch(error){$('#planning-error').textContent=error.message;}
 }
 exportCSV(){const rows=this.rows().map(e=>[e.code,e.name,this.school(e),this.category(e),this.baseline(e),PLANNING_STATUSES.find(s=>s.id===e.status).name,e.status==='confirmed'?e.quantity:'',this.delta(e),e.notes,e.originResourceId||'Nuevo 2027',this.modified.has(e.id)?'Sin guardar':'Guardado']);this.download(createCSV([['Código del plan','Recurso','Colegio','Categoría','Base 2026','Estado 2027','Cantidad confirmada 2027','Diferencia','Observaciones','Origen 2026','Seguimiento'],...rows]),'text/csv;charset=utf-8;','nexo-planificacion-2027.csv');}
}


