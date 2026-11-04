import {SchoolToolsView} from './school-tools.js?v=20261104-cards';
import {schoolBrand,schoolLogo,schoolIdentity,escapeHTML as h,normalize} from './school-branding.js?v=20261104-cards';
import {schoolSummary,compareSchools,selectSchool} from './explorer-domain.js?v=20261104-cards';
import {TRAFFIC,REQUEST_STATES} from './business-domain.js?v=20261104-cards';
import {planningModel,PLANNING_STATUSES} from './planning-domain.js?v=20261104-cards';
const $=s=>document.querySelector(s);
const money=c=>'USD '+(c/100).toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
const counts=map=>Object.entries(map).filter(([,n])=>n>0).map(([s,n])=>`${h(s)}: ${n}`).join(' · ')||'Sin unidades';
const cost=item=>item.missingLots===item.rows.length?'Sin precios registrados':money(item.totalCents)+(item.missingLots?' · parcial':'');
const metric=(label,value,note='')=>`<div class="explorer-metric"><span>${h(label)}</span><strong>${h(value)}</strong>${note?`<small>${h(note)}</small>`:''}</div>`;
export class ExplorerView{
 constructor({getData,getBusiness,canSeePrices,openInventory,bindNotes,toolRefresh,canEditTools,toolsInstalled,runTool,ask,toast}){
  Object.assign(this,{getData,getBusiness,canSeePrices,openInventory});this.selected=[];this.query='';this.differences=false;
  this.tools=new SchoolToolsView({getData,canEdit:canEditTools,installed:toolsInstalled,run:runTool,refresh:toolRefresh||(()=>this.render()),bindNotes,ask,toast});
  $('#explorer-clear').onclick=()=>{this.selected=[];this.query='';this.differences=false;$('#explorer-query').value='';$('#explorer-differences').checked=false;this.render();$('#explorer-bubbles button')?.focus();};
  $('#explorer-query').oninput=e=>{this.query=e.target.value;this.renderDetail();};
  $('#explorer-differences').onchange=e=>{this.differences=e.target.checked;this.renderDetail();};
 }
 clear(){this.selected=[];this.query='';this.differences=false;$('#explorer-query').value='';$('#explorer-differences').checked=false;}
 render(){
  const data=this.getData();this.selected=this.selected.filter(id=>data.schools.some(s=>s.id===id));
  $('#explorer-workspace').classList.toggle('is-single',this.selected.length===1);
  $('#explorer-bubbles').innerHTML=data.schools.length?data.schools.map(s=>{
   const summary=schoolSummary(data,s.id),brand=schoolBrand(s),index=this.selected.indexOf(s.id);
   return `<button class="school-bubble ${index>=0?'is-selected':''}" style="--school-accent:${brand?.color||'#557e79'}" type="button" data-explorer-school="${h(s.id)}" aria-pressed="${index>=0}" aria-label="${h(s.name)}${index>=0?', seleccionada':''}"><span class="school-orbit">${schoolLogo(s,'bubble')}<span class="school-check" aria-hidden="true">${index>=0?index+1:'+'}</span></span><strong>${h(s.name)}</strong><span>${h(s.location||'Ubicación sin registrar')}</span><small>${summary.products} elementos / servicios · ${summary.quantity} unidades · ${(data.schoolTools||[]).filter(t=>t.schoolId===s.id).length} herramientas</small></button>`;
  }).join(''):'<div class="explorer-empty"><h3>Todavía no hay colegios registrados</h3><p>Agregá una institución en Gestión de colegios para empezar a explorar.</p><a class="button secondary" href="#schools">Ir a colegios</a></div>';
  $('#explorer-bubbles').querySelectorAll('button').forEach(b=>b.onclick=()=>{
   const id=b.dataset.explorerSchool;
   if(this.selected.length===2&&!this.selected.includes(id)){$('#explorer-selection-status').textContent='Ya elegiste dos sedes. Quitá una selección o usá Limpiar selección para elegir otra.';return;}
   const next=selectSchool(this.selected,id);this.selected=next;this.render();$('#explorer-bubbles').querySelectorAll('button').forEach(button=>{if(button.dataset.explorerSchool===id)button.focus();});
  });
  $('#explorer-clear').disabled=this.selected.length===0;
  $('#explorer-selection-status').textContent=this.selected.length===2?'2 de 2 sedes seleccionadas. Comparación en paralelo disponible debajo.':this.selected.length===1?'1 de 2 sedes seleccionadas. Ficha disponible debajo; elegí otra burbuja para comparar.':'Elegí una sede para ver su ficha o dos para compararlas.';
  $('#explorer-detail-tools').hidden=!this.selected.length;$('#explorer-diff-label').hidden=this.selected.length!==2;
  this.renderDetail();
 }
 matches(row){return normalize(`${row.name} ${row.category} ${(row.rows||row.left?.rows||[]).map(r=>r.code).join(' ')} ${(row.right?.rows||[]).map(r=>r.code).join(' ')}`).includes(normalize(this.query));}
 renderDetail(){
  const root=$('#explorer-detail'),data=this.getData();
  if(!this.selected.length){root.innerHTML='<div class="explorer-empty"><span class="explorer-empty-icon" aria-hidden="true">◎</span><h3>Una red, distintas perspectivas</h3><p>Explorá el catálogo de cada sede y descubrí qué comparten.</p></div>';return;}
  root.innerHTML=this.selected.length===1?this.profile(data,this.selected[0]):this.comparison(data,...this.selected);
  this.tools.bind(root);
  root.querySelectorAll('[data-explorer-inventory]').forEach(b=>b.onclick=()=>this.openInventory(b.dataset.explorerInventory));
 }
 summaryCards(summary){
  return metric('Elementos / servicios',summary.products,`${summary.lots} lotes registrados`)+metric('Unidades asignadas',summary.quantity,`${summary.active} en estado físico activo`)+metric('Categorías',summary.categories,`${summary.reserved} unidades reservadas`)+(this.canSeePrices()?metric('Valor registrado',summary.missingLots===summary.lots?'Sin precios':money(summary.totalCents),summary.missingLots?'Valor parcial; hay lotes sin precio':'Según precios unitarios del inventario'):'');
 }
 lotDetail(item){return `<details class="explorer-lots"><summary>Ver ${item.rows.length} ${item.rows.length===1?'lote':'lotes'} y sus datos</summary><ul>${item.rows.map(r=>`<li><b>${h(r.code)} · ${h(r.name)}</b><span>${r.quantity} unidades · ${h(r.state)} · Uso: ${h(r.use)}</span><span>Adquisición: ${r.year} · Objetivo operativo: ${r.target} · Reservadas: ${r.reserved||0}</span><span>Semáforo: ${h(TRAFFIC.find(t=>t.id===(r.trafficStatus||'unclassified'))?.legend||'Sin clasificar')}</span>${this.canSeePrices()?`<span>Precio unitario: ${r.unitPrice==null?'Sin precio':money(Math.round(r.unitPrice*100))}</span>`:''}</li>`).join('')}</ul></details>`;}
 profile(data,id){
  const summary=schoolSummary(data,id),s=summary.school,items=summary.catalog.filter(i=>this.matches(i));
  const plans=planningModel(data).entries.filter(e=>e.schoolId===id),business=this.getBusiness();
  const requests=(business?.requests||[]).filter(r=>r.school_id===id),transfers=(business?.transfers||[]).filter(t=>t.origin_id===id||t.destination_id===id);
  return `<section class="explorer-profile" aria-labelledby="explorer-profile-title"><header class="explorer-profile-heading"><div class="explorer-school-heading">${schoolLogo(s,'profile')}<div><p class="eyebrow">FICHA DE LA SEDE</p><h2 id="explorer-profile-title">${h(s.name)}</h2><p>${h(s.location||'Ubicación sin registrar')}</p></div></div><button class="button secondary" data-explorer-inventory="${h(id)}">Abrir inventario ↗</button></header><div class="explorer-metrics">${this.summaryCards(summary)}</div>${this.tools.profile(id,this.query)}<div class="explorer-profile-layout"><section><div class="explorer-section-title"><h3>Catálogo completo</h3><span>${items.length} de ${summary.products} elementos</span></div><p class="explorer-note">Equipamiento, infraestructura, licencias y servicios registrados en esta sede.</p><div class="explorer-catalog">${items.length?items.map(i=>`<article class="explorer-product"><div><span class="explorer-category">${h(i.category)}</span><h4>${h(i.name)}</h4><p>${counts(i.states)}</p></div><strong class="explorer-units">${i.quantity}<small>unidades</small></strong>${this.lotDetail(i)}</article>`).join(''):'<p class="explorer-empty">No hay elementos registrados que coincidan con la búsqueda.</p>'}</div></section><aside class="explorer-context"><section><h3>Planificación 2027</h3>${PLANNING_STATUSES.map(state=>`<p><span class="badge ${state.tone}">${state.name}</span><b>${plans.filter(p=>p.status===state.id).length} filas</b></p>`).join('')}<p class="explorer-note">${plans.filter(p=>p.status==='confirmed').reduce((n,p)=>n+(Number(p.quantity)||0),0)} unidades confirmadas. Las cantidades del plan son independientes del stock.</p></section><section><h3>Solicitudes y logística</h3>${business?`<p>Solicitudes visibles <b>${requests.length}</b></p><p>Transferencias visibles <b>${transfers.length}</b></p><p class="explorer-note">Según los permisos de tu cuenta.</p>${requests.slice(0,5).map(r=>`<div class="explorer-activity"><b>${h(r.name)}</b><span>${h(REQUEST_STATES[r.status]||r.status)} · ${r.quantity} unidades</span></div>`).join('')}`:'<p class="explorer-note">Sin datos de solicitudes y transferencias disponibles.</p>'}</section></aside></div></section>`;
 }
 comparison(data,leftId,rightId){
  const result=compareSchools(data,leftId,rightId),{left,right}=result,rows=result.rows.filter(r=>this.matches(r)&&(!this.differences||r.kind!=='same'));
  const labels={same:'Coincide',different:'Con diferencias',left_only:'Registrado solo en la primera sede',right_only:'Registrado solo en la segunda sede'};
  const cell=item=>!item?'<div class="comparison-value is-missing"><b>Sin registro</b><span>No figura en el inventario de esta sede.</span></div>':`<div class="comparison-value"><strong>${item.quantity}<small> unidades</small></strong><span>${counts(item.states)}</span><span>Reservadas: ${item.reserved} · Uso: ${counts(item.uses)}</span><span>${Object.entries(item.traffic).filter(([,n])=>n>0).map(([s,n])=>`${h(TRAFFIC.find(t=>t.id===s)?.label||s)}: ${n}`).join(' · ')||'Sin unidades clasificadas'}</span>${this.canSeePrices()?`<span>${cost(item)}</span>`:''}${this.lotDetail(item)}</div>`;
  return `<section aria-labelledby="explorer-compare-title"><div class="explorer-section-title"><div><p class="eyebrow">DOS SEDES, UNA MISMA MIRADA</p><h2 id="explorer-compare-title">Comparación en paralelo</h2></div><span>${rows.length} elementos en pantalla</span></div><div class="explorer-comparison-summary">${metric('Compartidos',result.shared)}${metric('Coinciden',result.same)}${metric('Con diferencias',result.different)}${metric('Solo en una sede',result.unique)}</div><div class="comparison-head"><div>${schoolIdentity(left.school)}<p>${left.products} elementos · ${left.quantity} unidades</p><button class="text-button" data-explorer-inventory="${h(leftId)}">Abrir inventario ↗</button></div><div>${schoolIdentity(right.school)}<p>${right.products} elementos · ${right.quantity} unidades</p><button class="text-button" data-explorer-inventory="${h(rightId)}">Abrir inventario ↗</button></div></div>${this.tools.comparison(leftId,rightId,this.query,this.differences)}<h3>Inventario registrado</h3><p class="explorer-note">Coincide compara cantidades, estado físico, uso, semáforo, reservas y valor registrado. El catálogo vincula agrupaciones compartidas; para lotes iniciales usa nombre y categoría. Sin registro indica ausencia de datos, no confirma ausencia física.</p><div class="comparison-list">${rows.length?rows.map(r=>`<article class="comparison-item ${r.kind==='same'?'is-same':'is-different'}"><header><div><span class="explorer-category">${h(r.category)}</span><h3>${h(r.name)}</h3></div><span class="comparison-tag">${labels[r.kind]}</span>${r.delta!==null&&r.delta!==0?`<small>Diferencia de unidades: segunda sede ${r.delta>0?'+':''}${r.delta}</small>`:''}</header><div class="comparison-pair"><div><span class="comparison-mobile-label">${h(left.school.name)}</span>${cell(r.left)}</div><div><span class="comparison-mobile-label">${h(right.school.name)}</span>${cell(r.right)}</div></div></article>`).join(''):'<p class="explorer-empty">No hay elementos para esta selección.</p>'}</div></section>`;
 }
}
