// Manejar el envío del formulario para agregar clientes
document.getElementById('addClientForm').addEventListener('submit', function (event) {
    event.preventDefault(); // Evita que se recargue la página
  
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const phone = document.getElementById('phone').value;
    const address = document.getElementById('address').value;
  
    // Realizar una solicitud al backend para agregar el cliente
    fetch('http://localhost:3000/clients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + localStorage.getItem('token'), // Token de autenticación
      },
      body: JSON.stringify({ name, email, phone, address }), // Enviar datos en JSON
    })
      .then(response => {
        if (response.ok) {
          return response.json();
        }
        throw new Error('No se pudo agregar el cliente');
      })
      .then(data => {
        alert(data.message || 'Cliente agregado exitosamente');
        window.location.href = '/clientes.html'; // Redirigir a la lista de clientes
      })
      .catch(error => {
        console.error('Error al agregar cliente:', error);
        alert('Hubo un error al agregar el cliente.');
      });
  });
  