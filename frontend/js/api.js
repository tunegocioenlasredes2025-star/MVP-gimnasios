// Helpers compartidos: fetch a la API, formato de moneda, toast y guardia de sesión.

async function api(path, options = {}) {
  const opts = { credentials: "same-origin", headers: {}, ...options };
  if (opts.body && !(opts.body instanceof FormData)) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch("/api" + path, opts);
  if (res.status === 401) {
    // Sesión vencida o no logueado.
    if (!location.pathname.endsWith("index.html") && location.pathname !== "/") {
      location.href = "/index.html";
    }
    throw new Error("no_autenticado");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "error"), { data });
  return data;
}

function money(n) {
  return "$" + Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2600);
}

// Protege páginas internas y pinta el nombre del gimnasio en el sidebar.
async function guardSession() {
  try {
    const me = await api("/me");
    document.querySelectorAll("[data-gym-name]").forEach((el) => (el.textContent = me.gimnasio));
    return me;
  } catch (e) {
    location.href = "/index.html";
    throw e;
  }
}

async function logout() {
  await api("/logout", { method: "POST" });
  location.href = "/index.html";
}

const ESTADO_LABEL = {
  activo: "Al día",
  por_vencer: "Por vencer",
  moroso: "Moroso",
  inactivo: "Inactivo",
};
