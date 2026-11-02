import { validateData } from './domain.js?v=20261102-business';
export class CloudInventory {
  constructor(client) { this.client = client; this.revision = null; this.role = null; this.business=null; }
  async call(name,args){
    let timer;try{return await Promise.race([this.client.rpc(name,args),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('La conexión demoró demasiado. Actualizá los datos antes de reintentar.')),20000);})]);}finally{clearTimeout(timer);}
  }
  async load() {
    const {data,error} = await this.call('nexo_load');
    if (error) throw cloudError(error);
    if (!data || !Number.isSafeInteger(data.revision) || !['viewer','coordinator','admin','requester'].includes(data.role)) throw Error('Respuesta de Supabase no compatible.');
    const inventory = validateData(data.inventory);
    this.revision = data.revision; this.role = data.role;
    this.business=data.business||null;
    return inventory;
  }
  async save(inventory) {
    validateData(inventory);
    if (this.revision === null) throw Error('Primero actualizá el inventario desde Supabase.');
    if (!['coordinator','admin'].includes(this.role)) throw Error('Tu cuenta tiene acceso de lectura.');
    const {data,error} = await this.call('nexo_save', {p_inventory: inventory, p_expected_revision: this.revision});
    if (error) throw cloudError(error);
    if (!data || !Number.isSafeInteger(data.revision)) throw Error('No se pudo confirmar el guardado. Actualizá el inventario antes de reintentar.');
    this.revision = data.revision;
  }
}
export function cloudError(error) {
  const message = String(error?.message || 'No hay conexión con Supabase.');
  if (message.includes('NEXO_CONFLICT')) return Error('Otra persona modificó el inventario. Tus cambios no se guardaron. Usá “Actualizar datos” y volvé a aplicar la edición.');
  if (message.includes('NEXO_UPGRADE_REQUIRED')) return Error('Hay planificación 2027 guardada. Actualizá los archivos de la aplicación para conservarla antes de editar.');
  if (message.includes('NEXO_BUSINESS_UPGRADE')) return Error('Actualizá los archivos de la aplicación para conservar contratos, agrupaciones y movimientos.');
  if (message.includes('NEXO_FORBIDDEN')) return Error('Tu usuario no tiene acceso autorizado. Pedile al administrador que lo agregue a nexo_members.');
  if (message.includes('nexo_business')) return Error('Falta activar los módulos de gestión: ejecutá supabase/business.sql en SQL Editor.');
  if (error?.code === 'PGRST202' || message.includes('nexo_load') || message.includes('nexo_save')) return Error('Falta instalar la base de datos: ejecutá supabase/setup.sql en el SQL Editor del proyecto.');
  if (message.includes('Invalid login credentials')) return Error('El correo o la contraseña no son correctos.');
  if (message.includes('Email not confirmed')) return Error('El correo de la cuenta todavía no está confirmado.');
  return Error(message);
}
