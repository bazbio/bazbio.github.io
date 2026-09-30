import {displayLabel} from './messages.mjs';
import {buildFlowMap} from './flow-map.mjs';

const phaseNames={접수판단:'요청 검토',책임자배정:'담당자 배정',계획작성:'계획 작성',부서승인:'계획 승인',자료보완:'자료 보완',부서요청조정:'요청 조정',주관조정:'주관 부서 조정'};
const toneNames={done:'완료',current:'진행 중',late:'기한 초과',waiting:'대기',excluded:'제외',stopped:'반려'};
const turnLabels={접수판단:'요청 검토·수락',책임자배정:'업무 담당자 배정',계획작성:'계획 작성·제출',부서승인:'부서 계획 검토·승인',자료보완:'요청 자료 보완',부서요청조정:'부서 요청 조정',주관조정:'주관 부서 조정',협업후속판단:'협업 후속 결정',통합제출:'통합 계획 제출',통합보완:'통합 계획 보완',대표승인:'통합 계획 검토·승인',착수:'업무 착수',수행:'업무 수행·완료 보고',검증:'결과 검증',재작업:'보완 작업 착수',결과확인:'업무 결과 확인',결과보완:'업무 결과 보완',종결승인:'최종 결과 승인·종결',미팅진행:'미팅 진행·결론 등록',미팅후속:'미팅 후속 업무 처리'};
export function currentTurns(data,actorID){
 const ended=data.단계==='완료'||data.단계==='비승인'||Boolean(data.종결?.종결시각);
 const rows=(ended?[]:data.현재행동||[]).filter(a=>!a.상태||['대기','보류'].includes(a.상태)).map(a=>{
  const people=a.담당자목록?.length?a.담당자목록:[a.담당자].filter(Boolean);
  const sub=data.부서업무?.find(b=>b.ID===a.부서업무ID);
  return {action:a,people,mine:people.some(p=>p.ID===actorID),blocked:Boolean(a.미팅대기||a.상태==='보류'),title:turnLabels[a.종류]||displayLabel(a.종류),scope:a.마일스톤제목||a.미팅후속내용||a.미팅안건||sub?.요청제목||data.제목};
 }).sort((a,b)=>Number(a.blocked)-Number(b.blocked)||Number(b.mine)-Number(a.mine)||Number(Boolean(b.action.기한초과))-Number(Boolean(a.action.기한초과))||(Date.parse(a.action.처리기한)||Infinity)-(Date.parse(b.action.처리기한)||Infinity));
 return {ended,ready:rows.filter(r=>!r.blocked),waiting:rows.filter(r=>r.blocked),preparing:ended?[]:(data.부서업무||[]).filter(b=>b.상태==='접수준비')};
}
export function requestProgress(data){
 const model=buildFlowMap(data),nodes=new Map(model.nodes.map(n=>[n.id,n]));
 const depts=model.nodes.filter(n=>n.department);
 const collaboration=depts.length&&depts.every(n=>['done','excluded'].includes(n.status))?'done':model.rejected?'stopped':'current';
 const phases=[['request','요청 등록'],['departments','부서 협업'],['approval','통합 승인'],['execution','실행·검증'],['result','결과 확인'],['close','종결']].map(([id,title])=>({id,title,status:id==='departments'?collaboration:nodes.get(id)?.status||'waiting'}));
 // 종결 사실 외에는 이후 단계의 진입만 보고 앞선 단계 완료를 추정하지 않는다.
 return {phases,model};
}
export function revealWorkElement(target){
 if(!target)return;
 for(let parent=target.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
 target.tabIndex=-1;target.scrollIntoView({block:'center',behavior:'smooth'});target.focus({preventScroll:true});
}
export function createRequestOverview({el,button,assignees}){
 function turns(data,actorID){
  const model=currentTurns(data,actorID),box=el('section',null,'next-turns');box.setAttribute('aria-label','지금 할 일');
  const heading=el('div',null,'next-turns-heading'),titles=el('div');titles.append(el('p','지금 누구의 차례인가요?','next-turns-eyebrow'),el('h2','지금 할 일'));
  const counts=el('div',null,'next-turn-counts'),mine=model.ready.filter(r=>r.mine).length,late=model.ready.filter(r=>r.action.기한초과).length;
  if(mine)counts.append(el('span',`내 차례 ${mine}건`,'next-turn-count mine'));if(late)counts.append(el('span',`기한 초과 ${late}건`,'next-turn-count late'));
  heading.append(titles,counts);box.append(heading);
  const people=new Set(model.ready.flatMap(r=>r.people.map(p=>p.ID)));
  box.append(el('p',model.ready.length?`${people.size}명 · ${model.ready.length}건의 처리를 기다리고 있습니다.${mine?' 내 차례를 눌러 바로 처리하세요.':' 담당자별 할 일을 확인하세요.'}`:model.ended?'종료된 업무입니다.':model.waiting.length||model.preparing.length?'아래 대기 사유가 해결되면 다음 처리를 진행할 수 있습니다.':'현재 처리할 차례가 없습니다.','next-turns-description'));
  const grid=el('div',null,'next-turn-grid');
  for(const r of model.ready){
   const a=r.action,card=button('',`next-turn-card${r.mine?' mine':''}${a.기한초과?' response-delayed':''}`,()=>revealWorkElement(document.getElementById(`action-${a.행동ID}`)));card.dataset.actionId=a.행동ID;
   const meta=el('div',null,'next-turn-meta');meta.append(el('span',a.담당부서?.이름||'프로젝트'));if(r.mine)meta.append(el('span','내 차례','next-turn-me'));card.append(meta);
   card.append(el('strong',r.people.map(p=>p.표시명).join(' · ')||'담당자 확인 필요','next-turn-person'),el('span',r.title,'next-turn-task'),el('span',r.scope,'next-turn-scope'));
   const foot=el('div',null,'next-turn-foot'),date=a.처리기한?new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(a.처리기한)):'기한 미지정';
   foot.append(el('span',`${a.기한초과?'기한 초과 · ':''}${date}${a.처리기한?'까지':''}`,a.기한초과?'next-turn-late':'next-turn-due'),el('span',r.mine?'바로 처리 →':'상세 보기 →','next-turn-link'));card.append(foot);grid.append(card);
  }if(model.ready.length)box.append(grid);
  if(model.waiting.length||model.preparing.length){const wait=el('div',null,'next-turn-waiting');wait.append(el('h3','지금은 대기 중'));
   for(const r of model.waiting)wait.append(button(`${r.people.map(p=>p.표시명).join(' · ')} · ${r.title} — ${r.action.미팅대기?'미팅 결론·후속 업무 대기':'선행 처리 대기'} →`,'next-turn-wait-link',()=>revealWorkElement(document.getElementById(`action-${r.action.행동ID}`))));
   for(const b of model.preparing){const intake=data.접수현황?.find(i=>i.부서업무ID===b.ID);wait.append(el('p',`${b.부서명} · ${intake?.접수준비?.담당자?.표시명||'담당자 설정 필요'} — ${intake?.접수준비?.상태||'접수 준비 대기'}`));}box.append(wait);
  }
  return box;
 }
 function overview(data){
  const {phases,model}=requestProgress(data),box=el('section',null,'request-diagram');box.setAttribute('aria-label','업무 진행 다이어그램');
  const header=el('div',null,'request-diagram-heading');header.append(el('h2','업무 진행'),el('span',model.closed?'종결 완료':model.rejected?'비승인으로 종료':displayLabel(data.단계),'request-phase-label'));box.append(header);
  const track=el('ol',null,'request-phase-track');track.setAttribute('aria-label','전체 업무 진행 단계');
  for(const phase of phases){const node=el('li',null,`request-phase ${phase.status}`);node.dataset.phase=phase.id;node.append(el('span',phase.status==='done'?'✓':String(phases.indexOf(phase)+1),'request-phase-dot'),el('strong',phase.title),el('small',toneNames[phase.status]));track.append(node);}
  box.append(track);
  const branchHeading=el('div',null,'request-branches-heading');branchHeading.append(el('h3','부서별 진행'),el('span',`${data.부서업무.length}개 부서 · 부서를 누르면 상세로 이동`));box.append(branchHeading);
  const branches=el('div',null,'request-branches');
  const order=data.접수현황?.map(r=>r.부서업무ID)||data.부서업무.map(b=>b.ID);
  const departments=[...data.부서업무].sort((a,b)=>Number(b.부서ID===data.주관부서?.ID)-Number(a.부서ID===data.주관부서?.ID)||order.indexOf(a.ID)-order.indexOf(b.ID));
  for(const b of departments){
   const intake=data.접수현황?.find(r=>r.부서업무ID===b.ID),node=model.nodes.find(n=>n.subId===b.ID);
   const own=data.현재행동.filter(a=>a.부서업무ID===b.ID&&!['통합제출','통합보완','대표승인','결과확인','결과보완','종결승인'].includes(a.종류));
   let state=own.length?own.map(a=>phaseNames[a.종류]||a.종류).filter((s,i,a)=>a.indexOf(s)===i).join(' · '):b.상태==='접수준비'?intake?.접수준비?.상태||'접수 준비 대기':node?.status==='done'?'부서 계획 승인 완료':b.상태==='제외제안'?'제외 제안 · 승인 대기':b.상태;
   const tone=own.some(a=>a.기한초과)?'late':b.상태==='접수준비'?'waiting':node?.status||'waiting';
   if(model.closed)state='업무 종결';
   const delayed=data.응답지연?.find(r=>r.부서업무ID===b.ID&&r.지연);
   const lateActions=own.filter(a=>a.기한초과);
   const card=el('article',null,`request-branch ${tone}${delayed||lateActions.length?' response-delayed':''}`);
   const main=button('','request-branch-main',()=>{
    const target=own.length?document.getElementById(`action-${own[0].행동ID}`):[...document.querySelectorAll('.department-plan')].find(n=>n.dataset.subId===b.ID);
    revealWorkElement(target);
   });card.dataset.subId=b.ID;card.append(main);
   const head=el('div',null,'request-branch-title');head.append(el('strong',b.부서명));if(b.부서ID===data.주관부서?.ID)head.append(el('small','주관'));main.append(head,el('p',b.요청제목||data.제목,'request-branch-task'),el('span',state,'request-branch-state'));
   const people=[...new Set(own.map(a=>a.담당자.표시명))];
   main.append(el('p',people.length?people.join(' · '):intake?.접수준비?.담당자?.표시명||intake?.책임자?.표시명||intake?.접수담당자?.표시명||'담당자 설정 대기','request-branch-person'));
   if(lateActions.length)card.append(el('p',`⚠ 기한 초과 ${lateActions.length}건`,'deadline-alert'));
   if(delayed){const warning=el('div',null,'response-delay-note');warning.append(el('strong','5일 미응답 지연'),el('small','수락 · 미팅 요청 · 마일스톤 배정 필요'));card.append(warning);}
   else if(own.length>1)card.append(el('small',`${own.length}건 진행 중`,'request-branch-hint'));
   if(assignees)card.append(assignees.control(data,b));
   branches.append(card);
  }
  box.append(branches);
  const current=data.현재행동.filter(a=>['통합제출','통합보완','대표승인','결과확인','결과보완','종결승인'].includes(a.종류));
  if(current.length){const turns=el('div',null,'request-stage-actions');for(const a of current)turns.append(button(`${displayLabel(a.종류)} · ${a.담당자.표시명} →`,'text-button',()=>revealWorkElement(document.getElementById(`action-${a.행동ID}`))));box.append(turns);}
  if(data.변경상태)box.append(el('p',`계획 변경: ${data.변경상태} · 실행은 현재 승인된 계획을 따릅니다.`,'hint'));
  return box;
 }
 return {overview,turns};
}
