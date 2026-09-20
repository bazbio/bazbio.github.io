// 출처(최초 요청/협업 추가)와 주관 역할을 구분한다.
export function getLeadDepartmentWork(detail){
 const lead=detail.부서업무.find(b=>b.부서ID===detail.주관부서?.ID);
 if(lead)return lead;
 // 0010 이하 서버의 단일 최초 요청 응답만 호환한다. 복수 루트는 추측하지 않는다.
 if(!detail.주관부서&&detail.흐름버전!==2){const roots=detail.부서업무.filter(b=>!b.기원부서업무ID);if(roots.length===1)return roots[0];}
 throw new Error('주관 부서 정보를 확인할 수 없습니다. 새로고침해 주세요.');
}

// 같은 차례/요청 개정의 폼만 복원한다. 새 승인 대상에 옛 입력을 옮기지 않는다.
export function captureWorkDrafts(root){
 return [...root.querySelectorAll('form[data-draft-key]')].map(form=>({
  key:form.dataset.draftKey,open:form.closest('details')?.open,
  fields:[...form.querySelectorAll('input,textarea,select')].filter(n=>n.type!=='file').map(n=>({name:n.name||n.getAttribute('aria-label'),value:n.value,checked:n.checked,type:n.type}))
 }));
}
export function restoreWorkDrafts(root,drafts){
 for(const form of root.querySelectorAll('form[data-draft-key]')){
  const draft=drafts.find(d=>d.key===form.dataset.draftKey);if(!draft)continue;
  if(draft.open&&form.closest('details'))form.closest('details').open=true;
  for(const field of draft.fields){
   const input=[...form.querySelectorAll('input,textarea,select')].find(n=>(n.name||n.getAttribute('aria-label'))===field.name&&n.type===field.type);if(!input)continue;
   if(input.tagName==='SELECT'&&![...input.options].some(o=>o.value===field.value&&!o.disabled))continue;
   input.value=field.value;if(['checkbox','radio'].includes(input.type))input.checked=field.checked;
   input.dispatchEvent(new Event('change',{bubbles:true}));
  }
 }
}
