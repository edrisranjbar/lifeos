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
const TRACKS = { 'comfortable-mystery':{name:'Comfortable Mystery',src:'assets/audio/comfortable-mystery.mp3'},inspired:{name:'Inspired',src:'assets/audio/inspired.mp3'},'dreamy-flashback':{name:'Dreamy Flashback',src:'assets/audio/dreamy-flashback.mp3'},'water-lily':{name:'Water Lily',src:'assets/audio/water-lily.mp3'},'winter-reflections':{name:'Winter Reflections',src:'assets/audio/winter-reflections.mp3'},carefree:{name:'Carefree',src:'assets/audio/carefree.mp3'},'friendly-day':{name:'Friendly Day',src:'assets/audio/friendly-day.mp3'},'thinking-music':{name:'Thinking Music',src:'assets/audio/thinking-music.mp3'},'luminous-rain':{name:'Luminous Rain',src:'assets/audio/luminous-rain.mp3'},'touching-story':{name:'Touching Story',src:'assets/audio/touching-story.mp3'} };
const VOLUME = 0.5;
let currentAudio=null,playing=false,fileUrl=null,fileAudio=null;
function stopSound(){try{if(currentAudio&&currentAudio!==fileAudio)currentAudio.pause();if(fileAudio)fileAudio.pause()}catch{}currentAudio=null;playing=false;$('play').textContent='▶ Play'}
async function playSound(){stopSound();const key=$('sound').value;try{if(key==='file'){if(!fileAudio)throw Error('Choose an audio file first.');currentAudio=fileAudio}else{const track=TRACKS[key];if(!track)throw Error('Unknown track.');currentAudio=new Audio(track.src);currentAudio.loop=true;currentAudio.preload='auto'}currentAudio.volume=VOLUME;await currentAudio.play();playing=true;$('play').textContent='Ⅱ Pause';$('soundStatus').textContent=(key==='file'?$('sound').selectedOptions[0].textContent:TRACKS[key].name)+' · playing'}catch(e){stopSound();$('soundStatus').textContent=e.message||'Audio could not play. Choose another track.'}}
$('play').onclick=()=>{if(playing){stopSound();$('soundStatus').textContent='Music paused.'}else playSound()};
$('sound').onchange=()=>{const key=$('sound').value;if(key!=='file'&&TRACKS[key]){const preloaded=new Audio(TRACKS[key].src);preloaded.load()}if(playing)playSound()};
$('musicFile').onchange=()=>{const file=$('musicFile').files[0];if(!file)return;stopSound();if(fileUrl)URL.revokeObjectURL(fileUrl);fileUrl=URL.createObjectURL(file);fileAudio=new Audio(fileUrl);fileAudio.loop=true;let option=$('sound').querySelector('[value=file]');if(!option){option=new Option(file.name,'file');$('sound').add(option)}option.textContent=file.name;$('sound').value='file';$('soundStatus').textContent='Selected locally. Press Play to listen.'};
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
