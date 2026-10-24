import {readFileSync} from 'node:fs';
const sans=readFileSync(new URL('../public/fonts/IBMPlexSans-Regular.woff2',import.meta.url)).toString('base64');
const mono=readFileSync(new URL('../public/fonts/IBMPlexMono-Regular.woff2',import.meta.url)).toString('base64');
export const documentStyle=`@font-face{font-family:'IBM Plex Sans';src:url(data:font/woff2;base64,${sans}) format('woff2');font-weight:100 900}@font-face{font-family:'IBM Plex Mono';src:url(data:font/woff2;base64,${mono}) format('woff2')}body{background:#fff;color:#000;font-family:'IBM Plex Sans',sans-serif}pre,code{font-family:'IBM Plex Mono',monospace}a{color:#000}`;
