require('dotenv').config({ path: '.env.test' });

// Mock de la base de datos para tests unitarios
jest.mock('../config/db', () => ({
  query: jest.fn(),
  getConnection: jest.fn(),
  execute: jest.fn()
}));

// Mock del mailer para evitar envíos reales
jest.mock('../config/mailer', () => ({
  sendMail: jest.fn()
}));

// Mock del middleware de autenticación
jest.mock('../middleware/auth', () => {
  const { createMockAuthMiddleware } = require('./mocks/authMock');
  const mockAuth = createMockAuthMiddleware();
  return mockAuth;
});

// Configuración global para tests
beforeAll(async () => {
  // Configuración inicial antes de todos los tests
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test_secret_key';
  process.env.DB_NAME = 'business_control_test';
  
  // Deshabilitar logs durante los tests
  console.log = jest.fn();
  console.error = jest.fn();
});

afterAll(async () => {
  // Limpieza después de todos los tests
  // Restaurar console
  console.log.mockRestore();
  console.error.mockRestore();
});

beforeEach(async () => {
  // Limpiar todos los mocks antes de cada test
  jest.clearAllMocks();
});

afterEach(async () => {
  // Limpieza después de cada test
  jest.restoreAllMocks();
});
