/**
 * Business Control - Sistema de Gestión Empresarial
 * Desarrollado por Cristian David Ruiz
 * © 2026 Todos los derechos reservados
 * 
 * Este archivo es parte del sistema Business Control
 * y está protegido por derechos de autor
 */

export function getUserPayload() {
    const token = localStorage.getItem('token');
    if (!token) {
        return null;
    }
    try {
        // Decodifica la parte del payload del token (la segunda parte)
        return JSON.parse(atob(token.split('.')[1]));
    } catch (e) {
        console.error('Error al decodificar el token:', e);
        // Si el token es inválido, lo eliminamos para evitar problemas
        logout();
        return null;
    }
}

/**
 * Obtiene el rol del usuario actual.
 * @returns {string|null} El rol del usuario o null si no está autenticado.
 */
export function getUserRole() {
    const payload = getUserPayload();
    return payload ? payload.role : null;
}

/**
 * Cierra la sesión del usuario eliminando el token y redirigiendo al login.
 */
export function logout() {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
}

/**
 * Verifica si el usuario está autenticado. Si no, lo redirige al login.
 * Es un guardián de ruta básico para el lado del cliente.
 */
export function protectRoute() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
    }
}