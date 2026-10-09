const $=id=>document.getElementById(id);
const labels={meeting:'회의록',notice:'공지사항'};
export function initBoard({rpc,getProfile}){
 let kind='meeting',offset=0,search='',epoch=0,listVersion=0,detailVersion=0,current=null,editing=false,working=false,initial='';
 const dialog=$('post-dialog'),form=$('post-form');
 const canWrite=()=>kind==='meeting'||getProfile()?.role==='admin';
 const canEdit=post=>post.owner_id===getProfile()?.id&&(post.kind==='meeting'||getProfile()?.role==='admin');
 const values=()=>JSON.stringify([$('post-title').value,$('post-body').value,$('post-date').value]);
 const dirty=()=>editing&&values()!==initial;
 function status(text,error=false){$('board-status').textContent=text;$('board-status').classList.toggle('error',error);}
 function errorText(error){
  if(error.message==='POST_CHANGED')return '다른 창에서 변경된 글입니다. 작성한 내용을 복사한 뒤 글을 다시 열어 주세요.';
  if(error.message==='POST_NOT_FOUND')return '삭제되었거나 더 이상 찾을 수 없는 글입니다. 목록을 새로고침해 주세요.';
  if(error.status===401)return '로그인이 만료되었습니다. 다시 로그인해 주세요.';
  if(error.status===403||error.code==='42501')return '이 작업을 할 권한이 없습니다. 계정과 참여 상태를 확인해 주세요.';
  return '처리를 완료하지 못했습니다. 입력한 내용은 유지됩니다. 연결을 확인하고 다시 시도해 주세요.';
 }
 function meta(post){
  const date=new Date(post.created_at).toLocaleDateString('ko-KR');
  return (post.meeting_date?'회의일 '+post.meeting_date+' · ':'')+post.owner_name+' · 작성 '+date+(post.revision>1?' · 수정됨':'');
 }
 function close(force=false){
  if(!force&&(working||(dirty()&&!confirm('작성 중인 내용을 저장하지 않고 닫으시겠습니까?'))))return;
  detailVersion++;editing=false;working=false;current=null;form.reset();$('post-content').textContent='';$('post-heading').textContent='';$('post-meta').textContent='';$('post-error').textContent='';$('post-loading').textContent='';
  if(dialog.open)dialog.close();
 }
 function busy(value){working=value;for(const id of ['post-save','post-delete','post-edit','post-close'])$(id).disabled=value;for(const el of form.elements)el.disabled=value;}
 function mode(edit){editing=edit;$('post-form').hidden=!edit;$('post-reader').hidden=edit;}
 function editor(post=null){
  current=post;mode(true);busy(false);$('post-loading').textContent='';$('post-error').textContent='';
  $('post-heading').textContent=labels[kind]+' '+(post?'수정':'작성');
  $('post-title').value=post?.title||'';$('post-body').value=post?.body||'';
  const now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
  $('post-date').value=kind==='meeting'?(post?.meeting_date||today):'';
  $('post-date-field').hidden=kind!=='meeting';$('post-date').required=kind==='meeting';
  $('post-save').textContent=post?'수정 내용 저장':'게시글 등록';initial=values();
  if(!dialog.open)dialog.showModal();$('post-title').focus();
 }
 async function openPost(id){
  const version=++detailVersion,identity=epoch;current=null;editing=false;busy(false);
  $('post-heading').textContent=labels[kind];$('post-loading').textContent='게시글을 불러오고 있습니다.';$('post-error').textContent='';$('post-reader').hidden=true;form.hidden=true;
  dialog.showModal();
  try{
   const post=await rpc('bj_post',{p_post_id:id});
   if(version!==detailVersion||identity!==epoch||!dialog.open)return;
   current=post;mode(false);$('post-heading').textContent=post.title;$('post-meta').textContent=meta(post);$('post-content').textContent=post.body;
   $('post-edit').hidden=$('post-delete').hidden=!canEdit(post);
  }catch(error){if(version===detailVersion&&identity===epoch)$('post-error').textContent=errorText(error);}
  finally{if(version===detailVersion&&identity===epoch)$('post-loading').textContent='';}
 }
 async function load(){
  const version=++listVersion,identity=epoch,list=$('board-list');
  list.replaceChildren();list.setAttribute('aria-busy','true');$('board-page').textContent='';$('board-previous').disabled=$('board-next').disabled=true;$('board-refresh').disabled=true;
  status('게시글을 불러오고 있습니다.');
  try{
   const rows=await rpc('bj_posts',{p_kind:kind,p_search:search,p_offset:offset});
   if(version!==listVersion||identity!==epoch)return;
   if(!rows.length&&offset){offset=Math.max(0,offset-20);return load();}
   status('');
   if(!rows.length){
    const p=document.createElement('p');p.className='empty';p.textContent=search?'검색 결과가 없습니다. 다른 검색어를 입력해 주세요.':canWrite()?'아직 게시글이 없습니다. 첫 '+labels[kind]+'을 작성해 주세요.':'아직 공지사항이 없습니다. 관리자가 등록하면 여기에 표시됩니다.';list.append(p);
   }
   for(const post of rows.slice(0,20)){
    const article=document.createElement('article');article.className='post-row';
    const title=document.createElement('button');title.type='button';title.className='post-link';title.textContent=post.title;title.onclick=()=>openPost(post.id);
    const h=document.createElement('h3');h.append(title);
    const details=document.createElement('p');details.className='post-meta';details.textContent=meta(post);
    const excerpt=document.createElement('p');excerpt.className='post-excerpt';excerpt.textContent=post.excerpt;
    article.append(h,details,excerpt);list.append(article);
   }
   $('board-page').textContent=(offset/20+1)+'페이지';$('board-previous').disabled=offset===0;$('board-next').disabled=rows.length<=20;
  }catch(error){if(version===listVersion&&identity===epoch){status('목록을 불러오지 못했습니다. '+errorText(error),true);}}
  finally{if(version===listVersion&&identity===epoch){list.removeAttribute('aria-busy');$('board-refresh').disabled=false;}}
 }
 function activate(view){
  listVersion++;$('files-view').hidden=view!=='files';$('board-view').hidden=view==='files';
  for(const b of document.querySelectorAll('[data-workspace-view]'))b.setAttribute('aria-pressed',String(b.dataset.workspaceView===view));
  if(view==='files')return;
  kind=view;offset=0;search='';$('board-search-form').reset();$('board-heading').textContent=labels[kind];$('board-new').textContent=labels[kind]+' 작성';$('board-new').hidden=!canWrite();
  $('board-help').textContent=kind==='meeting'?'회의 내용과 결정 사항을 기록하세요. 모든 참여자가 읽고, 작성할 수 있습니다.':'관리자가 전하는 프로젝트 소식입니다. 모든 참여자가 읽을 수 있습니다.';
  load();
 }
 for(const b of document.querySelectorAll('[data-workspace-view]'))b.onclick=()=>activate(b.dataset.workspaceView);
 $('board-new').onclick=()=>{if(canWrite()){detailVersion++;editor();}};
 $('board-refresh').onclick=()=>load();
 $('board-search-form').onsubmit=e=>{e.preventDefault();search=$('board-search').value.trim();offset=0;load();};
 $('board-previous').onclick=()=>{offset=Math.max(0,offset-20);load();};$('board-next').onclick=()=>{offset+=20;load();};
 $('post-close').onclick=()=>close();dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
 $('post-edit').onclick=()=>{if(current&&canEdit(current))editor(current);};
 form.onsubmit=async e=>{
  e.preventDefault();if(working)return;
  for(const id of ['post-title','post-body']){const field=$(id);if(!field.value.trim()){field.setCustomValidity('내용을 입력해 주세요.');field.reportValidity();return;}}
  const version=detailVersion,identity=epoch;busy(true);$('post-error').textContent='';
  try{
   await rpc('bj_save_post',{p_kind:kind,p_title:$('post-title').value.trim(),p_body:$('post-body').value.trim(),p_meeting_date:kind==='meeting'?$('post-date').value:null,p_post_id:current?.id||null,p_revision:current?.revision||null});
   if(version!==detailVersion||identity!==epoch)return;
   const action=current?'수정':'등록';close(true);offset=0;await load();if(identity===epoch&&!$('board-status').classList.contains('error'))status(labels[kind]+'을 '+action+'했습니다.');
  }catch(error){if(version===detailVersion&&identity===epoch)$('post-error').textContent=errorText(error);}
  finally{if(version===detailVersion&&identity===epoch)busy(false);}
 };
 for(const id of ['post-title','post-body'])$(id).addEventListener('input',()=>$(id).setCustomValidity(''));
 $('post-delete').onclick=async()=>{
  if(working||!current||!canEdit(current)||!confirm('「'+current.title+'」을 삭제하시겠습니까? 삭제하면 복구할 수 없습니다.'))return;
  const version=detailVersion,identity=epoch;busy(true);$('post-error').textContent='';
  try{
   await rpc('bj_delete_post',{p_post_id:current.id,p_revision:current.revision});
   if(version!==detailVersion||identity!==epoch)return;
   close(true);await load();if(identity===epoch&&!$('board-status').classList.contains('error'))status('게시글을 삭제했습니다.');
  }catch(error){if(version===detailVersion&&identity===epoch)$('post-error').textContent=errorText(error);}
  finally{if(version===detailVersion&&identity===epoch)busy(false);}
 };
 window.addEventListener('beforeunload',e=>{if(dirty()){e.preventDefault();e.returnValue='';}});
 function reset(){epoch++;listVersion++;close(true);kind='meeting';offset=0;search='';$('board-list').replaceChildren();$('board-list').removeAttribute('aria-busy');$('board-search-form').reset();status('');activate('files');}
 return {reset,enter:reset};
}
