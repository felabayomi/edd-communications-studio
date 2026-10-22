const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const S=require('../core'),P=require('../publications'),D=require('../destinations');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function studio(){
 const elements=new Map(),storage=new Map(),listeners={};
 const element=selector=>{
  if(selector.includes('preview'))return null;
  if(!elements.has(selector))elements.set(selector,{value:'',open:false,style:{},textContent:'',innerHTML:'',dataset:{},
   setAttribute(){},removeAttribute(){},focus(){},setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end;},
   showModal(){this.open=true;},close(){this.open=false;}});
  return elements.get(selector);
 };
 const context=vm.createContext({console,URLSearchParams,location:{search:''},CSS:{escape:value=>value},crypto:require('node:crypto').webcrypto,
  SubmissionForms:require('../submission-forms'),SubmissionFormsManager:require('../submission-forms-manager'),PrivateHandoff:require('../private-handoff'),ImageHosting:require('../image-hosting'),Destinations:D,DestinationManager:require('../destinations-manager'),
  setTimeout:()=>1,clearTimeout(){},EditionStorage:{createClient:()=>({})},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
  window:{Publications:P,Studio:S,fetch:async()=>{throw new Error('Offline');},addEventListener(){}},
  document:{addEventListener:(name,fn)=>listeners[name]=fn,querySelectorAll:()=>[],querySelector:element}
 });
 vm.runInContext(source,context);
 const run=code=>vm.runInContext(code,context);
 run(`edition=S.createPublication('newsletter');hasEdition=true;selected=edition.sections[0].id;
 edition.links.push({id:'common-thread',label:'Common Thread',url:'https://commonthread.antioch.edu/four-edd-students-find-a-different-type-of-friendship/',approved:true});
 edition.sections[0].cards.push({...S.newCard(),id:'story',title:'Spotlight',body:'Read our story. Submit Your EdD Story',destination:'common-thread',buttonLabel:'Common Thread'});
 registry.state.rows=[{id:'form',name:'Submit Your EdD Story',url:'https://forms.google.com/approved',category:'Forms',active:true,version:1}];registry.state.loaded=true;registry.refresh=async()=>{};
 render=()=>{};`);
 return {run,element,storage,listeners};
}
test('card Body offers Insert/Edit Link while other text fields remain unchanged',()=>{
 const ui=studio(),html=ui.run('cardEditor(edition.sections[0],findCard("story"),0)');
 assert.equal((html.match(/>Insert\/Edit Link<\/button>/g)||[]).length,1);
 assert.match(html,/data-action="editorial-link" data-card="story"/);
 assert.match(html,/Approved destination<select data-field="destination"/);
 assert(!ui.run(`field('Title','title','Text')`).includes('Insert/Edit Link'));
});
test('searchable picker creates, edits, removes and autosaves links without changing body or CTA',async()=>{
 const ui=studio(),textarea=ui.element('textarea[data-field="body"][data-card="story"]');
 textarea.selectionStart=16;textarea.selectionEnd=37;
 await ui.run('openEditorialLink("story")');
 assert.equal(ui.element('#editorial-link-dialog').open,true);
 assert.equal(ui.element('#editorial-link-text').textContent,'Submit Your EdD Story');
 assert.match(ui.element('#editorial-destination').innerHTML,/Submit Your EdD Story · Forms/);
 ui.run(`editorialOptions('missing')`);assert(!ui.element('#editorial-destination').innerHTML.includes('value="form"'));
 ui.run(`editorialOptions('forms')`);assert(ui.element('#editorial-destination').innerHTML.includes('value="form"'));
 ui.element('#editorial-destination').value='form';ui.run('applyEditorialLink()');
 assert.equal(ui.run('findCard("story").bodyLinks.length'),1);
 assert.equal(ui.run('findCard("story").destination'),'common-thread');
 assert.equal(ui.run('edition.links.find(l=>l.id==="common-thread").url'),'https://commonthread.antioch.edu/four-edd-students-find-a-different-type-of-friendship/');
 const saved=JSON.parse(ui.storage.get('edd-communications-studio-v2'));
 assert.equal(saved.sections[0].cards[0].bodyLinks[0].start,16);
 ui.run(`registry.state.rows.push({id:'other',name:'Other approved form',url:'https://example.org/new',category:'Forms',active:true,version:1})`);
 textarea.selectionStart=20;textarea.selectionEnd=20;
 await ui.run('openEditorialLink("story")');
 assert.equal(ui.element('#editorial-link-remove').disabled,false);
 ui.element('#editorial-destination').value='other';ui.run('applyEditorialLink()');
 assert.equal(ui.run('edition.links.find(l=>l.id===findCard("story").bodyLinks[0].destination).registryId'),'other');
 textarea.selectionStart=20;textarea.selectionEnd=20;await ui.run('openEditorialLink("story")');ui.run('applyEditorialLink(true)');
 assert.equal(ui.run('findCard("story").bodyLinks'),undefined);
 assert.equal(ui.run('findCard("story").body'),'Read our story. Submit Your EdD Story');
 assert.equal(ui.run('findCard("story").destination'),'common-thread');
});
test('picker refuses empty selections, arbitrary/missing destinations and stale body edits',async()=>{
 const ui=studio(),textarea=ui.element('textarea[data-field="body"][data-card="story"]');
 textarea.selectionStart=0;textarea.selectionEnd=0;
 await assert.rejects(()=>ui.run('openEditorialLink("story")'),/Highlight/);
 textarea.selectionEnd=4;await ui.run('openEditorialLink("story")');
 ui.element('#editorial-destination').value='javascript:alert(1)';
 assert.throws(()=>ui.run('applyEditorialLink()'));
 assert.equal(ui.run('findCard("story").bodyLinks'),undefined);
 ui.element('#editorial-destination').value='form';
 ui.run('findCard("story").body+=" Changed"');
 assert.throws(()=>ui.run('applyEditorialLink()'),/body changed/);
});
test('body input rebases link ranges, and cancellation leaves the edition untouched',async()=>{
 const ui=studio(),textarea=ui.element('textarea[data-field="body"][data-card="story"]');
 textarea.selectionStart=16;textarea.selectionEnd=37;await ui.run('openEditorialLink("story")');
 const before=ui.run('JSON.stringify(edition)');
 await ui.listeners.click({target:{closest:()=>({dataset:{action:'editorial-cancel'}})}});
 assert.equal(ui.run('JSON.stringify(edition)'),before);
 await ui.run('openEditorialLink("story")');ui.element('#editorial-destination').value='form';ui.run('applyEditorialLink()');
 ui.listeners.input({target:{id:'',dataset:{field:'body',card:'story'},value:'New. Read our story. Submit Your EdD Story',
  matches:selector=>selector==='[data-field]',closest:()=>({querySelector:()=>null})}});
 assert.equal(ui.run('findCard("story").bodyLinks[0].start'),21);
});
test('offline picker cannot insert unverified starting choices but can remove an existing link',async()=>{
 const ui=studio(),textarea=ui.element('textarea[data-field="body"][data-card="story"]');
 textarea.selectionStart=16;textarea.selectionEnd=37;await ui.run('openEditorialLink("story")');
 ui.element('#editorial-destination').value='form';ui.run('applyEditorialLink()');
 ui.run('registry.state.loaded=false');
 textarea.selectionStart=20;textarea.selectionEnd=20;await ui.run('openEditorialLink("story")');
 assert.match(ui.element('#editorial-link-status').textContent,/Connect to load/);
 assert(!ui.element('#editorial-destination').innerHTML.includes('value="form"'));
 assert.throws(()=>ui.run('applyEditorialLink()'),/active Approved Destination/);
 ui.run('applyEditorialLink(true)');assert.equal(ui.run('findCard("story").bodyLinks'),undefined);
});
test('blank and paragraph-boundary selections cannot save invalid link metadata',()=>{
 const ui=studio();
 assert.throws(()=>ui.run(`editorialRange({body:'One  two'},3,5)`),/readable text/);
 assert.throws(()=>ui.run(`editorialRange({body:'One\\n\\nTwo'},0,4)`),/readable text/);
 assert.throws(()=>ui.run(`editorialRange({body:'One\\n\\nTwo'},0,8)`),/single paragraph/);
});
test('opening another link resets the picker to that link rather than the previous dialog selection',async()=>{
 const ui=studio(),textarea=ui.element('textarea[data-field="body"][data-card="story"]');
 ui.run(`registry.state.rows.push({id:'other',name:'Other form',url:'https://example.org/other',active:true,version:1});
 findCard('story').bodyLinks=[
 {start:0,end:4,destination:Destinations.selectEditorial(edition,'form',registry.state.rows)},
 {start:16,end:37,destination:Destinations.selectEditorial(edition,'other',registry.state.rows)}];`);
 textarea.selectionStart=1;textarea.selectionEnd=1;await ui.run('openEditorialLink("story")');
 assert.equal(ui.element('#editorial-destination').value,'form');
 await ui.listeners.click({target:{closest:()=>({dataset:{action:'editorial-cancel'}})}});
 textarea.selectionStart=20;textarea.selectionEnd=20;await ui.run('openEditorialLink("story")');
 assert.equal(ui.element('#editorial-destination').value,'other');
});
