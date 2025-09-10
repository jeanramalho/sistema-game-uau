// js/admin.js
import { auth, db } from './firebase.js';
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { ref, onValue, set, push, update, remove, get, runTransaction } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { formatBR, generateSaturdays } from './common.js';
import { saveElementAsImage } from './print.js';

// Element that will receive the dashboard HTML
const adminRoot = document.getElementById('admin-root');

// show a loading state while checking auth
adminRoot.innerHTML = '<div class="pixel-box p-6 text-center">Verificando autenticação...</div>';

// Attach logout button handler (available in header). Works whether logged or not.
const logoutBtn = document.getElementById('logoutBtn');
if(logoutBtn){
  logoutBtn.addEventListener('click', async () => {
    try {
      await signOut(auth);
      // after sign out redirect to home
      window.location = 'index.html';
    } catch(err){
      console.error('Logout err', err);
      alert('Erro ao sair: ' + (err.message || err));
    }
  });
}

// Helper: redirect to login with next param
function redirectToLogin(){
  const next = encodeURIComponent('admin.html');
  window.location = `login.html?next=${next}`;
}

// Only initialize admin panel if there's a logged user
let initialized = false;
onAuthStateChanged(auth, user => {
  if(user){
    // user is logged in -> initialize admin panel once
    if(!initialized){
      initialized = true;
      initAdminPanel();
    }
  } else {
    // not logged in -> redirect to login page (prevent access)
    redirectToLogin();
  }
});

function initAdminPanel(){
  // Inject HTML for the dashboard (keeps same layout you approved)
  adminRoot.innerHTML = `
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

    <div class="lg:col-span-2 space-y-6">
      <div class="pixel-box p-6">
        <h2>DASHBOARD ADMINISTRATIVO</h2>
        <div class="mt-3">
          <span id="activeTag" class="tag">TRIMESTRE INATIVO</span>
          <span id="playersCount" class="tag">0 JOGADORES</span>
        </div>
      </div>

      <div class="pixel-box p-6">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="pixel-card p-4 cursor-pointer" id="card-manage-players"><h3 class="text-sm">GERENCIAR JOGADORES</h3></div>
          <div class="pixel-card p-4 cursor-pointer" id="card-launch-points"><h3 class="text-sm">LANÇAR PONTOS</h3></div>
          <div class="pixel-card p-4 cursor-pointer" id="card-annual-ranking"><h3 class="text-sm">RANKING ANUAL</h3></div>

          <div class="pixel-card p-4 cursor-pointer" id="card-register-player"><h3 class="text-sm">CADASTRAR JOGADOR</h3></div>
          <div class="pixel-card p-4 cursor-pointer text-center" id="card-create-end-game"><h3 id="createEndTitle" class="text-sm">NOVO GAME UAU</h3></div>
          <div class="pixel-card p-4 cursor-pointer" id="card-settings"><h3 class="text-sm">CONFIGURAÇÕES</h3></div>
        </div>
      </div>

      <div class="pixel-box p-6" id="ranking-box">
        <h3>RANKING ATUAL</h3>
        <div id="rankingPreview" class="mt-4"></div>
        <div class="mt-4 text-center">TOTAL: <span id="totalPlayers">0</span> JOGADORES</div>
      </div>
    </div>

    <aside class="space-y-6">
      <div class="stats-card">
        <h3>ESTATÍSTICAS</h3>
        <div class="mt-4">
          <div class="stat-item"><div>MAIOR PONTUAÇÃO</div><div id="statMax">0</div></div>
          <div class="stat-item"><div>MÉDIA GERAL</div><div id="statAvg">0</div></div>
          <div class="stat-item"><div>SÁBADOS JOGADOS</div><div id="statSábados">0</div></div>
          <div class="stat-item"><div>PRÓXIMO JOGO</div><div id="statNextGame">--</div></div>
        </div>
      </div>

      <div class="pixel-box p-4">
        <h4>ADICIONAR JOGADOR</h4>
        <button id="quickRegisterBtn" class="pixel-btn mt-3 w-full">CADASTRAR JOGADOR</button>
      </div>
    </aside>

  </div>
  `;

  // Now that DOM is injected, get references and wire behaviour
  wireAdminBehavior();
}

// STATE (populated from DB)
let state = { players: {}, games: {}, activeGameId: null };

// DB listeners (only called after initAdminPanel) -> created inside wire function to ensure auth
let playersUnsub = null, gamesUnsub = null, metaUnsub = null;

function wireAdminBehavior(){
  // DOM refs
  const cardRegister = document.getElementById('card-register-player');
  const cardCreateEnd = document.getElementById('card-create-end-game');
  const cardLaunchPoints = document.getElementById('card-launch-points');
  const cardManagePlayers = document.getElementById('card-manage-players');
  const cardAnnualRanking = document.getElementById('card-annual-ranking');
  const quickRegisterBtn = document.getElementById('quickRegisterBtn');

  // attach UI clicks
  if(cardRegister) cardRegister.addEventListener('click', () => openModal('playerRegister'));
  if(quickRegisterBtn) quickRegisterBtn.addEventListener('click', () => openModal('playerRegister'));
  if(cardManagePlayers) cardManagePlayers.addEventListener('click', () => openModal('managePlayers'));
  if(cardCreateEnd) cardCreateEnd.addEventListener('click', () => { if(state.activeGameId) openModal('endGame'); else openModal('createGame'); });
  if(cardLaunchPoints) cardLaunchPoints.addEventListener('click', () => openModal('launchPoints'));
  if(cardAnnualRanking) cardAnnualRanking.addEventListener('click', () => openModal('annualRanking'));

  // realtime listeners
  playersUnsub = onValue(ref(db, '/players'), snap => { state.players = snap.val() || {}; renderAllAdmin(); }, err => { console.warn('players read err', err); state.players = {}; renderAllAdmin(); });
  gamesUnsub = onValue(ref(db, '/games'), snap => { state.games = snap.val() || {}; renderAllAdmin(); }, err => { console.warn('games read err', err); state.games = {}; renderAllAdmin(); });
  metaUnsub = onValue(ref(db, '/meta/activeGameId'), snap => { state.activeGameId = snap.val(); renderAllAdmin(); }, err => { console.warn('meta read err', err); state.activeGameId = null; renderAllAdmin(); });

  // attach logout (again) - there is a logout button in header
  const logoutBtnLocal = document.getElementById('logoutBtn');
  if(logoutBtnLocal){
    logoutBtnLocal.addEventListener('click', async () => {
      try {
        await signOut(auth);
        window.location = 'index.html';
      } catch(err){
        console.error('logout err', err);
        alert('Erro ao sair: ' + (err.message || err));
      }
    });
  }

  // initial render
  setTimeout(renderAllAdmin, 150);
}

/* ------------------ CRUD helper functions ------------------ */
async function createPlayer(data){
  // data: { name, phone, role, email?, password? }
  if(data.role === 'admin'){
    const cred = await createUserWithEmailAndPassword(auth, data.email, data.password);
    const uid = cred.user.uid;
    const obj = { id: uid, name: data.name, phone: data.phone || null, role: 'admin', createdAt: new Date().toISOString() };
    await set(ref(db, '/players/' + uid), obj);
    return obj;
  } else {
    const newRef = push(ref(db, '/players'));
    const key = newRef.key;
    const obj = { id: key, name: data.name, phone: data.phone || null, role: 'player', createdAt: new Date().toISOString() };
    await set(ref(db, '/players/' + key), obj);
    return obj;
  }
}

async function updatePlayer(key, patch){
  await update(ref(db, '/players/' + key), patch);
}

async function deletePlayer(key){
  await remove(ref(db, '/players/' + key));
  // remove points references in games
  const gSnap = await get(ref(db, '/games'));
  const games = gSnap.val() || {};
  for(const gid in games){
    if(games[gid].playersPoints && games[gid].playersPoints[key]){
      await remove(ref(db, `/games/${gid}/playersPoints/${key}`));
    }
  }
}

async function createGame({ year, trimester }){
  const activeSnap = await get(ref(db, '/meta/activeGameId'));
  if(activeSnap.exists() && activeSnap.val()) throw new Error('Já existe um trimestre ativo.');
  const newRef = push(ref(db, '/games'));
  const gid = newRef.key;
  const game = { id: gid, year, trimester, startedAt: new Date().toISOString(), endedAt: null, playersPoints: {} };
  await set(ref(db, '/games/' + gid), game);
  await set(ref(db, '/meta/activeGameId'), gid);
  return game;
}

async function endGame(gid){
  if(!gid) gid = state.activeGameId;
  if(!gid) throw new Error('Nenhum game ativo');
  await set(ref(db, '/games/' + gid + '/endedAt'), new Date().toISOString());
  await set(ref(db, '/meta/activeGameId'), null);
}

async function addPoints(gid, playerId, pts){
  await runTransaction(ref(db, `/games/${gid}/playersPoints/${playerId}`), cur => (Number(cur || 0) + Number(pts)));
}

/* ------------------ Rendering ------------------ */

function getActiveGame(){
  if(!state.activeGameId) return null;
  const g = state.games && state.games[state.activeGameId] ? state.games[state.activeGameId] : null;
  if(!g) return null;
  if(g.endedAt) return null;
  return g;
}

function renderAllAdmin(){
  const players = state.players || {};
  const games = state.games || {};
  const active = getActiveGame();

  document.getElementById('playersCount').textContent = (Object.keys(players).length || 0) + ' JOGADORES';
  if(active){ document.getElementById('activeTag').textContent = 'TRIMESTRE ATIVO'; document.getElementById('createEndTitle').textContent = 'ENCERRAR GAME'; }
  else { document.getElementById('activeTag').textContent = 'TRIMESTRE INATIVO'; document.getElementById('createEndTitle').textContent = 'NOVO GAME UAU'; }

  // next saturday tag (header exists in admin.html)
  const nextTag = document.getElementById('nextSaturdayTag');
  if(nextTag){
    if(active){
      const sats = generateSaturdays(active.startedAt, 15);
      const next = sats.find(s => new Date(s) >= new Date()) || sats[0];
      nextTag.textContent = 'Próx. sábado: ' + formatBR(next);
    } else nextTag.textContent = 'Próx. sábado: --';
  }

  renderRankingPreview();
  renderStats();
}

function renderRankingPreview(){
  const el = document.getElementById('rankingPreview');
  if(!el) return;
  el.innerHTML = '';
  const active = getActiveGame();
  if(!active){
    el.innerHTML = '<div class="pixel-box p-4">Nenhum game UAU em andamento no momento.</div>';
    document.getElementById('totalPlayers').textContent = '0';
    return;
  }
  const pts = active.playersPoints || {};
  const arr = Object.values(state.players).map(p => ({ id:p.id, name:p.name, points: pts[p.id] || 0 }));
  arr.sort((a,b)=> b.points - a.points);
  arr.forEach((r,i)=>{
    const div = document.createElement('div'); div.className = 'ranking-row pixel-box';
    div.innerHTML = `<div>${i+1}º • ${r.name}</div><div class="font-bold">${r.points.toLocaleString('pt-BR')}</div>`;
    el.appendChild(div);
  });
  document.getElementById('totalPlayers').textContent = Object.keys(state.players).length || 0;
}

function renderStats(){
  const statMaxEl = document.getElementById('statMax');
  const statAvgEl = document.getElementById('statAvg');
  const statSábadosEl = document.getElementById('statSábados');
  const statNextEl = document.getElementById('statNextGame');
  const active = getActiveGame();
  if(!active){ statMaxEl.textContent='0'; statAvgEl.textContent='0'; statSábadosEl.textContent='0'; statNextEl.textContent='--'; return; }
  const pts = Object.values(active.playersPoints || {});
  const max = pts.length ? Math.max(...pts) : 0;
  const avg = pts.length ? Math.round(pts.reduce((a,b)=>a+b,0)/pts.length) : 0;
  statMaxEl.textContent = max.toLocaleString('pt-BR');
  statAvgEl.textContent = avg.toLocaleString('pt-BR');
  const sats = generateSaturdays(active.startedAt, 15);
  statSábadosEl.textContent = (Object.keys(active.playersPoints||{}).length || 0) + '/' + sats.length;
  statNextEl.textContent = 'SÁBADO ' + formatBR(sats.find(s=> new Date(s) >= new Date()) || sats[0]);
}

/* ------------------ Modal system (reused from single file) ------------------ */

const modalRoot = document.getElementById('modal-root') || (function(){ const d = document.createElement('div'); d.id = 'modal-root'; document.body.appendChild(d); return d; })();
let currentModal = null;

function openModal(type, payload){
  closeModal();
  document.body.style.overflow = 'hidden';
  const overlay = document.createElement('div'); overlay.className='modal-overlay'; overlay.id='modal-overlay'; overlay.addEventListener('click', closeModal);
  const center = document.createElement('div'); center.className='modal-center'; center.addEventListener('click', e=> e.stopPropagation());
  overlay.appendChild(center); modalRoot.appendChild(overlay); currentModal = { type, payload, overlay, center };

  if(type === 'playerRegister') center.innerHTML = playerRegisterHtml();
  else if(type === 'managePlayers') center.innerHTML = managePlayersHtml();
  else if(type === 'editPlayer') center.innerHTML = editPlayerHtml(payload);
  else if(type === 'createGame') center.innerHTML = createGameHtml();
  else if(type === 'endGame') center.innerHTML = endGameHtml();
  else if(type === 'launchPoints') center.innerHTML = launchPointsHtml();
  else if(type === 'annualRanking') center.innerHTML = annualRankingHtml();
  attachModalHandlers(type, payload);
}

function closeModal(){ const o = document.getElementById('modal-overlay'); if(o) o.remove(); currentModal = null; document.body.style.overflow = ''; }

/* Modal HTML builders & handlers (kept same as before) */
// ... (for brevidade no chat, o conteúdo das funções html/handlers é idêntico ao que você já aprovou) ...
// Já inseri essas funções no documento do projeto; ao copiar para o repositório, mantenha-as exatamente como no código anterior
// (se quiser, eu colo tudo aqui novamente sem abreviação).

// render points table
function renderPointsTableForSaturday(iso){
  const players = state.players || {};
  const list = Object.values(players).sort((a,b)=> a.name.localeCompare(b.name));
  const rows = list.map(p => `<div class="pts-row flex justify-between items-center py-2 border-b" data-name="${p.name}"><div>${p.name}</div><div style="display:flex;gap:8px;align-items:center"><input id="pts-${p.id}" class="pixel-input" style="width:120px;padding:6px" type="number" placeholder="0" /><button class="pixel-btn save-point-btn" data-pid="${p.id}" data-iso="${iso}">SALVAR</button></div></div>`).join('');
  const area = document.getElementById('points-table-area');
  if(area) area.innerHTML = `<h3>Pontos para: ${formatBR(iso)}</h3><div>${rows}</div>`;
}

/* compute annual ranking */
function computeAnnualRanking(year){
  const map = {}; const gamesObj = state.games || {};
  for(const gid in gamesObj){
    const g = gamesObj[gid];
    const gy = new Date(g.startedAt).getFullYear();
    if(gy !== year) continue;
    const ppts = g.playersPoints || {};
    for(const pid in ppts) map[pid] = (map[pid] || 0) + Number(ppts[pid] || 0);
  }
  return Object.entries(map).map(([id, points])=> ({ id, points })).sort((a,b)=> b.points - a.points);
}

// ensure admin panel renders after init
setTimeout(()=> {
  // if initialization didn't happen (e.g. auth already known) ensure render
  if(initialized) renderAllAdmin();
}, 500);
