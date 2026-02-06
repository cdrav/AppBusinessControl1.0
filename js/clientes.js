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
    const response = await fetch('http://localhost:3000/clients');
    if (response.ok) {
      clients = await response.json();
      renderClients(clients);
    } else {
      // Load sample data if API fails
      loadSampleClients();
    }
  } catch (error) {
    console.error('Error loading clients:', error);
    loadSampleClients();
  }
}

// Load sample clients
function loadSampleClients() {
  clients = [
    {
      id: 1,
      name: 'Juan Pérez',
      email: 'juan.perez@email.com',
      phone: '+1 234-567-8901',
      address: 'Calle Principal 123',
      status: 'active',
      totalPurchases: 5,
      totalSpent: 2500
    },
    {
      id: 2,
      name: 'María García',
      email: 'maria.garcia@email.com',
      phone: '+1 234-567-8902',
      address: 'Avenida Central 456',
      status: 'active',
      totalPurchases: 8,
      totalSpent: 4200
    },
    {
      id: 3,
      name: 'Carlos Rodríguez',
      email: 'carlos.rodriguez@email.com',
      phone: '+1 234-567-8903',
      address: 'Plaza Mayor 789',
      status: 'inactive',
      totalPurchases: 2,
      totalSpent: 800
    }
  ];
  renderClients(clients);
}

// Render clients table
function renderClients(clientsToRender) {
  const tbody = document.getElementById('clientsTableBody');
  
  if (clientsToRender.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center">
          <div class="alert-custom">
            <i class="bi bi-info-circle"></i>
            No se encontraron clientes
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = clientsToRender.map(client => `
    <tr>
      <td>
        <strong>${client.name}</strong>
        <br>
        <small class="text-muted">${client.email}</small>
      </td>
      <td>${client.phone}</td>
      <td>${client.address}</td>
      <td>
        <span class="badge-custom badge-${client.status === 'active' ? 'success' : 'danger'}">
          ${client.status === 'active' ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td>
        <strong>${client.totalPurchases}</strong> compras
        <br>
        <small class="text-muted">$${client.totalSpent.toLocaleString()}</small>
      </td>
      <td>
        <button class="btn-action" onclick="editClient(${client.id})" title="Editar">
          <i class="bi bi-pencil"></i>
        </button>
        <button class="btn-action delete" onclick="deleteClient(${client.id})" title="Eliminar">
          <i class="bi bi-trash"></i>
        </button>
      </td>
    </tr>
  `).join('');
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
    // Redirect to edit page or open modal
    window.location.href = `/editClient.html?id=${id}`;
  }
}

// Delete client
function deleteClient(id) {
  if (confirm('¿Está seguro de que desea eliminar este cliente?')) {
    // Remove from array (in real app, this would be an API call)
    clients = clients.filter(c => c.id !== id);
    renderClients(clients);
    
    // Show success message
    showMessage('Cliente eliminado exitosamente', 'success');
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
