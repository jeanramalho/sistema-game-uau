// js/reports.js - Módulo de relatórios para exportação Excel/CSV
import { db } from './firebase.js';
import { ref, get, remove } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { formatBR } from './common.js';

/**
 * Inicializa biblioteca SheetJS para exportação Excel
 * @returns {Promise<boolean>} true se carregou com sucesso
 */
async function ensureSheetJS() {
  if (window.XLSX) return true;
  
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js';
    script.onload = () => {
      // Testa se a biblioteca foi carregada corretamente
      if (window.XLSX) {
        resolve(true);
      } else {
        reject(new Error('SheetJS não carregou corretamente'));
      }
    };
    script.onerror = () => reject(new Error('Erro ao carregar SheetJS'));
    document.head.appendChild(script);
  });
}

/**
 * Gera relatório de frequência dos jogadores por sábado
 * @param {Object} games - Objeto com todos os games
 * @param {Object} players - Objeto com todos os jogadores
 * @returns {Array} Array de objetos com dados do relatório
 */
function generateFrequencyReport(games, players) {
  const reportData = [];
  const playerNames = {};
  
  // Mapeia IDs dos jogadores para nomes
  for (const [playerId, player] of Object.entries(players)) {
    playerNames[playerId] = player.name || 'Jogador Desconhecido';
  }
  
  // Processa cada game e seus sábados
  for (const [gameId, game] of Object.entries(games)) {
    if (!game.saturdays) continue;
    
    const gameYear = new Date(game.startedAt).getFullYear();
    const gameTrimester = game.trimester || 1;
    
    // Para cada sábado no game
    for (const [isoKey, saturdayPoints] of Object.entries(game.saturdays)) {
      if (!saturdayPoints) continue;
      
      // Processa cada jogador neste sábado
      for (const [playerId, points] of Object.entries(saturdayPoints)) {
        reportData.push({
          ano: gameYear,
          trimestre: gameTrimester,
          data: formatBR(isoKey),
          jogador: playerNames[playerId] || 'Jogador Desconhecido',
          pontos: Number(points) || 0,
          presente: Number(points) > 0 ? 'SIM' : 'NÃO'
        });
      }
    }
  }
  
  return reportData.sort((a, b) => {
    // Ordena por ano, trimestre, data, poi jogador
    if (a.ano !== b.ano) return b.ano - a.ano;
    if (a.trimestre !== b.trimestre) return b.trimestre - a.trimestre;
    if (a.data !== b.data) return new Date(a.data.split('-').reverse().join('-')) > new Date(b.data.split('-').reverse().join('-')) ? -1 : 1;
    return a.jogador.localeCompare(b.jogador);
  });
}

/**
 * Gera relatório de pontuação por bimestre
 * @param {Object} games - Objeto com todos os games
 * @param {Object} players - Objeto com todos os jogadores
 * @returns {Array} Array de objetos com dados do relatório
 */
function generateBimestreReport(games, players) {
  const reportData = [];
  const playerNames = {};
  
  // Mapeia IDs dos jogadores para nomes
  for (const [playerId, player] of Object.entries(players)) {
    playerNames[playerId] = player.name || 'Jogador Desconhecido';
  }
  
  // Processa cada game
  for (const [gameId, game] of Object.entries(games)) {
    const gameYear = new Date(game.startedAt).getFullYear();
    const gameTrimester = game.trimester || 1;
    
    // Calcula totais por jogador neste game
    const gameTotals = {};
    
    if (game.saturdays) {
      for (const saturdayPoints of Object.values(game.saturdays)) {
        if (!saturdayPoints) continue;
        
        for (const [playerId, points] of Object.entries(saturdayPoints)) {
          gameTotals[playerId] = (gameTotals[playerId] || 0) + Number(points || 0);
        }
      }
    } else if (game.playersPoints) {
      for (const [playerId, points] of Object.entries(game.playersPoints)) {
        gameTotals[playerId] = Number(points || 0);
      }
    }
    
    // Gera linha para cada jogador neste bimestre
    for (const [playerId, totalPoints] of Object.entries(gameTotals)) {
      reportData.push({
        ano: gameYear,
        bimestre: gameTrimester,
        jogador: playerNames[playerId] || 'Jogador Desconhecido',
        pontos_totais: totalPoints,
        sábados_participados: game.saturdays ? Object.values(game.saturdays).filter(sat => sat && sat[playerId] && Number(sat[playerId]) > 0).length : 0,
        data_inicio: formatBR(game.startedAt),
        data_fim: game.endedAt ? formatBR(game.endedAt) : 'Em andamento'
      });
    }
  }
  
  return reportData.sort((a, b) => {
    // Ordena por ano, bimestre, pontos (decrescente)
    if (a.ano !== b.ano) return b.ano - a.ano;
    if (a.bimestre !== b.bimestre) return b.bimestre - a.bimestre;
    return b.pontos_totais - a.pontos_totais;
  });
}

/**
 * Exporta dados para arquivo Excel
 * @param {Array} data - Dados para exportação
 * @param {string} fileName - Nome do arquivo (sem extensão)
 * @param {string} sheetName - Nome da planilha
 */
function exportToExcel(data, fileName, sheetName = 'Dados') {
  if (!data || data.length === 0) {
    alert('Nenhum dado para exportar');
    return;
  }
  
  const worksheet = window.XLSX.utils.json_to_sheet(data);
  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  
  // Gera arquivo Excel
  const excelBuffer = window.XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  
  // Cria e faz download do arquivo
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${fileName}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

/**
 * Exporta dados para arquivo CSV
 * @param {Array} data - Dados para exportação
 * @param {string} fileName - Nome do arquivo (sem extensão)
 */
function exportToCSV(data, fileName) {
  if (!data || data.length === 0) {
    alert('Nenhum dado para exportar');
    return;
  }
  
  // Converte dados para CSV
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(unit => headers.map(header => {
      const value = unit[header];
      // Escapa vírgulas e aspas no valor
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(','))
  ].join('\n');
  
  // Adiciona BOM para UTF-8 (para acentos aparecerem corretamente no Excel)
  const bom = '\uFEFF';
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
  
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${fileName}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

/**
 * Limpa todos os dados do Firebase (função perigosa)
 * @returns {Promise<boolean>} true se sucesso
 */
async function clearAllData() {
  const confirmation = prompt(
    'ATENÇÃO: Esta ação irá APAGAR TODOS os dados do sistema!\n' +
    'Digite "CONFIRMAR" para continuar:\n\n' +
    '+ Todos os jogadores\n' +
    '+ Todos os games/trimestres\n' +
    '+ Todas as pontuações\n' +
    '+ Configurações\n\n' +
    'Esta ação NÃO PODE SER DESFEITA!'
  );
  
  if (confirmation !== 'CONFIRMAR') {
    alert('Operação cancelada');
    return false;
  }
  
  // Segunda confirmação
  const finalConfirm = prompt('Digite novamente "CONFIRMAR" para finalizar:');
  if (finalConfirm !== 'CONFIRMAR') {
    alert('Operação cancelada');
    return false;
  }
  
  try {
    alert('Iniciando limpeza... Não feche o navegador!');
    
    // Remove todos os dados principais
    await remove(ref(db, '/players'));
    await remove(ref(db, '/games'));
    await remove(ref(db, '/meta'));
    
    alert('✅ Todos os dados foram removidos com sucesso!\n\nO sistema foi resetado completamente.');
    return true;
    
  } catch (error) {
    console.error('Erro ao limpar dados:', error);
    alert('❌ Erro ao limpar dados: ' + (error.message || error));
    return false;
  }
}

// Exporta todas as funções para uso externo
export {
  ensureSheetJS,
  generateFrequencyReport,
  generateBimestreReport,
  exportToExcel,
  exportToCSV,
  clearAllData
};
