import { YEAR, STATES, USES, validateData, recommendation, filterResources, createCSV, demoData } from './domain.js';
const $ = s => document.querySelector(s);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KEY = 'nexo.inventory.v1';
let raw = null, data, demo = false, storageBlocked = false;
function warning(message) { $('#storage-warning').textContent = message; $('#storage-warning').hidden = false; }
try {
  raw = localStorage.getItem(KEY);
  data = raw ? validateData(JSON.parse(raw)) : demoData();
  demo = !raw;
} catch {
  storageBlocked = true;
  data = {version:1, schools:[], categories:[], resources:[]};
  warning('No se pudo leer el almacenamiento. No se sobrescribirán los datos existentes. Descargá un respaldo si corresponde y restaurá un archivo válido para recuperar el acceso.');
}
const filters = { search:'', schools:[], categories:[], states:[], uses:[] };
let currentView = 'dashboard', charts = {}, editing = null, toastTimer;
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => $('#toast').hidden = true, 5000); }
function persist(next, recovery = false) {
  try {
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
window.addEventListener('storage', event => { if (event.key === KEY || event.key === null) warning('El almacenamiento cambió en otra pestaña. Recargá esta página para ver la última versión antes de editar.'); });
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
  multiFilter('states','Estado',STATES.map(x => ({id:x,name:x})),'Todos los estados');
  multiFilter('uses','Uso en 2026',USES.map(x => ({id:x,name:x})),'Todas las frecuencias');
}
const titles = {dashboard:['Dashboard general','Una mirada integral a la tecnología de tus instituciones.'],resources:['Gestión de recursos','Organizá, actualizá y analizá tu inventario tecnológico.'],schools:['Gestión de colegios','Cada institución, conectada con sus recursos.'],categories:['Categorías de recursos','Una estructura clara para organizar la tecnología.']};
function setView() {
  currentView = location.hash.slice(1);
  if (!titles[currentView]) currentView = 'dashboard';
  const [title, description] = titles[currentView];
  $('#page-title').textContent = title; $('#breadcrumb').textContent = title; $('#page-description').textContent = description;
  document.querySelectorAll('[data-view]').forEach(a => { a.classList.toggle('active',a.dataset.view === currentView); if (a.dataset.view === currentView) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
  const entity = ['schools','categories'].includes(currentView);
  $('#filters').hidden = entity; $('#dashboard-view').hidden = currentView !== 'dashboard'; $('#inventory-view').hidden = entity; $('#entities-view').hidden = !entity;
  $('#pdf-button').hidden = entity;
  $('#add-button').textContent = currentView === 'schools' ? '＋ Nuevo colegio' : currentView === 'categories' ? '＋ Nueva categoría' : '＋ Nuevo recurso';
  render();
}
window.addEventListener('hashchange', setView);
function render() { $('#demo-banner').hidden = !demo; renderFilters(); renderContent(); }
function renderContent() {
  const rows = filterResources(data, filters);
  const total = rows.reduce((s,r) => s+r.quantity,0);
  $('#filter-count').textContent = `${rows.length} de ${data.resources.length} lotes · ${total} unidades en la selección`;
  $('#table-count').textContent = `${rows.length} lotes registrados · ${total} unidades`;
  renderTable(rows);
  if (currentView === 'dashboard') renderDashboard(rows);
  if (['schools','categories'].includes(currentView)) renderEntities();
}
function badge(label, tone, title = '') { return `<span class="badge ${tone}" title="${escapeHTML(title)}">${escapeHTML(label)}</span>`; }
function renderTable(rows) {
  $('#resource-rows').innerHTML = rows.length ? rows.map(r => {
    const rec = recommendation(r,data.resources);
    return `<tr><td><b>${escapeHTML(r.name)}</b><small>${escapeHTML(r.code)}</small></td><td>${escapeHTML(data.schools.find(s=>s.id===r.schoolId)?.name)}</td><td>${escapeHTML(data.categories.find(c=>c.id===r.categoryId)?.name)}</td><td>${badge(r.state,r.state==='Activo'?'green':r.state==='Obsoleto'?'red':'amber')}</td><td>${escapeHTML(r.use)}</td><td>${r.quantity}</td><td>${YEAR-r.year} años</td><td>${badge(rec.label,rec.tone,rec.reason)}</td><td><button class="row-action" data-edit="${escapeHTML(r.id)}" aria-label="Editar ${escapeHTML(r.name)}">Editar</button><button class="row-action" data-delete="${escapeHTML(r.id)}" aria-label="Eliminar ${escapeHTML(r.name)}">Eliminar</button></td></tr>`;
  }).join('') : '<tr><td class="empty" colspan="9">No hay recursos para esta selección. Ajustá los filtros o agregá un nuevo recurso.</td></tr>';
  $('#resource-rows').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openEditor('resources',b.dataset.edit));
  $('#resource-rows').querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>deleteRecord('resources',b.dataset.delete));
}
function renderEntities() {
  const key = currentView;
  $('#entity-list').innerHTML = data[key].length ? data[key].map(entity => {
    const rows = data.resources.filter(r => r[key==='schools'?'schoolId':'categoryId']===entity.id);
    return `<article class="entity-card"><span class="entity-icon">${key==='schools'?'⌂':'◇'}</span><h3>${escapeHTML(entity.name)}</h3><p>${key==='schools'?escapeHTML(entity.location || 'Sin ubicación registrada'):'Categoría de recursos tecnológicos'}<br>${rows.length} lotes · ${rows.reduce((s,r)=>s+r.quantity,0)} unidades</p><div class="entity-actions"><button class="text-button" data-edit="${escapeHTML(entity.id)}">Editar ${key==='schools'?'colegio':'categoría'}</button><button class="text-button" data-delete="${escapeHTML(entity.id)}">Eliminar</button></div></article>`;
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
  if (key==='resources' && (!data.schools.length || !data.categories.length)) { toast('Primero registrá al menos un colegio y una categoría.'); return; }
  const item = id ? data[key].find(x=>x.id===id) : {};
  editing = {key,id};
  $('#editor-title').textContent=`${id?'Editar':'Crear'} ${key==='resources'?'recurso':key==='schools'?'colegio':'categoría'}`;
  const field=(name,label,value,type='text',extra='')=>`<label>${label}<input name="${name}" type="${type}" value="${escapeHTML(value??'')}" required ${extra}></label>`;
  const select=(name,label,items,value)=>`<label>${label}<select name="${name}" required>${options(items,value)}</select></label>`;
  $('#form-fields').innerHTML = key==='resources' ?
    `${field('name','Nombre del recurso',item.name,'text','maxlength="120"')}${field('code','Código único del lote',item.code,'text','maxlength="60"')}${select('schoolId','Colegio',data.schools,item.schoolId)}${select('categoryId','Categoría',data.categories,item.categoryId)}${select('state','Estado',STATES.map(x=>({id:x,name:x})),item.state)}${select('use','Frecuencia de uso en 2026',USES.map(x=>({id:x,name:x})),item.use||'Regular')}${field('year','Año de adquisición',item.year??YEAR,'number',`min="1980" max="${YEAR}" step="1"`)}${field('quantity','Cantidad de unidades del lote',item.quantity??1,'number','min="1" max="1000000" step="1"')}${field('target','Objetivo operativo del colegio y categoría',item.target??1,'number','min="1" max="1000000" step="1"')}<div class="full"><small>El objetivo indica cuántas unidades operativas se necesitan en esta categoría y colegio. Si existen varios lotes, se usa el objetivo máximo. Edad calculada al cierre de 2026.</small></div>` :
    `${field('name',key==='schools'?'Nombre del colegio':'Nombre de la categoría',item.name,'text','maxlength="120"')}${key==='schools'?'<label>Zona o ubicación<input name="location" maxlength="160" value="'+escapeHTML(item.location)+'"></label>':''}`;
  $('#form-error').textContent=''; $('#editor-form button[type="submit"]').hidden=false; $('#editor').showModal();
}
$('#editor-form').onsubmit=event=>{
  event.preventDefault();
  const {key,id}=editing;
  const values=Object.fromEntries(new FormData(event.target));
  Object.keys(values).forEach(k=>values[k]=values[k].trim());
  if (!values.name || (key==='resources' && !values.code)) { $('#form-error').textContent='Completá los campos sin usar solamente espacios.';return; }
  if (key!=='resources' && data[key].some(x=>x.id!==id && x.name.toLocaleLowerCase('es')===values.name.toLocaleLowerCase('es'))) { $('#form-error').textContent='Ya existe un registro con ese nombre.';return; }
  if (key==='resources') {
    ['year','quantity','target'].forEach(k=>values[k]=Number(values[k]));
    if(data.resources.some(r=>r.id!==id&&r.code.toLowerCase()===values.code.toLowerCase())) { $('#form-error').textContent='Ese código de inventario ya está registrado.';return; }
  }
  const next=clone(); const record={...values,id:id||crypto.randomUUID()};
  if(id) next[key][next[key].findIndex(x=>x.id===id)]=record; else next[key].push(record);
  if(persist(next)) { $('#editor').close();render();toast('Cambios guardados en este navegador.'); }
};
function deleteRecord(key,id) {
  const record=data[key].find(x=>x.id===id);
  if(key!=='resources'&&data.resources.some(r=>r[key==='schools'?'schoolId':'categoryId']===id)) { toast('Este registro tiene recursos asignados. Reasignalos o eliminalos antes de continuar.');return; }
  ask('Eliminar registro',`¿Eliminar “${record.name}”? Esta acción no se puede deshacer.`,()=>{const next=clone();next[key]=next[key].filter(x=>x.id!==id);if(persist(next)){render();toast('Registro eliminado.');}});
}
$('#add-button').onclick=()=>openEditor(['schools','categories'].includes(currentView)?currentView:'resources');
$('#search').oninput=event=>{filters.search=event.target.value;renderContent();};
$('#clear-filters').onclick=()=>{Object.assign(filters,{search:'',schools:[],categories:[],states:[],uses:[]});$('#search').value='';render();};
$('#show-rules').onclick=()=>$('#rules-dialog').showModal();
$('#start-empty').onclick=()=>ask('Comenzar un inventario vacío','Se quitarán los datos de demostración y se guardará un inventario vacío en este navegador.',()=>{if(persist({version:1,schools:[],categories:[],resources:[]})){render();toast('Inventario listo. Comenzá registrando colegios y categorías.');}});
function download(content,type,filename) { const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000); }
const dateStamp=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'}).replaceAll('/','-');
$('#csv-button').onclick=()=>{
  const rows=filterResources(data,filters);
  const headers=['Código','Recurso','Colegio','Categoría','Estado','Uso 2026','Año de adquisición','Edad en 2026','Unidades','Objetivo operativo del grupo','Decisión','Motivo'];
  download(createCSV([headers,...rows.map(r=>{const rec=recommendation(r,data.resources);return [r.code,r.name,data.schools.find(s=>s.id===r.schoolId).name,data.categories.find(c=>c.id===r.categoryId).name,r.state,r.use,r.year,YEAR-r.year,r.quantity,Math.max(...data.resources.filter(x=>x.schoolId===r.schoolId&&x.categoryId===r.categoryId).map(x=>x.target)),rec.label,rec.reason];})]),'text/csv;charset=utf-8;',`nexo-inventario-${dateStamp()}.csv`);
  toast(`CSV exportado: ${rows.length} lotes.`);
};
$('#backup-button').onclick=()=>download(JSON.stringify(data,null,2),'application/json',`nexo-respaldo-${dateStamp()}.json`);
$('#restore-button').onclick=()=>$('#restore-file').click();
$('#restore-file').onchange=async event=>{
  const file=event.target.files[0]; event.target.value=''; if(!file)return;
  try {
    if(file.size>5000000) throw Error('El respaldo supera el máximo de 5 MB.');
    const restored=validateData(JSON.parse(await file.text()));
    ask('Restaurar inventario',`Se reemplazará el inventario de este navegador por ${restored.schools.length} colegios, ${restored.categories.length} categorías y ${restored.resources.length} lotes. Descargá un respaldo del inventario actual antes de confirmar si querés conservarlo.`,()=>{if(persist(restored,true)){render();toast('Inventario restaurado.');}});
  }catch(error){toast('No se pudo restaurar: '+error.message);}
};
function filterDescription() {
  return [filters.search?`Búsqueda: ${filters.search}`:'',...['schools','categories','states','uses'].map(key=>filters[key].length?`${{schools:'Colegios',categories:'Categorías',states:'Estados',uses:'Uso'}[key]}: ${filters[key].map(id=>['schools','categories'].includes(key)?data[key].find(x=>x.id===id)?.name:id).join(', ')}`:'')].filter(Boolean).join(' | ') || 'Todo el inventario · sin filtros';
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
    doc.setTextColor(25,65,51);write('NEXO | Coordinación de Tecnología',19,true);write('Resumen de inventario · Ciclo 2026',13,true);
    write(`Emitido: ${new Date().toLocaleString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'})}${demo?' · DATOS DE DEMOSTRACIÓN':''}`,9);
    write(filterDescription(),9);write(`${total} unidades | ${rows.length} lotes | ${new Set(rows.map(r=>r.schoolId)).size} colegios | ${total?Math.round(active/total*100):0}% operativo`,11,true);
    for(const [id,title] of [['#schools-chart','Recursos por colegio'],['#use-chart','Frecuencia de uso 2026'],['#age-chart','Uso y antigüedad']]) {
      const canvas=$(id); const h=Math.min(85,width*canvas.height/canvas.width);
      if(y+h+20>272)page();write(title,11,true);
      // Fondo blanco para impresión y medidas proporcionales del gráfico.
      doc.addImage(canvas.toDataURL('image/png'),'PNG',20,y,width,h);y+=h+9;
      if (id === '#use-chart') write(USES.map(use => `${use}: ${rows.filter(r => r.use === use).reduce((sum, r) => sum + r.quantity, 0)} unidades`).join(' | '),9);
    }
    page();write('Decisiones para el ciclo 2026',16,true);
    for(const label of ['Adquirir','Mantener','Eliminar/Renovar']){
      const selected=rows.filter(r=>recommendation(r,data.resources).label===label);
      write(`${label}: ${selected.reduce((s,r)=>s+r.quantity,0)} unidades / ${selected.length} lotes`,12,true);
      if(!selected.length)write('Sin registros en esta selección.',9);
      for(const r of selected)write(`${r.code} · ${r.name} | ${data.schools.find(s=>s.id===r.schoolId).name} | ${r.quantity} unidades | ${r.state} | Uso ${r.use} | ${YEAR-r.year} años. ${recommendation(r,data.resources).reason}.`,9);
    }
    write('Criterios y alcance',11,true);write('Prioridad: obsoleto, uso nulo o edad >= 8 años: Eliminar/Renovar. Alta demanda y stock activo menor al objetivo máximo del grupo colegio/categoría: Adquirir. Resto: Mantener, con prioridad de reparación cuando corresponde. Disponibilidad calculada con el inventario completo. Unidades recomendadas son existencias, no cantidades de compra. Revisión técnica requerida.',9);
    const pages=doc.getNumberOfPages();for(let p=1;p<=pages;p++){doc.setPage(p);doc.setFontSize(8);doc.setTextColor(130);doc.text('Nexo · Planificación tecnológica 2026',20,287);doc.text(`${p} / ${pages}`,180,287);}
    doc.save(`nexo-resumen-${dateStamp()}.pdf`);toast('Resumen PDF generado.');
  }catch(error){toast('No se pudo generar el PDF: '+error.message);}
  finally { $('#dashboard-view').hidden = dashboardWasHidden; }
};
// Esperar a los scripts defer antes de dibujar con Chart.js.
if(document.readyState==='complete')setView();else window.addEventListener('load',setView,{once:true});
