export function createDirectiveTasks({el,button,api,openRequest,openWork}){
 async function myTurns(){
  const data=await api('read',{종류:'과제내배정'});if(!data.항목.length)return null;
  const section=el('section',null,'directive-task-list');section.append(el('h2','지시받은 업무'),el('p','배정된 과제의 실행계획을 준비하고 필요한 부서에 업무를 요청해 주세요.','hint'));
  for(const d of data.항목){const card=el('article',null,'directive-task-card');card.append(el('small',`${d.배정자}님 요청 · ${d.코드}`),el('h3',d.제목),el('p',d.목표,'directive-copy'),el('p',d.요청내용,'directive-copy'),el('p',`목표일 ${d.목표일||'미정'}`,'hint'));
   if(d.업무ID)card.append(button('요청한 실행 업무 확인','secondary',()=>openWork(d.업무ID)));
   else{
    if(d.연결업무?.length){card.append(el('p','기존 연결 업무가 있습니다. 중복 요청이 되지 않도록 먼저 확인해 주세요.','hint'));for(const w of d.연결업무){card.append(el('p',`${w.제목} · ${w.단계}`));if(w.상세열람)card.append(button('기존 업무 확인','text-button',()=>openWork(w.ID)));}}
    card.append(button('실행 업무요청 작성','primary',()=>openRequest(d)));
   }section.append(card);
  }return section;
 }return {myTurns};
}
