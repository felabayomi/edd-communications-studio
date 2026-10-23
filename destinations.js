(function(root){
'use strict';
const S=typeof module!=='undefined'&&module.exports?require('./core'):root.Studio;
const P=typeof module!=='undefined'&&module.exports?require('./publications'):root.Publications;
const categories=['Program Support','Community Center','Events/Zoom','Library & Research','Forms','University Resources','Other'];
// Offline starting choices only. Successful registry reads replace these, including an empty registry.
const seeds=[
 ['support','Student Support','https://sites.google.com/antioch.edu/eddcommunitycenter/support','Program Support'],
 ['hub','EdD Community Center','https://sites.google.com/antioch.edu/eddcommunitycenter/edd-program-info','Community Center'],
 ['faq','EdD Community Center FAQ','https://sites.google.com/antioch.edu/eddcommunitycenter/edd-program-info/faqs-page','Community Center'],
 ['cafe','Community Co-working & Café Zoom','https://antioch.zoom.us/j/94176225683','Events/Zoom'],
 ['journey','EdD Dissertation Journey Zoom','https://antioch.zoom.us/j/93810024463','Events/Zoom'],
 ['library','Antioch University Library','https://www.antioch.edu/departments/library/','Library & Research'],
 ['library-workshops','Upcoming Library Workshops','https://libcal.antioch.edu/calendar/aulibraryevents','Library & Research']
].map(([legacy_id,name,url,category],i)=>({id:`a0000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,legacy_id,name,url,category,active:true,version:1}));
function validate(input){
 if(!input||typeof input!=='object'||typeof input.name!=='string'||!input.name.trim()||input.name.trim().length>200)throw new Error('Enter a display name of 1–200 characters.');
 if(typeof input.url!=='string'||input.url.length>2048||!/^https:\/\//i.test(input.url)||!S.https(input.url))throw new Error('Enter a valid https:// URL without credentials or spaces.');
 if(input.category!==undefined&&(typeof input.category!=='string'||input.category.length>100))throw new Error('Category must be text of at most 100 characters.');
 if(typeof input.active!=='boolean')throw new Error('Choose an active or inactive state.');
 return {name:input.name.trim(),url:input.url,category:(input.category||'').trim(),active:input.active};
}
function options(data,card,rows){
 const esc=S.escape,saved=data.links.find(l=>l.id===card.destination);
 return `<option value="">No button destination</option>${card.destination?`<option value="${esc(card.destination)}" selected>${esc(saved?.label||'Missing saved destination')} · saved in this edition</option>`:''}${rows.filter(r=>r.active&&S.https(r.url)).map(r=>`<option value="registry/${esc(r.id)}">${esc(r.name)}${r.category?' · '+esc(r.category):''}</option>`).join('')}`;
}
function select(data,value,rows){
 if(!value.startsWith('registry/'))return value;
 const row=rows.find(r=>r.id===value.slice(9)&&r.active);if(!row)throw new Error('This destination is no longer active. Refresh Approved Destinations.');
 validate(row);
 // Never mutate an existing snapshot, even when an imported ID happens to match.
 const existing=data.links.find(l=>!l.editorialRegistry&&l.registryId===row.id&&l.registryVersion===row.version&&l.label===row.name&&l.url===row.url&&l.approved);
 if(existing)return existing.id;
 const base=`destination-${row.id}-v${row.version}`;let id=base,n=1;while(data.links.some(l=>l.id===id))id=base+'-'+n++;
 data.links.push({id,label:row.name,url:row.url,approved:true,source:'Approved Destinations registry snapshot',registryId:row.id,registryVersion:row.version});return id;
}
function selectEditorial(data,rowId,rows){
 const row=rows.find(r=>r.id===rowId&&r.active);if(!row)throw new Error('This destination is no longer active. Refresh Approved Destinations.');
 validate(row);
 const existing=data.links.find(l=>l.editorialRegistry===true&&l.registryId===row.id);
 if(existing){syncEditorial(data,[row],row.id);return existing.id;}
 const base=`editorial-${row.id}`;let id=base,n=1;while(data.links.some(l=>l.id===id))id=base+'-'+n++;
 data.links.push({id,label:row.name,url:row.url,approved:true,source:'Approved Destinations editorial link',editorialRegistry:true,registryId:row.id,registryVersion:row.version});return id;
}
function syncEditorial(data,rows,onlyId){
 let changed=false;const changedUrls=new Set(),cardDestinations=new Set(data.sections.flatMap(s=>s.cards.map(c=>c.destination)));
 // Malformed aliases must never change a card's saved CTA.
 for(const link of data.links.filter(l=>l.editorialRegistry===true&&!cardDestinations.has(l.id)&&(!onlyId||l.registryId===onlyId))){
  const row=rows.find(r=>r.id===link.registryId);let values={approved:false};
  // Registry saves always bump the version, so a different name/URL at the same version is a hand edit
  // (content.json or the edition links view). Keep it and stop following the registry for this link.
  if(row&&row.version===link.registryVersion&&(link.url!==row.url||link.label!==row.name)){link.editorialRegistry=false;link.source='Edited in this edition';changed=true;continue;}
  if(row){let approved=true;try{validate(row);}catch{approved=false;}values={label:typeof row.name==='string'?row.name:link.label,url:typeof row.url==='string'?row.url:link.url,registryVersion:row.version,approved};}
  if(values.url!==undefined&&link.url!==values.url)changedUrls.add(link.id);
  for(const [key,value] of Object.entries(values))if(link[key]!==value){link[key]=value;changed=true;}
 }
 if(changedUrls.size)for(const section of data.sections)for(const card of section.cards)if(P.requiresApproval(section,card)&&card.approved&&S.validBodyLinks(card).some(r=>changedUrls.has(r.destination)))card.approved=false;
 return changed;
}
function referenced(data,row){return data.links.some(l=>(l.registryId===row.id||l.id===row.legacy_id||l.url===row.url)&&data.sections.some(s=>s.cards.some(c=>c.destination===l.id||(Array.isArray(c.bodyLinks)&&c.bodyLinks.some(r=>r?.destination===l.id)))));}
function createClient(fetcher){
 async function request(method,id,data){
  let res,body;try{res=await fetcher('/.netlify/functions/destinations'+(id?'?id='+encodeURIComponent(id):''),{method,cache:'no-store',headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(20000)});body=await res.json();}
  catch{throw new Error('Destination registry unavailable. Edition links and your current work are unchanged.');}
  if(!res.ok)throw new Error(body.error||'Destination request failed.');return body;
 }
 return {list:async()=>(await request('GET')).destinations,save:async(id,destination,version=null)=>(await request(version===null?'POST':'PUT',version===null?null:id,{id,destination,version})).destination,remove:(id,version)=>request('DELETE',id,{version})};
}
const api={categories,seeds,validate,options,select,selectEditorial,syncEditorial,referenced,createClient};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Destinations=api;
})(typeof window!=='undefined'?window:this);
