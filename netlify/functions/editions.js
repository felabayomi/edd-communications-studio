'use strict';
const {createStore,validateId,validateVersion,MAX_BYTES}=require('../../server/editions-store');
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(statusCode,data)=>({statusCode,headers,body:JSON.stringify(data)});
function createHandler(getStore){return async event=>{
 try{
  const method=event.httpMethod;
  if(!['GET','POST','PUT','DELETE'].includes(method))return {...reply(405,{error:'Method not allowed.'}),headers:{...headers,Allow:'GET, POST, PUT, DELETE'}};
  const id=event.queryStringParameters?.id;
  if(id!==undefined)validateId(id);
  let input;
  if(method!=='GET'){
   const h=Object.fromEntries(Object.entries(event.headers||{}).map(([k,v])=>[k.toLowerCase(),v]));
   if(!h['content-type']?.toLowerCase().startsWith('application/json'))return reply(415,{error:'Use application/json.'});
   // Reject browser cross-origin writes. This is not authentication.
   if(h.origin&&h.origin!==new URL(event.rawUrl).origin)return reply(403,{error:'Cross-origin writes are not allowed.'});
   const body=event.isBase64Encoded?Buffer.from(event.body||'','base64').toString():event.body||'';
   if(Buffer.byteLength(body)>MAX_BYTES+4096)return reply(413,{error:'Online editions must be under 4 MB. Download Content JSON to keep larger editions.'});
   try{input=JSON.parse(body);}catch{return reply(400,{error:'Invalid JSON.'});}
   if(!input||typeof input!=='object'||Array.isArray(input))return reply(400,{error:'Invalid request.'});
  }
  const store=getStore();
  if(method==='GET'){
   if(!id)return reply(200,{editions:await store.list()});
   const edition=await store.get(id);return edition?reply(200,{edition}):reply(404,{error:'Edition not found.'});
  }
  if(method==='POST'){
   validateId(input.id);
   const edition=await store.save(input.id,input.content,null);
   return edition?reply(201,{edition}):reply(409,{error:'This edition ID already exists. Refresh the library and reopen it before saving again.'});
  }
  validateId(id);validateVersion(input.version);
  const result=method==='PUT'?await store.save(id,input.content,input.version):await store.remove(id,input.version);
  if(!result)return reply(409,{error:'This edition changed or was deleted elsewhere. Your local work is intact. Save a new online copy or reopen the latest version.'});
  return reply(200,method==='PUT'?{edition:result}:{deleted:true});
 }catch(error){
  // Never return or log database errors: they can contain connection details.
  return reply(error.status===400||error.status===413?error.status:503,{error:error.status===400||error.status===413?error.message:'Online storage is unavailable. Your browser copy is unchanged; download Content JSON for a backup.'});
 }
};}
exports.createHandler=createHandler;
exports.handler=createHandler(()=>{
 const connection=process.env.DATABASE_URL;
 if(!connection)throw new Error('Storage not configured');
 const {neon}=require('@neondatabase/serverless');
 return createStore(neon(connection));
});
