// Clientes Page JavaScript
let clients = [];

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
  loadClients();
  setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
  document.getElementById('searchForm').addEventListener('submit', function(e) {
    e.preventDefault();
    searchClients();
  });

  document.getElementById('searchInput').addEventListener('input', function() {
    searchClients();
  });
}

// Load clients from API
async function loadClients() {
  try {
    const response = await fetch('http://localhost:3000/clients', {
      headers: {
        'Authorization': 'Bearer ' + localStorage.getItem('token'),
      },
    });
    if (response.ok) {
      clients = await response.json();
      renderClients(clients);
      updateStats(clients); // Actualizar tarjetas de estadísticas
      if (clients.length === 0) {
        const grid = document.getElementById('clientsGrid');
        grid.innerHTML = `
          <div class="col-12">
              <div class="alert-custom">
                <i class="bi bi-info-circle"></i>
                No hay clientes registrados.
              </div>
          </div>
        `;
      }
    } else {
      throw new Error('No se pudo obtener la lista de clientes del servidor.');
    }
  } catch (error) {
    console.error('Error loading clients:', error);
    showMessage(`Error al cargar clientes: ${error.message}`, 'danger');
    const grid = document.getElementById('clientsGrid');
    grid.innerHTML = `
      <div class="col-12">
          <div class="alert-custom alert-danger">
            <i class="bi bi-exclamation-triangle"></i>
            No se pudieron cargar los datos. Verifique la conexión con el servidor.
          </div>
      </div>
    `;
  }
}

// Render clients table
function renderClients(clientsToRender) {
  const grid = document.getElementById('clientsGrid');
  grid.innerHTML = ''; // Limpiar contenido previo
  
  if (clientsToRender.length === 0) {
    grid.innerHTML = `
      <div class="col-12">
          <div class="alert-custom">
            <i class="bi bi-info-circle"></i>
            No se encontraron clientes que coincidan con la búsqueda.
          </div>
      </div>
    `;
    return;
  }

  clientsToRender.forEach(client => {
    const initial = client.name ? client.name.charAt(0).toUpperCase() : '?';
    // Diseño de tarjeta moderna
    const cardHtml = `
      <div class="col-md-6 col-lg-4 fade-in">
        <div class="card h-100 border-0 shadow-sm" style="border-radius: 15px; transition: transform 0.2s;">
          <div class="card-body p-4">
            <div class="d-flex align-items-center mb-4">
              <div class="rounded-circle bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center fw-bold me-3" style="width: 50px; height: 50px; font-size: 1.2rem;">
                ${initial}
              </div>
              <div style="overflow: hidden;">
                <h5 class="card-title mb-1 text-truncate" title="${escapeHTML(client.name)}">${escapeHTML(client.name)}</h5>
                <small class="text-muted text-truncate d-block" title="${escapeHTML(client.email)}">${escapeHTML(client.email)}</small>
              </div>
            </div>
            
            <div class="mb-4">
              <div class="d-flex align-items-center text-muted mb-2">
                <i class="bi bi-telephone me-2 text-primary"></i>
                <span>${client.phone || 'N/A'}</span>
              </div>
              <div class="d-flex align-items-center text-muted">
                <i class="bi bi-geo-alt me-2 text-primary"></i>
                <span class="text-truncate">${client.address || 'N/A'}</span>
              </div>
            </div>

            <div class="d-flex gap-2 pt-3 border-top">
              <button class="btn btn-light flex-fill text-primary btn-sm" onclick="editClient(${client.id})">
                <i class="bi bi-pencil me-1"></i> Editar
              </button>
              <button class="btn btn-light flex-fill text-danger btn-sm" onclick="deleteClient(${client.id})">
                <i class="bi bi-trash me-1"></i> Eliminar
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    grid.insertAdjacentHTML('beforeend', cardHtml);
  });
}

// Función para actualizar estadísticas (Simulada para diseño)
function updateStats(clients) {
  document.getElementById('totalClientsCount').textContent = clients.length;
  // Simulación de datos para completar el diseño
  document.getElementById('newClientsCount').textContent = Math.floor(clients.length * 0.2); 
  document.getElementById('activeClientsCount').textContent = Math.floor(clients.length * 0.8); 
  document.getElementById('inactiveClientsCount').textContent = Math.floor(clients.length * 0.2); 
}

// Search clients
function searchClients() {
  const searchTerm = document.getElementById('searchInput').value.toLowerCase();
  
  const filteredClients = clients.filter(client => 
    client.name.toLowerCase().includes(searchTerm) ||
    client.email.toLowerCase().includes(searchTerm) ||
    client.phone.includes(searchTerm) ||
    client.address.toLowerCase().includes(searchTerm)
  );
  
  renderClients(filteredClients);
}

// Edit client
function editClient(id) {
  const client = clients.find(c => c.id === id);
  if (client) {
    // Redirige a la página de edición. Asegúrate que la ruta sea correcta.
    window.location.href = `/editClient.html?id=${id}`;
  }
}

// Delete client
async function deleteClient(id) {
  if (confirm('¿Está seguro de que desea eliminar este cliente?')) {
    try {
      const response = await fetch(`http://localhost:3000/clients/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer ' + localStorage.getItem('token'),
        },
      });

      if (response.ok) {
        showMessage('Cliente eliminado exitosamente', 'success');
        loadClients(); // Recargar la lista de clientes desde el servidor
      } else {
        throw new Error('No se pudo eliminar el cliente');
      }
    } catch (error) {
      console.error('Error al eliminar cliente:', error);
      showMessage('Hubo un error al eliminar el cliente.', 'danger');
    }
  }
}

// Show message
function showMessage(message, type) {
  const messageDiv = document.getElementById('message');
  messageDiv.innerHTML = `
    <div class="alert-custom">
      <i class="bi bi-${type === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
      ${message}
    </div>
  `;
  
  setTimeout(() => {
    messageDiv.innerHTML = '';
  }, 3000);
}

// Función para escapar HTML y prevenir XSS, aunque la inserción segura es mejor.
// La usamos aquí para el innerHTML de la celda de cliente.
function escapeHTML(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}
