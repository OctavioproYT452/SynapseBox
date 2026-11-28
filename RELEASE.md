# Versión 2.27.0

Funciones pensadas para organizaciones (todas opcionales y desactivadas por defecto; panel **Admin → Empresa**):

- **Lista de IPs para administrar:** limita `/admin` y `/api/admin/*` a IPs o rangos CIDR. Impide guardar una lista que te deje fuera.
- **Contraseñas complejas:** mayúscula, minúscula, número y símbolo en contraseñas nuevas.
- **Webhook firmado (HMAC-SHA256):** eventos `admin.action` y `user.registered` a una URL https, con protección anti-SSRF y botón de prueba.
- **Cumplimiento:** resumen de 2FA, administradores sin 2FA, usuarios inactivos y cuotas casi llenas.
- **Exportes CSV:** usuarios y auditoría (compatibles con Excel).
- **Métricas Prometheus:** `GET /metrics` con `METRICS_TOKEN`.
- El registro de auditoría sigue siendo desactivable.
- **README:** nueva sección «Funciones para empresas» y APIs en la tabla.
