// Configuración del gimnasio: token Mercado Pago, alias y umbrales de estado.
(async function () {
  const me = await guardSession();
  document.getElementById("cAlias").value = me.alias_cbu || "";
  document.getElementById("cPorVencer").value = me.dias_por_vencer;
  document.getElementById("cMoroso").value = me.dias_para_moroso;
  document.getElementById("mpStatus").innerHTML = me.tiene_mp
    ? "✅ Hay un token de Mercado Pago cargado. Dejá el campo vacío para mantenerlo."
    : "⚠️ Todavía no cargaste el token. Por ahora los avisos usan el alias.";
})();

async function guardar() {
  const body = {
    mp_access_token: document.getElementById("cMp").value.trim(), // vacío = mantener
    alias_cbu: document.getElementById("cAlias").value.trim(),
    dias_por_vencer: document.getElementById("cPorVencer").value || 5,
    dias_para_moroso: document.getElementById("cMoroso").value || 30,
  };
  try {
    await api("/config", { method: "POST", body });
    toast("Configuración guardada.");
    document.getElementById("cMp").value = "";
    const me = await api("/me");
    document.getElementById("mpStatus").innerHTML = me.tiene_mp
      ? "✅ Hay un token de Mercado Pago cargado. Dejá el campo vacío para mantenerlo."
      : "⚠️ Todavía no cargaste el token. Por ahora los avisos usan el alias.";
  } catch (e) {
    toast("No se pudo guardar.");
  }
}
