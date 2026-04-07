// Add Inventory Page JavaScript
// Importar autenticación unificada
import { getValidToken, initAuth } from './auth-unified.js';
import { apiFetch, API_URL } from './api.js';

document.addEventListener('DOMContentLoaded', function() {
    // Inicializar autenticación de forma unificada
    initAuth('Agregar Inventario', function(payload) {
        // Cargar proveedores solo si la sesión es válida
        loadSuppliers(getValidToken());
        
        // Enfocar el campo de código de barras de forma segura
        const barcodeInput = document.getElementById('productBarcode');
        if (barcodeInput) setTimeout(() => barcodeInput.focus(), 150);

        document.querySelectorAll('.form-control').forEach((input, index) => {
          input.style.animationDelay = `${index * 0.1}s`;
          input.classList.add('fade-in');
        });

        // Calcular valor total automáticamente
        document.getElementById('productQuantity').addEventListener('input', calculateTotal);
        document.getElementById('productPrice').addEventListener('input', calculateTotal);

        // Manejar el envío del formulario
        document.getElementById('addProductForm').addEventListener('submit', handleAddProduct);
    });
});

async function loadSuppliers(token) {
    try {
        const response = await fetch(`${API_URL}/suppliers`, {
            method: 'GET',
            headers: { 
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('La respuesta no es JSON válido');
        }
        
        const suppliers = await response.json();
        
        // Verificar que suppliers sea un array
        if (!Array.isArray(suppliers)) {
            console.error('La respuesta no es un array:', suppliers);
            return;
        }
        
        const select = document.getElementById('productSupplier');
        if (select) {
            // Limpiar opciones existentes excepto la primera
            select.innerHTML = '<option value="">Selecciona un proveedor (opcional)</option>';
            
            if (suppliers.length === 0) {
                select.innerHTML += '<option value="">No hay proveedores registrados</option>';
            } else {
                suppliers.forEach(s => {
                    if (s && s.id && s.name) {
                        select.innerHTML += `<option value="${s.id}">${s.name}</option>`;
                    }
                });
            }
        }
    } catch (e) { 
        console.error('Error cargando proveedores:', e);
        // Mostrar mensaje al usuario sin redirigir
        const messageDiv = document.getElementById('message');
        if (messageDiv) {
            messageDiv.innerHTML = `
                <div class="alert alert-warning alert-dismissible fade show" role="alert">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    No se pudieron cargar los proveedores. Puedes continuar sin seleccionar uno.
                    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
                </div>
            `;
        }
    }
}

function calculateTotal() {
    const quantity = parseFloat(document.getElementById('productQuantity').value) || 0;
    const price = parseFloat(document.getElementById('productPrice').value) || 0;
    const total = quantity * price;
    // Podrías mostrar este total en la UI si lo deseas
}

async function handleAddProduct(event) {
    event.preventDefault();

    const submitBtn = document.querySelector('.btn-submit');
    const messageDiv = document.getElementById('message');
    
    const barcode = document.getElementById('productBarcode').value.trim();
    const name = document.getElementById('productName').value;
    const quantity = document.getElementById('productQuantity').value;
    const price = document.getElementById('productPrice').value;
    const cost = document.getElementById('productCost').value;
    const category = document.getElementById('productCategory').value;
    const supplierId = document.getElementById('productSupplier').value;
    const description = document.getElementById('productDescription').value;

    // Validación básica
    if (!name || !quantity || !price) {
      showToast('Por favor completa todos los campos obligatorios', true);
      return;
    }

    // Mostrar loading state
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;
    messageDiv.innerHTML = '';

    const token = getValidToken();
    if (!token) return;

    try {
      const response = await fetch(`${API_URL}/inventory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, quantity, price, cost, category, supplier_id: supplierId, description, barcode }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Error al agregar el producto');
      }

      showToast('¡Producto agregado con éxito!');
      document.getElementById('addProductForm').reset();
      
      setTimeout(() => window.location.href = 'inventarios.html', 1500);
      
    } catch (error) {
      console.error('Error:', error.message);
      showToast(error.message, true);
    } finally {
      submitBtn.classList.remove('loading');
      submitBtn.disabled = false;
    }
}