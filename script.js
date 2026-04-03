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
                    ${cena.tesouros ? `<button class="btn-limpar-tesouro" onclick="limparTesouro('${cena.id}')" title="Limpar resultado">✖</button>` : ''}
                </div>
                <div id="tesouro-resultado-${cena.id}" class="tesouro-resultado ${cena.tesouros ? 'visivel' : ''}">${cena.tesouros ? cena.tesouros.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>') : ''}</div>
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
    const abaUrl    = document.getElementById(`img-url-${id}`);
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
}
// ===== SISTEMA DE TESOURO T20 =====

// ===== DADOS DE TESOURO T20 =====
const TESOURO_TABELAS = {
  itensDiversos: [{lo:2,hi:2,nome:"Água benta"},{lo:3,hi:3,nome:"Alaúde élfico"},{lo:4,hi:4,nome:"Algemas"},{lo:5,hi:5,nome:"Baga-de-fogo"},{lo:6,hi:8,nome:"Bálsamo restaurador"},{lo:9,hi:9,nome:"Bandana"},{lo:10,hi:10,nome:"Bandoleira de poções"},{lo:11,hi:11,nome:"Bomba"},{lo:12,hi:12,nome:"Botas reforçadas"},{lo:13,hi:13,nome:"Camisa bufante"},{lo:14,hi:14,nome:"Capa esvoaçante"},{lo:15,hi:15,nome:"Capa pesada"},{lo:16,hi:16,nome:"Casaco longo"},{lo:17,hi:17,nome:"Chapéu arcano"},{lo:18,hi:18,nome:"Coleção de livros"},{lo:19,hi:19,nome:"Cosmético"},{lo:20,hi:20,nome:"Dente-de-dragão"},{lo:21,hi:21,nome:"Enfeite de elmo"},{lo:22,hi:22,nome:"Elixir do amor"},{lo:23,hi:23,nome:"Equipamento de viagem"},{lo:24,hi:26,nome:"Essência de mana"},{lo:27,hi:27,nome:"Estojo de disfarces"},{lo:28,hi:28,nome:"Farrapos de ermitão"},{lo:29,hi:29,nome:"Flauta mística"},{lo:30,hi:30,nome:"Fogo alquímico"},{lo:31,hi:31,nome:"Gorro de ervas"},{lo:32,hi:32,nome:"Líquen lilás"},{lo:33,hi:33,nome:"Luneta"},{lo:34,hi:34,nome:"Luva de pelica"},{lo:35,hi:35,nome:"Maleta de medicamentos"},{lo:36,hi:36,nome:"Manopla"},{lo:37,hi:37,nome:"Manto eclesiástico"},{lo:38,hi:38,nome:"Mochila de aventureiro"},{lo:39,hi:39,nome:"Musgo púrpura"},{lo:40,hi:40,nome:"Organizador de pergaminhos"},{lo:41,hi:41,nome:"Ossos de monstro"},{lo:42,hi:42,nome:"Pó de cristal"},{lo:43,hi:43,nome:"Pó de giz"},{lo:44,hi:44,nome:"Pó do desaparecimento"},{lo:45,hi:45,nome:"Robe místico"},{lo:46,hi:46,nome:"Saco de sal"},{lo:47,hi:47,nome:"Sapatos de camurça"},{lo:48,hi:48,nome:"Seixo de âmbar"},{lo:49,hi:49,nome:"Sela"},{lo:50,hi:50,nome:"Tabardo"},{lo:51,hi:51,nome:"Traje da corte"},{lo:52,hi:52,nome:"Terra de cemitério"},{lo:53,hi:53,nome:"Veste de seda"},{lo:54,hi:54,nome:"Corda de teia"},{lo:55,hi:55,nome:"Dente de wisphago"},{lo:56,hi:56,nome:"Bomba de fumaça"},{lo:57,hi:57,nome:"Elixir quimérico"},{lo:58,hi:58,nome:"Éter elemental"},{lo:59,hi:59,nome:"Óleo de besouro"},{lo:60,hi:60,nome:"Água benta concentrada"},{lo:61,hi:61,nome:"Aspersório"},{lo:62,hi:62,nome:"Patuá"},{lo:63,hi:63,nome:"Panfleto de aforismos"},{lo:64,hi:64,nome:"Texto sagrado"},{lo:65,hi:65,nome:"Hábito sacerdotal"},{lo:66,hi:66,nome:"Manto de alto sacerdote"},{lo:67,hi:67,nome:"Sandálias"},{lo:68,hi:68,nome:"Piercing de umbigo"},{lo:69,hi:69,nome:"Incenso"},{lo:70,hi:70,nome:"Santa granada de mão"},{lo:71,hi:71,nome:"Fitilho consagrado"},{lo:72,hi:72,nome:"Pena de anjo"},{lo:73,hi:73,nome:"Ábaco"},{lo:74,hi:74,nome:"Ampulheta"},{lo:75,hi:75,nome:"Astrolábio"},{lo:76,hi:76,nome:"Bainha adornada"},{lo:77,hi:77,nome:"Bússola"},{lo:78,hi:78,nome:"Diagrama anatômico"},{lo:79,hi:79,nome:"Estrepes"},{lo:80,hi:80,nome:"Lampião de foco"},{lo:81,hi:81,nome:"Leque"},{lo:82,hi:82,nome:"Lupa"},{lo:83,hi:83,nome:"Mapa (mestre define de qual região)"},{lo:84,hi:84,nome:"Mecanismo de mola"},{lo:85,hi:85,nome:"Mochila discreta"},{lo:86,hi:86,nome:"Sinete"},{lo:87,hi:87,nome:"Apito de caça"},{lo:88,hi:88,nome:"Baralho marcado"},{lo:89,hi:89,nome:"Clarim deheoni"},{lo:90,hi:90,nome:"Pandeiro das estradas"},{lo:91,hi:91,nome:"Camisolão"},{lo:92,hi:92,nome:"Casaca de apetrechos"},{lo:93,hi:93,nome:"Chapéu emplumado"},{lo:94,hi:94,nome:"Elmo leve"},{lo:95,hi:95,nome:"Elmo pesado"},{lo:96,hi:96,nome:"Rondel"},{lo:97,hi:97,nome:"Sapatos confortáveis"},{lo:98,hi:98,nome:"Sapatos de salto alto"},{lo:99,hi:99,nome:"Ácido concentrado"},{lo:100,hi:100,nome:"Frasco abissal"}],
  pocoes: [{lo:2,hi:2,nome:"Área Escorregadia (granada)"},{lo:3,hi:4,nome:"Arma Mágica (óleo)"},{lo:5,hi:5,nome:"Compreensão"},{lo:6,hi:11,nome:"Curar Ferimentos (2d8+2 PV)"},{lo:12,hi:13,nome:"Disfarce Ilusório"},{lo:14,hi:15,nome:"Escuridão (óleo)"},{lo:16,hi:17,nome:"Luz (óleo)"},{lo:18,hi:18,nome:"Névoa (granada)"},{lo:19,hi:19,nome:"Primor Atlético"},{lo:20,hi:20,nome:"Sono"},{lo:21,hi:22,nome:"Proteção Divina"},{lo:23,hi:24,nome:"Resistência a Energia"},{lo:25,hi:25,nome:"Suporte Ambiental"},{lo:26,hi:26,nome:"Tranca Arcana (óleo)"},{lo:27,hi:27,nome:"Visão Mística"},{lo:28,hi:28,nome:"Vitalidade Fantasma"},{lo:29,hi:29,nome:"Armadura Elemental"},{lo:30,hi:30,nome:"Desafio Corajoso"},{lo:31,hi:31,nome:"Discrição"},{lo:32,hi:32,nome:"Farejar Fortuna"},{lo:33,hi:33,nome:"Maaais Klunc"},{lo:34,hi:34,nome:"Ossos de Adamante"},{lo:35,hi:35,nome:"Punho de Mitral"},{lo:36,hi:36,nome:"Magia Dadivosa"},{lo:37,hi:37,nome:"Sigilo de Sszzaas"},{lo:38,hi:38,nome:"Sorriso da Fortuna"},{lo:39,hi:39,nome:"Toque de Megalokk"},{lo:40,hi:40,nome:"Voz da Razão"},{lo:41,hi:42,nome:"Escudo da Fé (aprimoramento para duração cena)"},{lo:43,hi:44,nome:"Alterar Tamanho"},{lo:45,hi:45,nome:"Aparência Perfeita"},{lo:46,hi:46,nome:"Armamento da Natureza (óleo)"},{lo:47,hi:50,nome:"Bola de Fogo (granada)"},{lo:51,hi:51,nome:"Camuflagem Ilusória"},{lo:52,hi:52,nome:"Concentração de Combate (aprimoramento para duração cena)"},{lo:53,hi:56,nome:"Curar Ferimentos (4d8+4 PV)"},{lo:57,hi:58,nome:"Físico Divino"},{lo:59,hi:59,nome:"Mente Divina"},{lo:60,hi:60,nome:"Metamorfose"},{lo:61,hi:64,nome:"Purificação"},{lo:65,hi:66,nome:"Velocidade"},{lo:67,hi:68,nome:"Vestimenta da Fé (óleo)"},{lo:69,hi:69,nome:"Voz Divina"},{lo:70,hi:71,nome:"Orientação (aprimoramento para duração cena; role o atributo afetado, sendo 1 = Força, 2 = Destreza e assim por diante)"},{lo:72,hi:72,nome:"Aura de Morte"},{lo:73,hi:73,nome:"Emular Magia"},{lo:74,hi:74,nome:"Punho de Mitral (aprimoramento para +2 em testes de ataque e margem de ameaça)"},{lo:75,hi:75,nome:"Viagem Onírica"},{lo:76,hi:76,nome:"Couraça de Allihanna (óleo)"},{lo:77,hi:77,nome:"Toque de Megalokk (aprimoramento para aumentar o dano das armas naturais em um passo e a margem de ameaça delas em +1 )"},{lo:78,hi:79,nome:"Arma Mágica (óleo; aprimoramento para bônus +3)"},{lo:80,hi:81,nome:"Proteção Divina (aprimoramento para bônus de +4)"},{lo:82,hi:82,nome:"Armadura Elemental (aprimoramento para 4d6 pontos de dano)"},{lo:83,hi:88,nome:"Curar Ferimentos (7d8+7 PV)"},{lo:89,hi:90,nome:"Físico Divino (aprimoramento para três atributos)"},{lo:91,hi:92,nome:"Invisibilidade (aprimoramento para duração cena)"},{lo:93,hi:94,nome:"Pele de Pedra"},{lo:95,hi:95,nome:"Potência Divina"},{lo:96,hi:96,nome:"Voo"},{lo:97,hi:97,nome:"Percepção Rubra (aprimoramento para aumentar bônus em +3)"},{lo:98,hi:100,nome:"Bola de Fogo (granada; aprimoramento para 10d6 de dano)"},{lo:101,hi:110,nome:"Curar Ferimentos (11d8+11 PV)"},{lo:111,hi:114,nome:"Pele de Pedra (aprimoramento para pele de aço e RD 10)"},{lo:115,hi:116,nome:"Premonição"},{lo:117,hi:117,nome:"Viagem Onírica (aprimoramentos para falar e lançar magias)"},{lo:118,hi:118,nome:"Potência Divina (aprimoramento para Força +6 e RD 15)"},{lo:119,hi:119,nome:"Momento de Tormenta (granada; aprimoramento para +4 dados de dano do mesmo tipo)"},{lo:120,hi:120,nome:"Transformação em Dragão (aprimoramentos para atributos +4, asas, arma de mordida e dano de sopro de 12d6+12)"}],
  equipamentos: {armas:[{lo:1,hi:1,nome:"Açoite finntroll"},{lo:2,hi:2,nome:"Adaga"},{lo:3,hi:3,nome:"Adaga oposta"},{lo:4,hi:4,nome:"Agulha de Ahlen"},{lo:5,hi:5,nome:"Alabarda"},{lo:6,hi:6,nome:"Alfange"},{lo:7,hi:7,nome:"Arcabuz"},{lo:8,hi:8,nome:"Arco curto"},{lo:9,hi:9,nome:"Arco de guerra"},{lo:10,hi:10,nome:"Arco longo"},{lo:11,hi:11,nome:"Arco montado"},{lo:12,hi:12,nome:"Arpão"},{lo:13,hi:13,nome:"Azagaia"},{lo:14,hi:14,nome:"Bacamarte"},{lo:15,hi:15,nome:"Balas (20)"},{lo:16,hi:16,nome:"Balestra"},{lo:17,hi:17,nome:"Bastão lúdico"},{lo:18,hi:18,nome:"Besta de mão"},{lo:19,hi:19,nome:"Besta de repetição"},{lo:20,hi:20,nome:"Besta dupla"},{lo:21,hi:21,nome:"Besta leve"},{lo:22,hi:22,nome:"Besta pesada"},{lo:23,hi:23,nome:"Bico de corvo"},{lo:24,hi:24,nome:"Boleadeira"},{lo:25,hi:25,nome:"Bordão"},{lo:26,hi:26,nome:"Canhão portátil"},{lo:27,hi:27,nome:"Chakram"},{lo:28,hi:28,nome:"Chicote"},{lo:29,hi:29,nome:"Cimitarra"},{lo:30,hi:30,nome:"Cinquedea"},{lo:31,hi:31,nome:"Clava"},{lo:32,hi:32,nome:"Clava-grão"},{lo:33,hi:33,nome:"Corrente de espinhos"},{lo:34,hi:34,nome:"Desmontador"},{lo:35,hi:35,nome:"Dirk"},{lo:36,hi:36,nome:"Espada bastarda"},{lo:37,hi:37,nome:"Espada canora"},{lo:38,hi:38,nome:"Espada curta"},{lo:39,hi:39,nome:"Espada de execução"},{lo:40,hi:40,nome:"Espada larga"},{lo:41,hi:41,nome:"Espada longa"},{lo:42,hi:42,nome:"Espada vespa"},{lo:43,hi:43,nome:"Espada-gadanho"},{lo:44,hi:44,nome:"Espadim"},{lo:45,hi:45,nome:"Flechas (20)"},{lo:46,hi:46,nome:"Flechas de caça (20)"},{lo:47,hi:47,nome:"Florete"},{lo:48,hi:48,nome:"Foice"},{lo:49,hi:49,nome:"Funda"},{lo:50,hi:50,nome:"Gadanho"},{lo:51,hi:51,nome:"Garrucha"},{lo:52,hi:52,nome:"Gládio"},{lo:53,hi:53,nome:"Katana"},{lo:54,hi:54,nome:"Khopesh"},{lo:55,hi:55,nome:"Kimbata"},{lo:56,hi:56,nome:"Lança"},{lo:57,hi:57,nome:"Lança de falange"},{lo:58,hi:58,nome:"Lança de fogo"},{lo:59,hi:59,nome:"Lança de justa"},{lo:60,hi:60,nome:"Lança montada"},{lo:61,hi:61,nome:"Maça"},{lo:62,hi:62,nome:"Maça-estrela"},{lo:63,hi:63,nome:"Machadinha"},{lo:64,hi:64,nome:"Machado anão"},{lo:65,hi:65,nome:"Machado de batalha"},{lo:66,hi:66,nome:"Machado de guerra"},{lo:67,hi:67,nome:"Machado de haste"},{lo:68,hi:68,nome:"Machado táurico"},{lo:69,hi:69,nome:"Malho"},{lo:70,hi:70,nome:"Mangual"},{lo:71,hi:71,nome:"Marrão"},{lo:72,hi:72,nome:"Marreta"},{lo:73,hi:73,nome:"Martelo de guerra"},{lo:74,hi:74,nome:"Martelo leve"},{lo:75,hi:75,nome:"Martelo longo"},{lo:76,hi:76,nome:"Montante"},{lo:77,hi:77,nome:"Montante cinético"},{lo:78,hi:78,nome:"Mordida do diabo"},{lo:79,hi:79,nome:"Mosquete"},{lo:80,hi:80,nome:"Neko-te"},{lo:81,hi:81,nome:"Pedras (20)"},{lo:82,hi:82,nome:"Picareta"},{lo:83,hi:83,nome:"Pique"},{lo:84,hi:84,nome:"Pistola"},{lo:85,hi:85,nome:"Pistola-punhal"},{lo:86,hi:86,nome:"Porrete"},{lo:87,hi:87,nome:"Presa de serpente"},{lo:88,hi:88,nome:"Rapieira"},{lo:89,hi:89,nome:"Rede"},{lo:90,hi:90,nome:"Serrilheira"},{lo:91,hi:91,nome:"Shuriken"},{lo:92,hi:92,nome:"Sifão cáustico"},{lo:93,hi:93,nome:"Tacape"},{lo:94,hi:94,nome:"Tai-tai"},{lo:95,hi:95,nome:"Tan-korak"},{lo:96,hi:96,nome:"Tetsubo"},{lo:97,hi:97,nome:"Traque"},{lo:98,hi:98,nome:"Tridente"},{lo:99,hi:99,nome:"Virotes (20)"},{lo:100,hi:100,nome:"Zarabatana"}], armaduras:[{lo:1,hi:2,nome:"Armadura de chumbo"},{lo:3,hi:4,nome:"Armadura de engenhoqueiro goblin"},{lo:5,hi:6,nome:"Armadura de folhas"},{lo:7,hi:8,nome:"Armadura de hussardo alado"},{lo:9,hi:10,nome:"Armadura de justa"},{lo:11,hi:11,nome:"Armadura de ossos"},{lo:12,hi:13,nome:"Armadura de pedra"},{lo:14,hi:14,nome:"Armadura de quitina"},{lo:15,hi:16,nome:"Armadura sensual"},{lo:17,hi:20,nome:"Brigantina"},{lo:21,hi:22,nome:"Broquel"},{lo:23,hi:26,nome:"Brunea"},{lo:27,hi:28,nome:"Colete fora da lei"},{lo:29,hi:38,nome:"Completa"},{lo:39,hi:42,nome:"Cota de malha"},{lo:43,hi:44,nome:"Cota de moedas"},{lo:45,hi:54,nome:"Couraça"},{lo:55,hi:58,nome:"Couro"},{lo:59,hi:64,nome:"Couro batido"},{lo:65,hi:65,nome:"Escudo de couro"},{lo:66,hi:66,nome:"Escudo de vime"},{lo:67,hi:74,nome:"Escudo leve"},{lo:75,hi:82,nome:"Escudo pesado"},{lo:83,hi:84,nome:"Escudo torre"},{lo:85,hi:88,nome:"Gibão de peles"},{lo:89,hi:92,nome:"Loriga segmentada"},{lo:93,hi:98,nome:"Meia armadura"},{lo:99,hi:99,nome:"Sagna"},{lo:100,hi:100,nome:"Veste de teia de aranha"}], esotericos:[{lo:1,hi:3,nome:"Afiador solar"},{lo:4,hi:6,nome:"Ankh solar"},{lo:7,hi:10,nome:"Báculo da retribuição"},{lo:11,hi:14,nome:"Bolsa de pó"},{lo:15,hi:18,nome:"Cajado arcano"},{lo:19,hi:22,nome:"Cetro elemental"},{lo:23,hi:26,nome:"Compasso mistico"},{lo:27,hi:30,nome:"Contas de oração"},{lo:31,hi:34,nome:"Costela de lich"},{lo:35,hi:38,nome:"Dedo de ente"},{lo:39,hi:42,nome:"Estola"},{lo:43,hi:46,nome:"Flauta convocadora"},{lo:47,hi:50,nome:"Frasco purificador"},{lo:51,hi:54,nome:"Luva de ferro"},{lo:55,hi:58,nome:"Mandala onírica"},{lo:59,hi:62,nome:"Medalhão afiado"},{lo:63,hi:66,nome:"Medalhão de prata"},{lo:67,hi:70,nome:"Orbe cristalino"},{lo:71,hi:74,nome:"Ostensório santificado"},{lo:75,hi:78,nome:"Rede de almas"},{lo:79,hi:81,nome:"Tomo de guerra"},{lo:82,hi:84,nome:"Tomo do rancor"},{lo:85,hi:88,nome:"Tomo hermético"},{lo:89,hi:92,nome:"Turíbulo ungido"},{lo:93,hi:96,nome:"Varinha arcana"},{lo:97,hi:100,nome:"Varinha armamentista"}]},
  superiores: {armas:[{lo:1,hi:10,nome:"Atroz*"},{lo:11,hi:12,nome:"Banhada a ouro"},{lo:13,hi:20,nome:"Certeira"},{lo:21,hi:21,nome:"Conduíte"},{lo:22,hi:23,nome:"Cravejada de gemas"},{lo:24,hi:31,nome:"Cruel"},{lo:32,hi:33,nome:"Discreta"},{lo:34,hi:38,nome:"Equilibrada"},{lo:39,hi:42,nome:"Farpada"},{lo:43,hi:44,nome:"Guarda"},{lo:45,hi:48,nome:"Harmonizada"},{lo:49,hi:49,nome:"Incendiária"},{lo:50,hi:53,nome:"Injeção alquímica"},{lo:54,hi:55,nome:"Macabra"},{lo:56,hi:65,nome:"Maciça"},{lo:66,hi:75,nome:"Material especial**"},{lo:76,hi:79,nome:"Mira telescópica"},{lo:80,hi:87,nome:"Precisa"},{lo:88,hi:89,nome:"Pressurizada"},{lo:90,hi:99,nome:"Pungente*"},{lo:100,hi:100,nome:"Usada"}], armaduras:[{lo:1,hi:10,nome:"Ajustada"},{lo:11,hi:14,nome:"Balístico"},{lo:15,hi:18,nome:"Banhada a ouro"},{lo:19,hi:22,nome:"Cravejada de gemas"},{lo:23,hi:27,nome:"Delicada"},{lo:28,hi:29,nome:"Deslumbrante*"},{lo:30,hi:31,nome:"Diligente"},{lo:32,hi:35,nome:"Discreta"},{lo:36,hi:39,nome:"Espinhos"},{lo:40,hi:43,nome:"Injetora"},{lo:44,hi:47,nome:"Inscrito"},{lo:48,hi:49,nome:"Macabra"},{lo:50,hi:59,nome:"Material especial**"},{lo:60,hi:64,nome:"Polida"},{lo:65,hi:84,nome:"Reforçada"},{lo:85,hi:95,nome:"Selada"},{lo:96,hi:100,nome:"Sob medida*"}], esotericos:[{lo:1,hi:3,nome:"Banhado a ouro"},{lo:4,hi:18,nome:"Canalizador"},{lo:19,hi:21,nome:"Canônico"},{lo:22,hi:24,nome:"Cravejado de gemas"},{lo:25,hi:28,nome:"Discreto"},{lo:29,hi:43,nome:"Energético"},{lo:44,hi:58,nome:"Harmonizado"},{lo:59,hi:61,nome:"Macabro"},{lo:62,hi:70,nome:"Material especial**"},{lo:71,hi:80,nome:"Poderoso"},{lo:81,hi:90,nome:"Potencializador*"},{lo:91,hi:100,nome:"Vigilante"}]},
  magicos: {armas:[{lo:1,hi:1,nome:"Alvorada"},{lo:2,hi:5,nome:"Ameaçadora"},{lo:6,hi:6,nome:"Anátema"},{lo:7,hi:8,nome:"Anticriatura"},{lo:9,hi:9,nome:"Arremesso"},{lo:10,hi:10,nome:"Assassina"},{lo:11,hi:11,nome:"Brumosa"},{lo:12,hi:12,nome:"Caçadora"},{lo:13,hi:13,nome:"Cantante"},{lo:14,hi:14,nome:"Ciclônica"},{lo:15,hi:18,nome:"Congelante"},{lo:19,hi:19,nome:"Conjuradora"},{lo:20,hi:23,nome:"Corrosiva"},{lo:24,hi:25,nome:"Crescente"},{lo:26,hi:26,nome:"Cristalina"},{lo:27,hi:27,nome:"Cronal*"},{lo:28,hi:28,nome:"Cuidadora"},{lo:29,hi:30,nome:"Dançarina"},{lo:31,hi:32,nome:"Defensora"},{lo:33,hi:33,nome:"Destruidora"},{lo:34,hi:35,nome:"Dilacerante"},{lo:36,hi:36,nome:"Drenante"},{lo:37,hi:40,nome:"Elétrica"},{lo:41,hi:41,nome:"Energética*"},{lo:42,hi:43,nome:"Espreitadora"},{lo:44,hi:45,nome:"Excruciante"},{lo:46,hi:49,nome:"Flamejante"},{lo:50,hi:57,nome:"Formidável"},{lo:58,hi:59,nome:"Frenética"},{lo:60,hi:60,nome:"Gárgula"},{lo:61,hi:61,nome:"Horrenda"},{lo:62,hi:62,nome:"Indignada"},{lo:63,hi:63,nome:"Infestada"},{lo:64,hi:64,nome:"Lancinante*"},{lo:65,hi:72,nome:"Magnífica*"},{lo:73,hi:73,nome:"Manáfaga"},{lo:74,hi:75,nome:"Piedosa"},{lo:76,hi:76,nome:"Profana"},{lo:77,hi:77,nome:"Rebote"},{lo:78,hi:78,nome:"Reflexiva"},{lo:79,hi:79,nome:"Ressonante"},{lo:80,hi:80,nome:"Sagrada"},{lo:81,hi:82,nome:"Sanguinária"},{lo:83,hi:83,nome:"Sepulcral"},{lo:84,hi:84,nome:"Sombria"},{lo:85,hi:85,nome:"Trovejante"},{lo:86,hi:86,nome:"Tumular"},{lo:87,hi:87,nome:"Vampírica"},{lo:88,hi:89,nome:"Veloz"},{lo:90,hi:90,nome:"Venenosa"},{lo:91,hi:100,nome:"Arma específica"},{lo:1,hi:2,nome:"Adaga da bruma"},{lo:3,hi:3,nome:"Adaga ofídica"},{lo:4,hi:4,nome:"Adaga sorrateira"},{lo:5,hi:5,nome:"Alabarda da coragem"},{lo:6,hi:6,nome:"Alfange dourado"},{lo:7,hi:7,nome:"Alguma coisa de Nimb..."},{lo:8,hi:10,nome:"Arco das sombras"},{lo:11,hi:12,nome:"Arco do crepúsculo"},{lo:13,hi:15,nome:"Arco do poder"},{lo:16,hi:18,nome:"Avalanche"},{lo:19,hi:21,nome:"Azagaia dos relâmpagos"},{lo:22,hi:23,nome:"Azagaia fantasma"},{lo:24,hi:26,nome:"Besta estelar"},{lo:27,hi:29,nome:"Besta explosiva"},{lo:30,hi:30,nome:"Bordão sabichão"},{lo:31,hi:31,nome:"Cajado das matas"},{lo:32,hi:32,nome:"Cimitarra solar"},{lo:33,hi:34,nome:"Clava de lava"},{lo:35,hi:37,nome:"Espada baronial"},{lo:38,hi:39,nome:"Espada da tempestade"},{lo:40,hi:42,nome:"Espada do guardião"},{lo:43,hi:43,nome:"Espada imaculada"},{lo:44,hi:44,nome:"Espada monástica"},{lo:45,hi:46,nome:"Espada solar"},{lo:47,hi:49,nome:"Espada sortuda"},{lo:50,hi:51,nome:"Florete do vendaval"},{lo:52,hi:54,nome:"Florete fugaz"},{lo:55,hi:55,nome:"Katana da determinação"},{lo:56,hi:58,nome:"Lâmina da luz"},{lo:59,hi:61,nome:"Lança animalesca"},{lo:62,hi:62,nome:"Lança da dominação"},{lo:63,hi:64,nome:"Lança da fênix"},{lo:65,hi:67,nome:"Língua do deserto"},{lo:68,hi:70,nome:"Maça do terror"},{lo:71,hi:71,nome:"Maça monstruosa"},{lo:72,hi:72,nome:"Machado da bravura"},{lo:73,hi:74,nome:"Machado da natureza"},{lo:75,hi:76,nome:"Machado do abismo"},{lo:77,hi:79,nome:"Machado do vulcão"},{lo:80,hi:80,nome:"Machado lamnoriano"},{lo:81,hi:83,nome:"Machado silvestre"},{lo:84,hi:84,nome:"Mangual aventureiro"},{lo:85,hi:86,nome:"Martelo da terra"},{lo:87,hi:89,nome:"Martelo de Doherimm"},{lo:90,hi:91,nome:"Martelo do titã"},{lo:92,hi:93,nome:"Punhal das profundezas"},{lo:94,hi:96,nome:"Punhal sszzaazita"},{lo:97,hi:97,nome:"Tridente aquoso"},{lo:98,hi:100,nome:"Vingadora sagrada"}], armaduras:[{lo:1,hi:2,nome:"Abascanto"},{lo:3,hi:4,nome:"Abençoado"},{lo:5,hi:5,nome:"Abissal"},{lo:6,hi:6,nome:"Acrobático"},{lo:7,hi:8,nome:"Alado"},{lo:9,hi:9,nome:"Ancorada***"},{lo:10,hi:11,nome:"Animado**"},{lo:12,hi:12,nome:"Anulador*"},{lo:13,hi:13,nome:"Arbóreo"},{lo:14,hi:15,nome:"Assustador"},{lo:16,hi:16,nome:"Astuto"},{lo:17,hi:17,nome:"Cáustica"},{lo:18,hi:27,nome:"Defensor"},{lo:28,hi:28,nome:"Densa***"},{lo:29,hi:29,nome:"Égide"},{lo:30,hi:30,nome:"Enraizada***"},{lo:31,hi:31,nome:"Escorregadio"},{lo:32,hi:33,nome:"Esmagador**"},{lo:34,hi:34,nome:"Esmérico"},{lo:35,hi:36,nome:"Estígio*"},{lo:37,hi:37,nome:"Etéreo"},{lo:38,hi:39,nome:"Fantasmagórico"},{lo:40,hi:43,nome:"Fortificado"},{lo:44,hi:44,nome:"Gélido"},{lo:45,hi:45,nome:"Geomântico"},{lo:46,hi:55,nome:"Guardião*"},{lo:56,hi:57,nome:"Hipnótico"},{lo:58,hi:58,nome:"Ilusório"},{lo:59,hi:59,nome:"Incandescente"},{lo:60,hi:64,nome:"Invulnerável"},{lo:65,hi:65,nome:"Ligeira***"},{lo:66,hi:67,nome:"Luminescente"},{lo:68,hi:72,nome:"Opaco"},{lo:73,hi:73,nome:"Prístino"},{lo:74,hi:78,nome:"Protetor"},{lo:79,hi:79,nome:"Purificador"},{lo:80,hi:81,nome:"Reanimador"},{lo:82,hi:83,nome:"Refletor"},{lo:84,hi:84,nome:"Relampejante"},{lo:85,hi:85,nome:"Reluzente"},{lo:86,hi:86,nome:"Replicante"},{lo:87,hi:87,nome:"Resiliente"},{lo:88,hi:88,nome:"Sombrio"},{lo:89,hi:89,nome:"Vórtice"},{lo:90,hi:90,nome:"Zeloso"},{lo:91,hi:100,nome:"Item específico"},{lo:1,hi:4,nome:"Armadura da luz"},{lo:5,hi:8,nome:"Armadura das sombras profundas"},{lo:9,hi:12,nome:"Armadura do dragão ancião"},{lo:13,hi:16,nome:"Armadura do inverno perene"},{lo:17,hi:18,nome:"Armadura do julgamento"},{lo:19,hi:22,nome:"Baluarte anão"},{lo:23,hi:26,nome:"Carapaça demoníaca"},{lo:27,hi:30,nome:"Cota da serpente marinha"},{lo:31,hi:40,nome:"Cota élfica"},{lo:41,hi:44,nome:"Couraça do comando"},{lo:45,hi:48,nome:"Couraça do guardião celeste"},{lo:49,hi:52,nome:"Couro de monstro"},{lo:53,hi:56,nome:"Escudo da ira vulcânica"},{lo:57,hi:60,nome:"Escudo da luz estelar"},{lo:61,hi:64,nome:"Escudo da natureza viva"},{lo:65,hi:68,nome:"Escudo de Azgher"},{lo:69,hi:72,nome:"Escudo do conjurador"},{lo:73,hi:76,nome:"Escudo do eclipse"},{lo:77,hi:80,nome:"Escudo do grifo"},{lo:81,hi:86,nome:"Escudo do leão"},{lo:87,hi:90,nome:"Escudo do trovão"},{lo:91,hi:94,nome:"Escudo espinhoso"},{lo:95,hi:98,nome:"Loriga do centurião"},{lo:99,hi:100,nome:"Manto da noite"}], esotericos:[{lo:1,hi:2,nome:"Abafador"},{lo:3,hi:12,nome:"Bélico"},{lo:13,hi:16,nome:"Caridoso"},{lo:17,hi:20,nome:"Chocante"},{lo:21,hi:30,nome:"Clemente"},{lo:31,hi:32,nome:"Contido"},{lo:33,hi:34,nome:"Embusteiro"},{lo:35,hi:36,nome:"Emergencial"},{lo:37,hi:40,nome:"Encadeado"},{lo:41,hi:42,nome:"Escultor"},{lo:43,hi:44,nome:"Frugal"},{lo:45,hi:48,nome:"Glacial"},{lo:49,hi:50,nome:"Imperioso"},{lo:51,hi:52,nome:"Implacável*"},{lo:53,hi:54,nome:"Incriminador"},{lo:55,hi:61,nome:"Inflamável"},{lo:62,hi:65,nome:"Inquisidor"},{lo:66,hi:69,nome:"Insistente"},{lo:70,hi:71,nome:"Khalmyrita"},{lo:72,hi:81,nome:"Majestoso*"},{lo:82,hi:83,nome:"Nímbico"},{lo:84,hi:84,nome:"Pulverizante*"},{lo:85,hi:85,nome:"Retaliador"},{lo:86,hi:87,nome:"Sanguessuga"},{lo:88,hi:88,nome:"Traiçoeiro"},{lo:89,hi:90,nome:"Verdugo"},{lo:91,hi:100,nome:"Esotérico específico"},{lo:1,hi:20,nome:"Cajado da destruição"},{lo:21,hi:40,nome:"Cajado da vida"},{lo:41,hi:45,nome:"Cajado das marés"},{lo:46,hi:60,nome:"Cajado do poder"},{lo:61,hi:75,nome:"Cálice sagrado"},{lo:76,hi:85,nome:"Relógio do arcanista"},{lo:86,hi:95,nome:"Varinha da generosidade"},{lo:96,hi:100,nome:"Varinha milenar"}]},
  acessorios: {menor:[{lo:1,hi:1,nome:"Algibeira mordedora"},{lo:2,hi:2,nome:"Elixir da mente dividida"},{lo:3,hi:3,nome:"Papiro das estrelas"},{lo:4,hi:4,nome:"Anel do sustento"},{lo:5,hi:7,nome:"Bainha mágica"},{lo:8,hi:9,nome:"Corda da escalada"},{lo:10,hi:10,nome:"Ferraduras da velocidade"},{lo:11,hi:12,nome:"Garrafa da fumaça eterna"},{lo:13,hi:15,nome:"Gema da luminosidade"},{lo:16,hi:18,nome:"Manto élfico"},{lo:19,hi:21,nome:"Mochila de carga"},{lo:22,hi:23,nome:"Amuleto da visão etérea"},{lo:24,hi:25,nome:"Cinturão do trobo"},{lo:26,hi:27,nome:"Elixir da eternidade"},{lo:28,hi:29,nome:"Pérola da nulificação"},{lo:30,hi:31,nome:"Saco dos ventos silenciosos"},{lo:32,hi:36,nome:"Brincos da sagacidade"},{lo:37,hi:41,nome:"Luvas da delicadeza"},{lo:42,hi:46,nome:"Manoplas da força do ogro"},{lo:47,hi:50,nome:"Manto da resistência"},{lo:51,hi:55,nome:"Manto do fascínio"},{lo:56,hi:60,nome:"Pingente da sensatez"},{lo:61,hi:65,nome:"Torque do vigor"},{lo:66,hi:66,nome:"Monóculo da franqueza"},{lo:67,hi:68,nome:"Chapéu do disfarce"},{lo:69,hi:69,nome:"Flauta fantasma"},{lo:70,hi:71,nome:"Lanterna da revelação"},{lo:72,hi:73,nome:"Algibeira provedora"},{lo:74,hi:75,nome:"Gaiola dos arcanos"},{lo:76,hi:77,nome:"Lâmpada da ilusão impecável"},{lo:78,hi:79,nome:"Pena da criação"},{lo:80,hi:81,nome:"Corda da resignação"},{lo:82,hi:86,nome:"Anel da proteção"},{lo:87,hi:87,nome:"Anel do escudo mental"},{lo:88,hi:88,nome:"Pingente da saúde"},{lo:89,hi:89,nome:"Coroa de flores"},{lo:90,hi:90,nome:"Jarro das profundezas"},{lo:91,hi:91,nome:"Escrivaninha consagrada"},{lo:92,hi:92,nome:"Anel da proteção mental"},{lo:93,hi:93,nome:"Berço das fadas"},{lo:94,hi:94,nome:"Chapéu dos truques infinitos"},{lo:95,hi:95,nome:"Cinto da leveza graciosa"},{lo:96,hi:96,nome:"Cristal da voz silenciosa"},{lo:97,hi:97,nome:"Cristal do tempo célere"},{lo:98,hi:98,nome:"Ocarina da melodia distante"},{lo:99,hi:99,nome:"Olhos do corvo"},{lo:100,hi:100,nome:"Pergaminho da verdade cósmica"}], medio:[{lo:1,hi:1,nome:"Anel de telecinesia"},{lo:2,hi:2,nome:"Bola de cristal"},{lo:3,hi:3,nome:"Caveira maldita"},{lo:4,hi:4,nome:"Instrumento da alegria"},{lo:5,hi:5,nome:"Ampulheta da harmonia temporal"},{lo:6,hi:6,nome:"Amuleto do amparo"},{lo:7,hi:7,nome:"Caixa dos ecos perdidos"},{lo:8,hi:8,nome:"Colar da perseverança"},{lo:9,hi:9,nome:"Colar do tirano"},{lo:10,hi:10,nome:"Óculos da revelação"},{lo:11,hi:11,nome:"Colar das bolas de fogo"},{lo:12,hi:12,nome:"Sandálias de Valkaria"},{lo:13,hi:13,nome:"Véu diáfano"},{lo:14,hi:14,nome:"Botas aladas"},{lo:15,hi:15,nome:"Botas inquietas"},{lo:16,hi:16,nome:"Pira póstera"},{lo:17,hi:17,nome:"Anel do pacto oneroso"},{lo:18,hi:18,nome:"Botas do andarilho das sombras"},{lo:19,hi:19,nome:"Cálice das marés"},{lo:20,hi:20,nome:"Cinto dos caminhos cruzados"},{lo:21,hi:21,nome:"Pedra da passagem"},{lo:22,hi:22,nome:"Pingente da dor partilhada"},{lo:23,hi:26,nome:"Braceletes de bronze"},{lo:27,hi:27,nome:"Capa nebulosa"},{lo:28,hi:28,nome:"Espelho do outro lado"},{lo:29,hi:30,nome:"Gema da purificação"},{lo:31,hi:32,nome:"Máscara da raposa"},{lo:33,hi:36,nome:"Anel da energia"},{lo:37,hi:40,nome:"Anel da vitalidade"},{lo:41,hi:42,nome:"Anel de invisibilidade"},{lo:43,hi:44,nome:"Braçadeiras do arqueiro"},{lo:45,hi:46,nome:"Brincos de Marah"},{lo:47,hi:48,nome:"Faixas do pugilista"},{lo:49,hi:50,nome:"Manto da aranha"},{lo:51,hi:52,nome:"Vassoura voadora"},{lo:53,hi:54,nome:"Símbolo abençoado"},{lo:55,hi:55,nome:"Colar de presas"},{lo:56,hi:56,nome:"Vestido noturno"},{lo:57,hi:57,nome:"Anel da beleza ilusória"},{lo:58,hi:58,nome:"Bastão do sonhador"},{lo:59,hi:59,nome:"Colar da fúria monstruosa"},{lo:60,hi:60,nome:"Coroa da floresta sussurrante"},{lo:61,hi:61,nome:"Espelho da verdade"},{lo:62,hi:62,nome:"Instrumentos da celeridade"},{lo:63,hi:63,nome:"Máscara do predador"},{lo:64,hi:65,nome:"Frigideira do chef anão"},{lo:66,hi:66,nome:"Gema da santificação"},{lo:67,hi:67,nome:"Cubo armadilha"},{lo:68,hi:68,nome:"Caldeirão da vida"},{lo:69,hi:72,nome:"Amuleto da robustez"},{lo:73,hi:74,nome:"Botas velozes"},{lo:75,hi:78,nome:"Cinto da força do gigante"},{lo:79,hi:82,nome:"Coroa majestosa"},{lo:83,hi:86,nome:"Estola da serenidade"},{lo:87,hi:87,nome:"Manto do morcego"},{lo:88,hi:91,nome:"Pulseiras da celeridade"},{lo:92,hi:95,nome:"Tiara da sapiência"},{lo:96,hi:97,nome:"Argolas místicas"},{lo:98,hi:98,nome:"Bastão da grande harmonia"},{lo:99,hi:99,nome:"Coroa da majestade distorcida"},{lo:100,hi:100,nome:"Bracelete do coração vivaz"}], maior:[{lo:1,hi:2,nome:"Elmo do teletransporte"},{lo:3,hi:4,nome:"Gema da telepatia"},{lo:5,hi:6,nome:"Gema elemental"},{lo:7,hi:11,nome:"Manual da saúde corporal"},{lo:12,hi:16,nome:"Manual do bom exercício"},{lo:17,hi:21,nome:"Manual dos movimentos precisos"},{lo:22,hi:26,nome:"Medalhão de Lena"},{lo:27,hi:31,nome:"Tomo da compreensão"},{lo:32,hi:36,nome:"Tomo da liderança e influência"},{lo:37,hi:41,nome:"Tomo dos grandes pensamentos"},{lo:42,hi:44,nome:"Anel da chama dançante"},{lo:45,hi:46,nome:"Chapéu pensador"},{lo:47,hi:48,nome:"Cinto da flecha veloz"},{lo:49,hi:50,nome:"Gema da profanação"},{lo:51,hi:53,nome:"Tomo da técnica definitiva"},{lo:54,hi:55,nome:"Tapeçaria da guerra"},{lo:56,hi:57,nome:"Braceletes da amizade intensa"},{lo:58,hi:58,nome:"Cilício vivo"},{lo:59,hi:59,nome:"Coração corrompido"},{lo:60,hi:61,nome:"Coração do inverno"},{lo:62,hi:63,nome:"Tomo dos companheiros"},{lo:64,hi:65,nome:"Anel refletor"},{lo:66,hi:67,nome:"Cinto do campeão"},{lo:68,hi:71,nome:"Colar guardião"},{lo:72,hi:73,nome:"Estatueta animista"},{lo:74,hi:75,nome:"Anel da liberdade"},{lo:76,hi:77,nome:"Tapete voador"},{lo:78,hi:79,nome:"Chave dos planos"},{lo:80,hi:81,nome:"Cinto da desmaterialização"},{lo:82,hi:85,nome:"Braceletes de ouro"},{lo:86,hi:87,nome:"Espelho da oposição"},{lo:88,hi:91,nome:"Robe do arquimago"},{lo:92,hi:93,nome:"Ossos dracônicos"},{lo:94,hi:95,nome:"Orbe das tempestades"},{lo:96,hi:97,nome:"Braçadeiras da força do colosso"},{lo:98,hi:99,nome:"Anel da regeneração"},{lo:100,hi:100,nome:"Espelho do aprisionamento"}]},
  riquezas: {menor:[{lo:1,hi:25,valor:"4d4 (10)"},{lo:26,hi:40,valor:"1d4x10 (25)"},{lo:41,hi:55,valor:"2d4x10 (50)"},{lo:56,hi:70,valor:"4d6x10 (140)"},{lo:71,hi:85,valor:"1d6x100 (350)"},{lo:86,hi:95,valor:"2d6x100 (700)"},{lo:96,hi:99,valor:"2d8x100 (900)"},{lo:100,hi:100,valor:"4d10x100 (2.200)"}], media:[{lo:1,hi:10,valor:"2d4x10 (50)"},{lo:11,hi:30,valor:"4d6x10 (140)"},{lo:31,hi:50,valor:"1d6x100 (350)"},{lo:51,hi:65,valor:"2d6x100 (700)"},{lo:66,hi:80,valor:"2d8x100 (900)"},{lo:81,hi:90,valor:"4d10x100 (2.200)"},{lo:91,hi:95,valor:"6d12x100 (3.900)"},{lo:96,hi:99,valor:"2d10x1000 (11000)"},{lo:100,hi:100,valor:"6d8x1000 (27000)"}], maior:[{lo:1,hi:5,valor:"1d6x100 (350)"},{lo:6,hi:15,valor:"2d6x100 (700)"},{lo:16,hi:25,valor:"2d8x100 (900)"},{lo:26,hi:40,valor:"4d10x100 (2.200)"},{lo:41,hi:60,valor:"6d12x100 (3.900)"},{lo:61,hi:75,valor:"2d10x1000 (11000)"},{lo:76,hi:85,valor:"6d8x1000 (27000)"},{lo:86,hi:95,valor:"1d10x10000 (55000)"},{lo:96,hi:100,valor:"4d12x10000 (260000)"}]}
};

const TESOURO_ND = {
  "0.25": {
    dinheiro:[{lo:1,hi:30,res:"—"},{lo:31,hi:70,res:"1d6x10 TC"},{lo:71,hi:95,res:"1d4x100 TC"},{lo:96,hi:100,res:"1d6x10 T$"}],
    itens:[{lo:1,hi:50,res:"—"},{lo:51,hi:75,res:"Item diverso"},{lo:76,hi:100,res:"Equipamento"}]
  },
  "0.5": {
    dinheiro:[{lo:1,hi:25,res:"—"},{lo:26,hi:70,res:"2d6x10 TC"},{lo:71,hi:95,res:"2d8x10 T$"},{lo:96,hi:100,res:"1d4x100 T$"}],
    itens:[{lo:1,hi:45,res:"—"},{lo:46,hi:70,res:"Item diverso"},{lo:71,hi:100,res:"Equipamento"}]
  },
  "1": {
    dinheiro:[{lo:1,hi:20,res:"—"},{lo:21,hi:70,res:"3d8x10 T$"},{lo:71,hi:95,res:"4d12x10 T$"},{lo:96,hi:100,res:"1 riqueza menor"}],
    itens:[{lo:1,hi:40,res:"—"},{lo:41,hi:65,res:"Item diverso"},{lo:66,hi:90,res:"Equipamento"},{lo:91,hi:100,res:"1 poção"}]
  },
  "2": {
    dinheiro:[{lo:1,hi:15,res:"—"},{lo:16,hi:55,res:"3d10x10 T$"},{lo:56,hi:85,res:"2d4x100 T$"},{lo:86,hi:95,res:"2d6+1 x100 T$"},{lo:96,hi:100,res:"1 riqueza menor"}],
    itens:[{lo:1,hi:30,res:"—"},{lo:31,hi:40,res:"Item diverso"},{lo:41,hi:70,res:"Equipamento"},{lo:71,hi:90,res:"1 poção"},{lo:91,hi:100,res:"Superior (1 melhoria)"}]
  },
  "3": {
    dinheiro:[{lo:1,hi:10,res:"—"},{lo:11,hi:20,res:"4d12x10 T$"},{lo:21,hi:60,res:"1d4x100 T$"},{lo:61,hi:90,res:"1d8x10 TO"},{lo:91,hi:100,res:"1d3 riquezas menores"}],
    itens:[{lo:1,hi:25,res:"—"},{lo:26,hi:35,res:"Item diverso"},{lo:36,hi:60,res:"Equipamento"},{lo:61,hi:85,res:"1 poção"},{lo:86,hi:100,res:"Superior (1 melhoria)"}]
  },
  "4": {
    dinheiro:[{lo:1,hi:10,res:"—"},{lo:11,hi:50,res:"1d6x100 T$"},{lo:51,hi:80,res:"1d12x100 T$"},{lo:81,hi:90,res:"1 riqueza menor +%"},{lo:91,hi:100,res:"1d3 riquezas menores +%"}],
    itens:[{lo:1,hi:20,res:"—"},{lo:21,hi:30,res:"Item diverso"},{lo:31,hi:55,res:"Equipamento 2D"},{lo:56,hi:80,res:"1 poção +%"},{lo:81,hi:100,res:"Superior (1 melhoria) 2D"}]
  },
  "5": {
    dinheiro:[{lo:1,hi:15,res:"—"},{lo:16,hi:65,res:"1d8x100 T$"},{lo:66,hi:95,res:"3d4x10 TO"},{lo:96,hi:100,res:"1 riqueza média"}],
    itens:[{lo:1,hi:20,res:"—"},{lo:21,hi:70,res:"1 poção"},{lo:71,hi:90,res:"Superior (1 melhoria)"},{lo:91,hi:100,res:"Superior (2 melhorias)"}]
  },
  "6": {
    dinheiro:[{lo:1,hi:15,res:"—"},{lo:16,hi:60,res:"2d6x100 T$"},{lo:61,hi:90,res:"2d10x100 T$"},{lo:91,hi:100,res:"1d3+1 riquezas menores"}],
    itens:[{lo:1,hi:20,res:"—"},{lo:21,hi:65,res:"1 poção +%"},{lo:66,hi:95,res:"Superior (1 melhoria)"},{lo:96,hi:100,res:"Superior (2 melhorias) 2D"}]
  },
  "7": {
    dinheiro:[{lo:1,hi:10,res:"—"},{lo:11,hi:60,res:"2d8x100 T$"},{lo:61,hi:90,res:"2d12x10 TO"},{lo:91,hi:100,res:"1d4+1 riquezas menores"}],
    itens:[{lo:1,hi:20,res:"—"},{lo:21,hi:60,res:"1d3 poções"},{lo:61,hi:90,res:"Superior (2 melhorias)"},{lo:91,hi:100,res:"Superior (3 melhorias)"}]
  },
  "8": {
    dinheiro:[{lo:1,hi:10,res:"—"},{lo:11,hi:55,res:"2d10x100 T$"},{lo:56,hi:95,res:"1d4+1 riquezas menores"},{lo:96,hi:100,res:"1 riqueza média +%"}],
    itens:[{lo:1,hi:20,res:"—"},{lo:21,hi:75,res:"1d3 poções"},{lo:76,hi:95,res:"Superior (2 melhorias)"},{lo:96,hi:100,res:"Superior (3 melhorias) 2D"}]
  },
  "9": {
    dinheiro:[{lo:1,hi:10,res:"—"},{lo:11,hi:35,res:"1 riqueza média"},{lo:36,hi:85,res:"4d6x100 T$"},{lo:86,hi:100,res:"1d3 riquezas médias"}],
    itens:[{lo:1,hi:20,res:"—"},{lo:21,hi:70,res:"1 poção +%"},{lo:71,hi:95,res:"Superior (3 melhorias)"},{lo:96,hi:100,res:"Mágico (menor)"}]
  },
  "10": {
    dinheiro:[{lo:1,hi:10,res:"—"},{lo:11,hi:30,res:"4d6x100 T$"},{lo:31,hi:85,res:"4d10x10 TO"},{lo:86,hi:100,res:"1d3+1 riquezas médias"}],
    itens:[{lo:1,hi:50,res:"—"},{lo:51,hi:75,res:"1d3+1 poções"},{lo:76,hi:90,res:"Superior (3 melhorias)"},{lo:91,hi:100,res:"Mágico (menor)"}]
  },
  "11": {
    dinheiro:[{lo:1,hi:10,res:"—"},{lo:11,hi:45,res:"2d4x1000 T$"},{lo:46,hi:85,res:"1d3 riquezas médias"},{lo:86,hi:100,res:"2d6x100 TO"}],
    itens:[{lo:1,hi:45,res:"—"},{lo:46,hi:70,res:"1d4+1 poções"},{lo:71,hi:90,res:"Superior (3 melhorias)"},{lo:91,hi:100,res:"Mágico (menor) 2D"}]
  },
  "12": {
    dinheiro:[{lo:1,hi:10,res:"—"},{lo:11,hi:45,res:"1 riqueza média +%"},{lo:46,hi:80,res:"2d6x1000 T$"},{lo:81,hi:100,res:"1d4+1 riquezas médias"}],
    itens:[{lo:1,hi:45,res:"—"},{lo:46,hi:70,res:"1d3+1 poções +%"},{lo:71,hi:85,res:"Superior (4 melhorias)"},{lo:86,hi:100,res:"Mágico (menor)"}]
  },
  "13": {
    dinheiro:[{lo:1,hi:10,res:"—"},{lo:11,hi:45,res:"4d4x1000 T$"},{lo:46,hi:80,res:"1d3+1 riquezas médias"},{lo:81,hi:100,res:"4d6x100 TO"}],
    itens:[{lo:1,hi:40,res:"—"},{lo:41,hi:65,res:"1d4+1 poções +%"},{lo:66,hi:95,res:"Superior (4 melhorias)"},{lo:96,hi:100,res:"Mágico (médio)"}]
  },
  "14": {
    dinheiro:[{lo:1,hi:10,res:"—"},{lo:11,hi:45,res:"1d3+1 riquezas médias"},{lo:46,hi:80,res:"3d6x1000 T$"},{lo:81,hi:100,res:"1 riqueza maior"}],
    itens:[{lo:1,hi:40,res:"—"},{lo:41,hi:65,res:"1d4+1 poções +%"},{lo:66,hi:90,res:"Superior (4 melhorias)"},{lo:91,hi:100,res:"Mágico (médio)"}]
  },
  "15": {
    dinheiro:[{lo:1,hi:10,res:"—"},{lo:11,hi:45,res:"1 riqueza média +%"},{lo:46,hi:80,res:"2d10x1000 T$"},{lo:81,hi:100,res:"1d4x1000 TO"}],
    itens:[{lo:1,hi:35,res:"—"},{lo:36,hi:45,res:"1d6+1 poções"},{lo:46,hi:85,res:"Superior (4 melhorias) 2D"},{lo:86,hi:100,res:"Mágico (médio)"}]
  },
  "16": {
    dinheiro:[{lo:1,hi:10,res:"—"},{lo:11,hi:40,res:"3d6x1000 T$"},{lo:41,hi:75,res:"3d10x100 TO"},{lo:76,hi:100,res:"1d3 riquezas maiores"}],
    itens:[{lo:1,hi:35,res:"—"},{lo:36,hi:45,res:"1d6+1 poções +%"},{lo:46,hi:80,res:"Superior (4 melhorias) 2D"},{lo:81,hi:100,res:"Mágico (médio)"}]
  },
  "17": {
    dinheiro:[{lo:1,hi:5,res:"—"},{lo:6,hi:40,res:"4d6x1000 T$"},{lo:41,hi:75,res:"1d3 riquezas médias +%"},{lo:76,hi:100,res:"2d4x1000 TO"}],
    itens:[{lo:1,hi:20,res:"—"},{lo:21,hi:40,res:"Mágico (menor)"},{lo:41,hi:80,res:"Mágico (médio)"},{lo:81,hi:100,res:"Mágico (maior)"}]
  },
  "18": {
    dinheiro:[{lo:1,hi:5,res:"—"},{lo:6,hi:40,res:"4d10x1000 T$"},{lo:41,hi:75,res:"1 riqueza maior"},{lo:76,hi:100,res:"1d3+1 riquezas maiores"}],
    itens:[{lo:1,hi:15,res:"—"},{lo:16,hi:40,res:"Mágico (menor) 2D"},{lo:41,hi:70,res:"Mágico (médio)"},{lo:71,hi:100,res:"Mágico (maior)"}]
  },
  "19": {
    dinheiro:[{lo:1,hi:5,res:"—"},{lo:6,hi:40,res:"4d12x1000 T$"},{lo:41,hi:75,res:"1 riqueza maior +%"},{lo:76,hi:100,res:"1d12x1000 TO"}],
    itens:[{lo:1,hi:10,res:"—"},{lo:11,hi:40,res:"Mágico (menor) 2D"},{lo:41,hi:60,res:"Mágico (médio) 2D"},{lo:61,hi:100,res:"Mágico (maior)"}]
  },
  "20": {
    dinheiro:[{lo:1,hi:5,res:"—"},{lo:6,hi:40,res:"2d4x1000 TO"},{lo:41,hi:75,res:"1d3 riquezas maiores"},{lo:76,hi:100,res:"1d3+1 riquezas maiores +%"}],
    itens:[{lo:1,hi:5,res:"—"},{lo:6,hi:40,res:"Mágico (menor) 2D"},{lo:41,hi:50,res:"Mágico (médio) 2D"},{lo:51,hi:100,res:"Mágico (maior) 2D"}]
  }
};

// ─── FUNÇÕES DO ROLADOR DE TESOURO ────────────────────────────────────────────

function rolarDado(lados) {
  return Math.floor(Math.random() * lados) + 1;
}

function rolarExpressao(expr) {
  // Parses expressions like "2d6x100", "1d4+1", "3d8x10", "1d3"
  // Returns {valor, detalhes}
  let str = expr.trim();
  let multiplicador = 1;
  let adicional = 0;

  // Check for x multiplier (e.g., x10, x100, x1000)
  const xMatch = str.match(/x(\d+)$/i);
  if (xMatch) { multiplicador = parseInt(xMatch[1]); str = str.replace(/x\d+$/i, ''); }

  // Check for +N at end (e.g., 1d3+1)
  const addMatch = str.match(/\+(\d+)$/);
  if (addMatch) { adicional = parseInt(addMatch[1]); str = str.replace(/\+\d+$/, ''); }

  // Parse NdM
  const diceMatch = str.match(/^(\d+)d(\d+)$/i);
  if (diceMatch) {
    const n = parseInt(diceMatch[1]);
    const lados = parseInt(diceMatch[2]);
    const rolagens = Array.from({length: n}, () => rolarDado(lados));
    const soma = rolagens.reduce((a, b) => a + b, 0) + adicional;
    return { valor: soma * multiplicador, rolagens, n, lados, adicional, multiplicador };
  }
  return { valor: 0, rolagens: [], n: 0, lados: 0 };
}

function buscarTabela(tabela, roll) {
  return tabela.find(e => roll >= e.lo && roll <= e.hi) || null;
}

function tipoEquipamento2D() {
  const d1 = rolarDado(6), d2 = rolarDado(6);
  const escolhido = Math.max(d1, d2); // "escolha um deles" — geralmente o melhor
  return { d1, d2, tipo: escolhido <= 3 ? 'armas' : escolhido <= 5 ? 'armaduras' : 'esotericos' };
}

function rolarEquipamento(usar2D = false) {
  let tipoRoll, tipo;
  if (usar2D) {
    const r = tipoEquipamento2D();
    tipoRoll = `2d6: ${r.d1}+${r.d2} → melhor=${Math.max(r.d1,r.d2)} → ${r.tipo}`;
    tipo = r.tipo;
  } else {
    const d6 = rolarDado(6);
    tipo = d6 <= 3 ? 'armas' : d6 <= 5 ? 'armaduras' : 'esotericos';
    tipoRoll = `1d6: ${d6} → ${tipo}`;
  }
  const itemRoll = rolarDado(100);
  const item = buscarTabela(TESOURO_TABELAS.equipamentos[tipo], itemRoll);
  return `Equipamento — ${tipoRoll} | d%: ${itemRoll} → **${item ? item.nome : '?'}**`;
}

function rolarSuperior(nMelhorias, usar2D = false) {
  let tipoRoll, tipo;
  if (usar2D) {
    const r = tipoEquipamento2D();
    tipoRoll = `2d6: ${r.d1}+${r.d2} → ${r.tipo}`;
    tipo = r.tipo;
  } else {
    const d6 = rolarDado(6);
    tipo = d6 <= 3 ? 'armas' : d6 <= 5 ? 'armaduras' : 'esotericos';
    tipoRoll = `1d6: ${d6} → ${tipo}`;
  }
  const itemRoll = rolarDado(100);
  const item = buscarTabela(TESOURO_TABELAS.equipamentos[tipo], itemRoll);
  const melhorias = [];
  for (let i = 0; i < nMelhorias; i++) {
    const r = rolarDado(100);
    const m = buscarTabela(TESOURO_TABELAS.superiores[tipo], r);
    melhorias.push(`d%:${r} → ${m ? m.nome : '?'}`);
  }
  return `Superior (${nMelhorias} melhoria${nMelhorias>1?'s':''}) — ${tipoRoll} | Item d%:${itemRoll} → **${item ? item.nome : '?'}** | Melhoria${nMelhorias>1?'s':''}: ${melhorias.join(', ')}`;
}

function rolarMagico(grau, usar2D = false) {
  // grau: 'menor' | 'médio' | 'maior'
  // 1d6: 1-4 weapon, 5 armor, 6 esoteric/accessory
  let tipoRoll, tipo, subtipo;
  if (usar2D) {
    const r = tipoEquipamento2D();
    tipoRoll = `2d6: ${r.d1}+${r.d2} → ${r.tipo}`;
    tipo = r.tipo;
  } else {
    const d6 = rolarDado(6);
    tipo = d6 <= 4 ? 'armas' : d6 === 5 ? 'armaduras' : 'acessorio';
    tipoRoll = `1d6: ${d6} → ${tipo}`;
  }
  if (tipo === 'acessorio') {
    // Map grau to accessory tier
    const tier = grau === 'menor' ? 'menor' : grau === 'médio' ? 'medio' : 'maior';
    const r = rolarDado(100);
    const item = buscarTabela(TESOURO_TABELAS.acessorios[tier], r);
    return `Mágico (${grau}) — ${tipoRoll} | Acessório ${tier} d%:${r} → **${item ? item.nome : '?'}**`;
  } else {
    const r = rolarDado(100);
    const tabela = TESOURO_TABELAS.magicos[tipo];
    const item = buscarTabela(tabela, r);
    return `Mágico (${grau}) — ${tipoRoll} | Encanto d%:${r} → **${item ? item.nome : '?'}**`;
  }
}

function rolarPocoes(n, bonusPct = false) {
  const resultados = [];
  for (let i = 0; i < n; i++) {
    let roll = rolarDado(100);
    if (bonusPct) roll = Math.min(roll + 20, 120);
    const pocao = buscarTabela(TESOURO_TABELAS.pocoes, roll);
    resultados.push(`d%:${roll}${bonusPct?' (+20%)':''} → **${pocao ? pocao.nome : '?'}**`);
  }
  return `${n} Poção${n>1?'(ões)':''}: ${resultados.join(' | ')}`;
}

function rolarItemDiverso() {
  const r = rolarDado(100);
  const item = buscarTabela(TESOURO_TABELAS.itensDiversos, r);
  return `Item Diverso d%:${r} → **${item ? item.nome : '?'}**`;
}

function rolarRiqueza(tipo, bonusPct = false) {
  let roll = rolarDado(100);
  const bonus = bonusPct ? 20 : 0;
  const rollFinal = Math.min(roll + bonus, 100);
  const tabela = TESOURO_TABELAS.riquezas[tipo];
  const entrada = buscarTabela(tabela, rollFinal);
  if (!entrada) return `Riqueza ${tipo} d%:${rollFinal} → ?`;
  // Parse the dice expression from valor (e.g., "4d4 (10)" or "1d4x10 (25)")
  const valorStr = entrada.valor;
  const diceM = valorStr.match(/(\d+d\d+(?:x\d+)?)/i);
  let valorFinal = '';
  if (diceM) {
    const r = rolarExpressao(diceM[1]);
    valorFinal = ` = ${r.valor} T$ (rolagens: ${r.rolagens.join('+')})`;
  }
  return `Riqueza ${tipo} — d%:${rollFinal}${bonusPct?' (+20%)':''} → ${valorStr}${valorFinal}`;
}

function parseDinheiroNDResult(res, metade = false) {
  if (res === '—') return '— (sem dinheiro)';

  // Check for riqueza entries
  const ricMatch = res.match(/(\d+d\d+\+?\d*|1)\s+riqueza(?:s)?\s+(menor|média|maior)(?:s)?(\s+\+%)?/i);
  if (ricMatch) {
    const qtdExpr = ricMatch[1];
    const tipo = ricMatch[2].toLowerCase().replace('é','e'); // média → media
    const bonusPct = !!ricMatch[3];
    let qtd = 1;
    if (qtdExpr.includes('d')) { const r = rolarExpressao(qtdExpr); qtd = r.valor; }
    else qtd = parseInt(qtdExpr) || 1;
    const results = [];
    for (let i = 0; i < qtd; i++) results.push(rolarRiqueza(tipo === 'media' ? 'media' : tipo, bonusPct));
    return results.join('\n    ');
  }

  // Parse money dice: e.g., "2d6x100 T$", "1d8x10 TO", "1d4x100 TC"
  // Handle "1d3+1 x100 T$" (note space before x)
  const moneyMatch = res.match(/([\dd+\s]+x?\d*)\s*(T\$|TO|TC)/i);
  if (!moneyMatch) return res;

  let exprRaw = moneyMatch[1].trim().replace(/\s+/g, '');
  const moeda = moneyMatch[2];
  
  // Handle special case "2d6+1x100" - could be "2d6+1 x100" with space
  // Already collapsed spaces above
  const r = rolarExpressao(exprRaw);
  let valor = r.valor;
  if (metade) valor = Math.floor(valor / 2);

  let detalhes = r.rolagens.length > 0
    ? ` (${r.rolagens.join('+')}${r.adicional ? '+'+r.adicional : ''}${r.multiplicador > 1 ? '×'+r.multiplicador : ''})`
    : '';
  if (metade) detalhes += ' [÷2 Metade]';

  return `💰 ${valor} ${moeda}${detalhes}`;
}

function parseDinheiroCountExpr(res) {
  // e.g., "1d3+1 riquezas menores" - extract quantity dice
  const m = res.match(/^([\dd+]+)\s+riqueza/i);
  if (!m) return 1;
  const expr = m[1];
  if (expr.includes('d')) return rolarExpressao(expr).valor;
  return parseInt(expr) || 1;
}

function parseItemNDResult(res) {
  if (res === '—') return '— (sem item)';

  const usar2D = res.includes('2D');
  const bonusPct = res.includes('+%');
  const limpo = res.replace('2D','').replace('+%','').trim();

  // Item diverso
  if (limpo.includes('Item diverso')) return rolarItemDiverso();

  // Equipamento
  if (limpo.match(/^Equipamento\b/)) return rolarEquipamento(usar2D);

  // Superior (N melhorias)
  const supMatch = limpo.match(/Superior \((\d+) melhorias?\)/);
  if (supMatch) return rolarSuperior(parseInt(supMatch[1]), usar2D);

  // Poções
  const pocMatch = limpo.match(/^([\dd+]+)\s+po[çc](?:ão|ões)/i);
  if (pocMatch) {
    let qtd = 1;
    const qtdExpr = pocMatch[1];
    if (qtdExpr.includes('d')) qtd = rolarExpressao(qtdExpr).valor;
    else qtd = parseInt(qtdExpr) || 1;
    return rolarPocoes(qtd, bonusPct);
  }

  // Mágico
  const magMatch = limpo.match(/Mágico \((menor|médio|maior)\)/i);
  if (magMatch) return rolarMagico(magMatch[1], usar2D);

  return res; // fallback: show raw text
}

function rolarTesouro(cenaId) {
  const cena = cenasAtuais.find(c => c.id === cenaId);
  if (!cena) return;

  const nivel = parseInt(document.getElementById('selectNivel').value) || 1;
  const dif = calcularDificuldades(nivel);
  const dSel = cena.dificuldadeSelecionada;

  // Resolve ND numérico
  const capStr = dif[dSel];
  let ndNum;
  if (capStr === '1/4') ndNum = 0.25;
  else if (capStr === '1/2') ndNum = 0.5;
  else ndNum = parseInt(capStr) || 1;
  ndNum = Math.max(0.25, Math.min(20, ndNum));

  // Buscar a chave mais próxima na tabela
  const chaves = Object.keys(TESOURO_ND).map(Number).sort((a, b) => a - b);
  const ndKey = String(chaves.reduce((prev, curr) => Math.abs(curr - ndNum) < Math.abs(prev - ndNum) ? curr : prev));

  const tabela = TESOURO_ND[ndKey];
  if (!tabela) { mostrarToast('ND não encontrado na tabela.', 'erro'); return; }

  const modificador = document.getElementById(`tesouro-mod-${cenaId}`)?.value || 'padrao';

  // Nenhum = sem tesouro
  if (modificador === 'nenhum') {
    exibirResultadoTesouro(cenaId, '❌ Nenhum tesouro (criatura sem riquezas).');
    return;
  }

  const vezes = modificador === 'dobro' ? 2 : 1;
  const metade = modificador === 'metade';

  const linhas = [`🎲 **Tesouro** — ND ${ndKey} (${modificador.charAt(0).toUpperCase() + modificador.slice(1)})`];

  for (let i = 0; i < vezes; i++) {
    if (vezes > 1) linhas.push(`\n— Rolagem ${i+1} —`);

    // Dinheiro
    const rollD = rolarDado(100);
    const entradaD = buscarTabela(tabela.dinheiro, rollD);
    const resD = entradaD ? entradaD.res : '—';
    linhas.push(`💰 Dinheiro (d%: ${rollD} → "${resD}"): ${parseDinheiroNDResult(resD, metade)}`);

    // Itens
    const rollI = rolarDado(100);
    const entradaI = buscarTabela(tabela.itens, rollI);
    const resI = entradaI ? entradaI.res : '—';
    linhas.push(`🎁 Item (d%: ${rollI} → "${resI}"): ${parseItemNDResult(resI)}`);
  }

  exibirResultadoTesouro(cenaId, linhas.join('\n'));
  salvarDados();
}

function exibirResultadoTesouro(cenaId, texto) {
  const cena = cenasAtuais.find(c => c.id === cenaId);
  if (cena) {
    cena.tesouros = texto;
    salvarDados();
  }
  const el = document.getElementById(`tesouro-resultado-${cenaId}`);
  if (el) {
    // Convert **bold** to <strong> and render as HTML
    const html = texto
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    el.innerHTML = html;
    el.classList.add('visivel');
  }
}

function limparTesouro(cenaId) {
  const cena = cenasAtuais.find(c => c.id === cenaId);
  if (cena) { cena.tesouros = null; salvarDados(); }
  const el = document.getElementById(`tesouro-resultado-${cenaId}`);
  if (el) { el.textContent = ''; el.classList.remove('visivel'); }
}
