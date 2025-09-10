// js/home.js
import app, { auth, db } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { formatBR, generateSaturdays } from './common.js';
import { saveElementAsImage } from './print.js';

/*
  home.js responsibilities:
  - show HOME and RANKING views (hash routing)
  - update authBtn across pages (LOGIN / SAIR)
  - render top5 and public ranking only when a trimester (game) is active
  - delegate print save button on ranking page
*/

// state
let state = { players: {}, games: {}, activeGameId: null };

// realtime listeners
onValue(ref(db, '/players'), snap => { state.players = snap.val() || {}; renderAll(); }, err => { console.warn('players read err', err); });
onValue(ref(db, '/games'), snap => { state.games = snap.val() || {}; renderAll(); }, err => { console.warn('games read err', err); });
onValue(ref(db, '/meta/activeGameId'), snap => { state.activeGameId = snap.val(); renderAll(); }, err => { console.warn('meta err', err); });

// auth button: consistent update
onAuthStateChanged(auth, user => {
  const authBtn = document.getElementById('authBtn');
  if(!authBtn) return;
  if(user){
    authBtn.textContent = 'SAIR';
    authBtn.onclick = async () => {
      try {
        await signOut(auth);
        // update button and stay in page
        authBtn.textContent = 'LOGIN';
        authBtn.onclick = () => { location.href = 'login.html'; };
        location.href = 'index.html';
      } catch(err){ console.error('logout err', err); alert('Erro ao sair: ' + (err.message || err)); }
    };
  } else {
    authBtn.textContent = 'LOGIN';
    authBtn.onclick = () => { location.href = 'login.html'; };
  }
});

// Router
function handleRoute(){
  const hash = (location.hash || '#/').replace('#/','');
  if(hash === 'ranking') showView('ranking');
  else showView('home');
}
window.addEventListener('hashchange', handleRoute);
window.addEventListener('load', () => {
  const btn = document.getElementById('btnGoRanking');
  if(btn) btn.addEventListener('click', () => { location.hash = '#/ranking'; });
  setTimeout(handleRoute, 120);
});

function showView(name){
  document.querySelectorAll('.view').forEach(v=> v.classList.add('hidden'));
  const el = document.getElementById('view-' + name);
  if(el) el.classList.remove('hidden');
}

// util: active game existence
function getActiveGame(){
  if(!state.activeGameId) return null;
  const g = state.games && state.games[state.activeGameId] ? state.games[state.activeGameId] : null;
  if(!g) return null;
  if(g.endedAt) return null;
  return g;
}

// renderers
function renderAll(){
  renderHomeTop5();
  renderPublicRanking();
  renderRankingPreview();
  updateNextSaturdayTag();
}

function updateNextSaturdayTag(){
  const nextTag = document.getElementById('nextSaturdayTag');
  const active = getActiveGame();
  if(active){
    const s = generateSaturdays(active.startedAt, 15).find(s=> new Date(s) >= new Date()) || generateSaturdays(active.startedAt,1)[0];
    if(nextTag) nextTag.textContent = 'Próx. sábado: ' + formatBR(s);
  } else {
    if(nextTag) nextTag.textContent = 'Próx. sábado: --';
  }
}

function renderPublicRanking(){
  const container = document.getElementById('publicRanking');
  if(!container) return;
  container.innerHTML = '';

  const active = getActiveGame();
  if(!active){
    container.innerHTML = '<div class="pixel-box p-4">Nenhum game UAU em andamento no momento.</div>';
    return;
  }

  const arr = Object.values(state.players).map(p => ({ id:p.id, name:p.name, points: (active.playersPoints||{})[p.id] || 0 }));
  arr.sort((a,b)=> b.points - a.points);

  if(arr.length === 0){
    container.innerHTML = '<div class="pixel-box p-4">Nenhum jogador cadastrado.</div>';
    return;
  }

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

  const active = getActiveGame();
  if(!active){
    el.innerHTML = '<div class="pixel-box p-4">Nenhum trimestre em andamento</div>';
    return;
  }

  const arr = Object.values(state.players).map(p => ({ id:p.id, name:p.name, points: (active.playersPoints||{})[p.id] || 0 }));
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

  const active = getActiveGame();
  if(!active){
    container.innerHTML = '<div class="pixel-box p-4">Nenhum game UAU em andamento no momento.</div>';
    return;
  }

  const list = Object.values(state.players).map(p=> ({ id:p.id, name:p.name, points: (active.playersPoints||{})[p.id] || 0 }));
  list.sort((a,b)=> b.points - a.points);
  const top5 = list.slice(0,5);
  if(top5.length === 0){ container.innerHTML = '<div class="pixel-box p-4">Nenhum jogador cadastrado.</div>'; return; }

  const title = document.createElement('div'); title.className = 'pixel-box p-3'; title.innerHTML = '<strong>TOP 5</strong>';
  const listEl = document.createElement('div'); listEl.className = 'pixel-box p-4 mt-2 top5-list';
  listEl.innerHTML = top5.map((r,i)=> `<div style="display:flex;justify-content:space-between;padding:8px;border-bottom:1px dashed #000">${i+1}. ${r.name} <strong>${r.points.toLocaleString('pt-BR')}</strong></div>`).join('');
  container.appendChild(title); container.appendChild(listEl);
}

// delegated click handlers for ranking page
document.addEventListener('click', (e) => {
  if(e.target && e.target.id === 'btnSaveImage'){
    const el = document.getElementById('publicRanking');
    saveElementAsImage(el);
  }
  if(e.target && e.target.id === 'btnBackHome') location.hash = '#/';
});
