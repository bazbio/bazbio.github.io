export function createCollaboration({el,button,send,refresh,getInfo,isBusy,message,handleError}){
 const fmt=x=>new Date(x).toLocaleString('ko-KR');
 const local=x=>{const d=new Date(x);return new Date(+d-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
 function field(form,label,type='textarea',value='',required=true){const wrap=el('label',label),input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.value=value;input.required=required;input.setAttribute('aria-label',label);if(type==='textarea'){input.rows=3;input.maxLength=10000;}wrap.append(input);form.append(wrap);return input;}
 function fold(label){const node=el('details');node.append(el('summary',label));return node;}
 function form(data,sub,kind,args,action){const f=el('form'),err=el('p','','error');err.setAttribute('role','alert');f.append(err);f.addEventListener('submit',async e=>{e.preventDefault();if(isBusy())return;try{err.textContent='';const result=await send({종류:kind,업무ID:data.업무ID,부서업무ID:sub,기대업무개정:data.업무개정,...(action?{행동ID:action.행동ID}:{}),인자:args()});if(result){await refresh(data.업무ID);message('처리가 반영되었습니다. 다음 차례를 확인하세요.');}}catch(error){err.textContent=error.message;if(error.status===401)handleError(error);if(error.status===409)message('최신 내용을 새로고침한 뒤 다시 확인해 주세요. 입력 내용은 유지됩니다.',true);}});return f;}
 function submit(f,label){const b=el('button',label,'primary');b.type='submit';f.append(b);}
 function schedule(data,f,m){const agenda=field(f,'미팅 안건','textarea',m?.안건||''),start=field(f,'미팅 시작','datetime-local',local(m?.시작시각||Date.now()+86400000)),end=field(f,'미팅 종료','datetime-local',local(m?.종료시각||Date.now()+90000000)),place=field(f,'미팅 장소·접속 정보','text',m?.장소||'');
   agenda.maxLength=2000;place.maxLength=500;const members=el('fieldset');members.append(el('legend','참석자 · 현재 업무 참여자'));const checked=[];
   for(const p of data.참여자){const label=el('label',p.표시명,'check-label'),input=el('input');input.type='checkbox';input.value=p.ID;input.setAttribute('aria-label',`미팅 참석자: ${p.표시명}`);input.checked=m?m.참석자ids.includes(p.ID):[getInfo().본인.ID,data.요청자.ID].includes(p.ID);if(p.ID===getInfo().본인.ID){input.checked=true;input.disabled=true;}label.prepend(input);members.append(label);checked.push(input);}f.append(members);
   return ()=>({안건:agenda.value,시작시각:new Date(start.value).toISOString(),종료시각:new Date(end.value).toISOString(),장소:place.value,참석자IDs:checked.filter(x=>x.checked).map(x=>x.value)});
 }
 function request(data,a){const box=fold('미팅 요청');let fields;const f=form(data,a.부서업무ID,'미팅요청',()=>fields(),a);fields=schedule(data,f);submit(f,'미팅 요청 보내기');box.append(f);return box;}
 function overview(data){const box=el('section',null,'detail-card meeting-overview');box.append(el('h3','미팅과 후속 업무'));
   if(!data.미팅?.length){box.append(el('p','검토 중 협의가 필요하면 담당자의 차례에서 미팅을 요청하세요.','hint'));return box;}
   for(const m of data.미팅){const card=el('article',null,'meeting-item');card.append(el('span',m.상태,'badge'),el('h4',m.안건),el('p',`${fmt(m.시작시각)} ~ ${fmt(m.종료시각)} · ${m.장소}`),el('p',`미팅 담당: ${m.요청자명} · 참석: ${m.참석자ids.map(id=>data.참여자.find(p=>p.ID===id)?.표시명||'참여 종료').join(', ')}`,'hint'));
     if(m.본문)card.append(el('p',m.본문,'meeting-result'));
     for(const f of m.후속){const item=el('div',null,'meeting-followup');item.append(el('strong',f.내용),el('p',`${f.담당자명} · ${fmt(f.처리기한)}까지 · ${f.완료시각?'완료':'대기'}`,'hint'));if(f.완료본문)item.append(el('p',f.완료본문));card.append(item);}
     if(m.상태==='예정'&&m.요청자_id===getInfo().본인.ID){
       const edit=fold('미팅 일정 변경');let values,reason;const f=form(data,m.부서업무_id,'미팅변경',()=>({...values(),미팅ID:m.id,사유:reason.value}));values=schedule(data,f,m);reason=field(f,'일정 변경 사유');reason.maxLength=2000;submit(f,'미팅 일정 변경 저장');edit.append(f);card.append(edit);
       const cancel=fold('미팅 취소');let note;const cf=form(data,m.부서업무_id,'미팅취소',()=>({미팅ID:m.id,사유:note.value}));note=field(cf,'미팅 취소 사유');note.maxLength=2000;submit(cf,'미팅 취소 확정');cancel.append(cf);card.append(cancel);
     }box.append(card);
   }return box;
 }
 function action(data,a){
   if(a.종류==='미팅후속'){const m=data.미팅.find(m=>m.id===a.미팅ID),target=m?.후속.find(f=>f.id===a.미팅후속ID);if(!target)return el('p','최신 내용을 새로고침해 주세요.');let note;const f=form(data,a.부서업무ID,'미팅후속완료',()=>({후속ID:target.id,본문:note.value}));f.append(el('p',target.내용));note=field(f,'미팅 후속 완료 내용');submit(f,'미팅 후속 완료');return f;}
   const m=data.미팅.find(m=>m.id===a.미팅ID);if(!m)return el('p','최신 내용을 새로고침해 주세요.');let note;const rows=[];
   const f=form(data,a.부서업무ID,'미팅결론',()=>({미팅ID:m.id,본문:note.value,후속:rows.map(r=>({내용:r.content.value,담당자ID:r.person.value,처리기한:new Date(r.due.value).toISOString()}))}));
   f.append(el('p',m.안건),el('p','결론과 후속 업무를 기록하세요. 원래 승인 판단은 후속 업무를 마친 뒤 직접 처리합니다.','hint'));note=field(f,'미팅 결론');const list=el('div');f.append(list);
   const add=button('후속 업무 추가','secondary',()=>{if(rows.length>=10)return;const row=el('fieldset');row.append(el('legend',`후속 업무`));const content=field(row,'후속 업무 내용');content.maxLength=2000;const label=el('label','후속 담당자'),person=el('select');person.required=true;person.setAttribute('aria-label','후속 담당자');person.append(new Option('담당자 선택',''),...data.참여자.map(p=>new Option(p.표시명,p.ID)));label.append(person);row.append(label);const due=field(row,'후속 처리기한','datetime-local',local(Date.now()+172800000));const record={content,person,due};rows.push(record);row.append(button('후속 업무 삭제','text-button',()=>{rows.splice(rows.indexOf(record),1);row.remove();add.disabled=false;}));list.append(row);add.disabled=rows.length>=10;});f.append(add);submit(f,'미팅 결론 제출');return f;
 }
 return {overview,action,request};
}
