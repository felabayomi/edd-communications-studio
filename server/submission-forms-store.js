'use strict';
const F=require('../submission-forms'),{validateId,validateVersion}=require('./editions-store');
function createStore(sql){
 const query=(text,args=[])=>sql.query(text,args);
 return {
  list:()=>query('SELECT * FROM submission_forms ORDER BY lower(name),id'),
  async save(id,input,version){
   validateId(id);let f;try{f=F.validate(input);}catch(error){throw Object.assign(error,{status:400});}
   const args=[id,f.name,f.url,f.description,f.audience,f.form_type,f.active,f.notes,JSON.stringify(f.publication_targets),JSON.stringify(f.content_categories),f.expose_as_destination];
   if(version===null)return (await query(`INSERT INTO submission_forms (id,name,url,description,audience,form_type,active,notes,publication_targets,content_categories,expose_as_destination) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11) ON CONFLICT (id) DO NOTHING RETURNING *`,args))[0];
   validateVersion(version);return (await query(`UPDATE submission_forms SET name=$2,url=$3,description=$4,audience=$5,form_type=$6,active=$7,notes=$8,publication_targets=$9::jsonb,content_categories=$10::jsonb,expose_as_destination=$11,version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND version=$12 RETURNING *`,[...args,version]))[0];
  },
  async remove(id,version){
   validateId(id);validateVersion(version);
   return (await query(`DELETE FROM submission_forms f WHERE f.id=$1 AND f.version=$2 AND NOT EXISTS (
    SELECT 1 FROM editions e
    CROSS JOIN LATERAL jsonb_array_elements(e.content->'links') l
    CROSS JOIN LATERAL jsonb_array_elements(e.content->'sections') s
    CROSS JOIN LATERAL jsonb_array_elements(s->'cards') c
    WHERE c->>'destination'=l->>'id' AND (l->>'registryId'=f.id::text OR (f.url<>'' AND l->>'url'=f.url))
   ) RETURNING f.id`,[id,version]))[0];
  }
 };
}
module.exports={createStore};
