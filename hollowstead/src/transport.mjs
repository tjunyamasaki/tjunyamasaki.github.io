import {SNAPSHOT_CHUNK_CHARS, SNAPSHOT_MAX_CHUNKS, SEND_BUFFER_GUARD} from './contracts.mjs?v=harvest-13';

// A partially queued snapshot is always finished before starting a newer one.
// bufferedamountlow resumes at exactly the unsent chunk; actions have priority.
export function createWriter(channel,{onError=()=>{}}={}){
  let frame=null,part=0,stopped=false,pumping=false;
  const controls=[],encoder=new TextEncoder();
  function pump(){
    if(stopped||pumping||channel.readyState!=='open')return;
    pumping=true;
    try{
      while(controls.length||frame){
        const control=controls[0];
        const packet=control||JSON.stringify({type:'chunk',part:frame.part,i:frame.i,count:frame.count,data:frame.data.slice(frame.i*SNAPSHOT_CHUNK_CHARS,(frame.i+1)*SNAPSHOT_CHUNK_CHARS)});
        if(channel.bufferedAmount+encoder.encode(packet).length>SEND_BUFFER_GUARD)break;
        channel.send(packet);
        if(control)controls.shift();
        else if(++frame.i===frame.count)frame=null;
      }
    }catch{stopped=true;onError('Connection could not send expedition data.');}
    finally{pumping=false;}
  }
  channel.bufferedAmountLowThreshold=SEND_BUFFER_GUARD/3;
  channel.onbufferedamountlow=pump;
  return {
    send(value){
      if(stopped)return false;
      if(controls.length>=64){onError('Connection is too congested. Rejoin the camp.');return false;}
      controls.push(JSON.stringify(value));pump();return true;
    },
    snapshot(value){
      if(stopped)return false;
      pump();
      if(frame)return false;
      const data=JSON.stringify(value),count=Math.ceil(data.length/SNAPSHOT_CHUNK_CHARS);
      if(count<1||count>SNAPSHOT_MAX_CHUNKS){
        onError('This expedition is too large to synchronize. The host can keep its save and continue solo.');
        return false;
      }
      frame={part:++part,data,count,i:0};pump();return true;
    },
    pump,
    close(){stopped=true;frame=null;controls.length=0;channel.onbufferedamountlow=null;},
    get pendingFrame(){return !!frame;},
  };
}
