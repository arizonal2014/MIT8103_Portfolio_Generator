import {chromium} from 'playwright';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateCaseSpec} from './case-spec.mjs';
import {documentStyle} from './document-style.mjs';
const sqlTypes={id:'bigint',integer:'integer',decimal:'numeric',text:'text',boolean:'boolean',date:'date',timestamp:'timestamptz'};
export function submissionMermaid(spec){
 const checked=validateCaseSpec(spec);if(!checked.valid)throw new Error('A valid case model is required for its ER diagram.');
 const lines=['erDiagram','    direction LR'];
 for(const e of spec.entities){
  lines.push('    '+e.name+' {');
  for(const f of e.fields){const tags=[e.primaryKey.includes(f.name)?'PK':null,e.foreignKeys.some(k=>k.fields.includes(f.name))?'FK':null,e.uniqueKeys.some(k=>k.length===1&&k[0]===f.name)?'UK':null].filter(Boolean);lines.push(`        ${sqlTypes[f.type]} ${f.name}${tags.length?' '+tags.join(','):''}${!f.required?' "Optional"':''}`);}
  lines.push('    }');
 }
 for(const r of checked.relationships)lines.push(`    ${r.to} ${r.parentPerChild==='exactly_one'?'||':'o|'}--${r.childrenPerParent==='zero_or_one'?'o|':'o{'} ${r.from} : "${r.fields.join('_')}"`);
 return lines.join('\n')+'\n';
}
export async function renderSubmissionER(spec,assetsDirectory){
 const source=submissionMermaid(spec),fingerprint=createHash('sha256').update('font-ready-v2\n'+source).digest('hex');await mkdir(assetsDirectory,{recursive:true,mode:0o700});
 const png=path.join(assetsDirectory,'ERDiagram.png'),svgPath=path.join(assetsDirectory,'ERDiagram.svg'),stamp=path.join(assetsDirectory,'ERDiagram.sha256');
 try{if((await readFile(stamp,'utf8'))===fingerprint)return{source,png,svg:await readFile(svgPath,'utf8')};}catch{}
 const browser=await chromium.launch({chromiumSandbox:process.platform==='linux'});
 try{
  const context=await browser.newContext({viewport:{width:1600,height:1200},deviceScaleFactor:2});await context.route('**/*',route=>route.abort());const page=await context.newPage();
  await page.setContent(`<html><head><style>${documentStyle}body{margin:0;padding:24px;background:#fff}#diagram{display:inline-block;background:#fff}svg{max-width:none!important}</style></head><body><div id="diagram"></div></body></html>`);
  await page.addScriptTag({path:fileURLToPath(new URL('../node_modules/mermaid/dist/mermaid.min.js',import.meta.url))});
  await page.evaluate(async()=>{await document.fonts.load('17px \"IBM Plex Sans\"');await document.fonts.load('16px \"IBM Plex Sans\"');await document.fonts.ready;});
  const svg=await page.evaluate(async code=>{mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:'base',fontFamily:'IBM Plex Sans',themeVariables:{primaryColor:'#ffffff',primaryTextColor:'#111111',primaryBorderColor:'#555555',lineColor:'#555555',tertiaryColor:'#ffffff',fontFamily:'IBM Plex Sans'},er:{useMaxWidth:false,entityPadding:14,minEntityWidth:150,fontSize:17}});const rendered=await mermaid.render('portfolio-er',code);document.querySelector('#diagram').innerHTML=rendered.svg;await document.fonts.ready;return rendered.svg;},source);
  const shape=await page.locator('#diagram svg').boundingBox();if(!shape||shape.width<100||shape.height<80)throw new Error('ER diagram has no readable drawing.');
  await page.locator('#diagram').screenshot({path:png,animations:'disabled'});await writeFile(svgPath,svg);await writeFile(stamp,fingerprint);
  return{source,png,svg};
 }finally{await browser.close();}
}
