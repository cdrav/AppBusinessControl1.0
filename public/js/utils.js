// Crear un contenedor para las notificaciones si no existe
if (!document.getElementById('notification-container')) {
  const container = document.createElement('div');
  container.id = 'notification-container';
  container.className = 'notification-container';
  // Estilos críticos inline para asegurar visibilidad sobre modales (z-index alto)
  container.style.position = 'fixed';
  container.style.top = '20px';
  container.style.right = '20px';
  container.style.zIndex = '10000'; // ¡Esto soluciona el problema de visibilidad!
  container.style.pointerEvents = 'none'; // Permite hacer clic a través del contenedor vacío
  document.body.appendChild(container);
}

// Función para mostrar notificaciones modernas (Toast)
function showToast(message, isError = false) {
  const container = document.getElementById('notification-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  
  // Agregamos íconos para que se vea más profesional
  const icon = isError ? '<i class="bi bi-exclamation-circle-fill me-2"></i>' : '<i class="bi bi-check-circle-fill me-2"></i>';
  toast.innerHTML = `${icon}<span>${message}</span>`;
  
  // Estilos base asegurados (por si falta el CSS)
  toast.style.backgroundColor = isError ? '#dc3545' : '#198754'; // Rojo o Verde Bootstrap
  toast.style.color = 'white';
  toast.style.padding = '12px 20px';
  toast.style.borderRadius = '8px';
  toast.style.marginBottom = '10px';
  toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';
  toast.style.minWidth = '300px';
  toast.style.pointerEvents = 'auto'; // Reactivar clics para el toast
  
  // Animación
  toast.style.opacity = '0';
  toast.style.transform = 'translateY(-20px)';
  toast.style.transition = 'all 0.3s ease';

  container.appendChild(toast);

  // Forzar reflow para que la animación funcione
  void toast.offsetWidth;

  setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
      toast.classList.add('show');
  }, 10);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-20px)';
    toast.classList.remove('show');
    setTimeout(() => {
        if (container.contains(toast)) {
            container.removeChild(toast);
        }
    }, 300);
  }, 3000);
}