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
 const response=await createHandler(()=>{throw new Error('postgresql://private-secret');})(event('GET'));assert.equal(response.statusCode,503);assert(!response.body.includes('private-secret'));assert.equal(response.headers['Cache-Control'],'no-store');
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
