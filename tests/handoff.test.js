const {test}=require('node:test'),assert=require('node:assert/strict');
const S=require('../core.js'),H=require('../handoff.js');
function fixture(){const d=S.createEdition(false);d.issue.preheader='Hidden preview snippet';d.sections[0].cards.push({...S.newCard(),title:'Community & learning',body:'Welcome to this edition.',destination:'hub',buttonLabel:'Visit Community Center'});return d;}
test('Gmail fragment retains rendered content and inline styling, excludes document and hidden preheader',()=>{const source=S.render(fixture(),{email:true});const html=H.emailFragment(source);assert.doesNotMatch(html,/<(?:html|head|title|body|script|iframe|button)\b/i);assert.doesNotMatch(html,/Hidden preview snippet|display:none/);assert.match(html,/<table role="presentation"/);assert.match(html,/Community &amp; learning/);assert.match(html,/style="margin:0;padding:0;background-color:/);assert.match(source,/Hidden preview snippet/);});
test('plain-text fallback decodes copy, preserves links, and contains no source markup',()=>{const text=H.plainText(H.emailFragment(S.render(fixture(),{email:true})));assert.match(text,/Community & learning/);assert.match(text,/https:\/\/sites.google.com/);assert.doesNotMatch(text,/<table|<div|Hidden preview snippet|\[if mso\]/);});
test('clipboard writes HTML and plain text together',async()=>{let entries;class Item{constructor(data){this.data=data;}}const html=H.emailFragment(S.render(fixture(),{email:true}));const result=await H.copyRendered(html,{clipboard:{write:async items=>entries=items},ClipboardItem:Item,Blob});assert.equal(result.mode,'rich');assert.equal(await entries[0].data['text/html'].text(),html);assert.equal(await entries[0].data['text/plain'].text(),H.plainText(html));});
test('unsupported or denied HTML clipboard falls back to text, never source',async()=>{let copied;class Item{constructor(data){this.data=data;}}const result=await H.copyRendered('<p>Hello &amp; welcome</p>',{clipboard:{write:async()=>{throw Error('unsupported');},writeText:async text=>copied=text},ClipboardItem:Item,Blob});assert.equal(result.mode,'text');assert.equal(copied,'Hello & welcome');});
test('unavailable clipboard yields manual text fallback',async()=>{const result=await H.copyRendered('<p>Hello</p>',{});assert.deepEqual(result,{mode:'manual',text:'Hello'});});
test('draft marker survives Gmail copy while preheader stays excluded',()=>{const html=H.emailFragment(S.render(fixture(),{email:true,draft:true}));assert.match(html,/DRAFT PREVIEW/);assert.doesNotMatch(html,/Hidden preview snippet/);});
test('Program Letter rich clipboard preserves inline hybrid columns and Outlook ghost cells without head CSS',async()=>{
 const d=S.createPublication('program-letter');d.issue.preheader='Hidden pair preheader';
 d.sections.find(s=>s.id==='events').cards=['First gathering','Second gathering'].map(title=>({...S.newCard('event'),title,body:'Meet and learn.',destination:'hub',buttonLabel:'Visit community'}));
 const source=S.render(d,{email:true}),html=H.emailFragment(source);let parts;
 class Item{constructor(data){parts=data;}}
 assert.doesNotMatch(html,/<head|<style|Hidden pair preheader|id="copy-gmail"/);
 assert.match(html,/class="letter-email-pair"/);assert.equal((html.match(/display:inline-block;width:100%;max-width:316px/g)||[]).length,2);
 assert.match(html,/<!--\[if mso\]><table role="presentation" width="632"/);
 const result=await H.copyRendered(html,{clipboard:{write:async()=>{}},ClipboardItem:Item,Blob});
 assert.equal(result.mode,'rich');assert.equal(await parts['text/html'].text(),html);
 const text=await parts['text/plain'].text();assert.equal(text,H.plainText(html));
 assert(text.indexOf('First gathering')<text.indexOf('Second gathering'));assert.match(text,/https:\/\/sites.google.com/);
 assert.doesNotMatch(text,/<!--|width="316"|letter-email-column/);
});
