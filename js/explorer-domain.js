import {normalize} from './school-branding.js?v=20261104-groups';
import {priceSummary} from './domain.js?v=20261104-groups';
export function catalogKey(resource){return resource.groupId&&!resource.groupId.startsWith('legacy:')?'group:'+resource.groupId:'name:'+JSON.stringify([resource.categoryId,normalize(resource.name)]);}
export function schoolCatalog(data,schoolId){
 const map=new Map();
 for(const r of data.resources.filter(r=>r.schoolId===schoolId)){
  const key=catalogKey(r);if(!map.has(key))map.set(key,{key,name:data.groups?.find(g=>g.id===r.groupId)?.name||r.name,category:data.categories.find(c=>c.id===r.categoryId)?.name||'Sin categoría',rows:[],quantity:0,active:0,reserved:0,states:{},traffic:{},uses:{}});
  const item=map.get(key);item.rows.push(r);item.quantity+=r.quantity;item.active+=r.state==='Activo'?r.quantity:0;item.reserved+=r.reserved||0;item.states[r.state]=(item.states[r.state]||0)+r.quantity;item.traffic[r.trafficStatus||'unclassified']=(item.traffic[r.trafficStatus||'unclassified']||0)+r.quantity;item.uses[r.use]=(item.uses[r.use]||0)+r.quantity;
 }
 return [...map.values()].map(item=>({...item,...priceSummary(item.rows)})).sort((a,b)=>a.category.localeCompare(b.category,'es')||a.name.localeCompare(b.name,'es'));
}
export function schoolSummary(data,id){
 const rows=data.resources.filter(r=>r.schoolId===id),catalog=schoolCatalog(data,id);
 return {school:data.schools.find(s=>s.id===id),catalog,lots:rows.length,products:catalog.length,quantity:rows.reduce((n,r)=>n+r.quantity,0),active:rows.filter(r=>r.state==='Activo').reduce((n,r)=>n+r.quantity,0),reserved:rows.reduce((n,r)=>n+(r.reserved||0),0),categories:new Set(rows.map(r=>r.categoryId)).size,...priceSummary(rows)};
}
const countsEqual=(a,b)=>[...new Set([...Object.keys(a),...Object.keys(b)])].every(k=>(a[k]||0)===(b[k]||0));
export function compareSchools(data,leftId,rightId){
 const left=schoolSummary(data,leftId),right=schoolSummary(data,rightId),l=new Map(left.catalog.map(c=>[c.key,c])),r=new Map(right.catalog.map(c=>[c.key,c]));
 const rows=[...new Set([...l.keys(),...r.keys()])].map(key=>{
  const a=l.get(key),b=r.get(key);const same=!!a&&!!b&&a.quantity===b.quantity&&a.reserved===b.reserved&&a.totalCents===b.totalCents&&a.missingLots===b.missingLots&&countsEqual(a.states,b.states)&&countsEqual(a.traffic,b.traffic)&&countsEqual(a.uses,b.uses);
  return {key,name:(a||b).name,category:(a||b).category,left:a||null,right:b||null,kind:!a?'right_only':!b?'left_only':same?'same':'different',delta:a&&b?b.quantity-a.quantity:null};
 }).sort((a,b)=>a.category.localeCompare(b.category,'es')||a.name.localeCompare(b.name,'es'));
 return {left,right,rows,shared:rows.filter(r=>r.left&&r.right).length,same:rows.filter(r=>r.kind==='same').length,different:rows.filter(r=>r.kind==='different').length,unique:rows.filter(r=>!r.left||!r.right).length};
}
export function selectSchool(selected,id){if(selected.includes(id))return selected.filter(x=>x!==id);return selected.length<2?[...selected,id]:selected;}
