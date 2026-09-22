/* ============================================================
   WORK SPACE — Panel del Board
   App estática que lee y escribe una planilla de Google Sheets
   a través de una Aplicación web de Apps Script.
   ============================================================ */

/* ---------------- CONFIGURACIÓN ---------------- */
// Pegá acá la URL que te da Apps Script al implementar la Aplicación web
// (Implementar → Nueva implementación → Aplicación web). Termina en /exec.
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbwDhuovTaeME4t3MyFsi-cJeSHZ__xxjrG8FmkXUz0nl3akiUxbhoOjQcsmDzAt3k35qw/exec";

// Credenciales de acceso al panel.
// ATENCIÓN: es una validación a nivel de interfaz (app estática). Las
// credenciales quedan visibles en el código cliente; para una barrera real
// hay que validar también del lado de Apps Script (ver REMAINING ISSUES).
const CREDENCIALES = { usuario: "boardalumni", password: "board" };
const AUTH_SESION = "ws_auth";

/* ---------------- CONSTANTES ---------------- */
const CANDIDATO_ESTADOS = ["Pendiente", "Contactado", "Entrevista", "Seleccionado", "Descartado"];

// Mapeo de estados de oferta → clase CSS del tag (cualquier estado no
// listado cae en "pendiente" sin romper el render).
const ESTADO_OFERTA_CLASE = {
  "Aprobada": "aprobada",
  "Pendiente": "pendiente",
  "Cerrada": "cerrada",
  "Rechazada / Requiere ajustes": "rechazada",
};

/* ---------------- ESTADO GLOBAL ---------------- */
let OFERTAS = [];
let CANDIDATOS = {};
let CATALOGO_OFERTAS = [];
let CATALOGO_ALUMNI = [];
let datosCargados = false;
let cargaFallida = false;
let activeOfferId = null;
let selectedForCompare = new Set();
let activeOfertaCatId = null;
let activeAlumniCatId = null;
let usuarioActual = "";

/* ============================================================
   HELPERS DE SEGURIDAD Y UTILIDAD
   Toda la data viene de una planilla editable: se escapa SIEMPRE
   antes de inyectarla en HTML y se validan los protocolos de los
   enlaces (solo http/https/mailto).
   ============================================================ */

function esc(valor) {
  return String(valor ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));
}

function safeStr(valor, porDefecto = "") {
  return (valor === null || valor === undefined || valor === "") ? porDefecto : String(valor);
}

function safeArr(valor) {
  return Array.isArray(valor) ? valor : [];
}

function safeNum(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

function isTrue(valor) {
  return valor === true || valor === 1 || valor === "1" ||
    String(valor).toLowerCase() === "true" ||
    String(valor).toLowerCase() === "sí" ||
    String(valor).toLowerCase() === "si";
}

/** Permite enlaces solo con protocolo http/https (bloquea javascript:, data:, etc). */
function safeUrl(valor) {
  const s = safeStr(valor).trim();
  return /^https?:\/\//i.test(s) ? s : "";
}

function safeEmail(valor) {
  const s = safeStr(valor).trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : "";
}

function initials(nombre) {
  return safeStr(nombre, "?")
    .split(" ").filter(Boolean)
    .map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
}

function debounce(fn, ms = 150) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/* ============================================================
   NORMALIZACIÓN DE DATOS
   Garantiza la forma mínima esperada por cada vista aunque la
   planilla llegue con celdas vacías o formatos inconsistentes.
   ============================================================ */

function normalizarBlandas(valor) {
  if (!valor || typeof valor !== "object") return {};
  const out = {};
  Object.keys(valor).forEach((k) => { out[String(k)] = safeNum(valor[k]); });
  return out;
}

function normalizarCandidato(c) {
  return {
    id: safeStr(c.id),
    matchId: safeStr(c.matchId),
    nombre: safeStr(c.nombre, "Sin nombre"),
    rol: safeStr(c.rol),
    tecnicas: safeArr(c.tecnicas).map((t) => safeStr(t)),
    match: safeNum(c.match),
    estado: safeStr(c.estado, "Pendiente"),
    experienciaOk: isTrue(c.experienciaOk),
    formacionOk: isTrue(c.formacionOk),
    blandas: normalizarBlandas(c.blandas),
    faltantes: safeArr(c.faltantes).map((f) => safeStr(f)),
    cv: safeStr(c.cv),
  };
}

function normalizarOferta(o) {
  return {
    id: safeStr(o.id),
    titulo: safeStr(o.titulo, "Oferta sin título"),
    empresa: safeStr(o.empresa),
    ubicacion: safeStr(o.ubicacion),
    estado: safeStr(o.estado, "Pendiente"),
    modalidad: safeStr(o.modalidad),
    jornada: safeStr(o.jornada),
    tecnicas: safeArr(o.tecnicas).map((t) => safeStr(t)),
  };
}

function normalizarOfertaCatalogo(o) {
  const emp = (o.empresaInfo && typeof o.empresaInfo === "object") ? o.empresaInfo : {};
  return {
    id: safeStr(o.id),
    titulo: safeStr(o.titulo, "Oferta sin título"),
    empresa: safeStr(o.empresa),
    ubicacion: safeStr(o.ubicacion),
    estado: safeStr(o.estado, "Pendiente"),
    modalidad: safeStr(o.modalidad),
    jornada: safeStr(o.jornada),
    descripcion: safeStr(o.descripcion),
    tecnicas: safeArr(o.tecnicas).map((t) => safeStr(t)),
    blandas: safeArr(o.blandas).map((b) => safeStr(b)),
    experiencia: safeStr(o.experiencia),
    formacion: safeStr(o.formacion),
    otros: safeArr(o.otros).map((x) => safeStr(x)),
    fechaPublicacion: safeStr(o.fechaPublicacion),
    fechaCierre: safeStr(o.fechaCierre),
    empresaInfo: {
      nombre: safeStr(emp.nombre),
      sector: safeStr(emp.sector),
      tamano: safeStr(emp.tamano),
      departamento: safeStr(emp.departamento),
      contacto: safeStr(emp.contacto),
      email: safeStr(emp.email),
      telefono: safeStr(emp.telefono),
    },
  };
}

function normalizarAlumni(a) {
  return {
    id: safeStr(a.id),
    nombre: safeStr(a.nombre, "Sin nombre"),
    carrera: safeStr(a.carrera),
    institucion: safeStr(a.institucion),
    email: safeStr(a.email),
    telefono: safeStr(a.telefono),
    linkedin: safeStr(a.linkedin),
    departamento: safeStr(a.departamento),
    edad: (a.edad === null || a.edad === undefined || a.edad === "") ? null : a.edad,
    programa: safeStr(a.programa),
    anioParticipacion: safeStr(a.anioParticipacion),
    otrosProgramas: safeStr(a.otrosProgramas),
    estadoCarrera: safeStr(a.estadoCarrera),
    cursos: safeStr(a.cursos),
    tecnicas: safeArr(a.tecnicas).map((t) => safeStr(t)),
    disponibilidad: safeStr(a.disponibilidad),
    modalidad: safeStr(a.modalidad),
    experiencia: safeStr(a.experiencia),
    blandas: normalizarBlandas(a.blandas),
    cv: safeStr(a.cv),
  };
}

function normalizarDatos(datos) {
  const src = datos || {};
  const candidatos = {};
  if (src.candidatos && typeof src.candidatos === "object" && !Array.isArray(src.candidatos)) {
    Object.keys(src.candidatos).forEach((id) => {
      candidatos[id] = safeArr(src.candidatos[id]).map(normalizarCandidato);
    });
  }
  return {
    ofertas: safeArr(src.ofertas).map(normalizarOferta),
    candidatos,
    catalogoOfertas: safeArr(src.catalogoOfertas).map(normalizarOfertaCatalogo),
    catalogoAlumni: safeArr(src.catalogoAlumni).map(normalizarAlumni),
  };
}

/* ============================================================
   CONEXIÓN CON GOOGLE SHEETS
   ============================================================ */

async function cargarDatos() {
  datosCargados = false;
  cargaFallida = false;
  mostrarEstado("Conectando con la planilla…");
  renderCatalogoOfertas();
  renderCatalogoAlumni();
  try {
    const resp = await fetch(WEBAPP_URL + (WEBAPP_URL.includes("?") ? "&" : "?") + "t=" + Date.now());
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const datos = await resp.json();
    const norm = normalizarDatos(datos);
    OFERTAS = norm.ofertas;
    CANDIDATOS = norm.candidatos;
    CATALOGO_OFERTAS = norm.catalogoOfertas;
    CATALOGO_ALUMNI = norm.catalogoAlumni;
    datosCargados = true;
    renderOffers();
    updateTopStats();
    if (OFERTAS.length) {
      selectOffer(OFERTAS[0].id);
    } else {
      mostrarEstado("Todavía no hay ofertas cargadas en la planilla.");
    }
    renderCatalogoOfertas();
    renderCatalogoAlumni();
    renderHome();
  } catch (err) {
    console.error("Error cargando datos de la planilla:", err);
    cargaFallida = true;
    mostrarEstadoError();
    renderCatalogoOfertas();
    renderCatalogoAlumni();
    renderHome();
  }
}

/** Muestra un mensaje informativo en el ranking (carga, vacío, etc). */
function mostrarEstado(mensaje) {
  document.getElementById("rankingBody").innerHTML = `<div class="empty-state">${esc(mensaje)}</div>`;
}

function mostrarEstadoError() {
  document.getElementById("rankingBody").innerHTML = `
    <div class="empty-state">
      <div class="big">No se pudo conectar con la planilla</div>
      Revisá que WEBAPP_URL en script.js sea la URL correcta de tu Aplicación web
      (Apps Script → Implementar → Administrar implementaciones) y que el acceso
      esté configurado como "Cualquier usuario".
      <div style="margin-top:14px;">
        <button class="btn btn-primary" data-action="retry">Reintentar</button>
      </div>
    </div>`;
}

/** Avisa a la planilla que cambió el estado de un candidato (sin bloquear la UI). */
async function guardarEstadoEnPlanilla(matchId, estado) {
  if (!matchId) return;
  try {
    await fetch(WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // evita el preflight de CORS
      body: JSON.stringify({ action: "actualizarEstado", matchId, estado }),
    });
  } catch (err) {
    console.error("No se pudo guardar el estado en la planilla:", err);
  }
}

/* ============================================================
   RENDER: LISTA DE OFERTAS (matching)
   ============================================================ */

function renderOffers(filterText = "") {
  const list = document.getElementById("offersList");
  list.innerHTML = "";
  const q = filterText.toLowerCase();
  const visibles = OFERTAS.filter((o) =>
    (safeStr(o.titulo) + " " + safeStr(o.empresa) + " " + safeStr(o.ubicacion)).toLowerCase().includes(q)
  );

  visibles.forEach((o) => {
    const n = (CANDIDATOS[o.id] || []).length;
    const div = document.createElement("div");
    div.className = "offer-card" + (o.id === activeOfferId ? " active" : "");
    div.innerHTML = `
      <p class="offer-title">${esc(o.titulo)}</p>
      <p class="offer-company">${esc(o.empresa)} · ${esc(o.ubicacion || "sin ubicación")}</p>
      <div class="offer-meta">
        ${tagOferta(o.estado)}
        ${tagSi(o.modalidad)}
        ${tagSi(o.jornada)}
      </div>
      <div class="offer-count">${n} candidatos rankeados</div>
    `;
    div.onclick = () => selectOffer(o.id);
    list.appendChild(div);
  });
}

/** Devuelve el tag HTML del estado de una oferta (color según mapeo). */
function tagOferta(estado) {
  const clase = ESTADO_OFERTA_CLASE[safeStr(estado)] || "pendiente";
  return `<span class="tag status-${clase}">${esc(estado || "Pendiente")}</span>`;
}

/** Devuelve un tag genérico si el valor existe (modalidad, jornada…). */
function tagSi(valor) {
  return valor ? `<span class="tag">${esc(valor)}</span>` : "";
}

function selectOffer(id) {
  activeOfferId = id;
  selectedForCompare.clear();
  document.getElementById("compareBody").style.display = "none";
  document.getElementById("rankingBody").style.display = "block";
  document.getElementById("btnBackToRanking").style.display = "none";
  renderOffers(document.getElementById("offerSearch").value);
  renderRanking();
  renderDetail(null);
}

/* ============================================================
   RENDER: RANKING DE CANDIDATOS
   ============================================================ */

function renderRanking() {
  const offer = OFERTAS.find((o) => o.id === activeOfferId);
  const body = document.getElementById("rankingBody");
  if (!offer) {
    document.getElementById("offerTitle").textContent = "—";
    document.getElementById("offerSubtitle").textContent = "Seleccioná una oferta para ver el ranking de candidatos.";
    body.innerHTML = `<div class="empty-state"><div class="big">No hay ninguna oferta seleccionada</div>Elegí una de la columna izquierda.</div>`;
    return;
  }
  document.getElementById("offerTitle").textContent = offer.titulo;
  document.getElementById("offerSubtitle").textContent =
    [offer.empresa, offer.ubicacion, offer.modalidad, offer.jornada].filter(Boolean).join(" · ");

  const minMatch = parseInt(document.getElementById("minMatch").value, 10);
  const stateFilter = document.getElementById("stateFilter").value;

  let cands = (CANDIDATOS[offer.id] || []).slice().sort((a, b) => b.match - a.match);
  cands = cands.filter((c) => c.match >= minMatch && (stateFilter === "todos" || c.estado === stateFilter));

  body.innerHTML = "";
  if (cands.length === 0) {
    body.innerHTML = `<div class="empty-state">Ningún candidato cumple los filtros actuales.</div>`;
    return;
  }

  cands.forEach((c, i) => {
    const row = document.createElement("div");
    row.className = "candidate-row";
    row.innerHTML = `
      <input type="checkbox" ${selectedForCompare.has(c.id) ? "checked" : ""} data-cid="${esc(c.id)}" class="cmp-check" aria-label="Comparar a ${esc(c.nombre)}">
      <div class="avatar">${initials(c.nombre)}</div>
      <div>
        <p class="cand-name">#${i + 1} ${esc(c.nombre)}</p>
        <p class="cand-role">${esc(c.rol || "")}</p>
      </div>
      <div class="cand-tags">${c.tecnicas.slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
      <div class="match-wrap">
        <span class="match-score">${c.match}%</span>
      </div>
      <select class="status-select" data-cid="${esc(c.id)}" aria-label="Estado de ${esc(c.nombre)}">
        ${CANDIDATO_ESTADOS.map((s) => `<option ${s === c.estado ? "selected" : ""}>${esc(s)}</option>`).join("")}
      </select>
      <span style="text-align:center; color:var(--ink-soft);" aria-hidden="true">›</span>
    `;
    row.addEventListener("click", (e) => {
      if (e.target.classList.contains("cmp-check") || e.target.classList.contains("status-select")) return;
      renderDetail(c, offer);
      document.getElementById("detailCol").classList.add("open");
    });
    row.querySelector(".cmp-check").addEventListener("change", (e) => {
      if (e.target.checked) selectedForCompare.add(c.id); else selectedForCompare.delete(c.id);
      updateCompareBar();
    });
    row.querySelector(".status-select").addEventListener("change", (e) => {
      c.estado = e.target.value;
      updateTopStats();
      guardarEstadoEnPlanilla(c.matchId, c.estado);
    });
    body.appendChild(row);
  });
  updateCompareBar();
}

function updateCompareBar() {
  const n = selectedForCompare.size;
  document.getElementById("compareCount").textContent = n + " seleccionados";
  document.getElementById("btnCompare").disabled = n < 2;
}

/* ---------------- RADAR (SVG puro) ---------------- */
function renderRadar(dataObj, size = 190) {
  const keys = Object.keys(dataObj || {});
  if (keys.length < 3) {
    return `<p style="font-size:12px; color:var(--ink-soft); text-align:center;">Todavía no hay suficientes habilidades blandas evaluadas para este Alumni.</p>`;
  }
  const n = keys.length;
  const cx = size / 2, cy = size / 2, R = size / 2 - 34;
  const angle = (i) => (Math.PI * 2 * i / n) - Math.PI / 2;
  const pt = (i, val) => {
    const r = (val / 10) * R;
    return [cx + r * Math.cos(angle(i)), cy + r * Math.sin(angle(i))];
  };
  let rings = "";
  [2, 4, 6, 8, 10].forEach((v) => {
    const pts = keys.map((k, i) => pt(i, v).join(",")).join(" ");
    rings += `<polygon points="${pts}" fill="none" stroke="#dfe6e9" stroke-width="1"/>`;
  });
  let axes = "";
  keys.forEach((k, i) => {
    const [x, y] = pt(i, 10);
    axes += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#dfe6e9" stroke-width="1"/>`;
  });

  const dataPts = keys.map((k, i) => pt(i, dataObj[k]).join(",")).join(" ");
  let labels = "";
  keys.forEach((k, i) => {
    const [x, y] = pt(i, 12.6);
    labels += `<text x="${x}" y="${y}" font-size="9.5" font-family="Poppins" fill="#7b8a97" text-anchor="middle" dominant-baseline="middle">${esc(k)}</text>`;
  });
  let dots = "";
  keys.forEach((k, i) => {
    const [x, y] = pt(i, dataObj[k]);
    dots += `<circle class="radar-dot" cx="${x}" cy="${y}" r="3" fill="#163E63" style="transform-origin:${x}px ${y}px; animation-delay:${(i * 0.18).toFixed(2)}s;"/>`;
  });
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="overflow:visible;">
    ${rings}${axes}
    <polygon class="radar-fill" points="${dataPts}" fill="#71B52B" stroke="#163E63" stroke-width="1.5"/>
    ${dots}${labels}
  </svg>`;
}

/* ---------------- RENDER: DETALLE DE CANDIDATO ---------------- */

function enlaceCV(url, texto, sinCv) {
  const link = safeUrl(url);
  if (link) {
    return `<a class="cv-link" href="${esc(link)}" target="_blank" rel="noopener">📄 ${esc(texto)}</a>`;
  }
  return `<p style="font-size:12.5px; color:var(--ink-soft);">${esc(sinCv)}</p>`;
}

function setStatus(cid, estado) {
  const offer = OFERTAS.find((o) => o.id === activeOfferId);
  const cand = (CANDIDATOS[offer.id] || []).find((c) => c.id === cid);
  if (cand) {
    cand.estado = estado;
    renderRanking();
    renderDetail(cand, offer);
    updateTopStats();
    guardarEstadoEnPlanilla(cand.matchId, estado);
  }
}

function renderDetail(c, offer) {
  const el = document.getElementById("detailInner");
  if (!c) {
    el.innerHTML = `<div class="detail-empty">Elegí un candidato del ranking para ver el detalle del matching, el CV y las habilidades blandas certificadas.</div>`;
    return;
  }
  const tecOk = safeArr(offer.tecnicas).filter((t) => c.tecnicas.includes(t));
  const tecFalt = safeArr(offer.tecnicas).filter((t) => !c.tecnicas.includes(t));

  el.innerHTML = `
    <span class="detail-close" data-action="closeDetail">✕ Cerrar</span>
    <div class="cand-header">
      <div class="avatar">${initials(c.nombre)}</div>
      <div>
        <h3>${esc(c.nombre)}</h3>
        <p>${esc(c.rol || "")}</p>
      </div>
      <div class="score-ring">
        <span class="num">${c.match}%</span>
        <span class="lbl">match</span>
      </div>
    </div>

    <div class="block-title">Habilidades técnicas</div>
    ${tecOk.map((t) => `<div class="match-line"><span><span class="dot ok"></span>${esc(t)}</span><span>Coincide</span></div>`).join("")}
    ${tecFalt.map((t) => `<div class="match-line"><span><span class="dot bad"></span>${esc(t)}</span><span>No informado</span></div>`).join("")}
    ${(!tecOk.length && !tecFalt.length) ? `<p style="font-size:12.5px; color:var(--ink-soft);">Esta oferta no tiene habilidades técnicas cargadas todavía.</p>` : ""}

    <div class="block-title">Experiencia y formación</div>
    <div class="match-line"><span><span class="dot ${c.experienciaOk ? "ok" : "bad"}"></span>Experiencia requerida</span><span>${c.experienciaOk ? "Coincide" : "No coincide"}</span></div>
    <div class="match-line"><span><span class="dot ${c.formacionOk ? "ok" : "bad"}"></span>Formación requerida</span><span>${c.formacionOk ? "Coincide" : "No coincide"}</span></div>

    <div class="block-title">Habilidades blandas certificadas (DESEM)</div>
    <div class="radar-wrap">${renderRadar(c.blandas)}</div>

    ${c.faltantes.length ? `
    <div class="block-title">Brechas frente a la oferta</div>
    <div class="missing-box">${esc(c.faltantes.join(" · "))}</div>` : ""}

    <div class="block-title">CV y contacto</div>
    ${enlaceCV(c.cv, "Ver currículum adjunto", "Este Alumni todavía no cargó un CV.")}

    <div class="decision-row">
      <button class="btn btn-green" data-action="setStatus" data-cid="${esc(c.id)}" data-estado="Seleccionado">Seleccionar</button>
      <button class="btn" data-action="setStatus" data-cid="${esc(c.id)}" data-estado="Entrevista">Pasar a entrevista</button>
      <button class="btn btn-coral" data-action="setStatus" data-cid="${esc(c.id)}" data-estado="Descartado">Descartar</button>
    </div>
  `;
}

/* ============================================================
   COMPARACIÓN DE CANDIDATOS
   ============================================================ */

function renderCompare(cands, offer) {
  const box = document.getElementById("compareBody");
  const allBlandas = Array.from(new Set(cands.flatMap((c) => Object.keys(c.blandas))));

  let html = `<table class="compare-table"><thead><tr><th>Criterio</th>`;
  cands.forEach((c) => {
    html += `<th>${esc(c.nombre)} <span class="remove-x" data-action="removeCompare" data-cid="${esc(c.id)}">✕</span></th>`;
  });
  html += `</tr></thead><tbody>`;

  html += `<tr><td class="row-label">Match total</td>${cands.map((c) => `<td class="compare-score">${c.match}%</td>`).join("")}</tr>`;
  html += `<tr><td class="row-label">Habilidades técnicas</td>${cands.map((c) => `<td>${c.tecnicas.length ? esc(c.tecnicas.join(", ")) : "—"}</td>`).join("")}</tr>`;
  html += `<tr><td class="row-label">Experiencia requerida</td>${cands.map((c) => `<td>${c.experienciaOk ? "✅ Coincide" : "❌ No coincide"}</td>`).join("")}</tr>`;
  html += `<tr><td class="row-label">Formación requerida</td>${cands.map((c) => `<td>${c.formacionOk ? "✅ Coincide" : "❌ No coincide"}</td>`).join("")}</tr>`;
  allBlandas.forEach((k) => {
    html += `<tr><td class="row-label">${esc(k)}</td>${cands.map((c) => `<td>${c.blandas[k] !== undefined ? c.blandas[k] + "/10" : "—"}</td>`).join("")}</tr>`;
  });
  html += `<tr><td class="row-label">Brechas</td>${cands.map((c) => `<td>${c.faltantes.length ? esc(c.faltantes.join(", ")) : "—"}</td>`).join("")}</tr>`;
  html += `<tr><td class="row-label">Estado actual</td>${cands.map((c) => `<td>${esc(c.estado)}</td>`).join("")}</tr>`;
  html += `<tr><td class="row-label">Radar de habilidades blandas</td>${cands.map((c) => `<td>${renderRadar(c.blandas, 150)}</td>`).join("")}</tr>`;
  html += `</tbody></table>`;
  box.innerHTML = html;
}

function removeFromCompare(cid) {
  selectedForCompare.delete(cid);
  const offer = OFERTAS.find((o) => o.id === activeOfferId);
  const cands = (CANDIDATOS[offer.id] || []).filter((c) => selectedForCompare.has(c.id));
  if (cands.length < 2) {
    document.getElementById("compareBody").style.display = "none";
    document.getElementById("rankingBody").style.display = "block";
    document.getElementById("btnBackToRanking").style.display = "none";
    renderRanking();
  } else {
    renderCompare(cands, offer);
  }
}

/* ============================================================
   STATS TOPBAR
   ============================================================ */

function computarStats() {
  const totalCandidatos = Object.values(CANDIDATOS).flat();
  return {
    ofertas: OFERTAS.length,
    ofertasActivas: OFERTAS.filter((o) => o.estado === "Aprobada").length,
    enRevision: totalCandidatos.filter((c) => c.estado !== "Seleccionado" && c.estado !== "Descartado").length,
    seleccionados: totalCandidatos.filter((c) => c.estado === "Seleccionado").length,
    totalCandidatos: totalCandidatos.length,
  };
}

function updateTopStats() {
  const s = computarStats();
  document.getElementById("stat-ofertas").textContent = s.ofertasActivas;
  document.getElementById("stat-candidatos").textContent = s.enRevision;
  document.getElementById("stat-seleccionados").textContent = s.seleccionados;
}

/* ---------------- VISTA: INICIO ---------------- */

function renderHome() {
  document.getElementById("homeGreeting").textContent =
    "Bienvenido/a" + (usuarioActual ? ", " + usuarioActual : "");
  const box = document.getElementById("homeStats");

  if (cargaFallida) {
    box.innerHTML = `<div class="empty-state">No se pudieron cargar los datos.<div style="margin-top:10px;"><button class="btn btn-primary" data-action="retry">Reintentar</button></div></div>`;
    return;
  }
  if (!datosCargados) {
    box.innerHTML = `<div class="empty-state">Cargando datos…</div>`;
    return;
  }

  const s = computarStats();
  box.innerHTML = `
    <div class="stat-card"><span class="stat-num">${s.ofertasActivas}</span><span class="stat-lbl">Ofertas activas</span></div>
    <div class="stat-card"><span class="stat-num">${s.ofertas}</span><span class="stat-lbl">Ofertas cargadas</span></div>
    <div class="stat-card"><span class="stat-num">${s.enRevision}</span><span class="stat-lbl">Candidatos en revisión</span></div>
    <div class="stat-card"><span class="stat-num">${s.seleccionados}</span><span class="stat-lbl">Seleccionados</span></div>
    <div class="stat-card"><span class="stat-num">${s.totalCandidatos}</span><span class="stat-lbl">Candidatos totales</span></div>
  `;
}

/* ============================================================
   PESTAÑAS (Inicio / Matching / Ofertas / Alumni)
   ============================================================ */

function activarTab(tab) {
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  document.getElementById("view-home").style.display = tab === "home" ? "grid" : "none";
  document.getElementById("view-matching").style.display = tab === "matching" ? "grid" : "none";
  document.getElementById("view-ofertas").style.display = tab === "ofertas" ? "grid" : "none";
  document.getElementById("view-alumni").style.display = tab === "alumni" ? "grid" : "none";
}

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => activarTab(btn.dataset.tab));
});
document.querySelectorAll(".home-link").forEach((btn) => {
  btn.addEventListener("click", () => activarTab(btn.dataset.tab));
});

/* ============================================================
   SECCIÓN: TODAS LAS OFERTAS (catálogo + perfil de empresa)
   ============================================================ */

function renderCatalogoOfertas() {
  const list = document.getElementById("ofertaCatList");

  if (cargaFallida) {
    list.innerHTML = `<div class="empty-state">No se pudieron cargar las ofertas.<div style="margin-top:10px;"><button class="btn btn-primary" data-action="retry">Reintentar</button></div></div>`;
    return;
  }
  if (!datosCargados) {
    list.innerHTML = `<div class="empty-state">Cargando ofertas…</div>`;
    return;
  }

  const texto = (document.getElementById("ofertaCatSearch").value || "").toLowerCase();
  const estadoFiltro = document.getElementById("ofertaCatEstado").value;
  list.innerHTML = "";

  const filtradas = CATALOGO_OFERTAS.filter((o) => {
    const coincideTexto = (o.titulo + " " + o.empresa).toLowerCase().includes(texto);
    const coincideEstado = estadoFiltro === "todos" || o.estado === estadoFiltro;
    return coincideTexto && coincideEstado;
  });

  if (filtradas.length === 0) {
    list.innerHTML = `<div class="empty-state">No hay ofertas que coincidan con la búsqueda.</div>`;
    return;
  }

  filtradas.forEach((o) => {
    const div = document.createElement("div");
    div.className = "cat-card" + (o.id === activeOfertaCatId ? " active" : "");
    div.innerHTML = `
      <p class="cat-card-title">${esc(o.titulo)}</p>
      <p class="cat-card-sub">${esc(o.empresa)} · ${esc(o.ubicacion || "sin ubicación")}</p>
      <div class="offer-meta" style="margin-top:6px;">
        ${tagOferta(o.estado)}
        ${tagSi(o.modalidad)}
      </div>
    `;
    div.onclick = () => {
      activeOfertaCatId = o.id;
      renderCatalogoOfertas();
      renderOfertaCatDetail(o);
    };
    list.appendChild(div);
  });
}

function renderOfertaCatDetail(o) {
  const el = document.getElementById("ofertaCatDetailInner");
  const emp = o.empresaInfo;
  const email = safeEmail(emp.email);

  el.innerHTML = `
    <div class="profile-header">
      <div class="avatar">${initials(o.empresa)}</div>
      <div>
        <h2>${esc(o.titulo)}</h2>
        <p>${esc(o.empresa)} ${o.ubicacion ? "· " + esc(o.ubicacion) : ""}</p>
      </div>
    </div>

    <div class="offer-meta" style="margin-bottom:16px;">
      ${tagOferta(o.estado)}
      ${tagSi(o.modalidad)}
      ${tagSi(o.jornada)}
    </div>

    <div class="block-title">Descripción del puesto</div>
    <div class="desc-box">${esc(o.descripcion) || "Sin descripción cargada."}</div>

    <div class="block-title">Requisitos</div>
    <div class="field-grid">
      <div class="field-item"><span class="field-label">Habilidades técnicas</span><span class="field-value">${o.tecnicas.length ? esc(o.tecnicas.join(", ")) : "—"}</span></div>
      <div class="field-item"><span class="field-label">Habilidades blandas</span><span class="field-value">${o.blandas.length ? esc(o.blandas.join(", ")) : "—"}</span></div>
      <div class="field-item"><span class="field-label">Experiencia requerida</span><span class="field-value">${esc(o.experiencia) || "—"}</span></div>
      <div class="field-item"><span class="field-label">Formación requerida</span><span class="field-value">${esc(o.formacion) || "—"}</span></div>
      <div class="field-item"><span class="field-label">Otros requisitos</span><span class="field-value">${o.otros.length ? esc(o.otros.join(", ")) : "—"}</span></div>
      <div class="field-item"><span class="field-label">Fecha de publicación</span><span class="field-value">${esc(o.fechaPublicacion) || "—"}</span></div>
      <div class="field-item"><span class="field-label">Fecha de cierre</span><span class="field-value">${esc(o.fechaCierre) || "—"}</span></div>
    </div>

    <div class="block-title">Perfil de la empresa</div>
    ${emp ? `
    <div class="field-grid">
      <div class="field-item"><span class="field-label">Nombre</span><span class="field-value">${esc(emp.nombre) || "—"}</span></div>
      <div class="field-item"><span class="field-label">Sector</span><span class="field-value">${esc(emp.sector) || "—"}</span></div>
      <div class="field-item"><span class="field-label">Tamaño</span><span class="field-value">${esc(emp.tamano) || "—"}</span></div>
      <div class="field-item"><span class="field-label">Departamento</span><span class="field-value">${esc(emp.departamento) || "—"}</span></div>
      <div class="field-item"><span class="field-label">Persona de contacto</span><span class="field-value">${esc(emp.contacto) || "—"}</span></div>
      <div class="field-item"><span class="field-label">Email</span><span class="field-value">${email ? `<a href="mailto:${esc(email)}">${esc(email)}</a>` : "—"}</span></div>
      <div class="field-item"><span class="field-label">Teléfono</span><span class="field-value">${esc(emp.telefono) || "—"}</span></div>
    </div>` : `<p style="font-size:12.5px; color:var(--ink-soft);">No hay datos de empresa cargados para esta oferta.</p>`}
  `;
}

/* ============================================================
   SECCIÓN: TODOS LOS ALUMNI (catálogo + perfil individual)
   ============================================================ */

function renderCatalogoAlumni() {
  const list = document.getElementById("alumniCatList");

  if (cargaFallida) {
    list.innerHTML = `<div class="empty-state">No se pudieron cargar los Alumni.<div style="margin-top:10px;"><button class="btn btn-primary" data-action="retry">Reintentar</button></div></div>`;
    return;
  }
  if (!datosCargados) {
    list.innerHTML = `<div class="empty-state">Cargando Alumni…</div>`;
    return;
  }

  const texto = (document.getElementById("alumniCatSearch").value || "").toLowerCase();
  list.innerHTML = "";

  const filtrados = CATALOGO_ALUMNI.filter((a) => {
    const bolsa = (a.nombre + " " + a.carrera + " " + a.tecnicas.join(" ")).toLowerCase();
    return bolsa.includes(texto);
  });

  if (filtrados.length === 0) {
    list.innerHTML = `<div class="empty-state">No hay Alumni que coincidan con la búsqueda.</div>`;
    return;
  }

  filtrados.forEach((a) => {
    const div = document.createElement("div");
    div.className = "cat-card" + (a.id === activeAlumniCatId ? " active" : "");
    div.innerHTML = `
      <div class="cat-card-top">
        <div class="avatar" style="width:32px;height:32px;font-size:11px;">${initials(a.nombre)}</div>
        <div>
          <p class="cat-card-title">${esc(a.nombre)}</p>
          <p class="cat-card-sub">${esc(a.carrera || "Carrera no informada")}</p>
        </div>
      </div>
      <div class="cand-tags">${a.tecnicas.slice(0, 3).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>
    `;
    div.onclick = () => {
      activeAlumniCatId = a.id;
      renderCatalogoAlumni();
      renderAlumniCatDetail(a);
    };
    list.appendChild(div);
  });
}

function renderAlumniCatDetail(a) {
  const el = document.getElementById("alumniCatDetailInner");
  const email = safeEmail(a.email);
  const linkedin = linkedinLink(a.linkedin);
  const edad = (a.edad === null || a.edad === undefined) ? "—" : `${a.edad} años`;

  el.innerHTML = `
    <div class="profile-header">
      <div class="avatar">${initials(a.nombre)}</div>
      <div>
        <h2>${esc(a.nombre)}</h2>
        <p>${esc(a.carrera || "Carrera no informada")} ${a.institucion ? "· " + esc(a.institucion) : ""}</p>
      </div>
    </div>

    <div class="block-title">Datos de contacto</div>
    <div class="field-grid">
      <div class="field-item"><span class="field-label">Email</span><span class="field-value">${email ? `<a href="mailto:${esc(email)}">${esc(email)}</a>` : "—"}</span></div>
      <div class="field-item"><span class="field-label">Teléfono</span><span class="field-value">${esc(a.telefono) || "—"}</span></div>
      <div class="field-item"><span class="field-label">LinkedIn</span><span class="field-value">${linkedin}</span></div>
      <div class="field-item"><span class="field-label">Departamento</span><span class="field-value">${esc(a.departamento) || "—"}</span></div>
      <div class="field-item"><span class="field-label">Edad</span><span class="field-value">${edad}</span></div>
    </div>

    <div class="block-title">DESEM</div>
    <div class="field-grid">
      <div class="field-item"><span class="field-label">Programa realizado</span><span class="field-value">${esc(a.programa) || "—"}</span></div>
      <div class="field-item"><span class="field-label">Año / período</span><span class="field-value">${esc(a.anioParticipacion) || "—"}</span></div>
      <div class="field-item"><span class="field-label">Otros programas DESEM</span><span class="field-value">${esc(a.otrosProgramas) || "—"}</span></div>
    </div>

    <div class="block-title">Formación</div>
    <div class="field-grid">
      <div class="field-item"><span class="field-label">Carrera</span><span class="field-value">${esc(a.carrera) || "—"}</span></div>
      <div class="field-item"><span class="field-label">Institución</span><span class="field-value">${esc(a.institucion) || "—"}</span></div>
      <div class="field-item"><span class="field-label">Estado de la carrera</span><span class="field-value">${esc(a.estadoCarrera) || "—"}</span></div>
    </div>
    <div class="desc-box" style="margin-top:0;">
      <span class="field-label" style="display:block; margin-bottom:4px;">Cursos, talleres y certificaciones</span>
      ${esc(a.cursos) || "No informado."}
    </div>

    <div class="block-title">Habilidades técnicas</div>
    <div class="cand-tags" style="margin-bottom:6px;">${a.tecnicas.length ? a.tecnicas.map((t) => `<span class="tag">${esc(t)}</span>`).join("") : "<span style='font-size:12.5px;color:var(--ink-soft);'>No informadas</span>"}</div>

    <div class="block-title">Disponibilidad</div>
    <div class="field-grid">
      <div class="field-item"><span class="field-label">Disponibilidad laboral</span><span class="field-value">${esc(a.disponibilidad) || "—"}</span></div>
      <div class="field-item"><span class="field-label">Modalidad preferida</span><span class="field-value">${esc(a.modalidad) || "—"}</span></div>
    </div>

    <div class="block-title">Experiencia</div>
    <div class="desc-box">${esc(a.experiencia) || "Sin experiencia informada."}</div>

    <div class="block-title">Habilidades blandas certificadas (DESEM)</div>
    <div class="radar-wrap">${renderRadar(a.blandas)}</div>

    <div class="block-title">CV</div>
    ${enlaceCV(a.cv, "Ver currículum adjunto", "Este Alumni todavía no cargó un CV.")}
  `;
}

function linkedinLink(valor) {
  if (!safeStr(valor)) return "—";
  let url = safeStr(valor).trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  url = safeUrl(url);
  if (!url) return "—";
  return `<a href="${esc(url)}" target="_blank" rel="noopener">Ver perfil</a>`;
}

/* ============================================================
   LISTENERS GLOBALES Y DELEGACIÓN DE ACCIONES
   Las acciones construidas dinámicamente (botones de detalle,
   quitar de comparación, reintentar) se delegan con data-action
   en vez de interpolar onclick, evitando inyección por IDs.
   ============================================================ */

document.getElementById("offerSearch").addEventListener("input", debounce((e) => renderOffers(e.target.value)));
document.getElementById("minMatch").addEventListener("input", (e) => {
  document.getElementById("minMatchVal").textContent = e.target.value + "%";
  renderRanking();
});
document.getElementById("stateFilter").addEventListener("change", renderRanking);

document.getElementById("ofertaCatSearch").addEventListener("input", debounce(renderCatalogoOfertas));
document.getElementById("ofertaCatEstado").addEventListener("change", renderCatalogoOfertas);
document.getElementById("alumniCatSearch").addEventListener("input", debounce(renderCatalogoAlumni));

document.getElementById("btnCompare").addEventListener("click", () => {
  const offer = OFERTAS.find((o) => o.id === activeOfferId);
  const cands = (CANDIDATOS[offer.id] || []).filter((c) => selectedForCompare.has(c.id));
  renderCompare(cands, offer);
  document.getElementById("rankingBody").style.display = "none";
  document.getElementById("compareBody").style.display = "block";
  document.getElementById("btnBackToRanking").style.display = "inline-block";
});

document.getElementById("btnBackToRanking").addEventListener("click", () => {
  document.getElementById("compareBody").style.display = "none";
  document.getElementById("rankingBody").style.display = "block";
  document.getElementById("btnBackToRanking").style.display = "none";
});

document.getElementById("detailInner").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === "closeDetail") {
    document.getElementById("detailCol").classList.remove("open");
  } else if (action === "setStatus") {
    setStatus(btn.dataset.cid, btn.dataset.estado);
  }
});

document.getElementById("compareBody").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action='removeCompare']");
  if (btn) removeFromCompare(btn.dataset.cid);
});

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action='retry']");
  if (btn) cargarDatos();
});

/* ============================================================
   AUTENTICACIÓN Y ARRANQUE
   Calcula si hay sesión activa al abrirse la app, muestra la
   pantalla de acceso o el panel, y recién entonces carga datos.
   ============================================================ */

function mostrarErrorLogin(mensaje) {
  document.getElementById("authError").textContent = mensaje;
  document.getElementById("authError").hidden = false;
  document.getElementById("loginUser").setAttribute("aria-invalid", "true");
  document.getElementById("loginPass").setAttribute("aria-invalid", "true");
}

function limpiarErrorLogin() {
  document.getElementById("authError").hidden = true;
  document.getElementById("loginUser").removeAttribute("aria-invalid");
  document.getElementById("loginPass").removeAttribute("aria-invalid");
}

function iniciarSesion(usuario) {
  usuarioActual = usuario;
  try { sessionStorage.setItem(AUTH_SESION, "1"); } catch (err) { /* almacenamiento no disponible */ }
  document.body.classList.add("autenticado");
  document.getElementById("topbarUser").textContent = usuarioActual;
  activarTab("home");
  cargarDatos();
}

function cerrarSesion() {
  try { sessionStorage.removeItem(AUTH_SESION); } catch (err) {}
  usuarioActual = "";
  resetDatos();
  limpiarErrorLogin();
  document.getElementById("loginForm").reset();
  document.body.classList.remove("autenticado");
  document.getElementById("loginUser").focus();
}

/** Deja la app sin datos en memoria al cerrar sesión. */
function resetDatos() {
  OFERTAS = [];
  CANDIDATOS = {};
  CATALOGO_OFERTAS = [];
  CATALOGO_ALUMNI = [];
  datosCargados = false;
  cargaFallida = false;
  activeOfferId = null;
  selectedForCompare.clear();
  activeOfertaCatId = null;
  activeAlumniCatId = null;
  document.getElementById("topbarUser").textContent = "–";
}

document.getElementById("loginForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const usuario = document.getElementById("loginUser").value.trim();
  const password = document.getElementById("loginPass").value.trim();
  if (usuario === CREDENCIALES.usuario && password === CREDENCIALES.password) {
    limpiarErrorLogin();
    iniciarSesion(usuario);
  } else {
    mostrarErrorLogin("Usuario o contraseña incorrectos.");
  }
});

document.getElementById("togglePass").addEventListener("click", () => {
  const input = document.getElementById("loginPass");
  const mostrar = input.type === "password";
  input.type = mostrar ? "text" : "password";
  const btn = document.getElementById("togglePass");
  btn.textContent = mostrar ? "Ocultar" : "Mostrar";
  btn.setAttribute("aria-label", mostrar ? "Ocultar contraseña" : "Mostrar contraseña");
  btn.setAttribute("aria-pressed", String(mostrar));
  input.focus();
});

document.getElementById("btnLogout").addEventListener("click", cerrarSesion);

/* ---------------- INIT ---------------- */
let sesionPrevia = false;
try { sesionPrevia = sessionStorage.getItem(AUTH_SESION) === "1"; } catch (err) {}
if (sesionPrevia) {
  iniciarSesion(CREDENCIALES.usuario);
} else {
  document.getElementById("loginUser").focus();
}