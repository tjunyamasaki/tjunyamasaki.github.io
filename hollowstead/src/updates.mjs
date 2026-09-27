import {RELEASE} from './release.mjs?v=harvest-18';

/** A small uncached check; never reload while playing or joining a camp. */
export function createUpdateChecker({
  release=RELEASE,
  canReload,
  fetchVersion=(url, options)=>fetch(url, options),
  pageUrl=()=>location.href,
  reload=url=>location.replace(url),
  now=()=>Date.now(),
}={}){
  let checking=false, navigating=false;
  return async function checkForUpdate(){
    if(release==='development'||checking||navigating||!canReload())return false;
    checking=true;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(), 4000);
    try{
      const url=new URL('../version.json', import.meta.url);
      url.searchParams.set('check', String(now()));
      const response=await fetchVersion(url, {cache:'no-store', signal:controller.signal});
      if(!response.ok)return false;
      const {version}=await response.json();
      if(typeof version!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(version)||version===release||!canReload())return false;
      const next=new URL(pageUrl());
      // If a CDN briefly serves old HTML during rollout, do not reload in a loop.
      const attempted=Number(next.searchParams.get('_updated'));
      if(next.searchParams.get('_release')===version&&now()-attempted<60000)return false;
      next.searchParams.set('_release', version);
      next.searchParams.set('_updated', String(now()));
      navigating=true;
      reload(next.href);
      return true;
    }catch{
      // Offline, a missing manifest, or a deployment in progress must not block play.
      return false;
    }finally{
      clearTimeout(timeout);
      checking=false;
    }
  };
}
