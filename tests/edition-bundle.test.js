const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const S=require('../core'),H=require('../handoff'),P=require('../private-handoff');
const hosted='https://eddcomstudio.netlify.app/email-images/2026/10/voter-guide-'+'a'.repeat(32)+'.png';
function edition(status){const d=S.createPublication('newsletter');d.publication.status=status;d.issue.issueDate='2031-05-01';
 d.sections[0].cards.push({...S.newCard(),title:'Voter guide: Election Day is November 3, 2026',body:'A nonpartisan checklist.',imageUrl:hosted,imageAlt:'Voter Guide checklist',buttonLabel:'Visit the Community Center',destination:'hub'});return d;}
for(const draft of [false,true])for(const status of ['Draft','Ready for Review','Approved']){
 test(`${draft?'draft':'final'} Edition Bundle (${status}) includes the Gmail-ready OPEN-TO-COPY.html built from its own email HTML`,()=>{
  const d=edition(status),before=JSON.stringify(d);
  if(!draft&&S.validate(d).some(r=>r.level==='error')){assert.throws(()=>P.bundleFiles(d),/readiness blockers/);return;}
  const files=P.bundleFiles(d,{draft}),prefix=S.exportBase(d)+(draft?'-draft':'');
  assert.deepEqual(Object.keys(files).sort(),['OPEN-TO-COPY.html','README.txt','content.json','links-used.json',prefix+'-email.html',prefix+'.html'].sort());
  const standard=S.makeFiles(d,{draft});for(const name of Object.keys(standard).filter(n=>n!=='README.txt'))assert.equal(files[name],standard[name]);
  const page=files['OPEN-TO-COPY.html'];
  assert(page.includes('<main id="publication">'+H.emailFragment(files[prefix+'-email.html'])+'</main>'));
  assert.match(page,/id="copy-gmail"/);assert(page.includes(H.copyRendered.toString()));assert(page.includes(hosted));
  assert.equal(page.includes('DRAFT PREVIEW · NOT FOR DISTRIBUTION'),status==='Draft');
  assert.doesNotMatch(page,/\.netlify\/functions|identity|localStorage|fetch\(/i);
  if(draft)assert.doesNotMatch(page,/— APPROVED FOR DISTRIBUTION/);
  assert.match(files['README.txt'],/OPEN-TO-COPY\.html: open in Chrome or Edge/);
  assert.equal(JSON.stringify(d),before);assert.equal(d.publication.status,status);
 });
}
test('Edition Bundle ZIP extracts with OPEN-TO-COPY.html and unchanged bundle files',()=>{
 const d=edition('Draft'),slug=S.editionSlug(d),files=P.bundleFiles(d,{draft:true});
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bundle-')),zip=path.join(dir,'bundle.zip');
 fs.writeFileSync(zip,S.zip(Object.fromEntries(Object.entries(files).map(([n,c])=>[`output/${slug}/${n}`,c]))));
 const list=execFileSync('unzip',['-Z1',zip],{encoding:'utf8'}).trim().split('\n').sort();
 assert.deepEqual(list,Object.keys(files).map(n=>`output/${slug}/${n}`).sort());
 assert.equal(execFileSync('unzip',['-p',zip,`output/${slug}/OPEN-TO-COPY.html`],{encoding:'utf8'}),files['OPEN-TO-COPY.html']);
});
