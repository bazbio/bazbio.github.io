export const accepted='.jpg,.jpeg,.png,.pdf,.txt,.csv,.docx,.xlsx,.pptx';
export async function fileData(file){
 if(!file||file.size<1||file.size>5242880)throw new Error('파일당 5MB 이하의 파일을 선택해 주세요.');
 const bytes=new Uint8Array(await file.arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));
 const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');return {파일명:file.name,크기:file.size,해시:hash,데이터:btoa(text)};
}
export function createAttachments({el,button,send,api,refresh,getInfo,isBusy,message,handleError}){
 function overview(data){const box=el('section',null,'detail-card attachment-overview');box.append(el('h3','업무 첨부 자료'));const total=(data.첨부||[]).reduce((n,f)=>n+f.크기,0);box.append(el('p',`사진·PDF·텍스트·Office 문서 · 파일당 5MB · 누적 ${(total/1048576).toFixed(1)} / 50MB`,'hint'));
  const frozen=data.종결?.종결시각||data.종결?.심사.some(r=>r.상태==='제출')||data.단계==='비승인';const sub=data.부서업무.find(b=>!b.기원부서업무ID).ID;
  const request=(kind,args)=>({종류:kind,업무ID:data.업무ID,부서업무ID:sub,기대업무개정:data.업무개정,인자:args});
  for(const file of data.첨부||[]){const row=el('article',null,'attachment-item');row.append(el('strong',file.파일명),el('p',file.설명),el('p',`${file.작성자} · ${new Date(file.생성시각).toLocaleString('ko-KR')} · ${(file.크기/1024).toFixed(1)}KB`,'hint'));
   if(file.철회시각)row.append(el('p',`철회됨 · ${file.철회사유}`,'hint'));
   else{row.append(button('다운로드','secondary',async()=>{try{const blob=await api('file',{종류:'첨부다운로드',첨부ID:file.ID},true);const url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download=file.파일명;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){handleError(e);}}));
    if(!frozen&&[file.작성자ID,data.전체책임자?.ID].includes(getInfo().본인.ID)){const fold=el('details');fold.append(el('summary','첨부 철회'));const f=el('form'),label=el('label','첨부 철회 사유'),note=el('textarea');note.required=true;note.maxLength=2000;note.setAttribute('aria-label','첨부 철회 사유');label.append(note);const submit=el('button','첨부 철회 확정','secondary');submit.type='submit';const err=el('p','','error');f.append(label,err,submit);f.addEventListener('submit',async e=>{e.preventDefault();if(isBusy())return;try{const r=await send(request('첨부철회',{첨부ID:file.ID,사유:note.value}));if(r){await refresh(data.업무ID);message('첨부 철회가 반영되었습니다.');}}catch(e){err.textContent=e.message;if(e.status===401)handleError(e);}});fold.append(f);row.append(fold);}
   }box.append(row);
  }
  if(!frozen){const fold=el('details');fold.append(el('summary','첨부 파일 추가'));const f=el('form'),label=el('label','첨부 파일'),input=el('input');input.type='file';input.accept=accepted;input.required=true;input.setAttribute('aria-label','첨부 파일');label.append(input);const descLabel=el('label','첨부 설명'),desc=el('textarea');desc.required=true;desc.maxLength=2000;desc.setAttribute('aria-label','첨부 설명');descLabel.append(desc);const err=el('p','','error');err.setAttribute('role','alert');const submit=el('button','첨부 업로드','primary');submit.type='submit';f.append(label,descLabel,err,submit);
   f.addEventListener('submit',async e=>{e.preventDefault();if(isBusy())return;submit.disabled=true;try{const parsed=await fileData(input.files[0]);const {데이터,...meta}=parsed;const r=await send(request('첨부업로드',{...meta,설명:desc.value}),'file',데이터);if(r){await refresh(data.업무ID);message('첨부 파일을 저장했습니다.');}}catch(e){err.textContent=e.message;if(e.status===401)handleError(e);}finally{submit.disabled=false;}});fold.append(f);box.append(fold);
  }else box.append(el('p','현재 단계에서는 첨부 자료를 변경할 수 없습니다.','hint'));return box;
 }
 return {overview};
}
