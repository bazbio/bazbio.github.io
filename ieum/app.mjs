import { createClosure } from './closure.mjs';
import { createCollaboration } from './collaboration.mjs';
import { createAttachments, fileData } from './attachments.mjs';
import { createAdministration } from './admin.mjs';
import { showEnrollment } from './enroll.mjs';
import { createBottlenecks } from './bottlenecks.mjs';
import { createExecution } from './execution.mjs';
import { createPlans } from './plans.mjs';
const $ = selector => document.querySelector(selector);
const el = (tag, text, className) => { const node=document.createElement(tag); if(text!=null) node.textContent=text; if(className)node.className=className; return node; };
let apiBase=''; let token=sessionStorage.getItem('ieum.token'); let info; let view='내업무'; let selected=null; let cursor=null; let busy=false; let loadVersion=0;
const descriptions = { 대표승인함:['대표 승인함','제출된 통합 계획과 실행 범위를 검토하세요.'], 내업무:['지금 내 차례','내가 처리해야 할 다음 행동을 확인하세요.'], 내요청:['내가 요청한 업무','요청한 업무가 어디까지 왔는지 확인하세요.'], 참여업무:['참여 업무','함께하는 부서의 계획과 다음 차례를 확인하세요.'], 부서받은함:['부서 받은함','우리 부서에 도착한 요청을 확인하고 연결하세요.'] };
const execution=createExecution({el,button,send,refresh:showDetail,getInfo:()=>info,isBusy:()=>busy,message,handleError});
const closure=createClosure({el,send,refresh:showDetail,getInfo:()=>info,isBusy:()=>busy,message,handleError});
const bottlenecks=createBottlenecks({el,button,api,refresh:()=>showList('병목현황'),open:showDetail});
const collaboration=createCollaboration({el,button,send,refresh:showDetail,getInfo:()=>info,isBusy:()=>busy,message,handleError});
const attachments=createAttachments({el,button,send,api,refresh:showDetail,getInfo:()=>info,isBusy:()=>busy,message,handleError});
const administration=createAdministration({el,button,api,send,refresh:()=>showList('운영설정'),getInfo:()=>info,isBusy:()=>busy,message,handleError});
descriptions.운영설정=['운영 설정','조직·구성원·승인 경로를 설정하고 시범 운영을 준비하세요.'];
let fileCache=null;
descriptions.알림=['알림','내 차례와 협의 소식, 기한을 넘긴 업무를 확인하세요.'];
descriptions.병목현황=['병목 현황','어느 부서와 담당자의 차례에서 기다리고 있는지 확인하세요.'];
const plans=createPlans({el,button,api,send,refresh:showDetail,getInfo:()=>info,isBusy:()=>busy,message,handleError});
const timestamp=value=>new Intl.DateTimeFormat('ko-KR',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const pendingKey=()=>`ieum.pending.${info.본인.ID}`;
function getPending(){ try{return JSON.parse(sessionStorage.getItem(pendingKey()));}catch{return null;} }
function message(text='',error=false){ const node=$('#message');node.textContent=text;node.className=text?(error?'error':'success'):''; }
function showPending(){ const p=getPending();$('#pending-banner').hidden=!p;$('#retry-file-label').hidden=p?.전송모드!=='file'; }
async function api(mode,body,asBlob=false){
  let response;
  try { response=await fetch(`${apiBase}/functions/v1/ieum-${mode}`,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)}); }
  catch { const e=new Error('서버 응답을 확인하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.');e.uncertain=true;throw e; }
  if(asBlob&&response.ok)return response.blob();
  const result=await response.json().catch(()=>null);
  if(!response.ok||!result){const e=new Error(result?.메시지||'서버 응답을 확인하지 못했습니다.');e.status=response.status;e.code=result?.코드;e.uncertain=response.status>=500||!result;throw e;}
  return result;
}
function setBusy(value){busy=value;document.querySelectorAll('button[type="submit"],#retry-pending').forEach(b=>{if(value){b.dataset.wasDisabled=String(b.disabled);b.disabled=true;}else if('wasDisabled' in b.dataset){b.disabled=b.dataset.wasDisabled==='true';delete b.dataset.wasDisabled;}});}
async function send(input,mode='command',file=null){
  const existing=getPending();
  if(existing){message('먼저 응답을 확인하지 못한 요청의 처리 결과를 확인해 주세요.',true);showPending();return null;}
  const request={...input,멱등키:crypto.randomUUID(),...(mode!=='command'?{전송모드:mode}:{})};
  if(file)fileCache={key:request.멱등키,data:file};
  sessionStorage.setItem(pendingKey(),JSON.stringify(request));return execute(request);
}
async function execute(request){
  const key=pendingKey();const submittedToken=token;
  const {전송모드,...body}=request;const mode=전송모드||'command';
  if(mode==='file'){
    if(fileCache?.key!==request.멱등키){const f=await fileData($('#retry-file').files[0]);if(f.해시!==request.인자.해시)throw new Error('처음 업로드한 것과 같은 파일을 선택해 주세요.');fileCache={key:request.멱등키,data:f.데이터};}
    body.인자={...request.인자,데이터:fileCache.data};
  }
  setBusy(true);
  try{const result=await api(mode,body);sessionStorage.removeItem(key);fileCache=null;$('#retry-file').value='';void refreshNotices();return token===submittedToken?result:null;}
  catch(error){if(!error.uncertain&&error.status!==401)sessionStorage.removeItem(key);throw error;}
  finally{setBusy(false);showPending();}
}
function logout(){token=null;fileCache=null;administration.reset();sessionStorage.removeItem('ieum.token');loadVersion++;$('#app-view').hidden=true;$('#login-view').hidden=false;$('#login-form [name=password]').value='';$('#retry-file').value='';$('#notice-count').textContent='';}
function handleError(error){if(error.status===401){logout();$('#login-error').textContent=error.message;}else message(error.message,true);}
function badge(text,kind=''){return el('span',text,`badge ${kind}`);}
function button(text,className,handler){const b=el('button',text,className);b.type='button';b.addEventListener('click',handler);return b;}
async function bootstrap(){
  info=await api('read',{종류:'초기정보'});
  $('#user-name').textContent=info.본인.표시명;
  $('#department-name').textContent=info.부서.find(d=>d.ID===info.본인.부서ID)?.이름||'';
  $('#inbox-nav').hidden=!info.승인부서.length;$('#executive-nav').hidden=!info.대표권한;
  $('#admin-nav').hidden=!info.관리권한;
  $('#inbox-department').replaceChildren(...info.부서.filter(d=>info.승인부서.includes(d.ID)).map(d=>new Option(d.이름,d.ID)));
  $('#request-form [name=department]').replaceChildren(new Option('부서를 선택하세요',''),...info.부서.map(d=>new Option(d.이름,d.ID)));
  $('#login-view').hidden=true;$('#app-view').hidden=false;showPending();await showList('내업무');void refreshNotices();
}
function newRequest(){if(busy)return;$('#request-error').textContent='';$('#request-dialog').showModal();}
function emptyState(){
  const node=el('div',null,'empty');node.append(el('div','✓','empty-symbol'));
  node.append(el('h2',view==='내업무'?'지금은 기다리는 업무가 없어요':view==='내요청'?'첫 업무를 연결해 보세요':'새로운 요청을 기다리고 있어요'));
  node.append(el('p',view==='내업무'?'내 차례가 되면 이곳에 다음 행동이 나타납니다. 요청한 업무의 진행은 ‘내가 요청한 업무’에서 확인하세요.':'업무의 목적과 완료 기준을 적으면, 담당 부서가 확인하고 다음 단계를 이어갑니다.'));
  node.append(button('업무 요청하기','secondary',newRequest));return node;
}
function card(item){
  const action=view==='내업무'?item:item.현재행동[0];
  const node=button('','work-card',()=>showDetail(item.업무ID));
  const body=el('div');const top=el('div',null,'card-top');
  top.append(badge(view==='내업무'?item.종류:item.단계,item.단계==='비승인'?'neutral':''));
  if(item.번호)top.append(el('span',item.번호,'reference'));
  body.append(top,el('div',item.제목,'work-title'));
  body.append(el('p',action?`${action.담당부서.이름} · ${action.담당자.표시명} · ${action.종류}${action.마일스톤제목?' · '+action.마일스톤제목:''}${item.현재행동?.length>1?' 외 '+(item.현재행동.length-1)+'건 대기':''}`:item.단계==='완료'?'최종 종결 승인이 완료되었습니다.':'접수 판단이 완료되었습니다.','work-meta'));
  const end=el('div',null,'card-end');if(action)end.append(badge(action.기한초과?'기한 초과':`${timestamp(action.처리기한)}까지`,action.기한초과?'late':'neutral'));end.append(el('span','›','chevron'));
  node.append(body,end);return node;
}
async function showList(next=view,more=false){
  const version=++loadVersion;view=next;selected=null;
  if(!more){cursor=null;$('#content').replaceChildren(el('p','업무를 불러오고 있어요.','loading'));message();}
  $('#page-title').textContent=descriptions[view][0];$('#page-description').textContent=descriptions[view][1];
  $('#toolbar').hidden=false;$('#department-filter').hidden=view!=='부서받은함';$('#load-more').hidden=true;
  document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-current',b.dataset.view===view?'page':'false');});
  $('#content').setAttribute('aria-busy','true');
  try{
    if(view==='병목현황'){const node=await bottlenecks.render();if(version===loadVersion)$('#content').replaceChildren(node);return;}
    if(view==='운영설정'){const node=await administration.render();if(version===loadVersion)$('#content').replaceChildren(node);return;}
    const data=await api('read',{종류:view,...(view==='부서받은함'?{부서ID:$('#inbox-department').value}:{}),...(cursor?{커서:cursor}:{}),한도:30});
    if(version!==loadVersion)return;
    let list=more?$('#content .list'):null;
    if(!list){list=el('div',null,'list');$('#content').replaceChildren(list);}
    data.항목.forEach(item=>list.append(view==='알림'?noticeCard(item):card(item)));cursor=data.다음커서;$('#load-more').hidden=!cursor;
    if(view==='알림')$('#notice-count').textContent=data.미읽음?String(data.미읽음):'';
    if(!list.children.length)$('#content').replaceChildren(view==='알림'?el('p','아직 도착한 알림이 없습니다.','empty'):emptyState());
  }catch(error){if(version===loadVersion){handleError(error);$('#content').replaceChildren(el('p','불러오지 못했습니다. 새로고침으로 다시 시도해 주세요.','loading'));}}
  finally{if(version===loadVersion)$('#content').setAttribute('aria-busy','false');}
}
async function refreshNotices(){const session=token;if(!session||document.hidden)return;try{const data=await api('read',{종류:'알림',한도:1});if(token===session)$('#notice-count').textContent=data.미읽음?String(data.미읽음):'';}catch(e){if(token===session&&e.status===401)handleError(e);}}
setInterval(()=>void refreshNotices(),60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshNotices();});
function noticeCard(n){const node=button('','work-card notice-card',async()=>{try{await api('notice',{종류:'알림읽음',알림ID:n.ID});void refreshNotices();await showDetail(n.업무ID);if(n.행동ID)document.getElementById(`action-${n.행동ID}`)?.scrollIntoView({block:'start'});}catch(e){handleError(e);}});const body=el('div');body.append(el('span',`${n.종류} · ${n.읽음시각?'읽음':'읽지 않음'}`,'badge'),el('p',n.제목,'work-title'),el('p',timestamp(n.생성시각),'hint'));node.append(body,el('span','›','chevron'));return node;}
function infoCell(label,value){const cell=el('div');cell.append(el('p',label,'info-label'),el('p',value||'미지정','info-value'));return cell;}
function textBlock(label,value){const node=el('div',null,'text-block');node.append(el('h3',label),el('p',value));return node;}
async function showDetail(id){
  const version=++loadVersion;selected=id;$('#toolbar').hidden=false;$('#department-filter').hidden=true;$('#load-more').hidden=true;
  $('#content').replaceChildren(el('p','업무를 불러오고 있어요.','loading'));$('#content').setAttribute('aria-busy','true');
  try{
    const data=await api('read',{종류:'업무상세',업무ID:id});if(version!==loadVersion)return;
    const detail=el('div',null,'detail');detail.append(button('← 목록으로','text-button back',()=>showList()));
    const summary=el('section',null,'detail-card');const top=el('div',null,'card-top');top.append(badge(data.단계),el('span',data.번호,'reference'));
    summary.append(top,el('h2',data.제목));const grid=el('div',null,'detail-info');grid.append(infoCell('요청자',data.요청자.표시명),infoCell('전체 책임자',data.전체책임자?.표시명),infoCell('희망 완료일',data.희망기한||'미지정'));
    if(data.현재행동.length){const turns=el('div',null,'current-turns');turns.append(el('p',`현재 차례 · ${data.현재행동.length}건`,'info-label'));for(const a of data.현재행동)turns.append(button(`${a.담당부서.이름} · ${a.담당자.표시명} · ${a.종류}${a.마일스톤제목?' · '+a.마일스톤제목:''}${a.기한초과?' · 기한 초과':''}`,'turn-link',()=>document.getElementById(`action-${a.행동ID}`)?.scrollIntoView({behavior:'smooth',block:'start'})));summary.append(turns);}
    summary.append(grid,textBlock('요청 배경과 목적',data.목적),textBlock('완료 기준',data.완료기준));detail.append(summary,execution.overview(data),closure.overview(data),plans.overview(data),collaboration.overview(data),attachments.overview(data));
    for(const action of data.현재행동){
      const section=el('section',null,'detail-card action-card');section.id=`action-${action.행동ID}`;section.append(el('h3',`${action.담당자.표시명} 님의 차례 · ${action.종류}${action.마일스톤제목?' · '+action.마일스톤제목:''}`,'action-title'),el('p',`${action.담당부서.이름} · ${timestamp(action.처리기한)}까지${action.기한초과?' · 기한 초과':''}`,'muted'));
      if(action.미팅대기)section.append(el('p','미팅 결론과 후속 업무를 기다리고 있습니다. 완료되면 이 차례에서 원래 검토를 진행하세요.','notice'));
      if(action.담당자.ID===info.본인.ID&&!action.미팅대기){
        if(['미팅진행','미팅후속'].includes(action.종류))section.append(collaboration.action(data,action));
        else if(data.종결&&['결과확인','종결승인','결과보완'].includes(action.종류))section.append(closure.action(data,action));
        else if(['통합제출','통합보완','대표승인','착수','수행','검증','재작업','결과확인'].includes(action.종류))section.append(execution.action(data,action));
        else if(['계획작성','협업후속판단','부서승인'].includes(action.종류)){section.append(await plans.action(data,action));if(version!==loadVersion)return;}
        else{
          const form=el('form');let input;
          if(action.종류==='책임자배정'){
            const candidates=await api('read',{종류:'배정후보',업무ID:id,부서업무ID:action.부서업무ID});if(version!==loadVersion)return;
            const label=el('label','업무를 담당할 사람');input=el('select');input.setAttribute('aria-label','업무를 담당할 사람');input.required=true;input.name='assignee';input.append(new Option('담당자를 선택하세요',''),...candidates.항목.map(m=>new Option(m.표시명,m.ID)));label.append(input);form.append(label);
          }else{
            const label=el('label',action.종류==='자료보완'?'보완 내용':'검토 의견');input=el('textarea');input.name='note';input.rows=3;input.maxLength=action.종류==='자료보완'?10000:2000;input.required=action.종류==='자료보완';label.append(input);form.append(label);
          }
          const err=el('p','','error');err.setAttribute('role','alert');const actions=el('div',null,'actions');
          const choices=action.종류==='접수판단'?['수락','보완요청','비승인']:action.종류==='책임자배정'?['책임자배정']:['자료보완제출'];
          const names={수락:'요청 수락',보완요청:'자료 보완 요청',비승인:'비승인',책임자배정:'담당자 배정',자료보완제출:'보완 내용 제출'};
          for(const kind of choices){const b=el('button',names[kind],kind==='비승인'?'secondary danger-button':kind==='보완요청'?'secondary':'primary');b.type='submit';b.value=kind;actions.append(b);}
          form.append(err,actions);
          form.addEventListener('submit',async event=>{
            event.preventDefault();if(busy)return;const kind=event.submitter?.value||choices[0];
            if(['비승인','보완요청'].includes(kind)&&!input.value.trim()){err.textContent='요청자에게 전달할 사유를 적어 주세요.';input.focus();return;}
            const args=kind==='수락'?{의견:input.value.trim()||null}:['비승인','보완요청'].includes(kind)?{사유:input.value}:kind==='책임자배정'?{구성원ID:input.value}:{본문:input.value};
            try{err.textContent='';const result=await send({종류:kind,업무ID:id,부서업무ID:action.부서업무ID,행동ID:action.행동ID,기대업무개정:data.업무개정,인자:args});if(result){await showDetail(id);message('처리가 반영되었습니다. 다음 차례를 확인하세요.');}}
            catch(error){err.textContent=error.message;if(error.status===409)message('화면 상단의 새로고침으로 최신 내용을 확인해 주세요. 작성한 내용은 유지됩니다.',true);if(error.status===401)handleError(error);}
          });section.append(form);
        }
        if(!action.미팅대기&&['접수판단','계획작성','부서승인'].includes(action.종류))section.append(collaboration.request(data,action));
      }detail.append(section);
    }
    const history=el('section',null,'detail-card');history.append(el('h3','업무의 흐름'));const timeline=el('ol',null,'timeline');
    for(const activity of data.활동){const row=el('li');const head=el('div',null,'timeline-head');const who=el('span',activity.종류);who.append(el('small',activity.작성자));head.append(who,el('time',timestamp(activity.시각),'timeline-time'));row.append(head);const args=activity.내용.인자;const note=args.사유||args.본문||args.의견;if(note)row.append(el('p',note));timeline.append(row);}history.append(timeline);detail.append(history);
    $('#content').replaceChildren(detail);$('#page-title').focus({preventScroll:true});
  }catch(error){if(version===loadVersion){handleError(error);$('#content').replaceChildren(button('목록으로 돌아가기','secondary',()=>showList()));}}
  finally{if(version===loadVersion)$('#content').setAttribute('aria-busy','false');}
}
$('#login-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;const submit=form.querySelector('button');submit.disabled=true;$('#login-error').textContent='';try{const data=await api('login',{이메일:form.email.value,비밀번호:form.password.value});token=data.토큰;sessionStorage.setItem('ieum.token',token);form.password.value='';await bootstrap();}catch(error){$('#login-error').textContent=error.message;}finally{submit.disabled=false;}});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>showList(b.dataset.view)));
$('#logout').addEventListener('click',logout);$('#new-request').addEventListener('click',newRequest);$('#refresh').addEventListener('click',()=>selected?showDetail(selected):showList());$('#load-more').addEventListener('click',()=>showList(view,true));$('#inbox-department').addEventListener('change',()=>showList());
$('#close-dialog').addEventListener('click',()=>$('#request-dialog').close());$('#cancel-request').addEventListener('click',()=>$('#request-dialog').close());
$('#request-form').addEventListener('submit',async event=>{event.preventDefault();if(busy)return;const form=event.currentTarget;$('#request-error').textContent='';try{const result=await send({종류:'요청제출',인자:{제목:form.elements.title.value,목적:form.elements.purpose.value,완료기준:form.elements.criteria.value,수신부서ID:form.elements.department.value,희망기한:form.elements.due.value||null}});if(result){$('#request-dialog').close();form.reset();await showDetail(result.업무ID);message('업무를 요청했습니다. 담당 부서의 접수 판단을 기다립니다.');}else $('#request-error').textContent='기존 요청의 처리 결과를 먼저 확인해 주세요.';}catch(error){$('#request-error').textContent=error.message;}});
$('#retry-pending').addEventListener('click',async()=>{if(busy)return;const request=getPending();if(!request)return;try{const result=await execute(request);if(result){if(request.전송모드==='admin'){administration.acceptResult(result);await showList('운영설정');}else await showDetail(result.업무ID);message('요청의 처리 결과를 확인했습니다.');}}catch(error){handleError(error);}});
async function enterInvitation(secret){
 history.replaceState(null,'',location.pathname+location.search);logout();$('#login-view').hidden=true;
 await showEnrollment({el,button,api,token:secret,back:()=>{$('#enroll-view').hidden=true;$('#enroll-view').replaceChildren();$('#login-view').hidden=false;}});
}
window.addEventListener('hashchange',()=>{const secret=new URLSearchParams(location.hash.slice(1)).get('invite');if(secret)void enterInvitation(secret);});
let inviteFragment=new URLSearchParams(location.hash.slice(1)).get('invite');
if(inviteFragment)history.replaceState(null,'',location.pathname+location.search);
try{const config=await fetch('./config.json').then(r=>r.json());if(config.apiBase){const url=new URL(config.apiBase);if(url.protocol!=='https:'||url.username||url.password)throw new Error('API 주소 설정을 확인해 주세요.');apiBase=url.href.replace(/\/$/,'');}
 if(inviteFragment){await enterInvitation(inviteFragment);inviteFragment=null;}
 else if(token)await bootstrap();
}catch(error){logout();$('#login-error').textContent=error.message;}
