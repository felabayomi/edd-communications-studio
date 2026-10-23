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

test('Program Letter keeps the restored magazine bands, per-section palette and 720px letter in web and email',()=>{
 const d=S.createPublication('program-letter');d.issue.year='2026';d.issue.issueDate='2026-10-27';d.sections=['chair','updates','events','registration','resources','dissertation'].map(id=>d.sections.find(s=>s.id===id));
 for(const [i,s] of d.sections.entries())s.cards=Array.from({length:[1,2,2,1,2,3][i]},(_,j)=>({...S.newCard(i===0?'leadership':'resource'),id:`frozen-${i}-${j}`,title:`Heading ${i}-${j}`,body:`First paragraph ${i}-${j}.\n\nSecond paragraph.`,buttonLabel:'Visit destination',destination:'hub'}));
 d.sections[1].cards[0].imageUrl='https://example.org/guide.png';d.sections[1].cards[0].imageAlt='Guide checklist';d.sections[1].cards[1].type='spotlight';
 const before=JSON.stringify(d),web=S.render(d),email=S.render(d,{email:true});
 assert.equal(hash(web),'f528f0ad8320bb5b52ecc8edc7ef5bfc6835165cb2fb20a5a4a9d43a074c084b');
 assert.equal(hash(email),'7ce174be2565da791d51cbc02ac19a319508eb2ea9977f93a2a9ba17b252ba14');
 assert.match(web,/\.letter\{max-width:720px/);
 for(const [bg,accent] of [['#FFFCF7','#302A42'],['#F1F7F9','#183B52'],['#F4F8F4','#173B35'],['#FCF6ED','#7B4932'],['#F7F3F9','#49375C'],['#F2F7FA','#24465C']])for(const html of [web,email]){assert(html.includes(`background-color:${bg}`),bg);assert(html.includes(accent),accent);}
 assert.equal((web.match(/<section class="l-band/g)||[]).length,6);
 let at=-1;for(const s of d.sections)for(const c of s.cards){const next=H.emailFragment(email).indexOf(S.escape(c.title),at+1);assert(next>at);at=next;}
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
 for(const u of all)assert(web.includes(`"${u}"`),`web ${u}`);
 for(const html of [web,email,fragment]){
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
