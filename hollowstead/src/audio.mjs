// Optional theme files replace these small synthesized cues without simulation changes.
import {cachedSrc} from './assets.mjs?v=harvest-18';
export class Sound {
  constructor(theme){this.theme=theme;this.enabled=true;this.context=null;this.last=0;this.clips=new Map();}
  unlock(){if(!this.enabled)return;try{this.context??=new (window.AudioContext||window.webkitAudioContext)();void this.context.resume();}catch{}}
  /** One synthesized partial: a pitch sweep with a quick attack and an exponential tail. */
  sweep(from,to,duration,wave='sine',volume=.05,delay=0){
    const t=this.context.currentTime+delay,osc=this.context.createOscillator(),gain=this.context.createGain();
    osc.type=wave;osc.frequency.setValueAtTime(from,t);osc.frequency.exponentialRampToValueAtTime(Math.max(20,to),t+duration);
    gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(volume,t+.012);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    osc.connect(gain);gain.connect(this.context.destination);osc.start(t);osc.stop(t+duration+.02);
  }
  /** Weapon skills and their big moments (src/skills.mjs, src/fx). Rare, so they skip the shared throttle. */
  weapon(type,ev={}){
    const rank=Math.max(1,Math.min(5,ev.rank||1));
    if(type==='skill'){
      this.sweep(220,660,.45,'sawtooth',.028);this.sweep(330,990,.5,'triangle',.03,.03);this.sweep(660,1760,.35,'sine',.02,.08);
      if(rank>=3)this.sweep(1320,2640,.3,'sine',.012,.16);
      return true;
    }
    if(type==='starfall'||type==='mark')return false;
    const fx=type==='fx'?ev.fx:type;
    const BOOM=['meteor','heartstar','smash','slam','eruption','graveburst','soulburst','maw','foxspirit','boneburst','gale','fireball','pumpkin','shatter','frostnova','hornblast','firering','vial','web'];
    if(BOOM.includes(fx)){
      const big=fx==='heartstar'||fx==='smash'||fx==='maw'||fx==='foxspirit';
      this.sweep(big?120:150,big?32:45,big?.8:.4,'sine',big?.09:.055);this.sweep(big?80:110,40,big?.6:.3,'triangle',.04);
      if(fx==='meteor'||fx==='heartstar')for(let i=0;i<Math.min(4,rank);i++)this.sweep(1480+i*420,2200+i*300,.25,'sine',.012,.02+i*.03);
      if(fx==='frostnova'||fx==='shatter')this.sweep(2600,1800,.3,'triangle',.015,.02);
      return true;
    }
    if(fx==='skybolt'){this.sweep(1800,120,.2,'sawtooth',.03);this.sweep(90,40,.35,'triangle',.05,.02);return true;}
    if(fx==='toll'){for(const [f,v] of [[196,.04],[392,.022],[587,.014]])this.sweep(f,f*.985,1.1,'sine',v);return true;}
    if(['spin','cut','xslash','reap','moonwave','lance','charge','lanceshot','flock','chains','tempest','cyclone'].includes(fx)){
      if(ev.end)return true;
      this.sweep(900,280,.18,'sawtooth',.02);this.sweep(420,160,.2,'triangle',.02,.01);return true;
    }
    return false;
  }
  play(type,ev){
    if(type==='strike')return;
    if(this.enabled&&this.context&&this.context.state==='running'&&!this.theme.audio?.[type]&&(type==='skill'||type==='fx'||type==='starfall')){
      if(type==='starfall'){const t=this.context.currentTime;if(t-(this.lastStar||0)<.12)return;this.lastStar=t;const r=Math.max(1,Math.min(5,ev?.rank||1));this.sweep(140,45,.45,'sine',.05);for(let i=0;i<Math.min(3,r);i++)this.sweep(1760+i*520,2400+i*380,.22,'sine',.011,.02+i*.035);return;}
      if(this.weapon(type,ev))return;
      return;
    } // clean strikes and trinket moments: ui/rhythm.mjs plays its own cue at the tap, without the event delay
    if(!this.enabled)return;const source=this.theme.audio?.[type];if(source){let a=this.clips.get(type);if(!a){a=new Audio(cachedSrc(source));this.clips.set(type,a);}a.currentTime=0;a.volume=.35;void a.play().catch(()=>{});return;}
    if(!this.context||this.context.state!=='running')return;const t=this.context.currentTime;if(t-this.last<.07)return;this.last=t;
    if(type==='mooncast'||type==='mooncatch'||type==='moonsnap'){
      // Hollow bone whistle on the throw, a rising three-tooth catch, a low jaw-clack at supper.
      if(type==='mooncast'){
        this.sweep(ev?.feast?260:640,ev?.feast?940:220,ev?.feast?.45:.28,'triangle',.025);
        this.sweep(1300,460,.16,'sine',.012,.05);return;
      }
      if(type==='mooncatch'){
        const f=392*Math.pow(2,Math.max(0,Math.min(3,ev?.teeth||0))/6);
        this.sweep(f,f*1.01,.22,'sine',.02);this.sweep(f*1.5,f*1.5,.25,'triangle',.009,.04);
        if(ev?.teeth===3)this.sweep(f*2,f*2,.38,'sine',.012,.08);return;
      }
      this.sweep(125,35,.55,'sine',.075);this.sweep(660,110,.15,'square',.013);
      this.sweep(880,440,.4,'triangle',.018,.07);return;
    }
    if(type==='foxfire'||type==='foxburst'){
      // A small haunted shrine chime; staggered partials echo the nine tails.
      const burst=type==='foxburst';
      for(const [i,frequency] of (burst?[196,392,587,784]:[587,784,1175]).entries()){
        const start=t+i*.035,duration=burst?.55:.38,osc=this.context.createOscillator(),gain=this.context.createGain();
        osc.type=i===0&&burst?'triangle':'sine';osc.frequency.setValueAtTime(frequency,start);osc.frequency.exponentialRampToValueAtTime(frequency*(burst?.55:1.035),start+duration);
        gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.026/(i+1),start+.009);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
        osc.connect(gain);gain.connect(this.context.destination);osc.start(start);osc.stop(start+duration+.01);
      }
      return;
    }
    if(type.startsWith('coffin')){
      // The Pallbearer's Flail: a chain whoosh that rises with the spin, wooden thuds with an iron clank,
      // a wail when the lid bangs open, and a grave-shaking slam.
      const s=Math.min(1,(ev?.speed||8)/18);
      if(type==='coffinheave'||type==='coffinthrow'){this.sweep(200+s*300,90,.26,'triangle',.018+.014*s);this.sweep(1500,700,.12,'square',.004,.03);return;}
      if(type==='coffinhit'){const hard=!!ev?.hard;this.sweep(hard?150:190,48,hard?.3:.18,'sine',hard?.07:.045);this.sweep(hard?620:760,300,.08,'square',ev?.chain?.005:.012);return;}
      if(type==='coffinshock'){this.sweep(520,1040,.4,'sine',.014);this.sweep(780,1560,.35,'sine',.008,.05);return;}
      if(type==='coffinslam'){this.sweep(110,32,.7,'sine',.09);this.sweep(300,60,.4,'sawtooth',.02);for(const [f,d] of [[660,.05],[880,.12],[990,.2]])this.sweep(f,f*1.6,.6,'sine',.01,d);return;}
      if(type==='coffinyank'){for(let i=0;i<5;i++)this.sweep(1800-i*120,900,.05,'square',.006,i*.035);return;}
      if(type==='coffinland'){this.sweep(160,40,.35,'sine',.07);this.sweep(420,120,.2,'triangle',.02);return;}
      return;
    }
    if(type==='gloomcast'||type==='gloomgrab'){
      // A low swell as the shadow spreads; a crunching squeeze when a hand closes.
      const grab=type==='gloomgrab';
      const notes=grab?[[140,'square',.09,.03],[70,'sawtooth',.26,.035],[330,'triangle',.12,.012]]:[[55,'sine',.5,.04],[82,'triangle',.45,.02],[247,'sine',.3,.008]];
      for(const [i,[frequency,wave,duration,volume]] of notes.entries()){
        const start=t+i*(grab?.03:.05),osc=this.context.createOscillator(),gain=this.context.createGain();
        osc.type=wave;osc.frequency.setValueAtTime(frequency,start);osc.frequency.exponentialRampToValueAtTime(frequency*(grab?.45:1.5),start+duration);
        gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(volume,start+(grab?.006:.06));gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
        osc.connect(gain);gain.connect(this.context.destination);osc.start(start);osc.stop(start+duration+.01);
      }
      return;
    }
    if(type==='plaguevial'||type==='plaguebreak'){
      const shatter=type==='plaguebreak';
      const notes=shatter?[[2093,'sine',.12,.02],[2637,'sine',.1,.014],[3136,'sine',.08,.01],[92,'sawtooth',.42,.03]]:[[420,'square',.07,.018],[980,'sine',.12,.02]];
      for(const [i,[frequency,wave,duration,volume]] of notes.entries()){
        const start=t+i*(shatter?.025:.04),osc=this.context.createOscillator(),gain=this.context.createGain();
        osc.type=wave;osc.frequency.setValueAtTime(frequency,start);osc.frequency.exponentialRampToValueAtTime(frequency*(wave==='sawtooth'?.5:shatter?.7:1.35),start+duration);
        gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(volume,start+.008);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
        osc.connect(gain);gain.connect(this.context.destination);osc.start(start);osc.stop(start+duration+.01);
      }
      return;
    }
    if(type==='bell'){
      for(const [frequency,volume] of [[220,.035],[440,.02],[613,.013],[837,.007]]){
        const osc=this.context.createOscillator(),gain=this.context.createGain();osc.type='sine';osc.frequency.setValueAtTime(frequency,t);
        gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(volume,t+.012);gain.gain.exponentialRampToValueAtTime(.0001,t+1.05);
        osc.connect(gain);gain.connect(this.context.destination);osc.start(t);osc.stop(t+1.06);
      }
      return;
    }
    const tones={hit:[130,70,.1,'triangle'],swing:[180,60,.12,'sawtooth'],hurt:[100,40,.22,'sawtooth'],loot:[500,850,.16,'sine'],craft:[420,650,.22,'triangle'],build:[180,550,.35,'triangle'],heal:[600,950,.2,'sine'],phase:[330,110,.7,'sine'],kill:[160,55,.25,'triangle'],dash:[250,90,.12,'sine'],bolt:[720,180,.16,'sine'],impact:[70,30,.35,'triangle'],dodge:[900,1500,.14,'sine'],swap:[520,380,.07,'square'],rankup:[520,1040,.32,'triangle'],ashes:[260,70,.32,'triangle'],portal:[140,260,.3,'sine'],quake:[55,28,.42,'triangle'],splat:[210,90,.18,'sine'],charge:[160,320,.2,'sawtooth']};
    const [from,to,duration,wave]=tones[type]||[300,400,.15,'sine'];const osc=this.context.createOscillator(),gain=this.context.createGain();osc.type=wave;osc.frequency.setValueAtTime(from,t);osc.frequency.exponentialRampToValueAtTime(to,t+duration);gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.065,t+.012);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);osc.connect(gain);gain.connect(this.context.destination);osc.start(t);osc.stop(t+duration+.01);
  }
}
