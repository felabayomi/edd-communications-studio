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
  selectPublication();status.textContent='Only the publication is selected. Press Ctrl+C (Mac: Command+C), then paste into Gmail. Review the pasted formatting. If copying is blocked, try Chrome or Edge or ask the editor for a review copy.';
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
   status.textContent=result.mode==='rich'?'Formatted publication copied. Open your Gmail, create a message, paste, and review the result.':result.mode==='text'?'Plain text copied; formatting was not preserved. For formatted copying, use Select publication, then Ctrl+C (Mac: Command+C). Review the result in Gmail.':'Automatic copying is blocked by this browser. Choose Select publication, then press Ctrl+C (Mac: Command+C). Paste into Gmail and review. Try Chrome or Edge if needed.';
  }catch{status.textContent='Copying is unavailable. Choose Select publication and press Ctrl+C (Mac: Command+C), or ask the editor for a review copy.';}
  finally{button.disabled=false;}
 });
}
function makePage(emailDocument){
 const fragment=H.emailFragment(emailDocument);
 // Only trusted implementation functions go into the script; publication text stays in escaped renderer HTML.
 const script=[H.plainText.toString(),H.copyRendered.toString(),'('+initialize.toString()+')();'].join('\n');
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>Copy publication for Gmail</title><style>body{margin:0;background:#f0f4f6;color:#083133;font:16px/1.6 Arial,sans-serif}.handoff-controls{max-width:880px;margin:24px auto;padding:24px;background:white}button{padding:12px 18px;margin:6px 10px 6px 0;font:700 16px Arial;cursor:pointer}#copy-gmail{background:#083133;color:white;border:2px solid #083133}#copy-status{min-height:2em}#publication{margin:0 auto}a{overflow-wrap:anywhere}</style></head><body><section class="handoff-controls" aria-label="Gmail handoff instructions"><h1>Review and copy for Gmail</h1><p>Review the publication below, then choose <strong>Copy for Gmail</strong>. Open your own Antioch Gmail, create a message and paste into its body with plain text mode off.</p><p>Check formatting, links, dates, images and content before adding the subject and recipients through your department’s established process. Send only if approved for distribution. Gmail may modify formatting.</p><button id="copy-gmail" type="button">Copy for Gmail</button><button id="select-publication" type="button">Select publication</button><p id="copy-status" role="status" aria-live="polite">Local-file clipboard permissions vary. If automatic copying is blocked, select the publication and copy it with your keyboard.</p><p>Copying works without a server or sign-in. Remote images and links may need internet access. Only the publication below is copied; these instructions and buttons are excluded.</p></section><main id="publication">${fragment}</main><script>${script}</script></body></html>`;
}
const api={makePage,initialize};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.StandaloneCopy=api;
})(typeof window!=='undefined'?window:this);
