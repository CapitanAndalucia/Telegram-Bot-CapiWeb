// Si API_URL no viene del template, fallback
const API = (typeof API_URL !== "undefined" && API_URL) ? API_URL : "/api/tickets/";
let page = 1;
let hasMore = true;
let editingId = null;

// ---- util CSRF ----
function getCookie(name) {
  let cookieValue = null;
  if (document.cookie && document.cookie !== "") {
    const cookies = document.cookie.split(";");
    for (let cookie of cookies) {
      cookie = cookie.trim();
      if (cookie.startsWith(name + "=")) {
        cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
        break;
      }
    }
  }
  return cookieValue;
}
const csrftoken = getCookie("csrftoken");

async function fetchWithAuth(url, opts = {}) {
  opts.credentials = "same-origin";
  opts.headers = opts.headers || {};
  if (!opts.method || ["POST","PUT","PATCH","DELETE"].includes(opts.method.toUpperCase())) {
    opts.headers["X-CSRFToken"] = csrftoken || "";
  }
  return fetch(url, opts);
}

// ---- fetch tickets ----
async function fetchTickets(reset=false) {
  if (reset) {
    page = 1;
    hasMore = true;
    document.getElementById("ticketsContainer").innerHTML = "";
  }
  if (!hasMore && !reset) return;

  const dateFrom = document.getElementById("dateFrom").value;
  const dateTo = document.getElementById("dateTo").value;
  const sort = document.getElementById("sortOrder").value;

  let url = new URL(API, window.location.origin);
  url.searchParams.set("page", page);
  url.searchParams.set("ordering", sort === "newest" ? "-fecha" : "fecha");
  if (dateFrom) url.searchParams.set("fecha__gte", dateFrom);
  if (dateTo) url.searchParams.set("fecha__lte", dateTo);

  const res = await fetchWithAuth(url.toString());
  if (!res.ok) {
    console.error(await res.text());
    return;
  }
  const data = await res.json();
  (data.results || data).forEach(renderTicket);
  
  // Solo mostrar información si hay filtros de fecha aplicados
  if (dateFrom || dateTo) {
    // Calcular total gastado
    const totalGastado = (data.results || data).reduce((sum, ticket) => sum + parseFloat(ticket.coste || 0), 0);
    const count = data.count || (data.results || data).length;
    document.getElementById("ticketCount").innerText = `${count} tickets - Total gastado: ${totalGastado.toFixed(2)} €`;
  } else {
    // Sin filtros, no mostrar información de totales
    document.getElementById("ticketCount").innerText = "";
  }
  
  hasMore = !!data.next;
  document.getElementById("loadMoreBtn").style.display = hasMore ? "block" : "none";
}

function renderTicket(ticket) {
  const container = document.getElementById("ticketsContainer");
  const card = document.createElement("div");
  card.className = "ticket-card";
  const fecha = ticket.fecha ? ticket.fecha.split("T")[0] : "";
  card.innerHTML = `
    <div class="ticket-info">
      <div class="ticket-id">ID: ${ticket.id}</div>
      <div class="ticket-concept">${escapeHtml(ticket.titulo)}</div>
      <div class="ticket-datetime">
        <span>📅 ${formatDate(fecha)}</span>
        <span>💰 ${ticket.coste} €</span>
      </div>
    </div>
    <div class="ticket-actions">
      <button class="action-btn edit-btn" onclick="openModal(${ticket.id}, '${escapeJs(ticket.titulo)}', '${ticket.coste}', '${fecha}')">
        <span>✏️</span> Editar
      </button>
      <button class="action-btn delete-btn" onclick="deleteTicket(${ticket.id})">
        <span>🗑️</span> Eliminar
      </button>
    </div>
  `;
  container.appendChild(card);
}

function formatDate(dateString) {
  if (!dateString) return "";
  const d = new Date(dateString + "T00:00:00");
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
}
function escapeJs(text) {
  if (typeof text !== "string") return "";
  return text.replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "");
}

// ---- Modal ----
function openModal(id=null, titulo="", coste="", fecha="") {
  editingId = id;
  document.getElementById("modalTitle").innerText = id ? "Editar Ticket" : "Crear Nuevo Ticket";
  document.getElementById("ticketConcept").value = titulo || "";
  document.getElementById("ticketCoste").value = coste || "";
  document.getElementById("ticketFecha").value = fecha || "";
  document.getElementById("ticketModal").classList.add("active");
}
function closeModal() {
  editingId = null;
  document.getElementById("ticketForm").reset();
  document.getElementById("ticketModal").classList.remove("active");
}

// ---- CRUD ----
document.getElementById("ticketForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const titulo = document.getElementById("ticketConcept").value.trim();
  const coste = document.getElementById("ticketCoste").value;
  const fecha = document.getElementById("ticketFecha").value;

  const payload = {
    titulo,
    coste,
    fecha: fecha ? (fecha + "T00:00:00Z") : new Date().toISOString(),
    moneda: "EUR"
  };

  const method = editingId ? "PUT" : "POST";
  const url = editingId ? `${API}${editingId}/` : API;

  await fetchWithAuth(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  closeModal();
  fetchTickets(true);
});

async function deleteTicket(id) {
  if (!confirm("¿Eliminar ticket?")) return;
  await fetchWithAuth(`${API}${id}/`, { method: "DELETE" });
  fetchTickets(true);
}

// ---- filtros ----
function clearFilters() {
  document.getElementById("dateFrom").value = "";
  document.getElementById("dateTo").value = "";
  document.getElementById("sortOrder").value = "newest";
  fetchTickets(true);
}
document.getElementById("dateFrom").addEventListener("change", () => fetchTickets(true));
document.getElementById("dateTo").addEventListener("change", () => fetchTickets(true));
document.getElementById("sortOrder").addEventListener("change", () => fetchTickets(true));

function loadMore() {
  if (!hasMore) return;
  page++;
  fetchTickets();
}

// cerrar modal al click fuera
document.getElementById("ticketModal").addEventListener("click", (e) => {
  if (e.target.classList.contains("modal")) closeModal();
});

// inicio
fetchTickets(true);
