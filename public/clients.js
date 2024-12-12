// Función para cargar los clientes y mostrarlos en la tabla
function loadClients() {
    fetch('http://localhost:3000/clients', {
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('token'),
      },
    })
      .then(response => response.json())
      .then(data => {
        const tableBody = document.getElementById('clientsTableBody');
        tableBody.innerHTML = ''; // Limpiar la tabla
  
        // Crear filas dinámicamente
        data.forEach((client, index) => {
          const row = `
            <tr>
              <td>${index + 1}</td>
              <td>${client.name}</td>
              <td>${client.email}</td>
              <td>${client.phone}</td>
              <td>
                <button class="btn btn-info btn-sm" onclick="editClient(${client.id})">
                  <i class="bi bi-pencil"></i> Editar
                </button>
                <button class="btn btn-danger btn-sm" onclick="deleteClient(${client.id})">
                  <i class="bi bi-trash"></i> Eliminar
                </button>
              </td>
            </tr>
          `;
          tableBody.innerHTML += row;
        });
      })
      .catch(error => {
        console.error('Error al cargar los clientes:', error);
        alert('Hubo un error al cargar los clientes.');
      });
  }
  
  // Función para eliminar un cliente
  function deleteClient(id) {
    if (confirm('¿Estás seguro de eliminar este cliente?')) {
      fetch(`http://localhost:3000/clients/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer ' + localStorage.getItem('token'),
        },
      })
        .then(response => {
          if (response.ok) {
            alert('Cliente eliminado exitosamente');
            loadClients(); // Recargar la tabla
          } else {
            throw new Error('No se pudo eliminar el cliente');
          }
        })
        .catch(error => {
          console.error('Error al eliminar cliente:', error);
          alert('Hubo un error al eliminar el cliente.');
        });
    }
  }


  function editClient(id) {
    // Redirige a la página de edición con el ID del cliente como parámetro
    window.location.href = `/public/editClient.html?id=${id}`;
  }
  
  
  // Llamar a la función al cargar la página
  window.onload = loadClients;
  