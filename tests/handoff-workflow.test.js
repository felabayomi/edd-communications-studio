const {test}=require('node:test'),assert=require('node:assert/strict'),S=require('../core'),H=require('../private-handoff');
const cases=[
 ['Ready for Review','Generate Review Package','Create a portable package for content and presentation review. This package is not approved for distribution.','handoff-review'],
 ['Approved','Generate Distribution Package','Create the approved package for the authorized sender to review, copy into Gmail, and distribute through the established department process.','handoff-distribution'],
 ['Distributed','Generate Archival Copy','Create a portable copy of this distributed edition for reference, recordkeeping, or authorized reuse.','handoff-distribution']
];
for(const type of ['newsletter','program-letter'])for(const [status,label,description,action] of cases){
 test(`${type} ${status}: shared handoff workflow explains the appropriate action`,()=>{
  const data=S.createPublication(type);data.publication.status=status;data.issue.issueDate='2031-05-01';
  data.sections[0].cards.push({...S.newCard(),title:'Program news',body:'Community update.'});
  const before=JSON.stringify(data),html=H.view(data);
  assert(html.includes(`data-action="${action}"`));assert(html.includes(`>${label}</button>`));assert(html.includes(description));
  for(const other of cases.filter(c=>c[0]!==status))assert(!html.includes(other[1]));
  assert(html.includes('Generating a package does not change editorial status or send email.'));
  if(status==='Distributed')assert(html.includes('A new distribution handoff is not normally required'));
  if(status==='Approved')assert(html.includes('checks formatting, links, dates, images, content, subject, and recipients'));
  if(status==='Ready for Review')assert(html.includes('generate revised review packages as needed until the reviewer gives approval'));
  H.makeFiles(data,{distribution:action==='handoff-distribution'});assert.equal(JSON.stringify(data),before);
  data.sections[0].cards=[];
  if(status!=='Ready for Review')assert.match(H.view(data),/data-action="handoff-distribution" disabled/);
 });
}
