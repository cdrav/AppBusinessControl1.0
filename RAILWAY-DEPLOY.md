# 🚀 Guía de Deploy en Railway

## ✅ **Problema Solucionado**

El error que viste era por **desincronización entre package.json y package-lock.json**. Ya está solucionado:

```bash
npm install          # ✅ Actualizado
npm audit fix        # ✅ Vulnerabilidades corregidas
```

---

## 📋 **Estado Actual del Deploy**

### **✅ Dependencias Sincronizadas**
- `supertest@7.1.3` ✅ (actualizado desde 6.3.4)
- `superagent@10.3.0` ✅ (actualizado desde 8.1.2)  
- `formidable@3.5.4` ✅ (actualizado desde 2.1.5)
- `cookie-signature@1.2.2` ✅ (agregado)

### **✅ Vulnerabilidades Corregidas**
- 0 vulnerabilidades (antes: 1 alta)

---

## 🚀 **Pasos para Deploy Exitoso**

### **1. Preparación Local**
```bash
# Verificar todo está OK
npm run quick

# Tests básicos
npm run test:basic
```

### **2. Commit y Push a GitHub**
```bash
git add .
git commit -m "Fix dependencies sync for Railway deploy"
git push origin main
```

### **3. Deploy en Railway**
El deploy ahora debería funcionar automáticamente porque:
- ✅ `package-lock.json` está sincronizado
- ✅ Todas las dependencias son compatibles
- ✅ No hay vulnerabilidades

---

## 🔧 **Configuración de Railway**

### **Variables de Entorno Requeridas**
En Railway dashboard, configura:

```bash
NODE_ENV=production
JWT_SECRET=tu_secreto_aqui
DB_HOST=tu_host_mysql
DB_USER=tu_usuario
DB_PASSWORD=tu_password
DB_NAME=business_control
PORT=3000
```

### **Base de Datos**
Railway ofrece MySQL gratuito o puedes usar:
- Railway MySQL (recomendado)
- PlanetScale
- Supabase

---

## 📊 **Comandos de Deploy**

### **Build Command**
```bash
npm ci --production
```

### **Start Command**
```bash
npm start
```

---

## 🔍 **Verificación Post-Deploy**

### **1. Verificar Logs**
En Railway dashboard:
- Ve a "Logs" 
- Busca "Server running on port"

### **2. Testear Endpoint**
```bash
curl https://tu-app.railway.app/api/health
```

### **3. Verificar Tests**
```bash
# Si tienes acceso SSH al contenedor
npm run test:basic
```

---

## ⚠️ **Troubleshooting Común**

### **Error: "npm ci failed"**
```bash
# Localmente
rm package-lock.json
npm install
git add package-lock.json
git commit -m "Update lock file"
git push
```

### **Error: "Database connection failed"**
1. Verifica variables de entorno en Railway
2. Asegúrate que la BD está corriendo
3. Testea conexión manualmente

### **Error: "Port already in use"**
Railway asigna puerto automáticamente via `PORT` env var.

---

## 🎯 **Best Practices para Railway**

### **1. Archivo .railway**
```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "npm start"
healthcheckPath = "/api/health"
healthcheckTimeout = 100
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 10
```

### **2. Health Check Endpoint**
```javascript
// Agregar a server.js
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});
```

### **3. Environment-Specific Config**
```javascript
// server.js
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

if (NODE_ENV === 'production') {
  // Production specific settings
}
```

---

## 🚀 **Deploy Automatizado**

### **GitHub Actions (Opcional)**
```yaml
# .github/workflows/deploy.yml
name: Deploy to Railway

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to Railway
        uses: railway-app/railway-action@v1
        with:
          railway-token: ${{ secrets.RAILWAY_TOKEN }}
```

---

## 📈 **Monitorización**

### **Logs en Tiempo Real**
```bash
# CLI de Railway
railway logs

# O en web dashboard
```

### **Métricas**
- Railway Dashboard muestra:
  - CPU usage
  - Memory usage  
  - Network traffic
  - Error rates

---

## 🎉 **Resultado Esperado**

Después del deploy exitoso deberías ver:

1. ✅ **Build successful** en Railway
2. ✅ **App running** en URL asignada
3. ✅ **Health check passing**
4. ✅ **No errors en logs**

### **URL de tu App**
```
https://tu-app-name.up.railway.app
```

---

## 📞 **Soporte**

Si tienes problemas:

1. **Railway Docs**: docs.railway.app
2. **GitHub Issues**: Revisa este repo
3. **Logs**: Railway dashboard logs section

---

**🚀 Tu proyecto está listo para deploy en Railway!**
