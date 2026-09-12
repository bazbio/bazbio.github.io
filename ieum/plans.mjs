// 계획 화면은 공통 명령 전송기를 사용하여 응답 유실·개정 충돌 처리를 공유한다.
export function createPlans({el,button,api,send,refresh,getInfo,isBusy,message,handleError}) {
  function field(form,label,type='text',value='',required=true){
    const wrap=el('label',label), input=el(type==='textarea'?'textarea':type==='select'?'select':'input');
    if(!['textarea','select'].includes(type))input.type=type;
    input.setAttribute('aria-label',label);input.required=required;
    if(type==='textarea'){input.rows=3;input.maxLength=2000;}
    if(type==='text')input.maxLength=200;
    if(type==='date'){input.min='2000-01-01';input.max='2199-12-31';}
    if(type==='checkbox'){input.checked=!!value;wrap.className='check-label';}else input.value=value;
    wrap.append(input);form.append(wrap);return input;
  }
  function submit(form,label,value,className='primary'){
    const b=el('button',label,className);b.type='submit';b.value=value;form.append(b);return b;
  }
  function errorBox(form){const err=el('p','','error');err.setAttribute('role','alert');form.append(err);return err;}
  function payload(data,sub,kind,args,action){return {종류:kind,업무ID:data.업무ID,부서업무ID:sub,기대업무개정:data.업무개정,인자:args,...(action?{행동ID:action.행동ID}:{})};}
  async function run(form,request,success='처리가 반영되었습니다. 다음 차례를 확인하세요.'){
    const err=form.querySelector('[role=alert]');
    try{err.textContent='';const result=await send(request);if(result){await refresh(request.업무ID);message(success);}else err.textContent='기존 요청의 처리 결과를 먼저 확인해 주세요.';}
    catch(e){err.textContent=e.message;if(e.status===409)message('새로고침으로 최신 내용을 확인해 주세요. 작성한 내용은 유지됩니다.',true);if(e.status===401)handleError(e);}
  }
  function departments(select,data){select.append(new Option('부서를 선택하세요',''),...getInfo().부서.filter(d=>!data.부서업무.some(b=>b.부서ID===d.ID)).map(d=>new Option(d.이름,d.ID)));}
  function milestoneView(plan){
    const list=el('ol',null,'milestone-list');
    for(const m of plan.마일스톤){const row=el('li',null,'milestone-view');row.append(el('strong',m.제목),el('span',m.필수?'종결 필수':'선택','badge neutral'),el('p',`${m.시작일} → ${m.완료일} · ${m.담당자명}`),el('p',m.완료기준,'muted'),el('small',m.검증필요?`완료 검증: ${m.검증자명}`:'완료 검증 생략'));list.append(row);}
    if(!list.children.length)list.append(el('p','저장한 마일스톤이 없습니다.','muted'));return list;
  }
  function versionView(plan){
    const node=el('div');node.append(el('p',`계획 v${plan.버전} · ${plan.상태}`,'plan-state'),milestoneView(plan));
    if(plan.결정)node.append(el('p',`${plan.결정.결정자} · ${plan.결정.결과}${plan.결정.사유?' — '+plan.결정.사유:''}`,'decision-note'));
    return node;
  }
  function overview(data){
    const wrap=el('section',null,'detail-card');wrap.append(el('h3','부서별 협업과 계획'));
    if(data.통합제출대기)wrap.append(el('p','부서 승인이 모두 완료되었습니다. 전체 책임자의 통합 제출을 기다립니다.','notice'));
    for(const b of data.부서업무){
      const box=el('section',null,'department-plan');box.dataset.subId=b.ID;
      box.append(el('h4',b.부서명),el('span',b.상태,'badge neutral'));
      if(b.요청내용)box.append(el('p',b.요청내용,'collaboration-note'));
      if(b.제외제안사유)box.append(el('p',`범위 제외 제안: ${b.제외제안사유} · 최종 결정은 대표 승인 시 반영됩니다.`,'hint'));
      const latest=b.계획[0];
      if(latest)box.append(versionView(latest));else box.append(el('p','부서 계획 작성 전입니다.','muted'));
      if(b.계획.length>1){const history=el('details');history.append(el('summary','이전 계획과 승인 이력'));for(const p of b.계획.slice(1))history.append(versionView(p));box.append(history);}
      const me=getInfo().본인.ID;
      if(!data.종결?.종결시각&&!data.종결?.심사.some(r=>r.상태==='제출')&&!data.통합계획?.some(v=>v.상태==='제출')&&latest?.상태==='승인'&&b.책임자ID===me){
        const fold=el('details');fold.append(el('summary','계획 수정하기'));const form=el('form');
        const reason=field(form,'계획 수정 사유','textarea');errorBox(form);submit(form,'새 버전 작성 시작','revise','secondary');
        form.addEventListener('submit',e=>{e.preventDefault();if(!isBusy())run(form,payload(data,b.ID,'계획수정시작',{사유:reason.value}));});fold.append(form);box.append(fold);
      }
      if(!data.종결?.종결시각&&!data.종결?.심사.some(r=>r.상태==='제출')&&!data.통합계획?.some(v=>v.상태==='제출')&&b.상태==='배정완료'&&data.전체책임자&&(me===b.책임자ID||me===data.전체책임자.ID)){
        const fold=el('details');fold.append(el('summary','다른 부서에 협업 요청'));const form=el('form');
        const target=field(form,'협업 요청할 부서','select');departments(target,data);
        const note=field(form,'협업 요청 내용','textarea');note.maxLength=10000;
        errorBox(form);submit(form,'협업 요청 보내기','collaborate','secondary');
        form.addEventListener('submit',e=>{e.preventDefault();if(!isBusy())run(form,payload(data,b.ID,'협업요청',{수신부서ID:target.value,본문:note.value}));});fold.append(form);box.append(fold);
      }
      wrap.append(box);
    }return wrap;
  }
  async function action(data,a){
    if(a.종류==='통합제출')return el('p','부서별 승인 계획이 준비되었습니다. 통합 계획 제출과 대표 승인 기능은 다음 개발 단계에서 연결됩니다. 아직 업무 착수 승인은 나지 않았습니다.','hint');
    const form=el('form');form.className='plan-form';
    const b=data.부서업무.find(x=>x.ID===a.부서업무ID);
    if(a.종류==='협업후속판단'){
      const choice=field(form,'협업 후속 결정','select');choice.append(new Option('같은 부서에 재요청','재요청'),new Option('다른 부서에 요청','다른부서'),new Option('범위 제외 제안','제외제안'));
      const target=field(form,'대체 요청할 부서','select');departments(target,data);target.disabled=true;target.parentElement.hidden=true;
      choice.addEventListener('change',()=>{target.disabled=choice.value!=='다른부서';target.parentElement.hidden=target.disabled;});
      const reason=field(form,'후속 결정 사유','textarea');errorBox(form);submit(form,'후속 결정 반영','followup');
      form.addEventListener('submit',e=>{e.preventDefault();if(!isBusy())run(form,payload(data,b.ID,'협업후속판단',{결정:choice.value,사유:reason.value,수신부서ID:choice.value==='다른부서'?target.value:null},a));});
    }else if(a.종류==='부서승인'){
      const plan=b.계획.find(p=>p.ID===a.계획ID);form.append(el('p',`승인 대상: ${b.부서명} 계획 v${plan.버전}`,'hint'));
      const note=field(form,'계획 검토 의견','textarea','',false);errorBox(form);const buttons=el('div',null,'actions');form.append(buttons);submit(buttons,'부서 계획 승인','부서계획승인');submit(buttons,'계획 보완 요청','부서계획보완','secondary');
      form.addEventListener('submit',e=>{e.preventDefault();if(isBusy())return;const kind=e.submitter.value;
        if(kind==='부서계획보완'&&!note.value.trim()){form.querySelector('[role=alert]').textContent='보완이 필요한 내용을 적어 주세요.';note.focus();return;}
        run(form,payload(data,b.ID,kind,{계획ID:a.계획ID,...(kind==='부서계획승인'?{의견:note.value.trim()||null}:{사유:note.value})},a));});
    }else if(a.종류==='계획작성'){
      const candidates=(await api('read',{종류:'계획후보',업무ID:data.업무ID,부서업무ID:b.ID})).항목;
      const latest=b.계획[0], draft=latest?.상태==='초안'?latest:null;
      form.append(el('p',`계획 작성 담당자로 배정되었습니다. ${latest?.상태==='보완'?`v${latest.버전}의 보완 사항을 새 버전에 반영하세요.`:'마일스톤별 담당자와 일정을 작성하세요.'}`,'hint'));
      const rows=el('div',null,'milestone-editor');form.append(rows);
      let dirty=false;let submitButton;
      const changed=()=>{dirty=true;if(submitButton)submitButton.disabled=true;};
      function person(select,value){select.append(new Option('담당자를 선택하세요',''),...candidates.map(m=>new Option(m.표시명,m.ID)));if(value&&!candidates.some(m=>m.ID===value))select.append(new Option('현재 배정 불가 · 다시 선택하세요',value));select.value=value||'';}
      function add(m={ID:crypto.randomUUID(),필수:true,검증필요:false}){
        if(rows.children.length>=40)return;
        const row=el('fieldset');row.dataset.id=m.ID;row.append(el('legend',`마일스톤 ${rows.children.length+1}`));
        const title=field(row,'마일스톤 제목','text',m.제목||'');title.name='title';
        const owner=field(row,'마일스톤 담당자','select');person(owner,m.담당자ID);owner.name='owner';
        const dates=el('div',null,'form-grid');row.append(dates);const start=field(dates,'시작일','date',m.시작일||''),end=field(dates,'완료일','date',m.완료일||'');start.name='start';end.name='end';
        const criteria=field(row,'마일스톤 완료 기준','textarea',m.완료기준||'');criteria.name='criteria';
        const required=field(row,'종결에 필요한 마일스톤','checkbox',m.필수,false);required.name='mandatory';
        const check=field(row,'완료 후 검증 필요','checkbox',m.검증필요,false);check.name='verify';
        const verifier=field(row,'완료 검증자','select');person(verifier,m.검증자ID);verifier.name='verifier';verifier.disabled=!check.checked;verifier.parentElement.hidden=!check.checked;
        check.addEventListener('change',()=>{verifier.disabled=!check.checked;verifier.parentElement.hidden=!check.checked;});
        row.append(button('마일스톤 삭제','text-button danger-button',()=>{row.remove();[...rows.children].forEach((r,i)=>r.querySelector('legend').textContent=`마일스톤 ${i+1}`);changed();}));
        row.addEventListener('input',changed);row.addEventListener('change',changed);rows.append(row);
      }
      if(latest?.마일스톤.length)latest.마일스톤.forEach(add);else if(!draft)add();
      form.append(button('＋ 마일스톤 추가','secondary',()=>{add();changed();}));errorBox(form);
      const buttons=el('div',null,'actions');form.append(buttons);submit(buttons,'초안 저장','save','secondary');submitButton=submit(buttons,'부서 승인 요청','submit');submitButton.disabled=!draft||!draft.마일스톤.length;
      form.append(el('p','내용을 바꾼 뒤에는 초안을 먼저 저장하세요. 제출 후에는 승인자가 검토하며, 보완 시 새 버전을 작성합니다.','hint'));
      form.addEventListener('submit',e=>{e.preventDefault();if(isBusy())return;
        if(e.submitter.value==='submit'){if(!draft||dirty)return;run(form,payload(data,b.ID,'계획제출',{계획ID:draft.ID},a));return;}
        const milestones=[...rows.children].map(row=>{const val=n=>row.querySelector(`[name=${n}]`);return {ID:row.dataset.id,제목:val('title').value,담당자ID:val('owner').value,시작일:val('start').value,완료일:val('end').value,완료기준:val('criteria').value,검증필요:val('verify').checked,검증자ID:val('verify').checked?val('verifier').value:null,필수:val('mandatory').checked};});
        if(milestones.some(m=>m.시작일>m.완료일)){form.querySelector('[role=alert]').textContent='완료일은 시작일 이후여야 합니다.';return;}
        run(form,payload(data,b.ID,'계획저장',{계획ID:draft?.ID||null,마일스톤:milestones},a),'초안을 저장했습니다. 내용을 확인한 뒤 부서 승인을 요청하세요.');});
    }
    return form;
  }
  return {overview,action};
}
