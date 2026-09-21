const states={접수준비:['접수 준비 대기','preparing'],접수검토:['수락 대기','waiting'],수락:['수락 완료','accepted'],배정완료:['수락 완료','accepted'],보완:['보완 요청','supplement'],비승인:['반려 · 조정 필요','rejected'],제외제안:['제외 제안','excluded']};
const state=row=>row.상태==='접수준비'?[row.접수준비?.상태||'접수 준비 대기','preparing']:states[row.상태]||[row.상태||'상태 확인','unknown'];
export function summarizeIntake(rows){
 const counts={accepted:0,waiting:0,supplement:0,rejected:0,excluded:0,unknown:0,preparing:0};
 for(const row of rows)counts[states[row.상태]?.[1]||'unknown']++;
 return {counts,text:[`수락 ${counts.accepted}/${rows.length}개 부서`,counts.preparing&&`접수 준비 ${counts.preparing}`,counts.waiting&&`응답 대기 ${counts.waiting}`,counts.supplement&&`보완 ${counts.supplement}`,counts.rejected&&`반려 ${counts.rejected}`,counts.excluded&&`제외 제안 ${counts.excluded}`,counts.unknown&&`상태 확인 ${counts.unknown}`].filter(Boolean).join(' · ')};
}
const time=value=>value?new Intl.DateTimeFormat('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'}).format(new Date(value)):'미지정';
export function createIntakeProgress({el,button,api}){
 function compact(rows){
  const box=el('div',null,'intake-compact');box.append(el('p',summarizeIntake(rows).text,'intake-summary'));
  const tags=el('div',null,'intake-tags');for(const row of rows){const [label,tone]=state(row);tags.append(el('span',`${row.부서명} · ${label}`,`intake-tag ${tone}`));}box.append(tags);return box;
 }
 function overview(data){
  if(!Array.isArray(data.접수현황))return el('div');
  const box=el('section',null,'detail-card intake-progress');box.setAttribute('aria-label','부서별 수락 현황');
  const heading=el('div',null,'intake-heading'),body=el('div'),stamp=el('p','','hint'),error=el('p','','error');error.setAttribute('role','alert');
  let loading=false;
  const refresh=button('접수 현황 새로고침','secondary',async()=>{
   if(loading)return;loading=true;refresh.disabled=true;error.textContent='';body.setAttribute('aria-busy','true');
   try{const latest=await api('read',{종류:'업무상세',업무ID:data.업무ID});if(box.isConnected)render(latest);}
   catch(e){error.textContent=e.status===401?'로그인이 만료되었습니다. 다시 로그인해 주세요.':'접수 현황을 갱신하지 못했습니다. 다시 시도해 주세요.';}
   finally{loading=false;refresh.disabled=false;body.setAttribute('aria-busy','false');}
  });
  heading.append(el('h3','부서별 수락 현황'),refresh);box.append(heading,stamp,body,error);
  function render(current){
   const rows=current.접수현황||[];body.replaceChildren();body.append(el('p',summarizeIntake(rows).text,'intake-summary'));
   stamp.textContent=`${time(new Date())} 조회 · 업무 요청에 대한 수락 현황입니다. 변경 내용은 새로고침으로 확인하세요.`;
   const list=el('div',null,'intake-list');
   for(const row of rows){
    const [label,tone]=state(row),card=el('article',null,`intake-row ${tone}`);card.dataset.departmentId=row.부서ID;
    const top=el('div',null,'intake-row-heading');top.append(el('strong',row.부서명),el('span',label,`intake-tag ${tone}`));if(row.주관)top.append(el('span','주관','badge neutral'));card.append(top);
    if(row.요청제목)card.append(el('p',row.요청제목,'intake-title'));
    if(tone==='preparing'){
     const prep=row.접수준비;card.append(el('p',prep?.사유||'접수 준비가 완료되면 담당자에게 전달됩니다.','intake-person'));
     if(prep?.담당자)card.append(el('p',`예정 접수 담당자 ${prep.담당자.표시명}`,'hint'));
     if(prep?.초대상태)card.append(el('p',`${prep.초대상태}${prep.초대만료시각?' · 만료 '+time(prep.초대만료시각):''}${['초대 만료','초대 철회','초대 미발급'].includes(prep.초대상태)?' · 관리자 초대 발급 필요':''}`,'hint'));
     card.append(el('p','요청은 저장되었습니다. 접수 준비가 완료되면 자동으로 전달되며, 그때부터 접수 기한이 시작됩니다.','hint'));
    }else if(tone==='accepted')card.append(el('p',row.응답?.결과==='수락'?`수락자 ${row.응답.처리자} · ${time(row.응답.시각)}`:'수락 완료 · 수락자 기록 확인 필요','intake-person'));
    else if(tone==='waiting'){
     card.append(el('p',`접수 담당자 ${row.접수담당자?.표시명||'확인 필요'} · 아직 수락하지 않았습니다.`,'intake-person'));
     card.append(el('p',`${row.회차>1?'재검토 · ':''}${row.접수행동상태==='보류'?'미팅 협의 후 검토 · ':''}접수 처리 기한 ${time(row.접수기한)}`,'hint'));
    }else if(row.응답){card.append(el('p',`${row.응답.결과==='비승인'?'반려':row.응답.결과} · ${row.응답.처리자} · ${time(row.응답.시각)}`,'intake-person'));}
    if(row.응답?.의견)card.append(el('p',row.응답.의견,'intake-note'));
    if(row.책임자)card.append(el('p',`업무 담당자 ${row.책임자.표시명}`,'hint'));
    const turns=(row.현재행동||[]).filter(a=>a.종류!=='접수판단');
    if(turns.length)card.append(el('p',`현재 차례: ${turns.map(a=>`${a.담당자.표시명} · ${a.종류}${a.상태==='보류'?'(보류)':''}`).join(' / ')}`,'hint'));
    list.append(card);
   }body.append(list);
  }
  render(data);return box;
 }
 return {compact,overview};
}
