const {test,before,after,beforeEach}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const S=require('../core'),D=require('../destinations'),M=require('../destinations-manager'),H=require('../handoff');
const {createStore}=require('../server/destinations-store'),{createStore:createEditions}=require('../server/editions-store');
const {createHandler}=require('../netlify/functions/destinations');
const migration=fs.readFileSync(path.join(__dirname,'../db/002_destinations.sql'),'utf8');
let db,store,editions;
before(async()=>{db=new PGlite();await db.exec(fs.readFileSync(path.join(__dirname,'../db/001_editions.sql'),'utf8'));const sql={query:async(text,args)=>(await db.query(text,args)).rows};store=createStore(sql);editions=createEditions(sql);});
beforeEach(async()=>{await db.exec('TRUNCATE editions;');await db.exec('DROP TABLE IF EXISTS destinations;');await db.exec(migration);});
after(async()=>{await db.close();});
test('002 seeds exactly the approved URLs; rerunning preserves edited/deactivated destinations',async()=>{
 const rows=await store.list();assert.equal(rows.length,7);
 for(const seed of D.seeds){const row=rows.find(r=>r.id===seed.id);for(const key of ['name','url','category','legacy_id','active'])assert.equal(row[key],seed[key]);}
 const changed=await store.save(rows[0].id,{...rows[0],name:'Updated name',active:false},1);
 await db.exec(migration);assert.deepEqual((await store.list()).find(r=>r.id===changed.id),changed);
});
test('real SQL creates, persists, updates, deactivates/reactivates, checks versions, and safely deletes',async()=>{
 const id=randomUUID(),input={name:"Editor's research",url:'https://example.org/research?q=1&lang=en',category:'Library & Research',active:true};
 const first=await store.save(id,input,null);assert.equal(first.version,1);assert(first.created_at);assert(first.updated_at);
 assert.equal((await store.list()).find(r=>r.id===id).url,input.url);
 const changed=await store.save(id,{...input,name:'Research help',active:false},1);assert.equal(changed.version,2);assert.equal(changed.active,false);assert.deepEqual(changed.created_at,first.created_at);assert(changed.updated_at>=first.updated_at);
 assert.equal(await store.save(id,input,1),undefined);assert.equal(await store.remove(id,1),undefined);
 const active=await store.save(id,{...input,active:true},2);assert.equal(active.active,true);
 assert.equal((await store.remove(id,3)).id,id);assert(!(await store.list()).some(r=>r.id===id));
});
test('URL validation rejects unsafe/protocol-relative/credentialed URLs before persistence',async()=>{
 for(const url of ['http://example.org','javascript:alert(1)','data:text/html,test','//example.org','https://user:pass@example.org','https://example.org/a b','https:example.org','https://','ftp://example.org']){
  await assert.rejects(()=>store.save(randomUUID(),{name:'Invalid',url,active:true},null),error=>error.status===400);
 }
 assert.equal((await store.list()).length,7);
 await assert.rejects(()=>store.save(randomUUID(),{name:' ',url:'https://example.org',active:true},null));
});
test('SQL deletion rejects referenced registry and legacy links, even disabled cards; deactivation works',async()=>{
 for(const mode of ['registry','legacy']){
  const row=D.seeds[mode==='registry'?0:1],data=S.createPublication('newsletter');
  const destination=mode==='registry'?D.select(data,'registry/'+row.id,[row]):'hub';
  data.sections[0].enabled=false;data.sections[0].cards.push({...S.newCard(),enabled:false,destination,title:'Saved link',body:'Keep this link'});
  await editions.save(randomUUID(),data,null);
  assert.equal(await store.remove(row.id,1),undefined);
  assert.equal((await store.save(row.id,{...row,active:false},1)).active,false);
 }
});
test('dropdown contains active registry entries and only the current saved snapshot for inactive history',async()=>{
 const data=S.createPublication('newsletter'),card=S.newCard(),rows=await store.list();
 const retired=rows[0];card.destination=D.select(data,'registry/'+retired.id,rows);
 const updated=rows.map(r=>({...r,active:r.id!==retired.id}));const html=D.options(data,card,updated);
 assert(html.includes('value="'+card.destination+'" selected'));assert(!html.includes('value="registry/'+retired.id+'"'));
 for(const row of updated.filter(r=>r.active))assert(html.includes('value="registry/'+row.id+'"'));
 assert.throws(()=>D.select(data,'registry/'+retired.id,updated),/no longer active/);
 assert(!D.options(data,S.newCard(),[]).includes('registry/'));
});
test('both types keep exact historical render/Gmail output and portable JSON after registry rename, URL edit, deactivation',async()=>{
 for(const type of ['newsletter','program-letter']){
  const data=S.createPublication(type),rows=await store.list(),row=rows.find(r=>r.active);
  const card={...S.newCard(),title:'Support',body:'Resources for our community.',buttonLabel:'View support',destination:D.select(data,'registry/'+row.id,rows)};data.sections[0].cards.push(card);
  const id=randomUUID();await editions.save(id,data,null);const before=S.render(data,{email:true});
  await store.save(row.id,{...row,name:'Renamed destination',url:'https://example.org/new',active:false},row.version);
  const reopened=S.parseEdition(JSON.stringify((await editions.get(id)).content));
  assert.equal(S.render(reopened,{email:true}),before);assert.equal(H.emailFragment(S.render(reopened,{email:true})),H.emailFragment(before));
  assert.deepEqual(S.parseEdition(JSON.stringify(reopened)),data);
  assert.equal(D.select(data,card.destination,[]),card.destination);
 }
});
test('selecting a new registry revision affects only the chosen card, not another saved snapshot',()=>{
 const data=S.createPublication('newsletter'),row=D.seeds[0];const first=D.select(data,'registry/'+row.id,[row]);
 const revised={...row,url:'https://example.org/changed',name:'Changed',version:2};const second=D.select(data,'registry/'+row.id,[revised]);
 assert.notEqual(first,second);assert.equal(data.links.find(l=>l.id===first).url,row.url);assert.equal(data.links.find(l=>l.id===second).url,revised.url);
});
test('database timestamps, metadata timestamps, Issue date, and optional card dates remain independent',async()=>{
 for(const type of ['newsletter','program-letter']){
  const data=S.createPublication(type);data.issue.issueDate='2031-04-15';data.publication.createdAt='2020-01-01T00:00:00.000Z';data.publication.updatedAt='2021-01-01T00:00:00.000Z';
  data.sections[0].cards.push({...S.newCard('event'),title:'Community session',body:'Join our community.',date:''});
  assert(!S.validate(data).some(r=>r.level==='error'));
  const id=randomUUID(),created=await editions.save(id,data,null);assert.notEqual(String(created.created_at),'2031-04-15');
  data.publication.updatedAt='2022-01-01T00:00:00.000Z';await editions.save(id,data,1);
  const reopened=(await editions.get(id)).content;assert.equal(reopened.issue.issueDate,'2031-04-15');assert.equal(reopened.sections[0].cards[0].date,'');
  reopened.sections[0].cards[0].date='2030-12-01';assert.equal(reopened.issue.issueDate,'2031-04-15');
  assert.equal(S.parseEdition(JSON.stringify(reopened)).issue.issueDate,'2031-04-15');
 }
});
function event(method,input,id){return {httpMethod:method,rawUrl:'https://studio.example/.netlify/functions/destinations',headers:{'content-type':'application/json',origin:'https://studio.example'},queryStringParameters:id?{id}:undefined,body:JSON.stringify(input)};}
test('function API CRUD works through real SQL; rejects invalid inputs and redacts infrastructure errors',async()=>{
 const handler=createHandler(()=>store),id=randomUUID(),destination={name:'Research',url:'https://example.org',active:true};
 assert.equal((await handler(event('POST',{id,destination}))).statusCode,201);
 assert.equal(JSON.parse((await handler(event('GET'))).body).destinations.length,8);
 assert.equal((await handler(event('PUT',{destination:{...destination,active:false},version:1},id))).statusCode,200);
 assert.equal((await handler(event('PUT',{destination,version:1},id))).statusCode,409);
 assert.equal((await handler(event('DELETE',{version:2},id))).statusCode,200);
 assert.equal((await handler(event('POST',{id,destination:{...destination,url:'http://example.org'}}))).statusCode,400);
 assert.equal((await handler({...event('POST'),body:'bad'})).statusCode,400);
 assert.equal((await handler({...event('POST'),headers:{'content-type':'application/json',origin:'https://other.example'}})).statusCode,403);
 const failure=await createHandler(()=>{throw new Error('postgresql://hidden-secret');})(event('GET'));
 assert.equal(failure.statusCode,503);assert(!failure.body.includes('hidden-secret'));assert.equal(failure.headers['Cache-Control'],'no-store');
});
test('manager preserves work, form drafts on failure, confirms deletion, and suggests deactivation for current references',async()=>{
 const data=S.createPublication('program-letter');let confirmed=false,deleted=false,fail=false;
 const api={list:()=>store.list(),save:(...args)=>{if(fail)throw new Error('Offline');return store.save(...args);},remove:async(...args)=>{deleted=true;return store.remove(...args);}};
 const manager=M.createManager({api,getEdition:()=>data,confirmChange:async()=>confirmed,newId:randomUUID});await manager.refresh();
 manager.state.draft={name:'New destination',url:'https://example.org/new',active:true,category:'Other'};fail=true;await manager.action('destination-save');assert.equal(manager.state.draft.name,'New destination');assert.equal(manager.state.message,'Offline');
 fail=false;await manager.action('destination-save');const id=manager.state.editing.id;
 await manager.action('destination-delete',id);assert.equal(deleted,false);confirmed=true;await manager.action('destination-delete',id);assert.equal(deleted,true);
 const row=manager.state.rows[0];data.sections[0].cards.push({...S.newCard(),destination:D.select(data,'registry/'+row.id,manager.state.rows)});
 deleted=false;const before=JSON.stringify(data);await manager.action('destination-delete',row.id);assert.equal(deleted,false);assert.match(manager.state.message,/Deactivate/);
 await manager.action('destination-toggle',row.id);assert.equal(JSON.stringify(data),before);
});
test('registry client uses only same-origin functions, handles failure, and does not write automatically',async()=>{
 const requests=[];const client=D.createClient(async(url,options)=>{requests.push([url,options]);return {ok:true,json:async()=>({destinations:[],destination:D.seeds[0],deleted:true})};});
 assert.equal(requests.length,0);await client.list();await client.save(D.seeds[0].id,D.seeds[0]);await client.save(D.seeds[0].id,D.seeds[0],1);await client.remove(D.seeds[0].id,2);
 assert.deepEqual(requests.map(r=>r[1].method),['GET','POST','PUT','DELETE']);assert(requests.every(r=>r[0].startsWith('/.netlify/functions/destinations')));
 await assert.rejects(()=>D.createClient(async()=>{throw new Error('offline');}).list(),/unchanged/);
});
