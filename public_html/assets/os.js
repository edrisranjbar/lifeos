import { remainingSeconds, nextMode } from './timer.mjs';
import { mountDashboard, refreshDashboard } from './dashboard.js';
await window.appStorageReady;
mountDashboard();
const $=id=>document.getElementById(id);
document.querySelector('nav a[href="#notes"]')?.insertAdjacentHTML('beforebegin','<a href="#notepad"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v16H4z"/><path d="M8 2v4m8-4v4M8 10h8m-8 4h8"/></svg> Notepad</a>');
let data;try{data=JSON.parse(appStorage.getItem('edi_focus_v1'))}catch{}
data={history:[],lengths:{focus:25,short:5,long:15},mode:'focus',remaining:1500,deadline:null,round:0,...data};
let storageFailed=false;
function save(){try{appStorage.setItem('edi_focus_v1',JSON.stringify(data))}catch{if(!storageFailed){storageFailed=true;$('status').textContent='Unable to save focus data to the server.'}}}
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function applyTheme(theme){document.documentElement.dataset.theme=theme;try{for(const key of ['edi_os_theme','edifinance_theme','habittify_theme','edi_kanban_theme','edi_goals_theme','edi_notes_theme'])appStorage.setItem(key,theme)}catch{}for(const id of ['finance','habittify','kanban','goals','notes','notepad']){const doc=$(id).contentDocument;if(doc)doc.documentElement.dataset.theme=theme}const sunIcon=document.querySelector('.sun-icon'),moonIcon=document.querySelector('.moon-icon');if(sunIcon&&moonIcon){sunIcon.style.display=theme==='dark'?'none':'block';moonIcon.style.display=theme==='dark'?'block':'none'}}
let theme='dark';try{theme=appStorage.getItem('edi_os_theme')||appStorage.getItem('edifinance_theme')||theme}catch{}applyTheme(theme);
$('theme').onclick=()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');
for(const id of ['finance','habittify','kanban','goals','notes','notepad'])$(id).addEventListener('load',()=>{const root=$(id).contentDocument.documentElement;root.dataset.theme=document.documentElement.dataset.theme;new MutationObserver(()=>{if(root.dataset.theme!==document.documentElement.dataset.theme)applyTheme(root.dataset.theme)}).observe(root,{attributes:true,attributeFilter:['data-theme']})});
function route(){const id=['dashboard','focus','finance','habittify','kanban','goals','notes','notepad'].includes(location.hash.slice(1))?location.hash.slice(1):'dashboard';for(const key of ['dashboard','focus','finance','habittify','kanban','goals','notes','notepad']){$(key).hidden=key!==id;if(key===id&&$(key).dataset.src&&!$(key).getAttribute('src'))$(key).src=$(key).dataset.src}document.querySelectorAll('nav a').forEach(a=>a.setAttribute('aria-current',a.hash==='#'+id?'page':'false'));document.title='Edi Life OS · '+(id==='dashboard'?'Overview':id[0].toUpperCase()+id.slice(1));if(id==='dashboard')refreshDashboard()}
addEventListener('hashchange',route);route();
function render(){const seconds=remainingSeconds(data,Date.now());const label=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');$('clock').textContent=label;$('navTimer').textContent=data.deadline?label:'';$('start').textContent=data.deadline?'Pause':data.mode==='focus'?'Start focus':'Start break';$('cycle').textContent=`Session ${data.round%4+1} of 4`;document.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===data.mode)));const today=data.history.filter(h=>h.day===day());$('completed').textContent=today.length;$('minutes').textContent=today.reduce((n,h)=>n+h.minutes,0);}
function setMode(mode){data.mode=mode;data.deadline=null;data.remaining=data.lengths[mode]*60;save();render()}
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{if(data.deadline||data.remaining!==data.lengths[data.mode]*60){if(!confirm('Switch intervals and discard progress on this interval?'))return}setMode(b.dataset.mode)});
$('start').onclick=()=>{if(data.deadline){data.remaining=remainingSeconds(data,Date.now());data.deadline=null}else{data.deadline=Date.now()+data.remaining*1000}save();render()};
$('reset').onclick=()=>{if(confirm('Reset this interval?'))setMode(data.mode)};
function tick(){if(data.deadline&&remainingSeconds(data,Date.now())===0){if(data.mode==='focus'){data.round++;data.history.push({day:day(),minutes:data.lengths.focus})}const next=nextMode(data.mode,data.round);setMode(next);$('status').textContent=next==='focus'?'Break complete. Ready for another session?':'Session complete. Time for a break.';}render()}
setInterval(tick,500);document.addEventListener('visibilitychange',tick);tick();
for(const mode of ['focus','short','long'])$(mode+'Length').value=data.lengths[mode];
$('saveSettings').onclick=()=>{const next={};for(const mode of ['focus','short','long']){const input=$(mode+'Length');if(!input.reportValidity())return;next[mode]=Number(input.value)}if((data.deadline||data.remaining!==data.lengths[data.mode]*60)&&!confirm('Save durations and reset this interval?'))return;data.lengths=next;setMode(data.mode);$('status').textContent='Timer settings saved.'};
const TRACKS = { 'comfortable-mystery':{name:'Comfortable Mystery',src:'assets/music/comfortable-mystery.mp3'},inspired:{name:'Inspired',src:'assets/music/inspired.mp3'},'dreamy-flashback':{name:'Dreamy Flashback',src:'assets/music/dreamy-flashback.mp3'},'water-lily':{name:'Water Lily',src:'assets/music/water-lily.mp3'},'winter-reflections':{name:'Winter Reflections',src:'assets/music/winter-reflections.mp3'},carefree:{name:'Carefree',src:'assets/music/carefree.mp3'},'friendly-day':{name:'Friendly Day',src:'assets/music/friendly-day.mp3'},'thinking-music':{name:'Thinking Music',src:'assets/music/thinking-music.mp3'},'luminous-rain':{name:'Luminous Rain',src:'assets/music/luminous-rain.mp3'},'touching-story':{name:'Touching Story',src:'assets/music/touching-story.mp3'} };
const VOLUME = 0.5;
let currentAudio=null,playing=false,fileUrl=null,fileAudio=null;
function stopSound(){try{if(currentAudio&&currentAudio!==fileAudio)currentAudio.pause();if(fileAudio)fileAudio.pause()}catch{}currentAudio=null;playing=false;$('play').textContent='▶ Play'}
async function playSound(){stopSound();const key=$('sound').value;try{if(key==='file'){if(!fileAudio)throw Error('Choose an audio file first.');currentAudio=fileAudio}else{const track=TRACKS[key];if(!track)throw Error('Unknown track.');currentAudio=new Audio(track.src);currentAudio.loop=true;currentAudio.preload='auto'}currentAudio.volume=VOLUME;await currentAudio.play();playing=true;$('play').textContent='Ⅱ Pause'}catch(e){stopSound()}}
$('play').onclick=()=>{if(playing)stopSound();else playSound()};
$('sound').onchange=()=>{const key=$('sound').value;if(key!=='file'&&TRACKS[key]){const preloaded=new Audio(TRACKS[key].src);preloaded.load()}if(playing)playSound()};
$('musicFile').onchange=()=>{const file=$('musicFile').files[0];if(!file)return;stopSound();if(fileUrl)URL.revokeObjectURL(fileUrl);fileUrl=URL.createObjectURL(file);fileAudio=new Audio(fileUrl);fileAudio.loop=true;let option=$('sound').querySelector('[value=file]');if(!option){option=new Option(file.name,'file');$('sound').add(option)}option.textContent=file.name;$('sound').value='file'};
/* ---- ambient nature mixer (synthesized live, A Soft Murmur style) ---- */
const ambLayers=['rain','thunder','wind','waves','birds','crickets'];
const ambCaps={rain:.9,thunder:1,wind:.7,waves:1,birds:.7,crickets:.6};
let ambCtx=null,ambOn=false,ambNodes={},ambTimers=[];
function ambAC(){if(ambCtx)return ambCtx;const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;ambCtx=new C();ambNodes.master=ambCtx.createGain();ambNodes.master.gain.value=.9;const comp=ambCtx.createDynamicsCompressor();ambNodes.master.connect(comp);comp.connect(ambCtx.destination);return ambCtx}
function noiseBuf(ctx,kind,sec){const b=ctx.createBuffer(1,Math.floor(sec*ctx.sampleRate),ctx.sampleRate),d=b.getChannelData(0);if(kind==='brown'){let last=0;for(let i=0;i<d.length;i++){const w=Math.random()*2-1;last=(last+.02*w)/1.02;d[i]=last*3.5}}else{for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1}return b}
function ambLoop(ctx,buf){const s=ctx.createBufferSource();s.buffer=buf;s.loop=true;return s}
function setAmbGain(key,val,force){const b=ambNodes[key];if(!b)return;const c=(Number(val)||0)/100*b.cap;if(force)b.gain.gain.value=c;else b.gain.gain.setTargetAtTime(c,ambCtx.currentTime,.08)}
function buildAmbient(key){if(ambNodes[key])return;const ctx=ambAC();const g=ctx.createGain();g.gain.value=0;g.connect(ambNodes.master);const box={gain:g,cap:ambCaps[key]||.8,src:[]};ambNodes[key]=box;const wire=s=>box.src.push(s);
 if(key==='rain'){const a=ambLoop(ctx,noiseBuf(ctx,'white',2));const f=ctx.createBiquadFilter();f.type='highpass';f.frequency.value=120;const l=ctx.createBiquadFilter();l.type='lowpass';l.frequency.value=1900;const ga=ctx.createGain();ga.gain.value=.5;const b2=ambLoop(ctx,noiseBuf(ctx,'white',2.3));const l2=ctx.createBiquadFilter();l2.type='lowpass';l2.frequency.value=420;const gs=ctx.createGain();gs.gain.value=.32;a.connect(f);f.connect(l);l.connect(ga);ga.connect(g);b2.connect(l2);l2.connect(gs);gs.connect(g);a.start();b2.start();wire(a);wire(b2)}
 else if(key==='thunder'){const a=ambLoop(ctx,noiseBuf(ctx,'brown',3));const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=110;lp.Q.value=.6;const gr=ctx.createGain();gr.gain.value=.16;a.connect(lp);lp.connect(gr);gr.connect(g);a.start();wire(a);const boom=()=>{if(!ambOn||!ambNodes.thunder)return;const t=ctx.currentTime+.1;const d=4+Math.random()*5;const peak=.4+Math.random()*.5;const src=ctx.createBufferSource();src.buffer=noiseBuf(ctx,'brown',8);const lp2=ctx.createBiquadFilter();lp2.type='lowpass';lp2.frequency.value=80+Math.random()*100;const g2=ctx.createGain();g2.gain.setValueAtTime(0,t);g2.gain.linearRampToValueAtTime(peak*.6,t+.12);g2.gain.linearRampToValueAtTime(peak,t+.4);g2.gain.exponentialRampToValueAtTime(.0001,t+d);src.connect(lp2);lp2.connect(g2);g2.connect(g);src.start(t,Math.random()*2,d+1);const t2=t+.5+Math.random()*.8;const src2=ctx.createBufferSource();src2.buffer=noiseBuf(ctx,'brown',8);const lp3=ctx.createBiquadFilter();lp3.type='lowpass';lp3.frequency.value=130;const g3=ctx.createGain();g3.gain.setValueAtTime(0,t2);g3.gain.linearRampToValueAtTime(peak*.4,t2+.35);g3.gain.exponentialRampToValueAtTime(.0001,t2+d);src2.connect(lp3);lp3.connect(g3);g3.connect(g);src2.start(t2,Math.random()*2,d);wire(src);wire(src2);ambTimers.push(setTimeout(boom,7+Math.random()*16))};ambTimers.push(setTimeout(boom,4+Math.random()*8))}
 else if(key==='wind'){const a=ambLoop(ctx,noiseBuf(ctx,'brown',3));const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=620;bp.Q.value=.7;const lfo=ctx.createOscillator();lfo.frequency.value=.07;const lg=ctx.createGain();lg.gain.value=320;lfo.connect(lg);lg.connect(bp.frequency);const g1=ctx.createGain();g1.gain.value=.6;const b2=ambLoop(ctx,noiseBuf(ctx,'brown',2.2));const bp2=ctx.createBiquadFilter();bp2.type='bandpass';bp2.frequency.value=2200;bp2.Q.value=1.6;const lfo2=ctx.createOscillator();lfo2.frequency.value=.11;const lg2=ctx.createGain();lg2.gain.value=700;lfo2.connect(lg2);lg2.connect(bp2.frequency);const g2=ctx.createGain();g2.gain.value=.1;a.connect(bp);bp.connect(g1);g1.connect(g);b2.connect(bp2);bp2.connect(g2);g2.connect(g);a.start();b2.start();lfo.start();lfo2.start();wire(a);wire(b2);wire(lfo);wire(lfo2)}
 else if(key==='waves'){const a=ambLoop(ctx,noiseBuf(ctx,'brown',4));const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=340;lp.Q.value=.5;const gb=ctx.createGain();gb.gain.value=.65;const lfo=ctx.createOscillator();lfo.frequency.value=.09;const lg=ctx.createGain();lg.gain.value=.35;lfo.connect(lg);lg.connect(gb.gain);const b2=ambLoop(ctx,noiseBuf(ctx,'white',2));const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=950;bp.Q.value=1;const g2=ctx.createGain();g2.gain.value=.05;a.connect(lp);lp.connect(gb);gb.connect(g);b2.connect(bp);bp.connect(g2);g2.connect(g);a.start();b2.start();lfo.start();wire(a);wire(b2);wire(lfo)}
 else if(key==='birds'){const chirp=()=>{if(!ambOn||!ambNodes.birds)return;const t=ctx.currentTime+.02;const f=2200+Math.random()*2600;const osc=ctx.createOscillator();osc.type='sine';osc.frequency.setValueAtTime(f,t);osc.frequency.exponentialRampToValueAtTime(Math.max(900,f+(Math.random()*900-300)),t+.12);const e=ctx.createGain();e.gain.setValueAtTime(.0001,t);e.gain.linearRampToValueAtTime(.11,t+.045);e.gain.exponentialRampToValueAtTime(.0001,t+.26);osc.connect(e);e.connect(g);osc.start(t);osc.stop(t+.3);if(Math.random()<.45)setTimeout(chirp,250+Math.random()*400)};for(let i=0;i<3;i++)ambTimers.push(setInterval(()=>chirp(),1400+i*900+Math.random()*1000));ambTimers.push(setTimeout(chirp,500))}
 else if(key==='crickets'){const pad=()=>{if(!ambOn||!ambNodes.crickets)return;const t=ctx.currentTime+.02;const f=4100+Math.random()*400;const dur=.9+Math.random()*.7;const pulses=Math.round(dur*22);const osc=ctx.createOscillator();osc.type='triangle';osc.frequency.setValueAtTime(f,t);osc.frequency.linearRampToValueAtTime(f+90,t+dur);const e=ctx.createGain();e.gain.setValueAtTime(0,t);for(let i=0;i<pulses;i++){const p0=t+i/22;e.gain.setValueAtTime(.02,p0);e.gain.linearRampToValueAtTime(.09,p0+.02);e.gain.setValueAtTime(.09,p0+.03);e.gain.linearRampToValueAtTime(.02,p0+.045)}osc.connect(e);e.connect(g);osc.start(t);osc.stop(t+dur+.1)};for(let i=0;i<2;i++)ambTimers.push(setInterval(()=>pad(),1500+i*700));ambTimers.push(setTimeout(pad,300))}
 setAmbGain(key,$(key+'-vol').value,true)}
function stopAmbient(){ambOn=false;ambTimers.forEach(t=>{try{clearTimeout(t)}catch{}});ambTimers=[];ambLayers.forEach(key=>{const b=ambNodes[key];if(!b)return;b.src.forEach(s=>{try{s.stop()}catch{}});try{b.gain.disconnect()}catch{};delete ambNodes[key]});$('ambientPlay').textContent='▶ Play ambient'}
async function toggleAmbient(){const ctx=ambAC();if(!ctx)return;if(ambOn){stopAmbient();return}try{await ctx.resume()}catch{}ambOn=true;ambLayers.forEach(buildAmbient);$('ambientPlay').textContent='Ⅱ Stop ambient'}
ambLayers.forEach(key=>{const el=$(key+'-vol');if(el)el.oninput=()=>setAmbGain(key,el.value,false)});
$('ambientPlay').onclick=toggleAmbient;
const sceneEl=document.querySelector('.focus-scene');
function updateScene(){
  if(!sceneEl)return;
  const now=new Date(),h=now.getHours()+now.getMinutes()/60;
  const tS=Math.min(Math.max((h-6)/12,0),1),eS=Math.sin(Math.PI*tS);
  const tM=((((h-18)%24)+24)%24)/12,eM=Math.sin(Math.PI*tM);
  let day=0,warm=0;
  if(h>=5&&h<8)day=(h-5)/3;
  else if(h>=8&&h<17)day=1;
  else if(h>=17&&h<20)day=(20-h)/3;
  if(h>=5&&h<8)warm=Math.sin(Math.PI*(h-5)/3);
  else if(h>=16&&h<19)warm=Math.sin(Math.PI*(h-16)/3);
  const night=1-day,clamp=v=>Math.max(0,Math.min(1,v)),s=sceneEl.style;
  s.setProperty('--day-blend',day.toFixed(3));
  s.setProperty('--warm-blend',warm.toFixed(3));
  s.setProperty('--star-op',night.toFixed(3));
  s.setProperty('--firefly-op',clamp((night-.35)/.5).toFixed(3));
  s.setProperty('--shade-op',(night*.5).toFixed(3));
  s.setProperty('--sun-x',(8+tS*84).toFixed(2)+'%');
  s.setProperty('--sun-y',(94-eS*70).toFixed(2)+'%');
  s.setProperty('--sun-op',clamp(eS*6).toFixed(3));
  s.setProperty('--moon-x',(8+tM*84).toFixed(2)+'%');
  s.setProperty('--moon-y',(94-eM*70).toFixed(2)+'%');
  s.setProperty('--moon-op',clamp(eM*6).toFixed(3));
}
sceneEl&&sceneEl.classList.add('scene-instant');
updateScene();
requestAnimationFrame(()=>requestAnimationFrame(()=>sceneEl&&sceneEl.classList.remove('scene-instant')));
setInterval(updateScene,30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateScene()});
