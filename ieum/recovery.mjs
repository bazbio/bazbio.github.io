// Independent login enhancement; does not change the existing application or enrollment flow.
const el=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=text;return node;};
let config;
async function api(body){
 config??=fetch('./config.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('CONFIG');return r.json();}).catch(e=>{config=null;throw e;});
 const settings=await config;let base='';
 if(settings.apiBase){const url=new URL(settings.apiBase);if(url.protocol!=='https:'||url.username||url.password)throw Error('CONFIG');base=url.href.replace(/\/$/,'');}
 let response;try{response=await fetch(`${base}/functions/v1/ieum-recovery`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}catch{throw Error('NETWORK');}
 const result=await response.json();if(!response.ok||!result.ok)throw Error(result.코드||'INTERNAL_ERROR');return result;
}
function message(error){return ({RESET_INVALID:'사용했거나 만료된 링크입니다. 새 재설정 메일을 요청해 주세요.',PASSWORD_POLICY:'비밀번호는 4~10자로 입력해 주세요.',INVALID_INPUT:'입력한 내용을 확인해 주세요.',NETWORK:'응답을 확인하지 못했습니다. 비밀번호를 저장하던 중이었다면 새 비밀번호로 로그인을 먼저 확인해 주세요.'})[error.message]||'재설정을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';}
function openRecovery(initialToken=null){
 let token=initialToken;const dialog=el('dialog'),form=el('form'),title=el('h2',token?'새 비밀번호 설정':'비밀번호를 잊으셨나요?');
 title.id='password-recovery-title';dialog.setAttribute('aria-labelledby',title.id);form.className='login-card';form.append(title);
 const hint=el('p',token?'새 비밀번호를 설정하면 이전 로그인 세션이 만료됩니다.':'이음에 등록된 회사 이메일로 재설정 링크를 보내드립니다.');hint.className='hint';form.append(hint);
 const status=el('p');status.className='error';status.setAttribute('role','status');
 const actions=el('div');actions.className='dialog-actions';const close=el('button','닫기');close.type='button';close.className='secondary';
 const submit=el('button',token?'새 비밀번호 저장':'재설정 메일 받기');submit.type='submit';submit.className='primary';actions.append(close,submit);
 const field=(label,type,autocomplete)=>{const wrap=el('label',label),input=el('input');input.type=type;input.required=true;input.autocomplete=autocomplete;wrap.append(input);form.append(wrap);return input;};
 let email,password,again;
 if(token){password=field('새 비밀번호 (4~10자)','password','new-password');again=field('새 비밀번호 확인','password','new-password');for(const input of [password,again]){input.minLength=4;input.maxLength=10;}submit.disabled=true;}
 else{email=field('회사 이메일','email','username');email.maxLength=254;email.value=document.querySelector('#login-form [name=email]')?.value||'';}
 form.append(status,actions);dialog.append(form);document.body.append(dialog);dialog.showModal();
 close.onclick=()=>dialog.close();dialog.addEventListener('close',()=>{token=null;form.reset();dialog.remove();});
 if(token)api({종류:'재설정확인',재설정토큰:token}).then(()=>{if(dialog.isConnected){submit.disabled=false;password.focus();}}).catch(error=>{if(dialog.isConnected){status.textContent=message(error);submit.hidden=true;const retry=el('button','새 재설정 메일 요청');retry.type='button';retry.className='primary';retry.onclick=()=>{dialog.close();openRecovery();};actions.append(retry);}});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(submit.disabled)return;
  if(token&&password.value!==again.value){status.textContent='두 비밀번호가 일치하지 않습니다.';return;}
  submit.disabled=true;status.textContent='처리 중입니다…';const resetting=Boolean(token);
  try{
   const result=await api(resetting?{종류:'재설정완료',재설정토큰:token,비밀번호:password.value}:{종류:'재설정요청',이메일:email.value});
   if(!dialog.isConnected)return;
   form.reset();submit.hidden=true;hint.hidden=true;for(const field of [email,password,again])if(field)field.parentElement.hidden=true;status.className='success';
   if(resetting){token=null;sessionStorage.removeItem('ieum.token');status.textContent='비밀번호를 재설정했습니다. 새 비밀번호로 로그인해 주세요.';close.textContent='로그인으로 이동';close.onclick=()=>location.assign(location.pathname+location.search);}
   else status.textContent=result.메시지+' 링크는 30분 동안 유효합니다. 다시 요청하려면 1분 후 시도해 주세요.';
  }catch(error){if(dialog.isConnected)status.textContent=message(error);}finally{if(password){password.value='';again.value='';}submit.disabled=false;}
 });
}
const loginForm=document.querySelector('#login-form');
if(loginForm){const button=el('button','비밀번호를 잊으셨나요?');button.id='forgot-password';button.type='button';button.className='text-button';button.onclick=()=>openRecovery();loginForm.append(button);}
function consumeFragment(){const token=new URLSearchParams(location.hash.slice(1)).get('reset');if(token){history.replaceState(null,'',location.pathname+location.search);openRecovery(token);}}
consumeFragment();window.addEventListener('hashchange',consumeFragment);
