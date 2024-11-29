const express = require('express');
const router = express.Router();
const db = require('../db'); // Asegúrate de que esta conexión funcione correctamente

// Obtener todos los clientes
router.get('/', async (req, res) => {
    try {
        const [clients] = await db.query('SELECT * FROM clients');
        res.status(200).json(clients);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener los clientes' });
    }
});

// Crear un nuevo cliente
router.post('/', async (req, res) => {
    const { name, email, phone, address } = req.body;
    try {
        await db.query(
            'INSERT INTO clients (name, email, phone, address) VALUES (?, ?, ?, ?)',
            [name, email, phone, address]
        );
        res.status(201).json({ message: 'Cliente agregado exitosamente' });
    } catch (error) {
        res.status(500).json({ error: 'Error al agregar el cliente' });
    }
});

// Actualizar un cliente
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name, email, phone, address } = req.body;
    try {
        await db.query(
            'UPDATE clients SET name = ?, email = ?, phone = ?, address = ? WHERE id = ?',
            [name, email, phone, address, id]
        );
        res.status(200).json({ message: 'Cliente actualizado correctamente' });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar el cliente' });
    }
});

// Eliminar un cliente
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM clients WHERE id = ?', [id]);
        res.status(200).json({ message: 'Cliente eliminado exitosamente' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar el cliente' });
    }
});

module.exports = router;
