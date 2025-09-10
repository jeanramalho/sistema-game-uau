export async function saveElementAsImage(element){
  if(!element) return alert('Elemento para salvar não encontrado.');
  await ensureHtml2Canvas();

  // clone element so we can adjust styles only for the image
  const clone = element.cloneNode(true);

  // create wrapper with title
  const wrapper = document.createElement('div');
  wrapper.style.background = getComputedStyle(document.body).backgroundColor || '#ffffff';
  wrapper.style.padding = '24px';
  wrapper.style.boxSizing = 'border-box';
  wrapper.style.fontFamily = getComputedStyle(document.body).fontFamily || 'sans-serif';
  wrapper.style.color = getComputedStyle(document.body).color || '#000';

  const title = document.createElement('div');
  title.textContent = 'GAME UAU';
  title.style.fontSize = '36px';
  title.style.fontWeight = '800';
  title.style.textAlign = 'center';
  title.style.marginBottom = '14px';
  title.style.lineHeight = '1';
  wrapper.appendChild(title);

  // tweak the clone for image:
  // - find elements that contain points (we expect numeric text in elements with class 'font-bold' or strong inside)
  // - wrap numeric text into boxed span with padding
  // We'll handle several patterns for robustness.
  // 1) .font-bold elements
  clone.querySelectorAll('.font-bold').forEach(el => {
    // extract numeric text
    const text = el.textContent.trim();
    // create box
    const box = document.createElement('span');
    box.textContent = text;
    box.style.border = '2px solid #000';
    box.style.padding = '6px 10px';
    box.style.marginLeft = '10px';
    box.style.display = 'inline-block';
    box.style.background = '#fff';
    // clear el and append box
    el.innerHTML = '';
    el.appendChild(box);
  });

  // 2) fallback: strong elements that look like points
  clone.querySelectorAll('strong').forEach(el => {
    const maybeNum = el.textContent.trim().replace(/\./g,'').replace(/,/g,'');
    if(/^\d+$/.test(maybeNum) || /^\d+$/.test(el.textContent.trim())) {
      const box = document.createElement('span');
      box.textContent = el.textContent.trim();
      box.style.border = '2px solid #000';
      box.style.padding = '6px 10px';
      box.style.marginLeft = '10px';
      box.style.display = 'inline-block';
      box.style.background = '#fff';
      el.innerHTML = '';
      el.appendChild(box);
    }
  });

  // Append clone to wrapper and attach offscreen for capture
  wrapper.appendChild(clone);
  wrapper.style.position = 'fixed';
  wrapper.style.left = '-9999px';
  wrapper.style.top = '0';
  document.body.appendChild(wrapper);

  try {
    const canvas = await html2canvas(wrapper, { scale: 2, useCORS: true, allowTaint: true });
    const dataUrl = canvas.toDataURL('image/png');
    // download
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `ranking-gameuau-${(new Date()).toISOString().slice(0,10)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch(err){
    console.error('Erro ao gerar imagem', err);
    alert('Erro ao gerar imagem: ' + (err.message || err));
  } finally {
    wrapper.remove();
  }
}

function ensureHtml2Canvas(){
  return new Promise((resolve, reject) => {
    if(window.html2canvas) return resolve();
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s.onload = () => { resolve(); };
    s.onerror = (e) => { console.error('falha carregar html2canvas', e); reject(e); };
    document.head.appendChild(s);
  });
}
