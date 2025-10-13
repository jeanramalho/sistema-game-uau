import { auth, db } from './firebase.js';
import { onAuthStateChanged, createUserWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { ref, onValue, set, push, update, remove, get } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { formatBR } from './common.js';
import { saveElementAsImage } from './print.js';
import { 
  ensureSheetJS, 
  generateFrequencyReport, 
  generateBimestreReport,
  getAvailableYearsAndTrimester,
  exportToExcel, 
  exportToCSV, 
  clearAllData 
} from './reports.js';

// Espera o primeiro onAuthStateChanged para evitar "Verificando autenticação..." preso
function waitForInitialAuthState() {
  return new Promise(resolve => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      resolve(user || null);
    });
  });
}

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

// Boot
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
  updateAuthBtn(user);
  if(!user){
    const next = encodeURIComponent('admin.html');
    window.location.href = `login.html?next=${next}`;
    return;
  }
  initAdminPanel();
})();

/* ===========================
   Implementação do painel
   =========================== */

let state = { players: {}, games: {}, activeGameId: null };
let unsubPlayers = null, unsubGames = null, unsubMeta = null;

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
  if(!document.getElementById('modal-root')){
    const mr = document.createElement('div');
    mr.id = 'modal-root';
    document.body.appendChild(mr);
  }
  wireAdmin();
}

/* Wiring */
function wireAdmin(){
  const cardRegister = document.getElementById('card-register-player');
  const cardCreateEnd = document.getElementById('card-create-end-game');
  const cardLaunchPoints = document.getElementById('card-launch-points');
  const cardManagePlayers = document.getElementById('card-manage-players');
  const cardAnnualRanking = document.getElementById('card-annual-ranking');
  const cardSettings = document.getElementById('card-settings');
  const quickRegisterBtn = document.getElementById('quickRegisterBtn');

  if(cardRegister) cardRegister.addEventListener('click', () => openModal('playerRegister'));
  if(quickRegisterBtn) quickRegisterBtn.addEventListener('click', () => openModal('playerRegister'));
  if(cardManagePlayers) cardManagePlayers.addEventListener('click', () => openModal('managePlayers'));
  if(cardCreateEnd) cardCreateEnd.addEventListener('click', () => { if(state.activeGameId) openModal('endGame'); else openModal('createGame'); });
  if(cardLaunchPoints) cardLaunchPoints.addEventListener('click', () => openModal('launchPoints'));
  if(cardAnnualRanking) cardAnnualRanking.addEventListener('click', () => openModal('annualRanking'));
  if(cardSettings) cardSettings.addEventListener('click', () => openModal('settings'));

  unsubPlayers = onValue(ref(db, '/players'), snap => { state.players = snap.val() || {}; renderAllAdmin(); }, err => { console.warn('players read err', err); state.players = {}; renderAllAdmin(); });
  unsubGames = onValue(ref(db, '/games'), snap => { state.games = snap.val() || {}; renderAllAdmin(); }, err => { console.warn('games read err', err); state.games = {}; renderAllAdmin(); });
  unsubMeta = onValue(ref(db, '/meta/activeGameId'), snap => { state.activeGameId = snap.val(); renderAllAdmin(); }, err => { console.warn('meta read err', err); state.activeGameId = null; renderAllAdmin(); });

  const authBtn = document.getElementById('authBtn');
  if(authBtn){
    authBtn.onclick = async () => {
      try { await signOut(auth); location.href = 'index.html'; } catch(err){ console.error(err); alert('Erro ao sair: ' + (err.message || err)); }
    };
  }

  // Configura event delegation após inicialização
  setupEventDelegation();
}

/* ----------------------
   Event Delegation Setup
   ---------------------- */

function setupEventDelegation() {
  // Remove event listeners anteriores se existirem (tanto capture quanto bubble) para evitar duplicatas
  if(window.adminClickHandler) {
    try {
      document.removeEventListener('click', window.adminClickHandler);
      document.removeEventListener('click', window.adminClickHandler, true);
    } catch(e){}
  }
  
  // Event delegation para todos os botões do admin
  window.adminClickHandler = async (e) => {
    if(!e.target) return;

    // UTIL: procura pelos elementos relevantes subindo a árvore com closest
    const saveBtn = e.target.closest && e.target.closest('.save-point-btn');
    if(saveBtn){
      e.preventDefault();
      e.stopPropagation();
      const pid = saveBtn.dataset.pid;
      const iso = saveBtn.dataset.iso;
      const gid = state.activeGameId;
      if(!pid){ return; }
      if(!gid || !iso) return alert('Nenhum trimestre/sábado selecionado');
      const valEl = document.getElementById('pts-' + pid);
      const val = Number(valEl?.value || 0);
      try {
        const writeKey = isoKeyWrite(iso);
        await set(ref(db, `/games/${gid}/saturdays/${writeKey}/${pid}`), Number(val));
        await cleanupOldIsoKeys(gid, iso, pid, writeKey);
        alert('Pontos salvos');
      } catch(err){
        alert('Erro ao salvar ponto: '+ (err.message || err));
      }
      return;
    }

    // Botões de editar jogador (agora com closest para garantir captura)
    const editBtn = e.target.closest && e.target.closest('.btn-edit');
    if(editBtn){
      e.preventDefault();
      e.stopPropagation();
      const key = editBtn.dataset.key;
      if(!key) return;
      openModal('editPlayer', key);
      return;
    }
    
    // Botões de deletar jogador (closest)
    const delBtn = e.target.closest && e.target.closest('.btn-del');
    if(delBtn){
      e.preventDefault();
      e.stopPropagation();
      const key = delBtn.dataset.key;
      if(!key) return;
      
      const player = state.players[key];
      const playerName = player ? player.name : 'jogador';
      
      if(!confirm(`Tem certeza que deseja excluir o jogador "${playerName}"?\n\nEsta ação não pode ser desfeita e removerá todos os dados do jogador.`)) {
        return;
      }
      
      try {
        await deletePlayerAPI(key);
        alert('Jogador excluído com sucesso!');
      } catch(err){ 
        alert('Erro ao excluir jogador: '+(err.message||err)); 
      }
      return;
    }
  };
  
  // Adiciona o event listener em modo de captura para que ele receba cliques
  // mesmo que o modal faça stopPropagation() no estágio de target/bubble.
  document.addEventListener('click', window.adminClickHandler, true);
}

/* ----------------------
   CRUD helpers
   ---------------------- */

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

async function updatePlayerAPI(key, patch){ await update(ref(db, '/players/' + key), patch); }

async function deletePlayerAPI(key){
  if(!key) {
    throw new Error('Chave do jogador não fornecida');
  }
  
  try {
    // Remove o jogador da lista de jogadores
    await remove(ref(db, '/players/' + key));
    
    // Busca todos os games para limpar dados relacionados
    const gSnap = await get(ref(db, '/games'));
    const gamesObj = gSnap.val() || {};
    
    // Limpa dados do jogador em todos os games
    for(const gid in gamesObj){
      const game = gamesObj[gid];
      if(!game) continue;
      
      // Remove pontos dos sábados
      if(game.saturdays){
        const sats = game.saturdays;
        for(const isoKey in sats){
          if(sats[isoKey] && sats[isoKey][key]) {
            await remove(ref(db, `/games/${gid}/saturdays/${isoKey}/${key}`));
          }
        }
      }
      
      // Remove pontos totais do jogador no game
      if(game.playersPoints && game.playersPoints[key]){
        await remove(ref(db, `/games/${gid}/playersPoints/${key}`));
      }
    }
  } catch(error) {
    throw error;
  }
}

async function createGameAPI({ startIso, endIso, trimester }){
  const activeSnap = await get(ref(db, '/meta/activeGameId'));
  if(activeSnap.exists() && activeSnap.val()) throw new Error('Já existe um trimestre ativo.');
  const newRef = push(ref(db, '/games'));
  const gid = newRef.key;
  const game = { id: gid, year: new Date(startIso).getFullYear(), trimester: trimester || 1, startedAt: startIso, plannedEndAt: endIso, endedAt: null, playersPoints: {}, saturdays: {} };
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
   Utilitários / Render
   ------------------------ */

function getActiveGame(){
  if(!state.activeGameId) return null;
  const g = state.games && state.games[state.activeGameId] ? state.games[state.activeGameId] : null;
  if(!g) return null;
  if(g.endedAt) return null;
  return g;
}

// Soma pontos de um game somando todas as saturdays (compatível com playersPoints legado)
function computeGameTotals(g){
  const totals = {};
  if(!g) return totals;
  if(g.saturdays){
    for(const isoKey in g.saturdays){
      const per = g.saturdays[isoKey] || {};
      for(const pid in per){
        totals[pid] = (totals[pid] || 0) + Number(per[pid] || 0);
      }
    }
  }
  if(Object.keys(totals).length === 0 && g.playersPoints){
    for(const pid in g.playersPoints) totals[pid] = Number(g.playersPoints[pid] || 0);
  }
  return totals;
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

  const totals = computeGameTotals(active);
  const arr = Object.entries(state.players).map(([key,p]) => ({ id:key, name:p.name, points: totals[key] || 0 }));
  arr.sort((a,b)=> b.points - a.points);
  arr.forEach((r,i)=>{
    const div = document.createElement('div'); div.className = 'ranking-row pixel-box';
    div.innerHTML = `<div>${i+1}º • ${escapeHtml(r.name)}</div><div class="font-bold">${r.points.toLocaleString('pt-BR')}</div>`;
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
  const totals = computeGameTotals(active);
  const pts = Object.values(totals || {});
  const max = pts.length ? Math.max(...pts) : 0;
  const avg = pts.length ? Math.round(pts.reduce((a,b)=>a+b,0)/pts.length) : 0;
  if(statMaxEl) statMaxEl.textContent = max.toLocaleString('pt-BR');
  if(statAvgEl) statAvgEl.textContent = avg.toLocaleString('pt-BR');
  const sats = generateSaturdaysBetween(active.startedAt, active.plannedEndAt);
  if(statSábadosEl) statSábadosEl.textContent = (Object.keys(active.saturdays || {}).length || 0) + '/' + sats.length;
  if(statNextEl) statNextEl.textContent = 'SÁBADO ' + (sats.length ? formatBR(sats.find(s=> new Date(s) >= new Date()) || sats[0]) : '--');
}

/* ------------------------
   Modal system (completo)
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

  if(type === 'playerRegister') center.innerHTML = playerRegisterHtml();
  else if(type === 'managePlayers') center.innerHTML = managePlayersHtml();
  else if(type === 'editPlayer') center.innerHTML = editPlayerHtml(payload);
  else if(type === 'createGame') center.innerHTML = createGameHtml();
  else if(type === 'endGame') center.innerHTML = endGameHtml();
  else if(type === 'launchPoints') center.innerHTML = launchPointsHtml();
  else if(type === 'annualRanking') center.innerHTML = annualRankingHtml();
  else if(type === 'settings') center.innerHTML = settingsHtml();
  else center.innerHTML = '<div>Tipo de modal desconhecido</div>';

  attachModalHandlers(type, payload);
}

function closeModal(){
  const o = document.getElementById('modal-overlay');
  if(o) o.remove();
  currentModal = null;
  document.body.style.overflow = '';
}

/* Modal HTML builders (mesma estrutura) */

function playerRegisterHtml(){
  return `
    <h2>CADASTRAR JOGADOR / ADMIN</h2>
    <form id="form-player" class="mt-4">
      <label>Nome</label><input id="player-name" class="pixel-input" placeholder="Nome completo" required />
      <label>Telefone</label><input id="player-phone" class="pixel-input" placeholder="(11) 9xxxx-xxxx" />
      <label>Perfil</label><select id="player-role" class="pixel-input"><option value="player">Jogador</option><option value="admin">Administrador</option></select>
      <div id="admin-credentials" style="display:none">
        <label>Email</label><input id="player-email" class="pixel-input" placeholder="admin@exemplo.com" />
        <label>Senha</label><div class="admin-pass-row"><input id="player-pass" type="password" class="pixel-input" /><button id="toggle-pass" type="button" class="pixel-btn">Mostrar</button></div>
        <label>Confirmar senha</label><input id="player-pass2" type="password" class="pixel-input" />
      </div>
      <div class="flex gap-3 mt-2"><button class="pixel-btn" type="submit">CADASTRAR</button><button type="button" id="cancel-player" class="pixel-btn">CANCELAR</button></div>
    </form>
  `;
}

function editPlayerHtml(key){
  const p = state.players[key] || {};
  if(!p || !p.name) {
    return `
      <h2>ERRO</h2>
      <div class="pixel-box p-4 text-center">
        <p>Jogador não encontrado.</p>
        <div class="mt-4">
          <button id="cancel-edit" class="pixel-btn">FECHAR</button>
        </div>
      </div>
    `;
  }
  
  return `
    <h2>EDITAR JOGADOR</h2>
    <div class="pixel-box p-4 mb-4">
      <p class="text-sm">Editando: <strong>${escapeHtml(p.name)}</strong></p>
    </div>
    <form id="form-edit-player" class="mt-4">
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-semibold mb-2">Nome Completo</label>
          <input id="edit-name" class="pixel-input" value="${escapeHtml(p.name||'')}" placeholder="Nome completo do jogador" required />
        </div>
        
        <div>
          <label class="block text-sm font-semibold mb-2">Telefone</label>
          <input id="edit-phone" class="pixel-input" value="${escapeHtml(p.phone||'')}" placeholder="(11) 9xxxx-xxxx" />
        </div>
        
        <div>
          <label class="block text-sm font-semibold mb-2">Perfil</label>
          <select id="edit-role" class="pixel-input">
            <option value="player" ${p.role==='player'?'selected':''}>Jogador</option>
            <option value="admin" ${p.role==='admin'?'selected':''}>Administrador</option>
          </select>
        </div>
        
        <div id="edit-admin-credentials" style="display:none">
          <div class="pixel-box p-3 bg-yellow-50 border-yellow-300">
            <p class="text-xs text-yellow-800 mb-2">⚠️ Apenas preencha se estiver transformando em administrador</p>
            <div class="space-y-3">
              <div>
                <label class="block text-sm font-semibold mb-2">Email</label>
                <input id="edit-email" class="pixel-input" value="${escapeHtml(p.email||'')}" placeholder="admin@exemplo.com" />
              </div>
              <div>
                <label class="block text-sm font-semibold mb-2">Nova Senha</label>
                <input id="edit-pass" type="password" class="pixel-input" placeholder="Digite uma nova senha" />
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="flex flex-col sm:flex-row gap-3 mt-6">
        <button class="pixel-btn flex-1" type="submit">SALVAR ALTERAÇÕES</button>
        <button type="button" id="cancel-edit" class="pixel-btn flex-1">CANCELAR</button>
      </div>
      
      <div class="mt-4 pt-4 border-t border-gray-300">
        <button id="del-player" class="pixel-btn w-full bg-red-100 border-red-500 text-red-800 hover:bg-red-200" type="button">
          🗑️ EXCLUIR JOGADOR
        </button>
        <p class="text-xs text-red-600 mt-2 text-center">
          Esta ação removerá permanentemente todos os dados do jogador
        </p>
      </div>
    </form>
  `;
}

function managePlayersHtml(){
  const players = state.players || {};
  const playersCount = Object.keys(players).length;
  
  const rows = Object.entries(players).map(([k,p]) => {
    const roleText = p.role === 'admin' ? 'Administrador' : 'Jogador';
    const phoneText = p.phone ? ` • ${p.phone}` : '';
    
    return `
      <div class="player-row pixel-box p-4 mb-3" data-name="${(p.name||'').toLowerCase()}">
        <div class="flex flex-col gap-3">
          <div class="flex-1">
            <div class="font-semibold text-lg">${escapeHtml(p.name)}</div>
            <div class="text-sm text-gray-600 mt-1">
              <span class="tag text-xs">${roleText}</span>
              ${phoneText ? `<span class="text-xs ml-2">${escapeHtml(p.phone)}</span>` : ''}
            </div>
          </div>
          <div class="flex flex-col gap-2">
            <button class="pixel-btn btn-edit" data-key="${k}">
              ✏️ EDITAR
            </button>
            <button class="pixel-btn btn-del bg-red-100 border-red-500 text-red-800 hover:bg-red-200" data-key="${k}">
              🗑️ EXCLUIR
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('') || '<div class="pixel-box p-6 text-center text-gray-500">Nenhum jogador cadastrado</div>';

  return `
    <h2>GERENCIAR JOGADORES</h2>
    <div class="pixel-box p-4 mb-4">
      <p class="text-sm">Total de jogadores: <strong>${playersCount}</strong></p>
    </div>
    
    <div class="mt-4">
      <div class="mb-4">
        <input id="manage-search" class="pixel-input" placeholder="🔍 Pesquisar jogador por nome..." />
      </div>
      <div id="players-list">
        ${rows}
      </div>
    </div>
    
    <div class="mt-6 flex justify-center">
      <button id="close-manage" class="pixel-btn">FECHAR</button>
    </div>
  `;
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
  const rows = arr.map((r,i) => `<div style="display:flex;justify-content:space-between;padding:6px;border-bottom:1px solid #000">${i+1}. ${escapeHtml(players[r.id]?players[r.id].name:'Desconhecido')} <strong>${r.points.toLocaleString('pt-BR')}</strong></div>`).join('') || '<div>Nenhum registro</div>';
  return `<h2>RANKING ANUAL - ${new Date().getFullYear()}</h2><div class="mt-4">${rows}</div><div class="mt-4"><button id="close-annual" class="pixel-btn">FECHAR</button></div>`;
}

function settingsHtml(){
  const available = getAvailableYearsAndTrimester(state.games || {});
  
  return `
    <h2>CONFIGURAÇÕES DO SISTEMA</h2>
    <p class="mt-2">Gerenciar relatórios e dados do sistema.</p>
    
    <div class="mt-6 space-y-6">
      <!-- Relatórios -->
      <div class="pixel-box p-4">
        <h3>RELATÓRIOS</h3>
        <p class="text-sm mt-1">Exportar dados em formato Excel ou CSV</p>
        
        <div class="mt-4 space-y-4">
          <!-- Relatório de Frequência -->
          <div class="flex flex-col gap-2">
            <h4 class="text-sm">Relatório de Frequência</h4>
            <p class="text-xs">Mostra quantidade de sábados que cada jogador esteve presente</p>
            <div class="flex gap-2">
              <button id="export-frequency-excel" class="pixel-btn flex-1">EXCEL</button>
              <button id="export-frequency-csv" class="pixel-btn flex-1">CSV</button>
            </div>
          </div>
          
          <!-- Relatório por Bimestre -->
          <div class="flex flex-col gap-2">
            <h4 class="text-sm">Relatório por Bimestre</h4>
            <p class="text-xs">Pontuação total por trimestre (filtros opcionais)</p>
            
            <!-- Filtros para relatório bimestre -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              <div>
                <label class="text-xs">Ano:</label>
                <select id="filter-year" class="pixel-input text-sm">
                  <option value="">Todos os anos</option>
                  ${available.years.map(year => `<option value="${year}">${year}</option>`).join('')}
                </select>
              </div>
              
              <div>
                <label class="text-xs">Bimestre:</label>
                <select id="filter-bimestre" class="pixel-input text-sm">
                  <option value="">Todos os bimestres</option>
                  ${available.trimester.map(t => `<option value="${t}">${t}º Bimestre</option>`).join('')}
                </select>
              </div>
            </div>
            
            <div class="flex gap-2">
              <button id="export-bimestre-excel" class="pixel-btn flex-1">EXCEL</button>
              <button id="export-bimestre-csv" class="pixel-btn flex-1">CSV</button>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Administração -->
      <div class="pixel-box p-4">
        <h3>ADMINISTRAÇÃO</h3>
        <p class="text-sm mt-1">⚠️ Ações irreversíveis</p>
        
        <div class="mt-4">
          <button id="clear-all-data" class="pixel-btn w-full bg-red-100 border-red-500 text-red-800 hover:bg-red-200">
            🗑️ LIMPAR TODOS OS DADOS
          </button>
        </div>
        
        <div class="mt-3">
          <p class="text-xs text-red-600">
            Remove TODOS os dados: jogadores, games, pontuações e configurações.<br>
            <strong>Esta ação NÃO PODE SER DESFEITA!</strong>
          </p>
        </div>
      </div>
    </div>
    
    <div class="mt-6 flex gap-3">
      <button id="close-settings" class="pixel-btn">VOLTAR</button>
    </div>
  `;
}

/* Attach modal handlers */
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
      // Configuração da busca
      const search = document.getElementById('manage-search');
      if(search) {
        search.addEventListener('input', e => {
          const query = e.target.value.toLowerCase().trim();
          const playerRows = document.querySelectorAll('.player-row');
          
          if(query === '') {
            playerRows.forEach(row => {
              row.style.display = '';
            });
          } else {
            playerRows.forEach(row => {
              const playerName = row.dataset.name || '';
              const shouldShow = playerName.includes(query);
              row.style.display = shouldShow ? '' : 'none';
            });
          }
        });
      }
      
      // Botão fechar
      const closeBtn = document.getElementById('close-manage');
      if(closeBtn) {
        closeBtn.addEventListener('click', closeModal);
      }
      
      return;
    }

    if(type === 'editPlayer'){
      const key = payload;
      const player = state.players[key];
      
      if(!player) {
        return;
      }
      
      // Configuração do seletor de perfil
      const roleSel = document.getElementById('edit-role');
      if(roleSel) {
        roleSel.addEventListener('change', e => {
          const adminCreds = document.getElementById('edit-admin-credentials');
          if(adminCreds) {
            adminCreds.style.display = e.target.value === 'admin' ? 'block' : 'none';
          }
        });
      }
      
      // Botão cancelar
      const cancelBtn = document.getElementById('cancel-edit');
      if(cancelBtn) {
        cancelBtn.addEventListener('click', closeModal);
      }
      
      // Botão deletar jogador
      const delBtn = document.getElementById('del-player');
      if(delBtn) {
        delBtn.addEventListener('click', async () => {
          const playerName = player.name || 'jogador';
          if(!confirm(`Tem certeza que deseja excluir o jogador "${playerName}"?\n\nEsta ação não pode ser desfeita e removerá todos os dados do jogador.`)) {
            return;
          }
          
          try {
            await deletePlayerAPI(key);
            alert('Jogador excluído com sucesso!');
            closeModal();
          } catch(err){ 
            alert('Erro ao excluir jogador: '+(err.message||err)); 
          }
        });
      }

      // Formulário de edição
      const form = document.getElementById('form-edit-player');
      if(form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          
          const name = document.getElementById('edit-name').value.trim();
          const phone = document.getElementById('edit-phone').value.trim();
          const role = document.getElementById('edit-role').value;
          
          // Validações
          if(!name) {
            alert('Nome é obrigatório');
            return;
          }
          
          if(name.length < 2) {
            alert('Nome deve ter pelo menos 2 caracteres');
            return;
          }
          
          try {
            // Se está transformando em admin
            if(role === 'admin' && player.role !== 'admin'){
              const email = document.getElementById('edit-email').value.trim();
              const pass = document.getElementById('edit-pass').value;
              
              if(!email || !pass) {
                alert('Email e senha são necessários para transformar em administrador');
                return;
              }
              
              if(pass.length < 6) {
                alert('Senha deve ter pelo menos 6 caracteres');
                return;
              }
              
              // Cria novo usuário admin
              const cred = await createUserWithEmailAndPassword(auth, email, pass);
              const uid = cred.user.uid;
              const newObj = { 
                id: uid, 
                name, 
                phone: phone || null, 
                role: 'admin', 
                email: email,
                createdAt: new Date().toISOString() 
              };
              
              // Salva novo admin e remove o jogador antigo
              await set(ref(db, '/players/' + uid), newObj);
              await deletePlayerAPI(key); // Remove dados antigos
              
              alert('Jogador transformado em administrador com sucesso!');
              closeModal();
              return;
            } 
            // Atualização normal
            else {
              const updateData = { 
                name, 
                phone: phone || null, 
                role 
              };
              
              // Se é admin e tem email, atualiza email também
              if(role === 'admin' && player.role === 'admin') {
                const email = document.getElementById('edit-email').value.trim();
                if(email) {
                  updateData.email = email;
                }
              }
              
              await updatePlayerAPI(key, updateData);
              alert('Jogador atualizado com sucesso!');
              closeModal();
            }
          } catch(err){ 
            alert('Erro ao atualizar jogador: '+(err.message||err)); 
          }
        });
      }
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

    if(type === 'settings'){
      document.getElementById('close-settings').addEventListener('click', closeModal);
      
      // Handlers para exportação de frequência
      document.getElementById('export-frequency-excel').addEventListener('click', async () => {
        try {
          await ensureSheetJS();
          const reportData = generateFrequencyReport(state.games || {}, state.players || {});
          if (reportData.length === 0) {
            alert('Nenhum dado de frequência encontrado');
            return;
          }
          const fileName = `relatorio-frequencia-${new Date().toISOString().slice(0,10)}`;
          exportToExcel(reportData, fileName, 'Frequência');
          alert('✅ Relatório de frequência exportado em Excel');
        } catch(err) {
          console.error('Erro ao exportar:', err);
          alert('❌ Erro ao exportar relatório: ' + (err.message || err));
        }
      });
      
      document.getElementById('export-frequency-csv').addEventListener('click', async () => {
        try {
          const reportData = generateFrequencyReport(state.games || {}, state.players || {});
          if (reportData.length === 0) {
            alert('Nenhum dado de frequência encontrado');
            return;
          }
          const fileName = `relatorio-frequencia-${new Date().toISOString().slice(0,10)}`;
          exportToCSV(reportData, fileName);
          alert('✅ Relatório de frequência exportado em CSV');
        } catch(err) {
          console.error('Erro ao exportar:', err);
          alert('❌ Erro ao exportar relatório: ' + (err.message || err));
        }
      });
      
      // Função auxiliar para obter filtros do relatório bimestre
      const getFilters = () => {
        const yearSelect = document.getElementById('filter-year');
        const bimestreSelect = document.getElementById('filter-bimestre');
        
        const year = yearSelect.value ? Number(yearSelect.value) : null;
        const bimestre = bimestreSelect.value ? Number(bimestreSelect.value) : null;
        
        return { year, bimestre };
      };
      
      document.getElementById('export-bimestre-excel').addEventListener('click', async () => {
        try {
          await ensureSheetJS();
          const filters = getFilters();
          const reportData = generateBimestreReport(state.games || {}, state.players || {}, filters.year, filters.bimestre);
          
          if (reportData.length === 0) {
            alert('Nenhum dado encontrado para os filtros selecionados');
            return;
          }
          
          const filterText = filters.year || filters.bimestre ? 
            `-filtrado${filters.year ? `-ano${filters.year}` : ''}${filters.bimestre ? `-bim${filters.bimestre}` : ''}` : '';
          const fileName = `relatorio-bimestre${filterText}-${new Date().toISOString().slice(0,10)}`;
          
          exportToExcel(reportData, fileName, 'Bimestre');
          alert('✅ Relatório por bimestre exportado em Excel');
        } catch(err) {
          console.error('Erro ao exportar:', err);
          alert('❌ Erro ao exportar relatório: ' + (err.message || err));
        }
      });
      
      document.getElementById('export-bimestre-csv').addEventListener('click', async () => {
        try {
          const filters = getFilters();
          const reportData = generateBimestreReport(state.games || {}, state.players || {}, filters.year, filters.bimestre);
          
          if (reportData.length === 0) {
            alert('Nenhum dado encontrado para os filtros selecionados');
            return;
          }
          
          const filterText = filters.year || filters.bimestre ? 
            `-filtrado${filters.year ? `-ano${filters.year}` : ''}${filters.bimestre ? `-bim${filters.bimestre}` : ''}` : '';
          const fileName = `relatorio-bimestre${filterText}-${new Date().toISOString().slice(0,10)}`;
          
          exportToCSV(reportData, fileName);
          alert('✅ Relatório por bimestre exportado em CSV');
        } catch(err) {
          console.error('Erro ao exportar:', err);
          alert('❌ Erro ao exportar relatório: ' + (err.message || err));
        }
      });
      
      // Handler para limpeza de dados
      document.getElementById('clear-all-data').addEventListener('click', async () => {
        const success = await clearAllData();
        if(success) {
          // Fecha o modal após limpeza bem-sucedida
          setTimeout(() => {
            closeModal();
            // Força reload para atualizar a interface
            location.reload();
          }, 1000);
        }
      });
      
      return;
    }
  } catch(err){
    console.error('attachModalHandlers err', err);
  }
}

/* ------------------------
   Chave iso segura / compatibilidade
   ------------------------ */

// Chave segura para gravação: timestamp (milissegundos) — sem pontos nem caracteres proibidos
function isoKeyWrite(iso){
  try {
    return String(new Date(iso).getTime());
  } catch(e) {
    // fallback: use encoded but sanitized string (replace dots)
    return encodeURIComponent(String(iso)).replace(/\./g, '_');
  }
}

// Possíveis candidates para leitura (compatibilidade com dados antigos)
function isoKeyCandidates(iso){
  const cand = [];
  try {
    cand.push(String(new Date(iso).getTime())); // timestamp first (new canonical)
  } catch(e){}
  cand.push(encodeURIComponent(iso));    // older variant
  cand.push(iso);                        // raw iso (may contain dots)
  cand.push(encodeURIComponent(iso).replace(/\./g,'_'));
  cand.push(String(new Date(iso).toISOString()).replace(/\./g,'_'));
  // remove duplicates
  return Array.from(new Set(cand));
}

// Remove entradas antigas (mesmo jogador e mesma data) quando gravamos na chave canonical
async function cleanupOldIsoKeys(gid, iso, pid, canonicalKey){
  try {
    const cands = isoKeyCandidates(iso);
    for(const k of cands){
      if(k === canonicalKey) continue;
      // remove the old node for this player if exists
      const pathRef = ref(db, `/games/${gid}/saturdays/${k}/${pid}`);
      // use remove only if exists: get then remove
      const snap = await get(pathRef);
      if(snap.exists()){
        await remove(pathRef);
      }
    }
  } catch(err){
    console.warn('cleanupOldIsoKeys err', err);
  }
}

/* ------------------------
   Points table render (pre-fill + attach handlers)
   ------------------------ */

function renderPointsTableForSaturday(iso){
  const players = state.players || {};
  const entries = Object.entries(players).sort((a,b) => (a[1].name||'').localeCompare(b[1].name||''));
  const gid = state.activeGameId;
  const game = state.games && state.games[gid] ? state.games[gid] : null;
  const satsNode = (game && game.saturdays) ? game.saturdays : {};

  const rows = entries.map(([key,p]) => {
    // try to find existing value using candidates
    let existing = '';
    if(game && game.saturdays){
      const cands = isoKeyCandidates(iso);
      for(const c of cands){
        if(game.saturdays[c] && game.saturdays[c][key] !== undefined){
          existing = Number(game.saturdays[c][key]);
          break;
        }
      }
    }
    return `<div class="pts-row flex justify-between items-center py-2 border-b" data-name="${escapeHtml(p.name)}"><div style="flex:1;padding-right:12px">${escapeHtml(p.name)}</div><div style="display:flex;gap:8px;align-items:center;width:180px;justify-content:flex-end"><input id="pts-${key}" class="pixel-input" style="width:100px;padding:6px;text-align:right" type="number" placeholder="0" value="${existing}" /><button class="pixel-btn save-point-btn" data-pid="${key}" data-iso="${iso}">SALVAR</button></div></div>`;
  }).join('');

  const area = document.getElementById('points-table-area');
  if(area) area.innerHTML = `<h3>Pontos para: ${formatBR(iso)}</h3><div>${rows}</div>`;

  // Attach direct listeners to each save button (garante pid correto)
  setTimeout(() => {
    const saveButtons = area ? area.querySelectorAll('.save-point-btn') : [];
    saveButtons.forEach(btn => {
      if(btn.dataset._attached === '1') return;
      btn.dataset._attached = '1';
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const pid = btn.dataset.pid;
        const isoLocal = btn.dataset.iso;
        if(!pid) { console.error('PID undefined on direct handler'); return alert('ID do jogador inválido'); }
        const valEl = document.getElementById('pts-' + pid);
        const val = Number(valEl?.value || 0);
        const gidLocal = state.activeGameId;
        if(!gidLocal || !isoLocal) return alert('Nenhum trimestre/sábado selecionado');
        try {
          const writeKey = isoKeyWrite(isoLocal);
          await set(ref(db, `/games/${gidLocal}/saturdays/${writeKey}/${pid}`), Number(val));
          // cleanup old keys for same iso
          await cleanupOldIsoKeys(gidLocal, isoLocal, pid, writeKey);
          alert('Pontos salvos');
        } catch(err){
          console.error('Erro ao salvar ponto', err);
          alert('Erro ao salvar ponto: ' + (err.message || err));
        }
      });
    });
  }, 0);
}

/* ------------------------
   Annual ranking compute
   ------------------------ */

function computeAnnualRanking(year){
  const scoreMap = {};
  const gamesObj = state.games || {};
  for(const gid in gamesObj){
    const g = gamesObj[gid];
    const gy = new Date(g.startedAt).getFullYear();
    if(gy !== year) continue;
    if(g.saturdays){
      for(const isoKey in g.saturdays){
        const per = g.saturdays[isoKey] || {};
        for(const pid in per) scoreMap[pid] = (scoreMap[pid] || 0) + Number(per[pid] || 0);
      }
    } else if(g.playersPoints){
      for(const pid in g.playersPoints) scoreMap[pid] = (scoreMap[pid] || 0) + Number(g.playersPoints[pid] || 0);
    }
  }
  return Object.entries(scoreMap).map(([id, points]) => ({ id, points })).sort((a,b) => b.points - a.points);
}

/* ------------------------
   Outros utilitários
   ------------------------ */

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

function escapeHtml(str){
  if(!str && str !== 0) return '';
  return String(str).replace(/[&<>"']/g, function(m){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]; });
}

/* ------------------------------
   Final safety: schedule initial render
   ------------------------------ */
setTimeout(()=>{ renderAllAdmin(); }, 300);
