# Acceso remoto protegido para Three_Slicer

Este documento describe la configuración prevista para `https://webslicer.gg0099.top`.
**No afirma que el túnel, DNS o la aplicación Cloudflare Access ya estén configurados.**

## Configurar Cloudflare

1. Usa un túnel dedicado a WebSlicer; no cambies las rutas del túnel de Immich.
2. Añade una ruta de aplicación publicada para `webslicer.gg0099.top` hacia
   `http://127.0.0.1:8765`. Conserva el `Host` público y no reescribas `Host` u
   `Origin` a `127.0.0.1`.
3. Crea una aplicación self-hosted de Access para el hostname completo, sin
   excepciones por ruta. Permite solo el email del usuario autorizado y no
   añadas políticas `Bypass`.
4. Comprueba que no hay otro hostname, listener o ruta pública que permita
   evitar Access. El bridge debe seguir enlazado exclusivamente a loopback.

Si automatizas la configuración por API, usa un token dedicado y limitado a los
recursos necesarios: `Cloudflare Tunnel Write` y `Access: Apps and Policies
Write` en la cuenta correspondiente, y `DNS Write` solo en la zona `gg0099.top`.
No uses un token de cuenta completa ni guardes el token en el repositorio.
Revoca cualquier token que se haya compartido en chat antes de crear uno nuevo.

## Iniciar el bridge en modo Access

Entrega estas variables al proceso mediante el gestor de servicios local; no las
guardes en el código ni en este documento:

```sh
CF_ACCESS_TEAM_DOMAIN=<equipo>.cloudflareaccess.com
CF_ACCESS_AUD=<AUD de la aplicación Access>
CF_ACCESS_EMAIL=<email exacto permitido>
CF_ACCESS_PUBLIC_ORIGIN=https://webslicer.gg0099.top
```

Después de construir la UI (`cd web && npm ci && npm run build`) inicia:

```sh
ffadv4manager slicer --require-access
```

El proceso se niega a iniciar si falta cualquier valor o si la configuración es
parcial, y conserva el listener en `127.0.0.1:8765`. En modo Access no abre la
URL local: abre `https://webslicer.gg0099.top` en un navegador autorizado. El
bridge valida la aserción JWT de Cloudflare en las solicitudes públicas de la UI
y de `/api/print`; para la API también valida el `Host`, `Origin` y el token
efímero de la instancia.

## Verificación y límites

- Sin sesión de Access, la UI y `/api/print` deben ser denegados en el borde;
  la validación del JWT en el origen añade una segunda comprobación.
- Valida el flujo con solicitudes no mutantes y logs del túnel/origen. Las pruebas
  automatizadas usan callbacks simulados; no envíes G-code de prueba ni una orden
  real de impresión para comprobar el acceso.
- Una persona autenticada puede subir G-code y solicitar el inicio de una
  impresión. Access limita quién llega al sitio, pero no vuelve inocua una sesión
  autorizada comprometida. Supervisa las primeras operaciones y conserva el
  control local de la impresora.
- La confirmación HTTP solo demuestra que el bridge aceptó el comando; no prueba
  que el archivo se guardara correctamente ni que la impresora comenzara a
  imprimir físicamente.
