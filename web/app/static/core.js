const API_BASE = "/api";

const HOUSE_MOTTOS = {
    Stark: "Winter Is Coming",
    Lannister: "Hear Me Roar!",
    Targaryen: "Fire and Blood",
    Baratheon: "Ours Is the Fury"
};

let currentUser = null;
let housesList = [];
let housesMap = {};

async function apiFetch(endpoint, options = {}) {
    const isFormData = options.body instanceof FormData;
    const headers = isFormData
        ? { ...options.headers }
        : {
            "Content-Type": "application/json",
            ...options.headers
        };

    const response = await fetch(API_BASE + endpoint, {
        credentials: "same-origin",
        ...options,
        headers
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || "Request failed (" + response.status + ")");
    }
    return data;
}

function showAlert(message, isError = false) {
    const box = document.getElementById("alert-box");
    if (!box) return;
    box.textContent = message;
    box.className = isError ? "alert error" : "alert";
    setTimeout(() => box.classList.add("hidden"), 5000);
}

function getHouseBannerClass(houseName) {
    if (!houseName) return "banner-default";
    const key = houseName.toLowerCase();
    if (key.includes("stark")) return "banner-stark";
    if (key.includes("lannister")) return "banner-lannister";
    if (key.includes("targaryen")) return "banner-targaryen";
    if (key.includes("baratheon")) return "banner-baratheon";
    return "banner-default";
}

function getInitials(name) {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function loadDictionaries() {
    try {
        const [roles, houses] = await Promise.all([
            apiFetch("/roles"),
            apiFetch("/houses")
        ]);

        housesList = houses;
        housesMap = {};
        houses.forEach(h => { housesMap[h.id] = h; });

        const roleSelect = document.getElementById("reg-role");
        if (roleSelect) {
            roleSelect.innerHTML = roles.map(r =>
                '<option value="' + r.id + '">' + r.role_name.toUpperCase() + '</option>'
            ).join("");
        }

        const houseOptionsHtml = '<option value="all">All Great Houses</option>' +
            houses.map(h => '<option value="' + h.id + '">House ' + h.name + '</option>').join("");

        const filterKnights = document.getElementById("filter-knights");
        if (filterKnights) filterKnights.innerHTML = houseOptionsHtml;

        const filterLords = document.getElementById("filter-lords");
        if (filterLords) filterLords.innerHTML = houseOptionsHtml;

        const houseSelect = document.getElementById("reg-house");
        if (houseSelect) {
            houseSelect.innerHTML = '<option value="">No House (Free Rider / Commonfolk)</option>' +
                houses.map(h => '<option value="' + h.id + '">House ' + h.name + '</option>').join("");
        }

        const params = new URLSearchParams(window.location.search);
        const houseParam = params.get("house");
        if (houseParam) {
            if (filterKnights) filterKnights.value = houseParam;
            if (filterLords) filterLords.value = houseParam;
        }
    } catch (err) {
        console.warn("Could not load dictionaries:", err.message);
    }
}

async function checkAuth() {
    try {
        currentUser = await apiFetch("/me");
        updateNavUI(currentUser);
    } catch (_) {
        currentUser = null;
        updateNavUI(null);
    }
}

function updateNavUI(user) {
    const isLoggedIn = Boolean(user);
    const hasHouse = isLoggedIn && user.house_id !== null;
    const navProfile = document.getElementById("nav-profile");
    if (navProfile) navProfile.classList.toggle("hidden", !isLoggedIn);
    const navLogout = document.getElementById("nav-logout");
    if (navLogout) navLogout.classList.toggle("hidden", !isLoggedIn);
    const navAuth = document.getElementById("nav-auth");
    if (navAuth) navAuth.classList.toggle("hidden", isLoggedIn);
    const navHouse = document.getElementById("nav-house");
    if (navHouse) navHouse.classList.toggle("hidden", !hasHouse);

    let badgeText = "Guest (Spectator)";
    if (user) {
        const houseObj = housesMap[user.house_id];
        const houseLabel = houseObj ? "House " + houseObj.name : "No House";
        badgeText = user.username + " • " + user.role + " (" + houseLabel + ")";
    }

    const badgeKnights = document.getElementById("user-badge-knights");
    if (badgeKnights) badgeKnights.textContent = badgeText;
    const badgeLords = document.getElementById("user-badge-lords");
    if (badgeLords) badgeLords.textContent = badgeText;
}

async function logout() {
    try {
        await apiFetch("/auth/logout", { method: "POST" });
    } catch (_) { }
    currentUser = null;
    updateNavUI(null);
    showAlert("You have left the realm.");
    setTimeout(() => {
        window.location.href = "/login";
    }, 300);
}

// Global initialization of shared state and auth
window.coreInitPromise = (async () => {
    await loadDictionaries();
    await checkAuth();
})();