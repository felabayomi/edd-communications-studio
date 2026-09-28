const {test}=require('node:test'),assert=require('node:assert/strict'),S=require('../core'),P=require('../publications'),H=require('../private-handoff'),G=require('../handoff');
function ready(type){const d=S.createPublication(type);d.issue.issueDate='2031-05-01';d.sections[0].cards.push({...S.newCard(),title:'Program news',body:'A message for our community.'});return d;}
for(const type of ['newsletter','program-letter']){
 test(`${type}: handoff contains only publication and copy controls without editor registries or metadata`,()=>{
  const d=ready(type);d.links.push({id:'private-record',label:'PRIVATE_LINK_RECORD',url:'https://example.org/internal',approved:true,source:'PRIVATE_FORM_NOTES'});
  d.sections[1].cards.push({...S.newCard(),enabled:false,title:'PRIVATE_DISABLED_CARD',body:'Not published.'});
  const before=JSON.stringify(d),files=H.makeFiles(d);assert.equal(Object.keys(files).length,4);assert(Object.hasOwn(files,'HANDOFF.txt'));assert(Object.keys(files).every(k=>k.endsWith('.html')||k==='HANDOFF.txt'));
  for(const [name,value] of Object.entries(files)){assert.doesNotMatch(value,/PRIVATE_LINK_RECORD|PRIVATE_FORM_NOTES|PRIVATE_DISABLED_CARD|DATABASE_URL|\.netlify\/functions|token=/);if(name.endsWith('.html')&&name!=='OPEN-TO-COPY.html')assert.doesNotMatch(value,/<script|<form|contenteditable|<iframe/i);}
  assert.equal(JSON.stringify(d),before);assert.match(files['HANDOFF.txt'],/REVIEW ONLY/);assert.match(files['HANDOFF.txt'],/2031-05-01/);
 });
 test(`${type}: every status keeps readiness independent and handoff never marks Distributed`,()=>{
  for(const status of P.statuses){const d=ready(type);d.publication.status=status;const before=JSON.stringify(d);
   if(['Approved','Distributed'].includes(status))assert.equal(Object.keys(H.makeFiles(d,{distribution:true})).length,4);else assert.throws(()=>H.makeFiles(d,{distribution:true}),/requires Approved/);
   assert.equal(JSON.stringify(d),before);
   d.sections[0].cards[0].imageUrl='https://example.org/image.png';d.sections[0].cards[0].imageAlt='';
   assert.throws(()=>H.makeFiles(d,{distribution:true}),/readiness blockers/);assert.equal(Object.keys(H.makeFiles(d)).length,4);
  }
 });
 test(`${type}: review status and Draft remain visible in rendered HTML and Gmail fragments`,()=>{
  for(const status of P.statuses){const d=ready(type);d.publication.status=status;const files=H.makeFiles(d);
   for(const [name,html] of Object.entries(files).filter(([name])=>name.endsWith('.html'))){
    assert.equal(html.includes('DRAFT PREVIEW · NOT FOR DISTRIBUTION'),status==='Draft');assert.equal(html.includes('READY FOR REVIEW · NOT APPROVED FOR DISTRIBUTION'),status==='Ready for Review');
    if(name.endsWith('-email.html'))assert.equal(G.emailFragment(html).includes('READY FOR REVIEW'),status==='Ready for Review');
   }
  }
 });
}
test('distribution readiness still rejects unsafe/unapproved links, missing consent and content',()=>{
 for(const mutate of [d=>{d.sections[0].cards=[];},d=>{const c=d.sections[0].cards[0];c.destination='calendar';c.buttonLabel='View calendar';},d=>{const c=d.sections[0].cards[0];c.externalSubmission=true;c.approved=false;},d=>{const c=d.sections[0].cards[0];c.destination='unsafe';c.buttonLabel='View information';d.links.push({id:'unsafe',label:'Unsafe',url:'javascript:alert(1)',approved:true});}]){
  const d=ready('newsletter');d.publication.status='Approved';mutate(d);assert.throws(()=>H.makeFiles(d,{distribution:true}),/readiness blockers/);
 }
});
