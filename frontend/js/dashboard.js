// Dashboard: KPIs estilo SaaS con iconografía consistente.
(async function () {
  await guardSession();
  const k = await api("/dashboard");

  const cards = [
    { label: "Socios al día", value: k.socios_activos, ic: "users", t: "t-green" },
    { label: "Deudores", value: k.socios_morosos, ic: "alert", t: "t-red" },
    { label: "Vencimientos próximos", value: k.socios_por_vencer, ic: "calendar", t: "t-amber" },
    { label: "Nuevos socios (mes)", value: k.socios_nuevos_mes, ic: "userplus", t: "" },
    { label: "Facturación mensual", value: money(k.facturacion_esperada), ic: "dollar", t: "" },
    { label: "Cobrado este mes", value: money(k.cobrado_mes), ic: "wallet", t: "t-green" },
    { label: "Pendiente de cobro", value: money(k.pendiente), ic: "alert", t: "t-red" },
    { label: "Recuperado este mes", value: money(k.recuperado_mes), ic: "trending", t: "feature" },
  ];

  document.getElementById("kpis").innerHTML = cards
    .map(
      (c) => `<div class="kpi ${c.t}">
        <div class="kpi-top">
          <div class="kpi-ic">${icon(c.ic, 18)}</div>
          <div class="label">${c.label}</div>
        </div>
        <div class="value">${c.value}</div>
      </div>`
    )
    .join("");
})();
