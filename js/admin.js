// js/admin.js
import { auth, db } from './firebase.js';
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { ref, onValue, set, push, update, remove, get, runTransaction } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { formatBR } from './common.js';
import { saveElementAsImage } from './print.js';

// admin root
const adminRoot = document.getElementById('admin-root');

// show checking auth while we wait
adminRoot.innerHTML = '<div class="pixel-box p-6 text-center">Verificando autenticação...</div>';

// STATE
let initialized = false;
let state = { players: {}, games: {}, activeGameId: null };

// unsub functions (to detach listeners if needed)
let unsubPlayers = null, unsubGames = null, unsubMeta = null;

// To avoid racing (listener firing null before persistence completes), use a small grace + latestUser tracking
let latestUser = undefined;
let redirectTimer = null;
const REDIRECT_GRACE_MS = 900; // small grace period so login redirect/restore can finish

onAuthStateChanged(auth, user => {
  latestUser = user || null;

  // update global auth button (if present in header)
  const authBtn = document.getElementById('authBtn');
  if(authBtn){
    if(user){
      authBtn.textContent = 'SAIR';
      authBtn.onclick = async () => {
        try { await signOut(auth); location.href = 'index.html'; }
        catch(err){ console.error('Logout err', err); alert('Erro ao sair: ' + (err.message || err)); }
      };
    } else {
      authBtn.textContent = 'LOGIN';
      authBtn.onclick = () => { location.href = 'login.html'; };
    }
  }

  // If user exists, initialize immediately and clear any pending redirect
  if(user){
    if(redirectTimer){ clearTimeout(redirectTimer); redirectTimer = null; }
    if(!initialized){
      initialized = true;
      initAdminPanel();
    }
    return;
  }

  // user is null -> wait a short grace period before redirecting.
  // This avoids the "Verificando autenticação..." being stuck after a redirect from the login page
  if(redirectTimer) clearTimeout(redirectTimer);
  redirectTimer = setTimeout(() => {
    // if still no user and admin not initialized, redirect to login
    if(!initialized && latestUser === null){
      const next = encodeURIComponent('admin.html');
      window.location.href = `login.html?next=${next}`;
    }
  }, REDIRECT_GRACE_MS);
});

/* ------------------ INITIALIZATION ------------------ */

function initAdminPanel(){
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

  // wire UI + DB
  wireAdmin();
}

/* ------------------ WIRING: UI handlers + DB listeners ------------------ */

function wireAdmin(){
  // Button refs
  const cardRegister = document.getElementById('card-register-player');
  const cardCreateEnd = document.getElementById('card-create-end-game');
  const cardLaunchPoints = document.getElementById('card-launch-points');
  const cardManagePlayers = document.getElementById('card-manage-players');
  const cardAnnualRanking = document.getElementById('card-annual-ranking');
  const quickRegisterBtn = document.getElementById('quickRegisterBtn');

  // Attach simple UI actions
  if(cardRegister) cardRegister.addEventListener('click', ()=> openModal('playerRegister'));
  if(quickRegisterBtn) quickRegisterBtn.addEventListener('click', ()=> openModal('playerRegister'));
  if(cardManagePlayers) cardManagePlayers.addEventListener('click', ()=> openModal('managePlayers'));
  if(cardCreateEnd) cardCreateEnd.addEventListener('click', ()=> {
    if(state.activeGameId) openModal('endGame'); else openModal('createGame');
  });
  if(cardLaunchPoints) cardLaunchPoints.addEventListener('click', ()=> openModal('launchPoints'));
  if(cardAnnualRanking) cardAnnualRanking.addEventListener('click', ()=> openModal('annualRanking'));

  // Setup realtime listeners (store unsub functions)
  unsubPlayers = onValue(ref(db, '/players'), snap => { state.players = snap.val() || {}; renderAllAdmin(); }, err => { console.warn('players read err', err); state.players = {}; renderAllAdmin(); });
  unsubGames = onValue(ref(db, '/games'), snap => { state.games = snap.val() || {}; renderAllAdmin(); }, err => { console.warn('games read err', err); state.games = {}; renderAllAdmin(); });
  unsubMeta = onValue(ref(db, '/meta/activeGameId'), snap => { state.activeGameId = snap.val(); renderAllAdmin(); }, err => { console.warn('meta read err', err); state.activeGameId = null; renderAllAdmin(); });

  // ensure header auth button is wired (redundant safe-guard)
  const authBtn = document.getElementById('authBtn');
  if(authBtn) authBtn.onclick = async ()=> { try{ await signOut(auth); location.href = 'index.html'; } catch(err){ console.error(err); alert('Erro ao sair: ' + (err.message || err)); } };

  // Delegated click handlers for modal content (save points, edit, delete)
  document.addEventListener('click', async (e) => {
    if(!e.target) return;
    // SALVAR PONTO
    if(e.target.matches('.save-point-btn')){
      const pid = e.target.dataset.pid;
      const valEl = document.getElementById('pts-' + pid);
      const val = Number(valEl?.value || 0);
      const gid = state.activeGameId;
      if(!gid) return alert('Nenhum trimestre ativo');
      try {
        await runTransaction(ref(db, `/games/${gid}/playersPoints/${pid}`), cur => (Number(cur || 0) + Number(val)));
        alert('Pontos salvos');
      } catch(err){ console.error(err); alert('Erro ao salvar ponto: '+ err.message); }
    }

    // EDITAR JOGADOR (abre modal)
    if(e.target.matches('.btn-edit')){
      const key = e.target.dataset.key;
      openModal('editPlayer', key);
    }

    // DELETAR JOGADOR
    if(e.target.matches('.btn-del')){
      const key = e.target.dataset.key;
      if(!confirm('Excluir jogador?')) return;
      try {
        await remove(ref(db, '/players/' + key));
        alert('Jogador excluído');
      } catch(err){ console.error(err); alert('Erro excluir: ' + (err.message || err)); }
    }
  });
}

/* ------------------ CRUD helpers ------------------ */

async function createPlayerAPI(data){
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

async function createGameAPI({ startIso, endIso, trimester }){
  const activeSnap = await get(ref(db, '/meta/activeGameId'));
  if(activeSnap.exists() && activeSnap.val()) throw new Error('Já existe um trimestre ativo.');
  const newRef = push(ref(db, '/games'));
  const gid = newRef.key;
  const game = { id: gid, year: new Date(startIso).getFullYear(), trimester: trimester || 1, startedAt: startIso, plannedEndAt: endIso, endedAt: null, playersPoints: {} };
  await set(ref(db, '/games/' + gid), game);
  await set(ref(db, '/meta/activeGameId'), gid);
  return game;
}

async function endGameAPI(gid){
  if(!gid) gid = state.activeGameId;
  if(!gid) throw new Error('Nenhum game ativo');
  await set(ref(db, '/games/' + gid + '/endedAt'), new Date().toISOString());
  await set(ref(db, '/meta/activeGameId'), null);
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
  const active = getActiveGame();

  document.getElementById('playersCount').textContent = (Object.keys(players).length || 0) + ' JOGADORES';
  if(active){ document.getElementById('activeTag').textContent = 'TRIMESTRE ATIVO'; document.getElementById('createEndTitle').textContent = 'ENCERRAR GAME'; }
  else { document.getElementById('activeTag').textContent = 'TRIMESTRE INATIVO'; document.getElementById('createEndTitle').textContent = 'NOVO GAME UAU'; }

  // next saturday header
  const nextTag = document.getElementById('nextSaturdayTag');
  if(nextTag){
    if(active){
      const sats = generateSaturdays(active.startedAt, 50, active.plannedEndAt);
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
  const sats = generateSaturdays(active.startedAt, 50, active.plannedEndAt);
  statSábadosEl.textContent = (Object.keys(active.playersPoints||{}).length || 0) + '/' + sats.length;
  statNextEl.textContent = 'SÁBADO ' + formatBR(sats.find(s=> new Date(s) >= new Date()) || sats[0]);
}

/* ------------------ Modal system (same as previous full version) ------------------ */
/* For brevity the modal HTML generators and handlers are the same as previously provided and already included in your repo.
   If you want, eu colo aqui de novo o bloco completo (playerRegisterHtml, editPlayerHtml, managePlayersHtml, createGameHtml, endGameHtml, launchPointsHtml, annualRankingHtml,
   attachModalHandlers, renderPointsTableForSaturday, computeAnnualRanking and helper generateSaturdays). */

 // --- If you need, eu colo o bloco completo das funções de modal/handlers aqui em seguida. ---

// final safety: ensure admin rendered after a short delay if already initialized
setTimeout(() => { if(initialized) renderAllAdmin(); }, 500);
