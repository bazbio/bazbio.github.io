import {errorMessage,personName} from './messages.mjs';

function valueView(el,value){
 const box=el('div');
 for(const [key,label]of [['제목','제목'],['내용','내용'],['완료기준','완료 기준'],['희망기한','희망 기한']])if(key in value)box.append(el('p',`${label}: ${value[key]||'미지정'}`));
 if(value.계획)for(const plan of value.계획.slice(0,1)){
  box.append(el('p',`계획 v${plan.버전} · ${plan.상태}`));
  for(const m of plan.마일스톤)box.append(el('p',`${m.제목} · ${m.담당자목록?.map(p=>personName(p.표시명,p.ID)).join(', ')||personName(m.담당자명)} · ${m.시작일} → ${m.완료일}`),el('p',`완료 기준: ${m.완료기준}`),el('p',`${m.필수?'필수':'선택'} 작업 · ${m.검증필요?`검증 담당: ${personName(m.검증자명)}`:'검증 불필요'}`));
 }
 if(value.계획?.length===0)box.append(el('p','작성된 계획 없음'));
 return box;
}
export function changeHistory(el,items=[]){
 const box=el('section',null,'work-change-history');box.append(el('h4',`업무 수정 이력 · ${items.length}건`));
 if(!items.length)box.append(el('p','이 승인에 포함된 수정 이력이 없습니다.','hint'));
 for(const h of items){const fold=el('details');fold.append(el('summary',`${h.대상} · ${h.수정자} · ${new Date(h.시각).toLocaleString('ko-KR')}`),el('p',`수정 사유: ${h.사유}`));const before=el('div',null,'collaboration-note'),after=el('div',null,'collaboration-note');before.append(el('strong','수정 전'),valueView(el,h.이전));after.append(el('strong','수정 후'),valueView(el,h.이후));fold.append(before,after);box.append(fold);}
 return box;
}
export function createWorkChanges({el,button,api,send,refresh,open,isBusy,message}){
 function field(form,label,type,value='',required=true){const wrap=el('label',label),input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;else input.rows=3;input.value=value||'';input.required=required;input.setAttribute('aria-label',label);input.name=label;wrap.append(input);form.append(wrap);return input;}
 function error(form){const node=el('p','','error');node.setAttribute('role','alert');form.append(node);return node;}
 async function run(form,request){if(isBusy())return;const err=form.querySelector('[role=alert]');try{err.textContent='';const result=await send(request);if(result){await refresh(request.업무ID);message(request.종류==='업무삭제요청'?'대표님께 삭제 승인을 요청했습니다.':'처리가 반영되었습니다.');}else err.textContent='기존 요청의 처리 결과를 먼저 확인해 주세요.';}catch(e){err.textContent=errorMessage(e);}}
 const payload=(data,kind,args,sub=null)=>({종류:kind,업무ID:data.업무ID,부서업무ID:sub,기대업무개정:data.업무개정,인자:args});
 function overview(data){
  const box=el('section',null,'detail-card work-changes');box.append(el('h3','업무 내용 관리'));
  const pending=data.삭제요청?.find(r=>r.상태==='대기');
  if(data.삭제시각)box.append(el('p','대표님 승인으로 삭제된 업무입니다. 업무 내용과 처리 이력은 보관됩니다.','notice'));
  if(pending)box.append(el('p','대표님이 삭제 요청을 검토 중입니다. 검토가 끝날 때까지 업무 처리가 잠깁니다.','notice'));
  for(const r of data.삭제요청||[]){
   const card=el('article',null,'deletion-request');card.append(el('h4',`${r.대상} 삭제 · ${r.상태}`),el('p',`${r.요청자} · ${new Date(r.요청시각).toLocaleString('ko-KR')}`,'hint'),el('p',`삭제 사유: ${r.사유}`),valueView(el,r.당시내용));
   if(r.당시내용.새주관부서)card.append(el('p',`승인 후 주관 부서: ${r.당시내용.새주관부서}`));
   const affected=(r.당시내용.실행||[]).filter(m=>!r.부서업무_id||m.부서업무ID===r.부서업무_id);
   if(affected.length){card.append(el('p','삭제 승인 시 아래 실행 업무를 종료하고 선행 조건에서 제외합니다.'));for(const m of affected)card.append(el('p',`${m.부서명} · ${m.제목} · ${m.상태}`));}
   if(r.처리의견)card.append(el('p',`대표님 의견: ${r.처리의견}`));
   if(r.승인가능){const form=el('form'),note=field(form,'삭제 검토 의견','textarea','',false);note.maxLength=2000;const err=error(form),actions=el('div',null,'actions');form.append(actions);
    for(const [label,kind]of [['삭제 승인','업무삭제승인'],['삭제 반려','업무삭제반려']]){const b=el('button',label,kind==='업무삭제승인'?'primary':'secondary');b.type='submit';b.value=kind;actions.append(b);}
    form.addEventListener('submit',e=>{e.preventDefault();const kind=e.submitter.value;if(kind==='업무삭제반려'&&!note.value.trim()){err.textContent='반려 사유를 입력해 주세요.';return;}void run(form,payload(data,kind,{요청ID:r.ID,의견:note.value.trim()||null}));});card.append(form);
   }box.append(card);
  }
  const locked=data.삭제시각||pending||['완료','비승인'].includes(data.단계)||data.프로젝트?.보류||data.통합계획?.some(v=>v.상태==='제출')||data.종결?.심사.some(v=>v.상태==='제출');
  if(!locked){
   const targets=[...(data.내용관리?[{ID:null,이름:'전체 업무요청',제목:data.제목,내용:data.목적,완료기준:data.완료기준,기한:data.희망기한}]:[]),...data.부서업무.filter(b=>b.내용관리&&!b.삭제시각).map(b=>({ID:b.ID,이름:b.부서명,제목:b.요청제목,내용:b.요청내용,완료기준:b.요청완료기준,기한:b.요청희망기한,주관:b.부서ID===data.주관부서?.ID}))];
   if(targets.length){const fold=el('details');fold.append(el('summary','업무 내용 수정·삭제 요청'));const label=el('label','관리할 업무'),select=el('select');select.setAttribute('aria-label','관리할 업무');targets.forEach((t,i)=>select.append(new Option(t.이름,String(i))));label.append(select);const forms=el('div');fold.append(label,forms);box.append(fold);
    const paint=()=>{forms.replaceChildren();const t=targets[Number(select.value)],edit=el('form');edit.dataset.draftKey=`work-edit:${t.ID||data.업무ID}`;
     const title=field(edit,'수정 업무 제목','text',t.제목),body=field(edit,'수정 업무 내용','textarea',t.내용),criteria=field(edit,'수정 완료 기준','textarea',t.완료기준),due=field(edit,'수정 희망 기한','date',t.기한,false),reason=field(edit,'업무 수정 사유','textarea');title.maxLength=200;body.maxLength=t.ID?2000:10000;criteria.maxLength=t.ID?2000:10000;reason.maxLength=2000;error(edit);
     edit.append(el('p',t.ID?'수정 후 부서 접수와 계획 승인을 다시 진행합니다. 수정 이력은 대표님 최종 승인에 포함됩니다.':'수정 이력을 대표님 최종 승인에 포함합니다. 부서별 배정 내용은 해당 부서를 선택해 수정하세요.','hint'));
     const save=el('button','업무 내용 수정 저장','primary');save.type='submit';edit.append(save);edit.addEventListener('submit',e=>{e.preventDefault();void run(edit,payload(data,t.ID?'부서요청수정':'업무내용수정',t.ID?{요청제목:title.value,요청내용:body.value,완료기준:criteria.value,희망기한:due.value||null,사유:reason.value}:{제목:title.value,내용:body.value,완료기준:criteria.value,희망기한:due.value||null,사유:reason.value},t.ID));});forms.append(edit);
     const deletion=el('form');deletion.append(el('h4','삭제 요청'));const why=field(deletion,'업무 삭제 사유','textarea');why.maxLength=2000;let lead;
     if(t.주관){const wrap=el('label','삭제 후 새 주관 부서');lead=el('select');lead.setAttribute('aria-label','삭제 후 새 주관 부서');lead.required=true;lead.append(new Option('새 주관 부서를 선택하세요',''),...data.부서업무.filter(b=>b.ID!==t.ID&&!b.삭제시각&&b.상태==='배정완료').map(b=>new Option(b.부서명,b.ID)));wrap.append(lead);deletion.append(wrap);if(lead.options.length===1)deletion.append(el('p','남은 배정완료 부서가 없습니다. 전체 업무요청을 선택해 삭제를 요청하세요.','hint'));}
     deletion.append(el('p','대표님 승인 전에는 삭제되지 않습니다. 승인 후 업무를 종료하며 기존 기록은 보관합니다.','hint'));error(deletion);const request=el('button','대표님께 삭제 승인 요청','secondary danger-button');request.type='submit';if(lead?.options.length===1)request.disabled=true;deletion.append(request);deletion.addEventListener('submit',e=>{e.preventDefault();void run(deletion,payload(data,'업무삭제요청',{사유:why.value,새주관부서업무ID:lead?.value||null},t.ID));});forms.append(deletion);
    };select.addEventListener('change',paint);paint();
   }
  }
  box.append(changeHistory(el,data.수정이력));return box;
 }
 async function myTurns(){const data=await api('read',{종류:'업무삭제승인함'});if(!data.항목.length)return null;const box=el('section',null,'detail-card');box.append(el('h3','업무 삭제 승인 대기'));for(const r of data.항목)box.append(button(`${r.제목} · ${r.대상} 삭제 · ${r.요청자}`,'work-card',()=>open(r.업무ID)));return box;}
 return {overview,myTurns};
}
