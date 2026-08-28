/* ---------------- CONEXIÓN CON GOOGLE SHEETS ---------------- */
// Pegá acá la URL que te da Apps Script al implementar la Aplicación web
// (Implementar → Nueva implementación → Aplicación web). Termina en /exec.
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycby2wO56D7RhCJyxeZSam72BSY6GDC0k70-nXRXi3s-T9HKvhYzZg5zN0aru8WRVtZ7P/exec";

let OFERTAS = [];
let CANDIDATOS = {};
let datosListos = false;

async function cargarDatos(){
  mostrarEstadoCarga("Conectando con la planilla…");
  try{
    const resp = await fetch(WEBAPP_URL + (WEBAPP_URL.includes("?") ? "&" : "?") + "t=" + Date.now());
    if(!resp.ok) throw new Error("HTTP " + resp.status);
    const datos = await resp.json();
    OFERTAS = datos.ofertas || [];
    CANDIDATOS = datos.candidatos || {};
    datosListos = true;
    renderOffers();
    updateTopStats();
    if(OFERTAS.length){
      selectOffer(OFERTAS[0].id);
    } else {
      mostrarEstadoCarga("Todavía no hay ofertas cargadas en la planilla.");
    }
  }catch(err){
    console.error("Error cargando datos de la planilla:", err);
    mostrarEstadoError();
  }
}

function mostrarEstadoCarga(mensaje){
  document.getElementById("rankingBody").innerHTML =
    `<div class="empty-state">${mensaje}</div>`;
}

function mostrarEstadoError(){
  document.getElementById("rankingBody").innerHTML = `
    <div class="empty-state">
      <div class="big">No se pudo conectar con la planilla</div>
      Revisá que WEBAPP_URL en script.js sea la URL correcta de tu Aplicación web
      (Apps Script → Implementar → Administrar implementaciones) y que el acceso
      esté configurado como "Cualquier usuario".
      <div style="margin-top:14px;">
        <button class="btn btn-primary" onclick="cargarDatos()">Reintentar</button>
      </div>
    </div>`;
}

/** Avisa a la planilla que cambió el estado de un candidato (sin bloquear la UI). */
async function guardarEstadoEnPlanilla(matchId, estado){
  if(!matchId) return;
  try{
    await fetch(WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // evita el preflight de CORS
      body: JSON.stringify({ action:"actualizarEstado", matchId, estado }),
    });
  }catch(err){
    console.error("No se pudo guardar el estado en la planilla:", err);
  }
}

/* ---------------- ESTADO ---------------- */
let activeOfferId = null;
let selectedForCompare = new Set();
let openCandidateId = null;

/* ---------------- RENDER: LISTA DE OFERTAS ---------------- */
function renderOffers(filterText=""){
  const list = document.getElementById("offersList");
  list.innerHTML = "";
  OFERTAS
    .filter(o => (o.titulo+o.empresa).toLowerCase().includes(filterText.toLowerCase()))
    .forEach(o=>{
      const n = (CANDIDATOS[o.id]||[]).length;
      const div = document.createElement("div");
      div.className = "offer-card" + (o.id===activeOfferId ? " active":"");
      div.innerHTML = `
        <p class="offer-title">${o.titulo}</p>
        <p class="offer-company">${o.empresa} · ${o.ubicacion || "sin ubicación"}</p>
        <div class="offer-meta">
          <span class="tag status-${o.estado==='Aprobada'?'aprobada':'pendiente'}">${o.estado}</span>
          ${o.modalidad ? `<span class="tag">${o.modalidad}</span>` : ""}
          ${o.jornada ? `<span class="tag">${o.jornada}</span>` : ""}
        </div>
        <div class="offer-count">${n} candidatos rankeados</div>
      `;
      div.onclick = ()=>selectOffer(o.id);
      list.appendChild(div);
    });
}

function selectOffer(id){
  activeOfferId = id;
  selectedForCompare.clear();
  openCandidateId = null;
  document.getElementById("compareBody").style.display="none";
  document.getElementById("rankingBody").style.display="block";
  document.getElementById("btnBackToRanking").style.display="none";
  renderOffers(document.getElementById("offerSearch").value);
  renderRanking();
  renderDetail(null);
}

/* ---------------- RENDER: RANKING ---------------- */
function initials(name){
  return (name||"?").split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();
}

function renderRanking(){
  const offer = OFERTAS.find(o=>o.id===activeOfferId);
  const body = document.getElementById("rankingBody");
  if(!offer){
    document.getElementById("offerTitle").textContent = "—";
    document.getElementById("offerSubtitle").textContent = "Seleccioná una oferta para ver el ranking de candidatos.";
    body.innerHTML = `<div class="empty-state"><div class="big">No hay ninguna oferta seleccionada</div>Elegí una de la columna izquierda.</div>`;
    return;
  }
  document.getElementById("offerTitle").textContent = offer.titulo;
  document.getElementById("offerSubtitle").textContent =
    [offer.empresa, offer.ubicacion, offer.modalidad, offer.jornada].filter(Boolean).join(" · ");

  const minMatch = parseInt(document.getElementById("minMatch").value,10);
  const stateFilter = document.getElementById("stateFilter").value;

  let cands = (CANDIDATOS[offer.id]||[]).slice().sort((a,b)=>b.match-a.match);
  cands = cands.filter(c=>c.match>=minMatch && (stateFilter==="todos"|| c.estado===stateFilter));

  body.innerHTML = "";
  if(cands.length===0){
    body.innerHTML = `<div class="empty-state">Ningún candidato cumple los filtros actuales.</div>`;
    return;
  }

  cands.forEach((c,i)=>{
    const row = document.createElement("div");
    row.className = "candidate-row";
    row.innerHTML = `
      <input type="checkbox" ${selectedForCompare.has(c.id)?"checked":""} data-cid="${c.id}" class="cmp-check">
      <div class="avatar">${initials(c.nombre)}</div>
      <div>
        <p class="cand-name">#${i+1} ${c.nombre}</p>
        <p class="cand-role">${c.rol||""}</p>
      </div>
      <div class="cand-tags">${c.tecnicas.slice(0,3).map(t=>`<span class="tag">${t}</span>`).join("")}</div>
      <div class="match-wrap">
        <span class="match-score">${c.match}%</span>
      </div>
      <select class="status-select" data-cid="${c.id}">
        ${["Pendiente","Contactado","Entrevista","Seleccionado","Descartado"].map(s=>`<option ${s===c.estado?"selected":""}>${s}</option>`).join("")}
      </select>
      <span style="text-align:center; color:var(--ink-soft);">›</span>
    `;
    row.addEventListener("click",(e)=>{
      if(e.target.classList.contains("cmp-check")||e.target.classList.contains("status-select")) return;
      openCandidateId = c.id;
      renderDetail(c, offer);
      document.getElementById("detailCol").classList.add("open");
    });
    row.querySelector(".cmp-check").addEventListener("change",(e)=>{
      if(e.target.checked) selectedForCompare.add(c.id); else selectedForCompare.delete(c.id);
      updateCompareBar();
    });
    row.querySelector(".status-select").addEventListener("change",(e)=>{
      c.estado = e.target.value;
      updateTopStats();
      guardarEstadoEnPlanilla(c.matchId, c.estado);
    });
    body.appendChild(row);
  });
  updateCompareBar();
}

function updateCompareBar(){
  const n = selectedForCompare.size;
  document.getElementById("compareCount").textContent = n + " seleccionados";
  document.getElementById("btnCompare").disabled = n<2;
}

/* ---------------- RADAR (SVG puro) ---------------- */
function renderRadar(dataObj, size=190){
  const keys = Object.keys(dataObj);
  if(keys.length < 3){
    return `<p style="font-size:12px; color:var(--ink-soft); text-align:center;">Todavía no hay suficientes habilidades blandas evaluadas para este Alumni.</p>`;
  }
  const n = keys.length;
  const cx = size/2, cy = size/2, R = size/2 - 34;
  const angle = (i)=> (Math.PI*2*i/n) - Math.PI/2;
  const pt = (i, val)=>{
    const r = (val/10)*R;
    return [cx + r*Math.cos(angle(i)), cy + r*Math.sin(angle(i))];
  };
  let rings = "";
  [2,4,6,8,10].forEach(v=>{
    const pts = keys.map((k,i)=>pt(i,v).join(",")).join(" ");
    rings += `<polygon points="${pts}" fill="none" stroke="#DCE3DF" stroke-width="1"/>`;
  });
  let axes = "";
  keys.forEach((k,i)=>{
    const [x,y] = pt(i,10);
    axes += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#DCE3DF" stroke-width="1"/>`;
  });
  const dataPts = keys.map((k,i)=>pt(i,dataObj[k]).join(",")).join(" ");
  let labels = "";
  keys.forEach((k,i)=>{
    const [x,y] = pt(i,12.6);
    labels += `<text x="${x}" y="${y}" font-size="9.5" font-family="Inter" fill="#5B6863" text-anchor="middle" dominant-baseline="middle">${k}</text>`;
  });
  let dots = "";
  keys.forEach((k,i)=>{
    const [x,y] = pt(i,dataObj[k]);
    dots += `<circle cx="${x}" cy="${y}" r="3" fill="#123832"/>`;
  });
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${rings}${axes}
    <polygon points="${dataPts}" fill="#1E5B52" fill-opacity="0.35" stroke="#123832" stroke-width="1.5"/>
    ${dots}${labels}
  </svg>`;
}

/* ---------------- RENDER: DETALLE ---------------- */
function renderDetail(c, offer){
  const el = document.getElementById("detailInner");
  if(!c){
    el.innerHTML = `<div class="detail-empty">Elegí un candidato del ranking para ver el detalle del matching, el CV y las habilidades blandas certificadas.</div>`;
    return;
  }
  const tecOk = offer.tecnicas.filter(t=>c.tecnicas.includes(t));
  const tecFalt = offer.tecnicas.filter(t=>!c.tecnicas.includes(t));

  el.innerHTML = `
    <span class="detail-close" onclick="document.getElementById('detailCol').classList.remove('open')">✕ Cerrar</span>
    <div class="cand-header">
      <div class="avatar">${initials(c.nombre)}</div>
      <div>
        <h3>${c.nombre}</h3>
        <p>${c.rol||""}</p>
      </div>
      <div class="score-ring">
        <span class="num">${c.match}%</span>
        <span class="lbl">match</span>
      </div>
    </div>

    <div class="block-title">Habilidades técnicas</div>
    ${tecOk.map(t=>`<div class="match-line"><span><span class="dot ok"></span>${t}</span><span>Coincide</span></div>`).join("")}
    ${tecFalt.map(t=>`<div class="match-line"><span><span class="dot bad"></span>${t}</span><span>No informado</span></div>`).join("")}
    ${(!tecOk.length && !tecFalt.length) ? `<p style="font-size:12.5px; color:var(--ink-soft);">Esta oferta no tiene habilidades técnicas cargadas todavía.</p>` : ""}

    <div class="block-title">Experiencia y formación</div>
    <div class="match-line"><span><span class="dot ${c.experienciaOk?'ok':'bad'}"></span>Experiencia requerida</span><span>${c.experienciaOk?'Coincide':'No coincide'}</span></div>
    <div class="match-line"><span><span class="dot ${c.formacionOk?'ok':'bad'}"></span>Formación requerida</span><span>${c.formacionOk?'Coincide':'No coincide'}</span></div>

    <div class="block-title">Habilidades blandas certificadas (DESEM)</div>
    <div class="radar-wrap">${renderRadar(c.blandas)}</div>

    ${c.faltantes.length? `
    <div class="block-title">Brechas frente a la oferta</div>
    <div class="missing-box">${c.faltantes.join(" · ")}</div>` : ""}

    <div class="block-title">CV y contacto</div>
    ${c.cv ? `<a class="cv-link" href="${c.cv}" target="_blank">📄 Ver currículum adjunto</a>` : `<p style="font-size:12.5px; color:var(--ink-soft);">Este Alumni todavía no cargó un CV.</p>`}

    <div class="decision-row">
      <button class="btn btn-green" onclick="setStatus('${c.id}','Seleccionado')">Seleccionar</button>
      <button class="btn" onclick="setStatus('${c.id}','Entrevista')">Pasar a entrevista</button>
      <button class="btn btn-coral" onclick="setStatus('${c.id}','Descartado')">Descartar</button>
    </div>
  `;
}

function setStatus(cid, estado){
  const offer = OFERTAS.find(o=>o.id===activeOfferId);
  const cand = (CANDIDATOS[offer.id]||[]).find(c=>c.id===cid);
  if(cand){
    cand.estado = estado;
    renderRanking();
    renderDetail(cand, offer);
    updateTopStats();
    guardarEstadoEnPlanilla(cand.matchId, estado);
  }
}

/* ---------------- COMPARACIÓN ---------------- */
document.getElementById("btnCompare").addEventListener("click", ()=>{
  const offer = OFERTAS.find(o=>o.id===activeOfferId);
  const cands = (CANDIDATOS[offer.id]||[]).filter(c=>selectedForCompare.has(c.id));
  renderCompare(cands, offer);
  document.getElementById("rankingBody").style.display="none";
  document.getElementById("compareBody").style.display="block";
  document.getElementById("btnBackToRanking").style.display="inline-block";
});
document.getElementById("btnBackToRanking").addEventListener("click", ()=>{
  document.getElementById("compareBody").style.display="none";
  document.getElementById("rankingBody").style.display="block";
  document.getElementById("btnBackToRanking").style.display="none";
});

function renderCompare(cands, offer){
  const box = document.getElementById("compareBody");
  const allBlandas = Array.from(new Set(cands.flatMap(c=>Object.keys(c.blandas))));

  let html = `<table class="compare-table"><thead><tr><th>Criterio</th>`;
  cands.forEach(c=>{
    html += `<th>${c.nombre} <span class="remove-x" onclick="removeFromCompare('${c.id}')">✕</span></th>`;
  });
  html += `</tr></thead><tbody>`;

  html += `<tr><td class="row-label">Match total</td>${cands.map(c=>`<td class="compare-score">${c.match}%</td>`).join("")}</tr>`;
  html += `<tr><td class="row-label">Habilidades técnicas</td>${cands.map(c=>`<td>${c.tecnicas.join(", ")||"—"}</td>`).join("")}</tr>`;
  html += `<tr><td class="row-label">Experiencia requerida</td>${cands.map(c=>`<td>${c.experienciaOk?"✅ Coincide":"❌ No coincide"}</td>`).join("")}</tr>`;
  html += `<tr><td class="row-label">Formación requerida</td>${cands.map(c=>`<td>${c.formacionOk?"✅ Coincide":"❌ No coincide"}</td>`).join("")}</tr>`;
  allBlandas.forEach(k=>{
    html += `<tr><td class="row-label">${k}</td>${cands.map(c=>`<td>${c.blandas[k]!==undefined ? c.blandas[k]+"/10" : "—"}</td>`).join("")}</tr>`;
  });
  html += `<tr><td class="row-label">Brechas</td>${cands.map(c=>`<td>${c.faltantes.join(", ")||"—"}</td>`).join("")}</tr>`;
  html += `<tr><td class="row-label">Estado actual</td>${cands.map(c=>`<td>${c.estado}</td>`).join("")}</tr>`;
  html += `<tr><td class="row-label">Radar de habilidades blandas</td>${cands.map(c=>`<td>${renderRadar(c.blandas,150)}</td>`).join("")}</tr>`;
  html += `</tbody></table>`;
  box.innerHTML = html;
}

function removeFromCompare(cid){
  selectedForCompare.delete(cid);
  const offer = OFERTAS.find(o=>o.id===activeOfferId);
  const cands = (CANDIDATOS[offer.id]||[]).filter(c=>selectedForCompare.has(c.id));
  if(cands.length<2){
    document.getElementById("compareBody").style.display="none";
    document.getElementById("rankingBody").style.display="block";
    document.getElementById("btnBackToRanking").style.display="none";
    renderRanking();
  } else {
    renderCompare(cands, offer);
  }
}

/* ---------------- STATS TOPBAR ---------------- */
function updateTopStats(){
  document.getElementById("stat-ofertas").textContent = OFERTAS.filter(o=>o.estado==="Aprobada").length;
  const all = Object.values(CANDIDATOS).flat();
  document.getElementById("stat-candidatos").textContent = all.filter(c=>c.estado!=="Seleccionado"&&c.estado!=="Descartado").length;
  document.getElementById("stat-seleccionados").textContent = all.filter(c=>c.estado==="Seleccionado").length;
}

/* ---------------- LISTENERS GLOBALES ---------------- */
document.getElementById("offerSearch").addEventListener("input", (e)=>renderOffers(e.target.value));
document.getElementById("minMatch").addEventListener("input", (e)=>{
  document.getElementById("minMatchVal").textContent = e.target.value+"%";
  renderRanking();
});
document.getElementById("stateFilter").addEventListener("change", renderRanking);

/* ---------------- INIT ---------------- */
cargarDatos();
