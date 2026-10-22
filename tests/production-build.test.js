const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const root=path.join(__dirname,'..'),hash=bytes=>createHash('sha256').update(bytes).digest('hex');

test('production build includes link editing and versions every browser dependency without changing its bytes',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-build-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 // Build in isolation so the test never changes the working production output.
 for(const file of fs.readdirSync(root))if(/\.(js|css|html)$/.test(file))fs.copyFileSync(path.join(root,file),path.join(dir,file));
 fs.cpSync(path.join(root,'assets'),path.join(dir,'assets'),{recursive:true});
 fs.symlinkSync(path.join(root,'node_modules'),path.join(dir,'node_modules'),'dir');
 const commit='a1545511b489563fe5d36db0451f9d44bc4e5e33';
 const build=()=>execFileSync(process.execPath,[path.join(dir,'build-site.js')],{env:{...process.env,COMMIT_REF:commit}});
 build();
 const output=path.join(dir,'dist'),html=fs.readFileSync(path.join(output,'index.html'),'utf8');
 const info=JSON.parse(fs.readFileSync(path.join(output,'build-info.json'),'utf8'));
 assert.equal(info.commit,commit);
 assert(html.includes(`<meta name="studio-build" content="${info.build}">`));
 const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const references=[...source.matchAll(/\b(?:src|href)="([^"]+\.(?:js|css))"/g)].map(match=>match[1]);
 assert.deepEqual(Object.keys(info.assets),references);
 for(const file of references){
  const bytes=fs.readFileSync(path.join(output,file));
  assert.equal(info.assets[file],hash(bytes));
  assert(html.includes(`"${file}?v=${hash(bytes)}"`));
  if(file!=='studio-identity.js')assert.deepEqual(bytes,fs.readFileSync(path.join(root,file)));
 }
 assert.match(html,/id="editorial-link-dialog"/);
 assert.match(html,/id="editorial-destination"/);
 assert.match(fs.readFileSync(path.join(output,'app.js'),'utf8'),/>Insert\/Edit Link<\/button>/);
 for(const file of ['server.js','package.json','.env','app.js.map'])assert(!fs.existsSync(path.join(output,file)));
 build();
 assert.equal(fs.readFileSync(path.join(output,'index.html'),'utf8'),html);
 const appVersion=info.assets['app.js'],coreVersion=info.assets['core.js'];
 fs.appendFileSync(path.join(dir,'app.js'),'\n');
 build();
 const next=JSON.parse(fs.readFileSync(path.join(output,'build-info.json'),'utf8'));
 assert.notEqual(next.assets['app.js'],appVersion);
 assert.equal(next.assets['core.js'],coreVersion);
 assert.notEqual(next.build,info.build);
});

test('Netlify publishes dist with revalidation limited to Studio code and shell',()=>{
 const config=fs.readFileSync(path.join(root,'netlify.toml'),'utf8');
 assert.match(config,/command = "npm run build"/);
 assert.match(config,/publish = "dist"/);
 for(const route of ['/','/index.html','/*.js','/*.css']){
  assert(config.includes(`for = "${route}"\n  [headers.values]\n    Cache-Control = "public, max-age=0, must-revalidate"`));
 }
 assert(config.includes('for = "/build-info.json"\n  [headers.values]\n    Cache-Control = "no-store"'));
 assert(!config.includes('for = "/*"'));
});
