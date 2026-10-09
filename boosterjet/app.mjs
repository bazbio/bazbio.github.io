import {initBoard} from './board.mjs?v=20261009-board';
const $ = id => document.getElementById(id);
const storageKey = 'boosterjet-session';
let config, session, profile, search = '', currentShare, refreshPromise, busy = false, authVersion = 0, shareVersion = 0;
const bucket = 'boosterjet-launch';
const columns = {mine:{rows:[],offset:0,version:0,loading:false},others:{rows:[],offset:0,version:0,loading:false}};
function firstPages(){for(const column of Object.values(columns))column.offset=0;}
function notice(text, error = false) { $('notice').textContent = text; $('notice').classList.toggle('error', error); }
function message(error) {
 if (error.status === 401) return '로그인이 만료되었습니다. 다시 로그인해 주세요.';
 if (error.status === 403 || error.code === '42501') return '이 파일에 접근할 권한이 없습니다. 프로젝트 관리자에게 확인해 주세요.';
 if (error.status === 413 || error.message?.includes('INVALID_FILE')) return '파일 이름과 크기를 확인해 주세요. 파일당 최대 50MB까지 올릴 수 있습니다.';
 if (error.status === 400) return '입력한 내용이나 초대 링크를 확인한 뒤 다시 시도해 주세요.';
 return '연결 또는 처리를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}
function saveSession(value) { if(value&&!value.expires_at)value.expires_at=Date.now()/1000+Number(value.expires_in||0); session = value; if(value) sessionStorage.setItem(storageKey, JSON.stringify(value)); else sessionStorage.removeItem(storageKey); }
function reset() {
 board.reset();
 authVersion++; shareVersion++; currentShare=null; firstPages(); search='';
 $('search-form').reset(); $('upload-form').reset(); $('password-form').reset(); $('password').value='';
 $('upload-results').replaceChildren(); $('upload-status').textContent=''; $('share-options').replaceChildren();
 $('share-filename').textContent=''; $('share-error').textContent='';
 $('progress').hidden=true; $('refresh').disabled=false;
 for(const [scope,column] of Object.entries(columns)){
  column.version++;column.rows=[];column.loading=false;
  $(scope+'-list').replaceChildren();$(scope+'-list').removeAttribute('aria-busy');$(scope+'-page-label').textContent='';
  $(scope+'-previous').disabled=true;$(scope+'-next').disabled=true;
 }
 saveSession(null); profile = null;
 $('workspace').hidden = true; $('password-panel').hidden = true; $('login-panel').hidden = false;
 $('logout').hidden = true; $('identity').textContent = ''; if ($('share-dialog').open) $('share-dialog').close();
}
async function parseResponse(response) {
 if(response.ok) return response;
 let body = {}; try { body = await response.json(); } catch {}
 const error = new Error(body.message || body.msg || body.error_description || 'REQUEST_FAILED');
 error.status = response.status; error.code = body.code;
 throw error;
}
async function renew() {
 if (!session) throw Object.assign(new Error('NO_SESSION'),{status:401});
 if (!refreshPromise) { const version=authVersion; refreshPromise = (async () => {
  const response = await fetch(config.supabaseUrl + '/auth/v1/token?grant_type=refresh_token', {
   method:'POST',cache:'no-store',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},
   body:JSON.stringify({refresh_token:session.refresh_token})
  });
  await parseResponse(response); const value=await response.json();
  if(version!==authVersion)throw Object.assign(new Error('SESSION_CHANGED'),{status:401});
  saveSession(value);
 })().catch(error => { if(version===authVersion)reset(); throw error; }).finally(()=>{refreshPromise=null;}); }
 return refreshPromise;
}
async function token() {
 if (!session) throw Object.assign(new Error('NO_SESSION'),{status:401});
 const expires = session.expires_at || 0;
 if (expires < Date.now()/1000 + 60) await renew();
 return session.access_token;
}
async function request(path, {method='POST',body,authenticated=true} = {}, retry=true) {
 const version=authVersion; const bearer = authenticated ? await token() : null;
 const response = await fetch(config.supabaseUrl + path,{
  method,cache:'no-store',headers:{apikey:config.publishableKey,'Content-Type':'application/json',...(bearer?{Authorization:'Bearer '+bearer}:{})},
  ...(body===undefined?{}:{body:JSON.stringify(body)})
 });
 if(authenticated&&version!==authVersion)throw Object.assign(new Error('SESSION_CHANGED'),{status:401});
 if(response.status===401 && authenticated && retry) { await renew(); return request(path,{method,body,authenticated},false); }
 if(response.status===401 && authenticated) reset();
 await parseResponse(response); return response.status===204 ? null : response.json();
}
const rpc = (name, body={}) => request('/rest/v1/rpc/'+name,{body});
const board=initBoard({rpc,getProfile:()=>profile});
function formatSize(bytes) { return bytes < 1024*1024 ? Math.ceil(bytes/1024)+'KB' : (bytes/1024/1024).toFixed(1)+'MB'; }
function button(text,action) { const el=document.createElement('button');el.type='button';el.textContent=text;el.addEventListener('click',action);return el; }
async function download(file, target) {
 target.disabled=true;const identity=profile?.id,version=authVersion;
 try {
  const bearer=await token();
  const response=await fetch(config.supabaseUrl+'/functions/v1/boosterjet-download',{
   method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+bearer,'Content-Type':'application/json'},body:JSON.stringify({fileId:file.id}),cache:'no-store'
  });
  await parseResponse(response);const blob=await response.blob();
  if(profile?.id!==identity||version!==authVersion)return;
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=file.filename;
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  notice('「'+file.filename+'」 다운로드했습니다.');
 } catch(error) { if(version===authVersion){if(error.status===401)reset();notice(message(error),true);} }
 finally {target.disabled=false;}
}
async function removeFile(file,target) {
 if(file.owner_id!==profile?.id||!confirm('「'+file.filename+'」을 삭제하시겠습니까?\n공유받은 사람의 목록에서도 사라지며 복구할 수 없습니다.'))return;
 target.disabled=true;const version=authVersion;
 try{
  await request('/functions/v1/boosterjet-delete',{body:{fileId:file.id}});
  if(version!==authVersion)return;
  if(currentShare?.id===file.id)$('share-dialog').close();
  firstPages();await loadFiles();notice('「'+file.filename+'」을 삭제했습니다.');
 }catch(error){if(version===authVersion)notice(message(error),true);}
 finally{target.disabled=false;}
}
function renderFiles(scope) {
 const {rows,offset}=columns[scope],list=$(scope+'-list');list.replaceChildren();
 if (!rows.length) {const p=document.createElement('p');p.className='empty';p.textContent=search?'검색 결과가 없습니다. 다른 파일명으로 검색해 주세요.':scope==='mine'?'아직 올린 파일이 없습니다. 파일을 선택해 올려 주세요.':profile.role==='admin'?'다른 참여자가 올린 파일이 아직 없습니다.':'아직 공유받은 파일이 없습니다. 관리자가 공유하면 여기에 표시됩니다.';list.append(p);}
 for(const file of rows.slice(0,50)){
  const row=document.createElement('article');row.className='file-row';
  const info=document.createElement('div');info.className='file-info';
  const title=document.createElement('div');title.className='file-name';title.textContent=file.filename;
  const meta=document.createElement('div');meta.className='file-meta';
  const badge=document.createElement('span');badge.className='badge';badge.textContent='올린 사람 · '+file.owner_name;
  meta.append(badge,document.createTextNode(formatSize(file.size_bytes)+' · '+new Date(file.created_at).toLocaleDateString('ko-KR')));
  info.append(title,meta);const actions=document.createElement('div');actions.className='file-actions';
  const down=button('다운로드',()=>download(file,down));actions.append(down);
  if(profile.role==='admin')actions.append(button('공유 대상',()=>openShare(file)));
  if(file.owner_id===profile.id){const del=button('삭제',()=>removeFile(file,del));del.className='delete-file';actions.append(del);}
  row.append(info,actions);list.append(row);
 }
 $(scope+'-previous').disabled=offset===0;$(scope+'-next').disabled=rows.length<=50;$(scope+'-page-label').textContent=(offset/50+1)+'페이지';
}
async function loadFiles(scopes=Object.keys(columns)) {
 await Promise.all(scopes.map(async scope=>{
  const column=columns[scope],version=++column.version,identity=authVersion,list=$(scope+'-list');
  column.loading=true;list.setAttribute('aria-busy','true');list.replaceChildren();$(scope+'-page-label').textContent='';
  const loading=document.createElement('p');loading.className='empty';loading.textContent='파일을 불러오고 있습니다.';list.append(loading);
  $('refresh').disabled=true;$(scope+'-previous').disabled=true;$(scope+'-next').disabled=true;
  try {const result=await rpc('bj_files_by_owner',{p_scope:scope,p_search:search,p_offset:column.offset});
   if(version!==column.version||identity!==authVersion||!profile)return;column.rows=result;renderFiles(scope);
  }catch(error){if(version===column.version&&identity===authVersion){column.rows=[];list.replaceChildren();
   const p=document.createElement('p');p.className='empty';p.textContent='목록을 불러오지 못했습니다. 새로고침으로 다시 시도해 주세요.';list.append(p);$(scope+'-page-label').textContent='';notice(message(error),true);
  }}finally{if(version===column.version&&identity===authVersion){column.loading=false;list.removeAttribute('aria-busy');$('refresh').disabled=Object.values(columns).some(c=>c.loading);}}
 }));
}
async function enter() {
 profile=await rpc('bj_profile');$('identity').textContent=profile.name;$('logout').hidden=false;
 $('login-panel').hidden=true;$('password-panel').hidden=true;$('workspace').hidden=false;
 $('files-title').textContent=profile.role==='admin'?'프로젝트 파일':'내가 볼 수 있는 파일';
 notice(profile.role==='admin'?'관리자 계정입니다. 공지사항을 작성하고 파일별 공유 대상을 관리할 수 있습니다.':'파일은 내 자료와 공유받은 자료만, 게시글은 모든 참여자에게 표시됩니다.');
 board.enter();firstPages();await loadFiles();
}
async function openShare(file) {
 const version=++shareVersion; const dialog=$('share-dialog');currentShare=file;$('share-filename').textContent=file.filename;$('share-error').textContent='';
 $('share-options').textContent='공유 대상을 확인하고 있습니다.';dialog.showModal();$('share-form').querySelector('[type=submit]').disabled=true;
 try {
  const [members,selected]=await Promise.all([rpc('bj_members'),rpc('bj_get_shares',{p_file_id:file.id})]);
  if(version!==shareVersion||!dialog.open)return;
  $('share-options').replaceChildren();
  for(const member of members.filter(m=>m.active)){
   const label=document.createElement('label');label.className='share-option';
   const input=document.createElement('input');input.type='checkbox';input.value=member.id;input.checked=selected.includes(member.id);
   label.append(input,document.createTextNode(member.name));$('share-options').append(label);
  }
  if(!$('share-options').children.length)$('share-options').textContent='등록된 외부 참여자가 없습니다.';
  $('share-form').querySelector('[type=submit]').disabled=false;
 }catch(error){if(version===shareVersion&&dialog.open)$('share-error').textContent=message(error);}
}
$('close-share').onclick=()=>$('share-dialog').close();
$('share-dialog').addEventListener('close',()=>{if(!$('share-dialog').open){shareVersion++;currentShare=null;}});
$('share-form').onsubmit=async event=>{
 event.preventDefault();const submit=event.submitter,version=shareVersion,file=currentShare;if(!file)return;submit.disabled=true;$('share-error').textContent='';
 try{const selected=[...$('share-options').querySelectorAll('input:checked')].map(i=>i.value);
  await rpc('bj_set_shares',{p_file_id:file.id,p_user_ids:selected});if(version===shareVersion){$('share-dialog').close();notice('파일 공유 대상을 저장했습니다.');}
 }catch(error){if(version===shareVersion)$('share-error').textContent=message(error);}finally{if(version===shareVersion)submit.disabled=false;}
};
function upload(file,path,bearer,onProgress){
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();xhr.open('POST',config.supabaseUrl+'/storage/v1/object/'+bucket+'/'+path);
  xhr.setRequestHeader('apikey',config.publishableKey);xhr.setRequestHeader('Authorization','Bearer '+bearer);
  xhr.setRequestHeader('Content-Type','application/octet-stream');xhr.setRequestHeader('x-upsert','false');
  xhr.upload.onprogress=event=>{if(event.lengthComputable)onProgress(event.loaded/event.total*100);};
  xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(Object.assign(new Error('UPLOAD_FAILED'),{status:xhr.status}));
  xhr.onerror=()=>reject(new Error('NETWORK'));xhr.timeout=15*60*1000;xhr.ontimeout=()=>reject(new Error('TIMEOUT'));xhr.send(file);
 });
}
$('upload-form').onsubmit=async event=>{
 event.preventDefault();if(busy||!profile)return;busy=true;const version=authVersion,files=[...$('files').files],submit=event.submitter;
 submit.disabled=true;$('logout').disabled=true;$('files').disabled=true;$('progress').hidden=false;$('upload-results').replaceChildren();
 let success=0;
 try {
 for(let i=0;i<files.length;i++){
  const file=files[i],result=document.createElement('li');$('progress').value=0;
  $('upload-status').textContent=(i+1)+' / '+files.length+' · '+file.name;
  try{
   if(file.size<1||file.size>profile.maxFileBytes||file.name.length>180||/[\x00-\x1f/\\]/.test(file.name))throw new Error('INVALID_FILE');
   const reservation=await rpc('bj_reserve_upload',{p_filename:file.name,p_size:file.size});
   await upload(file,reservation.path,await token(),value=>$('progress').value=value);
   result.textContent='완료 · '+file.name;success++;
  }catch(error){if(version!==authVersion){notice('로그인이 만료되어 업로드를 중단했습니다. 다시 로그인해 주세요.',true);return;}result.className='failed';result.textContent='실패 · '+file.name+' — '+message(error);}
  if(version!==authVersion)return;
  $('upload-results').append(result);
 }
 $('upload-status').textContent=success+'개 완료 / '+(files.length-success)+'개 실패';
 if(success===files.length)$('files').value='';
 notice(success===files.length?'파일을 올렸습니다. 나와 관리자만 볼 수 있습니다.':'일부 파일을 올리지 못했습니다. 아래 결과에서 실패한 파일을 확인해 주세요.',success!==files.length);
 firstPages();await loadFiles();
 }finally{busy=false;submit.disabled=false;$('logout').disabled=false;$('files').disabled=false;$('progress').hidden=true;}
};
$('login-form').onsubmit=async event=>{
 event.preventDefault();event.submitter.disabled=true;
 try{const value=await request('/auth/v1/token?grant_type=password',{authenticated:false,body:{email:$('email').value.trim(),password:$('password').value}});
  saveSession(value);$('password').value='';await enter();
 }catch(error){reset();notice(error.status===400?'이메일과 비밀번호를 확인해 주세요. 처음 접속하시면 전달받은 초대 링크에서 비밀번호를 설정해 주세요.':message(error),true);}
 finally{event.submitter.disabled=false;}
};
$('password-form').onsubmit=async event=>{
 event.preventDefault();if($('new-password').value!==$('confirm-password').value){notice('입력한 두 비밀번호가 다릅니다. 다시 확인해 주세요.',true);return;}
 event.submitter.disabled=true;
 try{await request('/auth/v1/user',{method:'PUT',body:{password:$('new-password').value}});$('password-form').reset();await enter();notice('비밀번호를 저장했습니다. 파일을 주고받을 수 있습니다.');}
 catch(error){notice(message(error),true);}finally{event.submitter.disabled=false;}
};
$('logout').onclick=async()=>{const old=session;reset();notice('로그아웃했습니다.');if(old)await fetch(config.supabaseUrl+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:config.publishableKey,Authorization:'Bearer '+old.access_token}}).catch(()=>{});};
$('refresh').onclick=()=>loadFiles();$('search-form').onsubmit=event=>{event.preventDefault();search=$('search').value.trim();firstPages();loadFiles();};
for(const [scope,column] of Object.entries(columns)){
 $(scope+'-previous').onclick=()=>{column.offset=Math.max(0,column.offset-50);loadFiles([scope]);};
 $(scope+'-next').onclick=()=>{column.offset+=50;loadFiles([scope]);};
}
async function init(){
 const hash=new URLSearchParams(location.hash.slice(1));history.replaceState(null,'',location.pathname+location.search);
 try{
  const response=await fetch('./config.json',{cache:'no-store'});if(!response.ok)throw new Error('NOT_CONFIGURED');config=await response.json();
  if(!/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(config.supabaseUrl)||!config.publishableKey)throw new Error('NOT_CONFIGURED');
  const key=config.publishableKey;
  if(key.startsWith('sb_secret_'))throw new Error('NOT_CONFIGURED');
  if(key.split('.').length===3){const payload=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));if(payload.role!=='anon')throw new Error('NOT_CONFIGURED');}
  else if(!key.startsWith('sb_publishable_'))throw new Error('NOT_CONFIGURED');
  if(hash.has('token_hash')){
   const type=hash.get('type');
   if(!['invite','recovery'].includes(type)||!/^[a-z0-9]+$/i.test(hash.get('token_hash')||''))throw new Error('INVALID_INVITE');
   const value=await request('/auth/v1/verify',{authenticated:false,body:{token_hash:hash.get('token_hash'),type}});
   hash.set('access_token',value.access_token);hash.set('refresh_token',value.refresh_token);hash.set('expires_in',String(value.expires_in));
  }
  if(hash.has('access_token')&&hash.has('refresh_token')){
   saveSession({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_at:Date.now()/1000+Number(hash.get('expires_in')||0)});
   await request('/auth/v1/user',{method:'GET'});profile=await rpc('bj_profile');$('identity').textContent=profile.name;$('logout').hidden=false;
   $('password-panel').hidden=false;notice('초대가 확인되었습니다. 사용할 비밀번호를 설정해 주세요.');return;
  }
  try{session=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{saveSession(null);}
  if(session)await enter();else{reset();notice(hash.has('error')?'초대 링크가 만료되었거나 사용할 수 없습니다. 관리자에게 새 초대를 요청해 주세요.':'초대받은 이메일로 로그인해 주세요.',hash.has('error'));}
 }catch(error){
  if(error.message==='NOT_CONFIGURED'){notice('파일 공유 공간을 준비하고 있습니다. 관리자 설정이 끝나면 이용할 수 있습니다.',true);return;}
  reset();notice(hash.has('token_hash')?'초대 링크가 만료되었거나 사용할 수 없습니다. 관리자에게 새 초대를 요청해 주세요.':message(error),true);
 }
}
init();

