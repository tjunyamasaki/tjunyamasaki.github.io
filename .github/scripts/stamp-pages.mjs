// Give local scripts/styles a fresh URL for every Pages deployment. Only the
// staged artifact is changed; source files keep their readable development URLs.
import {readdir, readFile, writeFile} from 'node:fs/promises';
import {extname, join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function versionReferences(source, release){
  return source.replace(/(["'`])((?:\.\.?\/)[^"'`\s<>]*\.(?:m?js|css)(?:\?[^"'`\s<>#]*)?(?:#[^"'`\s<>]*)?)\1/g, (match, quote, path) => {
    if(path.includes('${'))return match;
    const url=new URL(path, 'https://build.invalid/');
    url.searchParams.set('v', release);
    return quote+path.split(/[?#]/)[0]+url.search+url.hash+quote;
  });
}

export async function stampPages(directory, release){
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(release||''))throw new Error('A valid deployment version is required');
  const root=resolve(directory);
  const releasePath=join(root, 'hollowstead/src/release.mjs');
  const releaseSource=await readFile(releasePath, 'utf8');
  if(!releaseSource.includes("export const RELEASE = 'development';"))throw new Error('Missing development release marker');
  async function visit(directory){
    for(const entry of await readdir(directory, {withFileTypes:true})){
      const path=join(directory, entry.name);
      if(entry.isDirectory())await visit(path);
      else if(entry.isFile()&&['.html','.js','.mjs','.css'].includes(extname(path))){
        const source=await readFile(path, 'utf8');
        const stamped=versionReferences(source, release);
        if(stamped!==source)await writeFile(path, stamped);
      }
    }
  }
  await visit(root);
  await writeFile(releasePath, releaseSource.replace("export const RELEASE = 'development';", `export const RELEASE = '${release}';`));
  await writeFile(join(root, 'hollowstead/version.json'), JSON.stringify({version:release})+'\n');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [, , directory, release]=process.argv;
  if(!directory)throw new Error('Usage: node stamp-pages.mjs <staged-site> <release>');
  await stampPages(directory, release);
}
