const {test,before,beforeEach,after}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{PGlite}=require('@electric-sql/pglite');
const F=require('../submission-forms'),M=require('../submission-forms-manager'),S=require('../core'),D=require('../destinations');
const {createStore}=require('../server/submission-forms-store'),{createStore:destinationStore}=require('../server/destinations-store'),{createStore:editionStore}=require('../server/editions-store');
const {createHandler}=require('../netlify/functions/submission-forms');
let db,forms,destinations,editions;const schema=n=>fs.readFileSync(path.join(__dirname,'../db/'+n),'utf8');
before(async()=>{db=new PGlite();await db.exec(schema('001_editions.sql'));await db.exec(schema('002_destinations.sql'));const sql={query:async(text,args)=>(await db.query(text,args)).rows};forms=createStore(sql);destinations=destinationStore(sql);editions=editionStore(sql);});
beforeEach(async()=>{await db.exec('TRUNCATE editions; DROP TABLE IF EXISTS submission_forms;');await db.exec(schema('003_submission_forms.sql'));});
after(async()=>{await db.close();});
test('initial institutional form records have no invented URLs and remain inactive/unexposed',async()=>{
 const rows=await forms.list();assert.equal(rows.length,3);assert(rows.every(r=>r.url===''&&!r.active&&!r.expose_as_destination));
 const communication=rows.find(r=>r.form_type==='Communications Content Submission');assert.deepEqual(communication.publication_targets,F.targets);assert.deepEqual(communication.content_categories,F.categories);
 assert.equal((await destinations.list()).length,7);
 const updated=await forms.save(rows[0].id,{...rows[0],description:'Edited purpose'},1);await db.exec(schema('003_submission_forms.sql'));assert.deepEqual((await forms.list()).find(r=>r.id===updated.id),updated);
});
test('forms CRUD persists metadata, timestamps, custom categories and activation with version checks',async()=>{
 const id=randomUUID(),input={...F.empty(),name:'Institutional support',url:'https://example.org/support',description:'Submit program questions',audience:'EdD contributors',notes:'Editor context',content_categories:['Custom category'],publication_targets:['Program Letter','Not sure']};
 const created=await forms.save(id,input,null);assert.equal(created.version,1);assert(created.created_at);assert(created.updated_at);
 const updated=await forms.save(id,{...input,active:true},1);assert.equal(updated.active,true);assert.equal(updated.version,2);assert.deepEqual(updated.created_at,created.created_at);
 assert.equal((await forms.list()).find(r=>r.id===id).notes,input.notes);assert.equal(await forms.save(id,input,1),undefined);
 const inactive=await forms.save(id,{...input,active:false},2);assert.equal(inactive.active,false);assert.equal(await forms.remove(id,2),undefined);assert.equal((await forms.remove(id,3)).id,id);
});
test('forms permit inactive blank URLs but require HTTPS before activation/exposure',async()=>{
 const base={...F.empty(),name:'Planned form'};assert.equal(F.validate(base).url,'');
 for(const update of [{active:true},{expose_as_destination:true},...['http://example.org','javascript:alert(1)','//example.org','https://user:pass@example.org','https://'].map(url=>({url}))]){
  await assert.rejects(()=>forms.save(randomUUID(),{...base,...update},null),error=>error.status===400);
 }
 assert.throws(()=>F.validate({...base,publication_targets:['Automatic publication']}));
});
test('exposed forms reuse their own URL without duplicate destination rows or automatic support replacement',async()=>{
 const id=randomUUID(),input={...F.empty(),name:'Student Request for Support',url:'https://example.org/student-support',active:true};
 await forms.save(id,input,null);assert(!(await destinations.list()).some(r=>r.id===id));
 await forms.save(id,{...input,expose_as_destination:true},1);const exposed=(await destinations.list()).find(r=>r.id===id);assert.equal(exposed.managed_by,'submission-forms');assert.equal(exposed.url,input.url);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM destinations')).rows[0].n,7);
 assert.equal((await destinations.list()).find(r=>r.id===D.seeds[0].id).url,D.seeds[0].url);
 const updated=await forms.save(id,{...input,url:'https://example.org/new',expose_as_destination:true},2);assert.equal((await destinations.list()).find(r=>r.id===id).url,updated.url);
 await forms.save(id,{...updated,active:false},3);assert.equal((await destinations.list()).find(r=>r.id===id).active,false);
 await forms.save(id,{...updated,expose_as_destination:false},4);assert(!(await destinations.list()).some(r=>r.id===id));
});
test('historical form snapshots survive updates, deactivation and portability; referenced deletion is refused',async()=>{
 for(const type of ['program-letter','newsletter']){
  const id=randomUUID(),input={...F.empty(),name:'Stories',url:'https://example.org/stories',active:true,expose_as_destination:true};await forms.save(id,input,null);
  const data=S.createPublication(type),card={...S.newCard(),title:'Share a story',body:'Tell us about your work.',buttonLabel:'Submit a story',destination:D.select(data,'registry/'+id,await destinations.list())};data.sections[0].cards.push(card);
  await editions.save(randomUUID(),data,null);const before=S.render(data,{email:true});
  await forms.save(id,{...input,name:'Renamed form',url:'https://example.org/other',active:false},1);
  assert.equal(S.render(S.parseEdition(JSON.stringify(data)),{email:true}),before);assert.equal(await forms.remove(id,2),undefined);
 }
});
const event=(method,body,id)=>({httpMethod:method,rawUrl:'https://studio.example/.netlify/functions/submission-forms',headers:{'content-type':'application/json',origin:'https://studio.example'},queryStringParameters:id?{id}:undefined,body:JSON.stringify(body)});
test('form API routes persist safely and mask backend errors',async()=>{
 const handler=createHandler(()=>forms),id=randomUUID(),form={...F.empty(),name:'New form'};
 assert.equal((await handler(event('POST',{id,form}))).statusCode,201);assert.equal(JSON.parse((await handler(event('GET'))).body).forms.length,4);
 assert.equal((await handler(event('PUT',{form:{...form,url:'https://example.org/form',active:true},version:1},id))).statusCode,200);
 assert.equal((await handler(event('PUT',{form,version:1},id))).statusCode,409);assert.equal((await handler(event('DELETE',{version:2},id))).statusCode,200);
 assert.equal((await handler({...event('POST'),body:'bad'})).statusCode,400);assert.equal((await handler({...event('POST'),headers:{'content-type':'application/json',origin:'https://other.example'}})).statusCode,403);
 const logs=[],response=await createHandler(()=>{throw new Error('postgresql://private-secret');},{log:entry=>logs.push(entry)})(event('GET'));assert.equal(response.statusCode,500);assert(!response.body.includes('private-secret'));assert.equal(response.headers['Cache-Control'],'no-store');assert.equal(logs[0].code,'SERVER_ERROR');assert(!JSON.stringify(logs).includes('private-secret'));
});
test('manager confirms deletion, supports edits/toggles, preserves failure drafts and refreshes destination choices',async()=>{
 const edition=S.createPublication('newsletter');let confirmed=false,synced=0,offline=false;
 const manager=M.createManager({api:{list:()=>forms.list(),save:(...args)=>{if(offline)throw new Error('Offline');return forms.save(...args);},remove:(...args)=>forms.remove(...args)},getEdition:()=>edition,confirmChange:async()=>confirmed,onSaved:()=>synced++,newId:randomUUID});
 await manager.refresh();manager.state.draft={...F.empty(),name:'Test form',url:'https://example.org/form'};await manager.action('form-save');const id=manager.state.editing.id;assert.equal(synced,1);
 await manager.action('form-toggle',id);assert.equal(manager.state.rows.find(r=>r.id===id).active,true);
 await manager.action('form-edit',id);manager.state.draft.description='Unsaved description';offline=true;await manager.action('form-save');assert.equal(manager.state.draft.description,'Unsaved description');assert.equal(manager.state.message,'Offline');offline=false;
 await manager.action('form-delete',id);assert(manager.state.rows.some(r=>r.id===id));confirmed=true;await manager.action('form-delete',id);assert(!manager.state.rows.some(r=>r.id===id));
});
test('form client does not write on initialization and uses only editor function endpoints',async()=>{
 const calls=[],client=F.createClient(async(url,options)=>{calls.push([url,options.method]);return {ok:true,json:async()=>({forms:[],form:{id:'id'},deleted:true})};});
 assert.equal(calls.length,0);await client.list();await client.save('id',F.empty());await client.save('id',F.empty(),1);await client.remove('id',2);
 assert.deepEqual(calls.map(c=>c[1]),['GET','POST','PUT','DELETE']);assert(calls.every(c=>c[0].startsWith('/.netlify/functions/submission-forms')));
});
test('draft Program Letter-only CRUD survives a new manager and leaves editions and destinations unchanged',async()=>{
 const edition=S.createPublication('program-letter'),editionId=randomUUID();
 await editions.save(editionId,edition,null);
 const beforeEditions=await db.query('SELECT * FROM editions ORDER BY id'),beforeDestinations=await db.query('SELECT * FROM destinations ORDER BY id');
 const handler=createHandler(()=>forms),requests=[];
 const client=()=>F.createClient(async(url,options)=>{
  const id=new URL(url,'https://studio.example').searchParams.get('id');
  requests.push({method:options.method,url,body:options.body&&JSON.parse(options.body)});
  const response=await handler({...event(options.method,undefined,id),body:options.body});
  return {ok:response.statusCode<400,status:response.statusCode,json:async()=>JSON.parse(response.body)};
 });
 const manager=api=>M.createManager({api,getEdition:()=>edition,confirmChange:async()=>true,newId:randomUUID});
 const first=manager(client());await first.refresh();
 first.state.draft={...F.empty(),name:'EdD Program Letter form',description:'Program news',audience:'EdD contributors',form_type:'Communications Content Submission',publication_targets:['Program Letter'],content_categories:['Other'],notes:'Internal draft'};
 await first.action('form-save');
 assert(first.state.editing);const id=first.state.editing.id;
 const post=requests.find(r=>r.method==='POST');assert.equal(post.url,'/.netlify/functions/submission-forms');assert.equal(post.body.form.url,'');assert.equal(post.body.form.active,false);assert.equal(post.body.form.expose_as_destination,false);assert.deepEqual(post.body.form.publication_targets,['Program Letter']);
 const reloaded=manager(client());await reloaded.refresh();await reloaded.action('form-edit',id);
 assert.deepEqual(reloaded.state.draft,first.state.draft);
 reloaded.state.draft.notes='Updated internal draft';await reloaded.action('form-save');assert.equal(reloaded.state.editing.version,2);
 await reloaded.action('form-toggle',id);assert.match(reloaded.state.message,/HTTPS URL/);assert.equal(reloaded.state.editing.version,2);
 reloaded.state.draft.url='https://docs.google.com/forms/d/e/university-owned-form/viewform';reloaded.state.draft.active=true;await reloaded.action('form-save');assert.equal(reloaded.state.draft.active,true);
 await reloaded.action('form-toggle',id);assert.equal((await forms.list()).find(r=>r.id===id).active,false);
 assert.deepEqual(await db.query('SELECT * FROM editions ORDER BY id'),beforeEditions);
 assert.deepEqual(await db.query('SELECT * FROM destinations ORDER BY id'),beforeDestinations);
 assert.equal((await destinations.list()).some(r=>r.id===id),false);
});
test('missing schema reproduces storage failure without mutating editions and reports the migration',async()=>{
 const editionId=randomUUID();await editions.save(editionId,S.createPublication('program-letter'),null);
 const before=await editions.get(editionId),logs=[];
 await db.exec('DROP TABLE submission_forms');
 const handler=createHandler(()=>forms,{log:entry=>logs.push(entry)}),input={id:randomUUID(),form:{...F.empty(),name:'Planned EdD form',publication_targets:['Program Letter']}};
 for(const request of [event('GET'),event('POST',input)]){
  const response=await handler(request);assert.equal(response.statusCode,503);assert.equal(JSON.parse(response.body).code,'SCHEMA_NOT_READY');assert.match(response.body,/003_submission_forms.sql/);assert(!response.body.includes('relation'));
 }
 assert.equal(logs.length,2);assert.deepEqual(await editions.get(editionId),before);
 await db.exec(schema('003_submission_forms.sql'));
 assert.equal((await handler(event('POST',input))).statusCode,201);
 assert.equal((await forms.list()).find(r=>r.id===input.id).url,'');
});
test('storage configuration, permissions, connection, and unexpected failures have safe diagnostics',async()=>{
 for(const [properties,expected] of [[{code:'STORAGE_NOT_CONFIGURED'},'DATABASE_NOT_CONFIGURED'],[{code:'42501'},'DATABASE_PERMISSION_DENIED'],[{code:'08006'},'DATABASE_UNAVAILABLE'],[{code:'ECONNREFUSED'},'DATABASE_UNAVAILABLE'],[{name:'NeonDbError'},'DATABASE_UNAVAILABLE'],[{},'SERVER_ERROR']]){
  const logs=[],handler=createHandler(()=>{throw Object.assign(new Error('postgresql://secret SQL SELECT details'),properties);},{log:entry=>logs.push(entry)});
  const response=await handler(event('GET'));assert.equal(JSON.parse(response.body).code,expected);assert.equal(logs[0].code,expected);
  assert(!JSON.stringify([response,logs]).includes('secret'));assert(!JSON.stringify([response,logs]).includes('SELECT details'));
 }
});
test('API rejects missing, credentialed or non-HTTPS active URLs and untrusted-origin writes',async()=>{
 const handler=createHandler(()=>forms),id=randomUUID(),form={...F.empty(),name:'Planned',publication_targets:['Program Letter']};
 const credentialed=new URL('https://example.org/form');credentialed.username='editor';
 for(const url of ['', 'http://example.org/form',credentialed.href,'https://']){
  const response=await handler(event('POST',{id,form:{...form,url,active:true}}));assert.equal(response.statusCode,400);assert.match(JSON.parse(response.body).error,/URL/);
 }
 const created=await forms.save(id,form,null);
 for(const method of ['POST','PUT','DELETE']){
  const response=await handler({...event(method,{id:randomUUID(),form:{...form,name:'Unauthorized change'},version:1},id),headers:{'content-type':'application/json',origin:'https://untrusted.example'}});
  assert.equal(response.statusCode,403);
 }
 assert.deepEqual((await forms.list()).find(r=>r.id===id),created);assert.equal((await forms.list()).length,4);
});
test('busy saves and lost create responses do not create duplicate form records',async()=>{
 let calls=0,release;
 const api={list:()=>forms.list(),save:async(...args)=>{
  calls++;const saved=await forms.save(...args);
  if(calls===1){await new Promise(resolve=>{release=resolve;});throw new Error('Connection lost after commit');}
  return saved;
 }};
 const manager=M.createManager({api,getEdition:()=>null,confirmChange:async()=>true,newId:randomUUID});
 await manager.refresh();manager.state.draft={...F.empty(),name:'Retry draft',publication_targets:['Program Letter']};
 const saving=manager.action('form-save');
 while(!release)await new Promise(resolve=>setImmediate(resolve));
 await manager.action('form-save');assert.equal(calls,1);release();await saving;
 assert.equal(manager.state.draft.name,'Retry draft');assert.equal(manager.state.editing,null);
 await manager.action('form-save');assert.equal(calls,2);assert(manager.state.editing);assert.equal(manager.state.editing.version,1);
 assert.equal((await forms.list()).filter(r=>r.name==='Retry draft').length,1);
 const conflicting=await forms.save(manager.state.editing.id,{...manager.state.draft,name:'Different metadata'},null);
 assert.equal(conflicting,undefined);assert.equal((await forms.list()).find(r=>r.id===manager.state.editing.id).name,'Retry draft');
 await manager.action('form-new');manager.state.draft={...F.empty(),name:'Independent draft'};await manager.action('form-save');assert.equal((await forms.list()).length,5);
});
test('client diagnoses denied access, missing endpoints and non-JSON responses without losing draft input',async()=>{
 for(const [status,message] of [[401,/Administrator access/],[403,/Administrator access/],[404,/Netlify Function/],[405,/Netlify Function/],[502,/unexpected response/]]){
  const api=F.createClient(async()=>({ok:false,status,json:async()=>{throw new Error('HTML response');}}));
  const manager=M.createManager({api,getEdition:()=>null,confirmChange:async()=>true,newId:randomUUID});
  manager.state.loaded=true;manager.state.draft={...F.empty(),name:'Unsaved form',notes:'Keep these notes'};
  const before=JSON.stringify(manager.state.draft);await manager.action('form-save');
  assert.match(manager.state.message,message);assert.equal(JSON.stringify(manager.state.draft),before);
 }
 const api=F.createClient(async()=>{throw new Error('Network failure');});
 await assert.rejects(()=>api.list(),/Refresh the forms list before retrying/);
 const malformed=F.createClient(async()=>({ok:true,status:200,json:async()=>({})}));
 await assert.rejects(()=>malformed.save(randomUUID(),F.empty()),/unexpected response/);
});
test('database failures preserve the full unsaved draft and current edition through client and manager',async()=>{
 const edition=S.createPublication('program-letter'),beforeEdition=JSON.stringify(edition),logs=[];
 const handler=createHandler(()=>{throw Object.assign(new Error('Private connection details'),{code:'08006'});},{log:entry=>logs.push(entry)});
 const api=F.createClient(async(url,options)=>{
  const response=await handler({...event(options.method),body:options.body});
  return {ok:false,status:response.statusCode,json:async()=>JSON.parse(response.body)};
 });
 const manager=M.createManager({api,getEdition:()=>edition,confirmChange:async()=>true,newId:randomUUID});
 manager.state.loaded=true;manager.state.draft={...F.empty(),name:'Unsaved EdD form',description:'Keep the purpose',audience:'EdD',publication_targets:['Program Letter'],notes:'Keep the notes'};
 const beforeDraft=JSON.stringify(manager.state.draft);
 await manager.action('form-save');
 assert.match(manager.state.message,/could not connect to storage/);assert.equal(JSON.stringify(manager.state.draft),beforeDraft);assert.equal(JSON.stringify(edition),beforeEdition);assert.equal(logs[0].databaseCode,'08006');
});
