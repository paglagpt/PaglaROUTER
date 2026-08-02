/* PaglaROUTER live telemetry dashboard — fetches /health and renders provider state. */
(() => {
  const grid = document.getElementById("providers");
  const status = document.getElementById("gw-status");
  const updated = document.getElementById("updated");

  function setStatus(ok) {
    status.textContent = ok ? "ONLINE" : "OFFLINE";
    status.className = "badge " + (ok ? "ok" : "down");
  }

  function render(health) {
    if (!health || !health.providers) return;
    grid.innerHTML = "";
    const pct = (v, max) => Math.max(0, Math.min(100, Math.round((v / Math.max(1, max)) * 100)));

    for (const p of health.providers) {
      const q = p.quota || {};
      const live = p.healthy !== false;
      const card = document.createElement("div");
      card.className = "card";

      const title = document.createElement("h3");
      title.innerHTML = `<span>${p.label}</span><span class="${live ? "live" : "dead"}">${live ? "LIVE" : "DOWN"}</span>`;
      card.appendChild(title);

      const statusLine = document.createElement("div");
      statusLine.className = "status";
      statusLine.textContent = `model: ${p.default_model || "—"}  ·  reset: ${q.reset || "—"}`;
      card.appendChild(statusLine);

      const rows = [
        ["RPM", p.rpmRemaining ?? q.rpm ?? 0, q.rpm ?? 1],
        ["TPM", p.tpmRemaining ?? q.tpm ?? 0, q.tpm ?? 1],
        ["RPD", p.rpdRemaining ?? q.rpd ?? 0, q.rpd ?? 1],
      ];
      for (const [label, used, max] of rows) {
        const w = pct(max - Math.min(used, max), max);
        const meter = document.createElement("div");
        meter.innerHTML = `<div style="width:${w}%"></div>`;
        meter.className = "meter";
        const row = document.createElement("div");
        row.className = "row";
        row.innerHTML = `<span>${label}</span><b>${used} / ${max}</b>`;
        card.appendChild(row);
        card.appendChild(meter);
      }

      const models = document.createElement("div");
      models.className = "mono";
      models.textContent = p.models ? p.models.slice(0, 4).join(", ") : "";
      card.appendChild(models);

      grid.appendChild(card);
    }
  }

  async function poll() {
    try {
      const res = await fetch("/health", { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error("health check failed");
      const data = await res.json();
      setStatus(data.ok === true);
      render(data);
    } catch {
      setStatus(false);
      grid.innerHTML = `<div class="card mono">Gateway unreachable — is the Worker deployed to router.paglaai.space?</div>`;
    }
    if (updated) updated.textContent = new Date().toLocaleTimeString();
  }

  poll();
  setInterval(poll, 10000);
})();
