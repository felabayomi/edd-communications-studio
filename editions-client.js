(function(root){
'use strict';
function createClient(fetcher){
 const base='/.netlify/functions/editions';
 async function request(method,id,data){
  let response,payload;
  try{
   response=await fetcher(base+(id?'?id='+encodeURIComponent(id):''),{method,cache:'no-store',headers:{'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{}),signal:AbortSignal.timeout(20000)});
   payload=await response.json();
  }catch{throw new Error('Online storage is unavailable. Your current work is unchanged. Download Content JSON for a backup.');}
  if(!response.ok)throw new Error(payload.error||'Online storage is unavailable. Your current work is unchanged.');
  return payload;
 }
 return {list:async()=> (await request('GET')).editions,get:async id=>(await request('GET',id)).edition,
  save:async(id,content,version=null)=>(await request(version===null?'POST':'PUT',version===null?null:id,{id,content,version})).edition,
  remove:(id,version)=>request('DELETE',id,{version})};
}
const api={createClient};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.EditionStorage=api;
})(typeof window!=='undefined'?window:this);
