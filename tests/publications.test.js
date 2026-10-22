const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const S=require('../core'),P=require('../publications'),H=require('../handoff');
const legacy=require('./fixtures/legacy-newsletter.json'),hashes=require('./fixtures/legacy-render-hashes.json');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
test('legacy migration preserves issue, content, ordering, links, and exact web/email rendering',()=>{
 const d=S.parseEdition(JSON.stringify(legacy));assert.equal(d.publicationType,'newsletter');
 for(const key of ['issue','sections','links'])assert.deepEqual(d[key],legacy[key]);
 assert.equal(hash(S.render(d,{draft:true})),hashes.web);
 assert.equal(hash(S.render(d,{email:true,draft:true})),hashes.email);
 assert.deepEqual(S.parseEdition(JSON.stringify(d)),d);
});
test('program letter defaults are distinct and newsletter CPED is optional',()=>{
 const letter=S.createPublication('program-letter'),newsletter=S.createPublication('newsletter');
 assert.equal(letter.publication.title,'EdD Program Letter');assert.equal(letter.publication.audience,'Currently registered EdD students');assert.equal(letter.sections.length,9);assert.equal(letter.sections[0].title,'Chair’s Message');assert(letter.sections.some(s=>s.id==='registration'));
 assert.equal(newsletter.sections.length,14);assert.equal(newsletter.sections.find(s=>s.id==='cped').enabled,false);assert(newsletter.sections.some(s=>s.id==='faculty'));
 assert.deepEqual(letter.links,newsletter.links);letter.sections[0].title='Changed';assert.notEqual(S.createPublication('program-letter').sections[0].title,'Changed');
});
test('both types share the renderer and Gmail rich/plain clipboard workflow',async()=>{
 for(const type of ['program-letter','newsletter']){
 const d=S.createPublication(type);d.sections[0].cards.push({...S.newCard('leadership'),title:'A timely update',body:'Our shared communication.'});
 const source=S.render(d,{email:true}),fragment=H.emailFragment(source);assert.match(source,/<table role="presentation"/);assert.doesNotMatch(fragment,/<html|<head|<title/);
 if(type==='program-letter')assert.match(fragment,/EDD PROGRAM LETTER/);
 let written;class Item{constructor(data){this.data=data;}}
 const result=await H.copyRendered(fragment,{clipboard:{write:async items=>written=items},ClipboardItem:Item,Blob});
 assert.equal(result.mode,'rich');assert.match(await written[0].data['text/html'].text(),/A timely update/);assert.match(await written[0].data['text/plain'].text(),/Our shared communication/);
 }
});
test('exports use publication-specific names without changing legacy newsletter names',()=>{
 const letter=S.createPublication('program-letter');letter.issue.issueDate='2026-09-25';letter.sections[0].cards.push({...S.newCard(),title:'Welcome',body:'Program news'});
 assert(Object.hasOwn(S.makeFiles(letter),'edd-program-letter-2026-09-25-email.html'));
 const newsletter=S.createPublication('newsletter');newsletter.issue.period='Fall';newsletter.issue.year='2026';newsletter.sections[0].cards=letter.sections[0].cards;
 assert(Object.hasOwn(S.makeFiles(newsletter),'edd-newsletter-fall-2026-email.html'));
 assert(Object.hasOwn(S.makeFiles(letter,{draft:true}),'edd-program-letter-2026-09-25-draft-email.html'));
});
test('status remains metadata and never suppresses readiness blockers',()=>{
 const d=S.createPublication('program-letter');for(const status of P.statuses){d.publication.status=status;assert(S.validate(d).some(r=>r.level==='error'));assert.throws(()=>S.makeFiles(d));}
});
test('external submissions in any module and faculty spotlight require approval',()=>{
 const d=S.createPublication('newsletter'),s=d.sections.find(s=>s.id==='community');s.cards.push({...S.newCard(),title:'Community story',body:'A reviewed contribution.',externalSubmission:true});
 assert(S.validate(d).some(r=>r.message.includes('approval')));s.cards[0].approved=true;assert(!S.validate(d).some(r=>r.message.includes('approval')));
 const faculty=d.sections.find(s=>s.id==='faculty');faculty.cards.push({...S.newCard('spotlight'),title:'Faculty story',body:'A contribution.'});assert(S.validate(d).some(r=>r.message.includes('Faculty/Staff Spotlight')&&r.message.includes('approval')));
});
test('invalid imported publication types and metadata fail before replacing saved work',()=>{
 const d=S.createPublication('newsletter');d.publicationType='campaign';assert.throws(()=>S.parseEdition(JSON.stringify(d)));
 d.publicationType='newsletter';d.publication.status='Sent automatically';assert.throws(()=>S.parseEdition(JSON.stringify(d)));
 d.publication.status='Draft';d.publication.updatedAt='invalid';assert.throws(()=>S.parseEdition(JSON.stringify(d)));
});

function editorialEdition(){
 const d=S.createPublication('program-letter');
 d.sections=d.sections.slice(0,6);
 d.publication.status='Draft';d.issue.period='Fall';d.issue.year='2026';d.issue.issueDate='2026-10-27';
 d.issue.reviewNotice='Review notice retained';d.issue.footerNote='Footer wording retained';
 for(const [i,s] of d.sections.entries()){
  s.cards=[{...S.newCard(i===0?'leadership':'resource'),title:`Card ${i} headline`,body:`Card ${i} first paragraph.\n\nCard ${i} second paragraph.`,author:`Author ${i}`,date:`2026-11-0${i+1}`,label:`Label ${i}`,deadline:`2026-12-0${i+1}`,quote:`Quotation ${i}`,buttonLabel:`Destination ${i}`,destination:'hub'}];
 }
 return d;
}

test('Program Letter uses wide responsive web compositions and an inline single-column email fallback',()=>{
 const d=S.createPublication('program-letter'),s=d.sections.find(s=>s.id==='events');
 const card=(title,extra={})=>({...S.newCard('event'),title,body:'A short independent update.',date:'2026-11-03',...extra});
 s.cards=[card('First event'),card('Second event'),card('Long-form event',{body:'Detailed information. '.repeat(80)}),card('Third event'),card('Fourth event')];
 const web=S.render(d),email=S.render(d,{email:true}),fragment=H.emailFragment(email);
 assert.match(web,/max-width:940px/);assert.match(web,/@media\(min-width:800px\)/);assert.match(web,/@media\(min-width:900px\)/);
 assert.match(web,/grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
 assert.match(web,/\.l-pair,\.l-image-layout\{display:block\}/);
 assert.match(web,/\.l-section\{padding:12px 16px\}/);assert.match(web,/min-width:0/);assert.match(web,/overflow-wrap:anywhere/);
 assert.equal((web.match(/<div class="l-pair">/g)||[]).length,2);
 assert.match(web,/<article class="l-card l-longform">/);
 assert.match(email,/max-width:680px;table-layout:fixed/);assert.match(email,/\[if mso\]><table role="presentation" width="680"/);
 assert.doesNotMatch(fragment,/display:grid|display:flex|@media|l-pair|l-image-layout|width="(?:40%|48%|60%)"/);
 assert.doesNotMatch(email,/<style/);
 for(const html of [web,fragment]){
  let at=-1;for(const c of s.cards){const next=html.indexOf(S.escape(c.title),at+1);assert(next>at);at=next;}
  assert.match(html,/2026-11-03/);
  assert.doesNotMatch(html,/bgcolor="#(?:D9E7EB|E7DBE9|F7E2D8)"|border-left:5px|l-tile/);
 }
});

test('web columns require adjacent short independent cards, never long titles, quotes, images or chair/closing sections',()=>{
 for(const extra of [{title:'Long heading '.repeat(10)},{body:'Long text '.repeat(60)},{author:'Author '.repeat(20)},{quote:'Keep full width'},{imageUrl:'https://example.org/image.png',imageAlt:'Image'},{localImage:'data:image/png;base64,AAAA'},{type:'leadership'},{buttonLabel:'Long link '.repeat(20)},{label:'Long metadata '.repeat(20)}]){
  const d=S.createPublication('program-letter'),s=d.sections.find(s=>s.id==='resources');
  s.cards=[{...S.newCard('resource'),title:'First',body:'Short',...extra},{...S.newCard('resource'),title:'Second',body:'Short'}];
  assert.doesNotMatch(S.render(d),/<div class="l-pair">/);
 }
 for(const id of ['chair','closing']){
  const d=S.createPublication('program-letter'),s=d.sections.find(s=>s.id===id);
  s.cards=['One','Two'].map(title=>({...S.newCard('resource'),title,body:'Short'}));
  assert.doesNotMatch(S.render(d),/<div class="l-pair">/);
 }
});

test('image-and-text web arrangements stack in email and leave long-form image cards full width',()=>{
 const d=S.createPublication('program-letter'),s=d.sections[1];
 s.cards=[{...S.newCard(),title:'Civic participation',body:'Checklist and guidance.',imageUrl:'https://example.org/guide.png',imageAlt:'Checklist'},
 {...S.newCard('leadership'),title:'Chair update',body:'Long-form guidance.',imageUrl:'https://example.org/chair.png',imageAlt:'Chair'}];
 const web=S.render(d),email=S.render(d,{email:true});
 assert.equal((web.match(/<div class="l-image-layout">/g)||[]).length,1);
 assert.match(web,/grid-template-columns:480px minmax\(0,1fr\)/);
 assert.doesNotMatch(email,/l-image-layout/);
 assert(web.indexOf('Civic participation')<web.indexOf('<div class="l-image-layout">'));
});

test('six-section rendering and exports preserve all edition content, order, links and metadata without mutation',()=>{
 const d=editorialEdition(),before=JSON.stringify(d);
 const files=S.makeFiles(d,{draft:true});
 for(const html of [S.render(d),S.render(d,{email:true}),...Object.entries(files).filter(([name])=>name.endsWith('.html')).map(([,value])=>value)]){
  let sectionAt=-1;
  assert.equal((html.match(/<h2 /g)||[]).length,6);
  for(const s of d.sections){
   const next=html.indexOf(S.escape(s.title),sectionAt+1);assert(next>sectionAt);sectionAt=next;
   for(const c of s.cards){
    for(const value of [c.title,c.author,c.date,c.label,c.deadline,c.quote,c.buttonLabel,...c.body.split('\n\n')])assert(html.includes(S.escape(value)),value);
    assert(html.indexOf(S.escape(c.title))<html.indexOf(S.escape(c.body.split('\n\n')[0])));
    const dest=d.links.find(l=>l.id===c.destination);assert(html.includes(`href="${S.escape(dest.url)}"`));
   }
  }
  for(const value of [d.issue.programName,d.issue.institutionName,d.issue.degreeName,d.issue.issueDate,d.issue.footerNote,d.issue.reviewNotice])assert(html.includes(S.escape(value)));
  assert.match(html,/DRAFT PREVIEW · NOT FOR DISTRIBUTION/);
 }
 assert.equal(files['content.json'],JSON.stringify(d,null,2));assert.equal(JSON.stringify(d),before);
});

test('Program Letter content stays escaped and disabled or unapproved destinations are not activated',()=>{
 const d=S.createPublication('program-letter'),s=d.sections[0];
 d.links.push({id:'pending',label:'Pending',url:'https://example.org/pending',approved:false});
 s.cards=[{...S.newCard(),title:'<script>title</script>',body:'<img src=x onerror=alert(1)>',quote:'<script>quote</script>',buttonLabel:'Read more',destination:'pending'},
 {...S.newCard(),title:'Disabled card sentinel',body:'Hidden',enabled:false}];
 for(const email of [false,true]){
  const html=S.render(d,{email});assert.match(html,/&lt;script&gt;title&lt;\/script&gt;/);
  assert.doesNotMatch(html,/<script|<img src=x|Disabled card sentinel|href="https:\/\/example.org\/pending"/);
  assert.match(html,/Read more · destination pending/);
 }
});
