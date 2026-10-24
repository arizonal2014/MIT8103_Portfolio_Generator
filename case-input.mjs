import {validateInput,InputError} from './shared.mjs';

// These are wording checks, not a list of the only case studies students may use.
const corrections={mangement:'management',managment:'management',managament:'management',hosptial:'hospital',hopsital:'hospital',hospitl:'hospital',libary:'library',libray:'library',libarary:'library',borowing:'borrowing',borrowng:'borrowing',inventry:'inventory',invnetory:'inventory',appointement:'appointment',appoinment:'appointment',resturant:'restaurant',restaraunt:'restaurant',accomodation:'accommodation',studnet:'student',stduent:'student',sytem:'system',systme:'system',systm:'system'};
const examples=['Library borrowing system','Hospital appointment system','Student course registration system'];
export function inspectCaseStudy(value){
 const text=typeof value==='string'?value.trim():'';
 const words=text.match(/[\p{L}\p{M}]+/gu)||[];
 const key=text.toLowerCase().replace(/[^\p{L}\p{M}\s]/gu,'').replace(/\s+/g,' ').trim();
 if(text.length<5||!words.length||/^(.)\1{4,}$/u.test(key.replace(/\s/g,''))||words.every(w=>/^(?:asdf\w*|qwerty\w*|zxcv\w*|test(?:ing)?|example|placeholder|blah|hello|world|abc(?:def\w*)?|xyz|foo|bar)$/i.test(w))){
  return{status:'invalid',message:'Enter a real system, for example “Library borrowing system”, or describe your own.',suggestions:examples};
 }
 const suggested=text.replace(/[\p{L}\p{M}]+/gu,word=>{
  const replacement=corrections[word.toLowerCase()];if(!replacement)return word;
  return /^[A-Z]/.test(word)?replacement[0].toUpperCase()+replacement.slice(1):replacement;
 });
 if(suggested!==text)return{status:'suggestion',message:'Did you mean this? You can use the suggestion or keep your wording.',suggestions:[suggested]};
 if(/^(?:(?:a|an|the|my|our) )?(?:(?:new|simple|advanced|database|data|information|online|web|app|software|business|project) )*(?:(?:management|registration|booking|tracking|record|records) )?(?:system|platform|application|app|database|project|case study)$/.test(key)||/^(?:management|a system|any system|something|anything|i dont know|not sure)$/.test(key)){
  return{status:'clarify',message:'What does the system manage? Add the subject, for example “Hospital appointment system”.',suggestions:examples};
 }
 return{status:'ready',message:'Case study wording checked.',suggestions:[]};
}

export function validatePortfolioInput(raw){
 const input=validateInput(raw),errors={};
 for(const field of ['firstName','surname'])if(!/^[A-Za-z][A-Za-z '\u2019-]*$/.test(input[field]))errors[field]='For the repository name, use letters A–Z, spaces, apostrophes or hyphens. Use the spelling you want in your filenames.';
 if(!/^[-A-Za-z0-9_]{1,100}$/.test(input.prefix)&&!Object.keys(errors).length)errors.form='The repository name must be at most 100 characters. Use shorter name fields; keep your real student ID.';
 if(Object.keys(errors).length)throw new InputError(errors);
 return input;
}
