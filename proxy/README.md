# Relay de IP fija para FlashTopUp

FlashTopUp exige una IP en lista blanca. La app corre en infraestructura serverless
(IP variable), así que las llamadas se envían a este pequeño relay que sí tiene IP fija.

## 1. Conseguir un servidor con IP fija
- Oracle Cloud Free Tier (gratis para siempre) o cualquier VPS.
- Necesitas Node.js 18+ instalado: `sudo apt update && sudo apt install -y nodejs npm`

## 2. Subir y ejecutar el relay
```bash
scp proxy/relay.mjs usuario@TU_IP:/home/usuario/relay.mjs
ssh usuario@TU_IP
RELAY_SECRET="un-secreto-largo" node relay.mjs
```

Para que quede activo siempre:
```bash
sudo npm i -g pm2
RELAY_SECRET="un-secreto-largo" pm2 start relay.mjs --name relay
pm2 save && pm2 startup
```

Abre el puerto 8787 en el firewall del proveedor y en el servidor:
```bash
sudo iptables -I INPUT -p tcp --dport 8787 -j ACCEPT
```

## 3. Configurar en la app
Guarda estos secretos en el proyecto:
- `TOPUP_PROXY_URL` = `http://TU_IP:8787`
- `TOPUP_PROXY_SECRET` = el mismo `RELAY_SECRET`

## 4. Whitelist
Agrega la IP fija de ese servidor en el panel de FlashTopUp.
Prueba en Panel admin → Proveedor → Ver productos.
