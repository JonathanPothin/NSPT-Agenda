const EDGE_FUNCTION_URL =
  "https://dgudohauvnnlzeynfskt.supabase.co/functions/v1/notify";

// Cache local des événements pour construire les messages de confirmation
let EVENTS_CACHE = {};

// Auth / rôle admin
let currentUser = null;
let isAdmin = false;

// ------------------ UTIL ------------------

function buildConfirmationMessage(name, ev) {
  const date = ev.event_date || "";
  const time = ev.event_time || "";
  const location = ev.location || "";

  return (
    `Bonjour ${name},\n\n` +
    `Inscription à : "${ev.title}".\n` +
    (date ? `📅Date: ${date}${time ? " à " + time : ""}\n` : "") +
    (location ? `📍Lieu: ${location}\n` : "") +
    `\nL'équipe NSPT`
  );
}

// Comparateurs de dates pour trier les événements
function compareEventsAsc(a, b) {
  const da = a.event_date || "9999-12-31";
  const db = b.event_date || "9999-12-31";
  if (da !== db) return da < db ? -1 : 1;

  const ta = a.event_time || "00:00";
  const tb = b.event_time || "00:00";
  if (ta === tb) return 0;
  return ta < tb ? -1 : 1;
}

function compareEventsDesc(a, b) {
  return -compareEventsAsc(a, b);
}

// Appelle la Edge Function `notify` pour envoyer mail/SMS
async function callNotify(params) {
  const { email, phone, subject, message } = params;

  try {
    const res = await fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ email, phone, subject, message }),
    });

    let data = {};
    try {
      data = await res.json();
    } catch (e) {
      // pas grave si le body n'est pas du JSON
    }

    if (!res.ok || data.ok === false) {
      console.error("Erreur notify:", res.status, data);
    } else {
      console.log("Notify OK:", data);
    }
  } catch (err) {
    console.error("Erreur appel notify:", err);
  }
}

// ------------------ AUTH / UI ADMIN ------------------

function updateAuthUI() {
  const loginCard = document.getElementById("admin-login-card");
  const adminSection = document.getElementById("admin-section");
  const statusSpan = document.getElementById("admin-status");

  if (isAdmin) {
    if (adminSection) adminSection.style.display = "block";
    if (loginCard) loginCard.style.display = "none";

    if (statusSpan) {
      statusSpan.textContent = "Connecté en tant qu’organisateur";
      statusSpan.classList.add("admin-status--on");
    }
  } else {
    if (adminSection) adminSection.style.display = "none";

    if (statusSpan) {
      statusSpan.textContent = "Non connecté";
      statusSpan.classList.remove("admin-status--on");
    }
    // le loginCard reste caché tant que l'user ne clique pas sur le bouton
  }
}

async function initAuthAndUI() {
  try {
    const { data } = await sb.auth.getSession();
    currentUser = data.session?.user || null;
    isAdmin = !!currentUser?.app_metadata?.is_admin;
    console.log("Session actuelle:", currentUser, "isAdmin:", isAdmin);
  } catch (e) {
    console.error("Erreur récupération session:", e);
    currentUser = null;
    isAdmin = false;
  }

  updateAuthUI();
}

async function handleAdminLogin() {
  const emailEl = document.getElementById("adminEmail");
  const passEl = document.getElementById("adminPassword");
  const msgEl = document.getElementById("adminLoginMsg");

  if (!emailEl || !passEl || !msgEl) return;

  const email = (emailEl.value || "").trim();
  const password = passEl.value || "";

  msgEl.textContent = "";
  msgEl.style.color = "inherit";

  if (!email || !password) {
    msgEl.textContent = "Email et mot de passe requis.";
    msgEl.style.color = "red";
    return;
  }

  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("Erreur login admin:", error);
    msgEl.textContent = "Connexion impossible. Vérifiez vos identifiants.";
    msgEl.style.color = "red";
    return;
  }

  currentUser = data.user;
  isAdmin = !!currentUser?.app_metadata?.is_admin;

  if (!isAdmin) {
    msgEl.textContent =
      "Ce compte n'a pas les droits organisateur (is_admin=false).";
    msgEl.style.color = "red";
    await sb.auth.signOut();
    currentUser = null;
    isAdmin = false;
    updateAuthUI();
    return;
  }

  msgEl.textContent = "Connecté en tant qu’organisateur.";
  msgEl.style.color = "lightgreen";

  updateAuthUI();
  // recharge les événements pour afficher les noms
  loadEvents();
}

async function handleAdminLogout() {
  try {
    await sb.auth.signOut();
  } catch (e) {
    console.error("Erreur logout:", e);
  }

  currentUser = null;
  isAdmin = false;
  updateAuthUI();
  loadEvents();
}

// ------------------ RENDU D'UN ÉVÉNEMENT ------------------

function renderEventCard(ev, participantsByEvent) {
  EVENTS_CACHE[ev.id] = ev;
  const count = ev.participant_count || 0;

  // bloc admin : liste des participants
  let adminBlock = "";
  if (isAdmin) {
    const list = (participantsByEvent && participantsByEvent[ev.id]) || [];
    if (list.length > 0) {
      adminBlock += `<div class="admin-participants">
        <div class="admin-participants-title">Participants (${list.length})</div>
        <ul>`;
      list.forEach((p) => {
        const name = p.name || "Sans nom";
        const contact = p.contact ? ` – <span>${p.contact}</span>` : "";
        adminBlock += `<li>${name}${contact}</li>`;
      });
      adminBlock += `</ul></div>`;
    } else {
      adminBlock += `<div class="admin-participants admin-participants-empty">
        Aucun participant pour le moment.
      </div>`;
    }
  }

  return `
    <div class="event">
      <div class="event-title">${ev.title}</div>
      <div class="event-meta">
        📅 <strong>${ev.event_date || ""}</strong>
        ${ev.event_time ? " — " + ev.event_time : ""}
        ${ev.location ? "<br>📍 " + ev.location : ""}
        <br>👥 ${count} inscrit${count > 1 ? "s" : ""}
      </div>

      ${adminBlock}

      <div class="join-card">
        <input type="text" id="name-${ev.id}" placeholder="Nom">
        <input type="email" id="email-${ev.id}" placeholder="Email (ou SMS au choix)">
        <input type="tel" id="phone-${ev.id}" placeholder="Téléphone (ou Email au choix)">
        <button class="btn btn-full" onclick="joinEvent('${ev.id}')">Je participe</button>
        <p id="msg-${ev.id}"></p>
      </div>
    </div>
  `;
}

 //------------------ CHARGEMENT DES ÉVÉNEMENTS ------------------

async function loadEvents() {
  const container = document.getElementById("events");
  if (!container) return;

  container.innerHTML = "<p>Chargement...</p>";

  const { data: events, error } = await sb
    .from("events")
    .select("*")
    .order("event_date", { ascending: true })
    .order("event_time", { ascending: true });

  if (error) {
    console.error(error);
    container.innerHTML = "<p>Erreur chargement des événements.</p>";
    return;
  }

  if (!events || events.length === 0) {
    container.innerHTML = "<p>Aucun événement pour le moment.</p>";
    return;
  }

  EVENTS_CACHE = {};
  let participantsByEvent = {};

   //Si admin connecté, on charge aussi la liste des participants
  if (isAdmin) {
    const ids = events.map((ev) => ev.id);
    if (ids.length > 0) {
      const { data: participants, error: pErr } = await sb
        .from("event_participants")
        .select("id, event_id, name, contact, created_at")
        .in("event_id", ids)
        .order("created_at", { ascending: true });

      if (pErr) {
        console.error("Erreur chargement participants:", pErr);
      } else if (participants) {
        participantsByEvent = participants.reduce((acc, p) => {
          if (!acc[p.event_id]) acc[p.event_id] = [];
          acc[p.event_id].push(p);
          return acc;
        }, {});
      }
    }
  }

//   --- séparation événements à venir / passés ---

 //  today au format YYYY-MM-DD
  const todayStr = new Date().toISOString().slice(0, 10);

  const upcoming = [];
  const past = [];

  events.forEach((ev) => {
    if (ev.event_date && ev.event_date < todayStr) {
      past.push(ev);
    } else {
      upcoming.push(ev);
    }
  });

   //tri : à venir du plus proche au plus lointain, passés du plus récent au plus ancien
  upcoming.sort(compareEventsAsc);
  past.sort(compareEventsDesc);

  let html = "";

   //Événements à venir
  if (upcoming.length > 0) {
    html += `<h2 class="events-section-title">Événements à venir</h2>`;
    upcoming.forEach((ev) => {
      html += renderEventCard(ev, participantsByEvent);
    });
  } else {
    html += `<p>Aucun événement à venir.</p>`;
  }

   //Événements passés (dans un bloc repliable)
  if (past.length > 0) {
    html += `
      <details class="events-past">
        <summary>Événements passés (${past.length})</summary>
        <div class="events-past-list">
    `;
    past.forEach((ev) => {
      html += renderEventCard(ev, participantsByEvent);
    });
    html += `</div></details>`;
  }

  container.innerHTML = html;
}

// ------------------ INSCRIPTION A UN ÉVÉNEMENT ------------------

async function joinEvent(eventId) {
  const nameEl = document.getElementById("name-" + eventId);
  const emailEl = document.getElementById("email-" + eventId);
  const phoneEl = document.getElementById("phone-" + eventId);
  const msg = document.getElementById("msg-" + eventId);

  if (!nameEl || !msg) return;

  const name = (nameEl.value || "").trim();
  const email = (emailEl && emailEl.value ? emailEl.value.trim() : "");
  const phone = (phoneEl && phoneEl.value ? phoneEl.value.trim() : "");

  if (!name) {
    msg.textContent = "Merci de renseigner au moins le nom.";
    msg.style.color = "red";
    return;
  }

  // déduire le type de contact
  let contact_type = null;
  if (email && phone) contact_type = "email+sms";
  else if (email) contact_type = "email";
  else if (phone) contact_type = "sms";

  let contact = "";
  if (email) contact += "email:" + email;
  if (phone) contact += (contact ? " | " : "") + "tel:" + phone;

  const { error } = await sb.from("event_participants").insert({
    event_id: eventId,
    name: name,
    contact: contact || null,
    contact_type: contact_type,
  });

  if (error) {
    console.error(error);
    msg.textContent = "Erreur lors de l'enregistrement.";
    msg.style.color = "red";
    return;
  }

  msg.textContent = contact
    ? "Inscription enregistrée."
    : "Inscription enregistrée (sans moyen de contact).";
  msg.style.color = "lightgreen";

  // Envoi mail / SMS si contact fourni
  try {
    if (contact_type && (email || phone)) {
      let ev = EVENTS_CACHE[eventId];

       sécurité : si pas dans le cache, on recharge depuis la BDD
      if (!ev) {
        const { data } = await sb
          .from("events")
          .select("*")
          .eq("id", eventId)
          .maybeSingle();

        if (data) {
          ev = data;
          EVENTS_CACHE[eventId] = ev;
        }
      }

      if (ev) {
        const subject = `Confirmation participation – ${ev.title}`;
        const message = buildConfirmationMessage(name, ev);

        await callNotify({
          email: email || null,
          phone: phone || null,
          subject: subject,
          message: message,
        });
      }
    }
  } catch (err) {
    console.error("Erreur durant la notification (mail/sms) :", err);
  }

 //  vider les champs
  nameEl.value = "";
  if (emailEl) emailEl.value = "";
  // on peut laisser le téléphone 

  // le realtime mettra à jour, mais pour l'utilisateur courant on recharge
  loadEvents();
}

// ------------------ CREATION D'ÉVÉNEMENT ------------------

async function handleCreateEvent() {
  const titleEl = document.getElementById("evTitle");
  const dateEl = document.getElementById("evDate");
  const timeEl = document.getElementById("evTime");
  const locationEl = document.getElementById("evLocation");
  const descEl = document.getElementById("evDesc");
  const msg = document.getElementById("msgCreate");

  if (!titleEl || !dateEl || !msg) return;

  const title = (titleEl.value || "").trim();
  const date = dateEl.value || "";
  const time = timeEl ? timeEl.value : "";
  const location = locationEl ? (locationEl.value || "").trim() : "";
  const desc = descEl ? (descEl.value || "").trim() : "";

  if (!title || !date) {
    msg.textContent = "Titre + date obligatoires.";
    msg.style.color = "red";
    return;
  }

  const { error } = await sb.from("events").insert({
    title: title,
    event_date: date,
    event_time: time || null,
    location: location || null,
    description: desc || null,
  });

  if (error) {
    console.error(error);
    msg.textContent = "Erreur lors de la création.";
    msg.style.color = "red";
    return;
  }

  msg.textContent = "Événement créé.";
  msg.style.color = "lightgreen";

  // Realtime s'occupe de pousser aux autres, on force un reload pour le créateur
  loadEvents();
}

// ------------------ REALTIME SUPABASE ------------------

let eventsChannel = null;

function setupRealtime() {
  if (!sb || !sb.channel) {
    console.warn("Realtime Supabase indisponible (sb.channel manquant)");
    return;
  }

  if (eventsChannel) return; // déjà abonné

  eventsChannel = sb
    .channel("agenda-realtime")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "events" },
      (payload) => {
        console.log("Realtime events:", payload.eventType, payload.new || payload.old);
        loadEvents();
      }
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "event_participants" },
      (payload) => {
        console.log("Realtime participant:", payload.new);
        loadEvents();
      }
    )
    .subscribe((status) => {
      console.log("Etat canal realtime:", status);
    });
}

// ------------------ INIT ------------------

document.addEventListener("DOMContentLoaded", async function () {
  console.log("Supabase connecté");

  // init auth + UI
  await initAuthAndUI();

  // active le temps réel
  setupRealtime();

  // chargement initial des événements
  await loadEvents();

  // bouton création d'événement (admin)
  const btn = document.getElementById("btnCreate");
  if (btn) {
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      handleCreateEvent();
    });
  }

  // login admin
  const loginBtn = document.getElementById("adminLoginBtn");
  if (loginBtn) {
    loginBtn.addEventListener("click", function (e) {
      e.preventDefault();
      handleAdminLogin();
    });
  }

  // logout admin
  const logoutBtn = document.getElementById("adminLogoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", function (e) {
      e.preventDefault();
      handleAdminLogout();
    });
  }

  // bouton qui montre / cache le bloc de login
  const toggleBtn = document.getElementById("adminToggleBtn");
  const loginCard = document.getElementById("admin-login-card");
  if (toggleBtn && loginCard) {
    toggleBtn.addEventListener("click", function (e) {
      e.preventDefault();
      if (isAdmin) {
        return; // si déjà connecté, on ne montre pas le bloc login
      }
      const currentDisplay = loginCard.style.display || "none";
      loginCard.style.display = currentDisplay === "none" ? "block" : "none";
    });
  }
});

// rendre joinEvent global pour les boutons onclick dans le HTML
window.joinEvent = joinEvent;

// ------------------ PWA INSTALL PROMPT ------------------

let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;

  const installBtn = document.getElementById("installPWA");
  if (installBtn) installBtn.classList.remove("hidden");

  console.log("PWA install prompt prêt");
});

const installBtn = document.getElementById("installPWA");
if (installBtn) {
  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;

    console.log("Résultat installation :", choice);
    deferredPrompt = null;

    installBtn.classList.add("hidden");
  });
}
