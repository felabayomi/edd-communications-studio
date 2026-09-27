'use strict';
const fs=require('node:fs'),path=require('node:path');
// An explicit public-file allowlist prevents server code, secrets, and Git files being published.
const target=path.join(__dirname,'dist');
fs.rmSync(target,{recursive:true,force:true});fs.mkdirSync(target);
for(const file of ['index.html','studio.css','publications.js','core.js','handoff.js','director-sample.js','editions-client.js','app.js'])fs.copyFileSync(path.join(__dirname,file),path.join(target,file));
fs.cpSync(path.join(__dirname,'assets'),path.join(target,'assets'),{recursive:true});
