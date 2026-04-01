import { apiFetch } from './api.js';

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
  
    // Realizar una solicitud al backend para agregar el cliente
    apiFetch('/clients', {
      method: 'POST',
      body: JSON.stringify({ name, email, phone, address }), // Enviar datos en JSON
    })
    .then(data => {
        if (!data) return;
        showToast(data.message || 'Cliente agregado exitosamente');
        setTimeout(() => window.location.href = 'clientes.html', 1500); // Redirigir tras un momento
    })
    .catch(error => {
        console.error('Error al agregar cliente:', error);
        showToast(error.message, true);
        submitButton.disabled = false;
        submitButton.textContent = originalButtonText;
    });
});