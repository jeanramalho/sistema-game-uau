import { db, auth } from './firebase.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { formatBR } from './common.js';
import { saveElementAsImage } from './print.js';

let state = { players: {}, games: {}, activeGameId: null };

// listeners
onValue(ref(db, '/players'), snap => { state.players = snap.val() || {}; renderAll(); }, err => { console.warn('players read err', err); });
onValue(ref(db, '/games'), snap => { state.games = snap.val() || {}; renderAll(); }, err => { console.warn('games read err', err); });
onValue(ref(db, '/meta/activeGameId'), snap => { state.activeGameId = snap.val(); renderAll(); }, err => { console.warn('meta err', err); });

// authBtn update
onAuthStateChanged(auth, user => {
  const authBtn = document.getElementById('authBtn');
  if(!authBtn) return;
  if(user){
    authBtn.textContent = 'SAIR';
    authBtn.onclick = async () => {
      try { await signOut(auth); authBtn.textContent = 'LOGIN'; authBtn.onclick = () => { location.href = 'login.html'; }; location.href = 'index.html'; } catch(err){ console.error('logout err', err); alert('Erro ao sair: ' + (err.message || err)); }
    };
  } else { authBtn.textContent = 'LOGIN'; authBtn.onclick = () => { location.href = 'login.html'; }; }
});

// routing
function handleRoute(){ const hash = (location.hash || '#/').replace('#/',''); if(hash === 'ranking') showView('ranking'); else showView('home'); }
window.addEventListener('hashchange', handleRoute);
window.addEventListener('load', ()=> { const btn = document.getElementById('btnGoRanking'); if(btn) btn.addEventListener('click', () => { location.hash = '#/ranking'; }); setTimeout(handleRoute, 120); });

function showView(name){ document.querySelectorAll('.view').forEach(v=> v.classList.add('hidden')); const el = document.getElementById('view-' + name); if(el) el.classList.remove('hidden'); }

function getActiveGame(){ if(!state.activeGameId) return null; const g = state.games && state.games[state.activeGameId] ? state.games[state.activeGameId] : null; if(!g) return null; if(g.endedAt) return null; return g; }

function computeGameTotalsObj(game){
  const totals = {};
  if(!game) return totals;
  if(game.saturdays){
    for(const isoKey in game.saturdays){
      const per = game.saturdays[isoKey] || {};
      for(const pid in per) totals[pid] = (totals[pid] || 0) + Number(per[pid] || 0);
    }
  }
  if(Object.keys(totals).length === 0 && game.playersPoints){
    for(const pid in game.playersPoints) totals[pid] = Number(game.playersPoints[pid] || 0);
  }
  return totals;
}

// renderers
function renderAll(){ renderHomeTop5(); renderPublicRanking(); renderRankingPreview(); updateNextSaturdayTag(); }

function updateNextSaturdayTag(){ const nextTag = document.getElementById('nextSaturdayTag'); const active = getActiveGame(); if(active){ const sats = generateSaturdaysBetween(active.startedAt, active.plannedEndAt); const next = sats.find(s=> new Date(s) >= new Date()) || sats[0]; if(nextTag) nextTag.textContent = 'Próx. sábado: ' + formatBR(next); } else { if(nextTag) nextTag.textContent = 'Próx. sábado: --'; } }

function renderPublicRanking(){
  const container = document.getElementById('publicRanking');
  if(!container) return;
  container.innerHTML = '';
  const active = getActiveGame();
  if(!active){ container.innerHTML = '<div class="pixel-box p-4">Nenhum game UAU em andamento no momento.</div>'; return; }
  const totals = computeGameTotalsObj(active);
  const arr = Object.entries(state.players).map(([key,p]) => ({ id:key, name:p.name, points: totals[key] || 0 }));
  arr.sort((a,b)=> b.points - a.points);
  if(arr.length === 0){ container.innerHTML = '<div class="pixel-box p-4">Nenhum jogador cadastrado.</div>'; return; }
  arr.forEach((r,i)=>{ const d = document.createElement('div'); d.className = 'flex justify-between items-center p-3 border-2 border-black mb-2 bg-[#dff3f5]'; d.innerHTML = `<div>${i+1}º ${escapeHtml(r.name)}</div><div><strong>${r.points.toLocaleString('pt-BR')}</strong></div>`; container.appendChild(d); });
}

function renderRankingPreview(){
  const el = document.getElementById('rankingPreview');
  if(!el) return;
  el.innerHTML = '';
  const active = getActiveGame();
  if(!active){ el.innerHTML = '<div class="pixel-box p-4">Nenhum trimestre em andamento</div>'; return; }
  const totals = computeGameTotalsObj(active);
  const arr = Object.entries(state.players).map(([key,p]) => ({ id:key, name:p.name, points: totals[key] || 0 }));
  arr.sort((a,b)=> b.points - a.points);
  arr.forEach((r,i)=>{ const row = document.createElement('div'); row.className = 'ranking-row pixel-box'; row.innerHTML = `<div>${i+1}º • ${escapeHtml(r.name)}</div><div class="font-bold">${r.points.toLocaleString('pt-BR')}</div>`; el.appendChild(row); });
}

function renderHomeTop5(){
  const container = document.getElementById('homeTop5');
  if(!container) return;
  container.innerHTML = '';
  const active = getActiveGame();
  if(!active){ container.innerHTML = '<div class="pixel-box p-4">Nenhum game UAU em andamento no momento.</div>'; return; }
  const totals = computeGameTotalsObj(active);
  const list = Object.entries(state.players).map(([key,p]) => ({ id:key, name:p.name, points: totals[key] || 0 }));
  list.sort((a,b)=> b.points - a.points);
  const top5 = list.slice(0,5);
  if(top5.length === 0){ container.innerHTML = '<div class="pixel-box p-4">Nenhum jogador cadastrado.</div>'; return; }
  const title = document.createElement('div'); title.className = 'pixel-box p-3'; title.innerHTML = '<strong>TOP 5</strong>';
  const listEl = document.createElement('div'); listEl.className = 'pixel-box p-4 mt-2 top5-list';
  listEl.innerHTML = top5.map((r,i)=> `<div style="display:flex;justify-content:space-between;padding:8px;border-bottom:1px dashed #000">${i+1}. ${escapeHtml(r.name)} <strong>${r.points.toLocaleString('pt-BR')}</strong></div>`).join('');
  container.appendChild(title); container.appendChild(listEl);
}

function computeAnnualRanking(year){
  const map = {};
  const gamesObj = state.games || {};
  for(const gid in gamesObj){
    const g = gamesObj[gid];
    const gy = new Date(g.startedAt).getFullYear();
    if(gy !== year) continue;
    if(g.saturdays){
      for(const isoKey in g.saturdays){
        const per = g.saturdays[isoKey] || {};
        for(const pid in per) map[pid] = (map[pid] || 0) + Number(per[pid] || 0);
      }
    } else if(g.playersPoints){
      for(const pid in g.playersPoints) map[pid] = (map[pid] || 0) + Number(g.playersPoints[pid] || 0);
    }
  }
  return Object.entries(map).map(([id, points]) => ({ id, points })).sort((a,b) => b.points - a.points);
}

function escapeHtml(str){ if(!str && str !== 0) return ''; return String(str).replace(/[&<>"']/g, function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]; }); }

function generateSaturdaysBetween(startIso, endIso){
  const start = startIso ? new Date(startIso) : new Date();
  const end = endIso ? new Date(endIso) : null;
  const s = new Date(start);
  const day = s.getDay();
  let delta = 6 - day;
  if(delta < 0) delta += 7;
  s.setDate(s.getDate() + delta);
  const arr = [];
  while(true){
    if(end && s > end) break;
    arr.push(s.toISOString());
    s.setDate(s.getDate() + 7);
    if(arr.length > 200) break;
  }
  return arr;
}

/* delegated click handlers for ranking page & print */
document.addEventListener('click', (e) => {
  if(e.target && e.target.id === 'btnSaveImage'){
    const el = document.getElementById('publicRanking');
    saveElementAsImage(el);
  }
  if(e.target && e.target.id === 'btnBackHome') location.hash = '#/';
});
