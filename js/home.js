// js/home.js
import { db, auth } from './firebase.js';
import { ref, onValue } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { formatBR, generateSaturdays } from './common.js';
import { saveElementAsImage } from './print.js';

let state = { players:{}, games:{}, activeGameId:null };

onValue(ref(db, '/players'), snap => { state.players = snap.val() || {}; renderAll(); }, err => { console.warn('players read err', err); });
onValue(ref(db, '/games'), snap => { state.games = snap.val() || {}; renderAll(); }, err => { console.warn('games read err', err); });
onValue(ref(db, '/meta/activeGameId'), snap => { state.activeGameId = snap.val(); renderAll(); }, err => { console.warn('meta err', err); });

function handleRoute(){ const hash = (location.hash||'#/').replace('#/',''); if(hash === 'ranking'){ showView('ranking'); } else showView('home'); }
window.addEventListener('hashchange', handleRoute); window.addEventListener('load', ()=> setTimeout(handleRoute,200));

function showView(name){ document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden')); document.getElementById('view-' + name).classList.remove('hidden'); }

function renderAll(){ renderHomeTop5(); renderPublicRanking(); renderPreview(); }
function renderHomeTop5(){ const container = document.getElementById('homeTop5'); container.innerHTML = ''; const game = state.activeGameId && state.games[state.activeGameId] ? state.games[state.activeGameId] : Object.values(state.games)[0]; if(!game) return; const arr = Object.values(state.players).map(p=>({ id:p.id, name:p.name, points:(game.playersPoints||{})[p.id]||0 })).sort((a,b)=>b.points-a.points).slice(0,5); if(arr.length===0) return; container.innerHTML = '<div class="pixel-box p-3"><strong>TOP 5</strong></div><div class="pixel-box p-4 mt-2">' + arr.map((r,i)=>`<div style="display:flex;justify-content:space-between;padding:6px">${i+1}. ${r.name} <strong>${r.points.toLocaleString('pt-BR')}</strong></div>`).join('') + '</div>'; }

function renderPublicRanking(){ const el = document.getElementById('publicRanking'); if(!el) return; el.innerHTML = ''; const game = state.activeGameId && state.games[state.activeGameId] ? state.games[state.activeGameId] : Object.values(state.games)[0]; if(!game){ el.innerHTML = '<div>Nenhum ranking</div>'; return; } const arr = Object.values(state.players).map(p=>({ id:p.id, name:p.name, points:(game.playersPoints||{})[p.id]||0 })).sort((a,b)=>b.points-a.points); arr.forEach((r,i)=>{ const d=document.createElement('div'); d.className='flex justify-between items-center p-3 border-2 border-black mb-2 bg-[#dff3f5]'; d.innerHTML = `<div>${i+1}º ${r.name}</div><div><strong>${r.points.toLocaleString('pt-BR')}</strong></div>`; el.appendChild(d); }); }

document.getElementById('btnSaveImage')?.addEventListener('click', ()=> saveElementAsImage(document.getElementById('publicRanking')));
document.getElementById('btnSaveImagePublic')?.addEventListener('click', ()=> saveElementAsImage(document.getElementById('publicRanking')));

// small preview function (keeps home layout unchanged)
function renderPreview(){ const el = document.getElementById('rankingPreview'); if(!el) return; el.innerHTML = ''; const game = state.activeGameId && state.games[state.activeGameId] ? state.games[state.activeGameId] : Object.values(state.games)[0]; if(!game){ el.innerHTML = '<div>Nenhum trimestre</div>'; return; } const arr = Object.values(state.players).map(p=>({ id:p.id, name:p.name, points:(game.playersPoints||{})[p.id]||0 })).sort((a,b)=>b.points-a.points); arr.forEach((r,i)=>{ const div=document.createElement('div'); div.className='ranking-row pixel-box'; div.innerHTML = `<div>${i+1}º • ${r.name}</div><div class="font-bold">${r.points.toLocaleString('pt-BR')}</div>`; el.appendChild(div); }); }