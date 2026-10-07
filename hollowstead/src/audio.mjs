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
    const BOOM=['meteor','heartstar','smash','slam','eruption','graveburst','soulburst','gloomfist','deathreap','foxspirit','boneburst','gale','fireball','pumpkin','shatter','frostnova','ashcollapse','huntfall','vial','web'];
    if(BOOM.includes(fx)){
      const big=fx==='heartstar'||fx==='smash'||fx==='gloomfist'||fx==='deathreap'||fx==='huntfall'||fx==='ashcollapse'||fx==='foxspirit';
      this.sweep(big?120:150,big?32:45,big?.8:.4,'sine',big?.09:.055);this.sweep(big?80:110,40,big?.6:.3,'triangle',.04);
      if(fx==='meteor'||fx==='heartstar')for(let i=0;i<Math.min(4,rank);i++)this.sweep(1480+i*420,2200+i*300,.25,'sine',.012,.02+i*.03);
      if(fx==='frostnova'||fx==='shatter')this.sweep(2600,1800,.3,'triangle',.015,.02);
      return true;
    }
    if(fx==='skybolt'){this.sweep(1800,120,.2,'sawtooth',.03);this.sweep(90,40,.35,'triangle',.05,.02);return true;}
    if(fx==='toll'){for(const [f,v] of [[196,.04],[392,.022],[587,.014]])this.sweep(f,f*.985,1.1,'sine',v);return true;}
    if(['spin','cut','xslash','moonwave','lance','ghostrider','lanceshot','flock','chains','tempest','cyclone'].includes(fx)){
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
    // Refinement (src/refine.mjs): a hammer on the bench, then one chime per step of rarity; a critical hit rings sharp.
    if(type==='refine'){const tier=Math.max(0,Math.min(4,ev?.tier|0));this.sweep(240,90,.12,'triangle',.05);for(let i=0;i<=tier;i++)this.sweep(660*1.26**i,880*1.26**i,.26,'sine',.014+.004*i,.1+i*.07);return;}
    // Dismantling loot into ichor (src/salvage.mjs): a crack, then a falling drip per step of rarity.
    if(type==='salvage'){const tier=Math.max(0,Math.min(4,['common','uncommon','rare','epic','legendary'].indexOf(ev?.rarity)));this.sweep(900,160,.1,'square',.012);this.sweep(180,60,.18,'triangle',.05);for(let i=0;i<=tier;i++)this.sweep(1320/1.2**i,520/1.2**i,.18,'sine',.012,.08+i*.06);return;}
    // Dungeons: the party goes down the stairs. A falling chime.
    if(type==='descend'){this.sweep(520,130,.9,'sine',.05);for(const [i,f] of [784,659,523,392].entries())this.sweep(f,f*.985,.5,'sine',.013,.08+i*.12);return;}
    if(type==='damage'&&ev?.crit){this.sweep(1500,2200,.08,'square',.01);this.sweep(320,110,.12,'triangle',.05);return;}
    // Kagekiri (src/magic/katana.mjs): a bright shing on every draw, the sheath's click and the cuts snapping,
    // a breath of wind as the wielder vanishes, a cut per line of the Hundred-Line Draw, a rising note on stepping out.
    if(type==='katadraw'){const last=ev?.n===2;this.sweep(2600,5400,.07,'sawtooth',.007);this.sweep(1320,760,last?.28:.18,'sine',last?.016:.011);this.sweep(320,110,.1,'triangle',.03);return;}
    if(type==='katasnap'){const n=Math.min(6,ev?.lines?.length||1),big=!!ev?.skill;this.sweep(3400,3320,.3,'sine',.022);this.sweep(5100,5040,.2,'sine',.009,.012);
      for(let i=0;i<n;i++)this.sweep(2000-i*120,420,.09,'sawtooth',.009,.07+i*(big?.03:.045));this.sweep(170,48,big?.5:.3,'triangle',big?.08:.05,.06);return;}
    if(type==='katavanish'){this.sweep(900,140,.4,'sine',.03);this.sweep(2600,300,.28,'sawtooth',.007);return;}
    if(type==='kataline'){this.sweep(4400,1500,.06,'sawtooth',.006);this.sweep(1500+((ev?.n||0)%4)*90,900,.12,'sine',.007);return;}
    if(type==='kataappear'){this.sweep(300,960,.26,'sine',.022);this.sweep(2200,2240,.2,'sine',.006,.08);return;}
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
    // Thornmother's Heart: a whip crack as a vine flies, a crunching burst where vines cross (a deep thud for the heart).
    if(type==='vinelash'){this.sweep(2600,700,.07,'square',.008);this.sweep(320,140,.14,'triangle',.02,.02);return;}
    if(type==='thornbloom'){const big=!!ev?.heart;this.sweep(big?110:190,40,big?.6:.25,'sine',big?.08:.04);for(let i=0;i<3;i++)this.sweep(1600-i*250,600,.05,'square',.006,.02+i*.03);return;}
    // The Eye of the Deep: a rising hum as the gaze locks, a zap when it leaps, a swell and a fold for the abyss.
    if(type==='gaze'){this.sweep(220,440,.3,'sine',.018);return;}
    if(type==='gazejump'){this.sweep(1800,300,.12,'sawtooth',.012);return;}
    // The eye opens wider: a step up in pitch per stage; a stared-at foe bursts with a low wet thump.
    if(type==='gazestage'){const k=Math.max(1,ev?.stage|0);this.sweep(330*k,660*k,.25,'sine',.02+.01*k);if(k>=2)this.sweep(110,220,.5,'sawtooth',.012);return;}
    if(type==='gazerupture'){this.sweep(160,40,.35,'sine',.06);this.sweep(900,200,.18,'sawtooth',.012);return;}
    if(type==='abyss'){this.sweep(60,180,1.4,'sawtooth',.03);this.sweep(440,880,1.5,'sine',.01);return;}
    if(type==='abyssfold'){this.sweep(140,30,.8,'sine',.1);this.sweep(600,80,.4,'sawtooth',.02);return;}
    // Blasts on the ground (blasts.mjs): vents hiss and burst, stars whistle down, roots crack, the gaze sears.
    if(type==='blast'){const st=ev?.style;
      if(st==='vent'){this.sweep(160,50,.35,'sine',.05);this.sweep(2400,900,.18,'square',.004);return;}
      if(st==='star'){this.sweep(120,30,.6,'sine',.09);this.sweep(900,200,.3,'triangle',.02);return;}
      if(st==='gaze'){this.sweep(1400,500,.1,'sawtooth',.01);return;}
      if(st==='void'||st==='tendril'){this.sweep(90,40,.35,'sine',.05);return;}
      // The Shrine of Yomi's yokai: rain splashes, the neck whips, frost cracks, talismans flare.
      if(st==='rain'){this.sweep(700,240,.12,'sine',.03);this.sweep(2200,1400,.05,'triangle',.006);return;}
      if(st==='neck'){this.sweep(220,520,.14,'sawtooth',.02);return;}
      if(st==='frost'){this.sweep(2600,1800,.16,'triangle',.012);this.sweep(1300,900,.1,'sine',.01,.03);return;}
      if(st==='ofuda'){this.sweep(500,180,.2,'square',.018);return;}
      this.sweep(260,70,.18,'square',.02);this.sweep(1200,500,.06,'square',.005,.02);return;}
    // The great bosses: a roar when they rise or change, a rumble before their big patterns.
    if(type==='bossrise'||type==='bossphase'){this.sweep(70,40,1.4,'sawtooth',.06);this.sweep(140,60,1.2,'square',.02,.05);this.sweep(320,90,.9,'sine',.03,.1);return;}
    if(type==='bell'){for(const [i,f] of [392,587].entries())this.sweep(f,f*.995,1.1,'sine',.03,i*.02);this.sweep(1568,1560,.6,'triangle',.008);return;}
    if(type==='bossroar'){this.sweep(110,50,.7,'sawtooth',.035);return;}
    // Omens, moons and the vigil.
    if(type==='omen'){for(const [i,f] of [659,880,1319].entries())this.sweep(f,f*1.01,.7,'sine',.014,i*.12);return;}
    if(type==='riftclose'){this.sweep(880,110,.9,'sine',.04);return;}
    if(type==='omenfulfilled'){for(const [i,f] of [523,659,784,1047,1319].entries())this.sweep(f,f,i===4?1.1:.32,'triangle',.05,i*.13);this.sweep(1568,1580,1.2,'sine',.02,.65);return;}
    if(type==='mimic'){this.sweep(300,80,.15,'square',.05);this.sweep(260,60,.15,'square',.05,.12);return;}
    if(type==='brew'){for(let i=0;i<4;i++)this.sweep(300+i*90,600+i*90,.1,'sine',.015,i*.07);return;}
    if(type==='gilded'||type==='gildfall'){for(let i=0;i<(type==='gildfall'?6:3);i++)this.sweep(1800+i*220,2600+i*220,.12,'sine',.01,i*.05);return;}
    if(type==='rekindle'){this.sweep(80,320,.9,'sawtooth',.03);this.sweep(200,600,.8,'triangle',.02,.1);return;}
    if(type==='warp'){this.sweep(300,1200,.6,'sine',.03);this.sweep(600,1800,.5,'triangle',.015,.08);return;}
    if(type==='dread'){this.sweep(98,96,1.4,'sine',.05);this.sweep(147,145,1.2,'sine',.02,.05);return;}
    // Dread Ages (ages.mjs): a deep bell under a falling minor; thorns a dry rasp.
    if(type==='dreadage'){this.sweep(73,72,2.6,'sine',.07);this.sweep(110,109,2.2,'triangle',.03,.05);for(const [i,f] of [440,415,349,294].entries())this.sweep(f,f*.99,.6,'sine',.018,.4+i*.28);return;}
    if(type==='thorns'){this.sweep(1400,600,.07,'sawtooth',.008);return;}
    // Named weapons and ascension (mastery.mjs): a bright fanfare; a rising violet shimmer.
    if(type==='named'){for(const [i,f] of [392,523,659,784,1047].entries())this.sweep(f,f,i===4?1.2:.3,'triangle',.045,i*.11);this.sweep(1568,1572,1.1,'sine',.018,.55);return;}
    if(type==='weaponascend'){this.sweep(220,880,.9,'sine',.03);for(const [i,f] of [659,831,988,1319].entries())this.sweep(f,f*1.01,.45,'sine',.016,.2+i*.1);return;}
    if(type==='ascend'){for(const [i,f] of [392,523,659,784].entries())this.sweep(f,f*1.01,.5,'sine',.014,i*.12);return;}
    if(type.startsWith('lunar')){
      // The Hollow Moon: a low whoosh as it leaves, a hollow gulp and a cold chime when it swallows, fuller as it waxes.
      const phase=Math.max(0,Math.min(3,ev?.phase|0));
      if(type==='lunarthrow'){this.sweep(140,420,.22,'triangle',.02+.006*phase);this.sweep(900,1400,.16,'sine',.006,.04);return;}
      if(type==='lunarcrush'){const full=phase===3;this.sweep(260,55,full?.5:.32,'sine',full?.08:.05);this.sweep(640,160,.18,'triangle',.014);for(const [i,f] of [523,659,784,1047].slice(0,1+phase).entries())this.sweep(f,f*.985,.5,'sine',.012/(i+1),.06+i*.05);return;}
      if(type==='lunarnova'){this.sweep(120,28,1.1,'sine',.1);this.sweep(420,70,.6,'sawtooth',.018);for(const [i,f] of [392,523,659,784,1047].entries())this.sweep(f,f*1.5,.9,'sine',.012,.1+i*.06);return;}
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
    // The Grimoire of Ash: a papery whoosh as pages fly, a rip when a page tears out, a roar when a Chapter ignites.
    if(type==='ashthrow'||type==='ashchapterthrow'){const n=Math.min(7,ev?.n||3);for(let i=0;i<Math.min(4,n);i++)this.sweep(2400-i*200,900,.07,'square',.004,i*.04);this.sweep(300,700,.25,'triangle',.014);if(type==='ashchapterthrow')this.sweep(180,520,.4,'sawtooth',.014,.05);return;}
    if(type==='pagetear'){this.sweep(3200,1400,.09,'square',.006);this.sweep(1800,900,.06,'square',.004,.04);return;}
    if(type==='ashchapter'){this.sweep(120,40,.6,'sine',.08);this.sweep(420,120,.5,'sawtooth',.03);for(let i=0;i<3;i++)this.sweep(900+i*300,1600+i*300,.4,'triangle',.01,.05+i*.05);return;}
    // The Reaper's scythe: a cold whoosh; a reap is a wet cut and a soul's shriek falling away; Last Harvest tolls.
    // The Wightcaller horn: a horn call rising a step with each note; the knight's blows ring steel, the Gravefall shakes the ground.
    if(type==='hornblow'){const n=ev?.note|0,f=[146.8,174.6,220][n]||146.8;this.sweep(f,f*1.01,.42,'sawtooth',.03);this.sweep(f*1.5,f*1.51,.4,'triangle',.014,.02);return;}
    if(type==='knightstrike'){const n=ev?.note|0;if(n===2){this.sweep(130,36,.55,'sine',.08);this.sweep(380,90,.3,'sawtooth',.025);}else{this.sweep(n?520:880,n?160:240,.14,'sawtooth',.02);this.sweep(1900,1200,.09,'square',.006,.02);}return;}
    if(type==='reaperswing'){this.sweep(700,180,.22,'sawtooth',.018);this.sweep(1600,500,.16,'triangle',.008,.02);return;}
    if(type==='soulreap'){this.sweep(260,70,.18,'square',.03);this.sweep(1900,420,.5,'sine',.014,.05);return;}
    if(type==='gloomsqueeze'){const g=Math.max(1,ev?.grip|0);this.sweep(120+g*30,50,.22,'sawtooth',.03+.01*g);this.sweep(420,180,.1,'square',.012,.02);return;}
    if(type==='gloomcrush'){this.sweep(90,28,.55,'sine',.08);this.sweep(260,60,.3,'sawtooth',.03);for(let i=0;i<4;i++)this.sweep(1400-i*180,500,.06,'square',.006,.03+i*.03);return;}
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
    // Homestead (homestead.mjs): a thud of earth or timber, a pluck for a seed, a creak for a gate.
    if(type==='tile'){const k=String(ev?.tool||''),[f0,f1,d,w]=k==='harvest'?[520,880,.14,'sine']:k.startsWith('plant')?[760,980,.08,'sine']:k==='open'||k==='close'?[210,160,.22,'triangle']:k==='remove'?[260,120,.12,'triangle']:[170,95,.1,'triangle'];this.sweep(f0,f1,d,w,.05);return;}
    const tones={hit:[130,70,.1,'triangle'],swing:[180,60,.12,'sawtooth'],hurt:[100,40,.22,'sawtooth'],loot:[500,850,.16,'sine'],craft:[420,650,.22,'triangle'],build:[180,550,.35,'triangle'],heal:[600,950,.2,'sine'],phase:[330,110,.7,'sine'],kill:[160,55,.25,'triangle'],dash:[250,90,.12,'sine'],bolt:[720,180,.16,'sine'],impact:[70,30,.35,'triangle'],dodge:[900,1500,.14,'sine'],swap:[520,380,.07,'square'],rankup:[520,1040,.32,'triangle'],ashes:[260,70,.32,'triangle'],portal:[140,260,.3,'sine'],quake:[55,28,.42,'triangle'],splat:[210,90,.18,'sine'],charge:[160,320,.2,'sawtooth']};
    const [from,to,duration,wave]=tones[type]||[300,400,.15,'sine'];const osc=this.context.createOscillator(),gain=this.context.createGain();osc.type=wave;osc.frequency.setValueAtTime(from,t);osc.frequency.exponentialRampToValueAtTime(to,t+duration);gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.065,t+.012);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);osc.connect(gain);gain.connect(this.context.destination);osc.start(t);osc.stop(t+duration+.01);
  }
}
