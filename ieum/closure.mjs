export function createClosure({el,send,refresh,getInfo,isBusy,message,handleError}) {
  const closed=d=>Boolean(d.종결?.종결시각);
  const pending=d=>d.종결?.심사.find(r=>r.상태==='제출');
  const main=d=>d.부서업무.find(b=>!b.기원부서업무ID).ID;
  function request(d,kind,args,a,sub=main(d)){return {종류:kind,업무ID:d.업무ID,부서업무ID:a?.부서업무ID||sub,기대업무개정:d.업무개정,인자:args,...(a?{행동ID:a.행동ID}:{})};}
  function note(form,label,required=true){const wrap=el('label',label),input=el('textarea');input.rows=3;input.required=required;input.maxLength=2000;input.setAttribute('aria-label',label);wrap.append(input);form.append(wrap);return input;}
  function button(form,label,kind,secondary=false){const b=el('button',label,secondary?'secondary':'primary');b.type='submit';b.value=kind;form.append(b);return b;}
  function error(form){const box=el('p','','error');box.setAttribute('role','alert');form.append(box);return box;}
  async function run(form,input){if(isBusy())return;const err=form.querySelector('[role=alert]');try{err.textContent='';const result=await send(input);if(result){await refresh(input.업무ID);message('처리가 반영되었습니다. 다음 차례를 확인하세요.');}else err.textContent='이전 요청의 처리 결과를 먼저 확인해 주세요.';}catch(e){err.textContent=e.message;if(e.status===409)message('최신 내용을 확인한 뒤 다시 처리해 주세요. 작성한 내용은 유지됩니다.',true);if(e.status===401)handleError(e);}}
  function targets(form,d){
    const field=el('fieldset',null,'rework-targets');field.append(el('legend','재작업할 완료 작업'));
    for(const m of d.실행.filter(m=>m.상태==='완료')){const label=el('label',`${m.부서명} · ${m.제목}`,'check-label'),check=el('input');check.type='checkbox';check.value=m.ID;check.setAttribute('aria-label',`재작업 대상: ${m.제목}`);label.append(check);field.append(label);}
    const impact=el('p','작업을 선택하면 새 회차로 돌아갈 후속 작업도 표시됩니다.','hint');field.append(impact);
    const selected=()=>[...field.querySelectorAll('input:checked')].map(x=>x.value);
    field.addEventListener('change',()=>{const affected=new Set(selected()),edges=d.통합계획.find(v=>v.ID===d.유효통합계획ID)?.선행관계||[];let changed=true;while(changed){changed=false;for(const edge of edges)if(affected.has(edge.선행ID)&&!affected.has(edge.후행ID)){affected.add(edge.후행ID);changed=true;}}
      impact.textContent=affected.size?`새 회차 대상: ${d.실행.filter(m=>affected.has(m.ID)&&m.상태!=='종료').map(m=>m.제목).join(', ')}`:'재작업할 작업을 선택하세요.';});
    form.append(field);return selected;
  }
  function reasonFold(d,title,label,kind,args,sub){const fold=el('details');fold.append(el('summary',title));const form=el('form',null,'execution-form'),input=note(form,label);error(form);button(form,title,kind,true);form.addEventListener('submit',e=>{e.preventDefault();run(form,request(d,kind,{...args,사유:input.value},null,sub));});fold.append(form);return fold;}
  function overview(d){
    const box=el('section',null,'detail-card closure-overview');box.hidden=!d.종결||!d.유효통합계획ID;if(box.hidden)return box;
    box.append(el('h3','결과 확인과 종결'));
    if(closed(d))box.append(el('p',`업무가 종결되었습니다 · ${new Date(d.종결.종결시각).toLocaleString('ko-KR')}`,'success'));
    else if(d.현재행동.some(a=>['결과확인','종결승인','결과보완'].includes(a.종류))){
      if(d.종결.준비미완료.length){const list=el('ul',null,'closure-checks');for(const reason of d.종결.준비미완료)list.append(el('li',reason));box.append(list);}
      else box.append(el('p','필수 작업 완료와 선택 작업 정리가 끝났습니다. 요청자 확인과 대표 종결 승인을 진행하세요.','hint'));
    }else box.append(el('p','필수 작업의 완료와 검증이 끝나면 요청자가 결과를 확인합니다.','hint'));
    for(const r of d.종결.심사){const fold=el('details');fold.append(el('summary',`종결 심사 ${r.회차}회차 · ${r.상태}`),el('p',`${r.승인자명} · ${r.확인본문}`,'report-body'));box.append(fold);}
    for(const r of d.종결.기록){const row=el('div',null,'round-record');row.append(el('strong',`${r.종류} · ${r.작성자}`),el('p',r.본문||''));if(r.대상ids?.length)row.append(el('p',`대상: ${r.대상ids.map(id=>d.실행.find(m=>m.ID===id)?.제목||'과거 작업').join(', ')}`,'hint'));box.append(row);}
    if(pending(d)&&d.요청자.ID===getInfo().본인.ID)box.append(reasonFold(d,'결과 확인 철회','확인 철회 사유','결과확인철회',{심사ID:pending(d).id}));
    if(!closed(d)&&!pending(d)&&!d.통합계획.some(v=>v.상태==='제출')&&d.전체책임자?.ID===getInfo().본인.ID&&d.실행.filter(m=>m.필수).every(m=>m.상태==='완료')){
      for(const m of d.실행.filter(m=>!m.필수&&!['완료','종료'].includes(m.상태)))box.append(reasonFold(d,`선택 작업 종료 · ${m.제목}`,'선택 작업 종료 사유','선택작업종료',{통합계획ID:d.유효통합계획ID,마일스톤ID:m.ID},m.부서업무ID));
    }
    return box;
  }
  function action(d,a){
    const form=el('form',null,'closure-form');
    if(a.종류==='결과확인'){
      const input=note(form,'결과 확인 의견'),selected=targets(form,d),err=error(form),buttons=el('div',null,'actions');form.append(buttons);
      const accept=button(buttons,'결과 확인 · 종결 승인 요청','결과확인');accept.disabled=d.종결.준비미완료.length>0;
      button(buttons,'선택한 작업 보완 요청','결과보완요청',true);
      form.addEventListener('submit',e=>{e.preventDefault();const kind=e.submitter.value;if(kind==='결과보완요청'&&!selected().length){err.textContent='보완할 완료 작업을 선택해 주세요.';return;}
        run(form,request(d,kind,{통합계획ID:d.유효통합계획ID,...(kind==='결과확인'?{본문:input.value}:{사유:input.value,마일스톤IDs:selected()})},a));});
    }else if(a.종류==='종결승인'){
      const review=pending(d);form.append(el('p',`종결 심사 ${review.회차}회차 · 요청자 확인`,'plan-state'),el('p',review.확인본문,'report-body'));
      for(const m of review.당시실행){const row=el('div',null,'round-record');row.append(el('strong',`${m.제목} · ${m.상태} · ${m.실행회차}회차`),el('p',m.정리사유||m.회차이력.at(-1)?.보고본문||''));form.append(row);}
      const input=note(form,'종결 검토 의견',false),err=error(form),buttons=el('div',null,'actions');form.append(buttons);button(buttons,'종결 승인','종결승인');button(buttons,'종결 보완 요청','종결보완',true);
      form.addEventListener('submit',e=>{e.preventDefault();const kind=e.submitter.value;if(kind==='종결보완'&&!input.value.trim()){err.textContent='보완이 필요한 이유를 적어 주세요.';return;}run(form,request(d,kind,{심사ID:review.id,...(kind==='종결승인'?{의견:input.value.trim()||null}:{사유:input.value})},a));});
    }else{
      const record=d.종결.기록.filter(r=>r.종류==='종결보완').at(-1);if(record)form.append(el('p',record.본문,'decision-note'));
      const input=note(form,'결과 보완 내용'),selected=targets(form,d),err=error(form),buttons=el('div',null,'actions');form.append(buttons);
      button(buttons,'자료 보완 제출','자료');button(buttons,'선택한 작업 재작업','재작업',true);button(buttons,'계획 변경으로 연결','계획변경',true);
      form.addEventListener('submit',e=>{e.preventDefault();const decision=e.submitter.value;if(decision==='재작업'&&!selected().length){err.textContent='재작업할 완료 작업을 선택해 주세요.';return;}run(form,request(d,'결과보완처리',{결정:decision,본문:input.value,마일스톤IDs:decision==='재작업'?selected():[]},a));});
    }return form;
  }
  return {overview,action};
}
