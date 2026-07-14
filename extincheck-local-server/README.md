# ExtinCheck Local Server

Servidor autónomo para recibir inspecciones de Extintores dentro de una red local.
No importa archivos ni dependencias de la aplicación móvil, por lo que esta carpeta
puede moverse posteriormente a otro repositorio o computadora.

## Requisitos

- Node.js 22.5 o posterior.
- La computadora y el teléfono conectados a la misma red Wi-Fi.

## Instalación y arranque

```powershell
cd extincheck-local-server
Copy-Item .env.example .env
npm install
npm run dev
```

El servidor escucha en `0.0.0.0:3001`. La base se crea en
`data/extincheck-local.sqlite`.

## Red local

Ejecuta `ipconfig` y localiza la dirección IPv4 del adaptador Wi-Fi, por ejemplo
`192.168.1.50`. Desde el navegador del teléfono visita:

```text
http://192.168.1.50:3001/api/health
```

Si Windows pregunta por el firewall, permite Node.js solamente en redes privadas.
También puedes crear una regla de entrada TCP para el puerto 3001 limitada al
perfil Privado.

Desde PowerShell ejecutado como administrador:

```powershell
New-NetFirewallRule -DisplayName "ExtinCheck Local Server" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow -Profile Private
```

En la carpeta de la aplicación móvil configura una sola dirección en `.env.local`:

```text
EXPO_PUBLIC_LOCAL_SERVER_URL=http://IP_DE_LA_PC:3001
```

Después de cambiarla, reinicia Expo con `npx expo start --clear`.

Para compilar e iniciar sin el observador de desarrollo:

```powershell
npm run build
npm start
```

## Verificar datos

```powershell
npm run inspect
```

El comando muestra el total de inspecciones, extintores y las últimas inspecciones
recibidas sin modificar la base de datos.
