const {test}=require('node:test'),assert=require('node:assert/strict');
const S=require('../core'),{createStore,validateContent}=require('../server/editions-store');
const {createHandler}=require('../netlify/functions/editions'),{createClient}=require('../editions-client');
const id='12345678-1234-4123-8123-123456789012';
function event(method,body,query){return {httpMethod:method,rawUrl:'https://studio.example/.netlify/functions/editions',headers:{'content-type':'application/json',origin:'https://studio.example'},queryStringParameters:query,body:body===undefined?undefined:JSON.stringify(body)};}
const json=response=>JSON.parse(response.body);
test('store parameterizes complete content and metadata for both types and every status',async()=>{
 for(const type of ['newsletter','program-letter'])for(const status of ['Draft','Ready for Review','Approved','Distributed']){
  const content=S.createPublication(type);content.publication.status=status;content.publication.title="Director's update'); DROP TABLE editions; --";
  let call;const store=createStore({query:async(...args)=>{call=args;return [{id}];}});
  assert.deepEqual(await store.save(id,content,null),{id});
  assert(!call[0].includes(content.publication.title));assert.equal(call[1][2],content.publication.title);
  assert.equal(call[1][1],type);assert.equal(call[1][7],status);assert.deepEqual(JSON.parse(call[1][8]),content);
  await store.save(id,content,7);assert.match(call[0],/WHERE id=\$1 AND version=\$10/);assert.equal(call[1][9],7);
  // Readiness remains separate: incomplete editions can be saved, but not finally exported.
  assert.throws(()=>S.makeFiles(content),/blockers/);
 }
});
test('invalid IDs, revisions, content and oversize content fail before SQL',async()=>{
 const store=createStore({query:()=>assert.fail('SQL must not run')});
 await assert.rejects(()=>store.get("' OR true --"));await assert.rejects(()=>store.remove(id,0));
 await assert.rejects(()=>store.save(id,{},null));await assert.rejects(()=>store.save(id,S.createEdition(false),-1));
 const large=S.createPublication('newsletter');large.issue.footerNote='x'.repeat(4*1024*1024);
 assert.throws(()=>validateContent(large),error=>error.status===413);
});
test('list excludes full content; delete is parameterized and version guarded',async()=>{
 let call;const store=createStore({query:async(...args)=>{call=args;return [];}});
 await store.list();assert.doesNotMatch(call[0],/\bcontent\b/);assert.match(call[0],/ORDER BY updated_at DESC/);
 await store.remove(id,3);assert.match(call[0],/WHERE id=\$1 AND version=\$2/);assert.deepEqual(call[1],[id,3]);
});
test('API round trip, update, independent copy, conflict and deletion',async()=>{
 const rows=new Map();const handler=createHandler(()=>({
  list:async()=>[...rows.values()],get:async key=>rows.get(key),
  save:async(key,content,version)=>{const prior=rows.get(key);if(version===null?prior:!prior||prior.version!==version)return;
   const row={id:key,content,version:(prior?.version||0)+1};rows.set(key,row);return row;},
  remove:async(key,version)=>{if(rows.get(key)?.version!==version)return;rows.delete(key);return {id:key};}
 }));
 const content=S.createPublication('program-letter');
 assert.equal((await handler(event('POST',{id,content}))).statusCode,201);
 assert.equal(json(await handler(event('GET',undefined,{id}))).edition.content.publicationType,'program-letter');
 assert.equal((await handler(event('PUT',{content,version:1},{id}))).statusCode,200);
 assert.equal((await handler(event('PUT',{content,version:1},{id}))).statusCode,409);
 const copyId='12345678-1234-4123-8123-123456789013';
 assert.equal((await handler(event('POST',{id:copyId,content}))).statusCode,201);
 assert.equal(json(await handler(event('GET'))).editions.length,2);
 assert.equal((await handler(event('DELETE',{version:1},{id}))).statusCode,409);
 assert.equal((await handler(event('DELETE',{version:2},{id}))).statusCode,200);
 assert.equal((await handler(event('GET',undefined,{id}))).statusCode,404);assert(rows.has(copyId));
});
test('API rejects malformed requests and cross-origin browser mutations',async()=>{
 const handler=createHandler(()=>assert.fail('Store must not be used'));
 assert.equal((await handler(event('PATCH'))).statusCode,405);
 assert.equal((await handler({...event('POST'),body:'{bad'})).statusCode,400);
 assert.equal((await handler({...event('POST'),headers:{'content-type':'text/plain'}})).statusCode,415);
 assert.equal((await handler({...event('POST'),headers:{'content-type':'application/json',origin:'https://other.example'}})).statusCode,403);
 assert.equal((await handler(event('GET',undefined,{id:'invalid'}))).statusCode,400);
});
test('API masks infrastructure failures and disables response caching',async()=>{
 const handler=createHandler(()=>{throw new Error('postgresql://secret-should-never-leak');});
 const response=await handler(event('GET'));
 assert.equal(response.statusCode,503);assert.doesNotMatch(response.body,/postgresql|secret-should-never-leak/);
 assert.equal(response.headers['Cache-Control'],'no-store');
});
test('client makes no automatic requests; explicit CRUD uses the function only',async()=>{
 const calls=[];const client=createClient(async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({edition:{id,version:2},editions:[],deleted:true})};});
 assert.equal(calls.length,0);await client.list();await client.get(id);await client.save(id,{},null);await client.save(id,{},1);await client.remove(id,2);
 assert.deepEqual(calls.map(c=>c.options.method),['GET','GET','POST','PUT','DELETE']);
 assert(calls.every(c=>c.url.startsWith('/.netlify/functions/editions')));
 assert.equal(JSON.parse(calls[3].options.body).version,1);
});
test('client network/invalid response failures preserve supplied content and conflict explanation',async()=>{
 const content=S.createPublication('newsletter'),before=JSON.stringify(content);
 for(const fetcher of [async()=>{throw new Error('offline');},async()=>({ok:false,json:async()=>{throw new Error('HTML response');}})]){
  await assert.rejects(()=>createClient(fetcher).save(id,content),/current work is unchanged/);
  assert.equal(JSON.stringify(content),before);
 }
 const client=createClient(async()=>({ok:false,json:async()=>({error:'Edition changed elsewhere.'})}));
 await assert.rejects(()=>client.save(id,content,1),/changed elsewhere/);
});
