export const currentCycle=()=>Number(new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'America/Argentina/Buenos_Aires'}).format(new Date()));
export function cycleEnd(year){if(!Number.isInteger(Number(year))||year<2000||year>2100)throw Error('Ciclo inválido.');return `${year}-12-31`;}
export function valuation(resources,categories=[]){
 const groups=new Map();let total=0,missing=0;
 for(const r of resources){const category=r.assetKind||'Sin clasificar',state=r.valuationState||'Sin clasificar',key=category+'|'+state;if(!groups.has(key))groups.set(key,{category,state,quantity:0,cents:0,missing:0});const group=groups.get(key);group.quantity+=r.quantity;if(r.unitPrice==null){missing++;group.missing++;}else{const cents=Math.round(r.unitPrice*100)*r.quantity;total+=cents;group.cents+=cents;}}
 return {total,missing,groups:[...groups.values()]};
}
export function approvalMetrics(requests,events=[],estimates={}){
 const accepted=new Set(['approved','purchasing','partial','completed']);let yes=0,no=0,pending=0,avoided=0n,unpriced=0;
 const sites=new Map();for(const q of requests){if(!sites.has(q.school_id))sites.set(q.school_id,{id:q.school_id,accepted:0,rejected:0,pending:0});const s=sites.get(q.school_id);if(accepted.has(q.status)){yes++;s.accepted++;}else if(q.status==='rejected'){no++;s.rejected++;const cost=estimates[q.id];if(cost==null)unpriced++;else avoided+=BigInt(cost);}else if(q.status!=='cancelled'){pending++;s.pending++;}}
 return {accepted:yes,rejected:no,acceptedUnits:requests.filter(q=>accepted.has(q.status)).reduce((s,q)=>s+q.quantity,0),rejectedUnits:requests.filter(q=>q.status==='rejected').reduce((s,q)=>s+q.quantity,0),pending,rate:yes+no?yes/(yes+no)*100:null,avoided,unpriced,sites:[...sites.values()],audit:events.filter(e=>['approved','rejected'].includes(e.new_status)).map(e=>({...e,request:requests.find(q=>q.id===e.request_id)})).filter(e=>e.request)};
}
export function executedBudget(business,schoolId,year){const seen=new Set();return (business?.receipts||[]).filter(r=>new Date(r.created_at).toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'}).startsWith(String(year))&&(!schoolId||business.requests.some(q=>q.id===r.request_id&&q.school_id===schoolId))).reduce((sum,r)=>{if(seen.has(r.contract_id))return sum;seen.add(r.contract_id);return sum+BigInt(business.contracts.find(c=>c.id===r.contract_id)?.total_cents||0);},0n);}
export const localDay=date=>new Date(date).toLocaleDateString('en-CA',{timeZone:'America/Argentina/Buenos_Aires'});
export function cycleFinancialReport(data,business,year,filters){
 const {from,to,school='',status=''}=filters;if(from>to||from<`${year}-01-01`||to>cycleEnd(year))throw Error('Elegí fechas dentro del ciclo seleccionado.');
 const firstDay=(business.movements||[]).map(m=>localDay(m.created_at)).sort()[0];if(firstDay&&to<firstDay)throw Error('No hay bitácora verificable para esa fecha de corte. El registro comienza el '+firstDay+'.');
 const movements=(business.movements||[]).filter(m=>localDay(m.created_at)<=to),costs=[];
 for(const contract of business.contracts||[]){if(localDay(contract.created_at)>to||contract.starts_on&&contract.starts_on>to||contract.ends_on&&contract.ends_on<to||contract.retired_at&&localDay(contract.retired_at)<=to)continue;const allocations=new Map();for(const m of movements.filter(m=>m.contract_id===contract.id)){const key=m.school_id+'|'+m.traffic_status;if(!allocations.has(key))allocations.set(key,{schoolId:m.school_id,status:m.traffic_status,units:0});allocations.get(key).units+=Number(m.delta);}
  const slots=[...allocations.values()].filter(a=>a.units>0);const assigned=slots.reduce((s,a)=>s+a.units,0),capacity=Number(contract.capacity),total=BigInt(contract.total_cents);
  if(assigned>capacity)throw Error('El contrato supera su capacidad en la fecha de corte.');if(assigned<capacity)slots.push({schoolId:null,status:'unassigned',units:capacity-assigned});
  for(const a of slots){const n=total*BigInt(a.units);a.cents=n/BigInt(capacity);a.remainder=n%BigInt(capacity);}
  const tie=(a,b)=>a.schoolId==null?b.schoolId==null?0:1:b.schoolId==null?-1:a.schoolId===b.schoolId?a.status<b.status?-1:a.status>b.status?1:0:a.schoolId<b.schoolId?-1:1;
  let remaining=total-slots.reduce((s,a)=>s+a.cents,0n);for(const a of [...slots].sort((a,b)=>a.remainder===b.remainder?tie(a,b):a.remainder>b.remainder?-1:1)){if(remaining>0n){a.cents++;remaining--;}}
  for(const a of slots)if((!school||a.schoolId===school)&&(!status||a.status===status)){const site=data.schools.find(s=>s.id===a.schoolId);costs.push({...a,cents:String(a.cents),contractId:contract.id,contract:contract.name,capacity,contractCents:String(total),school:site?site.name+(site.costCenter?' / '+site.costCenter:''):'Central / Sin asignar'});}
 }
 const requestStatus=q=>q.status==='submitted'?'required':['review','approved','purchasing','partial'].includes(q.status)?'in_progress':q.status==='completed'?'available':'closed';
 return {from,to,mode:`Ciclo ${year}: distribución contractual al corte ${to}.`,inventoryValuation:valuation(data.resources.filter(r=>!school||r.schoolId===school)),costs,requests:(business.requests||[]).filter(q=>localDay(q.created_at)>=from&&localDay(q.created_at)<=to&&(!school||q.school_id===school)&&(!status||requestStatus(q)===status)),movements:movements.filter(m=>localDay(m.created_at)>=from&&(!school||m.school_id===school)&&(!status||m.traffic_status===status))};
}
