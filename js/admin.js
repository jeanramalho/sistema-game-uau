// js/admin.js
// Arquivo completo do painel administrativo — contém inicialização auth robusta,
// injeção do dashboard, todos os cards funcionando, modais, CRUD players, games, pontos, ranking anual.

// Imports
import { auth, db } from './firebase.js';
import { onAuthStateChanged, createUserWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { ref, onValue, set, push, update, remove, get, runTransaction } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { formatBR } from './common.js'; // formatBR used for display
import { saveElementAsImage } from './print.js';

// Helper: wait for the initial firebase auth emission to avoid "stuck verifying"
function waitForInitialAuthState() {
  return new Promise(resolve => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user || null);
    });
  });
}

// Update the header auth button consistently
function updateAuthBtn(user){
  const authBtn = document.getElementById('authBtn');
  if(!authBtn) return;
  if(user){
    authBtn.textContent = 'SAIR';
    authBtn.onclick = async () => {
      try {
        await signOut(auth);
        location.href = 'index.html';
      } catch(err){
        console.error('logout err', err);
        alert('Erro ao sair: ' + (err.message || err));
      }
    };
  } else {
    authBtn.textContent = 'LOGIN';
    authBtn.onclick = () => {
      const next = encodeURIComponent('admin.html');
      location.href = `login.html?next=${next}`;
    };
  }
}

// Boot - wait for auth readiness, then either init or redirect
(async function boot(){
  const adminRoot = document.getElementById('admin-root');
  if(!adminRoot){
    console.error('adminRoot not found in DOM');
    return;
  }
  adminRoot.innerHTML = '<div class="pixel-box p-6 text-center">Verificando autenticação...</div>';

  let user = null;
  try {
    user = await waitForInitialAuthState();
  } catch(err){
    console.error('Erro ao verificar estado auth inicial', err);
    user = null;
  }

  // update header button at boot time if present
  updateAuthBtn(user);

  if(!user){
    // redirect to login with next param
    const next = encodeURIComponent('admin.html');
    window.location.href = `login.html?next=${next}`;
    return;
  }

  // user present -> init admin UI
  initAdminPanel();
})();

/* ===========================
   Admin panel implementation
   =========================== */

// STATE
let state = { players: {}, games: {}, activeGameId: null };

// DB unsubscribers
let unsubPlayers = null, unsubGames = null, unsubMeta = null;

// Initialize UI markup and wiring
function initAdminPanel(){
  const adminRoot = document.getElementById('admin-root');
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

  // ensure modal root exists
  if(!document.getElementById('modal-root')){
    const mr = document.createElement('div');
    mr.id = 'modal-root';
    document.body.appendChild(mr);
  }

  wireAdmin();
}

// Wire UI + Realtime DB listeners + delegated handlers
function wireAdmin(){
  // card refs
  const cardRegister = document.getElementById('card-register-player');
  const cardCreateEnd = document.getElementById('card-create-end-game');
  const cardLaunchPoints = document.getElementById('card-launch-points');
  const cardManagePlayers = document.getElementById('card-manage-players');
  const cardAnnualRanking = document.getElementById('card-annual-ranking');
  const quickRegisterBtn = document.getElementById('quickRegisterBtn');

  if(cardRegister) cardRegister.addEventListener('click', () => openModal('playerRegister'));
  if(quickRegisterBtn) quickRegisterBtn.addEventListener('click', () => openModal('playerRegister'));
  if(cardManagePlayers) cardManagePlayers.addEventListener('click', () => openModal('managePlayers'));
  if(cardCreateEnd) cardCreateEnd.addEventListener('click', () => { if(state.activeGameId) openModal('endGame'); else openModal('createGame'); });
  if(cardLaunchPoints) cardLaunchPoints.addEventListener('click', () => openModal('launchPoints'));
  if(cardAnnualRanking) cardAnnualRanking.addEventListener('click', () => openModal('annualRanking'));

  // DB listeners
  unsubPlayers = onValue(ref(db, '/players'), snap => { state.players = snap.val() || {}; renderAllAdmin(); }, err => { console.warn('players read err', err); state.players = {}; renderAllAdmin(); });
  unsubGames = onValue(ref(db, '/games'), snap => { state.games = snap.val() || {}; renderAllAdmin(); }, err => { console.warn('games read err', err); state.games = {}; renderAllAdmin(); });
  unsubMeta = onValue(ref(db, '/meta/activeGameId'), snap => { state.activeGameId = snap.val(); renderAllAdmin(); }, err => { console.warn('meta read err', err); state.activeGameId = null; renderAllAdmin(); });

  // header auth button safe guard
  const authBtn = document.getElementById('authBtn');
  if(authBtn){
    authBtn.onclick = async () => {
      try { await signOut(auth); location.href = 'index.html'; } catch(err){ console.error(err); alert('Erro ao sair: ' + (err.message || err)); }
    };
  }

  // delegated click handling inside the document for modal actions (save point, edit, delete)
  document.addEventListener('click', async (e) => {
    if(!e.target) return;

    // save point button inside launchPoints modal
    if(e.target.matches('.save-point-btn')){
      const pid = e.target.dataset.pid;
      const el = document.getElementById('pts-' + pid);
      const val = Number(el?.value || 0);
      const gid = state.activeGameId;
      if(!gid) return alert('Nenhum trimestre ativo');
      try {
        await runTransaction(ref(db, `/games/${gid}/playersPoints/${pid}`), cur => (Number(cur || 0) + Number(val)));
        alert('Pontos salvos');
      } catch(err){ console.error(err); alert('Erro ao salvar: '+err.message); }
    }

    // delegated edit/delete in managePlayers modal
    if(e.target.matches('.btn-edit')){
      const key = e.target.dataset.key;
      openModal('editPlayer', key);
    }
    if(e.target.matches('.btn-del')){
      const key = e.target.dataset.key;
      if(!confirm('Excluir jogador?')) return;
      try {
        await remove(ref(db, '/players/' + key));
        alert('Jogador excluído');
      } catch(err){ console.error(err); alert('Erro ao excluir: '+(err.message||err)); }
    }
  });
}

/* ----------------------
   CRUD and backend ops
   ---------------------- */

async function createPlayerAPI(data){
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

async function updatePlayerAPI(key, patch){
  await update(ref(db, '/players/' + key), patch);
}

async function deletePlayerAPI(key){
  await remove(ref(db, '/players/' + key));
  // optionally cleanup points across games
  const gSnap = await get(ref(db, '/games'));
  const gamesObj = gSnap.val() || {};
  for(const gid in gamesObj){
    if(gamesObj[gid].playersPoints && gamesObj[gid].playersPoints[key]){
      await remove(ref(db, `/games/${gid}/playersPoints/${key}`));
    }
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

/* ------------------------
   Rendering / Utilities
   ------------------------ */

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

  const playersCountEl = document.getElementById('playersCount');
  if(playersCountEl) playersCountEl.textContent = (Object.keys(players).length || 0) + ' JOGADORES';

  const activeTag = document.getElementById('activeTag');
  const createEndTitle = document.getElementById('createEndTitle');
  if(active){
    if(activeTag) activeTag.textContent = 'TRIMESTRE ATIVO';
    if(createEndTitle) createEndTitle.textContent = 'ENCERRAR GAME';
  } else {
    if(activeTag) activeTag.textContent = 'TRIMESTRE INATIVO';
    if(createEndTitle) createEndTitle.textContent = 'NOVO GAME UAU';
  }

  // update next saturday in header (if exists)
  const nextTag = document.getElementById('nextSaturdayTag');
  if(nextTag){
    if(active){
      const sats = generateSaturdaysBetween(active.startedAt, active.plannedEndAt);
      const next = sats.find(s => new Date(s) >= new Date()) || sats[0];
      nextTag.textContent = 'Próx. sábado: ' + (next ? formatBR(next) : '--');
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
    const totalPlayers = document.getElementById('totalPlayers'); if(totalPlayers) totalPlayers.textContent = '0';
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
  const totalPlayers = document.getElementById('totalPlayers'); if(totalPlayers) totalPlayers.textContent = Object.keys(state.players).length || 0;
}

function renderStats(){
  const statMaxEl = document.getElementById('statMax');
  const statAvgEl = document.getElementById('statAvg');
  const statSábadosEl = document.getElementById('statSábados');
  const statNextEl = document.getElementById('statNextGame');
  const active = getActiveGame();
  if(!active){
    if(statMaxEl) statMaxEl.textContent='0'; if(statAvgEl) statAvgEl.textContent='0'; if(statSábadosEl) statSábadosEl.textContent='0'; if(statNextEl) statNextEl.textContent='--';
    return;
  }
  const pts = Object.values(active.playersPoints || {});
  const max = pts.length ? Math.max(...pts) : 0;
  const avg = pts.length ? Math.round(pts.reduce((a,b)=>a+b,0)/pts.length) : 0;
  if(statMaxEl) statMaxEl.textContent = max.toLocaleString('pt-BR');
  if(statAvgEl) statAvgEl.textContent = avg.toLocaleString('pt-BR');
  const sats = generateSaturdaysBetween(active.startedAt, active.plannedEndAt);
  if(statSábadosEl) statSábadosEl.textContent = (Object.keys(active.playersPoints||{}).length || 0) + '/' + sats.length;
  if(statNextEl) statNextEl.textContent = 'SÁBADO ' + (sats.length ? formatBR(sats.find(s=> new Date(s) >= new Date()) || sats[0]) : '--');
}

/* ------------------------
   Modal system (complete)
   ------------------------ */

const modalRoot = document.getElementById('modal-root') || (function(){ const d = document.createElement('div'); d.id='modal-root'; document.body.appendChild(d); return d; })();
let currentModal = null;

function openModal(type, payload){
  closeModal();
  document.body.style.overflow = 'hidden';
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'; overlay.id = 'modal-overlay'; overlay.addEventListener('click', closeModal);
  const center = document.createElement('div'); center.className = 'modal-center'; center.addEventListener('click', e => e.stopPropagation());
  overlay.appendChild(center);
  modalRoot.appendChild(overlay);
  currentModal = { type, payload, overlay, center };

  // render content
  if(type === 'playerRegister') center.innerHTML = playerRegisterHtml();
  else if(type === 'managePlayers') center.innerHTML = managePlayersHtml();
  else if(type === 'editPlayer') center.innerHTML = editPlayerHtml(payload);
  else if(type === 'createGame') center.innerHTML = createGameHtml();
  else if(type === 'endGame') center.innerHTML = endGameHtml();
  else if(type === 'launchPoints') center.innerHTML = launchPointsHtml();
  else if(type === 'annualRanking') center.innerHTML = annualRankingHtml();
  else center.innerHTML = '<div>Tipo de modal desconhecido</div>';

  attachModalHandlers(type, payload);
}

function closeModal(){
  const o = document.getElementById('modal-overlay');
  if(o) o.remove();
  currentModal = null;
  document.body.style.overflow = '';
}

/* Modal HTML builders */

function playerRegisterHtml(){
  return `
    <h2>CADASTRAR JOGADOR / ADMIN</h2>
    <form id="form-player" class="mt-4">
      <label>Nome</label><input id="player-name" class="pixel-input" placeholder="Nome completo" required />
      <label>Telefone</label><input id="player-phone" class="pixel-input" placeholder="(11) 9xxxx-xxxx" />
      <label>Perfil</label><select id="player-role" class="pixel-input"><option value="player">Jogador</option><option value="admin">Administrador</option></select>
      <div id="admin-credentials" style="display:none">
        <label>Email</label><input id="player-email" class="pixel-input" placeholder="admin@exemplo.com" />
        <label>Senha</label><div style="display:flex;gap:8px;"><input id="player-pass" type="password" class="pixel-input" style="flex:1"/><button id="toggle-pass" type="button" class="pixel-btn">Mostrar</button></div>
        <label>Confirmar senha</label><input id="player-pass2" type="password" class="pixel-input" />
      </div>
      <div class="flex gap-3 mt-2"><button class="pixel-btn" type="submit">CADASTRAR</button><button type="button" id="cancel-player" class="pixel-btn">CANCELAR</button></div>
    </form>
  `;
}

function editPlayerHtml(key){
  const p = state.players[key] || {};
  return `
    <h2>EDITAR JOGADOR</h2>
    <form id="form-edit-player" class="mt-4">
      <label>Nome</label><input id="edit-name" class="pixel-input" value="${(p.name||'').replace(/"/g,'&quot;')}" />
      <label>Telefone</label><input id="edit-phone" class="pixel-input" value="${(p.phone||'').replace(/"/g,'&quot;')}" />
      <label>Perfil</label><select id="edit-role" class="pixel-input"><option value="player" ${p.role==='player'?'selected':''}>Jogador</option><option value="admin" ${p.role==='admin'?'selected':''}>Administrador</option></select>
      <div id="edit-admin-credentials" style="display:none">
        <label>Email (apenas se criando credenciais)</label><input id="edit-email" class="pixel-input" value="${(p.email||'').replace(/"/g,'&quot;')}" />
        <label>Senha (nova)</label><input id="edit-pass" type="password" class="pixel-input" />
      </div>
      <div class="flex gap-3 mt-2"><button class="pixel-btn" type="submit">SALVAR</button><button type="button" id="cancel-edit" class="pixel-btn">CANCELAR</button></div>
      <div class="mt-2"><button id="del-player" class="pixel-btn" type="button">DELETAR</button></div>
    </form>
  `;
}

function managePlayersHtml(){
  const players = state.players || {};
  const rows = Object.entries(players).map(([k,p]) => {
    return `<div class="flex justify-between items-center py-2 border-b player-row" data-name="${(p.name||'').toLowerCase()}"><div><div>${p.name}</div><div style="font-size:12px">${p.role || ''} ${p.phone ? ' • ' + p.phone : ''}</div></div><div class="flex gap-2"><button class="pixel-btn btn-edit" data-key="${k}">EDIT</button><button class="pixel-btn btn-del" data-key="${k}">DEL</button></div></div>`;
  }).join('') || '<div>Nenhum jogador</div>';

  return `<h2>GERENCIAR JOGADORES</h2><div class="mt-4"><div style="margin-bottom:8px"><input id="manage-search" class="pixel-input" placeholder="Pesquisar jogador..." /></div>${rows}</div><div class="mt-4"><button id="close-manage" class="pixel-btn">FECHAR</button></div>`;
}

function createGameHtml(){
  return `
    <h2>NOVO GAME UAU</h2>
    <form id="form-create-game" class="mt-4">
      <label>Data de início</label><input id="create-start" class="pixel-input" type="date" required />
      <label>Data de término</label><input id="create-end" class="pixel-input" type="date" required />
      <label>Trimestre (opcional)</label><select id="create-trim" class="pixel-input"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select>
      <div class="flex gap-3 mt-2"><button class="pixel-btn" type="submit">CRIAR</button><button id="cancel-create" type="button" class="pixel-btn">CANCELAR</button></div>
    </form>
  `;
}

function endGameHtml(){
  return `<h2>ENCERRAR TRIMESTRE</h2><p>Deseja encerrar o trimestre em andamento?</p><div class="flex gap-3 mt-4"><button id="confirm-end" class="pixel-btn">SIM, ENCERRAR</button><button id="cancel-end" class="pixel-btn">CANCELAR</button></div>`;
}

function launchPointsHtml(){
  const active = getActiveGame();
  if(!active) return `<h2>LANÇAR PONTOS</h2><div class="mt-4 pixel-box p-4">Nenhum game UAU em andamento no momento.</div><div class="mt-4"><button id="close-launch" class="pixel-btn">FECHAR</button></div>`;
  const sats = generateSaturdaysBetween(active.startedAt, active.plannedEndAt);
  const satsHtml = sats.map(s => `<button class="pixel-btn sat-btn" data-iso="${s}" style="margin:4px">${formatBR(s)}</button>`).join('');
  return `<h2>LANÇAR PONTOS</h2><div class="mt-2">Escolha o sábado:</div><div class="mt-3">${satsHtml}</div><div class="mt-4">Pesquisar jogador:</div><input id="points-search" class="pixel-input" placeholder="Digite para filtrar" /><div id="points-table-area" class="mt-4"></div><div class="mt-4"><button id="close-launch" class="pixel-btn">FECHAR</button></div>`;
}

function annualRankingHtml(){
  const arr = computeAnnualRanking(new Date().getFullYear());
  const players = state.players || {};
  const rows = arr.map((r,i) => `<div style="display:flex;justify-content:space-between;padding:6px;border-bottom:1px solid #000">${i+1}. ${players[r.id]?players[r.id].name:'Desconhecido'} <strong>${r.points.toLocaleString('pt-BR')}</strong></div>`).join('') || '<div>Nenhum registro</div>';
  return `<h2>RANKING ANUAL - ${new Date().getFullYear()}</h2><div class="mt-4">${rows}</div><div class="mt-4"><button id="close-annual" class="pixel-btn">FECHAR</button></div>`;
}

/* Attach modal handlers depending on type */
function attachModalHandlers(type, payload){
  try {
    if(type === 'playerRegister'){
      const roleSel = document.getElementById('player-role');
      roleSel.addEventListener('change', e => document.getElementById('admin-credentials').style.display = e.target.value === 'admin' ? 'block' : 'none');
      document.getElementById('toggle-pass')?.addEventListener('click', () => {
        const p = document.getElementById('player-pass'); p.type = p.type === 'password' ? 'text' : 'password';
        document.getElementById('toggle-pass').textContent = p.type === 'password' ? 'Mostrar' : 'Esconder';
      });

      document.getElementById('form-player').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('player-name').value.trim();
        const phone = document.getElementById('player-phone').value.trim();
        const role = document.getElementById('player-role').value;
        if(!name) return alert('Nome obrigatório');
        try {
          if(role === 'admin'){
            const email = document.getElementById('player-email').value.trim();
            const pass = document.getElementById('player-pass').value;
            const pass2 = document.getElementById('player-pass2').value;
            if(!email || !pass) return alert('Email e senha obrigatórios para admin');
            if(pass !== pass2) return alert('Senhas não conferem');
            await createPlayerAPI({ name, phone, role:'admin', email, password: pass });
            alert('Administrador criado');
            closeModal();
          } else {
            await createPlayerAPI({ name, phone, role:'player' });
            alert('Jogador criado');
            closeModal();
          }
        } catch(err){ console.error(err); alert('Erro criar jogador: '+(err.message||err)); }
      });

      document.getElementById('cancel-player').addEventListener('click', closeModal);
      return;
    }

    if(type === 'managePlayers'){
      const search = document.getElementById('manage-search');
      if(search) search.addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('.player-row').forEach(row => {
          const name = row.dataset.name || '';
          row.style.display = name.includes(q) ? '' : 'none';
        });
      });
      document.getElementById('close-manage').addEventListener('click', closeModal);
      return;
    }

    if(type === 'editPlayer'){
      const key = payload;
      const roleSel = document.getElementById('edit-role');
      roleSel.addEventListener('change', e => document.getElementById('edit-admin-credentials').style.display = e.target.value === 'admin' ? 'block' : 'none');
      document.getElementById('cancel-edit').addEventListener('click', closeModal);
      document.getElementById('del-player').addEventListener('click', async () => {
        if(!confirm('Excluir jogador?')) return;
        try { await deletePlayerAPI(key); alert('Excluído'); closeModal(); } catch(err){ console.error(err); alert('Erro: '+(err.message||err)); }
      });

      document.getElementById('form-edit-player').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('edit-name').value.trim();
        const phone = document.getElementById('edit-phone').value.trim();
        const role = document.getElementById('edit-role').value;
        if(!name) return alert('Nome obrigatório');
        try {
          const player = state.players[key];
          if(role === 'admin' && (!player || player.role !== 'admin')){
            const email = document.getElementById('edit-email').value.trim();
            const pass = document.getElementById('edit-pass').value;
            if(!email || !pass) return alert('Email e senha necessários para transformar em admin');
            const cred = await createUserWithEmailAndPassword(auth, email, pass);
            const uid = cred.user.uid;
            const newObj = { id: uid, name, phone: phone||null, role: 'admin', createdAt: new Date().toISOString() };
            await set(ref(db, '/players/' + uid), newObj);
            await remove(ref(db, '/players/' + key));
            alert('Transformado em admin');
            closeModal();
            return;
          } else {
            await updatePlayerAPI(key, { name, phone, role });
            alert('Atualizado');
            closeModal();
          }
        } catch(err){ console.error(err); alert('Erro ao atualizar: '+(err.message||err)); }
      });
      return;
    }

    if(type === 'createGame'){
      document.getElementById('cancel-create').addEventListener('click', closeModal);
      document.getElementById('form-create-game').addEventListener('submit', async (e) => {
        e.preventDefault();
        const start = document.getElementById('create-start').value;
        const end = document.getElementById('create-end').value;
        const trimester = Number(document.getElementById('create-trim').value || 1);
        if(!start || !end) return alert('Preencha data de início e término');
        const startIso = new Date(start + 'T00:00:00').toISOString();
        const endIso = new Date(end + 'T23:59:59').toISOString();
        if(new Date(startIso) > new Date(endIso)) return alert('Data de término deve ser posterior à data de início');
        try {
          await createGameAPI({ startIso, endIso, trimester });
          alert('Game criado e ativado');
          closeModal();
        } catch(err){ console.error(err); alert('Erro criar game: '+(err.message||err)); }
      });
      return;
    }

    if(type === 'endGame'){
      document.getElementById('cancel-end').addEventListener('click', closeModal);
      document.getElementById('confirm-end').addEventListener('click', async () => {
        try { await endGameAPI(state.activeGameId); alert('Trimestre encerrado'); closeModal(); } catch(err){ console.error(err); alert('Erro: '+(err.message||err)); }
      });
      return;
    }

    if(type === 'launchPoints'){
      // Sábados buttons were rendered with class .sat-btn; attach click
      document.querySelectorAll('.sat-btn').forEach(btn => btn.addEventListener('click', (e) => {
        const iso = e.currentTarget.dataset.iso;
        renderPointsTableForSaturday(iso);
      }));

      const search = document.getElementById('points-search');
      if(search) search.addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('.pts-row').forEach(row => {
          const name = row.dataset.name || '';
          row.style.display = name.toLowerCase().includes(q) ? '' : 'none';
        });
      });

      document.getElementById('close-launch').addEventListener('click', closeModal);
      return;
    }

    if(type === 'annualRanking'){
      document.getElementById('close-annual').addEventListener('click', closeModal);
      return;
    }
  } catch(err){
    console.error('attachModalHandlers err', err);
  }
}

/* Points table render */
function renderPointsTableForSaturday(iso){
  const players = state.players || {};
  const list = Object.values(players).sort((a,b) => a.name.localeCompare(b.name));
  const rows = list.map(p => `<div class="pts-row flex justify-between items-center py-2 border-b" data-name="${(p.name||'')}"><div>${p.name}</div><div style="display:flex;gap:8px;align-items:center"><input id="pts-${p.id}" class="pixel-input" style="width:120px;padding:6px" type="number" placeholder="0" /><button class="pixel-btn save-point-btn" data-pid="${p.id}" data-iso="${iso}">SALVAR</button></div></div>`).join('');
  const area = document.getElementById('points-table-area');
  if(area) area.innerHTML = `<h3>Pontos para: ${formatBR(iso)}</h3><div>${rows}</div>`;
}

/* Annual ranking compute */
function computeAnnualRanking(year){
  const scoreMap = {};
  const gamesObj = state.games || {};
  for(const gid in gamesObj){
    const g = gamesObj[gid];
    const gy = new Date(g.startedAt).getFullYear();
    if(gy !== year) continue;
    const ppts = g.playersPoints || {};
    for(const pid in ppts) scoreMap[pid] = (scoreMap[pid] || 0) + Number(ppts[pid] || 0);
  }
  return Object.entries(scoreMap).map(([id,points]) => ({ id, points })).sort((a,b) => b.points - a.points);
}

/* Utility: generate saturdays between start and end ISO */
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
    if(arr.length > 200) break; // safe-guard
  }
  return arr;
}

/* ------------------------------
   Final safety: schedule initial render
   ------------------------------ */
setTimeout(() => { renderAllAdmin(); }, 300);
