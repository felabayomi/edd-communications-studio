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
