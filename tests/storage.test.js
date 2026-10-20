'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createRuntimeStore}=require('../server/storage');
const F=require('../submission-forms');
const functions=[
 ['submission-forms',require('../netlify/functions/submission-forms'),'003_submission_forms.sql'],
 ['destinations',require('../netlify/functions/destinations'),'002_destinations.sql']
];
function event(name,method='GET'){
 return {httpMethod:method,rawUrl:`https://studio.example/.netlify/functions/${name}`,headers:{'content-type':'application/json',origin:'https://studio.example'},body:method==='GET'?undefined:JSON.stringify({id:randomUUID(),form:{...F.empty(),name:'Draft'},destination:{name:'Resource',url:'https://example.org',active:true}})};
}
test('exported function handlers read DATABASE_URL at invocation and safely reject missing configuration',async()=>{
 const original=process.env.DATABASE_URL;
 try{
  delete process.env.DATABASE_URL;
  for(const [name,api] of functions){
   for(const method of ['GET','POST']){
    const response=await api.handler(event(name,method)),body=JSON.parse(response.body);
    assert.equal(response.statusCode,503);assert.equal(body.code,'DATABASE_NOT_CONFIGURED');
    assert.match(body.error,/Deploy Previews/);assert.match(body.error,/Functions scope/);assert.match(body.error,/redeploy/);
   }
  }
 }finally{if(original===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=original;}
});
test('runtime initialization is lazy, can recover after configuration changes, and masks adapter errors',async()=>{
 let connection='',connects=0;
 const store={list:async()=>[]},getStore=createRuntimeStore(sql=>{assert.equal(sql,'connected');return store;},{
  getConnection:()=>connection,connect:value=>{connects++;assert.equal(value,'configured');return 'connected';}
 });
 assert.equal(connects,0);assert.throws(getStore,error=>error.code==='STORAGE_NOT_CONFIGURED');assert.equal(connects,0);
 connection='configured';assert.equal(getStore(),store);assert.equal(connects,1);
 for(const [name,api] of functions){
  let storeCreated=false;const logs=[];
  const failing=createRuntimeStore(()=>{storeCreated=true;},{getConnection:()=>connection,connect:()=>{throw new Error('private adapter details');}});
  const response=await api.createHandler(failing,{log:entry=>logs.push(entry)})(event(name));
  assert.equal(response.statusCode,503);assert.equal(JSON.parse(response.body).code,'DATABASE_INITIALIZATION_FAILED');assert.equal(storeCreated,false);
  assert(!JSON.stringify([response,logs]).includes('private adapter details'));
 }
});
test('both functions classify query failures and redact all exception details',async()=>{
 for(const [name,api,migration] of functions){
  for(const [dbCode,expected] of [['42P01','SCHEMA_NOT_READY'],['42703','SCHEMA_NOT_READY'],['42501','DATABASE_PERMISSION_DENIED'],['08006','DATABASE_UNAVAILABLE'],['28P01','DATABASE_UNAVAILABLE'],['ETIMEDOUT','DATABASE_UNAVAILABLE'],[undefined,'SERVER_ERROR']]){
   const logs=[],fail=async()=>{throw Object.assign(new Error('private SQL and connection details'),{code:dbCode});};
   const handler=api.createHandler(()=>({list:fail,save:fail}),{log:entry=>logs.push(entry)});
   for(const method of ['GET','POST']){
    const response=await handler(event(name,method)),body=JSON.parse(response.body);
    assert.equal(response.statusCode,expected==='SERVER_ERROR'?500:503);assert.equal(body.code,expected);
    if(expected==='SCHEMA_NOT_READY')assert(body.error.includes(migration));
    assert.equal(response.headers['Cache-Control'],'no-store');
    assert(!JSON.stringify([response,logs]).includes('private SQL and connection details'));
    assert.equal(logs.at(-1).function,name);assert.equal(logs.at(-1).method,method);
   }
  }
 }
});
