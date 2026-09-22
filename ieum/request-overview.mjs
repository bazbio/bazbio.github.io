import {displayLabel} from './messages.mjs';
import {buildFlowMap} from './flow-map.mjs';

const phaseNames={접수판단:'요청 검토',책임자배정:'담당자 배정',계획작성:'계획 작성',부서승인:'계획 승인',자료보완:'자료 보완',부서요청조정:'요청 조정',주관조정:'주관 부서 조정'};
const toneNames={done:'완료',current:'진행 중',late:'기한 초과',waiting:'대기',excluded:'제외',stopped:'반려'};
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
export function createRequestOverview({el,button}){
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
   const card=button('',`request-branch ${tone}`,()=>{
    const target=own.length?document.getElementById(`action-${own[0].행동ID}`):[...document.querySelectorAll('.department-plan')].find(n=>n.dataset.subId===b.ID);
    revealWorkElement(target);
   });card.dataset.subId=b.ID;
   const head=el('div',null,'request-branch-title');head.append(el('strong',b.부서명));if(b.부서ID===data.주관부서?.ID)head.append(el('small','주관'));card.append(head,el('p',b.요청제목||data.제목,'request-branch-task'),el('span',state,'request-branch-state'));
   const people=[...new Set(own.map(a=>a.담당자.표시명))];
   card.append(el('p',people.length?people.join(' · '):intake?.접수준비?.담당자?.표시명||intake?.책임자?.표시명||intake?.접수담당자?.표시명||'담당자 설정 대기','request-branch-person'));
   if(own.some(a=>a.기한초과))card.append(el('small','처리 기한 초과','request-branch-late'));
   else if(own.length>1)card.append(el('small',`${own.length}건 진행 중`,'request-branch-hint'));
   branches.append(card);
  }
  box.append(branches);
  const current=data.현재행동.filter(a=>['통합제출','통합보완','대표승인','결과확인','결과보완','종결승인'].includes(a.종류));
  if(current.length){const turns=el('div',null,'request-stage-actions');for(const a of current)turns.append(button(`${displayLabel(a.종류)} · ${a.담당자.표시명} →`,'text-button',()=>revealWorkElement(document.getElementById(`action-${a.행동ID}`))));box.append(turns);}
  if(data.변경상태)box.append(el('p',`계획 변경: ${data.변경상태} · 실행은 현재 승인된 계획을 따릅니다.`,'hint'));
  return box;
 }
 return {overview};
}
