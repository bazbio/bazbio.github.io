const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(s);
export function workLink(hash){
 const p=new URLSearchParams(hash.replace(/^#/,''));
 if(p.has('invite')||p.has('recovery')||p.has('reset'))return null;
 if(p.getAll('work').length!==1||!uuid(p.get('work')))return null;
 return {id:p.get('work'),postId:p.getAll('maruPost').length===1&&uuid(p.get('maruPost'))?p.get('maruPost'):null};
}
export function maruReturn(base,postId){
 if(!base||!uuid(postId))return null;
 try{const u=new URL(base);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)return null;u.hash=new URLSearchParams({post:postId}).toString();return u.href;}catch{return null;}
}
