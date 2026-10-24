export function workspaceAccess(env=process.env,port=4310){
  let externalOrigin=null;
  if(env.CODESPACES==='true'){
    if(!/^[a-z0-9][a-z0-9-]{0,100}$/.test(env.CODESPACE_NAME||'')||env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN!=='app.github.dev')throw new Error('Codespaces forwarding settings are missing or unsupported.');
    externalOrigin=`https://${env.CODESPACE_NAME}-${port}.${env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`;
  }
  return {externalOrigin,listenHost:externalOrigin?'0.0.0.0':'127.0.0.1',url:externalOrigin||`http://127.0.0.1:${port}`,
    hostAllowed:host=>/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host||'')||Boolean(externalOrigin&&host===new URL(externalOrigin).host),
    originAllowed:(origin,host)=>typeof origin==='string'&&(origin===externalOrigin||origin===`http://${host}`||origin===`https://${host}`)};
}
