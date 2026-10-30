import { PLAN_CHOICES, makePlan, validateData, validatePlans, createCSV } from './domain.js?v=20261030-plan2027';
const $ = selector => document.querySelector(selector);
const html = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export class PlanningView {
  constructor({getData,canEdit,save,refresh,toast,ask,download,cloudEnabled}) {
    Object.assign(this,{getData,canEdit,save,refresh,toast,ask,download,cloudEnabled});
    this.drafts=new Map();this.rows=[];
    $('#planning-decision').onchange=()=>this.render(this.rows);
    $('#planning-save').onclick=()=>this.saveChanges();
    $('#planning-discard').onclick=()=>this.ask('Descartar planificación sin guardar','Se quitarán los cambios pendientes. La planificación ya guardada se conserva.',()=>{this.clear();this.render(this.rows);});
    $('#planning-csv').onclick=()=>this.exportCSV();
    window.addEventListener('beforeunload',event=>{if(this.hasChanges()){event.preventDefault();event.returnValue='';}});
  }
  hasChanges(){return this.drafts.size>0;}
  clear(){this.drafts.clear();}
  installed(){return !this.cloudEnabled || Object.hasOwn(this.getData(),'plans2027');}
  planFor(resource){return this.drafts.get(resource.id) || (this.getData().plans2027 || []).find(p=>p.resourceId===resource.id);}
  visibleRows(){
    const filter=$('#planning-decision').value;
    return this.rows.filter(r=>{
      const p=this.planFor(r);
      return this.drafts.has(r.id) || filter==='all' || (filter==='pending'?!p?.choice:filter==='review'?p?.choice && p.baselineQuantity!==r.quantity:p?.choice===filter);
    });
  }
  edit(resource,field,value){
    const prior=this.planFor(resource);
    const draft={resourceId:resource.id,baselineQuantity:resource.quantity,choice:'',quantity:'',notes:'',...prior,[field]:value};
    draft.baselineQuantity=resource.quantity;
    if(draft.choice==='same')draft.quantity=resource.quantity;
    if(draft.choice==='discontinue')draft.quantity=0;
    if(!draft.choice){draft.quantity='';draft.notes='';}
    this.drafts.set(resource.id,draft);
    this.updateMetrics();this.applyAccess();
    return draft;
  }
  render(rows){
    this.rows=rows;
    $('#planning-migration').hidden=this.installed();
    const data=this.getData(),visible=this.visibleRows();
    $('#planning-rows').innerHTML=visible.length?visible.map(r=>{
      const p=this.planFor(r),choice=p?.choice||'',quantity=p?.quantity??'';
      const review=!!choice && p.baselineQuantity!==r.quantity;
      return `<tr data-plan-row="${html(r.id)}"><td><b>${html(r.name)}</b><small>${html(r.code)}</small></td><td>${html(data.schools.find(s=>s.id===r.schoolId)?.name)}<small>${html(data.categories.find(c=>c.id===r.categoryId)?.name)}</small></td><td class="baseline-quantity">${r.quantity}</td><td><select data-plan-choice aria-label="Necesidad 2027 de ${html(r.code)}"><option value="">Pendiente de definir</option>${PLAN_CHOICES.map(c=>`<option value="${c.id}" ${c.id===choice?'selected':''}>${c.name}</option>`).join('')}</select></td><td><input data-plan-quantity type="number" min="${choice==='more'?r.quantity+1:choice==='less'?1:0}" max="${choice==='less'?r.quantity-1:1000000}" step="1" value="${html(quantity)}" ${!choice||['same','discontinue'].includes(choice)?'readonly':''} placeholder="Cantidad total" aria-label="Cantidad 2027 de ${html(r.code)}"></td><td data-plan-delta>${this.delta(r,p)}</td><td><textarea data-plan-notes maxlength="500" rows="2" placeholder="Justificación o detalle…" aria-label="Observaciones 2027 de ${html(r.code)}" ${!choice?'readonly':''}>${html(p?.notes||'')}</textarea></td><td data-plan-status>${this.drafts.has(r.id)?'<span class="badge amber">Sin guardar</span>':review?`<span class="badge amber">Revisar base</span><small>Base guardada: ${p.baselineQuantity}</small><button class="text-button" data-plan-review>Usar cantidad actual</button>`:choice?'<span class="badge green">Guardado</span>':'<span class="badge neutral">Pendiente</span>'}</td></tr>`;
    }).join(''):'<tr><td class="empty" colspan="8">No hay recursos para estos filtros. Los recursos que registres en 2026 aparecerán acá automáticamente.</td></tr>';
    $('#planning-count').textContent=`${visible.length} de ${rows.length} lotes en la selección`;
    $('#planning-rows').querySelectorAll('[data-plan-row]').forEach(row=>{
      const resource=rows.find(r=>r.id===row.dataset.planRow);
      row.querySelector('[data-plan-choice]').onchange=event=>{this.edit(resource,'choice',event.target.value);this.render(this.rows);};
      for(const [selector,field] of [['[data-plan-quantity]','quantity'],['[data-plan-notes]','notes']])row.querySelector(selector).oninput=event=>{
        const draft=this.edit(resource,field,event.target.value);
        row.querySelector('[data-plan-delta]').textContent=this.delta(resource,draft);
        row.querySelector('[data-plan-status]').innerHTML='<span class="badge amber">Sin guardar</span>';
        // Una edición reafirma la base actual; mantiene coherente el total automático.
        if(['same','discontinue'].includes(draft.choice))row.querySelector('[data-plan-quantity]').value=draft.quantity;
      };
      const review=row.querySelector('[data-plan-review]');
      if(review)review.onclick=()=>{this.edit(resource,'choice',this.planFor(resource).choice);this.render(this.rows);};
    });
    this.updateMetrics();this.applyAccess();
  }
  delta(resource,plan){
    if(!plan?.choice || plan.quantity==='')return '—';
    const quantity=Number(plan.quantity);
    if(!Number.isInteger(quantity))return '—';
    const difference=quantity-resource.quantity;
    return (difference>0?'+':'')+difference;
  }
  updateMetrics(){
    const visible=this.visibleRows();
    const total=visible.reduce((sum,r)=>sum+r.quantity,0);
    let planned=0,pending=0,review=0;
    for(const r of visible){
      const p=this.planFor(r);
      if(!p?.choice || p.quantity==='')pending++;
      else { try {validatePlans([{...p,quantity:Number(p.quantity)}],[r]);planned+=Number(p.quantity);}catch{pending++;} }
      if(p?.choice && p.baselineQuantity!==r.quantity)review++;
    }
    const cards=[['Unidades 2026',total,'Inventario de los filtros activos'],['Unidades previstas 2027',planned,pending?'Total parcial · faltan decisiones':'Cantidad total necesaria'],['Lotes pendientes',pending,'Todavía sin una cantidad definida'],['Bases para revisar',review,'Cambió la cantidad de 2026']];
    $('#planning-metrics').innerHTML=cards.map(([label,value,note])=>`<article class="kpi"><p class="kpi-label">${label}</p><p class="kpi-value">${value}</p><span class="kpi-note">${note}</span></article>`).join('');
    $('#planning-dirty').textContent=this.hasChanges()?`${this.drafts.size} lotes con cambios sin guardar`:'Planificación al día';
    $('#planning-discard').hidden=!this.hasChanges();
  }
  applyAccess(){
    const editable=this.canEdit() && this.installed();
    $('#planning-rows').querySelectorAll('input,select,textarea,button').forEach(input=>input.disabled=!editable);
    $('#planning-save').disabled=!editable||!this.hasChanges();
    $('#planning-discard').disabled=!this.canEdit();
  }
  async saveChanges(){
    if(!this.canEdit()||!this.installed()||!this.hasChanges())return;
    $('#planning-error').textContent='';
    try{
      const next=structuredClone(this.getData());
      const plans=new Map((next.plans2027||[]).map(p=>[p.resourceId,p]));
      for(const [id,draft] of this.drafts){
        const resource=next.resources.find(r=>r.id===id);
        if(!resource)throw Error('Un recurso ya no existe. Descartá los cambios y actualizá los datos.');
        if(!draft.choice){plans.delete(id);continue;}
        try{plans.set(id,makePlan(resource,draft.choice,draft.quantity===''?NaN:Number(draft.quantity),draft.notes));}
        catch(error){throw Error(`${resource.code} · ${resource.name}: ${error.message}`);}
      }
      next.plans2027=[...plans.values()];validateData(next);
      if(await this.save(next)){this.clear();this.refresh();this.toast('Planificación 2027 guardada.');}
    }catch(error){$('#planning-error').textContent=error.message;}
  }
  exportCSV(){
    const data=this.getData();
    const rows=this.visibleRows().map(r=>{
      const p=this.planFor(r);
      return [r.code,r.name,data.schools.find(s=>s.id===r.schoolId)?.name,data.categories.find(c=>c.id===r.categoryId)?.name,r.quantity,PLAN_CHOICES.find(c=>c.id===p?.choice)?.name||'Pendiente',p?.choice?p.quantity:'',p?.choice?this.delta(r,p):'',p?.notes||'',p?.baselineQuantity??'',this.drafts.has(r.id)?'Sin guardar':p?.choice&&p.baselineQuantity!==r.quantity?'Revisar base':p?.choice?'Guardado':'Pendiente'];
    });
    this.download(createCSV([['Código','Recurso 2026','Colegio','Categoría','Cantidad 2026 actual','Decisión 2027','Cantidad total 2027','Diferencia','Observaciones','Base 2026 al planificar','Seguimiento'],...rows]),'text/csv;charset=utf-8;','nexo-planificacion-2027.csv');
  }
}
