
// js/print.js
export async function saveElementAsImage(element){ if(!element) return alert('Nada a salvar'); 
if(typeof html2canvas === 'undefined') return alert('html2canvas não carregado'); 
const wrapper = document.createElement('div'); 
wrapper.style.padding='20px'; wrapper.style.background='#fff'; 
wrapper.style.display='inline-block'; const logo = document.createElement('div'); 
logo.style.display='flex'; logo.style.alignItems='center'; 
logo.style.gap='12px'; logo.style.marginBottom='12px'; 
const box=document.createElement('div'); 
box.style.width='60px'; 
box.style.height='60px'; 
box.style.background='#000'; 
const title=document.createElement('div'); 
title.style.fontFamily = "Press Start 2P, monospace"; 
title.style.fontSize='18px'; title.textContent='GAME UAU'; 
logo.appendChild(box); 
logo.appendChild(title); 
wrapper.appendChild(logo); 
const clone = element.cloneNode(true); 
clone.querySelectorAll('button,a,input').forEach(n=>n.remove()); 
wrapper.appendChild(clone); 
document.body.appendChild(wrapper); 
try{ const canvas = await html2canvas(wrapper, { scale:2 }); 
const data = canvas.toDataURL('image/png'); 
const a = document.createElement('a'); a.href = data; a.download = 'ranking-gameuau.png'; a.click(); } catch(err){ console.error(err); alert('Erro ao gerar imagem: ' + err.message); } finally { document.body.removeChild(wrapper); } }