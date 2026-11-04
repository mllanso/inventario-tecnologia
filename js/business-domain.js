import {normalize} from './school-branding.js?v=20261104-cards';
export function resourceGroupImage(group,data){
 const safe=src=>typeof src==='string'&&src.length<=160000&&/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(src);
 const siblings=data.resources.filter(r=>(r.groupId||'lot:'+r.id)===group.id);
 const images=[...group.rows,...siblings].flatMap(r=>r.images||[]);
 const tools=(data.schoolTools||[]).filter(t=>group.rows.some(r=>r.schoolId===t.schoolId)&&normalize(t.name)===normalize(group.name));
 return images.find(safe)||tools.map(t=>t.logo).find(safe)||null;
}
export const TRAFFIC = [
 {id:'available',label:'Verde',legend:'Actual / Implementado / Disponible',tone:'green'},
 {id:'in_progress',label:'Amarillo',legend:'En proceso / En ejecución',tone:'amber'},
 {id:'required',label:'Rojo',legend:'Faltante / Requerido / Pendiente',tone:'red'},
 {id:'unclassified',label:'Sin clasificar',legend:'Revisar clasificación inicial',tone:'neutral'}
];
export const REQUEST_STATES={submitted:'Enviada',review:'En revisión',approved:'Aprobada',purchasing:'En compra',partial:'Entrega parcial',completed:'Completada / Activada',rejected:'Rechazada',cancelled:'Cancelada'};
export const TRANSFER_STATES={pending:'Transferencia pendiente',accepted:'Recepción aceptada',rejected:'Rechazada',cancelled:'Cancelada'};
export function requestColor(status){return status==='submitted'?'required':['review','approved','purchasing','partial'].includes(status)?'in_progress':status==='completed'?'available':'closed';}
export function trafficOf(resource){return resource.trafficStatus||'unclassified';}
export function groupResources(rows,all,groups=[]){
 const map=new Map();for(const r of rows){const key=r.groupId||'lot:'+r.id;if(!map.has(key))map.set(key,{id:key,name:groups.find(g=>g.id===key)?.name||r.name,rows:[],quantity:0,total:all.filter(x=>(x.groupId||'lot:'+x.id)===key).reduce((n,x)=>n+x.quantity,0)});const g=map.get(key);g.rows.push(r);g.quantity+=r.quantity;}
 return [...map.values()];
}
export function usd(cents){if(cents==null)return 'Sin precio';const value=BigInt(cents);const a=value<0n?-value:value;return (value<0n?'-':'')+'USD '+(a/100n).toLocaleString('es-AR')+','+(a%100n).toString().padStart(2,'0');}
export function centsFromInput(value){
 const text=String(value).trim().replace(',','.');if(!/^\d+(\.\d{1,2})?$/.test(text))throw Error('El importe debe ser positivo o cero, con hasta dos decimales.');
 const [whole,fraction='']=text.split('.');const result=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 if(result>1000000000000000n)throw Error('El importe supera el límite permitido.');return Number(result);
}
export function reportSheets(report,schools=[]){
 const school=id=>schools.find(s=>s.id===id)?.name||id||'Central';
 return [
 ...(report.inventoryValuation?[{name:'Valoración inventario',headers:['Categoría patrimonial','Estado patrimonial','Unidades','Valor USD','Lotes sin precio'],rows:report.inventoryValuation.groups.map(g=>[g.category,g.state,g.quantity,g.cents/100,g.missing])}]:[]),
 {name:'Imputación USD',headers:['Contrato','Sede / Centro de costo','Estado','Unidades','Capacidad','Importe imputado USD','Costo contrato USD'],rows:report.costs.map(c=>[c.contract,c.school,c.status,c.units,c.capacity,Number(c.cents)/100,Number(c.contractCents)/100])},
 {name:'Solicitudes',headers:['ID','Recurso','Sede','Estado','Semáforo','Solicitadas','Recibidas','Pendientes','Fecha','Motivo','Solicitante'],rows:report.requests.map(r=>[r.id,r.name,school(r.school_id),REQUEST_STATES[r.status],requestColor(r.status),r.quantity,r.received,r.quantity-r.received,r.created_at,r.reason,r.requester_name])},
 {name:'Movimientos',headers:['Fecha','Recurso','Sede','Unidades (+/-)','Estado','Operación','Motivo','Usuario','Referencia'],rows:report.movements.map(m=>[m.created_at,m.resource_name,school(m.school_id),m.delta,m.traffic_status,m.kind,m.reason,m.actor_name,m.reference||''])}
 ];
}
export async function exportReportXLSX(report,schools,download,ExcelJS=globalThis.ExcelJS){
 if(!ExcelJS)throw Error('No se cargó ExcelJS. Revisá la conexión y recargá.');
 const workbook=new ExcelJS.Workbook();workbook.creator='Nexo';workbook.created=new Date();
 const cover=workbook.addWorksheet('Alcance');cover.addRows([['Nexo · Reporte de gestión'],['Desde',report.from],['Hasta',report.to],['Sede',report.schoolFilter||'Todas'],['Semáforo',report.statusFilter||'Todos'],['Criterio',report.mode],['Imputación', 'Foto a fecha de corte. No representa gasto devengado ni amortización del período.'],['Zona horaria','America/Argentina/Buenos_Aires']]);cover.getColumn(1).width=24;cover.getColumn(2).width=100;
 for(const sheet of reportSheets(report,schools)){
  const ws=workbook.addWorksheet(sheet.name);ws.addRow(sheet.headers);ws.addRows(sheet.rows);ws.views=[{state:'frozen',ySplit:1}];
  ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF147C69'}};
  ws.columns.forEach((c,i)=>{c.width=i===0?27:24;if(sheet.headers[i].includes('USD'))c.numFmt='#,##0.00';});
  ws.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,ws.rowCount),column:sheet.headers.length}};
 }
 const buffer=await workbook.xlsx.writeBuffer();download(buffer,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',`nexo-reporte-${report.to}.xlsx`);
}
export function exportReportPDF(report,schools,JsPDF=globalThis.jspdf?.jsPDF){
 if(!JsPDF)throw Error('No se cargó jsPDF. Revisá la conexión y recargá.');
 const doc=new JsPDF();let y=24;const page=()=>{doc.addPage();y=24;};
 const write=(value,size=10,bold=false)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);for(const line of doc.splitTextToSize(String(value),170)){if(y>272)page();doc.text(line,20,y);y+=size*.5+1;}y+=3;};
 doc.setTextColor(25,65,51);write('NEXO · Reporte de gestión',18,true);write(`${report.from} al ${report.to}`,12,true);write(`Sede: ${report.schoolFilter||'Todas'} | Semáforo: ${report.statusFilter||'Todos'}`,10);
 write(report.mode);write('Costos: distribución a fecha de corte. No es gasto devengado ni amortización del período.',9);
 if(report.inventoryValuation)write('Valor del inventario: '+usd(report.inventoryValuation.total)+(report.inventoryValuation.missing?' (parcial; faltan precios)':''),12,true);
 write('Total imputado de la selección: '+usd(report.costs.reduce((n,r)=>n+BigInt(r.cents),0n)),13,true);
 for(const sheet of reportSheets(report,schools)){page();write(sheet.name,16,true);if(!sheet.rows.length)write('Sin registros para los filtros elegidos.');for(const row of sheet.rows)write(row.map((v,i)=>`${sheet.headers[i]}: ${v??''}`).join(' | '),9);}
 const n=doc.getNumberOfPages();for(let p=1;p<=n;p++){doc.setPage(p);doc.setFontSize(8);doc.text(`Nexo · ${p} / ${n}`,170,287);}doc.save(`nexo-reporte-${report.to}.pdf`);
}

