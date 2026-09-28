(function(root){
'use strict';
const D=typeof module!=='undefined'&&module.exports?require('./destinations'):root.Destinations;
const S=typeof module!=='undefined'&&module.exports?require('./core'):root.Studio;
function createManager({api,getEdition,confirmChange,onChange=()=>{},toast=()=>{},newId=()=>crypto.randomUUID()}){
 const state={rows:D.seeds.map(r=>({...r})),loaded:false,busy:false,message:'Loading shared registry. Provided starting choices are available until it loads.',editing:null,draft:{name:'',url:'',category:'',active:true}};
 async function refresh(){
  try{state.rows=await api.list();state.loaded=true;state.message='Registry loaded. Changes apply to future selections; saved edition links remain unchanged.';}
  catch(error){state.message=error.message+(state.loaded?' Showing the last loaded registry.':' Using the seven provided starting choices.');}
  onChange();
 }
 async function action(action,id){
  if(state.busy)return;
  if(action==='destination-new'){state.editing=null;state.draft={name:'',url:'',category:'',active:true};onChange();return;}
  if(action==='destination-edit'){const row=state.rows.find(r=>r.id===id);if(!row)return;state.editing={id:row.id,version:row.version};state.draft={name:row.name,url:row.url,category:row.category,active:row.active};onChange();return;}
  state.busy=true;
  try{
   if(action==='destination-refresh'){await refresh();return;}
   if(!state.loaded)throw new Error('Load the online registry before changing destinations. Your edition remains usable offline.');
   const row=state.rows.find(r=>r.id===id);
   if(action==='destination-save'){
    const data=D.validate(state.draft),editing=state.editing;
    const saved=await api.save(editing?.id||newId(),data,editing?.version??null);
    state.rows=[saved,...state.rows.filter(r=>r.id!==saved.id)];state.editing={id:saved.id,version:saved.version};state.message='Destination saved. Existing edition snapshots are unchanged.';
   }
   if(action==='destination-toggle'){
    if(!row)throw new Error('Refresh the registry first.');
    const saved=await api.save(row.id,{...row,active:!row.active},row.version);
    state.rows=state.rows.map(r=>r.id===saved.id?saved:r);
    // Preserve unsaved form text; require re-opening the row if its revision changed.
    state.message=saved.active?'Destination reactivated.':'Destination deactivated. Existing edition snapshots still render.';
   }
   if(action==='destination-delete'){
    if(!row)throw new Error('Refresh the registry first.');
    const edition=getEdition();if(edition&&D.referenced(edition,row))throw new Error('This destination is used in your current edition. Choose Deactivate instead.');
    if(!await confirmChange('Delete destination?',`Delete “${row.name}”? The server will refuse deletion if a saved edition references it. Deactivation keeps its history.`))return;
    await api.remove(row.id,row.version);state.rows=state.rows.filter(r=>r.id!==row.id);
    if(state.editing?.id===row.id){state.editing=null;state.draft={name:'',url:'',category:'',active:true};}
    state.message='Destination deleted. Portable edition snapshots remain intact.';
   }
  }catch(error){state.message=error.message;toast(error.message);}
  finally{state.busy=false;onChange();}
 }
 function view(){const esc=S.escape,d=state.draft;return `<section class="content-page"><div class="page-heading"><div><p class="eyebrow">Studio management</p><h1>Approved Destinations</h1><p class="hint">Manage shared links for future content-card selections. Existing editions keep their saved names and URLs.</p></div><button data-action="destination-refresh">Refresh destinations</button></div><p class="banner" role="status">${esc(state.message)}</p><article class="export-card"><h2>${state.editing?'Edit destination':'Create a destination'}</h2><label class="field">Display name<input data-destination-field="name" value="${esc(d.name)}" maxlength="200"></label><label class="field">Destination URL<input type="url" data-destination-field="url" value="${esc(d.url)}" maxlength="2048" placeholder="https://"></label><label class="field">Category (optional)<input data-destination-field="category" value="${esc(d.category)}" list="destination-categories" maxlength="100"></label><datalist id="destination-categories">${D.categories.map(c=>`<option value="${esc(c)}"></option>`).join('')}</datalist><label class="check"><input type="checkbox" data-destination-field="active" ${d.active?'checked':''}>Active for new selections</label><div class="actions"><button class="primary" data-action="destination-save" ${!state.loaded||state.busy?'disabled':''}>Save destination</button><button data-action="destination-new">New destination</button></div></article>${state.loaded?state.rows.map(r=>`<article class="link-entry"><div><h3>${esc(r.name)}</h3><p>${r.active?'Active':'Inactive'} · ${esc(r.category||'Uncategorized')}</p><a href="${esc(S.https(r.url)?r.url:'')}" target="_blank" rel="noopener noreferrer">${esc(r.url)}</a><p class="hint">Last updated: ${esc(r.updated_at)}</p></div><div class="actions">${r.managed_by==='submission-forms'?'<button data-view="forms">Manage in Submission Forms</button>':`<button data-action="destination-edit" data-id="${esc(r.id)}">Edit</button><button data-action="destination-toggle" data-id="${esc(r.id)}">${r.active?'Deactivate':'Reactivate'}</button><button class="danger" data-action="destination-delete" data-id="${esc(r.id)}">Delete</button>`}</div></article>`).join('')||'<p>No destinations. Create one above.</p>':'<p class="hint">Connect to the registry to create, edit, deactivate, or delete destinations.</p>'}</section>`;}
 return {state,refresh,action,view};
}
const api={createManager};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DestinationManager=api;
})(typeof window!=='undefined'?window:this);
