// 통합 승인과 실행 UI. 기존 인증·멱등·충돌 처리기를 공유한다.
export function createExecution({el,button,send,refresh,getInfo,isBusy,message,handleError}){
  const main=data=>data.부서업무.find(b=>!b.기원부서업무ID);
  const isOwner=data=>data.전체책임자?.ID===getInfo().본인.ID;
  const pending=data=>data.통합계획.find(v=>v.상태==='제출');
  function note(form,label,required=true){const wrap=el('label',label),input=el('textarea');input.rows=3;input.required=required;input.maxLength=2000;input.setAttribute('aria-label',label);wrap.append(input);form.append(wrap);return input;}
  function error(form){const box=el('p','','error');box.setAttribute('role','alert');form.append(box);return box;}
  function submit(form,label,kind,secondary=false){const b=el('button',label,secondary?'secondary':'primary');b.type='submit';b.value=kind;form.append(b);return b;}
  function request(data,kind,args,action,sub=main(data).ID){return {종류:kind,업무ID:data.업무ID,부서업무ID:action?.부서업무ID||sub,기대업무개정:data.업무개정,인자:args,...(action?{행동ID:action.행동ID}:{})};}
  async function run(form,input){
    const err=form.querySelector('[role=alert]');try{err.textContent='';const result=await send(input);if(result){await refresh(input.업무ID);message('처리가 반영되었습니다. 다음 차례를 확인하세요.');}else err.textContent='기존 요청의 처리 결과를 먼저 확인해 주세요.';}
    catch(e){err.textContent=e.message;if(e.status===409)message('최신 내용을 확인한 뒤 다시 처리해 주세요. 작성한 내용은 유지됩니다.',true);if(e.status===401)handleError(e);}
  }
  function scopeView(v){
    const box=el('div',null,'integrated-scope');box.append(el('p',v.요약,'collaboration-note'));
    const list=el('ul');for(const b of v.범위)list.append(el('li',b.제외?`${b.부서명} · 제외 ${v.상태==='승인'?'승인':'제안'}: ${b.제외사유}`:`${b.부서명} · 부서 계획 v${b.부서계획버전}`));box.append(list);
    const milestones=el('ol',null,'milestone-list');for(const m of v.마일스톤){const row=el('li',null,'milestone-view');row.append(el('strong',m.제목),el('p',`${m.시작일} → ${m.완료일} · ${m.담당자명} · ${m.필수?'종결 필수':'선택'}`),el('p',m.완료기준,'muted'),el('small',m.검증필요?`완료 검증: ${m.검증자명}`:'완료 검증 생략'));milestones.append(row);}box.append(milestones);
    const names=new Map(v.마일스톤.map(m=>[m.ID,m.제목]));if(v.선행관계.length){const deps=el('ul',null,'dependency-list');for(const edge of v.선행관계)deps.append(el('li',`${names.get(edge.선행ID)} 완료 → ${names.get(edge.후행ID)} 착수`));box.append(el('p','선행 작업 관계','plan-state'),deps);}else box.append(el('p','선행 제약 없이 각각 착수할 수 있습니다.','hint'));
    if(v.결정)box.append(el('p',`${v.결정.결정자명} · ${v.결정.결과}${v.결정.사유?' — '+v.결정.사유:''}`,'decision-note'));return box;
  }
  function reasonForm(data,title,label,kind,args={},sub){
    const fold=el('details');fold.append(el('summary',title));const form=el('form');form.className='execution-form';const reason=note(form,label);error(form);submit(form,title,kind,true);
    form.addEventListener('submit',e=>{e.preventDefault();if(!isBusy())run(form,request(data,kind,{...args,사유:reason.value},null,sub));});fold.append(form);return fold;
  }
  function overview(data){
    const box=el('section',null,'detail-card integrated-overview');box.append(el('h3','통합 승인과 실행 현황'));
    const current=data.통합계획.find(v=>v.ID===data.유효통합계획ID);
    if(current){
      const required=data.실행.filter(m=>m.필수),done=required.filter(m=>m.상태==='완료');box.append(el('p',`유효 통합계획 v${current.버전}${data.변경상태?' · '+data.변경상태:''}`,'plan-state'),el('p',`필수 마일스톤 완료율 · ${done.length}/${required.length}개 완료`));
      const progress=el('progress');progress.max=required.length||1;progress.value=done.length;progress.setAttribute('aria-label','필수 마일스톤 완료율');box.append(progress);
      const list=el('div',null,'execution-list');
      for(const m of data.실행){
        const row=el('article',null,'execution-item');row.dataset.milestoneId=m.ID;row.append(el('h4',`${m.부서명} · ${m.제목}`),el('span',`${m.상태} · ${m.실행회차}회차`,`badge ${m.현재기한초과?'late':'neutral'}`),el('p',`${m.담당자명} · ${m.시작일} → ${m.완료일}`));
        row.append(el('p',m.최초완료일?`최초 승인 완료일 ${m.최초완료일}${m.최초기한초과?' · 최초 기준 지연':''}`:'최초 승인 이후 추가된 작업','hint'));
        if(m.현재기한초과)row.append(el('p',m.상태==='완료'?'현재 승인 일정 이후 완료되었습니다.':'현재 승인 완료일을 지났습니다.','error'));
        if(m.정리사유)row.append(el('p',`선택 작업 종료 사유: ${m.정리사유}`,'decision-note'));
        if(m.상태==='선행대기')row.append(el('p',`선행 작업 완료 대기: ${m.선행ID.map(id=>data.실행.find(x=>x.ID===id)?.제목||'선행 작업').join(', ')}`,'hint'));
        const history=el('details');history.append(el('summary','완료 보고와 실행 이력'));
        for(const r of m.회차이력){const item=el('div',null,'round-record');item.append(el('strong',`${r.회차}회차 · ${r.상태}${r.대체시각?' · 후속 회차로 연결':''}`));if(r.보고본문)item.append(el('p',r.보고본문));if(r.대체사유)item.append(el('p',r.대체사유,'hint'));history.append(item);}
        for(const r of m.기록.filter(r=>r.종류.startsWith('검증')))history.append(el('p',`${r.회차}회차 ${r.종류} · ${r.작성자}${r.본문?' — '+r.본문:''}`,'decision-note'));
        row.append(history);list.append(row);
      }box.append(list);
    }else box.append(el('p','대표 승인 전입니다. 실행 진척도는 승인 후 계산합니다.','hint'));
    for(const v of data.통합계획){const fold=el('details');fold.append(el('summary',`통합계획 v${v.버전} · ${v.상태}${v.ID===data.유효통합계획ID?' · 현재 실행 기준':''}`),scopeView(v));box.append(fold);}
    if(isOwner(data)&&!data.종결?.종결시각&&!data.종결?.심사.some(r=>r.상태==='제출')){
      const review=pending(data);
      if(review)box.append(reasonForm(data,'대표 제출 철회','제출 철회 사유','통합제출철회',{통합계획ID:review.ID}));
      else{
        if(current&&!data.통합수정사유&&!data.현재행동.some(a=>['통합제출','통합보완'].includes(a.종류)))box.append(reasonForm(data,'통합 계획 변경 시작','통합 계획 변경 사유','통합수정시작'));
        for(const b of data.부서업무.filter(b=>b.상태==='배정완료'&&b.계획[0]?.상태==='승인'))box.append(reasonForm(data,`${b.부서명}에 계획 수정 요청`,'부서에 전달할 수정 사유','부서계획수정요청',{},b.ID));
      }
    }return box;
  }
  function action(data,a){
    if(a.종류==='결과확인')return el('p','필수 마일스톤이 모두 완료되었습니다. 요청자의 결과 확인과 종결 승인 기능은 다음 단계에서 연결됩니다.','hint');
    const form=el('form');form.className='execution-form';
    if(['통합제출','통합보완'].includes(a.종류)){
      const prior=data.통합계획[0];if(a.종류==='통합보완'&&prior?.결정?.사유)form.append(el('p',`보완 사항: ${prior.결정.사유}`,'decision-note'));
      const summary=note(form,'통합 계획 요약');summary.value=prior?.요약||'';
      const roster=el('ul');const candidates=[];let ready=true;
      for(const b of data.부서업무){if(b.상태==='제외제안'){roster.append(el('li',`${b.부서명} · 제외 제안: ${b.제외제안사유}`));continue;}
        const p=b.계획[0];if(p?.상태!=='승인'||b.상태!=='배정완료')ready=false;
        roster.append(el('li',`${b.부서명} · ${p?'계획 v'+p.버전+' '+p.상태:'계획 미작성'}`));if(p?.상태==='승인')for(const m of p.마일스톤)candidates.push({...m,부서명:b.부서명});
      }form.append(roster,el('p','먼저 끝나야 하는 작업이 있으면 선행 관계를 추가하세요.','hint'));
      const edges=el('div',null,'dependency-editor');form.append(edges);
      function add(edge={}){
        if(edges.children.length>=300)return;const row=el('div',null,'dependency-row');
        for(const [label,key] of [['먼저 완료할 작업','선행ID'],['이후 착수할 작업','후행ID']]){const wrap=el('label',label),select=el('select');select.name=key;select.required=true;select.setAttribute('aria-label',label);select.append(new Option('작업을 선택하세요',''),...candidates.map(m=>new Option(`${m.부서명} · ${m.제목}`,m.ID)));select.value=edge[key]||'';wrap.append(select);row.append(wrap);}
        row.append(button('관계 삭제','text-button',()=>row.remove()));edges.append(row);
      }
      if(prior)for(const edge of prior.선행관계)if(candidates.some(m=>m.ID===edge.선행ID)&&candidates.some(m=>m.ID===edge.후행ID))add(edge);
      form.append(button('＋ 선행 관계 추가','secondary',()=>add()));error(form);const submitButton=submit(form,'대표 승인 요청','통합계획제출');submitButton.disabled=!ready;
      if(!ready)form.append(el('p','부서 계획의 승인이 모두 끝나면 제출할 수 있습니다.','hint'));
      form.addEventListener('submit',e=>{e.preventDefault();if(isBusy()||!ready)return;const graph=[...edges.children].map(row=>({선행ID:row.querySelector('[name=선행ID]').value,후행ID:row.querySelector('[name=후행ID]').value}));run(form,request(data,'통합계획제출',{요약:summary.value,선행관계:graph},a));});
    }else if(a.종류==='대표승인'){
      const v=data.통합계획.find(v=>v.ID===a.통합계획ID);form.append(el('p',`승인 대상: 통합계획 v${v.버전}`,'plan-state'),scopeView(v));
      const memo=note(form,'대표 검토 의견',false);error(form);const buttons=el('div',null,'actions');form.append(buttons);submit(buttons,'최종안 승인','대표승인');submit(buttons,'통합 계획 보완 요청','대표보완',true);
      form.addEventListener('submit',e=>{e.preventDefault();if(isBusy())return;const kind=e.submitter.value;if(kind==='대표보완'&&!memo.value.trim()){form.querySelector('[role=alert]').textContent='보완이 필요한 내용을 적어 주세요.';return;}run(form,request(data,kind,{통합계획ID:v.ID,...(kind==='대표승인'?{의견:memo.value.trim()||null}:{사유:memo.value})},a));});
    }else{
      const m=data.실행.find(m=>m.ID===a.마일스톤ID);form.append(el('h4',m.제목),el('p',m.완료기준,'collaboration-note'));
      let memo;const buttons=el('div',null,'actions');
      if(a.종류==='검증'){form.append(el('p',`완료 보고 · ${m.실행회차}회차`,'plan-state'),el('p',m.회차이력.at(-1)?.보고본문||'','report-body'));memo=note(form,'완료 검증 의견',false);submit(buttons,'검증 승인','검증승인');submit(buttons,'재작업 요청','검증보완',true);}
      else if(a.종류==='수행'){memo=note(form,'완료 보고 내용');memo.maxLength=10000;submit(buttons,'완료 보고','완료보고');}
      else submit(buttons,a.종류==='재작업'?'재작업 시작':'작업 시작','착수');
      error(form);form.append(buttons);
      form.addEventListener('submit',e=>{e.preventDefault();if(isBusy())return;const kind=e.submitter.value;if(kind==='검증보완'&&!memo.value.trim()){form.querySelector('[role=alert]').textContent='재작업이 필요한 이유를 적어 주세요.';return;}
        const args={통합계획ID:a.통합계획ID,마일스톤ID:a.마일스톤ID,실행회차:a.실행회차,...(kind==='완료보고'?{본문:memo.value}:kind==='검증승인'?{의견:memo.value.trim()||null}:kind==='검증보완'?{사유:memo.value}:{})};run(form,request(data,kind,args,a));});
    }return form;
  }
  return {overview,action};
}
