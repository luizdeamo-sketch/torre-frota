/* Torre de Controle - Transpanorama: disponibilidade diária da frota de combustível.
   Telas: Apresentação, Hoje (o programador lança), Quadro do mês, Faturamento × meta, Sugestões, Equipe (gestor).
   Banco: Supabase da Capacity Case, tabelas frt_*. Regra de disponível/indisponível em frt_status (uma regra só). */
(function(){
'use strict';
const CONFIG = {
  empresa: 'Transpanorama',
  url: 'https://iuotvottnailofxbaynx.supabase.co',
  anon: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1b3R2b3R0bmFpbG9meGJheW54Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI1Mjg2NjMsImV4cCI6MjEwODEwNDY2M30._0FhywQ4Vq3km5Rl4tHEPtCLBVom4VAGaXG3X3nrUyQ'
};
const NOME = 'Torre de Controle - ' + CONFIG.empresa;
const sb = window.supabase.createClient(CONFIG.url, CONFIG.anon);
// grupos que a tela mostra (chips e resumo); o "disponível" vem do catálogo frt_status
const GRUPOS = [
  { k:'rodando', nome:'Rodando', cor:'blue', curto:'carregando, em viagem ou voltando', desc:'Carregando, em viagem, descarregando ou voltando vazio' },
  { k:'parado', nome:'Disponível parado', cor:'amber', curto:'sem cota ou descanso 36h', desc:'Sem cota ou em descanso de 36h: pode rodar, mas não está rodando' },
  { k:'manut', nome:'Manutenção', cor:'red', curto:'corretiva, preventiva, aferição', desc:'Corretiva, preventiva, aferição ou tecnologia' },
  { k:'motorista', nome:'Motorista', cor:'red', curto:'folga, férias ou sem motorista', desc:'Folga, férias ou conjunto sem motorista' },
  { k:'ssma', nome:'SSMA', cor:'red', curto:'bloqueio ou treinamento', desc:'Bloqueio ou treinamento de segurança' },
  { k:'vazio', nome:'Sem lançamento', cor:'amber', curto:'ninguém informou o dia', desc:'Ninguém informou o status deste conjunto neste dia' } ];
const GRUPO_DE = { 'Rodando':'rodando', 'Disponível parado':'parado', 'Manutenção':'manut', 'Motorista':'motorista', 'SSMA':'ssma' };
const SIGLA = { 'D|CARREGAMENTO':'CAR', 'D|DESCA|TRSIT':'VIA', 'D|DESCARGA':'DES', 'D|ORIGE|TRSIT':'VOL', 'D|SCOTA':'COT', 'D|36H':'36H', 'I|MNT|CORR':'MC', 'I|MNT|PREV':'MP',
  'I|AFERICOES':'AF', 'I|TECNOLOGIA':'TEC', 'I|FOLGA':'FOL', 'I|FERIAS':'FÉR', 'I|SEM MOTORISTA':'S/M', 'I|SSMA':'SS', 'I|SSMA|TREIN':'TR' };
const FERIADOS = ['01-01','04-21','05-01','09-07','10-12','11-02','11-15','11-20','12-25'];
const S = { email:'', membro:null, view:'apresentacao', mes:'', dia:'', veic:[], status:{}, grids:{}, metas:{}, dias:new Map(), fat:{}, fatFora:0, fatLinhas:0,
  progs:[], f:{ busca:'', prog:'', grid:'', op:'', chip:'', res:null }, fatF:{ sit:'', grid:'' }, sugestoes:[], novidades:[] };

/* ---------- utilidades ---------- */
const $ = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => Array.from(el.querySelectorAll(s));
const esc = s => String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function lsGet(k,d){ try{ const v = localStorage.getItem(k); return v==null ? d : v; }catch(e){ return d; } }
function lsSet(k,v){ try{ localStorage.setItem(k, v); }catch(e){} }
const iso = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const hojeISO = ()=> iso(new Date());
function somaDias(s, n){ const [y,m,d] = s.split('-').map(Number); return iso(new Date(y, m-1, d+n)); }
const diasDoMes = mes => { const [y,m] = mes.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const diaDoMes = (mes, d) => mes+'-'+String(d).padStart(2,'0');
const dow = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d).getDay(); };
const ehFolgaCal = s => dow(s)===0 || dow(s)===6 || FERIADOS.includes(s.slice(5));
const SEM = ['dom','seg','ter','qua','qui','sex','sáb'];
const fDia = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d).toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'short' }); };
const fDiaHora = d => new Date(d).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
const fData = d => new Date(d).toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' });
const fR = v => v==null ? '–' : Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:0 });
const fRk = v => v==null ? '–' : Math.abs(v)>=1e6 ? 'R$ '+(v/1e6).toLocaleString('pt-BR',{maximumFractionDigits:2})+' mi' : 'R$ '+Math.round(v/1000).toLocaleString('pt-BR')+' mil';
const fP = v => v==null||!isFinite(v) ? '–' : Math.round(v*100)+'%';
const fN = v => Number(v||0).toLocaleString('pt-BR');
const sem = s => String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
let toastTimer = null;
window.showToast = function(msg){ let el = $('#toast'); if(!el){ el = document.createElement('div'); el.id='toast'; el.className='toast'; el.setAttribute('role','status'); document.body.appendChild(el); }
  el.textContent = msg; el.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(()=> el.hidden = true, 3800); };
const toast = m => window.showToast(m);
const ehAdmin = ()=> S.membro && S.membro.papel==='admin';
const podeEscrever = ()=> S.membro && (S.membro.papel==='admin' || S.membro.papel==='programador');
function guard(){ if(!podeEscrever()){ toast('Somente leitura: peça ao gestor para liberar a edição.'); return false; } return true; }
$$('.nome-sistema').forEach(el=> el.textContent = NOME);

/* ---------- modal ---------- */
function abrirModal(html, onMount){
  const root = $('#modal-root'); root.innerHTML = '<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true">'+html+'</div></div>';
  const bg = root.firstChild;
  bg.addEventListener('mousedown', e=>{ if(e.target===bg) fecharModal(); });
  $$('[data-close]', bg).forEach(b=> b.addEventListener('click', fecharModal));
  document.addEventListener('keydown', escModal);
  if(onMount) onMount(bg);
  return bg;
}
function escModal(e){ if(e.key==='Escape') fecharModal(); }
function fecharModal(){ $('#modal-root').innerHTML=''; document.removeEventListener('keydown', escModal); }

/* ---------- tema ---------- */
function aplicarTemaBotoes(){
  const dark = document.documentElement.dataset.theme==='dark';
  $$('[data-theme-btn]').forEach(b=>{ b.innerHTML = dark
      ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
    b.title = dark ? 'Tema claro' : 'Tema escuro'; b.setAttribute('aria-label', b.title); });
}
document.addEventListener('click', e=>{
  const tb = e.target.closest('[data-theme-btn]'); if(tb){ const n = document.documentElement.dataset.theme==='dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = n; lsSet('frt_tema', n); aplicarTemaBotoes(); }
});

/* ---------- login ---------- */
function telaLogin(msg){
  $('#app').hidden = true; $('#login').hidden = false; $('#lg-pa').hidden = true; $('#lg-entrar').hidden = false;
  const m = $('#lg-msg'); m.hidden = !msg; m.textContent = msg || ''; m.className = 'msg';
}
$('#lg-btn').addEventListener('click', entrar);
$('#lg-senha').addEventListener('keydown', e=>{ if(e.key==='Enter') entrar(); });
async function entrar(){
  const email = $('#lg-email').value.trim(), senha = $('#lg-senha').value, m = $('#lg-msg'), b = $('#lg-btn');
  b.disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email, password: senha });
  b.disabled = false;
  if(error){ m.hidden = false; m.className='msg'; m.textContent = 'E-mail ou senha não conferem.'; }
}
const PA_MSG = { email_invalido:'E-mail inválido.', senha_curta:'A senha precisa ter pelo menos 10 caracteres.', nao_liberado:'Este e-mail ainda não foi liberado pelo gestor (ou o prazo de 48h venceu).', ja_tem_senha:'Este e-mail já tem senha. Use "Entrar".', erro:'Não deu certo agora. Tente de novo em instantes.' };
$('#lg-primeiro').addEventListener('click', ()=>{ $('#lg-entrar').hidden = true; $('#lg-pa').hidden = false; $('#pa-email').value = $('#lg-email').value; $('#pa-msg').hidden = true; });
$('#pa-voltar').addEventListener('click', ()=>{ $('#lg-pa').hidden = true; $('#lg-entrar').hidden = false; });
$('#pa-btn').addEventListener('click', async ()=>{
  const email = $('#pa-email').value.trim(), senha = $('#pa-senha').value, m = $('#pa-msg'), b = $('#pa-btn');
  b.disabled = true; m.hidden = true;
  try{
    const r = await fetch(CONFIG.url + '/functions/v1/frt-primeiro-acesso', { method:'POST', headers:{ 'Content-Type':'application/json', apikey: CONFIG.anon }, body: JSON.stringify({ email, senha }) });
    const j = await r.json().catch(()=>({ code:'erro' }));
    if(!r.ok || !j.ok){ m.hidden = false; m.className='msg'; m.textContent = PA_MSG[j.code] || PA_MSG.erro; b.disabled = false; return; }
    const { error } = await sb.auth.signInWithPassword({ email, password: senha });
    if(error){ m.hidden = false; m.textContent = 'E-mail ou senha não conferem.'; }
  }catch(e){ m.hidden = false; m.textContent = PA_MSG.erro; }
  b.disabled = false;
});
$('#btn-sair').addEventListener('click', async ()=>{ await sb.auth.signOut(); });

let iniciado = false;
sb.auth.onAuthStateChange((ev, session)=>{ setTimeout(()=> sessao(session), 0); });
async function sessao(session){
  if(!session){ S.membro = null; S.email=''; iniciado = false; telaLogin(); return; }
  if(iniciado && S.email === session.user.email.toLowerCase()) return;
  S.email = session.user.email.toLowerCase();
  const { data } = await sb.from('frt_membros').select('*').ilike('email', S.email).maybeSingle();
  if(!data || !data.ativo){ await sb.auth.signOut(); telaLogin('Este e-mail não tem acesso a esta torre. Fale com o gestor.'); return; }
  S.membro = data; iniciado = true;
  $('#login').hidden = true; $('#app').hidden = false;
  const PAP = { admin:'Gestor', programador:'Programador', leitura:'Leitura' };
  $('#quem').textContent = (data.nome || S.email) + ' · ' + PAP[data.papel];
  $$('[data-admin]').forEach(el=> el.hidden = !ehAdmin());
  // o programador abre nos caminhões dele; a escolha que ele fizer depois fica lembrada ('*' = todos)
  const salvo = lsGet('frt_f_prog:'+S.email, null);
  S.f.prog = salvo===null ? (data.programador||'') : salvo==='*' ? '' : salvo;
  await carregarBase();
  // quem é novo entra pela Apresentação; depois, pela última tela
  const visto = lsGet('frt_apresentacao:'+S.email, '');
  irPara(location.hash.replace('#','') || (visto ? lsGet('frt_view', data.papel==='programador' ? 'hoje' : 'painel') : 'apresentacao'));
  // primeira vez: o passo a passo no lugar da faixa de novidades (quem é novo não precisa saber o que mudou)
  if(!lsGet(tourChave(), '')){ novidadesCarregar().then(novMarcarVisto); setTimeout(()=> tourAbrir('primeira'), 600); }
  else novidadesIniciar();
  retornoIniciar();
  window.dispatchEvent(new CustomEvent('frt-entrou'));
}

/* ---------- dados ---------- */
async function buscarTudo(q){ const PAG = 1000; let pag = 0, todos = [];
  while(true){ const { data, error } = await q().range(pag*PAG, pag*PAG+PAG-1); if(error) throw error; todos = todos.concat(data||[]); if(!data || data.length < PAG) break; pag++; }
  return todos; }
async function carregarBase(){
  try{
    const [st, gr, me, ve, pr] = await Promise.all([ sb.from('frt_status').select('*').order('ordem'), sb.from('frt_grids').select('*').order('ordem'), sb.from('frt_metas').select('*'),
      buscarTudo(()=> sb.from('frt_veiculos').select('*').eq('ativo', true).order('placa')), sb.from('frt_programadores').select('*').order('nome') ]);
    S.status = {}; (st.data||[]).forEach(s=> S.status[s.codigo] = s);
    S.grids = {}; (gr.data||[]).forEach(g=> S.grids[g.grid] = g);
    S.metas = {}; (me.data||[]).forEach(m=> S.metas[m.competencia.slice(0,7)+'|'+m.grid] = Number(m.meta_veiculo));
    S.veic = ve; S.progs = (pr.data||[]).map(p=>p.nome);
    // mês padrão: o de hoje; se o banco ainda não tem dado dele, o último mês com meta
    const meses = [...new Set(Object.keys(S.metas).map(k=>k.split('|')[0]))].sort();
    S.meses = meses; const mh = hojeISO().slice(0,7);
    S.mes = lsGet('frt_mes', '') || (meses.includes(mh) ? mh : meses[meses.length-1] || mh);
    if(!meses.includes(S.mes)) S.mes = meses[meses.length-1] || mh;
    S.dia = S.mes===mh ? hojeISO() : diaDoMes(S.mes, diasDoMes(S.mes));
    await carregarMes();
  }catch(e){ toast('Não consegui carregar os dados: '+(e.message||e)); }
}
async function carregarMes(){
  const ini = diaDoMes(S.mes, 1), fim = diaDoMes(S.mes, diasDoMes(S.mes));
  const ant = somaDias(ini, -7);   // a semana anterior entra para contar "há N dias no status" no começo do mês
  const [dias, fat, just] = await Promise.all([
    buscarTudo(()=> sb.from('frt_dias').select('placa,dia,status,obs,atualizado_em,atualizado_por').gte('dia', ant).lte('dia', fim).order('dia').order('placa')),
    buscarTudo(()=> sb.from('frt_faturamento').select('id,placa,valor,importado_em').eq('competencia', ini).order('id')),
    buscarTudo(()=> sb.from('frt_justificativas').select('*').eq('competencia', ini).order('placa')) ]);
  S.dias = new Map(); dias.forEach(d=> S.dias.set(d.placa+'|'+d.dia, d));
  S.just = {}; just.forEach(j=> S.just[j.placa] = j);
  S.fatImportado = fat.reduce((a,f)=> f.importado_em && (!a || f.importado_em > a) ? f.importado_em : a, null);
  S.fat = {}; S.fatLinhas = fat.length; const placas = new Set(S.veic.map(v=>v.placa)); S.fatFora = 0;
  fat.forEach(f=>{ S.fat[f.placa] = (S.fat[f.placa]||0) + Number(f.valor||0); if(!placas.has(f.placa)) S.fatFora += Number(f.valor||0); });
}
const reg = (placa, dia) => S.dias.get(placa+'|'+dia);
const stDe = (placa, dia) => { const r = reg(placa, dia); return r && r.status ? S.status[r.status] : null; };
const grupoDe = (placa, dia) => { const s = stDe(placa, dia); return s ? GRUPO_DE[s.grupo] : 'vazio'; };
function diasNoStatus(placa, dia){
  const r = reg(placa, dia); if(!r || !r.status) return 0; let n = 1, d = somaDias(dia, -1);
  while(n < 60){ const x = reg(placa, d); if(!x || x.status !== r.status) break; n++; d = somaDias(d, -1); }
  return n;
}
function filtrados(dia){
  const F = S.f, q = sem(F.busca);
  return S.veic.filter(v=> (!F.prog || v.programador===F.prog) && (!F.grid || v.grid===F.grid) && (!F.op || v.operacao===F.op)
    && (!q || sem([v.placa, v.carreta1, v.carreta2, v.motorista, v.obs].join(' ')).includes(q))
    && (!F.res || grupoDe(v.placa, F.res.dia)===F.res.g || (F.res.g==='disp' && stDe(v.placa, F.res.dia) && stDe(v.placa, F.res.dia).disponivel))
    && (!F.chip || (F.chip==='disp' ? (stDe(v.placa, dia)||{}).disponivel : grupoDe(v.placa, dia)===F.chip)));
}

// grava o status de um conjunto num dia (e, se pedido, nos dias seguintes até "ate")
async function salvarDia(placa, dia, status, obs, ate){
  if(!guard()) return false;
  const datas = [dia]; if(ate && ate > dia){ let d = somaDias(dia, 1); while(d <= ate && datas.length < 62){ datas.push(d); d = somaDias(d, 1); } }
  const linhas = datas.map(d=>({ placa, dia:d, status: status||null, obs: obs||null }));
  const antes = reg(placa, dia);
  const { data, error } = await sb.from('frt_dias').upsert(linhas, { onConflict:'placa,dia' }).select('placa,dia,status,obs,atualizado_em,atualizado_por');
  if(error){ toast('Não salvou: '+error.message); return false; }
  (data||[]).forEach(r=> S.dias.set(r.placa+'|'+r.dia, r));
  // desfez: voltou ao que era logo depois de mudar (sinal de dúvida para o balão)
  const ult = S._ultimaMud; S._ultimaMud = { placa, dia, de: antes && antes.status, para: status, em: Date.now() };
  if(ult && ult.placa===placa && ult.dia===dia && ult.de===status && Date.now()-ult.em < 60000 && window.FR_duvida) window.FR_duvida('desfez');
  return true;
}

/* ---------- navegação ---------- */
const VIEWS = ['apresentacao','painel','hoje','quadro','faturamento','sugestoes','equipe'];
const TITULOS = { apresentacao:'Apresentação', painel:'Painel', hoje:'Hoje', quadro:'Quadro do mês', faturamento:'Faturamento × meta', sugestoes:'Sugestões', equipe:'Equipe' };
$$('.nav').forEach(b=> b.addEventListener('click', ()=> irPara(b.dataset.view)));
function irPara(v){
  if(!VIEWS.includes(v) || (v==='equipe' && !ehAdmin())) v = 'hoje';
  S.view = v; history.replaceState(null, '', '#'+v); if(v!=='apresentacao') lsSet('frt_view', v);
  $$('.nav').forEach(b=> b.classList.toggle('on', b.dataset.view===v));
  $$('.view').forEach(s=> s.classList.toggle('active', s.id==='view-'+v));
  render(); window.scrollTo(0,0);
  if(window.FR_retornoTela) window.FR_retornoTela();
}
function render(){
  $('#top-titulo').textContent = TITULOS[S.view];
  ({ apresentacao:renderApresentacao, painel:renderPainel, hoje:renderHoje, quadro:renderQuadro, faturamento:renderFaturamento, sugestoes:renderSugestoes, equipe:renderEquipe })[S.view]();
}

/* ---------- barra de filtros comum (Hoje e Quadro) ---------- */
function barraFiltros(comDia){
  const F = S.f, ops = [...new Set(S.veic.map(v=>v.operacao).filter(Boolean))].sort();
  const opt = (vals, sel, todos, nome) => `<option value="">${esc(todos)}</option>` + vals.map(x=>`<option value="${esc(x)}" ${x===sel?'selected':''}>${esc(nome?nome(x):x)}</option>`).join('');
  return `<div class="card bar">
    ${comDia ? `<span class="dia"><button class="btn sm" type="button" data-dia="-1" aria-label="Dia anterior">‹</button><input type="date" id="f-dia" value="${S.dia}" min="${diaDoMes(S.mes,1)}" max="${diaDoMes(S.mes,diasDoMes(S.mes))}"><button class="btn sm" type="button" data-dia="1" aria-label="Próximo dia">›</button><button class="btn sm" type="button" id="f-hoje">Hoje</button></span>`
      : `<select id="f-mes" aria-label="Mês">${(S.meses||[S.mes]).map(m=>`<option value="${m}" ${m===S.mes?'selected':''}>${new Date(m+'-15T12:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</option>`).join('')}</select>`}
    <input type="search" id="f-busca" placeholder="Buscar placa, carreta ou motorista" value="${esc(F.busca)}">
    <select id="f-prog" aria-label="Programador">${opt(S.progs, F.prog, 'Todos os programadores', p=> p.charAt(0)+p.slice(1).toLowerCase())}</select>
    <select id="f-grid" aria-label="Grid">${opt(Object.keys(S.grids), F.grid, 'Todos os grids', g=> S.grids[g].nome)}</select>
    <select id="f-op" aria-label="Operação">${opt(ops, F.op, 'Todas as operações')}</select>
  </div>`;
}
function ligarFiltros(v, rerender){
  const F = S.f;
  const b = $('#f-busca', v); b.addEventListener('input', ()=>{ F.busca = b.value; clearTimeout(S._bt); S._bt = setTimeout(()=>{ rerender(); const n = $('#f-busca'); if(n){ n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 250); });
  $('#f-prog', v).addEventListener('change', e=>{ F.prog = e.target.value; lsSet('frt_f_prog:'+S.email, F.prog || '*'); rerender(); });
  $('#f-grid', v).addEventListener('change', e=>{ F.grid = e.target.value; rerender(); });
  $('#f-op', v).addEventListener('change', e=>{ F.op = e.target.value; rerender(); });
  const fd = $('#f-dia', v); if(fd){ fd.addEventListener('change', ()=>{ if(fd.value){ S.dia = fd.value; rerender(); } });
    $$('[data-dia]', v).forEach(x=> x.addEventListener('click', ()=>{ const n = somaDias(S.dia, +x.dataset.dia); if(n.slice(0,7)===S.mes){ S.dia = n; rerender(); } }));
    $('#f-hoje', v).addEventListener('click', ()=>{ const h = hojeISO(); S.dia = h.slice(0,7)===S.mes ? h : diaDoMes(S.mes, diasDoMes(S.mes)); rerender(); }); }
  const fm = $('#f-mes', v); if(fm) fm.addEventListener('change', async ()=>{ S.mes = fm.value; lsSet('frt_mes', S.mes); S.dia = S.mes===hojeISO().slice(0,7) ? hojeISO() : diaDoMes(S.mes, diasDoMes(S.mes)); await carregarMes(); rerender(); });
}

/* ---------- seletor de status (o clique do programador) ---------- */
function modalStatus(placa, dia, aoSalvar){
  const v = S.veic.find(x=>x.placa===placa); if(!v) return;
  const r = reg(placa, dia) || {}, ontem = reg(placa, somaDias(dia, -1)) || {};
  const porGrupo = {}; Object.values(S.status).forEach(s=> (porGrupo[s.grupo] = porGrupo[s.grupo] || []).push(s));
  let escolhido = r.status || '';
  abrirModal(`<div class="modal-h"><div><h3><span class="mono">${esc(v.placa)}</span> · ${esc(fDia(dia))}</h3><div class="sub">${esc(v.motorista || 'sem motorista na planilha')} · ${esc((S.grids[v.grid]||{}).nome||v.grid||'')} · ${esc(v.operacao||'')}</div></div><button class="x" data-close aria-label="Fechar">✕</button></div>
    <div class="modal-b">
      ${ontem.status ? `<div class="sub">Ontem: <b>${esc((S.status[ontem.status]||{}).nome||ontem.status)}</b>${ontem.obs?' · '+esc(ontem.obs):''} <button class="btn sm" type="button" id="ms-ontem">Repetir ontem</button></div>` : ''}
      <div class="st-grid">${Object.keys(porGrupo).map(g=>`<div class="st-grupo"><b>${esc(g)}${porGrupo[g][0].disponivel?' · conta como disponível':' · conta como indisponível'}</b><div class="st-opts">${porGrupo[g].map(s=>`<button type="button" class="st-opt ${s.codigo===escolhido?'on':''}" data-st="${esc(s.codigo)}"><i style="background:${esc(s.cor)}"></i>${esc(s.nome)}</button>`).join('')}</div></div>`).join('')}</div>
      <div class="form">
        <label class="fld full"><span>Observação (opcional)</span><input id="ms-obs" value="${esc(r.obs||'')}" placeholder="Ex.: falta troca de NF, quer folgar em Maringá"></label>
        <label class="fld"><span>Repetir até (opcional, para férias ou manutenção já marcada)</span><input id="ms-ate" type="date" min="${somaDias(dia,1)}" max="${diaDoMes(S.mes, diasDoMes(S.mes))}"></label>
      </div>
      <div class="fld"><span>Histórico deste conjunto</span><div class="hist" id="ms-hist"><span class="muted">Carregando…</span></div></div>
    </div>
    <div class="modal-f">${r.status&&ehAdmin()?'<button class="btn" type="button" id="ms-limpar" style="margin-right:auto">Limpar o dia</button>':''}<button class="btn" type="button" data-close>Cancelar</button><button class="btn pri" type="button" id="ms-ok" ${podeEscrever()?'':'disabled'}>Salvar</button></div>`, bg=>{
    $$('[data-st]', bg).forEach(b=> b.addEventListener('click', ()=>{ escolhido = b.dataset.st; $$('[data-st]', bg).forEach(x=> x.classList.toggle('on', x===b)); }));
    const ro = $('#ms-ontem', bg); if(ro) ro.addEventListener('click', ()=>{ escolhido = ontem.status; $('#ms-obs', bg).value = ontem.obs || ''; $$('[data-st]', bg).forEach(x=> x.classList.toggle('on', x.dataset.st===escolhido)); });
    $('#ms-ok', bg).addEventListener('click', async ()=>{
      if(!escolhido){ toast('Escolha um status antes de salvar.'); return; }
      if(await salvarDia(placa, dia, escolhido, $('#ms-obs', bg).value.trim(), $('#ms-ate', bg).value)){ toast('Salvo: '+v.placa+' · '+S.status[escolhido].nome); fecharModal(); aoSalvar ? aoSalvar() : render(); }
    });
    const lp = $('#ms-limpar', bg); if(lp) lp.addEventListener('click', async ()=>{ if(await salvarDia(placa, dia, null, null)){ toast('Dia limpo.'); fecharModal(); render(); } });
    sb.from('frt_dias_hist').select('*').eq('placa', placa).order('em', { ascending:false }).limit(30).then(({ data })=>{
      const h = $('#ms-hist', bg); if(!h) return;
      h.innerHTML = (data||[]).length ? data.map(x=>`<div><span class="mono">${esc(x.dia.slice(8))}/${esc(x.dia.slice(5,7))}</span> · ${esc((S.status[x.para]||{}).nome || x.para || 'limpo')}${x.de?' <span class="muted">(era '+esc((S.status[x.de]||{}).nome||x.de)+')</span>':''} · <span class="muted">${esc(x.por==='carga'?'planilha de outubro':x.por)} · ${fDiaHora(x.em)}</span></div>`).join('') : '<span class="muted">Sem histórico.</span>';
    });
  });
}

/* ---------- ficha do conjunto ---------- */
function abrirFicha(placa){
  const v = S.veic.find(x=>x.placa===placa); if(!v) return;
  const n = diasDoMes(S.mes), ate = refDia();
  let disp = 0, ind = 0, vaz = 0; const motivos = {};
  for(let d=1; d<=n; d++){ const s = diaDoMes(S.mes,d); if(s > hojeISO()) break; const st = stDe(placa, s); if(!st){ vaz++; continue; } if(st.disponivel) disp++; else { ind++; motivos[st.nome] = (motivos[st.nome]||0)+1; } }
  const meta = S.metas[S.mes+'|'+v.grid] || 0, esp = meta*ate/n, fat = S.fat[placa]||0;
  const mot = Object.entries(motivos).sort((a,b)=>b[1]-a[1]).map(([k,q])=>q+' '+k.toLowerCase()).join(', ');
  abrirModal(`<div class="modal-h"><div><h3><span class="mono">${esc(v.placa)}</span> · ${esc(v.motorista||'sem motorista')}</h3><div class="sub">Carretas ${esc([v.carreta1,v.carreta2].filter(Boolean).join(' + ')||'–')} · ${esc((S.grids[v.grid]||{}).nome||'')} · ${esc(v.operacao||'')} · programador ${esc(v.programador||'–')}</div></div><button class="x" data-close aria-label="Fechar">✕</button></div>
    <div class="modal-b">
      <div class="kv"><div><small>Dias disponíveis</small><b>${disp}</b></div><div><small>Dias indisponíveis</small><b>${ind}</b></div><div><small>Sem lançamento</small><b>${vaz}</b></div>
        <div><small>Faturado no mês</small><b class="mono">${fR(fat)}</b></div><div><small>Esperado até dia ${ate}</small><b class="mono">${fR(esp)}</b></div><div><small>Ritmo</small><b>${fP(esp?fat/esp:null)}</b></div></div>
      ${mot?`<div class="sub">Por que parou: ${esc(mot)}.</div>`:''}
      <div class="fld"><span>O mês na linha do tempo (clique numa barra para ver os dias)</span><div class="tl-trilha ficha" data-tr="${esc(placa)}">${barrasHTML(placa, Array.from({length:n},(_,i)=>diaDoMes(S.mes,i+1)), hojeISO(), n)}</div>
        <div class="tl-regua" style="--n:${n}">${Array.from({length:n},(_,i)=>`<span>${(i+1)===1||(i+1)%5===0?i+1:''}</span>`).join('')}</div></div>
      <div class="fc-sec"><h4><span class="tl-ico mini k-rodando">${ICO.frota}</span> Cadastro do conjunto</h4><div class="kv">
        <div><small>Cavalo</small><b class="mono">${esc(v.placa)}</b></div><div><small>Carretas</small><b class="mono">${esc([v.carreta1,v.carreta2].filter(Boolean).join(' + ')||'–')}</b></div>
        <div><small>Motorista</small><b>${esc(v.motorista||'sem motorista na planilha')}</b></div><div><small>Tipo · capacidade</small><b>${esc([v.tipo, v.m3?fN(v.m3)+' m³':''].filter(Boolean).join(' · ')||'–')}</b></div>
        <div><small>Vínculo</small><b>${esc(v.vinculo||'–')}</b></div><div><small>Programador</small><b>${esc(v.programador||'–')}</b></div>
        <div><small>Grid</small><b>${esc((S.grids[v.grid]||{}).nome||v.grid||'–')}</b></div><div><small>Meta base do mês</small><b class="mono">${fR(meta)}</b></div></div></div>
      ${opHTML(v)}
      ${S.just[placa]?`<div class="sg-resp"><b>Justificativa do mês:</b> ${esc(S.just[placa].texto)}</div>`:''}
      ${v.obs?`<div class="sub">Observação fixa da planilha: ${esc(v.obs)}</div>`:''}
    </div>
    <div class="modal-f"><button class="btn" type="button" data-close>Fechar</button></div>`, bg=>{
    $$('[data-trecho]', bg).forEach(b=> b.addEventListener('click', ()=>{ const [p,i,f] = b.dataset.trecho.split('|'); fecharModal(); modalTrecho(p, +i, +f); }));
    const vo = $('#fc-op', bg); if(vo) vo.addEventListener('click', ()=>{ fecharModal(); S.f.op = v.operacao; S.f.res = null; irPara('quadro'); });
  });
}
// a operação do conjunto (cliente/contrato): quantos conjuntos tem, como está hoje e no mês
function opHTML(v){
  if(!v.operacao) return '';
  const n = diasDoMes(S.mes), hoje = hojeISO(), ds = Array.from({length:n},(_,i)=>diaDoMes(S.mes,i+1)).filter(d=> d<=hoje);
  const d0 = S.qdDia && S.qdDia.slice(0,7)===S.mes ? S.qdDia : ds[ds.length-1];   // o dia do resumo do Quadro (último dia já lançado)
  const cs = S.veic.filter(x=> x.operacao===v.operacao);
  let a = 0, b = 0; cs.forEach(x=> ds.forEach(d=>{ const s = stDe(x.placa,d); if(s){ b++; if(s.disponivel) a++; } }));
  const dispHoje = d0 ? cs.filter(x=> (stDe(x.placa,d0)||{}).disponivel).length : 0, fat = cs.reduce((t,x)=> t + (S.fat[x.placa]||0), 0);
  const grids = [...new Set(cs.map(x=> (S.grids[x.grid]||{}).nome || x.grid))].join(', '), progs = [...new Set(cs.map(x=> x.programador).filter(Boolean))].join(', ');
  return `<div class="fc-sec"><h4><span class="tl-ico mini k-parado">${ICO.disp}</span> Operação ${esc(v.operacao)}</h4><div class="kv">
    <div><small>Conjuntos na operação</small><b>${cs.length}</b></div><div><small>Disponíveis ${d0===hoje?'hoje':'em '+esc(dm(d0||hoje))}</small><b>${dispHoje} de ${cs.length}</b></div>
    <div><small>Disponibilidade no mês</small><b>${fP(b?a/b:null)}</b></div><div><small>Faturado no mês</small><b class="mono">${fRk(fat)}</b></div>
    <div><small>Grids</small><b>${esc(grids||'–')}</b></div><div><small>Programadores</small><b>${esc(progs||'–')}</b></div></div>
    <button class="btn sm" type="button" id="fc-op" style="margin-top:8px">Ver os ${cs.length} conjuntos da operação na linha do tempo →</button></div>`;
}

/* ---------- APRESENTAÇÃO ---------- */
function renderApresentacao(){
  lsSet('frt_apresentacao:'+S.email, '1');
  const v = $('#view-apresentacao'), nv = S.veic.length, ng = Object.keys(S.grids).length;
  v.innerHTML = `<div class="sb">
    <div class="sb-hero"><div class="eti">${esc(NOME)}</div>
      <h2>Saber, em um minuto, quantos conjuntos estão rodando hoje e quanto isso vai faturar no mês.</h2>
      <p>A torre lê a planilha de disponibilidade e o relatório de faturamento, junta os dois numa tela só e cria o lugar onde o programador lança o dia com um clique, do computador ou do celular.</p>
      <p class="efeito">Menos planilha, mais caminhão rodando.</p>
      <div class="acts" style="margin-top:6px"><button class="btn gold" type="button" data-ir="painel">Ver o Painel →</button><button class="btn" type="button" data-ir="hoje">Tela Hoje</button><button class="btn" type="button" id="sb-tour">Ver o passo a passo</button></div></div>

    <div class="sb-sec"><h3>Como a torre foi montada aqui</h3><div class="sb-cards">
      <div class="card sb-card"><div class="verbo">Lê</div><ul><li>A planilha "OUTUBRO - DISPONIBILIDADE" (11 abas): ${fN(nv)} conjuntos, ${ng} grids, 4 programadores, um status por dia.</li><li>O relatório de faturamento por CT-e que sai do sistema da transportadora (${fN(S.fatLinhas)} CT-e de outubro). O gestor importa o arquivo do jeito que ele vem, sem colar em aba nenhuma.</li><li>As metas por veículo de cada grid, da aba Gestão Frota, e as justificativas do Dashboard.</li></ul></div>
      <div class="card sb-card"><div class="verbo">Junta</div><ul><li>Disponibilidade, faturamento e meta na mesma régua: cada placa mostra os dias parados e o quanto deixou de faturar.</li><li>As abas Resumo, Gestão Frota e Dashboard viram contas automáticas, com uma regra só.</li><li>Placas escritas de jeitos diferentes (".DTP5A91", "CTP-9F88") passam a ser uma placa só, sem a aba "Faturamento consolidado".</li><li>A justificativa de quem não bateu a meta já vem sugerida pelos dias lançados ("8 dias de manutenção corretiva, 5 de folga").</li></ul></div>
      <div class="card sb-card"><div class="verbo">Cria</div><ul><li>A tela Hoje: o programador vê só os caminhões dele e muda o status com um clique.</li><li>O aviso de conjunto sem lançamento e de manutenção que já passou de 3 dias.</li><li>O histórico de quem mudou o quê e quando, que a planilha não guarda.</li></ul></div>
    </div></div>

    <div class="sb-sec"><h3>O que a planilha escondia (e a torre corrige)</h3><div class="sb-erros">
      <div class="card"><b>1.076</b><span>CT-e com a data de emissão perdida ("########"): o faturamento só dá para ver no mês, não no dia.</span></div>
      <div class="card"><b>200</b><span>linhas com o ano 2025 num controle de outubro de 2026.</span></div>
      <div class="card"><b>49</b><span>conjuntos sem motorista na planilha (#N/A).</span></div>
      <div class="card"><b>40</b><span>vezes em que um status foi digitado no campo de observação, e por isso não entrou na conta.</span></div>
      <div class="card"><b>3</b><span>placas com ponto ou espaço que não batiam com o faturamento.</span></div>
      <div class="card"><b>#REF!</b><span>nas abas Programação e Noruega: fórmula quebrada que ninguém vê.</span></div>
      <div class="card"><b>2</b><span>dias (21 e 25) sem coluna de observação.</span></div>
      <div class="card"><b>"Luiz"</b><span>e "LUIZ" contados como programadores diferentes.</span></div>
    </div></div>

    <div class="sb-sec"><h3>O que a torre entrega</h3><div class="sb-cards">
      <div class="card sb-card"><div class="verbo" style="font-size:16px">Painel</div><ul><li>O antigo Dashboard em gráficos: disponibilidade dia a dia e como a frota passou cada dia.</li><li>Faturamento × meta por grid e as placas onde o faturamento mais falta.</li><li>Clique num gráfico e veja os conjuntos por trás do número.</li></ul></div>
      <div class="card sb-card"><div class="verbo" style="font-size:16px">Disponibilidade do dia</div><ul><li>Quantos estão rodando, parados, em manutenção ou sem motorista.</li><li>Quem ainda não foi lançado hoje.</li><li>Há quantos dias cada conjunto está no mesmo status.</li></ul></div>
      <div class="card sb-card"><div class="verbo" style="font-size:16px">Quadro do mês</div><ul><li>A linha do tempo de cada conjunto: os dias seguidos no mesmo status viram uma barra só ("Manutenção corretiva · 12d").</li><li>O resumo por dia (o antigo Resumo) com clique para ver quem é.</li><li>Filtro por programador, grid e operação.</li></ul></div>
      <div class="card sb-card"><div class="verbo" style="font-size:16px">Faturamento × meta</div><ul><li>Meta, esperado no ritmo, faturado e gap por grid.</li><li>As placas críticas primeiro, com o motivo dos dias parados.</li><li>A justificativa de cada placa fora do ritmo, escrita uma vez e guardada.</li><li>A mesma conta do antigo Dashboard, sem fórmula para quebrar.</li></ul></div>
    </div></div>

    <div class="sb-sec"><h3>Como funciona</h3><div class="sb-fluxo">
      <div class="card"><b>1 · Origem</b><span class="sub">O programador lança o status do dia na tela Hoje. O faturamento vem do relatório de CT-e do sistema da transportadora (hoje carregado à mão; a leitura automática está em construção).</span></div>
      <div class="card"><b>2 · Organiza</b><span class="sub">Uma regra só no banco: rodando ou parado com cota conta como disponível; manutenção, motorista e SSMA contam como indisponível.</span></div>
      <div class="card"><b>3 · Mostra</b><span class="sub">Hoje, Quadro do mês e Faturamento × meta, com os mesmos números para todo mundo.</span></div>
      <div class="card"><b>4 · Age</b><span class="sub">Quem está sem lançamento, quem está parado há dias e quem está longe da meta aparecem primeiro.</span></div>
    </div></div>

    <div class="sb-sec"><h3>O que estamos construindo primeiro</h3><div class="sb-pri">
      <div class="card"><span>1</span><b>Disponibilidade diária no sistema</b><span class="tag green">tela pronta</span><span class="sub">Hoje e Quadro do mês, com histórico.</span></div>
      <div class="card"><span>2</span><b>Faturamento × meta por grid e por placa</b><span class="tag green">tela pronta</span><span class="sub">Com o relatório de outubro.</span></div>
      <div class="card"><span>3</span><b>Importar o relatório de faturamento do jeito que ele sai</b><span class="tag green">tela pronta</span><span class="sub">Botão em Faturamento × meta, só para o gestor.</span></div>
      <div class="card"><span>4</span><b>Ler o relatório de faturamento sozinho, todo dia</b><span class="tag amber">próximo passo</span><span class="sub">Precisa do acesso ao relatório no sistema.</span></div>
      <div class="card"><span>5</span><b>Programação de viagens (origem, destino, agendamento)</b><span class="tag">depois</span><span class="sub">As abas Programação e Noruega.</span></div>
    </div></div>

    <div class="sb-sec"><h3>Como a gente usa</h3><div class="sb-cards">
      <div class="card sb-card"><b>Todo dia</b><p>Cada programador abre a tela Hoje, confere os seus caminhões e muda o que mudou. Leva poucos minutos.</p></div>
      <div class="card sb-card"><b>Toda semana</b><p>O gerente de operações abre o Quadro e o Faturamento × meta na reunião: quem parou, por quê, e o que fazer.</p></div>
      <div class="card sb-card"><b>No caminho</b><p>A Capacity Case acompanha o uso, ouve o balão 💬 e ajusta o sistema.</p></div>
    </div></div>

    <div class="sb-sec"><h3>Princípios</h3><div class="sb-cards">
      <div class="card sb-card"><b>Não é bala de prata</b><p>A operação já sabe programar a frota. A torre só faz a informação girar mais rápido.</p></div>
      <div class="card sb-card"><b>Um dado, uma fonte</b><p>O que existe no sistema da transportadora vem de lá. O que não existe, como o status do dia, é lançado uma vez, aqui.</p></div>
      <div class="card sb-card"><b>Poucos números que importam</b><p>Para o programador, quem está sem lançamento e quem está parado. Para o gerente, disponibilidade e ritmo da meta.</p></div>
      <div class="card sb-card"><b>Cada um vê o que precisa</b><p>Acesso por pessoa e por perfil.</p></div>
      <div class="card sb-card"><b>Os dados ficam na empresa</b><p>Ninguém fica refém de ninguém.</p></div>
    </div></div>

    <div class="sb-sec"><h3>Quem acessa</h3><div class="sb-cards">
      <div class="card sb-card"><b>Gestor</b><p>Vê tudo, inclui pessoas na Equipe e responde as sugestões.</p></div>
      <div class="card sb-card"><b>Programador</b><p>Lança e corrige o status dos conjuntos. Abre já filtrado nos seus caminhões.</p></div>
      <div class="card sb-card"><b>Leitura</b><p>Consulta as telas, sem mudar nada.</p></div>
    </div><p class="sub" style="margin:0">A entrada é por convite: o gestor inclui o e-mail na Equipe e a pessoa cria a própria senha em "Primeiro acesso", em até 48 horas.</p></div>

    <div class="card sb-metodo"><b>Sobre o método.</b> A Torre de Controle é o método da Capacity Case, de Luiz Amo: juntar, ler e criar os sistemas da empresa numa torre só, para o dono decidir com número, não com sensação. <a href="https://capacitycase.com.br" target="_blank" rel="noopener noreferrer">capacitycase.com.br</a></div>
    <div class="acts"><button class="btn" type="button" id="sb-sug">💬 Dar uma sugestão</button></div>
    <div class="sb-rodape"><span>Uso interno e confidencial. Dados tratados conforme a LGPD: o sistema não guarda CPF de motorista.</span><span>Método Torre de Controle · Capacity Case</span></div>
  </div>`;
  $$('[data-ir]', v).forEach(b=> b.addEventListener('click', ()=> irPara(b.dataset.ir)));
  $('#sb-sug', v).addEventListener('click', ()=> window.FR_abrirBalao && window.FR_abrirBalao());
  $('#sb-tour', v).addEventListener('click', ()=> tourAbrir('apresentacao'));
}

/* ---------- HOJE ---------- */
function renderHoje(){
  const v = $('#view-hoje'), dia = S.dia, F = S.f;
  const base = filtrados(dia), semChip = (()=>{ const c = F.chip; F.chip = ''; const r = filtrados(dia); F.chip = c; return r; })();
  const cont = k => k==='disp' ? semChip.filter(x=> (stDe(x.placa,dia)||{}).disponivel).length : semChip.filter(x=> grupoDe(x.placa,dia)===k).length;
  const futuro = dia > hojeISO();
  const nDisp = cont('disp');
  // ordem: o que precisa de ação primeiro (sem lançamento, manutenção longa, motorista), depois o resto
  const peso = x => { const g = grupoDe(x.placa, dia), n = diasNoStatus(x.placa, dia); return g==='vazio' ? 0 : (g==='manut'||g==='motorista'||g==='ssma') ? 1000 - n : g==='parado' ? 2000 - n : 3000; };
  const lista = base.slice().sort((a,b)=> peso(a)-peso(b) || a.placa.localeCompare(b.placa));
  const vazios = semChip.filter(x=> grupoDe(x.placa,dia)==='vazio');
  const comOntem = vazios.filter(x=> reg(x.placa, somaDias(dia,-1)) && reg(x.placa, somaDias(dia,-1)).status);
  v.innerHTML = `<div class="head"><div><h2>${esc(fDia(dia))}</h2><p>${F.prog?`Caminhões de ${esc(F.prog.charAt(0)+F.prog.slice(1).toLowerCase())}. `:''}${fN(semChip.length)} conjuntos · ${fP(semChip.length?nDisp/semChip.length:0)} disponíveis${futuro?' · dia futuro: dá para deixar marcado o que já se sabe (férias, manutenção).':''}</p></div>
      <div class="acts">${comOntem.length && podeEscrever() ? `<button class="btn pri" type="button" id="h-repetir" title="Copia o status de ontem nos conjuntos que ainda não foram lançados hoje">Repetir ontem nos ${comOntem.length} sem lançamento</button>` : ''}</div></div>
    ${barraFiltros(true)}
    <div class="chips">
      <button class="chip k-green" type="button" data-chip="disp" aria-pressed="${F.chip==='disp'}" title="Rodando ou parado com cota: pode carregar"><b>${nDisp}</b><span>Disponíveis</span><small>de ${semChip.length} conjuntos</small></button>
      ${GRUPOS.map(g=>`<button class="chip k-${g.cor}" type="button" data-chip="${g.k}" aria-pressed="${F.chip===g.k}" title="${esc(g.desc)}"><b>${cont(g.k)}</b><span>${esc(g.nome)}</span><small>${esc(g.curto)}</small></button>`).join('')}
    </div>
    ${F.chip?`<div class="filtros-ativos"><button type="button" id="h-xchip">${esc(F.chip==='disp'?'Disponíveis':GRUPOS.find(g=>g.k===F.chip).nome)} ✕</button></div>`:''}
    <div class="lista" id="h-lista">${lista.length ? lista.slice(0, 300).map(x=> linhaHoje(x, dia)).join('') : '<div class="card empty">Nenhum conjunto com esses filtros.</div>'}</div>`;
  ligarFiltros(v, renderHoje);
  $$('[data-chip]', v).forEach(b=> b.addEventListener('click', ()=>{ F.chip = F.chip===b.dataset.chip ? '' : b.dataset.chip; renderHoje(); }));
  const xc = $('#h-xchip', v); if(xc) xc.addEventListener('click', ()=>{ F.chip = ''; renderHoje(); });
  $$('[data-st-placa]', v).forEach(b=> b.addEventListener('click', ()=> modalStatus(b.dataset.stPlaca, dia, renderHoje)));
  $$('[data-ficha]', v).forEach(b=> b.addEventListener('click', ()=> abrirFicha(b.dataset.ficha)));
  $$('[data-rep]', v).forEach(b=> b.addEventListener('click', async ()=>{ const o = reg(b.dataset.rep, somaDias(dia,-1)); if(o && await salvarDia(b.dataset.rep, dia, o.status, o.obs)){ toast('Repetido: '+b.dataset.rep); renderHoje(); } }));
  const rp = $('#h-repetir', v); if(rp) rp.addEventListener('click', async ()=>{
    if(!rp.dataset.ok){ rp.dataset.ok = '1'; rp.textContent = 'Confirmar: copiar ontem em '+comOntem.length+'?'; return; }
    rp.disabled = true; const linhas = comOntem.map(x=>{ const o = reg(x.placa, somaDias(dia,-1)); return { placa:x.placa, dia, status:o.status, obs:o.obs||null }; });
    const { data, error } = await sb.from('frt_dias').upsert(linhas, { onConflict:'placa,dia' }).select('placa,dia,status,obs,atualizado_em,atualizado_por');
    if(error){ toast('Não salvou: '+error.message); rp.disabled = false; return; }
    (data||[]).forEach(r=> S.dias.set(r.placa+'|'+r.dia, r)); toast(linhas.length+' conjuntos com o status de ontem. Confira os que mudaram.'); renderHoje();
  });
}
function linhaHoje(x, dia){
  const r = reg(x.placa, dia) || {}, st = r.status ? S.status[r.status] : null, o = reg(x.placa, somaDias(dia,-1)), ost = o && o.status ? S.status[o.status] : null;
  const n = diasNoStatus(x.placa, dia), g = st ? GRUPO_DE[st.grupo] : 'vazio';
  let sinal = '';
  if(!st) sinal = dia <= hojeISO() ? '<span class="sinal amber">⚠ sem lançamento</span>' : '';
  else if((g==='manut' && n>3) || (g==='motorista' && r.status==='I|SEM MOTORISTA')) sinal = `<span class="sinal red">● ${n} dias ${g==='manut'?'em manutenção':'sem motorista'}</span>`;
  else if(n>1) sinal = `<span class="sub">há ${n} dias${n>=60?'+':''}</span>`;
  return `<div class="card cj">
    <div><button type="button" class="pl" data-ficha="${esc(x.placa)}" style="border:0;background:none;padding:0;cursor:pointer;color:inherit" title="Abrir a ficha do conjunto">${esc(x.placa)}</button> <span class="tag">${esc((S.grids[x.grid]||{}).nome||x.grid||'')}</span>
      <div class="linha2">${esc(x.motorista||'sem motorista na planilha')}</div><div class="linha2">${esc([x.carreta1,x.carreta2].filter(Boolean).join(' + '))} · ${esc(x.operacao||'')}${S.f.prog?'':' · '+esc(x.programador||'')}</div></div>
    <div class="col-ontem ontem">Ontem: ${ost?`<b>${esc(ost.nome)}</b>`:'<span class="muted">sem lançamento</span>'}${o&&o.obs?`<div class="sub" title="${esc(o.obs)}">${esc(o.obs.length>60?o.obs.slice(0,60)+'…':o.obs)}</div>`:''}</div>
    <div><button type="button" class="st-btn ${st?'':'vazio'}" data-st-placa="${esc(x.placa)}" title="Mudar o status de ${esc(fDia(dia))}"><span class="dot" style="${st?'background:'+esc(st.cor):''}"></span><span>${st?esc(st.nome):'Lançar o status do dia'}${r.obs?`<div class="sub">${esc(r.obs.length>70?r.obs.slice(0,70)+'…':r.obs)}</div>`:''}</span></button>${sinal?`<div style="margin-top:3px">${sinal}</div>`:''}</div>
    <div>${!st && ost && podeEscrever() ? `<button class="btn sm" type="button" data-rep="${esc(x.placa)}" title="Copiar o status de ontem">↻ Igual a ontem</button>` : ''}</div>
  </div>`;
}

/* ---------- QUADRO DO MÊS: linha do tempo por conjunto (padrão Smart Escala) ---------- */
// Pedido do Luiz (28/10): no lugar dos quadradinhos, uma linha por conjunto com barras no mesmo eixo de dias.
// Dias seguidos no mesmo grupo (rodando, parado, manutenção, motorista, SSMA, sem lançamento) viram uma barra só,
// com o nome e quantos dias durou. Em cima, o resumo do dia (o antigo Resumo da planilha) com ícones.
const ICO = {
  rodando:'<svg viewBox="0 0 24 24"><path d="M2 7h11v9H2zM13 10h4l3 3v3h-7"/><circle cx="6" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/></svg>',
  parado:'<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M10 17V7h3a3 3 0 0 1 0 6h-3"/></svg>',
  manut:'<svg viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8 6.2 21l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/></svg>',
  motorista:'<svg viewBox="0 0 24 24"><circle cx="12" cy="7.5" r="3.5"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>',
  ssma:'<svg viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  vazio:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6M12 17h.01"/></svg>',
  disp:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.6 2.6L16 9.5"/></svg>',
  frota:'<svg viewBox="0 0 24 24"><path d="M1 6h12v10H1zM13 9h5l4 4v3h-9"/><circle cx="5" cy="17.5" r="2"/><circle cx="17" cy="17.5" r="2"/></svg>' };
const ORDEM_G = ['rodando','parado','manut','motorista','ssma','vazio'];
const nomeG = g => g==='vazio' ? 'Sem lançamento' : (GRUPOS.find(x=>x.k===g)||{}).nome || g;
// trechos de um conjunto no mês: [{g, ini, fim, dias:[iso]}] com índices 0..n-1; dia futuro fica fora
function trechos(placa, dias, hoje){
  const out = []; let cur = null;
  dias.forEach((d,i)=>{
    if(d > hoje){ cur = null; return; }
    const g = grupoDe(placa, d);
    if(cur && cur.g===g){ cur.fim = i; cur.dias.push(d); } else { cur = { g, ini:i, fim:i, dias:[d] }; out.push(cur); }
  });
  return out;
}
// nome que vai na barra: rodando é "Rodando"; nos outros, o status que mais apareceu no trecho
function nomeTrecho(placa, t){
  if(t.g==='rodando' || t.g==='vazio') return nomeG(t.g);
  const c = {}; t.dias.forEach(d=>{ const s = stDe(placa,d); if(s) c[s.nome] = (c[s.nome]||0)+1; });
  return Object.entries(c).sort((a,b)=>b[1]-a[1])[0]?.[0] || nomeG(t.g);
}
const dm = s => s.slice(8)+'/'+s.slice(5,7);
function barrasHTML(placa, dias, hoje, n){
  return trechos(placa, dias, hoje).map(t=>{
    const len = t.fim - t.ini + 1, nome = nomeTrecho(placa, t);
    const ult = reg(placa, t.dias[t.dias.length-1]), obs = ult && ult.obs ? ' · '+ult.obs : '';
    const tip = `${nome} · ${len} ${len>1?'dias':'dia'} (${dm(t.dias[0])}${len>1?' a '+dm(t.dias[len-1]):''})${obs}`;
    return `<button type="button" class="tl-bar g-${t.g}" style="left:${t.ini/n*100}%;width:${len/n*100}%" data-trecho="${esc(placa)}|${t.ini}|${t.fim}" title="${esc(tip)}">${len>=2?`<i>${ICO[t.g]}</i>`:''}<span>${esc(len>=3 ? nome+' · '+len+'d' : len===2 ? len+'d' : '')}</span></button>`;
  }).join('');
}
function renderQuadro(){
  const v = $('#view-quadro'), F = S.f, n = diasDoMes(S.mes), hoje = hojeISO();
  const dias = Array.from({length:n}, (_,i)=> diaDoMes(S.mes, i+1));
  const semRes = (()=>{ const r = F.res, c = F.chip; F.res = null; F.chip = ''; const l = filtrados(hoje); F.res = r; F.chip = c; return l; })();
  // dia do resumo: o escolhido no cabeçalho; senão o último dia já lançado (de manhã, hoje ainda está em branco
  // e mostraria "0% disponível"; mesma regra do Painel: dia com mais da metade sem lançamento está em aberto)
  const passados = dias.filter(d=> d<=hoje);
  const fechado = d => semRes.filter(x=> grupoDe(x.placa,d)==='vazio').length <= semRes.length/2;
  const ultimoDia = passados.slice().reverse().find(fechado) || passados[passados.length-1] || dias[0];
  if(!S.qdDia || S.qdDia.slice(0,7)!==S.mes || S.qdDia>hoje) S.qdDia = ultimoDia;
  const lista0 = (()=>{ const c = F.chip; F.chip = ''; const l = filtrados(hoje); F.chip = c; return l; })();
  const conta = (k, d) => k==='disp' ? semRes.filter(x=> (stDe(x.placa,d)||{}).disponivel).length : semRes.filter(x=> grupoDe(x.placa,d)===k).length;
  const pctMes = x => { let a = 0, b = 0; dias.forEach(d=>{ if(d>hoje) return; const s = stDe(x.placa,d); if(s){ b++; if(s.disponivel) a++; } }); return b ? a/b : null; };
  const ord = lsGet('frt_qd_ord', 'parado');
  const pm = new Map(lista0.map(x=> [x.placa, pctMes(x)]));
  const lista = lista0.slice().sort((a,b)=> ord==='placa' ? a.placa.localeCompare(b.placa)
    : ord==='grid' ? String(a.grid).localeCompare(String(b.grid)) || a.placa.localeCompare(b.placa)
    : ord==='prog' ? String(a.programador).localeCompare(String(b.programador)) || a.placa.localeCompare(b.placa)
    : ((pm.get(a.placa)??2) - (pm.get(b.placa)??2)) || a.placa.localeCompare(b.placa));
  const d0 = S.qdDia, N0 = semRes.length, disp0 = conta('disp', d0);
  const corP = p => p==null ? 'var(--ink-3)' : p<.6 ? 'var(--red)' : p<.8 ? 'var(--amber)' : 'var(--green)';
  const mesNome = new Date(S.mes+'-15T12:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const cab = dias.map(d=>`<button type="button" class="tl-d ${ehFolgaCal(d)?'fds':''} ${d===hoje?'hoje':''} ${d===d0?'sel':''}" data-qd="${d}" ${d>hoje?'disabled':''} title="${esc(fDia(d))}: ver o resumo deste dia"><b>${+d.slice(8)}</b><small>${SEM[dow(d)].slice(0,1)}</small></button>`).join('');
  const fundo = dias.map(d=>`<i class="${ehFolgaCal(d)?'fds':''} ${d===hoje?'hoje':''} ${d===d0?'sel':''}"></i>`).join('');
  const linhasRes = [{ k:'disp' }].concat(ORDEM_G.map(k=>({ k })));
  v.innerHTML = `<div class="head"><div><span class="eyebrow">Linha do tempo · ${esc(mesNome)}</span><h2>Como cada conjunto passou o mês</h2><p>Cada linha é um conjunto e cada barra, um trecho de dias no mesmo status. Clique na placa para abrir o cadastro, numa barra para ver os dias daquele trecho.</p></div>
      <div class="acts"><label class="sub" for="q-ord">Ordem</label><select id="q-ord" class="btn" aria-label="Ordem das linhas"><option value="parado" ${ord==='parado'?'selected':''}>Mais parados primeiro</option><option value="placa" ${ord==='placa'?'selected':''}>Placa</option><option value="grid" ${ord==='grid'?'selected':''}>Grid</option><option value="prog" ${ord==='prog'?'selected':''}>Programador</option></select></div></div>
    ${barraFiltros(false)}
    <section class="card tl-resumo" aria-label="Resumo do dia">
      <div class="tl-rh"><span class="tl-ico frota">${ICO.frota}</span><div><b>${esc(d0===hoje?'Hoje, '+fDia(d0):fDia(d0))}</b><span class="sub">${fN(N0)} conjuntos${F.prog||F.grid||F.op||F.busca?' no filtro':' na frota'} · clique num dia do eixo para ver outro dia</span></div>
        <div class="tl-medidor" title="${disp0} de ${N0} disponíveis"><i style="width:${N0?disp0/N0*100:0}%"></i></div><b class="tl-pct" style="color:${corP(N0?disp0/N0:null)}">${fP(N0?disp0/N0:null)} disponível</b></div>
      <div class="tl-cards">
        <button type="button" class="tl-card k-disp ${F.res&&F.res.g==='disp'&&F.res.dia===d0?'on':''}" data-res="disp|${d0}"><span class="tl-ico">${ICO.disp}</span><b>${disp0}</b><span>Disponíveis</span><small>podem carregar</small></button>
        ${ORDEM_G.map(k=>{ const c = conta(k, d0); return `<button type="button" class="tl-card k-${k} ${c?'':'zero'} ${F.res&&F.res.g===k&&F.res.dia===d0?'on':''}" data-res="${k}|${d0}" title="${esc(k==='vazio'?'Ninguém informou o status deste conjunto neste dia':(GRUPOS.find(x=>x.k===k)||{}).desc||'')}"><span class="tl-ico">${ICO[k]}</span><b>${c}</b><span>${esc(nomeG(k))}</span><small>${esc(k==='vazio'?'ninguém informou':(GRUPOS.find(x=>x.k===k)||{}).curto||'')}</small></button>`; }).join('')}
      </div>
    </section>
    ${F.res?`<div class="filtros-ativos"><button type="button" id="q-xres">${esc(F.res.g==='disp'?'Disponíveis':nomeG(F.res.g))} em ${esc(fDia(F.res.dia))} ✕</button></div>`:''}
    <div class="card tl" style="--n:${n}">
      <div class="tl-in">
        <div class="tl-cab"><div class="tl-esq tl-esq-cab"><b>${fN(lista.length)} conjuntos</b><span class="sub">% = dias disponíveis no mês</span></div><div class="tl-dias">${cab}</div></div>
        <div class="tl-res">${linhasRes.map(l=>`<div class="tl-rl"><div class="tl-esq"><span class="tl-ico mini k-${l.k}">${ICO[l.k]}</span>${esc(l.k==='disp'?'Disponíveis':nomeG(l.k))}</div><div class="tl-rc">${dias.map(d=>{ if(d>hoje) return '<span class="fut"></span>'; const c = conta(l.k,d), a = N0 ? Math.min(1, c/N0*(l.k==='disp'?1:4)) : 0;
          return `<button type="button" class="${F.res&&F.res.g===l.k&&F.res.dia===d?'sel':''}" data-res="${l.k}|${d}" style="--a:${a.toFixed(2)}" title="${esc(c+' · '+(l.k==='disp'?'disponíveis':nomeG(l.k).toLowerCase())+' · '+fDia(d))}">${l.k==='disp' ? (N0?Math.round(c/N0*100):0) : (c||'')}</button>`; }).join('')}</div></div>`).join('')}</div>
        <div class="tl-corpo"><div class="tl-fundo" aria-hidden="true">${fundo}</div>
          ${lista.slice(0, 400).map(x=>{ const p = pm.get(x.placa), g = grupoDe(x.placa, d0);
            return `<div class="tl-row"><button type="button" class="tl-esq tl-quem" data-ficha="${esc(x.placa)}" title="Abrir o cadastro do conjunto">
              <span class="tl-ico mini k-${g}" title="${esc(nomeG(g))} em ${esc(dm(d0))}">${ICO[g]}</span>
              <span class="tl-q"><span><b class="mono">${esc(x.placa)}</b> <span class="tag">${esc((S.grids[x.grid]||{}).nome||x.grid||'')}</span></span><small>${esc(x.motorista||'sem motorista')}</small></span>
              <b class="tl-p" style="color:${corP(p)}">${fP(p)}</b></button>
              <div class="tl-trilha" data-tr="${esc(x.placa)}">${barrasHTML(x.placa, dias, hoje, n)}</div></div>`; }).join('') || '<div class="empty">Nenhum conjunto com esses filtros.</div>'}
        </div>
      </div>
      ${lista.length>400?`<div class="sub" style="padding:8px 12px">Mostrando 400 de ${lista.length}. Use os filtros.</div>`:''}
      <div class="legenda">${ORDEM_G.map(k=>`<span><i class="tl-leg g-${k}"></i>${esc(nomeG(k))}</span>`).join('')}<span><i style="width:2px;height:12px;background:var(--red)"></i>hoje</span><span><i style="background:var(--panel-2);border:1px solid var(--line)"></i>fim de semana ou feriado</span></div>
    </div>`;
  ligarFiltros(v, renderQuadro);
  $('#q-ord', v).addEventListener('change', e=>{ lsSet('frt_qd_ord', e.target.value); renderQuadro(); });
  const xr = $('#q-xres', v); if(xr) xr.addEventListener('click', ()=>{ F.res = null; renderQuadro(); });
  $$('[data-res]', v).forEach(b=> b.addEventListener('click', ()=>{ const [g,d] = b.dataset.res.split('|'); F.res = (F.res && F.res.g===g && F.res.dia===d) ? null : { g, dia:d }; renderQuadro(); }));
  $$('.tl-d[data-qd]', v).forEach(b=> b.addEventListener('click', ()=>{ S.qdDia = b.dataset.qd; renderQuadro(); }));
  $$('[data-ficha]', v).forEach(b=> b.addEventListener('click', ()=> abrirFicha(b.dataset.ficha)));
  $$('[data-trecho]', v).forEach(b=> b.addEventListener('click', e=>{ e.stopPropagation(); const [p,i,f] = b.dataset.trecho.split('|'); modalTrecho(p, +i, +f); }));
  // clique no espaço vazio da linha (dia futuro): marca o que já se sabe (férias, manutenção programada)
  $$('.tl-trilha', v).forEach(t=> t.addEventListener('click', e=>{ if(e.target!==t) return; const r = t.getBoundingClientRect(), i = Math.floor((e.clientX - r.left)/r.width*n); if(i>=0 && i<n) modalStatus(t.dataset.tr, dias[i], renderQuadro); }));
  // rola até perto de hoje
  const tl = $('.tl', v), th = $('.tl-d.hoje', v); if(tl && th && tl.scrollWidth > tl.clientWidth) tl.scrollLeft = Math.max(0, th.offsetLeft - tl.clientWidth*0.6);
}
// os dias de um trecho, com o status e a observação de cada um
function modalTrecho(placa, i0, i1){
  const v = S.veic.find(x=>x.placa===placa); if(!v) return;
  const dias = Array.from({length:i1-i0+1}, (_,k)=> diaDoMes(S.mes, i0+k+1)), g = grupoDe(placa, dias[0]);
  const t = { g, dias }, nome = nomeTrecho(placa, t), len = dias.length;
  abrirModal(`<div class="modal-h"><div><h3><span class="tl-ico k-${g}" style="vertical-align:-6px">${ICO[g]}</span> ${esc(nome)} · ${len} ${len>1?'dias':'dia'}</h3><div class="sub"><b class="mono">${esc(placa)}</b> · ${esc(v.motorista||'sem motorista')} · de ${esc(fDia(dias[0]))}${len>1?' a '+esc(fDia(dias[len-1])):''}</div></div><button class="x" data-close aria-label="Fechar">✕</button></div>
    <div class="modal-b"><div class="tr-dias">${dias.map(d=>{ const r = reg(placa,d), st = r && r.status ? S.status[r.status] : null;
      return `<button type="button" class="tr-dia" data-d="${d}" ${podeEscrever()?'':'disabled'} title="${podeEscrever()?'Mudar o status deste dia':''}"><span class="mono">${esc(dm(d))}</span><span class="dot" style="background:${st?esc(st.cor):'transparent'};${st?'':'border:1px dashed var(--amber)'}"></span><b>${esc(st?st.nome:'Sem lançamento')}</b>${r&&r.obs?`<span class="sub">${esc(r.obs)}</span>`:''}${r&&r.atualizado_por&&r.atualizado_por.includes('@')?`<span class="sub">lançado por ${esc(r.atualizado_por)}</span>`:''}</button>`; }).join('')}</div></div>
    <div class="modal-f"><button class="btn" type="button" data-close>Fechar</button><button class="btn pri" type="button" id="tr-ficha">Abrir o cadastro do conjunto</button></div>`, bg=>{
    $('#tr-ficha', bg).addEventListener('click', ()=>{ fecharModal(); abrirFicha(placa); });
    $$('[data-d]', bg).forEach(b=> b.addEventListener('click', ()=>{ fecharModal(); modalStatus(placa, b.dataset.d, ()=>{ if(S.view==='quadro') renderQuadro(); }); }));
  });
}

/* ---------- PAINEL (o antigo Dashboard, em gráficos; mesmos números das outras telas) ---------- */
// cores dos grupos nos gráficos: manutenção, motorista e SSMA precisam se distinguir (nas chips os três são vermelhos)
const COR_G = { rodando:'#1456b8', parado:'#8fb4e8', manut:'#a3261b', motorista:'#d9822b', ssma:'#6b3fa0', vazio:'#c5cbd4' };
function renderPainel(){
  const v = $('#view-painel'), n = diasDoMes(S.mes), hoje = hojeISO(), g = S.pnGrid || '';
  const veic = S.veic.filter(x=> !g || x.grid===g), N = veic.length;
  const ultimo = S.mes < hoje.slice(0,7) ? n : S.mes > hoje.slice(0,7) ? 0 : +hoje.slice(8);
  const dias = Array.from({length:ultimo}, (_,i)=> diaDoMes(S.mes, i+1));
  // um dia = quantos em cada grupo e quantos disponíveis (rodando + parado com cota), a regra do Quadro
  const porDia = dias.map(d=>{ const c = { rodando:0, parado:0, manut:0, motorista:0, ssma:0, vazio:0 }; let disp = 0;
    veic.forEach(x=>{ const s = stDe(x.placa, d); c[s ? GRUPO_DE[s.grupo] : 'vazio']++; if(s && s.disponivel) disp++; });
    return { d, c, disp, lanc: N - c.vazio, fechado: N && c.vazio <= N/2 }; });
  // dia com mais da metade sem lançamento ainda está em aberto (é o caso de hoje de manhã): fica fora da linha e da média,
  // senão a disponibilidade "despenca" só porque os programadores ainda não lançaram
  const pctDe = r => r.fechado ? r.disp / N : null;
  const comDado = porDia.filter(r=> r.fechado);
  const media = comDado.length ? comDado.reduce((a,r)=> a + r.disp/N, 0) / comDado.length : null;
  const hj = comDado[comDado.length-1], aberto = porDia.length && !porDia[porDia.length-1].fechado ? porDia[porDia.length-1] : null;
  // faturamento: as mesmas linhas da tela Faturamento × meta
  const todas = linhasFat(), fl = todas.filter(l=> !g || l.x.grid===g);
  const tot = fl.reduce((a,l)=>({ meta:a.meta+l.meta, esp:a.esp+l.esp, fat:a.fat+l.fat }), { meta:0, esp:0, fat:0 });
  const fatTot = tot.fat + (g ? 0 : S.fatFora), ritmo = tot.esp ? fatTot/tot.esp : null;
  const crit = fl.filter(l=> l.sit==='critico').length;
  const porGrid = Object.keys(S.grids).map(k=>{ const ls = todas.filter(l=>l.x.grid===k); const s = ls.reduce((a,l)=>({ meta:a.meta+l.meta, esp:a.esp+l.esp, fat:a.fat+l.fat }), { meta:0, esp:0, fat:0 }); return { k, n:ls.length, ...s, rit: s.esp ? s.fat/s.esp : null }; });
  const maxG = Math.max(1, ...porGrid.map(r=> Math.max(r.meta, r.fat)));
  const top = fl.filter(l=> l.gap > 0).sort((a,b)=> b.gap - a.gap).slice(0, 10), maxGap = Math.max(1, ...top.map(l=> l.gap));
  const corRit = r => r==null ? 'var(--ink-3)' : r < .5 ? 'var(--red)' : r < .85 ? 'var(--amber)' : 'var(--green)';
  const mesNome = new Date(S.mes+'-15T12:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const rot = d => { const k = +d.slice(8); return k===1 || k%5===0 || d===hoje; };
  // linha da disponibilidade: SVG esticado (o traço não engorda) e os rótulos em HTML, que não distorcem
  const pts = porDia.map((r,i)=>{ const p = pctDe(r); return p==null ? null : [ (i+.5)/n*100, 100 - p*100 ]; });
  const caminho = pts.reduce((s,p,i)=> p ? s + (s && pts[i-1] ? ' L' : (s?' M':'M')) + p[0].toFixed(2)+' '+p[1].toFixed(2) : s, '');
  v.innerHTML = `<div class="head"><div><span class="eyebrow">Painel · ${esc(mesNome)}</span><h2>A frota e o faturamento num olhar</h2><p>Os mesmos números do Quadro e do Faturamento × meta, em gráfico. Clique em qualquer barra para ver quem é.</p></div>
      <div class="acts"><select id="pn-grid" class="btn" aria-label="Grid"><option value="">Todos os grids</option>${Object.keys(S.grids).map(k=>`<option value="${esc(k)}" ${k===g?'selected':''}>${esc(S.grids[k].nome)}</option>`).join('')}</select>
        <select id="pn-mes" class="btn" aria-label="Mês">${(S.meses||[S.mes]).map(m=>`<option value="${m}" ${m===S.mes?'selected':''}>${new Date(m+'-15T12:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</option>`).join('')}</select></div></div>
    <div class="kpis pn-kpis">
      <button type="button" class="card kpi pn-k" data-pn="hoje"><small>Disponíveis ${hj && hj.d===hoje ? 'hoje' : hj ? 'em '+esc(fDia(hj.d)) : ''}</small><b>${hj ? fN(hj.disp) : '–'}</b><div class="sub">de ${fN(N)} conjuntos · ${fP(hj ? hj.disp/N : null)}${aberto ? ` · ${aberto.d===hoje?'hoje':esc(fDia(aberto.d))}: ${aberto.lanc} de ${N} lançados` : hj && hj.c.vazio ? ` · ${hj.c.vazio} sem lançamento` : ''}</div></button>
      <button type="button" class="card kpi pn-k" data-pn="quadro"><small>Disponibilidade média do mês</small><b>${fP(media)}</b><div class="sub">nos ${comDado.length} dias lançados</div></button>
      <button type="button" class="card kpi pn-k" data-pn="fat"><small>Ritmo do faturamento</small><b style="color:${corRit(ritmo)}">${fP(ritmo)}</b><div class="sub">${fRk(fatTot)} de ${fRk(tot.esp)} esperados até o dia ${refDia()}</div></button>
      <button type="button" class="card kpi pn-k" data-pn="fat"><small>Falta para a meta do mês</small><b>${fRk(Math.max(0, tot.meta - fatTot))}</b><div class="sub">meta ${fRk(tot.meta)} · ${fP(tot.meta ? fatTot/tot.meta : null)} feito</div></button>
      <button type="button" class="card kpi pn-k" data-pn="crit"><small>Placas críticas</small><b style="color:var(--red)">${fN(crit)}</b><div class="sub">abaixo de 50% do ritmo</div></button>
    </div>
    <div class="pn-grade">
      <section class="card pn-card pn-largo"><div class="pn-h"><h3>Disponibilidade dia a dia</h3><span class="sub">% dos ${fN(N)} conjuntos rodando ou parados com cota${media!=null?` · tracejado = média do mês (${fP(media)})`:''}${aberto?` · ${aberto.d===hoje?'hoje':esc(fDia(aberto.d))} ainda em lançamento, fora da conta`:''}</span></div>
        <div class="pn-linha">
          <div class="pn-eixo" aria-hidden="true"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
          <div class="pn-area">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Disponibilidade por dia em ${esc(mesNome)}">
              ${[25,50,75].map(y=>`<line x1="0" x2="100" y1="${y}" y2="${y}" class="pn-grid-l"/>`).join('')}
              ${media!=null?`<line x1="0" x2="100" y1="${(100-media*100).toFixed(2)}" y2="${(100-media*100).toFixed(2)}" class="pn-media"/>`:''}
              ${caminho?`<path d="${caminho} L${pts.filter(Boolean).slice(-1)[0][0].toFixed(2)} 100 L${pts.find(Boolean)[0].toFixed(2)} 100 Z" class="pn-fundo"/><path d="${caminho}" class="pn-traco"/>`:''}
            </svg>
            <div class="pn-pts">${porDia.map((r,i)=>{ const p = pctDe(r); return p==null ? '' : `<button type="button" class="pn-pt${p===Math.min(...comDado.map(pctDe))?' pior':''}" style="left:${(i+.5)/n*100}%;top:${100-p*100}%" data-res="disp|${r.d}" title="${esc(fDia(r.d))}: ${fP(p)} disponíveis (${r.disp} de ${N})${r.c.vazio?' · '+r.c.vazio+' sem lançamento':''}"><span>${p===Math.min(...comDado.map(pctDe))?fP(p):''}</span></button>`; }).join('')}</div>
          </div>
        </div>
        <div class="pn-dias" style="grid-template-columns:repeat(${n},1fr)">${Array.from({length:n},(_,i)=>{ const d = diaDoMes(S.mes,i+1); return `<span class="${d===hoje?'hoje':''}">${rot(d)?i+1:''}</span>`; }).join('')}</div>
      </section>

      <section class="card pn-card pn-largo"><div class="pn-h"><h3>Como a frota passou cada dia</h3><span class="sub">o antigo Resumo, em barras · clique num pedaço para ver os conjuntos no Quadro</span></div>
        <div class="pn-pilhas" style="grid-template-columns:repeat(${n},1fr)">${Array.from({length:n},(_,i)=>{ const r = porDia[i]; if(!r) return '<div class="pn-pilha fut"></div>';
          return `<div class="pn-pilha">${['rodando','parado','manut','motorista','ssma','vazio'].map(k=> r.c[k] ? `<button type="button" style="height:${r.c[k]/N*100}%;background:${COR_G[k]}" data-res="${k}|${r.d}" title="${esc(fDia(r.d))} · ${esc((GRUPOS.find(x=>x.k===k)||{}).nome)}: ${r.c[k]}"></button>` : '').join('')}</div>`; }).join('')}</div>
        <div class="pn-dias" style="grid-template-columns:repeat(${n},1fr)">${Array.from({length:n},(_,i)=>{ const d = diaDoMes(S.mes,i+1); return `<span class="${d===hoje?'hoje':''}">${rot(d)?i+1:''}</span>`; }).join('')}</div>
        <div class="legenda" style="padding:6px 0 0">${GRUPOS.map(x=>`<span><i style="background:${COR_G[x.k]}"></i>${esc(x.nome)}${hj?` <b class="mono">${hj.c[x.k]}</b>`:''}</span>`).join('')}<span class="sub">números = ${hj && hj.d===hoje ? 'hoje' : hj ? esc(fDia(hj.d)) : ''}</span></div>
      </section>

      <section class="card pn-card"><div class="pn-h"><h3>Faturamento × meta por grid</h3><span class="sub">barra = faturado · traço = esperado até o dia ${refDia()} · fundo = meta do mês</span></div>
        <div class="pn-grids">${porGrid.map(r=>`<button type="button" class="pn-gl${g===r.k?' on':''}" data-grid="${esc(r.k)}" title="Abrir ${esc(S.grids[r.k].nome)} no Faturamento × meta">
          <span class="pn-gn"><b>${esc(S.grids[r.k].nome)}</b><span class="sub">${r.n} veículos</span></span>
          <span class="pn-trilho" style="width:${r.meta/maxG*100}%"><i style="width:${r.meta?Math.min(100, r.fat/r.meta*100):0}%;background:${corRit(r.rit)}"></i><u style="left:${r.meta?Math.min(100, r.esp/r.meta*100):0}%"></u></span>
          <span class="pn-gv"><b style="color:${corRit(r.rit)}">${fP(r.rit)}</b><span class="sub">${fRk(r.fat)} de ${fRk(r.meta)}</span></span></button>`).join('')}</div>
      </section>

      <section class="card pn-card"><div class="pn-h"><h3>Onde o faturamento está faltando</h3><span class="sub">as ${top.length} placas mais longe do esperado${g?' em '+esc(S.grids[g].nome):''} · clique para abrir a placa</span></div>
        <div class="pn-top">${top.map(l=>`<button type="button" class="pn-tl" data-ficha="${esc(l.x.placa)}">
          <span class="pn-tn"><b class="mono">${esc(l.x.placa)}</b><span class="sub">${esc(l.motivo ? l.motivo[1]+' dias de '+l.motivo[0].toLowerCase() : (S.grids[l.x.grid]||{}).nome || '')}</span></span>
          <span class="pn-tb"><i style="width:${l.gap/maxGap*100}%"></i></span><b class="pn-tv">${fRk(l.gap)}</b></button>`).join('') || '<div class="empty">Nenhuma placa abaixo do esperado.</div>'}</div>
      </section>
    </div>
    <p class="sub" style="margin:0">Regra igual às outras telas: disponível = rodando ou parado com cota; esperado = meta do veículo × dias decorridos (até ontem) ÷ dias do mês; conjunto que entrou no meio do mês conta só a partir do primeiro lançamento. Os gráficos usam o filtro de grid acima; o de faturamento por grid mostra sempre os quatro.</p>`;
  $('#pn-grid', v).addEventListener('change', e=>{ S.pnGrid = e.target.value; renderPainel(); });
  $('#pn-mes', v).addEventListener('change', async e=>{ S.mes = e.target.value; lsSet('frt_mes', S.mes); await carregarMes(); renderPainel(); });
  // do gráfico ao caso: o pedaço clicado vira o filtro da tela de trabalho
  $$('[data-res]', v).forEach(b=> b.addEventListener('click', ()=>{ const [k,d] = b.dataset.res.split('|'); S.f.res = { g:k, dia:d }; S.f.grid = g; S.f.prog = ''; S.f.chip = ''; irPara('quadro'); }));
  $$('[data-grid]', v).forEach(b=> b.addEventListener('click', ()=>{ S.fatF.grid = b.dataset.grid; S.fatF.sit = ''; irPara('faturamento'); }));
  $$('[data-ficha]', v).forEach(b=> b.addEventListener('click', ()=> abrirFicha(b.dataset.ficha)));
  $$('[data-pn]', v).forEach(b=> b.addEventListener('click', ()=>{ const a = b.dataset.pn;
    if(a==='hoje'){ S.f.chip = 'disp'; S.f.grid = g; S.f.prog = ''; irPara('hoje'); }
    else if(a==='quadro'){ S.f.res = null; S.f.grid = g; irPara('quadro'); }
    else { S.fatF.grid = g; S.fatF.sit = a==='crit' ? 'critico' : ''; irPara('faturamento'); } }));
}

/* ---------- FATURAMENTO × META ---------- */
// dia de referência do ritmo: até ontem no mês corrente (o faturamento de hoje ainda não fechou); mês passado = mês todo
function refDia(){ const h = hojeISO(), n = diasDoMes(S.mes); if(S.mes < h.slice(0,7)) return n; if(S.mes > h.slice(0,7)) return 0; return Math.max(1, +h.slice(8) - 1); }
function linhasFat(){
  const n = diasDoMes(S.mes), ate = refDia(), hoje = hojeISO();
  return S.veic.map(x=>{
    // meta proporcional (pedido do Luiz, 28/10): conjunto que entrou na frota no meio do mês só tem meta dos dias
    // em que já estava aqui. A entrada é o primeiro dia com lançamento no mês; antes disso ele não existia na frota.
    const base = S.metas[S.mes+'|'+x.grid] || 0, fat = S.fat[x.placa] || 0;
    let ini = 0;
    for(let d=1; d<=n; d++){ if(reg(x.placa, diaDoMes(S.mes,d)) && reg(x.placa, diaDoMes(S.mes,d)).status){ ini = d; break; } }
    const desde = ini || 1, meta = base*(n-desde+1)/n, esp = base*Math.max(0, ate-desde+1)/n;
    let ind = 0; const mot = {};
    for(let d=1; d<=n; d++){ const s = diaDoMes(S.mes,d); if(s>hoje) break; const st = stDe(x.placa,s); if(st && !st.disponivel){ ind++; mot[st.nome] = (mot[st.nome]||0)+1; } }
    const ritmo = esp ? fat/esp : null;
    return { x, base, entrou: ini>1 ? ini : 0, meta, esp, fat, gap: esp - fat, ritmo, ind, motivo: Object.entries(mot).sort((a,b)=>b[1]-a[1])[0], sit: ritmo==null ? 'ok' : ritmo < .5 ? 'critico' : ritmo < .85 ? 'atencao' : 'ok' };
  });
}
function renderFaturamento(){
  const v = $('#view-faturamento'), n = diasDoMes(S.mes), ate = refDia(), FF = S.fatF;
  const todas = linhasFat();
  const tot = todas.reduce((a,l)=>({ meta:a.meta+l.meta, esp:a.esp+l.esp, fat:a.fat+l.fat }), { meta:0, esp:0, fat:0 });
  const metaMes = todas.reduce((a,l)=> a + l.meta, 0), fatTotal = tot.fat + S.fatFora;
  const metaCheia = todas.reduce((a,l)=> a + l.base, 0), novos = todas.filter(l=> l.entrou);
  const porGrid = Object.keys(S.grids).map(g=>{ const ls = todas.filter(l=>l.x.grid===g); const s = ls.reduce((a,l)=>({ meta:a.meta+l.meta, esp:a.esp+l.esp, fat:a.fat+l.fat }), { meta:0, esp:0, fat:0 }); return { g, n:ls.length, ...s }; });
  const lista = todas.filter(l=> (!FF.sit || l.sit===FF.sit) && (!FF.grid || l.x.grid===FF.grid)).sort((a,b)=> b.gap - a.gap);
  const cnt = k => todas.filter(l=> l.sit===k && (!FF.grid || l.x.grid===FF.grid)).length;
  const cls = r => r==null ? '' : r < .5 ? 'low' : r < .85 ? 'mid' : '';
  const SIT = { critico:['Crítico','red'], atencao:['Atenção','amber'], ok:['No ritmo','green'] };
  v.innerHTML = `<div class="head"><div><h2>Faturamento × meta · ${esc(new Date(S.mes+'-15T12:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'}))}</h2><p>Esperado = meta do veículo × ${ate} de ${n} dias do mês. Ritmo = faturado ÷ esperado.${novos.length?` Os ${novos.length} conjuntos que entraram na frota no meio do mês têm meta só dos dias em que já estavam aqui.`:''}</p></div>
      <div class="acts"><select id="ff-mes" class="btn" aria-label="Mês">${(S.meses||[S.mes]).map(m=>`<option value="${m}" ${m===S.mes?'selected':''}>${new Date(m+'-15T12:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}</option>`).join('')}</select>
        ${ehAdmin()?'<button class="btn pri" type="button" id="ff-imp" title="O relatório de faturamento por CT-e, do jeito que sai do sistema (Excel ou CSV)">⤒ Importar relatório de faturamento</button>':''}</div></div>
    <div class="kpis">
      <div class="card kpi"><small>Meta do mês${novos.length?' (proporcional)':''}</small><b>${fRk(metaMes)}</b><div class="sub">${novos.length?`meta cheia ${fRk(metaCheia)} · ${novos.length} conjuntos entraram no mês`:`${fN(S.veic.length)} veículos em ${Object.keys(S.grids).length} grids`}</div></div>
      <div class="card kpi"><small>Esperado até o dia ${ate}</small><b>${fRk(tot.esp)}</b><div class="sub">${fP(metaMes?tot.esp/metaMes:0)} da meta do mês</div></div>
      <div class="card kpi"><small>Faturado</small><b>${fRk(fatTotal)}</b><div class="sub">${fP(metaMes?fatTotal/metaMes:0)} da meta · ${fN(S.fatLinhas)} CT-e</div></div>
      <div class="card kpi"><small>Ritmo</small><b style="color:${tot.esp&&fatTotal/tot.esp<.85?'var(--red)':'var(--green)'}">${fP(tot.esp?fatTotal/tot.esp:null)}</b><div class="sub">do esperado até agora</div></div>
      <div class="card kpi"><small>Falta para o ritmo</small><b>${fRk(Math.max(0, tot.esp-fatTotal))}</b><div class="sub">Para fechar a meta: ${fRk(Math.max(0, metaMes-fatTotal))}</div></div>
    </div>
    <div class="card tbl-wrap"><table class="tb"><thead><tr><th>Grid</th><th class="n">Veículos</th><th class="n">Meta</th><th class="n">Esperado</th><th class="n">Faturado</th><th class="n">% da meta</th><th>Ritmo</th></tr></thead><tbody>
      ${porGrid.map(r=>{ const rit = r.esp ? r.fat/r.esp : null; return `<tr data-grid="${esc(r.g)}"><td><b>${esc(S.grids[r.g].nome)}</b></td><td class="n">${r.n}</td><td class="n">${fR(r.meta)}</td><td class="n">${fR(r.esp)}</td><td class="n">${fR(r.fat)}</td><td class="n">${fP(r.meta?r.fat/r.meta:null)}</td>
        <td><div style="display:flex;gap:8px;align-items:center"><div class="meter" style="width:140px"><i class="${cls(rit)}" style="width:${Math.min(100,(rit||0)*100)}%"></i></div><b class="mono">${fP(rit)}</b></div></td></tr>`; }).join('')}
    </tbody></table></div>
    <div class="chips">
      ${['critico','atencao','ok'].map(k=>`<button class="chip k-${SIT[k][1]}" type="button" data-sit="${k}" aria-pressed="${FF.sit===k}" title="${k==='critico'?'Menos da metade do esperado':k==='atencao'?'Entre 50% e 85% do esperado':'85% ou mais do esperado'}"><b>${cnt(k)}</b><span>${SIT[k][0]}</span><small>${k==='critico'?'abaixo de 50% do ritmo':k==='atencao'?'de 50% a 85%':'85% ou mais'}</small></button>`).join('')}
    </div>
    ${FF.grid||FF.sit?`<div class="filtros-ativos">${FF.grid?`<button type="button" data-x="grid">${esc(S.grids[FF.grid].nome)} ✕</button>`:''}${FF.sit?`<button type="button" data-x="sit">${esc(SIT[FF.sit][0])} ✕</button>`:''}</div>`:''}
    <div class="card tbl-wrap" style="max-height:70vh"><table class="tb"><thead><tr><th>Placa</th><th>Motorista</th><th>Grid</th><th class="n" title="Dias indisponíveis no mês até hoje">Dias parado</th><th>Motivo principal</th><th class="n">Faturado</th><th class="n">Esperado</th><th>Ritmo</th><th class="n">Falta</th><th>Situação</th><th title="Por que a placa não está batendo a meta (o antigo OBS do Dashboard)">Justificativa</th></tr></thead><tbody>
      ${lista.map(l=>`<tr data-ficha="${esc(l.x.placa)}"><td class="mono"><b>${esc(l.x.placa)}</b></td><td>${esc(l.x.motorista||'–')}${l.entrou?` <span class="tag blue" title="Primeiro lançamento no dia ${l.entrou}: a meta conta a partir daí">entrou dia ${l.entrou}</span>`:''}</td><td>${esc((S.grids[l.x.grid]||{}).nome||'')}</td><td class="n">${l.ind||''}</td><td class="sub">${l.motivo?esc(l.motivo[1]+'× '+l.motivo[0].toLowerCase()):''}</td>
        <td class="n">${fR(l.fat)}</td><td class="n">${fR(l.esp)}</td><td><div style="display:flex;gap:6px;align-items:center"><div class="meter" style="width:80px"><i class="${cls(l.ritmo)}" style="width:${Math.min(100,(l.ritmo||0)*100)}%"></i></div><span class="mono">${fP(l.ritmo)}</span></div></td>
        <td class="n">${l.gap>0?fR(l.gap):'–'}</td><td><span class="tag ${SIT[l.sit][1]}">${SIT[l.sit][0]}</span></td>
        <td data-just="${esc(l.x.placa)}" style="white-space:normal;min-width:220px;max-width:340px" title="Clique para escrever ou mudar">${S.just[l.x.placa]?`<span class="sub" style="color:var(--ink-2)">${esc(S.just[l.x.placa].texto.length>90?S.just[l.x.placa].texto.slice(0,90)+'…':S.just[l.x.placa].texto)}</span>`:l.sit!=='ok'?'<button class="btn sm" type="button">+ Justificar</button>':''}</td></tr>`).join('') || '<tr><td colspan="11" class="muted">Nenhuma placa com esses filtros.</td></tr>'}
    </tbody></table></div>
    <p class="sub" style="margin:0">Fonte: relatório de faturamento por CT-e do sistema da transportadora, ${S.fatImportado?'importado em '+fDiaHora(S.fatImportado):'carregado da planilha em 27/10/2026 (a planilha perdeu a data de emissão dos CT-e, "########", então o faturamento conta no mês, não no dia)'}. As placas são padronizadas sozinhas (ponto, hífen e espaço saem), sem precisar de aba de correção.${S.fatFora?` ${fR(S.fatFora)} faturados em placa que não está na frota entram no total, mas não em nenhum grid.`:''}</p>`;
  $('#ff-mes', v).addEventListener('change', async e=>{ S.mes = e.target.value; lsSet('frt_mes', S.mes); await carregarMes(); renderFaturamento(); });
  const imp = $('#ff-imp', v); if(imp) imp.addEventListener('click', modalImportarFaturamento);
  $$('[data-just]', v).forEach(td=> td.addEventListener('click', e=>{ e.stopPropagation(); modalJustificativa(td.dataset.just); }));
  $$('[data-sit]', v).forEach(b=> b.addEventListener('click', ()=>{ FF.sit = FF.sit===b.dataset.sit ? '' : b.dataset.sit; renderFaturamento(); }));
  $$('[data-grid]', v).forEach(tr=> tr.addEventListener('click', ()=>{ FF.grid = FF.grid===tr.dataset.grid ? '' : tr.dataset.grid; renderFaturamento(); }));
  $$('[data-x]', v).forEach(b=> b.addEventListener('click', ()=>{ FF[b.dataset.x] = ''; renderFaturamento(); }));
  $$('[data-ficha]', v).forEach(tr=> tr.addEventListener('click', ()=> abrirFicha(tr.dataset.ficha)));
}

// por que a placa não bateu o faturamento: texto livre, com a leitura automática da disponibilidade como sugestão
function modalJustificativa(placa){
  const v = S.veic.find(x=>x.placa===placa); if(!v) return;
  const j = S.just[placa], n = diasDoMes(S.mes), mot = {};
  for(let d=1; d<=n; d++){ const s = diaDoMes(S.mes,d); if(s>hojeISO()) break; const st = stDe(placa,s); if(st && !st.disponivel) mot[st.nome] = (mot[st.nome]||0)+1; if(st && st.codigo==='D|SCOTA') mot['sem cota'] = (mot['sem cota']||0)+1; }
  const auto = Object.entries(mot).sort((a,b)=>b[1]-a[1]).map(([k,q])=> q+' '+(q===1?'dia':'dias')+' de '+k.toLowerCase().replace('do motorista','')).join(', ').replace(/\s+,/g,',').trim();
  abrirModal(`<div class="modal-h"><div><h3>Justificativa · <span class="mono">${esc(placa)}</span></h3><div class="sub">${esc(v.motorista||'sem motorista')} · ${esc((S.grids[v.grid]||{}).nome||'')} · ${esc(new Date(S.mes+'-15T12:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'}))}</div></div><button class="x" data-close aria-label="Fechar">✕</button></div>
    <div class="modal-b">
      ${auto?`<div class="sub">Pelo que foi lançado na disponibilidade: <b>${esc(auto)}</b>. <button class="btn sm" type="button" id="j-auto">Usar este texto</button></div>`:''}
      <label class="fld"><span>Por que esta placa não está batendo o faturamento?</span><textarea id="j-txt" rows="4" placeholder="Ex.: cavalo novo entrou na operação dia 15; manutenção desde 10/10 em Maringá">${esc(j?j.texto:'')}</textarea></label>
      ${j?`<div class="sub">Última alteração: ${esc(j.atualizado_por==='planilha de outubro'?'planilha de outubro':j.atualizado_por||'')} · ${fDiaHora(j.atualizado_em)}</div>`:''}
    </div>
    <div class="modal-f">${j&&podeEscrever()?'<button class="btn" type="button" id="j-del" style="margin-right:auto">Apagar</button>':''}<button class="btn" type="button" data-close>Cancelar</button><button class="btn pri" type="button" id="j-ok" ${podeEscrever()?'':'disabled'}>Salvar</button></div>`, bg=>{
    const a = $('#j-auto', bg); if(a) a.addEventListener('click', ()=>{ $('#j-txt', bg).value = auto.charAt(0).toUpperCase()+auto.slice(1); });
    $('#j-ok', bg).addEventListener('click', async ()=>{
      if(!guard()) return; const texto = $('#j-txt', bg).value.trim(); if(!texto){ toast('Escreva a justificativa antes de salvar.'); return; }
      const historico = ((j&&j.historico)||[]).concat(j ? [{ em:new Date().toISOString(), por:S.email, antes:j.texto }] : []);
      const { data, error } = await sb.from('frt_justificativas').upsert({ placa, competencia:diaDoMes(S.mes,1), texto, atualizado_por:S.email, atualizado_em:new Date().toISOString(), historico }, { onConflict:'placa,competencia' }).select().single();
      if(error){ toast('Não salvou: '+error.message); return; } S.just[placa] = data; toast('Justificativa salva.'); fecharModal(); render(); });
    const dl = $('#j-del', bg); if(dl) dl.addEventListener('click', async ()=>{
      if(!dl.dataset.ok){ dl.dataset.ok = '1'; dl.textContent = 'Confirmar: apagar?'; return; }
      const { error } = await sb.from('frt_justificativas').delete().eq('placa', placa).eq('competencia', diaDoMes(S.mes,1));
      if(error){ toast('Não apagou: '+error.message); return; } delete S.just[placa]; fecharModal(); render(); });
  });
}

// importa o relatório de faturamento do jeito que sai do sistema (Excel ou CSV), como o gerente fazia colando na aba "Faturamento RAW"
const placaP = x => String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'') || null;
function numBR(x){ if(typeof x==='number') return x; const s = String(x==null?'':x).trim(); if(!s) return null; const n = Number(s.includes(',') ? s.replace(/\./g,'').replace(',','.') : s); return isFinite(n) ? n : null; }
function dataBR(x){ if(x instanceof Date && !isNaN(x)) return iso(x); const m = String(x||'').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if(m){ const y = m[3].length===2 ? '20'+m[3] : m[3]; return y+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0'); } const m2 = String(x||'').match(/^(\d{4})-(\d{2})-(\d{2})/); return m2 ? m2[0] : null; }
function carregarScript(src){ return new Promise((ok,erro)=>{ const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = erro; document.head.appendChild(s); }); }
function modalImportarFaturamento(){
  if(!ehAdmin()) return; let prontos = [];
  const mesNome = new Date(S.mes+'-15T12:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  abrirModal(`<div class="modal-h"><div><h3>Importar relatório de faturamento</h3><div class="sub">O mesmo relatório por CT-e que ia colado na aba "Faturamento RAW". Pode ser o Excel ou o CSV, do jeito que sai do sistema.</div></div><button class="x" data-close aria-label="Fechar">✕</button></div>
    <div class="modal-b"><label class="btn" style="justify-content:center"><input type="file" id="fi-arq" accept=".xlsx,.xls,.csv" hidden>Escolher o arquivo</label>
      <div id="fi-prev" class="sub">O relatório substitui todo o faturamento de <b>${esc(mesNome)}</b>. As placas são padronizadas sozinhas.</div></div>
    <div class="modal-f"><button class="btn" data-close type="button">Cancelar</button><button class="btn pri" id="fi-ok" type="button" disabled>Importar</button></div>`, bg=>{
    $('#fi-arq', bg).addEventListener('change', async e=>{
      const f = e.target.files[0]; if(!f) return; const prev = $('#fi-prev', bg); prev.textContent = 'Lendo o arquivo…';
      try{
        if(typeof XLSX === 'undefined') await carregarScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
        const wb = XLSX.read(await f.arrayBuffer(), { type:'array', cellDates:true });
        let linhas = null;
        for(const nome of wb.SheetNames){ const r = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header:1, raw:true, defval:null });
          const hi = r.findIndex(l=> l && l.some(c=> sem(c)==='placa') && l.some(c=> sem(c)==='faturamento')); if(hi>=0){ linhas = { cab:r[hi].map(c=>sem(c).trim()), dados:r.slice(hi+1) }; break; } }
        if(!linhas){ prev.textContent = 'Não achei as colunas "Placa" e "Faturamento" no arquivo. É o relatório de faturamento por CT-e?'; return; }
        const ix = k => linhas.cab.indexOf(k), pega = (l,k) => ix(k)>=0 ? l[ix(k)] : null;
        const G = { japao:'JAPAO', grecia:'GRECIA', inglaterra:'INGLATERRA', noruega:'NORUEGA' };
        const placas = new Set(S.veic.map(x=>x.placa)); const meses = {}; let fora = 0;
        prontos = linhas.dados.filter(l=> l && (pega(l,'placa') || numBR(pega(l,'faturamento')))).map((l,k)=>{
          const em = dataBR(pega(l,'data emissao')); if(em) meses[em.slice(0,7)] = (meses[em.slice(0,7)]||0)+1;
          const p = placaP(pega(l,'placa')); if(!placas.has(p)) fora++;
          const idg = numBR(pega(l,'id gerencial'));
          return { id: idg ? Math.round(idg) : Number(S.mes.replace('-',''))*100000 + k, competencia:diaDoMes(S.mes,1), emissao:em, placa:p, carreta:placaP(pega(l,'placa reboque')), motorista:pega(l,'motorista')||null,
            cte: pega(l,'nº docto')!=null ? String(pega(l,'nº docto')) : null, situacao:pega(l,'situacao duplicata')||null, grid:G[sem(pega(l,'grid'))]||null, cliente:pega(l,'cliente')||null,
            produto:pega(l,'produto transportado')||null, coleta:pega(l,'coleta')||null, entrega:pega(l,'entrega')||null, km:numBR(pega(l,'km rota')), peso_t:numBR(pega(l,'peso (ton)')),
            valor:numBR(pega(l,'faturamento'))||0, margem_bruta:numBR(pega(l,'margem bruta')), margem_liquida:numBR(pega(l,'margem liquida')), importado_em:new Date().toISOString(), importado_por:S.email };
        });
        const total = prontos.reduce((a,x)=>a+x.valor, 0), outro = Object.entries(meses).sort((a,b)=>b[1]-a[1])[0];
        prev.innerHTML = `<b>${fN(prontos.length)} CT-e · ${esc(fR(total))}</b> para ${esc(mesNome)}.${fora?` ${fora} linhas com placa fora da frota (entram no total, não no grid).`:''}${outro && outro[0]!==S.mes ? ` <span style="color:var(--red)">Atenção: a maioria das emissões é de ${esc(outro[0])}. Confira o mês escolhido.</span>`:''}`;
        $('#fi-ok', bg).disabled = !prontos.length;
      }catch(err){ prev.textContent = 'Não consegui ler o arquivo: '+(err.message||err); }
    });
    $('#fi-ok', bg).addEventListener('click', async ()=>{
      const b = $('#fi-ok', bg); b.disabled = true; b.textContent = 'Importando…';
      const del = await sb.from('frt_faturamento').delete().eq('competencia', diaDoMes(S.mes,1));
      if(del.error){ toast('Não importou: '+del.error.message); b.disabled = false; b.textContent = 'Importar'; return; }
      for(let i=0; i<prontos.length; i+=500){ const { error } = await sb.from('frt_faturamento').upsert(prontos.slice(i,i+500), { onConflict:'id' });
        if(error){ toast('Parou no meio: '+error.message+'. Importe de novo.'); b.disabled = false; b.textContent = 'Importar'; return; } }
      toast(fN(prontos.length)+' CT-e importados.'); fecharModal(); await carregarMes(); render();
    });
  });
}

/* ---------- SUGESTÕES ---------- */
const SG_ST = { nova:'Nova', em_analise:'Em análise', aprovada:'Aprovada', em_execucao:'Em execução', concluida:'Concluída', rejeitada:'Não vamos fazer', depois:'Para depois' };
const SG_TIPO = { melhoria:'Ideia de melhoria', problema:'Algo não funciona', duvida:'Dúvida' };
async function renderSugestoes(){
  const v = $('#view-sugestoes');
  v.innerHTML = `<div class="head"><div><h2>Sugestões</h2><p>${ehAdmin()?'Tudo o que a equipe mandou pelo balão 💬 ou por aqui. Responda: a resposta aparece para quem sugeriu, na tela de onde saiu.':'O que você mandou e a resposta do gestor. Só você e o gestor veem as suas sugestões.'}</p></div>
      <div class="acts"><button class="btn pri" type="button" id="sg-nova">💬 Nova sugestão</button></div></div><div id="sg-lista" class="muted">Carregando…</div>`;
  $('#sg-nova', v).addEventListener('click', ()=> window.FR_abrirBalao && window.FR_abrirBalao());
  const { data, error } = await sb.from('frt_sugestoes').select('*').order('criado_em', { ascending:false }).limit(300);
  if(S.view!=='sugestoes') return;
  const box = $('#sg-lista'); if(error){ box.textContent = 'Não carregou: '+error.message; return; }
  S.sugestoes = data || [];
  if(!S.sugestoes.length){ box.innerHTML = '<div class="card empty">Nenhuma sugestão ainda. Use o 💬 no canto da tela.</div>'; return; }
  box.className = ''; box.style.cssText = 'display:grid;gap:12px';
  const cor = s => ({ concluida:'green', em_execucao:'blue', aprovada:'blue', em_analise:'blue', rejeitada:'', depois:'' })[s] ?? 'amber';
  box.innerHTML = S.sugestoes.map(s=>`<div class="card sg" data-s="${s.id}">
    <div class="sg-h"><span class="tag ${cor(s.status)}">${esc(SG_ST[s.status]||s.status)}</span><span class="tag">${esc(SG_TIPO[s.tipo]||s.tipo)}</span><b>${esc(s.autor||s.email)}</b><span class="grow"></span><span class="muted mono">${fDiaHora(s.criado_em)}${s.tela?' · '+esc(s.tela):''}</span></div>
    <p>${esc(s.texto)}</p>
    ${(s.anexos||[]).length?`<div class="sg-atts">${s.anexos.map(a=>`<img data-path="${esc(a.path)}" alt="print">`).join('')}</div>`:''}
    ${s.audio_path?`<audio controls data-audio="${esc(s.audio_path)}"></audio>`:''}
    ${s.resposta?`<div class="sg-resp"><b>Resposta:</b> ${esc(s.resposta)}${s.avaliacao?` <span class="tag ${s.avaliacao==='ficou_bom'?'green':'amber'}">${s.avaliacao==='ficou_bom'?'Ficou bom':'Ainda não ficou'}</span>`:''}</div>`:''}
    ${!ehAdmin() && s.resposta && !s.retorno_visto ? `<div class="acts"><button class="btn sm" type="button" data-av="ficou_bom">👍 Ficou bom</button><button class="btn sm" type="button" data-av="ainda_nao">Ainda não ficou</button></div>` : ''}
    ${ehAdmin()?`<div class="form"><label class="fld"><span>Status</span><select data-st>${Object.keys(SG_ST).map(x=>`<option value="${x}" ${x===s.status?'selected':''}>${esc(SG_ST[x])}</option>`).join('')}</select></label>
      <label class="fld full"><span>Resposta para quem sugeriu</span><textarea data-resp rows="2">${esc(s.resposta||'')}</textarea></label></div><div><button class="btn" type="button" data-salvar>Salvar e responder</button></div>`:''}
  </div>`).join('');
  $$('img[data-path]', box).forEach(async img=>{ const { data } = await sb.storage.from('frt-anexos').createSignedUrl(img.dataset.path, 3600); if(data){ img.src = data.signedUrl; img.addEventListener('click', ()=> window.open(data.signedUrl, '_blank', 'noopener')); } });
  $$('audio[data-audio]', box).forEach(async au=>{ const { data } = await sb.storage.from('frt-anexos').createSignedUrl(au.dataset.audio, 3600); if(data) au.src = data.signedUrl; });
  $$('[data-av]', box).forEach(b=> b.addEventListener('click', async ()=>{ const id = b.closest('[data-s]').dataset.s; await sb.rpc('frt_sugestao_retorno', { p_id:id, p_avaliacao:b.dataset.av }); toast('Obrigado pelo retorno!'); retornoIniciar(); renderSugestoes(); }));
  $$('[data-salvar]', box).forEach(b=> b.addEventListener('click', async ()=>{
    const card = b.closest('[data-s]'), s = S.sugestoes.find(x=>x.id===card.dataset.s);
    const status = $('[data-st]', card).value, resposta = $('[data-resp]', card).value.trim() || null;
    const historico = (s.historico||[]).concat([{ em:new Date().toISOString(), por:S.email, de:s.status, para:status, nota:resposta && resposta!==s.resposta ? 'respondeu' : null }]);
    const campos = { status, resposta, historico };
    if(resposta && resposta !== s.resposta){ campos.respondido_em = new Date().toISOString(); campos.retorno_visto = false; campos.avaliacao = null; }
    const { error } = await sb.from('frt_sugestoes').update(campos).eq('id', s.id);
    if(error){ toast('Não salvou: '+error.message); return; } toast('Salvo.'); renderSugestoes(); }));
}
window.FR_renderSugestoes = ()=>{ if(S.view==='sugestoes') renderSugestoes(); };

// retorno para quem sugeriu: a resposta aparece na tela de onde a sugestão saiu, e o menu conta as novas
async function retornoIniciar(){
  if(!S.membro) return;
  const { data } = await sb.from('frt_sugestoes').select('id,texto,resposta,tela,retorno_visto').eq('email', S.email).not('resposta','is',null).eq('retorno_visto', false);
  S.retornos = data || [];
  const c = $('#sg-cnt'); c.hidden = !S.retornos.length; c.textContent = S.retornos.length;
  retornoTela();
}
function retornoTela(){
  const old = $('#retorno-faixa'); if(old) old.remove();
  const r = (S.retornos||[]).find(x=> x.tela === TITULOS[S.view]); if(!r || S.view==='sugestoes') return;
  const f = document.createElement('div'); f.id = 'retorno-faixa'; f.setAttribute('role','status');
  f.innerHTML = `<div><b>💬 Respondemos a sua sugestão</b><div class="sub">"${esc(r.texto.length>90?r.texto.slice(0,90)+'…':r.texto)}"</div></div><div class="sg-resp">${esc(r.resposta)}</div>
    <div class="acts"><button class="btn sm pri" type="button" data-av="ficou_bom">👍 Ficou bom</button><button class="btn sm" type="button" data-av="ainda_nao">Ainda não ficou</button><button class="btn sm" type="button" data-av="" style="margin-left:auto">Ver depois</button></div>`;
  document.body.appendChild(f);
  $$('[data-av]', f).forEach(b=> b.addEventListener('click', async ()=>{ if(b.dataset.av){ await sb.rpc('frt_sugestao_retorno', { p_id:r.id, p_avaliacao:b.dataset.av }); toast('Obrigado pelo retorno!'); retornoIniciar(); } else f.remove(); }));
}
window.FR_retornoTela = retornoTela;

/* ---------- EQUIPE ---------- */
async function renderEquipe(){
  const v = $('#view-equipe');
  const { data } = await sb.from('frt_membros').select('*').order('criado_em');
  const PAP = { admin:'Gestor', programador:'Programador', leitura:'Leitura' };
  v.innerHTML = `<div class="head"><div><h2>Equipe</h2><p>Inclua o e-mail da pessoa. Ela tem 48 horas para criar a senha em "Primeiro acesso". O programador abre a tela Hoje já filtrado nos caminhões dele.</p></div></div>
    <div class="card" style="padding:14px 16px"><div class="form eq-form">
      <label class="fld"><span>E-mail</span><input id="m-email" type="email"></label><label class="fld"><span>Nome</span><input id="m-nome"></label>
      <label class="fld"><span>Perfil</span><select id="m-papel"><option value="programador">Programador</option><option value="leitura">Leitura</option><option value="admin">Gestor</option></select></label>
      <label class="fld"><span>Caminhões de</span><select id="m-prog"><option value="">todos</option>${S.progs.map(p=>`<option>${esc(p)}</option>`).join('')}</select></label>
      <button class="btn pri" id="m-add" type="button">Incluir</button></div></div>
    <div class="card tbl-wrap"><table class="tb"><thead><tr><th>E-mail</th><th>Nome</th><th>Perfil</th><th>Caminhões de</th><th></th></tr></thead><tbody>
      ${(data||[]).map(m=>`<tr style="cursor:default"><td class="mono">${esc(m.email)}</td><td>${esc(m.nome||'')}</td><td>${esc(PAP[m.papel])}${m.ativo?'':' <span class="tag">inativo</span>'}</td><td>${esc(m.programador||'todos')}</td>
        <td>${m.primeiro_acesso_ate&&new Date(m.primeiro_acesso_ate)>new Date()?`<span class="tag amber">liberado até ${fDiaHora(m.primeiro_acesso_ate)}</span> `:''}<button class="btn sm" type="button" data-lib="${esc(m.email)}">Liberar primeiro acesso</button> ${m.email!==S.email?`<button class="btn sm" type="button" data-at="${esc(m.email)}" data-v="${m.ativo?'0':'1'}">${m.ativo?'Desativar':'Reativar'}</button>`:''}</td></tr>`).join('')}</tbody></table></div>`;
  $('#m-add').addEventListener('click', async ()=>{
    const email = $('#m-email').value.trim().toLowerCase(); if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ toast('Não é um e-mail válido.'); return; }
    const { error } = await sb.from('frt_membros').upsert({ email, nome:$('#m-nome').value.trim()||null, papel:$('#m-papel').value, programador:$('#m-prog').value||null, ativo:true, primeiro_acesso_ate:new Date(Date.now()+48*3600000).toISOString() }, { onConflict:'email' });
    if(error){ toast('Não salvou: '+error.message); return; } toast('Incluído. Mande o link e peça para clicar em "Primeiro acesso".'); renderEquipe(); });
  $$('[data-lib]', v).forEach(b=> b.addEventListener('click', async ()=>{
    const { error } = await sb.from('frt_membros').update({ primeiro_acesso_ate:new Date(Date.now()+48*3600000).toISOString(), ativo:true }).eq('email', b.dataset.lib);
    if(error){ toast('Não salvou: '+error.message); return; } toast('Liberado por 48 horas.'); renderEquipe(); }));
  $$('[data-at]', v).forEach(b=> b.addEventListener('click', async ()=>{
    const { error } = await sb.from('frt_membros').update({ ativo: b.dataset.v==='1' }).eq('email', b.dataset.at);
    if(error){ toast('Não salvou: '+error.message); return; } renderEquipe(); }));
}

/* ---------- NOVIDADES ---------- */
const novChave = ()=> 'frt_nov_visto:' + S.email;
async function novidadesCarregar(){ const { data } = await sb.from('frt_novidades').select('*').order('data',{ascending:false}).order('criado_em',{ascending:false}).limit(8); S.novidades = data || []; return S.novidades; }
function novMarcarVisto(){ if(S.novidades[0]) lsSet(novChave(), S.novidades[0].id); const f = $('#nov-faixa'); if(f) f.remove(); $('#btn-nov').classList.remove('novo'); }
async function novidadesAbrir(){
  if(!S.novidades.length) await novidadesCarregar();
  abrirModal(`<div class="modal-h"><div><h3>✨ Novidades</h3><div class="sub">O que mudou no sistema.</div></div><button class="x" data-close aria-label="Fechar">✕</button></div>
    <div class="modal-b">${S.novidades.map((n,i)=>`<div><div style="display:flex;gap:8px;align-items:center"><span style="font-size:20px">${esc(n.ico||'✨')}</span><b>${esc(n.titulo)}</b><span class="tag">${fData(n.data+'T12:00:00')}</span>${i===0?'<span class="tag amber">mais recente</span>':''}</div>
      <ul style="margin:6px 0 0;padding-left:22px;color:var(--ink-2)">${(n.itens||[]).map(it=>`<li>${esc(it)}</li>`).join('')}</ul></div>`).join('') || '<span class="muted">Nada novo.</span>'}</div>
    <div class="modal-f"><button class="btn pri" data-close type="button">Entendi</button></div>`);
  novMarcarVisto();
}
window.novidadesAbrir = novidadesAbrir;
$('#btn-nov').addEventListener('click', novidadesAbrir);
async function novidadesIniciar(){
  const lista = await novidadesCarregar(); if(!lista.length) return;
  if(lsGet(novChave(), '') !== lista[0].id && !$('#nov-faixa')){
    const f = document.createElement('div'); f.id = 'nov-faixa'; f.setAttribute('role','status');
    f.innerHTML = `<span>✨ <b>Tem novidade no sistema.</b></span><button class="btn pri" type="button" id="nov-ver">Ver o que mudou</button><button class="btn" type="button" id="nov-x" aria-label="Fechar">✕</button>`;
    document.body.appendChild(f); $('#nov-ver').addEventListener('click', novidadesAbrir); $('#nov-x').addEventListener('click', ()=> f.remove());
    $('#btn-nov').classList.add('novo');
  }
}

/* ---------- PASSO A PASSO (primeiro acesso; depois, pelo botão "Passo a passo") ---------- */
// Cada passo abre a tela certa e acende o pedaço dela de que fala. O texto muda conforme o perfil.
const tourChave = ()=> 'frt_tour:' + S.email;
const T = { i:0, passos:[], origem:'' };
function tourPassos(){
  const nome = ((S.membro && S.membro.nome) || '').split(' ')[0];
  const pap = S.membro ? S.membro.papel : 'leitura';
  const ult = sel => { const l = $$(sel); return l[l.length-1]; };
  const perfil = pap==='admin' ? 'Seu acesso é de <b>Gestor</b>: você vê tudo, inclui pessoas na Equipe e importa o faturamento.'
    : pap==='programador' ? 'Seu acesso é de <b>Programador</b>: você lança o status do dia dos seus conjuntos.'
    : 'Seu acesso é de <b>Leitura</b>: você vê todas as telas com os dados reais, sem risco de mudar nada sem querer.';
  return [
    { t:`Olá${nome ? ', '+esc(nome) : ''}! Bem-vindo à ${esc(NOME)}`, x:`Aqui está a disponibilidade da frota de outubro e o faturamento × meta, com os dados reais da planilha. Em 1 minuto eu mostro onde fica cada coisa.<br><br>${perfil}` },
    { v:'apresentacao', alvo:()=> $('.side'), t:'O menu', x:'Cada tela responde a uma pergunta. <b>Apresentação</b> explica o que é a torre e o que a planilha escondia. No celular, o menu fica no topo: arraste para o lado.' },
    { v:'painel', alvo:()=> $('#view-painel .pn-kpis'), t:'Painel: o Dashboard em gráficos', x:'Os números do mês num olhar: disponíveis, disponibilidade média, ritmo do faturamento, quanto falta para a meta e as placas críticas. <b>Clique num número</b> para abrir a tela com os detalhes.' },
    { v:'painel', alvo:()=> $('#view-painel .pn-grade'), t:'Os gráficos levam ao caso', x:'Disponibilidade dia a dia, como a frota passou cada dia, faturamento por grid e as placas onde mais falta. <b>Clique numa barra, num ponto ou numa placa</b> e o sistema mostra quem está por trás do número.' },
    { v:'hoje', alvo:()=> $('#view-hoje .chips'), t:'Hoje: a frota em um minuto', x:'Quantos conjuntos estão rodando, parados, em manutenção, sem motorista ou sem lançamento. <b>Clique num número</b> para a lista mostrar só aqueles. A data no alto troca o dia.' },
    { v:'hoje', alvo:()=> $('#view-hoje .cj'), t:'Um conjunto por linha', x:'Placa, grid, motorista, como estava ontem e o status de hoje. Quem está sem lançamento e quem está parado há mais tempo aparece primeiro.' + (pap==='leitura' ? ' Quem lança o status é o programador.' : ' Clique no status para mudar; <b>Igual a ontem</b> repete o dia anterior.') },
    { v:'quadro', alvo:()=> $('#view-quadro .tl-resumo'), t:'Quadro do mês: o resumo do dia', x:'Quantos conjuntos estão disponíveis, rodando, em manutenção, sem motorista ou em SSMA no dia. <b>Clique num cartão</b> para a lista mostrar só aqueles, ou num dia do eixo para ver outro dia.' },
    { v:'quadro', alvo:()=> $('#view-quadro .tl-corpo .tl-row'), t:'A linha do tempo de cada conjunto', x:'Cada barra é um trecho de dias no mesmo status: "Manutenção corretiva · 12d" de uma vez, sem contar quadradinho. <b>Clique na placa</b> para abrir o cadastro do conjunto e da operação, ou <b>numa barra</b> para ver os dias e as observações.' },
    { v:'faturamento', alvo:()=> $('#view-faturamento .kpis'), t:'Faturamento × meta', x:'A meta do mês, quanto já deveria ter faturado até ontem, o que foi faturado e o <b>ritmo</b>. É a conta do Dashboard, por grid, sem fórmula para quebrar.' },
    { v:'faturamento', alvo:()=> ult('#view-faturamento .tbl-wrap'), t:'Quem está fora do ritmo', x:'As placas críticas vêm primeiro, com os dias parados, o motivo e a justificativa. <b>Clique numa placa</b> para ver o mês inteiro dela.' },
    { v:'sugestoes', alvo:()=> $('#ac-btn'), t:'Dúvida ou ideia? 💬', x:'Este botão fica em todas as telas. Dá para escrever, <b>falar</b> ou mandar um print. A resposta volta para você aqui, na tela Sugestões.' },
    { t:'Pronto!', x:'Para rever este passo a passo, clique em <b>Passo a passo</b> no alto da tela.', fim:true } ];
}
function tourAbrir(origem){
  tourFechar(true);
  T.passos = tourPassos(); T.i = 0; T.origem = origem || 'botao'; window.FR_tour = true;
  const sp = document.createElement('div'); sp.id = 'tour-luz'; sp.setAttribute('aria-hidden','true');
  const cx = document.createElement('div'); cx.id = 'tour-caixa'; cx.setAttribute('role','dialog'); cx.setAttribute('aria-modal','true'); cx.setAttribute('aria-labelledby','tour-t');
  document.body.append(sp, cx);
  window.addEventListener('resize', tourPosicionar); window.addEventListener('scroll', tourPosicionar, true);
  document.addEventListener('keydown', tourTecla);
  window.FR_uso && window.FR_uso('tour', 'abriu', { origem:T.origem });
  tourMostrar();
}
function tourTecla(e){ if(e.key==='Escape') tourFechar(); else if(e.key==='ArrowRight') tourIr(1); else if(e.key==='ArrowLeft') tourIr(-1); }
function tourIr(d){
  const n = T.i + d; if(n < 0) return;
  if(n >= T.passos.length){ tourFechar(); return; }
  T.i = n; tourMostrar();
}
async function tourMostrar(){
  const p = T.passos[T.i], cx = $('#tour-caixa'); if(!cx) return;
  if(p.v && S.view !== p.v) irPara(p.v);
  let alvo = null;
  if(p.alvo){ for(let k=0; k<20 && !(alvo = p.alvo()); k++) await new Promise(r=> setTimeout(r, 100)); }
  if(!$('#tour-caixa') || T.passos[T.i] !== p) return;   // fechou ou andou enquanto esperava a tela
  T.alvo = alvo;
  if(alvo && alvo.id!=='ac-btn') alvo.scrollIntoView({ block:'nearest', inline:'nearest' });
  const ult = T.i === T.passos.length-1;
  cx.innerHTML = `<div class="tour-passo">${T.i===0 || ult ? 'Passo a passo' : `Passo ${T.i} de ${T.passos.length-2}`}</div>
    <h3 id="tour-t">${p.t}</h3><p>${p.x}</p>
    <div class="tour-pontos" aria-hidden="true">${T.passos.map((_,k)=>`<i${k===T.i?' class="on"':''}></i>`).join('')}</div>
    <div class="tour-acts">${T.i===0 ? '<button type="button" class="btn" data-t="pular">Agora não</button>' : ult ? '' : '<button type="button" class="btn" data-t="pular">Pular</button><button type="button" class="btn" data-t="voltar">← Voltar</button>'}
      ${T.i===0 ? '<button type="button" class="btn pri" data-t="ir">Começar →</button>' : ult ? '<button type="button" class="btn" data-t="apres">Ver a Apresentação</button><button type="button" class="btn pri" data-t="hoje">Ir para Hoje</button>' : '<button type="button" class="btn pri" data-t="ir">Próximo →</button>'}</div>`;
  $$('[data-t]', cx).forEach(b=> b.addEventListener('click', ()=>{
    const a = b.dataset.t;
    if(a==='ir') tourIr(1); else if(a==='voltar') tourIr(-1);
    else if(a==='pular'){ window.FR_uso && window.FR_uso('tour', 'pulou', { passo:T.i }); tourFechar(); }
    else { tourFechar(); irPara(a==='apres' ? 'apresentacao' : 'hoje'); }
  }));
  tourPosicionar();
  const foco = $('[data-t="ir"],[data-t="hoje"]', cx); if(foco) foco.focus({ preventScroll:true });
}
function tourPosicionar(){
  const sp = $('#tour-luz'), cx = $('#tour-caixa'); if(!sp || !cx) return;
  const a = T.alvo && T.alvo.isConnected ? T.alvo.getBoundingClientRect() : null;
  const vw = innerWidth, vh = innerHeight, m = 8;
  if(!a || !a.width){ sp.className = 'cheio'; sp.removeAttribute('style'); cx.className = 'centro'; cx.removeAttribute('style'); return; }
  const r = { l:Math.max(4, a.left-m), t:Math.max(4, a.top-m) }; r.w = Math.min(vw-8, a.right+m) - r.l; r.h = Math.min(vh-8, a.bottom+m) - r.t;
  sp.className = ''; Object.assign(sp.style, { left:r.l+'px', top:r.t+'px', width:r.w+'px', height:r.h+'px' });
  if(vw < 700){ cx.className = 'baixo'; cx.removeAttribute('style'); if(r.t + r.h > vh*0.55) cx.className = 'cima'; return; }
  // caixa ao lado do alvo quando cabe; senão embaixo ou em cima
  cx.className = ''; const W = Math.min(400, vw-32), H = cx.offsetHeight || 240; let x, y;
  if(r.l + r.w + W + 24 < vw){ x = r.l + r.w + 16; y = r.t; }
  else if(r.t + r.h + H + 24 < vh){ x = r.l; y = r.t + r.h + 16; }
  else if(r.t - H - 16 > 0){ x = r.l; y = r.t - H - 16; }
  else { x = vw - W - 24; y = vh - H - 24; }
  x = Math.min(Math.max(16, x), vw - W - 16); y = Math.min(Math.max(16, y), vh - H - 16);
  Object.assign(cx.style, { left:x+'px', top:y+'px', width:W+'px' });
}
function tourFechar(silencio){
  const cx = $('#tour-caixa'); if(!cx) return;
  if(!silencio){ lsSet(tourChave(), new Date().toISOString()); window.FR_uso && window.FR_uso('tour', 'fechou', { passo:T.i, de:T.passos.length }); }
  cx.remove(); const sp = $('#tour-luz'); if(sp) sp.remove(); T.alvo = null; window.FR_tour = false;
  window.removeEventListener('resize', tourPosicionar); window.removeEventListener('scroll', tourPosicionar, true);
  document.removeEventListener('keydown', tourTecla);
}
$('#btn-tour').addEventListener('click', ()=> tourAbrir('botao'));

/* ---------- partida ---------- */
window.FR = { sb, get email(){ return S.email; }, get nome(){ return (S.membro&&S.membro.nome) || S.email.split('@')[0]; }, view:()=>S.view, titulo:()=>TITULOS[S.view], irPara };
aplicarTemaBotoes();
sb.auth.getSession().then(({data})=>{ if(!data.session) telaLogin(); });
})();
