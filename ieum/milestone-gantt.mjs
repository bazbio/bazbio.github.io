const DAY=86400000;
const day=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;const n=Date.parse(value+'T00:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===value?n/DAY:null;};
const iso=n=>new Date(n*DAY).toISOString().slice(0,10);
const short=n=>{const d=new Date(n*DAY);return `${d.getUTCMonth()+1}.${String(d.getUTCDate()).padStart(2,'0')}`;};
export function ganttModel(data,source='latest',today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})){
 const active=(data.통합계획||[]).find(p=>p.ID===data.유효통합계획ID)||null;
 const useActive=source==='approved'&&active;
 const groups=(data.부서업무||[]).map(b=>{
  const plan=b.계획?.[0],scope=active?.범위?.find(s=>s.부서업무ID===b.ID);
  const items=useActive?(active.마일스톤||[]).filter(m=>m.부서업무ID===b.ID):(plan?.마일스톤||[]);
  const rows=items.map(m=>{
   const run=(data.실행||[]).find(x=>x.ID===m.ID);
   // 초안·변경 계획에 이전 승인 버전의 실행 상태를 섞지 않는다.
   const same=useActive||(scope?.부서계획ID===plan?.ID);
   const state=same&&run?run.상태:(plan?.상태==='초안'?'초안':plan?.상태==='보완'?'보완 중':plan?.상태==='승인'?'대표 승인 전':'부서 승인 전');
   const start=day(m.시작일),end=day(m.완료일);
   return {...m,subId:b.ID,department:b.부서명,start,end,valid:start!==null&&end!==null&&start<=end,state,late:!!(same&&run?.현재기한초과&&state!=='완료'&&state!=='종료'),owners:m.담당자목록?.length?m.담당자목록:[{ID:m.담당자ID,표시명:m.담당자명||'미지정'}],predecessors:same?run?.선행ID||[]:[]};
  });
  return {id:b.ID,name:b.부서명,note:useActive?(scope?.제외?'승인 범위 제외':scope?`승인 계획 v${scope.부서계획버전}`:'승인 범위 없음'):plan?`계획 v${plan.버전} · ${plan.상태}`:'계획 작성 전',rows};
 });
 const lead=data.부서업무?.find(b=>b.부서ID===data.주관부서?.ID)?.ID;
 groups.sort((a,b)=>Number(b.id===lead)-Number(a.id===lead)||a.name.localeCompare(b.name,'ko'));
 const rows=groups.flatMap(g=>g.rows),dated=rows.filter(m=>m.valid);let from,to;
 if(dated.length){from=Math.min(...dated.map(m=>m.start));to=Math.max(...dated.map(m=>m.end));}else from=to=day(today);
 from-=((new Date(from*DAY).getUTCDay()+6)%7);to+=7-((to-from)%7);const span=to-from;
 const ticks=[];if(span<=112){for(let n=from;n<to;n+=7)ticks.push({day:n,label:`${short(n)} – ${short(Math.min(n+6,to-1))}`});}
 else {let n=from;while(n<to){const d=new Date(n*DAY);ticks.push({day:n,label:`${d.getUTCFullYear()}.${String(d.getUTCMonth()+1).padStart(2,'0')}`});n=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)/DAY;}if(ticks.length>18){const keep=Math.ceil(ticks.length/12);ticks.splice(0,ticks.length,...ticks.filter((_,i)=>i%keep===0));}}
 const edges=useActive?active.선행관계||[]:(active?.선행관계||[]).filter(e=>[e.선행ID,e.후행ID].every(id=>{const m=rows.find(x=>x.ID===id);return m&&active.범위?.some(s=>s.부서업무ID===m.subId&&s.부서계획ID===data.부서업무.find(b=>b.ID===m.subId)?.계획?.[0]?.ID);}));
 return {groups,rows,from,to,span,ticks,edges,active,today:day(today),source:useActive?'approved':'latest'};
}
export function createMilestoneGantt({el,button}){
 const stateByWork=new Map();
 function overview(data){
  const active=(data.통합계획||[]).some(p=>p.ID===data.유효통합계획ID),state=stateByWork.get(data.업무ID)||{source:active?'approved':'latest',department:'',view:'gantt',selected:null};stateByWork.set(data.업무ID,state);
  const root=el('section',null,'detail-card milestone-gantt');root.setAttribute('aria-label','부서별 마일스톤 일정');
  const toolbar=el('div',null,'gantt-toolbar'),heading=el('div');heading.append(el('h3','부서별 마일스톤'),el('p','업무의 기간과 담당자를 함께 확인하세요.','gantt-subtitle'));toolbar.append(heading);
  const controls=el('div',null,'gantt-controls');
  const source=el('select');source.setAttribute('aria-label','간트 계획 기준');source.append(new Option('최근 부서 계획','latest'));if(active)source.append(new Option('승인된 실행 계획','approved'));source.value=state.source;
  const department=el('select');department.setAttribute('aria-label','간트 부서');department.append(new Option('전체 부서',''),...(data.부서업무||[]).map(b=>new Option(b.부서명,b.ID)));department.value=state.department;if(!department.value)state.department='';
  const switcher=el('div',null,'gantt-switch');switcher.setAttribute('role','group');switcher.setAttribute('aria-label','마일스톤 보기 방식');
  const gantt=button('간트','',()=>{state.view='gantt';render();}),list=button('목록','',()=>{state.view='list';render();});switcher.append(gantt,list);controls.append(source,department,switcher);toolbar.append(controls);
  const note=el('p',null,'gantt-note'),content=el('div'),inspector=el('div',null,'gantt-inspector');inspector.hidden=true;
  root.append(toolbar,note,content,inspector);
  source.addEventListener('change',()=>{state.source=source.value;state.selected=null;render();});department.addEventListener('change',()=>{state.department=department.value;state.selected=null;render();});
  let observer;
  function select(m){state.selected=m.ID;for(const row of content.querySelectorAll('[data-gantt-id]'))row.classList.toggle('is-selected',row.dataset.ganttId===m.ID);inspector.hidden=false;inspector.replaceChildren();
   const head=el('div',null,'gantt-inspector-heading');head.append(el('small','선택한 마일스톤'),button('닫기','text-button',()=>{state.selected=null;inspector.hidden=true;for(const n of content.querySelectorAll('.is-selected'))n.classList.remove('is-selected');}));
   inspector.append(head,el('h4',m.제목));const people=el('div',null,'assignee-chips');for(const person of m.owners)people.append(el('span',person.표시명,'assignee-chip'));inspector.append(people,el('p',`${m.department} · ${m.시작일||'미지정'} → ${m.완료일||'미지정'} · ${m.late?'기한 초과 · ':''}${m.state}`),el('p',`완료 기준 · ${m.완료기준||'미지정'}`));
   if(m.검증필요)inspector.append(el('p',`완료 검증 · ${m.검증자명||'미지정'}`));
   const predecessors=currentModel.edges.filter(e=>e.후행ID===m.ID).map(e=>currentModel.rows.find(r=>r.ID===e.선행ID)?.제목).filter(Boolean);
   if(predecessors.length)inspector.append(el('p','선행 업무 · '+predecessors.join(', ')));
  }
  let currentModel;
  function render(){
   observer?.disconnect();currentModel=ganttModel(data,state.source);const model=currentModel,groups=model.groups.filter(g=>!state.department||g.id===state.department),rows=groups.flatMap(g=>g.rows);
   content.replaceChildren();inspector.hidden=true;root.classList.toggle('gantt-list-mode',state.view==='list');gantt.setAttribute('aria-pressed',String(state.view==='gantt'));list.setAttribute('aria-pressed',String(state.view==='list'));
   note.textContent=model.source==='approved'?'대표님이 승인한 유효 계획 기준입니다. 새 계획은 승인 후 실행 일정에 반영됩니다.':'최근 부서 계획 기준입니다. 초안과 승인 대기 일정은 아직 실행 기준이 아닙니다.';
   if(!rows.length){content.append(el('p','아직 표시할 마일스톤이 없습니다. 부서 담당자가 계획을 저장하면 일정이 나타납니다.','gantt-empty'));return;}
   const legend=el('div',null,'gantt-legend');legend.append(el('span',`${rows.length}개 마일스톤`));for(const [text,cls] of [['진행','working'],['완료','done'],['대기·계획','planned']])legend.append(el('span',text,`gantt-status ${cls}`));legend.append(el('span',model.edges.length?'↳ 저장된 선후 관계':'선후 관계는 통합 계획에서 설정합니다.','gantt-relation-note'));content.append(legend);
   const scroll=el('div',null,'gantt-scroll');scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','마일스톤 간트 차트');const table=el('div',null,'gantt-table');scroll.append(table);
   const header=el('div',null,'gantt-grid gantt-header'),left=el('div',null,'gantt-info');left.append(el('span','마일스톤'),el('span','담당자'),el('span','상태'));const axis=el('div',null,'gantt-axis');
   for(let i=0;i<model.ticks.length;i++){const tick=model.ticks[i],label=el('span',tick.label);label.style.left=`${(tick.day-model.from)/model.span*100}%`;label.style.width=`${((model.ticks[i+1]?.day||model.to)-tick.day)/model.span*100}%`;axis.append(label);}if(model.today>=model.from&&model.today<model.to){const today=el('span',`오늘 ${short(model.today)}`,'gantt-today-label');today.style.left=`${Math.min(90,(model.today-model.from+.5)/model.span*100)}%`;axis.append(today);}header.append(left,axis);table.append(header);
   const body=el('div',null,'gantt-body');table.append(body);const barNodes=new Map();
   const mobile=el('div',null,'gantt-cards');
   const status=m=>m.late?'late':m.state==='완료'?'done':['진행','검증'].includes(m.state)?'working':'planned';
   const badge=m=>el('span',m.late?'기한 초과':m.state,`gantt-status ${status(m)}`);
   for(const group of groups){
    const band=el('div',null,'gantt-group');band.append(el('strong',group.name),el('span',`${group.rows.length}개 · ${group.note}`));body.append(band);
    const cardGroup=el('section',null,'gantt-card-group');cardGroup.append(el('h4',group.name),el('small',group.note));mobile.append(cardGroup);
    if(!group.rows.length){body.append(el('p',group.note,'gantt-empty'));cardGroup.append(el('p',group.note,'gantt-empty'));}
    for(const m of group.rows){
     const row=el('div',null,'gantt-grid gantt-row');row.dataset.ganttId=m.ID;
     const info=el('div',null,'gantt-info'),title=button('','gantt-task',()=>select(m));title.append(el('strong',m.제목),el('small',`${m.시작일||'미지정'} → ${m.완료일||'미지정'}`));
     const people=el('div',null,'gantt-people');for(const p of m.owners)people.append(el('span',p.표시명,'gantt-person'));info.append(title,people,badge(m));
     const track=el('div',null,'gantt-track');for(const tick of model.ticks){const grid=el('i',null,'gantt-gridline');grid.style.left=`${(tick.day-model.from)/model.span*100}%`;track.append(grid);}
     if(m.valid){const bar=button('',`gantt-bar ${status(m)}`,()=>select(m));bar.style.left=`${(m.start-model.from)/model.span*100}%`;bar.style.width=`${(m.end-m.start+1)/model.span*100}%`;bar.setAttribute('aria-label',`${m.제목} · ${m.담당자명} · ${m.시작일}부터 ${m.완료일} · ${m.state}`);bar.title=`${m.제목}\n${m.담당자명}\n${m.시작일} → ${m.완료일}`;bar.append(el('span',m.state==='완료'?'✓':''));track.append(bar);barNodes.set(m.ID,bar);}else track.append(el('span','일정 확인 필요','gantt-undated'));
     if(model.today>=model.from&&model.today<model.to){const line=el('i',null,'gantt-today');line.style.left=`${(model.today-model.from+.5)/model.span*100}%`;track.append(line);}
     row.append(info,track);body.append(row);
     const card=button('','gantt-card',()=>select(m));card.dataset.ganttId=m.ID;card.append(el('strong',m.제목),badge(m),el('span',m.owners.map(p=>p.표시명).join(' · ')),el('small',`${m.시작일||'미지정'} → ${m.완료일||'미지정'}`));const predecessors=model.edges.filter(e=>e.후행ID===m.ID).map(e=>model.rows.find(r=>r.ID===e.선행ID)?.제목).filter(Boolean);if(predecessors.length)card.append(el('small','선행 · '+predecessors.join(', ')));cardGroup.append(card);
    }
   }
   content.append(scroll,mobile);const foot=el('div',null,'gantt-footer');foot.append(el('span',`${iso(model.from)} — ${iso(model.to-1)}`),el('span',`오늘 ${iso(model.today)} · 업무를 선택하면 완료 기준을 볼 수 있습니다.`));content.append(foot);
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('gantt-connectors');svg.setAttribute('aria-hidden','true');body.append(svg);
   const markerId='gantt-arrow-'+crypto.randomUUID();
   let attached=false;
   function connectors(){if(!root.isConnected){if(attached)observer?.disconnect();return;}attached=true;const bounds=body.getBoundingClientRect();if(!bounds.width)return;svg.replaceChildren();svg.setAttribute('viewBox',`0 0 ${bounds.width} ${bounds.height}`);
    const ns='http://www.w3.org/2000/svg',defs=document.createElementNS(ns,'defs'),marker=document.createElementNS(ns,'marker'),arrow=document.createElementNS(ns,'path');marker.id=markerId;for(const [k,v]of Object.entries({viewBox:'0 0 8 8',refX:'7',refY:'4',markerWidth:'5',markerHeight:'5',orient:'auto'}))marker.setAttribute(k,v);arrow.setAttribute('d','M0 0 L8 4 L0 8 Z');marker.append(arrow);defs.append(marker);svg.append(defs);
    for(const edge of model.edges){const a=barNodes.get(edge.선행ID),b=barNodes.get(edge.후행ID);if(!a||!b)continue;const ar=a.getBoundingClientRect(),br=b.getBoundingClientRect();const x1=ar.right-bounds.left,y1=ar.top-bounds.top+ar.height/2,x2=br.left-bounds.left,y2=br.top-bounds.top+br.height/2;const path=document.createElementNS(ns,'path');const lane=ar.bottom-bounds.top+5;path.setAttribute('d',x2>x1+14?`M${x1} ${y1} H${x1+8} V${y2} H${x2}`:`M${x1} ${y1} H${x1+6} V${lane} H${x2-6} V${y2} H${x2}`);path.setAttribute('marker-end',`url(#${markerId})`);svg.append(path);}
   }
   observer=new ResizeObserver(connectors);observer.observe(body);requestAnimationFrame(connectors);
   const selected=rows.find(m=>m.ID===state.selected);if(selected)select(selected);
  }
  render();return root;
 }
 return {overview};
}
