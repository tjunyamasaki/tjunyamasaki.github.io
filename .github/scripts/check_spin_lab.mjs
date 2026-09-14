// Deployment smoke check, not an application dependency or a unit-test suite.
// Runs against the staged Pages artifact to verify its actual relative paths.
import {createServer} from 'node:http';
import {readFile,stat,mkdir} from 'node:fs/promises';
import {resolve,extname,join,sep} from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(join(process.env.SPIN_CHECK_MODULES,'spin-check.cjs'));
const {chromium}=require('playwright');
const root=resolve('_site');
const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.png':'image/png'};
const server=createServer(async(req,res)=>{
  try{
    let file=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403).end();return;}
    if((await stat(file)).isDirectory())file=join(file,'index.html');
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(await readFile(file));
  }catch{res.writeHead(404).end('Not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,reducedMotion:'reduce'});
const page=await context.newPage();
const errors=[],missing=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400&&!r.url().endsWith('favicon.ico'))missing.push(r.url()+' '+r.status());});
const setRange=(selector,value)=>page.locator(selector).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
const check=(condition,message)=>{if(!condition)throw new Error(message);};
try{
  await page.goto(base+'/table-tennis-spin/',{waitUntil:'networkidle'});
  await page.waitForSelector('html[data-spin-lab-ready="true"]',{timeout:30000});
  check(!(await page.locator('#error').isVisible()),'WebGL scene failed to load');
  const first=await page.evaluate(()=>spinLabSnapshot());
  check(first.canvas.width>0&&first.canvas.height>0,'Canvas has no render size');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile page overflows horizontally');
  await mkdir('spin-lab-previews',{recursive:true});
  await page.screenshot({path:'spin-lab-previews/return-mobile.png',fullPage:true});
  for(const mode of ['spin','return','serve','bounce','compare']){
    await page.locator('[data-mode="'+mode+'"]').click();
    await page.waitForFunction(m=>spinLabSnapshot().mode===m,mode);
    await page.locator('#adjust').click();
    await page.locator('#adjust-dialog').waitFor({state:'visible'});
    if(mode==='spin'){
      await setRange('#control-w0',450);
      await setRange('#control-w1',-320);
    }else if(mode==='return'||mode==='serve'){
      await page.locator('#stroke-pad').press('ArrowRight');
      await page.locator('#contact-pad').press('ArrowUp');
      await setRange('#control-angle',15);
    }
    await page.locator('#adjust-dialog .sheet-done').click();
    await page.locator('#why').click();
    await page.locator('#why-dialog').waitFor({state:'visible'});
    await page.locator('#why-dialog [data-close]').click();
    await page.locator('#step').click();
    const snapshot=await page.evaluate(()=>spinLabSnapshot());
    check(snapshot.spin.every(Number.isFinite),'Invalid spin in '+mode);
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Overflow in '+mode);
    console.log('SMOKE '+mode+' '+JSON.stringify(snapshot));
  }
  await page.locator('[data-mode="spin"]').click();
  await page.locator('[data-axis="0"][data-sign="1"]').click();
  check((await page.evaluate(()=>spinLabSnapshot().spin))[0]===420,'Axis impulse did not add to existing spin');
  await page.locator('#settings').click();
  await page.locator('[data-overlay="components"]').check();
  await page.locator('#settings-dialog [data-close]').click();
  // Give the render loop a frame after the overlay change.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const shot=await page.screenshot({path:'spin-lab-previews/spin-mobile.jpg',type:'jpeg',quality:55,fullPage:true});
  console.log('SPIN_SCREENSHOT_MOBILE:'+shot.toString('base64'));
  await page.setViewportSize({width:1440,height:960});
  await page.locator('[data-mode="serve"]').click();
  await page.locator('#camera').selectOption('side');
  await setRange('#timeline',1.1);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.screenshot({path:'spin-lab-previews/serve-desktop.png',fullPage:true});
  await page.locator('[data-mode="compare"]').click();
  for(const name of ['High toss / low toss','Opposite incoming spin','Brush / hit through','Open / closed face','Left / right contact','Topspin / backspin','Sidespin / mixed spin']){
    await page.getByRole('button',{name,exact:true}).click();
    await setRange('#timeline',0.5);
    const snap=await page.evaluate(()=>spinLabSnapshot());
    check(snap.events.length===2,'Comparison is missing a second scenario');
  }
  const hub=await context.newPage();
  await hub.goto(base+'/links/');
  check(await hub.locator('a[href="../table-tennis-spin/"]').count()===1,'Hub link is missing');
  check(errors.length===0,'Browser errors: '+errors.join('; '));
  check(missing.length===0,'Missing local resources: '+missing.join('; '));
  console.log('Spin Lab browser smoke check passed: five modes, edits, vector addition, comparisons, paths, mobile layout and desktop render.');
}finally{
  await browser.close();await new Promise(r=>server.close(r));
}
