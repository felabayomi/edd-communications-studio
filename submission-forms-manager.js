(function(root){
'use strict';
const F=typeof module!=='undefined'&&module.exports?require('./submission-forms'):root.SubmissionForms;
const D=typeof module!=='undefined'&&module.exports?require('./destinations'):root.Destinations;
const S=typeof module!=='undefined'&&module.exports?require('./core'):root.Studio;
function createManager({api,getEdition,confirmChange,onChange=()=>{},onSaved=()=>{},toast=()=>{},newId=()=>crypto.randomUUID()}){
 const state={rows:[],loaded:false,busy:false,message:'Refresh to load institutional form records.',editing:null,draft:F.empty()};
 async function refresh(){try{state.rows=await api.list();state.loaded=true;state.message='Form records loaded. This manager stores links and descriptions, not submissions.';}catch(error){state.message=error.message;}onChange();}
 async function action(action,id){
  if(state.busy)return;
  if(action==='form-new'){state.editing=null;state.draft=F.empty();onChange();return;}
  if(action==='form-edit'){const row=state.rows.find(r=>r.id===id);if(!row)return;state.editing={id:row.id,version:row.version};state.draft=JSON.parse(JSON.stringify(row));onChange();return;}
  state.busy=true;
  try{
   if(action==='form-refresh'){await refresh();return;}
   if(!state.loaded)throw new Error('Load Submission Forms before changing a record.');
   const row=state.rows.find(r=>r.id===id);
   if(action==='form-save'){
    const data=F.validate(state.draft),ref=state.editing;
    const saved=await api.save(ref?.id||newId(),data,ref?.version??null);
    state.rows=[saved,...state.rows.filter(r=>r.id!==saved.id)];state.editing={id:saved.id,version:saved.version};state.draft=JSON.parse(JSON.stringify(saved));
    state.message='Form saved. Existing publication snapshots are unchanged.';await onSaved();
   }
   if(action==='form-toggle'){
    if(!row)throw new Error('Refresh the forms list first.');
    const saved=await api.save(row.id,F.validate({...row,active:!row.active}),row.version);
    state.rows=state.rows.map(r=>r.id===saved.id?saved:r);state.message=saved.active?'Form activated.':'Form deactivated. Existing publication links are preserved.';await onSaved();
   }
   if(action==='form-delete'){
    if(!row)throw new Error('Refresh the forms list first.');
    const edition=getEdition();if(edition&&D.referenced(edition,row))throw new Error('This form is referenced in your current edition. Deactivate it instead.');
    if(!await confirmChange('Delete this form record?',`Delete “${row.name}”? This removes only the Studio record, not the institutional form. Referenced records must be deactivated instead.`))return;
    await api.remove(row.id,row.version);state.rows=state.rows.filter(r=>r.id!==row.id);
    if(state.editing?.id===row.id){state.editing=null;state.draft=F.empty();}
    state.message='Form record deleted.';await onSaved();
   }
  }catch(error){state.message=error.message;toast(error.message);}
  finally{state.busy=false;onChange();}
 }
 function view(){
  const esc=S.escape,d=state.draft;
  const field=(label,key,multi=false)=>`<label class="field">${label}${multi?`<textarea data-form-field="${key}">${esc(d[key])}</textarea>`:`<input data-form-field="${key}" ${key==='url'?'type="url"':''} value="${esc(d[key])}">`}</label>`;
  return `<section class="content-page"><div class="page-heading"><div><p class="eyebrow">Private editor management</p><h1>Submission Forms</h1><p class="hint">Contributors use institutional forms. Only the editor uses this Studio. No submission responses are collected or imported here.</p></div><button data-action="form-refresh">Refresh forms</button></div><p class="banner" role="status">${esc(state.message)}</p><article class="export-card"><h2>${state.editing?'Edit form':'Create a form record'}</h2>${field('Form name','name')}${field('Institutional form URL','url')}<p class="hint">Leave the URL blank while planning an inactive form. Enter its real HTTPS URL before activation or destination exposure.</p>${field('Purpose / description','description',true)}${field('Intended contributors / audience','audience')}<label class="field">Form type<select data-form-field="form_type">${F.types.map(t=>`<option ${d.form_type===t?'selected':''}>${esc(t)}</option>`).join('')}</select></label><fieldset><legend>Document supported publication choices</legend>${F.targets.map(t=>`<label class="check"><input type="checkbox" data-form-target="${esc(t)}" ${d.publication_targets.includes(t)?'checked':''}>${esc(t)}</label>`).join('')}</fieldset><label class="field">Content categories (one per line)<textarea data-form-categories>${esc(d.content_categories.join('\n'))}</textarea></label><button data-action="form-suggest-categories">Use suggested content categories</button>${field('Notes (editor only)','notes',true)}<label class="check"><input type="checkbox" data-form-field="active" ${d.active?'checked':''}>Active</label><label class="check"><input type="checkbox" data-form-field="expose_as_destination" ${d.expose_as_destination?'checked':''}>Also offer as an Approved Destination</label><p class="hint">Only active exposed forms appear in new publication choices. Existing Student Support links are never replaced automatically.</p><div class="actions"><button class="primary" data-action="form-save" ${!state.loaded||state.busy?'disabled':''}>Save form</button><button data-action="form-new">New form</button></div></article>${state.rows.map(r=>`<article class="link-entry"><div><h3>${esc(r.name)}</h3><p>${r.active?'Active':'Inactive'} · ${esc(r.form_type)}</p><p>${esc(r.description)}</p><p class="hint">Contributors: ${esc(r.audience)}<br>Created: ${esc(r.created_at)}<br>Updated: ${esc(r.updated_at)}<br>${r.expose_as_destination?'Offered through Approved Destinations when active':'Not offered as a publication destination'}</p>${r.url&&S.https(r.url)?`<a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">Open institutional form ↗</a>`:'<p>URL not entered — awaiting institutional form creation.</p>'}</div><div class="actions"><button data-action="form-edit" data-id="${esc(r.id)}">Edit form</button><button data-action="form-toggle" data-id="${esc(r.id)}">${r.active?'Deactivate form':'Activate form'}</button><button class="danger" data-action="form-delete" data-id="${esc(r.id)}">Delete form</button></div></article>`).join('')}<p class="hint">No Google Forms API or automatic importing is enabled. Future integration requires institutional approval.</p></section>`;
 }
 return {state,refresh,action,view};
}
const api={createManager};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SubmissionFormsManager=api;
})(typeof window!=='undefined'?window:this);
