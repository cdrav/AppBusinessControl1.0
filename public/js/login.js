// Login Page JavaScript - v1.0.1
import { apiFetch, API_URL } from './api.js';

function getTokenRole(token) {
  try { return JSON.parse(atob(token.split('.')[1])).role; } catch(e) { return null; }
}

document.addEventListener('DOMContentLoaded', function() {
  console.log('Login.js loaded successfully');
  const token = localStorage.getItem('token');
  if (token) {
    const role = getTokenRole(token);
    window.location.href = role === 'superadmin' ? 'superadmin.html' : 'dashboard.html';
  }
});

document.getElementById('loginForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const submitBtn = document.querySelector('button[type="submit"]');
  const messageDiv = document.getElementById('message');

  // Validación básica
  if (!email || !password) {
    messageDiv.innerHTML = '<div class="alert alert-danger">Todos los campos son obligatorios</div>';
    return;
  }

  // Mostrar loading state
  submitBtn.classList.add('loading');
  submitBtn.disabled = true;
  messageDiv.innerHTML = '';

  try {
    const response = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (response.status === 429) {
      // Rate limit alcanzado
      messageDiv.innerHTML = `<div class="alert alert-warning"><i class="bi bi-shield-exclamation me-2"></i><strong>Acceso bloqueado:</strong> ${data.message}</div>`;
      submitBtn.disabled = true;
      setTimeout(() => { submitBtn.disabled = false; }, 60000);
      return;
    }

    // Mostrar el mensaje en la UI
    messageDiv.innerHTML = `<div class="alert alert-${response.ok ? 'success' : 'danger'}">${data.message}</div>`;

    // Si el login es exitoso, redirigir al dashboard
    if (response.ok) {
      localStorage.setItem('token', data.token);
      const role = getTokenRole(data.token);
      setTimeout(() => {
        window.location.href = role === 'superadmin' ? 'superadmin.html' : 'dashboard.html';
      }, 1500);
    }
  } catch (error) {
    messageDiv.innerHTML = '<div class="alert alert-danger">Error de conexión. Intente nuevamente.</div>';
  } finally {
    // Ocultar loading state
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
  }
});
