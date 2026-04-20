// Configuración de roles del sistema
const ROLES = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  CAJERO: 'cajero', 
  COBRADOR: 'cobrador',
  SUPERVISOR: 'supervisor'
};

const PERMISOS = {
  // Permisos básicos
  VER_DASHBOARD: 'view_dashboard',
  VER_VENTAS: 'view_sales',
  CREAR_VENTAS: 'create_sales',
  VER_INVENTARIO: 'view_inventory',
  EDITAR_INVENTARIO: 'edit_inventory',
  VER_CLIENTES: 'view_clients',
  EDITAR_CLIENTES: 'edit_clients',
  VER_REPORTES: 'view_reports',
  
  // Permisos específicos de cobrador
  VER_COBROS: 'view_credits',
  GESTIONAR_COBROS: 'manage_credits',
  REGISTRAR_PAGOS: 'record_payments',
  
  // Permisos de administrador
  GESTIONAR_USUARIOS: 'manage_users',
  ASIGNAR_ROLES: 'assign_roles',
  CONFIGURAR_SISTEMA: 'configure_system',
  VER_CONFIGURACION: 'view_config',
  
  // Permisos de superadmin (plataforma)
  GESTIONAR_TENANTS: 'manage_tenants',
  VER_METRICAS_GLOBALES: 'view_global_metrics',
  IMPERSONAR_TENANT: 'impersonate_tenant',
  SOPORTE_PLATAFORMA: 'platform_support'
};

const PERMISOS_POR_ROL = {
  [ROLES.SUPERADMIN]: Object.values(PERMISOS), // Superadmin tiene TODOS los permisos
  
  [ROLES.ADMIN]: Object.values(PERMISOS).filter(p => ![
    PERMISOS.GESTIONAR_TENANTS, PERMISOS.VER_METRICAS_GLOBALES,
    PERMISOS.IMPERSONAR_TENANT, PERMISOS.SOPORTE_PLATAFORMA
  ].includes(p)), // Admin tiene todos excepto los de plataforma
  
  [ROLES.CAJERO]: [
    PERMISOS.VER_DASHBOARD,
    PERMISOS.VER_VENTAS,
    PERMISOS.CREAR_VENTAS,
    PERMISOS.VER_INVENTARIO,
    PERMISOS.VER_CLIENTES,
    PERMISOS.VER_REPORTES
  ],
  
  [ROLES.COBRADOR]: [
    PERMISOS.VER_DASHBOARD,
    PERMISOS.VER_CLIENTES,
    PERMISOS.VER_COBROS,
    PERMISOS.GESTIONAR_COBROS,
    PERMISOS.REGISTRAR_PAGOS
  ],
  
  [ROLES.SUPERVISOR]: [
    PERMISOS.VER_DASHBOARD,
    PERMISOS.VER_VENTAS,
    PERMISOS.VER_INVENTARIO,
    PERMISOS.VER_CLIENTES,
    PERMISOS.VER_REPORTES,
    PERMISOS.VER_COBROS,
    PERMISOS.GESTIONAR_COBROS
  ]
};

module.exports = {
  ROLES,
  PERMISOS,
  PERMISOS_POR_ROL
};
