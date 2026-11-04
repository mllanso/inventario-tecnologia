import {AnnualView} from './annual-view.js?v=20261104-cycles';
import {currentCycle,cycleFinancialReport} from './annual-domain.js?v=20261104-cycles';
import {ObservationSaves} from './autosave.js?v=20261104-cycles';
import {planningModel} from './planning-domain.js?v=20261104-cycles';
import { ExplorerView } from './explorer.js?v=20261104-cycles';
import {brandSchoolNames,schoolLogo,schoolIdentity} from './school-branding.js?v=20261104-cycles';
import { BusinessView } from './business.js?v=20261104-cycles';
import { TRAFFIC } from './business-domain.js?v=20261104-cycles';
import { PlanningView } from './planning.js?v=20261104-cycles';
import { SUPABASE_CONFIG } from './config.js';
import { CloudInventory, cloudError } from './cloud.js?v=20261104-cycles';
import { YEAR, setAnalysisYear, STATES, USES, validateData, recommendation, filterResources, createCSV, demoData, validUnitPrice, resourceTotalCents, priceSummary, decimalPrice, nextLotCode } from './domain.js?v=20261104-cycles';
const $ = s => document.querySelector(s);
const money = cents => cents == null ? 'Sin precio' : 'USD ' + (cents / 100).toLocaleString('es-AR', {minimumFractionDigits:2, maximumFractionDigits:2});
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY = 'nexo.inventory.v1';
let raw = null, data, demo = false, storageBlocked = false;
let cloudClient = null, cloudStore = null, cloudSession = null, cloudBusy = false, cloudLoaded = false;
function warning(message) { $('#storage-warning').textContent = message; $('#storage-warning').hidden = false; }
try {
  raw = SUPABASE_CONFIG.enabled ? null : localStorage.getItem(KEY);
  data = SUPABASE_CONFIG.enabled ? {version:1,currency:'USD',schools:[],categories:[],resources:[]} : raw ? validateData(JSON.parse(raw)) : demoData();
  demo = !SUPABASE_CONFIG.enabled && !raw;
} catch {
  storageBlocked = true;
  data = {version:1, schools:[], categories:[], resources:[]};
  warning('No se pudo leer el almacenamiento. No se sobrescribirán los datos existentes. Descargá un respaldo si corresponde y restaurá un archivo válido para recuperar el acceso.');
}
const filters = { search:'', schools:[], categories:[], states:[], uses:[],traffic:[] };
if(!SUPABASE_CONFIG.enabled)data.planning2027=planningModel(data);
let selectedYear=currentCycle();
let currentView = 'dashboard', charts = {}, editing = null, toastTimer;
const planner = new PlanningView({getData:()=>data, getFilters:()=>filters, canDiscard:()=>!cloudBusy, canEdit:()=>SUPABASE_CONFIG.enabled?canEditCloud():selectedYear===currentCycle(), save:savePlanningModel, bindNotes:(input,id)=>bindObservation(input,'plan:'+id), refresh:render, toast, ask, download, cloudEnabled:SUPABASE_CONFIG.enabled,createRequest:(resource,quantity)=>{if(planner.hasChanges()){toast('Guardá primero la planificación.');return;}business.newRequest(resource.groupId||'',{schoolId:resource.schoolId,quantity,name:resource.name});}});
const business = new BusinessView({onRequestsRender:()=>annual.approvals(),getYear:()=>selectedYear,getSchool:activeSchool,setSchool:setActiveSchool,readOnly:()=>selectedYear!==currentCycle()||!!cloudStore?.cycle?.readOnly,getData:()=>data,getBusiness:cycleBusiness,canEdit:()=>SUPABASE_CONFIG.enabled?canEditCloud():selectedYear===currentCycle(),userId:()=>cloudSession?.user.id,run:runBusinessAction,fetchReport:fetchBusinessReport,editResource:id=>openEditor('resources',id),toast,download});
const explorer=new ExplorerView({canEditTools:()=>SUPABASE_CONFIG.enabled?canEditCloud():selectedYear===currentCycle(),toolsInstalled:()=>!SUPABASE_CONFIG.enabled||cloudStore?.toolsEnabled===true,runTool:runToolAction,bindNotes:(input,id)=>bindObservation(input,'tool:'+id),toolRefresh:render,ask,toast,getData:()=>data,getBusiness:cycleBusiness,canSeePrices:()=>cloudStore?.role!=='requester',openInventory:id=>{Object.assign(filters,{search:'',schools:[id],categories:[],states:[],uses:[],traffic:[]});$('#search').value='';location.hash='resources';}});
const observations=new ObservationSaves(saveObservation,()=>`${cloudSession?.user.id||'local'}:${selectedYear}:`);
const annual=new AnnualView({getCycle:()=>cloudStore?.cycle,getData:()=>data,getBusiness:cycleBusiness,getYear:()=>selectedYear,getSchool:activeSchool,setSchool:setActiveSchool,canEdit:()=>SUPABASE_CONFIG.enabled?canEditCloud():selectedYear===currentCycle(),finance:()=>cloudStore?.business?.access?.finance===true,action:runCycleAction,toolsView:explorer.tools,download,toast});
function activeSchool(){return filters.schools.length===1?filters.schools[0]:'';}
function cycleBusiness(){const b=cloudStore?.business;if(!b||!activeSchool())return b;const id=activeSchool(),requests=b.requests.filter(q=>q.school_id===id);return {...b,requests,events:b.events.filter(e=>requests.some(q=>q.id===e.request_id)),transfers:b.transfers.filter(t=>t.origin_id===id||t.destination_id===id)};}
async function setActiveSchool(id){try{await observations.flush();filters.schools=id?[id]:[];business.report=null;business.reportFilters=null;render();return true;}catch(error){toast(error.message);return false;}}
function renderCycleControls(){
 const first=cloudStore?.cycle?.firstYear||currentCycle()-5,years=new Set([selectedYear,...Array.from({length:currentCycle()-Math.min(first,currentCycle()-5)+2},(_,i)=>Math.min(first,currentCycle()-5)+i)]);
 $('#cycle-year').innerHTML=[...years].sort((a,b)=>a-b).map(y=>`<option value="${y}" ${y===selectedYear?'selected':''}>${y}</option>`).join('');
 $('#active-school').innerHTML='<option value="">Ver Todos</option>'+options(data.schools,activeSchool());$('#active-school').value=activeSchool();
 const cycle=cloudStore?.cycle;$('#cycle-status').textContent=cycle?`Corte 31/12/${selectedYear} · ${cycle.available?(cycle.readOnly?'Consulta de ciclo cerrado':'Ciclo abierto'):'Sin archivo disponible para este corte'}${cycle.snapshotAt?' · Datos al '+new Date(cycle.snapshotAt).toLocaleDateString('es-AR'):''}`:'Activá annual-cycles.sql para habilitar el archivo anual completo.';
 $('#cycle-status').dataset.readonly=String(!!cycle?.readOnly);
 document.querySelector('.cycle b').textContent=selectedYear;setAnalysisYear(selectedYear);document.querySelectorAll('[data-analysis-year]').forEach(e=>e.textContent=selectedYear);
 $('#cycle-year').disabled=cloudBusy;$('#active-school').disabled=cloudBusy;
}
$('#active-school').onchange=e=>setActiveSchool(e.target.value);
$('#cycle-year').onchange=async e=>{
 const next=Number(e.target.value),previous=selectedYear;
 try{await observations.flush();if(planner.hasChanges())throw Error('Guardá o descartá estructura y cantidades antes de cambiar de ciclo.');if(!cloudStore?.cycleEnabled)throw Error('Activá annual-cycles.sql en Supabase para consultar los ciclos.');selectedYear=next;observations.clear();business.report=null;business.reportFilters=null;filters.schools=[];await loadCloud();}
 catch(error){selectedYear=previous;$('#cycle-year').value=previous;toast(error.message);}
};
let cycleQueue=Promise.resolve();
function runCycleAction(action,payload,{renderAfter=true}={}){
 const namespace=cloudSession?.user.id+':'+selectedYear;
 const job=cycleQueue.catch(()=>{}).then(async()=>{
  if(namespace!==cloudSession?.user.id+':'+selectedYear)throw Error('La sesión o el ciclo cambió.');
  if(!cloudStore?.cycleEnabled||cloudStore.cycle?.readOnly)throw Error('Activá el módulo de ciclos y seleccioná el ciclo abierto.');
  const deadline=Date.now()+20000;while(cloudBusy){if(Date.now()>deadline)throw Error('La conexión está ocupada. Volvé a intentar.');await new Promise(resolve=>setTimeout(resolve,100));}
  if(namespace!==cloudSession?.user.id+':'+selectedYear)throw Error('La sesión o el ciclo cambió.');
  const store=cloudStore;cloudBusy=true;
  try{await store.cycleAction(action,payload);const next=await store.load();if(cloudStore!==store)throw Error('La sesión cambió durante el guardado.');data=next;cloudLoaded=true;}
  finally{if(cloudStore===store)cloudBusy=false;}
  if(renderAfter)render();
 });cycleQueue=job;return job;
}
async function saveObservation(key,notes){
 const split=key.indexOf(':'),type=key.slice(0,split),id=key.slice(split+1);
 if(!SUPABASE_CONFIG.enabled){const next=clone();if(type==='plan'){const entry=next.planning2027?.entries.find(e=>e.id===id);if(!entry)throw Error('Guardá primero la fila nueva.');entry.notes=notes;}else{const tool=next.schoolTools?.find(t=>t.id===id);if(!tool)throw Error('Guardá primero la herramienta.');tool.notes=notes;}if(!await persist(next))throw Error('No se pudo guardar.');}
 else await runCycleAction(type==='plan'?'plan_note':'tool_note',{id,notes},{renderAfter:false});
 if(type==='plan'&&planner.draft){const entry=planner.draft.entries.find(e=>e.id===id);if(entry)entry.notes=notes;}
}
function bindObservation(input,key){if(selectedYear!==currentCycle()||SUPABASE_CONFIG.enabled&&!['admin','coordinator'].includes(cloudStore?.role))return;if(!input.parentElement.querySelector('[data-save-status]')){const state=document.createElement('span');state.dataset.saveStatus='';state.role='status';state.className='autosave-state';input.after(state);}observations.bind(input,key);}
// Los módulos actualizan sus paneles de forma independiente; el observador
// mantiene los logos en los nombres de colegio sin modificar datos guardados.
let brandingPending=false;
const schoolBrandObserver=new MutationObserver(()=>{if(brandingPending)return;brandingPending=true;queueMicrotask(()=>{brandSchoolNames(document.querySelector('main'),data.schools);brandSchoolNames($('#business-dialog'),data.schools);brandingPending=false;});});
for(const root of [document.querySelector('main'),$('#business-dialog')])schoolBrandObserver.observe(root,{childList:true,subtree:true});
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => $('#toast').hidden = true, 5000); }
async function persist(next, recovery = false) {
  if(selectedYear!==currentCycle()){toast('El ciclo seleccionado está cerrado para edición.');return false;}
  if (SUPABASE_CONFIG.enabled) return saveCloud(next,recovery);
  try {
    next.planning2027=planningModel(next);
    validateData(next);
    if (storageBlocked && !recovery) throw Error('Restaurá un respaldo válido antes de modificar los datos.');
    const existing = localStorage.getItem(KEY);
    if (!recovery && existing !== raw) throw Error('El inventario cambió en otra pestaña. Recargá la página antes de guardar.');
    const nextRaw = JSON.stringify(next);
    localStorage.setItem(KEY, nextRaw);
    raw = nextRaw; data = next; demo = false; storageBlocked = false;
    $('#storage-warning').hidden = true;
    return true;
  } catch (error) { toast('No se guardó: ' + error.message); return false; }
}
window.addEventListener('storage', event => { if (!SUPABASE_CONFIG.enabled && (event.key === KEY || event.key === null)) warning('El almacenamiento cambió en otra pestaña. Recargá esta página para ver la última versión antes de editar.'); });
function clone() { return structuredClone(data); }
function ask(title, message, action) {
  $('#confirm-title').textContent = title; $('#confirm-message').textContent = message;
  $('#confirm-accept').onclick = () => { $('#confirm-dialog').close(); action(); };
  $('#confirm-dialog').showModal();
}
$('#confirm-cancel').onclick = () => $('#confirm-dialog').close();
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => button.closest('dialog').close());
function options(items, selected) { return items.map(item => `<option value="${escapeHTML(item.id)}" ${item.id === selected ? 'selected' : ''}>${escapeHTML(item.name)}</option>`).join(''); }
function multiFilter(key, caption, items, placeholder) {
  const selected = filters[key];
  $(`#filter-${key}`).innerHTML = `<span class="filter-label">${caption}</span><details class="multi"><summary>${selected.length ? selected.length + ' seleccionados' : placeholder}</summary><div class="multi-options">${items.length ? items.map(item => `<label><input type="checkbox" value="${escapeHTML(item.id)}" ${selected.includes(item.id) ? 'checked' : ''}>${escapeHTML(item.name)}</label>`).join('') : '<p>Sin opciones registradas</p>'}</div></details>`;
  $(`#filter-${key}`).onchange = () => {
    filters[key] = [...$(`#filter-${key}`).querySelectorAll('input:checked')].map(input => input.value);
    $(`#filter-${key} summary`).textContent = filters[key].length ? filters[key].length + ' seleccionados' : placeholder;
    renderContent();
  };
}
function renderFilters() {
  filters.schools = filters.schools.filter(id => data.schools.some(s => s.id === id));
  filters.categories = filters.categories.filter(id => data.categories.some(c => c.id === id));
  multiFilter('schools','Colegio',data.schools,'Todos los colegios');
  multiFilter('categories','Categoría',data.categories,'Todas las categorías');
  multiFilter('states','Estado físico',STATES.map(x => ({id:x,name:x})),'Todos los estados');
  multiFilter('uses','Uso en '+selectedYear,USES.map(x => ({id:x,name:x})),'Todas las frecuencias');
}
const titles = {explorer:['Explorador Comparativo','Explorá el catálogo de cada colegio y compará hasta dos sedes en paralelo.'],dashboard:['Dashboard general','Una mirada integral a la tecnología de tus instituciones.'],resources:['Gestión de recursos','Organizá, actualizá y analizá tu inventario tecnológico.'],schools:['Gestión de colegios','Cada institución, conectada con sus recursos.'],categories:['Categorías de recursos','Una estructura clara para organizar la tecnología.'],planning2027:['Planificación 2027','Definí las necesidades del próximo ciclo a partir del inventario 2026.'],requests:['Solicitudes y compras','Del pedido de tu sede a la recepción de los recursos.'],transfers:['Transferencias','Reservas y recepciones entre colegios con trazabilidad.'],reports:['Reportes financieros','Costos en USD por sede y fecha de corte.']};
function setView() {
  currentView = location.hash.slice(1);
  if (!titles[currentView]) currentView = 'dashboard';
  const [title, description] = titles[currentView];
  $('#page-title').textContent = title; $('#breadcrumb').textContent = title; $('#page-description').textContent = description;
  document.querySelectorAll('[data-view]').forEach(a => { a.classList.toggle('active',a.dataset.view === currentView); if (a.dataset.view === currentView) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
  const entity = ['schools','categories'].includes(currentView);
  const exploring=currentView==='explorer';
  $('#explorer-view').hidden=!exploring;
  const planning = currentView === 'planning2027';
  const module = ['requests','transfers','reports'].includes(currentView);
  $('#business-view').hidden=!module;
  $('#traffic-panel').hidden=entity||module||planning||exploring;
  $('#filter-states').hidden=planning; $('#filter-uses').hidden=planning;
  $('#grouped-resources').hidden=currentView!=='resources';$('#software-view').hidden=currentView!=='resources';
  $('#planning-view').hidden = !planning;
  $('#add-button').hidden = planning||module||exploring;
  $('#filters').hidden = entity||module||exploring; $('#dashboard-view').hidden = currentView !== 'dashboard'; $('#inventory-view').hidden = entity || planning||module||exploring||currentView==='resources'; $('#entities-view').hidden = !entity;
  $('#pricing-summary').hidden = entity || planning||module||exploring||cloudStore?.role==='requester';
  $('#pdf-button').hidden = entity || planning||module||exploring;
  $('#add-button').textContent = currentView === 'schools' ? '＋ Nuevo colegio' : currentView === 'categories' ? '＋ Nueva categoría' : '＋ Nuevo recurso';
  render();
  window.scrollTo({top:0,behavior:'auto'});
}
let previousHash=location.hash;
window.addEventListener('hashchange',async()=>{const next=location.hash;try{await observations.flush();previousHash=next;setView();}catch(error){history.replaceState(null,'',previousHash);toast('No se pudo cambiar de pantalla: '+error.message);}});
function render() { $('#demo-banner').hidden = !demo; renderFilters(); renderCycleControls(); renderContent(); }
function renderContent() {
  renderCycleControls();
  const rows = filterResources(data, filters);
  const total = rows.reduce((s,r) => s+r.quantity,0);
  $('#filter-count').textContent = `${rows.length} de ${data.resources.length} lotes · ${total} unidades en la selección`;
  $('#table-count').textContent = `${rows.length} lotes registrados · ${total} unidades`;
  const prices = priceSummary(rows);
  $('#pricing-summary').innerHTML = `<div><p class="eyebrow">VALOR DEL INVENTARIO FILTRADO</p><strong>${money(prices.totalCents)}</strong><small>${prices.missingLots ? 'Total parcial: faltan precios por completar.' : 'Total de los artículos de la selección.'}</small></div><div><span>Unidades con precio</span><b>${prices.pricedUnits}</b></div><div><span>Lotes sin precio</span><b>${prices.missingLots}</b></div>`;
  business.renderTraffic(filterResources(data,{...filters,traffic:[]}),filters.traffic,id=>{filters.traffic=filters.traffic.includes(id)?filters.traffic.filter(x=>x!==id):[...filters.traffic,id];renderContent();});
  if(currentView==='resources'){business.renderGroups(rows);annual.software();}
  if(['requests','transfers','reports'].includes(currentView))business.render(currentView);
  renderTable(rows);
  if (currentView === 'dashboard') {
    annual.dashboard();
    renderDashboard(rows);
  }
  if (['schools','categories'].includes(currentView)) renderEntities();
  if (currentView === 'planning2027') planner.render(rows);
  if (currentView === 'explorer') explorer.render();
  if(currentView==='reports')annual.financial();
  applyAccess();
}
function badge(label, tone, title = '') { return `<span class="badge ${tone}" title="${escapeHTML(title)}">${escapeHTML(label)}</span>`; }
function renderTable(rows) {
  $('#resource-rows').innerHTML = rows.length ? rows.map(r => {
    const rec = recommendation(r,data.resources);
    return `<tr><td><b>${escapeHTML(r.name)}</b><small>${escapeHTML(r.code)}</small></td><td>${escapeHTML(data.schools.find(s=>s.id===r.schoolId)?.name)}</td><td>${escapeHTML(data.categories.find(c=>c.id===r.categoryId)?.name)}</td><td>${badge(r.state,r.state==='Activo'?'green':r.state==='Obsoleto'?'red':'amber')}</td><td>${escapeHTML(r.use)}</td><td>${r.quantity}</td><td class="price-cell">${money(r.unitPrice == null ? null : Math.round(r.unitPrice * 100))}</td><td class="price-cell"><b>${money(resourceTotalCents(r))}</b></td><td>${YEAR-r.year} años</td><td>${badge(rec.label,rec.tone,rec.reason)}</td><td><button class="row-action" data-edit="${escapeHTML(r.id)}" aria-label="Editar ${escapeHTML(r.name)}">Editar</button><button class="row-action" data-delete="${escapeHTML(r.id)}" aria-label="Eliminar ${escapeHTML(r.name)}">Eliminar</button></td></tr>`;
  }).join('') : '<tr><td class="empty" colspan="11">No hay recursos para esta selección. Ajustá los filtros o agregá un nuevo recurso.</td></tr>';
  $('#resource-rows').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEditor('resources',b.dataset.edit));
  $('#resource-rows').querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteRecord('resources',b.dataset.delete));
}
function renderEntities() {
  const key = currentView;
  $('#entity-list').innerHTML = data[key].length ? data[key].map(entity => {
    const rows = data.resources.filter(r => r[key==='schools'?'schoolId':'categoryId']===entity.id);
    return `<article class="entity-card"><span class="entity-icon">${key==='schools'?schoolLogo(entity,'card'):'◇'}</span><h3>${escapeHTML(entity.name)}</h3><p>${key==='schools'?escapeHTML(entity.location || 'Sin ubicación registrada'):'Categoría de recursos tecnológicos'}<br>${rows.length} lotes · ${rows.reduce((s,r)=>s+r.quantity,0)} unidades</p><div class="entity-actions"><button class="text-button" data-edit="${escapeHTML(entity.id)}">Editar ${key==='schools'?'colegio':'categoría'}</button><button class="text-button" data-delete="${escapeHTML(entity.id)}">Eliminar</button></div></article>`;
  }).join('') : '<div class="panel empty">Todavía no hay registros. Usá el botón de creación para comenzar.</div>';
  $('#entity-list').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEditor(key,b.dataset.edit));
  $('#entity-list').querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteRecord(key,b.dataset.delete));
}
const colors = ['#367f69','#d6b570','#c78b80','#dce6df'];
function chart(id, config) {
  charts[id]?.destroy();
  if (!window.Chart) return;
  charts[id] = new Chart($(id),config);
}
function renderDashboard(rows) {
  const sum = list => list.reduce((s,r)=>s+r.quantity,0);
  const total = sum(rows), active = sum(rows.filter(r=>r.state==='Activo'));
  const stats = [ ['Recursos registrados',total,'Unidades en el inventario filtrado','▦'], ['Colegios en la selección',new Set(rows.map(r=>r.schoolId)).size,`${data.schools.length} instituciones registradas`,'⌂'], ['Disponibilidad operativa',total ? Math.round(active/total*100)+'%' : '0%',`${active} unidades en estado activo`,'↗'], ['Requieren atención',sum(rows.filter(r=>r.state!=='Activo')), 'En reparación o estado obsoleto','◷'] ];
  $('#kpis').innerHTML = stats.map(([label,value,note,icon])=>`<article class="kpi"><span class="kpi-icon">${icon}</span><p class="kpi-label">${label}</p><p class="kpi-value">${value}</p><span class="kpi-note">${note}</span></article>`).join('');
  const names = ['Adquirir','Mantener','Eliminar/Renovar'];
  const descriptions = ['Alta demanda y disponibilidad por debajo del objetivo operativo.','Equipamiento para conservar con mantenimiento y seguimiento.','Recursos sin uso, obsoletos o con 8 años o más de antigüedad.'];
  $('#decisions').innerHTML = names.map((name,i)=>{const list=rows.filter(r=>recommendation(r,data.resources).label===name);return `<article class="decision-card ${['amber','green','red'][i]}"><div class="decision-top"><span>${['↗','✓','↻'][i]} &nbsp; ${name}</span><span>0${i+1}</span></div><div class="decision-number">${sum(list)}<span>unidades · ${list.length} lotes</span></div><p>${descriptions[i]}</p><button data-decision="${i}">Ver recomendaciones <span>→</span></button></article>`;}).join('');
  $('#decisions').querySelectorAll('button').forEach(b=>b.onclick=()=>showRecommendations(names[Number(b.dataset.decision)],rows));
  const schools = data.schools.filter(s=>rows.some(r=>r.schoolId===s.id));
  const common = {responsive:true,maintainAspectRatio:false,animation:false,plugins:{legend:{labels:{font:{size:10},boxWidth:8,boxHeight:8,usePointStyle:true}},tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label || ctx.label}: ${ctx.raw} unidades`}}}};
  chart('#schools-chart',{type:'bar',data:{labels:schools.map(s=>s.name),datasets:STATES.map((state,i)=>({label:state,data:schools.map(s=>sum(rows.filter(r=>r.schoolId===s.id&&r.state===state))),backgroundColor:colors[i],borderRadius:3,maxBarThickness:34}))},options:{...common,plugins:{...common.plugins,legend:{...common.plugins.legend,position:'bottom'}},scales:{x:{stacked:true,grid:{display:false},ticks:{font:{size:9},callback:function(v){const label=this.getLabelForValue(v);return label.length>21?label.slice(0,20)+'…':label;}}},y:{stacked:true,beginAtZero:true,ticks:{precision:0,font:{size:9}},grid:{color:'#eef2ee'},border:{display:false}}}}});
  const uses = USES.map(use=>sum(rows.filter(r=>r.use===use)));
  chart('#use-chart',{type:'doughnut',data:{labels:USES,datasets:[{data:uses,backgroundColor:colors,borderWidth:5,borderColor:'#fff',borderRadius:4}]},options:{...common,cutout:'76%',plugins:{...common.plugins,legend:{display:false}}}});
  $('#donut-center').innerHTML=`<b>${total}</b><small>UNIDADES TOTALES</small>`;
  $('#usage-legend').innerHTML=USES.map((use,i)=>`<div class="legend-item"><span class="legend-dot" style="background:${colors[i]}"></span>${use}<b>${uses[i]} <span style="color:#98a69d">(${total?Math.round(uses[i]/total*100):0}%)</span></b></div>`).join('');
  chart('#age-chart',{type:'bar',data:{labels:USES,datasets:[['0–3 años',r=>YEAR-r.year<=3],['4–7 años',r=>YEAR-r.year>=4&&YEAR-r.year<8],['8 años o más',r=>YEAR-r.year>=8]].map(([label,test],i)=>({label,data:USES.map(use=>sum(rows.filter(r=>r.use===use&&test(r)))),backgroundColor:colors[i],borderRadius:3,maxBarThickness:27}))},options:{...common,indexAxis:'y',plugins:{...common.plugins,legend:{...common.plugins.legend,position:'bottom'}},scales:{x:{beginAtZero:true,ticks:{precision:0,font:{size:9}},grid:{color:'#eef2ee'}},y:{ticks:{font:{size:10}},grid:{display:false}}}}});
  if (!window.Chart) warning('No se pudo cargar Chart.js. Revisá la conexión y recargá para ver los gráficos. El inventario y la exportación CSV siguen disponibles.');
}
function showRecommendations(name,rows) {
  const list=rows.filter(r=>recommendation(r,data.resources).label===name);
  $('#editor-title').textContent = name + ' · Recomendaciones';
  $('#form-fields').innerHTML=`<div class="full">${list.length?list.map(r=>`<p><b>${escapeHTML(r.name)}</b> · ${r.quantity} unidades<br><small>${escapeHTML(data.schools.find(s=>s.id===r.schoolId)?.name)} · ${escapeHTML(recommendation(r,data.resources).reason)}</small></p>`).join(''):'<p>No hay recomendaciones de este tipo para los filtros actuales.</p>'}</div>`;
  $('#form-error').textContent=''; $('#editor-form button[type="submit"]').hidden=true; $('#editor').showModal();
}
function openEditor(key,id) {
  if (SUPABASE_CONFIG.enabled && !canEditCloud()) { toast('Necesitás acceso de edición y el inventario actualizado.'); return; }
  if (key==='resources' && (!data.schools.length || !data.categories.length)) { toast('Primero registrá al menos un colegio y una categoría.'); return; }
  const item = id ? data[key].find(x=>x.id===id) : {};

  if (key === 'resources' && !id) item.code = nextLotCode(data.resources);
  editing = {key,id};
  $('#editor-title').textContent=`${id?'Editar':'Crear'} ${key==='resources'?'recurso':key==='schools'?'colegio':'categoría'}`;
  const field=(name,label,value,type='text',extra='')=>`<label>${label}<input name="${name}" type="${type}" value="${escapeHTML(value??'')}" required ${extra}></label>`;
  const select=(name,label,items,value)=>`<label>${label}<select name="${name}" required>${options(items,value)}</select></label>`;
  $('#form-fields').innerHTML = key==='resources' ?
    `${field('name','Nombre del recurso',item.name,'text','maxlength="120"')}${field('code','Código único del lote',item.code,'text','maxlength="60"')}${select('schoolId','Colegio',data.schools,item.schoolId)}${select('categoryId','Categoría',data.categories,item.categoryId)}${select('state','Estado',STATES.map(x=>({id:x,name:x})),item.state)}${select('use','Frecuencia de uso del ciclo',USES.map(x=>({id:x,name:x})),item.use||'Regular')}${field('year','Año de adquisición',item.year??YEAR,'number',`min="1980" max="${YEAR}" step="1"`)}${field('quantity','Cantidad de unidades del lote',item.quantity??1,'number','min="1" max="1000000" step="1"')}${field('target','Objetivo operativo del colegio y categoría',item.target??1,'number','min="1" max="1000000" step="1"')}<div class="full"><small>El objetivo indica cuántas unidades operativas se necesitan en esta categoría y colegio. Si existen varios lotes, se usa el objetivo máximo. Edad calculada al cierre del ciclo seleccionado.</small></div>` :
    `${field('name',key==='schools'?'Nombre del colegio':'Nombre de la categoría',item.name,'text','maxlength="120"')}${key==='schools'?'<label>Zona o ubicación<input name="location" maxlength="160" value="'+escapeHTML(item.location)+'"></label>':''}`;
  if(key==='schools'&&data.businessVersion===1)$('#form-fields').insertAdjacentHTML('beforeend','<label>Centro de costo (opcional)<input name="costCenter" maxlength="80" value="'+escapeHTML(item.costCenter||'')+'"></label>');
  $('#form-error').textContent=''; $('#editor-form button[type="submit"]').hidden=false; $('#editor').showModal();
  if (key === 'resources') {
    if(cloudStore?.cycleEnabled)$('#form-fields').insertAdjacentHTML('beforeend',select('assetKind','Categoría patrimonial',['Sin clasificar','Hardware','Licencias','Mobiliario'].map(x=>({id:x,name:x})),item.assetKind||'Sin clasificar')+select('valuationState','Estado patrimonial',['Sin clasificar','En uso','Depósito','Amortizado'].map(x=>({id:x,name:x})),item.valuationState||'Sin clasificar'));
    if(data.businessVersion===1){
      $('#form-fields').insertAdjacentHTML('beforeend',select('groupId','Recurso general / Agrupación',[...(!id?[{id:'',name:'Crear una agrupación nueva'}]:[]),...(data.groups||[])],item.groupId)+select('trafficStatus','Semáforo',TRAFFIC.map(t=>({id:t.id,name:t.legend})),item.trafficStatus||'unclassified'));
      $('#editor-form [name="groupId"]').onchange=event=>{const g=data.groups.find(g=>g.id===event.target.value);if(g){$('#editor-form [name="categoryId"]').value=g.categoryId;}};
      if(item.contractId){const selector=$('#editor-form [name="groupId"]');selector.disabled=true;selector.insertAdjacentHTML('afterend','<small>Para cambiar la agrupación con contratos, usá Unir agrupaciones.</small>');}
      $('#editor-form [name="quantity"]').min='0';
    }
    if (!id) $('#editor-form [name="code"]').insertAdjacentHTML('afterend', `<small>${item.code ? 'Siguiente código sugerido según todo el inventario. Podés modificarlo.' : 'La secuencia numérica alcanzó el límite de longitud. Ingresá otro código único.'}</small>`);
    $('#form-fields').insertAdjacentHTML('beforeend', `<label>Precio unitario (USD)<input name="unitPrice" type="number" min="0" max="10000000" step="0.01" inputmode="decimal" value="${escapeHTML(item.unitPrice ?? '')}" placeholder="Sin precio"><small>Opcional. Hasta dos decimales; dejalo vacío si aún no lo conocés.</small></label><label>Total del artículo (USD)<output id="resource-total" aria-live="polite"></output><small>Precio unitario × cantidad de unidades.</small></label>`);
    const updateTotal = () => {
      const price = $('#editor-form [name="unitPrice"]').value;
      const quantity = Number($('#editor-form [name="quantity"]').value);
      $('#resource-total').textContent = price === '' ? 'Sin precio' : validUnitPrice(Number(price)) && Number.isInteger(quantity) && quantity >= 0 && quantity <= 1000000 ? money(resourceTotalCents({unitPrice:Number(price),quantity})) : 'Revisá el precio y la cantidad';
    };
    $('#editor-form [name="unitPrice"]').oninput = updateTotal;
    $('#editor-form [name="quantity"]').oninput = updateTotal;
    updateTotal();
  }
}
$('#editor-form').onsubmit=async event=>{
  event.preventDefault();
  if (cloudBusy) return;
  event.preventDefault();
  const {key,id}=editing;
  const values=Object.fromEntries(new FormData(event.target));
  Object.keys(values).forEach(k=>values[k]=values[k].trim());
  if (!values.name || (key==='resources' && !values.code)) { $('#form-error').textContent='Completá los campos sin usar solamente espacios.';return; }
  if (key!=='resources' && data[key].some(x=>x.id!==id && x.name.toLocaleLowerCase('es')===values.name.toLocaleLowerCase('es'))) { $('#form-error').textContent='Ya existe un registro con ese nombre.';return; }
  if (key==='resources') {
    if(values.groupId==='')delete values.groupId;
    ['year','quantity','target'].forEach(k=>values[k]=Number(values[k]));
    values.unitPrice = values.unitPrice === '' ? null : Number(values.unitPrice);
    if (values.unitPrice !== null && !validUnitPrice(values.unitPrice)) { $('#form-error').textContent='Ingresá un precio entre 0 y 10.000.000 USD, con hasta dos decimales.'; return; }
    if(data.resources.some(r=>r.id!==id&&r.code.toLowerCase()===values.code.toLowerCase())) { $('#form-error').textContent='Ese código de inventario ya está registrado.';return; }
  }
  const next=clone(); const record={...(id?data[key].find(x=>x.id===id):{}),...values,id:id||crypto.randomUUID()};
  if(id) next[key][next[key].findIndex(x=>x.id===id)]=record; else next[key].push(record);
  if(await persist(next)) { $('#editor').close();render();toast(SUPABASE_CONFIG.enabled ? 'Cambios guardados en Supabase.' : 'Cambios guardados en este navegador.'); }
};
function deleteRecord(key,id) {
  if (SUPABASE_CONFIG.enabled && !canEditCloud()) { toast('Necesitás acceso de edición.'); return; }
  const record=data[key].find(x=>x.id===id);
  if(key!=='resources'&&data.resources.some(r=>r[key==='schools'?'schoolId':'categoryId']===id)) { toast('Este registro tiene recursos asignados. Reasignalos o eliminalos antes de continuar.');return; }
  ask('Eliminar registro',`¿Eliminar “${record.name}”? Esta acción no se puede deshacer.`,async()=>{const next=clone();next[key]=next[key].filter(x=>x.id!==id);if(key==='resources' && next.plans2027)next.plans2027=next.plans2027.filter(p=>p.resourceId!==id);if(await persist(next)){render();toast('Registro eliminado.');}});
}
$('#add-button').onclick=()=>openEditor(['schools','categories'].includes(currentView)?currentView:'resources');
$('#search').oninput=event=>{filters.search=event.target.value;renderContent();};
$('#clear-filters').onclick=()=>{Object.assign(filters,{search:'',schools:[],categories:[],states:[],uses:[],traffic:[]});$('#search').value='';render();};
$('#show-rules').onclick=()=>$('#rules-dialog').showModal();
$('#start-empty').onclick=()=>ask('Comenzar un inventario vacío','Se quitarán los datos de demostración y se guardará un inventario vacío en este navegador.',async()=>{if(await persist({version:1,schools:[],categories:[],resources:[]})){render();toast('Inventario listo. Comenzá registrando colegios y categorías.');}});
function download(content,type,filename) { const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000); }
const dateStamp=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'}).replaceAll('/','-');
$('#csv-button').onclick=()=>{
  const rows=filterResources(data,filters);
  const headers=['Código','Recurso','Colegio','Categoría','Estado físico','Semáforo','Agrupación','Uso del ciclo','Año de adquisición','Edad al cierre del ciclo','Unidades','Precio unitario (USD)','Total (USD)','Objetivo operativo del grupo','Decisión','Motivo'];
  download(createCSV([headers,...rows.map(r=>{const rec=recommendation(r,data.resources);return [r.code,r.name,data.schools.find(s=>s.id===r.schoolId).name,data.categories.find(c=>c.id===r.categoryId).name,r.state,TRAFFIC.find(t=>t.id===(r.trafficStatus||'unclassified'))?.legend,(data.groups||[]).find(g=>g.id===r.groupId)?.name||r.name,r.use,r.year,YEAR-r.year,r.quantity,decimalPrice(r.unitPrice == null ? null : Math.round(r.unitPrice*100)),decimalPrice(resourceTotalCents(r)),Math.max(...data.resources.filter(x=>x.schoolId===r.schoolId&&x.categoryId===r.categoryId).map(x=>x.target)),rec.label,rec.reason];})]),'text/csv;charset=utf-8;',`nexo-inventario-${selectedYear}-${dateStamp()}.csv`);
  toast(`CSV exportado: ${rows.length} lotes.`);
};
$('#backup-button').onclick=()=>download(JSON.stringify(data,null,2),'application/json',`nexo-respaldo-${dateStamp()}.json`);
$('#restore-button').onclick=()=>$('#restore-file').click();
$('#restore-file').onchange=async event=>{
  const file=event.target.files[0]; event.target.value=''; if(!file)return;
  try {
    if(file.size>25000000) throw Error('El respaldo supera el máximo de 25 MB.');
    const restored=validateData(JSON.parse(await file.text()));
    restored.plans2027 ??= [];
    if(!SUPABASE_CONFIG.enabled&&!restored.schoolTools&&data.schoolTools)restored.schoolTools=structuredClone(data.schoolTools);
    if(!SUPABASE_CONFIG.enabled&&!restored.planning2027&&data.planning2027)restored.planning2027=structuredClone(data.planning2027);
    if(data.businessVersion===1){restored.businessVersion=1;restored.changeReason='Restauración explícita de respaldo de inventario';}
    ask('Restaurar inventario',`Se reemplazará el inventario ${SUPABASE_CONFIG.enabled ? 'compartido de la coordinación' : 'de este navegador'} por ${restored.schools.length} colegios, ${restored.categories.length} categorías y ${restored.resources.length} lotes. El plan 2027 y las herramientas se reemplazan solo si el respaldo incluye sus datos. Descargá antes un respaldo actual para conservarlo.`,async()=>{if(await persist(restored,true)){render();toast('Inventario restaurado.');}});
  }catch(error){toast('No se pudo restaurar: '+error.message);}
};
function filterDescription() {
  return [filters.search?`Búsqueda: ${filters.search}`:'',...['schools','categories','states','uses','traffic'].map(key=>filters[key].length?`${{schools:'Colegios',categories:'Categorías',states:'Estados',uses:'Uso',traffic:'Semáforo'}[key]}: ${filters[key].map(id=>['schools','categories'].includes(key)?data[key].find(x=>x.id===id)?.name:key==='traffic'?TRAFFIC.find(t=>t.id===id)?.legend:id).join(', ')}`:'')].filter(Boolean).join(' | ') || 'Todo el inventario · sin filtros';
}
$('#pdf-button').onclick=()=>{
  if(!window.jspdf || !window.Chart){toast('No se cargaron las librerías de PDF o gráficos. Revisá la conexión y recargá.');return;}
  const dashboardWasHidden = $('#dashboard-view').hidden;
  try {
    $('#dashboard-view').hidden = false;
    const rows=filterResources(data,filters); if (dashboardWasHidden) renderDashboard(rows);
    const doc=new window.jspdf.jsPDF(); const width=170; let y=25;
    const page=()=>{doc.addPage();y=25;};
    const write=(text,size=10,bold=false)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);const lines=doc.splitTextToSize(String(text),width);for(const line of lines){if(y>270)page();doc.text(line,20,y);y+=size*.48+1;}y+=3;};
    const total=rows.reduce((s,r)=>s+r.quantity,0),active=rows.filter(r=>r.state==='Activo').reduce((s,r)=>s+r.quantity,0);
    doc.setTextColor(25,65,51);write('NEXO | Coordinación de Tecnología',19,true);write('Resumen de inventario · Ciclo '+selectedYear,13,true);
    write(`Emitido: ${new Date().toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'})}${demo?' · DATOS DE DEMOSTRACIÓN':''}`,9);
    write(filterDescription(),9);write(`${total} unidades | ${rows.length} lotes | ${new Set(rows.map(r=>r.schoolId)).size} colegios | ${total?Math.round(active/total*100):0}% operativo`,11,true);
    const prices = priceSummary(rows);
    write(`Valor del inventario filtrado: ${money(prices.totalCents)} | ${prices.missingLots} lotes sin precio${prices.missingLots ? ' (total parcial)' : ''}`,11,true);
    for(const [id,title] of [['#schools-chart','Recursos por colegio'],['#use-chart','Frecuencia de uso del ciclo'],['#age-chart','Uso y antigüedad']]) {
      const canvas=$(id); const h=Math.min(85,width*canvas.height/canvas.width);
      if(y+h+20>272)page();write(title,11,true);
      // Fondo blanco para impresión y medidas proporcionales del gráfico.
      doc.addImage(canvas.toDataURL('image/png'),'PNG',20,y,width,h);y+=h+9;
      if (id === '#use-chart') write(USES.map(use => `${use}: ${rows.filter(r => r.use === use).reduce((sum, r) => sum + r.quantity, 0)} unidades`).join(' | '),9);
    }
    page();write('Decisiones para el ciclo '+selectedYear,16,true);
    for(const label of ['Adquirir','Mantener','Eliminar/Renovar']){
      const selected=rows.filter(r=>recommendation(r,data.resources).label===label);
      write(`${label}: ${selected.reduce((s,r)=>s+r.quantity,0)} unidades / ${selected.length} lotes`,12,true);
      if(!selected.length)write('Sin registros en esta selección.',9);
      for(const r of selected)write(`${r.code} · ${r.name} | ${data.schools.find(s=>s.id===r.schoolId).name} | ${r.quantity} unidades | Unitario: ${money(r.unitPrice == null ? null : Math.round(r.unitPrice*100))} | Total: ${money(resourceTotalCents(r))} | ${r.state} | Uso ${r.use} | ${YEAR-r.year} años. ${recommendation(r,data.resources).reason}.`,9);
    }
    write('Criterios y alcance',11,true);write('Prioridad: obsoleto, uso nulo o edad >= 8 años: Eliminar/Renovar. Alta demanda y stock activo menor al objetivo máximo del grupo colegio/categoría: Adquirir. Resto: Mantener, con prioridad de reparación cuando corresponde. Disponibilidad calculada con el inventario completo. Unidades recomendadas son existencias, no cantidades de compra. Revisión técnica requerida.',9);
    const pages=doc.getNumberOfPages();for(let p=1;p<=pages;p++){doc.setPage(p);doc.setFontSize(8);doc.setTextColor(130);doc.text('Nexo · Planificación tecnológica '+selectedYear,20,287);doc.text(`${p} / ${pages}`,180,287);}
    doc.save(`nexo-resumen-${dateStamp()}.pdf`);toast('Resumen PDF generado.');
  }catch(error){toast('No se pudo generar el PDF: '+error.message);}
  finally { $('#dashboard-view').hidden = dashboardWasHidden; }
};
function canEditCloud() { return selectedYear===currentCycle()&&!cloudStore?.cycle?.readOnly&&cloudLoaded && !cloudBusy && ['admin','coordinator'].includes(cloudStore?.role); }
async function runBusinessAction(action,payload,key){
  await observations.flush();
  if(selectedYear!==currentCycle())throw Error('El ciclo seleccionado está cerrado.');
  if(!cloudLoaded||cloudBusy||!cloudStore?.business)throw Error('Actualizá los datos y verificá la instalación de los módulos.');
  if(planner.hasChanges())throw Error('Guardá o descartá la planificación antes de realizar operaciones de stock.');
  const store=cloudStore;let knownFailure=false,committed=false;cloudBusy=true;applyAccess();
  try{
    const result=await store.call('nexo_business_action',{p_action:action,p_payload:payload,p_key:key});
    if(result.error){knownFailure=true;throw cloudError(result.error);}
    committed=true;const inventory=await store.load();if(cloudStore!==store)throw Error('La sesión cambió durante la operación.');
    data=inventory;render();return result.data;
  }catch(error){if((!knownFailure||committed)&&cloudStore===store){cloudLoaded=false;$('#cloud-state').textContent='Actualizá los datos antes de continuar';}throw error;}
  finally{if(cloudStore===store){cloudBusy=false;applyAccess();}}
}
async function fetchBusinessReport(filters){
  if(!cloudStore?.business)throw Error('Primero conectá los módulos de gestión.');
  if(cloudStore.cycleEnabled&&!cloudStore.cycle.available)throw Error('No hay un archivo verificado para ese ciclo.');
  if(cloudStore.cycleEnabled){const report=cycleFinancialReport(data,cloudStore.business,selectedYear,filters);report.mode+=' Datos guardados al '+new Date(cloudStore.cycle.snapshotAt).toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'})+'.';return report;}
  const {data:report,error}=await cloudStore.call('nexo_business_report',{p_from:filters.from,p_to:filters.to,p_school:filters.school||null,p_status:filters.status||null});
  if(error)throw cloudError(error);return report;
}
function applyAccess() {
  planner.applyAccess();
  $('#cycle-year').disabled=cloudBusy;$('#active-school').disabled=cloudBusy;
  if(currentView==='explorer'&&!cloudBusy)explorer.renderDetail();
  if(currentView==='resources'&&!cloudBusy&&canEditCloud()&&!$('#software-add'))annual.software();
  if(currentView==='requests'&&!cloudBusy&&canEditCloud()&&cloudStore?.business?.access?.finance&&!$('#request-estimates'))annual.approvals();
  if (!SUPABASE_CONFIG.enabled) return;
  const canEdit = canEditCloud();
  document.querySelectorAll('#add-button,#restore-button,[data-edit],[data-delete],#editor-form button[type="submit"],#confirm-accept').forEach(button => button.disabled = !canEdit);
  $('#refresh-cloud').disabled = cloudBusy;
}
function setAuthMessage(message) { $('#auth-message').textContent = message; }
function clearCloudSession() {
  cloudSession = null; cloudStore = null; cloudLoaded = false; cloudBusy = false;
  observations.clear();planner.clear();
  explorer.clear();
  data = {version:1,currency:'USD',schools:[],categories:[],resources:[]};
  document.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());
  document.body.classList.add('cloud-locked');
  $('#auth-screen').hidden = false; $('#cloud-toolbar').hidden = true;
  $('#login-form').hidden = false; $('#auth-signout').hidden = true;
  $('#retry-cloud').hidden = true; $('#login-form [name="password"]').value = '';
  document.querySelector('.local-status').textContent = 'Sesión cerrada';
  render();
}
async function loadCloud() {
  if($('#tool-dialog').open){toast('Guardá o cerrá la ficha de herramienta antes de actualizar.');return;}
  if (planner.hasChanges()) { toast('Guardá o descartá los cambios de planificación antes de actualizar los datos.'); return; }
  if (cloudBusy || !cloudSession || !cloudStore) return;
  const store = cloudStore;
  cloudBusy = true; applyAccess(); $('#refresh-cloud').textContent='Actualizando…';
  try {
    store.year=selectedYear;const inventory = await store.load();
    if (cloudStore !== store) return;
    data = inventory; cloudLoaded = true; demo = false;
    document.body.classList.remove('cloud-locked'); $('#auth-screen').hidden = true;
    $('#cloud-toolbar').hidden = false;
    $('#cloud-user').textContent = cloudSession.user.email;
    $('#cloud-state').textContent = `${store.role === 'requester' ? 'Portal de solicitudes' : store.role === 'viewer' ? 'Solo lectura' : 'Edición autorizada'} · Actualizado ${new Date().toLocaleTimeString('es-AR')}`;
    document.querySelector('.local-status').textContent = 'Inventario compartido · Supabase';
    document.querySelector('.sidebar-bottom small').textContent = 'Conectado a Supabase';
    $('#storage-warning').hidden = true;
    render();
  } catch(error) {
    if (cloudStore !== store) return;
    cloudLoaded = false;
    document.body.classList.add('cloud-locked'); $('#auth-screen').hidden = false;
    $('#login-form').hidden = true; $('#retry-cloud').hidden = false; $('#auth-signout').hidden = false;
    setAuthMessage(error.message);
  } finally {
    if (cloudStore === store) { cloudBusy = false; $('#refresh-cloud').textContent='↻ Actualizar datos';renderCycleControls();applyAccess(); }
  }
}
async function runToolAction(action,tool) {
  await observations.flush();
  if(planner.hasChanges())throw Error('Guardá o descartá la planificación antes de modificar herramientas.');
  if(!SUPABASE_CONFIG.enabled){
    const next=clone();next.schoolTools=(next.schoolTools||[]).filter(t=>t.id!==tool.id);
    if(action==='upsert')next.schoolTools.push(tool);
    if(!await persist(next))throw Error('No se pudo guardar la herramienta en este navegador.');return;
  }
  if(!canEditCloud()||!cloudStore?.toolsEnabled)throw Error('Actualizá los datos y verificá el permiso de edición.');
  const store=cloudStore;cloudBusy=true;applyAccess();
  try{await store.saveTool(action,tool);const next=await store.load();if(cloudStore!==store)throw Error('La sesión cambió.');data=next;$('#cloud-state').textContent='Herramientas guardadas en Supabase';}
  catch(error){if(cloudStore===store){cloudLoaded=false;$('#cloud-state').textContent='Actualizá los datos antes de continuar';}throw error;}
  finally{if(cloudStore===store){cloudBusy=false;applyAccess();}}
}
async function savePlanningModel(model) {
  try{await observations.flush();}catch(error){toast(error.message);return false;}
  for(const entry of model.entries){const saved=observations.entries.get('plan:'+entry.id),current=data.planning2027?.entries.find(e=>e.id===entry.id);if(saved?.version>0&&!saved.pending()&&current)entry.notes=current.notes;}
  if(!SUPABASE_CONFIG.enabled)return persist({...clone(),planning2027:model});
  if(!canEditCloud()||!cloudStore?.planningV2)return false;
  const store=cloudStore;cloudBusy=true;applyAccess();
  $('#cloud-state').textContent='Guardando planificación…';
  try {
    await store.savePlanning(model);if(cloudStore!==store)return false;
    data={...data,planning2027:model};$('#cloud-state').textContent='Planificación guardada en Supabase';return true;
  } catch(error) {
    if(cloudStore!==store)return false;cloudLoaded=false;
    $('#cloud-state').textContent='Guardado no confirmado · Actualizá los datos';
    $('#planning-error').textContent=error.message;toast(error.message);return false;
  } finally {if(cloudStore===store){cloudBusy=false;applyAccess();}}
}
async function saveCloud(next,recovery=false) {
  if (!canEditCloud()) { toast('No se guardó: actualizá el inventario o verificá tus permisos.'); return false; }
  try { validateData(next); } catch(error) { toast(error.message); return false; }
  const store=cloudStore;
  cloudBusy=true; applyAccess(); $('#cloud-state').textContent='Guardando en Supabase…';
  try {
    if(recovery&&(store.planningV2||store.toolsEnabled)){await store.restore(next);next=await store.load();}
    else await store.save(next);
    if (cloudStore !== store) return false;
    data=store.cycleEnabled?await store.load():next; $('#cloud-state').textContent='Guardado en Supabase · USD';
    return true;
  } catch(error) {
    if (cloudStore !== store) return false;
    cloudLoaded=false;
    $('#cloud-state').textContent='Guardado no confirmado · Actualizá los datos';
    $('#form-error').textContent=error.message; toast('No se guardó: '+error.message);
    if (currentView === 'planning2027') $('#planning-error').textContent=error.message;
    return false;
  } finally { if (cloudStore === store) { cloudBusy=false; applyAccess(); } }
}
async function initializeCloud() {
  document.body.classList.remove('cloud-start');
  if (!SUPABASE_CONFIG.enabled) { $('#auth-screen').hidden=true; return; }
  clearCloudSession();
  if (!window.supabase) {
    setAuthMessage('No se pudo cargar la conexión a Supabase. Revisá internet y recargá la página.');
    $('#login-form button').disabled=true;return;
  }
  cloudClient=window.supabase.createClient(SUPABASE_CONFIG.url,SUPABASE_CONFIG.publishableKey);
  const adoptSession=session=>{
    if(cloudSession?.user.id===session.user.id&&cloudStore){cloudSession=session;if(!cloudLoaded&&!cloudBusy)loadCloud();return;}
    cloudSession=session;cloudStore=new CloudInventory(cloudClient);cloudLoaded=false;cloudBusy=false;$('#login-form').hidden=true;$('#auth-signout').hidden=false;setAuthMessage('Cargando inventario…');loadCloud();
  };
  cloudClient.auth.onAuthStateChange((event,session)=>{
    if (event==='SIGNED_OUT') { clearCloudSession(); setAuthMessage('Ingresá con tu cuenta autorizada.'); }
    if (session && cloudSession?.user.id===session.user.id) cloudSession=session;
    else if (event==='SIGNED_IN' && session) setTimeout(async()=>{
      adoptSession(session);
    },0);
  });
  const {data:sessionData,error}=await cloudClient.auth.getSession();
  if(error){setAuthMessage(cloudError(error).message);return;}
  if(sessionData.session){adoptSession(sessionData.session);}
  else setAuthMessage('Ingresá con tu cuenta autorizada.');
  $('#login-form').onsubmit=async event=>{
    event.preventDefault(); const button=$('#login-form button');button.disabled=true;setAuthMessage('Ingresando…');
    try {
      const values=new FormData(event.target);
      const {error}=await cloudClient.auth.signInWithPassword({email:values.get('email').trim(),password:values.get('password')});
      if(error)throw cloudError(error);
      $('#login-form [name="password"]').value='';
    }catch(error){setAuthMessage(error.message);}finally{button.disabled=false;}
  };
  const signOut=async()=>{
    try{await observations.flush();}catch(error){toast(error.message);return;}
    if (planner.hasChanges()) { ask('Cerrar sesión sin guardar','Hay cambios pendientes en la planificación 2027. ¿Querés descartarlos y cerrar sesión?',()=>{planner.clear();signOut();}); return; }
    const {error}=await cloudClient.auth.signOut({scope:'local'});
    if(error){toast(cloudError(error).message);return;}
    clearCloudSession();setAuthMessage('Sesión cerrada.');
  };
  $('#signout-button').onclick=signOut; $('#auth-signout').onclick=signOut;
  $('#refresh-cloud').onclick=loadCloud; $('#retry-cloud').onclick=loadCloud;
  $('#local-backup').onclick=()=>{
    try {
      const local=localStorage.getItem(KEY);
      if(!local){toast('No hay un inventario local anterior en este navegador.');return;}
      download(local,'application/json',`nexo-inventario-local-${dateStamp()}.json`);
      toast('Respaldo local descargado. Usá “Restaurar respaldo” para importarlo al inventario compartido.');
    }catch{toast('No se pudo leer el inventario local anterior.');}
  };
  const refreshWhenIdle=()=>{
    if(!document.hidden && cloudLoaded && !cloudBusy && !planner.hasChanges() && !observations.pending() && !document.querySelector('dialog[open]'))loadCloud();
  };
  setInterval(refreshWhenIdle,30000); window.addEventListener('focus',refreshWhenIdle);
}
// Esperar a los scripts defer antes de dibujar con Chart.js.
$('#login-form').onsubmit=event=>event.preventDefault();
function boot() { setView(); initializeCloud(); }
if(document.readyState==='complete')boot();else window.addEventListener('load',boot,{once:true});



