import { validateData } from './domain.js?v=20261104-cycles';
import {validatePlanningModel} from './planning-domain.js?v=20261104-cycles';
import {validateTools,validateTool} from './tools-domain.js?v=20261104-cycles';
import {currentCycle} from './annual-domain.js?v=20261104-cycles';
export class CloudInventory {
  constructor(client) { this.client = client; this.revision = null; this.role = null; this.business=null; this.planningV2=false; }
  async call(name,args){
    let timer;try{return await Promise.race([this.client.rpc(name,args),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('La conexión demoró demasiado. Actualizá los datos antes de reintentar.')),20000);})]);}finally{clearTimeout(timer);}
  }
  async load(attempt=0) {
    const cycle=await this.call('nexo_cycle_load',{p_year:this.year||currentCycle()});
    if(!cycle.error){
      if(!cycle.data||!Number.isSafeInteger(cycle.data.revision)||!['admin','coordinator','viewer','requester'].includes(cycle.data.role))throw Error('Respuesta de ciclo incompatible.');
      const inventory=validateData(cycle.data.inventory);this.revision=cycle.data.revision;this.role=cycle.data.role;this.business=cycle.data.business;this.cycle=cycle.data.cycle;this.cycleEnabled=true;this.planningV2=true;this.toolsEnabled=true;return inventory;
    }
    if(cycle.error.code!=='PGRST202')throw cloudError(cycle.error);this.cycleEnabled=false;this.cycle=null;
    const {data,error} = await this.call('nexo_load');
    if (error) throw cloudError(error);
    if (!data || !Number.isSafeInteger(data.revision) || !['viewer','coordinator','admin','requester'].includes(data.role)) throw Error('Respuesta de Supabase no compatible.');
    const inventory = validateData(structuredClone(data.inventory));
    const planning=await this.call('nexo_planning_load');
    let planningV2=false;
    if(planning.error){if(planning.error.code!=='PGRST202')throw cloudError(planning.error);delete inventory.planning2027;}
    else {
      if(planning.data?.revision!==data.revision){if(attempt<2)return this.load(attempt+1);throw Error('El inventario cambió durante la lectura. Actualizá los datos.');}
      inventory.planning2027=validatePlanningModel(planning.data.model);planningV2=true;
    }
    const tools=await this.call('nexo_tools_load');let toolsEnabled=false;
    if(tools.error){if(tools.error.code!=='PGRST202')throw cloudError(tools.error);delete inventory.schoolTools;}
    else {
      if(tools.data?.revision!==data.revision){if(attempt<2)return this.load(attempt+1);throw Error('El catálogo cambió durante la lectura. Actualizá los datos.');}
      inventory.schoolTools=validateTools(tools.data.items);toolsEnabled=true;
    }
    this.toolsEnabled=toolsEnabled;
    this.revision = data.revision; this.role = data.role;
    this.business=data.business||null;
    this.planningV2=planningV2;
    return inventory;
  }
  async savePlanning(model){
    if(this.cycle?.readOnly)throw Error('El ciclo seleccionado está cerrado para edición.');
    validatePlanningModel(model);
    if(!this.planningV2||!['admin','coordinator'].includes(this.role))throw Error('Necesitás la actualización del plan y permiso de edición.');
    const {data,error}=await this.call('nexo_planning_save',{p_model:model,p_expected_revision:this.revision});
    if(error)throw cloudError(error);if(!Number.isSafeInteger(data?.revision))throw Error('No se pudo confirmar el guardado del plan.');this.revision=data.revision;
  }
  async restore(inventory){
    if(this.cycle?.readOnly)throw Error('El ciclo seleccionado está cerrado para edición.');
    validateData(inventory);
    if(inventory.schoolTools!==undefined&&!this.toolsEnabled)throw Error('Activá primero supabase/school-tools.sql para restaurar también las herramientas.');
    if(!['admin','coordinator'].includes(this.role))throw Error('Tu cuenta tiene acceso de lectura.');
    const {data,error}=await this.call(this.cycleEnabled?'nexo_restore_with_cycles':this.toolsEnabled?'nexo_restore_with_tools':'nexo_restore_with_planning',{p_inventory:inventory,p_expected_revision:this.revision});
    if(error)throw cloudError(error);if(!Number.isSafeInteger(data?.revision))throw Error('No se pudo confirmar la restauración.');this.revision=data.revision;
  }
  async save(inventory) {
    if(this.cycle?.readOnly)throw Error('El ciclo seleccionado está cerrado para edición.');
    validateData(inventory);
    if (this.revision === null) throw Error('Primero actualizá el inventario desde Supabase.');
    if (!['coordinator','admin'].includes(this.role)) throw Error('Tu cuenta tiene acceso de lectura.');
    const {schoolTools,cycleDetails,...core}=inventory;
    const {data,error} = await this.call(this.cycleEnabled?'nexo_cycle_save_inventory':'nexo_save', {p_inventory: core, p_expected_revision: this.revision});
    if (error) throw cloudError(error);
    if (!data || !Number.isSafeInteger(data.revision)) throw Error('No se pudo confirmar el guardado. Actualizá el inventario antes de reintentar.');
    this.revision = data.revision;
  }
  async saveTool(action,tool){
    if(this.cycle?.readOnly)throw Error('El ciclo seleccionado está cerrado para edición.');
    if(!this.toolsEnabled||!['admin','coordinator'].includes(this.role))throw Error('Necesitás activar las herramientas y tener permiso de edición.');
    if(action==='upsert')validateTool(tool);
    const {data,error}=await this.call('nexo_tool_save',{p_action:action,p_tool:tool,p_expected_revision:this.revision});
    if(error)throw cloudError(error);if(!Number.isSafeInteger(data?.revision))throw Error('No se pudo confirmar el guardado de la herramienta.');this.revision=data.revision;
  }
  async cycleAction(action,payload){
    if(!this.cycleEnabled||this.cycle?.readOnly)throw Error('El ciclo no está habilitado para edición.');
    const {data,error}=await this.call('nexo_cycle_action',{p_action:action,p_payload:payload,p_year:this.year||currentCycle(),p_expected_revision:this.revision});
    if(error)throw cloudError(error);if(!Number.isSafeInteger(data?.revision))throw Error('Guardado no confirmado.');this.revision=data.revision;
  }
}
export function cloudError(error) {
  const message = String(error?.message || 'No hay conexión con Supabase.');
  if(message.includes('nexo_cycle'))return Error('Ejecutá supabase/annual-cycles.sql para activar los ciclos y reportes.');
  if (message.includes('NEXO_CONFLICT')) return Error('Otra persona modificó el inventario. Tus cambios no se guardaron. Usá “Actualizar datos” y volvé a aplicar la edición.');
  if (message.includes('NEXO_UPGRADE_REQUIRED')) return Error('Hay planificación 2027 guardada. Actualizá los archivos de la aplicación para conservarla antes de editar.');
  if (message.includes('NEXO_BUSINESS_UPGRADE')) return Error('Actualizá los archivos de la aplicación para conservar contratos, agrupaciones y movimientos.');
  if (message.includes('NEXO_FORBIDDEN')) return Error('Tu usuario no tiene acceso autorizado. Pedile al administrador que lo agregue a nexo_members.');
  if(message.includes('nexo_tool')||message.includes('nexo_restore_with_tools'))return Error('Falta activar las herramientas: ejecutá supabase/school-tools.sql y actualizá los datos.');
  if(message.includes('nexo_planning')||message.includes('nexo_restore_with_planning'))return Error('Falta activar el nuevo plan: ejecutá supabase/planning-2027-v2.sql y actualizá los datos.');
  if (message.includes('nexo_business')) return Error('Falta activar los módulos de gestión: ejecutá supabase/business.sql en SQL Editor.');
  if (error?.code === 'PGRST202' || message.includes('nexo_load') || message.includes('nexo_save')) return Error('Falta instalar la base de datos: ejecutá supabase/setup.sql en el SQL Editor del proyecto.');
  if (message.includes('Invalid login credentials')) return Error('El correo o la contraseña no son correctos.');
  if (message.includes('Email not confirmed')) return Error('El correo de la cuenta todavía no está confirmado.');
  return Error(message);
}

