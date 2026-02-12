// Landing Page JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Verificar si ya hay sesión iniciada
    const token = localStorage.getItem('token');
    if (token) {
        // Opcional: Redirigir al dashboard si ya está logueado
        // window.location.href = 'dashboard.html';
    }

    // Aquí se pueden inicializar animaciones específicas de la landing si fuera necesario
});