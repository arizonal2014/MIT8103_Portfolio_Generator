import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { buildCasePrompt } from './case-spec.mjs';
import { InputError } from '../shared.mjs';

// Readiness only: this module never spawns a process, signs in or contacts a model.
export const providerRegistry = Object.freeze({
  gemini: Object.freeze({name:'Gemini',command:'gemini',documentation:'https://geminicli.com/docs/get-started/authentication/'}),
  codex: Object.freeze({name:'Codex',command:'codex',documentation:'https://learn.chatgpt.com/docs/auth'}),
  copilot: Object.freeze({name:'Copilot',command:'copilot',documentation:'https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli'}),
});
const definition = provider => {
  if(typeof provider!=='string'||!Object.hasOwn(providerRegistry,provider))throw new InputError({provider:'Choose Gemini, Codex or Copilot.'});
  return providerRegistry[provider];
};

export async function inspectProvider(provider,{searchPath=process.env.PATH ?? ''}={}) {
  const info=definition(provider);
  const names=process.platform==='win32'?[`${info.command}.exe`,`${info.command}.cmd`,info.command]:[info.command];
  let found=false;
  // Ignore relative PATH entries: a generated project cannot supply the binary.
  for(const directory of searchPath.split(path.delimiter).filter(p=>path.isAbsolute(p))){
    for(const name of names){
      const candidate=path.join(directory,name);
      try{await access(candidate,constants.X_OK);if((await stat(candidate)).isFile()){found=true;break;}}catch{}
    }
    if(found)break;
  }
  return {provider,name:info.name,command:info.command,installed:found,authentication:'not_checked',quota:'not_checked',adapter:'not_connected',generationEnabled:false,documentation:info.documentation,message:found?'Command found. Sign-in, quota and generation are not verified.':'Command not found on the server PATH. Nothing was installed.'};
}

export async function inspectProviders(options){
  return Promise.all(Object.keys(providerRegistry).map(provider=>inspectProvider(provider,options)));
}

export function prepareProviderRequest(input){
  if(!input||typeof input!=='object'||Array.isArray(input))throw new InputError({form:'Provide a selected tool and case study.'});
  if(Object.keys(input).some(key=>!['provider','caseStudy'].includes(key)))throw new InputError({form:'Only provider and caseStudy belong in the request preview. Student identity and credentials are not accepted.'});
  definition(input.provider);
  let prompt;try{prompt=buildCasePrompt(input.caseStudy);}catch{throw new InputError({caseStudy:'Provide a case study in 5-3,000 characters.'});}
  return {provider:input.provider,purpose:'request_preview_only',submitted:false,generationEnabled:false,prompt};
}
