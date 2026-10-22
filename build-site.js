'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
// An explicit public-file allowlist prevents server code, secrets, and Git files being published.
const target=path.join(__dirname,'dist');
fs.rmSync(target,{recursive:true,force:true});fs.mkdirSync(target);
for(const file of ['index.html','studio.css','publications.js','core.js','handoff.js','director-sample.js','editions-client.js','destinations.js','destinations-manager.js','submission-forms.js','submission-forms-manager.js','standalone-copy.js','private-handoff.js','image-hosting.js','app.js'])fs.copyFileSync(path.join(__dirname,file),path.join(target,file));
fs.cpSync(path.join(__dirname,'assets'),path.join(target,'assets'),{recursive:true});
// The Identity client is the only bundled browser file; it contains no credentials.
require('esbuild').buildSync({entryPoints:[path.join(__dirname,'studio-identity.src.js')],outfile:path.join(target,'studio-identity.js'),bundle:true,format:'iife',platform:'browser',target:'es2020',minify:true,legalComments:'none'});
// Version every browser dependency, including the bundled Identity client, from its built bytes.
const assets={};
const html=fs.readFileSync(path.join(target,'index.html'),'utf8').replace(/\b(src|href)="([^"]+\.(?:js|css))"/g,(match,attribute,file)=>{
 const version=createHash('sha256').update(fs.readFileSync(path.join(target,file))).digest('hex');
 assets[file]=version;
 return `${attribute}="${file}?v=${version}"`;
});
const build=createHash('sha256').update(html).digest('hex');
const commit=/^[a-f0-9]{40}$/i.test(process.env.COMMIT_REF||'')?process.env.COMMIT_REF:null;
fs.writeFileSync(path.join(target,'index.html'),html.replace('</head>',`<meta name="studio-build" content="${build}"></head>`));
fs.writeFileSync(path.join(target,'build-info.json'),JSON.stringify({build,commit,assets},null,2)+'\n');
