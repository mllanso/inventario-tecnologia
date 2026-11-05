export function initSidebar(){
 const sidebar=document.querySelector('#main-sidebar'),toggle=document.querySelector('#sidebar-toggle');
 if(!sidebar||!toggle)return;
 const key='nexo.sidebar-collapsed.v1';
 const apply=collapsed=>{
  sidebar.hidden=collapsed;
  document.body.classList.toggle('sidebar-collapsed',collapsed);
  toggle.setAttribute('aria-expanded',String(!collapsed));
  const label=collapsed?'Mostrar menú lateral':'Ocultar menú lateral';
  toggle.setAttribute('aria-label',label);toggle.title=label;
  toggle.querySelector('[data-sidebar-label]').textContent=collapsed?'Mostrar menú':'Ocultar menú';
 };
 let collapsed=false;try{collapsed=localStorage.getItem(key)==='true';}catch{}
 apply(collapsed);
 toggle.addEventListener('click',()=>{
  collapsed=!collapsed;apply(collapsed);
  try{localStorage.setItem(key,String(collapsed));}catch{}
 });
}
