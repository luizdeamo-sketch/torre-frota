/* Acompanhante da Torre de Controle (mesma lógica do CRM Aliança e do Stayline): aviso de versão nova · registro de uso · balão 💬.
   Gatilhos do balão: travou (3 cliques em 1 s), recusa (aviso de erro), desfez (voltou o status logo depois), voltou (A→B→A em 30 s).
   O de "primeira vez numa tela" fica desligado: na LCA foi ignorado em quase todas as vezes.
   Anota telas abertas e botões clicados. Nunca anota o que a pessoa digita nos campos. */
(function(){
'use strict';
const FR = window.FR; if(!FR) return;
const sb = FR.sb;
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const email = ()=> String(FR.email||'').toLowerCase();
const SEM_BALAO = ['luiz.amo@capacitycase.com.br','luizdeamo@gmail.com'];   // quem testa não recebe balões automáticos (o botão 💬 continua)
const PERGUNTA = {
  travou:'Parece que algo não respondeu. O que você estava tentando fazer?',
  recusa:'O sistema recusou o que você fez. Quer contar o que esperava que acontecesse?',
  desfez:'Você mudou e voltou o status. Ficou alguma dúvida sobre qual usar?',
  voltou:'Você foi e voltou entre telas. Não achou o que procurava?' };
const TIPOS = { melhoria:'Ideia de melhoria', problema:'Algo não funciona', duvida:'Dúvida' };

/* ---------- 1 · aviso de versão nova (nunca recarrega sozinho) ---------- */
const meta = document.querySelector('meta[name="app-build"]'), BUILD = meta ? String(meta.content||'') : '';
const BUILD_OK = s => /^\d{10,}$/.test(String(s||''));
let novaVersao = false;
async function verificarVersao(){
  if(!BUILD_OK(BUILD) || novaVersao) return;
  try{ const r = await fetch(location.pathname + '?v=' + Date.now(), { cache:'no-store' }); const tx = await r.text(); const m = tx.match(/<meta name="app-build" content="([^"]*)"/);
    if(m && BUILD_OK(m[1]) && m[1] !== BUILD) faixaVersao(); }catch(e){}
}
function faixaVersao(){
  if(document.getElementById('ac-versao')) return; novaVersao = true;
  const f = document.createElement('div'); f.id = 'ac-versao'; f.setAttribute('role','status');
  f.innerHTML = '<span>Saiu uma versão nova, com melhorias. Salve o que estiver fazendo e clique em Atualizar.</span><button type="button" id="ac-v-btn">Atualizar</button>';
  document.body.appendChild(f);
  document.getElementById('ac-v-btn').onclick = ()=> location.reload();
}
setInterval(verificarVersao, 120000);
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) verificarVersao(); });

/* ---------- 2 · registro de uso ---------- */
const SESSAO = (self.crypto && crypto.randomUUID) ? crypto.randomUUID().slice(0,12) : Math.random().toString(36).slice(2,14);
const FILA = []; const ultimos = [];
const rota = ()=> document.getElementById('app').hidden ? '/login' : '/' + FR.view();
const nomeTela = ()=> document.getElementById('app').hidden ? 'Login' : FR.titulo();
function uso(tipo, alvo, detalhe){
  if(!email()) return;
  const ev = { sessao:SESSAO, tipo, rota:rota(), alvo:String(alvo||'').replace(/[\w.+-]+@[\w-]+\.[\w.]+/g,'…@…').slice(0,200) || null, detalhe:detalhe||null, em:new Date().toISOString() };
  FILA.push(ev); if(FILA.length > 500) FILA.shift();
  ultimos.push({ em:ev.em, tipo, rota:ev.rota, alvo:ev.alvo }); if(ultimos.length > 20) ultimos.shift();
}
let enviando = false;
async function flush(){
  if(enviando || !FILA.length || !email()) return; enviando = true; const lote = FILA.splice(0, FILA.length);
  try{ const { error } = await sb.from('frt_uso_eventos').insert(lote); if(error) throw error; }catch(e){ FILA.unshift(...lote); FILA.splice(0, Math.max(0, FILA.length-500)); }
  enviando = false;
}
setInterval(flush, 15000);
let rotaCur = null, tsTela = Date.now(); const trilha = [];
function checarTela(){
  if(!email()) return; const r = rota(); if(r===rotaCur) return; const ant = rotaCur;
  uso('tela', nomeTela(), { anterior:ant, ms_na_anterior: ant ? Date.now()-tsTela : null }); rotaCur = r; tsTela = Date.now();
  trilha.push({ r, t:Date.now() }); if(trilha.length > 3) trilha.shift();
  if(trilha.length===3 && trilha[0].r===trilha[2].r && trilha[1].r!==trilha[0].r && trilha[2].t-trilha[0].t < 30000 && r!=='/login'){ uso('voltou', nomeTela()); duvida('voltou'); }
}
setInterval(checarTela, 700);
document.addEventListener('visibilitychange', ()=>{ if(document.hidden){ uso('saida', nomeTela(), { ms_na_tela: Date.now()-tsTela }); flush(); } else tsTela = Date.now(); });
function rotulo(el){
  if(el.closest('input:not([type=button]):not([type=submit]):not([type=checkbox]),textarea,select')) return null;
  const b = el.closest('button,a,[role=button],summary,label,tr,td[data-c]'); if(!b) return null;
  if(b.matches('tr,td')) return b.matches('td[data-c]') ? 'quadrinho do quadro' : 'linha';      // não grava o conteúdo (placas, nomes)
  if(b.dataset.stPlaca) return 'status do dia';
  if(b.dataset.ficha) return 'ficha do conjunto';
  return (b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent || '').replace(/\s+/g,' ').trim().replace(/[A-Z]{3}\d[A-Z0-9]\d{2}/g,'placa').slice(0,60) || b.tagName.toLowerCase();
}
let cliques = [];
document.addEventListener('click', e=>{
  const el = e.target; if(!(el instanceof Element) || el.closest('#ac-root,#ac-versao,#ac-sel,#ac-ed')) return;
  const r = rotulo(el); if(!r) return; uso('clique', r);
  if(el.closest('.chip,[data-dia],.st-opt')) return;                                       // passar dias e trocar filtro não é "travou"
  const agora = Date.now(); cliques.push({ t:agora, x:e.clientX, y:e.clientY, k:r }); cliques = cliques.filter(c=>agora-c.t <= 1000);
  if(cliques.filter(c=>c.k===r && Math.abs(c.x-e.clientX)<=30 && Math.abs(c.y-e.clientY)<=30).length >= 3){ uso('raiva', r); cliques = []; duvida('travou'); }
}, true);
const RE_ERRO = /^(n[aã]o |erro|escolha|somente|e-mail ou senha)/i;
const _toast = window.showToast;
window.showToast = function(msg){ try{ const m = String(msg||''); const erro = RE_ERRO.test(m); uso('aviso', m.replace(/\d[\d.\-\/() ]{4,}\d/g,'…'), { erro }); if(erro) duvida('recusa'); }catch(e){} return _toast.apply(this, arguments); };
window.addEventListener('error', ev=>{ uso('erro_js', String(ev.message||'').slice(0,160)); });

/* ---------- 3 · balão 💬 ---------- */
const ac = { motivo:null, pergunta:null, tipo:'melhoria', print:null, rec:null, gravador:null, audio:null, partes:[], voz:false, timer:null, ultimaDuvida:0 };
function montar(){
  if(document.getElementById('ac-root') || !document.body) return;
  const root = document.createElement('div'); root.id = 'ac-root';
  root.innerHTML = '<div id="ac-bubble" hidden></div><div id="ac-box" hidden></div><button type="button" id="ac-btn" title="Conta pra gente" aria-label="Conta pra gente">💬</button>';
  document.body.appendChild(root);
  document.getElementById('ac-btn').onclick = ()=> abrirCaixa('botao', '');
}
const ocupado = ()=> !!window.FR_tour || !!document.querySelector('#modal-root .modal-bg') || !document.getElementById('ac-box').hidden || ac.rec;
function fecharBalao(como){ const b = document.getElementById('ac-bubble'); clearTimeout(ac.timer); if(!b.hidden){ b.hidden = true; uso('balao', ac.motivo, { evento:'fechou', resposta:como }); } }
function mostrarBalao(motivo, pergunta){
  montar(); if(!email() || SEM_BALAO.includes(email()) || ocupado() || document.getElementById('app').hidden) return false;
  ac.motivo = motivo; ac.pergunta = pergunta;
  const b = document.getElementById('ac-bubble');
  b.innerHTML = '<p>'+esc(pergunta)+'</p><div class="ac-acoes"><button type="button" data-ac="ok">Tudo certo</button><button type="button" data-ac="falar">Tenho algo a dizer</button><button type="button" data-ac="x">Agora não</button></div>';
  b.hidden = false; uso('balao', motivo, { evento:'abriu' });
  b.querySelector('[data-ac=ok]').onclick = ()=> fecharBalao('ok');
  b.querySelector('[data-ac=x]').onclick = ()=> fecharBalao('desistiu');
  b.querySelector('[data-ac=falar]').onclick = ()=>{ b.hidden = true; clearTimeout(ac.timer); abrirCaixa(motivo, pergunta); };
  ac.timer = setTimeout(()=> fecharBalao('ignorou'), 40000);
  return true;
}
// no máximo um balão automático a cada 15 minutos
function duvida(motivo){ if(Date.now()-ac.ultimaDuvida < 900000) return; setTimeout(()=>{ if(Date.now()-ac.ultimaDuvida < 900000) return; if(mostrarBalao(motivo, PERGUNTA[motivo])) ac.ultimaDuvida = Date.now(); }, 1500); }
window.FR_duvida = duvida;
window.FR_abrirBalao = ()=> abrirCaixa('botao', '');
window.FR_uso = uso;   // o passo a passo registra se a pessoa foi até o fim

function abrirCaixa(motivo, pergunta){
  montar(); const bx = document.getElementById('ac-box'); if(!bx.hidden) return;
  fecharBalao('falou');
  ac.motivo = motivo; ac.pergunta = pergunta || ''; ac.tipo = motivo==='travou'||motivo==='recusa' ? 'problema' : motivo==='desfez'||motivo==='voltou' ? 'duvida' : 'melhoria'; ac.print = null; ac.audio = null; ac.voz = false;
  uso('balao', motivo, { evento:'abriu_caixa' });
  bx.innerHTML = '<div class="ac-cab"><b>Conta pra gente</b><button type="button" id="ac-fechar" aria-label="Fechar">✕</button></div>'
    + '<p class="ac-perg">'+esc(pergunta || 'Uma ideia, algo que não funcionou ou uma dúvida. Vai direto para quem cuida do sistema.')+'</p>'
    + '<div class="ac-chips">'+Object.keys(TIPOS).map(k=>'<button type="button" data-tipo="'+k+'" class="'+(k===ac.tipo?'on':'')+'">'+esc(TIPOS[k])+'</button>').join('')+'</div>'
    + '<textarea id="ac-texto" rows="4" placeholder="Escreva aqui, ou clique em Falar"></textarea>'
    + '<div class="ac-linha"><button type="button" id="ac-mic">🎤 Falar</button><span id="ac-aud" class="ac-aud"></span></div>'
    + '<div id="ac-print"></div>'
    + '<div class="ac-linha"><button type="button" id="ac-enviar" class="ac-pri">Enviar</button></div><div id="ac-ok" hidden></div>';
  bx.hidden = false;
  bx.querySelector('#ac-fechar').onclick = fecharCaixa;
  bx.querySelectorAll('[data-tipo]').forEach(b=> b.onclick = ()=>{ ac.tipo = b.dataset.tipo; bx.querySelectorAll('[data-tipo]').forEach(x=>x.classList.toggle('on', x===b)); });
  bx.querySelector('#ac-mic').onclick = alternarVoz;
  bx.querySelector('#ac-enviar').onclick = enviar;
  bx.querySelector('#ac-texto').addEventListener('paste', e=>{ const it = Array.from(e.clipboardData.items||[]).find(i=>i.type.startsWith('image/')); if(it){ ac.print = it.getAsFile(); desenharPrint(); } });
  desenharPrint(); setTimeout(()=>{ const x = document.getElementById('ac-texto'); if(x) x.focus(); }, 50);
}
function fecharCaixa(){ const bx = document.getElementById('ac-box'); pararVoz(); bx.hidden = true; ac.print = null; ac.audio = null; uso('balao', ac.motivo, { evento:'fechou' }); }
function desenharPrint(){
  const el = document.getElementById('ac-print'); if(!el) return;
  el.innerHTML = ac.print
    ? '<img alt="print" src="'+URL.createObjectURL(ac.print)+'"><div class="ac-linha"><button type="button" id="ac-marcar" class="ac-pri">✏️ Marcar no print</button><button type="button" id="ac-re">Tirar outro</button><button type="button" id="ac-tira">Sem print</button></div>'
    : '<button type="button" id="ac-re" class="ac-print-bt">📸 Mandar um print da tela (opcional)</button>';
  el.querySelector('#ac-re').onclick = tirarPrint;
  const m = el.querySelector('#ac-marcar'); if(m) m.onclick = editarPrint;
  const tx = el.querySelector('#ac-tira'); if(tx) tx.onclick = ()=>{ ac.print = null; desenharPrint(); };
}
function carregarScript(src){ return new Promise((ok,erro)=>{ const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = erro; document.head.appendChild(s); }); }
function escolherArea(){
  return new Promise(res=>{
    const ov = document.createElement('div'); ov.id = 'ac-sel';
    ov.innerHTML = '<div class="ac-sel-bar"><b>Arraste para escolher a parte da tela</b><button type="button" data-s="full">Tela inteira</button><button type="button" data-s="x">Cancelar</button></div><div class="ac-sel-r" hidden></div>';
    document.body.appendChild(ov);
    const r = ov.querySelector('.ac-sel-r'); let x0=0, y0=0, dr=false;
    const fim = v=>{ document.removeEventListener('keydown', tecla); ov.remove(); res(v); };
    const tecla = e=>{ if(e.key==='Escape') fim(null); }; document.addEventListener('keydown', tecla);
    const caixa = e=>({ x:Math.min(x0,e.clientX), y:Math.min(y0,e.clientY), w:Math.abs(e.clientX-x0), h:Math.abs(e.clientY-y0) });
    const pinta = b=>{ r.hidden = false; Object.assign(r.style, { left:b.x+'px', top:b.y+'px', width:b.w+'px', height:b.h+'px' }); };
    ov.addEventListener('pointerdown', e=>{ if(e.target.closest('.ac-sel-bar')) return; dr = true; x0 = e.clientX; y0 = e.clientY; pinta({x:x0,y:y0,w:0,h:0}); });
    ov.addEventListener('pointermove', e=>{ if(dr) pinta(caixa(e)); });
    ov.addEventListener('pointerup', e=>{ if(!dr) return; dr = false; const b = caixa(e); if(b.w<30 || b.h<30){ r.hidden = true; return; } fim({ rect:b }); });
    ov.addEventListener('click', e=>{ const b = e.target.closest('[data-s]'); if(!b) return; fim(b.dataset.s==='x' ? null : {}); });
  });
}
async function tirarPrint(){
  const bx = document.getElementById('ac-box'); bx.style.visibility = 'hidden';
  const spec = await escolherArea(); if(!spec){ bx.style.visibility = ''; return; }
  await new Promise(r=>setTimeout(r, 80));
  try{
    if(typeof html2canvas === 'undefined') await carregarScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
    const R = spec.rect; document.getElementById('ac-root').style.display = 'none';
    const cv = await Promise.race([ html2canvas(document.body, { x:window.scrollX+(R?R.x:0), y:window.scrollY+(R?R.y:0), width:R?R.w:window.innerWidth, height:R?R.h:window.innerHeight, windowWidth:window.innerWidth, windowHeight:window.innerHeight, scale:Math.min(2, window.devicePixelRatio||1), backgroundColor:getComputedStyle(document.body).backgroundColor }),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error('tempo')), 8000)) ]);
    ac.print = await new Promise(r=>cv.toBlob(r, 'image/jpeg', 0.86));
  }catch(e){ ac.print = null; window.showToast('Não consegui tirar o print. Você pode colar um (Ctrl+V) no texto.'); }
  document.getElementById('ac-root').style.display = ''; bx.style.visibility = '';
  desenharPrint(); if(ac.print) editarPrint();
}
function editarPrint(){
  if(!ac.print) return;
  const ed = document.createElement('div'); ed.id = 'ac-ed';
  ed.innerHTML = '<div class="ac-ed-barra"><b>Marque o que importa</b><button type="button" data-t="pen" class="on">✏️ Caneta</button><button type="button" data-t="rect">▭ Retângulo</button><button type="button" data-t="undo">↶ Desfazer</button><span style="flex:1"></span><button type="button" data-t="cancel">Cancelar</button><button type="button" data-t="usar" class="ac-pri">Usar este print</button></div><div class="ac-ed-area"><canvas id="ac-ed-c"></canvas></div>';
  document.body.appendChild(ed);
  const cv = ed.querySelector('canvas'), ctx = cv.getContext('2d'), pilha = []; let tool = 'pen', des = false, x0 = 0, y0 = 0, base = null, larg = 4;
  const img = new Image(); img.onload = ()=>{ cv.width = img.naturalWidth; cv.height = img.naturalHeight; larg = Math.max(3, cv.width/320); ctx.drawImage(img,0,0); pilha.push(ctx.getImageData(0,0,cv.width,cv.height)); }; img.src = URL.createObjectURL(ac.print);
  const pos = e=>{ const r = cv.getBoundingClientRect(); return [(e.clientX-r.left)*cv.width/r.width, (e.clientY-r.top)*cv.height/r.height]; };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  cv.addEventListener('pointerdown', e=>{ des = true; [x0,y0] = pos(e); base = ctx.getImageData(0,0,cv.width,cv.height); ctx.strokeStyle = '#e11d2e'; ctx.lineWidth = larg; ctx.beginPath(); ctx.moveTo(x0,y0); cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e=>{ if(!des) return; const [x,y] = pos(e); ctx.strokeStyle = '#e11d2e'; ctx.lineWidth = larg;
    if(tool==='pen'){ ctx.lineTo(x,y); ctx.stroke(); } else { ctx.putImageData(base,0,0); ctx.strokeRect(x0,y0,x-x0,y-y0); } });
  cv.addEventListener('pointerup', ()=>{ if(!des) return; des = false; pilha.push(ctx.getImageData(0,0,cv.width,cv.height)); if(pilha.length>25) pilha.splice(1,1); });
  ed.querySelector('.ac-ed-barra').addEventListener('click', async e=>{
    const b = e.target.closest('[data-t]'); if(!b) return; const k = b.dataset.t;
    if(k==='pen'||k==='rect'){ tool = k; ed.querySelectorAll('[data-t=pen],[data-t=rect]').forEach(x=>x.classList.toggle('on', x===b)); }
    else if(k==='undo'){ if(pilha.length>1){ pilha.pop(); ctx.putImageData(pilha[pilha.length-1],0,0); } }
    else if(k==='cancel') ed.remove();
    else if(k==='usar'){ ac.print = await new Promise(r=>cv.toBlob(r,'image/jpeg',0.86)); ed.remove(); desenharPrint(); }
  });
}
// ditado em pt-BR e, junto, a gravação do áudio original (vai anexada à sugestão)
function pararVoz(){
  if(ac.rec){ try{ ac.rec.stop(); }catch(e){} ac.rec = null; }
  if(ac.gravador && ac.gravador.state !== 'inactive'){ try{ ac.gravador.stop(); }catch(e){} }
  const btn = document.getElementById('ac-mic'); if(btn) btn.textContent = '🎤 Falar';
}
async function alternarVoz(){
  const btn = document.getElementById('ac-mic');
  if(ac.rec || (ac.gravador && ac.gravador.state==='recording')){ pararVoz(); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  try{
    const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
    ac.partes = []; const g = new MediaRecorder(stream); ac.gravador = g;
    g.ondataavailable = e=>{ if(e.data && e.data.size) ac.partes.push(e.data); };
    g.onstop = ()=>{ stream.getTracks().forEach(t=>t.stop()); ac.audio = new Blob(ac.partes, { type: g.mimeType || 'audio/webm' }); const a = document.getElementById('ac-aud'); if(a) a.textContent = '🎧 áudio gravado ('+Math.round(ac.audio.size/1024)+' KB)'; };
    g.start();
  }catch(e){ if(!SR){ window.showToast('Não consegui usar o microfone neste navegador.'); return; } }
  if(SR){
    const rec = new SR(); rec.lang = 'pt-BR'; rec.continuous = true; rec.interimResults = false;
    const ta = document.getElementById('ac-texto');
    rec.onresult = ev=>{ for(let i=ev.resultIndex; i<ev.results.length; i++) if(ev.results[i].isFinal) ta.value = (ta.value ? ta.value.trim()+' ' : '') + ev.results[i][0].transcript.trim(); ac.voz = true; };
    rec.onend = ()=>{ if(ac.rec===rec) pararVoz(); };
    rec.start(); ac.rec = rec;
  }
  ac.voz = true; btn.textContent = '⏹ Parar';
}
async function enviar(){
  const ta = document.getElementById('ac-texto'), btn = document.getElementById('ac-enviar');
  if(ac.rec || (ac.gravador && ac.gravador.state==='recording')){ pararVoz(); await new Promise(r=>setTimeout(r, 400)); }
  const texto = ta.value.trim(); if(!texto && !ac.audio){ window.showToast('Escreva ou fale alguma coisa antes de enviar.'); return; }
  btn.disabled = true; btn.textContent = 'Enviando…';
  try{
    const anexos = []; let audio_path = null; const id = Date.now()+'-'+Math.random().toString(36).slice(2,8);
    if(ac.print){ const nome = 'sugestoes/'+id+'.jpg';
      const up = await sb.storage.from('frt-anexos').upload(nome, ac.print, { contentType:'image/jpeg' }); if(!up.error) anexos.push({ path:nome, mime:'image/jpeg', tamanho:ac.print.size }); }
    if(ac.audio){ const nome = 'sugestoes/'+id+'.webm';
      const up = await sb.storage.from('frt-anexos').upload(nome, ac.audio, { contentType: ac.audio.type || 'audio/webm' }); if(!up.error) audio_path = nome; }
    const contexto = { via: ac.motivo==='botao' ? 'botao' : 'balao', motivo:ac.motivo, pergunta:ac.pergunta||null, rota:rota(), largura:window.innerWidth, ultimos:ultimos.slice(-20) };
    const { error } = await sb.from('frt_sugestoes').insert({ autor:FR.nome, texto: texto || '(mensagem de voz)', tipo:ac.tipo, tela:nomeTela(), origem: ac.voz ? 'voz' : 'texto', anexos, audio_path, contexto,
      historico:[{ em:new Date().toISOString(), por:FR.nome, de:'nova', para:'nova', nota:'balão 💬' }] });
    if(error) throw error;
    const ok = document.getElementById('ac-ok'); ok.hidden = false; ok.textContent = 'Anotado! 🙌 Quem cuida do sistema vai ler e responder.';
    uso('balao', ac.motivo, { evento:'enviou' }); ac.print = null; ac.audio = null; ac.voz = false;
    setTimeout(()=>{ document.getElementById('ac-box').hidden = true; }, 3000);
    if(window.FR_renderSugestoes) window.FR_renderSugestoes();
  }catch(e){ window.showToast('Não enviou: '+(e.message||e)); btn.disabled = false; btn.textContent = 'Enviar'; }
}

/* estilo (usa os tokens do tema: funciona no claro e no escuro) */
const css = document.createElement('style'); css.textContent = `
  #ac-root{position:fixed;right:22px;bottom:22px;z-index:60}
  body:has(#app[hidden]) #ac-root{display:none}
  #ac-btn{width:54px;height:54px;border-radius:50%;border:0;background:var(--gold);color:#1b1404;font-size:22px;box-shadow:var(--shadow-lg)}
  #ac-bubble,#ac-box{position:absolute;right:0;bottom:66px;width:340px;background:var(--panel);color:var(--ink);border:1px solid var(--line);border-radius:14px;padding:14px;box-shadow:var(--shadow-lg);font-size:13px}
  #ac-box{max-height:78vh;overflow:auto} #ac-bubble p{margin:0 0 10px}
  .ac-acoes,.ac-chips,.ac-linha{display:flex;gap:6px;flex-wrap:wrap;align-items:center} .ac-chips{margin-bottom:8px} .ac-linha{margin:8px 0}
  .ac-acoes button,.ac-chips button,.ac-linha button,#ac-print button{border:1px solid var(--line-2);background:var(--panel);color:var(--ink);border-radius:999px;padding:5px 11px;font-size:12px}
  .ac-acoes [data-ac=x]{margin-left:auto} .ac-chips .on,.ac-pri{background:var(--accent)!important;color:var(--accent-ink)!important;border-color:var(--accent)!important}
  .ac-cab{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px} .ac-cab button{border:0;background:none;font-size:16px;color:var(--ink-3)}
  .ac-perg{margin:0 0 8px;color:var(--ink-2)} #ac-texto{width:100%;border:1px solid var(--line-2);background:var(--panel);border-radius:8px;padding:8px;resize:vertical}
  .ac-aud{font-size:12px;color:var(--ink-3)}
  .ac-print-bt{width:100%;padding:9px 12px!important;font-weight:600} #ac-print img{max-width:100%;max-height:140px;border:1px solid var(--line);border-radius:8px;display:block}
  #ac-ok{background:var(--green-soft);color:var(--green);border-radius:8px;padding:8px 10px;font-weight:600}
  #ac-sel{position:fixed;inset:0;z-index:395;background:rgba(10,15,25,.35);cursor:crosshair;touch-action:none}
  .ac-sel-bar{position:fixed;top:12px;left:50%;transform:translateX(-50%);background:var(--panel);color:var(--ink);border-radius:12px;padding:10px 14px;box-shadow:var(--shadow-lg);display:flex;gap:8px;align-items:center;flex-wrap:wrap;cursor:default;max-width:92vw}
  .ac-sel-bar button,.ac-ed-barra button{border:1px solid var(--line-2);background:var(--panel);color:var(--ink);border-radius:999px;padding:5px 12px;font-size:12.5px}
  .ac-sel-r{position:fixed;border:3px solid #ff7a00;box-shadow:0 0 0 9999px rgba(10,15,25,.45);pointer-events:none}
  #ac-ed{position:fixed;inset:0;z-index:400;background:rgba(10,15,25,.8);display:flex;flex-direction:column}
  .ac-ed-barra{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 14px;background:var(--panel);color:var(--ink)} .ac-ed-barra .on{border-color:var(--accent);color:var(--accent);font-weight:700}
  .ac-ed-area{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:12px;overflow:auto}
  #ac-ed-c{max-width:100%;max-height:calc(100vh - 90px);background:#fff;border-radius:6px;cursor:crosshair;touch-action:none}
  @media (max-width:700px){ #ac-box,#ac-bubble{width:calc(100vw - 44px)} #ac-root{right:14px;bottom:14px} }`;
document.head.appendChild(css);

function iniciar(){ montar(); verificarVersao(); }
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
