const fs=require('node:fs'),path=require('node:path'),S=require('./core.js'),create=require('./director-sample');
const d=create(),out=path.join(__dirname,'sample');fs.mkdirSync(out,{recursive:true});
const files=S.makeFiles(d,{draft:true});
// Embed inspected official assets in the shareable web file; email retains HTTPS images.
const assets=[['antioch-logo.png',d.issue.logoUrl],['learning-community.png','https://brand.antioch.edu/wp-content/uploads/sites/7/2021/02/grad-leadership-ads2-1024x691.png'],['community-practice.jpg','https://brand.antioch.edu/wp-content/uploads/sites/7/2021/02/GettyImages-515306702.jpg']];
const web=Object.keys(files).find(n=>n.endsWith('.html')&&!n.endsWith('-email.html'));
for(const [name,url] of assets){const mime=name.endsWith('.jpg')?'image/jpeg':'image/png',encoded=fs.readFileSync(path.join(__dirname,'assets',name)).toString('base64');files[web]=files[web].split(url).join(`data:${mime};base64,${encoded}`);}
files['sources-and-assets.md']=`# Director-review mockup: sources and editorial status

This is a fully written demonstration, not an approved program newsletter. All event dates, leadership copy, spotlight narratives, and quotations are illustrative. No real student/alumni identity or accomplishment is asserted. Student and alumni publication approval remains unconfirmed.

## Official sources consulted September 26, 2026

- Program context: https://www.antioch.edu/academics/education/edd-in-educational-professional-practice/
- Brand guide, logo, and colors: https://brand.antioch.edu/
- Community Center: user-provided https://sites.google.com/antioch.edu/eddcommunitycenter/edd-program-info
- Café destination: user-provided https://antioch.zoom.us/j/94176225683
- Dissertation HQ, writing support, Common Thread, and disability support links were found through the official Antioch program website. Live access may vary; no availability claim is made for library resources.

## Images

${assets.map(([name,url])=>`- ${name}: ${url}`).join('\n')}

These are unchanged official brand assets used for internal design review. Photography is illustrative, not documentation of an EdD event, student, or alumni story. The university should confirm image reuse rights for distribution, especially the Getty-named photograph. Do not assume public availability supplies a general redistribution license.

## Design

Primary ink and CTA color: #083133 from the Antioch brand guide. Conservative system font fallbacks support email clients. The official logo is unmodified, proportionally scaled, and shown on a dark background.

## Delivery

The web HTML embeds all three images and can be opened offline. The email HTML uses their original absolute HTTPS URLs. Copy for Gmail is available in the Studio's Export area. Remote images and Gmail formatting require recipient-context testing. This mockup remains visibly labeled for director review in web, email, and rich clipboard output.
`;
for(const [name,value] of Object.entries(files))fs.writeFileSync(path.join(out,name),value);
const zipEntries=Object.fromEntries(Object.entries(files).map(([name,value])=>[`output/${S.editionSlug(d)}/${name}`,value]));fs.writeFileSync(path.join(out,'director-review-bundle.zip'),S.zip(zipEntries));
console.log(JSON.stringify({sections:S.activeSections(d).length,cards:S.activeCards(d).length,files:Object.keys(files),web,assets:assets.length},null,2));
