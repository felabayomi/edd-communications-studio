const {test}=require('node:test'),assert=require('node:assert/strict');
const S=require('../core'),H=require('../handoff');
const marker='DRAFT PREVIEW · NOT FOR DISTRIBUTION';

for(const type of ['newsletter','program-letter']){
 for(const status of ['Draft','Approved','Distributed']){
  test(`${type}: ${status} marker is consistent in previews, exports, and Gmail copy`,async()=>{
   const data=S.createPublication(type);
   data.publication.status=status;
   data.sections[0].cards.push({...S.newCard(),title:'Community update',body:'A message for our community.'});
   const check=html=>assert.equal(html.includes(marker),status==='Draft');
   // Exercise both live-preview and export flags, independent of editorial status.
   for(const draft of [false,true]){
    check(S.render(data,{draft}));
    const email=S.render(data,{email:true,draft});
    check(email);
    let written;
    class Item{constructor(parts){this.parts=parts;}}
    const result=await H.copyRendered(H.emailFragment(email),{
     clipboard:{write:async items=>{written=items;}},ClipboardItem:Item,Blob
    });
    assert.equal(result.mode,'rich');
    check(await written[0].parts['text/html'].text());
    check(await written[0].parts['text/plain'].text());
    for(const [name,content] of Object.entries(S.makeFiles(data,{draft}))){
     if(name.endsWith('.html'))check(content);
    }
   }
   // Removing content introduces a blocker even for Approved and Distributed.
   data.sections[0].cards=[];
   assert(S.validate(data).some(result=>result.level==='error'));
   assert.throws(()=>S.makeFiles(data),/readiness blockers/);
   check(S.render(data,{email:true,draft:true}));
  });
 }
 test(`${type}: Ready for Review retains the existing preview-flag behavior`,()=>{
  const data=S.createPublication(type);data.publication.status='Ready for Review';
  for(const email of [false,true])for(const draft of [false,true]){
   assert.equal(S.render(data,{email,draft}).includes(marker),draft);
  }
 });
}
