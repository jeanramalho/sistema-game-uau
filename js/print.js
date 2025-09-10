// js/print.js
// Gera e baixa imagem PNG do elemento fornecido, com o título "GAME UAU" acima.
// Usa html2canvas (deve estar carregado via CDN)

export async function saveElementAsImage(element){
  if(!element) return alert('Nada a salvar');
  if(typeof html2canvas === 'undefined') return alert('html2canvas não carregado');

  // wrapper com título (sem o quadrado preto que havia antes)
  const wrapper = document.createElement('div');
  wrapper.style.padding = '18px';
  wrapper.style.background = '#fff';
  wrapper.style.display = 'inline-block';
  wrapper.style.fontFamily = "Press Start 2P, monospace";

  // Title (GAME UAU) - plain text, no box
  const title = document.createElement('div');
  title.style.fontFamily = "Press Start 2P, monospace";
  title.style.fontSize = '18px';
  title.style.marginBottom = '12px';
  title.textContent = 'GAME UAU';
  wrapper.appendChild(title);

  // clone element to avoid removing live controls
  const clone = element.cloneNode(true);
  // remove interactive controls that may break rendering
  clone.querySelectorAll('button,a,input,select,textarea').forEach(n => n.remove());
  wrapper.appendChild(clone);

  document.body.appendChild(wrapper);

  try {
    const canvas = await html2canvas(wrapper, { scale: 2 });
    const data = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = data;
    a.download = 'ranking-gameuau.png';
    a.click();
  } catch(err){
    console.error('Erro html2canvas', err);
    alert('Erro ao gerar imagem: ' + (err.message || err));
  } finally {
    document.body.removeChild(wrapper);
  }
}
