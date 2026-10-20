'use strict';
function createRuntimeStore(createStore,{getConnection=()=>process.env.DATABASE_URL,connect=connection=>require('@neondatabase/serverless').neon(connection)}={}){
 return ()=>{
  const connection=getConnection();
  if(!connection)throw Object.assign(new Error('Storage not configured'),{code:'STORAGE_NOT_CONFIGURED'});
  let sql;
  try{sql=connect(connection);}catch{throw Object.assign(new Error('Storage initialization failed'),{code:'STORAGE_INITIALIZATION_FAILED'});}
  return createStore(sql);
 };
}
function storageFailure(error,label,migration){
 const code=error.code;
 if(code==='STORAGE_NOT_CONFIGURED')return [503,'DATABASE_NOT_CONFIGURED',`${label} storage is not configured. Ask the administrator to set DATABASE_URL for the current Netlify deploy context (Deploy Previews for a preview), enable Functions scope, and redeploy.`];
 if(code==='STORAGE_INITIALIZATION_FAILED')return [503,'DATABASE_INITIALIZATION_FAILED',`${label} storage could not initialize. Ask the administrator to verify the current deploy context's DATABASE_URL format and Netlify Function dependencies, then redeploy. Do not share the connection string.`];
 if(code==='42P01'||code==='42703')return [503,'SCHEMA_NOT_READY',`${label} storage needs a database migration. Ask the administrator to apply the outstanding Studio migrations through ${migration} to the database configured for this deploy context.`];
 if(code==='42501')return [503,'DATABASE_PERMISSION_DENIED',`${label} storage permissions are not configured. Ask the administrator to check the database role permissions.`];
 if(/^(08|28|53|57P)/.test(code||'')||['ECONNREFUSED','ECONNRESET','ENOTFOUND','ETIMEDOUT'].includes(code)||error.name==='NeonDbError')return [503,'DATABASE_UNAVAILABLE',`${label} could not connect to storage. Ask the administrator to check the current deploy context's database connection and availability. Your input is retained.`];
 return [500,'SERVER_ERROR',`${label} could not complete the request. Your input is retained. Ask the administrator to check the function logs before retrying.`];
}
function logStorageFailure(log,event,functionName,error,code){
 log({function:functionName,method:event.httpMethod,code,...(/^[0-9A-Z]{5}$/.test(error.code||'')?{databaseCode:error.code}:{})});
}
module.exports={createRuntimeStore,storageFailure,logStorageFailure};
