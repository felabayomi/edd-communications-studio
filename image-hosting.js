(function(root){
'use strict';
// Browser client for Studio image hosting. Credentials stay in the Identity session cookie; no storage keys are used here.
const API='/api/email-images',PATH='/email-images/',TYPES=['image/png','image/jpeg','image/webp'],MAX_BYTES=2*1024*1024;
function hostedKey(url,origin){try{const u=new URL(url);return u.origin===origin&&u.pathname.startsWith(PATH)?decodeURIComponent(u.pathname.slice(PATH.length)):'';}catch{return '';}}
function dataUrlToBlob(dataUrl,BlobType=root.Blob){
 const match=/^data:(image\/[a-z]+);base64,([a-zA-Z0-9+/=]+)$/.exec(dataUrl||'');
 if(!match)throw new Error('This local image cannot be hosted. Choose the file again.');
 const binary=atob(match[2]),bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 return new BlobType([bytes],{type:match[1]});
}
function validate(blob){
 if(!TYPES.includes(blob.type))throw new Error('Only PNG, JPEG, and WebP images can be hosted for email. GIFs stay local previews; use a hosted HTTPS URL instead.');
 if(blob.size>MAX_BYTES)throw new Error('Hosted images must be 2 MB or smaller.');
 if(!blob.size)throw new Error('The image file is empty.');
}
function sessionToken(cookie){const match=/(?:^|;\s*)nf_jwt=([^;]+)/.exec(cookie||'');return match?decodeURIComponent(match[1]):'';}
const statusMessage=(status,payload)=>payload?.error||(status===401?'Sign in to host images.':status===413?'Hosted images must be 2 MB or smaller.':'Image hosting is unavailable. Your local preview image is kept.');
function upload(blob,{name='',onProgress=()=>{},XHR=root.XMLHttpRequest,cookie=()=>root.document?.cookie||'',timeout=60000}={}){
 return new Promise((resolve,reject)=>{
  try{validate(blob);}catch(error){reject(error);return;}
  const xhr=new XHR(),token=sessionToken(cookie());
  xhr.open('POST',API);
  xhr.timeout=timeout;
  xhr.setRequestHeader('Content-Type',blob.type);
  xhr.setRequestHeader('X-Image-Name',encodeURIComponent(String(name).slice(0,120)));
  if(token)xhr.setRequestHeader('Authorization','Bearer '+token);
  if(xhr.upload)xhr.upload.onprogress=e=>{if(e.lengthComputable&&e.total)onProgress(Math.min(1,e.loaded/e.total));};
  xhr.onload=()=>{let payload=null;try{payload=JSON.parse(xhr.responseText);}catch{}
   if(xhr.status===201&&payload?.image?.url)resolve(payload.image);else reject(Object.assign(new Error(statusMessage(xhr.status,payload)),{status:xhr.status,code:payload?.code}));};
  xhr.onerror=()=>reject(new Error('The upload could not reach the Studio. Check your connection; your local preview image is kept.'));
  xhr.ontimeout=()=>reject(new Error('The upload timed out. Your local preview image is kept; try again.'));
  xhr.send(blob);
 });
}
// Confirms that the hosted URL actually loads as an image before it replaces the local preview.
function verify(url,{ImageType=root.Image,timeout=20000}={}){
 return new Promise((resolve,reject)=>{
  const image=new ImageType(),timer=setTimeout(()=>fail(),timeout);
  function fail(){clearTimeout(timer);image.onload=image.onerror=null;reject(new Error('The image uploaded, but its hosted URL could not be loaded. Your local preview image is kept; try again.'));}
  image.onload=()=>{clearTimeout(timer);resolve({width:image.naturalWidth,height:image.naturalHeight});};
  image.onerror=fail;
  image.src=url;
 });
}
async function remove(key,{fetcher=root.fetch?.bind(root),cookie=()=>root.document?.cookie||''}={}){
 const token=sessionToken(cookie());let response,payload=null;
 try{response=await fetcher(API+'?key='+encodeURIComponent(key),{method:'DELETE',cache:'no-store',headers:token?{Authorization:'Bearer '+token}:{}});}
 catch{throw new Error('Image hosting is unavailable. Nothing was deleted.');}
 try{payload=await response.json();}catch{}
 if(!response.ok)throw new Error(payload?.error||'The hosted image could not be deleted.');
 return payload;
}
const api={API,PATH,TYPES,MAX_BYTES,hostedKey,dataUrlToBlob,validate,sessionToken,upload,verify,remove};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ImageHosting=api;
})(typeof window!=="undefined"?window:globalThis);
