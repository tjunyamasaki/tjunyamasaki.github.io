// Original, quiet synthesized sound. Nothing downloads; playback requires opt-in.
export function createAudio() {
  let context, master, enabled=false, suspended=false;
  function initialize() {
    if(context)return;
    const AudioContext=window.AudioContext || window.webkitAudioContext;
    if(!AudioContext)throw new Error('Web Audio unavailable');
    context=new AudioContext();master=context.createGain();master.gain.value=0;master.connect(context.destination);
    for(const frequency of [130.81,196,261.63]) {
      const osc=context.createOscillator(),gain=context.createGain();
      osc.type='sine';osc.frequency.value=frequency;gain.gain.value=.012;
      osc.connect(gain);gain.connect(master);osc.start();
    }
  }
  async function setEnabled(value) {
    if(value) {initialize();if(!suspended)await context.resume();}
    enabled=value;
    if(master)master.gain.setTargetAtTime(enabled && !suspended ? .65 : 0,context.currentTime,.12);
    return enabled;
  }
  function pause(value) {
    suspended=value;
    if(!context)return;
    if(value) {void context.suspend().catch(()=>{});}
    else if(enabled) {void context.resume().catch(()=>{});}
    master.gain.setTargetAtTime(enabled && !suspended ? .65 : 0,context.currentTime,.1);
  }
  function note(frequency,delay=0,length=.85,volume=.1) {
    if(!enabled||!context||suspended)return;
    const start=context.currentTime+delay,osc=context.createOscillator(),gain=context.createGain();
    osc.type='sine';osc.frequency.setValueAtTime(frequency,start);
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(volume,start+.018);gain.gain.exponentialRampToValueAtTime(.0001,start+length);
    osc.connect(gain);gain.connect(master);osc.start(start);osc.stop(start+length+.03);
    osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
  function event(e) {
    if(e.type==='collected')note([523.25,659.25,783.99][e.carried-1]);
    if(e.type==='kindled'||e.type==='offered') [261.63,329.63,392,523.25].forEach((n,i)=>note(n,i*.13,2,.075));
    if(e.type==='completed') [523.25,659.25,783.99,1046.5,1174.66,1567.98].forEach((n,i)=>note(n,.7+i*.23,2.5,.055));
  }
  return {setEnabled,pause,event};
}
