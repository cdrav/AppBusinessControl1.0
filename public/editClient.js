// Reutilizamos la lógica de notificaciones (idealmente esto estaría en un archivo JS compartido)
if (!document.getElementById('notification-container')) {
  const container = document.createElement('div');
  container.id = 'notification-container';
  container.className = 'notification-container';
  document.body.appendChild(container);
}

function showToast(message, isError = false) {
  const container = document.getElementById('notification-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  if (isError) {
    toast.style.backgroundColor = '#dc3545';
  } else {
    toast.style.backgroundColor = '#28a745';
  }
  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => container.removeChild(toast), 500);
  }, 3000);
}

// Leer el ID del cliente desde la URL
const params = new URLSearchParams(window.location.search);
const clientId = params.get('id');
const API_URL = 'http://localhost:3000';

// Función para cargar los datos del cliente
function loadClientData() {
  fetch(`${API_URL}/clients/${clientId}`, {
    headers: {
      'Authorization': 'Bearer ' + localStorage.getItem('token'),
    },
  })
    .then(response => response.json())
    .then(client => {
      document.getElementById('name').value = client.name;
      document.getElementById('email').value = client.email;
      document.getElementById('phone').value = client.phone;
    })
    .catch(error => {
      console.error('Error al cargar los datos del cliente:', error);
      showToast('Hubo un error al cargar los datos del cliente.', true);
    });
}

// Manejar el envío del formulario
document.getElementById('editClientForm').addEventListener('submit', function (event) {
  event.preventDefault();

  const submitButton = this.querySelector('button[type="submit"]');
  const originalButtonText = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = 'Actualizando...';

  const updatedClient = {
    name: document.getElementById('name').value,
    email: document.getElementById('email').value,
    phone: document.getElementById('phone').value,
  };

  fetch(`${API_URL}/clients/${clientId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + localStorage.getItem('token'),
    },
    body: JSON.stringify(updatedClient),
  })
  .then(async response => {
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || 'No se pudo actualizar el cliente');
    }
    showToast('Cliente actualizado exitosamente');
    setTimeout(() => window.location.href = '/public/clients.html', 1500);
  })
  .catch(error => {
    console.error('Error al actualizar cliente:', error);
    showToast(error.message, true);
    submitButton.disabled = false;
    submitButton.textContent = originalButtonText;
  });
});

// Cargar los datos del cliente al cargar la página
window.onload = loadClientData;
