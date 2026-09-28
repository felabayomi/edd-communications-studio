'use strict';
const {createStore}=require('../../server/destinations-store');
const {validateId,validateVersion}=require('../../server/editions-store');
const headers={'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const reply=(statusCode,data)=>({statusCode,headers,body:JSON.stringify(data)});
function createHandler(getStore){return async event=>{
 try{
  const method=event.httpMethod,id=event.queryStringParameters?.id;
  if(!['GET','POST','PUT','DELETE'].includes(method))return {...reply(405,{error:'Method not allowed.'}),headers:{...headers,Allow:'GET, POST, PUT, DELETE'}};
  if(id!==undefined)validateId(id);
  if(method==='GET')return reply(200,{destinations:await getStore().list()});
  const h=Object.fromEntries(Object.entries(event.headers||{}).map(([k,v])=>[k.toLowerCase(),v]));
  if(!h['content-type']?.toLowerCase().startsWith('application/json'))return reply(415,{error:'Use application/json.'});
  if(h.origin&&h.origin!==new URL(event.rawUrl).origin)return reply(403,{error:'Cross-origin writes are not allowed.'});
  const body=event.isBase64Encoded?Buffer.from(event.body||'','base64').toString():event.body||'';
  if(Buffer.byteLength(body)>16384)return reply(413,{error:'Destination request is too large.'});
  let input;try{input=JSON.parse(body);}catch{return reply(400,{error:'Invalid JSON.'});}
  if(!input||typeof input!=='object'||Array.isArray(input))return reply(400,{error:'Invalid request.'});
  if(method==='POST'){
   validateId(input.id);const destination=await getStore().save(input.id,input.destination,null);
   return destination?reply(201,{destination}):reply(409,{error:'Destination already exists. Refresh the registry.'});
  }
  validateId(id);validateVersion(input.version);
  const result=method==='PUT'?await getStore().save(id,input.destination,input.version):await getStore().remove(id,input.version);
  if(!result)return reply(409,{error:method==='DELETE'?'Destination is referenced by a saved edition, changed, or was deleted. Deactivate it instead, or refresh and review.':'Destination changed or was deleted. Refresh before editing again.'});
  return reply(200,method==='PUT'?{destination:result}:{deleted:true});
 }catch(error){return reply(error.status===400?400:503,{error:error.status===400?error.message:'Destination registry unavailable. Edition links and current work are unchanged.'});}
};}
exports.createHandler=createHandler;
exports.handler=createHandler(()=>{
 const connection=process.env.DATABASE_URL;if(!connection)throw new Error('Storage not configured');
 const {neon}=require('@neondatabase/serverless');return createStore(neon(connection));
});
