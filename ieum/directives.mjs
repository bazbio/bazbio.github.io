import {personName,personLabel} from './messages.mjs';
const dayDiff=(a,b)=>Math.floor((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000);
export function directiveModel(p,now=new Date().toISOString()){
 const today=new Date(now).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}),report=p.보고||{},works=p.연결업무||[],notes=[];
 const incomplete=works.some(w=>w.단계!=='완료'),done=report.상태==='완료'&&!incomplete,held=report.상태==='보류';
 const actions=works.flatMap(w=>w.보류||['완료','비승인'].includes(w.단계)?[]:w.현재차례.map(a=>({...a,work:w}))),milestones=works.flatMap(w=>w.보류||['완료','비승인'].includes(w.단계)?[]:w.마일스톤.map(m=>({...m,work:w})));
 if(!done){
  if(report.필요결정)notes.push({kind:'결정',text:report.필요결정,who:p.담당자||'담당 미정'});
  for(const a of actions)if(['대표승인','종결승인'].includes(a.업무)&&!a.보류)notes.push({kind:'결정',text:`${a.업무==='종결승인'?'대표님 종결 승인':'대표님 계획 승인'} 대기`,who:personName(a.담당자),due:a.기한});
  if(report.상태==='정체')notes.push({kind:'정체',text:report.정체사유||'정체 사유 확인',who:p.담당자||'담당 미정'});
  if(!held){
   if(p.목표일&&today>p.목표일)notes.push({kind:'지연',text:`과제 목표일 ${dayDiff(today,p.목표일)}일 초과`,who:p.담당자||'담당 미정',due:p.목표일});
   for(const a of actions)if(!a.보류&&Date.parse(a.기한)<Date.parse(now))notes.push({kind:'지연',text:`${a.부서} · ${a.업무} 기한 초과`,who:personName(a.담당자),due:a.기한});
   for(const m of milestones){if(m.상태==='정체')notes.push({kind:'정체',text:`${m.제목} · ${m.정체사유||'사유 확인'}`,who:m.담당자});if(!['완료','종료'].includes(m.상태)&&m.완료일&&today>m.완료일)notes.push({kind:'지연',text:`${m.제목} · ${dayDiff(today,m.완료일)}일 지연${m.승인?'':' (승인 전 계획)'}`,who:m.담당자,due:m.완료일});}
   if(report.예상완료일&&p.목표일&&report.예상완료일>p.목표일)notes.push({kind:'지연 예상',text:`예상 완료 ${report.예상완료일} · 목표일 이후`,who:p.담당자||'담당 미정'});
  }
  if(report.다음확인일&&report.다음확인일<today)notes.push({kind:'확인',text:`현황 갱신 예정일 ${report.다음확인일} 경과`,who:p.담당자||'담당 미정'});
  if(!p.담당자ID||!p.목표일)notes.push({kind:'미정',text:[!p.담당자ID?'과제 책임자 미정':'',!p.목표일?'목표일 미정':''].filter(Boolean).join(' · ')});
  if((!p.보고시각||report.상태==='현황 확인 필요')&&!works.length)notes.push({kind:'확인',text:'진행 여부 확인 필요'});
  if(report.상태==='완료'&&incomplete)notes.push({kind:'확인',text:'연결 업무가 미완료 상태입니다. 완료 보고 재확인 필요'});
 }
 const state=done?'완료':held?'보류':report.상태==='정체'?'정체':works.length?[...new Set(works.map(w=>w.보류?'승인 검토로 보류':w.단계))].join(' · '):report.상태||'현황 확인 필요';
 const required=milestones.filter(m=>m.승인&&m.필수),complete=required.filter(m=>m.상태==='완료').length;
 return {...p,state,done,notes,actions,milestones,complete,total:required.length,decision:notes.some(n=>n.kind==='결정'),late:notes.some(n=>n.kind==='지연'),blocked:notes.some(n=>n.kind==='정체'),unknown:!done&&notes.some(n=>['확인','미정'].includes(n.kind)),soon:!done&&!held&&[p.목표일,...milestones.filter(m=>!['완료','종료'].includes(m.상태)).map(m=>m.완료일),...actions.filter(a=>!a.보류).map(a=>a.기한?.slice(0,10))].some(d=>d&&dayDiff(d,today)>=0&&dayDiff(d,today)<=7)};
}

export function createDirectives({el,button,api,send,isBusy,openWork,onNavigate}){
 let selected=null,department='',filter='전체',query='',listScroll=0,createDialog=null,departmentNames=[];
 const choose=async id=>{if(isBusy())return;if(!selected)listScroll=scrollY;selected=id;history.pushState({directiveView:true,id},'');await onNavigate();window.scrollTo({top:id?0:listScroll,behavior:'instant'});};
 window.addEventListener('popstate',async e=>{if(!e.state?.directiveView)return;selected=e.state.id||null;await onNavigate();window.scrollTo({top:selected?0:listScroll,behavior:'instant'});});
 const openLinked=id=>{history.pushState({directiveWork:id},'');openWork(id);};
 const states=['현황 확인 필요','진행','정체','보류','완료'];
 const card=title=>{const n=el('section',null,'directive-panel');if(title)n.append(el('h2',title));return n;};
 const badge=(t,cls='')=>el('span',t,'directive-badge '+cls);
 function field(form,label,value='',type='textarea',required=false){const l=el('label',label),i=el(type==='textarea'?'textarea':'input');if(type!=='textarea')i.type=type;else i.rows=3;i.value=value||'';i.required=required;i.setAttribute('aria-label',label);l.append(i);form.append(l);return i;}
 function formAction(f,label,fn){const err=el('p','','error');err.setAttribute('role','alert');const b=el('button',label,'primary');b.type='submit';f.append(err,b);f.onsubmit=async e=>{e.preventDefault();if(isBusy())return;b.disabled=true;try{await fn();}catch(e){err.textContent=e.message;}finally{b.disabled=false;}};}
 const request=(p,kind,args)=>({종류:kind,과제ID:p.ID,기대개정:p.개정,인자:args});
 async function assign(p,refresh){
  const dialog=el('dialog',null,'directive-assign-dialog'),form=el('form');form.append(el('h2','과제 책임자 지정'),el('p',p.제목,'directive-copy'));
  const err=el('p','','error');dialog.append(form);document.body.append(dialog);dialog.showModal();
  const close=()=>{if(!isBusy())dialog.close();};dialog.addEventListener('cancel',e=>{if(isBusy())e.preventDefault();});dialog.addEventListener('close',()=>dialog.remove());
  form.append(el('p','직원에게 실행 준비 요청과 메일을 보냅니다. 직원은 지금 내 차례에서 실행 업무요청을 시작할 수 있습니다.','hint'));
  try{const candidates=await api('read',{종류:'과제후보'});if(!dialog.open)return;const label=el('label','책임자'),select=el('select');select.required=true;select.setAttribute('aria-label','배정할 책임자');select.append(new Option('직원을 선택하세요',''),...candidates.담당자.map(m=>new Option(personLabel(m.이름,m.부서,m.ID),m.ID)));select.value=p.담당자ID||'';label.append(select);form.append(label);
   const due=field(form,'목표일',p.목표일,'date'),reason=field(form,'배정 요청 내용',p.목표||'과제 실행계획과 필요한 업무요청을 작성해 주세요.');reason.required=true;
   formAction(form,'책임자 지정 · 요청 보내기',async()=>{const result=await send(request(p,'과제설정',{담당자ID:select.value,목표일:due.value||null,사유:reason.value}));if(result){dialog.close();await refresh();}});
  }catch(e){err.textContent=e.message;form.append(err);}form.append(button('닫기','secondary',close));
 }
 function acceptCreated(result){createDialog?.remove();createDialog=null;selected=result.과제ID;department='';filter='전체';query='';}
 async function openCreate(){
  if(isBusy())return;if(createDialog){createDialog.showModal();return;}
  const dialog=el('dialog',null,'directive-assign-dialog directive-create-dialog'),form=el('form');createDialog=dialog;dialog.append(form);document.body.append(dialog);
  const title=el('h2','지시 업무 만들기');title.id='directive-create-title';dialog.setAttribute('aria-labelledby',title.id);form.append(title,el('p','제목만 적어도 저장할 수 있어요. 책임자와 일정은 나중에 정해도 됩니다.','hint'));
  const name=field(form,'업무 제목','','text',true);name.maxLength=200;name.placeholder='어떤 일을 진행하면 될까요?';
  const content=field(form,'요청 내용 (선택)');content.maxLength=2000;content.placeholder='생각나신 내용이나 기대하는 결과를 적어 주세요.';
  const fold=el('details',null,'directive-create-options');fold.append(el('summary','책임자·목표일 함께 지정 (선택)'));const options=el('div');fold.append(options);form.append(fold);
  const ownerLabel=el('label','책임자'),owner=el('select');owner.setAttribute('aria-label','새 업무 책임자');owner.append(new Option('나중에 지정',''));ownerLabel.append(owner);options.append(ownerLabel);
  const deptLabel=el('label','담당 부서'),dept=el('select');dept.setAttribute('aria-label','새 업무 부서');dept.append(new Option('미정 · 책임자 선택 시 소속 부서',''));deptLabel.append(dept);options.append(deptLabel);
  const due=field(options,'새 업무 목표일','','date');options.append(el('p','책임자를 함께 지정하면 개인 업무 요청과 메일을 보냅니다.','hint'));
  formAction(form,'지시 업무 저장',async()=>{const result=await send({종류:'과제간편등록',인자:{제목:name.value,내용:content.value,부서:dept.value,담당자ID:owner.value||null,목표일:due.value||null}});if(result){acceptCreated(result);await onNavigate();window.scrollTo({top:0,behavior:'instant'});}});
  form.append(button('닫기','secondary',()=>{if(!isBusy())dialog.close();}));dialog.addEventListener('cancel',e=>{if(isBusy())e.preventDefault();});dialog.showModal();name.focus();
  try{const data=await api('read',{종류:'과제후보'});if(createDialog!==dialog)return;owner.append(...data.담당자.map(m=>new Option(personLabel(m.이름,m.부서,m.ID),m.ID)));dept.append(...[...new Set([...departmentNames,...data.담당자.map(m=>m.부서)])].filter(v=>v!=='부서 미정').sort().map(v=>new Option(v,v)));}
  catch{options.append(el('p','책임자 목록을 불러오지 못했습니다. 제목으로 먼저 저장한 뒤 책임자를 지정할 수 있습니다.','hint'));}
 }
 async function render(){
  history.replaceState({directiveView:true,id:selected},'');
  const data=await api('read',{종류:'과제목록'}),root=el('div',null,'directive-board'),models=data.항목.map(p=>directiveModel(p,data.시각));
  departmentNames=[...new Set(models.map(p=>p.부서))];
  const refresh=async()=>{const next=await render();root.replaceWith(next);};
  const intro=el('div',null,'directive-intro');intro.append(el('p','대표님 지시 과제의 실제 차례와 병목을 확인합니다.'),el('small',`조회 ${new Date(data.시각).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} · 제안 자료와 실제 진행을 구분합니다.`));root.append(intro);
  if(!models.length){root.append(el('p','등록된 지시 과제가 없습니다.','empty'));return root;}
  const metrics=el('div',null,'directive-metrics');for(const [label,count]of [['전체',models.length],['결정 필요',models.filter(p=>p.decision).length],['지연·정체',models.filter(p=>p.late||p.blocked).length],['확인·미정',models.filter(p=>p.unknown).length],['완료',models.filter(p=>p.done).length]]){const b=button('',filter===label?'selected':'',()=>{filter=label;selected=null;void redraw();});b.append(el('strong',String(count)),el('span',label));metrics.append(b);}root.append(metrics,el('p','과제 수 기준입니다. 결정·지연·미정 신호는 겹칠 수 있습니다.','hint'));
  if(!selected){const overview=card('부서별 진행현황'),grid=el('div',null,'directive-departments');
   for(const deptName of [...new Set(models.map(p=>p.부서))].sort()){
    const rows=models.filter(p=>p.부서===deptName),done=rows.filter(p=>p.done).length,unassigned=rows.filter(p=>!p.담당자ID).length,late=rows.filter(p=>p.late||p.blocked).length;
    const b=button('','directive-department',()=>{department=deptName;selected=null;void redraw();});b.append(el('strong',deptName),el('span',`${done} / ${rows.length} 완료`));const bar=el('progress');bar.max=rows.length;bar.value=done;bar.setAttribute('aria-label',deptName+' 완료');b.append(bar,el('small',`진행 확인 ${rows.filter(p=>p.actions.length||p.보고.상태==='진행').length} · 지연/정체 ${late} · 책임자 미정 ${unassigned}`));grid.append(b);
   }overview.append(grid,el('p','완료는 과제 완료 보고 기준이며, 연결 업무의 마일스톤 진행은 별도로 표시합니다.','hint'));root.append(overview);
  }
  const controls=el('div',null,'directive-filters'),dept=el('select'),search=el('input'),scope=el('select');dept.setAttribute('aria-label','지시 과제 부서');dept.append(new Option('전체 부서',''),...[...new Set(models.map(p=>p.부서))].sort().map(n=>new Option(n,n)));dept.value=department;search.type='search';search.placeholder='업무·담당자 검색';search.setAttribute('aria-label','지시 과제 검색');search.value=query;scope.setAttribute('aria-label','지시 과제 상태');for(const t of ['전체','결정 필요','지연·정체','확인·미정','7일 이내','완료'])scope.append(new Option(t,t));scope.value=filter;controls.append(dept,scope,search);root.append(controls);
  const body=el('div');root.append(body);dept.onchange=()=>{department=dept.value;selected=null;draw();};scope.onchange=()=>{filter=scope.value;selected=null;draw();};search.oninput=()=>{query=search.value;selected=null;draw();};
  async function redraw(){try{await refresh();}catch(e){body.replaceChildren(el('p',e.message,'error'),button('다시 불러오기','secondary',()=>void redraw()));}}
  function draw(){scope.value=filter;body.replaceChildren();
   const matching=models.filter(p=>(!department||p.부서===department)&&(!query||[p.제목,p.영역,p.담당자,...p.actions.map(a=>a.담당자)].join(' ').toLowerCase().includes(query.toLowerCase()))&&({전체:true,'결정 필요':p.decision,'지연·정체':p.late||p.blocked,'확인·미정':p.unknown,'7일 이내':p.soon,완료:p.done}[filter]));
   const attention=matching.filter(p=>p.decision||p.late||p.blocked).sort((a,b)=>Number(b.decision)-Number(a.decision));
   if(attention.length){const priority=card('먼저 확인할 일');priority.classList.add('directive-attention');for(const p of attention){const b=button('','directive-priority',()=>choose(p.ID));b.append(badge(p.decision?'결정 필요':p.blocked?'정체':'지연','danger'),el('strong',`${p.부서} · ${p.제목}`));for(const n of p.notes.filter(n=>['결정','정체','지연'].includes(n.kind)).slice(0,3))b.append(el('span',`${n.who||'담당 미정'} · ${n.text}`));priority.append(b);}body.append(priority);}
   const list=card(`지시 업무 목록 · ${matching.length}건`);
   for(const p of matching.sort((a,b)=>a.부서.localeCompare(b.부서,'ko')||a.코드.localeCompare(b.코드))){
    const row=el('article',null,'directive-row'),name=button('','directive-open',()=>choose(p.ID));name.setAttribute('aria-label',p.제목+' 상세');name.append(el('small',`${p.부서} · ${p.코드}`),el('h3',p.제목));
    const progress=el('div');progress.append(badge(p.state,p.done?'done':p.late||p.blocked?'danger':''),el('p',p.actions.length?p.actions.slice(0,2).map(a=>`${personName(a.담당자)} · ${a.업무}`).join(' / '):p.배정&&!p.배정.업무ID?'책임자의 실행 업무요청 작성 대기':p.보고.다음행동||'현재 차례 확인 필요'));
    const owner=el('div',null,'directive-owner');owner.append(button(p.담당자||'＋ 책임자 지정','secondary directive-assign',()=>assign(p,refresh)),el('small',p.목표일?`목표 ${p.목표일}`:'목표일 미정'));if(p.배정)owner.append(el('small',`배정 메일 · ${p.배정.메일상태||'대기'}`));
    row.append(name,progress,owner);list.append(row);
   }if(!matching.length)list.append(el('p','조건에 맞는 과제가 없습니다.'));body.append(list);
  }

  async function detail(id){body.replaceChildren(el('p','과제를 불러오고 있습니다.','loading'));try{
   const d=await api('read',{종류:'과제상세',과제ID:id});if(selected!==id)return;const p=directiveModel(d.항목[0],d.시각);body.replaceChildren(button('← 대시보드로 돌아가기','secondary directive-back',()=>choose(null)));
   const summary=card(p.제목);summary.append(el('p',`${p.부서} · ${p.코드} · ${p.영역||'영역 미정'}`,'hint'),badge(p.state,p.late||p.blocked?'danger':''),el('p',(p.원천.종류==='직접등록'?'요청 내용: ':'목표 (원본 보강안): ')+(p.목표||'구체화 필요'),'directive-copy'),el('p',`과제 책임자: ${p.담당자||'미정'} · 목표일: ${p.목표일||'미정'}`));
   for(const n of p.notes)summary.append(el('p',`${n.kind} · ${n.who?n.who+' · ':''}${n.text}`,['지연','정체','결정'].includes(n.kind)?'directive-warning':'hint'));body.append(summary);
   const flow=card('병목 현황');
   if(!p.연결업무.length)flow.append(el('p','연결된 실행 업무가 없습니다. 아래 현황 기록과 담당자·일정을 먼저 확인해 주세요.','hint'));
   for(const w of p.연결업무){const section=el('div',null,'directive-work');section.append(el('h3',w.제목),badge(w.보류?'프로젝트 검토로 보류':w.단계));for(const a of w.현재차례)section.append(el('p',`${personLabel(a.담당자,a.부서)} · ${a.업무}${a.보류?' (보류)':''} · ${new Date(a.기한).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'})}까지`));
    const stages=el('div',null,'directive-milestones');for(const m of w.마일스톤){const b=el('div',null,'directive-step'+(m.상태==='완료'?' done':m.상태==='정체'||(m.완료일&&m.완료일<new Date(d.시각).toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})&&!['완료','종료'].includes(m.상태))?' late':''));b.append(el('strong',m.제목),el('span',`${m.담당자||'담당 미정'} · ${m.상태}`),el('small',`${m.완료일||'기한 미정'}${m.승인?'':' · 승인 전 계획'}`));stages.append(b);}section.append(stages);if(w.상세열람)section.append(button('업무 상세에서 처리하기','secondary',()=>openLinked(w.ID)));else section.append(el('p','업무 요약만 표시합니다. 상세 자료·승인은 기존 업무 참여 권한이 필요합니다.','hint'));flow.append(section);}
   if(p.total)flow.append(el('p',`연결 업무의 승인된 필수 마일스톤 ${p.complete}/${p.total} 완료 · 과제의 사업 목표 달성과는 별도입니다.`,'hint'));body.append(flow);
   const update=card('최근 진행 상황');if(p.보고시각){update.append(el('p',`${p.보고자} · ${new Date(p.보고시각).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}`,'hint'));for(const [k,v]of Object.entries(p.보고))if(v)update.append(el('p',`${k}: ${v}`,'directive-copy'));}else update.append(el('p','등록된 진행 보고가 없습니다. 연결 업무의 실제 진행 상황을 확인해 주세요.','hint'));body.append(update);
   if(p.보고가능){const fold=el('details',null,'directive-edit'),f=el('form');fold.append(el('summary','진행 상황 기록'));const l=el('label','현재 상태'),s=el('select');s.setAttribute('aria-label','과제 보고 상태');for(const v of states)s.append(new Option(v,v));s.value=p.보고.상태;l.append(s);f.append(l);const fields={};for(const [label,type]of [['내용','textarea'],['정체사유','textarea'],['필요결정','textarea'],['다음행동','textarea'],['다음확인일','date'],['예상완료일','date']])fields[label]=field(f,label,p.보고[label],type,label==='내용');f.append(el('p','연결 업무의 담당·기한·승인은 바뀌지 않습니다. 정체 시 사유를, 완료 시 결과 근거를 적어 주세요.','hint'));formAction(f,'현황 저장',async()=>{const args={상태:s.value,...Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.type==='date'?(v.value||null):v.value]))};const r=await send(request(p,'과제보고',args));if(r)await refresh();});fold.append(f);body.append(fold);}
   if(d.관리가능){const candidates=await api('read',{종류:'과제후보'});if(selected!==id)return;const fold=el('details',null,'directive-edit');fold.append(el('summary','담당자·목표일·업무 연결 관리'));const f=el('form'),l=el('label','과제 책임자'),s=el('select');s.setAttribute('aria-label','과제 책임자');s.append(new Option('미정',''),...candidates.담당자.map(m=>new Option(personLabel(m.이름,m.부서,m.ID),m.ID)));s.value=p.담당자ID||'';l.append(s);f.append(l);const due=field(f,'과제 목표일',p.목표일,'date'),reason=field(f,'설정 사유','','textarea',true);formAction(f,'담당자·목표일 저장',async()=>{if(await send(request(p,'과제설정',{담당자ID:s.value||null,목표일:due.value||null,사유:reason.value})))await refresh();});fold.append(f);
    const links=el('form'),choices=[];links.append(el('h3','기존 업무 연결'));for(const w of candidates.업무){const label=el('label',null,'directive-checkbox'),input=el('input');input.type='checkbox';input.value=w.ID;input.checked=p.연결업무.some(x=>x.ID===w.ID);label.append(input,el('span',`${w.제목} · ${w.단계}`));links.append(label);choices.push(input);}const why=field(links,'연결 변경 사유','','textarea',true);links.append(el('p','실행 업무 전체를 참고 연결합니다. 업무 자체의 승인이나 참여 권한은 변경하지 않습니다.','hint'));formAction(links,'업무 연결 저장',async()=>{if(await send(request(p,'과제연결',{업무IDs:choices.filter(c=>c.checked).map(c=>c.value),사유:why.value})))await refresh();});fold.append(links);body.append(fold);}
   const source=el('details',null,'directive-edit');source.append(el('summary',p.원천.종류==='직접등록'?'등록 정보':'원본 계획과 보강 제안'));if(p.원천.종류==='직접등록')source.append(el('p','지시 업무 화면에서 직접 등록한 업무입니다.','hint'));else source.append(el('p',`${p.원천.파일} · ${p.원천.시트} ${p.원천.행}행${p.원천.원문위치?' · '+p.원천.원문위치:''}`,'hint'),el('p','아래 내용은 원본의 보강 제안입니다. 실제 승인·완료 사실과 구분합니다.','hint'));for(const [k,v]of Object.entries(p.보강안))if(v)source.append(el('h3',k),el('p',v,'directive-copy'));body.append(source);
   const history=el('details',null,'directive-edit');history.append(el('summary','변경 이력'));for(const h of d.이력){const entry=el('div',null,'directive-history');entry.append(el('strong',`${h.작성자} · ${h.종류.replace('과제','')} · ${new Date(h.시각).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}`),el('p',h.내용.입력.사유||h.내용.입력.내용||'원본 계획 등록','directive-copy'));history.append(entry);}body.append(history,button('← 대시보드로 돌아가기','secondary directive-back',()=>choose(null)));
  }catch(e){body.replaceChildren(el('p',e.message,'error'),button('다시 불러오기','secondary',()=>choose(id)));}}
  draw();if(selected)await detail(selected);return root;
 }
 function reset(){selected=null;department='';filter='전체';query='';createDialog?.remove();createDialog=null;}
 return {render,reset,openCreate,acceptCreated};
}
