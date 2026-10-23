const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {PGlite}=require('@electric-sql/pglite');
const S=require('../core'),D=require('../destinations'),H=require('../handoff'),PrivateHandoff=require('../private-handoff');
const {createStore:createDestinations}=require('../server/destinations-store'),{createStore:createEditions}=require('../server/editions-store');
const F=require('../submission-forms'),{createStore:createForms}=require('../server/submission-forms-store');
function ready(type='newsletter',body='Read library resources today.'){
 const data=S.createPublication(type),card={...S.newCard(),title:'Community resources',body};
 data.sections[0].cards.push(card);data.publication.status='Approved';
 return {data,card};
}
function add(data,card,start=5,end=22,row=D.seeds[0]){
 const destination=D.selectEditorial(data,row.id,[row]);
 card.bodyLinks=[...S.validBodyLinks(card),{start,end,destination}];return destination;
}
test('editorial selection is active-only, collision-safe, reused, and distinct from immutable CTA snapshots',()=>{
 const {data}=ready(),row=D.seeds[0],snapshot=D.select(data,'registry/'+row.id,[row]),before=structuredClone(data.links.find(l=>l.id===snapshot));
 data.links.push({id:'editorial-'+row.id,label:'Imported collision',url:row.url,approved:true});
 const id=D.selectEditorial(data,row.id,[row]);
 assert.equal(id,'editorial-'+row.id+'-1');assert.equal(D.selectEditorial(data,row.id,[row]),id);assert.notEqual(id,snapshot);
 assert.equal(D.select(data,'registry/'+row.id,[row]),snapshot);
 assert.deepEqual(data.links.find(l=>l.id===snapshot),before);
 assert.throws(()=>D.selectEditorial(data,row.id,[{...row,active:false}]),/no longer active/);
 assert.throws(()=>D.selectEditorial(data,row.id,[{...row,url:'javascript:alert(1)'}]),/https/);
 const editorial=data.links.find(l=>l.id===id);assert.equal(editorial.editorialRegistry,true);assert.equal(editorial.registryVersion,row.version);
});
test('selecting an editorial link before a CTA never aliases their snapshots',()=>{
 const {data,card}=ready(),row=D.seeds[0],editorial=add(data,card),snapshot=D.select(data,'registry/'+row.id,[row]);
 card.destination=snapshot;card.buttonLabel='View resources';
 assert.notEqual(snapshot,editorial);assert.equal(data.links.find(l=>l.id===snapshot).editorialRegistry,undefined);
 const before=structuredClone(data.links.find(l=>l.id===snapshot));
 assert(D.syncEditorial(data,[{...row,url:'https://example.org/new-resources',version:2}]));
 assert.deepEqual(data.links.find(l=>l.id===snapshot),before);assert.equal(card.destination,snapshot);
 const html=S.render(data,{email:true});assert(html.includes(`href="${row.url}"`));assert(html.includes('href="https://example.org/new-resources"'));
 assert.deepEqual(S.parseEdition(JSON.stringify(data)),data);
 card.destination=editorial;assert.throws(()=>S.parseEdition(JSON.stringify(data)),/cannot be card destination snapshots/);
 const savedURL=data.links.find(l=>l.id===editorial).url;
 assert.equal(D.syncEditorial(data,[{...row,url:'https://example.org/another-url',version:3}]),false);
 assert.equal(data.links.find(l=>l.id===editorial).url,savedURL);
 assert(S.validate(data).some(r=>r.level==='error'&&r.message.includes('aliases an editorial link')));
});
test('registry refresh updates only editorial entries, includes inactive rows and marks missing rows unapproved',()=>{
 const {data,card}=ready(),row=D.seeds[0],id=add(data,card),snapshot=D.select(data,'registry/'+row.id,[row]);
 const saved=structuredClone(data.links.find(l=>l.id===snapshot)),updated={...row,name:'Updated research',url:'https://example.org/updated?a=1&b=2',version:2,active:false};
 assert.equal(D.syncEditorial(data,[updated]),true);assert.equal(D.syncEditorial(data,[updated]),false);
 assert.deepEqual(data.links.find(l=>l.id===snapshot),saved);
 const link=data.links.find(l=>l.id===id);assert.equal(link.approved,true);assert.equal(link.label,updated.name);assert.equal(link.url,updated.url);
 assert.equal(D.syncEditorial(data,[]),true);assert.equal(link.approved,false);assert.equal(link.url,updated.url);
 assert(S.validate(data).some(r=>r.level==='error'&&r.message.includes('editorial destination')));
 assert(!S.render(data).includes('href="'+S.escape(updated.url)+'"'));
 assert.equal(D.syncEditorial(data,[{...updated,url:'javascript:alert(1)'}]),true);assert.equal(link.approved,false);
 assert.doesNotMatch(S.render(data),/href="javascript:/);
});
test('selecting another editorial link does not orphan existing editorial references',()=>{
 const {data,card}=ready(),first=add(data,card),second=D.selectEditorial(data,D.seeds[1].id,D.seeds);
 assert.notEqual(first,second);assert.equal(data.links.find(l=>l.id===first).approved,true);
});
test('changed editorial URLs clear required card approvals without touching CTA-only or unrelated cards',()=>{
 const {data}=ready(),row=D.seeds[0],editorial=D.selectEditorial(data,row.id,[row]),cta=D.select(data,'registry/'+row.id,[row]);
 const section=data.sections.find(s=>s.id==='students'),card={...S.newCard(),title:'Approved story',body:'Read resources',approved:true,bodyLinks:[{start:5,end:14,destination:editorial}]};
 const ctaOnly={...S.newCard(),title:'Saved CTA',body:'Unchanged story',approved:true,buttonLabel:'Read resources',destination:cta};
 const unrelated={...S.newCard(),title:'Other story',body:'Unchanged story',approved:true};
 section.enabled=false;card.enabled=false;section.cards.push(card,ctaOnly,unrelated);
 const external={...structuredClone(card),id:'external-story',externalSubmission:true,enabled:true};
 data.sections[0].cards.push(external);
 assert(D.syncEditorial(data,[{...row,name:'Renamed resources',version:2}]));assert.equal(card.approved,true);assert.equal(external.approved,true);
 assert(D.syncEditorial(data,[{...row,url:'https://example.org/revised',version:3}]));
 assert.equal(card.approved,false);assert.equal(external.approved,false);assert.equal(ctaOnly.approved,true);assert.equal(unrelated.approved,true);
 assert.equal(data.links.find(l=>l.id===cta).url,row.url);
 card.approved=true;external.approved=true;assert.equal(D.syncEditorial(data,[{...row,url:'https://example.org/revised',version:3}]),false);assert.equal(card.approved,true);assert.equal(external.approved,true);
});
test('valid ranges are normalized, sorted, detached and read-only UTF-16 offsets',()=>{
 const card={body:'😀 alpha beta',bodyLinks:[{start:9,end:13,destination:'b'},{start:3,end:8,destination:'a'}]},before=structuredClone(card);
 const links=S.validBodyLinks(card);assert.deepEqual(links,[{start:3,end:8,destination:'a'},{start:9,end:13,destination:'b'}]);
 assert(Object.isFrozen(links));assert(Object.isFrozen(links[0]));assert.notEqual(links[0],card.bodyLinks[1]);assert.deepEqual(card,before);
});
test('unsafe, overlapping, blank, split-surrogate and paragraph-crossing ranges are ignored and block readiness/import',()=>{
 const invalid=[
  null,{},'html',{start:-1,end:3,destination:'hub'},{start:0,end:999,destination:'hub'},
  {start:0.5,end:3,destination:'hub'},{start:3,end:3,destination:'hub'},{start:3,end:8,destination:''},
  {start:1,end:8,destination:'hub'},{start:2,end:3,destination:'hub'},
  {start:3,end:8,destination:'hub',html:'<a href="javascript:x">'},
  {start:3,end:14,destination:'hub'},{start:3,end:9,destination:'hub'}
 ];
 for(const range of invalid){
  const {data,card}=ready('newsletter','😀 alpha\n\nbeta');card.bodyLinks=[range];
  assert.equal(S.validBodyLinks(card).length,0,JSON.stringify(range));
  assert(S.validate(data).some(r=>r.level==='error'&&r.message.includes('ranges')));
  assert.throws(()=>S.parseEdition(JSON.stringify(data)),/editorial link/);
  assert.doesNotMatch(S.render(data),/style="color:inherit/);
 }
 for(const bodyLinks of [{start:0,end:1,destination:'hub'},'html',null]){
  const {data,card}=ready();card.bodyLinks=bodyLinks;assert.throws(()=>S.parseEdition(JSON.stringify(data)),/ranges/);
 }
 const {data,card}=ready();card.bodyLinks=[{start:0,end:8,destination:'hub'},{start:4,end:10,destination:'hub'}];
 assert.equal(S.validBodyLinks(card).length,1);assert.throws(()=>S.parseEdition(JSON.stringify(data)),/ranges/);
});
test('textarea edits rebase links for insertion before/inside/after, replacement and removal',()=>{
 for(const [after,expected] of [
  ['New Read library resources today.',{start:9,end:26}],
  ['Read library useful resources today.',{start:5,end:29}],
  ['Read library resources today. More',{start:5,end:22}],
  ['Read research today.',{start:5,end:13}],
  ['Entirely revised copy',{start:0,end:21}],
  ['Read  today.',null],
  ['Read library\n\nresources today.',null]
 ]){
  const {data,card}=ready(),id=add(data,card),before=card.body;card.body=after;
  const ranges=S.updateBodyLinks(card,before);
  assert.deepEqual(ranges,expected?[{...expected,destination:id}]:[],after);assert.deepEqual(card.bodyLinks,ranges);
 }
 const {card}=ready();card.body='Updated plain text';S.updateBodyLinks(card,'Old plain text');assert.equal(card.bodyLinks,undefined);
});
test('creating, replacing and removing links preserves plain body text and output when no links remain',()=>{
 const {data,card}=ready(),before=card.body,html=S.render(data),id=add(data,card);
 assert.equal(card.body,before);assert.match(S.render(data),/color:inherit;text-decoration:underline;overflow-wrap:anywhere/);
 card.bodyLinks=S.validBodyLinks(card).filter(r=>r.destination!==id);assert.equal(S.render(data),html);assert.equal(card.body,before);
});
for(const type of ['newsletter','program-letter']){
 test(`${type}: approved escaped links survive HTML, Gmail, private bundle ZIP and JSON roundtrips`,async()=>{
  const {data,card}=ready(type,'😀 Read <library & resources>\nmore.\n\nNext paragraph.');
  const row={...D.seeds[0],url:'https://example.org/library?a=1&b=2'},id=add(data,card,8,35,row);
  assert(!S.validate(data).some(r=>r.level==='error'));
  assert(S.validate(data).some(r=>r.message==='1 approved HTTPS link reference configured.'));
  const body=card.body,before=JSON.stringify(data),anchor=`<a href="https://example.org/library?a=1&amp;b=2" style="color:inherit;text-decoration:underline;overflow-wrap:anywhere">`;
  for(const email of [false,true]){
   const html=S.render(data,{email});assert(html.includes(anchor));assert(html.includes('&lt;library &amp; resources&gt;<br>more.'));assert(!html.includes('<library'));
   const fragment=H.emailFragment(html);assert(fragment.includes(anchor));
   let entries;class ClipboardItem{constructor(data){this.data=data;}}
   const copied=await H.copyRendered(fragment,{clipboard:{write:async items=>{entries=items;}},ClipboardItem,Blob});
   assert.equal(copied.mode,'rich');assert.equal(entries[0].data['text/html'].type,'text/html');
   assert.equal(await entries[0].data['text/html'].text(),fragment);assert((await entries[0].data['text/html'].text()).includes(anchor));
   assert((await entries[0].data['text/plain'].text()).includes(row.url));
  }
  const used=S.linksUsed(data);assert.equal(used.length,1);assert.equal(used[0].id,id);assert.equal(used[0].usedBy[0].title,card.title);
  const files=S.makeFiles(data);assert.deepEqual(S.parseEdition(files['content.json']),data);
  const privateFiles=PrivateHandoff.bundleFiles(data),zipText=new TextDecoder().decode(S.zip(privateFiles));assert(zipText.includes(anchor));
  assert.equal(card.body,body);assert.equal(JSON.stringify(data),before);
  card.bodyLinks=[];const empty=S.render(data);delete card.bodyLinks;assert.equal(S.render(data),empty);
 });
 test(`${type}: pending, missing and unsafe editorial targets never become anchors`,()=>{
  const {data,card}=ready(type),id=add(data,card),link=data.links.find(l=>l.id===id);
  for(const values of [{approved:false},{approved:true,url:'javascript:alert(1)'},{approved:true,url:'http://example.org'},{approved:true,url:'******example.org'}]){
   Object.assign(link,values);assert(S.validate(data).some(r=>r.level==='error'));
   assert.doesNotMatch(S.render(data,{email:true}),/style="color:inherit/);
   assert.throws(()=>PrivateHandoff.bundleFiles(data),/blockers/);
   if(link.url&&!S.https(link.url))assert.throws(()=>S.parseEdition(JSON.stringify(data)),/destination/);
  }
  data.links=data.links.filter(l=>l.id!==id);assert.throws(()=>S.parseEdition(JSON.stringify(data)),/destination/);
  assert.doesNotMatch(S.render(data),/style="color:inherit/);
 });
}
test('SQL persists editorial JSON and refuses deleting references in disabled cards without a CTA',async()=>{
 const db=new PGlite();
 try{
  await db.exec(fs.readFileSync(path.join(__dirname,'../db/001_editions.sql'),'utf8'));
  await db.exec(fs.readFileSync(path.join(__dirname,'../db/002_destinations.sql'),'utf8'));
  const sql={query:async(text,args)=>(await db.query(text,args)).rows},editions=createEditions(sql),destinations=createDestinations(sql);
  for(const type of ['newsletter','program-letter']){
   const {data,card}=ready(type),row=(await destinations.list())[0],id=add(data,card,5,22,row);
   data.sections[0].enabled=false;card.enabled=false;assert.equal(card.destination,'');assert(D.referenced(data,row));
   const editionId=randomUUID();await editions.save(editionId,data,null);
   const reopened=(await editions.get(editionId)).content;assert.deepEqual(reopened,data);assert.equal(reopened.sections[0].cards[0].bodyLinks[0].destination,id);
   assert.equal(await destinations.remove(row.id,row.version),undefined);
   const updated=await destinations.save(row.id,{...row,url:'https://example.org/revised',active:false},row.version);
   assert(D.syncEditorial(data,[updated]));assert.equal(data.links.find(l=>l.id===id).url,updated.url);
   await editions.save(editionId,data,1);assert.equal((await editions.get(editionId)).content.links.find(l=>l.id===id).url,updated.url);
   assert.equal(await destinations.remove(row.id,updated.version),undefined);
   card.bodyLinks=[];await editions.save(editionId,data,2);
   assert.equal((await destinations.remove(row.id,updated.version)).id,row.id);
  }
  const {data,card}=ready();card.bodyLinks=[{start:-1,end:100,destination:'hub'}];
  await assert.rejects(()=>editions.save(randomUUID(),data,null),error=>error.status===400);
 }finally{await db.close();}
});
test('exposed-form SQL deletion protects editorial-only disabled references after URL edits and unexposure',async()=>{
 const db=new PGlite();
 try{
  for(const migration of ['001_editions.sql','002_destinations.sql','003_submission_forms.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../db',migration),'utf8'));
  const sql={query:async(text,args)=>(await db.query(text,args)).rows},editions=createEditions(sql),destinations=createDestinations(sql),forms=createForms(sql);
  for(const type of ['newsletter','program-letter']){
   const formId=randomUUID(),editionId=randomUUID(),input={...F.empty(),name:'Submit Your EdD Story',url:'https://example.org/stories',active:true,expose_as_destination:true};
   await forms.save(formId,input,null);
   const {data,card}=ready(type),row=(await destinations.list()).find(r=>r.id===formId),id=add(data,card,5,22,row);
   data.sections[0].enabled=false;card.enabled=false;
   await editions.save(editionId,data,null);assert.equal(await forms.remove(formId,1),undefined);
   const revised=await forms.save(formId,{...input,url:'https://example.org/revised-stories',active:false},1);
   assert(D.syncEditorial(data,await destinations.list()));assert.equal(data.links.find(l=>l.id===id).approved,true);
   await editions.save(editionId,data,1);assert.equal(await forms.remove(formId,revised.version),undefined);
   const hidden=await forms.save(formId,{...revised,expose_as_destination:false},revised.version);
   assert(D.syncEditorial(data,await destinations.list()));
   const link=data.links.find(l=>l.id===id);assert.equal(link.approved,false);assert.equal(link.url,revised.url);
   await editions.save(editionId,data,2);
   const reopened=(await editions.get(editionId)).content.links.find(l=>l.id===id);assert.equal(reopened.approved,false);assert.equal(reopened.url,revised.url);
   assert.equal(await forms.remove(formId,hidden.version),undefined);
   card.bodyLinks=[];await editions.save(editionId,data,3);assert.equal((await forms.remove(formId,hidden.version)).id,formId);
  }
  const formId=randomUUID(),input={...F.empty(),name:'Legacy form',url:'https://example.org/legacy-stories',active:true};
  await forms.save(formId,input,null);
  const {data,card}=ready();data.links.push({id:'legacy-form',label:input.name,url:input.url,approved:true});
  card.bodyLinks=[{start:5,end:22,destination:'legacy-form'}];await editions.save(randomUUID(),data,null);
  assert.equal(await forms.remove(formId,1),undefined);
 }finally{await db.close();}
});
test('hand-edited editorial URLs in content.json survive registry refresh and render as written',()=>{
 const {data,card}=ready(),row=D.seeds[0],id=add(data,card);
 const imported=S.parseEdition(JSON.stringify({...data,links:data.links.map(l=>l.id===id?{...l,url:'https://example.org/fixed-link'}:l)}));
 assert.equal(D.syncEditorial(imported,[row]),true);
 const link=imported.links.find(l=>l.id===id);
 assert.equal(link.url,'https://example.org/fixed-link');assert.equal(link.editorialRegistry,false);assert.equal(link.approved,true);
 assert.equal(D.syncEditorial(imported,[{...row,url:'https://example.org/registry-update',version:row.version+1}]),false);
 assert.equal(link.url,'https://example.org/fixed-link');
 assert(S.render(imported).includes('href="https://example.org/fixed-link"'));
 assert(!S.validate(imported).some(r=>r.message.includes('editorial destination')));
});
