'use strict';
const S=require('../core');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES=4*1024*1024;
function invalid(message='Invalid edition request.'){return Object.assign(new Error(message),{status:400});}
function validateId(id){if(typeof id!=='string'||!uuid.test(id))throw invalid();return id;}
function validateVersion(version){if(!Number.isSafeInteger(version)||version<1)throw invalid();return version;}
function validateContent(content){
 let data;try{data=S.parseEdition(JSON.stringify(content));}catch{throw invalid('Content must be a valid Studio edition.');}
 if(Buffer.byteLength(JSON.stringify(data))>MAX_BYTES)throw Object.assign(new Error('Online editions must be under 4 MB. Keep large editions as Content JSON or use hosted images.'),{status:413});
 for(const value of Object.values(data.publication))if(value.length>2000)throw invalid('Publication metadata must be under 2,000 characters per field.');
 return data;
}
// All user values are passed as query parameters, never SQL fragments.
function createStore(sql){
 const query=(text,params=[])=>sql.query(text,params);
 const summary='id, publication_type, title, edition, semester, academic_year, audience, editorial_status, version, created_at, updated_at';
 return {
  list:()=>query(`SELECT ${summary} FROM editions ORDER BY updated_at DESC, id`),
  async get(id){validateId(id);return (await query('SELECT * FROM editions WHERE id=$1',[id]))[0];},
  async save(id,content,version){
   validateId(id);const data=validateContent(content),m=data.publication;
   const values=[id,data.publicationType,m.title,m.edition,m.semester,m.academicYear,m.audience,m.status,JSON.stringify(data)];
   if(version===null){
    return (await query(`INSERT INTO editions (id,publication_type,title,edition,semester,academic_year,audience,editorial_status,content) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) ON CONFLICT (id) DO NOTHING RETURNING ${summary}`,values))[0];
   }
   validateVersion(version);
   return (await query(`UPDATE editions SET publication_type=$2,title=$3,edition=$4,semester=$5,academic_year=$6,audience=$7,editorial_status=$8,content=$9::jsonb,version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND version=$10 RETURNING ${summary}`,[...values,version]))[0];
  },
  async remove(id,version){validateId(id);validateVersion(version);return (await query('DELETE FROM editions WHERE id=$1 AND version=$2 RETURNING id',[id,version]))[0];}
 };
}
module.exports={createStore,validateId,validateVersion,validateContent,MAX_BYTES};
