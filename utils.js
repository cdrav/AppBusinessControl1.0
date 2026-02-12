// Crear un contenedor para las notificaciones si no existe
if (!document.getElementById('notification-container')) {
  const container = document.createElement('div');
  container.id = 'notification-container';
  container.className = 'notification-container';
  document.body.appendChild(container);
}

// Función para mostrar notificaciones modernas (Toast)
function showToast(message, isError = false) {
  const container = document.getElementById('notification-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toast.style.backgroundColor = isError ? 'var(--danger-color)' : 'var(--success-color)';

  container.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10); // Iniciar animación

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => container.removeChild(toast), 500); // Esperar a que termine la animación para remover
  }, 3000);
}