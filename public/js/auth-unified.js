/**
 * Business Control - Sistema de Gestión Empresarial
 * Desarrollado por Cristian David Ruiz
 * © 2026 Todos los derechos reservados
 * 
 * Este archivo es parte del sistema Business Control
 * y está protegido por derechos de autor
 */

export function getValidToken() {
    const token = localStorage.getItem('token');
    if (!token) {
        console.log('🔐 No hay token en localStorage');
        return null;
    }
    
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const now = Date.now();
        const expTime = payload.exp * 1000;
        
        // Verificar expiración con margen de 5 minutos
        if (expTime < now) {
            console.log('⏰ Token expirado:', new Date(expTime), 'Hora actual:', new Date(now));
            localStorage.removeItem('token');
            return null;
        }
        
        // Si está por expirar en menos de 5 minutos, mostrar advertencia
        if (expTime - now < 5 * 60 * 1000) {
            console.log('⚠️ Token por expirar pronto');
        }
        
        return token;
    } catch (e) {
        console.error('❌ Error al decodificar token:', e);
        localStorage.removeItem('token');
        return null;
    }
}

/**
 * Obtiene el payload del usuario de forma segura
 * @returns {object|null} Payload del token o null
 */
export function getUserPayload() {
    const token = getValidToken();
    if (!token) {
        return null;
    }
    
    try {
        return JSON.parse(atob(token.split('.')[1]));
    } catch (e) {
        console.error('❌ Error al obtener payload:', e);
        return null;
    }
}

/**
 * Obtiene el rol del usuario actual
 * @returns {string|null} Rol del usuario o null
 */
export function getUserRole() {
    const payload = getUserPayload();
    return payload ? payload.role : null;
}

/**
 * Cierra la sesión de forma controlada
 */
export function logout() {
    console.log('🚪 Cerrando sesión...');
    localStorage.removeItem('token');
    window.location.href = 'login.html';
}

/**
 * Protege una ruta - redirige a login si no hay sesión válida
 * @param {string} pageName - Nombre de la página para logs
 */
export function protectRoute(pageName = 'página') {
    const token = getValidToken();
    if (!token) {
        console.log(`🔒 Protegiendo ruta: ${pageName} - Redirigiendo a login`);
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

/**
 * Configura la sesión del usuario de forma unificada
 * @param {string} pageName - Nombre de la página actual
 */
export function setupUserSession(pageName = 'desconocida') {
    console.log(`👤 Configurando sesión para: ${pageName}`);
    
    const token = getValidToken();
    if (!token) {
        console.log('❌ Token inválido, redirigiendo a login');
        window.location.href = 'login.html';
        return null;
    }
    
    const payload = getUserPayload();
    if (!payload) {
        console.log('❌ Payload inválido, redirigiendo a login');
        window.location.href = 'login.html';
        return null;
    }
    
    console.log(`✅ Sesión válida para usuario: ${payload.username || payload.email} (${payload.role})`);
    return payload;
}

/**
 * Verifica si el usuario tiene un rol específico
 * @param {string|array} roles - Rol o roles permitidos
 * @returns {boolean} Tiene permiso
 */
export function hasRole(roles) {
    const userRole = getUserRole();
    if (!userRole) return false;
    
    if (Array.isArray(roles)) {
        return roles.includes(userRole);
    }
    
    return userRole === roles;
}

/**
 * Actualiza la información del usuario en la UI
 * @param {object} payload - Payload del usuario
 */
export function updateUserInfo(payload) {
    if (!payload) return;
    
    // Actualizar nombre de usuario
    const usernameDisplay = document.getElementById('usernameDisplay');
    if (usernameDisplay) {
        usernameDisplay.textContent = payload.username || payload.email || 'Usuario';
    }
    
    // Actualizar rol
    const userRoleDisplay = document.getElementById('userRoleDisplay');
    if (userRoleDisplay) {
        userRoleDisplay.textContent = payload.role || 'usuario';
    }
    
    // Actualizar inicial del avatar
    const userInitialDisplay = document.getElementById('userInitialDisplay');
    if (userInitialDisplay) {
        const name = payload.username || payload.email || 'U';
        const initial = name.charAt(0).toUpperCase();
        userInitialDisplay.textContent = initial;
    }
    
    // Mostrar información del usuario
    const userInfoContainer = document.getElementById('userInfoContainer');
    if (userInfoContainer) {
        userInfoContainer.style.opacity = '1';
    }
}

/**
 * Configura el botón de logout
 */
export function setupLogoutButton() {
    const logoutBtn = document.getElementById('logoutButton');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function(e) {
            e.preventDefault();
            if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
                logout();
            }
        });
    }
}

/**
 * Inicializa toda la autenticación en una página
 * @param {string} pageName - Nombre de la página
 * @param {Function} callback - Función a ejecutar si la sesión es válida
 */
export function initAuth(pageName, callback) {
    const payload = setupUserSession(pageName);
    if (!payload) return;
    
    updateUserInfo(payload);
    setupLogoutButton();
    scheduleTokenRefresh();
    
    if (callback && typeof callback === 'function') {
        callback(payload);
    }
}

/**
 * Renueva el token silenciosamente si quedan menos de 30 min
 */
let refreshTimer = null;
async function refreshToken() {
    const token = getValidToken();
    if (!token) return;

    try {
        const res = await fetch('/auth/refresh-token', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
        if (res.ok) {
            const data = await res.json();
            if (data.token) {
                localStorage.setItem('token', data.token);
                scheduleTokenRefresh();
            }
        }
    } catch (e) {
        // Silencioso: no interrumpir al usuario
    }
}

function scheduleTokenRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    const payload = getUserPayload();
    if (!payload || !payload.exp) return;

    const now = Date.now();
    const expTime = payload.exp * 1000;
    const timeLeft = expTime - now;
    const REFRESH_THRESHOLD = 30 * 60 * 1000; // 30 min antes de expirar

    if (timeLeft <= 0) return;

    if (timeLeft <= REFRESH_THRESHOLD) {
        // Ya está cerca de expirar, renovar inmediatamente
        refreshToken();
    } else {
        // Programar renovación para 30 min antes de expirar
        const delay = timeLeft - REFRESH_THRESHOLD;
        refreshTimer = setTimeout(refreshToken, delay);
    }
}
