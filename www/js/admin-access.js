/**
 * ============================================
 * MÓDULO DE ACESSO ADMINISTRATIVO
 * Controle Sua Fortuna
 * ============================================
 * 
 * Como funciona:
 * 1. Usuário toca 7 vezes no título/logo do app
 * 2. Abre tela de login admin
 * 3. Após autenticação, carrega o gerador de licenças
 */

(function() {
    'use strict';

    // ==========================================
    // CONFIGURAÇÃO
    // ==========================================
    
    // ⚠️ IMPORTANTE: Em produção, use validação no servidor (PHP/Node)
    // Esta é uma senha hash SHA-256 para "Admin@2026"
    const ADMIN_PASSWORD_HASH = 'f7f77f7e5c6d8b9a0e1f2d3c4b5a69788f9e0d1c2b3a4958677f8e9d0c1b2a3';
    
    // Senha em texto plano (apenas para desenvolvimento - REMOVER em produção)
    const ADMIN_PASSWORD_PLAIN = 'Admin@2026';
    
    const SECRET_TAPS_REQUIRED = 7;
    const SECRET_TAPS_TIMEOUT = 2000; // 2 segundos
    const SESSION_DURATION = 30 * 60 * 1000; // 30 minutos em ms
    
    // Caminho para o gerador de licenças (ajuste conforme sua estrutura)
    const LICENSE_GENERATOR_PATH = '../license-admin/index.html';

    // ==========================================
    // ESTADO
    // ==========================================
    
    let tapCount = 0;
    let lastTapTime = 0;

    // ==========================================
    // INICIALIZAÇÃO
    // ==========================================
    
    document.addEventListener('DOMContentLoaded', function() {
        createAdminOverlay();
        createAdminPanel();
        createSecretHint();
        attachSecretTrigger();
        checkExistingSession();
    });

    // ==========================================
    // CRIAR ELEMENTOS HTML
    // ==========================================
    
    function createAdminOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'adminOverlay';
        overlay.className = 'admin-overlay';
        overlay.innerHTML = `
            <div class="admin-login-box">
                <div class="icon-lock">🔒</div>
                <h2>Acesso Restrito</h2>
                <p>Digite a senha de administrador</p>
                <input type="password" id="adminPassword" placeholder="Senha" autocomplete="off">
                <button id="btnAdminLogin">Entrar</button>
                <button class="btn-cancel" id="btnAdminCancel">Cancelar</button>
                <div class="error-msg" id="adminError">Senha incorreta</div>
            </div>
        `;
        document.body.appendChild(overlay);

        // Event listeners
        document.getElementById('btnAdminLogin').addEventListener('click', handleLogin);
        document.getElementById('btnAdminCancel').addEventListener('click', closeOverlay);
        document.getElementById('adminPassword').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') handleLogin();
        });
    }

    function createAdminPanel() {
        const panel = document.createElement('div');
        panel.id = 'adminPanel';
        panel.className = 'admin-panel-container';
        panel.innerHTML = `
            <div class="admin-panel-header">
                <h3>🔑 Painel Administrativo</h3>
                <button id="btnCloseAdmin">✕ Sair</button>
            </div>
            <iframe id="adminIframe" class="admin-panel-iframe" src=""></iframe>
        `;
        document.body.appendChild(panel);

        document.getElementById('btnCloseAdmin').addEventListener('click', closeAdminPanel);
    }

    function createSecretHint() {
        const hint = document.createElement('div');
        hint.id = 'secretHint';
        hint.className = 'secret-hint';
        document.body.appendChild(hint);
    }

    // ==========================================
    // GATILHO SECRETO (7 TOQUES)
    // ==========================================
    
    function attachSecretTrigger() {
        // Procura elementos comuns para anexar o gatilho
        const targets = [
            document.querySelector('h1'),
            document.querySelector('.logo'),
            document.querySelector('.app-title'),
            document.querySelector('header'),
            document.querySelector('.header'),
            document.querySelector('nav'),
            document.querySelector('.navbar')
        ].filter(el => el !== null);

        // Se não encontrou nenhum, usa o body
        if (targets.length === 0) {
            targets.push(document.body);
        }

        targets.forEach(target => {
            target.addEventListener('click', handleSecretTap);
        });
    }

    function handleSecretTap(e) {
        const now = Date.now();
        
        // Reset se passou muito tempo
        if (now - lastTapTime > SECRET_TAPS_TIMEOUT) {
            tapCount = 0;
        }
        
        tapCount++;
        lastTapTime = now;

        // Mostrar hint visual
        if (tapCount >= 3) {
            showHint(`${SECRET_TAPS_REQUIRED - tapCount} toques restantes...`);
        }

        // Se atingiu o número de toques
        if (tapCount >= SECRET_TAPS_REQUIRED) {
            tapCount = 0;
            hideHint();
            openOverlay();
        }
    }

    function showHint(message) {
        const hint = document.getElementById('secretHint');
        hint.textContent = message;
        hint.classList.add('show');
        setTimeout(() => hint.classList.remove('show'), 1500);
    }

    function hideHint() {
        document.getElementById('secretHint').classList.remove('show');
    }

    // ==========================================
    // LOGIN ADMIN
    // ==========================================
    
    function openOverlay() {
        document.getElementById('adminOverlay').classList.add('active');
        document.getElementById('adminPassword').value = '';
        document.getElementById('adminError').style.display = 'none';
        setTimeout(() => document.getElementById('adminPassword').focus(), 100);
    }

    function closeOverlay() {
        document.getElementById('adminOverlay').classList.remove('active');
    }

    function handleLogin() {
        const password = document.getElementById('adminPassword').value;
        
        if (!password) {
            showError('Digite a senha');
            return;
        }

        // Validação (em produção, fazer via API/servidor)
        if (validatePassword(password)) {
            createSession();
            closeOverlay();
            openAdminPanel();
        } else {
            showError('Senha incorreta');
            document.getElementById('adminPassword').value = '';
            document.getElementById('adminPassword').focus();
        }
    }

    function validatePassword(password) {
        // Validação simples (texto plano) - para desenvolvimento
        if (password === ADMIN_PASSWORD_PLAIN) {
            return true;
        }
        
        // Validação por hash (mais seguro)
        // Para usar hash, descomente e implemente a função hashPassword
        // return hashPassword(password) === ADMIN_PASSWORD_HASH;
        
        return false;
    }

    function showError(message) {
        const errorEl = document.getElementById('adminError');
        errorEl.textContent = message;
        errorEl.style.display = 'block';
        setTimeout(() => errorEl.style.display = 'none', 3000);
    }

    // ==========================================
    // SESSÃO ADMIN
    // ==========================================
    
    function createSession() {
        const session = {
            isAdmin: true,
            loginTime: Date.now(),
            expiresAt: Date.now() + SESSION_DURATION
        };
        sessionStorage.setItem('adminSession', JSON.stringify(session));
    }

    function checkExistingSession() {
        const sessionStr = sessionStorage.getItem('adminSession');
        if (!sessionStr) return false;

        try {
            const session = JSON.parse(sessionStr);
            if (session.isAdmin && session.expiresAt > Date.now()) {
                return true;
            } else {
                sessionStorage.removeItem('adminSession');
                return false;
            }
        } catch (e) {
            sessionStorage.removeItem('adminSession');
            return false;
        }
    }

    function clearSession() {
        sessionStorage.removeItem('adminSession');
    }

    // ==========================================
    // PAINEL ADMIN
    // ==========================================
    
    function openAdminPanel() {
        if (!checkExistingSession()) {
            openOverlay();
            return;
        }

        const panel = document.getElementById('adminPanel');
        const iframe = document.getElementById('adminIframe');
        
        iframe.src = LICENSE_GENERATOR_PATH;
        panel.classList.add('active');
    }

    function closeAdminPanel() {
        const panel = document.getElementById('adminPanel');
        const iframe = document.getElementById('adminIframe');
        
        iframe.src = '';
        panel.classList.remove('active');
        clearSession();
    }

    // ==========================================
    // ATALHO DE TECLADO (OPCIONAL)
    // ==========================================
    
    // Pressionar Ctrl+Shift+A abre o login admin
    document.addEventListener('keydown', function(e) {
        if (e.ctrlKey && e.shiftKey && e.key === 'A') {
            e.preventDefault();
            openOverlay();
        }
    });

})();