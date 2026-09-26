(function(root){
'use strict';
// Input is our generated email document, never arbitrary user-authored HTML.
function emailFragment(documentHtml){
  const body=documentHtml.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  if(!body)throw new Error('The email document has no body.');
  const visible=body[1].replace(/<div style="display:none;font-size:1px;line-height:1px;max-height:0;overflow:hidden;mso-hide:all">[\s\S]*?<\/div>/,'');
  const style=documentHtml.match(/<body style="([^"]*)"/i)?.[1]||'';
  return `<div style="${style}">${visible}</div>`;
}
function plainText(fragment){
  return fragment.replace(/<!--[\s\S]*?-->/g,'')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,(_,url,label)=>`${label} (${url})`)
    .replace(/<img\b[^>]*alt="([^"]*)"[^>]*>/gi,(_,alt)=>alt?`[Image: ${alt}]`:'')
    .replace(/<br\s*\/?\s*>|<\/(?:p|h[1-6]|div|tr|blockquote)>/gi,'\n')
    .replace(/<[^>]*>/g,'')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g,(_,name)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'",nbsp:' '})[name])
    .replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
async function copyRendered(html,{clipboard,ClipboardItem,Blob}){
  const text=plainText(html);
  if(clipboard?.write&&ClipboardItem&&Blob){
    try{
      await clipboard.write([new ClipboardItem({
        'text/html':new Blob([html],{type:'text/html'}),
        'text/plain':new Blob([text],{type:'text/plain'})
      })]);
      return {mode:'rich',text};
    }catch{/* Unsupported MIME or permission denial: try the text-only path. */}
  }
  if(clipboard?.writeText){try{await clipboard.writeText(text);return{mode:'text',text};}catch{/* Offer manual text selection. */}}
  return{mode:'manual',text};
}
const api={emailFragment,plainText,copyRendered};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.EmailHandoff=api;
})(typeof window!=='undefined'?window:this);
