import { registerMagicModule } from './registry.mjs?v=harvest-13';

const SPECS = [
  'barrow-rattle.mjs',
  'cinder-staff.mjs',
  'widows-needle.mjs',
  'spirit-fan.mjs',
];

export async function loadMagicModules(){
  const loaded = [];
  for(const name of SPECS){
    const url = new URL(`./${name}`, import.meta.url);
    try{
      const mod = await import(url.href);
      const record = {
        magicPack: mod.magicPack,
        use: mod.use,
        step: mod.step,
        skeleton: mod.skeleton,
        spawn: mod.spawn,
        sprites: mod.sprites,
        art: mod.art,
        visuals: mod.visuals,
        moduleUrl: url.href,
      };
      if(registerMagicModule(record)) loaded.push(record);
    }catch(error){
      if(error?.code !== 'ERR_MODULE_NOT_FOUND' && !/404|Failed to fetch|not found/i.test(String(error?.message || error))){
        console.error(`Hollowstead magic module ${name} failed to load.`, error);
      }
    }
  }
  return loaded;
}
