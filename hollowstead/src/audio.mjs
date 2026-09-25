// Optional theme files replace these small synthesized cues without simulation changes.
export class Sound {
  constructor(theme){this.theme=theme;this.enabled=true;this.context=null;this.last=0;this.clips=new Map();}
  unlock(){if(!this.enabled)return;try{this.context??=new (window.AudioContext||window.webkitAudioContext)();void this.context.resume();}catch{}}
  play(type){
    if(!this.enabled)return;const source=this.theme.audio?.[type];if(source){let a=this.clips.get(type);if(!a){a=new Audio(source);this.clips.set(type,a);}a.currentTime=0;a.volume=.35;void a.play().catch(()=>{});return;}
    if(!this.context||this.context.state!=='running')return;const t=this.context.currentTime;if(t-this.last<.07)return;this.last=t;
    if(type==='bell'){
      for(const [frequency,volume] of [[220,.035],[440,.02],[613,.013],[837,.007]]){
        const osc=this.context.createOscillator(),gain=this.context.createGain();osc.type='sine';osc.frequency.setValueAtTime(frequency,t);
        gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(volume,t+.012);gain.gain.exponentialRampToValueAtTime(.0001,t+1.05);
        osc.connect(gain);gain.connect(this.context.destination);osc.start(t);osc.stop(t+1.06);
      }
      return;
    }
    const tones={hit:[130,70,.1,'triangle'],swing:[180,60,.12,'sawtooth'],hurt:[100,40,.22,'sawtooth'],loot:[500,850,.16,'sine'],craft:[420,650,.22,'triangle'],build:[180,550,.35,'triangle'],heal:[600,950,.2,'sine'],phase:[330,110,.7,'sine'],kill:[160,55,.25,'triangle'],dash:[250,90,.12,'sine'],bolt:[720,180,.16,'sine'],impact:[70,30,.35,'triangle']};
    const [from,to,duration,wave]=tones[type]||[300,400,.15,'sine'];const osc=this.context.createOscillator(),gain=this.context.createGain();osc.type=wave;osc.frequency.setValueAtTime(from,t);osc.frequency.exponentialRampToValueAtTime(to,t+duration);gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.065,t+.012);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);osc.connect(gain);gain.connect(this.context.destination);osc.start(t);osc.stop(t+duration+.01);
  }
}
