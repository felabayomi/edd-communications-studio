(function(root){
'use strict';
const S=typeof module!=='undefined'&&module.exports?require('./core'):root.Studio;
const Copy=typeof module!=='undefined'&&module.exports?require('./standalone-copy'):root.StandaloneCopy;
function eligibility(data){const blockers=S.validate(data).filter(r=>r.level==='error');return {blockers,approved:['Approved','Distributed'].includes(data.publication.status),ready:blockers.length===0};}
function makeFiles(data,{distribution=false}={}){
 const check=eligibility(data),status=data.publication.status;
 if(distribution&&(!check.approved||!check.ready))throw new Error('Distribution handoff requires Approved or Distributed status AND no readiness blockers.');
 const prefix=S.exportBase(data)+(distribution?'-distribution':'-review');
 const instructions=[distribution?'DISTRIBUTION HANDOFF':'REVIEW ONLY — NOT AUTHORIZATION TO DISTRIBUTE',
  `Publication: ${data.publication.title}`,`Edition: ${data.publication.edition}`,`Editorial status: ${status}`,`Planned distribution date: ${data.issue.issueDate}`,`Readiness blockers: ${check.blockers.length}`,
  '', 'This is a portable artifact, not access to the editor workspace. No Studio account or database access is needed.',
  `${prefix}.html: open locally in a browser for visual review.`,`${prefix}-email.html: email-safe source for an institutionally approved distribution platform that accepts HTML.`,
  'Remote images and publication links still require internet access. Local preview images may appear only in the web version. HTML attachments may be blocked by institutional mail systems.',
  '', 'GMAIL DISTRIBUTION',
  '1. Extract this ZIP file.',
  '2. Open OPEN-TO-COPY.html in Chrome or Edge.',
  '3. Review the publication carefully, including its editorial warning if present.',
  '4. Click Copy for Gmail.',
  '5. Open your own Antioch Gmail and create a new message with plain text mode off.',
  '6. Paste into the message body.',
  '7. Confirm formatting, links, dates, images, and content.',
  "8. Add recipients/subject using the department's established process.",
  '9. Send only if the publication has been approved for distribution.',
  'If automatic rich copying is blocked, choose Select publication and press Ctrl+C (Mac: Command+C), then paste. A plain-text fallback is identified explicitly; it does not preserve formatting. Try another supported browser or ask the editor for a review copy if needed.',
  'OPEN-TO-COPY.html contains the publication and copy functionality; it needs no server, account, or API. Remote images and links can still require internet access. The other HTML files are provided for review/archive/reference or an approved HTML-capable distribution platform.',
  'Do not paste raw HTML source into Gmail Compose. The copy page copies rendered content; Gmail may modify formatting, so the pasted result must be reviewed.',
  'The editor can use the existing Copy for Gmail feature, paste into their own Gmail Compose with plain text mode off, review the result, and manually send a review copy. Gmail may change formatting.',
  'Use the institutionally approved distribution workflow. Send these files only through an approved private channel to an authorized reviewer/distributor. These files are not encrypted or access-controlled after download.',
  'Feedback and approval occur outside the Studio. The editor records status manually; generating this bundle does not change status or send email.',
  'This package deliberately excludes Content JSON, unused link registries, form notes, credentials, and editor controls.'
 ].join('\n');
 const email=S.render(data,{email:true,draft:!distribution});
 return {[prefix+'.html']:S.render(data,{draft:!distribution}),[prefix+'-email.html']:email,'OPEN-TO-COPY.html':Copy.makePage(email),'HANDOFF.txt':instructions};
}
function view(data){const c=eligibility(data),esc=S.escape;return `<section class="content-page"><p class="eyebrow">Private editor workflow</p><h1>Review / Distribution Handoff</h1><p>Prepare files for an authorized reviewer or distributor without granting Studio access.</p><div class="banner"><strong>${esc(data.publication.status)}</strong> · ${c.blockers.length} readiness blocker(s)<br>Planned distribution date: ${esc(data.issue.issueDate)}<br>Set or confirm during final review before distribution.</div><div class="export-grid"><article class="export-card"><h2>External review package</h2><p>A ZIP with OPEN-TO-COPY.html for external Gmail copying, a standalone web preview, email-safe HTML, and handoff instructions. It contains the rendered publication, not the editable edition or form registry.</p><button data-action="handoff-review">Download review package</button></article><article class="export-card"><h2>Authorized distribution package</h2><p>Requires Approved or Distributed status and passing readiness checks. Generating a package does not mark the edition Distributed.</p><button data-action="handoff-distribution" ${!c.approved||!c.ready?'disabled':''}>Download distribution package</button><button data-view="readiness">Review readiness</button></article><article class="export-card wide"><h2>Reviewing and distributing</h2><p>Use the standalone HTML for visual review. Use email-safe HTML with an institutionally approved platform that accepts HTML source. Share files yourself through an approved private channel; files are not access-controlled after download.</p><p>Gmail does not render raw source pasted into Compose. An external distributor can open OPEN-TO-COPY.html locally and use Copy for Gmail. If browser permissions block copying, the page provides selection instructions. Gmail may modify formatting.</p><p>The editor can continue using Copy for Gmail to paste a formatted review copy into their own Gmail and send it manually. No recipient addresses are stored, and no messages are sent here.</p><button data-view="export">Open editor export / Copy for Gmail</button><p class="hint">Remote images require internet access; institutional mail systems may block HTML attachments. No public links, review accounts, tokenized sharing, or reviewer API access are created.</p></article></div></section>`;}
const api={eligibility,makeFiles,view};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PrivateHandoff=api;
})(typeof window!=='undefined'?window:this);
