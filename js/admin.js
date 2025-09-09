// js/admin.js
import { db, auth } from './firebase.js';
import { ref, onValue, set, push, update, remove, get, runTransaction } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { formatBR, generateSaturdays, uid } from './common.js';
import { saveElementAsImage } from './print.js';

// ... completo (veja conteúdo no documento) ...

// This file implements the full admin UI and behaviour that was previously embedded in the single-file version.
// It injects the admin dashboard HTML into the `#admin-root` element and wires all Firebase listeners and CRUD actions.#admin-root` element and wires all Firebase listeners and CRUD actions.#admin-root` element and wires all Firebase listeners and CRUD actions.

const adminRoot = document.getElementById('admin-root');

// Inject dashboard HTML (keeps layout identical to single-file version)
adminRoot.innerHTML = `
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

    <!-- left column: actions & ranking -->
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

    <!-- right column: stats -->
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

// DOM refs for admin actions
const cardRegister = document.getElementById('card-register-player');
const cardCreateEnd = document.getElementById('card-create-end-game');
const cardLaunchPoints = document.getElementById('card-launch-points');
const cardManagePlayers = document.getElementById('card-manage-players');
const cardAnnualRanking = document.getElementById('card-annual-ranking');
const quickRegisterBtn = document.getElementById('quickRegisterBtn');

// other refs
const nextSaturdayTag = document.getElementById('nextSaturdayTag');
const logoutBtn = document.getElementById('logoutBtn');

// initial state
let state = { players: {}, games: {}, activeGameId: null };

// Fallback local data (keeps the UI working when DB not reachable)
const fallbackKey = 'gameuau_admin_fallback_v1';
let fallback = JSON.parse(localStorage.getItem(fallbackKey) || 'null');
if(!fallback){
  const now = new Date().toISOString();
  fallback = { players: { p1:{id:'p1',name:'João Silva',phone:'(11)99999-0001',role:'player',createdAt:now} }, games: { g1:{id:'g1',year:new Date().getFullYear(),trimester:1,startedAt:now,endedAt:null,playersPoints:{p1:1250}} }, activeGameId:'g1' };
  localStorage.setItem(fallbackKey, JSON.stringify(fallback));
}

// Firebase listeners (realtime)
onValue(ref(db, '/players'), snap => { state.players = snap.val() || {}; renderAll(); }, err => { console.warn('players read err', err); state.players = fallback.players || {}; renderAll(); });

onValue(ref(db, '/games'), snap => { state.games = snap.val() || {}; renderAll(); }, err => { console.warn('games read err', err); state.games = fallback.games || {}; renderAll(); });

onValue(ref(db, '/meta/activeGameId'), snap => { state.activeGameId = snap.val(); renderAll(); }, err => { console.warn('meta read err', err); state.activeGameId = fallback.activeGameId || null; renderAll(); });

onAuthStateChanged(auth, user => { window.__currentUser = user || null; renderAll(); });

// attach card handlers
cardRegister.addEventListener('click', () => openModal('playerRegister'));
quickRegisterBtn.addEventListener('click', () => openModal('playerRegister'));
cardManagePlayers.addEventListener('click', () => openModal('managePlayers'));
cardCreateEnd.addEventListener('click', () => { if(state.activeGameId) openModal('endGame'); else openModal('createGame'); });
cardLaunchPoints.addEventListener('click', () => openModal('launchPoints'));
cardAnnualRanking.addEventListener('click', () => openModal('annualRanking'));

logoutBtn?.addEventListener('click', async () => {
  try { await signOut(auth); alert('Logout efetuado'); window.location = 'login.html'; } catch(err){ console.error('Logout err', err); alert('Erro ao sair: '+err.message); }
});

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
  // cleanup points
  const gSnap = await get(ref(db, '/games'));
  const gamesObj = gSnap.val() || {};
  for(const gid in gamesObj){ if(gamesObj[gid].playersPoints && gamesObj[gid].playersPoints[key]){ await remove(ref(db, `/games/${gid}/playersPoints/${key}`)); } }
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

/* ------------------ Render helpers ------------------ */
function renderAll(){
  const players = state.players || {};
  const games = state.games || {};
  const activeId = state.activeGameId || Object.keys(games)[0] || null;

  document.getElementById('playersCount').textContent = (Object.keys(players).length || 0) + ' JOGADORES';
  if(activeId){ document.getElementById('activeTag').textContent = 'TRIMESTRE ATIVO'; document.getElementById('createEndTitle').textContent = 'ENCERRAR GAME'; }
  else { document.getElementById('activeTag').textContent = 'TRIMESTRE INATIVO'; document.getElementById('createEndTitle').textContent = 'NOVO GAME UAU'; }

  // next saturday
  let nextText = '--';
  if(activeId && games[activeId]){ const sats = generateSaturdays(games[activeId].startedAt, 15); const next = sats.find(s => new Date(s) >= new Date()) || sats[0]; nextText = formatBR(next); }
  else nextText = formatBR(new Date());
  if(nextSaturdayTag) nextSaturdayTag.textContent = 'Próx. sábado: ' + nextText;

  renderRankingPreview(players, games, activeId);
  renderStats(players, games, activeId);
}

function renderRankingPreview(players, games, activeId){
  const container = document.getElementById('rankingPreview'); if(!container) return; container.innerHTML = '';
  const game = (activeId && games[activeId]) ? games[activeId] : (Object.values(games)[0] || null);
  if(!game){ container.innerHTML = '<div>Nenhum trimestre disponível</div>'; document.getElementById('totalPlayers').textContent = '0'; return; }
  const pts = game.playersPoints || {};
  const arr = Object.values(players).map(p => ({ id:p.id, name:p.name, points: pts[p.id] || 0 }));
  arr.sort((a,b)=> b.points - a.points);
  arr.forEach((r,i)=>{
    const div = document.createElement('div'); div.className = 'ranking-row pixel-box';
    div.innerHTML = `<div>${i+1}º • ${r.name}</div><div class="font-bold">${r.points.toLocaleString('pt-BR')}</div>`;
    container.appendChild(div);
  });
  document.getElementById('totalPlayers').textContent = Object.keys(players).length || 0;
}

function renderStats(players, games, activeId){
  const statMaxEl = document.getElementById('statMax');
  const statAvgEl = document.getElementById('statAvg');
  const statSábadosEl = document.getElementById('statSábados');
  const statNextEl = document.getElementById('statNextGame');
  const game = (activeId && games[activeId]) ? games[activeId] : (Object.values(games)[0] || null);
  if(!game){ statMaxEl.textContent='0'; statAvgEl.textContent='0'; statSábadosEl.textContent='0'; statNextEl.textContent='--'; return; }
  const pts = Object.values(game.playersPoints || {});
  const max = pts.length ? Math.max(...pts) : 0;
  const avg = pts.length ? Math.round(pts.reduce((a,b)=>a+b,0)/pts.length) : 0;
  statMaxEl.textContent = max.toLocaleString('pt-BR');
  statAvgEl.textContent = avg.toLocaleString('pt-BR');
  const sats = generateSaturdays(game.startedAt, 15);
  statSábadosEl.textContent = (Object.keys(game.playersPoints||{}).length || 0) + '/' + sats.length;
  statNextEl.textContent = 'SÁBADO ' + formatBR(sats.find(s=> new Date(s) >= new Date()) || sats[0]);
}

/* ------------------ Modal system ------------------ */
const modalRoot = document.getElementById('modal-root') || (function(){ const d = document.createElement('div'); d.id = 'modal-root'; document.body.appendChild(d); return d; })();
let currentModal = null;
function openModal(type, payload){ closeModal(); document.body.style.overflow = 'hidden'; const overlay = document.createElement('div'); overlay.className='modal-overlay'; overlay.id='modal-overlay'; overlay.addEventListener('click', closeModal); const center = document.createElement('div'); center.className='modal-center'; center.addEventListener('click', e=> e.stopPropagation()); overlay.appendChild(center); modalRoot.appendChild(overlay); currentModal = { type, payload, overlay, center };
  if(type === 'playerRegister') center.innerHTML = playerRegisterHtml();
  else if(type === 'managePlayers') center.innerHTML = managePlayersHtml();
  else if(type === 'editPlayer') center.innerHTML = editPlayerHtml(payload);
  else if(type === 'createGame') center.innerHTML = createGameHtml();
  else if(type === 'endGame') center.innerHTML = endGameHtml();
  else if(type === 'launchPoints') center.innerHTML = launchPointsHtml();
  else if(type === 'annualRanking') center.innerHTML = annualRankingHtml();
  else if(type === 'login') center.innerHTML = loginHtml();
  attachModalHandlers(type, payload);
}
function closeModal(){ const o = document.getElementById('modal-overlay'); if(o) o.remove(); currentModal = null; document.body.style.overflow = ''; }

/* Modal HTML builders */
function playerRegisterHtml(){ return `
  <h2>CADASTRAR JOGADOR / ADMIN</h2>
  <form id="form-player" class="mt-4">
    <label>Nome</label>
    <input id="player-name" class="pixel-input" placeholder="Nome completo" required />
    <label>Telefone</label>
    <input id="player-phone" class="pixel-input" placeholder="(11) 9xxxx-xxxx" />
    <label>Perfil</label>
    <select id="player-role" class="pixel-input"><option value="player">Jogador</option><option value="admin">Administrador</option></select>

    <div id="admin-credentials" style="display:none">
      <label>Email</label>
      <input id="player-email" class="pixel-input" placeholder="admin@exemplo.com" />
      <label>Senha</label>
      <div style="display:flex;gap:8px;"><input id="player-pass" type="password" class="pixel-input" style="flex:1"/><button id="toggle-pass" type="button" class="pixel-btn">Mostrar</button></div>
      <label>Confirmar senha</label>
      <input id="player-pass2" type="password" class="pixel-input" />
    </div>

    <div class="flex gap-3"><button class="pixel-btn" type="submit">CADASTRAR</button><button type="button" id="cancel-player" class="pixel-btn">CANCELAR</button></div>
  </form>
`; }

function editPlayerHtml(playerKey){ const p = state.players[playerKey] || {}; return `
  <h2>EDITAR JOGADOR</h2>
  <form id="form-edit-player" class="mt-4">
    <label>Nome</label><input id="edit-name" class="pixel-input" value="${p.name || ''}" />
    <label>Telefone</label><input id="edit-phone" class="pixel-input" value="${p.phone || ''}" />
    <label>Perfil</label>
    <select id="edit-role" class="pixel-input"><option value="player" ${p.role==='player'?'selected':''}>Jogador</option><option value="admin" ${p.role==='admin'?'selected':''}>Administrador</option></select>
    <div id="edit-admin-credentials" style="display:none">
      <label>Email (apenas se criando credenciais)</label><input id="edit-email" class="pixel-input" value="${p.email || ''}" />
      <label>Senha (nova)</label><input id="edit-pass" type="password" class="pixel-input" />
    </div>
    <div class="flex gap-3 mt-2"><button class="pixel-btn" type="submit">SALVAR</button><button type="button" id="cancel-edit" class="pixel-btn">CANCELAR</button></div>
    <div class="mt-2"><button id="del-player" class="pixel-btn" type="button">DELETAR</button></div>
  </form>
`; }

function managePlayersHtml(){
  const players = state.players || {};
  const rows = Object.entries(players).map(([k,p]) => {
    return `<div class="flex justify-between items-center py-2 border-b"><div><div>${p.name}</div><div style="font-size:12px">${p.role} ${p.phone? ' • ' + p.phone : ''}</div></div><div class="flex gap-2"><button class="pixel-btn btn-edit" data-key="${k}">EDIT</button><button class="pixel-btn btn-del" data-key="${k}">DEL</button></div></div>`;
  }).join('') || '<div>Nenhum jogador</div>';
  return `<h2>GERENCIAR JOGADORES</h2><div class="mt-4">${rows}</div><div class="mt-4"><button id="close-manage" class="pixel-btn">FECHAR</button></div>`;
}

function createGameHtml(){ const year = new Date().getFullYear(); return `<h2>NOVO GAME UAU</h2><form id="form-create-game" class="mt-4"><label>Trimestre</label><select id="create-trim" class="pixel-input"><option>1</option><option>2</option><option>3</option><option>4</option></select><label>Ano</label><input id="create-year" class="pixel-input" type="number" value="${year}" /><div class="flex gap-3 mt-2"><button class="pixel-btn" type="submit">CRIAR</button><button id="cancel-create" type="button" class="pixel-btn">CANCELAR</button></div></form>`; }
function endGameHtml(){ return `<h2>ENCERRAR TRIMESTRE</h2><p>Deseja encerrar o trimestre em andamento?</p><div class="flex gap-3 mt-4"><button id="confirm-end" class="pixel-btn">SIM, ENCERRAR</button><button id="cancel-end" class="pixel-btn">CANCELAR</button></div>`; }

function launchPointsHtml(){
  const game = state.activeGameId && state.games && state.games[state.activeGameId] ? state.games[state.activeGameId] : (Object.values(state.games||{})[0] || null);
  if(!game) return `<h2>LANÇAR PONTOS</h2><div class="mt-4">Nenhum trimestre ativo</div><div class="mt-4"><button id="close-launch" class="pixel-btn">FECHAR</button></div>`;
  const sats = generateSaturdays(game.startedAt, 15);
  const satsHtml = sats.map(s=> `<button class="pixel-btn sat-btn" data-iso="${s}" style="margin:4px">${formatBR(s)}</button>`).join('');
  return `<h2>LANÇAR PONTOS</h2><div class="mt-2">Escolha o sábado:</div><div class="mt-3">${satsHtml}</div><div class="mt-4">Pesquisar jogador:</div><input id="points-search" class="pixel-input" placeholder="Digite para filtrar" /><div id="points-table-area" class="mt-4"></div><div class="mt-4"><button id="close-launch" class="pixel-btn">FECHAR</button></div>`;
}

function annualRankingHtml(){
  const arr = computeAnnualRanking(new Date().getFullYear());
  const players = state.players || {};
  const rows = arr.map((r,i)=> `<div style="display:flex;justify-content:space-between;padding:6px;border-bottom:1px solid #000">${i+1}. ${players[r.id]?players[r.id].name:'Desconhecido'} <strong>${r.points.toLocaleString('pt-BR')}</strong></div>`).join('') || '<div>Nenhum registro</div>';
  return `<h2>RANKING ANUAL - ${new Date().getFullYear()}</h2><div class="mt-4">${rows}</div><div class="mt-4"><button id="close-annual" class="pixel-btn">FECHAR</button></div>`;
}

function loginHtml(){ return `<h2>LOGIN ADMIN</h2><form id="form-login" class="mt-4"><label>Email</label><input id="login-email" class="pixel-input" type="email" /><label>Senha</label><input id="login-pass" class="pixel-input" type="password" /><div class="flex gap-3 mt-2"><button class="pixel-btn" type="submit">ENTRAR</button><button id="cancel-login" type="button" class="pixel-btn">CANCELAR</button></div></form>`; }

/* ------------------ Modal handlers and delegation ------------------ */
function attachModalHandlers(type, payload){
  if(type === 'playerRegister'){
    const roleSel = document.getElementById('player-role');
    roleSel.addEventListener('change', e => document.getElementById('admin-credentials').style.display = e.target.value === 'admin' ? 'block' : 'none');
    document.getElementById('toggle-pass')?.addEventListener('click', ()=>{ const p = document.getElementById('player-pass'); p.type = p.type === 'password' ? 'text' : 'password'; document.getElementById('toggle-pass').textContent = p.type === 'password' ? 'Mostrar' : 'Esconder'; });
    document.getElementById('form-player').addEventListener('submit', async e => {
      e.preventDefault();
      const name = document.getElementById('player-name').value.trim();
      const phone = document.getElementById('player-phone').value.trim();
      const role = document.getElementById('player-role').value;
      if(!name) return alert('Digite o nome');
      try{
        if(role === 'admin'){
          const email = document.getElementById('player-email').value.trim();
          const pass = document.getElementById('player-pass').value; const pass2 = document.getElementById('player-pass2').value;
          if(!email || !pass) return alert('Email e senha obrigatórios para admin'); if(pass !== pass2) return alert('Senhas não conferem');
          await createPlayer({ name, phone, role: 'admin', email, password: pass });
          alert('Administrador criado'); closeModal();
        } else {
          await createPlayer({ name, phone, role: 'player' }); alert('Jogador criado'); closeModal();
        }
      } catch(err){ console.error(err); alert('Erro: '+ err.message); }
    });
    document.getElementById('cancel-player').addEventListener('click', closeModal);
  }

  if(type === 'managePlayers'){
    document.querySelectorAll('.btn-edit').forEach(btn => btn.addEventListener('click', e => { const k = e.currentTarget.dataset.key; openModal('editPlayer', k); }));
    document.querySelectorAll('.btn-del').forEach(btn => btn.addEventListener('click', async e => { const k = e.currentTarget.dataset.key; if(!confirm('Excluir jogador?')) return; try{ await deletePlayer(k); alert('Excluído'); closeModal(); } catch(err){ console.error(err); alert('Erro: '+err.message); } }));
    document.getElementById('close-manage').addEventListener('click', closeModal);
  }

  if(type === 'editPlayer'){
    const key = payload;
    const roleSelect = document.getElementById('edit-role');
    roleSelect.addEventListener('change', () => document.getElementById('edit-admin-credentials').style.display = roleSelect.value === 'admin' ? 'block' : 'none');
    document.getElementById('cancel-edit').addEventListener('click', closeModal);
    document.getElementById('del-player').addEventListener('click', async ()=>{ if(!confirm('Excluir jogador?')) return; try{ await deletePlayer(key); alert('Excluído'); closeModal(); } catch(err){ console.error(err); alert('Erro: '+err.message); } });
    document.getElementById('form-edit-player').addEventListener('submit', async e => {
      e.preventDefault(); const name = document.getElementById('edit-name').value.trim(); const phone = document.getElementById('edit-phone').value.trim(); const role = document.getElementById('edit-role').value; if(!name) return alert('Nome obrigatório');
      const player = state.players[key];
      try{
        if(role === 'admin' && (!player || player.role !== 'admin')){
          const email = document.getElementById('edit-email').value.trim(); const pass = document.getElementById('edit-pass').value;
          if(!email || !pass) return alert('Email e senha necessários para transformar em admin');
          const cred = await createUserWithEmailAndPassword(auth, email, pass); const uid = cred.user.uid;
          const newObj = { id: uid, name, phone: phone||null, role: 'admin', createdAt: new Date().toISOString() };
          await set(ref(db, '/players/' + uid), newObj); await remove(ref(db, '/players/' + key)); alert('Transformado em admin'); closeModal(); return;
        } else {
          await updatePlayer(key, { name, phone, role }); alert('Atualizado'); closeModal();
        }
      } catch(err){ console.error(err); alert('Erro: '+err.message); }
    });
  }

  if(type === 'createGame'){
    document.getElementById('form-create-game').addEventListener('submit', async e => { e.preventDefault(); const trimester = Number(document.getElementById('create-trim').value); const year = Number(document.getElementById('create-year').value); try{ await createGame({ year, trimester }); alert('Trimestre criado'); closeModal(); } catch(err){ console.error(err); alert('Erro: '+err.message); } });
    document.getElementById('cancel-create').addEventListener('click', closeModal);
  }

  if(type === 'endGame'){
    document.getElementById('confirm-end').addEventListener('click', async ()=>{ try{ await endGame(state.activeGameId); alert('Trimestre encerrado'); closeModal(); } catch(err){ console.error(err); alert('Erro: '+err.message); } });
    document.getElementById('cancel-end').addEventListener('click', closeModal);
  }

  if(type === 'launchPoints'){
    document.querySelectorAll('.sat-btn').forEach(btn => btn.addEventListener('click', e => { const iso = e.currentTarget.dataset.iso; renderPointsTableForSaturday(iso); }));
    const search = document.getElementById('points-search'); if(search) search.addEventListener('input', e => { const q = e.target.value.toLowerCase(); document.querySelectorAll('.pts-row').forEach(row => row.style.display = row.dataset.name.toLowerCase().includes(q) ? '' : 'none'); });
    document.getElementById('points-table-area')?.addEventListener('click', async (e) => { if(e.target && e.target.matches('.save-point-btn')){ const pid = e.target.dataset.pid; const val = Number(document.getElementById('pts-' + pid).value) || 0; const gid = state.activeGameId; if(!gid) return alert('Nenhum trimestre ativo'); try{ await addPoints(gid, pid, val); alert('Pontos adicionados'); renderAll(); } catch(err){ console.error(err); alert('Erro: '+err.message); } } });
    document.getElementById('close-launch').addEventListener('click', closeModal);
  }

  if(type === 'annualRanking') document.getElementById('close-annual')?.addEventListener('click', closeModal);

  if(type === 'login'){
    document.getElementById('form-login').addEventListener('submit', async e => { e.preventDefault(); const email = document.getElementById('login-email').value.trim(); const pass = document.getElementById('login-pass').value; try{ await signInWithEmailAndPassword(auth, email, pass); alert('Login OK'); closeModal(); window.location = 'admin.html'; } catch(err){ console.error(err); alert('Erro login: '+err.message); } });
    document.getElementById('cancel-login')?.addEventListener('click', closeModal);
  }
}

/* render points table */
function renderPointsTableForSaturday(iso){
  const players = state.players || {};
  const list = Object.values(players).sort((a,b)=> a.name.localeCompare(b.name));
  const rows = list.map(p => `<div class="pts-row flex justify-between items-center py-2 border-b" data-name="${p.name}"><div>${p.name}</div><div style="display:flex;gap:8px;align-items:center"><input id="pts-${p.id}" class="pixel-input" style="width:120px;padding:6px" type="number" placeholder="0" /><button class="pixel-btn save-point-btn" data-pid="${p.id}" data-iso="${iso}">SALVAR</button></div></div>`).join('');
  document.getElementById('points-table-area').innerHTML = `<h3>Pontos para: ${formatBR(iso)}</h3><div>${rows}</div>`;
}

function computeAnnualRanking(year){ const map = {}; const gamesObj = state.games || {}; for(const gid in gamesObj){ const g = gamesObj[gid]; const gy = new Date(g.startedAt).getFullYear(); if(gy !== year) continue; const ppts = g.playersPoints || {}; for(const pid in ppts) map[pid] = (map[pid] || 0) + Number(ppts[pid] || 0); } return Object.entries(map).map(([id, points])=> ({ id, points })).sort((a,b)=> b.points - a.points); }

// initial render tick
setTimeout(()=> renderAll(), 600);