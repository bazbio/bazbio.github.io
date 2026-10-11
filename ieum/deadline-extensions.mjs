import {errorMessage,displayLabel} from './messages.mjs';

export function createDeadlineExtensions({el,button,api,send,refresh,refreshList,isBusy,message}){
  const when=value=>new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'short'});
  function field(form,title,tag,name){const label=el('label',title),input=el(tag);input.name=name;input.setAttribute('aria-label',title);label.append(input);form.append(label);return input;}
  function wire(form,build,onDone){
    const error=el('p','','error');error.setAttribute('role','alert');form.append(error);
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(isBusy())return;
      try{error.textContent='';const command=build(event);if(!command)return;const result=await send(command);if(result){await onDone();message('지연 요청 처리가 반영되었습니다.');}}
      catch(e){error.textContent=errorMessage(e);}
    });
  }
  function request(data,action){
    const allowed=data.지연요청가능?.find(a=>a.행동ID===action.행동ID);
    if(!allowed?.요청가능||data.프로젝트?.보류)return null;
    const box=el('details',null,'extension-request detail-fold');box.append(el('summary','지연 요청'));
    const form=el('form',null,'detail-fold-body');form.dataset.draftKey=`extension:${action.행동ID}`;
    form.append(el('p',`${allowed.승인자} 님에게 승인을 요청합니다. 승인 전까지 기존 처리 기한이 유지됩니다.`,'hint'));
    const reason=field(form,'지연 사유','textarea','extensionReason');reason.required=true;reason.maxLength=2000;reason.rows=3;reason.placeholder='늦어지는 이유와 남은 작업을 적어 주세요.';
    const date=field(form,'변경 희망일','input','extensionDate');date.type='date';date.required=true;
    form.append(el('p','선택한 날짜의 한국시간 자정 전까지 연장을 요청합니다. 현재 처리 단계에만 적용되며 이후 단계와 승인된 계획 일정은 별도입니다.','hint'));
    const submit=el('button','부서장에게 지연 요청','secondary');submit.type='submit';form.append(submit);
    wire(form,()=>({종류:'지연요청',업무ID:data.업무ID,행동ID:action.행동ID,인자:{사유:reason.value,희망일:date.value}}),()=>refresh(data.업무ID));box.append(form);return box;
  }
  function card(r,onDone){
    const node=el('article',null,'extension-card');
    node.append(el('span',r.상태==='대기'?'부서장 승인 대기':r.상태,'badge'),el('h3',`${r.제목} · ${displayLabel(r.종류)}${r.마일스톤제목?' · '+r.마일스톤제목:''}`),el('p',`${r.요청자} · ${when(r.생성시각)}`,'hint'),el('p',r.사유,'extension-reason'),el('p',`기존 ${when(r.이전기한)} → 희망 ${when(r.희망기한)}`,'extension-dates'));
    if(r.처리시각)node.append(el('p',`${r.처리자||'자동 처리'} · ${when(r.처리시각)}${r.처리의견?' · '+r.처리의견:''}`,'hint'));
    if(r.승인가능){
      const form=el('form');form.dataset.draftKey=`extension-review:${r.ID}`;
      const note=field(form,'승인·반려 의견','textarea','extensionReview');note.rows=2;note.maxLength=2000;
      const actions=el('div',null,'actions');for(const [kind,title,style] of [['지연승인','기한 연장 승인','primary'],['지연반려','반려','secondary']]){const b=el('button',title,style);b.type='submit';b.value=kind;actions.append(b);}form.append(actions);
      wire(form,event=>{const kind=event.submitter?.value||'지연승인';if(kind==='지연반려'&&!note.value.trim())throw new Error('반려 사유를 적어 주세요.');return {종류:kind,업무ID:r.업무ID,행동ID:r.행동ID,인자:{요청ID:r.ID,의견:note.value.trim()||null}};},onDone);node.append(form);
    }
    return node;
  }
  function history(data){
    if(!data.지연요청?.length)return null;
    const box=el('section',null,'detail-card extension-history');box.append(el('h2','지연 요청 · 승인 이력'),el('p','승인한 현재 단계의 처리 기한만 변경됩니다. 이후 새 승인 계획이 적용되면 해당 계획의 일정이 우선합니다.','hint'));
    for(const r of data.지연요청)box.append(card(r,()=>refresh(data.업무ID)));return box;
  }
  async function myTurns(){const result=await api('read',{종류:'지연승인함'});if(!result.항목.length)return null;const box=el('section',null,'detail-card extension-inbox');box.append(el('h2',`지연 요청 승인 · ${result.항목.length}건`));for(const r of result.항목)box.append(card(r,refreshList));return box;}
  return {request,history,myTurns};
}
