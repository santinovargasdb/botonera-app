// == Botonesmata — lógica de la app ==
// Botonera compartida: los botones viven en Supabase (tabla `botones` +
// bucket `sonidos`). Todos los que abren la página ven la misma botonera.

"use strict";

// ---------- Constantes ----------

const COLORES_PADS = ["#ff6161", "#ff9f45", "#ffd93d", "#6bcb77", "#4d96ff", "#b983ff"];
const CLAVE_VOLUMEN = "botonera-volumen";
const BUCKET = "sonidos";

// ---------- Cliente Supabase ----------

const config = window.BOTONERA_CONFIG || {};
const configurada = config.SUPABASE_URL && !config.SUPABASE_URL.startsWith("PONER_");
const supa = configurada
  ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY)
  : null;

function urlPublica(path) {
  return supa.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function dbTodos() {
  const { data, error } = await supa
    .from("botones")
    .select("*")
    .order("num", { ascending: true })
    .order("creado", { ascending: true });
  if (error) throw error;
  return data;
}

// Sube audio (y opcionalmente imagen) al bucket y crea la fila del botón
async function dbGuardar({ num, titulo, audioBlob, nombreAudio, imagenBlob, nombreImagen }) {
  const id = crypto.randomUUID();

  const audioPath = `${id}/audio.${extension(audioBlob, nombreAudio)}`;
  const subida = await supa.storage.from(BUCKET).upload(audioPath, audioBlob, {
    contentType: audioBlob.type || "application/octet-stream",
  });
  if (subida.error) throw subida.error;

  let imagenPath = null;
  if (imagenBlob) {
    imagenPath = `${id}/imagen.${extension(imagenBlob, nombreImagen)}`;
    const subidaImg = await supa.storage.from(BUCKET).upload(imagenPath, imagenBlob, {
      contentType: imagenBlob.type || "application/octet-stream",
    });
    if (subidaImg.error) throw subidaImg.error;
  }

  const { data, error } = await supa
    .from("botones")
    .insert({ id, num, titulo, audio_path: audioPath, imagen_path: imagenPath })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function dbBorrar(boton) {
  const { error } = await supa.from("botones").delete().eq("id", boton.id);
  if (error) throw error;
  const paths = [boton.audio_path, boton.imagen_path].filter(Boolean);
  await supa.storage.from(BUCKET).remove(paths); // si falla queda un archivo huérfano, no rompe nada
}

function extension(blob, nombre) {
  const porNombre = nombre && nombre.includes(".") ? nombre.split(".").pop().toLowerCase() : null;
  if (porNombre && porNombre.length <= 5) return porNombre;
  const mime = (blob.type || "").split(";")[0];
  const mapa = {
    "audio/mpeg": "mp3", "audio/mp4": "mp4", "video/mp4": "mp4", "audio/aac": "aac",
    "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "ogg", "audio/webm": "webm",
    "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp",
  };
  return mapa[mime] || "bin";
}

// ---------- Estado ----------

let botones = [];
let volumen = parseFloat(localStorage.getItem(CLAVE_VOLUMEN) ?? "0.8");
let modoEliminar = false;

const sonando = new Map(); // id -> Set<HTMLAudioElement>

// ---------- Elementos ----------

const $ = (sel) => document.querySelector(sel);

const grilla = $("#grilla");
const vacio = $("#vacio");
const aviso = $("#aviso");
const sliderVolumen = $("#volumen");
const iconoVolumen = $("#volumen-icono");
const btnAgregar = $("#btn-agregar");
const btnEliminar = $("#btn-eliminar");

const modal = $("#modal");
const formBoton = $("#form-boton");
const tabSubir = $("#tab-subir");
const tabGrabar = $("#tab-grabar");
const panelSubir = $("#panel-subir");
const panelGrabar = $("#panel-grabar");
const inputAudio = $("#input-audio");
const btnGrabar = $("#btn-grabar");
const timer = $("#timer");
const errorMic = $("#error-mic");
const previewAudio = $("#preview-audio");
const audioPreview = $("#audio-preview");
const inputImagen = $("#input-imagen");
const previewImagen = $("#preview-imagen");
const btnQuitarImagen = $("#btn-quitar-imagen");
const inputTitulo = $("#input-titulo");
const btnCancelar = $("#btn-cancelar");
const btnConfirmar = $("#btn-confirmar");
const errorGuardar = $("#error-guardar");

// ---------- Volumen ----------

function aplicarVolumen(valor) {
  volumen = valor;
  localStorage.setItem(CLAVE_VOLUMEN, String(valor));
  iconoVolumen.textContent = valor === 0 ? "🔇" : valor < 0.5 ? "🔉" : "🔊";
  for (const set of sonando.values()) {
    for (const audio of set) audio.volume = valor;
  }
}

sliderVolumen.value = volumen;
aplicarVolumen(volumen);
sliderVolumen.addEventListener("input", () => aplicarVolumen(parseFloat(sliderVolumen.value)));

// ---------- Render de la grilla ----------

function render() {
  grilla.innerHTML = "";
  vacio.hidden = botones.length > 0 || !aviso.hidden;

  for (const boton of botones) {
    const pad = document.createElement("button");
    pad.className = "pad";
    pad.dataset.id = boton.id;
    const color = COLORES_PADS[(boton.num - 1) % COLORES_PADS.length];
    pad.style.setProperty("--pad-color", color);

    const cara = document.createElement("span");
    cara.className = "pad-cara";

    if (boton.imagen_path) {
      pad.classList.add("con-imagen");
      const img = document.createElement("img");
      img.className = "pad-imagen";
      img.src = urlPublica(boton.imagen_path);
      img.alt = "";
      cara.appendChild(img);
    } else {
      const num = document.createElement("span");
      num.className = "pad-num";
      num.textContent = boton.num;
      cara.appendChild(num);
    }

    const titulo = document.createElement("span");
    titulo.className = "pad-titulo";
    titulo.textContent = boton.titulo;
    cara.appendChild(titulo);

    const progreso = document.createElement("span");
    progreso.className = "pad-progreso";

    const equis = document.createElement("span");
    equis.className = "pad-x";
    equis.textContent = "✕";

    pad.append(cara, progreso, equis);
    pad.addEventListener("click", () => onClickPad(boton));
    grilla.appendChild(pad);
  }
}

function mostrarAviso(texto) {
  aviso.textContent = texto;
  aviso.hidden = !texto;
  if (texto) vacio.hidden = true;
}

// ---------- Reproducción ----------

function onClickPad(boton) {
  if (modoEliminar) {
    eliminarBoton(boton);
    return;
  }
  const audio = new Audio(urlPublica(boton.audio_path));
  audio.volume = volumen;

  if (!sonando.has(boton.id)) sonando.set(boton.id, new Set());
  const set = sonando.get(boton.id);
  set.add(audio);

  const limpiar = () => {
    set.delete(audio);
    if (set.size === 0) sonando.delete(boton.id);
    actualizarPad(boton.id);
  };
  audio.addEventListener("ended", limpiar);
  audio.addEventListener("error", limpiar);
  // timeupdate dispara ~4 veces por segundo incluso en pestañas en segundo plano
  audio.addEventListener("timeupdate", () => actualizarPad(boton.id));

  audio.play().catch(limpiar);
  actualizarPad(boton.id);
}

// Actualiza clase .sonando y barra de progreso del pad indicado
function actualizarPad(id) {
  const pad = grilla.querySelector(`[data-id="${id}"]`);
  if (!pad) return;
  const set = sonando.get(id);
  const barra = pad.querySelector(".pad-progreso");
  if (set && set.size > 0) {
    pad.classList.add("sonando");
    const audio = [...set].at(-1); // el último disparado marca el progreso
    const frac = audio.duration ? audio.currentTime / audio.duration : 0;
    barra.style.width = `${frac * 100}%`;
  } else {
    pad.classList.remove("sonando");
    barra.style.width = "0%";
  }
}

// ---------- Modo eliminar ----------

btnEliminar.addEventListener("click", () => {
  modoEliminar = !modoEliminar;
  document.body.classList.toggle("modo-eliminar", modoEliminar);
  btnEliminar.classList.toggle("activo", modoEliminar);
  btnEliminar.textContent = modoEliminar ? "Listo" : "Eliminar";
});

async function eliminarBoton(boton) {
  // frenar sonidos activos de ese botón
  const set = sonando.get(boton.id);
  if (set) { for (const audio of set) audio.pause(); sonando.delete(boton.id); }
  botones = botones.filter((b) => b.id !== boton.id);
  render();
  try {
    await dbBorrar(boton);
  } catch (err) {
    console.error("No se pudo borrar el botón:", err);
    mostrarAviso("No se pudo borrar el botón. Revisá la conexión y recargá la página.");
  }
  if (botones.length === 0 && modoEliminar) btnEliminar.click(); // salir del modo si no queda nada
}

// ---------- Modal: estado del formulario ----------

let nuevoAudio = null;        // Blob elegido o grabado
let nombreNuevoAudio = null;  // nombre original del archivo (si vino de archivo)
let nuevaImagen = null;       // Blob de imagen
let urlPreviewAudio = null;
let urlPreviewImagen = null;

function proximoNum() {
  return botones.reduce((max, b) => Math.max(max, b.num), 0) + 1;
}

function abrirModal() {
  resetearModal();
  inputTitulo.placeholder = `Botón ${proximoNum()}`;
  modal.showModal();
}

function resetearModal() {
  nuevoAudio = null;
  nombreNuevoAudio = null;
  nuevaImagen = null;
  if (urlPreviewAudio) { URL.revokeObjectURL(urlPreviewAudio); urlPreviewAudio = null; }
  if (urlPreviewImagen) { URL.revokeObjectURL(urlPreviewImagen); urlPreviewImagen = null; }
  formBoton.reset();
  previewAudio.hidden = true;
  audioPreview.removeAttribute("src");
  previewImagen.hidden = true;
  previewImagen.removeAttribute("src");
  btnQuitarImagen.hidden = true;
  btnConfirmar.disabled = true;
  btnConfirmar.textContent = "Agregar botón";
  errorGuardar.hidden = true;
  errorMic.hidden = true;
  timer.hidden = true;
  detenerGrabacion(true);
  cambiarTab("subir");
}

btnAgregar.addEventListener("click", abrirModal);
btnCancelar.addEventListener("click", () => modal.close());
modal.addEventListener("close", () => detenerGrabacion(true));

// ---------- Modal: tabs ----------

function cambiarTab(cual) {
  tabSubir.classList.toggle("activa", cual === "subir");
  tabGrabar.classList.toggle("activa", cual === "grabar");
  panelSubir.hidden = cual !== "subir";
  panelGrabar.hidden = cual !== "grabar";
}

tabSubir.addEventListener("click", () => cambiarTab("subir"));
tabGrabar.addEventListener("click", () => cambiarTab("grabar"));

// ---------- Modal: audio por archivo ----------

inputAudio.addEventListener("change", () => {
  const archivo = inputAudio.files[0];
  if (!archivo) return;
  setNuevoAudio(archivo, archivo.name);
});

function setNuevoAudio(blob, nombre = null) {
  nuevoAudio = blob;
  nombreNuevoAudio = nombre;
  if (urlPreviewAudio) URL.revokeObjectURL(urlPreviewAudio);
  urlPreviewAudio = URL.createObjectURL(blob);
  audioPreview.src = urlPreviewAudio;
  previewAudio.hidden = false;
  btnConfirmar.disabled = false;
}

// ---------- Modal: grabación ----------

let mediaRecorder = null;
let streamMic = null;
let chunks = [];
let intervaloTimer = null;

btnGrabar.addEventListener("click", async () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    detenerGrabacion();
    return;
  }
  errorMic.hidden = true;
  try {
    streamMic = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    errorMic.textContent = "No se pudo acceder al micrófono. Revisá los permisos del navegador.";
    errorMic.hidden = false;
    return;
  }
  chunks = [];
  const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
  mediaRecorder = mime ? new MediaRecorder(streamMic, { mimeType: mime }) : new MediaRecorder(streamMic);
  mediaRecorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  mediaRecorder.onstop = () => {
    if (chunks.length) setNuevoAudio(new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" }));
  };
  mediaRecorder.start();

  btnGrabar.textContent = "■ Detener";
  btnGrabar.classList.add("grabando");
  timer.hidden = false;
  const inicio = Date.now();
  intervaloTimer = setInterval(() => {
    const seg = Math.floor((Date.now() - inicio) / 1000);
    timer.textContent = `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`;
  }, 250);
  timer.textContent = "0:00";
});

function detenerGrabacion(descartar = false) {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    if (descartar) mediaRecorder.onstop = null;
    mediaRecorder.stop();
  }
  if (streamMic) {
    for (const pista of streamMic.getTracks()) pista.stop();
    streamMic = null;
  }
  mediaRecorder = null;
  clearInterval(intervaloTimer);
  btnGrabar.textContent = "● Grabar";
  btnGrabar.classList.remove("grabando");
  timer.hidden = true;
}

// ---------- Modal: imagen ----------

inputImagen.addEventListener("change", () => {
  const archivo = inputImagen.files[0];
  if (!archivo) return;
  nuevaImagen = archivo;
  if (urlPreviewImagen) URL.revokeObjectURL(urlPreviewImagen);
  urlPreviewImagen = URL.createObjectURL(archivo);
  previewImagen.src = urlPreviewImagen;
  previewImagen.hidden = false;
  btnQuitarImagen.hidden = false;
});

btnQuitarImagen.addEventListener("click", () => {
  nuevaImagen = null;
  inputImagen.value = "";
  if (urlPreviewImagen) { URL.revokeObjectURL(urlPreviewImagen); urlPreviewImagen = null; }
  previewImagen.hidden = true;
  previewImagen.removeAttribute("src");
  btnQuitarImagen.hidden = true;
});

// ---------- Modal: confirmar ----------

formBoton.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!nuevoAudio) return;

  btnConfirmar.disabled = true;
  btnConfirmar.textContent = "Guardando…";
  errorGuardar.hidden = true;

  const num = proximoNum();
  try {
    const boton = await dbGuardar({
      num,
      titulo: inputTitulo.value.trim() || `Botón ${num}`,
      audioBlob: nuevoAudio,
      nombreAudio: nombreNuevoAudio,
      imagenBlob: nuevaImagen,
      nombreImagen: nuevaImagen ? nuevaImagen.name : null,
    });
    botones.push(boton);
    render();
    modal.close();
  } catch (err) {
    console.error("No se pudo guardar el botón:", err);
    errorGuardar.textContent = "No se pudo guardar. Revisá la conexión e intentá de nuevo.";
    errorGuardar.hidden = false;
    btnConfirmar.disabled = false;
    btnConfirmar.textContent = "Agregar botón";
  }
});

// ---------- Carga y sincronización ----------

async function cargarBotones() {
  try {
    botones = await dbTodos();
    mostrarAviso("");
    render();
  } catch (err) {
    console.error("No se pudo cargar la botonera:", err);
    mostrarAviso("No se pudo cargar la botonera. Revisá la conexión a internet y recargá la página.");
  }
}

(function iniciar() {
  if (!configurada) {
    mostrarAviso("Falta configurar Supabase: completá config.js con la URL y la anon key del proyecto.");
    btnAgregar.disabled = true;
    btnEliminar.disabled = true;
    return;
  }
  cargarBotones();
  // al volver a la pestaña, refrescar por si alguien más agregó o borró botones
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) cargarBotones();
  });
})();
