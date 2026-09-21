import {errorMessage} from './messages.mjs';

// 폼은 제출 성공 때만 비운다. 모달 닫기·라우팅 오류·응답 유실은 입력을 보존한다.
export function createRequests({el,button,api,send,getInfo,isBusy,onCreated,handleError}){
 const form=document.querySelector('#request-form'),dialog=document.querySelector('#request-dialog');
 const region=document.querySelector('#multi-request'),cards=document.querySelector('#department-requests');
 const lead=document.querySelector('#request-lead'),add=document.querySelector('#add-request-department');
 const error=document.querySelector('#request-error'),submit=form.querySelector('button[type=submit]');
 const hint=document.querySelector('#request-count'),sizeHint=document.querySelector('#request-size');
 let modern=false,readiness=new Map(),load=0;
 const fields=()=>[...cards.children];
 function field(parent,label,name,type,max){
  const wrap=el('label',label),input=el(type==='select'?'select':type==='textarea'?'textarea':'input');
  input.name=name;input.setAttribute('aria-label',label);input.required=type!=='date';
  if(type==='date'){input.type='date';input.min='2000-01-01';input.max='2199-12-31';}
  if(type==='textarea')input.rows=2;if(max)input.maxLength=max;
  wrap.append(input);parent.append(wrap);return input;
 }
 function get(card,name){return card.querySelector(`[name=${name}]`);}
 function update(){
  const rows=fields(),selected=rows.map(c=>get(c,'requestDepartment').value).filter(Boolean),before=lead.value;
  const departments=getInfo().부서.filter(d=>selected.includes(d.ID));
  lead.replaceChildren(new Option('주관 부서를 선택하세요',''),...departments.map(d=>new Option(d.이름,d.ID)));
  lead.value=selected.includes(before)?before:selected.length===1?selected[0]:'';
  rows.forEach((card,i)=>{
   card.querySelector('legend').textContent=`부서 요청 ${i+1}`;
   const select=get(card,'requestDepartment');
   for(const option of select.options)option.disabled=Boolean(option.value&&selected.includes(option.value)&&option.value!==select.value);
   const status=readiness.get(select.value),node=card.querySelector('.request-readiness');
   node.textContent=status&&!status.접수가능?[status.상태,status.사유,status.초대상태].filter(Boolean).join(' · '):select.value===lead.value?'주관 부서 · 전체 일정과 협의 조정':'';
   node.className=status&&!status.접수가능?'request-readiness error':'request-readiness hint';
   const isLead=Boolean(lead.value&&select.value===lead.value);
   card.querySelector('.remove-request').disabled=rows.length===1||isLead;
   card.querySelector('.remove-request').title=isLead?'주관 부서를 먼저 변경해 주세요.':'';
  });
  add.disabled=rows.length>=Math.min(20,getInfo().부서.length);
  submit.textContent=`${rows.length}개 부서에 요청 보내기`;
  hint.textContent=getInfo().기능?.접수준비대기?`${rows.length}개 부서의 요청을 등록합니다. 가입·담당자 설정을 기다리는 부서는 요청을 저장하고 준비 완료 후 자동으로 전달합니다.`:`${rows.length}개 부서에 각각 접수 요청을 보냅니다. 확정 일정과 실행 순서는 계획 수립 후 정합니다.`;
 }
 function addCard(){
  if(fields().length>=Math.min(20,getInfo().부서.length))return;
  const card=el('fieldset',null,'department-request');card.append(el('legend','부서 요청'));
  const top=el('div',null,'request-card-top');card.append(top);
  const select=field(top,'요청 부서','requestDepartment','select');
  select.append(new Option('부서를 선택하세요',''),...getInfo().부서.map(d=>new Option(d.이름,d.ID)));
  const remove=button('부서 삭제','text-button danger-button remove-request',()=>{if((lead.value&&select.value===lead.value)||isBusy())return;card.remove();update();});top.append(remove);
  card.append(el('p','','request-readiness hint'));
  field(card,'부서 업무 제목','requestTitle','text',200);
  field(card,'부서 요청 내용','requestContent','textarea',2000);
  field(card,'부서 완료 기준','requestCriteria','textarea',2000);
  field(card,'부서 희망 완료일','requestDue','date');
  select.addEventListener('change',update);cards.append(card);update();return select;
 }
 function input(){
  const common={제목:form.elements.title.value,목적:form.elements.purpose.value,완료기준:form.elements.criteria.value,희망기한:form.elements.due.value||null};
  if(!modern)return {종류:'요청제출',인자:{...common,수신부서ID:form.elements.department.value}};
  return {종류:'다부서요청제출',인자:{...common,주관부서ID:lead.value,부서요청:fields().map(c=>({수신부서ID:get(c,'requestDepartment').value,요청제목:get(c,'requestTitle').value,요청내용:get(c,'requestContent').value,완료기준:get(c,'requestCriteria').value,희망기한:get(c,'requestDue').value||null}))}};
 }
 function size(){return new TextEncoder().encode(JSON.stringify({...input(),멱등키:'00000000-0000-4000-8000-000000000000'})).length;}
 function configure(){
  modern=getInfo().기능?.다부서요청===true;region.hidden=!modern;dialog.classList.toggle('multi-request-dialog',modern);
  const legacy=form.elements.department;legacy.disabled=modern;legacy.parentElement.hidden=modern;
  legacy.replaceChildren(new Option('부서를 선택하세요',''),...getInfo().부서.map(d=>new Option(d.이름,d.ID)));
  lead.disabled=!modern;lead.required=modern;readiness.clear();cards.replaceChildren();
  if(modern)addCard();else submit.textContent='요청 보내기';
 }
 async function open(){
  if(isBusy())return;error.textContent='';dialog.showModal();
  if(!modern)return;
  const version=++load;
  try{const data=await api('read',{종류:'요청가능부서'});if(version!==load)return;readiness=new Map(data.항목.map(d=>[d.ID,d]));update();}
  catch(e){if(version===load){error.textContent=errorMessage(e);if(e.status===401)handleError(e);}}
 }
 function reset(){load++;form.reset();cards.replaceChildren();readiness.clear();sizeHint.textContent='';error.textContent='';}
 function acceptResult(){dialog.close();reset();configure();}
 function close(){if(!isBusy())dialog.close();}
 document.querySelector('#close-dialog').addEventListener('click',close);
 document.querySelector('#cancel-request').addEventListener('click',close);
 dialog.addEventListener('cancel',e=>{if(isBusy())e.preventDefault();});
 add.addEventListener('click',()=>{if(!isBusy())addCard()?.focus();});lead.addEventListener('change',update);
 form.addEventListener('input',()=>{sizeHint.textContent=modern&&size()>60*1024?'내용이 길어 전송 한도에 가깝습니다. 부서별 내용을 요약해 주세요.':'';});
 form.addEventListener('submit',async e=>{
  e.preventDefault();if(isBusy())return;error.textContent='';
  try{
   if(modern){
    const ids=fields().map(c=>get(c,'requestDepartment').value);
    if(new Set(ids).size!==ids.length)throw new Error('같은 부서를 두 번 선택할 수 없습니다.');
    const unavailable=ids.filter(id=>readiness.get(id)?.접수가능===false);
    if(unavailable.length&&!getInfo().기능?.접수준비대기)throw new Error(`${getInfo().부서.filter(d=>unavailable.includes(d.ID)).map(d=>d.이름).join(', ')}의 접수 담당자 설정이 필요합니다. 입력 내용은 유지됩니다.`);
    if(size()>65536)throw new Error('요청 내용이 너무 깁니다. 부서별 내용을 요약해 주세요.');
   }
   const result=await send(input());
   if(result){acceptResult();await onCreated(result);}
   else error.textContent='기존 요청의 처리 결과를 먼저 확인해 주세요.';
  }catch(e){error.textContent=errorMessage(e);if(e.status===401)handleError(e);}
 });
 return {configure,open,reset,acceptResult};
}
