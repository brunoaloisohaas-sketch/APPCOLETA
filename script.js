// ===== ESTADO E FUNÇÕES PRINCIPAIS =====
    const LS = { nfs:'xg_nfs', admin:'xg_admin' };
    let nfs = [];
    let scannerActive = false;
    let videoStream = null;
    let scanningInterval = null;

    // Funções utilitárias
    function loadLS(key, fallback){ 
      try{ 
        return JSON.parse(localStorage.getItem(key)) ?? fallback; 
      } catch(e){ 
        return fallback; 
      } 
    }
    
    function saveLS(key, val){ 
      localStorage.setItem(key, JSON.stringify(val)); 
    }
    
    function isMobile() {
      return /Mobi|Android/i.test(navigator.userAgent);
    }
    
    function isAdmin() {
      return localStorage.getItem(LS.admin) === "true";
    }
    
    function loginAdmin() {
      localStorage.setItem(LS.admin, "true");
      alert("Modo administrador ativado");
      renderDashboardCards();
    }
    
    function logoutAdmin() {
      localStorage.removeItem(LS.admin);
      alert("Saiu do modo administrador");
      renderDashboardCards();
    }

    // ===== DASHBOARD =====
    function renderDashboardCards() {
      const container = document.getElementById("dashCards");
      if (!container) return;

      container.innerHTML = "";

      // Modo simplificado no celular (não-admin)
      if (isMobile() && !isAdmin()) {
        container.innerHTML = "<p class='muted'>📱 Versão simplificada no celular (somente Admin vê os cards completos).</p>";
        return;
      }

      if (!nfs || !nfs.length) {
        container.innerHTML = "<div class='empty'>Nenhuma NF cadastrada ainda. Vá em <b>Cadastrar NF</b> para adicionar.</div>";
        return;
      }

      // Agrupar por rota
      const agrupado = {};
      nfs.forEach(nf => {
        const rota = nf.rota || 'Outra';
        if (!agrupado[rota]) {
          agrupado[rota] = {
            qtd: 0,
            volumes: 0,
            peso: 0,
            m3: 0,
            nfs: []
          };
        }
        
        agrupado[rota].qtd += 1;
        agrupado[rota].volumes += Number(nf.volumes || 0);
        agrupado[rota].peso += Number(nf.peso || 0);
        agrupado[rota].m3 += Number(nf.m3 || 0);
        agrupado[rota].nfs.push(nf);
      });

      // Criar cards
      for (const rota in agrupado) {
        const dados = agrupado[rota];
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
          <h3>${rota}</h3>
          <div class="kpi"><span class="big">${dados.qtd}</span> NFs</div>
          <div class="kpi"><span class="big">${dados.volumes}</span> Volumes</div>
          <div class="kpi"><span class="big">${dados.peso.toFixed(2)}</span> kg</div>
          <div class="kpi"><span class="big">${dados.m3.toFixed(2)}</span> m³</div>
        `;
        container.appendChild(card);
      }
    }

    // ===== EXPORTAÇÃO =====
    function exportNFs() {
      const startInp = document.getElementById("filtroInicio").value;
      const endInp = document.getElementById("filtroFim").value;
      const start = startInp ? new Date(startInp) : null;
      const end = endInp ? new Date(endInp) : null;

      const filtradas = nfs.filter(nf => {
        const d = new Date(nf.datahora);
        const afterStart = start ? d >= start : true;
        const beforeEnd = end ? d <= end : true;
        return afterStart && beforeEnd;
      });

      let csv = "NF,Data,Remetente,Destinatário,Volumes,Peso,m³,Rota\n";
      filtradas.forEach(nf => {
        csv += `${nf.numero},${nf.datahora},${nf.rem},${nf.dest},${nf.volumes},${nf.peso},${nf.m3},${nf.rota}\n`;
      });

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "notas_filtradas.csv";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    // ===== SCANNER =====
    function hasCamera() {
      return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }

    async function startScanner() {
    if (!hasCamera()) {
        alert('Câmera não disponível neste dispositivo');
        return;
    }
    
    try {
        // Parar scanner anterior se existir
        if (scannerActive) {
            stopScanner();
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // Solicitar acesso à câmera
        videoStream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: 'environment', // Preferir câmera traseira
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });
        
        // Exibir o vídeo
        const videoElement = document.getElementById('scanner-video');
        const scannerContainer = document.getElementById('scanner-container');
        
        videoElement.srcObject = videoStream;
        videoElement.setAttribute('playsinline', true); // Importante para iOS
        scannerContainer.classList.add('active');
        scannerActive = true;
        
        // Esperar o vídeo estar pronto
        videoElement.onloadedmetadata = function() {
            videoElement.play();
            
            // Iniciar processo de escaneamento
            scanningInterval = setInterval(scanBarcode, 300); // Reduzi a frequência para melhor performance
        };
        
    } catch (error) {
        console.error('Erro ao acessar a câmera:', error);
        alert('Não foi possível acessar a câmera: ' + error.message);
    }

    function stopScanner() {
      scannerActive = false;
      const scannerContainer = document.getElementById('scanner-container');
      scannerContainer.classList.remove('active');
      
      if (scanningInterval) {
        clearInterval(scanningInterval);
        scanningInterval = null;
      }
      
      if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
      }
      
      const videoElement = document.getElementById('scanner-video');
      if (videoElement) {
        videoElement.srcObject = null;
      }
    }

    function scanBarcode() {
    if (!scannerActive || !window.jsQR) return;
    
    const videoElement = document.getElementById('scanner-video');
    const canvas = document.getElementById('scanner-canvas');
    const context = canvas.getContext('2d');
    
    if (!videoElement || videoElement.readyState !== videoElement.HAVE_ENOUGH_DATA) {
        return;
    }
    
    // Ajustar o canvas para o tamanho do vídeo
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    
    // Desenhar o frame atual do vídeo no canvas
    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    
    // Obter dados da imagem
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    
    // Tentar decodificar o código
    try {
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
        });
        
        // Se encontrou um código válido
        if (code) {
            // Extrair número da NF (assumindo que o código contenha apenas números)
            const nfNumber = code.data.replace(/\D/g, '');
            
            if (nfNumber) {
                // Preencher o campo de número da NF
                document.getElementById('nfNumero').value = nfNumber;
                
                // Focar no próximo campo
                document.getElementById('nfDataHora')?.focus();
                
                // Parar o scanner
                stopScanner();
                
                // Feedback para o usuário
                alert('NF escaneada: ' + nfNumber);
            }
        }
    } catch (error) {
        console.error('Erro no scanner:', error);
    }
}

    // ===== NF FUNCTIONS =====
    function salvarNF() {
      const nf = {
        numero: document.getElementById("nfNumero").value.trim(),
        datahora: document.getElementById("nfDataHora").value,
        rem: document.getElementById("nfRem").value.trim(),
        dest: document.getElementById("nfDest").value.trim(),
        volumes: Number(document.getElementById("nfVolumes").value||0),
        peso: Number(document.getElementById("nfPeso").value||0),
        m3: Number(document.getElementById("nfM3").value||0),
        rota: document.getElementById("nfRota").value,
        resp: document.getElementById("nfResp").value.trim(),
        obs: document.getElementById("nfObs").value.trim()
      };
      
      if(!nf.numero){ 
        alert("Informe número da NF"); 
        return; 
      }
      
      nfs.unshift(nf);
      saveLS(LS.nfs, nfs);
      renderDashboardCards();
      atualizarResumo();
      alert("NF salva!");
      
      // Limpar campos
      ["nfNumero","nfDataHora","nfRem","nfDest","nfVolumes","nfPeso","nfM3","nfResp","nfObs"].forEach(id=>{
        const el = document.getElementById(id); 
        if (el) el.value = "";
      });
    }

    function atualizarResumo() {
      const resumoEl = document.getElementById('sumResumo');
      if (!resumoEl) return;
      
      if (!nfs.length) {
        resumoEl.innerHTML = '<div class="empty">Nenhuma NF cadastrada</div>';
        return;
      }
      
      // Agrupar por rota
      const agrupado = {};
      nfs.forEach(nf => {
        const rota = nf.rota || 'Outra';
        if (!agrupado[rota]) {
          agrupado[rota] = {
            qtd: 0,
            volumes: 0,
            peso: 0,
            m3: 0
          };
        }
        
        agrupado[rota].qtd += 1;
        agrupado[rota].volumes += Number(nf.volumes || 0);
        agrupado[rota].peso += Number(nf.peso || 0);
        agrupado[rota].m3 += Number(nf.m3 || 0);
      });
      
      // Criar tabela
      let html = '<table class="table-resumo"><thead><tr><th>Rota</th><th>NFs</th><th>Volumes</th><th>Peso (kg)</th><th>m³</th></tr></thead><tbody>';
      
      for (const rota in agrupado) {
        const dados = agrupado[rota];
        html += `<tr>
          <td>${rota}</td>
          <td>${dados.qtd}</td>
          <td>${dados.volumes}</td>
          <td>${dados.peso.toFixed(2)}</td>
          <td>${dados.m3.toFixed(2)}</td>
        </tr>`;
      }
      
      html += '</tbody></table>';
      resumoEl.innerHTML = html;
    }

    // ===== ETA FUNCTIONS =====
    function calcularETA() {
      const partida = document.getElementById("etaPartida").value;
      const min = Number(document.getElementById("etaMin").value);
      if(!partida || !min){ 
        alert("Informe partida e duração"); 
        return; 
      }
      
      const d = new Date(partida);
      const eta = new Date(d.getTime() + min*60000);
      document.getElementById("etaOut").textContent = `Chegada prevista: ${eta.toLocaleString()}`;
    }

    function salvarETA() {
      localStorage.setItem("xg_eta", document.getElementById("etaOut").textContent);
      alert("ETA salvo no resumo!");
    }

    // ===== INITIALIZATION =====
    document.addEventListener("DOMContentLoaded", function() {
      // Carregar dados
      nfs = loadLS(LS.nfs, []);
      
      // Configurar tabs
      document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', ()=>{
          document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
          btn.classList.add('active');
          document.querySelectorAll('.tab').forEach(sec=>{
            sec.style.display = (sec.id===btn.dataset.tab?'block':'none');
          });
        });
      });
      
      // Configurar scanner
      document.getElementById('btScannerNF').addEventListener('click', startScanner);
      document.getElementById('btStopScanner').addEventListener('click', stopScanner);
      
      // Configurar botão salvar NF
      document.getElementById('btSalvarNF').addEventListener('click', salvarNF);
      
      // Configurar ETA
      document.getElementById('btCalcETA').addEventListener('click', calcularETA);
      document.getElementById('btSalvarETA').addEventListener('click', salvarETA);
      
      // Inicializar views
      renderDashboardCards();
      atualizarResumo();
      
      // Service Worker
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.register("service-worker.js")
          .then(() => console.log("✅ Service Worker registrado"))
          .catch(err => console.error("SW falhou:", err));
      }
    });