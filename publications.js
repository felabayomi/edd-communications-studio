(function(root){
'use strict';
const statuses=['Draft','Ready for Review','Approved','Distributed'];
const labels={'program-letter':'Program Letter',newsletter:'Newsletter'};
const newsletter=[['update','EdD Program Update'],['weeks','The Weeks Ahead'],['community','EdD Community'],['dissertation','Dissertation Journey'],['residency','Residency'],['cped','CPED'],['students','Student Spotlight'],['alumni','Alumni Connection'],['faculty','Faculty/Staff Spotlight'],['scholarship','Research & Public Scholarship'],['opportunities','Opportunities'],['resources','Resources & Support'],['cafe','Community Co-working & Café'],['connect','Stay Connected / Need Help']];
const letter=[['chair','Chair’s Message'],['updates','Important Updates'],['registration','Registration / Financial Aid'],['events','Upcoming Events'],['resources','Resources & Support'],['cafe','Community Co-working & Café'],['dissertation','Dissertation Journey'],['reminders','Reminders'],['closing','Closing Message']];
function assertType(type){if(!Object.hasOwn(labels,type))throw new Error('Choose Program Letter or Newsletter.');}
function label(data){return labels[data.publicationType||'newsletter'];}
function modules(type){assertType(type);return (type==='program-letter'?letter:newsletter).map(([id,title])=>({id,title}));}
function sections(type){return modules(type).map(m=>({...m,enabled:m.id!=='cped',cards:[]}));}
// Add metadata only. In particular, do not replace legacy sections, cards, links, or issue values.
function normalize(data,now=new Date().toISOString()){
  if(data.publicationType===undefined)data.publicationType='newsletter';
  assertType(data.publicationType);
  const defaults={title:data.publicationType==='program-letter'?'EdD Program Letter':'EdD Program Newsletter',edition:[data.issue.period,data.issue.year].filter(Boolean).join(' '),semester:data.issue.period,academicYear:data.issue.year,status:'Draft',audience:data.publicationType==='program-letter'?'Currently registered EdD students':'EdD students, faculty, staff, and alumni',createdAt:now,updatedAt:now};
  if(data.publication!==undefined&&(!data.publication||typeof data.publication!=='object'||Array.isArray(data.publication)))throw new Error('Invalid publication metadata.');
  data.publication={...defaults,...data.publication};
  for(const key of Object.keys(defaults))if(typeof data.publication[key]!=='string')throw new Error('Invalid publication field: '+key);
  if(!statuses.includes(data.publication.status))throw new Error('Invalid publication status.');
  for(const key of ['createdAt','updatedAt'])if(!Number.isFinite(Date.parse(data.publication[key])))throw new Error('Invalid publication timestamp: '+key);
  return data;
}
function exportBase(data){if(data.publicationType==='program-letter'){const date=(data.issue.issueDate||'undated').replace(/[^0-9-]/g,'')||'undated';return 'edd-program-letter-'+date;}const slug=`${data.issue.period}-${data.issue.year}`.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'untitled-edition';return 'edd-newsletter-'+slug;}
function requiresApproval(section,card){return ['students','alumni','faculty'].includes(section.id)||card.externalSubmission===true;}
const api={statuses,labels,label,modules,sections,normalize,exportBase,requiresApproval};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Publications=api;
})(typeof window!=='undefined'?window:this);
