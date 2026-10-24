import path from 'node:path';
import {readdir,lstat,realpath} from 'node:fs/promises';
const folders=['portfolio-1-database-design','portfolio-2-query-optimisation','portfolio-3-transactions-concurrency','portfolio-4-nosql','portfolio-5-distributed-cloud'];
export const submissionFolders=folders;
export function submissionFiles(prefix){
 const map=new Map();
 const add=(folder,names)=>names.forEach(s=>map.set(path.posix.join(folder,prefix+'_'+s),true));
 add('',['README.md','FinalSummary.md','FinalSummary.pdf']);
 add('images',['ERDiagram.png']);
 for(const [i,names]of [
  ['P1_README.md','P1_Design.md','P1_ERDiagram.md','P1_Normalisation.md','P1_Schema.sql','P1_SampleData.sql','P1_ConstraintTests.sql'],
  ['P2_README.md','P2_Queries.sql','P2_Optimisation.sql'],
  ['P3_README.md','P3_Transactions.sql','P3_SessionA.sql','P3_SessionB.sql'],
  ['P4_README.md','P4_MongoDB.js'],
  ['P5_README.md'],
 ].entries())add(folders[i],names);
 for(const [i,names]of [
  ['P1_DatabaseResults.png'],['P2_QueryResults.png','P2_IndexComparison.png'],
  ['P3_CommitRollback.png','P3_ConcurrencyResult.png'],['P4_DocumentsAndQueries.png'],['P5_ProposedDesign.png'],
 ].entries())add(folders[i]+'/screenshots',names);
 return map;
}
export async function listSubmission(directory,prefix){
 const allowed=submissionFiles(prefix),files=[];const root=await realpath(directory);
 async function walk(relative=''){
  for(const name of await readdir(path.join(root,relative))){
   const rel=path.posix.join(relative,name),target=path.join(root,rel),info=await lstat(target);
   if(info.isSymbolicLink())throw new Error('Symbolic links cannot enter the submission.');
   if(info.isDirectory()){
    if(![...allowed.keys()].some(key=>key.startsWith(rel+'/')))throw new Error('Unexpected submission directory: '+rel);
    await walk(rel);
   }else if(info.isFile()){
    if(!allowed.has(rel))throw new Error('Unexpected submission file: '+rel);
    files.push(rel);
   }else throw new Error('Unsupported submission file: '+rel);
  }
 }
 await walk();return files.sort();
}
export function isLegacyGeneratedFile(relative,prefix){
 if(relative==='README.md')return false;
 const name=path.posix.basename(relative);if(!name.startsWith(prefix+'_'))return false;
 if(/\.(json|html|log|mmd|svg)$/.test(name))return true;
 return ['README.md','AIUseDeclaration.md','EvidencePlan.md','QuickGuide.md','Reflection.md','Summary.md','Summary.pdf',
 'P1_CaseStudy.md','P1_RelationalDesign.md','P1_Seed.sql','P2_Analysis.md','P2_Benchmark.sql',
 'P3_Analysis.md','P3_Setup.sql','P3_CommitRollback.sql','P3_Concurrency.sql','P4_Analysis.md','P4_Execute.js','P5_Discussion.md'].some(s=>name===prefix+'_'+s);
}
