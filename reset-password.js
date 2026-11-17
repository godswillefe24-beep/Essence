const API_BASE = `${window.location.origin}/api`;
const requestForm = document.getElementById("request-reset-form");
const resetForm = document.getElementById("new-password-form");
const message = document.getElementById("reset-message");
const token = new URLSearchParams(window.location.search).get("token");

if (token) {
  requestForm.hidden = true;
  resetForm.hidden = false;
}

requestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "If the account exists, a reset link will be sent.";
  try {
    const response = await fetch(`${API_BASE}/auth/password-reset/request`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: document.getElementById("reset-email").value,
      }),
    });
    const data = await response.json();
    message.textContent = data.message || data.error || "Request failed.";
  } catch {
    message.textContent = "Could not reach the server. Please try again.";
  }
});

resetForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const response = await fetch(`${API_BASE}/auth/password-reset/complete`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        password: document.getElementById("new-password").value,
      }),
    });
    const data = await response.json();
    message.textContent = response.ok
      ? "Password changed. You can now log in."
      : data.error || "This link is invalid or expired.";
    if (response.ok) {
      resetForm.reset();
      window.history.replaceState({}, "", window.location.pathname);
    }
  } catch {
    message.textContent = "Could not reach the server. Please try again.";
  }
});
