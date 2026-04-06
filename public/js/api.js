/**
 * Business Control - Sistema de Gestión Empresarial
 * Desarrollado por Cristian David Ruiz
 * 2026 Todos los derechos reservados
 * 
 * Este archivo es parte del sistema Business Control
 * y está protegido por derechos de autor
 */

const API_BASE = ''; // Se deja vacío para usar rutas absolutas/relativas definidas en el servidor
export const API_URL = API_BASE;

export async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    
    const defaultHeaders = {
        'Authorization': token ? `Bearer ${token}` : ''
    };

    // No establecer Content-Type si el cuerpo es FormData (el navegador lo hace con el boundary correcto)
    if (!(options.body instanceof FormData)) {
        defaultHeaders['Content-Type'] = 'application/json';
    }

    const config = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers
        }
    };

    try {
        const response = await fetch(endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`, config);
        
        if (response.status === 401 || response.status === 403) {
            // Sesión expirada o no autorizada
            localStorage.removeItem('token');
            window.location.href = '/login.html';
            return;
        }

        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Error en la petición');
        return data;
    } catch (error) {
        console.error('API Error:', error);
        throw error;
    }
}