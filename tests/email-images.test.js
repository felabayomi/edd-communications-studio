const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const S=require('../core.js'),images=require('../server/email-images'),client=require('../image-hosting');
const png=new Uint8Array(fs.readFileSync(path.join(__dirname,'fixtures/voter-guide-2026-11-03.png')));
const site='https://eddcomstudio.netlify.app',editor={id:'user-1',email:'editor@example.edu',roles:['editor']};
function memoryStore(){const m=new Map();return {m,set:async(k,v,{metadata}={})=>m.set(k,{data:new Uint8Array(v),metadata}),get:async k=>m.has(k)?m.get(k).data.buffer.slice(0):null,getMetadata:async k=>m.has(k)?{metadata:m.get(k).metadata}:null,delete:async k=>{m.delete(k);}};}
function setup({user=editor,production=true}={}){const store=memoryStore();let current=user;
 return {store,setUser:u=>{current=u;},api:images.createApiHandler({getStore:()=>store,getUser:async()=>current,isProduction:()=>production,now:()=>new Date('2026-10-22T12:00:00Z'),log:()=>{}}),file:images.createFileHandler({getStore:()=>store})};}
const post=(body,{type='image/png',origin=site,name='Voter Guide.png'}={})=>new Request(site+'/api/email-images',{method:'POST',body,headers:{'Content-Type':type,'X-Image-Name':encodeURIComponent(name),...(origin?{Origin:origin}:{})}});
const voterCard=d=>{const s=d.sections.find(s=>s.id==='announcements')||d.sections[1];const c={...S.newCard('announcement'),title:'Voter guide: Election Day is November 3, 2026',body:'A nonpartisan checklist for EdD students.',imageAlt:'Voter Guide for Antioch University EdD students: Election Day, Tuesday, November 3, 2026, with a four-step checklist.'};s.cards.push(c);return c;};

test('file signatures, safe slugs and unique keys',()=>{
 assert.equal(images.sniff(png),'image/png');
 assert.equal(images.sniff(new Uint8Array([0xff,0xd8,0xff,0xe0])),'image/jpeg');
 assert.equal(images.sniff(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ')),'image/webp');
 assert.equal(images.sniff(new TextEncoder().encode('GIF89a')),'');
 assert.equal(images.slug('../../Voter Guide (Final).PNG'),'voter-guide-final');
 assert.equal(images.slug('<script>.png'),'script');assert.equal(images.slug('...'),'image');
 const a=images.makeKey('Voter Guide.png','image/png',{now:new Date('2026-10-22T00:00:00Z')}),b=images.makeKey('Voter Guide.png','image/png');
 assert.match(a,/^2026\/10\/voter-guide-[0-9a-f]{32}\.png$/);assert.notEqual(a,b);assert(images.validKey(a));
 assert(images.validKey('preview/'+a));
 for(const bad of ['../secret.png','2026/10/x.png','2026/10/voter-guide-'+'a'.repeat(32)+'.svg','/2026/10/a-'+'a'.repeat(32)+'.png'])assert(!images.validKey(bad),bad);
});

test('upload requires a signed-in editor and same-origin requests',async()=>{
 const t=setup({user:null});
 let r=await t.api(post(png));assert.equal(r.status,401);assert.equal((await r.json()).code,'SIGN_IN_REQUIRED');
 t.setUser({id:'user-2',email:'reader@example.edu',roles:[]});
 r=await t.api(post(png));assert.equal(r.status,403);assert.equal((await r.json()).code,'ROLE_REQUIRED');
 t.setUser(editor);
 r=await t.api(post(png,{origin:'https://attacker.example'}));assert.equal(r.status,403);
 assert.equal(t.store.m.size,0);
 r=await t.api(new Request(site+'/api/email-images',{method:'GET'}));assert.equal(r.status,405);
});

test('upload validates type, contents and size',async()=>{
 const t=setup();
 assert.equal((await t.api(post(png,{type:'image/gif'}))).status,415);
 assert.equal((await t.api(post(new TextEncoder().encode('GIF89a not a png'),{type:'image/png'}))).status,415);
 assert.equal((await t.api(post(png,{type:'image/jpeg'}))).status,415);
 assert.equal((await t.api(post(new Uint8Array(0)))).status,400);
 const big=new Uint8Array(images.MAX_BYTES+1);big.set(png.subarray(0,8));
 assert.equal((await t.api(post(big))).status,413);
 assert.equal(t.store.m.size,0);
});

test('voter-guide PNG uploads to a unique safe key with a stable absolute HTTPS URL and owner metadata',async()=>{
 const t=setup(),r=await t.api(post(png)),{image}=await r.json();
 assert.equal(r.status,201);
 assert.match(image.key,/^2026\/10\/voter-guide-[0-9a-f]{32}\.png$/);
 assert.equal(image.url,`${site}/email-images/${image.key}`);assert(S.https(image.url));
 assert.equal(image.bytes,png.length);assert.equal(image.preview,false);
 assert.deepEqual(t.store.m.get(image.key).metadata,{contentType:'image/png',ownerId:'user-1',uploadedAt:'2026-10-22T12:00:00.000Z',bytes:String(png.length)});
 const served=await t.file(new Request(image.url));
 assert.equal(served.status,200);assert.equal(served.headers.get('content-type'),'image/png');
 assert.match(served.headers.get('cache-control'),/public.*immutable/);assert.equal(served.headers.get('x-content-type-options'),'nosniff');
 assert.deepEqual(new Uint8Array(await served.arrayBuffer()),png);
 assert.equal((await t.file(new Request(image.url,{method:'HEAD'}))).status,200);
 const preview=setup({production:false}),p=(await (await preview.api(post(png))).json()).image;
 assert.match(p.key,/^preview\/2026\/10\//);assert.equal(p.preview,true);
});

test('public file route rejects unknown, malformed and write requests',async()=>{
 const t=setup();
 assert.equal((await t.file(new Request(site+'/email-images/2026/10/x-'+'a'.repeat(32)+'.png'))).status,404);
 assert.equal((await t.file(new Request(site+'/email-images/..%2F..%2Fsecret'))).status,404);
 assert.equal((await t.file(new Request(site+'/email-images/2026/10/x-'+'a'.repeat(32)+'.png',{method:'POST',body:'x'}))).status,405);
});

test('delete requires the uploader or an admin and never happens for other editors',async()=>{
 const t=setup(),{image}=await (await t.api(post(png))).json(),del=()=>t.api(new Request(`${site}/api/email-images?key=${encodeURIComponent(image.key)}`,{method:'DELETE',headers:{Origin:site}}));
 t.setUser({id:'user-9',email:'other@example.edu',roles:['editor']});
 let r=await del();assert.equal(r.status,403);assert.equal((await r.json()).code,'NOT_OWNER');assert(t.store.m.has(image.key));
 t.setUser(null);assert.equal((await del()).status,401);assert(t.store.m.has(image.key));
 t.setUser({id:'admin-1',roles:['admin']});r=await del();assert.equal(r.status,200);assert(!t.store.m.has(image.key));
 assert.equal((await del()).status,404);
 assert.equal((await t.api(new Request(`${site}/api/email-images?key=..%2Fx`,{method:'DELETE'}))).status,400);
 const own=setup(),mine=(await (await own.api(post(png))).json()).image;
 assert.equal((await own.api(new Request(`${site}/api/email-images?key=${encodeURIComponent(mine.key)}`,{method:'DELETE'}))).status,200);
});

test('storage failures are masked and keep the local preview',async()=>{
 const api=images.createApiHandler({getStore:()=>({set:async()=>{throw new Error('internal connection detail');}}),getUser:async()=>editor,log:()=>{}});
 const r=await api(post(png)),body=await r.json();
 assert.equal(r.status,503);assert.doesNotMatch(body.error,/internal connection/);assert.match(body.error,/local preview/);
});

test('browser client recognises Studio-hosted URLs and validates before uploading',()=>{
 assert.equal(client.hostedKey(`${site}/email-images/2026/10/a.png`,site),'2026/10/a.png');
 assert.equal(client.hostedKey('https://example.edu/email-images/2026/10/a.png',site),'');
 assert.equal(client.hostedKey('not a url',site),'');
 const blob=client.dataUrlToBlob('data:image/png;base64,'+Buffer.from(png).toString('base64'));
 assert.equal(blob.type,'image/png');assert.equal(blob.size,png.length);
 assert.throws(()=>client.validate(new Blob(['GIF89a'],{type:'image/gif'})),/GIFs stay local/);
 assert.throws(()=>client.validate(new Blob([new Uint8Array(client.MAX_BYTES+1)],{type:'image/png'})),/2 MB/);
 assert.throws(()=>client.dataUrlToBlob('javascript:alert(1)'),/cannot be hosted/);
 assert.equal(client.sessionToken('a=1; nf_jwt=abc.def.ghi; b=2'),'abc.def.ghi');
});

function fakeXHR(status,response){return class{constructor(){this.upload={};this.headers={};}open(m,u){this.method=m;this.url=u;}setRequestHeader(k,v){this.headers[k]=v;}send(body){this.body=body;this.constructor.last=this;this.upload.onprogress({lengthComputable:true,loaded:body.size/2,total:body.size});this.upload.onprogress({lengthComputable:true,loaded:body.size,total:body.size});this.status=status;this.responseText=JSON.stringify(response);this.onload();}};}
test('browser upload reports progress, sends the session and surfaces server errors',async()=>{
 const blob=new Blob([png],{type:'image/png'}),progress=[];
 const XHR=fakeXHR(201,{image:{url:`${site}/email-images/2026/10/voter-guide-${'a'.repeat(32)}.png`}});
 const image=await client.upload(blob,{name:'Voter Guide.png',XHR,cookie:()=>'nf_jwt=token123',onProgress:p=>progress.push(p)});
 assert.deepEqual(progress,[.5,1]);assert.match(image.url,/^https:\/\//);
 assert.equal(XHR.last.method,'POST');assert.equal(XHR.last.url,'/api/email-images');
 assert.equal(XHR.last.headers.Authorization,'Bearer token123');assert.equal(XHR.last.headers['Content-Type'],'image/png');
 await assert.rejects(client.upload(blob,{XHR:fakeXHR(403,{error:'Your account is signed in but does not have the editor role.'}),cookie:()=>''}),/editor role/);
 await assert.rejects(client.upload(new Blob(['x'],{type:'image/gif'}),{XHR}),/GIFs/);
});

test('Readiness blocks the local-only voter guide and passes only with the hosted HTTPS URL',()=>{
 const d=S.createEdition(false),c=voterCard(d),local='data:image/png;base64,'+Buffer.from(png).toString('base64');
 c.localImage=local;
 let r=S.validate(d);assert(r.some(x=>x.level==='error'&&x.message.includes('local image needs a hosted HTTPS URL for email')));
 assert.throws(()=>S.makeFiles(d),/blockers/);
 assert.doesNotMatch(S.render(d,{email:true,draft:true}),/data:image/);
 c.imageUrl='http://eddcomstudio.netlify.app/email-images/2026/10/voter-guide-'+'a'.repeat(32)+'.png';
 assert(S.validate(d).some(x=>x.level==='error'&&x.message.includes('must use HTTPS')));
 c.imageUrl='/email-images/2026/10/voter-guide-'+'a'.repeat(32)+'.png';
 assert(S.validate(d).some(x=>x.level==='error'&&x.message.includes('must use HTTPS')));
 const hosted=`${site}/email-images/2026/10/voter-guide-${'a'.repeat(32)}.png`;
 c.imageUrl=hosted;c.localImage='';
 r=S.validate(d);assert(!r.some(x=>x.level==='error'),JSON.stringify(r.filter(x=>x.level==='error')));
 c.imageAlt='';assert(S.validate(d).some(x=>x.message.includes('alt text is missing')));
 c.imageAlt='Voter Guide: Election Day, Tuesday, November 3, 2026.';
 c.imageUrl=`${site}/email-images/preview/2026/10/voter-guide-${'a'.repeat(32)}.png`;
 r=S.validate(d);assert(r.some(x=>x.level==='warning'&&x.message.includes('preview deploy')));assert(!r.some(x=>x.level==='error'));
});

test('hosted voter guide renders email-safe in email and standalone HTML for both publication types',()=>{
 const hosted=`${site}/email-images/2026/10/voter-guide-${'b'.repeat(32)}.png`;
 for(const type of ['program-letter','newsletter']){
  const d=S.createPublication(type);for(const s of d.sections)s.cards=[];
  d.issue.issueDate='2026-10-27';d.issue.preheader='Program updates and the November 3 voter guide.';
  const c=voterCard(d);c.imageUrl=hosted;
  const files=S.makeFiles(d),email=Object.entries(files).find(([n])=>n.endsWith('-email.html'))[1],web=Object.entries(files).find(([n])=>n.endsWith('.html')&&!n.endsWith('-email.html'))[1];
  for(const html of [email,web]){
   const img=html.match(/<img src="https:\/\/eddcomstudio\.netlify\.app\/email-images\/[^"]+"[^>]*>/)?.[0];
   assert(img,type+' image missing');
   assert.match(img,/alt="Voter Guide for Antioch University EdD students: Election Day, Tuesday, November 3, 2026/);
   assert.match(img,/width="\d{3}"/);assert.match(img,/width:100%/);assert.match(img,/max-width:\d{3}px/);assert.match(img,/height:auto/);assert.match(img,/display:block/);
   assert(Number(img.match(/width="(\d+)"/)[1])<=584);
  }
  assert.doesNotMatch(email,/data:image|<script/);
 }
});

test('Program Letter image widths fit each surface so Outlook cannot overflow',()=>{
 const hosted=`${site}/email-images/2026/10/voter-guide-${'c'.repeat(32)}.png`,d=S.createPublication('program-letter');for(const s of d.sections)s.cards=[];
 const add=(sid,type)=>{const s=d.sections.find(s=>s.id===sid);const c={...S.newCard(type),title:'T',body:'B',imageUrl:hosted,imageAlt:'A'};s.cards.push(c);};
 add(d.sections[0].id,'leadership');add(d.sections.at(-1).id,'leadership');add(d.sections[2].id,'spotlight');add(d.sections[3].id,'resource');add(d.sections[4].id,'announcement');
 const widths=[...S.render(d,{email:true}).matchAll(/<img src="https:[^"]+" alt="A" width="(\d+)"/g)].map(m=>Number(m[1])).sort((a,b)=>a-b);
 assert.deepEqual(widths,[502,510,522,530,540]);
});

test('public voter-guide URL and alt text survive web, email and unchanged copy-page generation',()=>{
 const H=require('../handoff'),P=require('../private-handoff'),d=S.createPublication('program-letter');
 const url='https://gorgeous-starburst-efcdd3.netlify.app/voter%20guide.png',alt='Voter guide checklist & QR code';
 const c=voterCard(d);c.imageUrl=url;c.imageAlt=alt;
 const before=JSON.stringify(d),files=P.bundleFiles(d,{draft:true}),handoff=P.makeFiles(d);
 for(const html of [S.render(d),S.render(d,{email:true}),files['OPEN-TO-COPY.html'],handoff['OPEN-TO-COPY.html']]){
  assert(html.includes(`src="${url}"`));assert(html.includes(`alt="${S.escape(alt)}"`));
  assert.equal((html.match(/voter%20guide\.png/g)||[]).length,1);
 }
 const fragment=H.emailFragment(S.render(d,{email:true}));
 assert(fragment.includes(`src="${url}"`));assert.doesNotMatch(fragment,/display:grid|display:flex|@media/);
 assert.equal(files['content.json'],JSON.stringify(d,null,2));assert.equal(JSON.stringify(d),before);
});

test('uploaded flyer is never silently omitted from email; HTTPS flyer renders everywhere',()=>{
 const H=require('../handoff'),local='data:image/png;base64,aGVsbG8=',https='https://example.org/flyer.png';
 const make=img=>{const d=S.createPublication('program-letter'),sec=d.sections.find(s=>s.id==='updates');sec.cards=[{...S.newCard('resource'),title:'Community Co-working & Café',body:'Open hours.',imageAlt:'Café flyer',...img}];return d;};
 const d=make({localImage:local});
 const web=S.render(d,{draft:true}),email=S.render(d,{email:true,draft:true});
 assert.match(web,/<img src="data:image\/png/);
 assert.doesNotMatch(email,/data:image/);
 assert.match(email,/data-image-missing="true"[^>]*>Image not included: &ldquo;Café flyer&rdquo;/);
 assert.match(H.emailFragment(email),/data-image-missing="true"/);
 assert.throws(()=>S.makeFiles(d),/blockers/);
 const h=make({imageUrl:https});
 for(const html of [S.render(h),S.render(h,{email:true}),H.emailFragment(S.render(h,{email:true}))]){assert(html.includes(`src="${https}"`));assert.doesNotMatch(html,/data-image-missing/);}
 assert.match(S.render(h,{email:true}),/alt="Café flyer"/);
 const files=S.makeFiles(Object.assign(make({imageUrl:https}),{}));
 assert(Object.values(files).some(v=>typeof v==='string'&&v.includes(`src="${https}"`)));
});

test('hosted image verification requires an anonymous 200 image response',async()=>{
 const res=(status,type)=>async(url,opts)=>{assert.equal(opts.credentials,'omit');assert.equal(opts.redirect,'error');return {ok:status<300,status,headers:{get:()=>type}};};
 assert.deepEqual(await client.verify('https://x.test/a.png',{fetcher:res(200,'image/png')}),{type:'image/png'});
 await assert.rejects(client.verify('https://x.test/a.png',{fetcher:res(401,'text/html')}),/HTTP 401/);
 await assert.rejects(client.verify('https://x.test/a.png',{fetcher:res(200,'text/html; charset=utf-8')}),/content type/);
 await assert.rejects(client.verify('https://x.test/a.png',{fetcher:async()=>{throw new Error('redirect');}}),/without signing in/);
});

test('Deploy Preview image hosts are flagged even though they are HTTPS',()=>{
 for(const u of ['https://deploy-preview-8--eddcomstudio.netlify.app/email-images/preview/2026/10/a-'+'a'.repeat(32)+'.jpg','https://eddcomstudio.netlify.app/email-images/preview/2026/10/a-'+'a'.repeat(32)+'.png','https://deploy-preview-8--eddcomstudio.netlify.app/x.png'])assert(S.previewHosted(u),u);
 for(const u of ['https://eddcomstudio.netlify.app/email-images/2026/10/a-'+'a'.repeat(32)+'.png','http://deploy-preview-8--x.netlify.app/a.png',''])assert(!S.previewHosted(u),u);
});

test('compact flyers render as a linked 240px thumbnail while full-width images keep their surface width',()=>{
 const H=require('../handoff'),url='https://example.org/flyer.png',d=S.createPublication('program-letter'),sec=d.sections.find(s=>s.id==='events');
 sec.cards=[{...S.newCard('event'),title:'Café',body:'Open hours.',imageUrl:url,imageAlt:'Café flyer',imageSize:'compact'}];
 for(const html of [S.render(d),S.render(d,{email:true}),H.emailFragment(S.render(d,{email:true}))]){
  assert.match(html,/<a href="https:\/\/example.org\/flyer.png"[^>]*><img src="https:\/\/example.org\/flyer.png" alt="Café flyer" width="240"/);
  assert.match(html,/View full size/);
 }
 sec.cards[0].imageSize='full';assert.doesNotMatch(S.render(d,{email:true}),/width="240"|View full size/);
 delete sec.cards[0].imageSize;assert.doesNotMatch(S.render(d),/View full size/);
 sec.cards[0].imageSize='huge';assert.throws(()=>S.parseEdition(JSON.stringify(d)),/image size/);
});
