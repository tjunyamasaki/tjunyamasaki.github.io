// The "Surprise me" capsule machine: crank, drop, wobble, crack open, reveal.
const LINES={
  common:'A classic. Good pull.',
  rare:'Ooh, a rare one.',
  epic:'Epic pull! The jar is impressed.',
  legendary:'LEGENDARY. Frame this moment.',
};

export function createCapsule({games,rng,rollRarity,pickIndex,audio,buzz,reduced,setPortrait,onSpin}){
  const $=id=>document.getElementById(id);
  const dlg=$('capsule'), machine=$('machine'), crank=$('crank'), drop=$('ball-drop'), prize=$('prize'), confetti=$('confetti'), sub=$('capsule-sub');
  let last=-1, busy=false, timers=[];

  const balls=$('balls');
  for(let i=0;i<14;i++){
    const ball=document.createElement('span'), row=Math.floor(i/5);
    ball.style.setProperty('--c',games[(i*4)%games.length].color);
    ball.style.setProperty('--r',`${Math.floor(rng()*360)}deg`);
    ball.style.left=`${8+(i%5)*33+(row%2)*14+rng()*6}px`;
    ball.style.top=`${130-row*30+rng()*6}px`;
    balls.append(ball);
  }

  const later=(ms,fn)=>timers.push(setTimeout(fn,reduced()?Math.min(ms,150):ms));
  function reset(){
    timers.forEach(clearTimeout);timers=[];busy=false;
    machine.classList.remove('turning');machine.hidden=false;
    drop.className='ball-drop';prize.hidden=true;prize.className='prize';confetti.replaceChildren();
    crank.disabled=false;sub.textContent='Turn the crank. Something is in there.';
    setPortrait(null);
  }
  function rain(count){
    for(let i=0;i<count;i++){
      const bit=document.createElement('i');
      bit.style.cssText=`--x:${rng()*100}%;--c:${games[Math.floor(rng()*games.length)].color};--d:${rng()*.5}s;--t:${1.4+rng()*1.2}s;--dx:${(rng()-.5)*120}px;--rot:${(rng()-.5)*900}deg`;
      confetti.append(bit);
    }
  }
  function spin(){
    if(busy)return;
    busy=true;crank.disabled=true;
    const index=pickIndex(rng,games.length,last), game=games[index], rarity=rollRarity(rng);
    last=index;
    audio.play('crank');buzz(15);
    machine.classList.add('turning');sub.textContent='Clunk… clunk…';
    later(750,()=>{machine.classList.remove('turning');drop.style.setProperty('--c',game.color);drop.classList.add('dropping');audio.play('plop');});
    later(1700,()=>{drop.classList.add('wobble');audio.play('bump',40);sub.textContent='It is wiggling…';});
    later(2600,()=>{drop.classList.add('open');audio.play('pop');buzz([10,30,20]);});
    later(2900,()=>{
      machine.hidden=true;prize.hidden=false;prize.className=`prize tier-${rarity.tier}`;
      prize.style.setProperty('--c',game.color);
      $('prize-rarity').textContent=`${'★'.repeat(rarity.stars)} ${rarity.label}`;
      $('prize-name').textContent=game.name;
      $('prize-blurb').textContent=game.blurb;
      $('prize-play').href=game.href;
      sub.textContent=LINES[rarity.tier];
      setPortrait(game);
      audio.play('fanfare',rarity.stars);
      if(rarity.stars>=3){rain(rarity.stars===4?70:34);buzz([20,40,20,40,60]);}
      onSpin(game,rarity);
      busy=false;
    });
  }

  crank.addEventListener('click',spin);
  machine.querySelector('.dome').addEventListener('click',spin);
  $('again').addEventListener('click',()=>{reset();spin();});
  dlg.querySelector('[data-close]').addEventListener('click',()=>dlg.close());
  dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close();});
  dlg.addEventListener('close',reset);
  return {open(){reset();dlg.showModal();}};
}
