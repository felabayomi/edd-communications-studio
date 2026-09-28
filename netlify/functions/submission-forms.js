'use strict';
const {createStore}=require('../../server/submission-forms-store');
const {validateId,validateVersion}=require('../../server/editions-store');
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(statusCode,data)=>({statusCode,headers,body:JSON.stringify(data)});
function createHandler(getStore){return async event=>{
 try{
  const method=event.httpMethod,id=event.queryStringParameters?.id;
  if(!['GET','POST','PUT','DELETE'].includes(method))return {...reply(405,{error:'Method not allowed.'}),headers:{...headers,Allow:'GET, POST, PUT, DELETE'}};
  if(id!==undefined)validateId(id);
  if(method==='GET')return reply(200,{forms:await getStore().list()});
  const h=Object.fromEntries(Object.entries(event.headers||{}).map(([k,v])=>[k.toLowerCase(),v]));
  if(!h['content-type']?.toLowerCase().startsWith('application/json'))return reply(415,{error:'Use application/json.'});
  if(h.origin&&h.origin!==new URL(event.rawUrl).origin)return reply(403,{error:'Cross-origin writes are not allowed.'});
  const body=event.isBase64Encoded?Buffer.from(event.body||'','base64').toString():event.body||'';
  if(Buffer.byteLength(body)>32768)return reply(413,{error:'Form details must be under 32 KB.'});
  let input;try{input=JSON.parse(body);}catch{return reply(400,{error:'Invalid JSON.'});}
  if(!input||typeof input!=='object'||Array.isArray(input))return reply(400,{error:'Invalid request.'});
  if(method==='POST'){
   validateId(input.id);const form=await getStore().save(input.id,input.form,null);
   return form?reply(201,{form}):reply(409,{error:'Form already exists. Refresh the list.'});
  }
  validateId(id);validateVersion(input.version);
  const result=method==='PUT'?await getStore().save(id,input.form,input.version):await getStore().remove(id,input.version);
  if(!result)return reply(409,{error:method==='DELETE'?'Form is referenced by a saved edition, changed, or was deleted. Deactivate it instead, or refresh and review.':'Form changed or was deleted. Refresh and reopen it before saving.'});
  return reply(200,method==='PUT'?{form:result}:{deleted:true});
 }catch(error){return reply(error.status===400?400:503,{error:error.status===400?error.message:'Submission Forms unavailable. Your form draft and edition are unchanged.'});}
};}
exports.createHandler=createHandler;
exports.handler=createHandler(()=>{
 const connection=process.env.DATABASE_URL;if(!connection)throw new Error('Storage not configured');
 const {neon}=require('@neondatabase/serverless');return createStore(neon(connection));
});
