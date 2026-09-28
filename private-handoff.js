(function(root){
'use strict';
const S=typeof module!=='undefined'&&module.exports?require('./core'):root.Studio;
const Copy=typeof module!=='undefined'&&module.exports?require('./standalone-copy'):root.StandaloneCopy;
function eligibility(data){const blockers=S.validate(data).filter(r=>r.level==='error');return {blockers,approved:['Approved','Distributed'].includes(data.publication.status),ready:blockers.length===0};}
function makeFiles(data,{distribution=false}={}){
 const check=eligibility(data),status=data.publication.status;
 if(distribution&&(!check.approved||!check.ready))throw new Error('Distribution handoff requires Approved or Distributed status AND no readiness blockers.');
 const suffix=status==='Approved'?'approved':status==='Distributed'?'distributed':'review';
 const date=(data.issue.issueDate||'undated').replace(/[^0-9-]/g,'')||'undated';
 const prefix='edd-'+(data.publicationType==='program-letter'?'program-letter':'newsletter')+'-'+date+'-'+suffix;
 const instructions=Copy.externalInstructions(data,prefix);
 const email=S.render(data,{email:true,draft:!distribution});
 return {[prefix+'.html']:S.render(data,{draft:!distribution}),[prefix+'-email.html']:email,'OPEN-TO-COPY.html':Copy.makePage(email,data),'HANDOFF.txt':instructions};
}
function view(data){const c=eligibility(data),esc=S.escape,status=data.publication.status;
 const archived=status==='Distributed',approved=status==='Approved';
 const label=archived?'Generate Archival Copy':approved?'Generate Distribution Package':'Generate Review Package';
 const description=archived?'Create a portable copy of this distributed edition for reference, recordkeeping, or authorized reuse.':approved?'Create the approved package for the authorized sender to review, copy into Gmail, and distribute through the established department process.':'Create a portable package for content and presentation review. This package is not approved for distribution.';
 const guidance=archived?'Distribution has been completed. A new distribution handoff is not normally required; generate a copy only when needed for reference or authorized reuse.':approved?'Give the package to the authorized sender. The sender opens OPEN-TO-COPY.html, uses Copy for Gmail, and checks formatting, links, dates, images, content, subject, and recipients before sending through the established department process.':'Send the review package through the established review process. Apply returned corrections and generate revised review packages as needed until the reviewer gives approval.';
 return `<section class="content-page"><p class="eyebrow">Editorial workflow</p><h1>Publication Handoff</h1><div class="banner"><strong>${esc(status)}</strong> · ${c.blockers.length} readiness blocker(s)<br>Planned distribution date: ${esc(data.issue.issueDate)}<br>Set or confirm during final review before distribution.</div><div class="export-grid"><article class="export-card wide"><h2>${label}</h2><p>${description}</p><button data-action="${c.approved?'handoff-distribution':'handoff-review'}" ${c.approved&&!c.ready?'disabled':''}>${label}</button><button data-view="readiness">Review readiness</button><p class="hint">Generating a package does not change editorial status or send email. Readiness checks remain required for approved and archival packages.</p></article><article class="export-card wide"><h2>Next steps</h2><p>${guidance}</p><p>Each package includes OPEN-TO-COPY.html, a browser-viewable publication, email-safe HTML, and HANDOFF.txt instructions. Share files through an approved private channel.</p><p class="hint">Gmail may modify formatting. Remote images require internet access.</p><button data-view="export">Open editor export / Copy for Gmail</button></article></div></section>`;
}
const api={eligibility,makeFiles,view};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PrivateHandoff=api;
})(typeof window!=='undefined'?window:this);
