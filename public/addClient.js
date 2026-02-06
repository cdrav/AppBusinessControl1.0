// Crear un contenedor para las notificaciones si no existe
if (!document.getElementById('notification-container')) {
  const container = document.createElement('div');
  container.id = 'notification-container';
  container.className = 'notification-container';
  document.body.appendChild(container);
}

// Función para mostrar notificaciones modernas
function showToast(message, isError = false) {
  const container = document.getElementById('notification-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  if (isError) {
    toast.style.backgroundColor = '#dc3545'; // Color de error
  } else {
    toast.style.backgroundColor = '#28a745'; // Color de éxito
  }

  container.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10); // Iniciar animación

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => container.removeChild(toast), 500); // Esperar a que termine la animación para remover
  }, 3000);
}

// Manejar el envío del formulario para agregar clientes
document.getElementById('addClientForm').addEventListener('submit', function (event) {
    event.preventDefault(); // Evita que se recargue la página
  
    const submitButton = this.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'Guardando...';

    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const phone = document.getElementById('phone').value;
    const address = document.getElementById('address').value;
  
    const API_URL = 'http://localhost:3000';

    // Realizar una solicitud al backend para agregar el cliente
    fetch(`${API_URL}/clients`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('token'), // Token de autenticación
      },
      body: JSON.stringify({ name, email, phone, address }), // Enviar datos en JSON
    })
    .then(async response => {
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || 'No se pudo agregar el cliente');
        }
        return data;
    })
    .then(data => {
        showToast(data.message || 'Cliente agregado exitosamente');
        setTimeout(() => window.location.href = '/public/clients.html', 1500); // Redirigir tras un momento
    })
    .catch(error => {
        console.error('Error al agregar cliente:', error);
        showToast(error.message, true);
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
    });
  });
  