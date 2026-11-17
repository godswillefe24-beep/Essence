const API_BASE = `${window.location.origin}/api`;
let isLoggedIn = false;

const loginBtn = document.getElementById("admin-login-btn");
const logoutBtn = document.getElementById("admin-logout-btn");
const exportBtn = document.getElementById("export-subs-btn");
const passInput = document.getElementById("admin-password");
const message = document.getElementById("login-message");
const subsSection = document.getElementById("subscribers-section");
const subsList = document.getElementById("subscribers-list");

function setLoggedIn() {
  isLoggedIn = true;
  subsSection.classList.remove("hidden");
  logoutBtn.classList.remove("hidden");
  exportBtn.classList.remove("hidden");
  loginBtn.classList.add("hidden");
  passInput.classList.add("hidden");
  message.textContent = "";
  loadSubscribers();
}

function setLoggedOut() {
  isLoggedIn = false;
  subsSection.classList.add("hidden");
  logoutBtn.classList.add("hidden");
  exportBtn.classList.add("hidden");
  loginBtn.classList.remove("hidden");
  passInput.classList.remove("hidden");
  subsList.replaceChildren();
}

loginBtn.addEventListener("click", async () => {
  const password = passInput.value;
  if (!password) {
    message.textContent = "Enter admin password";
    return;
  }
  message.textContent = "Logging in...";

  try {
    const response = await fetch(`${API_BASE}/admin/login`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await response.json();
    passInput.value = "";
    if (response.ok && data.success) {
      setLoggedIn();
    } else {
      message.textContent = data.error || "Login failed";
    }
  } catch {
    message.textContent = "Server error";
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await fetch(`${API_BASE}/admin/logout`, {
      method: "POST",
      credentials: "same-origin",
    });
  } finally {
    setLoggedOut();
  }
});

exportBtn.addEventListener("click", async () => {
  if (!isLoggedIn) return;
  try {
    const response = await fetch(`${API_BASE}/admin/subscribers/export`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) return alert("Export failed");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "subscribers.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  } catch {
    alert("Export failed");
  }
});

async function loadSubscribers() {
  subsList.textContent = "Loading...";
  try {
    const response = await fetch(`${API_BASE}/admin/subscribers`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) {
      subsList.textContent = "Failed to load subscribers";
      if (response.status === 401) setLoggedOut();
      return;
    }

    const list = await response.json();
    subsList.replaceChildren();
    if (list.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No subscribers yet.";
      subsList.appendChild(empty);
      return;
    }

    list.forEach((subscriber) => {
      const row = document.createElement("div");
      row.className = "subscriber-row";
      const email = document.createElement("div");
      const strong = document.createElement("strong");
      strong.textContent = subscriber.email;
      email.appendChild(strong);
      const date = document.createElement("div");
      date.style.color = "var(--muted)";
      date.textContent = subscriber.date;
      const actions = document.createElement("div");
      const button = document.createElement("button");
      button.className = "btn delete-subscriber";
      button.textContent = "Delete";
      button.addEventListener("click", async () => {
        if (!confirm("Delete subscriber?")) return;
        try {
          const deleteResponse = await fetch(
            `${API_BASE}/admin/subscribers/${encodeURIComponent(subscriber.id)}`,
            { method: "DELETE", credentials: "same-origin" },
          );
          if (deleteResponse.ok) {
            loadSubscribers();
          } else {
            alert("Failed to delete");
          }
        } catch {
          alert("Server error");
        }
      });
      actions.appendChild(button);
      row.append(email, date, actions);
      subsList.appendChild(row);
    });
  } catch {
    subsList.textContent = "Error loading subscribers";
  }
}

fetch(`${API_BASE}/admin/subscribers`, {
  credentials: "same-origin",
  cache: "no-store",
})
  .then((response) => {
    if (response.ok) setLoggedIn();
  })
  .catch(() => {});
