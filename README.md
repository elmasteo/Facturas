# Administrador de servicios públicos — 3 casas

Aplicación estática (HTML + CSS + JS puro). Sin backend ni dependencias; datos en `localStorage`.

## Probar localmente
Abre `index.html` en el navegador.

## Publicar en Netlify
1. Entra a https://app.netlify.com/drop
2. Arrastra la carpeta `servicios-casas` (con `index.html`, `styles.css`, `app.js`).
3. Netlify te entrega una URL pública. No requiere build ni configuración.

## Notas
- Basura se suma a luz y se reparte junto con ella (una sola vez).
- Reparto por personas dentro de cada casa; el residuo de redondeo se asigna para que la suma sea exacta.
- Se usa la cantidad de personas actual para todo el período (sin prorrateo por días).
- Los datos viven en el navegador y dispositivo donde se usan: exporta respaldos JSON con regularidad.
