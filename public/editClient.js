// Leer el ID del cliente desde la URL
const params = new URLSearchParams(window.location.search);
const clientId = params.get('id');

// Función para cargar los datos del cliente
function loadClientData() {
  fetch(`http://localhost:3000/clients/${clientId}`, {
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
      alert('Hubo un error al cargar los datos del cliente.');
    });
}

// Manejar el envío del formulario
document.getElementById('editClientForm').addEventListener('submit', function (event) {
  event.preventDefault();

  const updatedClient = {
    name: document.getElementById('name').value,
    email: document.getElementById('email').value,
    phone: document.getElementById('phone').value,
  };

  fetch(`http://localhost:3000/clients/${clientId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + localStorage.getItem('token'),
    },
    body: JSON.stringify(updatedClient),
  })
    .then(response => {
      if (response.ok) {
        alert('Cliente actualizado exitosamente');
        window.location.href = '/public/clients.html'; // Redirige a la lista de clientes
      } else {
        throw new Error('No se pudo actualizar el cliente');
      }
    })
    .catch(error => {
      console.error('Error al actualizar cliente:', error);
      alert('Hubo un error al actualizar el cliente.');
    });
});

// Cargar los datos del cliente al cargar la página
window.onload = loadClientData;
