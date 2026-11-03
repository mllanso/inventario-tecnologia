import {validatePlanningModel} from './planning-domain.js?v=20261102-tools';
import {validateTools} from './tools-domain.js?v=20261102-tools';
export const YEAR = 2026;
export const STATES = ['Activo', 'En Reparación', 'Obsoleto'];
export const USES = ['Alta', 'Regular', 'Baja', 'Nula'];
export const PLAN_CHOICES = [
  {id:'confirmed',name:'Confirmado'}, {id:'in_progress',name:'En proceso'},
  {id:'rejected',name:'Descontinuado/Rechazado'}
];
export function validatePlans(plans, resources) {
  if (!Array.isArray(plans) || plans.length > 5000) throw Error('La planificación 2027 no tiene un formato válido.');
  const ids = new Set();
  for (const p of plans) {
    if (!p || !resources.some(r=>r.id === p.resourceId) || ids.has(p.resourceId)) throw Error('La planificación tiene recursos inexistentes o repetidos.');
    ids.add(p.resourceId);
    if (!Number.isInteger(p.baselineQuantity) || p.baselineQuantity < 0 || p.baselineQuantity > 1000000 || !Number.isInteger(p.quantity) || p.quantity < 0 || p.quantity > 1000000 || typeof p.notes !== 'string' || p.notes.length > 500) throw Error('Revisá las cantidades y observaciones de la planificación 2027.');
    const valid = p.choice === 'same' ? p.quantity === p.baselineQuantity : p.choice === 'more' ? p.quantity > p.baselineQuantity : p.choice === 'less' ? p.quantity > 0 && p.quantity < p.baselineQuantity : p.choice === 'discontinue' && p.quantity === 0;
    if (!valid) throw Error('La cantidad 2027 debe respetar la decisión: igual, mayor, menor (al menos 1), o 0 para descontinuar.');
  }
  return plans;
}
export function makePlan(resource, choice, quantity, notes = '') {
  const plan = {resourceId:resource.id,baselineQuantity:resource.quantity,choice,quantity:choice === 'same' ? resource.quantity : choice === 'discontinue' ? 0 : quantity,notes:notes.trim()};
  validatePlans([plan],[resource]);return plan;
}
export function nextLotCode(resources) {
  let highest = 0n;
  let width = 4;
  for (const resource of resources) {
    const code = String(resource.code ?? '').trim();
    if (!/^\d+$/.test(code)) continue;
    const number = BigInt(code);
    if (number > highest) highest = number;
    width = Math.max(width, code.length);
  }
  const next = (highest + 1n).toString().padStart(width, '0');
  return next.length <= 60 ? next : '';
}
export function validUnitPrice(price) {
  return typeof price === 'number' && Number.isFinite(price) && price >= 0 && price <= 10000000 && Math.abs(price * 100 - Math.round(price * 100)) < 0.000001;
}
export function resourceTotalCents(resource) {
  return resource.unitPrice == null ? null : Math.round(resource.unitPrice * 100) * resource.quantity;
}
export function priceSummary(resources) {
  return resources.reduce((summary, resource) => {
    const total = resourceTotalCents(resource);
    if (total === null) summary.missingLots++;
    else { summary.totalCents += total; summary.pricedUnits += resource.quantity; }
    return summary;
  }, { totalCents: 0, pricedUnits: 0, missingLots: 0 });
}
export function decimalPrice(cents) {
  return cents == null ? '' : (cents / 100).toFixed(2).replace('.', ',');
}
export function validateData(data) {
  if (!data || data.version !== 1 || !['schools', 'categories', 'resources'].every(k => Array.isArray(data[k]))) throw Error('El respaldo no tiene un formato compatible.');
  if (data.currency !== undefined && data.currency !== 'USD') throw Error('El inventario debe estar expresado en USD.');
  for (const key of ['schools', 'categories', 'resources']) {
    if (data[key].length > 5000) throw Error('Máximo 5000 registros por tabla.');
    const ids = new Set();
    for (const item of data[key]) {
      if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 120 || ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 120) throw Error('Hay registros inválidos o identificadores duplicados.');
      ids.add(item.id);
    }
  }
  for (const key of ['schools','categories']) if (new Set(data[key].map(item=>item.name.trim().toLocaleLowerCase('es'))).size !== data[key].length) throw Error('Hay nombres de colegios o categorías repetidos.');
  if (data.schools.some(s=>s.location != null && (typeof s.location !== 'string' || s.location.length > 160))) throw Error('La ubicación del colegio no es válida.');
  for (const r of data.resources) {
    if (r.trafficStatus !== undefined && !['available','in_progress','required','unclassified'].includes(r.trafficStatus)) throw Error('Semáforo inválido.');
    if (r.unitPrice != null && !validUnitPrice(r.unitPrice)) throw Error('El precio unitario debe ser un número entre 0 y 10.000.000, con hasta dos decimales.');
    if (!data.schools.some(s => s.id === r.schoolId) || !data.categories.some(c => c.id === r.categoryId) || !STATES.includes(r.state) || !USES.includes(r.use) || !Number.isInteger(r.quantity) || r.quantity < (data.businessVersion===1?0:1) || r.quantity > 1000000 || !Number.isInteger(r.target) || r.target < 1 || r.target > 1000000 || !Number.isInteger(r.year) || r.year < 1980 || r.year > YEAR || typeof r.code !== 'string' || !r.code.trim() || r.code.length > 60) throw Error('Un recurso tiene datos o relaciones inválidos.');
  }
  if (!Number.isSafeInteger(priceSummary(data.resources).totalCents)) throw Error('El valor del inventario supera el máximo permitido.');
  if (new Set(data.resources.map(r => r.code.trim().toLowerCase())).size !== data.resources.length) throw Error('Hay códigos de inventario repetidos.');
  if (data.plans2027 !== undefined) validatePlans(data.plans2027, data.resources);
  if (data.planning2027 !== undefined) validatePlanningModel(data.planning2027);
  if (data.schoolTools !== undefined) validateTools(data.schoolTools);
  return data;
}
// La recomendación usa el inventario completo para que un filtro no invente faltantes.
export function recommendation(r, resources) {
  const group = resources.filter(x => x.schoolId === r.schoolId && x.categoryId === r.categoryId);
  const stock = group.filter(x => x.state === 'Activo').reduce((s, x) => s + x.quantity, 0);
  const target = Math.max(...group.map(x => x.target));
  if (r.state === 'Obsoleto' || r.use === 'Nula' || YEAR - r.year >= 8) return { label: 'Eliminar/Renovar', tone: 'red', reason: r.state === 'Obsoleto' ? 'Estado obsoleto' : r.use === 'Nula' ? 'Sin uso registrado en 2026' : 'Antigüedad de 8 años o más' };
  if (group.some(x => x.use === 'Alta') && stock < target) return { label: 'Adquirir', tone: 'amber', reason: `Alta demanda: ${stock} operativos / ${target} requeridos` };
  return { label: 'Mantener', tone: 'green', reason: r.state === 'En Reparación' ? 'Priorizar reparación y seguimiento' : 'Conservar y realizar mantenimiento preventivo' };
}
export function filterResources(data, filters) {
  const q = filters.search.trim().toLocaleLowerCase('es');
  return data.resources.filter(r => {
    const school = data.schools.find(s => s.id === r.schoolId)?.name || '';
    const category = data.categories.find(c => c.id === r.categoryId)?.name || '';
    return `${r.name} ${r.code} ${school} ${category}`.toLocaleLowerCase('es').includes(q) &&
      [['schools', r.schoolId], ['categories', r.categoryId], ['states', r.state], ['uses', r.use], ['traffic',r.trafficStatus||'unclassified']].every(([key, value]) => !filters[key]?.length || filters[key].includes(value));
  });
}
export function csvCell(value) {
  let s = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function createCSV(rows) { return '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n'); }
export function demoData() {
  return { version: 1,
    schools: [{id:'s1', name:'Colegio San Martín', location:'Zona Centro'}, {id:'s2', name:'Colegio Manuel Belgrano', location:'Zona Norte'}, {id:'s3', name:'Escuela Técnica Nº 4', location:'Zona Sur'}, {id:'s4', name:'Colegio Sarmiento', location:'Zona Oeste'}],
    categories: [{id:'c1',name:'Laptops'}, {id:'c2',name:'Proyectores'}, {id:'c3',name:'Servidores'}, {id:'c4',name:'Sensores'}],
    resources: [
      ['r1','Laptops aula digital','TEC-001','s1','c1','Activo','Alta',2023,18,25],
      ['r2','Proyectores Epson','TEC-002','s1','c2','Activo','Regular',2022,6,6],
      ['r3','Servidor de archivos','TEC-003','s1','c3','Obsoleto','Baja',2016,1,1],
      ['r4','Laptops laboratorio','TEC-004','s2','c1','Activo','Regular',2024,24,24],
      ['r5','Proyectores de aula','TEC-005','s2','c2','En Reparación','Alta',2020,3,5],
      ['r6','Kit de sensores IoT','TEC-006','s3','c4','Activo','Alta',2025,30,30],
      ['r7','Laptops taller','TEC-007','s3','c1','En Reparación','Alta',2021,5,20],
      ['r8','Laptops taller operativas','TEC-008','s3','c1','Activo','Alta',2022,12,20],
      ['r9','Proyectores antiguos','TEC-009','s4','c2','Obsoleto','Nula',2017,4,4],
      ['r10','Laptops biblioteca','TEC-010','s4','c1','Activo','Regular',2023,15,15],
      ['r11','Servidor institucional','TEC-011','s3','c3','Activo','Regular',2024,2,2],
      ['r12','Sensores de laboratorio','TEC-012','s2','c4','Activo','Baja',2024,8,8]
    ].map(([id,name,code,schoolId,categoryId,state,use,year,quantity,target]) => ({id,name,code,schoolId,categoryId,state,use,year,quantity,target})) };
}

