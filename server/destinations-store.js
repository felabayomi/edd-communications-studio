'use strict';
const D=require('../destinations'),{validateId,validateVersion}=require('./editions-store');
function createStore(sql){
 const query=(text,args=[])=>sql.query(text,args);
 return {
  async list(){
   const rows=await query('SELECT * FROM destinations ORDER BY lower(name), id');
   // Forms remain the single source of their URL. No duplicate destination row is created.
   try{rows.push(...await query(`SELECT id,name,url,'Forms' AS category,active,NULL::text AS legacy_id,version,created_at,updated_at,'submission-forms' AS managed_by FROM submission_forms WHERE expose_as_destination=true`));}
   catch(error){if(error.code!=='42P01')throw error;} // 002 can operate before 003 is installed.
   return rows.sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
  },
  async save(id,input,version){
   validateId(id);let data;try{data=D.validate(input);}catch(error){throw Object.assign(error,{status:400});}
   const args=[id,data.name,data.url,data.category,data.active];
   if(version===null)return (await query('INSERT INTO destinations (id,name,url,category,active) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING RETURNING *',args))[0];
   validateVersion(version);
   return (await query('UPDATE destinations SET name=$2,url=$3,category=$4,active=$5,updated_at=clock_timestamp(),version=version+1 WHERE id=$1 AND version=$6 RETURNING *',[...args,version]))[0];
  },
  async remove(id,version){
   validateId(id);validateVersion(version);
   // Includes disabled sections/cards and legacy links. Portable snapshots survive even concurrent saves.
   return (await query(`DELETE FROM destinations d WHERE d.id=$1 AND d.version=$2 AND NOT EXISTS (
    SELECT 1 FROM editions e
    CROSS JOIN LATERAL jsonb_array_elements(e.content->'links') l
    CROSS JOIN LATERAL jsonb_array_elements(e.content->'sections') s
    CROSS JOIN LATERAL jsonb_array_elements(s->'cards') c
    WHERE c->>'destination'=l->>'id'
      AND (l->>'registryId'=d.id::text OR l->>'id'=d.legacy_id OR l->>'url'=d.url)
   ) RETURNING d.id`,[id,version]))[0];
  }
 };
}
module.exports={createStore};
