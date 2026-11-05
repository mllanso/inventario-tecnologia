export class DebouncedSave{
 constructor({save,status,delay=5000,setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id)}){Object.assign(this,{save,status,delay,setTimer,clearTimer});this.version=0;this.saved=0;this.timer=null;this.running=null;this.value='';}
 edit(value){this.value=value;this.version++;this.status('Escribiendo...');this.clearTimer(this.timer);const version=this.version;queueMicrotask(()=>{if(this.version===version)this.status('Esperando para guardar...');});this.timer=this.setTimer(()=>this.flush().catch(()=>{}),this.delay);}
 pending(){return this.saved!==this.version;}
 async flush(){this.clearTimer(this.timer);if(this.running){await this.running;if(this.pending())return this.flush();return;}if(!this.pending())return;
  const version=this.version,value=this.value;this.status('Guardando cambios...');
  this.running=(async()=>{try{await this.save(value);this.saved=version;if(this.version===version)this.status('Guardado automáticamente a las '+new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'America/Argentina/Buenos_Aires'})+' ✓');}catch(error){this.status('No se guardó: '+error.message);throw error;}finally{this.running=null;}})();await this.running;
 }
}
export class ObservationSaves{
 constructor(save,namespace=()=> ''){this.save=save;this.namespace=namespace;this.entries=new Map();window.addEventListener('beforeunload',e=>{if(this.pending()){this.flush().catch(()=>{});e.preventDefault();e.returnValue='';}});}
 pending(){return [...this.entries.values()].some(e=>e.pending());}
 bind(input,key){
  const namespace=this.namespace(),storageKey='nexo.note.'+namespace+key;
  let entry=this.entries.get(key);if(!entry){entry=new DebouncedSave({save:async value=>{if(this.namespace()!==namespace)throw Error('La sesión o el ciclo cambió.');await this.save(key,value);try{sessionStorage.removeItem(storageKey);}catch{}},status:text=>{input.parentElement.querySelector('[data-save-status]')?.replaceChildren(document.createTextNode(text));}});this.entries.set(key,entry);}
  entry.status=text=>{entry.message=text;if(input.isConnected)input.parentElement.querySelector('[data-save-status]')?.replaceChildren(document.createTextNode(text));};if(entry.message)entry.status(entry.message);
  let recovered;try{recovered=sessionStorage.getItem(storageKey);}catch{}if(recovered!==null&&recovered!==undefined&&!entry.pending()&&recovered!==input.value){input.value=recovered;entry.edit(recovered);}
  if(entry.pending())input.value=entry.value;
  input.oninput=()=>{try{sessionStorage.setItem(storageKey,input.value);}catch{}entry.edit(input.value);};input.onblur=()=>entry.flush().catch(()=>{});
 }
 async flush(){for(const entry of this.entries.values())await entry.flush();}
 clear(){for(const entry of this.entries.values())entry.clearTimer(entry.timer);this.entries.clear();}
}
