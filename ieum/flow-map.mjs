// 업무상세의 열람 범위 안에서만 맵을 만든다. 상태와 기한 판정은 서버 값을 사용한다.
const globalKinds=new Set(['통합제출','통합보완','대표승인','결과확인','결과보완','종결승인']);
const statusOf=(actions,fallback='waiting')=>actions.some(a=>a.기한초과)?'late':actions.length?'current':fallback;
const labels={done:'완료',current:'현재 차례',late:'기한 초과',waiting:'대기',excluded:'범위 제외',stopped:'비승인'};
export function buildFlowMap(data,{expanded=false}={}){
  const nodes=[],edges=[],actions=data.현재행동||[],departments=data.부서업무||[],runs=data.실행||[];
  const effective=(data.통합계획||[]).find(v=>v.ID===data.유효통합계획ID);
  const closed=Boolean(data.종결?.종결시각)||data.단계==='완료';
  const rejected=data.단계==='비승인';
  const add=(id,title,subtitle,own=[],fallback='waiting',extra={})=>{const n={id,title,subtitle,actions:own,status:statusOf(own,fallback),...extra};nodes.push(n);return n;};
  const link=(from,to,label='')=>edges.push({from,to,label});
  add('request','업무 요청',data.요청자?.표시명||'요청자',[],'done',{detail:data.목적});
  for(const b of departments){
    const own=actions.filter(a=>a.부서업무ID===b.ID&&!a.마일스톤ID&&!globalKinds.has(a.종류));
    const p=b.계획?.[0],scope=effective?.범위?.find(s=>s.부서업무ID===b.ID);
    const excluded=scope?.제외===true;
    const fallback=excluded?'excluded':b.상태==='비승인'?'stopped':p?.상태==='승인'?'done':'waiting';
    const subtitle=excluded?'대표 승인 범위에서 제외':own.length?own.map(a=>a.종류).filter((v,i,a)=>a.indexOf(v)===i).join(' · '):p?`부서 계획 v${p.버전} · ${p.상태}`:b.상태;
    add(`dept:${b.ID}`,b.부서명,subtitle,own,fallback,{subId:b.ID,detail:b.요청내용||'접수 → 담당자 배정 → 계획 수립 → 부서 승인',plan:p,department:b});
    link(b.기원부서업무ID?`dept:${b.기원부서업무ID}`:'request',`dept:${b.ID}`,b.기원부서업무ID?'협업 요청':'최초 요청');
  }
  const approvals=actions.filter(a=>['통합제출','통합보완','대표승인'].includes(a.종류));
  add('approval','통합 계획 · 대표 승인',approvals.length?approvals.map(a=>a.종류).join(' · '):effective?`유효 계획 v${effective.버전} · 승인`:'부서 계획 취합 후 승인',approvals,effective?'done':'waiting',{detail:data.변경상태?`계획 변경: ${data.변경상태}. 현재 실행 기준은 승인된 유효 계획입니다.`:effective?.요약});
  for(const b of departments)link(`dept:${b.ID}`,'approval','부서 계획 취합');
  if(!departments.length)link('request','approval');
  const runActions=actions.filter(a=>a.마일스톤ID);
  const done=runs.filter(m=>m.상태==='완료').length;
  const required=runs.filter(m=>m.필수),requiredDone=required.filter(m=>m.상태==='완료').length;
  if(expanded&&runs.length){
    const runIds=new Set(runs.map(m=>m.ID));
    for(const m of runs){
      const own=runActions.filter(a=>a.마일스톤ID===m.ID);
      const fallback=m.상태==='완료'?'done':m.상태==='종료'?'excluded':'waiting';
      const n=add(`run:${m.ID}`,m.제목,`${m.부서명} · ${m.상태}`,own,fallback,{milestone:m,detail:m.완료기준});
      if(!['완료','종료'].includes(m.상태)&&m.현재기한초과)n.status='late';
      const predecessors=(m.선행ID||[]).filter(id=>runIds.has(id));
      if(!predecessors.length)link('approval',n.id,'승인 후 착수');
      for(const id of predecessors)link(`run:${id}`,n.id,'선행 완료 후 착수');
    }
    const hasSuccessor=new Set(edges.filter(e=>e.from.startsWith('run:')).map(e=>e.from));
    for(const m of runs)if(!hasSuccessor.has(`run:${m.ID}`))link(`run:${m.ID}`,'result','작업 완료·정리 후 확인');
  }else{
    const fallback=effective&&runs.length&&runs.every(m=>['완료','종료'].includes(m.상태))?'done':'waiting';
    const n=add('execution','업무 실행 · 검증',effective?`필수 완료 ${requiredDone}/${required.length} · 전체 ${done}/${runs.length}`:'대표 승인 후 실행',runActions,fallback,{runs});
    if(runs.some(m=>!['완료','종료'].includes(m.상태)&&m.현재기한초과))n.status='late';
    link('approval','execution','승인 후 실행');link('execution','result');
  }
  const resultActions=actions.filter(a=>['결과확인','결과보완'].includes(a.종류));
  const closeActions=actions.filter(a=>a.종류==='종결승인');
  add('result','요청자 결과 확인',data.요청자?.표시명||'요청자',resultActions,closed||closeActions.length?'done':'waiting',{detail:data.종결?.준비미완료?.join(' · ')});
  add('close','대표 종결 승인',closed?'업무 종결 완료':'최종 결과 승인 후 종결',closeActions,closed?'done':'waiting');
  link('result','close');
  // 참조가 없는 연결은 그리지 않는다. 실제 원본 관계만 유지한다.
  const ids=new Set(nodes.map(n=>n.id));
  return {nodes,edges:edges.filter(e=>ids.has(e.from)&&ids.has(e.to)),closed,rejected,required:required.length,requiredDone,actions,expanded,effective};
}

export function layoutFlowMap(model){
  const columns=new Map(),remaining=new Set(model.nodes.map(n=>n.id));
  while(remaining.size){
    let changed=false;
    for(const id of [...remaining]){
      const parents=model.edges.filter(e=>e.to===id).map(e=>e.from);
      if(parents.every(p=>columns.has(p))){columns.set(id,parents.length?1+Math.max(...parents.map(p=>columns.get(p))):0);remaining.delete(id);changed=true;}
    }
    if(!changed){const fallback=Math.max(-1,...columns.values())+1;for(const id of remaining)columns.set(id,fallback);break;}
  }
  const groups=new Map();for(const n of model.nodes){const col=columns.get(n.id);if(!groups.has(col))groups.set(col,[]);groups.get(col).push(n);}
  const maxRows=Math.max(1,...[...groups.values()].map(x=>x.length)),height=maxRows*154+48;
  const positions=new Map();for(const [col,items]of groups)items.forEach((n,i)=>positions.set(n.id,{x:28+col*250,y:24+(height-48-items.length*154)/2+i*154,width:204,height:120}));
  return {positions,width:(Math.max(0,...columns.values())+1)*250+8,height};
}

export function createFlowMap({el,button}){
  function overview(data){
    let expanded=false,zoom=1,selected=null,model,layout;
    const host=el('div',null,'flow-map-host'),dialog=el('dialog',null,'flow-dialog');dialog.setAttribute('aria-label','전체 업무 흐름 맵 크게 보기');
    const box=el('section',null,'detail-card flow-map');box.setAttribute('aria-label','전체 업무 흐름 맵');
    const heading=el('div',null,'flow-heading');heading.append(el('h3','전체 업무 흐름 맵'),el('span',data.단계,'badge'));
    const helper=el('p','화살표는 업무 연결 순서입니다. 현재 차례를 누르면 담당자와 기한을 확인할 수 있습니다.','hint');
    const summary=el('div',null,'flow-summary'),tools=el('div',null,'flow-tools');
    const viewport=el('div',null,'flow-viewport');viewport.tabIndex=0;viewport.setAttribute('aria-label','업무 흐름 지도 · 가로·세로 스크롤 가능');
    const surface=el('div',null,'flow-surface'),canvas=el('div',null,'flow-canvas');surface.append(canvas);viewport.append(surface);
    const inspector=el('section',null,'flow-inspector');inspector.setAttribute('aria-label','선택한 단계 상세');inspector.setAttribute('aria-live','polite');
    const zoomLabel=el('span','100%','flow-zoom');
    function scale(value){zoom=Math.min(1.5,Math.max(.35,value));canvas.style.transform=`scale(${zoom})`;surface.style.width=`${layout.width*zoom}px`;surface.style.height=`${layout.height*zoom}px`;zoomLabel.textContent=`${Math.round(zoom*100)}%`;}
    const expand=button('마일스톤 펼치기','secondary',()=>{expanded=!expanded;expand.textContent=expanded?'마일스톤 접기':'마일스톤 펼치기';expand.setAttribute('aria-pressed',String(expanded));render();});expand.setAttribute('aria-pressed','false');
    function focusNode(id){const node=[...canvas.querySelectorAll('.flow-node')].find(n=>n.dataset.nodeId===id);node?.scrollIntoView({block:'nearest',inline:'center',behavior:'smooth'});node?.focus({preventScroll:true});select(id);}
    const current=button('현재 차례로','primary',()=>{const active=model.nodes.filter(n=>['late','current'].includes(n.status));const next=active[(active.findIndex(n=>n.id===selected)+1)%active.length];if(next)focusNode(next.id);});
    function centerSelected(){const p=layout.positions.get(selected);if(p)viewport.scrollTo({left:Math.max(0,(p.x+p.width/2)*zoom-viewport.clientWidth/2),top:Math.max(0,p.y*zoom-40),behavior:'instant'});}
    function closeMap(restoreFocus=true){dialog.close();host.prepend(box);box.classList.remove('flow-fullscreen');fullscreen.textContent='크게 보기';fullscreen.setAttribute('aria-expanded','false');if(restoreFocus)fullscreen.focus({preventScroll:true});}
    const fullscreen=button('크게 보기','secondary',()=>{if(dialog.open){closeMap();return;}dialog.append(box);box.classList.add('flow-fullscreen');fullscreen.textContent='크게 보기 닫기';fullscreen.setAttribute('aria-expanded','true');dialog.showModal();fullscreen.focus({preventScroll:true});dialog.scrollTop=0;requestAnimationFrame(centerSelected);});fullscreen.setAttribute('aria-expanded','false');
    dialog.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const items=[...dialog.querySelectorAll('button:not(:disabled),[tabindex="0"]')].filter(n=>n.getClientRects().length);const first=items[0],last=items.at(-1);if((e.shiftKey&&document.activeElement===first)||(!e.shiftKey&&document.activeElement===last)){e.preventDefault();(e.shiftKey?last:first)?.focus();}});
    dialog.addEventListener('cancel',e=>{e.preventDefault();closeMap();});
    dialog.addEventListener('close',()=>{if(!dialog.open&&box.parentElement===dialog)closeMap(false);});
    tools.append(current,expand,button('−','secondary',()=>scale(zoom-.15)),zoomLabel,button('＋','secondary',()=>scale(zoom+.15)),button('전체 맞춤','secondary',()=>{scale((viewport.clientWidth-16)/layout.width);viewport.scrollTo(0,0);}),fullscreen);
    tools.children[2].setAttribute('aria-label','맵 축소');tools.children[4].setAttribute('aria-label','맵 확대');
    const legend=el('div',null,'flow-legend');for(const [state,label]of Object.entries(labels)){const item=el('span',label,`flow-key ${state}`);legend.append(item);}
    function jump(a){const target=document.getElementById(`action-${a.행동ID}`);if(target){if(dialog.open)closeMap(false);target.tabIndex=-1;target.scrollIntoView({block:'start',behavior:'smooth'});target.focus({preventScroll:true});}}
    function select(id){
      selected=id;const n=model.nodes.find(n=>n.id===id);if(!n)return;
      for(const b of canvas.querySelectorAll('.flow-node'))b.setAttribute('aria-pressed',String(b.dataset.nodeId===id));
      inspector.replaceChildren(el('h4',n.title),el('p',`${labels[n.status]} · ${n.subtitle}`));
      if(n.detail)inspector.append(el('p',n.detail,'hint'));
      if(n.department?.기원부서업무ID){const parent=data.부서업무.find(b=>b.ID===n.department.기원부서업무ID);inspector.append(el('p',`협업 요청 부서: ${parent?.부서명||'이전 부서'}`,'hint'));}
      if(n.milestone){const m=n.milestone;inspector.append(el('p',`작업 담당: ${m.담당자명} · ${m.시작일} → ${m.완료일} · ${m.실행회차}회차`));if(m.검증필요)inspector.append(el('p',`완료 검증: ${m.검증자명||'담당자 확인 필요'}`));if(m.선행ID?.length)inspector.append(el('p',`선행 작업: ${m.선행ID.map(id=>data.실행.find(x=>x.ID===id)?.제목||'이전 작업').join(', ')}`));if(m.현재기한초과)inspector.append(el('p',m.상태==='완료'?'승인 일정 이후 완료':'승인 완료일 초과','error'));}
      const planned=n.plan?.마일스톤;
      if(planned?.length){const list=el('ul');for(const m of planned)list.append(el('li',`${m.제목} · ${m.담당자명} · ${m.시작일} → ${m.완료일}`));inspector.append(el('p','최근 부서 계획 · 실행 기준은 대표 승인된 유효 계획입니다.','hint'),list);}
      if(n.runs?.length)inspector.append(el('p','마일스톤 펼치기에서 개별 작업과 선후 관계를 확인하세요.','hint'));
      for(const a of n.actions){const row=el('div',null,'flow-action');row.append(el('strong',`${a.담당부서.이름} · ${a.담당자.표시명} · ${a.종류}`),el('p',`${new Date(a.처리기한).toLocaleString('ko-KR')}까지${a.기한초과?' · 기한 초과':''}`));if(a.미팅대기)row.append(el('p','미팅 결론·후속 업무 대기','notice'));if(a.마일스톤제목)row.append(el('p',a.마일스톤제목));row.append(button('해당 차례 보기','text-button',()=>jump(a)));inspector.append(row);}
    }
    function render(){
      model=buildFlowMap(data,{expanded});layout=layoutFlowMap(model);canvas.replaceChildren();canvas.style.width=`${layout.width}px`;canvas.style.height=`${layout.height}px`;
      summary.replaceChildren(el('strong',model.closed?'종결 완료':model.rejected?'비승인으로 종료':`현재 ${model.actions.length}건의 처리 차례`),el('span',`행동 기한 초과 ${model.actions.filter(a=>a.기한초과).length}건`),el('span',model.effective?`필수 마일스톤 ${model.requiredDone}/${model.required} 완료`:'대표 승인 전 · 실행 시작 전'));
      if(data.변경상태)summary.append(el('span',`계획 변경: ${data.변경상태}`));
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('width',layout.width);svg.setAttribute('height',layout.height);svg.setAttribute('aria-hidden','true');svg.classList.add('flow-edges');
      for(const edge of model.edges){const a=layout.positions.get(edge.from),b=layout.positions.get(edge.to);const path=document.createElementNS(svg.namespaceURI,'path');const x=a.x+a.width,y=a.y+a.height/2,end=b.x-7,endY=b.y+b.height/2,mid=(x+end)/2;path.setAttribute('d',`M ${x} ${y} C ${mid} ${y}, ${mid} ${endY}, ${end} ${endY}`);const title=document.createElementNS(svg.namespaceURI,'title');title.textContent=edge.label;path.append(title);svg.append(path);const arrow=document.createElementNS(svg.namespaceURI,'path');arrow.setAttribute('d',`M ${end-5} ${endY-4} L ${end} ${endY} L ${end-5} ${endY+4}`);svg.append(arrow);}
      canvas.append(svg);
      for(const n of model.nodes){const p=layout.positions.get(n.id),b=button('',`flow-node ${n.status}`,()=>select(n.id));b.dataset.nodeId=n.id;b.style.left=`${p.x}px`;b.style.top=`${p.y}px`;b.setAttribute('aria-label',`${n.title} · ${labels[n.status]} · ${n.subtitle}`);b.append(el('span',labels[n.status],'flow-state'),el('strong',n.title),el('span',n.subtitle,'flow-subtitle'));const owners=[...new Set(n.actions.map(a=>a.담당자.표시명))];if(owners.length)b.append(el('small',owners.join(' · ')));else if(n.milestone)b.append(el('small',n.milestone.담당자명));canvas.append(b);}
      current.disabled=!model.nodes.some(n=>['late','current'].includes(n.status));expand.disabled=!data.실행?.length;
      scale(zoom);select(model.nodes.some(n=>n.id===selected)?selected:model.nodes.find(n=>n.status==='late')?.id||model.nodes.find(n=>n.status==='current')?.id||(model.closed?'close':'request'));
    }
    box.append(heading,helper,summary,tools,legend,viewport,inspector,el('p','부서 노드의 완료는 부서 계획 승인을 뜻합니다. 행동 기한 초과와 마일스톤 일정 초과를 구분하며, 새로고침 시 최신 상태를 반영합니다.','hint'));
    host.append(box,dialog);render();requestAnimationFrame(()=>{if(!box.isConnected)return;if(viewport.clientWidth>600)scale(Math.max(.65,(viewport.clientWidth-16)/layout.width));centerSelected();});return host;
  }
  return {overview};
}
