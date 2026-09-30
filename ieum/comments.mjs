import {errorMessage,displayLabel} from './messages.mjs';

// 대화만 갱신하여 승인/계획 작성 폼을 건드리지 않는다. 초안은 로그인 세션 메모리에만 둔다.
export function createComments({el,button,api,send,getInfo,isBusy}){
 const drafts=new Map();let active=null;
 function reset(){active?.dispose();active=null;drafts.clear();}
 function mount(workID){
  active?.dispose();
  const key=`${getInfo().본인.ID}:${workID}`;
  if(!drafts.has(key))drafts.set(key,{body:'',people:new Set()});
  const draft=drafts.get(key);let disposed=false,loading=false,submitting=false,older=false,cursor=null,version=0,timer;
  const panel=el('aside',null,'project-comments');panel.id='project-comments';panel.setAttribute('aria-label','프로젝트 대화');
  const heading=el('div',null,'comments-heading');heading.append(el('h2','프로젝트 대화'));
  const refresh=button('새로고침','quiet',()=>load());heading.append(refresh);
  const help=el('p','승인 요청이나 진행 상황을 함께 공유하세요.','hint');
  const form=el('form',null,'comment-compose'),label=el('label','코멘트');
  const input=el('textarea');input.name='comment';input.maxLength=3000;input.rows=4;input.required=true;input.placeholder='예: 부서 계획 확인 후 승인 부탁드립니다.';input.value=draft.body;label.append(input);
  input.addEventListener('input',()=>{draft.body=input.value;});
  const recipients=el('details',null,'comment-recipients'),summary=el('summary','알릴 사람 선택'),choices=el('div',null,'comment-choices');recipients.append(summary,choices);
  const note=el('p','선택한 사람에게 이음 알림을 보냅니다. 대화는 이 업무 참여자에게 공개됩니다.','hint');
  const status=el('p',null,'comment-status');status.setAttribute('role','status');
  const submit=el('button','코멘트 남기기','primary');submit.type='submit';
  form.append(label,recipients,note,submit,status);
  const feed=el('div',null,'comments-feed');feed.setAttribute('aria-label','코멘트 목록');feed.append(el('p','대화를 불러오는 중입니다.','hint'));
  const more=button('이전 코멘트 더 보기','secondary',()=>load({커서:cursor},true));more.hidden=true;
  panel.append(heading,help,form,el('p','최근 대화부터 표시됩니다.','comments-order hint'),feed,more);
  function updateSelection(){summary.textContent=draft.people.size?`알릴 사람 ${draft.people.size}명 선택됨`:'알릴 사람 선택';}
  function renderPeople(people){
   const available=new Set(people.map(p=>p.ID));for(const id of draft.people)if(!available.has(id))draft.people.delete(id);
   choices.replaceChildren();for(const p of people){
    const row=el('label'),box=el('input');box.type='checkbox';box.value=p.ID;box.checked=draft.people.has(p.ID);box.disabled=submitting;
    const text=el('span',`${p.이름} · ${p.부서||''}`);if(p.현재차례)text.append(el('small',displayLabel(p.현재차례)));
    box.addEventListener('change',()=>{box.checked?draft.people.add(p.ID):draft.people.delete(p.ID);updateSelection();});row.append(box,text);choices.append(row);
   }if(!people.length)choices.append(el('p','알림을 보낼 다른 참여자가 없습니다.','hint'));updateSelection();
  }
  function card(c){
   const node=el('article',null,'comment-entry');node.id=`comment-${c.ID}`;node.tabIndex=-1;
   const head=el('div',null,'comment-meta'),time=el('time',new Intl.DateTimeFormat('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(c.생성시각)));time.dateTime=c.생성시각;time.title=new Date(c.생성시각).toLocaleString('ko-KR');
   head.append(el('strong',c.작성자.이름),time);node.append(head);
   if(c.수신자.length)node.append(el('p',`알림 · ${c.수신자.map(p=>p.이름).join(', ')}`,'comment-addressed'));
   node.append(el('p',c.본문,'comment-body'));
   if(c.작성자.ID!==getInfo().본인.ID){node.append(button('답장','quiet',()=>{draft.people.add(c.작성자.ID);choices.querySelectorAll('input').forEach(b=>{b.checked=draft.people.has(b.value);});updateSelection();recipients.open=true;input.focus();}));}
   return node;
  }
  async function load(extra={},append=false){
   const v=++version;loading=true;refresh.disabled=true;more.disabled=true;
   try{
    const data=await api('read',{종류:'업무코멘트',업무ID:workID,한도:30,...extra});if(disposed||v!==version)return;
    older=append||!!extra.코멘트ID;cursor=data.다음커서;renderPeople(data.수신후보);
    if(!append)feed.replaceChildren();
    for(const c of data.항목)if(!feed.querySelector(`#comment-${c.ID}`))feed.append(card(c));
    if(!feed.childElementCount)feed.append(el('p','첫 코멘트를 남겨보세요.','comment-empty'));
    more.hidden=!cursor;
    if(extra.코멘트ID){const target=feed.querySelector(`#comment-${extra.코멘트ID}`);target?.focus();target?.scrollIntoView({block:'nearest'});}
   }catch(e){if(!disposed&&v===version){status.textContent=errorMessage(e);status.classList.add('error');if([401,403,404].includes(e.status)){feed.replaceChildren();choices.replaceChildren();submit.disabled=true;input.readOnly=true;}}}
   finally{if(!disposed&&v===version){loading=false;refresh.disabled=false;more.disabled=false;}}
  }
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(isBusy()||submitting||!input.value.trim())return;
   submitting=true;input.readOnly=true;choices.querySelectorAll('input').forEach(b=>b.disabled=true);submit.disabled=true;status.textContent='';status.classList.remove('error');
   const submitted={본문:input.value,수신자IDs:[...draft.people]};
   try{
    const result=await send({종류:'코멘트작성',업무ID:workID,인자:submitted});
    if(result){if(matches(draft,submitted)){draft.body='';draft.people.clear();}if(!disposed){input.value=draft.body;status.textContent=result.알림수?`코멘트를 남기고 ${result.알림수}명에게 알렸습니다.`:'코멘트를 남겼습니다.';await load();}}
   }catch(e){if(!disposed){status.textContent=errorMessage(e);status.classList.add('error');}}
   finally{if(!disposed){submitting=false;input.readOnly=false;submit.disabled=false;choices.querySelectorAll('input').forEach(b=>b.disabled=false);}}
  });
  const controller={node:panel,load,dispose(){disposed=true;clearInterval(timer);version++;}};active=controller;
  queueMicrotask(()=>{if(!disposed)void load();});
  timer=setInterval(()=>{if(!panel.isConnected){controller.dispose();return;}if(!document.hidden&&!loading&&!submitting&&!older&&!panel.contains(document.activeElement))void load();},30000);
  return panel;
 }
 async function focus(id){if(active){active.node.scrollIntoView({block:'nearest'});await active.load(id?{코멘트ID:id}:{});}}
 function matches(draft,args){return draft&&draft.body===args?.본문&&JSON.stringify([...draft.people].sort())===JSON.stringify([...args.수신자IDs].sort());}
 function settled(result,request){if(result?.코멘트ID){const key=`${getInfo().본인.ID}:${result.업무ID}`;if(matches(drafts.get(key),request.인자))drafts.delete(key);}}
 return {mount,reset,focus,settled};
}
