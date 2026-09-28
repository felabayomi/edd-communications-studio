const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const S=require('../core'),H=require('../handoff'),C=require('../standalone-copy'),P=require('../private-handoff');
function edition(type,status){const d=S.createPublication(type);d.publication.status=status;d.issue.preheader='HIDDEN_PREHEADER';d.sections[0].cards.push({...S.newCard(),title:'Community news',body:'A publication for our community.',buttonLabel:'Visit the Community Center',destination:'hub'});return d;}
for(const type of ['newsletter','program-letter'])for(const status of ['Draft','Ready for Review','Approved','Distributed']){
 test(`${type} ${status}: standalone page uses the existing email fragment and preserves warnings`,()=>{
  const data=edition(type,status),before=JSON.stringify(data),files=P.makeFiles(data),page=files['OPEN-TO-COPY.html'],email=Object.entries(files).find(([name])=>name.endsWith('-email.html'))[1];
  assert(page.includes('<main id="publication">'+H.emailFragment(email)+'</main>'));
  assert.equal(page.includes('DRAFT PREVIEW · NOT FOR DISTRIBUTION'),status==='Draft');assert.equal(page.includes('READY FOR REVIEW · NOT APPROVED FOR DISTRIBUTION'),status==='Ready for Review');
  assert(!page.includes('HIDDEN_PREHEADER'));assert.match(page,/id="copy-gmail"/);assert.match(page,/id="select-publication"/);
  assert(page.includes(H.copyRendered.toString()));assert(page.includes(H.plainText.toString()));assert.equal(JSON.stringify(data),before);
  assert.match(files['HANDOFF.txt'],/GMAIL DISTRIBUTION/);assert.match(files['HANDOFF.txt'],/Open OPEN-TO-COPY.html in Chrome or Edge/);assert.match(files['HANDOFF.txt'],/Send only if/);
 });
}
test('standalone file excludes private records, dependencies, APIs and storage; content cannot inject scripts',()=>{
 const data=edition('newsletter','Approved');data.privateData={DATABASE_URL:'PRIVATE_CREDENTIAL'};
 data.links.push({id:'private',label:'PRIVATE_UNUSED_LINK',url:'https://example.org/private',approved:true});
 data.sections[0].cards[0].body='</main><script>alert("injected")</script>';
 const page=C.makePage(S.render(data,{email:true}));
 assert.doesNotMatch(page,/PRIVATE_CREDENTIAL|PRIVATE_UNUSED_LINK|DATABASE_URL|\.netlify|localStorage|sessionStorage|fetch\(|XMLHttpRequest|<script\s+src/i);
 assert.equal((page.match(/<script>/g)||[]).length,1);assert.match(page,/&lt;script&gt;/);assert.match(page,/connect-src 'none'/);
});
function runtime({native=false,denied=false,legacy=false,text=false}={}){
 const html='<div style="color:#083133"><p>Publication only</p><a href="https://example.org">Read more</a></div>',events={},copyEvents=new Set(),writes=[],nodes={publication:{innerHTML:html},'copy-status':{textContent:''},'copy-gmail':{disabled:false},'select-publication':{}};
 for(const key of ['copy-gmail','select-publication'])nodes[key].addEventListener=(event,handler)=>events[key]=handler;
 const selection={rangeCount:0,removeAllRanges(){},addRange(range){this.selected=range.node;}};
 class Item{constructor(parts){this.parts=parts;}}
 const clipboard={};if(native)clipboard.write=async items=>{if(denied)throw new Error('denied');writes.push(items[0].parts);};if(text)clipboard.writeText=async value=>writes.push({'text/plain':value});
 const document={getElementById:id=>nodes[id],createRange:()=>({selectNodeContents(node){this.node=node;}}),addEventListener:(name,fn)=>copyEvents.add(fn),removeEventListener:(name,fn)=>copyEvents.delete(fn),execCommand:()=>{if(!legacy)return false;const data={};for(const fn of copyEvents)fn({clipboardData:{setData:(mime,value)=>data[mime]=value},preventDefault(){}});writes.push(data);return true;}};
 const context=vm.createContext({document,navigator:{clipboard},window:{Blob,ClipboardItem:native?Item:undefined,getSelection:()=>selection},Blob});
 const page=C.makePage(S.render(edition('newsletter','Approved'),{email:true}));vm.runInContext(page.match(/<script>([\s\S]*)<\/script>/)[1],context);
 return {events,nodes,writes,copyEvents,selection,html};
}
test('native clipboard writes HTML and plain text excluding page controls',async()=>{
 const r=runtime({native:true});await r.events['copy-gmail']();assert.equal(await r.writes[0]['text/html'].text(),r.html);assert.match(await r.writes[0]['text/plain'].text(),/Read more \(https:\/\/example.org\)/);assert.match(r.nodes['copy-status'].textContent,/Formatted publication copied/);
});
test('missing or denied Clipboard API uses rich copy-event fallback and removes its listener',async()=>{
 for(const native of [false,true]){const r=runtime({native,denied:true,legacy:true});await r.events['copy-gmail']();assert.equal(r.writes[0]['text/html'],r.html);assert.equal(r.copyEvents.size,0);assert.match(r.nodes['copy-status'].textContent,/Formatted publication copied/);}
});
test('blocked rich copying clearly labels plain-text fallback; total failure offers manual selection',async()=>{
 const r=runtime({native:true,denied:true,text:true});await r.events['copy-gmail']();assert.match(r.nodes['copy-status'].textContent,/Plain text copied; formatting was not preserved/);
 const blocked=runtime();await blocked.events['copy-gmail']();assert.match(blocked.nodes['copy-status'].textContent,/Automatic copying is blocked/);blocked.events['select-publication']();assert.equal(blocked.selection.selected,blocked.nodes.publication);assert.match(blocked.nodes['copy-status'].textContent,/Only the publication is selected/);assert.equal(blocked.nodes['copy-gmail'].disabled,false);
});
