// Tiny procedural sound box. Silent until the viewer turns it on.
const PENT=[0,2,4,7,9];
const note=(i,base=523.25)=>base*2**((PENT[((i%5)+5)%5]+12*Math.floor(i/5))/12);

export function createAudio(){
  let ctx=null, master=null, on=false, nextChime=0;
  async function setEnabled(value){
    try{
      if(value&&!ctx){
        const AC=window.AudioContext||window.webkitAudioContext;
        if(!AC)return false;
        ctx=new AC();master=ctx.createGain();master.gain.value=.55;master.connect(ctx.destination);
      }
      if(ctx){if(value)await ctx.resume();else await ctx.suspend();}
      on=!!value&&!!ctx;
    }catch{on=false;}
    return on;
  }
  function tone(freq,dur,{type='sine',gain=.15,attack=.006,glide=0,delay=0}={}){
    if(!on)return;
    const t=ctx.currentTime+delay, o=ctx.createOscillator(), g=ctx.createGain();
    o.type=type;o.frequency.setValueAtTime(freq,t);
    if(glide)o.frequency.exponentialRampToValueAtTime(Math.max(20,freq*glide),t+dur);
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(gain,t+attack);g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(g).connect(master);o.start(t);o.stop(t+dur+.05);
  }
  function noise(dur,{gain=.12,freq=900,q=1,delay=0}={}){
    if(!on)return;
    const t=ctx.currentTime+delay, len=Math.ceil(ctx.sampleRate*dur), buf=ctx.createBuffer(1,len,ctx.sampleRate), data=buf.getChannelData(0);
    for(let i=0;i<len;i++)data[i]=(Math.random()*2-1)*(1-i/len);
    const src=ctx.createBufferSource(), f=ctx.createBiquadFilter(), g=ctx.createGain();
    src.buffer=buf;f.type='bandpass';f.frequency.value=freq;f.Q.value=q;g.gain.value=gain;
    src.connect(f).connect(g).connect(master);src.start(t);
  }
  function play(name,arg=0){
    if(!on)return;
    switch(name){
      case 'poke':tone(note(arg,330),.2,{type:'triangle',glide:1.6,gain:.16});break;
      case 'boing':tone(180,.32,{glide:2.6,gain:.12});break;
      case 'bump':tone(140+arg,.09,{type:'triangle',glide:.6,gain:.07});break;
      case 'plop':tone(720,.14,{glide:.35,gain:.12});break;
      case 'eat':tone(note(arg+3),.08,{type:'square',gain:.04});tone(note(arg+5),.12,{type:'square',gain:.04,delay:.07});break;
      case 'chime':[0,2,4].forEach((k,j)=>tone(note(arg+k,660),.7,{delay:j*.09,gain:.07}));break;
      case 'sparkle':for(let i=0;i<7;i++)tone(note(i+5,700),.35,{delay:i*.055,gain:.05});break;
      case 'shake':noise(.5,{freq:420,gain:.18});tone(90,.4,{type:'triangle',glide:1.8,gain:.08});break;
      case 'glass':tone(2100,.25,{gain:.05});tone(2630,.2,{gain:.04,delay:.04});break;
      case 'crank':for(let i=0;i<4;i++)noise(.03,{freq:2600,q:4,gain:.15,delay:i*.11});break;
      case 'pop':tone(880,.1,{glide:.3,gain:.12});noise(.06,{freq:1800,gain:.08});break;
      case 'fanfare':for(let i=0;i<=arg*2+2;i++)tone(note(i+2,523.25),.4,{type:'triangle',delay:i*.08,gain:.07});break;
      case 'wish':[0,4,7,11].forEach((k,j)=>tone(440*2**(k/12),1.6,{delay:j*.12,gain:.05,attack:.2}));break;
      case 'dirt':noise(.12,{freq:300,gain:.12});break;
      case 'time':for(let i=0;i<5;i++)tone(note(9-i,440),.3,{delay:i*.07,gain:.06});break;
    }
  }
  // A slow music-box twinkle while sound is on; sparser at night.
  function ambient(t,night){
    if(!on||t<nextChime)return;
    nextChime=t+(night>.5?5:3)+Math.random()*4;
    tone(note(Math.floor(Math.random()*8),night>.5?392:523.25),1.4,{gain:.03,attack:.02});
  }
  return {setEnabled,play,ambient,get on(){return on;}};
}
