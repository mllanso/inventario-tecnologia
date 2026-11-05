import {movementName} from './insights-domain.js?v=20261105-insights';
// PDF vectorial con gráficos capturados del informe aplicado y tablas paginadas.
export function exportInsightsPDF(report,charts,PDF=globalThis.jspdf?.jsPDF){
 if(!PDF)throw Error('No se cargó jsPDF. Recargá la página y reintentá.');
 const doc=new PDF({orientation:'landscape',unit:'mm',format:[297,167]}),w=297;
 const page=(title,first=false)=>{if(!first)doc.addPage([297,167],'landscape');doc.setFillColor(17,43,42);doc.rect(0,0,w,24,'F');doc.setTextColor(255);doc.setFontSize(17);doc.text(title,14,16);doc.setTextColor(32,55,53);};
 const text=(s,x,y,size=11)=>{doc.setFontSize(size);doc.text(String(s),x,y);};
 const schools=report.filters.schools.map(report.schoolName).join(', ')||'Todas las instituciones autorizadas';
 page('NEXO | Resumen ejecutivo',true);text(`${report.filters.from} al ${report.filters.to} | Ciclo ${report.year}`,14,37,13);
 text(`${report.filters.schools.length||'Todas las'} instituciones autorizadas · ${report.filters.resources.length||'Todos los'} recursos`,14,49);
 const scope=report.resourceLabels?.join(', ')||'Todos los recursos';text('Los filtros completos se incluyen en las diapositivas siguientes.',14,64,10);
 const metrics=[['Entradas',report.incoming],['Salidas',report.outgoing],['Variación neta',report.net],['Registros',report.rows.length]];
 metrics.forEach(([label,n],i)=>{const x=14+i*69;doc.setFillColor(235,244,239);doc.roundedRect(x,92,64,34,3,3,'F');text(label,x+5,103,10);text(Number(n).toLocaleString('es-AR'),x+5,118,19);});
 text('Actividad registrada: no representa stock ni adquisiciones netas.',14,140,10);
 text('Los traslados pueden generar salida en origen y entrada en destino.',14,147,10);
 text('Cobertura limitada a la bitácora disponible; datos al '+report.cutoff+'.',14,154,9);
 page('Alcance y filtros aplicados');let scopeY=36;for(const paragraph of ['Instituciones: '+schools,'Recursos: '+scope,'Distribución: '+(report.filters.distribution==='resources'?'por recurso':'por institución')]){for(const line of doc.splitTextToSize(paragraph,266)){if(scopeY>149){page('Alcance y filtros · continuación');scopeY=36;}text(line,14,scopeY,11);scopeY+=6;}scopeY+=8;}
 for(const [title,canvas]of charts){page(title);doc.addImage(canvas.toDataURL('image/png'),'PNG',14,31,269,116);}
 const headers=['Fecha','Recurso','Institución','Cambio','Operación / Usuario'];const xs=[14,46,129,218,242],widths=[29,80,86,21,40];let y=0;
 const tablePage=()=>{page('Detalle de movimientos');y=35;headers.forEach((h,i)=>text(h,xs[i],y,10));y+=9;};tablePage();
 if(!report.rows.length)text('Sin movimientos para los filtros aplicados.',14,y);
 for(const m of report.rows){const values=[new Date(m.created_at).toLocaleDateString('es-AR',{timeZone:'America/Argentina/Buenos_Aires'}),m.resource_name,report.schoolName(m.school_id),Number(m.delta),movementName(m.kind)+' · '+(m.actor_name||'Sin dato')];const lines=values.map((v,i)=>doc.splitTextToSize(String(v??''),widths[i]));const height=Math.max(...lines.map(l=>l.length))*4+5;if(y+height>151)tablePage();lines.forEach((l,i)=>text(l,xs[i],y,9));y+=height;}
 const count=doc.getNumberOfPages();for(let i=1;i<=count;i++){doc.setPage(i);doc.setTextColor(100);text(`Nexo · ${i}/${count}`,269,162,8);}
 doc.save(`nexo-presentacion-${report.filters.to}.pdf`);return doc;
}
