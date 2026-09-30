// Replaced in the staged Pages artifact, never in the working source tree.
export const RELEASE = 'development';

/** Keep art cached within a release, but fetch fresh theme/art/audio after deploy. */
export function releaseAssetUrl(value, release=RELEASE, base=import.meta.url){
  const source=String(value);
  if(release==='development')return source;
  const url=new URL(source, base);
  if(!['http:','https:'].includes(url.protocol)||url.origin!==new URL(base).origin)return source;
  url.searchParams.set('release', release);
  return url.href;
}
