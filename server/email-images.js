'use strict';
// Hosted email images: validation, safe keys, and Web Request/Response handlers shared by the Netlify Functions.
const crypto=require('node:crypto');
const MAX_BYTES=2*1024*1024;
const EXTENSIONS={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'};
const CONTENT_TYPES={png:'image/png',jpg:'image/jpeg',webp:'image/webp'};
const KEY_PATTERN=/^(preview\/)?\d{4}\/\d{2}\/[a-z0-9]+(-[a-z0-9]+)*-[0-9a-f]{32}\.(png|jpg|webp)$/;
const UPLOAD_ROLES=['editor','admin'];
const PUBLIC_PATH='/email-images/';
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});

// Trust file signatures, not the browser-supplied type or name.
function sniff(bytes){
 const b=bytes,at=(i,...v)=>v.every((x,j)=>b[i+j]===x);
 if(b.length>=8&&at(0,0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a))return 'image/png';
 if(b.length>=3&&at(0,0xff,0xd8,0xff))return 'image/jpeg';
 if(b.length>=12&&at(0,0x52,0x49,0x46,0x46)&&at(8,0x57,0x45,0x42,0x50))return 'image/webp';
 return '';
}
function slug(name){
 const base=String(name||'').replace(/\.[a-z0-9]{1,5}$/i,'').normalize('NFKD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40).replace(/-+$/,'');
 return base||'image';
}
function makeKey(name,type,{now=new Date(),id=crypto.randomUUID().replace(/-/g,''),preview=false}={}){
 const month=String(now.getUTCMonth()+1).padStart(2,'0');
 return `${preview?'preview/':''}${now.getUTCFullYear()}/${month}/${slug(name)}-${id}.${EXTENSIONS[type]}`;
}
const validKey=key=>typeof key==='string'&&key.length<=200&&KEY_PATTERN.test(key);
const roles=user=>Array.isArray(user?.roles)?user.roles:Array.isArray(user?.appMetadata?.roles)?user.appMetadata.roles:[];
const canUpload=user=>!!user?.id&&roles(user).some(r=>UPLOAD_ROLES.includes(r));
// Rejects browser cross-origin writes; authorization is the Identity role check.
const crossOrigin=req=>{const origin=req.headers.get('origin');return !!origin&&origin!==new URL(req.url).origin;};

async function authorize(getUser){
 const user=await getUser();
 if(!user)return [null,reply(401,{error:'Sign in with your Studio editor account to host images.',code:'SIGN_IN_REQUIRED'})];
 if(!canUpload(user))return [null,reply(403,{error:'Your account is signed in but does not have the editor role required to host images. Ask a Studio administrator to add it.',code:'ROLE_REQUIRED'})];
 return [user,null];
}

function createApiHandler({getStore,getUser,isProduction=()=>false,now=()=>new Date(),log=entry=>console.error(JSON.stringify(entry))}){return async req=>{
 try{
  if(!['POST','DELETE'].includes(req.method))return new Response(JSON.stringify({error:'Method not allowed.'}),{status:405,headers:{...headers,Allow:'POST, DELETE'}});
  if(crossOrigin(req))return reply(403,{error:'Cross-origin requests are not allowed.'});
  if(req.method==='DELETE'){
   const key=new URL(req.url).searchParams.get('key');
   if(!validKey(key))return reply(400,{error:'Invalid hosted image reference.'});
   const [user,denied]=await authorize(getUser);if(denied)return denied;
   const store=getStore(),entry=await store.getMetadata(key);
   if(!entry)return reply(404,{error:'This hosted image no longer exists.'});
   // Only the uploader or an admin may delete; a card reference alone grants nothing.
   if(entry.metadata?.ownerId!==user.id&&!roles(user).includes('admin'))return reply(403,{error:'Only the editor who uploaded this image, or a Studio administrator, can delete it.',code:'NOT_OWNER'});
   await store.delete(key);
   return reply(200,{deleted:true,key});
  }
  const type=(req.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!EXTENSIONS[type])return reply(415,{error:'Upload a PNG, JPEG, or WebP image.'});
  if(Number(req.headers.get('content-length')||0)>MAX_BYTES)return reply(413,{error:'Hosted images must be 2 MB or smaller.'});
  const [user,denied]=await authorize(getUser);if(denied)return denied;
  const bytes=new Uint8Array(await req.arrayBuffer());
  if(!bytes.length)return reply(400,{error:'The image file is empty.'});
  if(bytes.length>MAX_BYTES)return reply(413,{error:'Hosted images must be 2 MB or smaller.'});
  if(sniff(bytes)!==type)return reply(415,{error:'The file contents are not a valid PNG, JPEG, or WebP image of the stated type.'});
  let name='';try{name=decodeURIComponent(req.headers.get('x-image-name')||'');}catch{}
  const at=now(),preview=!isProduction(),key=makeKey(name,type,{now:at,preview});
  await getStore().set(key,bytes,{metadata:{contentType:type,ownerId:user.id,uploadedAt:at.toISOString(),bytes:String(bytes.length)}});
  return reply(201,{image:{key,url:new URL(PUBLIC_PATH+key,req.url).href,contentType:type,bytes:bytes.length,uploadedAt:at.toISOString(),preview}});
 }catch(error){
  // Storage errors are not returned: they may contain internal details.
  log({function:'email-images',method:req.method,error:error?.name||'Error'});
  return reply(503,{error:'Image hosting is unavailable right now. Your local preview image is kept; try again later.'});
 }
};}

function createFileHandler({getStore}){return async req=>{
 const missing=status=>new Response(status===405?'Method not allowed':'Not found',{status,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 if(!['GET','HEAD'].includes(req.method))return missing(405);
 let key;try{key=decodeURIComponent(new URL(req.url).pathname.slice(PUBLIC_PATH.length));}catch{return missing(404);}
 if(!new URL(req.url).pathname.startsWith(PUBLIC_PATH)||!validKey(key))return missing(404);
 try{
  const data=await getStore().get(key,{type:'arrayBuffer'});
  if(!data)return missing(404);
  // Keys are unique per upload and never overwritten, so the file is immutable.
  return new Response(req.method==='HEAD'?null:data,{status:200,headers:{'Content-Type':CONTENT_TYPES[key.split('.').pop()],'Content-Length':String(data.byteLength),'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'",'Access-Control-Allow-Origin':'*'}});
 }catch{return new Response('Image temporarily unavailable',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});}
};}

module.exports={MAX_BYTES,UPLOAD_ROLES,PUBLIC_PATH,sniff,slug,makeKey,validKey,canUpload,createApiHandler,createFileHandler};
