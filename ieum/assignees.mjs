import {errorMessage} from './messages.mjs';

export function createAssignees({el,button,api,send,refresh,isBusy,message,handleError}){
 function control(data,b){
  const wrap=el('div',null,'assignee-control');
  if(!b?.책임자ID||!b.책임자변경)return wrap;
  const change=button('담당자 변경','assignee-change',()=>void open(data,b));
  change.setAttribute('aria-label',`${b.부서명} 담당자 변경`);
  if(!b.책임자변경.가능){
   const help=el('details',null,'assignee-help');help.append(el('summary','담당자 변경 안내'),el('p',b.책임자변경.사유,'hint'));wrap.append(help);
  }else wrap.append(change);
  return wrap;
 }
 async function open(data,b){
  if(isBusy())return;
  const dialog=el('dialog',null,'assignee-dialog');dialog.setAttribute('aria-label',`${b.부서명} 담당자 변경`);
  dialog.append(el('h2','담당자 변경'),el('p',`${b.부서명} · ${b.요청제목||data.제목}`,'muted'),el('p',`현재 담당자: ${b.책임자변경.담당자명||'확인 필요'}`,'assignee-current'));
  const form=el('form');dialog.append(form);
  const label=el('label','새 담당자'),select=el('select');select.setAttribute('aria-label','새 담당자');select.required=true;select.disabled=true;label.append(select);form.append(label);
  const why=el('label','변경 사유'),reason=el('textarea');reason.setAttribute('aria-label','변경 사유');reason.required=true;reason.maxLength=2000;reason.rows=2;reason.placeholder='예: 담당 업무 조정으로 인계';why.append(reason);form.append(why);
  form.append(el('p','부서 업무의 계획 작성과 현재 처리 차례를 인계합니다. 기존 계획·마일스톤 담당자·기한·승인 이력은 유지됩니다.','hint'));
  if(b.부서ID===data.주관부서?.ID)form.append(el('p','주관 부서이므로 전체 업무 책임자도 함께 변경됩니다.','notice'));
  const error=el('p','담당자 목록을 불러오고 있습니다.','hint');error.setAttribute('role','status');form.append(error);
  const actions=el('div',null,'actions'),cancel=button('취소','secondary',()=>dialog.close()),save=el('button','담당자 변경 저장','primary');save.type='submit';save.disabled=true;actions.append(cancel,save);form.append(actions);
  let saving=false;dialog.addEventListener('cancel',e=>{if(saving)e.preventDefault();});dialog.addEventListener('close',()=>dialog.remove());document.querySelector('#content').append(dialog);dialog.showModal();
  form.addEventListener('submit',async e=>{
   e.preventDefault();if(saving||isBusy()||!select.value)return;saving=true;cancel.disabled=true;save.disabled=true;
   try{
    error.textContent='';const result=await send({종류:'책임자변경',업무ID:data.업무ID,부서업무ID:b.ID,기대업무개정:data.업무개정,인자:{구성원ID:select.value,사유:reason.value}});
    if(result){dialog.close();await refresh(data.업무ID);message('담당자를 변경했습니다. 새 담당자의 현재 차례에 반영되었습니다.');}
    else{error.className='error';error.textContent='먼저 응답을 확인하지 못한 요청의 처리 결과를 확인해 주세요.';}
   }catch(e){error.className='error';error.setAttribute('role','alert');error.textContent=errorMessage(e);if(e.status===401)handleError(e);}
   finally{saving=false;cancel.disabled=false;save.disabled=false;}
  });
  try{
   const candidates=await api('read',{종류:'책임자변경후보',업무ID:data.업무ID,부서업무ID:b.ID});if(!dialog.isConnected)return;
   select.append(new Option('새 담당자를 선택하세요',''),...candidates.항목.map(m=>new Option(m.표시명,m.ID)));
   select.disabled=!candidates.항목.length;save.disabled=select.disabled;
   error.textContent=select.disabled?'이 부서에 가입을 마친 다른 담당자가 없습니다. 가입 완료 후 다시 시도해 주세요.':'';
   if(!select.disabled)select.focus();
  }catch(e){if(!dialog.isConnected)return;error.className='error';error.setAttribute('role','alert');error.textContent=errorMessage(e);if(e.status===401)handleError(e);}
 }
 return {control};
}
