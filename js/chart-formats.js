export function chartFormat(config,style){
 const circular=['pie','doughnut'].includes(style),horizontal=style==='horizontal';
 const options={...config.options};
 options.plugins={...options.plugins,legend:{...options.plugins?.legend,display:circular||config.data.datasets.length>1}};
 if(circular){delete options.scales;delete options.indexAxis;options.cutout=style==='pie'?0:'70%';}
 else{
  delete options.cutout;
  options.indexAxis=horizontal?'y':'x';
  const originalHorizontal=config.options?.indexAxis==='y',scales=config.options?.scales||{};
  const numeric={...(scales[originalHorizontal?'x':'y']||{}),beginAtZero:true,stacked:false};
  const category={...(scales[originalHorizontal?'y':'x']||{}),stacked:false};
  category.ticks={...category.ticks};delete category.ticks.callback;
  options.scales=horizontal?{x:numeric,y:category}:{x:category,y:numeric};
 }
 return {...config,type:horizontal?'bar':style,options,data:{...config.data,datasets:config.data.datasets.map(d=>({...d,borderColor:Array.isArray(d.backgroundColor)?d.backgroundColor[0]:d.backgroundColor,borderWidth:style==='line'?2:circular?3:0,fill:false}))}};
}
export function selectableChart(canvas,config){
 const round=['pie','doughnut'].includes(config.type);
 const choices=round?[['doughnut','Anillo'],['pie','Circular'],['bar','Barras']]:[['bar','Barras verticales'],['horizontal','Barras horizontales'],['line','Líneas']];
 const key='nexo.chart-format.'+canvas.id;
 let style=round?config.type:config.type==='line'?'line':config.options?.indexAxis==='y'?'horizontal':'bar';
 try{const saved=localStorage.getItem(key);if(choices.some(([id])=>id===saved))style=saved;}catch{}
 const panel=canvas.closest('article,section'),old=panel.querySelector('[data-chart-format="'+canvas.id+'"]');old?.remove();
 const label=document.createElement('label');label.className='chart-format';label.dataset.chartFormat=canvas.id;label.append('Formato de gráfico ');
 const select=document.createElement('select');select.setAttribute('aria-label','Formato: '+canvas.getAttribute('aria-label'));
 for(const [id,name]of choices){const option=document.createElement('option');option.value=id;option.textContent=name;select.append(option);}select.value=style;label.append(select);canvas.parentElement.before(label);
 let instance;
 const draw=()=>{instance?.destroy();instance=new globalThis.Chart(canvas,chartFormat(config,style));const center=canvas.parentElement.querySelector('.donut-center');if(center)center.hidden=style!=='doughnut';};
 draw();select.onchange=()=>{style=select.value;try{localStorage.setItem(key,style);}catch{}draw();};
 return {destroy(){instance?.destroy();label.remove();},toBase64Image(...args){return instance.toBase64Image(...args);}};
}
