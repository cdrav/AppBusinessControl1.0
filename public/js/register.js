// Register Page JavaScript
const API_URL = ''; // Ruta relativa para producción

document.addEventListener('DOMContentLoaded', function() {
  // Verificar si ya hay sesión iniciada
  if (localStorage.getItem('token')) {
    window.location.href = 'dashboard.html';
  }

  const form = document.getElementById('registerForm');
  const passwordInput = document.getElementById('password');
  const confirmPasswordInput = document.getElementById('confirmPassword');
  const messageDiv = document.getElementById('message');
  const passwordStrengthDiv = document.getElementById('passwordStrength');

  // Form submit handler
  form.addEventListener('submit', async function (e) {
    e.preventDefault();

    const username = document.getElementById('username').value;
    const email = document.getElementById('email').value;
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;
    const submitBtn = form.querySelector('button[type="submit"]');

    // Validación básica
    if (!username || !email || !password || !confirmPassword) {
      showMessage('Todos los campos son obligatorios', 'danger');
      return;
    }

    // Validación de contraseñas
    if (password !== confirmPassword) {
      showMessage('Las contraseñas no coinciden', 'danger');
      return;
    }

    if (password.length < 6) {
      showMessage('La contraseña debe tener al menos 6 caracteres', 'danger');
      return;
    }

    // Mostrar loading state
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    messageDiv.innerHTML = '';

    try {
      const response = await fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await response.json();

      // Mostrar el mensaje en la UI
      showMessage(data.message, response.ok ? 'success' : 'danger');

      // Si el registro es exitoso, redirigir al login
      if (response.ok) {
        form.reset();
        passwordStrengthDiv.innerHTML = '';
        
        setTimeout(() => {
          window.location.href = 'login.html';
        }, 2000);
      }
    } catch (error) {
      showMessage('Error de conexión. Intente nuevamente.', 'danger');
    } finally {
      // Ocultar loading state
      submitBtn.classList.remove('loading');
      submitBtn.disabled = false;
    }
  });

  // Validación de contraseña en tiempo real
  passwordInput.addEventListener('input', function(e) {
    const password = e.target.value;
    updatePasswordStrength(password);
  });

  // Validación de confirmación de contraseña
  confirmPasswordInput.addEventListener('input', function(e) {
    const password = passwordInput.value;
    const confirmPassword = e.target.value;
    
    if (confirmPassword && password !== confirmPassword) {
      e.target.setCustomValidity('Las contraseñas no coinciden');
    } else {
      e.target.setCustomValidity('');
    }
  });

  // Función para mostrar mensajes
  function showMessage(message, type) {
    messageDiv.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
  }

  // Función para actualizar la fuerza de la contraseña
  function updatePasswordStrength(password) {
    if (password.length === 0) {
      passwordStrengthDiv.innerHTML = '';
      return;
    }
    
    let strength = 0;
    let strengthText = '';
    let strengthClass = '';
    
    if (password.length >= 6) strength++;
    if (password.match(/[a-z]+/)) strength++;
    if (password.match(/[A-Z]+/)) strength++;
    if (password.match(/[0-9]+/)) strength++;
    if (password.match(/[$@#&!]+/)) strength++;
    
    if (strength <= 2) {
      strengthText = 'Débil';
      strengthClass = 'strength-weak';
    } else if (strength === 3) {
      strengthText = 'Media';
      strengthClass = 'strength-medium';
    } else {
      strengthText = 'Fuerte';
      strengthClass = 'strength-strong';
    }
    
    passwordStrengthDiv.innerHTML = `<span class="${strengthClass}">Fuerza: ${strengthText}</span>`;
  }
});
