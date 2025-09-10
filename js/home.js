// js/home.js
import { db } from './firebase.js';
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { formatBR, generateSaturdays } from './common.js';
import { saveElementAsImage } from './print.js';

let state = { players: {}, games: {}, activeGameId: null };

onValue(ref(db, '/players'), snap => { state.players = snap.val() || {}; renderAll(); }, err => { console.warn('players read err', err); });
onValue(ref(db, '/games'), snap => { state.games = snap.val() || {}; renderAll(); }, err => { console.warn('games read err', err); });
onValue(ref(db, '/meta/activeGameId'), snap => { state.activeGameId = snap.val(); renderAll(); }, err => { console.warn('meta err', err); });

// Router (client-side simple)
function handleRoute(){
  const hash = (location.hash || '#/').replace('#/','');
  if(hash === 'ranking') showView('ranking');
  else showView('home');
}
window.addEventListener('hashchange', handleRoute);
window.addEventListener('load', ()=> setTimeout(handleRoute, 150));

// view switch
function showView(name){
  document.querySelectorAll('.view').forEach(v=> v.classList.add('hidden'));
  const el = document.getElementById('view-' + name);
  if(el) el.classList.remove('hidden');
  // when showing ranking view, ensure save button visible (handled by DOM presence)
}

// renderers
function renderAll(){
  renderHomeTop5();
  renderPublicRanking();
  renderRankingPreview();
  // update next saturday tag
  const nextTag = document.getElementById('nextSaturdayTag');
  const games = state.games || {};
  const active = state.activeGameId && games[state.activeGameId] ? games[state.activeGameId] : (Object.values(games)[0] || null);
  if(active){
    const s = generateSaturdays(active.startedAt, 15).find(s=> new Date(s) >= new Date()) || generateSaturdays(active.startedAt,1)[0];
    if(nextTag) nextTag.textContent = 'Próx. sábado: ' + formatBR(s);
  } else {
    if(nextTag) nextTag.textContent = 'Próx. sábado: ' + formatBR(new Date());
  }
}

function renderPublicRanking(){
  const container = document.getElementById('publicRanking');
  if(!container) return;
  container.innerHTML = '';
  const games = state.games || {};
  const activeId = state.activeGameId || Object.keys(games)[0];
  const game = activeId && games[activeId] ? games[activeId] : null;
  if(!game){ container.innerHTML = '<div>Nenhum ranking</div>'; return; }
  const arr = Object.values(state.players).map(p=> ({ id:p.id, name:p.name, points:(game.playersPoints||{})[p.id]||0 }));
  arr.sort((a,b)=> b.points - a.points);
  arr.forEach((r,i)=>{
    const d = document.createElement('div');
    d.className = 'flex justify-between items-center p-3 border-2 border-black mb-2 bg-[#dff3f5]';
    d.innerHTML = `<div>${i+1}º ${r.name}</div><div><strong>${r.points.toLocaleString('pt-BR')}</strong></div>`;
    container.appendChild(d);
  });
}

function renderRankingPreview(){
  const el = document.getElementById('rankingPreview');
  if(!el) return;
  el.innerHTML = '';
  const games = state.games || {};
  const activeId = state.activeGameId || Object.keys(games)[0];
  const game = activeId && games[activeId] ? games[activeId] : null;
  if(!game){ el.innerHTML = '<div>Nenhum trimestre</div>'; return; }
  const arr = Object.values(state.players).map(p=> ({ id:p.id, name:p.name, points:(game.playersPoints||{})[p.id]||0 }));
  arr.sort((a,b)=> b.points - a.points);
  arr.forEach((r,i)=>{
    const row = document.createElement('div');
    row.className = 'ranking-row pixel-box';
    row.innerHTML = `<div>${i+1}º • ${r.name}</div><div class="font-bold">${r.points.toLocaleString('pt-BR')}</div>`;
    el.appendChild(row);
  });
}

function renderHomeTop5(){
  const container = document.getElementById('homeTop5');
  if(!container) return;
  container.innerHTML = '';
  const games = state.games || {};
  const activeId = state.activeGameId || Object.keys(games)[0];
  const game = activeId && games[activeId] ? games[activeId] : null;
  if(!game) return;
  const arr = Object.values(state.players).map(p=> ({ id:p.id, name:p.name, points:(game.playersPoints||{})[p.id]||0 }));
  arr.sort((a,b)=> b.points - a.points);
  const top5 = arr.slice(0,5);
  if(top5.length === 0) return;
  const title = document.createElement('div'); title.className = 'pixel-box p-3'; title.innerHTML = '<strong>TOP 5</strong>';
  const list = document.createElement('div'); list.className = 'pixel-box p-4 mt-2 top5-list';
  list.innerHTML = top5.map((r,i)=> `<div>${i+1}. ${r.name}<span style="margin-left:12px"></span><strong style="float:right">${r.points.toLocaleString('pt-BR')}</strong></div>`).join('');
  container.appendChild(title); container.appendChild(list);
}

// save image handlers (ranking page)
document.addEventListener('click', (e)=>{
  if(e.target && e.target.id === 'btnSaveImage'){
    const el = document.getElementById('publicRanking');
    saveElementAsImage(el);
  }
  if(e.target && e.target.id === 'btnBackHome'){
    location.hash = '#/';
  }
  if(e.target && e.target.id === 'btnGoRanking'){
    location.hash = '#/ranking';
  }
});
