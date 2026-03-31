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
                        
                        ${selectFichasHtml} <div class="image-input-wrapper">
                            <label>URL da Imagem (Opcional):</label>
                            <input type="text" placeholder="Cole o link..." value="${cena.imagem || ''}" onchange="salvarImagem('${cena.id}', this.value)">
                            ${cena.imagem ? `<button class="btn-remove-img" onclick="removerImagem('${cena.id}')">✖</button>` : ''}
                        </div>
                        ${cena.imagem ? `
                        <div class="plot-preview-img">
                            <img src="${cena.imagem}" crossorigin="anonymous">
                        </div>` : ''}
                    </div>
                </div>
            </div>`;
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

    // Converte imagens para base64 — resolve problemas de CORS no html2canvas
    const imagensBase64 = {};
    for (const cena of cenasAtuais) {
        if (cena.imagem) {
            imagensBase64[cena.id] = await imagemParaBase64(cena.imagem);
        }
    }

    let conteudoCenas = "";
    cenasAtuais.forEach((cena, index) => {
        const select = document.querySelector(`select[data-id="${cena.id}"]`);
        const difLabel = select ? select.options[select.selectedIndex].text : "";
        const imgSrc = imagensBase64[cena.id];
        const imgHtml = imgSrc
            ? `<img src="${imgSrc}" style="width:100%; max-height:400px; object-fit:contain; border-radius:5px; margin-top:10px; display:block;">`
            : (cena.imagem ? `<p style="color:#aaa; font-size:9pt; font-style:italic; margin-top:8px;">⚠️ Imagem não disponível no PDF (restrição CORS do servidor)</p>` : '');

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

function salvarImagem(id, url) {
    const cena = cenasAtuais.find(c => c.id === id);
    if (cena) {
        // Validação simples de URL (se começa com http ou https e parece imagem)
        if (url && !(url.startsWith('http://') || url.startsWith('https://'))) {
            alert("URL inválida. Use http:// ou https://");
            return;
        }
        cena.imagem = url;
        renderizar();
        salvarDados();
    }
}

function removerImagem(id) {
    const cena = cenasAtuais.find(c => c.id === id);
    if (cena) {
        cena.imagem = "";
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

    // Pré-converte todas as imagens da campanha para base64
    for (const adv of campanha) {
        for (const cena of adv.cenas) {
            if (cena.imagem && !cena._imgBase64) {
                cena._imgBase64 = await imagemParaBase64(cena.imagem);
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
            const imgSrc = cena._imgBase64;
            const imgHtml = imgSrc
                ? `<img src="${imgSrc}" style="width:100%; border-radius:5px; max-height:300px; object-fit:contain; display:block;">`
                : (cena.imagem ? `<p style="color:#aaa; font-size:9pt; font-style:italic;">⚠️ Imagem não disponível no PDF</p>` : '');
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