const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const S=require('../core'),P=require('../publications');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function studio({storage=new Map(),rows=new Map(),offline=false}={}){
 const calls=[],listeners={},elements=new Map();
 const api={
  async list(){calls.push('list');if(offline)throw new Error('Offline: local work unchanged');return [...rows.values()];},
  async get(id){calls.push('get');if(offline)throw new Error('Offline');return structuredClone(rows.get(id));},
  async save(id,content,version){calls.push('save');if(offline)throw new Error('Offline: local work unchanged');
   const prior=rows.get(id);if(prior&&prior.version!==version)throw new Error('Conflict');
   const m=content.publication,row={id,content:structuredClone(content),title:m.title,publication_type:content.publicationType,edition:m.edition,editorial_status:m.status,version:(prior?.version||0)+1};rows.set(id,row);return structuredClone(row);},
  async remove(id){calls.push('remove');rows.delete(id);}
 };
 const context=vm.createContext({console,URLSearchParams,location:{search:''},crypto:require('node:crypto').webcrypto,
  setTimeout:()=>1,clearTimeout:()=>{},EditionStorage:{createClient:()=>api},
  localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
  window:{Publications:P,Studio:S,fetch:()=>{},addEventListener:()=>{}},
  document:{addEventListener:(name,fn)=>listeners[name]=fn,querySelectorAll:()=>[],querySelector:selector=>{
   if(selector.includes('preview'))return null;
   if(!elements.has(selector))elements.set(selector,{style:{},textContent:'',innerHTML:'',setAttribute(){},removeAttribute(){}});return elements.get(selector);
  }}
 });
 vm.runInContext(source,context);vm.runInContext('confirmChange=async()=>true',context);
 const run=code=>vm.runInContext(code,context);
 const click=action=>listeners.click({target:{closest:()=>({dataset:{action}})}});
 return {run,click,calls,rows,storage,elements};
}
test('UI never uploads initial browser content; explicit save updates/reopens and restores the link after reload',async()=>{
 const initial=S.createPublication('newsletter'),storage=new Map([['edd-communications-studio-v2',JSON.stringify(initial)]]);
 const ui=studio({storage});assert.deepEqual(ui.calls,[]);
 await ui.click('online-save');assert.equal(ui.rows.size,1);const id=[...ui.rows.keys()][0];
 ui.run("edition.publication.title='Updated title'");await ui.click('online-save');assert.equal(ui.rows.size,1);assert.equal(ui.rows.get(id).version,2);
 const reload=studio({storage,rows:ui.rows});assert.equal(reload.run('onlineRef.id'),id);assert.deepEqual(reload.calls,[]);
 await reload.run(`onlineAction('online-open','${id}')`);assert.equal(reload.run('edition.publication.title'),'Updated title');
 assert.equal(reload.run('view'),'editor');
});
test('UI creates both types, saves separate editions, duplicates independently, and confirms deletion',async()=>{
 const ui=studio();await ui.click('create-letter');await ui.click('online-save');
 const first=[...ui.rows.keys()][0];await ui.click('create-newsletter');assert.equal(ui.run('onlineRef'),null);await ui.click('online-save');assert.equal(ui.rows.size,2);
 assert.deepEqual([...ui.rows.values()].map(r=>r.publication_type),['program-letter','newsletter']);
 const current=ui.run('JSON.stringify(edition)');await ui.run(`onlineAction('online-duplicate','${first}')`);
 assert.equal(ui.rows.size,3);assert.equal(ui.run('JSON.stringify(edition)'),current);
 const duplicate=[...ui.rows.values()][2];assert.equal(duplicate.editorial_status,'Draft');assert.match(duplicate.title,/\(copy\)/);
 ui.run('confirmChange=async()=>false');await ui.run(`onlineAction('online-delete','${first}')`);assert.equal(ui.rows.size,3);assert(!ui.calls.includes('remove'));
 ui.run('confirmChange=async()=>true');await ui.run(`onlineAction('online-delete','${first}')`);assert.equal(ui.rows.size,2);assert.equal(ui.run('JSON.stringify(edition)'),current);
});
test('UI failed save/open/list retains work and browser fallback, including existing imported local editions',async()=>{
 const initial=S.createPublication('program-letter'),storage=new Map([['edd-communications-studio-v2',JSON.stringify(initial)]]);
 const ui=studio({storage,offline:true});await ui.click('online-save');
 const saved=JSON.parse(storage.get('edd-communications-studio-v2'));assert.deepEqual(saved.sections,initial.sections);assert.equal(saved.publicationType,'program-letter');
 const before=ui.run('JSON.stringify(edition)');await ui.run("onlineAction('online-open','missing')");await ui.click('online-refresh');
 assert.equal(ui.run('JSON.stringify(edition)'),before);assert.equal(ui.run('onlineRef'),null);assert.match(ui.run('onlineMessage'),/Offline/);
});
