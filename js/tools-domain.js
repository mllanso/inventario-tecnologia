import {normalize} from './school-branding.js?v=20261105-layout';
export const TOOL_STATES=[{id:'available',name:'Disponible',tone:'green'},{id:'in_progress',name:'En proceso',tone:'amber'},{id:'required',name:'Requerida / Pendiente',tone:'red'}];
export const MAX_LOGO_LENGTH=160000;
const text=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.length<=max;
export function validToolURL(value){if(value==='')return true;try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password;}catch{return false;}}
export function validateTool(tool){
 if(tool?.provider!=null&&(typeof tool.provider!=='string'||tool.provider.length>120)||tool?.licences!=null&&(!Number.isInteger(tool.licences)||tool.licences<0||tool.licences>1000000)||tool?.unitCostCents!=null&&(!Number.isSafeInteger(tool.unitCostCents)||tool.unitCostCents<0||tool.unitCostCents>1000000000))throw Error('Revisá proveedor, licencias y costo por usuario.');
 if(!tool||!text(tool.id,120)||!text(tool.schoolId,120)||!text(tool.name,120)||!text(tool.category,80)||typeof tool.description!=='string'||tool.description.length>2000||typeof tool.notes!=='string'||tool.notes.length>1000||typeof tool.website!=='string'||tool.website.length>500||!validToolURL(tool.website)||!TOOL_STATES.some(s=>s.id===tool.status))throw Error('Revisá nombre, categoría, información, estado y enlace HTTPS de la herramienta.');
 if(typeof tool.logo!=='string'||tool.logo.length>MAX_LOGO_LENGTH||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(tool.logo)||!tool.logo.startsWith('data:image/png;base64,iVBORw0KGgo'))throw Error('Cargá una imagen PNG, JPG o WebP válida para el logo.');
 return tool;
}
export function validateTools(tools){
 if(!Array.isArray(tools)||tools.length>100)throw Error('El catálogo admite hasta 100 fichas de herramientas.');
 const ids=new Set(),names=new Set();for(const tool of tools){validateTool(tool);const key=tool.schoolId+'\0'+normalize(tool.name);if(ids.has(tool.id)||names.has(key))throw Error('Ya hay una herramienta con ese nombre en la sede.');ids.add(tool.id);names.add(key);}return tools;
}
export function compareTools(tools,leftId,rightId){
 const left=tools.filter(t=>t.schoolId===leftId),right=tools.filter(t=>t.schoolId===rightId),map=new Map();
 for(const t of left)map.set(normalize(t.name),{name:t.name,left:t,right:null});
 for(const t of right){const key=normalize(t.name);if(!map.has(key))map.set(key,{name:t.name,left:null,right:null});map.get(key).right=t;}
 return [...map.values()].map(row=>({...row,same:!!row.left&&!!row.right&&['status','category','description','website','notes'].every(k=>row.left[k]===row.right[k])})).sort((a,b)=>a.name.localeCompare(b.name,'es'));
}
