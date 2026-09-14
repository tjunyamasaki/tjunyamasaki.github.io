export const SPINS = [
  {id:'none',name:'No spin',w:[0,0,0]},
  {id:'top',name:'Topspin',w:[360,0,0]},
  {id:'back',name:'Backspin',w:[-360,0,0]},
  {id:'left',name:'Left sidespin',w:[0,-360,0]},
  {id:'right',name:'Right sidespin',w:[0,360,0]},
  {id:'top-left',name:'Top-left',w:[280,-280,0]},
  {id:'top-right',name:'Top-right',w:[280,280,0]},
  {id:'back-left',name:'Back-left',w:[-280,-280,0]},
  {id:'back-right',name:'Back-right',w:[-280,280,0]},
  {id:'cork',name:'Tilted / corkscrew',w:[100,190,320]},
];
export const SERVES = [
  {name:'Pendulum',direction:205,angle:14,brush:.86,speed:5.2,contactX:-.18,contactY:-.25},
  {name:'Reverse pendulum',direction:335,angle:14,brush:.86,speed:5.2,contactX:.18,contactY:-.25},
  {name:'Heavy backspin',direction:270,angle:30,brush:.92,speed:9.8,contactX:0,contactY:-.35},
  {name:'Sidespin',direction:180,angle:7,brush:.83,speed:4.6,contactX:-.18,contactY:0},
  {name:'Top-sidespin',direction:115,angle:0,brush:.72,speed:4.4,contactX:0,contactY:0},
  {name:'Tomahawk',direction:320,angle:22,brush:.9,speed:5.1,contactX:.15,contactY:-.2},
];
export const RETURNS = [
  {name:'Sidespin → topspin',incoming:'left',direction:63,angle:9,brush:.82,speed:4.2,contactX:0,contactY:0},
  {name:'Backspin → loop',incoming:'back',direction:90,angle:12,brush:.93,speed:5.8,contactX:0,contactY:0},
  {name:'Soft block',incoming:'top',direction:90,angle:4,brush:.18,speed:.8,contactX:0,contactY:0},
  {name:'Thin brush',incoming:'left',direction:120,angle:12,brush:.98,speed:5.4,contactX:0,contactY:0},
  {name:'Hit through',incoming:'left',direction:90,angle:3,brush:.1,speed:2.2,contactX:0,contactY:0},
];
export const COMPARES = [
  {id:'toss',name:'High toss / low toss',mode:'serve',a:{toss:1.7},b:{toss:.25},labels:['A · High toss','B · Low toss']},
  {id:'incoming',name:'Opposite incoming spin',mode:'return',a:{incoming:'left'},b:{incoming:'right'},labels:['A · Clockwise','B · Counterclockwise']},
  {id:'brush',name:'Brush / hit through',mode:'return',a:{brush:.94},b:{brush:.12},labels:['A · Thin brush','B · Hit through']},
  {id:'angle',name:'Open / closed face',mode:'return',a:{angle:22},b:{angle:-12},labels:['A · Open face','B · Closed face']},
  {id:'contact',name:'Left / right contact',mode:'return',a:{contactX:-.7},b:{contactX:.7},labels:['A · Left patch','B · Right patch']},
  {id:'bounce',name:'Topspin / backspin',mode:'bounce',a:{incoming:'top'},b:{incoming:'back'},labels:['A · Topspin','B · Backspin']},
  {id:'mixed',name:'Sidespin / mixed spin',mode:'bounce',a:{incoming:'right'},b:{incoming:'top-right'},labels:['A · Sidespin','B · Top-sidespin']},
];
export function defaults(mode='return') {
  return {mode,incoming:'left',toss:.8,offset:0,contactHeight:1.03,
    direction:63,angle:9,brush:.82,speed:4.2,contactX:0,contactY:0,
    launchSpeed:3,launchHeight:1.35,magnus:true,
    ...(mode==='serve'?SERVES[0]:{}),...(mode==='bounce'?{incoming:'top'}:{})};
}
export function spinFor(id,incoming=false) {
  const w=(SPINS.find(p=>p.id===id)||SPINS[0]).w.slice();
  // A ball approaching the player travels -Z, reversing top/back's X sign.
  if(incoming) w[0]*=-1;
  return w;
}
export const LESSONS = [
  {title:'Add topspin to sidespin',mode:'spin',body:'Start with the upright sidespin axis. Tap +X. The diagonal arrow is the sum: one tilted axis, one continuous rotation.',action:'Add +X',kind:'compose'},
  {title:'What does a higher toss change?',mode:'compare',compare:'toss',body:'Both rackets make the same stroke. Scrub to impact: the higher toss brings more downward speed. Tangential friction decides how much becomes spin.',action:'Inspect impact',kind:'impact'},
  {title:'Why does backspin bounce differently?',mode:'compare',compare:'bounce',body:'At the bottom of a backspinning ball, the surface slides forward faster. Friction acts backward. Compare the paths after the table contact.',action:'Inspect bounce',kind:'bounce'},
  {title:'Why does the ball jump sideways?',mode:'bounce',incoming:'cork',body:'A tilted axis moves the bottom of the ball sideways, so table friction redirects it. Pure vertical sidespin mainly curves the flight; it has no rotational slip at the very bottom.',action:'Inspect bounce',kind:'bounce'},
  {title:'Where should the racket touch?',mode:'return',body:'Open Adjust and move the contact dot. The face turns to touch that patch. The same brush now acts through a different lever arm, changing the angular impulse.',action:'Move contact',kind:'adjust'},
];
