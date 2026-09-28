(function(root){
'use strict';
const H=typeof module!=='undefined'&&module.exports?require('./handoff'):root.EmailHandoff;
// Embedded in the exported file. No imports, storage, network calls or editor state.
function initialize(){
 const publication=document.getElementById('publication'),status=document.getElementById('copy-status');
 const html=publication.innerHTML;
 function selectPublication(){const range=document.createRange();range.selectNodeContents(publication);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);}
 function legacyRichCopy(){
  const selection=window.getSelection(),saved=[];for(let i=0;i<selection.rangeCount;i++)saved.push(selection.getRangeAt(i).cloneRange());
  let handled=false;
  const onCopy=event=>{if(!event.clipboardData)return;event.clipboardData.setData('text/html',html);event.clipboardData.setData('text/plain',plainText(html));event.preventDefault();handled=true;};
  document.addEventListener('copy',onCopy);
  try{selectPublication();return document.execCommand('copy')&&handled;}catch{return false;}
  finally{document.removeEventListener('copy',onCopy);selection.removeAllRanges();for(const range of saved)selection.addRange(range);}
 }
 document.getElementById('select-publication').addEventListener('click',()=>{
  selectPublication();status.textContent='Only the publication is selected. Press Ctrl+C (Mac: Command+C), then paste into Gmail. Review the pasted formatting. If copying is blocked, try Chrome or Edge or contact the publication coordinator for a review copy.';
 });
 document.getElementById('copy-gmail').addEventListener('click',async()=>{
  const button=document.getElementById('copy-gmail');button.disabled=true;
  status.textContent='Copying publication…';
  try{
   let clipboard;try{clipboard=navigator.clipboard;}catch{}
   const Item=window.ClipboardItem||class{constructor(parts){this.parts=parts;}};
   const result=await copyRendered(html,{
    ClipboardItem:Item,Blob:window.Blob,
    clipboard:{
     write:async items=>{
      if(clipboard?.write&&window.ClipboardItem){try{await clipboard.write(items);return;}catch{}}
      if(!legacyRichCopy())throw new Error('Rich copying is unavailable.');
     },
     writeText:clipboard?.writeText?text=>clipboard.writeText(text):undefined
    }
   });
   status.textContent=result.mode==='rich'?'Formatted publication copied. Paste into an unsent Antioch Gmail draft and review the result. Follow the publication instructions above.':result.mode==='text'?'Plain text copied; formatting was not preserved. For formatted copying, use Select publication, then Ctrl+C (Mac: Command+C). Review the result in Gmail.':'Automatic copying is blocked by this browser. Choose Select publication, then press Ctrl+C (Mac: Command+C). Paste into Gmail and review. Try Chrome or Edge if needed.';
  }catch{status.textContent='Copying is unavailable. Choose Select publication and press Ctrl+C (Mac: Command+C), or contact the publication coordinator for a review copy.';}
  finally{button.disabled=false;}
 });
}
function externalLanguage(data={}){
 const publication=data.publication||{},issue=data.issue||{},title=publication.title||'Publication',status=publication.status||'Draft';
 const metadata=[`Publication: ${title}`,`Edition: ${publication.edition||''}`,`Status: ${status}`,`Planned distribution date: ${issue.issueDate||'Not specified'}`];
 const sections=[];let heading,notice='';
 if(status==='Approved'){
  heading=title.toUpperCase()+' — APPROVED FOR DISTRIBUTION';
  sections.push(['', 'This is the approved publication prepared for distribution.'],['GMAIL DISTRIBUTION',
   '1. Extract the ZIP.', '2. Open OPEN-TO-COPY.html in Chrome or Edge.', '3. Review the complete publication and click Copy for Gmail.',
   '4. Open Antioch Gmail, create a new message with plain text mode off, and paste into the message body.',
   '5. Check formatting, links, dates, images, content, subject, and recipients before sending.',
   "6. Send through the department’s established distribution process.",
   'Gmail may make minor formatting changes. Review the pasted message before sending.']);
 }else if(status==='Distributed'){
  heading=title.toUpperCase()+' — DISTRIBUTED COPY';
  const date=publication.distributionDate||publication.distributedAt||issue.distributionDate;if(date)metadata.push('Distribution date: '+date);
  sections.push(['', 'This represents a distributed edition and is provided for reference, recordkeeping, or authorized reuse.',
   'This package is not a new authorization to distribute.',
   'Reconfirm dates, links, events, announcements, and other time-sensitive information before any authorized reuse.'],
   ['REFERENCE / AUTHORIZED REUSE','Extract the ZIP and open OPEN-TO-COPY.html in Chrome or Edge to view the publication.',
   'If reuse has been authorized through the established process, Copy for Gmail can be used to prepare an unsent Antioch Gmail draft for review.',
   'Recheck formatting, links, dates, images, content, subject, and recipients. Gmail may make minor formatting changes.']);
 }else{
  heading=title.toUpperCase()+(status==='Ready for Review'?' — READY FOR REVIEW':' — DRAFT FOR REVIEW');
  notice='NOT APPROVED FOR DISTRIBUTION';
  sections.push(['','This package is provided for content and presentation review before final approval.'],
   ['PLEASE CHECK','Names and titles; dates and times; program information; announcements; event/resource links; wording/content; formatting/presentation.'],
   ['REVIEW INSTRUCTIONS','1. Extract the ZIP.','2. Open OPEN-TO-COPY.html in Chrome or Edge.','3. Review the complete publication.',
   '4. Return corrections, additions, or approval through the established review process.'],
   ['OPTIONAL — GMAIL PRESENTATION REVIEW','Click Copy for Gmail and paste into an unsent Antioch Gmail draft with plain text mode off to review how the publication will appear.',
   'Gmail may make minor formatting changes. Review the pasted result.','Do not distribute this review version.']);
 }
 sections.push(['COPYING HELP','If automatic copying is blocked, choose Select publication and press Ctrl+C (Mac: Command+C), then paste into an unsent draft. If only plain text was copied, formatting will not be preserved.',
  'Remote images and links may need internet access.']);
 return {heading,notice,metadata,sections};
}
function externalInstructions(data,prefix){
 const text=externalLanguage(data);
 return [text.heading,...(text.notice?[text.notice]:[]),'',...text.metadata,...text.sections.flatMap(([heading,...lines])=>['',...(heading?[heading]:[]),...lines]),'',
  'FILES INCLUDED','OPEN-TO-COPY.html','Recommended file for reviewing the formatted publication and copying it into Gmail.',
  prefix+'.html','Browser-viewable version.',prefix+'-email.html','Email-safe HTML version for approved systems that accept HTML.',
  'HANDOFF.txt','Instructions for this publication package.'].join('\n');
}
function makePage(emailDocument,data){
 const fragment=H.emailFragment(emailDocument);
 const text=externalLanguage(data),escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const introduction=`<h1>${escape(text.heading)}</h1>${text.notice?'<p><strong>'+escape(text.notice)+'</strong></p>':''}<p>${text.metadata.map(escape).join('<br>')}</p>${text.sections.map(([heading,...lines])=>`${heading?'<h2>'+escape(heading)+'</h2>':''}${lines.map(line=>'<p>'+escape(line)+'</p>').join('')}`).join('')}`;
 // Only trusted implementation functions go into the script; publication text stays in escaped renderer HTML.
 const script=[H.plainText.toString(),H.copyRendered.toString(),'('+initialize.toString()+')();'].join('\n');
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>Copy publication for Gmail</title><style>body{margin:0;background:#f0f4f6;color:#083133;font:16px/1.6 Arial,sans-serif}.handoff-controls{max-width:880px;margin:24px auto;padding:24px;background:white}button{padding:12px 18px;margin:6px 10px 6px 0;font:700 16px Arial;cursor:pointer}#copy-gmail{background:#083133;color:white;border:2px solid #083133}#copy-status{min-height:2em}#publication{margin:0 auto}a{overflow-wrap:anywhere}</style></head><body><section class="handoff-controls" aria-label="Gmail handoff instructions">${introduction}<button id="copy-gmail" type="button">Copy for Gmail</button><button id="select-publication" type="button">Select publication</button><p id="copy-status" role="status" aria-live="polite">Choose Copy for Gmail after reviewing the publication. If copying is blocked, use Select publication and copy with your keyboard.</p><p>Only the publication below is copied. Review the pasted result before any authorized use.</p></section><main id="publication">${fragment}</main><script>${script}</script></body></html>`;
}
const api={makePage,initialize,externalLanguage,externalInstructions};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StandaloneCopy=api;
})(typeof window!=='undefined'?window:this);
