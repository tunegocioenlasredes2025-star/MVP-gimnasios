// Página de Socios: lista + filtros + alta/edición + cobro + WhatsApp + import + historial.

let FILTRO = new URLSearchParams(location.search).get("filtro") || "todos";

function cerrar(id) { document.getElementById(id).classList.remove("open"); }
function abrir(id) { document.getElementById(id).classList.add("open"); }

// ---------- carga y render de la tabla ----------
async function cargar() {
  document.querySelectorAll("#filters .chip").forEach((c) =>
    c.classList.toggle("active", c.dataset.f === FILTRO)
  );
  const socios = await api("/socios?filtro=" + encodeURIComponent(FILTRO));
  const tbody = document.getElementById("tbody");
  const empty = document.getElementById("empty");

  document.getElementById("counter").textContent =
    `${socios.length} socio(s)` + (FILTRO !== "todos" ? ` · filtro: ${ESTADO_LABEL[FILTRO] || FILTRO}` : "");

  if (!socios.length) {
    tbody.innerHTML = "";
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  tbody.innerHTML = socios
    .map((s) => {
      const venc =
        s.estado === "inactivo" ? "—"
        : s.dias_hasta_vencimiento < 0 ? `Venció hace ${-s.dias_hasta_vencimiento} d`
        : `En ${s.dias_hasta_vencimiento} d`;
      const puedeAvisar = (s.estado === "moroso" || s.estado === "por_vencer");
      return `<tr>
        <td class="cell-socio">
          <div class="name"><a href="#" onclick="verDetalle(${s.id});return false;">${s.apellido}, ${s.nombre}</a></div>
          <div class="muted">${s.telefono || "sin teléfono"}</div>
        </td>
        <td data-label="Plan">${s.plan || "—"}</td>
        <td data-label="Cuota">${money(s.cuota_mensual)}</td>
        <td data-label="Estado"><span class="badge ${s.estado}">${ESTADO_LABEL[s.estado]}</span></td>
        <td data-label="Vencimiento" class="muted">${venc}</td>
        <td class="cell-actions">
          <div class="row-actions">
            ${puedeAvisar ? `<button class="btn wa sm" onclick="enviarAviso(${s.id})">WhatsApp</button>` : ""}
            ${s.estado !== "inactivo" ? `<button class="btn sm" onclick="abrirPago(${s.id})">Cobrar</button>` : ""}
            <button class="btn secondary sm" onclick="verDetalle(${s.id})">Ver</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");
}

// ---------- alta / edición ----------
function abrirSocio(s) {
  document.getElementById("mSocioTitle").textContent = s ? "Editar socio" : "Nuevo socio";
  document.getElementById("sId").value = s ? s.id : "";
  document.getElementById("sNombre").value = s ? s.nombre : "";
  document.getElementById("sApellido").value = s ? s.apellido : "";
  document.getElementById("sTelefono").value = s ? s.telefono : "";
  document.getElementById("sEmail").value = s ? s.email : "";
  document.getElementById("sPlan").value = s ? s.plan : "";
  document.getElementById("sCuota").value = s ? s.cuota_mensual : "";
  document.getElementById("sDia").value = s ? s.dia_vencimiento : 10;
  document.getElementById("sUltPago").value = s && s.fecha_ultimo_pago ? s.fecha_ultimo_pago.slice(0, 10) : "";
  abrir("mSocio");
}

async function guardarSocio() {
  const id = document.getElementById("sId").value;
  const body = {
    nombre: document.getElementById("sNombre").value,
    apellido: document.getElementById("sApellido").value,
    telefono: document.getElementById("sTelefono").value,
    email: document.getElementById("sEmail").value,
    plan: document.getElementById("sPlan").value,
    cuota_mensual: document.getElementById("sCuota").value,
    dia_vencimiento: document.getElementById("sDia").value,
    fecha_ultimo_pago: document.getElementById("sUltPago").value || null,
  };
  if (!body.nombre.trim()) return toast("El nombre es obligatorio.");
  try {
    if (id) await api("/socios/" + id, { method: "PUT", body });
    else await api("/socios", { method: "POST", body });
    cerrar("mSocio");
    toast(id ? "Socio actualizado." : "Socio creado.");
    cargar();
  } catch (e) { toast("No se pudo guardar."); }
}

// ---------- cobro ----------
let _socioCache = {};
async function abrirPago(id) {
  const s = _socioCache[id] || (await api("/socios/" + id));
  _socioCache[id] = s;
  document.getElementById("pSocioId").value = id;
  document.getElementById("pSocioNombre").textContent = `${s.nombre} ${s.apellido} — ${s.plan || ""}`;
  document.getElementById("pMonto").value = s.cuota_mensual;
  document.getElementById("pFecha").value = new Date().toISOString().slice(0, 10);
  document.getElementById("pMetodo").value = "Efectivo";
  abrir("mPago");
}

async function guardarPago() {
  const id = document.getElementById("pSocioId").value;
  const body = {
    monto: document.getElementById("pMonto").value,
    fecha: document.getElementById("pFecha").value,
    metodo: document.getElementById("pMetodo").value,
  };
  if (!body.monto) return toast("Ingresá el monto.");
  try {
    const r = await api("/socios/" + id + "/pago", { method: "POST", body });
    cerrar("mPago");
    delete _socioCache[id];
    toast(r.recupero ? "💚 ¡Pago registrado! Socio recuperado." : "Pago registrado.");
    cargar();
  } catch (e) { toast("No se pudo registrar el pago."); }
}

// ---------- aviso WhatsApp ----------
async function enviarAviso(id) {
  try {
    const r = await api("/socios/" + id + "/aviso");
    if (!r.tiene_telefono) return toast("Este socio no tiene teléfono cargado.");
    window.open(r.whatsapp_url, "_blank");
    toast(r.link_pago ? "Abriendo WhatsApp con link de pago." : "Abriendo WhatsApp.");
    cargar(); // refresca 'último aviso'
  } catch (e) { toast("No se pudo generar el aviso."); }
}

// ---------- detalle + historial ----------
async function verDetalle(id) {
  const s = await api("/socios/" + id);
  _socioCache[id] = s;
  document.getElementById("dTitle").textContent = `${s.nombre} ${s.apellido}`;
  const pagos = (s.pagos || [])
    .map((p) => `<div class="pago-row"><span>${p.fecha} · ${p.metodo}${p.recupero ? " · 💚" : ""}</span><b>${money(p.monto)}</b></div>`)
    .join("") || `<div class="muted">Sin pagos registrados.</div>`;

  document.getElementById("dBody").innerHTML = `
    <p><span class="badge ${s.estado}">${ESTADO_LABEL[s.estado]}</span></p>
    <div class="grid2">
      <div><div class="muted">Plan</div><b>${s.plan || "—"}</b></div>
      <div><div class="muted">Cuota</div><b>${money(s.cuota_mensual)}</b></div>
      <div><div class="muted">Teléfono</div><b>${s.telefono || "—"}</b></div>
      <div><div class="muted">Email</div><b>${s.email || "—"}</b></div>
      <div><div class="muted">Último pago</div><b>${s.fecha_ultimo_pago ? s.fecha_ultimo_pago.slice(0,10) : "—"}</b></div>
      <div><div class="muted">Último aviso</div><b>${s.fecha_ultimo_aviso ? s.fecha_ultimo_aviso.slice(0,10) : "—"}</b></div>
    </div>
    <h3 style="margin-top:18px;font-size:15px;">Historial de pagos</h3>
    ${pagos}`;

  const bajaLabel = s.dado_baja ? "Reactivar" : "Dar de baja";
  document.getElementById("dFoot").innerHTML = `
    <button class="btn secondary" onclick='editarDesdeDetalle(${id})'>Editar</button>
    <button class="btn danger" onclick="toggleBaja(${id}, ${s.dado_baja ? 0 : 1})">${bajaLabel}</button>`;
  abrir("mDetalle");
}

function editarDesdeDetalle(id) { cerrar("mDetalle"); abrirSocio(_socioCache[id]); }

async function toggleBaja(id, baja) {
  await api("/socios/" + id + "/baja", { method: "POST", body: { baja: !!baja } });
  cerrar("mDetalle");
  delete _socioCache[id];
  toast(baja ? "Socio dado de baja." : "Socio reactivado.");
  cargar();
}

// ---------- import CSV ----------
function abrirImport() { document.getElementById("importMsg").textContent = ""; document.getElementById("csvFile").value = ""; abrir("mImport"); }
async function subirCsv() {
  const f = document.getElementById("csvFile").files[0];
  if (!f) return toast("Elegí un archivo CSV.");
  const fd = new FormData();
  fd.append("archivo", f);
  try {
    const r = await api("/socios/import", { method: "POST", body: fd });
    document.getElementById("importMsg").innerHTML =
      `✅ Importados: <b>${r.creados}</b> · Omitidos (duplicados): ${r.omitidos}` +
      (r.errores && r.errores.length ? `<br>⚠️ ${r.errores.length} con error.` : "");
    toast(`Importados ${r.creados} socios.`);
    cargar();
  } catch (e) { toast("No se pudo importar el CSV."); }
}

// ---------- init ----------
document.querySelectorAll("#filters .chip").forEach((c) =>
  c.addEventListener("click", () => { FILTRO = c.dataset.f; cargar(); })
);
document.querySelectorAll(".modal-bg").forEach((m) =>
  m.addEventListener("click", (e) => { if (e.target === m) m.classList.remove("open"); })
);

(async function () { await guardSession(); cargar(); })();
