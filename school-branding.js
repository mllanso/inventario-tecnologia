export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const SCHOOL_BRANDS=[
 {id:'northfield-puertos',name:'Northfield · Puertos',file:'northfield-puertos.png',color:'#ee6419'},
 {id:'northfield-nordelta',name:'Northfield · Nordelta',file:'northfield-nordelta.png',color:'#ee6419'},
 {id:'lighthouse',name:'Lighthouse School',file:'lighthouse.png',color:'#82a824'},
 {id:'faro-benavidez',name:'Colegio del Faro · Benavídez',file:'faro-benavidez.png',color:'#149581'},
 {id:'faro-escobar',name:'Colegio del Faro · Escobar',file:'faro-escobar.png',color:'#149581'}
];
export function schoolBrand(school){
 const name=normalize(school?.name),place=normalize(school?.location),tokens=` ${name} ${place} `;
 let id;
 if(name.includes('northfield')){if(/\bnordelta\b/.test(tokens))id='northfield-nordelta';else if(/\bpuertos\b/.test(tokens))id='northfield-puertos';}
 else if(name.includes('lighthouse')||name.includes('light house'))id='lighthouse';
 else if(/\bfaro\b|\bcdf\b/.test(name)){if(/\bbenavide[sz]\b/.test(tokens))id='faro-benavidez';else if(/\bescobar\b/.test(tokens))id='faro-escobar';}
 return SCHOOL_BRANDS.find(b=>b.id===id)||null;
}
export function schoolLogo(school,size='small'){
 const brand=schoolBrand(school),initials=String(school?.name||'Colegio').trim().split(/\s+/).filter(Boolean).slice(0,2).map(w=>Array.from(w)[0]).join('').toUpperCase();
 return `<span class="school-logo school-logo--${size}" aria-hidden="true">${brand?`<img src="assets/schools/${brand.file}" alt="" loading="lazy" decoding="async">`:`<span>${escapeHTML(initials)}</span>`}</span>`;
}
export function schoolIdentity(school){return `<span class="school-identity">${schoolLogo(school)}<span>${escapeHTML(school?.name||'Colegio')}</span></span>`;}
// Aplica la misma identidad a tablas, filtros y paneles renderizados por los módulos.
// Conserva etiquetas, valores, campos editables y textos exportados.
export function brandSchoolNames(root,schools){
 const names=new Map(schools.map(s=>[s.name.trim(),s]));if(!names.size)return;
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),pending=[];let node;
 while((node=walker.nextNode())){const parent=node.parentElement;if(!parent||parent.closest('.school-identity,.school-logo,[data-explorer-root],select,option,textarea,script,style,button,h1,h2,h3'))continue;const school=names.get(node.textContent.trim());if(school)pending.push([node,school]);}
 for(const [text,school]of pending){const span=document.createElement('span');span.innerHTML=schoolIdentity(school);text.replaceWith(span.firstElementChild);}
}
