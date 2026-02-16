// Add Client Page JavaScript
const API_URL = 'http://localhost:3000';

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('addClientForm');
    
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const submitBtn = form.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        
        // Datos del formulario
        const clientData = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            address: document.getElementById('address').value
        };

        // Estado de carga
        submitBtn.disabled = true;
        submitBtn.textContent = 'Guardando...';

        try {
            const response = await fetch(`${API_URL}/clients`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + localStorage.getItem('token')
                },
                body: JSON.stringify(clientData)
            });

            if (response.ok) {
                alert('Cliente agregado exitosamente');
                window.location.href = 'clients.html';
            } else {
                const data = await response.json();
                alert('Error: ' + (data.message || 'No se pudo agregar el cliente'));
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Error de conexión al servidor');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });
});