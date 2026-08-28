/* ---------------- DATOS DE EJEMPLO ---------------- */
const OFERTAS = [
  {
    id:"o1", empresa:"Empresa X", titulo:"Analista de Marketing", estado:"Aprobada",
    modalidad:"Híbrido", jornada:"Tiempo completo", ubicacion:"Montevideo",
    tecnicas:["Excel","Marketing digital","Google Analytics"],
    blandas:["Comunicación","Trabajo en equipo","Pensamiento analítico"],
    experiencia:"1–2 años en marketing o comercial", formacion:"Carrera afín a Marketing/Negocios",
    otros:["Inglés avanzado"]
  },
  {
    id:"o2", empresa:"Empresa Y", titulo:"Community Manager", estado:"Pendiente",
    modalidad:"Remoto", jornada:"Medio tiempo", ubicacion:"Canelones",
    tecnicas:["Diseño UX/UI","Marketing digital","Redes sociales"],
    blandas:["Comunicación","Adaptabilidad","Argumentación"],
    experiencia:"Sin experiencia excluyente", formacion:"Estudiante avanzado de Comunicación o Marketing",
    otros:[]
  },
  {
    id:"o3", empresa:"Empresa Z", titulo:"Analista Comercial Jr.", estado:"Aprobada",
    modalidad:"Presencial", jornada:"Tiempo completo", ubicacion:"Montevideo",
    tecnicas:["Excel","Ventas","Análisis de datos"],
    blandas:["Trabajo en equipo","Liderazgo","Resolución de problemas"],
    experiencia:"Al menos 1 año en ventas", formacion:"Carrera afín a Administración o Economía",
    otros:["Disponibilidad para viajar"]
  },
];

const CANDIDATOS = {
  o1:[
    { id:"c1", nombre:"Juan Pérez", rol:"Estudiante de Marketing", match:94, estado:"Entrevista",
      tecnicas:["Excel","Marketing","Google Analytics"], experienciaOk:true, formacionOk:true,
      blandas:{Comunicación:9,"Trabajo en equipo":10,"Pensamiento analítico":8,Liderazgo:7,Adaptabilidad:8},
      faltantes:["Inglés avanzado"], cv:"#" },
    { id:"c2", nombre:"Ana López", rol:"Lic. en Comunicación", match:89, estado:"Contactado",
      tecnicas:["Excel","Marketing"], experienciaOk:true, formacionOk:true,
      blandas:{Comunicación:9,"Trabajo en equipo":8,"Pensamiento analítico":7,Liderazgo:6,Adaptabilidad:9},
      faltantes:["Google Analytics","Inglés avanzado"], cv:"#" },
    { id:"c3", nombre:"Martín Silva", rol:"Estudiante de Negocios", match:84, estado:"Pendiente",
      tecnicas:["Excel","Google Analytics"], experienciaOk:false, formacionOk:true,
      blandas:{Comunicación:7,"Trabajo en equipo":9,"Pensamiento analítico":8,Liderazgo:6,Adaptabilidad:7},
      faltantes:["Marketing digital (certificado)","Inglés avanzado"], cv:"#" },
    { id:"c4", nombre:"Sofía Rodríguez", rol:"Estudiante de Diseño", match:79, estado:"Descartado",
      tecnicas:["Marketing","Google Analytics"], experienciaOk:false, formacionOk:false,
      blandas:{Comunicación:8,"Trabajo en equipo":7,"Pensamiento analítico":6,Liderazgo:5,Adaptabilidad:8},
      faltantes:["Excel","Formación afín","Inglés avanzado"], cv:"#" },
  ],
  o2:[
    { id:"c5", nombre:"Lucía Fernández", rol:"Estudiante de Comunicación", match:91, estado:"Pendiente",
      tecnicas:["Redes sociales","Marketing digital"], experienciaOk:true, formacionOk:true,
      blandas:{Comunicación:9,Adaptabilidad:9,Argumentación:8,"Trabajo en equipo":7,Liderazgo:6},
      faltantes:["Diseño UX/UI"], cv:"#" },
    { id:"c6", nombre:"Diego Ramírez", rol:"Estudiante de Diseño", match:87, estado:"Pendiente",
      tecnicas:["Diseño UX/UI","Redes sociales"], experienciaOk:true, formacionOk:false,
      blandas:{Comunicación:7,Adaptabilidad:8,Argumentación:6,"Trabajo en equipo":8,Liderazgo:5},
      faltantes:["Marketing digital (certificado)"], cv:"#" },
  ],
  o3:[
    { id:"c7", nombre:"Martín Silva", rol:"Estudiante de Negocios", match:88, estado:"Entrevista",
      tecnicas:["Excel","Ventas"], experienciaOk:true, formacionOk:true,
      blandas:{"Trabajo en equipo":9,Liderazgo:7,"Resolución de problemas":8,Comunicación:7,Adaptabilidad:7},
      faltantes:["Análisis de datos"], cv:"#" },
    { id:"c8", nombre:"Camila Torres", rol:"Lic. en Economía", match:82, estado:"Seleccionado",
      tecnicas:["Excel","Análisis de datos"], experienciaOk:true, formacionOk:true,
      blandas:{"Trabajo en equipo":8,Liderazgo:6,"Resolución de problemas":9,Comunicación:8,Adaptabilidad:6},
      faltantes:["Ventas (certificado)","Disponibilidad para viajar"], cv:"#" },
  ],
};

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
        <p class="offer-company">${o.empresa} · ${o.ubicacion}</p>
        <div class="offer-meta">
          <span class="tag status-${o.estado==='Aprobada'?'aprobada':'pendiente'}">${o.estado}</span>
          <span class="tag">${o.modalidad}</span>
          <span class="tag">${o.jornada}</span>
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
  return name.split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();
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
  document.getElementById("offerSubtitle").textContent = `${offer.empresa} · ${offer.ubicacion} · ${offer.modalidad} · ${offer.jornada}`;

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
        <p class="cand-role">${c.rol}</p>
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
    row.querySelector(".avatar").parentElement.parentElement; // noop
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
        <p>${c.rol}</p>
      </div>
      <div class="score-ring">
        <span class="num">${c.match}%</span>
        <span class="lbl">match</span>
      </div>
    </div>

    <div class="block-title">Habilidades técnicas</div>
    ${tecOk.map(t=>`<div class="match-line"><span><span class="dot ok"></span>${t}</span><span>Coincide</span></div>`).join("")}
    ${tecFalt.map(t=>`<div class="match-line"><span><span class="dot bad"></span>${t}</span><span>No informado</span></div>`).join("")}

    <div class="block-title">Experiencia y formación</div>
    <div class="match-line"><span><span class="dot ${c.experienciaOk?'ok':'bad'}"></span>Experiencia requerida</span><span>${c.experienciaOk?'Coincide':'No coincide'}</span></div>
    <div class="match-line"><span><span class="dot ${c.formacionOk?'ok':'bad'}"></span>Formación requerida</span><span>${c.formacionOk?'Coincide':'No coincide'}</span></div>

    <div class="block-title">Habilidades blandas certificadas (DESEM)</div>
    <div class="radar-wrap">${renderRadar(c.blandas)}</div>

    ${c.faltantes.length? `
    <div class="block-title">Brechas frente a la oferta</div>
    <div class="missing-box">${c.faltantes.join(" · ")}</div>` : ""}

    <div class="block-title">CV y contacto</div>
    <a class="cv-link" href="${c.cv}" onclick="return false;">📄 Ver currículum adjunto</a>

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
  if(cand){ cand.estado = estado; renderRanking(); renderDetail(cand, offer); updateTopStats(); }
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
  html += `<tr><td class="row-label">Habilidades técnicas</td>${cands.map(c=>`<td>${c.tecnicas.join(", ")}</td>`).join("")}</tr>`;
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
renderOffers();
updateTopStats();
selectOffer("o1");
