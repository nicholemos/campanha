let cenasAtuais = [];
let campanha = [];
let bibliotecaFichas = [];
let fichaAtiva = null;

const CONFIG_T20 = {
    getBonusTreinamento: (nivel) => {
        if (nivel >= 14) return 6;
        if (nivel >= 7) return 4;
        return 2;
    },
    estruturas: {
        simples: ["Interpretacao", "Exploracao", "Boss"],
        comum: ["Interpretacao", "Exploracao", "Combate", "Boss"],
        complexa: ["Interpretacao", "Exploracao", "Combate", "Exploracao", "Boss"]
    },
    bancoCenas: {
        Interpretacao: ["Contrato de Nobre", "Investigação em Taverna", "Interrogatório", "Cena Social"],
        Exploracao: ["Viagem por Ermos", "Masmorra Antiga", "Rastreamento", "Perigo Ambiental"],
        Combate: ["Emboscada na Estrada", "Guarda de Elite", "Criatura Selvagem"],
        Boss: ["Vilão da Aventura", "Monstro Lendário", "Desafio Final"]
    }
};

// Helper para exibir loading
function showLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'flex';
}
function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
}

// Sistema de notificações toast
function mostrarToast(mensagem, tipo = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${tipo}`;
    toast.textContent = mensagem;
    container.appendChild(toast);
    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('visible'));
    });
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

// Converte URL de imagem para base64 para uso no PDF (evita problemas de CORS no html2canvas)
async function imagemParaBase64(url) {
    // Tenta via fetch (funciona se o servidor permitir CORS)
    try {
        const res = await fetch(url, { mode: 'cors' });
        if (!res.ok) throw new Error('fetch falhou');
        const blob = await res.blob();
        return await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch (_) {
        // Fallback: tenta via canvas (pode falhar por CORS taint, mas vale tentar)
        return await new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = img.naturalWidth || 800;
                    canvas.height = img.naturalHeight || 600;
                    canvas.getContext('2d').drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/jpeg', 0.85));
                } catch {
                    resolve(null); // Canvas tainted - não conseguimos converter
                }
            };
            img.onerror = () => resolve(null);
            img.src = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
        });
    }
}

window.onload = () => {
    carregarDados();
    carregarCampanha();

    // Sortable para as Abas da Campanha
    const abasEl = document.getElementById('abasCampanha');
    Sortable.create(abasEl, {
        animation: 150,
        onEnd: () => {
            const novasAbas = Array.from(abasEl.children).map(el => el.dataset.id);
            campanha.sort((a, b) => novasAbas.indexOf(a.idCampanha) - novasAbas.indexOf(b.idCampanha));
            localStorage.setItem('t20_campanha', JSON.stringify(campanha));
        }
    });

    const el = document.getElementById('listaCenas');
    Sortable.create(el, {
        handle: '.drag-handle',
        animation: 150,
        onEnd: function (evt) {
            const item = cenasAtuais.splice(evt.oldIndex, 1)[0];
            cenasAtuais.splice(evt.newIndex, 0, item);
            renderizar();
            salvarDados();
        }
    });
};

function calcularDificuldades(nivel) {
    const n = parseInt(nivel);
    const metadeNivel = Math.floor(n / 2);
    const bonusTreino = CONFIG_T20.getBonusTreinamento(n);
    const cap = (val) => {
        if (val <= 0) {
            if (val === 0) return "1/2";
            if (val === -1) return "1/4";
            return "1/8";
        }
        return Math.min(val, 20);
    };
    return {
        rotineiro: 10 + metadeNivel + bonusTreino,
        complexo: 15 + metadeNivel + bonusTreino,
        dificil: 20 + metadeNivel + bonusTreino,
        cFacil: cap(n - 2), cNormal: cap(n - 1), cDificil: cap(n),
        bFacil: cap(n), bNormal: cap(n + 1), bDificil: cap(n + 2)
    };
}

function copiarResumo() {
    if (cenasAtuais.length === 0) return;
    let textoResumo = `📜 MISSÃO T20 - NÍVEL ${document.getElementById('selectNivel').value}\n`;
    textoResumo += `Intensidade: ${calcularDesgaste().texto}\n-----------------------------------\n`;

    cenasAtuais.forEach((cena, index) => {
        const select = document.querySelector(`select[data-id="${cena.id}"]`);
        const difLabel = select ? select.options[select.selectedIndex].text : "";
        textoResumo += `\nCENA ${index + 1}: ${cena.titulo.toUpperCase()} (${cena.tipo})\nDificuldade: ${difLabel}\n`;
        if (cena.plot) textoResumo += `Enredo: ${cena.plot}\n`;
        textoResumo += `-----------------------------------\n`;
    });

    navigator.clipboard.writeText(textoResumo).then(() => {
        const btn = document.getElementById('btnCopiar');
        if (btn) {
            btn.innerText = "✅ Copiado!";
            btn.style.background = "#27ae60";
            setTimeout(() => {
                btn.innerText = "Copiar Texto";
                btn.style.background = "";
            }, 2000);
        }
    });
}

function renderizar() {
    const nivel = document.getElementById('selectNivel').value;
    const dif = calcularDificuldades(nivel);
    const container = document.getElementById('listaCenas');
    container.innerHTML = '';

    cenasAtuais.forEach((cena, index) => {
        const card = document.createElement('div');
        card.className = `cena-card border-${cena.tipo.toLowerCase()}`;
        card.dataset.cenaId = cena.id;
        const dSel = cena.dificuldadeSelecionada;
        let opcoes = "";

        // Lógica de Dificuldade (Combate, Boss ou Social/Exploração)
        if (cena.tipo === 'Combate') {
            opcoes = `<option value="cFacil" ${dSel === 'cFacil' ? 'selected' : ''}>Fácil (ND ${dif.cFacil})</option>
                      <option value="cNormal" ${dSel === 'cNormal' ? 'selected' : ''}>Normal (ND ${dif.cNormal})</option>
                      <option value="cDificil" ${dSel === 'cDificil' ? 'selected' : ''}>Difícil (ND ${dif.cDificil})</option>`;
        } else if (cena.tipo === 'Boss') {
            opcoes = `<option value="bFacil" ${dSel === 'bFacil' ? 'selected' : ''}>Fácil (ND ${dif.bFacil})</option>
                      <option value="bNormal" ${dSel === 'bNormal' ? 'selected' : ''}>Normal (ND ${dif.bNormal})</option>
                      <option value="bDificil" ${dSel === 'bDificil' ? 'selected' : ''}>Difícil (ND ${dif.bDificil})</option>`;
        } else {
            opcoes = `<option value="rotineiro" ${dSel === 'rotineiro' ? 'selected' : ''}>Rotineiro (CD ${dif.rotineiro})</option>
                      <option value="complexo" ${dSel === 'complexo' ? 'selected' : ''}>Complexo (CD ${dif.complexo})</option>
                      <option value="dificil" ${dSel === 'dificil' ? 'selected' : ''}>Difícil (CD ${dif.dificil})</option>`;
        }

        // NOVO: Sistema de seleção de fichas da biblioteca
        const selectFichasHtml = bibliotecaFichas.length > 0
            ? `<div class="inserir-ficha-wrap" onclick="event.stopPropagation()">
                <select id="sel-ficha-${cena.id}" class="select-fichas-cena">
                    <option value="">-- Selecionar Personagem --</option>
                    ${bibliotecaFichas.map(f => `<option value="${f.charName}">${f.charName}</option>`).join('')}
                </select>
                <button class="btn-inserir-ficha" onclick="inserirFichaSelecionadaNoPlot('${cena.id}')">🧙 Colar Ficha</button>
               </div>`
            : '<small style="color:#888; display:block; margin-bottom:10px;">Importe fichas na biblioteca para colar aqui.</small>';

        card.innerHTML = `
            <div class="drag-handle">⠿</div>
            <div class="cena-main" onclick="togglePlot('${cena.id}')">
                <div class="cena-header">
                    <div class="cena-info-container">
                        <span class="chevron-icon" id="chevron-${cena.id}">❯</span>
                        <div class="cena-textos">
                            <small>Cena ${index + 1} - ${cena.tipo}</small>
                            <input type="text" value="${cena.titulo}" onchange="editarTitulo('${cena.id}', this.value)" onclick="event.stopPropagation()" class="input-titulo">
                        </div>
                    </div>
                    <div class="cena-actions" onclick="event.stopPropagation()">
    ${(cena.tipo === 'Combate' || cena.tipo === 'Boss' || cena.tipo === 'Exploracao' || cena.tipo === 'Interpretacao') ? `<button class="btn-toggle-painel" onclick="togglePainel('${cena.id}')" title="Recolher/expandir painel lateral">◀</button>` : ''}
    <select data-id="${cena.id}" onchange="mudarDificuldadeCena('${cena.id}', this.value)" class="select-dificuldade">
                            ${opcoes}
                        </select>
                        <button onclick="removerCena('${cena.id}')" class="btn-remover">×</button>
                    </div>
                </div>
                <div id="plot-${cena.id}" class="cena-plot" onclick="event.stopPropagation()">
                    <div class="plot-container">
                        <textarea placeholder="Descreva o enredo da cena..." onchange="salvarPlot('${cena.id}', this.value)">${cena.plot || ''}</textarea>
                        
                        ${selectFichasHtml}

                        <div class="imagem-section">
                            <label class="imagem-section-label">Imagem da Cena:</label>
                            <div class="imagem-tabs">
                                <button class="imagem-tab ${!cena.imagemBase64 ? 'ativo' : ''}" 
                                    onclick="trocarAbaImagem('${cena.id}', 'url'); event.stopPropagation()">🔗 URL</button>
                                <button class="imagem-tab ${cena.imagemBase64 ? 'ativo' : ''}" 
                                    onclick="trocarAbaImagem('${cena.id}', 'upload'); event.stopPropagation()">📁 Upload Local</button>
                            </div>
                            <div id="img-url-${cena.id}" class="imagem-aba ${!cena.imagemBase64 ? 'ativa' : ''}">
                                <div class="image-input-wrapper">
                                    <input type="text" placeholder="Cole o link da imagem (http://...)" 
                                        value="${cena.imagem || ''}" 
                                        onchange="salvarImagemURL('${cena.id}', this.value)"
                                        onclick="event.stopPropagation()">
                                    ${cena.imagem && !cena.imagemBase64 ? `<button class="btn-remove-img" onclick="removerImagem('${cena.id}'); event.stopPropagation()">✖</button>` : ''}
                                </div>
                                <small class="imagem-aviso">⚠️ Links externos podem não aparecer no PDF por restrições do servidor. Use o upload local para garantir.</small>
                            </div>
                            <div id="img-upload-${cena.id}" class="imagem-aba ${cena.imagemBase64 ? 'ativa' : ''}">
                                <div class="upload-area" onclick="triggerUploadImagem('${cena.id}'); event.stopPropagation()">
                                    ${cena.imagemBase64
                ? `<span>✅ Imagem carregada · <span class="upload-trocar">Clique para trocar</span></span>`
                : `<span>📁 Clique para selecionar imagem do seu computador</span>`}
                                </div>
                                <input type="file" id="file-img-${cena.id}" accept="image/*" style="display:none"
                                    onchange="salvarImagemLocal('${cena.id}', this)" onclick="event.stopPropagation()">
                                ${cena.imagemBase64 ? `<button class="btn-remove-img" style="margin-top:6px;" onclick="removerImagem('${cena.id}'); event.stopPropagation()">✖ Remover imagem</button>` : ''}
                            </div>
                        </div>

                        ${(cena.imagemBase64 || cena.imagem) ? `
                        <div class="plot-preview-img">
                            <img src="${cena.imagemBase64 || cena.imagem}" alt="Preview"
                                onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                            <div class="img-error-msg" style="display:none;">
                                ⚠️ Imagem não pôde ser carregada. Verifique a URL ou use o upload local.
                            </div>
                        </div>` : ''}
                    </div>
                </div>
            </div>
            ${(cena.tipo === 'Combate' || cena.tipo === 'Boss') ? `
            <div class="tesouro-section" onclick="event.stopPropagation()">
                <div class="tesouro-controles">
                    <span class="tesouro-label">🏆 Tesouro:</span>
                    <select id="tesouro-mod-${cena.id}" class="tesouro-mod-select" title="Modificador de tesouro da criatura">
                        <option value="nenhum">Nenhum</option>
                        <option value="metade">Metade</option>
                        <option value="padrao" selected>Padrão</option>
                        <option value="dobro">Dobro</option>
                    </select>
                    <button class="btn-rolar-tesouro" onclick="rolarTesouro('${cena.id}')">🎲 Rolar</button>
                    ${cena.tesouros ? `
                    <button class="btn-inserir-tesouro-plot" onclick="inserirTesourNoPlot('${cena.id}')" title="Inserir resultado no enredo">📋 Enredo</button>
                    <button class="btn-limpar-tesouro" onclick="limparTesouro('${cena.id}')" title="Limpar resultado">✖</button>` : ''}
                </div>
                <div id="tesouro-resultado-${cena.id}" class="tesouro-resultado ${cena.tesouros ? 'visivel' : ''}">${cena.tesouros ? cena.tesouros.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') : ''}</div>
            </div>` : ''}
            ${(cena.tipo === 'Exploracao' || cena.tipo === 'Interpretacao') ? `
            <div class="perigo-section" onclick="event.stopPropagation()">
                <div class="perigo-controles">
                    <span class="perigo-label">⚠️ Perigo Complexo:</span>
                    <button class="btn-buscar-perigo" onclick="abrirModalPerigos('${cena.id}')">🔍 Buscar Perigo</button>
                    ${cena.perigoSelecionado ? `<button class="btn-limpar-perigo" onclick="limparPerigo('${cena.id}')">✖ Remover</button>` : ''}
                </div>
                ${cena.perigoSelecionado ? `
                <div class="perigo-mini-card">
                    <div class="perigo-mini-info">
                        <strong class="perigo-mini-nome">${cena.perigoSelecionado.nome}</strong>
                        <div class="perigo-mini-tags">
                            <span class="ptag ptag-nd">ND ${cena.perigoSelecionado.nd}</span>
                            <span class="ptag ptag-tipo">${cena.perigoSelecionado.tipo}</span>
                            <span class="ptag ptag-origem">${cena.perigoSelecionado.origem}</span>
                        </div>
                    </div>
                    <button class="btn-inserir-perigo-plot" onclick="inserirPerigoNoPlot('${cena.id}')" title="Inserir texto do perigo no enredo">📋 Inserir no Enredo</button>
                </div>` : ''}
            </div>` : ''}`;
        container.appendChild(card);
    });
    atualizarResumo();
}

function salvarDados() {
    localStorage.setItem('t20_missoes_cenas', JSON.stringify(cenasAtuais));
    localStorage.setItem('t20_missoes_nivel', document.getElementById('selectNivel').value);
    localStorage.setItem('t20_missoes_nome', document.getElementById('nomeMissao').value);
}

function carregarDados() {
    const cenasSalvas = localStorage.getItem('t20_missoes_cenas');
    const nivelSalvo = localStorage.getItem('t20_missoes_nivel');
    if (cenasSalvas) cenasAtuais = JSON.parse(cenasSalvas);
    if (nivelSalvo) document.getElementById('selectNivel').value = nivelSalvo;
    const nomeSalvo = localStorage.getItem('t20_missoes_nome');
    if (nomeSalvo) document.getElementById('nomeMissao').value = nomeSalvo;
    // Carrega ficha ativa
    // No carregarDados()
    try {
        const fichasSalvas = localStorage.getItem('t20_biblioteca_fichas');
        if (fichasSalvas) bibliotecaFichas = JSON.parse(fichasSalvas);
    } catch (e) { bibliotecaFichas = []; }
    renderizarBibliotecaFichas();
    renderizar();
}

function gerarSugestao(tipoEstrutura) {
    const estrutura = CONFIG_T20.estruturas[tipoEstrutura];
    cenasAtuais = estrutura.map(tipo => ({
        id: "id-" + Date.now() + Math.random().toString(36).substr(2, 9),
        tipo: tipo, titulo: CONFIG_T20.bancoCenas[tipo][Math.floor(Math.random() * CONFIG_T20.bancoCenas[tipo].length)],
        dificuldadeSelecionada: (tipo === "Boss") ? "bNormal" : (tipo === "Combate") ? "cNormal" : "complexo", plot: ""
    }));
    renderizar(); salvarDados();
}

function adicionarCena(tipo) {
    cenasAtuais.push({
        id: "id-" + Date.now() + Math.random().toString(36).substr(2, 9),
        tipo: tipo, titulo: CONFIG_T20.bancoCenas[tipo][Math.floor(Math.random() * CONFIG_T20.bancoCenas[tipo].length)],
        dificuldadeSelecionada: (tipo === "Boss") ? "bNormal" : (tipo === "Combate") ? "cNormal" : "complexo", plot: ""
    });
    renderizar(); salvarDados();
}

function removerCena(id) { cenasAtuais = cenasAtuais.filter(c => c.id !== id); renderizar(); salvarDados(); }
function editarTitulo(id, novo) { const c = cenasAtuais.find(x => x.id === id); if (c) { c.titulo = novo; salvarDados(); } }
function mudarDificuldadeCena(id, d) { const c = cenasAtuais.find(x => x.id === id); if (c) { c.dificuldadeSelecionada = d; renderizar(); salvarDados(); } }
function salvarPlot(id, t) { const c = cenasAtuais.find(x => x.id === id); if (c) { c.plot = t; salvarDados(); } }
function togglePlot(id) { const el = document.getElementById(`plot-${id}`); if (el) el.classList.toggle('aberto'); }
function atualizarCenasExistentes() {
    renderizar();
    salvarDados();
    if (cenasAtuais.length > 0) {
        const nivel = document.getElementById('selectNivel').value;
        mostrarToast(`⚔️ Nível ${nivel}: valores de CD/ND atualizados!`, 'aviso');
    }
}

function togglePainel(cenaId) {
    const card = document.querySelector(`[data-cena-id="${cenaId}"]`);
    if (!card) return;
    const painel = card.querySelector('.tesouro-section, .perigo-section');
    const btn = card.querySelector('.btn-toggle-painel');
    if (!painel) return;
    const recolhido = painel.classList.toggle('recolhido');
    if (btn) btn.textContent = recolhido ? '▶' : '◀';
}

function limparTudo() {
    if (confirm("⚠️ Isso apagará TODAS as cenas da missão atual. Deseja continuar?")) {
        cenasAtuais = [];
        localStorage.removeItem('t20_missoes_cenas');
        renderizar();
    }
}

function calcularDesgaste() {
    let p = 0;
    cenasAtuais.forEach(c => {
        const d = c.dificuldadeSelecionada;
        if (d === 'bDificil') p += 5; else if (d === 'bNormal' || d === 'cDificil') p += 4;
        else if (d === 'bFacil' || d === 'cNormal') p += 3; else if (d === 'cFacil' || d === 'dificil') p += 2;
        else if (d === 'complexo') p += 1.5; else p += 0.5;
    });
    if (p > 12) return { texto: "Letal", cor: "#c0392b" };
    if (p > 8) return { texto: "Perigosa", cor: "#d35400" };
    if (p > 4) return { texto: "Moderada", cor: "#e67e22" };
    return { texto: "Tranquila", cor: "#27ae60" };
}

function atualizarResumo() {
    const res = document.getElementById('resumoMissao');
    if (!res) return;
    if (cenasAtuais.length === 0) { res.innerHTML = ""; return; }
    const s = calcularDesgaste();
    const niveis = ['Tranquila', 'Moderada', 'Perigosa', 'Letal'];
    const nivel = niveis.indexOf(s.texto) + 1;
    const pontos = [1, 2, 3, 4].map(i =>
        `<span class="intensidade-ponto ${i <= nivel ? 'ativo' : ''}"></span>`
    ).join('');
    res.innerHTML = `
        <div class="status-bar" style="background-color: ${s.cor}">
            <div style="display:flex; align-items:center; gap:12px;">
                <strong>Intensidade:</strong>
                <span>${s.texto}</span>
                <div class="intensidade-pontos">${pontos}</div>
            </div>
            <span>(${cenasAtuais.length} Cena${cenasAtuais.length !== 1 ? 's' : ''})</span>
        </div>`;
}

async function exportarPDF() {
    const nomeAventura = document.getElementById('nomeMissao').value || "Missão T20";
    const nivel = document.getElementById('selectNivel').value;
    const elemento = document.createElement('div');
    elemento.style.padding = "0px";
    elemento.style.color = "#000";

    showLoading();

    // Resolve a imagem de cada cena:
    // 1. Se tiver base64 local → usa direto (100% garantido no PDF)
    // 2. Se tiver URL → tenta converter (pode falhar por CORS)
    const imagensResolvidas = {};
    for (const cena of cenasAtuais) {
        if (cena.imagemBase64) {
            imagensResolvidas[cena.id] = cena.imagemBase64;
        } else if (cena.imagem) {
            imagensResolvidas[cena.id] = await imagemParaBase64(cena.imagem);
        }
    }

    let conteudoCenas = "";
    cenasAtuais.forEach((cena, index) => {
        const select = document.querySelector(`select[data-id="${cena.id}"]`);
        const difLabel = select ? select.options[select.selectedIndex].text : "";
        const imgSrc = imagensResolvidas[cena.id];
        const temImagem = cena.imagemBase64 || cena.imagem;

        const imgHtml = imgSrc
            ? `<img src="${imgSrc}" style="width:100%; max-height:400px; object-fit:contain; border-radius:5px; margin-top:10px; display:block;">`
            : (temImagem ? `<p style="color:#aaa; font-size:9pt; font-style:italic; margin-top:8px;">⚠️ Imagem não disponível no PDF — use o upload local para garantir.</p>` : '');

        conteudoCenas += `
            <div style="margin-bottom:30px; padding:15px; border:1px solid #eee; border-radius:10px; page-break-inside:avoid;">
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #8b0000; margin-bottom:10px; padding-bottom:6px;">
                    <strong style="font-family:'Tormenta',serif; font-size:1.3rem;">CENA ${index + 1}: ${cena.titulo.toUpperCase()}</strong>
                    <span style="font-weight:bold; color:#444;">${difLabel}</span>
                </div>
                <p style="margin:10px 0; font-size:11pt; line-height:1.6; white-space:pre-wrap;">${cena.plot || '<i>Sem enredo definido.</i>'}</p>
                ${imgHtml}
            </div>`;
    });

    elemento.innerHTML = `
        <div style="padding:20px; font-family:Georgia,serif;">
            <h1 style="color:#8b0000; font-family:'Tormenta',serif; text-align:center; margin:0 0 5px 0; font-size:2.5rem;">${nomeAventura.toUpperCase()}</h1>
            <p style="text-align:center; font-weight:bold; margin:0 0 20px 0; color:#555;">Nível do Grupo: ${nivel}</p>
            <div style="margin-bottom:20px;">${document.getElementById('resumoMissao').innerHTML}</div>
            ${conteudoCenas}
        </div>`;

    const opt = {
        margin: [10, 10, 10, 10],
        filename: `${nomeAventura.replace(/\s+/g, '_')}_Nivel_${nivel}.pdf`,
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: false, allowTaint: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };

    html2pdf().set(opt).from(elemento).save().then(() => {
        hideLoading();
        mostrarToast('📄 PDF exportado com sucesso!', 'sucesso');
    }).catch(err => {
        console.error(err);
        hideLoading();
        mostrarToast('❌ Erro ao gerar PDF. Verifique o console.', 'erro');
    });
}

// ─── FUNÇÕES DE IMAGEM ───────────────────────────────────────────────────────

function trocarAbaImagem(id, aba) {
    const abaUrl = document.getElementById(`img-url-${id}`);
    const abaUpload = document.getElementById(`img-upload-${id}`);
    const tabs = document.querySelectorAll(`#plot-${id} .imagem-tab`);
    if (!abaUrl || !abaUpload) return;
    abaUrl.classList.toggle('ativa', aba === 'url');
    abaUpload.classList.toggle('ativa', aba === 'upload');
    tabs[0]?.classList.toggle('ativo', aba === 'url');
    tabs[1]?.classList.toggle('ativo', aba === 'upload');
}

function triggerUploadImagem(id) {
    const input = document.getElementById(`file-img-${id}`);
    if (input) input.click();
}

function salvarImagemURL(id, url) {
    const cena = cenasAtuais.find(c => c.id === id);
    if (!cena) return;
    if (url && !(url.startsWith('http://') || url.startsWith('https://'))) {
        mostrarToast('URL inválida. Use http:// ou https://', 'aviso');
        return;
    }
    cena.imagem = url;
    cena.imagemBase64 = null; // URL override limpa o base64
    renderizar();
    salvarDados();
}

function salvarImagemLocal(id, input) {
    const file = input.files[0];
    if (!file) return;
    const maxMB = 3;
    if (file.size > maxMB * 1024 * 1024) {
        mostrarToast(`Imagem muito grande. Limite: ${maxMB}MB.`, 'aviso');
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
        const cena = cenasAtuais.find(c => c.id === id);
        if (!cena) return;
        cena.imagemBase64 = e.target.result; // data:image/...;base64,...
        cena.imagem = '';
        renderizar();
        salvarDados();
        mostrarToast('✅ Imagem carregada localmente!', 'sucesso');
    };
    reader.onerror = () => mostrarToast('Erro ao ler o arquivo de imagem.', 'erro');
    reader.readAsDataURL(file);
}

function removerImagem(id) {
    const cena = cenasAtuais.find(c => c.id === id);
    if (cena) {
        cena.imagem = '';
        cena.imagemBase64 = null;
        renderizar();
        salvarDados();
    }
}

// CAMPANHA

function salvarAventuraNaCampanha() {
    const nome = document.getElementById('nomeMissao').value || "Missão Sem Nome";
    const nivel = document.getElementById('selectNivel').value;

    const novaAventura = {
        idCampanha: "camp-" + Date.now(),
        nome: nome,
        nivel: nivel,
        cenas: JSON.parse(JSON.stringify(cenasAtuais)),
        intensidade: calcularDesgaste()
    };

    campanha.push(novaAventura);
    localStorage.setItem('t20_campanha', JSON.stringify(campanha));
    renderizarCampanha();
    mostrarToast(`💾 "${nome}" salva na campanha!`, 'sucesso');
}

function renderizarCampanha() {
    const container = document.getElementById('abasCampanha');
    const actions = document.getElementById('campanhaActions');
    container.innerHTML = '';

    if (campanha.length > 0) actions.style.display = 'flex';
    else actions.style.display = 'none';

    campanha.forEach(adv => {
        const tab = document.createElement('div');
        tab.className = 'tab-missao';
        tab.dataset.id = adv.idCampanha;
        tab.innerHTML = `
        <div class="tab-titulo" onclick="carregarMissaoDaCampanha('${adv.idCampanha}')" title="Clique para carregar">
            📜 ${adv.nome} <small>(NV ${adv.nivel})</small>
        </div>
        <div class="tab-btns">
            <button class="btn-tab-update" onclick="atualizarMissaoDaCampanha('${adv.idCampanha}')" title="Atualizar">🔄</button>
            <button class="btn-tab-copy" onclick="duplicarMissaoCampanha('${adv.idCampanha}')" title="Duplicar">📋</button>
            <button class="btn-tab-delete" onclick="removerDaCampanha('${adv.idCampanha}')" title="Remover">×</button>
        </div>
    `;
        container.appendChild(tab);
    });
}

function removerDaCampanha(id) {
    campanha = campanha.filter(a => a.idCampanha !== id);
    localStorage.setItem('t20_campanha', JSON.stringify(campanha));
    renderizarCampanha();
}

function carregarCampanha() {
    const salva = localStorage.getItem('t20_campanha');
    if (salva) {
        try {
            campanha = JSON.parse(salva);
            renderizarCampanha();
        } catch (e) {
            console.error("Erro ao carregar campanha:", e);
            campanha = [];
        }
    }
}

async function exportarCampanhaPDF() {
    showLoading();

    // Resolve imagens: base64 local tem prioridade; URL tenta conversão
    for (const adv of campanha) {
        for (const cena of adv.cenas) {
            if (cena.imagemBase64) {
                cena._imgResolvida = cena.imagemBase64;
            } else if (cena.imagem && !cena._imgResolvida) {
                cena._imgResolvida = await imagemParaBase64(cena.imagem);
            }
        }
    }

    const elemento = document.createElement('div');
    elemento.style.padding = "20px";

    let htmlCompleto = `<h1 style="text-align:center; color:#8b0000; font-family:'Tormenta'; font-size:3rem;">DIÁRIO DE CAMPANHA</h1><hr>`;

    campanha.forEach((adv, i) => {
        htmlCompleto += `
            <div style="page-break-before:always; padding-top:20px;">
                <h2 style="color:#8b0000; font-family:'Tormenta';">Capítulo ${i + 1}: ${adv.nome}</h2>
                <p>Nível Recomendado: ${adv.nivel} | Intensidade: ${adv.intensidade.texto}</p>
                <div style="margin-top:20px;">`;

        adv.cenas.forEach((cena, idx) => {
            const imgSrc = cena._imgResolvida;
            const temImagem = cena.imagemBase64 || cena.imagem;
            const imgHtml = imgSrc
                ? `<img src="${imgSrc}" style="width:100%; border-radius:5px; max-height:300px; object-fit:contain; display:block;">`
                : (temImagem ? `<p style="color:#aaa; font-size:9pt; font-style:italic;">⚠️ Imagem não disponível — use upload local para garantir.</p>` : '');
            htmlCompleto += `
                <div style="margin-bottom:20px; border:1px solid #eee; padding:12px; page-break-inside:avoid; border-radius:8px;">
                    <strong style="font-size:1.1rem;">Cena ${idx + 1}: ${cena.titulo}</strong>
                    <p style="white-space:pre-wrap; line-height:1.5; margin:8px 0;">${cena.plot || 'Sem enredo.'}</p>
                    ${imgHtml}
                </div>`;
        });

        htmlCompleto += `</div></div>`;
    });

    elemento.innerHTML = htmlCompleto;

    const opt = {
        margin: 10,
        filename: 'Campanha_T20_Completa.pdf',
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
        html2canvas: { scale: 2, useCORS: false, allowTaint: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(elemento).save().then(() => {
        hideLoading();
        mostrarToast('📚 Campanha exportada com sucesso!', 'sucesso');
    }).catch(err => {
        console.error(err);
        hideLoading();
        mostrarToast('❌ Erro ao gerar PDF da campanha.', 'erro');
    });
}

function carregarMissaoDaCampanha(id) {
    const aventura = campanha.find(a => a.idCampanha === id);
    if (aventura) {
        if (cenasAtuais.length > 0) {
            const confirmar = confirm("Isso substituirá a missão atual na tela. Deseja continuar?");
            if (!confirmar) return;
        }
        cenasAtuais = JSON.parse(JSON.stringify(aventura.cenas));
        document.getElementById('nomeMissao').value = aventura.nome;
        document.getElementById('selectNivel').value = aventura.nivel;
        renderizar();
        salvarDados();
    }
}

function atualizarMissaoDaCampanha(id) {
    const aventura = campanha.find(a => a.idCampanha === id);
    if (aventura) {
        const confirmar = confirm(`Atualizar "${aventura.nome}" com os dados atuais da tela?`);
        if (confirmar) {
            aventura.nome = document.getElementById('nomeMissao').value;
            aventura.nivel = document.getElementById('selectNivel').value;
            aventura.cenas = JSON.parse(JSON.stringify(cenasAtuais));
            aventura.intensidade = calcularDesgaste();
            localStorage.setItem('t20_campanha', JSON.stringify(campanha));
            renderizarCampanha();
            mostrarToast(`🔄 "${aventura.nome}" atualizada com sucesso!`, 'sucesso');
        }
    }
}

function duplicarMissaoCampanha(id) {
    const original = campanha.find(a => a.idCampanha === id);
    if (original) {
        const copia = JSON.parse(JSON.stringify(original));
        copia.idCampanha = "camp-" + Date.now() + Math.random().toString(36).substr(2, 4);
        copia.nome = copia.nome + " (Cópia)";
        campanha.push(copia);
        localStorage.setItem('t20_campanha', JSON.stringify(campanha));
        renderizarCampanha();
        mostrarToast(`📋 "${copia.nome}" duplicada!`, 'info');
    }
}

function limparCampanha() {
    if (confirm("⚠️ Isso apagará TODAS as missões salvas na campanha. Deseja continuar?")) {
        campanha = [];
        localStorage.removeItem('t20_campanha');
        renderizarCampanha();
        mostrarToast('🗑️ Campanha removida.', 'aviso');
    }
}

// ===== IMPORTAR / EXPORTAR JSON =====

function exportarCampanhaJSON() {
    if (campanha.length === 0) {
        mostrarToast('Nenhuma missão para exportar.', 'aviso');
        return;
    }
    const json = JSON.stringify(campanha, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campanha_t20_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    mostrarToast(`📦 Campanha exportada (${campanha.length} missões)!`, 'sucesso');
}

function importarCampanhaJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const dados = JSON.parse(ev.target.result);
                if (!Array.isArray(dados)) throw new Error('O arquivo não contém uma lista de missões válida.');
                const confirmar = campanha.length > 0
                    ? confirm(`Isso substituirá as ${campanha.length} missões atuais pelas ${dados.length} do arquivo. Deseja continuar?`)
                    : true;
                if (!confirmar) return;
                campanha = dados;
                localStorage.setItem('t20_campanha', JSON.stringify(campanha));
                renderizarCampanha();
                mostrarToast(`✅ ${dados.length} missões importadas!`, 'sucesso');
            } catch (err) {
                mostrarToast('❌ Erro ao importar: arquivo JSON inválido.', 'erro');
                console.error('Erro ao importar JSON:', err);
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

// ===== FICHA DE PERSONAGEM =====

function importarFicha() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const dados = JSON.parse(ev.target.result);
                if (!dados.charName) throw new Error('Ficha inválida.');

                // Evita duplicados pelo nome
                bibliotecaFichas = bibliotecaFichas.filter(f => f.charName !== dados.charName);
                bibliotecaFichas.push(dados);

                localStorage.setItem('t20_biblioteca_fichas', JSON.stringify(bibliotecaFichas));
                renderizarBibliotecaFichas();
                renderizar(); // Atualiza os selects nas cenas
                mostrarToast(`🧙 ${dados.charName} adicionado à biblioteca!`, 'sucesso');
            } catch (err) {
                mostrarToast('❌ Erro ao importar ficha.', 'erro');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

function removerFichaDaBiblioteca(nome) {
    bibliotecaFichas = bibliotecaFichas.filter(f => f.charName !== nome);
    localStorage.setItem('t20_biblioteca_fichas', JSON.stringify(bibliotecaFichas));
    renderizarBibliotecaFichas();
    renderizar();
    mostrarToast('Ficha removida.', 'aviso');
}

function renderizarBibliotecaFichas() {
    const container = document.getElementById('listaFichasBiblioteca');
    if (!container) return;
    if (bibliotecaFichas.length === 0) {
        container.innerHTML = '<span class="ficha-vazia">Nenhuma ficha carregada.</span>';
        return;
    }

    container.innerHTML = bibliotecaFichas.map(f => {
        const def = calcularDefesaFicha(f);
        return `
        <div class="ficha-badge" style="margin-bottom:8px;">
            <div class="ficha-badge-info">
                <span class="ficha-nome">🧙 ${f.charName}</span>
                <span class="ficha-detalhe">Nv.${f.charLevel} · Def ${def} · PV ${f.status.pvM}</span>
            </div>
            <button onclick="removerFichaDaBiblioteca('${f.charName}')" class="btn-remove-ficha">✖</button>
        </div>`;
    }).join('');
}

function removerFicha() {
    fichaAtiva = null;
    localStorage.removeItem('t20_ficha_ativa');
    renderizarFichaAtiva();
    renderizar();
    mostrarToast('Ficha removida.', 'aviso');
}

function renderizarFichaAtiva() {
    const container = document.getElementById('fichaAtivaInfo');
    if (!container) return;
    if (!fichaAtiva) {
        container.innerHTML = '<span class="ficha-vazia">Nenhuma ficha carregada.</span>';
        return;
    }
    const f = fichaAtiva;
    const def = calcularDefesaFicha(f);
    container.innerHTML = `
        <div class="ficha-badge">
            <div class="ficha-badge-info">
                <span class="ficha-nome">🧙 ${f.charName}</span>
                <span class="ficha-detalhe">${f.charRace} · ${f.charClass} Nv.${f.charLevel} · PV ${f.status.pvM} · PM ${f.status.pmM} · Def ${def}</span>
            </div>
            <button onclick="removerFicha()" class="btn-remove-ficha" title="Remover ficha ativa" aria-label="Remover ficha ativa">✖</button>
        </div>`;
}

function calcularDefesaFicha(f) {
    // Cálculo simplificado da defesa T20
    const attrKey = f.defense?.config?.attr || 'DES';
    const attrVal = parseInt(f.attrs[attrKey]) || 0;
    const armorBonus = parseInt(f.defense?.armor?.bonus) || 0;
    const shieldBonus = parseInt(f.defense?.shield?.bonus) || 0;
    const outrosBonus = (f.defense?.other || []).reduce((acc, o) => acc + (parseInt(o.bonus) || 0), 0);
    const nivel = parseInt(f.charLevel) || 1;
    const metadeNivel = Math.floor(nivel / 2);
    return 10 + attrVal + armorBonus + shieldBonus + outrosBonus + metadeNivel;
}

function gerarResumoFicha() {
    if (!fichaAtiva) return '';
    const f = fichaAtiva;
    const a = f.attrs;

    // Atributos com sinal
    const fmt = (v) => { const n = parseInt(v); return (n >= 0 ? '+' : '') + n; };
    const attrStr = `FOR${fmt(a.FOR)} DES${fmt(a.DES)} CON${fmt(a.CON)} INT${fmt(a.INT)} SAB${fmt(a.SAB)} CAR${fmt(a.CAR)}`;

    // Perícias treinadas
    const periciasT = (f.skills || []).filter(s => s.trained).map(s => s.n).join(', ');

    // Ataques
    const ataques = (f.attacks || []).map(a => {
        const crit = a.critRange && a.critRange !== '20' ? ` (ameaça ${a.critRange}-20)` : '';
        return `${a.name.trim()} +${a.bonus} · ${a.dmg}${crit}`;
    }).join('\n  ');

    // Armadura
    const arm = f.defense?.armor?.name ? `${f.defense.armor.name} (Def +${f.defense.armor.bonus})` : 'Sem armadura';

    // Defesa calculada
    const def = calcularDefesaFicha(f);

    // Poderes relevantes (resumo curto)
    const poderes = [...(f.classAbilities || []), ...(f.raceAbilities || [])]
        .slice(0, 6)
        .map(p => `• ${p.name}`)
        .join('\n  ');

    return `━━━ FICHA: ${f.charName} ━━━
Raça: ${f.charRace} | Origem: ${f.charOrigin} | Classe: ${f.charClass} Nv.${f.charLevel}
Atributos: ${attrStr}
PV: ${f.status.pvM} | PM: ${f.status.pmM} | Defesa: ${def} | Armadura: ${arm}
Perícias Treinadas: ${periciasT}
Ataque:
  ${ataques || 'Nenhum'}
Habilidades:
  ${poderes || 'Nenhuma'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}

function inserirResumoFichaNoPlot(id) {
    const cena = cenasAtuais.find(c => c.id === id);
    if (!cena) return;
    if (!fichaAtiva) {
        mostrarToast('Importe uma ficha primeiro.', 'aviso');
        return;
    }
    const resumo = gerarResumoFicha();
    cena.plot = (cena.plot ? cena.plot + '\n\n' : '') + resumo;
    salvarDados();
    renderizar();
    // Reabre o plot após o re-render
    setTimeout(() => {
        const plotEl = document.getElementById(`plot-${id}`);
        if (plotEl && !plotEl.classList.contains('aberto')) plotEl.classList.add('aberto');
    }, 50);
    mostrarToast(`📋 Resumo de ${fichaAtiva.charName} inserido!`, 'sucesso');
}

function inserirFichaSelecionadaNoPlot(cenaId) {
    const select = document.getElementById(`sel-ficha-${cenaId}`);
    const nomeSelecionado = select.value;

    if (!nomeSelecionado) {
        mostrarToast('Selecione uma ficha na lista.', 'aviso');
        return;
    }

    const ficha = bibliotecaFichas.find(f => f.charName === nomeSelecionado);
    const cena = cenasAtuais.find(c => c.id === cenaId);

    if (ficha && cena) {
        // CORREÇÃO: Definimos a fichaAtiva para que o gerarResumoFicha() a encontre
        fichaAtiva = ficha;
        const resumo = gerarResumoFicha();

        // Adiciona o resumo ao enredo
        cena.plot = (cena.plot ? cena.plot + '\n\n' : '') + resumo;

        salvarDados();
        renderizar();

        // Reabre o enredo para mostrar o resultado
        setTimeout(() => {
            const plotEl = document.getElementById(`plot-${cenaId}`);
            if (plotEl) plotEl.classList.add('aberto');
        }, 50);

        mostrarToast(`📋 Ficha de ${nomeSelecionado} colada!`, 'sucesso');

        // Opcional: limpa a fichaAtiva após o uso se não quiser que ela apareça no painel fixo
        fichaAtiva = null;
    }
}

// Seleciona arquivo de imagem local, converte para base64 e salva na cena
function selecionarArquivoImagem(cenaId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Valida tamanho (opcional, máximo 5MB)
        if (file.size > 5 * 1024 * 1024) {
            mostrarToast('❌ Imagem muito grande (máx 5MB).', 'erro');
            return;
        }

        // Converte para base64
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const base64 = ev.target.result;
            // Salva a imagem (já em base64)
            const cena = cenasAtuais.find(c => c.id === cenaId);
            if (cena) {
                cena.imagem = base64;
                cena.imagemIsBase64 = true; // marca para uso futuro
                salvarDados();
                renderizar(); // recria o card para mostrar preview
                mostrarToast('✅ Imagem inserida com sucesso!', 'sucesso');
            }
        };
        reader.onerror = () => mostrarToast('❌ Erro ao ler o arquivo.', 'erro');
        reader.readAsDataURL(file);
    };
    input.click();
} const PERIGOS_DATA = [
    {
        origem: "Tormenta 20 JdA", nd: "4", tipo: "Desastre Natural", nome: "Avalanche", imagem: "https://i.gifer.com/7Npe.gif", efeito: `      <strong>Objetivo:</strong> Escapar da avalanche.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>O grupo tem <strong>5 rodadas</strong> para se afastar dos escombros.</li>
        <li>Ao final, a posição de cada personagem é determinada pelos <strong>sucessos acumulados</strong> nas ações <em>Correr</em> ou <em>Carregar Outro</em>:</li>
        <ul>
          <li><strong>2 ou menos sucessos:</strong> Fica na <strong>zona de soterramento</strong> e sofre <strong>16d6 de dano de impacto</strong>, ficando <strong>soterrado</strong>.</li>
          <li><strong>3 ou 4 sucessos:</strong> Fica na <strong>zona de deslizamento</strong> e sofre <strong>8d6 de dano de impacto</strong>.</li>
          <li><strong>5 ou mais sucessos:</strong> <strong>Escapa ileso</strong>.</li>
        </ul>
      </ul>
      <hr>
      <ul>
        <li><strong>Percepção:</strong> Um teste de <strong>Sobrevivência (CD 20)</strong> permite perceber a avalanche. Sucesso concede uma <strong>ação adicional</strong> na primeira rodada.</li>
        <li><strong>Soterrado:</strong> Um personagem soterrado:
          <ul>
            <li>Fica <strong>imóvel</strong>.</li>
            <li>Sofre <strong>1d6 de dano</strong> no início de cada turno.</li>
            <li>Para se soltar (ou soltar um aliado), é necessário um teste de <strong>Força (CD 25)</strong>.</li>
            <li>Aliados podem ajudar (ver p. 221).</li>
          </ul>
        </li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Correr (Atletismo CD 20):</strong> Corre para longe da avalanche. Um sucesso com margem de 10+ ou um 20 natural conta como <strong>2 sucessos</strong>. Pode ser substituído por <em>Cavalgar</em> ou <em>Pilotagem</em>.</li>
        <li><strong>Carregar Outro (Atletismo CD 25):</strong> Carrega um aliado próximo. Se passar, <strong>ambos ganham 1 sucesso</strong>.</li>
        <li><strong>Procurar Caminho (Percepção CD 20):</strong> Analisa o terreno. Se passar, ganha <strong>+5</strong> nos testes de <em>Correr</em> e <em>Carregar Outro</em>.</li>
      </ul>`},
    {
        origem: "Tormenta 20 JdA", nd: "2", tipo: "Viagem", nome: "Jornada pelos Ermos", imagem: "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2863640/extras/MidnightWalk_potboyRun_600x338.gif?t=1742834125", efeito: `      <ul>
        <li><strong>Objetivo:</strong> Chegar ao destino.</li>
      </ul>
      <hr>
      <ul>
        <li>
          <strong>Efeito:</strong> O grupo deve acumular uma quantidade de <strong>sucessos</strong> em testes, conforme a distância da jornada:
          <ul>
            <li><strong>Curta:</strong> até outro reino na mesma região — <strong>3 testes</strong></li>
            <li><strong>Média:</strong> até outra região (ex: do Reinado às Repúblicas Livres) — <strong>5 testes</strong></li>
            <li><strong>Longa:</strong> até regiões longínquas (ex: Deserto da Perdição, Lamnor) — <strong>7 testes</strong></li>
          </ul>
          Para cada <strong>falha</strong>, os personagens sofrem <strong>2d6 pontos de dano</strong>, representando cansaço e desgaste. Esse dano só pode ser curado <strong>um dia após</strong> o fim da jornada.<br><br>
          Se o grupo acumular <strong>3 falhas</strong>, cada personagem perde <strong>1 PM máximo por nível</strong> na próxima aventura, como reflexo do esgotamento extremo.
        </li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li>
          <strong>Avançar (Sobrevivência ou outra, CD variável):</strong> Os personagens se revezam realizando testes até acumularem os sucessos exigidos (ou atingirem 3 falhas).
          <ul>
            <li>Os testes podem ser de <strong>Sobrevivência</strong> ou qualquer outra perícia que o jogador consiga justificar e o mestre aprove.</li>
            <li>Exemplos:
              <ul>
                <li><strong>Pilotagem:</strong> se o personagem tiver um veículo para levar o grupo.</li>
                <li><strong>Diplomacia:</strong> para pedir abrigo ou indicações (se houver pessoas no caminho).</li>
              </ul>
            </li>
            <li><strong>Nota:</strong> Cada perícia diferente de Sobrevivência só pode ser usada <strong>uma vez por jornada</strong>.</li>
          </ul>
        </li>
        <li>
          <strong>CD conforme o terreno:</strong>
          <ul>
            <li><strong>15</strong> – Planícies e colinas</li>
            <li><strong>20</strong> – Florestas e pântanos</li>
            <li><strong>25</strong> – Desertos ou montanhas</li>
            <li><strong>30</strong> – Regiões planares perigosas ou áreas de Tormenta</li>
          </ul>
        </li>
      </ul>
      <hr>
      <ul>
        <li>
          <strong>Nota para o Mestre:</strong> Este perigo é um <em>teste estendido</em>, utilizando a <strong>variante de testes abertos</strong> (veja p. 223). Recomendado usá-lo com as regras de “<strong>Jornadas em Montagem</strong>” (p. 267) para resolver viagens de forma ágil.
          <ul>
            <li>O grupo sempre <strong>chegará ao destino</strong> — o risco está no estado em que chegam.</li>
            <li>Para jornadas que possam <strong>falhar de verdade</strong>, considere reiniciar a viagem após 3 falhas, indicando que o grupo se perdeu e teve que retornar.</li>
            <li>Para aventuras mais detalhadas, é possível expandir este sistema com regras para mantimentos, encontros aleatórios, perigos ambientais, etc. Nesse caso, trata-se de uma aventura completa, e não apenas um perigo.</li>
          </ul>
        </li>
      </ul>`},
    {
        origem: "Tormenta 20 JdA", nd: "9", tipo: "Armadilha de Masmorra", nome: "Sala Esmagadora", imagem: "https://i.makeagif.com/media/1-13-2023/R9-LFa.gif", efeito: `      <strong>Objetivo:</strong> Abrir a porta e sair da sala ou desabilitar o mecanismo.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>O grupo cai em uma armadilha. A porta se fecha e as paredes se movem.</li>
        <li><strong>3 rodadas</strong> para escapar.</li>
        <li>Na <strong>quarta rodada</strong>: 10d6 de dano de impacto a todos que estiverem na sala.</li>
        <li>Na <strong>quinta rodada</strong>: morte instantânea a quem permanecer na sala.</li>
        <li><strong>Âncora Dimensional</strong>: bloqueia teleporte e viagens planares.</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Derrubar Porta (Força CD 30):</strong> Acumular <strong>3 sucessos</strong>. Máximo 2 personagens por rodada.</li>
        <li><strong>Desabilitar Mecanismo (Ladinagem CD 30):</strong> Acumular <strong>3 sucessos</strong> desativa o mecanismo permanentemente.</li>
        <li><strong>Segurar Paredes (Força CD 25):</strong> Cada <strong>2 sucessos</strong> concede <strong>+1 rodada extra</strong>.</li>
      </ul>`},
    {
        origem: "Tormenta 20 JdA", nd: "6", tipo: "Viagem Climática", nome: "Tempestade em Alto Mar", imagem: "https://gifdb.com/images/high/intense-sinking-ship-6umyix3jg0hqpj6l.webp", efeito: `    <strong>Objetivo:</strong> Sobreviver à fúria do mar.
    <hr>
    <strong>Efeito:</strong>
    <ul>
      <li>Duração: 1d6+6 rodadas.</li>
      <li>No início do turno, teste de Reflexos (CD 20 + 1d6):
        <ul>
          <li>Falha: sofre 4d6 de dano de impacto.</li>
          <li>Falha por 10 ou mais: dano + cair no mar.</li>
          <li>No mar: falha automática.</li>
        </ul>
      </li>
      <li><strong>Percepção (Sobrevivência CD 20):</strong> Concede ação adicional na primeira rodada.</li>
    </ul>
    <hr>
    <h6 class="text-danger"><strong>Testes:</strong></h6>
    <ul>
      <li><strong>Navegar (Pilotagem CD 25):</strong> Reduz a duração da tempestade.</li>
      <li><strong>Ajudar o Piloto (CD variável):</strong> Ajuda com qualquer perícia justificada.</li>
      <li><strong>Esconder-se:</strong> Reduz CD para Reflexos, mas impede ajudar ou pilotar.</li>
      <li><strong>Voltar para o Navio (Atletismo CD 25):</strong> Exige 2 sucessos. Falha por 5+: afunda.</li>
    </ul>`},
    {
        origem: "Ameaças de Arton", nd: "17", tipo: "Encontro em Viagem", nome: "Vagalhão Kobold", imagem: "https://i.imgflip.com/9q25pb.gif", efeito: `      <strong>Objetivo:</strong> Sobreviver ao frenesi selvagem.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>Duração: 1d8+6 rodadas.</li>
        <li>Teste de Fortitude (CD 40 + 1d10):
          <ul>
            <li>Falha: 12d12 de dano de corte.</li>
            <li>Falha por 5+: dano + fica caído.</li>
          </ul>
        </li>
        <li>Armadura avariada. Sem armadura: +2d12 de dano.</li>
        <li>No fim da rodada: role para roubo de itens mágicos.
          <ul>
            <li>CD para recuperar: Sobrevivência CD 35 + rodadas.</li>
            <li>25% de chance de destruição.</li>
          </ul>
        </li>
        <li><strong>Enxame:</strong> Imune a manobras, efeitos de alvo único, sofre metade de armas, vulnerável a dano em área.</li>
        <li><strong>600 de dano em 1 rodada:</strong> duração –1 rodada, próximo turno com dano reduzido e sem roubo/avaria.</li>
        <li><strong>Percepção (CD 35):</strong> Concede ação adicional.</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Atacar (Def 50):</strong> Sofre –5 à distância. Cada erro corpo a corpo: 4d12 de dano.</li>
        <li><strong>Conjurar (Vontade CD 35 + PM):</strong> Falha: perde PM e magia.</li>
        <li><strong>Esconder Item (Ladinagem CD 35):</strong> Usa 1d10 para checar roubo em vez do padrão.</li>
        <li><strong>Latir (Atuação ou Enganação CD 35):</strong> Imune a efeitos do vagalhão por 1 rodada, mas acumula –1 em perícias.</li>
        <li><strong>Levantar-se (Atletismo ou Acrobacia CD 35):</strong> Levanta-se da massa kobold.</li>
        <li><strong>Proteger-se:</strong> +5 no próximo teste de Fortitude.</li>
        <li><strong>Ajudar (CD variável):</strong> Usa qualquer perícia justificada para ajudar aliados.</li>
      </ul>`},
    {
        origem: "Ameaças de Arton", nd: "10", tipo: "Exploração Perigosa", nome: "Biblioteca em Ruínas", imagem: "https://media.tenor.com/Vs2yOGEQXMoAAAAM/dr-who-doctor-who.gif", efeito: `      <ul>
        <li><strong>Objetivo:</strong> Obter a informação necessária antes que a biblioteca desabe.</li>
      </ul>
      <hr>
      <ul>
        <li>
          <strong>Efeito:</strong> O grupo precisa acumular <strong>6 sucessos</strong> nas ações listadas em até <strong>4 rodadas</strong>.
          <ul>
            <li>Na <strong>5ª rodada</strong>, a biblioteca entra em colapso — quem estiver dentro sofre <strong>12d6 de dano de impacto</strong>.</li>
            <li>Na <strong>6ª rodada</strong>, ela desaba completamente — quem estiver dentro sofre <strong>20d6 de dano de impacto</strong>.</li>
          </ul>
          <br>
          <strong>Evento Aleatório (1d6 no início de cada rodada):</strong>
          <ul>
            <li><strong>1-3)</strong> <em>Desmoronamento de livros:</em> Estantes caem. Cada personagem sofre <strong>4d6 de dano de impacto</strong> (Reflexos CD 25 evita).</li>
            <li><strong>4)</strong> <em>Pequeno incêndio:</em> Qualquer personagem pode abrir mão da ação para apagá-lo (Destreza CD 15). Enquanto ativo, a CD de todos os testes aumenta em +2 por rodada.</li>
            <li><strong>5)</strong> <em>Fissura no chão:</em> Testar Acrobacia ou Atletismo (CD 25). Falha causa tropeço e penalidade de –5 na próxima ação.</li>
            <li><strong>6)</strong> <em>Bloqueio:</em> Um personagem aleatório enfrenta um desabamento. Pode desistir da ação ou testar Atletismo (CD 25). Se falhar, perde a ação e sofre 4d6 de dano.</li>
          </ul>
        </li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Usar Biblioteca (Investigação CD 22):</strong> Percorre os corredores em busca de livros úteis.</li>
        <li><strong>Ajuda Esotérica (Misticismo ou Religião CD 22):</strong> Para temas mágicos ou divinos.</li>
        <li><strong>Julgar pela Capa (Conhecimento CD 22):</strong> Busca títulos relacionados. Sucesso por 10+ (ou 20 natural) vale como dois sucessos.</li>
        <li><strong>Palpite Fortuito (Intuição CD 22):</strong> Usa intuição para escolher livros úteis.</li>
        <li><strong>Coordenar Pesquisa (Conhecimento CD 10):</strong> Ajuda os colegas. Não gera sucesso, mas dá bônus a todos na rodada.</li>
      </ul>`},
    {
        origem: "Ameaças de Arton", nd: "2", tipo: "Conflito Urbano", nome: "Briga de Taverna", imagem: "https://i.gifer.com/PNw.gif", efeito: `    <ul>
      <li><strong>Objetivo:</strong> Ficar de pé até o fim. A briga dura <strong>1d6+2 rodadas</strong>.</li>
    </ul>
    <hr>
    <ul>
      <li>
        <strong>Efeito:</strong> No início de cada rodada, todos sofrem <strong>2d6+4 de dano de impacto não letal</strong>.
        <ul>
          <li>Quem chegar a 0 PV ou menos não sofre mais dano (brigões têm princípios!).</li>
          <li>Dano letal atrai a ira geral: o personagem passa a sofrer <strong>+1d6+2</strong> de dano extra por rodada a cada uso de dano letal.</li>
        </ul>
      </li>
    </ul>
    <hr>
    <h6 class="text-danger"><strong>Ações:</strong></h6>
    <ul>
      <li><strong>Brigar (Defesa 16):</strong> Ataque. Se causar 15+ de dano, nocauteia o oponente mais próximo e <strong>não sofre dano</strong> na próxima rodada.</li>
      <li><strong>Apartar (Diplomacia ou Intimidação CD 20):</strong> Reduz a duração da briga em 1 rodada.</li>
      <li><strong>Bater Carteiras (Ladinagem CD 20):</strong> Rouba no caos. Sucesso: <strong>T$ 2d8</strong>. Falha por 5+ faz ser pego e sofrer <strong>+1d6 de dano</strong> na próxima rodada.</li>
      <li><strong>Lançar Magia (Von CD 15 + PM):</strong> Lança uma magia. Efeitos a critério do mestre.</li>
      <li><strong>Sair de Fininho (Furtividade CD 20):</strong> Tenta sair da confusão. Se passar, tem <strong>50% de chance</strong> (par no 1d6) de evitar dano na próxima rodada.</li>
    </ul>`},
    {
        origem: "Ameaças de Arton", nd: "5", tipo: "Fenômeno Mágico", nome: "Ciclone Arcano", imagem: "https://blogger.googleusercontent.com/img/b/R29vZ2xl/AVvXsEhjzp7giAy3f8O2R-3rtdMphmat2FeJ0gkl79PWjeaQ409pyQmRcnUw879LWOhkT5myzyGWOmbhZrED0OetkSd-Lq7fN1t4iJpHGkZyx_c-fj0Ltu8wjNMnx3qs7sACbzKjZY1C4zD9xaf2/s1600/c_scale%252Cfl_progressive%252Cq_80%252Cw_800.gif", efeito: `    <ul>
      <li><strong>Objetivo:</strong> Escapar do ciclone arcano.</li>
    </ul>
    <hr>
    <ul>
      <li>
        <strong>Efeito:</strong> Os personagens têm <strong>5 rodadas</strong> para acumular sucessos nas ações abaixo.
        <ul>
          <li><strong>2 ou menos sucessos:</strong> No centro. Sofre <strong>16d6 de dano de essência</strong> e perde <strong>4d4 PM</strong>.</li>
          <li><strong>3 ou 4 sucessos:</strong> Na orla. Sofre <strong>8d6 de dano de essência</strong> e perde <strong>2d4 PM</strong>.</li>
          <li><strong>5 ou mais sucessos:</strong> Escapa ileso.</li>
        </ul>
      </li>
    </ul>
    <hr>
    <ul>
      <li><strong>Aviso Prévio:</strong> Um teste de <strong>Misticismo (CD 20)</strong> detecta o fenômeno. Quem passar, age uma vez extra na primeira rodada.</li>
    </ul>
    <hr>
    <h6 class="text-danger"><strong>Ações:</strong></h6>
    <ul>
      <li><strong>Correr (Atletismo CD 20):</strong> Corre para longe. Sucesso por 10+ (ou 20 natural) conta como 2 sucessos. Pode ser substituído por Cavalgar ou Pilotagem.</li>
      <li><strong>Carregar Outro (Atletismo CD 25):</strong> Carrega um aliado próximo com no máximo 1 sucesso de diferença. Ambos ganham 1 sucesso.</li>
      <li><strong>Bloquear (Misticismo CD 15):</strong> Usa magia para conter os efeitos. Garante 1 sucesso. Só pode ser feito uma vez por personagem.</li>
      <li><strong>Resistir (Von CD 20):</strong> Tenta resistir aos efeitos em vez de fugir.</li>
    </ul>`},
    {
        origem: "Ameaças de Arton", nd: "8", tipo: "Desastre Urbano", nome: "Construção em Colapso", imagem: "https://media1.giphy.com/media/l0HlW0xP8iEILoy7m/giphy.gif", efeito: `      <strong>Objetivo:</strong> Escapar da construção antes que ela desabe completamente.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>Os personagens estão em uma vasta construção prestes a desabar.</li>
        <li>Eles têm <strong>7 rodadas</strong> para escapar, acumulando <strong>5 sucessos</strong> em ações de movimentação.</li>
        <li>No início de cada rodada, role <strong>1d6</strong> e aplique um dos efeitos abaixo:</li>
        <ul>
          <li><strong>1-2) Destroços:</strong> Reflexos CD 25. Falha: 4d6 de dano. Falha por 10+: 8d6.</li>
          <li><strong>3-4) Fenda no chão:</strong> Acrobacia ou Atletismo CD 25. Falha: -5 na próxima ação. Falha por 10+: perde a ação.</li>
          <li><strong>5) Bloqueio:</strong> Pode desistir (perde a ação) ou Atletismo CD 25. Falha: 8d6 de dano e perde a ação.</li>
          <li><strong>6) Explosão:</strong> Reflexos CD 30. Falha: 6d6 e -5 no próximo teste. Falha por 10+: 10d6 e perde a ação.</li>
        </ul>
        <li><strong>Rodada Final:</strong> Ao fim da 7ª rodada, quem não tiver 5 sucessos sofre <strong>20d6 de dano</strong>, sem direito a teste.</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Avançar (Acrobacia ou Reflexos CD 25):</strong> Move-se com cuidado. Sucesso por 10+ ou 20 natural: <strong>2 sucessos</strong>.</li>
        <li><strong>Correr (Atletismo CD 20):</strong> Corre ignorando perigos, sofre <strong>4d6 de dano</strong>. Sucesso por 10+ ou 20 natural: <strong>2 sucessos</strong>.</li>
        <li><strong>Carregar Outro (Atletismo CD 30):</strong> Leva um aliado (com até 1 sucesso de diferença). Ambos ganham <strong>1 sucesso</strong>. Falha: ambos sofrem dano.</li>
        <li><strong>Procurar Caminho (Percepção CD 20):</strong> Concede <strong>+5</strong> em todos os testes durante este perigo.</li>
      </ul>`},
    {
        origem: "Ameaças de Arton", nd: "3 a 11", tipo: "Perigo Ambiental", nome: "Grama Carnívora", imagem: "https://i.imgflip.com/9q2cvd.gif", efeito: `      <strong>Objetivo:</strong> Sair da área da grama carnívora antes de ser devorado.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>Ao entrar na clareira, os personagens pisam em uma vegetação pegajosa — uma aberração planar.</li>
        <li>A área pode ser pequena (3 sucessos, ND 3), média (5 sucessos, ND 6) ou extensa (7 sucessos, ND 11).</li>
        <li>A cada início de turno:
          <ul>
            <li>Sofrem <strong>1d6 de dano</strong> (ou 2d6/3d6 em áreas maiores).</li>
            <li>Fazem teste de Reflexos CD 20 (ou 25/30 em áreas maiores).</li>
            <li><strong>Falha:</strong> Ficam agarrados e só podem usar a ação <em>Libertar-se</em>.</li>
            <li>A cada rodada agarrado, o dano aumenta em <strong>+1d6</strong>.</li>
          </ul>
        </li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Fugir (Atletismo CD 20):</strong> Corre para fora da área. Sucesso por 10+ ou 20 natural: <strong>2 sucessos</strong>.</li>
        <li><strong>Libertar-se (Atletismo ou Acrobacia CD 20):</strong> Remove o estado de agarrado. Sucesso por 10+: ignora o teste da rodada.</li>
        <li><strong>Conjurar (Vontade CD 20 + PM):</strong> Tenta lançar uma magia. Falha: gasta os PM.</li>
        <li><strong>Atacar (Luta CD 20):</strong> Usa arma de corte para abrir caminho ou libertar aliado. Conta como <strong>1 sucesso</strong> em <em>Fugir</em>.</li>
        <li><strong>Analisar (Sobrevivência CD 20):</strong> Concede <strong>+2</strong> em todos os testes do grupo durante o perigo.</li>
        <li><strong>Identificação Inicial (Sobrevivência CD 20):</strong> Permite agir duas vezes no primeiro turno.</li>
      </ul>`},
    {
        origem: "Ameaças de Arton", nd: "4", tipo: "Desastre Urbano", nome: "Inundação de Esgoto", imagem: "https://static.wikia.nocookie.net/tmnt/images/2/25/Tumblr_135b9d62386351012b5902afe497fb53_dd46debc_400.gif", efeito: `      <strong>Objetivo:</strong> Sobreviver à inundação.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>Durante exploração subterrânea, uma enxurrada repentina atinge o grupo.</li>
        <li>Duração: <strong>1d4+4 rodadas</strong>.</li>
        <li><strong>Percepção CD 20</strong>: permite agir duas vezes no 1º turno.</li>
        <li>No início de cada rodada:
          <ul>
            <li>Role <strong>1d6</strong> e adicione o resultado à CD de todos os testes (obstáculos).</li>
          </ul>
        </li>
        <li>A água começa a <strong>6m</strong> dos personagens e avança 6m por rodada.</li>
        <li><strong>Alcançado:</strong> −2 nos testes de correr/carregar.</li>
        <li><strong>Ultrapassado:</strong> Engolfado, não pode correr/carregar, sofre <strong>4d6 de dano</strong> no fim do turno e precisa prender a respiração.</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Correr (Atletismo CD 20+1d6):</strong> Avança 6m. Sucesso por 10+ ou 20 natural: <strong>2 sucessos</strong>.</li>
        <li><strong>Carregar Outro (Atletismo CD 25+1d6):</strong> Leva um aliado (com até 1 sucesso de diferença). Ambos avançam 6m.</li>
        <li><strong>Evitar Colisão (Atletismo ou Reflexos CD 20+1d6):</strong> Reduz ou evita dano quando engolfado.</li>
        <li><strong>Agarrar-se (Atletismo CD 20+1d6):</strong> Só disponível após sucesso em evitar colisão. Evita dano e mantém a ação nas próximas rodadas.</li>
      </ul>`},
    {
        origem: "Atlas de Arton", nd: "6", tipo: "Exploração de Masmorra", nome: "Labirinto", imagem: "https://i.redd.it/xmncpc7pfavc1.gif", efeito: `      <strong>Objetivo:</strong> Sair do labirinto.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>Para escapar, o grupo precisa acumular sucessos na ação <em>Guiar</em>:</li>
        <ul>
          <li><strong>3 sucessos:</strong> Labirinto pequeno (salas e corredores).</li>
          <li><strong>5 sucessos:</strong> Labirinto médio (subterrâneos de uma cidade pequena).</li>
          <li><strong>7 sucessos:</strong> Labirinto extenso (complexo sob uma metrópole).</li>
        </ul>
        <li>O mestre decide a duração de cada rodada (de 1h a 1 dia).</li>
        <li>No fim de cada rodada, cada personagem faz um teste de <strong>Fortitude (CD 20)</strong>. Falha causa <strong>2d6 de dano</strong>, que só pode ser curado após 1 dia fora do labirinto.</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Guiar (Sobrevivência CD 25 ou 30):</strong> Apenas um personagem pode realizar esta ação por rodada.</li>
        <ul>
          <li>CD 25: Caminho padrão.</li>
          <li>CD 30: Caminho mais seguro. Sucesso reduz a CD do teste de Fortitude em <strong>5</strong> nesta rodada.</li>
        </ul>
        <li><strong>Ajudar o Guia (Perícia Variada):</strong> Pode usar qualquer perícia justificada para ajudar, mas cada perícia só pode ser usada uma vez por rodada (ver p. 221).</li>
        <li><strong>Calcular Rota (Conhecimento CD 20):</strong> Sucesso fornece <strong>+5</strong> no próximo teste de <em>Guiar</em>. Falha aumenta a CD do teste de Fortitude em <strong>+5</strong> nesta rodada.</li>
        <li><strong>Proteger-se (Sem teste):</strong> O personagem se protege, recebendo <strong>+5</strong> no teste de Fortitude.</li>
      </ul>
      <hr>
      <h6 class="text-warning"><strong>Variante Psíquica:</strong></h6>
      <ul>
        <li>Troque o teste de <strong>Fortitude</strong> por <strong>Vontade</strong>.</li>
        <li>Substitua o dano por <strong>1d4 de perda de PM</strong>.</li>
        <li>Um personagem com <strong>0 PM</strong> fica <strong>catatônico</strong> e incapaz de agir.</li>
        <li>Se todo o grupo entrar em estado catatônico, eles <strong>succumbem à loucura</strong> do labirinto.</li>
      </ul>`},
    {
        origem: "Ameaças de Arton", nd: "7", tipo: "Desastre em Viagem", nome: "Naufrágio", imagem: "https://media1.tenor.com/m/A9h311k0IScAAAAd/pirate-asterix.gif", efeito: `      <strong>Objetivo:</strong> Sobreviver ao naufrágio.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>O grupo está a bordo de uma embarcação que afunda.</li>
        <li>Cada personagem deve resistir à força das águas por um número de rodadas, conforme o tamanho do naufrágio:</li>
        <ul>
          <li><strong>3 rodadas:</strong> Naufrágio pequeno (barco de pesca).</li>
          <li><strong>5 rodadas:</strong> Naufrágio médio (veleiro ou cargueiro).</li>
          <li><strong>7 rodadas:</strong> Naufrágio grande (caravela ou navio de guerra).</li>
        </ul>
        <li>Após esse tempo, a embarcação afunda completamente e as águas se acalmam.</li>
        <li>Em cada rodada, cada personagem escolhe uma ação. Em caso de falha, sofre <strong>3d6 de dano de impacto</strong>.</li>
        <li>Personagens na água podem sofrer penalidades adicionais (ver <em>Nadar</em>).</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Equilibrar-se (Acrobacia CD 20):</strong> Mantém-se sobre os destroços. A cada rodada, a CD aumenta em <strong>+2</strong>. Falha por 5 ou mais faz o personagem cair na água.</li>
        <li><strong>Içar Aliado (Acrobacia CD 25):</strong> Ajuda um aliado a subir nos destroços. Conta como sucesso para ambos.</li>
        <li><strong>Nadar (Atletismo CD 20):</strong> Nada contra a correnteza. Se falhar em <strong>2 testes</strong> antes de voltar aos destroços, é <strong>tragado pelas águas</strong> (ver abaixo).</li>
        <li><strong>Carregar Outro (Atletismo CD 25):</strong> Ajuda um aliado a nadar. Conta como 1 sucesso para ambos.</li>
        <li><strong>Escalar Destroços (Atletismo CD 25):</strong> Tenta subir de volta aos destroços. Só pode ser usada se tiver passado em <em>Nadar</em> na rodada anterior.</li>
      </ul>
      <hr>
      <h6 class="text-primary"><strong>Tragado pelas Águas:</strong></h6>
      <ul>
        <li>Começa a <strong>sufocar</strong> (ver p. 319).</li>
        <li>Sofre <strong>–5 em testes de Atletismo</strong>.</li>
        <li>Só pode usar as ações <em>Nadar</em> e <em>Carregar Outro</em>.</li>
        <li>Retorna à superfície se passar em <strong>2 testes de Nadar</strong> em sequência.</li>
      </ul>`},
    {
        origem: "Ameaças de Arton", nd: "2", tipo: "Desafio de Conhecimento", nome: "Pesquisa", imagem: "https://c.tenor.com/5qHvGMx9eJMAAAAC/tenor.gif", efeito: `      <strong>Objetivo:</strong> Encontrar a informação desejada.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>O grupo está em uma biblioteca, livraria ou arquivo antigo, vasculhando textos em busca de uma informação importante.</li>
        <li>É necessário acumular <strong>6 sucessos</strong> para encontrar a informação.</li>
        <li>Para cada <strong>falha</strong>, o personagem perde <strong>1 PM</strong> devido ao esforço mental.</li>
        <li>Se um personagem for reduzido a <strong>0 PM</strong> dessa forma, fica <strong>frustrado</strong> até o fim do dia.</li>
        <li>Se o grupo acumular <strong>4 falhas</strong>, todos ficam frustrados e só podem tentar novamente no dia seguinte (mas mantêm os sucessos).</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Usar Biblioteca (Investigação CD 15):</strong> Vasculha os livros e textos disponíveis, reunindo pistas relevantes.</li>
        <li><strong>Estudar Textos (Conhecimento CD 12):</strong> Usa conhecimentos prévios combinados com os textos disponíveis.</li>
        <li><strong>Consultar o Sobrenatural (Misticismo ou Religião CD 15):</strong> Pode ser usado uma vez por personagem se a informação for mística ou divina.</li>
        <li><strong>Ajudar (Perícia Variada, CD 10):</strong> Usa qualquer perícia justificada para auxiliar um aliado. Não conta como sucesso direto.</li>
      </ul>
      <hr>
      <h6 class="text-warning"><strong>Frustrado:</strong></h6>
      <ul>
        <li>Um personagem frustrado está desmotivado e não pode participar de novas tentativas até o fim do dia.</li>
        <li>Se todo o grupo estiver frustrado, a pesquisa é interrompida até o próximo dia, mas os sucessos são mantidos.</li>
      </ul>`},
    {
        origem: "Ameaças de Arton", nd: "5", tipo: "Viagem Climática", nome: "Tempestade de Areia", imagem: "https://i.makeagif.com/media/9-15-2015/svCfIX.gif", efeito: `      <strong>Objetivo:</strong> Sobreviver à passagem das areias.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>O grupo é surpreendido por uma <strong>tempestade de areia</strong> enquanto atravessa regiões desérticas.</li>
        <li>A tempestade dura <strong>2d4+1 rodadas</strong>. Após esse tempo, torna-se apenas um vento fraco, sem os efeitos abaixo.</li>
        <li>No início de cada rodada, role <strong>1d6</strong> e some a <strong>CD base 20</strong> — essa será a CD de Fortitude da rodada para todos os personagens.</li>
        <li>No início de seu turno, cada personagem faz um <strong>teste de Fortitude</strong> contra essa CD:</li>
        <ul>
          <li>Em caso de <strong>falha</strong>, sofre <strong>4d4 de dano de corte</strong> e fica <strong>cego</strong> até o início de seu próximo turno.</li>
          <li>Em caso de <strong>falha por 10 ou mais</strong>, além disso, começa a <strong>sufocar</strong> (ver p. 319).</li>
        </ul>
        <li>Personagens cegos sofrem <strong>–5</strong> em todas as ações abaixo.</li>
        <li>Ao fim de cada rodada, cada animal ou monstro irracional no grupo deve rolar <strong>1d4</strong>. Se o resultado for <strong>1</strong>, ele foge e desaparece na tempestade.</li>
        <li>Uma criatura que fugiu pode ser reencontrada após a tempestade com um <strong>teste de Sobrevivência (CD 20 + duração da tempestade)</strong>, mas há <strong>25% de chance de estar morta</strong>.</li>
        <li>Antes da tempestade atingir o grupo, todos têm direito a um <strong>teste de Sobrevivência (CD 20)</strong> para notá-la chegando. Quem passar pode realizar uma <strong>ação adicional</strong> na primeira rodada.</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Proteger-se (Acrobacia ou Atletismo CD 15):</strong> Encolhe-se no chão e recebe <strong>+2 no próximo teste de Fortitude</strong>.</li>
        <li><strong>Cobrir-se (Sobrevivência CD 15):</strong> Usa um item como capa ou saco de dormir. Ganha <strong>+5 no próximo teste de Fortitude</strong> e <strong>+2 no seguinte</strong>. Depois, o item é destruído.</li>
        <li><strong>Procurar Abrigo (Percepção ou Sobrevivência CD 25):</strong> Encontra proteção (vala, rocha, etc). Ganha <strong>+5 nos testes de Fortitude</strong> até o fim da cena.</li>
        <li><strong>Proteger Aliado (Sobrevivência CD 15):</strong> Usa o próprio corpo para proteger um aliado. Na próxima rodada, recebe <strong>–5 em Fortitude</strong>, mas o aliado ganha <strong>+5</strong>.</li>
        <li><strong>Lavar o Rosto (Cura CD 15):</strong> Remove os efeitos de <strong>cegueira e sufocamento</strong> de si mesmo ou de um aliado.</li>
        <li><strong>Acalmar Animal (Adestramento CD 25):</strong> Acalma um animal ou monstro irracional, impedindo-o de fugir durante a tempestade.</li>
      </ul>
      <hr>
      <h6 class="text-warning"><strong>Animais Irracionais:</strong></h6>
      <ul>
        <li>Ao final de cada rodada, role <strong>1d4 para cada animal/monstro irracional</strong> acompanhando o grupo.</li>
        <li>Se sair <strong>1</strong>, a criatura foge na tempestade.</li>
        <li>Para reencontrá-la depois, teste <strong>Sobrevivência</strong> com CD baseada na duração da tempestade. Há <strong>25% de chance da criatura estar morta</strong>.</li>
      </ul>`},
    {
        origem: "Só Aventuras", nd: "2", tipo: "Combate Aéreo", nome: "Embate nas Alturas!", imagem: "https://animatedmeta.wordpress.com/wp-content/uploads/2015/04/atla-balloon-plan-1.gif", efeito: `      <strong>Objetivo:</strong> Escapar com vida do ataque dos goblins baloeiros e chegar a Vectora.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>O grupo está a bordo de um balão sob ataque de <strong>goblins baloeiros</strong>, tentando alcançar a cidade flutuante de Vectora.</li>
        <li>É necessário acumular <strong>8 sucessos</strong> para alcançar o destino com segurança.</li>
        <li>Ao fim de cada rodada, todos os personagens devem fazer um <strong>teste de Reflexos (CD 15)</strong>.</li>
        <ul>
          <li>Em caso de <strong>falha</strong>, o personagem <strong>cai do balão</strong>.</li>
          <li>Devido à baixa gravidade causada pelo campo de levitação de Vectora, é possível retornar ao balão com ações apropriadas.</li>
          <li>Se o personagem <strong>não retornar em até 3 rodadas</strong>, ele <strong>cai para a morte</strong>.</li>
        </ul>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Conduzir (Pilotagem CD 15):</strong> Assume o controle do balão após Glong ser atingido. Pode ser tentado <strong>uma vez por rodada</strong>.</li>
        <li><strong>Atirar (Ataque à distância, CD variável):</strong> Tenta repelir os goblins baloeiros com ataques. Cada sucesso válido ajuda a acumular progressos.</li>
        <li><strong>Manobrar Balão (Acrobacia ou Pilotagem CD 15):</strong> Realiza manobras evasivas contra os inimigos. Sucesso contribui para os sucessos totais.</li>
        <li><strong>Reparar (Ofício ou Engenharia CD 15):</strong> Conserta partes danificadas do balão, prevenindo penalidades ou queda.</li>
        <li><strong>Segurar-se (Atletismo ou Reflexos CD 15):</strong> Se estiver caindo, permite <strong>agarrar cordas ou partes do balão</strong> e retornar com sucesso.</li>
        <li><strong>Ajudar (Perícia Variada, CD 10):</strong> Usa uma perícia justificada para auxiliar um aliado. Não conta como sucesso direto.</li>
      </ul>
      <hr>
      <h6 class="text-warning"><strong>Caindo do Balão:</strong></h6>
      <ul>
        <li>Se falhar no teste de Reflexos no final da rodada, o personagem cai.</li>
        <li>Durante até <strong>3 rodadas</strong>, pode tentar <strong>segurar-se ou voltar ao balão</strong> com testes apropriados.</li>
        <li>Se não conseguir retornar nesse tempo, <strong>cai para a morte</strong>.</li>
      </ul>`},
    {
        origem: "Só Aventuras", nd: "5", tipo: "Desafio Furtivo", nome: "Passagem pela Casa de Chá", imagem: "https://i.pinimg.com/originals/d5/d0/ea/d5d0eac0f4ec5e6d9a3c9e8fd0fe21c0.gif", efeito: `      <strong>Objetivo:</strong> Atravessar a Casa de Chá passando pelos capangas sem ser notado — ou eliminar todos os guardas.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>Cada personagem deve acumular <strong>3 sucessos</strong> em <strong>Passar Despercebido</strong> ou <strong>Passar por Cima</strong> para alcançar os aposentos de Taerir.</li>
        <li>Ao final de cada rodada, todos devem fazer um <strong>teste de Furtividade (CD 18)</strong>.</li>
        <ul>
          <li>Em caso de <strong>falha</strong>, o personagem é notado pelos capangas e sofre <strong>6d8+16 de dano de impacto</strong>.</li>
        </ul>
        <li>Se o grupo preferir lutar, o desafio se encerra ao somarem <strong>10 sucessos</strong> em <strong>Revidar</strong> ou <strong>Lançar Magia</strong>.</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Passar Despercebido (Furtividade CD 20):</strong> Move-se entre os guardas sem ser notado. Somente personagens não descobertos ou que tenham tido sucesso em <strong>Despistar</strong> podem tentar.</li>
        <li><strong>Passar por Cima (Atletismo, Acrobacia ou Luta CD 20):</strong> Usa força ou agilidade para romper o cerco dos capangas e avançar. Personagens que usam esta ação <strong>não podem mais tentar Passar Despercebido</strong>, a menos que tenham sucesso em <strong>Despistar</strong>.</li>
        <li><strong>Revidar (Luta ou Pontaria CD 24):</strong> Combate direto com os capangas. Cada sucesso contribui para a contagem de 10 sucessos totais para encerrar o desafio por combate.</li>
        <li><strong>Lançar Magia (Vontade, CD 20 + custo em PM):</strong> Lança magia em meio ao caos da Casa de Chá. O ambiente é <strong>hostil à magia</strong>, dificultando a concentração.</li>
        <li><strong>Despistar (Enganação ou Furtividade CD 24):</strong> Usa o ambiente caótico e a fumaça para sair da linha de visão. Permite voltar a tentar <strong>Passar Despercebido</strong>. Se outro personagem tiver usado <strong>Revidar</strong> na rodada, a CD reduz em <strong>–5</strong>.</li>
      </ul>
      <hr>
      <h6 class="text-warning"><strong>Detectado pelos Capangas:</strong></h6>
      <ul>
        <li>Falhar no teste de Furtividade no fim da rodada faz com que o personagem seja descoberto.</li>
        <li>Recebe <strong>6d8+16 de dano de impacto</strong> dos ataques dos guardas.</li>
        <li>Personagens descobertos não podem mais tentar <strong>Passar Despercebido</strong>, exceto se tiverem sucesso em <strong>Despistar</strong>.</li>
      </ul>`},
    {
        origem: "Só Aventuras", nd: "11", tipo: "Ameaça de Masmorra", nome: "Corredores em Chamas", imagem: "https://i.pinimg.com/originals/b0/b8/98/b0b89861ed00a56409b2b9dac744ae51.gif", efeito: `      <strong>Objetivo:</strong> Correr pelos corredores em chamas até alcançar o salão principal.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>O desafio dura <strong>cinco rodadas</strong>. Todos os personagens devem acumular sucessos em <strong>Correr</strong> ou <strong>Carregar Outro</strong>.</li>
        <li>No início de cada rodada, cada personagem sofre <strong>1d6 de dano de fogo</strong>, aumentando em +1d6 a cada rodada (máximo 5d6).</li>
        <li>Ao final da quinta rodada, o número de sucessos determina o destino de cada personagem:</li>
        <ul>
          <li><strong>0–2 sucessos:</strong> Sofre <strong>16d6 de dano de impacto</strong> e fica <strong>soterrado</strong>.</li>
          <li><strong>3–4 sucessos:</strong> Sofre <strong>8d6 de dano de impacto</strong>, mas escapa.</li>
          <li><strong>5 sucessos:</strong> Escapa completamente, sem ser atingido.</li>
        </ul>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Correr (Atletismo CD 26):</strong> Avança pelos corredores flamejantes. Um sucesso com 10 ou mais (ou um 20 natural) conta como <strong>dois sucessos</strong>.</li>
        <li><strong>Carregar Outro (Atletismo CD 30):</strong> Carrega um aliado com até um sucesso de diferença. Se bem-sucedido, concede <strong>um sucesso para ambos</strong>.</li>
        <li><strong>Procurar Caminho (Percepção CD 20):</strong> Analisa o trajeto em busca de uma rota mais segura. Se passar, <strong>todos recebem +5</strong> em testes de <strong>Correr</strong> e <strong>Carregar Outro</strong> (não cumulativo).</li>
        <li><strong>Soltar-se (Força CD 25):</strong> Usado para libertar-se ou libertar um aliado soterrado. Pode receber ajuda de outros personagens.</li>
      </ul>
      <hr>
      <h6 class="text-warning"><strong>Personagens Soterrados:</strong></h6>
      <ul>
        <li>Ficam <strong>imóveis</strong> e sofrem <strong>1d6 de dano de impacto</strong> no início de cada turno, além de <strong>5d6 de dano contínuo de fogo</strong>.</li>
        <li>É necessário um teste de <strong>Força (CD 25)</strong> para se libertar ou libertar um aliado soterrado.</li>
      </ul>`},
    {
        origem: "Só Aventuras", nd: "2", tipo: "Missão de Salvamento", nome: "Resgate nas Chamas", imagem: "https://i.gifer.com/origin/a4/a40a7366f3f3fd565392d967bf2c0c5d.gif", efeito: `      <strong>Objetivo:</strong> Salvar o maior número possível de pessoas presas no salão em chamas antes que ele desabe.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>O salão queima durante <strong>cinco rodadas</strong>, desabando ao final da última. Use a ação <strong>Apagar</strong> para atrasar esse colapso.</li>
        <li>Os personagens mantêm a ordem de iniciativa e quaisquer efeitos ativos do combate anterior.</li>
        <li>No início de cada turno dentro do salão, cada personagem deve fazer um <strong>teste de Fortitude (CD 10 +1 por teste anterior)</strong> para resistir à fumaça. Criaturas que não respiram ignoram este efeito. Usar um pano úmido fornece <strong>+2</strong>.</li>
        <li>Existem <strong>8 NPCs</strong> presos (cada um ocupa 10 espaços; Nanamo ocupa 5).</li>
        <li>Quando o salão desaba, quem estiver dentro sofre <strong>6d6 de dano de fogo</strong> e fica <strong>soterrado</strong>. NPCs não resgatados morrem.</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Apagar (Destreza ou Inteligência CD 10):</strong> Abafa focos do incêndio, <strong>adiando o colapso do salão em 1 rodada</strong>. Pode ser feito de fora.</li>
        <li><strong>Escapar (Acrobacia ou Atletismo CD 10):</strong> Tenta sair do salão sem carregar um NPC. Falha impede a saída naquela rodada.</li>
        <li><strong>Localizar (Investigação ou Percepção CD 15):</strong> Entra no salão para encontrar vítimas. Se bem-sucedido, pode usar <strong>Resgatar</strong> na próxima ação.</li>
        <li><strong>Resgatar (Atletismo CD 15):</strong> Carrega um NPC localizado para fora. <strong>Penalidade de -5</strong> se estiver sobrecarregado. Falha impede a saída.</li>
        <li><strong>Soltar-se (Força CD 17):</strong> Liberta a si ou a outro personagem soterrado. Cada tentativa causa <strong>1d6 de dano de fogo</strong>. Outros podem ajudar.</li>
      </ul>
      <hr>
      <h6 class="text-warning"><strong>Personagens Soterrados:</strong></h6>
      <ul>
        <li>Ficam <strong>imóveis</strong> e sofrem <strong>dano contínuo de fogo</strong>.</li>
        <li>Podem ser libertados com <strong>Força (CD 17)</strong>. Cada tentativa causa <strong>1d6 de dano de fogo</strong>. Vários personagens podem ajudar.</li>
      </ul>`},
    {
        origem: "Libertação de Valkaria", nd: "1", tipo: "Desafio", nome: "Procurar o Covil", imagem: "https://media.giphy.com/media/Eyd28c2wDWKOc/giphy.gif", efeito: `      <strong>Objetivo:</strong> Encontrar a entrada do covil sszzaazita nas cavernas do Monte Palidor.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>O grupo deve acumular <strong>5 sucessos</strong> na ação <strong>Vasculhar</strong> para encontrar o covil.</li>
        <li>Para cada <strong>falha</strong>, cada personagem perde <strong>1d6 PV ou 1 PM</strong> (à escolha do jogador), representando cansaço, uso de habilidades ou ferimentos.</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Vasculhar (Investigação, Percepção ou Sobrevivência CD 15):</strong> Procura pistas do covil nas cavernas. <strong>Hillard</strong>, se presente, concede <strong>+2 nos testes</strong>.</li>
        <li><strong>Proteger (Luta ou Pontaria CD 15):</strong> Ajuda o grupo enfrentando perigos e aliviando a jornada. Se passar, <strong>evita a penalidade de PV ou PM para um aliado</strong> em uma falha futura. A cada 5 pontos acima da CD, protege um personagem adicional.</li>
        <li>Outras perícias podem ser usadas uma única vez, desde que justificadas e aprovadas pelo mestre.</li>
      </ul>`},
    {
        origem: "Libertação de Valkaria", nd: "12", tipo: "Zona de Risco Mágico", nome: "Oficina Mágica", imagem: "https://i.imgflip.com/9q2szl.gif", efeito: `      <strong>Objetivo:</strong> Fabricar um parceiro mobília em meio ao caos mágico da oficina.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>O grupo precisa acumular <strong>2 sucessos</strong> em <strong>cada uma</strong> das seguintes ações: <strong>Agarrar Ferramenta</strong>, <strong>Ler Manual</strong> e <strong>Montagem</strong>.</li>
        <li>Ao final de <strong>rodadas ímpares</strong>, cada personagem sofre <strong>4d8 de dano de perfuração</strong> (<strong>Reflexos CD 30</strong> evita), causado pelas ferramentas dançantes.</li>
        <li>Ao final de <strong>rodadas pares</strong>, cada personagem perde <strong>1d4 PM</strong> (<strong>Vontade CD 30</strong> evita), devido aos vórtices arcanos.</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Agarrar Ferramenta (Luta CD 30):</strong> Agarra ferramentas essenciais. <strong>+2 em Montagem</strong> com 1 sucesso, <strong>+5 com 2 sucessos</strong>.</li>
        <li><strong>Ler Manual (Conhecimento CD 25):</strong> Decifra o manual de Ranad. <strong>+2 em Montagem</strong> com 1 sucesso, <strong>+5 com 2 sucessos</strong>.</li>
        <li><strong>Montagem (Ofício [artesão] CD 40):</strong> Executa a montagem mágica do parceiro mobília.</li>
        <li><strong>Ajudar Aliado (variável):</strong> Ajuda em qualquer teste, usando uma perícia justificada e aprovada pelo mestre (ex.: Intuição, Misticismo, etc.).</li>
        <li><strong>Auxílio Esotérico (Misticismo CD 30):</strong> Substitui 1 sucesso em qualquer ação, <strong>máximo de 1 vez</strong>.</li>
        <li><strong>Dar Cobertura (Luta ou Pontaria CD 10):</strong> Garante <strong>bônus no teste de Reflexos</strong> de todos ao final da rodada.</li>
        <li><strong>Escudo Místico (Misticismo CD 10):</strong> Garante <strong>bônus no teste de Vontade</strong> de todos ao final da rodada.</li>
      </ul>`},
    {
        origem: "Coração de Rubi", nd: "14", tipo: "Perseguição Dimensional", nome: "Fuga dos Papa-Dim", imagem: "https://c.tenor.com/aIvGbxyqS4AAAAAC/tenor.gif", efeito: `      <strong>Objetivo:</strong> Cruzar a floresta sem ser devorado pelos papa-dim.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>O grupo deve acumular <strong>5 sucessos</strong> na ação <strong>Conduzir</strong> para escapar com a carruagem.</li>
        <li>A carruagem possui <strong>RD 5</strong> e <strong>70 PV</strong>.</li>
        <li>No início de cada rodada, personagens na carruagem devem fazer <strong>Reflexos CD 20</strong>:
          <ul>
            <li>Falha: sofre <strong>2d6 de dano de impacto</strong>.</li>
            <li>Falha por 10 ou mais: sofre <strong>4d6 de dano</strong> e <strong>cai da carruagem</strong>.</li>
          </ul>
        </li>
        <li>Personagens voando ignoram o teste, mas <strong>não podem conduzir</strong>.</li>
        <li>Defina quem carrega os convites. Se esse personagem for reduzido a 0 PV por uma mordida, os <strong>papa-dim devoram as moedas e os convites</strong>! Será preciso <strong>derrotar o enxame</strong> para recuperar os itens.</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Conduzir (Destreza, Adestramento ou Pilotagem CD 25):</strong> Conduz a carruagem. Sucesso: avança. Falha: avança, mas é alcançada. Falha por 5+: não avança e é alcançada.</li>
        <li><strong>Ajudar o Condutor (variável):</strong> Ajuda o condutor. Ex.: <em>Atletismo</em> (puxar arreios), <em>Percepção</em> (ver caminhos livres).</li>
        <li><strong>Atacar as Criaturas:</strong> Causar <strong>50 de dano</strong> no enxame em uma rodada impede que ele ataque a carruagem naquela rodada.</li>
        <li><strong>Quem Quer Dinheiro:</strong> Jogar <strong>T$ 100</strong> ou objetos valiosos como isca evita o ataque da rodada.</li>
        <li><strong>Lançar Magia (Vontade CD 15 + PM da magia):</strong> É necessário para conjurar magias na carruagem em movimento.</li>
        <li><strong>Embarcar (Atletismo CD 20):</strong> Para quem caiu do veículo. Ação completa. Outros podem ajudar, mas todos precisarão passar no teste.</li>
        <li><strong>Consertar Roda (Ladinagem ou Ofício CD 20):</strong> Requer 2 sucessos. Se ninguém enfrentar o enxame enquanto parada, a carruagem é atacada!</li>
      </ul>`},
    {
        origem: "Coração de Rubi", nd: "12", tipo: "Obstáculo Social", nome: "Burocracia Arcana", imagem: "https://i.gifer.com/7H9Z.gif", efeito: `      <strong>Objetivo:</strong> Conseguir um visto de permanência em Vectora e permissão para usar magia de Raisenzan dentro da cidade.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>O grupo deve acumular <strong>7 sucessos</strong> entre as ações <strong>Preencher Formulário</strong> e <strong>Responder Entrevista</strong>.</li>
        <li>Ao final de cada rodada, cada personagem faz <strong>Vontade (CD 20 + 2 por teste já realizado)</strong>:
          <ul>
            <li>Falha: fica <strong>frustrado</strong>.</li>
            <li>Falha por 10 ou mais: fica <strong>frustrado e atordoado</strong> por uma rodada.</li>
            <li>Se já estiver frustrado: fica <strong>esmorecido</strong>.</li>
            <li>Se já estiver esmorecido: <strong>surta</strong> e sai da cena.</li>
          </ul>
        </li>
        <li>Se todos surtarem antes de alcançar 7 sucessos, falham no desafio. Podem tentar novamente na próxima semana.</li>
        <li>Se todos os testes forem um sucesso, recebem <strong>carta de recomendação</strong> de Vectorius, garantindo <strong>20% de desconto</strong> em compras pelos cofres da cidade (limites a critério do mestre).</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Preencher Formulário (Conhecimento ou Nobreza CD 25):</strong> Preenche uma das requisições exigidas.</li>
        <li><strong>Responder Entrevista (Diplomacia ou Enganação CD 25):</strong> Convence uma das cópias de Vectorius de que é confiável.</li>
        <li><strong>Debater Planos (varia CD 10):</strong> Ajuda um aliado nos testes principais. Pode usar qualquer perícia justificada, como:
          <ul>
            <li><em>Nobreza:</em> Compreender a legislação.</li>
            <li><em>Investigação:</em> Esclarecer dúvidas com funcionários.</li>
            <li><em>Ladinagem:</em> Esconder uma cola para a entrevista.</li>
          </ul>
        </li>
      </ul>`},
    {
        origem: "Coração de Rubi", nd: "14", tipo: "Desafio Social", nome: "Jogo de Influências", imagem: "https://pa1.aminoapps.com/6907/1f592c2e680bb9618be717b85a4162efd389b8d8r1-500-281_hq.gif", efeito: `      <strong>Objetivo:</strong> Cair nas graças de Schaven para obter a energia elemental do fogo.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>O jantar dura <strong>três rodadas</strong> (cada rodada representa uma hora).</li>
        <li>Para chamar a atenção de Schaven, o grupo precisa acumular <strong>sete sucessos</strong> nas ações <strong>Estabelecer Presença</strong>, <strong>Performance</strong> e <strong>Politicagem</strong>.</li>
        <li>No início de cada rodada, Alurra faz um <strong>teste de Intimidação oposto pela Vontade</strong> de um dos personagens (à sua escolha):
          <ul>
            <li>Se Alurra vencer, o personagem <strong>não age nesta rodada</strong>.</li>
          </ul>
        </li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Atrapalhar Alurra (Intuição CD 20):</strong> O personagem fica de olho na capitã Alurra, evitando que ela atrapalhe seus colegas. Se passar, o próximo teste de Intimidação da capitã sofre <strong>–5</strong> de penalidade.</li>
        <li><strong>Conduzir a Conversa (Enganação CD 25):</strong> O personagem se intromete na conversa de um colega, fazendo com que o rumo dela o favoreça. Se passar, fornece um <strong>bônus de +5</strong> no próximo teste desse colega.</li>
        <li><strong>Estabelecer Presença (Intimidação CD 30):</strong> O personagem atrai os nobres com sua presença altiva e orgulhosa.</li>
        <li><strong>Performance (Atuação CD 32):</strong> O personagem entretém os convidados do jantar.</li>
        <li><strong>Politicagem (Diplomacia CD 30):</strong> O personagem atrai os nobres através de conversa hábil.</li>
        <li><strong>Seguir Protocolos (Nobreza CD 20):</strong> O personagem segue a etiqueta e os costumes de Sckharshantallas. Ele recebe um <strong>bônus de +5</strong> em seu próximo teste, ou fornece esse bônus a um colega.</li>
      </ul>
      <hr>
      <h6 class="text-info"><strong>Modificadores:</strong></h6>
      <ul>
        <li><strong>+2</strong> em todos os testes para personagens com <strong>trajes luxuosos</strong>.</li>
        <li>Personagens que tenham <strong>comprado presentes</strong> podem gastá-los para <strong>rolar novamente</strong> um teste recém realizado.</li>
      </ul>`},
    {
        origem: "Coração de Rubi", nd: "14", tipo: "Desastre Natural", nome: "Desmoronamento", imagem: "https://gifdb.com/images/high/avalanche-360-x-270-gif-qpolkzsorc8e0qm1.gif", efeito: `      <strong>Objetivo:</strong> Avançar pelos túneis rumo ao centro do Santuário com toneladas de neve e rochas nos calcanhares.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>O grupo precisa acumular <strong>sete sucessos</strong> em testes de <strong>Avançar</strong> para chegar ao centro do Santuário.</li>
        <li>No fim de cada rodada, cada personagem deve fazer um <strong>teste de Reflexos (CD 25, +1 por teste já realizado)</strong>:
          <ul>
            <li><strong>Falha:</strong> sofre <strong>4d6 de dano de impacto</strong> e <strong>4d6 de dano de frio</strong>, e só pode fazer a ação <strong>Escapar</strong> na próxima rodada.</li>
          </ul>
        </li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Avançar (CD 30):</strong> O personagem avança pelos túneis. Pode usar qualquer <strong>perícia justificada</strong>, mas <strong>não pode repetir mais de uma vez cada perícia</strong>.</li>
        <li><strong>Escapar/Soltar Colega (Força CD 20):</strong> Um personagem que tenha falhado no teste de Reflexos na rodada anterior escapa da pilha de neve e rochas e pode agir na próxima rodada. Também pode ser usada por outro personagem para soltar um colega preso.</li>
      </ul>`},
    {
        origem: "Coração de Rubi", nd: "15", tipo: "Perseguição Aérea", nome: "Perseguição Celeste", imagem: "https://i.gifer.com/2WLW.gif", efeito: `      <strong>Objetivo:</strong> Encontrar um dos Três Espectros — navios voadores inimigos ocultos por magias e truques mundanos.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>A perseguição dura <strong>cinco rodadas</strong>. Para encontrar um dos navios inimigos, o grupo precisa acumular <strong>cinco sucessos</strong> na ação <strong>Olhos no Céu</strong>.</li>
        <li>No fim de cada rodada:
          <ul>
            <li>Cada personagem faz um <strong>teste de Fortitude (CD 20 +2 por rodada anterior)</strong>. <strong>Falha:</strong> fica <strong>enjoado</strong> e não pode agir na rodada seguinte.</li>
            <li>O Mariposa (aeronave aliada) é atingido por um disparo de um Espectro. Cada personagem sofre:
              <ul>
                <li><strong>12d6 de eletricidade</strong> (Hidra Helicoide)</li>
                <li><strong>6d12 de trevas</strong> (Diligência Dracocérbera)</li>
                <li><strong>6d8+10 de impacto</strong> (Corvo de Krauser)</li>
              </ul>
              Um <strong>teste de Reflexos (CD 30)</strong> reduz o dano à metade.
            </li>
          </ul>
        </li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Olhos no Céu (Percepção CD 30):</strong> O personagem tenta localizar um dos Espectros no céu noturno.</li>
        <li><strong>Recompor (Diplomacia ou Intimidação CD 20):</strong> Remove a condição <em>enjoado</em> de um aliado, permitindo que ele aja nesta rodada.</li>
        <li><strong>Prestar Ajuda:</strong> O personagem usa uma perícia relevante para ajudar na ação Olhos no Céu de um colega. Exemplos:
          <ul>
            <li><strong>Conhecimento:</strong> Reconhece constelações alteradas.</li>
            <li><strong>Guerra:</strong> Prevê táticas inimigas.</li>
            <li><strong>Investigação:</strong> Analisa padrões no céu.</li>
            <li><strong>Misticismo:</strong> Detecta auras mágicas.</li>
            <li><strong>Sobrevivência:</strong> Observa alterações nas nuvens.</li>
          </ul>
        </li>
        <li><strong>Manobras Defensivas (Pilotagem CD 30):</strong> Ajuda a tripulação do Mariposa a evitar o disparo da rodada.</li>
      </ul>`},
    {
        origem: "Coração de Rubi", nd: "16", tipo: "Desafio de Busca", nome: "O Código Lefeu", imagem: "https://giffiles.alphacoders.com/205/2058.gif", efeito: `      <strong>Objetivo:</strong> Estudar as anotações de Ezequias Heldret para descobrir as capacidades e fraquezas da máquina de guerra ARQUEMIS-B.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>O grupo tem <strong>três dias</strong> para estudar. No início de cada dia, cada personagem pode fazer uma das ações abaixo ou <strong>prestar ajuda</strong> a um colega que esteja realizando um teste.</li>
        <li>No final de cada dia, cada personagem que tiver feito uma das ações deve fazer um <strong>teste de Vontade (CD 30 +2 por teste anterior)</strong>:
          <ul>
            <li><strong>1 falha:</strong> o personagem fica <strong>frustrado</strong>.</li>
            <li><strong>2 falhas:</strong> o personagem fica <strong>alquebrado</strong>.</li>
            <li><strong>3 falhas:</strong> o personagem perde <strong>permanentemente 1 ponto</strong> de Inteligência, Sabedoria ou Carisma (determinado aleatoriamente).</li>
          </ul>
        </li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Brecha na Armadura (Ofício [Armeiro] CD 35):</strong> Detecta pontos vulneráveis na estrutura do ARQUEMIS.</li>
        <li><strong>É Grande, mas não É Dois (Iniciativa CD 35):</strong> Observa que a máquina é lenta demais para reagir rapidamente.</li>
        <li><strong>Explosão de Raiva (Luta CD 35):</strong> Após um surto de fúria, percebe a manipulação mental causada pelas inscrições lefou.</li>
        <li><strong>Fogo de Suporte (Pontaria CD 35):</strong> Conclui que ataques à distância são a melhor estratégia contra o colosso.</li>
        <li><strong>Fonte de Mana (Misticismo CD 35):</strong> Identifica uma fonte oculta de energia alimentando a máquina.</li>
        <li><strong>Referências Religiosas (Religião CD 35):</strong> Reconhece símbolos ligados ao deus da Tormenta nas anotações de Ezequias.</li>
      </ul>`},
    {
        origem: "Guerra Artoniana", nd: "2", tipo: "Fuga", nome: "Fuga de Warton", imagem: "https://31.media.tumblr.com/b3dbe4cf8681a00c44b8608cee2d3d82/tumblr_nlorfxPvIC1qg8dz8o1_400.gif", efeito: `      <strong>Objetivo:</strong> Sair da cidade de Warton.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>Uma vez por rodada, cada personagem deve descrever como escapará dos soldados puristas e de Lady Alyssa, escolhendo uma das opções abaixo.</li>
        <li>Na 1ª rodada: testes para escapar do gabinete.</li>
        <li>Na 2ª rodada: testes para escapar do quartel e arredores.</li>
        <li>Na 3ª rodada: testes para alcançar as periferias da cidade.</li>
        <li><strong>Falha:</strong> o personagem avança, mas sofre <strong>2d4 PV</strong> e <strong>1d4 PM</strong> de dano, representando o esforço extra. Esta perda não pode ser evitada, curada ou recuperada até o final do perigo.</li>
        <li><strong>Restrição:</strong> Um personagem não pode usar a mesma perícia mais de uma vez durante o desafio.</li>
        <li>Ao final da terceira rodada, os personagens têm uma rodada de descanso antes de Lady Alyssa aparecer no topo dos prédios.</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Entrada Principal (CD 15):</strong> O personagem usa uma perícia que envolva abrir caminho à força (ex: Luta, Atletismo) pela saída mais óbvia.</li>
        <li><strong>Entrada de Serviço (CD 15):</strong> O personagem usa uma perícia ardilosa (ex: Enganação, Atuação, Disfarce) para sair discretamente.</li>
        <li><strong>Rota Alternativa (CD 15):</strong> O personagem usa uma perícia ágil (ex: Acrobacia, Reflexos, Sobrevivência) para escapar por passagens improváveis.</li>
        <li><strong>Carregar Outro (CD 20):</strong> O personagem realiza um dos testes acima, mas carregando um aliado. Sucesso conta para ambos; falha causa perdas para os dois.</li>
        <li><strong>Salto de Fé (Religião CD 25 – 1ª rodada apenas):</strong> O personagem salta pela janela confiando nos deuses. Sucesso: cai numa carroça de feno e escapa do perigo imediatamente. Falha: sofre o dobro do dano de PV e não pode tentar essa opção novamente.</li>
      </ul>`},
    {
        origem: "Guerra Artoniana", nd: "4", tipo: "Desafio urbano", nome: "Desabamento", imagem: "https://c.tenor.com/hGeQCSHBf_AAAAAd/tenor.gif", efeito: `      <strong>Objetivo:</strong> Escapar do desabamento e fugir da torre.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>O grupo tem <strong>cinco rodadas</strong> para se afastar dos escombros.</li>
        <li>No fim da 5ª rodada, a posição de cada personagem é definida pelo número de <strong>sucessos acumulados</strong> nas ações <em>Correr</em> ou <em>Carregar Outro</em>:</li>
        <ul>
          <li><strong>0–2 sucessos:</strong> Zona de Desabamento — sofre <strong>8d12 de dano</strong> e fica <strong>soterrado</strong>.</li>
          <li><strong>3–4 sucessos:</strong> Zona de Deslizamento — sofre <strong>8d6 de dano</strong>.</li>
          <li><strong>5+ sucessos:</strong> Escapa <strong>ileso</strong>.</li>
        </ul>
        <li><strong>Soterrado:</strong> personagem fica <strong>imóvel</strong> e sofre <strong>1d6 de dano</strong> no início de cada turno.</li>
        <li>Libertar um soterrado exige <strong>ação completa</strong> e <strong>Atletismo CD 20</strong>.</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Correr (Atletismo CD 20):</strong> Corre para longe dos escombros. Um sucesso por 10 ou mais (ou 20 natural) conta como <strong>dois sucessos</strong>. Pode ser substituído por Cavalgar ou Pilotagem.</li>
        <li><strong>Carregar Outro (Atletismo CD 25):</strong> Leva um aliado próximo (com até 1 sucesso de diferença). Sucesso acumula 1 sucesso para ambos.</li>
        <li><strong>Procurar Caminho (Percepção CD 20):</strong> Analisa o terreno. Sucesso concede <strong>+5</strong> em todos os testes de <em>Correr</em> e <em>Carregar Outro</em> durante o desafio.</li>
      </ul>`},
    {
        origem: "Guerra Artoniana", nd: "4", tipo: "Desafio de Sobrevivência", nome: "Jornada até Bielefeld", imagem: "https://gifdb.com/images/high/attack-on-titan-levi-riding-horse-en8pasm7u9dzbxya.gif", efeito: `      <strong>Objetivo:</strong> Chegar ao Reino dos Cavaleiros o mais rápido possível, atravessando território hostil.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>O grupo deve realizar <strong>3 testes de Avançar</strong>.</li>
        <li><strong>Para cada falha:</strong> os personagens perdem <strong>3d6 PV</strong>, representando cansaço e desgaste. Essa perda só pode ser curada a partir de um dia após o fim da viagem.</li>
        <li><strong>Se acumular 3 falhas:</strong> todos os personagens têm seus <strong>PM máximos reduzidos em 1 por nível</strong> até o fim da aventura, como consequência do trauma da jornada.</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Avançar (CD 25, +5 por teste anterior):</strong> Os personagens se alternam para realizar os 3 testes totais. Os testes podem ser de <strong>Sobrevivência</strong> ou qualquer outra perícia que o jogador consiga justificar e o mestre aprove.</li>
        <li><strong>Restrição:</strong> Cada perícia que <em>não</em> seja Sobrevivência só pode ser usada <strong>uma vez</strong> durante o desafio.</li>
      </ul>`},
    {
        origem: "Guerra Artoniana", nd: "6", tipo: "Desafio urbano", nome: "Fuga de Suth Eleghar", imagem: "https://j.gifs.com/w0kq6X.gif", efeito: `      <strong>Objetivo:</strong> Ajudar os elegharianos a fugir do ataque.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>O grupo tem <strong>sete rodadas</strong> para ajudar na evacuação da cidade, realizando ações como combater inimigos, curar feridos e movimentar vítimas.</li>
        <li>Ao final de cada rodada, cada personagem sofre <strong>6d10 de dano</strong> (metade fogo, metade perfuração). Um teste de <strong>Reflexos CD 25</strong> reduz o dano à metade.</li>
        <li>No fim da sétima rodada, o perigo termina. Some os <strong>sucessos acumulados</strong> nas ações <em>Carregar Vítima</em>, <em>Chamar Atenção</em>, <em>Curar Vítima</em> e <em>Retirada Estratégica</em> para determinar o resultado.</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Bater em Purista! (Varia CD 25):</strong> Ataque com arma ou magia. Para cada <strong>20 pontos de dano</strong> causados, evita que um aliado à escolha (ou o próprio personagem) sofra dano nesta rodada. Dano em área causa <strong>+50%</strong> de dano.</li>
        <li><strong>Buscar Cobertura (Furtividade CD 25):</strong> Recebe <strong>+5 no teste de Reflexos</strong> e, se passar, não sofre dano algum nesta rodada.</li>
        <li><strong>Carregar Vítima (Atletismo CD 25):</strong> Leva vítimas até um local seguro. Pode usar <strong>Cavalgar</strong> ou <strong>Pilotagem</strong> se estiver montado ou em veículo.</li>
        <li><strong>Chamar Atenção (Atuação, Enganação ou Intimidação CD 25):</strong> Atrai atenção dos puristas para permitir que outros escapem. Nesse caso, a <strong>CD do teste de Reflexos</strong> do personagem sobe para <strong>35</strong>.</li>
        <li><strong>Curar Vítima (Cura CD 25):</strong> Cura vítimas do ataque. Magias de cura fornecem <strong>+2 por PM gasto</strong>.</li>
        <li><strong>Retirada Estratégica (Guerra CD 25):</strong> Coordena os sobreviventes, aumentando a eficiência da evacuação.</li>
      </ul>
      <hr>
      <strong>Resultado dos Esforços:</strong>
      <ul>
        <li><strong>10 ou menos sucessos:</strong> A evacuação é um massacre. Todos os personagens ficam <strong>alquebrados</strong> até o fim da aventura (não pode ser removido antes).</li>
        <li><strong>11 a 20 sucessos:</strong> Algumas vidas são salvas. Os sobreviventes agradecem a ajuda.</li>
        <li><strong>21 a 30 sucessos:</strong> Muitas vidas são salvas. Cada personagem aumenta o limite de <strong>PM em +2d4</strong> até o fim da aventura.</li>
        <li><strong>31+ sucessos:</strong> Quase todos são salvos! Cada personagem recebe um <strong>cavalo de Namalkah veterano</strong>. O grupo ganha a ajuda de <strong>Knox Quíron</strong>, que fornece <strong>+2 em Cavalgar, Percepção e Sobrevivência</strong>, e <strong>+2 em testes de resistência</strong> de um personagem montado. Knox acredita que <em>Hippion</em> enviou os heróis.</li>
      </ul>`},
    {
        origem: "Guerra Artoniana", nd: "4", tipo: "Desafio de viagem", nome: "Jornada até Zakharov", imagem: "https://s-media-cache-ak0.pinimg.com/originals/fd/0a/b0/fd0ab0aff3a82bf4c74658a2dca4a7cb.gif", efeito: `      <strong>Objetivo:</strong> Chegar ao Reino das Armas o mais rápido possível, atravessando território hostil.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>O grupo deve realizar <strong>3 testes de Avançar</strong> para completar a jornada.</li>
        <li>A cada <strong>falha</strong>, todos os personagens sofrem <strong>3d6 de dano</strong>. Esse dano representa cansaço e desgaste físico e <strong>só pode ser curado um dia após o fim da viagem</strong>.</li>
        <li>Se o grupo acumular <strong>3 falhas</strong>, seus <strong>PM máximos são reduzidos em 1 por nível</strong> até o fim da aventura, representando trauma.</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Avançar (CD 25, +5 por teste anterior):</strong> Os personagens se revezam realizando testes até acumularem 3 sucessos. Pode-se usar <strong>Sobrevivência</strong> ou outra perícia com justificativa aprovada pelo mestre. Perícias diferentes de Sobrevivência só podem ser usadas <strong>uma vez</strong> durante a jornada.</li>
      </ul>
      <hr>
      <strong>Encontros:</strong> Cada teste leva a um encontro, independentemente do sucesso. Se o teste foi bem-sucedido, o grupo pode escolher enfrentar ou evitar o encontro. Em caso de falha, o grupo é <strong>surpreendido</strong>.
      <ul>
        <li>
          <strong>1º Encontro:</strong> Terras salgadas e estéreis de Yuden. Todos fazem teste de <strong>Vontade CD 25</strong>.
          <ul>
            <li>Sucesso: Ganha um <em>reteste contra puristas</em> até o fim da aventura.</li>
            <li>Falha: Fica <strong>esmorecido</strong> até o fim da próxima cena.</li>
          </ul>
        </li>
        <li>
          <strong>2º Encontro:</strong> Torre guarnecida em mina yudennach. Todos fazem <strong>Furtividade CD 25</strong>.
          <ul>
            <li>Falha: Sofre <strong>6d8 de dano de perfuração</strong> (Reflexos CD 25 reduz à metade).</li>
            <li>Se atacarem a torre: enfrentam dois <em>grupos de assalto puristas</em> e um <em>golem de reconhecimento</em>.</li>
            <li>Vitória: Encontram <strong>T$ 7.000</strong> e libertam prisioneiros. O domínio do grupo recebe a estrutura <strong>Exclave Kovith</strong> (bônus de +5 em Luta, Misticismo ou Pontaria, 1x por aventura).</li>
          </ul>
        </li>
        <li>
          <strong>3º Encontro:</strong> Penhascos do Monte Kovith. Um personagem faz <strong>Atletismo ou Sobrevivência CD 25</strong>.
          <ul>
            <li>Sucesso: Grupo surpreende <strong>patrulha de cavaleiros de serpe</strong>.</li>
            <li>Falha: Grupo <strong>fica fatigado</strong> e é surpreendido pela patrulha.</li>
            <li>Recompensa: Poção de <em>Bola de Fogo</em> e <em>Curar Ferimentos (4d8+4)</em>.</li>
          </ul>
        </li>
      </ul>
      <hr>
      <strong>Resultado da Jornada:</strong>
      <ul>
        <li><strong>0 a 1 sucesso:</strong> A viagem deixa cicatrizes profundas. Todos os personagens ficam <strong>esmorecidos</strong> até o fim da próxima cena.</li>
        <li><strong>2 sucessos:</strong> A jornada termina com desgaste, mas sem traumas permanentes.</li>
        <li><strong>3 sucessos:</strong> Chegam com sucesso! Cada personagem recupera <strong>2d6 PV</strong> e recebe <strong>+2 em testes de resistência contra cansaço</strong> até o fim da próxima cena.</li>
      </ul>`},
    {
        origem: "Guerra Artoniana", nd: "12", tipo: "Desafio Atletico", nome: "Escalando o Colosso", imagem: "https://images.squarespace-cdn.com/content/v1/5aac9b95cef3728570eeb118/1566630829435-9WK154HD87YHA30VOK53/ShadowOfTheCollossus_TwoBossFight.gif", efeito: `      <strong>Objetivo:</strong> Chegar ao topo do colosso.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>Cada personagem precisa de <strong>5 sucessos em testes de Escalar</strong> para alcançar o topo do colosso.</li>
        <li><strong>Voar</strong> é possível, mas exige tanto esforço quanto escalar e não oferece vantagem contra o vento. Os personagens voadores ainda podem <strong>cair</strong> e sofrem os mesmos efeitos.</li>
        <li>No início de cada rodada, as <strong>fornalhas do colosso</strong> emitem fumaça tóxica, fazendo todos perderem <strong>2d8 PV por veneno</strong>.</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Escalar (Atletismo CD 25):</strong> O personagem tenta subir um trecho do colosso. Se passar, ganha 1 sucesso. Se falhar, não avança. Se falhar por 5 ou mais, <strong>cai</strong>, sofre <strong>4d6 de dano de impacto</strong> e <strong>perde 1 sucesso</strong>.</li>
        <li><strong>Personagens com deslocamento de escalada ou voo:</strong> ganham <strong>+5 nos testes</strong>, mas não têm sucesso automático.</li>
        <li><strong>Carregar Outro (Atletismo CD 30):</strong> Carrega um aliado próximo (com até 1 sucesso de diferença). Se passar, ambos ganham 1 sucesso. Se cair, <strong>ambos sofrem dano e perdem 1 sucesso</strong>.</li>
        <li><strong>Ajudar Outro (Atletismo CD 20):</strong> Fornece <strong>+5 no teste de um aliado</strong>. Se falhar por 5 ou mais, sofre <strong>–5 no próximo teste</strong>. O ajudante não avança nessa rodada.</li>
        <li><strong>Segurar Outro (Reflexos CD 25):</strong> Reação. Permite tentar <strong>segurar um aliado em queda</strong>. Se falhar por 5 ou mais, <strong>cai junto</strong>.</li>
        <li><strong>Procurar Caminho (Percepção CD 25):</strong> Analisa o terreno. Se passar, recebe <strong>+5 no próximo teste de escalada</strong>.</li>
      </ul>
      <hr>
      <strong>Encontros:</strong> A escalada em si é o desafio. A cada rodada, o mestre pode descrever <em>eventos ambientais</em> como ventanias, pedras desmoronando ou chamas repentinas, que exigem testes adicionais de Reflexos, Fortitude ou manobras criativas dos jogadores.
      <ul>
        <li>Esses eventos não têm efeitos mecânicos fixos, mas podem alterar o ritmo da escalada ou causar penalidades.</li>
      </ul>
      <hr>
      <strong>Resultado da Jornada:</strong>
      <ul>
        <li><strong>Personagens que caírem três vezes:</strong> Considerados derrotados e não alcançam o topo.</li>
        <li><strong>Todos alcançam o topo:</strong> Vitória completa. O grupo recebe <strong>+2 em testes contra medo</strong> até o fim da próxima cena e <strong>inspiração do mestre</strong>.</li>
        <li><strong>Metade ou mais alcança o topo:</strong> Vitória parcial. Aqueles que chegaram ganham <strong>+1 em testes físicos</strong> até o fim da próxima cena.</li>
        <li><strong>Menos da metade chega ao topo:</strong> Fracasso. O colosso libera uma onda de energia mágica, todos sofrem <strong>5d10 de dano de força</strong> e são arremessados de volta ao chão (teste de Reflexos CD 25 para reduzir à metade).</li>
      </ul>`},
    {
        origem: "Guerra Artoniana", nd: "12", tipo: "Desafio de sobrevivência", nome: "Escapar da Explosão", imagem: "https://i.makeagif.com/media/3-10-2023/L4MKDf.gif", efeito: `      <strong>Objetivo:</strong> Escapar da área da explosão e dos destroços.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>Após sabotar a caldeira, o grupo tem <strong>1d6+3 rodadas</strong> para se afastar do cataclisma.</li>
        <li>No fim da última rodada, a posição de cada personagem é definida pelo <strong>número de sucessos acumulados</strong> nas ações <strong>escapar</strong> ou <strong>carregar outro</strong>.</li>
        <li><strong>3 sucessos ou menos:</strong> Zona de Devastação — sofre <strong>12d12 de dano</strong> (metade de fogo, metade de impacto) e fica <strong>soterrado</strong>.</li>
        <li><strong>4 a 8 sucessos:</strong> Zona de Destruição — sofre <strong>6d12 de dano de impacto</strong>.</li>
        <li><strong>9 sucessos ou mais:</strong> Escapa ileso.</li>
        <li>Personagens <strong>soterrados</strong> ficam <strong>imóveis</strong> e sofrem <strong>1d6 de dano de impacto</strong> no início de cada turno. Soltar-se (ou a um aliado) exige <strong>Força CD 25</strong>.</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Escapar (Acrobacia ou Atletismo CD 25):</strong> Corre, escala, salta ou voa para longe da explosão. Um sucesso por 10 ou mais (ou um 20 natural) conta como <strong>dois sucessos</strong>. Pode ser substituído por <strong>Cavalgar, Pilotagem ou Misticismo</strong>, se aplicável.</li>
        <li><strong>Carregar Outro (Atletismo CD 30):</strong> Carrega um aliado próximo (com no máximo 1 sucesso de diferença). Ambos ganham 1 sucesso em caso de êxito.</li>
        <li><strong>Procurar Caminho (Percepção CD 25):</strong> Analisa o terreno em busca de rotas seguras. Se passar, recebe <strong>+5 em todos os testes</strong> para escapar ou carregar outro durante o desafio.</li>
      </ul>
      <hr>
      <strong>Encontros:</strong> Durante cada rodada, o mestre pode descrever <em>efeitos ambientais</em> como tremores, desabamentos, jatos de vapor ou obstáculos em chamas. Esses eventos podem:
      <ul>
        <li>Exigir testes adicionais de Reflexos ou Fortitude;</li>
        <li>Impedir certos caminhos ou forçar recuos;</li>
        <li>Gerar oportunidades para <strong>ações criativas</strong> dos jogadores.</li>
      </ul>
      <hr>
      <strong>Resultado da Jornada:</strong>
      <ul>
        <li><strong>Soterrado:</strong> Personagem sofre penalidade severa e pode morrer se não for resgatado.</li>
        <li><strong>Zona de Destruição:</strong> Sofre dano, mas sobrevive com ferimentos.</li>
        <li><strong>Fuga bem-sucedida:</strong> Escapa ileso. Ganha <strong>+2 em testes de iniciativa</strong> até o fim da próxima cena, pela adrenalina da fuga.</li>
      </ul>`},
    {
        origem: "Guerra Artoniana", nd: "12", tipo: "Desafio de sobrevivência", nome: "Fuga do Bosque", imagem: "https://i0.kym-cdn.com/photos/images/original/001/222/377/1c4.gif", efeito: `      <strong>Objetivo:</strong> Guiar os refugiados através do bosque.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>Para escapar com sucesso, o grupo precisa acumular <strong>3 sucessos</strong> na ação <strong>Organizar Fuga</strong>.</li>
        <li>Ao final de cada rodada, o batalhão inimigo dispara uma <strong>saraivada de flechas</strong>, causando <strong>10d6 de dano de perfuração</strong> em todos os personagens e nos refugiados (<strong>Reflexos CD 30</strong> reduz à metade).</li>
        <li>Se algum <strong>NPC importante</strong> ficou para ajudar Fiz-Grin, o dano inicial dos puristas é reduzido em <strong>–1d6 por NPC</strong>. Essa penalidade diminui em <strong>1d6 por rodada</strong>.</li>
      </ul>
      <hr>
      <strong>Resultado da Jornada:</strong>
      <ul>
        <li><strong>Menos de 50 de dano total nos refugiados:</strong> A maioria sobrevive e o grupo tem sucesso.</li>
        <li><strong>Entre 50 e 100 de dano:</strong> Apenas metade dos refugiados sobrevive.</li>
        <li><strong>Mais de 100 de dano:</strong> Poucos sobrevivem e o grupo falha na missão.</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Organizar Fuga (Guerra CD 30):</strong> Dá ordens aos refugiados para avançar. <strong>Apenas um personagem</strong> pode fazer essa ação por rodada.</li>
        <li><strong>Curar Feridos (Cura CD 30):</strong> Socorre os feridos, curando <strong>10 pontos de dano</strong> causados aos refugiados. A magia <strong>Curar Ferimentos</strong> pode ser usada com aprimoramento de +5 PM.</li>
        <li><strong>Proteger Refugiados (Luta ou Pontaria CD 30):</strong> Ataca os inimigos ou cria obstáculos. Cada sucesso <strong>reduz o dano dos puristas em 2d6</strong> na próxima rodada.</li>
        <li><strong>Procurar Caminho (Percepção ou Sobrevivência CD 25):</strong> Analisa o terreno. Sucesso concede <strong>+5 no próximo teste de Organizar Fuga</strong> (próprio ou de um aliado).</li>
      </ul>
      <hr>
      <strong>Encontros:</strong> Durante a fuga, o mestre pode descrever <em>ameaças naturais</em> como:
      <ul>
        <li>Galhos caindo e espinhos venenosos;</li>
        <li>Trilhas falsas que levam a armadilhas ou emboscadas;</li>
        <li>Momentos de desespero entre os refugiados, exigindo ações criativas dos heróis.</li>
      </ul>`},
    {
        origem: "Guerra Artoniana", nd: "15", tipo: "Desafio de sobrevivência", nome: "Chuva de Meteoros", imagem: "https://i.makeagif.com/media/4-20-2024/E1ghJs.gif", efeito: `      <strong>Objetivo:</strong> Sobreviver à chuva de meteoros enquanto navegam pelo éter divino.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>A chuva dura <strong>1d6+10 rodadas</strong>. Após esse tempo, o grupo deixa os campos de asteroides para trás.</li>
        <li>No início de cada rodada, o <strong>navio sofre 10d12+20 de dano de impacto</strong>. O piloto pode fazer um teste de <strong>Pilotagem</strong>; em caso de sucesso, o dano é reduzido à metade.</li>
        <li>Se o piloto falhar, o navio <strong>perde 1d4 tripulantes</strong> (exceto parceiros, NPCs importantes ou personagens).</li>
        <li>Cada personagem faz um teste de <strong>Reflexos</strong> (CD 35 +1d12, rolado no início da rodada). Se falhar, sofre <strong>5d12+10 de dano</strong> de impacto.</li>
        <li>Se também falhar em um teste de <strong>Fortitude</strong>, o personagem é arremessado para fora do navio, sofrendo <strong>10d10 de dano</strong> no início de cada turno enquanto estiver no éter.</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Navegar (Pilotagem CD 30):</strong> Conduz o navio para fora da chuva. Cada sucesso reduz a duração da chuva em <strong>1 rodada</strong>. Apenas um personagem pode fazer essa ação por rodada.</li>
        <li><strong>Ajudar o Piloto (varia):</strong> Auxilia o teste de Pilotagem do piloto principal. Pode usar <em>qualquer perícia justificada</em>, como <strong>Atletismo</strong> para estabilizar estruturas ou <strong>Percepção</strong> para detectar meteoros.</li>
        <li><strong>Consertar o Navio (Ofício [artesão] CD 20):</strong> Recupera PV do navio igual à metade do resultado do teste.</li>
        <li><strong>Proteger Tripulantes (CD 30):</strong> Usa uma perícia à escolha (justificada) para salvar tripulantes perdidos. Um sucesso salva <strong>1 tripulante +1 a cada 10 pontos acima da CD</strong>.</li>
        <li><strong>Defender o Navio:</strong> Usa ataques, magia ou canhões para destruir meteoros (<strong>Def 10, RD 10, 100 PV</strong>). Cada meteoro destruído reduz a duração da chuva em <strong>1 rodada</strong>.</li>
        <li><strong>Voltar para o Navio (Misticismo ou Reflexos CD 30):</strong> Um personagem fora do navio pode retornar com um sucesso nesse teste, se tiver voo ou teletransporte. Outros casos exigem <em>planos criativos e/ou ajuda de aliados</em>.</li>
      </ul>`},
    {
        origem: "Guerra Artoniana", nd: "20", tipo: "Desafio de infiltração e resistência", nome: "Assalto à Base do Vilão", imagem: "https://i.pinimg.com/originals/e5/f8/46/e5f8460001aab4ba2ff8f8a6a60ce939.gif", efeito: `      <strong>Objetivo:</strong> Chegar ao centro de comando do General Supremo, acumulando cinco “avanços”.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>O grupo precisa de <strong>5 avanços</strong> para alcançar o centro. Um avanço ocorre quando a maioria dos personagens tem sucesso em suas ações na rodada.</li>
        <li>Ao final de cada rodada, os personagens sofrem:
          <ul>
            <li><strong>4d12 de dano de corte</strong> (guardas),</li>
            <li><strong>4d10 de dano de ácido</strong> (armadilhas),</li>
            <li><strong>4d8 de dano de essência</strong> (runas mágicas).</li>
          </ul>
          Esses danos podem ser reduzidos pelas ações descritas abaixo.
        </li>
        <li>Não há limite de rodadas, mas quanto mais tempo o grupo levar, mais exausto ele chegará ao final.</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Enfrentar Guardas (Luta ou Pontaria CD 50):</strong> Reduz o dano de corte em <strong>–2d12</strong> nesta rodada.</li>
        <li><strong>Desarmar Armadilhas (Ladinagem CD 50):</strong> Reduz o dano de ácido em <strong>–2d10</strong> nesta rodada.</li>
        <li><strong>Anular Runas (Misticismo CD 50):</strong> Reduz o dano de essência em <strong>–2d8</strong>. <em>Dissipar Magia</em> concede +5 neste teste.</li>
        <li><strong>Avançar (Acrobacia ou Atletismo CD 40):</strong> Conta para avanço, mas não reduz nenhum dano. Pode usar Misticismo se utilizar magia de movimento.</li>
        <li><strong>Analisar Caminho (Sobrevivência CD 40):</strong> Fornece <strong>+5 em todos os testes de avançar</strong> até o fim do desafio. Não conta como sucesso para avanço.</li>
        <li><strong>Analisar Sistemas de Segurança (Guerra CD 40):</strong> Fornece <strong>+5 em testes de enfrentar guardas, desarmar armadilhas e anular runas</strong> até o fim do desafio. Não conta como sucesso para avanço.</li>
        <li><strong>Incitar Rebelião (Diplomacia CD 50):</strong> Faz com que o grupo <strong>não sofra nenhum dano</strong> nesta rodada. Só pode ser bem-sucedido <strong>uma vez</strong> durante o desafio.</li>
        <li><strong>Matar Oficial:</strong> Gasta sua ação e você tem uma rodada para causar <strong>200 de dano</strong> contra um inimigo (Def 40, testes de resistência +20). Sucesso fornece <strong>+5 em todos os testes</strong> na rodada seguinte.</li>
        <li><strong>Quebrar Parede:</strong> Gasta sua ação e você tem uma rodada para causar <strong>200 de dano</strong> contra a parede (sem Defesa, sem testes de resistência, mas com <strong>RD 20</strong>). Sucesso conta como <strong>dois sucessos de avanço</strong>.</li>
      </ul>`},
    {
        origem: "Duelo de Dragões", nd: "1/2", tipo: "Desafio de exploração e resistência", nome: "Jornada pelos Esgotos", imagem: "https://i.makeagif.com/media/4-10-2021/GUjgKI.gif", efeito: `      <strong>Objetivo:</strong> Encontrar a vidreira Safira nos esgotos de Selentine, acumulando três sucessos na ação <em>explorar</em>.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>O grupo precisa de <strong>3 sucessos</strong> na ação <em>explorar</em> para localizar Safira.</li>
        <li>Apenas <strong>um teste de explorar</strong> pode ser tentado por rodada.</li>
        <li>Cada rodada representa alguns minutos de busca, expondo os personagens a vapores tóxicos que causam <strong>1 ponto de dano de veneno</strong> (evitável com a ação correta).</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Explorar (Sobrevivência CD 12):</strong> O personagem se orienta pelos corredores labirínticos. Cada sucesso conta para encontrar Safira.</li>
        <li><strong>Prender a Respiração (Fortitude CD 12):</strong> Evita o dano por vapores tóxicos nesta rodada.</li>
        <li><strong>Prever o Caminho (Intuição CD 12):</strong> Conta como um sucesso em <em>explorar</em>, mas só pode ser usada <strong>uma vez</strong> por personagem e apenas após uma falha em explorar.</li>
        <li><strong>Procurar Rastros (Investigação CD 12):</strong> Concede <strong>+2 em um teste de explorar</strong> (seu ou de um aliado).</li>
        <li><strong>Tratar (Cura CD 12):</strong> Cura <strong>1 ponto de dano</strong> causado pelos vapores do esgoto em um aliado.</li>
      </ul>`},
    {
        origem: "Duelo de Dragões", nd: "1", tipo: "Desafio de agilidade e sobrevivência", nome: "Fuga da Torre", imagem: "https://64.media.tumblr.com/e96c0a5d0c00f852967f42efe501cafd/d932109ee948e29d-ae/s500x750/2ecb2ffa41d9e41b0124e8057a8fc5d4c6f300e3.gif", efeito: `      <strong>Objetivo:</strong> Escapar da torre em colapso antes que ela desmorone sobre os personagens.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>Cada personagem precisa acumular <strong>3 sucessos</strong> na ação <em>fugir</em> para escapar.</li>
        <li>Ao final de cada rodada, escombros caem sobre os personagens ainda dentro da torre, causando <strong>1d6 de dano de impacto</strong>.</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Fugir (Atletismo ou Sobrevivência CD 15):</strong> Aproxima o personagem da saída. Se ultrapassar a CD em <strong>10 ou mais</strong>, conta como <strong>dois sucessos</strong>.</li>
        <li><strong>Encontrar Rota (Conhecimento ou Percepção CD 15):</strong> Avalia a arquitetura ou identifica uma rota segura. Sucesso concede <strong>+5 no próximo teste para fugir</strong>.</li>
        <li><strong>Carregar Alguém (Atletismo CD 20):</strong> Move-se em direção à saída com um aliado que possua o mesmo número de sucessos no início da rodada. Um sucesso nesta ação <strong>conta como sucesso para ambos</strong>.</li>
        <li><strong>Guiar (Diplomacia CD 15):</strong> O personagem motiva ou orienta um aliado, concedendo <strong>+5 ao teste de fuga</strong> de outro personagem.</li>
      </ul>`},
    {
        origem: "Duelo de Dragões", nd: "1", tipo: "Desafio de exploração e resistência", nome: "Obter Recursos", imagem: "https://i.imgur.com/yq22WfW.gif", efeito: `      <strong>Objetivo:</strong> Coletar cinco recursos (comida, água ou lenha) nos ermos congelados.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>O grupo precisa reunir <strong>cinco recursos</strong> em qualquer combinação entre água, comida e lenha.</li>
        <li>Falhar em um teste de coleta por <strong>5 ou mais</strong> resulta em <strong>1d6 de dano</strong> por exaustão e ferimentos.</li>
        <li>A cada sucesso em encontrar um tipo de recurso, a <strong>CD para aquele tipo aumenta em +2</strong> cumulativamente.</li>
        <li>Ao final de cada rodada, cada personagem sofre <strong>1d6 de dano de frio</strong> (Fortitude CD 15 +1 por teste anterior reduz à metade).</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Encontrar Recursos (Sobrevivência CD 15):</strong> Escolha entre água, comida ou lenha. Sucesso garante 1 recurso do tipo escolhido. Outras perícias podem ser usadas a critério do mestre, mas apenas <strong>uma vez por personagem</strong> durante o desafio.</li>
        <li><strong>Aconselhar (Conhecimento CD 15):</strong> Compartilha experiências úteis. Sucesso concede <strong>+2 no próximo teste</strong> de encontrar recursos de um aliado.</li>
        <li><strong>Encontrar Abrigo (Sobrevivência CD 15):</strong> Localiza um refúgio contra o frio. Todos os personagens recebem <strong>+2 em Fortitude contra o frio</strong> e, se passarem, não sofrem dano nesta rodada.</li>
        <li><strong>Aquecer (Cura CD 15):</strong> Auxilia um aliado a se aquecer. Este recupera <strong>1d6 PV</strong>, mas apenas do dano de frio causado por este desafio.</li>
      </ul>`},
    {
        origem: "Duelo de Dragões", nd: "1", tipo: "Desafio de agilidade e sobrevivência", nome: "Avalanche Menor", imagem: "https://media.tenor.com/JQlRItISRC0AAAAM/snow-plowing.gif", efeito: `      <strong>Objetivo:</strong> Escapar da avalanche antes de ser soterrado.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>Cada personagem precisa acumular <strong>3 sucessos</strong> na ação <em>fugir</em> para escapar.</li>
        <li>A avalanche causa <strong>1d6 de dano de impacto</strong> por rodada (Reflexos CD 15 reduz à metade).</li>
        <li>Ao acumular <strong>3 falhas</strong>, o personagem fica <strong>inconsciente</strong>.</li>
        <li>Personagens que escapam (3 sucessos) podem usar a ação <em>Guiar</em> para ajudar os outros e não sofrem mais dano de impacto.</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Fugir (Atletismo ou Sobrevivência CD 15):</strong> Acumule 3 sucessos para escapar da avalanche.</li>
        <li><strong>Planejar Movimento (Guerra CD 15):</strong> Oferece tática ao grupo. Todos recebem <strong>+2 nos testes de fuga e Reflexos</strong> na próxima rodada.</li>
        <li><strong>Guiar (Intuição CD 15):</strong> Instrui aliados após escapar. Um aliado recebe <strong>+2 em seu próximo teste</strong> nesta rodada.</li>
      </ul>`},
    {
        origem: "Duelo de Dragões", nd: "3", tipo: "Desafio de precisão e evasão aérea", nome: "Céus Hostis", imagem: "https://i.makeagif.com/media/2-04-2019/u3sGsK.gif", efeito: `      <strong>Objetivo:</strong> Ajudar Dame Lia a pilotar a carruagem até o Castelo Monteclaro evitando ataques puristas.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>O grupo precisa alcançar <strong>7 sucessos em testes de Navegar</strong> para chegar ao destino com segurança.</li>
        <li>A cada falha em Navegar, uma patrulha purista em terra detecta a carruagem e dispara armas de cerco: todos sofrem <strong>2d6 de dano</strong> (1–2 fogo, 3–4 impacto, 5–6 perfuração). Reflexos CD 15 evita o dano.</li>
        <li>Apenas <strong>um personagem pode fazer o teste de Navegar por rodada</strong>.</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Navegar (Pilotagem ou Sobrevivência CD 20):</strong> Ajuda Dame Lia a pilotar a carruagem. Conta para os 7 sucessos necessários.</li>
        <li><strong>Ler Mapas (Conhecimento ou Sobrevivência CD 10):</strong> Auxilia com pontos de referência. Concede <strong>+2 no teste de Navegar</strong> desta rodada. Apenas um personagem pode ajudar por vez.</li>
        <li><strong>Ocultar (Furtividade CD 20):</strong> Orienta Dame Lia a esconder a carruagem. Uma falha em Navegar nesta rodada <strong>não provoca ataques</strong> dos puristas. Apenas um personagem pode fazer este teste por rodada.</li>
        <li><strong>Esconder-se (Nenhum teste):</strong> O personagem se abriga na carruagem, ganhando <strong>+5 em Reflexos</strong> nesta rodada contra as armas de cerco.</li>
      </ul>`},
    {
        origem: "Duelo de Dragões", nd: "4", tipo: "Desafio de agilidade e resgate", nome: "Deslizamento", imagem: "https://y.yarn.co/094a06fc-3b94-4f01-a693-3651d239472d_text.gif", efeito: `      <strong>Objetivo:</strong> Escapar do deslizamento antes de ser soterrado.
      <hr>
      <strong>Efeito:</strong>
      <ul>
        <li>O grupo tem <strong>5 rodadas</strong> para se afastar dos escombros. A posição final de cada personagem é definida pelo número de sucessos acumulados em <em>Correr</em> ou <em>Carregar Outro</em>.</li>
        <li><strong>2 ou menos sucessos:</strong> Zona de Soterramento – sofre <strong>16d6 de dano de impacto</strong> e fica soterrado.</li>
        <li><strong>3 ou 4 sucessos:</strong> Zona de Deslizamento – sofre <strong>8d6 de dano de impacto</strong>.</li>
        <li><strong>5 ou mais sucessos:</strong> Escapa ileso.</li>
        <li>Personagens soterrados ficam imóveis e sofrem <strong>1d6 de dano de impacto</strong> no início de seus turnos. Para se soltar, é necessário um teste de <strong>Força CD 25</strong> (pode ser ajudado).</li>
        <li>Cavaleiros iniciantes ficam na mesma zona de seus respectivos personagens. Se ficarem na zona de soterramento, morrem; na zona de deslizamento, ficam feridos (podem ser curados com 50 PV ou mais).</li>
        <li>Stramm e Dame Lia não correm risco neste desafio.</li>
        <li>Teste de <strong>Iniciativa CD 20</strong>: quem passar pode fazer uma ação adicional na primeira rodada.</li>
        <li>Uma vez por cena, Dame Lia, Stramm ou um Cavaleiro pode permitir que um aliado <strong>repita um teste após falha</strong>.</li>
      </ul>
      <hr>
      <h6 class="text-danger"><strong>Testes:</strong></h6>
      <ul>
        <li><strong>Correr (Atletismo CD 20):</strong> Corre para longe do deslizamento. Cada sucesso afasta o personagem. Um resultado 10+ acima da CD ou um 20 natural conta como dois sucessos. Pode ser substituído por Cavalgar ou Pilotagem se aplicável.</li>
        <li><strong>Carregar Outro (Atletismo CD 25):</strong> Carrega um aliado próximo (com no máximo 1 sucesso de diferença). Ambos ganham 1 sucesso se passar.</li>
        <li><strong>Procurar Caminho (Percepção CD 20):</strong> Analisa o terreno e encontra rotas de fuga. Se passar, recebe <strong>+5 em testes de Correr e Carregar Outro</strong> durante o desafio.</li>
      </ul>`},
];
// ===== SISTEMA DE PERIGOS COMPLEXOS =====

let _perigosCenaAlvo = null;
let _perigosFiltrados = []; // reference by index to avoid JSON-in-onclick
let _perigoPreviewIdx = null;

function abrirModalPerigos(cenaId) {
    _perigosCenaAlvo = cenaId;
    const modal = document.getElementById('modalPerigos');
    if (!modal) return;
    modal.style.display = 'flex';
    document.getElementById('perigoSearch').value = '';
    document.getElementById('perigoFiltroND').value = '';
    document.getElementById('perigoFiltroTipo').value = '';
    _perigoPreviewIdx = null;
    _atualizarPreviewPerigo();
    renderizarListaPerigos();
}

function fecharModalPerigos() {
    const modal = document.getElementById('modalPerigos');
    if (modal) modal.style.display = 'none';
    _perigosCenaAlvo = null;
    _perigoPreviewIdx = null;
}

function renderizarListaPerigos() {
    const busca = (document.getElementById('perigoSearch')?.value || '').toLowerCase();
    const filtroND = document.getElementById('perigoFiltroND')?.value || '';
    const filtroTipo = document.getElementById('perigoFiltroTipo')?.value || '';

    _perigosFiltrados = PERIGOS_DATA.filter(p => {
        const matchBusca = !busca || p.nome.toLowerCase().includes(busca)
            || p.tipo.toLowerCase().includes(busca)
            || p.origem.toLowerCase().includes(busca);
        const matchND = !filtroND || p.nd === filtroND;
        const matchTipo = !filtroTipo || p.tipo === filtroTipo;
        return matchBusca && matchND && matchTipo;
    }).sort((a, b) => {
        const toNum = s => s === '1/2' ? 0.5 : parseFloat(s) || 0;
        return toNum(a.nd) - toNum(b.nd);
    });

    // Reset preview if selected item no longer in list
    _perigoPreviewIdx = null;
    _atualizarPreviewPerigo();

    const container = document.getElementById('perigoLista');
    if (!container) return;

    if (_perigosFiltrados.length === 0) {
        container.innerHTML = '<div class="perigo-empty">Nenhum perigo encontrado com esses filtros.</div>';
        return;
    }

    container.innerHTML = _perigosFiltrados.map((p, idx) => `
        <div class="perigo-item" id="pitem-${idx}" onclick="previewPerigo(${idx})">
            <div class="perigo-item-header">
                <strong class="perigo-item-nome">${p.nome}</strong>
                <div class="perigo-item-tags">
                    <span class="ptag ptag-nd">ND ${p.nd}</span>
                    <span class="ptag ptag-tipo">${p.tipo}</span>
                </div>
            </div>
            <div class="perigo-item-sub">${p.origem}</div>
        </div>
    `).join('');
}

function previewPerigo(idx) {
    // Highlight selected item
    document.querySelectorAll('.perigo-item').forEach(el => el.classList.remove('selecionado'));
    const el = document.getElementById(`pitem-${idx}`);
    if (el) el.classList.add('selecionado');
    _perigoPreviewIdx = idx;
    _atualizarPreviewPerigo();
}

function _atualizarPreviewPerigo() {
    const panel = document.getElementById('perigoPreviewPanel');
    if (!panel) return;

    if (_perigoPreviewIdx === null || !_perigosFiltrados[_perigoPreviewIdx]) {
        panel.innerHTML = '<div class="perigo-preview-vazio">← Clique em um perigo para ver os detalhes</div>';
        return;
    }

    const p = _perigosFiltrados[_perigoPreviewIdx];
    // Fix literal \\n that may appear in efeito from source encoding
    const efeitoHtml = (p.efeito || '')
        .replace(/\\n/g, '')
        .replace(/\\t/g, '');

    panel.innerHTML = `
        <div class="perigo-preview-header">
            <div>
                <strong class="perigo-preview-nome">${p.nome}</strong>
                <div class="perigo-mini-tags" style="margin-top:6px;">
                    <span class="ptag ptag-nd">ND ${p.nd}</span>
                    <span class="ptag ptag-tipo">${p.tipo}</span>
                    <span class="ptag ptag-origem">${p.origem}</span>
                </div>
            </div>
            ${p.imagem ? `<img src="${p.imagem}" class="perigo-preview-img" onerror="this.style.display='none'">` : ''}
        </div>
        <div class="perigo-preview-efeito">${efeitoHtml}</div>
        <button class="btn-confirmar-perigo" onclick="confirmarPerigo()">✅ Adicionar à Cena</button>
    `;
}

function confirmarPerigo() {
    if (_perigoPreviewIdx === null || !_perigosFiltrados[_perigoPreviewIdx]) return;
    const p = _perigosFiltrados[_perigoPreviewIdx];
    if (!_perigosCenaAlvo) return;
    const cena = cenasAtuais.find(c => c.id === _perigosCenaAlvo);
    if (!cena) return;

    cena.perigoSelecionado = {
        nome: p.nome,
        nd: p.nd,
        tipo: p.tipo,
        origem: p.origem,
        efeito: p.efeito || ''
    };
    salvarDados();
    renderizar();
    const alvo = _perigosCenaAlvo;
    setTimeout(() => {
        const plotEl = document.getElementById(`plot-${alvo}`);
        if (plotEl && !plotEl.classList.contains('aberto')) plotEl.classList.add('aberto');
    }, 60);
    fecharModalPerigos();
    mostrarToast(`⚠️ "${p.nome}" adicionado à cena!`, 'info');
}

function limparPerigo(cenaId) {
    const cena = cenasAtuais.find(c => c.id === cenaId);
    if (cena) { cena.perigoSelecionado = null; salvarDados(); renderizar(); }
}

function inserirPerigoNoPlot(cenaId) {
    const cena = cenasAtuais.find(c => c.id === cenaId);
    if (!cena || !cena.perigoSelecionado) return;
    const p = cena.perigoSelecionado;

    const textoLimpo = (p.efeito || '')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '  ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<li>/gi, '\n• ')
        .replace(/<\/li>/gi, '')
        .replace(/<ul[^>]*>/gi, '').replace(/<\/ul>/gi, '')
        .replace(/<ol[^>]*>/gi, '').replace(/<\/ol>/gi, '')
        .replace(/<hr\s*\/?>/gi, '\n────────────────────\n')
        .replace(/<h[1-6][^>]*>/gi, '\n').replace(/<\/h[1-6]>/gi, '\n')
        .replace(/<strong>/gi, '').replace(/<\/strong>/gi, '')
        .replace(/<em>/gi, '').replace(/<\/em>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    const bloco = `━━━ PERIGO: ${p.nome} ━━━\nND: ${p.nd} | Tipo: ${p.tipo} | Fonte: ${p.origem}\n\n${textoLimpo}\n━━━━━━━━━━━━━━━━━━━━━━━`;
    cena.plot = (cena.plot ? cena.plot + '\n\n' : '') + bloco;
    salvarDados();
    renderizar();
    setTimeout(() => {
        const plotEl = document.getElementById(`plot-${cenaId}`);
        if (plotEl && !plotEl.classList.contains('aberto')) plotEl.classList.add('aberto');
    }, 60);
    mostrarToast('📋 Perigo inserido no enredo!', 'sucesso');
}

function inserirTesourNoPlot(cenaId) {
    const cena = cenasAtuais.find(c => c.id === cenaId);
    if (!cena || !cena.tesouros) return;

    // Convert **bold** markers to plain text
    const textoLimpo = cena.tesouros.replace(/\*\*(.+?)\*\*/g, '$1');
    const bloco = `━━━ TESOURO ROLADO ━━━\n${textoLimpo}\n━━━━━━━━━━━━━━━━━━━━━`;
    cena.plot = (cena.plot ? cena.plot + '\n\n' : '') + bloco;
    salvarDados();
    renderizar();
    setTimeout(() => {
        const plotEl = document.getElementById(`plot-${cenaId}`);
        if (plotEl && !plotEl.classList.contains('aberto')) plotEl.classList.add('aberto');
    }, 60);
    mostrarToast('💰 Tesouro inserido no enredo!', 'sucesso');
}

// ───── TESOURO (copiado da versão anterior) ────────────────────────────────

function rolarDado(lados) { return Math.floor(Math.random() * lados) + 1; }

function rolarExpressao(expr) {
    let str = expr.trim();
    let multiplicador = 1, adicional = 0;
    const xMatch = str.match(/x(\d+)$/i);
    if (xMatch) { multiplicador = parseInt(xMatch[1]); str = str.replace(/x\d+$/i, ''); }
    const addMatch = str.match(/\+(\d+)$/);
    if (addMatch) { adicional = parseInt(addMatch[1]); str = str.replace(/\+\d+$/, ''); }
    const diceMatch = str.match(/^(\d+)d(\d+)$/i);
    if (diceMatch) {
        const n = parseInt(diceMatch[1]), lados = parseInt(diceMatch[2]);
        const rolagens = Array.from({ length: n }, () => rolarDado(lados));
        const soma = rolagens.reduce((a, b) => a + b, 0) + adicional;
        return { valor: soma * multiplicador, rolagens, n, lados, adicional, multiplicador };
    }
    return { valor: 0, rolagens: [], n: 0, lados: 0 };
}

function buscarTabela(tabela, roll) { return tabela.find(e => roll >= e.lo && roll <= e.hi) || null; }

function tipoEquipamento2D() {
    const d1 = rolarDado(6), d2 = rolarDado(6), m = Math.max(d1, d2);
    return { d1, d2, tipo: m <= 3 ? 'armas' : m <= 5 ? 'armaduras' : 'esotericos' };
}

function rolarEquipamento(usar2D = false) {
    let tipoRoll, tipo;
    if (usar2D) { const r = tipoEquipamento2D(); tipoRoll = `2d6:${r.d1}+${r.d2}→${r.tipo}`; tipo = r.tipo; }
    else { const d6 = rolarDado(6); tipo = d6 <= 3 ? 'armas' : d6 <= 5 ? 'armaduras' : 'esotericos'; tipoRoll = `1d6:${d6}→${tipo}`; }
    const r = rolarDado(100); const item = buscarTabela(TESOURO_TABELAS.equipamentos[tipo], r);
    return `Equipamento — ${tipoRoll} | d%:${r} → **${item ? item.nome : '?'}**`;
}

function rolarSuperior(n, usar2D = false) {
    let tipoRoll, tipo;
    if (usar2D) { const r = tipoEquipamento2D(); tipoRoll = `2d6:${r.d1}+${r.d2}→${r.tipo}`; tipo = r.tipo; }
    else { const d6 = rolarDado(6); tipo = d6 <= 3 ? 'armas' : d6 <= 5 ? 'armaduras' : 'esotericos'; tipoRoll = `1d6:${d6}→${tipo}`; }
    const ir = rolarDado(100); const item = buscarTabela(TESOURO_TABELAS.equipamentos[tipo], ir);
    const melhorias = Array.from({ length: n }, () => { const r = rolarDado(100); const m = buscarTabela(TESOURO_TABELAS.superiores[tipo], r); return `d%:${r}→${m ? m.nome : '?'}`; });
    return `Superior (${n} melhoria${n > 1 ? 's' : ''}) — ${tipoRoll} | Item d%:${ir}→**${item ? item.nome : '?'}** | Melhoria${n > 1 ? 's' : ''}: ${melhorias.join(', ')}`;
}

function rolarMagico(grau, usar2D = false) {
    let tipoRoll, tipo;
    if (usar2D) { const r = tipoEquipamento2D(); tipoRoll = `2d6:${r.d1}+${r.d2}→${r.tipo}`; tipo = r.tipo; }
    else { const d6 = rolarDado(6); tipo = d6 <= 4 ? 'armas' : d6 === 5 ? 'armaduras' : 'acessorio'; tipoRoll = `1d6:${d6}→${tipo}`; }
    if (tipo === 'acessorio') {
        const tier = grau === 'menor' ? 'menor' : grau === 'médio' ? 'medio' : 'maior';
        const r = rolarDado(100); const item = buscarTabela(TESOURO_TABELAS.acessorios[tier], r);
        return `Mágico (${grau}) — ${tipoRoll} | Acessório ${tier} d%:${r}→**${item ? item.nome : '?'}**`;
    }
    const r = rolarDado(100); const item = buscarTabela(TESOURO_TABELAS.magicos[tipo], r);
    return `Mágico (${grau}) — ${tipoRoll} | Encanto d%:${r}→**${item ? item.nome : '?'}**`;
}

function rolarPocoes(n, bonusPct = false) {
    return `${n} Poção${n > 1 ? '(ões)' : ''}: ` + Array.from({ length: n }, () => {
        let r = rolarDado(100); if (bonusPct) r = Math.min(r + 20, 120);
        const p = buscarTabela(TESOURO_TABELAS.pocoes, r);
        return `d%:${r}${bonusPct ? ' (+20%)' : ''}→**${p ? p.nome : '?'}**`;
    }).join(' | ');
}

function rolarItemDiverso() {
    const r = rolarDado(100); const item = buscarTabela(TESOURO_TABELAS.itensDiversos, r);
    return `Item Diverso d%:${r}→**${item ? item.nome : '?'}**`;
}

function rolarRiqueza(tipo, bonusPct = false) {
    let roll = rolarDado(100); const rollFinal = Math.min(roll + (bonusPct ? 20 : 0), 100);
    const entrada = buscarTabela(TESOURO_TABELAS.riquezas[tipo], rollFinal);
    if (!entrada) return `Riqueza ${tipo} d%:${rollFinal}→?`;
    const m = entrada.valor.match(/([\d]+d[\d]+(?:x[\d]+)?)/i);
    let valorFinal = '';
    if (m) { const r = rolarExpressao(m[1]); valorFinal = ` = ${r.valor} T$ (${r.rolagens.join('+')}${r.multiplicador > 1 ? '×' + r.multiplicador : ''})`; }
    return `Riqueza ${tipo} — d%:${rollFinal}${bonusPct ? ' (+20%)' : ''}→${entrada.valor}${valorFinal}`;
}

function parseDinheiroNDResult(res, metade = false) {
    if (res === '—') return '— (sem dinheiro)';
    const ricMatch = res.match(/([\dd+]+|1)\s+riqueza(?:s)?\s+(menor|média|maior)(?:s)?(\s+\+%)?/i);
    if (ricMatch) {
        const qtdE = ricMatch[1], tipo = ricMatch[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), bonusPct = !!ricMatch[3];
        let qtd = qtdE.includes('d') ? rolarExpressao(qtdE).valor : (parseInt(qtdE) || 1);
        return Array.from({ length: qtd }, () => rolarRiqueza(tipo === 'media' ? 'media' : tipo, bonusPct)).join('\n    ');
    }
    const mMoney = res.match(/([\dd+\s]+x?\d*)\s*(T\$|TO|TC)/i);
    if (!mMoney) return res;
    const r = rolarExpressao(mMoney[1].trim().replace(/\s+/g, ''));
    let v = r.valor; if (metade) v = Math.floor(v / 2);
    let det = r.rolagens.length > 0 ? ` (${r.rolagens.join('+')}${r.adicional ? '+' + r.adicional : ''}${r.multiplicador > 1 ? '×' + r.multiplicador : ''})` : '';
    if (metade) det += ' [÷2 Metade]';
    return `💰 ${v} ${mMoney[2]}${det}`;
}

function parseItemNDResult(res) {
    if (res === '—') return '— (sem item)';
    const usar2D = res.includes('2D'), bonusPct = res.includes('+%');
    const limpo = res.replace('2D', '').replace('+%', '').trim();
    if (limpo.includes('Item diverso')) return rolarItemDiverso();
    if (limpo.match(/^Equipamento\b/)) return rolarEquipamento(usar2D);
    const supM = limpo.match(/Superior \((\d+) melhorias?\)/);
    if (supM) return rolarSuperior(parseInt(supM[1]), usar2D);
    const pocM = limpo.match(/^([\dd+]+)\s+po[çc]/i);
    if (pocM) { const qtdE = pocM[1]; let qtd = qtdE.includes('d') ? rolarExpressao(qtdE).valor : (parseInt(qtdE) || 1); return rolarPocoes(qtd, bonusPct); }
    const magM = limpo.match(/Mágico \((menor|médio|maior)\)/i);
    if (magM) return rolarMagico(magM[1], usar2D);
    return res;
}

function rolarTesouro(cenaId) {
    const cena = cenasAtuais.find(c => c.id === cenaId); if (!cena) return;
    const nivel = parseInt(document.getElementById('selectNivel').value) || 1;
    const dif = calcularDificuldades(nivel);
    const capStr = dif[cena.dificuldadeSelecionada];
    let ndNum = capStr === '1/4' ? 0.25 : capStr === '1/2' ? 0.5 : (parseInt(capStr) || 1);
    ndNum = Math.max(0.25, Math.min(20, ndNum));
    const chaves = Object.keys(TESOURO_ND).map(Number).sort((a, b) => a - b);
    const ndKey = String(chaves.reduce((p, c) => Math.abs(c - ndNum) < Math.abs(p - ndNum) ? c : p));
    const tabela = TESOURO_ND[ndKey]; if (!tabela) { mostrarToast('ND não encontrado.', 'erro'); return; }
    const mod = document.getElementById(`tesouro-mod-${cenaId}`)?.value || 'padrao';
    if (mod === 'nenhum') { exibirResultadoTesouro(cenaId, '❌ Nenhum tesouro (criatura sem riquezas).'); return; }
    const vezes = mod === 'dobro' ? 2 : 1, metade = mod === 'metade';
    const linhas = [`🎲 Tesouro — ND ${ndKey} (${mod.charAt(0).toUpperCase() + mod.slice(1)})`];
    for (let i = 0; i < vezes; i++) {
        if (vezes > 1) linhas.push(`\n— Rolagem ${i + 1} —`);
        const rD = rolarDado(100), eD = buscarTabela(tabela.dinheiro, rD), resD = eD ? eD.res : '—';
        linhas.push(`💰 Dinheiro (d%:${rD} → "${resD}"): ${parseDinheiroNDResult(resD, metade)}`);
        const rI = rolarDado(100), eI = buscarTabela(tabela.itens, rI), resI = eI ? eI.res : '—';
        linhas.push(`🎁 Item (d%:${rI} → "${resI}"): ${parseItemNDResult(resI)}`);
    }
    exibirResultadoTesouro(cenaId, linhas.join('\n'));
}

function exibirResultadoTesouro(cenaId, texto) {
    const cena = cenasAtuais.find(c => c.id === cenaId);
    if (cena) { cena.tesouros = texto; salvarDados(); }
    const el = document.getElementById(`tesouro-resultado-${cenaId}`);
    if (el) {
        el.innerHTML = texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        el.classList.add('visivel');
    }
}

function limparTesouro(cenaId) {
    const cena = cenasAtuais.find(c => c.id === cenaId);
    if (cena) { cena.tesouros = null; salvarDados(); }
    const el = document.getElementById(`tesouro-resultado-${cenaId}`);
    if (el) { el.innerHTML = ''; el.classList.remove('visivel'); }
    renderizar();
}

// ===== DADOS DE TESOURO T20 =====
const TESOURO_TABELAS = {
    itensDiversos: [{ lo: 2, hi: 2, nome: "Água benta" }, { lo: 3, hi: 3, nome: "Alaúde élfico" }, { lo: 4, hi: 4, nome: "Algemas" }, { lo: 5, hi: 5, nome: "Baga-de-fogo" }, { lo: 6, hi: 8, nome: "Bálsamo restaurador" }, { lo: 9, hi: 9, nome: "Bandana" }, { lo: 10, hi: 10, nome: "Bandoleira de poções" }, { lo: 11, hi: 11, nome: "Bomba" }, { lo: 12, hi: 12, nome: "Botas reforçadas" }, { lo: 13, hi: 13, nome: "Camisa bufante" }, { lo: 14, hi: 14, nome: "Capa esvoaçante" }, { lo: 15, hi: 15, nome: "Capa pesada" }, { lo: 16, hi: 16, nome: "Casaco longo" }, { lo: 17, hi: 17, nome: "Chapéu arcano" }, { lo: 18, hi: 18, nome: "Coleção de livros" }, { lo: 19, hi: 19, nome: "Cosmético" }, { lo: 20, hi: 20, nome: "Dente-de-dragão" }, { lo: 21, hi: 21, nome: "Enfeite de elmo" }, { lo: 22, hi: 22, nome: "Elixir do amor" }, { lo: 23, hi: 23, nome: "Equipamento de viagem" }, { lo: 24, hi: 26, nome: "Essência de mana" }, { lo: 27, hi: 27, nome: "Estojo de disfarces" }, { lo: 28, hi: 28, nome: "Farrapos de ermitão" }, { lo: 29, hi: 29, nome: "Flauta mística" }, { lo: 30, hi: 30, nome: "Fogo alquímico" }, { lo: 31, hi: 31, nome: "Gorro de ervas" }, { lo: 32, hi: 32, nome: "Líquen lilás" }, { lo: 33, hi: 33, nome: "Luneta" }, { lo: 34, hi: 34, nome: "Luva de pelica" }, { lo: 35, hi: 35, nome: "Maleta de medicamentos" }, { lo: 36, hi: 36, nome: "Manopla" }, { lo: 37, hi: 37, nome: "Manto eclesiástico" }, { lo: 38, hi: 38, nome: "Mochila de aventureiro" }, { lo: 39, hi: 39, nome: "Musgo púrpura" }, { lo: 40, hi: 40, nome: "Organizador de pergaminhos" }, { lo: 41, hi: 41, nome: "Ossos de monstro" }, { lo: 42, hi: 42, nome: "Pó de cristal" }, { lo: 43, hi: 43, nome: "Pó de giz" }, { lo: 44, hi: 44, nome: "Pó do desaparecimento" }, { lo: 45, hi: 45, nome: "Robe místico" }, { lo: 46, hi: 46, nome: "Saco de sal" }, { lo: 47, hi: 47, nome: "Sapatos de camurça" }, { lo: 48, hi: 48, nome: "Seixo de âmbar" }, { lo: 49, hi: 49, nome: "Sela" }, { lo: 50, hi: 50, nome: "Tabardo" }, { lo: 51, hi: 51, nome: "Traje da corte" }, { lo: 52, hi: 52, nome: "Terra de cemitério" }, { lo: 53, hi: 53, nome: "Veste de seda" }, { lo: 54, hi: 54, nome: "Corda de teia" }, { lo: 55, hi: 55, nome: "Dente de wisphago" }, { lo: 56, hi: 56, nome: "Bomba de fumaça" }, { lo: 57, hi: 57, nome: "Elixir quimérico" }, { lo: 58, hi: 58, nome: "Éter elemental" }, { lo: 59, hi: 59, nome: "Óleo de besouro" }, { lo: 60, hi: 60, nome: "Água benta concentrada" }, { lo: 61, hi: 61, nome: "Aspersório" }, { lo: 62, hi: 62, nome: "Patuá" }, { lo: 63, hi: 63, nome: "Panfleto de aforismos" }, { lo: 64, hi: 64, nome: "Texto sagrado" }, { lo: 65, hi: 65, nome: "Hábito sacerdotal" }, { lo: 66, hi: 66, nome: "Manto de alto sacerdote" }, { lo: 67, hi: 67, nome: "Sandálias" }, { lo: 68, hi: 68, nome: "Piercing de umbigo" }, { lo: 69, hi: 69, nome: "Incenso" }, { lo: 70, hi: 70, nome: "Santa granada de mão" }, { lo: 71, hi: 71, nome: "Fitilho consagrado" }, { lo: 72, hi: 72, nome: "Pena de anjo" }, { lo: 73, hi: 73, nome: "Ábaco" }, { lo: 74, hi: 74, nome: "Ampulheta" }, { lo: 75, hi: 75, nome: "Astrolábio" }, { lo: 76, hi: 76, nome: "Bainha adornada" }, { lo: 77, hi: 77, nome: "Bússola" }, { lo: 78, hi: 78, nome: "Diagrama anatômico" }, { lo: 79, hi: 79, nome: "Estrepes" }, { lo: 80, hi: 80, nome: "Lampião de foco" }, { lo: 81, hi: 81, nome: "Leque" }, { lo: 82, hi: 82, nome: "Lupa" }, { lo: 83, hi: 83, nome: "Mapa (mestre define de qual região)" }, { lo: 84, hi: 84, nome: "Mecanismo de mola" }, { lo: 85, hi: 85, nome: "Mochila discreta" }, { lo: 86, hi: 86, nome: "Sinete" }, { lo: 87, hi: 87, nome: "Apito de caça" }, { lo: 88, hi: 88, nome: "Baralho marcado" }, { lo: 89, hi: 89, nome: "Clarim deheoni" }, { lo: 90, hi: 90, nome: "Pandeiro das estradas" }, { lo: 91, hi: 91, nome: "Camisolão" }, { lo: 92, hi: 92, nome: "Casaca de apetrechos" }, { lo: 93, hi: 93, nome: "Chapéu emplumado" }, { lo: 94, hi: 94, nome: "Elmo leve" }, { lo: 95, hi: 95, nome: "Elmo pesado" }, { lo: 96, hi: 96, nome: "Rondel" }, { lo: 97, hi: 97, nome: "Sapatos confortáveis" }, { lo: 98, hi: 98, nome: "Sapatos de salto alto" }, { lo: 99, hi: 99, nome: "Ácido concentrado" }, { lo: 100, hi: 100, nome: "Frasco abissal" }],
    pocoes: [{ lo: 2, hi: 2, nome: "Área Escorregadia (granada)" }, { lo: 3, hi: 4, nome: "Arma Mágica (óleo)" }, { lo: 5, hi: 5, nome: "Compreensão" }, { lo: 6, hi: 11, nome: "Curar Ferimentos (2d8+2 PV)" }, { lo: 12, hi: 13, nome: "Disfarce Ilusório" }, { lo: 14, hi: 15, nome: "Escuridão (óleo)" }, { lo: 16, hi: 17, nome: "Luz (óleo)" }, { lo: 18, hi: 18, nome: "Névoa (granada)" }, { lo: 19, hi: 19, nome: "Primor Atlético" }, { lo: 20, hi: 20, nome: "Sono" }, { lo: 21, hi: 22, nome: "Proteção Divina" }, { lo: 23, hi: 24, nome: "Resistência a Energia" }, { lo: 25, hi: 25, nome: "Suporte Ambiental" }, { lo: 26, hi: 26, nome: "Tranca Arcana (óleo)" }, { lo: 27, hi: 27, nome: "Visão Mística" }, { lo: 28, hi: 28, nome: "Vitalidade Fantasma" }, { lo: 29, hi: 29, nome: "Armadura Elemental" }, { lo: 30, hi: 30, nome: "Desafio Corajoso" }, { lo: 31, hi: 31, nome: "Discrição" }, { lo: 32, hi: 32, nome: "Farejar Fortuna" }, { lo: 33, hi: 33, nome: "Maaais Klunc" }, { lo: 34, hi: 34, nome: "Ossos de Adamante" }, { lo: 35, hi: 35, nome: "Punho de Mitral" }, { lo: 36, hi: 36, nome: "Magia Dadivosa" }, { lo: 37, hi: 37, nome: "Sigilo de Sszzaas" }, { lo: 38, hi: 38, nome: "Sorriso da Fortuna" }, { lo: 39, hi: 39, nome: "Toque de Megalokk" }, { lo: 40, hi: 40, nome: "Voz da Razão" }, { lo: 41, hi: 42, nome: "Escudo da Fé (aprimoramento para duração cena)" }, { lo: 43, hi: 44, nome: "Alterar Tamanho" }, { lo: 45, hi: 45, nome: "Aparência Perfeita" }, { lo: 46, hi: 46, nome: "Armamento da Natureza (óleo)" }, { lo: 47, hi: 50, nome: "Bola de Fogo (granada)" }, { lo: 51, hi: 51, nome: "Camuflagem Ilusória" }, { lo: 52, hi: 52, nome: "Concentração de Combate (aprimoramento para duração cena)" }, { lo: 53, hi: 56, nome: "Curar Ferimentos (4d8+4 PV)" }, { lo: 57, hi: 58, nome: "Físico Divino" }, { lo: 59, hi: 59, nome: "Mente Divina" }, { lo: 60, hi: 60, nome: "Metamorfose" }, { lo: 61, hi: 64, nome: "Purificação" }, { lo: 65, hi: 66, nome: "Velocidade" }, { lo: 67, hi: 68, nome: "Vestimenta da Fé (óleo)" }, { lo: 69, hi: 69, nome: "Voz Divina" }, { lo: 70, hi: 71, nome: "Orientação (aprimoramento para duração cena; role o atributo afetado, sendo 1 = Força, 2 = Destreza e assim por diante)" }, { lo: 72, hi: 72, nome: "Aura de Morte" }, { lo: 73, hi: 73, nome: "Emular Magia" }, { lo: 74, hi: 74, nome: "Punho de Mitral (aprimoramento para +2 em testes de ataque e margem de ameaça)" }, { lo: 75, hi: 75, nome: "Viagem Onírica" }, { lo: 76, hi: 76, nome: "Couraça de Allihanna (óleo)" }, { lo: 77, hi: 77, nome: "Toque de Megalokk (aprimoramento para aumentar o dano das armas naturais em um passo e a margem de ameaça delas em +1 )" }, { lo: 78, hi: 79, nome: "Arma Mágica (óleo; aprimoramento para bônus +3)" }, { lo: 80, hi: 81, nome: "Proteção Divina (aprimoramento para bônus de +4)" }, { lo: 82, hi: 82, nome: "Armadura Elemental (aprimoramento para 4d6 pontos de dano)" }, { lo: 83, hi: 88, nome: "Curar Ferimentos (7d8+7 PV)" }, { lo: 89, hi: 90, nome: "Físico Divino (aprimoramento para três atributos)" }, { lo: 91, hi: 92, nome: "Invisibilidade (aprimoramento para duração cena)" }, { lo: 93, hi: 94, nome: "Pele de Pedra" }, { lo: 95, hi: 95, nome: "Potência Divina" }, { lo: 96, hi: 96, nome: "Voo" }, { lo: 97, hi: 97, nome: "Percepção Rubra (aprimoramento para aumentar bônus em +3)" }, { lo: 98, hi: 100, nome: "Bola de Fogo (granada; aprimoramento para 10d6 de dano)" }, { lo: 101, hi: 110, nome: "Curar Ferimentos (11d8+11 PV)" }, { lo: 111, hi: 114, nome: "Pele de Pedra (aprimoramento para pele de aço e RD 10)" }, { lo: 115, hi: 116, nome: "Premonição" }, { lo: 117, hi: 117, nome: "Viagem Onírica (aprimoramentos para falar e lançar magias)" }, { lo: 118, hi: 118, nome: "Potência Divina (aprimoramento para Força +6 e RD 15)" }, { lo: 119, hi: 119, nome: "Momento de Tormenta (granada; aprimoramento para +4 dados de dano do mesmo tipo)" }, { lo: 120, hi: 120, nome: "Transformação em Dragão (aprimoramentos para atributos +4, asas, arma de mordida e dano de sopro de 12d6+12)" }],
    equipamentos: { armas: [{ lo: 1, hi: 1, nome: "Açoite finntroll" }, { lo: 2, hi: 2, nome: "Adaga" }, { lo: 3, hi: 3, nome: "Adaga oposta" }, { lo: 4, hi: 4, nome: "Agulha de Ahlen" }, { lo: 5, hi: 5, nome: "Alabarda" }, { lo: 6, hi: 6, nome: "Alfange" }, { lo: 7, hi: 7, nome: "Arcabuz" }, { lo: 8, hi: 8, nome: "Arco curto" }, { lo: 9, hi: 9, nome: "Arco de guerra" }, { lo: 10, hi: 10, nome: "Arco longo" }, { lo: 11, hi: 11, nome: "Arco montado" }, { lo: 12, hi: 12, nome: "Arpão" }, { lo: 13, hi: 13, nome: "Azagaia" }, { lo: 14, hi: 14, nome: "Bacamarte" }, { lo: 15, hi: 15, nome: "Balas (20)" }, { lo: 16, hi: 16, nome: "Balestra" }, { lo: 17, hi: 17, nome: "Bastão lúdico" }, { lo: 18, hi: 18, nome: "Besta de mão" }, { lo: 19, hi: 19, nome: "Besta de repetição" }, { lo: 20, hi: 20, nome: "Besta dupla" }, { lo: 21, hi: 21, nome: "Besta leve" }, { lo: 22, hi: 22, nome: "Besta pesada" }, { lo: 23, hi: 23, nome: "Bico de corvo" }, { lo: 24, hi: 24, nome: "Boleadeira" }, { lo: 25, hi: 25, nome: "Bordão" }, { lo: 26, hi: 26, nome: "Canhão portátil" }, { lo: 27, hi: 27, nome: "Chakram" }, { lo: 28, hi: 28, nome: "Chicote" }, { lo: 29, hi: 29, nome: "Cimitarra" }, { lo: 30, hi: 30, nome: "Cinquedea" }, { lo: 31, hi: 31, nome: "Clava" }, { lo: 32, hi: 32, nome: "Clava-grão" }, { lo: 33, hi: 33, nome: "Corrente de espinhos" }, { lo: 34, hi: 34, nome: "Desmontador" }, { lo: 35, hi: 35, nome: "Dirk" }, { lo: 36, hi: 36, nome: "Espada bastarda" }, { lo: 37, hi: 37, nome: "Espada canora" }, { lo: 38, hi: 38, nome: "Espada curta" }, { lo: 39, hi: 39, nome: "Espada de execução" }, { lo: 40, hi: 40, nome: "Espada larga" }, { lo: 41, hi: 41, nome: "Espada longa" }, { lo: 42, hi: 42, nome: "Espada vespa" }, { lo: 43, hi: 43, nome: "Espada-gadanho" }, { lo: 44, hi: 44, nome: "Espadim" }, { lo: 45, hi: 45, nome: "Flechas (20)" }, { lo: 46, hi: 46, nome: "Flechas de caça (20)" }, { lo: 47, hi: 47, nome: "Florete" }, { lo: 48, hi: 48, nome: "Foice" }, { lo: 49, hi: 49, nome: "Funda" }, { lo: 50, hi: 50, nome: "Gadanho" }, { lo: 51, hi: 51, nome: "Garrucha" }, { lo: 52, hi: 52, nome: "Gládio" }, { lo: 53, hi: 53, nome: "Katana" }, { lo: 54, hi: 54, nome: "Khopesh" }, { lo: 55, hi: 55, nome: "Kimbata" }, { lo: 56, hi: 56, nome: "Lança" }, { lo: 57, hi: 57, nome: "Lança de falange" }, { lo: 58, hi: 58, nome: "Lança de fogo" }, { lo: 59, hi: 59, nome: "Lança de justa" }, { lo: 60, hi: 60, nome: "Lança montada" }, { lo: 61, hi: 61, nome: "Maça" }, { lo: 62, hi: 62, nome: "Maça-estrela" }, { lo: 63, hi: 63, nome: "Machadinha" }, { lo: 64, hi: 64, nome: "Machado anão" }, { lo: 65, hi: 65, nome: "Machado de batalha" }, { lo: 66, hi: 66, nome: "Machado de guerra" }, { lo: 67, hi: 67, nome: "Machado de haste" }, { lo: 68, hi: 68, nome: "Machado táurico" }, { lo: 69, hi: 69, nome: "Malho" }, { lo: 70, hi: 70, nome: "Mangual" }, { lo: 71, hi: 71, nome: "Marrão" }, { lo: 72, hi: 72, nome: "Marreta" }, { lo: 73, hi: 73, nome: "Martelo de guerra" }, { lo: 74, hi: 74, nome: "Martelo leve" }, { lo: 75, hi: 75, nome: "Martelo longo" }, { lo: 76, hi: 76, nome: "Montante" }, { lo: 77, hi: 77, nome: "Montante cinético" }, { lo: 78, hi: 78, nome: "Mordida do diabo" }, { lo: 79, hi: 79, nome: "Mosquete" }, { lo: 80, hi: 80, nome: "Neko-te" }, { lo: 81, hi: 81, nome: "Pedras (20)" }, { lo: 82, hi: 82, nome: "Picareta" }, { lo: 83, hi: 83, nome: "Pique" }, { lo: 84, hi: 84, nome: "Pistola" }, { lo: 85, hi: 85, nome: "Pistola-punhal" }, { lo: 86, hi: 86, nome: "Porrete" }, { lo: 87, hi: 87, nome: "Presa de serpente" }, { lo: 88, hi: 88, nome: "Rapieira" }, { lo: 89, hi: 89, nome: "Rede" }, { lo: 90, hi: 90, nome: "Serrilheira" }, { lo: 91, hi: 91, nome: "Shuriken" }, { lo: 92, hi: 92, nome: "Sifão cáustico" }, { lo: 93, hi: 93, nome: "Tacape" }, { lo: 94, hi: 94, nome: "Tai-tai" }, { lo: 95, hi: 95, nome: "Tan-korak" }, { lo: 96, hi: 96, nome: "Tetsubo" }, { lo: 97, hi: 97, nome: "Traque" }, { lo: 98, hi: 98, nome: "Tridente" }, { lo: 99, hi: 99, nome: "Virotes (20)" }, { lo: 100, hi: 100, nome: "Zarabatana" }], armaduras: [{ lo: 1, hi: 2, nome: "Armadura de chumbo" }, { lo: 3, hi: 4, nome: "Armadura de engenhoqueiro goblin" }, { lo: 5, hi: 6, nome: "Armadura de folhas" }, { lo: 7, hi: 8, nome: "Armadura de hussardo alado" }, { lo: 9, hi: 10, nome: "Armadura de justa" }, { lo: 11, hi: 11, nome: "Armadura de ossos" }, { lo: 12, hi: 13, nome: "Armadura de pedra" }, { lo: 14, hi: 14, nome: "Armadura de quitina" }, { lo: 15, hi: 16, nome: "Armadura sensual" }, { lo: 17, hi: 20, nome: "Brigantina" }, { lo: 21, hi: 22, nome: "Broquel" }, { lo: 23, hi: 26, nome: "Brunea" }, { lo: 27, hi: 28, nome: "Colete fora da lei" }, { lo: 29, hi: 38, nome: "Completa" }, { lo: 39, hi: 42, nome: "Cota de malha" }, { lo: 43, hi: 44, nome: "Cota de moedas" }, { lo: 45, hi: 54, nome: "Couraça" }, { lo: 55, hi: 58, nome: "Couro" }, { lo: 59, hi: 64, nome: "Couro batido" }, { lo: 65, hi: 65, nome: "Escudo de couro" }, { lo: 66, hi: 66, nome: "Escudo de vime" }, { lo: 67, hi: 74, nome: "Escudo leve" }, { lo: 75, hi: 82, nome: "Escudo pesado" }, { lo: 83, hi: 84, nome: "Escudo torre" }, { lo: 85, hi: 88, nome: "Gibão de peles" }, { lo: 89, hi: 92, nome: "Loriga segmentada" }, { lo: 93, hi: 98, nome: "Meia armadura" }, { lo: 99, hi: 99, nome: "Sagna" }, { lo: 100, hi: 100, nome: "Veste de teia de aranha" }], esotericos: [{ lo: 1, hi: 3, nome: "Afiador solar" }, { lo: 4, hi: 6, nome: "Ankh solar" }, { lo: 7, hi: 10, nome: "Báculo da retribuição" }, { lo: 11, hi: 14, nome: "Bolsa de pó" }, { lo: 15, hi: 18, nome: "Cajado arcano" }, { lo: 19, hi: 22, nome: "Cetro elemental" }, { lo: 23, hi: 26, nome: "Compasso mistico" }, { lo: 27, hi: 30, nome: "Contas de oração" }, { lo: 31, hi: 34, nome: "Costela de lich" }, { lo: 35, hi: 38, nome: "Dedo de ente" }, { lo: 39, hi: 42, nome: "Estola" }, { lo: 43, hi: 46, nome: "Flauta convocadora" }, { lo: 47, hi: 50, nome: "Frasco purificador" }, { lo: 51, hi: 54, nome: "Luva de ferro" }, { lo: 55, hi: 58, nome: "Mandala onírica" }, { lo: 59, hi: 62, nome: "Medalhão afiado" }, { lo: 63, hi: 66, nome: "Medalhão de prata" }, { lo: 67, hi: 70, nome: "Orbe cristalino" }, { lo: 71, hi: 74, nome: "Ostensório santificado" }, { lo: 75, hi: 78, nome: "Rede de almas" }, { lo: 79, hi: 81, nome: "Tomo de guerra" }, { lo: 82, hi: 84, nome: "Tomo do rancor" }, { lo: 85, hi: 88, nome: "Tomo hermético" }, { lo: 89, hi: 92, nome: "Turíbulo ungido" }, { lo: 93, hi: 96, nome: "Varinha arcana" }, { lo: 97, hi: 100, nome: "Varinha armamentista" }] },
    superiores: { armas: [{ lo: 1, hi: 10, nome: "Atroz*" }, { lo: 11, hi: 12, nome: "Banhada a ouro" }, { lo: 13, hi: 20, nome: "Certeira" }, { lo: 21, hi: 21, nome: "Conduíte" }, { lo: 22, hi: 23, nome: "Cravejada de gemas" }, { lo: 24, hi: 31, nome: "Cruel" }, { lo: 32, hi: 33, nome: "Discreta" }, { lo: 34, hi: 38, nome: "Equilibrada" }, { lo: 39, hi: 42, nome: "Farpada" }, { lo: 43, hi: 44, nome: "Guarda" }, { lo: 45, hi: 48, nome: "Harmonizada" }, { lo: 49, hi: 49, nome: "Incendiária" }, { lo: 50, hi: 53, nome: "Injeção alquímica" }, { lo: 54, hi: 55, nome: "Macabra" }, { lo: 56, hi: 65, nome: "Maciça" }, { lo: 66, hi: 75, nome: "Material especial**" }, { lo: 76, hi: 79, nome: "Mira telescópica" }, { lo: 80, hi: 87, nome: "Precisa" }, { lo: 88, hi: 89, nome: "Pressurizada" }, { lo: 90, hi: 99, nome: "Pungente*" }, { lo: 100, hi: 100, nome: "Usada" }], armaduras: [{ lo: 1, hi: 10, nome: "Ajustada" }, { lo: 11, hi: 14, nome: "Balístico" }, { lo: 15, hi: 18, nome: "Banhada a ouro" }, { lo: 19, hi: 22, nome: "Cravejada de gemas" }, { lo: 23, hi: 27, nome: "Delicada" }, { lo: 28, hi: 29, nome: "Deslumbrante*" }, { lo: 30, hi: 31, nome: "Diligente" }, { lo: 32, hi: 35, nome: "Discreta" }, { lo: 36, hi: 39, nome: "Espinhos" }, { lo: 40, hi: 43, nome: "Injetora" }, { lo: 44, hi: 47, nome: "Inscrito" }, { lo: 48, hi: 49, nome: "Macabra" }, { lo: 50, hi: 59, nome: "Material especial**" }, { lo: 60, hi: 64, nome: "Polida" }, { lo: 65, hi: 84, nome: "Reforçada" }, { lo: 85, hi: 95, nome: "Selada" }, { lo: 96, hi: 100, nome: "Sob medida*" }], esotericos: [{ lo: 1, hi: 3, nome: "Banhado a ouro" }, { lo: 4, hi: 18, nome: "Canalizador" }, { lo: 19, hi: 21, nome: "Canônico" }, { lo: 22, hi: 24, nome: "Cravejado de gemas" }, { lo: 25, hi: 28, nome: "Discreto" }, { lo: 29, hi: 43, nome: "Energético" }, { lo: 44, hi: 58, nome: "Harmonizado" }, { lo: 59, hi: 61, nome: "Macabro" }, { lo: 62, hi: 70, nome: "Material especial**" }, { lo: 71, hi: 80, nome: "Poderoso" }, { lo: 81, hi: 90, nome: "Potencializador*" }, { lo: 91, hi: 100, nome: "Vigilante" }] },
    magicos: { armas: [{ lo: 1, hi: 1, nome: "Alvorada" }, { lo: 2, hi: 5, nome: "Ameaçadora" }, { lo: 6, hi: 6, nome: "Anátema" }, { lo: 7, hi: 8, nome: "Anticriatura" }, { lo: 9, hi: 9, nome: "Arremesso" }, { lo: 10, hi: 10, nome: "Assassina" }, { lo: 11, hi: 11, nome: "Brumosa" }, { lo: 12, hi: 12, nome: "Caçadora" }, { lo: 13, hi: 13, nome: "Cantante" }, { lo: 14, hi: 14, nome: "Ciclônica" }, { lo: 15, hi: 18, nome: "Congelante" }, { lo: 19, hi: 19, nome: "Conjuradora" }, { lo: 20, hi: 23, nome: "Corrosiva" }, { lo: 24, hi: 25, nome: "Crescente" }, { lo: 26, hi: 26, nome: "Cristalina" }, { lo: 27, hi: 27, nome: "Cronal*" }, { lo: 28, hi: 28, nome: "Cuidadora" }, { lo: 29, hi: 30, nome: "Dançarina" }, { lo: 31, hi: 32, nome: "Defensora" }, { lo: 33, hi: 33, nome: "Destruidora" }, { lo: 34, hi: 35, nome: "Dilacerante" }, { lo: 36, hi: 36, nome: "Drenante" }, { lo: 37, hi: 40, nome: "Elétrica" }, { lo: 41, hi: 41, nome: "Energética*" }, { lo: 42, hi: 43, nome: "Espreitadora" }, { lo: 44, hi: 45, nome: "Excruciante" }, { lo: 46, hi: 49, nome: "Flamejante" }, { lo: 50, hi: 57, nome: "Formidável" }, { lo: 58, hi: 59, nome: "Frenética" }, { lo: 60, hi: 60, nome: "Gárgula" }, { lo: 61, hi: 61, nome: "Horrenda" }, { lo: 62, hi: 62, nome: "Indignada" }, { lo: 63, hi: 63, nome: "Infestada" }, { lo: 64, hi: 64, nome: "Lancinante*" }, { lo: 65, hi: 72, nome: "Magnífica*" }, { lo: 73, hi: 73, nome: "Manáfaga" }, { lo: 74, hi: 75, nome: "Piedosa" }, { lo: 76, hi: 76, nome: "Profana" }, { lo: 77, hi: 77, nome: "Rebote" }, { lo: 78, hi: 78, nome: "Reflexiva" }, { lo: 79, hi: 79, nome: "Ressonante" }, { lo: 80, hi: 80, nome: "Sagrada" }, { lo: 81, hi: 82, nome: "Sanguinária" }, { lo: 83, hi: 83, nome: "Sepulcral" }, { lo: 84, hi: 84, nome: "Sombria" }, { lo: 85, hi: 85, nome: "Trovejante" }, { lo: 86, hi: 86, nome: "Tumular" }, { lo: 87, hi: 87, nome: "Vampírica" }, { lo: 88, hi: 89, nome: "Veloz" }, { lo: 90, hi: 90, nome: "Venenosa" }, { lo: 91, hi: 100, nome: "Arma específica" }, { lo: 1, hi: 2, nome: "Adaga da bruma" }, { lo: 3, hi: 3, nome: "Adaga ofídica" }, { lo: 4, hi: 4, nome: "Adaga sorrateira" }, { lo: 5, hi: 5, nome: "Alabarda da coragem" }, { lo: 6, hi: 6, nome: "Alfange dourado" }, { lo: 7, hi: 7, nome: "Alguma coisa de Nimb..." }, { lo: 8, hi: 10, nome: "Arco das sombras" }, { lo: 11, hi: 12, nome: "Arco do crepúsculo" }, { lo: 13, hi: 15, nome: "Arco do poder" }, { lo: 16, hi: 18, nome: "Avalanche" }, { lo: 19, hi: 21, nome: "Azagaia dos relâmpagos" }, { lo: 22, hi: 23, nome: "Azagaia fantasma" }, { lo: 24, hi: 26, nome: "Besta estelar" }, { lo: 27, hi: 29, nome: "Besta explosiva" }, { lo: 30, hi: 30, nome: "Bordão sabichão" }, { lo: 31, hi: 31, nome: "Cajado das matas" }, { lo: 32, hi: 32, nome: "Cimitarra solar" }, { lo: 33, hi: 34, nome: "Clava de lava" }, { lo: 35, hi: 37, nome: "Espada baronial" }, { lo: 38, hi: 39, nome: "Espada da tempestade" }, { lo: 40, hi: 42, nome: "Espada do guardião" }, { lo: 43, hi: 43, nome: "Espada imaculada" }, { lo: 44, hi: 44, nome: "Espada monástica" }, { lo: 45, hi: 46, nome: "Espada solar" }, { lo: 47, hi: 49, nome: "Espada sortuda" }, { lo: 50, hi: 51, nome: "Florete do vendaval" }, { lo: 52, hi: 54, nome: "Florete fugaz" }, { lo: 55, hi: 55, nome: "Katana da determinação" }, { lo: 56, hi: 58, nome: "Lâmina da luz" }, { lo: 59, hi: 61, nome: "Lança animalesca" }, { lo: 62, hi: 62, nome: "Lança da dominação" }, { lo: 63, hi: 64, nome: "Lança da fênix" }, { lo: 65, hi: 67, nome: "Língua do deserto" }, { lo: 68, hi: 70, nome: "Maça do terror" }, { lo: 71, hi: 71, nome: "Maça monstruosa" }, { lo: 72, hi: 72, nome: "Machado da bravura" }, { lo: 73, hi: 74, nome: "Machado da natureza" }, { lo: 75, hi: 76, nome: "Machado do abismo" }, { lo: 77, hi: 79, nome: "Machado do vulcão" }, { lo: 80, hi: 80, nome: "Machado lamnoriano" }, { lo: 81, hi: 83, nome: "Machado silvestre" }, { lo: 84, hi: 84, nome: "Mangual aventureiro" }, { lo: 85, hi: 86, nome: "Martelo da terra" }, { lo: 87, hi: 89, nome: "Martelo de Doherimm" }, { lo: 90, hi: 91, nome: "Martelo do titã" }, { lo: 92, hi: 93, nome: "Punhal das profundezas" }, { lo: 94, hi: 96, nome: "Punhal sszzaazita" }, { lo: 97, hi: 97, nome: "Tridente aquoso" }, { lo: 98, hi: 100, nome: "Vingadora sagrada" }], armaduras: [{ lo: 1, hi: 2, nome: "Abascanto" }, { lo: 3, hi: 4, nome: "Abençoado" }, { lo: 5, hi: 5, nome: "Abissal" }, { lo: 6, hi: 6, nome: "Acrobático" }, { lo: 7, hi: 8, nome: "Alado" }, { lo: 9, hi: 9, nome: "Ancorada***" }, { lo: 10, hi: 11, nome: "Animado**" }, { lo: 12, hi: 12, nome: "Anulador*" }, { lo: 13, hi: 13, nome: "Arbóreo" }, { lo: 14, hi: 15, nome: "Assustador" }, { lo: 16, hi: 16, nome: "Astuto" }, { lo: 17, hi: 17, nome: "Cáustica" }, { lo: 18, hi: 27, nome: "Defensor" }, { lo: 28, hi: 28, nome: "Densa***" }, { lo: 29, hi: 29, nome: "Égide" }, { lo: 30, hi: 30, nome: "Enraizada***" }, { lo: 31, hi: 31, nome: "Escorregadio" }, { lo: 32, hi: 33, nome: "Esmagador**" }, { lo: 34, hi: 34, nome: "Esmérico" }, { lo: 35, hi: 36, nome: "Estígio*" }, { lo: 37, hi: 37, nome: "Etéreo" }, { lo: 38, hi: 39, nome: "Fantasmagórico" }, { lo: 40, hi: 43, nome: "Fortificado" }, { lo: 44, hi: 44, nome: "Gélido" }, { lo: 45, hi: 45, nome: "Geomântico" }, { lo: 46, hi: 55, nome: "Guardião*" }, { lo: 56, hi: 57, nome: "Hipnótico" }, { lo: 58, hi: 58, nome: "Ilusório" }, { lo: 59, hi: 59, nome: "Incandescente" }, { lo: 60, hi: 64, nome: "Invulnerável" }, { lo: 65, hi: 65, nome: "Ligeira***" }, { lo: 66, hi: 67, nome: "Luminescente" }, { lo: 68, hi: 72, nome: "Opaco" }, { lo: 73, hi: 73, nome: "Prístino" }, { lo: 74, hi: 78, nome: "Protetor" }, { lo: 79, hi: 79, nome: "Purificador" }, { lo: 80, hi: 81, nome: "Reanimador" }, { lo: 82, hi: 83, nome: "Refletor" }, { lo: 84, hi: 84, nome: "Relampejante" }, { lo: 85, hi: 85, nome: "Reluzente" }, { lo: 86, hi: 86, nome: "Replicante" }, { lo: 87, hi: 87, nome: "Resiliente" }, { lo: 88, hi: 88, nome: "Sombrio" }, { lo: 89, hi: 89, nome: "Vórtice" }, { lo: 90, hi: 90, nome: "Zeloso" }, { lo: 91, hi: 100, nome: "Item específico" }, { lo: 1, hi: 4, nome: "Armadura da luz" }, { lo: 5, hi: 8, nome: "Armadura das sombras profundas" }, { lo: 9, hi: 12, nome: "Armadura do dragão ancião" }, { lo: 13, hi: 16, nome: "Armadura do inverno perene" }, { lo: 17, hi: 18, nome: "Armadura do julgamento" }, { lo: 19, hi: 22, nome: "Baluarte anão" }, { lo: 23, hi: 26, nome: "Carapaça demoníaca" }, { lo: 27, hi: 30, nome: "Cota da serpente marinha" }, { lo: 31, hi: 40, nome: "Cota élfica" }, { lo: 41, hi: 44, nome: "Couraça do comando" }, { lo: 45, hi: 48, nome: "Couraça do guardião celeste" }, { lo: 49, hi: 52, nome: "Couro de monstro" }, { lo: 53, hi: 56, nome: "Escudo da ira vulcânica" }, { lo: 57, hi: 60, nome: "Escudo da luz estelar" }, { lo: 61, hi: 64, nome: "Escudo da natureza viva" }, { lo: 65, hi: 68, nome: "Escudo de Azgher" }, { lo: 69, hi: 72, nome: "Escudo do conjurador" }, { lo: 73, hi: 76, nome: "Escudo do eclipse" }, { lo: 77, hi: 80, nome: "Escudo do grifo" }, { lo: 81, hi: 86, nome: "Escudo do leão" }, { lo: 87, hi: 90, nome: "Escudo do trovão" }, { lo: 91, hi: 94, nome: "Escudo espinhoso" }, { lo: 95, hi: 98, nome: "Loriga do centurião" }, { lo: 99, hi: 100, nome: "Manto da noite" }], esotericos: [{ lo: 1, hi: 2, nome: "Abafador" }, { lo: 3, hi: 12, nome: "Bélico" }, { lo: 13, hi: 16, nome: "Caridoso" }, { lo: 17, hi: 20, nome: "Chocante" }, { lo: 21, hi: 30, nome: "Clemente" }, { lo: 31, hi: 32, nome: "Contido" }, { lo: 33, hi: 34, nome: "Embusteiro" }, { lo: 35, hi: 36, nome: "Emergencial" }, { lo: 37, hi: 40, nome: "Encadeado" }, { lo: 41, hi: 42, nome: "Escultor" }, { lo: 43, hi: 44, nome: "Frugal" }, { lo: 45, hi: 48, nome: "Glacial" }, { lo: 49, hi: 50, nome: "Imperioso" }, { lo: 51, hi: 52, nome: "Implacável*" }, { lo: 53, hi: 54, nome: "Incriminador" }, { lo: 55, hi: 61, nome: "Inflamável" }, { lo: 62, hi: 65, nome: "Inquisidor" }, { lo: 66, hi: 69, nome: "Insistente" }, { lo: 70, hi: 71, nome: "Khalmyrita" }, { lo: 72, hi: 81, nome: "Majestoso*" }, { lo: 82, hi: 83, nome: "Nímbico" }, { lo: 84, hi: 84, nome: "Pulverizante*" }, { lo: 85, hi: 85, nome: "Retaliador" }, { lo: 86, hi: 87, nome: "Sanguessuga" }, { lo: 88, hi: 88, nome: "Traiçoeiro" }, { lo: 89, hi: 90, nome: "Verdugo" }, { lo: 91, hi: 100, nome: "Esotérico específico" }, { lo: 1, hi: 20, nome: "Cajado da destruição" }, { lo: 21, hi: 40, nome: "Cajado da vida" }, { lo: 41, hi: 45, nome: "Cajado das marés" }, { lo: 46, hi: 60, nome: "Cajado do poder" }, { lo: 61, hi: 75, nome: "Cálice sagrado" }, { lo: 76, hi: 85, nome: "Relógio do arcanista" }, { lo: 86, hi: 95, nome: "Varinha da generosidade" }, { lo: 96, hi: 100, nome: "Varinha milenar" }] },
    acessorios: { menor: [{ lo: 1, hi: 1, nome: "Algibeira mordedora" }, { lo: 2, hi: 2, nome: "Elixir da mente dividida" }, { lo: 3, hi: 3, nome: "Papiro das estrelas" }, { lo: 4, hi: 4, nome: "Anel do sustento" }, { lo: 5, hi: 7, nome: "Bainha mágica" }, { lo: 8, hi: 9, nome: "Corda da escalada" }, { lo: 10, hi: 10, nome: "Ferraduras da velocidade" }, { lo: 11, hi: 12, nome: "Garrafa da fumaça eterna" }, { lo: 13, hi: 15, nome: "Gema da luminosidade" }, { lo: 16, hi: 18, nome: "Manto élfico" }, { lo: 19, hi: 21, nome: "Mochila de carga" }, { lo: 22, hi: 23, nome: "Amuleto da visão etérea" }, { lo: 24, hi: 25, nome: "Cinturão do trobo" }, { lo: 26, hi: 27, nome: "Elixir da eternidade" }, { lo: 28, hi: 29, nome: "Pérola da nulificação" }, { lo: 30, hi: 31, nome: "Saco dos ventos silenciosos" }, { lo: 32, hi: 36, nome: "Brincos da sagacidade" }, { lo: 37, hi: 41, nome: "Luvas da delicadeza" }, { lo: 42, hi: 46, nome: "Manoplas da força do ogro" }, { lo: 47, hi: 50, nome: "Manto da resistência" }, { lo: 51, hi: 55, nome: "Manto do fascínio" }, { lo: 56, hi: 60, nome: "Pingente da sensatez" }, { lo: 61, hi: 65, nome: "Torque do vigor" }, { lo: 66, hi: 66, nome: "Monóculo da franqueza" }, { lo: 67, hi: 68, nome: "Chapéu do disfarce" }, { lo: 69, hi: 69, nome: "Flauta fantasma" }, { lo: 70, hi: 71, nome: "Lanterna da revelação" }, { lo: 72, hi: 73, nome: "Algibeira provedora" }, { lo: 74, hi: 75, nome: "Gaiola dos arcanos" }, { lo: 76, hi: 77, nome: "Lâmpada da ilusão impecável" }, { lo: 78, hi: 79, nome: "Pena da criação" }, { lo: 80, hi: 81, nome: "Corda da resignação" }, { lo: 82, hi: 86, nome: "Anel da proteção" }, { lo: 87, hi: 87, nome: "Anel do escudo mental" }, { lo: 88, hi: 88, nome: "Pingente da saúde" }, { lo: 89, hi: 89, nome: "Coroa de flores" }, { lo: 90, hi: 90, nome: "Jarro das profundezas" }, { lo: 91, hi: 91, nome: "Escrivaninha consagrada" }, { lo: 92, hi: 92, nome: "Anel da proteção mental" }, { lo: 93, hi: 93, nome: "Berço das fadas" }, { lo: 94, hi: 94, nome: "Chapéu dos truques infinitos" }, { lo: 95, hi: 95, nome: "Cinto da leveza graciosa" }, { lo: 96, hi: 96, nome: "Cristal da voz silenciosa" }, { lo: 97, hi: 97, nome: "Cristal do tempo célere" }, { lo: 98, hi: 98, nome: "Ocarina da melodia distante" }, { lo: 99, hi: 99, nome: "Olhos do corvo" }, { lo: 100, hi: 100, nome: "Pergaminho da verdade cósmica" }], medio: [{ lo: 1, hi: 1, nome: "Anel de telecinesia" }, { lo: 2, hi: 2, nome: "Bola de cristal" }, { lo: 3, hi: 3, nome: "Caveira maldita" }, { lo: 4, hi: 4, nome: "Instrumento da alegria" }, { lo: 5, hi: 5, nome: "Ampulheta da harmonia temporal" }, { lo: 6, hi: 6, nome: "Amuleto do amparo" }, { lo: 7, hi: 7, nome: "Caixa dos ecos perdidos" }, { lo: 8, hi: 8, nome: "Colar da perseverança" }, { lo: 9, hi: 9, nome: "Colar do tirano" }, { lo: 10, hi: 10, nome: "Óculos da revelação" }, { lo: 11, hi: 11, nome: "Colar das bolas de fogo" }, { lo: 12, hi: 12, nome: "Sandálias de Valkaria" }, { lo: 13, hi: 13, nome: "Véu diáfano" }, { lo: 14, hi: 14, nome: "Botas aladas" }, { lo: 15, hi: 15, nome: "Botas inquietas" }, { lo: 16, hi: 16, nome: "Pira póstera" }, { lo: 17, hi: 17, nome: "Anel do pacto oneroso" }, { lo: 18, hi: 18, nome: "Botas do andarilho das sombras" }, { lo: 19, hi: 19, nome: "Cálice das marés" }, { lo: 20, hi: 20, nome: "Cinto dos caminhos cruzados" }, { lo: 21, hi: 21, nome: "Pedra da passagem" }, { lo: 22, hi: 22, nome: "Pingente da dor partilhada" }, { lo: 23, hi: 26, nome: "Braceletes de bronze" }, { lo: 27, hi: 27, nome: "Capa nebulosa" }, { lo: 28, hi: 28, nome: "Espelho do outro lado" }, { lo: 29, hi: 30, nome: "Gema da purificação" }, { lo: 31, hi: 32, nome: "Máscara da raposa" }, { lo: 33, hi: 36, nome: "Anel da energia" }, { lo: 37, hi: 40, nome: "Anel da vitalidade" }, { lo: 41, hi: 42, nome: "Anel de invisibilidade" }, { lo: 43, hi: 44, nome: "Braçadeiras do arqueiro" }, { lo: 45, hi: 46, nome: "Brincos de Marah" }, { lo: 47, hi: 48, nome: "Faixas do pugilista" }, { lo: 49, hi: 50, nome: "Manto da aranha" }, { lo: 51, hi: 52, nome: "Vassoura voadora" }, { lo: 53, hi: 54, nome: "Símbolo abençoado" }, { lo: 55, hi: 55, nome: "Colar de presas" }, { lo: 56, hi: 56, nome: "Vestido noturno" }, { lo: 57, hi: 57, nome: "Anel da beleza ilusória" }, { lo: 58, hi: 58, nome: "Bastão do sonhador" }, { lo: 59, hi: 59, nome: "Colar da fúria monstruosa" }, { lo: 60, hi: 60, nome: "Coroa da floresta sussurrante" }, { lo: 61, hi: 61, nome: "Espelho da verdade" }, { lo: 62, hi: 62, nome: "Instrumentos da celeridade" }, { lo: 63, hi: 63, nome: "Máscara do predador" }, { lo: 64, hi: 65, nome: "Frigideira do chef anão" }, { lo: 66, hi: 66, nome: "Gema da santificação" }, { lo: 67, hi: 67, nome: "Cubo armadilha" }, { lo: 68, hi: 68, nome: "Caldeirão da vida" }, { lo: 69, hi: 72, nome: "Amuleto da robustez" }, { lo: 73, hi: 74, nome: "Botas velozes" }, { lo: 75, hi: 78, nome: "Cinto da força do gigante" }, { lo: 79, hi: 82, nome: "Coroa majestosa" }, { lo: 83, hi: 86, nome: "Estola da serenidade" }, { lo: 87, hi: 87, nome: "Manto do morcego" }, { lo: 88, hi: 91, nome: "Pulseiras da celeridade" }, { lo: 92, hi: 95, nome: "Tiara da sapiência" }, { lo: 96, hi: 97, nome: "Argolas místicas" }, { lo: 98, hi: 98, nome: "Bastão da grande harmonia" }, { lo: 99, hi: 99, nome: "Coroa da majestade distorcida" }, { lo: 100, hi: 100, nome: "Bracelete do coração vivaz" }], maior: [{ lo: 1, hi: 2, nome: "Elmo do teletransporte" }, { lo: 3, hi: 4, nome: "Gema da telepatia" }, { lo: 5, hi: 6, nome: "Gema elemental" }, { lo: 7, hi: 11, nome: "Manual da saúde corporal" }, { lo: 12, hi: 16, nome: "Manual do bom exercício" }, { lo: 17, hi: 21, nome: "Manual dos movimentos precisos" }, { lo: 22, hi: 26, nome: "Medalhão de Lena" }, { lo: 27, hi: 31, nome: "Tomo da compreensão" }, { lo: 32, hi: 36, nome: "Tomo da liderança e influência" }, { lo: 37, hi: 41, nome: "Tomo dos grandes pensamentos" }, { lo: 42, hi: 44, nome: "Anel da chama dançante" }, { lo: 45, hi: 46, nome: "Chapéu pensador" }, { lo: 47, hi: 48, nome: "Cinto da flecha veloz" }, { lo: 49, hi: 50, nome: "Gema da profanação" }, { lo: 51, hi: 53, nome: "Tomo da técnica definitiva" }, { lo: 54, hi: 55, nome: "Tapeçaria da guerra" }, { lo: 56, hi: 57, nome: "Braceletes da amizade intensa" }, { lo: 58, hi: 58, nome: "Cilício vivo" }, { lo: 59, hi: 59, nome: "Coração corrompido" }, { lo: 60, hi: 61, nome: "Coração do inverno" }, { lo: 62, hi: 63, nome: "Tomo dos companheiros" }, { lo: 64, hi: 65, nome: "Anel refletor" }, { lo: 66, hi: 67, nome: "Cinto do campeão" }, { lo: 68, hi: 71, nome: "Colar guardião" }, { lo: 72, hi: 73, nome: "Estatueta animista" }, { lo: 74, hi: 75, nome: "Anel da liberdade" }, { lo: 76, hi: 77, nome: "Tapete voador" }, { lo: 78, hi: 79, nome: "Chave dos planos" }, { lo: 80, hi: 81, nome: "Cinto da desmaterialização" }, { lo: 82, hi: 85, nome: "Braceletes de ouro" }, { lo: 86, hi: 87, nome: "Espelho da oposição" }, { lo: 88, hi: 91, nome: "Robe do arquimago" }, { lo: 92, hi: 93, nome: "Ossos dracônicos" }, { lo: 94, hi: 95, nome: "Orbe das tempestades" }, { lo: 96, hi: 97, nome: "Braçadeiras da força do colosso" }, { lo: 98, hi: 99, nome: "Anel da regeneração" }, { lo: 100, hi: 100, nome: "Espelho do aprisionamento" }] },
    riquezas: { menor: [{ lo: 1, hi: 25, valor: "4d4 (10)" }, { lo: 26, hi: 40, valor: "1d4x10 (25)" }, { lo: 41, hi: 55, valor: "2d4x10 (50)" }, { lo: 56, hi: 70, valor: "4d6x10 (140)" }, { lo: 71, hi: 85, valor: "1d6x100 (350)" }, { lo: 86, hi: 95, valor: "2d6x100 (700)" }, { lo: 96, hi: 99, valor: "2d8x100 (900)" }, { lo: 100, hi: 100, valor: "4d10x100 (2.200)" }], media: [{ lo: 1, hi: 10, valor: "2d4x10 (50)" }, { lo: 11, hi: 30, valor: "4d6x10 (140)" }, { lo: 31, hi: 50, valor: "1d6x100 (350)" }, { lo: 51, hi: 65, valor: "2d6x100 (700)" }, { lo: 66, hi: 80, valor: "2d8x100 (900)" }, { lo: 81, hi: 90, valor: "4d10x100 (2.200)" }, { lo: 91, hi: 95, valor: "6d12x100 (3.900)" }, { lo: 96, hi: 99, valor: "2d10x1000 (11000)" }, { lo: 100, hi: 100, valor: "6d8x1000 (27000)" }], maior: [{ lo: 1, hi: 5, valor: "1d6x100 (350)" }, { lo: 6, hi: 15, valor: "2d6x100 (700)" }, { lo: 16, hi: 25, valor: "2d8x100 (900)" }, { lo: 26, hi: 40, valor: "4d10x100 (2.200)" }, { lo: 41, hi: 60, valor: "6d12x100 (3.900)" }, { lo: 61, hi: 75, valor: "2d10x1000 (11000)" }, { lo: 76, hi: 85, valor: "6d8x1000 (27000)" }, { lo: 86, hi: 95, valor: "1d10x10000 (55000)" }, { lo: 96, hi: 100, valor: "4d12x10000 (260000)" }] }
};

const TESOURO_ND = {
    "0.25": { dinheiro: [{ lo: 1, hi: 30, res: "—" }, { lo: 31, hi: 70, res: "1d6x10 TC" }, { lo: 71, hi: 95, res: "1d4x100 TC" }, { lo: 96, hi: 100, res: "1d6x10 T$" }], itens: [{ lo: 1, hi: 50, res: "—" }, { lo: 51, hi: 75, res: "Item diverso" }, { lo: 76, hi: 100, res: "Equipamento" }] },
    "0.5": { dinheiro: [{ lo: 1, hi: 25, res: "—" }, { lo: 26, hi: 70, res: "2d6x10 TC" }, { lo: 71, hi: 95, res: "2d8x10 T$" }, { lo: 96, hi: 100, res: "1d4x100 T$" }], itens: [{ lo: 1, hi: 45, res: "—" }, { lo: 46, hi: 70, res: "Item diverso" }, { lo: 71, hi: 100, res: "Equipamento" }] },
    "1": { dinheiro: [{ lo: 1, hi: 20, res: "—" }, { lo: 21, hi: 70, res: "3d8x10 T$" }, { lo: 71, hi: 95, res: "4d12x10 T$" }, { lo: 96, hi: 100, res: "1 riqueza menor" }], itens: [{ lo: 1, hi: 40, res: "—" }, { lo: 41, hi: 65, res: "Item diverso" }, { lo: 66, hi: 90, res: "Equipamento" }, { lo: 91, hi: 100, res: "1 poção" }] },
    "2": { dinheiro: [{ lo: 1, hi: 15, res: "—" }, { lo: 16, hi: 55, res: "3d10x10 T$" }, { lo: 56, hi: 85, res: "2d4x100 T$" }, { lo: 86, hi: 95, res: "2d6+1x100 T$" }, { lo: 96, hi: 100, res: "1 riqueza menor" }], itens: [{ lo: 1, hi: 30, res: "—" }, { lo: 31, hi: 40, res: "Item diverso" }, { lo: 41, hi: 70, res: "Equipamento" }, { lo: 71, hi: 90, res: "1 poção" }, { lo: 91, hi: 100, res: "Superior (1 melhoria)" }] },
    "3": { dinheiro: [{ lo: 1, hi: 10, res: "—" }, { lo: 11, hi: 20, res: "4d12x10 T$" }, { lo: 21, hi: 60, res: "1d4x100 T$" }, { lo: 61, hi: 90, res: "1d8x10 TO" }, { lo: 91, hi: 100, res: "1d3 riquezas menores" }], itens: [{ lo: 1, hi: 25, res: "—" }, { lo: 26, hi: 35, res: "Item diverso" }, { lo: 36, hi: 60, res: "Equipamento" }, { lo: 61, hi: 85, res: "1 poção" }, { lo: 86, hi: 100, res: "Superior (1 melhoria)" }] },
    "4": { dinheiro: [{ lo: 1, hi: 10, res: "—" }, { lo: 11, hi: 50, res: "1d6x100 T$" }, { lo: 51, hi: 80, res: "1d12x100 T$" }, { lo: 81, hi: 90, res: "1 riqueza menor +%" }, { lo: 91, hi: 100, res: "1d3 riquezas menores +%" }], itens: [{ lo: 1, hi: 20, res: "—" }, { lo: 21, hi: 30, res: "Item diverso" }, { lo: 31, hi: 55, res: "Equipamento 2D" }, { lo: 56, hi: 80, res: "1 poção +%" }, { lo: 81, hi: 100, res: "Superior (1 melhoria) 2D" }] },
    "5": { dinheiro: [{ lo: 1, hi: 15, res: "—" }, { lo: 16, hi: 65, res: "1d8x100 T$" }, { lo: 66, hi: 95, res: "3d4x10 TO" }, { lo: 96, hi: 100, res: "1 riqueza média" }], itens: [{ lo: 1, hi: 20, res: "—" }, { lo: 21, hi: 70, res: "1 poção" }, { lo: 71, hi: 90, res: "Superior (1 melhoria)" }, { lo: 91, hi: 100, res: "Superior (2 melhorias)" }] },
    "6": { dinheiro: [{ lo: 1, hi: 15, res: "—" }, { lo: 16, hi: 60, res: "2d6x100 T$" }, { lo: 61, hi: 90, res: "2d10x100 T$" }, { lo: 91, hi: 100, res: "1d3+1 riquezas menores" }], itens: [{ lo: 1, hi: 20, res: "—" }, { lo: 21, hi: 65, res: "1 poção +%" }, { lo: 66, hi: 95, res: "Superior (1 melhoria)" }, { lo: 96, hi: 100, res: "Superior (2 melhorias) 2D" }] },
    "7": { dinheiro: [{ lo: 1, hi: 10, res: "—" }, { lo: 11, hi: 60, res: "2d8x100 T$" }, { lo: 61, hi: 90, res: "2d12x10 TO" }, { lo: 91, hi: 100, res: "1d4+1 riquezas menores" }], itens: [{ lo: 1, hi: 20, res: "—" }, { lo: 21, hi: 60, res: "1d3 poções" }, { lo: 61, hi: 90, res: "Superior (2 melhorias)" }, { lo: 91, hi: 100, res: "Superior (3 melhorias)" }] },
    "8": { dinheiro: [{ lo: 1, hi: 10, res: "—" }, { lo: 11, hi: 55, res: "2d10x100 T$" }, { lo: 56, hi: 95, res: "1d4+1 riquezas menores" }, { lo: 96, hi: 100, res: "1 riqueza média +%" }], itens: [{ lo: 1, hi: 20, res: "—" }, { lo: 21, hi: 75, res: "1d3 poções" }, { lo: 76, hi: 95, res: "Superior (2 melhorias)" }, { lo: 96, hi: 100, res: "Superior (3 melhorias) 2D" }] },
    "9": { dinheiro: [{ lo: 1, hi: 10, res: "—" }, { lo: 11, hi: 35, res: "1 riqueza média" }, { lo: 36, hi: 85, res: "4d6x100 T$" }, { lo: 86, hi: 100, res: "1d3 riquezas médias" }], itens: [{ lo: 1, hi: 20, res: "—" }, { lo: 21, hi: 70, res: "1 poção +%" }, { lo: 71, hi: 95, res: "Superior (3 melhorias)" }, { lo: 96, hi: 100, res: "Mágico (menor)" }] },
    "10": { dinheiro: [{ lo: 1, hi: 10, res: "—" }, { lo: 11, hi: 30, res: "4d6x100 T$" }, { lo: 31, hi: 85, res: "4d10x10 TO" }, { lo: 86, hi: 100, res: "1d3+1 riquezas médias" }], itens: [{ lo: 1, hi: 50, res: "—" }, { lo: 51, hi: 75, res: "1d3+1 poções" }, { lo: 76, hi: 90, res: "Superior (3 melhorias)" }, { lo: 91, hi: 100, res: "Mágico (menor)" }] },
    "11": { dinheiro: [{ lo: 1, hi: 10, res: "—" }, { lo: 11, hi: 45, res: "2d4x1000 T$" }, { lo: 46, hi: 85, res: "1d3 riquezas médias" }, { lo: 86, hi: 100, res: "2d6x100 TO" }], itens: [{ lo: 1, hi: 45, res: "—" }, { lo: 46, hi: 70, res: "1d4+1 poções" }, { lo: 71, hi: 90, res: "Superior (3 melhorias)" }, { lo: 91, hi: 100, res: "Mágico (menor) 2D" }] },
    "12": { dinheiro: [{ lo: 1, hi: 10, res: "—" }, { lo: 11, hi: 45, res: "1 riqueza média +%" }, { lo: 46, hi: 80, res: "2d6x1000 T$" }, { lo: 81, hi: 100, res: "1d4+1 riquezas médias" }], itens: [{ lo: 1, hi: 45, res: "—" }, { lo: 46, hi: 70, res: "1d3+1 poções +%" }, { lo: 71, hi: 85, res: "Superior (4 melhorias)" }, { lo: 86, hi: 100, res: "Mágico (menor)" }] },
    "13": { dinheiro: [{ lo: 1, hi: 10, res: "—" }, { lo: 11, hi: 45, res: "4d4x1000 T$" }, { lo: 46, hi: 80, res: "1d3+1 riquezas médias" }, { lo: 81, hi: 100, res: "4d6x100 TO" }], itens: [{ lo: 1, hi: 40, res: "—" }, { lo: 41, hi: 65, res: "1d4+1 poções +%" }, { lo: 66, hi: 95, res: "Superior (4 melhorias)" }, { lo: 96, hi: 100, res: "Mágico (médio)" }] },
    "14": { dinheiro: [{ lo: 1, hi: 10, res: "—" }, { lo: 11, hi: 45, res: "1d3+1 riquezas médias" }, { lo: 46, hi: 80, res: "3d6x1000 T$" }, { lo: 81, hi: 100, res: "1 riqueza maior" }], itens: [{ lo: 1, hi: 40, res: "—" }, { lo: 41, hi: 65, res: "1d4+1 poções +%" }, { lo: 66, hi: 90, res: "Superior (4 melhorias)" }, { lo: 91, hi: 100, res: "Mágico (médio)" }] },
    "15": { dinheiro: [{ lo: 1, hi: 10, res: "—" }, { lo: 11, hi: 45, res: "1 riqueza média +%" }, { lo: 46, hi: 80, res: "2d10x1000 T$" }, { lo: 81, hi: 100, res: "1d4x1000 TO" }], itens: [{ lo: 1, hi: 35, res: "—" }, { lo: 36, hi: 45, res: "1d6+1 poções" }, { lo: 46, hi: 85, res: "Superior (4 melhorias) 2D" }, { lo: 86, hi: 100, res: "Mágico (médio)" }] },
    "16": { dinheiro: [{ lo: 1, hi: 10, res: "—" }, { lo: 11, hi: 40, res: "3d6x1000 T$" }, { lo: 41, hi: 75, res: "3d10x100 TO" }, { lo: 76, hi: 100, res: "1d3 riquezas maiores" }], itens: [{ lo: 1, hi: 35, res: "—" }, { lo: 36, hi: 45, res: "1d6+1 poções +%" }, { lo: 46, hi: 80, res: "Superior (4 melhorias) 2D" }, { lo: 81, hi: 100, res: "Mágico (médio)" }] },
    "17": { dinheiro: [{ lo: 1, hi: 5, res: "—" }, { lo: 6, hi: 40, res: "4d6x1000 T$" }, { lo: 41, hi: 75, res: "1d3 riquezas médias +%" }, { lo: 76, hi: 100, res: "2d4x1000 TO" }], itens: [{ lo: 1, hi: 20, res: "—" }, { lo: 21, hi: 40, res: "Mágico (menor)" }, { lo: 41, hi: 80, res: "Mágico (médio)" }, { lo: 81, hi: 100, res: "Mágico (maior)" }] },
    "18": { dinheiro: [{ lo: 1, hi: 5, res: "—" }, { lo: 6, hi: 40, res: "4d10x1000 T$" }, { lo: 41, hi: 75, res: "1 riqueza maior" }, { lo: 76, hi: 100, res: "1d3+1 riquezas maiores" }], itens: [{ lo: 1, hi: 15, res: "—" }, { lo: 16, hi: 40, res: "Mágico (menor) 2D" }, { lo: 41, hi: 70, res: "Mágico (médio)" }, { lo: 71, hi: 100, res: "Mágico (maior)" }] },
    "19": { dinheiro: [{ lo: 1, hi: 5, res: "—" }, { lo: 6, hi: 40, res: "4d12x1000 T$" }, { lo: 41, hi: 75, res: "1 riqueza maior +%" }, { lo: 76, hi: 100, res: "1d12x1000 TO" }], itens: [{ lo: 1, hi: 10, res: "—" }, { lo: 11, hi: 40, res: "Mágico (menor) 2D" }, { lo: 41, hi: 60, res: "Mágico (médio) 2D" }, { lo: 61, hi: 100, res: "Mágico (maior)" }] },
    "20": { dinheiro: [{ lo: 1, hi: 5, res: "—" }, { lo: 6, hi: 40, res: "2d4x1000 TO" }, { lo: 41, hi: 75, res: "1d3 riquezas maiores" }, { lo: 76, hi: 100, res: "1d3+1 riquezas maiores +%" }], itens: [{ lo: 1, hi: 5, res: "—" }, { lo: 6, hi: 40, res: "Mágico (menor) 2D" }, { lo: 41, hi: 50, res: "Mágico (médio) 2D" }, { lo: 51, hi: 100, res: "Mágico (maior) 2D" }] }
};
