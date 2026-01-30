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
 * Gera relatório de frequência dos jogadores por sábado (novo formato simplificado)
 * @param {Object} games - Objeto com todos os games
 * @param {Object} players - Objeto com todos os jogadores
 * @returns {Array} Array de objetos com dados do relatório
 */
function generateFrequencyReport(games, players) {
  const playerTotals = {};
  const playerNames = {};

  // Mapeia IDs dos jogadores para nomes
  for (const [playerId, player] of Object.entries(players)) {
    playerNames[playerId] = player.name || 'Jogador Desconhecido';
    playerTotals[playerId] = { name: playerNames[playerId], presentSaturdays: 0 };
  }

  // Processa cada game e seus sábados para contar presenças
  for (const [gameId, game] of Object.entries(games)) {
    if (!game.saturdays) continue;

    // Para cada sábado no game
    for (const [isoKey, saturdayPoints] of Object.entries(game.saturdays)) {
      if (!saturdayPoints) continue;

      // Para cada jogador, verifica se teve pontos > 0 (presença)
      for (const [playerId, points] of Object.entries(saturdayPoints)) {
        if (!playerTotals[playerId]) {
          // Se o jogador não existe mais na lista atual, cria entrada temporária
          playerTotals[playerId] = {
            name: playerNames[playerId] || 'Jogador Desconhecido',
            presentSaturdays: 0
          };
        }

        // Se teve pontos > 0, conta como presente
        const pts = (typeof points === 'object' && points !== null) ? (points.points || 0) : Number(points || 0);
        if (pts > 0) {
          playerTotals[playerId].presentSaturdays++;
        }
      }
    }
  }

  // Converte para array e ordena por quantidade de sábados presentes (decrescente)
  const reportData = Object.entries(playerTotals)
    .filter(([playerId, data]) => data.name !== 'Jogador Desconhecido') // Remove jogadores desconhecidos
    .map(([playerId, data]) => ({
      jogador: data.name,
      sabados_presentes: data.presentSaturdays
    }))
    .sort((a, b) => b.sabados_presentes - a.sabados_presentes);

  return reportData;
}

/**
 * Gera relatório de pontuação por bimestre filtrado
 * @param {Object} games - Objeto com todos os games
 * @param {Object} players - Objeto com todos os jogadores
 * @param {number} selectedYear - Ano específico para filtrar (opcional)
 * @param {number} selectedBimestre - Bimestre específico para filtrar (opcional)
 * @returns {Array} Array de objetos com dados do relatório
 */
function generateBimestreReport(games, players, selectedYear = null, selectedBimestre = null) {
  const reportData = [];
  const playerNames = {};

  // Mapeia IDs dos jogadores para nomes (apenas jogadores válidos)
  for (const [playerId, player] of Object.entries(players)) {
    if (player && player.name) {
      playerNames[playerId] = player.name;
    }
  }

  // Processa cada game aplicando filtros
  for (const [gameId, game] of Object.entries(games)) {
    const gameYear = new Date(game.startedAt).getFullYear();
    const gameTrimester = game.trimester || 1;

    // Aplica filtros se especificados
    if (selectedYear !== null && gameYear !== selectedYear) continue;
    if (selectedBimestre !== null && gameTrimester !== selectedBimestre) continue;

    // Calcula totais por jogador neste game
    const gameTotals = {};

    if (game.saturdays) {
      for (const saturdayPoints of Object.values(game.saturdays)) {
        if (!saturdayPoints) continue;

        for (const [playerId, points] of Object.entries(saturdayPoints)) {
          if (playerNames[playerId]) { // Só inclui jogadores válidos
            const pts = (typeof points === 'object' && points !== null) ? (points.points || 0) : Number(points || 0);
            gameTotals[playerId] = (gameTotals[playerId] || 0) + pts;
          }
        }
      }
    } else if (game.playersPoints) {
      for (const [playerId, points] of Object.entries(game.playersPoints)) {
        if (playerNames[playerId]) { // Só inclui jogadores válidos
          gameTotals[playerId] = Number(points || 0);
        }
      }
    }

    // Gera linha para cada jogador neste bimestre
    for (const [playerId, totalPoints] of Object.entries(gameTotals)) {
      if (totalPoints > 0 || game.saturdays) { // Só inclui jogadores com participação
        reportData.push({
          jogador: playerNames[playerId],
          pontos_totais: totalPoints,
          sabados_participados: game.saturdays ? Object.values(game.saturdays).filter(sat => {
            if (!sat || !sat[playerId]) return false;
            const val = sat[playerId];
            const pts = (typeof val === 'object' && val !== null) ? (val.points || 0) : Number(val || 0);
            return pts > 0;
          }).length : 0,
          data_inicio: formatBR(game.startedAt),
          data_fim: game.endedAt ? formatBR(game.endedAt) : 'Em andamento',
          bimestre: gameTrimester,
          ano: gameYear
        });
      }
    }
  }

  // Ordena por pontos totais (decrescente)
  return reportData.sort((a, b) => b.pontos_totais - a.pontos_totais);
}

/**
 * Função auxiliar para obter anos e bimestres disponíveis
 * @param {Object} games - Objeto com todos os games
 * @returns {Object} Objeto com anos e bimestres únicos
 */
function getAvailableYearsAndTrimester(games) {
  const years = new Set();
  const trimester = new Set();

  for (const game of Object.values(games)) {
    const gameYear = new Date(game.startedAt).getFullYear();
    const gameTrimester = game.trimester || 1;

    years.add(gameYear);
    trimester.add(gameTrimester);
  }

  return {
    years: Array.from(years).sort((a, b) => b - a), // Ordena decrescente (mais recente primeiro)
    trimester: Array.from(trimester).sort((a, b) => a - b) // Ordena crescente
  };
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

/**
 * Gera relatório de presença trimestral (Matriz de Participantes x Sábados)
 * @param {Object} games - Objeto com todos os games
 * @param {Object} players - Objeto com todos os jogadores
 * @param {number} selectedYear - Ano para filtrar
 * @param {number} selectedTrimester - Trimestre para filtrar
 * @returns {Array} Array de objetos formatado para Excel/CSV
 */
function generateQuarterlyAttendanceReport(games, players, selectedYear, selectedTrimester) {
  // 1. Encontrar o game correspondente
  const game = Object.values(games).find(g => {
    const y = new Date(g.startedAt).getFullYear();
    const t = g.trimester || 1;
    return y === selectedYear && t === selectedTrimester;
  });

  if (!game || !game.saturdays) return [];

  // 2. Coletar todos os sábados e ordenar cronologicamente
  const dates = Object.keys(game.saturdays).sort((a, b) => Number(a) - Number(b));

  // 3. Preparar dados
  const reportData = [];
  const sortedPlayers = Object.values(players).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  for (const p of sortedPlayers) {
    const row = { 'Participante': p.name };

    for (const d of dates) {
      const dateLabel = formatBR(new Date(Number(d)).toISOString());
      const val = game.saturdays[d][p.id];

      let marker = '';
      if (val !== undefined) {
        const pts = (typeof val === 'object' && val !== null) ? (val.points || 0) : Number(val || 0);
        const s7 = (typeof val === 'object' && val !== null) ? !!val.studied7 : false;

        if (pts > 0) {
          marker = s7 ? 'P7' : 'P';
        }
      }
      row[dateLabel] = marker;
    }
    reportData.push(row);
  }

  return reportData;
}

/**
 * Gera relatório de estatísticas "Estudou 7" (Porcentagem por sábado)
 * @param {Object} games - Objeto com todos os games
 * @param {Object} players - Objeto com todos os jogadores
 * @param {number} selectedYear - Ano para filtrar (opcional)
 * @param {number} selectedTrimester - Trimestre para filtrar (opcional)
 * @returns {Array} Array de objetos formatado para Excel/CSV
 */
function generateStudies7PercentageReport(games, players, selectedYear = null, selectedTrimester = null) {
  const reportData = [];

  // Processa cada game
  for (const game of Object.values(games)) {
    const y = new Date(game.startedAt).getFullYear();
    const t = game.trimester || 1;

    if (selectedYear !== null && y !== selectedYear) continue;
    if (selectedTrimester !== null && t !== selectedTrimester) continue;
    if (!game.saturdays) continue;

    const dates = Object.keys(game.saturdays).sort((a, b) => Number(a) - Number(b));

    for (const d of dates) {
      const dateLabel = formatBR(new Date(Number(d)).toISOString());
      const saturdayData = game.saturdays[d];

      let totalPresent = 0, totalS7 = 0;
      let membersPresent = 0, membersS7 = 0;
      let visitorsPresent = 0, visitorsS7 = 0;

      for (const [pid, val] of Object.entries(saturdayData)) {
        const player = players[pid];
        if (!player) continue;

        const pts = (typeof val === 'object' && val !== null) ? (val.points || 0) : Number(val || 0);
        const s7 = (typeof val === 'object' && val !== null) ? !!val.studied7 : false;

        if (pts > 0) {
          totalPresent++;
          if (s7) totalS7++;

          if (player.isMember) {
            membersPresent++;
            if (s7) membersS7++;
          } else {
            visitorsPresent++;
            if (s7) visitorsS7++;
          }
        }
      }

      if (totalPresent > 0) {
        reportData.push({
          'Data': dateLabel,
          'Trimestre': t,
          'Ano': y,
          'Total Presentes': totalPresent,
          'Total Estudou 7': totalS7,
          '% Total': ((totalS7 / totalPresent) * 100).toFixed(1) + '%',
          'Membros Presentes': membersPresent,
          'Membros Estudou 7': membersS7,
          '% Membros': membersPresent > 0 ? ((membersS7 / membersPresent) * 100).toFixed(1) + '%' : '0%',
          'Visitantes Presentes': visitorsPresent,
          'Visitantes Estudou 7': visitorsS7,
          '% Visitantes': visitorsPresent > 0 ? ((visitorsS7 / visitorsPresent) * 100).toFixed(1) + '%' : '0%'
        });
      }
    }
  }

  return reportData;
}

// Exporta todas as funções para uso externo
export {
  ensureSheetJS,
  generateFrequencyReport,
  generateBimestreReport,
  generateQuarterlyAttendanceReport,
  generateStudies7PercentageReport,
  getAvailableYearsAndTrimester,
  exportToExcel,
  exportToCSV,
  clearAllData
};
