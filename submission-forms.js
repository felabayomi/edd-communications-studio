(function(root){
'use strict';
const S=typeof module!=='undefined'&&module.exports?require('./core'):root.Studio;
const types=['Alumni Updates & Accomplishments','Student Experience & Story Submission','Communications Content Submission','Other'];
const targets=['Program Letter','Newsletter','Either','Not sure'];
const categories=['Chair / Leadership Message','Important Program Update','Registration / Financial Aid','Upcoming Event','Resources / Student Support','Dissertation Journey','Residency','CPED','Student Spotlight','Alumni Spotlight','Faculty / Staff Update','Research / Public Scholarship','Opportunity','Community Co-working & Café','Reminder','Other'];
function empty(){return {name:'',url:'',description:'',audience:'',form_type:'Other',active:false,notes:'',publication_targets:[],content_categories:[],expose_as_destination:false};}
function validate(input){
 if(!input||typeof input!=='object')throw new Error('Enter form details.');
 const result={};
 for(const [key,max] of Object.entries({name:200,url:2048,description:4000,audience:1000,form_type:200,notes:5000})){
  if(typeof input[key]!=='string'||input[key].length>max)throw new Error(`Invalid ${key}: maximum ${max} characters.`);
  result[key]=input[key].trim();
 }
 if(!result.name)throw new Error('Enter a form name.');
 if(!types.includes(result.form_type))throw new Error('Choose a form type.');
 if(typeof input.active!=='boolean'||typeof input.expose_as_destination!=='boolean')throw new Error('Choose active and destination settings.');
 result.active=input.active;result.expose_as_destination=input.expose_as_destination;
 if(result.url&&(!/^https:\/\//i.test(result.url)||!S.https(result.url)))throw new Error('Form URLs must use valid https:// URLs without credentials.');
 if(!result.url&&(result.active||result.expose_as_destination))throw new Error('Enter the institutional HTTPS URL before activation or destination exposure. Inactive planned forms may have a blank URL.');
 for(const key of ['publication_targets','content_categories']){
  if(!Array.isArray(input[key])||input[key].length>50||input[key].some(v=>typeof v!=='string'||!v.trim()||v.length>150))throw new Error('Use at most 50 nonempty values of up to 150 characters.');
  result[key]=[...new Set(input[key].map(v=>v.trim()))];
 }
 if(result.publication_targets.some(v=>!targets.includes(v)))throw new Error('Choose valid publication targets.');
 return result;
}
function createClient(fetcher){
 async function request(method,id,data){
  let res,body;try{res=await fetcher('/.netlify/functions/submission-forms'+(id?'?id='+encodeURIComponent(id):''),{method,cache:'no-store',headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(20000)});body=await res.json();}
  catch{throw new Error('Submission Forms unavailable. Your form draft and edition are unchanged.');}
  if(!res.ok)throw new Error(body.error||'Form request failed.');return body;
 }
 return {list:async()=>(await request('GET')).forms,save:async(id,form,version=null)=>(await request(version===null?'POST':'PUT',version===null?null:id,{id,form,version})).form,remove:(id,version)=>request('DELETE',id,{version})};
}
const api={types,targets,categories,empty,validate,createClient};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SubmissionForms=api;
})(typeof window!=='undefined'?window:this);
