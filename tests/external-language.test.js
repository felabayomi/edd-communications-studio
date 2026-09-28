const {test}=require('node:test'),assert=require('node:assert/strict'),S=require('../core'),H=require('../private-handoff');
for(const type of ['program-letter','newsletter'])for(const status of ['Ready for Review','Approved','Distributed']){
 test(`${type} ${status}: professional status-specific instructions in both external materials`,()=>{
  const d=S.createPublication(type);d.publication.title=type==='newsletter'?'EdD Community News':'EdD Program Office Letter';d.publication.edition='Autumn edition';d.publication.status=status;d.issue.issueDate='2030-09-15';
  d.sections[0].cards.push({...S.newCard(),title:'Welcome',body:'Program information.'});
  const before=JSON.stringify(d),files=H.makeFiles(d),txt=files['HANDOFF.txt'],page=files['OPEN-TO-COPY.html'];
  const controls=page.match(/<section class="handoff-controls"[\s\S]*?<\/section>/)[0];
  const label={'Ready for Review':'READY FOR REVIEW',Approved:'APPROVED FOR DISTRIBUTION',Distributed:'DISTRIBUTED COPY'}[status];
  for(const text of [txt,controls]){
   assert(text.includes(d.publication.title.toUpperCase()+' — '+label));assert(text.includes('Autumn edition'));assert(text.includes(status));assert(text.includes('2030-09-15'));
   assert.doesNotMatch(text,/\bStudio\b|editor workspace|database access|\bAPIs?\b|Content JSON|link registries|form notes|credentials|editor controls|internal architecture/i);
   if(status==='Ready for Review'){
    for(const phrase of ['NOT APPROVED FOR DISTRIBUTION','content and presentation review','Names and titles','dates and times','program information','announcements','event/resource links','wording/content','formatting/presentation','Return corrections, additions, or approval','OPTIONAL','unsent Antioch Gmail draft','Do not distribute this review version.'])assert(text.includes(phrase),phrase);
    assert(!text.includes('GMAIL DISTRIBUTION'));
   }else if(status==='Approved'){
    assert(text.includes('GMAIL DISTRIBUTION'));assert(text.includes('formatting, links, dates, images, content, subject, and recipients'));assert(text.includes('Gmail may make minor formatting changes'));assert(text.includes('Review the pasted message before sending'));
   }else{
    assert(text.includes('reference, recordkeeping, or authorized reuse'));assert(text.includes('not a new authorization to distribute'));assert(text.includes('Reconfirm dates, links, events, announcements'));assert(!text.includes('GMAIL DISTRIBUTION'));assert(!text.includes('APPROVED FOR DISTRIBUTION'));
   }
  }
  for(const name of Object.keys(files))assert(txt.includes(name));assert(txt.includes('Browser-viewable version.'));assert(txt.includes('Email-safe HTML version for approved systems that accept HTML.'));
  assert.equal(JSON.stringify(d),before);
 });
}
test('distributed copy shows explicit distribution metadata and never substitutes creation/update timestamps',()=>{
 const d=S.createPublication('newsletter');d.publication.status='Distributed';d.publication.createdAt='2020-01-01T00:00:00.000Z';d.publication.updatedAt='2021-01-01T00:00:00.000Z';
 let files=H.makeFiles(d);assert(!files['HANDOFF.txt'].includes('Distribution date:'));assert(!files['HANDOFF.txt'].includes('2020-01-01'));
 d.publication.distributionDate='2030-09-20';files=H.makeFiles(d);assert(files['HANDOFF.txt'].includes('Distribution date: 2030-09-20'));assert(files['OPEN-TO-COPY.html'].includes('Distribution date: 2030-09-20'));
});
