'use strict';
/* Minhas Músicas: YouTube online + músicas guardadas no aparelho (offline). */

const $ = (s) => document.querySelector(s);
const guardar = {
  ler(k, padrao) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : padrao; } catch { return padrao; } },
  gravar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const decod = (t) => { const x = document.createElement('textarea'); x.innerHTML = t; return x.value; };
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- Abas ---------- */
const abas = document.querySelectorAll('.abas button');
function abrirAba(id) {
  abas.forEach((b) => {
    const sel = b.id === id;
    b.setAttribute('aria-selected', sel);
    $('#' + b.dataset.painel).hidden = !sel;
  });
}
abas.forEach((b) => b.addEventListener('click', () => abrirAba(b.id)));

/* ---------- Internet ---------- */
function atualizarStatus(trocarAba) {
  const on = navigator.onLine;
  const st = $('#status');
  st.textContent = on ? 'online' : 'sem internet';
  st.className = 'status ' + (on ? 'on' : 'off');
  $('#aviso-offline').hidden = on;
  $('#form-busca').hidden = !on;
  if (!on) {
    if (yt.player && yt.player.pauseVideo) try { yt.player.pauseVideo(); } catch {}
    if (trocarAba) abrirAba('aba-local');
  }
}
window.addEventListener('online', () => atualizarStatus(false));
window.addEventListener('offline', () => atualizarStatus(true));

/* ---------- YouTube ---------- */
let ultimaFonte = 'yt';
const yt = { player: null, pronto: null, fila: [], pos: -1, modo: 'resultados', resultados: [] };
const chave = () => guardar.ler('chaveYT', '');
let favoritas = guardar.ler('favoritas', []);

function carregarApiYT() {
  if (yt.pronto) return yt.pronto;
  yt.pronto = new Promise((ok, falha) => {
    window.onYouTubeIframeAPIReady = ok;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { yt.pronto = null; falha(new Error('Não foi possível carregar o YouTube.')); };
    document.head.appendChild(s);
  });
  return yt.pronto;
}

async function tocarYT(i) {
  if (!navigator.onLine) { atualizarStatus(true); return; }
  if (i < 0 || i >= yt.fila.length) return;
  yt.pos = i;
  const v = yt.fila[i];
  $('#player-yt-caixa').hidden = false;
  $('#yt-titulo').textContent = v.titulo;
  atualizarFavBotao();
  pararLocal();
  ultimaFonte = 'yt';
  await carregarApiYT();
  if (!yt.player) {
    yt.player = new YT.Player('player-yt', {
      videoId: v.id,
      playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
      events: {
        onStateChange: (e) => { if (e.data === YT.PlayerState.ENDED) tocarYT(yt.pos + 1); },
        onError: () => tocarYT(yt.pos + 1),
      },
    });
  } else {
    yt.player.loadVideoById(v.id);
  }
  marcarAtualYT();
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: v.titulo, artist: v.canal, artwork: [{ src: v.thumb, sizes: '320x180' }] });
  }
}

function marcarAtualYT() {
  const atual = yt.fila[yt.pos];
  document.querySelectorAll('#lista-yt li').forEach((li) => li.classList.toggle('atual', !!atual && li.dataset.id === atual.id));
}

function desenharListaYT() {
  const lista = yt.modo === 'favoritas' ? favoritas : yt.resultados;
  const ul = $('#lista-yt');
  if (!lista.length) {
    ul.innerHTML = `<li class="vazio">${yt.modo === 'favoritas' ? 'Nenhuma favorita ainda. Toque em ☆ enquanto uma música toca.' : 'Busque uma música acima.'}</li>`;
    return;
  }
  ul.innerHTML = lista.map((v, i) => `
    <li data-i="${i}" data-id="${esc(v.id)}">
      <img src="${esc(v.thumb)}" alt="" loading="lazy">
      <div class="info"><div class="t">${esc(v.titulo)}</div><div class="s">${esc(v.canal)}</div></div>
      ${yt.modo === 'favoritas' ? `<button class="x" data-tirar="${i}" aria-label="Tirar das favoritas">✕</button>` : ''}
    </li>`).join('');
  marcarAtualYT();
}

$('#lista-yt').addEventListener('click', (e) => {
  const tirar = e.target.closest('[data-tirar]');
  if (tirar) {
    favoritas.splice(+tirar.dataset.tirar, 1);
    guardar.gravar('favoritas', favoritas);
    desenharListaYT(); atualizarFavBotao();
    return;
  }
  const li = e.target.closest('li[data-i]');
  if (!li) return;
  yt.fila = (yt.modo === 'favoritas' ? favoritas : yt.resultados).slice();
  tocarYT(+li.dataset.i);
});

$('#ver-resultados').addEventListener('click', () => { yt.modo = 'resultados'; $('#ver-resultados').classList.add('ativo'); $('#ver-favoritas').classList.remove('ativo'); desenharListaYT(); });
$('#ver-favoritas').addEventListener('click', () => { yt.modo = 'favoritas'; $('#ver-favoritas').classList.add('ativo'); $('#ver-resultados').classList.remove('ativo'); desenharListaYT(); });

$('#form-busca').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('#campo-busca').value.trim();
  if (!q) return;
  if (!chave()) { $('#aviso-chave').hidden = false; return; }
  $('#aviso-chave').hidden = true;
  const ul = $('#lista-yt');
  ul.innerHTML = '<li class="vazio">Buscando…</li>';
  $('#ver-resultados').click();
  try {
    const soAudio = $('#so-audio').checked;
    const url = 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&videoCategoryId=10&maxResults=25'
      + '&q=' + encodeURIComponent(soAudio ? q + ' áudio' : q) + '&key=' + encodeURIComponent(chave());
    const r = await fetch(url);
    const d = await r.json();
    if (!r.ok) throw new Error(d?.error?.message || 'Erro na busca');
    const pontos = (it) => {
      // Canais "Artista - Topic" e títulos com "áudio"/"audio" costumam ser só a capa do disco, sem clipe
      const t = (it.snippet.title + ' ' + it.snippet.channelTitle).toLowerCase();
      let n = 0;
      if (/ - topic$/i.test(it.snippet.channelTitle)) n += 3;
      if (/(á|a)udio|lyric|letra/.test(t)) n += 2;
      if (/clipe|clip|videoclipe|official video|v(í|i)deo oficial/.test(t)) n -= 2;
      return n;
    };
    const itens = soAudio ? d.items.map((it, i) => ({ it, i, n: pontos(it) })).sort((a, b) => b.n - a.n || a.i - b.i).map((x) => x.it) : d.items;
    yt.resultados = itens.map((it) => ({
      id: it.id.videoId,
      titulo: decod(it.snippet.title),
      canal: decod(it.snippet.channelTitle),
      thumb: it.snippet.thumbnails?.medium?.url || it.snippet.thumbnails?.default?.url || '',
    }));
    desenharListaYT();
  } catch (err) {
    ul.innerHTML = `<li class="vazio">Não deu certo: ${esc(err.message)}</li>`;
  }
});

$('#yt-anterior').addEventListener('click', () => tocarYT(Math.max(0, yt.pos - 1)));
$('#yt-proxima').addEventListener('click', () => tocarYT(yt.pos + 1));
$('#yt-tocar').addEventListener('click', () => {
  if (!yt.player) return;
  const st = yt.player.getPlayerState();
  st === YT.PlayerState.PLAYING ? yt.player.pauseVideo() : yt.player.playVideo();
});
function atualizarFavBotao() {
  const v = yt.fila[yt.pos];
  $('#yt-fav').textContent = v && favoritas.some((f) => f.id === v.id) ? '★' : '☆';
}
$('#yt-fav').addEventListener('click', () => {
  const v = yt.fila[yt.pos];
  if (!v) return;
  const i = favoritas.findIndex((f) => f.id === v.id);
  i >= 0 ? favoritas.splice(i, 1) : favoritas.unshift(v);
  guardar.gravar('favoritas', favoritas);
  atualizarFavBotao();
  if (yt.modo === 'favoritas') desenharListaYT();
});

/* ---------- Músicas guardadas (IndexedDB) ---------- */
const DB = {
  abrir() {
    if (this.p) return this.p;
    this.p = new Promise((ok, falha) => {
      const r = indexedDB.open('minhas-musicas', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('faixas', { keyPath: 'id', autoIncrement: true });
      r.onsuccess = () => ok(r.result);
      r.onerror = () => falha(r.error);
    });
    return this.p;
  },
  async tx(modo, fn) {
    const db = await this.abrir();
    return new Promise((ok, falha) => {
      const t = db.transaction('faixas', modo);
      const res = fn(t.objectStore('faixas'));
      t.oncomplete = () => ok(res && 'result' in res ? res.result : undefined);
      t.onerror = () => falha(t.error);
    });
  },
  todas() { return this.tx('readonly', (s) => s.getAll()); },
  pegar(id) { return this.tx('readonly', (s) => s.get(id)); },
  pôr(f) { return this.tx('readwrite', (s) => s.add(f)); },
  tirar(id) { return this.tx('readwrite', (s) => s.delete(id)); },
  limpar() { return this.tx('readwrite', (s) => s.clear()); },
};

const local = { faixas: [], visiveis: [], pos: -1, aleatorio: false, url: null };
const audio = $('#audio');

function separarNome(nome) {
  const base = nome.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  const p = base.split(' - ');
  return p.length > 1 ? { artista: p[0].trim(), titulo: p.slice(1).join(' - ').trim() } : { artista: '', titulo: base };
}

async function carregarLocais() {
  try {
    const todas = await DB.todas();
    local.faixas = todas.filter((m) => aceita(m.nome, m.tipo)).map(({ id, nome, tamanho }) => ({ id, nome, tamanho, ...separarNome(nome) }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  } catch { local.faixas = []; }
  desenharLocais();
  await mostrarEspaco();
}

function desenharLocais() {
  const f = $('#filtro-local').value.trim().toLowerCase();
  local.visiveis = f ? local.faixas.filter((m) => m.nome.toLowerCase().includes(f)) : local.faixas.slice();
  const ul = $('#lista-local');
  if (!local.faixas.length) { ul.innerHTML = '<li class="vazio">Nenhuma música guardada neste aparelho. Toque em <b>+ Adicionar músicas</b>.</li>'; return; }
  if (!local.visiveis.length) { ul.innerHTML = '<li class="vazio">Nada encontrado.</li>'; return; }
  ul.innerHTML = local.visiveis.map((m, i) => `
    <li data-i="${i}" data-id="${m.id}">
      <div class="nota">♪</div>
      <div class="info"><div class="t">${esc(m.titulo)}</div><div class="s">${esc(m.artista || (m.tamanho / 1048576).toFixed(1) + ' MB')}</div></div>
      <button class="x" data-apagar="${m.id}" aria-label="Apagar">✕</button>
    </li>`).join('');
  marcarAtualLocal();
}

function marcarAtualLocal() {
  document.querySelectorAll('#lista-local li').forEach((li) => li.classList.toggle('atual', +li.dataset.id === local.idAtual));
}

async function tocarLocal(i) {
  const lista = local.visiveis;
  if (!lista.length) return;
  if (i < 0) i = lista.length - 1;
  if (i >= lista.length) i = 0;
  local.pos = i;
  const m = lista[i];
  const reg = await DB.pegar(m.id);
  if (!reg) return;
  if (local.url) URL.revokeObjectURL(local.url);
  local.url = URL.createObjectURL(reg.blob);
  local.idAtual = m.id;
  ultimaFonte = 'local';
  audio.src = local.url;
  if (yt.player && yt.player.pauseVideo) try { yt.player.pauseVideo(); } catch {}
  audio.play().catch(() => {});
  $('#local-titulo').textContent = m.artista ? `${m.titulo} — ${m.artista}` : m.titulo;
  marcarAtualLocal();
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: m.titulo, artist: m.artista, artwork: [{ src: 'icone-512.png', sizes: '512x512', type: 'image/png' }] });
  }
}
function proximaLocal() {
  if (local.aleatorio && local.visiveis.length > 1) {
    let n; do { n = Math.floor(Math.random() * local.visiveis.length); } while (n === local.pos);
    tocarLocal(n);
  } else tocarLocal(local.pos + 1);
}
function pararLocal() { if (!audio.paused) audio.pause(); }

audio.addEventListener('ended', proximaLocal);
$('#local-proxima').addEventListener('click', proximaLocal);
$('#local-anterior').addEventListener('click', () => tocarLocal(local.pos - 1));
$('#local-tocar').addEventListener('click', () => {
  if (!audio.src) return tocarLocal(0);
  audio.paused ? audio.play() : audio.pause();
});
$('#local-aleatorio').addEventListener('click', (e) => {
  local.aleatorio = !local.aleatorio;
  e.currentTarget.setAttribute('aria-pressed', local.aleatorio);
});
$('#filtro-local').addEventListener('input', desenharLocais);

$('#lista-local').addEventListener('click', async (e) => {
  const ap = e.target.closest('[data-apagar]');
  if (ap) {
    const id = +ap.dataset.apagar;
    const m = local.faixas.find((x) => x.id === id);
    if (m && confirm(`Apagar "${m.titulo}" deste aparelho?`)) {
      if (local.idAtual === id) { audio.pause(); audio.removeAttribute('src'); local.idAtual = null; }
      await DB.tirar(id); carregarLocais();
    }
    return;
  }
  const li = e.target.closest('li[data-i]');
  if (li) tocarLocal(+li.dataset.i);
});

// No celular: só MP3, e nunca áudios do WhatsApp (PTT-/AUD-AAAAMMDD-WA0001…)
const ehCelular = /Android|iPhone|iPad/i.test(navigator.userAgent);
const ehWhatsApp = (nome) => /^(PTT|AUD)-\d{8}-WA\d+/i.test(nome);
const aceita = (nome, tipo = '') => ehCelular
  ? /\.mp3$/i.test(nome) && !ehWhatsApp(nome)
  : tipo.startsWith('audio/') || /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|wma)$/i.test(nome);

async function adicionarArquivos(lista) {
  const todos = [...lista];
  const arquivos = todos.filter((f) => aceita(f.name, f.type));
  const recusados = todos.length - arquivos.length;
  if (!arquivos.length) {
    alert(ehCelular ? 'Nenhuma música MP3 encontrada. No celular o app só guarda arquivos .mp3 (áudios do WhatsApp ficam de fora).' : 'Nenhum arquivo de música encontrado.');
    return;
  }
  if (recusados && ehCelular) alert(`${recusados} arquivo(s) ignorado(s): no celular só entram músicas .mp3, sem áudios do WhatsApp.`);
  const existentes = new Set(local.faixas.map((m) => m.nome + '|' + m.tamanho));
  let novas = 0;
  $('#espaco').textContent = `Guardando ${arquivos.length} música(s)…`;
  for (const f of arquivos) {
    if (existentes.has(f.name + '|' + f.size)) continue;
    try {
      await DB.pôr({ nome: f.name, tamanho: f.size, tipo: f.type, blob: f, adicionada: Date.now() });
      novas++;
    } catch (err) {
      alert('Faltou espaço para guardar mais músicas neste aparelho.');
      break;
    }
  }
  if (navigator.storage?.persist) navigator.storage.persist();
  await carregarLocais();
  $('#espaco').textContent = `${novas} música(s) nova(s) guardada(s). ` + $('#espaco').textContent;
}
$('#arquivos').addEventListener('change', (e) => { adicionarArquivos(e.target.files); e.target.value = ''; });
$('#pasta').addEventListener('change', (e) => { adicionarArquivos(e.target.files); e.target.value = ''; });
// Pasta inteira só funciona no computador
if (ehCelular) {
  $('#rotulo-pasta').hidden = true;
  $('#arquivos').setAttribute('accept', '.mp3,audio/mpeg');
  $('#rotulo-arquivos').firstChild.textContent = '+ Adicionar músicas MP3 ';
}

async function mostrarEspaco() {
  let txt = `${local.faixas.length} música(s) guardada(s).`;
  try {
    const e = await navigator.storage.estimate();
    txt += ` Usando ${(e.usage / 1073741824).toFixed(2)} GB de ${(e.quota / 1073741824).toFixed(0)} GB disponíveis para o app.`;
  } catch {}
  $('#espaco').textContent = txt;
}

$('#apagar-tudo').addEventListener('click', async () => {
  if (!confirm('Apagar TODAS as músicas guardadas neste aparelho? Os arquivos originais não são afetados.')) return;
  audio.pause(); audio.removeAttribute('src'); local.idAtual = null;
  await DB.limpar(); carregarLocais();
});

/* ---------- Controles da tela bloqueada ---------- */
if ('mediaSession' in navigator) {
  const tocandoLocal = () => ultimaFonte === 'local';
  navigator.mediaSession.setActionHandler('play', () => tocandoLocal() ? audio.play() : yt.player?.playVideo());
  navigator.mediaSession.setActionHandler('pause', () => tocandoLocal() ? audio.pause() : yt.player?.pauseVideo());
  navigator.mediaSession.setActionHandler('nexttrack', () => tocandoLocal() ? proximaLocal() : tocarYT(yt.pos + 1));
  navigator.mediaSession.setActionHandler('previoustrack', () => tocandoLocal() ? tocarLocal(local.pos - 1) : tocarYT(yt.pos - 1));
}

/* ---------- Configurações ---------- */
function mostrarChave() { $('#chave-ok').textContent = chave() ? 'Chave salva neste aparelho.' : 'Nenhuma chave salva.'; }
$('#form-chave').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#campo-chave').value.trim();
  guardar.gravar('chaveYT', v);
  $('#campo-chave').value = '';
  mostrarChave();
  if (v) $('#aviso-chave').hidden = true;
});

let pedidoInstalar = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pedidoInstalar = e; $('#botao-instalar').hidden = false; });
$('#botao-instalar').addEventListener('click', async () => { if (!pedidoInstalar) return; pedidoInstalar.prompt(); await pedidoInstalar.userChoice; pedidoInstalar = null; $('#botao-instalar').hidden = true; });

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

/* ---------- Preferência "só áudio" ---------- */
$('#so-audio').checked = guardar.ler('soAudio', true);
$('#so-audio').addEventListener('change', (e) => { guardar.gravar('soAudio', e.target.checked); document.body.classList.toggle('modo-audio', e.target.checked); });
document.body.classList.toggle('modo-audio', $('#so-audio').checked);

/* ---------- Início ---------- */
mostrarChave();
desenharListaYT();
carregarLocais();
atualizarStatus(true);
if (!navigator.onLine) abrirAba('aba-local');
