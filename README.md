# Botonesmata 📢

Botonera de sonidos para factor cómico. Tocás un botón y suena.
      
## Cómo usarla

Abrí `index.html` en el navegador y listo. No necesita servidor ni instalación.

> Para **grabar audio con el micrófono**, algunos navegadores piden que la página
> esté servida por HTTP. Si la grabación no funciona abriendo el archivo directo,
> levantá un servidor local con `python -m http.server` (o `npx serve`) y entrá
> a `http://localhost:8000`.

## Qué hace

- **Panel superior**: volumen general, agregar sonido y modo eliminar.
- **Agregar sonido**: subís un archivo de audio (MP3, MP4, M4A, WAV, OGG…) o grabás
  con el micrófono en el momento. Imagen y título opcionales — si no ponés,
  el botón queda numerado como "Botón 1, 2, 3…".
- **Eliminar**: activás el modo, los botones tiemblan con una ✕, tocás el que
  querés borrar y después "Listo".
- Los sonidos se pueden superponer si apretás varios botones seguidos.
- Todo se guarda en el navegador (IndexedDB): los botones sobreviven al cerrar
  y volver a abrir la página.

## Archivos

| Archivo | Qué es |
| --- | --- |
| `index.html` | Estructura de la página y el modal |
| `styles.css` | Estilos (pads tipo sampler, modo eliminar, modal) |
| `app.js` | Lógica: IndexedDB, reproducción, grabación, volumen |
     
adasd
