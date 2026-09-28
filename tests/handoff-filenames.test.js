const {test}=require('node:test'),assert=require('node:assert/strict'),S=require('../core'),H=require('../private-handoff');

for(const type of ['program-letter','newsletter'])for(const [status,suffix] of [['Ready for Review','review'],['Approved','approved'],['Distributed','distributed']]){
 test(`${type} ${status}: handoff HTML filenames follow status and planned date`,()=>{
  const data=S.createPublication(type);
  data.publication.status=status;
  data.issue.issueDate='2031-05-01';
  data.sections[0].cards.push({...S.newCard(),title:'Program news',body:'A message for our community.'});
  const before=JSON.stringify(data),prefix=`edd-${type}-2031-05-01-${suffix}`;
  for(const distribution of status==='Ready for Review'?[false]:[false,true]){
   const files=H.makeFiles(data,{distribution});
   assert.deepEqual(Object.keys(files),[`${prefix}.html`,`${prefix}-email.html`,'OPEN-TO-COPY.html','HANDOFF.txt']);
   for(const name of Object.keys(files))assert(files['HANDOFF.txt'].includes(name),`Instructions must list ${name}`);
   assert.equal(JSON.stringify(data),before);
  }
 });
}

test('undated Draft retains review filenames without substituting database timestamps',()=>{
 const data=S.createPublication('newsletter');data.issue.issueDate='';
 data.publication.createdAt='2031-05-01';data.publication.updatedAt='2031-05-02';
 const files=H.makeFiles(data);
 assert(Object.hasOwn(files,'edd-newsletter-undated-review.html'));
 assert(Object.hasOwn(files,'edd-newsletter-undated-review-email.html'));
});
