// Dashboard: carga KPIs y los pinta.
(async function () {
  await guardSession();
  const k = await api("/dashboard");

  const cards = [
    { label: "Socios al día", value: k.socios_activos, cls: "green" },
    { label: "Morosos", value: k.socios_morosos, cls: "red" },
    { label: "Por vencer", value: k.socios_por_vencer, cls: "amber" },
    { label: "Socios activos (total)", value: k.socios_total - k.socios_inactivos, cls: "" },
    { label: "Facturación esperada (mes)", value: money(k.facturacion_esperada), cls: "" },
    { label: "Cobrado este mes", value: money(k.cobrado_mes), cls: "green" },
    { label: "Pendiente de cobro", value: money(k.pendiente), cls: "red" },
    { label: "Recuperado este mes", value: money(k.recuperado_mes), cls: "star" },
  ];

  document.getElementById("kpis").innerHTML = cards
    .map(
      (c) => `<div class="kpi ${c.cls}">
        <div class="label">${c.label}</div>
        <div class="value">${c.value}</div>
      </div>`
    )
    .join("");
})();
