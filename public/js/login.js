// Login Page JavaScript
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
    const response = await fetch('http://localhost:3000/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    // Mostrar el mensaje en la UI
    messageDiv.innerHTML = `<div class="alert alert-${response.ok ? 'success' : 'danger'}">${data.message}</div>`;

    // Si el login es exitoso, redirigir al dashboard
    if (response.ok) {
      localStorage.setItem('token', data.token);
      setTimeout(() => {
        window.location.href = 'dashboard.html';
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
