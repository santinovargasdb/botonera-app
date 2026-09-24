// == Botonera — lógica de la app ==
// Persistencia en IndexedDB: cada botón guarda { id, num, titulo, audio(Blob), imagen(Blob|null) }

"use strict";

// ---------- Constantes ----------

const COLORES_PADS = ["#ff6161", "#ff9f45", "#ffd93d", "#6bcb77", "#4d96ff", "#b983ff"];
const DB_NOMBRE = "botonera";
const DB_STORE = "botones";
const CLAVE_VOLUMEN = "botonera-volumen";

// ---------- IndexedDB ----------

function abrirDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOMBRE, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(DB_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbTodos() {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGuardar(boton) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(boton);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function dbBorrar(id) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Estado ----------

let botones = [];
let volumen = parseFloat(localStorage.getItem(CLAVE_VOLUMEN) ?? "0.8");
let modoEliminar = false;

const urlsAudio = new Map();   // id -> objectURL del audio
const urlsImagen = new Map();  // id -> objectURL de la imagen
const sonando = new Map();     // id -> Set<HTMLAudioElement>

// ---------- Elementos ----------

const $ = (sel) => document.querySelector(sel);

const grilla = $("#grilla");
const vacio = $("#vacio");
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

function urlAudio(boton) {
  if (!urlsAudio.has(boton.id)) urlsAudio.set(boton.id, URL.createObjectURL(boton.audio));
  return urlsAudio.get(boton.id);
}

function urlImagen(boton) {
  if (!boton.imagen) return null;
  if (!urlsImagen.has(boton.id)) urlsImagen.set(boton.id, URL.createObjectURL(boton.imagen));
  return urlsImagen.get(boton.id);
}

function render() {
  grilla.innerHTML = "";
  vacio.hidden = botones.length > 0;

  for (const boton of botones) {
    const pad = document.createElement("button");
    pad.className = "pad";
    pad.dataset.id = boton.id;
    const color = COLORES_PADS[(boton.num - 1) % COLORES_PADS.length];
    pad.style.setProperty("--pad-color", color);

    const cara = document.createElement("span");
    cara.className = "pad-cara";

    const imgUrl = urlImagen(boton);
    if (imgUrl) {
      pad.classList.add("con-imagen");
      const img = document.createElement("img");
      img.className = "pad-imagen";
      img.src = imgUrl;
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

// ---------- Reproducción ----------

function onClickPad(boton) {
  if (modoEliminar) {
    eliminarBoton(boton);
    return;
  }
  const audio = new Audio(urlAudio(boton));
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
  await dbBorrar(boton.id);
  // frenar sonidos activos de ese botón
  const set = sonando.get(boton.id);
  if (set) { for (const audio of set) audio.pause(); sonando.delete(boton.id); }
  if (urlsAudio.has(boton.id)) { URL.revokeObjectURL(urlsAudio.get(boton.id)); urlsAudio.delete(boton.id); }
  if (urlsImagen.has(boton.id)) { URL.revokeObjectURL(urlsImagen.get(boton.id)); urlsImagen.delete(boton.id); }
  botones = botones.filter((b) => b.id !== boton.id);
  render();
  if (botones.length === 0 && modoEliminar) btnEliminar.click(); // salir del modo si no queda nada
}

// ---------- Modal: estado del formulario ----------

let nuevoAudio = null;   // Blob elegido o grabado
let nuevaImagen = null;  // Blob de imagen
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
  setNuevoAudio(archivo);
});

function setNuevoAudio(blob) {
  nuevoAudio = blob;
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

  const num = proximoNum();
  const boton = {
    id: crypto.randomUUID(),
    num,
    titulo: inputTitulo.value.trim() || `Botón ${num}`,
    audio: nuevoAudio,
    imagen: nuevaImagen,
    creado: new Date().toISOString(),
  };

  await dbGuardar(boton);
  botones.push(boton);
  render();
  modal.close();
});

// ---------- Inicio ----------

(async function iniciar() {
  try {
    botones = (await dbTodos()).sort((a, b) => a.num - b.num);
  } catch (err) {
    console.error("No se pudo leer la base de datos:", err);
    botones = [];
  }
  render();
})();
