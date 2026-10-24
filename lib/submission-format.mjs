import {escapeHTML as h} from './postgres-case.mjs';
import {documentStyle} from './document-style.mjs';
export const cell=v=>String(v===null?'NULL':v??'').replaceAll('|','\\|').replaceAll('\n',' ');
export const mdTable=(rows,columns=Object.keys(rows[0]||{}))=>rows.length?'| '+columns.map(cell).join(' | ')+' |\n| '+columns.map(()=>'---').join(' | ')+' |\n'+rows.map(row=>'| '+columns.map(c=>cell(row[c])).join(' | ')+' |').join('\n'):'No records returned.';
export const code=(text,language='sql')=>'```'+language+'\n'+text.trim()+'\n```';
export const readable=name=>String(name).replaceAll('_',' ');
export function markdownHTML(markdown,images={}){
 const lines=markdown.split('\n');let html='',i=0;
 const inline=text=>h(text).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g,'<a href="$2">$1</a>');
 while(i<lines.length){const line=lines[i];
  if(!line.trim()){i++;continue;}
  if(line.startsWith('```')){const body=[];i++;while(i<lines.length&&!lines[i].startsWith('```'))body.push(lines[i++]);i++;html+='<pre><code>'+h(body.join('\n'))+'</code></pre>';continue;}
  const image=line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);if(image){if(images[image[2]])html+=`<figure><img src="${images[image[2]]}" alt="${h(image[1])}"></figure>`;i++;continue;}
  const heading=line.match(/^(#{1,3}) (.*)$/);if(heading){html+=`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`;i++;continue;}
  if(line.startsWith('|')&&lines[i+1]?.match(/^\|[\s:|-]+\|$/)){
   const split=s=>s.trim().slice(1,-1).split(/(?<!\\)\|/).map(s=>s.trim().replaceAll('\\|','|'));
   const columns=split(line);i+=2;const rows=[];while(i<lines.length&&lines[i].startsWith('|'))rows.push(split(lines[i++]));html+='<div class="table-wrap"><table><thead><tr>'+columns.map(c=>'<th>'+inline(c)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+inline(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';continue;
  }
  if(line.startsWith('- ')){const items=[];while(i<lines.length&&lines[i].startsWith('- '))items.push(lines[i++].slice(2));html+='<ul>'+items.map(s=>'<li>'+inline(s)+'</li>').join('')+'</ul>';continue;}
  const body=[];while(i<lines.length&&lines[i].trim()&&!/^(#{1,3} |```|\||!\[|- )/.test(lines[i]))body.push(lines[i++]);if(!body.length){html+='<p>'+inline(lines[i++])+'</p>';continue;}html+='<p>'+inline(body.join(' '))+'</p>';
 }
 return html;
}
export function reportPage(title,markdown,images={}){return `<!doctype html><html><head><meta charset="utf-8"><title>${h(title)}</title><style>${documentStyle}body{font:16px/1.6 'IBM Plex Sans',sans-serif;max-width:1120px;margin:32px auto;padding:0 28px;color:#111;background:#fff}h1{font-size:28px;line-height:1.2;margin-bottom:22px}h2{font-size:21px;margin-top:28px}h3{font-size:18px}table{border-collapse:collapse;width:100%;font-size:14px}th,td{border-bottom:1px solid #ccc;padding:9px;text-align:left;overflow-wrap:anywhere}th{font-weight:600}.table-wrap{overflow:hidden}pre{font:13px/1.6 'IBM Plex Mono',monospace;white-space:pre-wrap;overflow-wrap:anywhere;border-left:2px solid #aaa;padding:10px 16px}p,li{overflow-wrap:anywhere}figure{margin:20px 0}img{width:100%;height:auto}a{color:inherit}</style></head><body>${markdownHTML(markdown,images)}</body></html>`;}
export function executionPlanText(document){
 const entry=Array.isArray(document)?document[0]:document;const lines=[];
 function visit(node,depth=0){lines.push('  '.repeat(depth)+node['Node Type']+(node['Relation Name']?' on '+node['Relation Name']:'')+(node['Index Name']?' using '+node['Index Name']:'')+` (actual time=${node['Actual Startup Time']}..${node['Actual Total Time']} rows=${node['Actual Rows']} loops=${node['Actual Loops']})`);for(const child of node.Plans||[])visit(child,depth+1);}
 visit(entry.Plan);lines.push('Planning Time: '+entry['Planning Time']+' ms','Execution Time: '+entry['Execution Time']+' ms');return lines.join('\n');
}
