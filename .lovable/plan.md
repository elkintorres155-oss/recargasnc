# Sistema de stock e inventario de cuentas de streaming

## Parte 1 — Análisis de tu proyecto actual

### 1. Productos
Tu catálogo NO vive en tablas: vive en un JSON dentro de la tabla `store_settings` (fila `default`), editable desde el panel admin. La estructura es Categoría → Producto → Paquetes (`Pack`), donde cada paquete tiene `label`, `price` (córdobas) y `sku` (código del proveedor FlashTopUp). El producto tiene `needsId` (pide ID de jugador) y `providerProductId`.

### 2. Órdenes
Tabla `orders`: guarda producto, paquete, SKU, ID de jugador, teléfono, monto, método de pago, y un `status` con estos estados: pendiente de pago, revisión de comprobante, pago rechazado, pago aprobado, procesando con proveedor, completada, fallida, reembolsada. Cada cambio de estado se registra solo en `order_status_history` por un disparador automático.

### 3. Cómo se confirma una compra
Todo pasa por `purchaseWithBalance` (función de servidor protegida):
1. Verifica saldo en la billetera interna.
2. Crea la orden.
3. Descuenta el saldo de forma atómica.
4. Marca la orden como "pago aprobado".
5. Despacha al proveedor FlashTopUp.
6. Si el proveedor falla → reembolso automático + orden "reembolsada".
7. Si va bien → orden "procesando" + factura por correo.

### 4. Dónde implementar la asignación automática
Exactamente en el paso 5, como una bifurcación: si el paquete comprado está marcado como "requiere stock", en lugar de llamar a FlashTopUp se llama al nuevo asignador de cuentas. Las recargas de juegos siguen el camino actual sin ningún cambio de comportamiento.

### 5. Tablas que ya existen
`profiles`, `user_roles`, `wallets`, `wallet_transactions`, `orders`, `order_status_history`, `payment_methods`, `payment_receipts`, `topup_requests`, `store_settings`, `webhook_events`.

### 6. Tablas nuevas necesarias
- **`stock_accounts`** — inventario: servicio, correo, contraseña, perfil, PIN, notas, vencimiento, estado (disponible / reservada / vendida / suspendida / vencida), orden asignada, cliente, fecha de entrega, fechas de creación y actualización.
- **`stock_movements`** — historial: cuenta, orden, cliente, acción, estado anterior, estado nuevo, administrador, fecha.
- Función de base de datos **`claim_stock_account(servicio, orden, cliente)`** que reserva y marca la cuenta en una sola operación bloqueante — así dos compras simultáneas nunca reciben la misma cuenta.

### 7. Qué se reutiliza
Autenticación y rol admin (`has_role`, `requireSupabaseAuth`, `use-is-admin`), billetera y reembolsos (`apply_wallet_transaction`), órdenes y su historial, el panel admin con sus pestañas, la página de producto y "Mis pedidos", y el envío de correo.

### 8. Telegram
Ya existe `telegram.server.ts` conectado por el conector de Lovable con `notifyAdminTelegram`, y el chat de administrador ya está en variable de entorno. Solo se agrega un mensaje nuevo con el formato de "cuenta entregada". El token nunca toca el frontend.

---

## Parte 2 — Plan de implementación

### A. Base de datos
- Crear `stock_accounts` y `stock_movements` con permisos y RLS: el cliente solo puede leer las cuentas asignadas a él y ya entregadas; los administradores administran todo; nadie puede leer el inventario disponible desde el navegador.
- Crear `claim_stock_account` (transaccional, `SECURITY DEFINER`) y disparadores de `updated_at` e historial automático.

### B. Producto con stock
En el panel admin, cada paquete gana dos campos opcionales: **Requiere stock (sí/no)** y **Servicio** (netflix, spotify, disney...). Si está en "no", nada cambia.

### C. Compra
En `purchase.functions.ts`, tras aprobar el pago:
- Requiere stock → reclamar cuenta → orden "completada" + datos de acceso al cliente + aviso a Telegram + correo.
- Sin stock → orden "pago aprobado" con nota "sin stock", aviso urgente al admin por Telegram, y el cliente ve "tu pedido está en proceso, te lo entregamos en breve" (con opción de reembolso desde el panel).

### D. Panel admin — pestaña "Stock de cuentas"
Resumen por servicio (disponibles / vendidas), lista con filtros por servicio y estado, alta individual, alta masiva pegando `correo:contraseña` por líneas, edición, cambio de estado, eliminación, y para cada cuenta vendida: orden, cliente y fecha de entrega. Más una vista del historial de movimientos.

### E. Entrega al cliente
Bloque de credenciales en la página de producto tras la compra y en "Mis pedidos", consultado siempre por función de servidor (nunca consulta directa a la base desde el navegador).

### F. Telegram
Mensaje privado al admin con producto, precio, orden, credenciales, cliente, teléfono y fecha.

### G. Verificación
Comprobar que las recargas FlashTopUp (Free Fire, Blood Strike) siguen funcionando igual, sin tocar `flashtopup.server.ts` ni `fulfillment.server.ts`.

---

Confirma y empiezo por la base de datos, luego el panel y por último la entrega al cliente.
