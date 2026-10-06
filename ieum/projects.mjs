import {accepted,fileData} from './attachments.mjs';
import {errorMessage} from './messages.mjs';
const roles=['연구소','C-Labs','제품기획','생산본부','품질인허가','대표님'];
const labels={제목:'프로젝트명',목적:'추진 배경과 목적',사업성:'사업성 · 시장 조사',범위:'검토할 사업 범위',일정예산:'예상 일정과 예산',완료기준:'기대 결과와 완료 기준'};
const ready=(d,r)=>r.결정==='대기'&&((d.단계==='부서검토'&&!['품질인허가','대표님'].includes(r.역할))||(d.단계==='품질검토'&&r.역할==='품질인허가')||(d.단계==='대표검토'&&r.역할==='대표님'));
export function createProjects({el,button,api,send,getInfo,isBusy,open,openWork,handleError}){
 const drafts=new Map();
 const box=(title)=>{const b=el('section',null,'detail-card proposal-section');b.append(el('h2',title));return b;};
 const fold=(title)=>{const b=el('details',null,'detail-fold');b.append(el('summary',title));return b;};
 function field(form,label,value='',max=5000,tag='textarea'){
  const l=el('label',label),i=el(tag);i.setAttribute('aria-label',label);i.value=value;i.required=true;i.maxLength=max;if(tag==='textarea')i.rows=3;l.append(i);form.append(l);return i;
 }
 function submit(form,label,fn){
  const err=el('p','','error');err.setAttribute('role','alert');const b=el('button',label,'primary');b.type='submit';form.append(err,b);
  form.addEventListener('submit',async e=>{e.preventDefault();if(isBusy())return;err.textContent='';b.disabled=true;try{await fn();}catch(e){err.textContent=errorMessage(e);if(e.status===401)handleError(e);}finally{b.disabled=false;}});return b;
 }
 const request=(d,kind,args={})=>({종류:kind,프로젝트ID:d.ID,기대개정:d.개정,회차:d.회차,인자:args});
 function connectWork(d){
  const dialog=el('dialog'),form=el('form');dialog.className='multi-request-dialog';form.append(el('h2','승인된 프로젝트를 업무로 연결'),el('p',d.내용.제목,'proposal-current'),el('p','제목·목적·완료 기준은 승인된 제안서를 사용합니다. 부서별 실행 요청을 작성해 주세요.','hint'));
  const leadLabel=el('label','주관 부서'),lead=el('select');lead.required=true;lead.setAttribute('aria-label','프로젝트 업무 주관 부서');lead.append(new Option('선택하세요',''),...getInfo().부서.map(x=>new Option(x.이름,x.ID)));leadLabel.append(lead);form.append(leadLabel);
  const rows=[];
  for(const dept of getInfo().부서){const row=el('fieldset'),legend=el('legend'),label=el('label'),check=el('input');check.type='checkbox';label.append(check,document.createTextNode(dept.이름));legend.append(label);row.append(legend);const body=el('div');body.hidden=true;const title=field(body,dept.이름+' 업무 제목','',200,'input'),content=field(body,dept.이름+' 요청 내용','',2000),criteria=field(body,dept.이름+' 완료 기준','',2000);[title,content,criteria].forEach(i=>i.disabled=true);check.addEventListener('change',()=>{body.hidden=!check.checked;[title,content,criteria].forEach(i=>i.disabled=!check.checked);});row.append(body);form.append(row);rows.push({dept,check,title,content,criteria});}
  submit(form,'선택한 부서에 업무 요청',async()=>{const chosen=rows.filter(r=>r.check.checked);if(!chosen.length||!chosen.some(r=>r.dept.ID===lead.value))throw Error('요청할 부서와 해당 부서 중 주관 부서를 선택해 주세요.');const r=await send(request(d,'프로젝트업무연결',{제목:d.내용.제목,목적:d.내용.목적,완료기준:d.내용.완료기준,희망기한:null,주관부서ID:lead.value,부서요청:chosen.map(r=>({수신부서ID:r.dept.ID,요청제목:r.title.value,요청내용:r.content.value,완료기준:r.criteria.value,희망기한:null}))}));if(r){dialog.close();await openWork(r.업무ID);}});
  form.append(button('닫기','secondary',()=>{if(!isBusy())dialog.close();}));dialog.addEventListener('cancel',e=>{if(isBusy())e.preventDefault();});dialog.addEventListener('close',()=>dialog.remove());dialog.append(form);document.body.append(dialog);dialog.showModal();
 }
 async function act(d,kind,args={}){const r=await send(request(d,kind,args));if(r)await open(d.ID);return r;}
 function action(d,label,kind,args={}){const f=el('form');submit(f,label,()=>act(d,kind,args));return f;}
 function editor(d){
  const form=el('form',null,'proposal-form'),key=d?.ID||'new',inputs={};
  const values=drafts.get(key)||d?.내용||{};
  for(const [k,label]of Object.entries(labels))inputs[k]=field(form,label,values[k]||'',k==='제목'?200:5000,k==='제목'?'input':'textarea');
  const valuesNow=()=>Object.fromEntries(Object.entries(inputs).map(([k,i])=>[k,i.value]));
  form.addEventListener('input',()=>drafts.set(key,valuesNow()));
  submit(form,d?'제안서 저장':'프로젝트 초안 만들기',async()=>{const r=await send(d?request(d,'프로젝트수정',valuesNow()):{종류:'프로젝트등록',인자:valuesNow()});if(r){drafts.delete(key);await open(r.프로젝트ID);}});return form;
 }
 function routeView(settings){
  const b=box('승인 담당자');b.append(el('p','업무 접수 담당과 별도로 지정합니다. 변경한 경로는 다음 검토 회차부터 적용됩니다.','hint'));
  const grid=el('div',null,'proposal-reviewers');
  for(const role of roles){const p=settings.경로.find(r=>r.역할===role),r=el('div',null,'proposal-person');r.append(el('strong',role),el('p',p?.이름||'미지정'),el('small',p?.준비?'접속 준비 완료':'가입 또는 담당자 지정 필요',p?.준비?'hint':'error'));grid.append(r);}b.append(grid);
  if(getInfo().관리권한){const f=el('form',null,'proposal-form'),values={};
   for(const role of roles){const l=el('label',role),select=el('select');select.setAttribute('aria-label',role+' 승인자');select.required=true;select.append(new Option('승인자를 선택하세요',''),...settings.후보.map(m=>new Option(m.이름,m.ID)));select.value=settings.경로.find(r=>r.역할===role)?.ID||'';l.append(select);f.append(l);values[role]=select;}
   submit(f,'승인 경로 저장',async()=>{const r=await send({종류:'프로젝트경로설정',인자:Object.fromEntries(Object.entries(values).map(([k,v])=>[k,v.value]))});if(r)await open(null);});const change=fold('승인 담당자 변경');change.append(f);b.append(change);
  }return b;
 }
 async function list(){
  const [data,settings]=await Promise.all([api('read',{종류:'프로젝트목록'}),api('read',{종류:'프로젝트설정'})]);
  const root=el('div',null,'detail proposal-list'),intro=box('승인받고 시작할 프로젝트');
  intro.append(el('p','사업 자료와 부서 의견을 모아 대표님 승인 후 업무로 연결합니다. 바로 진행할 업무는 상단의 “업무 요청”을 이용하세요.','muted'));
  const create=fold('＋ 프로젝트 등록');create.append(editor());intro.append(create);root.append(intro);
  for(const item of data.항목){const b=button('','work-card',()=>open(item.ID)),body=el('div');body.append(el('span',item.내차례?'지금 내 차례':item.단계,'badge'),el('h3',item.제목),el('p',`${item.번호} · ${item.작성자} · ${item.단계}`,'hint'));b.append(body,el('span','›','chevron'));root.append(b);}
  if(!data.항목.length)root.append(el('p','아직 등록한 프로젝트가 없습니다.','hint'));
  const settingsFold=fold('승인 경로 · 담당자 확인');settingsFold.append(routeView(settings));root.append(settingsFold);return root;
 }
 async function myTurns(){const data=await api('read',{종류:'프로젝트목록'});const items=data.항목.filter(p=>p.내차례);if(!items.length)return null;const b=box(`프로젝트 승인 · 내 차례 ${items.length}건`);for(const p of items)b.append(button(`${p.제목} · ${p.단계} →`,'proposal-turn-link',()=>open(p.ID)));return b;}
 function progress(d,settings){
  const b=box('프로젝트 승인 진행');b.append(el('p',`${d.회차}차 검토 · ${d.검토.filter(r=>r.역할!=='대표님'&&r.결정==='승인').length}/5개 부서 승인`,'hint'));
  const steps=el('div',null,'proposal-flow');
  const group=el('div',null,'proposal-parallel');group.append(el('h3','1. 부서 검토 · 동시 진행'));
  function person(role){const r=d.검토.find(r=>r.역할===role),configured=settings.경로.find(r=>r.역할===role),node=el('article',null,'proposal-person');
   const current=r&&ready(d,r);if(current)node.classList.add('is-current');if(r?.결정==='승인')node.classList.add('is-approved');
   node.append(el('strong',role),el('p',r?.이름||configured?.이름||'미지정'),el('span',current?'지금 승인할 차례':r?.결정==='승인'?'승인 완료':r?.결정&&r.결정!=='대기'?r.결정:'대기','badge'));
   if(r?.의견){const note=fold('검토 의견');note.append(el('p',r.의견,'proposal-pre'));node.append(note);}return node;
  }
  roles.slice(0,4).forEach(r=>group.append(person(r)));steps.append(group);
  const quality=el('div');quality.append(el('h3','2. 품질인허가 최종 부서 검토'),person('품질인허가'));steps.append(quality);
  const report=el('div');report.append(el('h3','3. 전원 승인 후 보고서'),el('p','AI 종합보고서 → 작성자 검토·보완','muted'),el('span',d.단계==='보고서준비'?'AI 보고서 준비 중':d.단계==='보고서검토'?'작성자 검토 중':d.보고서.length?'보고서 작성 완료':'5개 부서 승인 대기','badge'));steps.append(report);
  const ceo=el('div');ceo.append(el('h3','4. 대표님 최종 승인'),person('대표님'));steps.append(ceo);b.append(steps);return b;
 }
 function documents(d){
  const b=box('검토 자료');b.append(el('p','파일당 5MB · 회차당 최대 10개/20MB · 누적 50MB. 검토에 필요한 표·도표는 PDF로도 첨부해 주세요.','hint'));
  for(const f of d.자료){const row=el('div',null,'attachment-item');row.append(el('strong',f.파일명),el('p',f.설명));row.append(button('다운로드','secondary',async()=>{try{const blob=await api('file',{종류:'프로젝트자료다운로드',프로젝트ID:d.ID,자료ID:f.ID},true),url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download=f.파일명;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){handleError(e);}}));if(d.단계==='초안'&&d.작성자ID===getInfo().본인.ID)row.append(action(d,'이번 검토에서 제외','프로젝트자료제외',{자료ID:f.ID}));b.append(row);}
  if(d.단계==='초안'&&d.작성자ID===getInfo().본인.ID){const f=el('form'),upload=field(f,'프로젝트 첨부파일','','','input');upload.type='file';upload.accept=accepted;const desc=field(f,'자료 설명','',2000);submit(f,'자료 업로드',async()=>{const {데이터,...meta}=await fileData(upload.files[0]);const r=await send(request(d,'프로젝트자료업로드',{...meta,설명:desc.value}),'file',데이터);if(r)await open(d.ID);});b.append(f);}return b;
 }
 function conversation(d){const b=box('프로젝트 대화'),f=el('form'),key=d.ID+':comment',input=field(f,'프로젝트 코멘트',drafts.get(key)||'',3000);input.placeholder='검토 요청이나 진행 상황을 함께 남겨 주세요.';input.addEventListener('input',()=>drafts.set(key,input.value));submit(f,'코멘트 남기기',async()=>{const r=await send(request(d,'프로젝트대화',{본문:input.value}));if(r){drafts.delete(key);await open(d.ID);}});b.append(f);
  for(const h of d.이력.filter(h=>h.종류==='프로젝트대화')){const c=el('article',null,'proposal-comment');c.append(el('strong',h.이름),el('p',h.내용.본문,'proposal-pre'),el('small',new Date(h.생성시각).toLocaleString('ko-KR'),'hint'));b.append(c);}return b;}
 async function detail(id){
  const [d,settings]=await Promise.all([api('read',{종류:'프로젝트상세',프로젝트ID:id}),api('read',{종류:'프로젝트설정'})]);
  const root=el('div',null,'project-workspace proposal-workspace'),main=el('div',null,'detail');root.append(main,conversation(d));
  main.append(button('← 프로젝트 목록','text-button',()=>open(null)),progress(d,settings));
  const current=box('지금 할 일'),mine=d.작성자ID===getInfo().본인.ID,reviewers=d.검토.filter(r=>ready(d,r));
  if(reviewers.length)current.append(el('p',reviewers.map(r=>`${r.이름} · ${r.역할} 승인`).join(' / '),'proposal-current'));
  else current.append(el('p',({초안:'작성자 · 제안서와 자료 등록 후 검토 요청',보완:'작성자 · 요청받은 내용을 보완하고 재검토 요청',반려:'작성자 · 반려 의견 확인',보고서준비:d.AI연결?'AI 보고서 생성 결과를 확인하세요.':'AI 서비스 연결 설정이 필요합니다.',보고서검토:'작성자 · AI 보고서 확인·수정 후 대표님께 제출',승인:'작성자 · 승인된 프로젝트를 업무로 연결',업무연결:'승인된 프로젝트의 업무를 진행하고 있습니다.'})[d.단계]||d.단계,'proposal-current'));
  for(const r of reviewers.filter(r=>r.담당자ID===getInfo().본인.ID)){const f=el('form'),note=field(f,'검토 의견 · 승인 조건','',5000),l=el('label','검토 결과'),select=el('select');select.setAttribute('aria-label','검토 결과');['승인','보완','반려'].forEach(x=>select.append(new Option(x,x)));l.append(select);f.append(l);submit(f,`${r.역할} 검토 결과 제출`,()=>act(d,'프로젝트판단',{역할:r.역할,결정:select.value,의견:note.value}));current.append(f);}
  if(mine&&d.단계==='초안'){const unready=roles.filter(role=>!settings.경로.find(r=>r.역할===role)?.준비);if(unready.length)current.append(el('p',`접속 준비 필요: ${unready.join(', ')}. 초안과 자료는 저장할 수 있습니다.`,'error'));else current.append(action(d,'5개 부서 검토 요청','프로젝트제출'));}
  if(mine&&d.단계==='보고서준비'){current.append(el('p',`생성 상태: ${d.AI상태||'대기'} · 완료 후 새로고침으로 확인하세요.`,'hint'));if(d.AI연결)current.append(action(d,'AI 보고서 생성 / 실패 시 재시도','프로젝트AI요청'));}
  if(mine&&d.단계==='승인')current.append(d.원업무ID?action(d,'승인 완료 · 기존 업무 재개','프로젝트업무재개'):button('승인 완료 · 업무요청 만들기','primary',()=>connectWork(d)));
  if(d.연결업무ID||d.원업무ID)current.append(button(d.연결업무ID?'연결된 업무 열기':'기존 업무 확인','secondary',()=>openWork(d.연결업무ID||d.원업무ID)));
  main.append(current);
  const proposal=box('프로젝트 제안서');if(mine&&d.단계==='초안')proposal.append(editor(d));else for(const [k,label]of Object.entries(labels)){const n=el('div',null,'text-block');n.append(el('h3',label),el('p',d.내용[k],'proposal-pre'));proposal.append(n);}main.append(proposal,documents(d));
  if(d.보고서.length){const b=box('종합보고서'),latest=d.보고서[0];b.append(el('p',latest.출처==='AI'?'AI 초안 · 근거와 승인 조건을 확인한 뒤 검토본을 저장하세요.':'작성자 검토본','hint'));
   if(mine&&d.단계==='보고서검토'){const f=el('form'),input=field(f,'종합보고서 본문',drafts.get(d.ID+':report')||latest.본문,30000);input.rows=18;input.addEventListener('input',()=>drafts.set(d.ID+':report',input.value));submit(f,'검토본 저장',async()=>{const r=await send(request(d,'프로젝트보고서저장',{본문:input.value}));if(r){drafts.delete(d.ID+':report');await open(d.ID);}});b.append(f);if(latest.출처==='작성자')b.append(action(d,'저장된 검토본을 대표님께 제출','프로젝트대표제출'));}
   else b.append(el('p',latest.본문,'proposal-pre'));
   main.append(b);
  }
  if(mine&&!['초안','업무연결'].includes(d.단계)){const f=fold('자료 수정 · 부서 재검토');f.append(el('p','새 검토 회차를 시작합니다. 이전 의견과 보고서는 이력으로 보존하고 5개 부서 승인을 다시 받습니다.','hint'),action(d,'새 회차로 자료 수정 시작','프로젝트재검토'));main.append(f);}
  const history=fold('승인·변경 이력');for(const h of d.이력.filter(h=>h.종류!=='프로젝트대화')){const item=el('article',null,'proposal-comment');item.append(el('strong',`${h.이름} · ${h.종류.replace(/^프로젝트/,'')} · ${h.회차}차`),el('p',h.내용.의견||h.내용.사유||'', 'proposal-pre'),el('small',new Date(h.생성시각).toLocaleString('ko-KR'),'hint'));history.append(item);}main.append(history);
  if(d.과거회차?.length){const archive=fold('이전 검토 자료 · 최근 10회차');for(const past of d.과거회차){const item=fold(`${past.회차}차 · ${past.내용.제목}`);for(const [k,label]of Object.entries(labels))item.append(el('h3',label),el('p',past.내용[k],'proposal-pre'));for(const f of past.자료)item.append(button(f.파일명+' 다운로드','secondary',async()=>{try{const blob=await api('file',{종류:'프로젝트자료다운로드',프로젝트ID:d.ID,자료ID:f.ID},true),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=f.파일명;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){handleError(e);}}));if(past.보고서)item.append(el('h3','당시 종합보고서'),el('p',past.보고서.본문,'proposal-pre'));archive.append(item);}main.append(archive);}
  return {node:root,title:d.내용.제목,subtitle:`${d.번호} · ${d.단계}`};
 }
 function workControl(data){
  if(data.프로젝트){const b=box(data.프로젝트.보류?'프로젝트 승인 대기 · 업무 보류':'프로젝트 승인 연결');b.append(el('p',data.프로젝트.보류?'대표님 승인 후 요청자가 같은 업무를 재개합니다. 보류 기간은 처리 기한에서 제외합니다.':'사전 프로젝트 승인 자료와 검토 의견을 확인할 수 있습니다.','hint'));if(data.프로젝트.열람)b.append(button('프로젝트 승인 현황 보기','secondary',()=>open(data.프로젝트.ID)));return b;}
  if(data.유효통합계획ID||['실행','완료','비승인'].includes(data.단계)||!data.부서업무.some(b=>getInfo().승인부서.includes(b.부서ID)))return null;
  const b=fold('이 업무에 전체 프로젝트 승인이 필요한가요?'),f=el('form'),reason=field(f,'프로젝트 승인 전환 사유','',2000);b.append(el('p','전환하면 현재 업무 진행과 지연 알림을 보류합니다. 요청자가 제안서를 보완하고 부서 검토를 시작합니다.','hint'));
  submit(f,'프로젝트 승인 요청 · 업무 보류',async()=>{const r=await send({종류:'프로젝트전환',인자:{업무ID:data.업무ID,사유:reason.value}});if(r)await openWork(data.업무ID);});b.append(f);return b;
 }
 return {list,detail,myTurns,workControl,reset:()=>drafts.clear()};
}
