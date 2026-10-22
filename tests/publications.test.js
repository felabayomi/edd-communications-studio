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

test('Program Letter uses wide web compositions and hybrid email pairs with head-independent wrapping',()=>{
 const d=S.createPublication('program-letter'),s=d.sections.find(s=>s.id==='events');
 const card=(title,extra={})=>({...S.newCard('event'),title,body:'A short independent update.',date:'2026-11-03',...extra});
 s.cards=[card('First event'),card('Second event'),card('Long-form event',{body:'Detailed information. '.repeat(80)}),card('Third event'),card('Fourth event')];
 const web=S.render(d),email=S.render(d,{email:true}),fragment=H.emailFragment(email);
 assert.match(web,/width:calc\(100% - 48px\);max-width:1160px/);assert.match(web,/@media\(min-width:900px\)/);assert.match(web,/@media\(min-width:1100px\)/);
 assert.match(web,/grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/);
 assert.match(web,/\.l-pair,\.l-image-layout\{display:block\}/);
 assert.match(web,/\.l-section\{padding:10px 16px\}/);assert.match(web,/min-width:0/);assert.match(web,/overflow-wrap:anywhere/);
 assert.equal((web.match(/<div class="l-pair">/g)||[]).length,2);
 assert.doesNotMatch(web,/l-longform/);
 assert.match(email,/max-width:680px;table-layout:fixed/);assert.match(email,/\[if mso\]><table role="presentation" width="680" border="0" cellspacing="0" cellpadding="0"/);
 assert.doesNotMatch(fragment,/display:grid|display:flex|@media|class="l-pair"|l-image-layout|width="(?:40%|48%|60%)"/);
 assert.doesNotMatch(email,/<style/);
 assert.equal((fragment.match(/class="letter-email-pair"/g)||[]).length,2);
 assert.equal((fragment.match(/class="letter-email-column"/g)||[]).length,4);
 assert.match(fragment,/display:inline-block;width:100%;max-width:316px;vertical-align:top/);
 assert.equal((fragment.match(/width="632" border="0" cellspacing="0" cellpadding="0"><tr><td width="316" valign="top"/g)||[]).length,2);
 assert.doesNotMatch(fragment,/width="50%"|min-width:\d+px/);
 for(const html of [web,fragment]){
  let at=-1;for(const c of s.cards){const next=html.indexOf(S.escape(c.title),at+1);assert(next>at);at=next;}
  assert.match(html,/2026-11-03/);
  assert.doesNotMatch(html,/bgcolor="#(?:D9E7EB|E7DBE9|F7E2D8)"|border-left:5px|l-tile/);
 }
});

test('approved web magazine output stays byte-for-byte unchanged for six sections and eleven cards',()=>{
 const d=S.createPublication('program-letter');d.issue.year='2026';d.issue.issueDate='2026-10-27';d.sections=['chair','updates','events','registration','resources','dissertation'].map(id=>d.sections.find(s=>s.id===id));
 for(const [i,s] of d.sections.entries())s.cards=Array.from({length:[1,2,2,1,2,3][i]},(_,j)=>({...S.newCard(i===0?'leadership':'resource'),id:`frozen-${i}-${j}`,title:`Heading ${i}-${j}`,body:`First paragraph ${i}-${j}.\n\nSecond paragraph.`,buttonLabel:'Visit destination',destination:'hub'}));
 d.sections[1].cards[0].imageUrl='https://example.org/guide.png';d.sections[1].cards[0].imageAlt='Guide checklist';d.sections[1].cards[1].type='spotlight';
 assert.equal(hash(S.render(d)),'ebfa87ca800c63a2b4941f203eaa682223c7bef1f4a9dd4bc14b13667dde58e7');
 const before=JSON.stringify(d),email=S.render(d,{email:true}),fragment=H.emailFragment(email);
 assert.equal((fragment.match(/class="letter-email-pair"/g)||[]).length,3);
 const headings=[...fragment.matchAll(/<h3 style="([^"]*)">([^<]*)<\/h3>/g)];
 for(const s of d.sections)for(const [i,c] of s.cards.entries()){
  const style=headings.find(([, ,title])=>title===S.escape(c.title))[1];
  const paired=['events','resources','dissertation'].includes(s.id)&&i<2;
  assert(style.includes(paired?'font:bold 20px/1.3 ':'font:bold 24px/1.25 '));
 }
 assert.equal((fragment.match(/font:bold 20px\/1.3 /g)||[]).length,6);
 assert.doesNotMatch(S.render(d),/20px\/1.3/);
 assert.equal((fragment.match(/<h3 /g)||[]).length,11);
 assert.equal((fragment.match(/<h2 /g)||[]).length,6);
 assert.match(fragment,/href="https:\/\/example.org\/guide.png"[^>]*><img src="https:\/\/example.org\/guide.png" alt="Guide checklist" width="272"/);
 let at=-1;for(const s of d.sections)for(const c of s.cards){const next=fragment.indexOf(S.escape(c.title),at+1);assert(next>at);at=next;assert.equal(fragment.split(S.escape(c.title)).length-1,1);}
 assert.equal(JSON.stringify(d),before);
});

test('email keeps images, quotes, leadership, disabled entries and unsupported sections out of paired groups',()=>{
 for(const extra of [{quote:'Full-width quotation'},{imageUrl:'https://example.org/image.png',imageAlt:'Unchanged image'},{localImage:'data:image/png;base64,AAAA'},{type:'leadership'}]){
  const d=S.createPublication('program-letter'),s=d.sections.find(s=>s.id==='resources');
  s.cards=[{...S.newCard('resource'),title:'First',body:'Text',...extra},{...S.newCard('resource'),title:'Second',body:'Text'}];
  assert.doesNotMatch(S.render(d,{email:true}),/class="letter-email-pair"/);
 }
 for(const id of ['chair','closing','updates','registration']){
  const d=S.createPublication('program-letter'),s=d.sections.find(s=>s.id===id);
  s.cards=['First','Second'].map(title=>({...S.newCard('resource'),title,body:'Text'}));
  assert.doesNotMatch(S.render(d,{email:true}),/class="letter-email-pair"/);
 }
 const d=S.createPublication('program-letter'),s=d.sections.find(s=>s.id==='events');
 s.cards=['One','Disabled','Two','Odd last'].map(title=>({...S.newCard('event'),title,body:'Text',enabled:title!=='Disabled'}));
 const email=S.render(d,{email:true});assert.equal((email.match(/class="letter-email-pair"/g)||[]).length,1);
 assert.doesNotMatch(email,/Disabled/);assert.match(email,/<\/div><!--\[if mso\]><\/td><\/tr><\/table><!\[endif\]-->[\s\S]*Odd last/);
});

test('civic resource email places the complete article before a linked proportional guide in hybrid columns',async()=>{
 const C=require('../standalone-copy'),P=require('../private-handoff'),d=S.createPublication('program-letter'),s=d.sections.find(s=>s.id==='updates');
 const url='https://example.org/voter%20guide.png?edition=fall&year=2026',alt='Voter checklist & QR code';
 const c={...S.newCard('resource'),title:'Reflection & the November Elections',body:'Opening paragraph.\n\nComplete closing paragraph.',date:'2026-11-03',author:'Program office',label:'Election reminder',destination:'hub',buttonLabel:'Read more',imageUrl:url,imageAlt:alt};
 s.cards=[c,{...S.newCard('spotlight'),title:'Student Spotlight',body:'Student story.',destination:'hub',buttonLabel:'Student link'}];
 const before=JSON.stringify(d),email=S.render(d,{email:true}),fragment=H.emailFragment(email),web=S.render(d);
 assert.equal((fragment.match(/class="letter-email-image"/g)||[]).length,1);
 assert.match(fragment,/max-width:348px/);assert.match(fragment,/max-width:284px/);
 assert.match(fragment,/width="348" valign="top"/);assert.match(fragment,/width="284" valign="top"/);
 assert.match(fragment,/width="272"[^>]*width:100%;max-width:272px;height:auto/);
 assert(fragment.includes(`<a href="${S.escape(url)}" style="display:block;text-decoration:none"><img src="${S.escape(url)}" alt="${S.escape(alt)}"`));
 for(const value of [c.title,c.date,c.author,c.label,...c.body.split('\n\n'),c.buttonLabel]){
  assert.equal(fragment.split(S.escape(value)).length-1,1);assert(fragment.indexOf(S.escape(value))<fragment.indexOf('<img '));
 }
 assert(fragment.indexOf('<img ')<fragment.indexOf('Student Spotlight'));
 assert.match(fragment,/font:bold 24px\/1.25/);assert.doesNotMatch(fragment,/@media|display:grid|display:flex|object-fit|overflow:hidden/);
 assert.doesNotMatch(web,/letter-email-image/);assert.match(web,/width="480"/);
 for(const page of [C.makePage(email,d),P.bundleFiles(d,{draft:true})['OPEN-TO-COPY.html'],P.makeFiles(d)['OPEN-TO-COPY.html']])assert(page.includes('<main id="publication">'+fragment+'</main>'));
 let parts;class Item{constructor(data){parts=data;}}
 await H.copyRendered(fragment,{clipboard:{write:async()=>{}},ClipboardItem:Item,Blob});
 assert.equal(await parts['text/html'].text(),fragment);
 assert.equal(await parts['text/plain'].text(),H.plainText(fragment));assert.equal(JSON.stringify(d),before);
 c.imageUrl='javascript:alert(1)';assert.doesNotMatch(S.render(d,{email:true}),/letter-email-image|href="javascript:/);
 c.imageUrl=url;c.type='spotlight';assert.doesNotMatch(S.render(d,{email:true}),/class="letter-email-image"/);
});

test('web supporting sections pair substantial entries without changing order or pairing images, quotes or leadership cards',()=>{
 for(const extra of [{title:'Long heading '.repeat(10)},{body:'Long text '.repeat(60)},{author:'Author '.repeat(20)},{buttonLabel:'Long link '.repeat(20)},{label:'Long metadata '.repeat(20)}]){
  const d=S.createPublication('program-letter'),s=d.sections.find(s=>s.id==='resources');
  s.cards=[{...S.newCard('resource'),title:'First',body:'Short',...extra},{...S.newCard('resource'),title:'Second',body:'Short'}];
  const web=S.render(d);
  assert.equal((web.match(/<div class="l-pair">/g)||[]).length,1);
  assert(web.indexOf(S.escape(s.cards[0].title))<web.indexOf('Second'));
 }
 for(const extra of [{quote:'Keep full width'},{imageUrl:'https://example.org/image.png',imageAlt:'Image'},{localImage:'data:image/png;base64,AAAA'},{type:'leadership'}]){
  const d=S.createPublication('program-letter'),s=d.sections.find(s=>s.id==='resources');
  s.cards=[{...S.newCard('resource'),title:'First',body:'Short',...extra},{...S.newCard('resource'),title:'Second',body:'Short'}];
  assert.doesNotMatch(S.render(d),/<div class="l-pair">/);
 }
 for(const id of ['chair','closing','updates','registration']){
  const d=S.createPublication('program-letter'),s=d.sections.find(s=>s.id===id);
  s.cards=['One','Two'].map(title=>({...S.newCard('resource'),title,body:'Short'}));
  assert.doesNotMatch(S.render(d),/<div class="l-pair">/);
 }
});

test('image-and-text web arrangements stack in email and leave long-form image cards full width',()=>{
 const d=S.createPublication('program-letter'),s=d.sections[1];
 s.cards=[{...S.newCard(),title:'Civic participation',body:'Checklist and guidance. '.repeat(70),imageUrl:'https://example.org/guide.png',imageAlt:'Checklist'},
 {...S.newCard('leadership'),title:'Chair update',body:'Long-form guidance.',imageUrl:'https://example.org/chair.png',imageAlt:'Chair'}];
 const web=S.render(d),email=S.render(d,{email:true});
 assert.equal((web.match(/<div class="l-image-layout">/g)||[]).length,1);
 assert.match(web,/grid-template-columns:480px minmax\(0,1fr\)/);
 assert.doesNotMatch(email,/l-image-layout/);
 assert(web.indexOf('Civic participation')<web.indexOf('<div class="l-image-layout">'));
});

test('web Chair body flows in paragraph order and trailing milestones note stays outside the paired entries',()=>{
 const d=S.createPublication('program-letter'),chair=d.sections[0],milestones=d.sections.find(s=>s.id==='dissertation');
 chair.cards=[{...S.newCard('leadership'),title:'Editorial heading',body:'Opening paragraph.\n\nMiddle paragraph.\n\nClosing signature.',author:'Chair author'}];
 milestones.cards=['Deadline entry','Time reminder','Closing note'].map(title=>({...S.newCard('announcement'),title,body:'A substantial update. '.repeat(30)}));
 const before=JSON.stringify(d),web=S.render(d),email=S.render(d,{email:true});
 assert.match(web,/class="l-editorial"><p/);
 assert.match(web,/column-count:2;column-gap:36px/);
 assert.match(web,/\.l-editorial p\{break-inside:avoid-column\}/);
 assert(web.indexOf('Opening paragraph.')<web.indexOf('Middle paragraph.'));
 assert(web.indexOf('Middle paragraph.')<web.indexOf('Closing signature.'));
 assert.match(web,/<div class="l-pair">[\s\S]*Deadline entry[\s\S]*Time reminder[\s\S]*<\/article><\/div><article[^>]*class="l-card l-closing">[\s\S]*Closing note/);
 assert.match(web,/\.l-section>\.l-closing\{padding-top:20px;border-top:2px solid/);
 assert.doesNotMatch(email,/l-editorial|column-count|l-closing|class="l-pair"|data-letter-card/);
 assert.match(email,/class="letter-email-pair"[\s\S]*Deadline entry[\s\S]*Time reminder[\s\S]*<\/div><!--\[if mso\]><\/td><\/tr><\/table><!\[endif\]-->[\s\S]*Closing note/);
 assert.equal(JSON.stringify(d),before);
});

test('web spotlight remains a full-width feature and accepts an existing image without adding content',()=>{
 const d=S.createPublication('program-letter'),s=d.sections[1],card={...S.newCard('spotlight'),title:'Student feature',body:'Student contribution.',imageUrl:'https://example.org/approved-photo.png',imageAlt:'Approved student photo'};
 s.cards=[card];const before=JSON.stringify(d),web=S.render(d);
 assert.match(web,/class="l-card l-image-card l-spotlight"/);
 assert.match(web,/src="https:\/\/example.org\/approved-photo.png" alt="Approved student photo"/);
 assert.doesNotMatch(web,/<div class="l-pair">|placeholder/i);
 assert.equal(JSON.stringify(d),before);
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

test('web Program Letter adds restrained teal, sage and cream treatments while keeping the 1,160px layout',()=>{
 const d=S.createPublication('program-letter'),sec=d.sections.find(s=>s.id==='updates');
 sec.cards=[{...S.newCard('spotlight'),title:'Student Spotlight',body:'Story.',imageUrl:'https://example.org/spot.jpg',imageAlt:'Student photo'},{...S.newCard('resource'),title:'Community Co-working & Café',body:'Open hours.',imageUrl:'https://example.org/flyer.png',imageAlt:'Café flyer',buttonLabel:'Details'}];
 const web=S.render(d);
 assert.match(web,/max-width:1160px/);
 for(const c of ['#7A9A82','#FAF6EC','#EEF3EE','#083133'])assert(web.includes(c),c);
 assert.match(web,/\.l-spotlight\{[^}]*background:#EEF3EE[^}]*border-left:4px solid #083133/);
 assert.match(web,/\.l-pair>\.l-card\{[^}]*background:#FAF6EC/);
 assert.match(web,/@media\(max-width:600px\)/);
 assert.equal((web.match(/class="l-image-layout"/g)||[]).length,2);
 assert.match(web,/class="l-card l-image-card l-spotlight"/);
 assert.match(web,/<img src="https:\/\/example.org\/flyer.png" alt="Café flyer"/);
 assert.match(web,/<img src="https:\/\/example.org\/spot.jpg" alt="Student photo"/);
 assert.doesNotMatch(S.render(d,{email:true}),/#EEF3EE|l-image-card/);
});

test('every image, editorial link and button stays with its own card in web, email, Gmail fragment and export',()=>{
 const spot='https://deploy-preview-8--eddcomstudio.netlify.app/email-images/preview/2026/10/in-the-spotlight-our-edd-students-21a343b5b6d84c61b3394b0a799815e2.jpg';
 const flyer='https://deploy-preview-8--eddcomstudio.netlify.app/email-images/preview/2026/10/october-24th-community-gathering-flyer-f-5e9286328bb84315b722211f8468ccee.png';
 const guide='https://example.org/voter-guide.png';
 const d=S.createPublication('program-letter');
 const url=id=>`https://example.org/${id}`;
 d.links=['elect','story','submit','zoom','lib','support','center','aid'].map(id=>({id,label:id,url:url(id),approved:true,source:'test'}));
 const card=(type,title,extra={})=>({...S.newCard(type),title,body:`${title} body text.`,approved:true,...extra});
 const plan={
  updates:[card('resource','Reflection & the November Elections',{imageUrl:guide,imageAlt:'Voter guide',buttonLabel:'Official election resources',destination:'elect'}),
   card('spotlight','In the Spotlight: Our EdD Students',{body:'Read the Student Spotlight today.',imageUrl:spot,imageAlt:'Spotlight photo',buttonLabel:'Submit Your EdD Story',destination:'submit',bodyLinks:[{start:0,end:'Read the Student Spotlight'.length,destination:'story'}]})],
  events:[card('event','Community Co-working & Café',{imageUrl:flyer,imageAlt:'Café flyer',buttonLabel:'Join the Café',destination:'zoom'}),
   card('event','Being Together: An EdD Community Evening')],
  resources:[card('resource','Library, Writing & Dissertation Support',{buttonLabel:'Library links',destination:'lib'}),card('resource','Student Support & EdD Community Center',{buttonLabel:'Student support links',destination:'support'})],
  registration:[card('announcement','Spring 2027 Planning',{buttonLabel:'Community Center',destination:'center'}),card('announcement','Financial Aid',{buttonLabel:'Aid details',destination:'aid'})]};
 for(const s of d.sections)s.cards=plan[s.id]||[];
 const cards=d.sections.flatMap(s=>s.cards).filter(Boolean),title=c=>`>${S.escape(c.title)}</h3>`;
 const owned=c=>[c.imageUrl,c.destination&&url(c.destination),...(c.bodyLinks||[]).map(r=>url(r.destination))].filter(Boolean);
 const all=['elect','story','submit','zoom','lib','support','center','aid'].map(url).concat(guide,spot,flyer);
 const web=S.render(d),email=S.render(d,{email:true}),fragment=H.emailFragment(email);
 for(const c of cards){
  const m=web.match(new RegExp(`<article data-letter-card="${c.id}"[\\s\\S]*?</article>`));assert(m,c.title);
  for(const u of all)assert.equal(m[0].includes(`"${u}"`),owned(c).includes(u),`web ${c.title} ${u}`);
 }
 for(const html of [email,fragment]){
  const at=cards.map(c=>html.indexOf(title(c)));
  cards.forEach((c,i)=>{const lo=i?at[i-1]:-1,hi=i<cards.length-1?at[i+1]:Infinity;
   for(const u of owned(c)){const p=html.indexOf(`"${u}"`);assert(p>lo&&p<hi,`email ${c.title} ${u}`);assert(u===c.imageUrl||p>at[i],`${c.title} link below text`);}});
 }
 const w=S.validate(d).filter(r=>r.message.includes('preview deploy'));assert.equal(w.length,2);
 assert.match(S.render(d,{email:true}),/Join the Café/);
 const cafe=S.validate(Object.assign(S.createPublication('program-letter'),{}));assert(cafe);
 d.sections.find(s=>s.id==='updates').cards[1].imageUrl='https://deploy-preview-8--eddcomstudio.netlify.app/other.jpg';
 assert(S.validate(d).some(r=>r.level==='warning'&&r.message.includes('preview deploy')));
});
