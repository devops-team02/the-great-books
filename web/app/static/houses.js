const DEFAULT_HOUSE_MOTTOS = {
    "Stark": "Winter Is Coming",
    "Lannister": "Hear Me Roar!",
    "Targaryen": "Fire and Blood",
    "Baratheon": "Ours Is the Fury"
};

function getHouseMotto(house) {
    if (house.motto) return house.motto;
    if (typeof HOUSE_MOTTOS !== "undefined" && HOUSE_MOTTOS[house.name]) {
        return HOUSE_MOTTOS[house.name];
    }
    return DEFAULT_HOUSE_MOTTOS[house.name] || "Words Unrecorded";
}

function renderHousesPage() {
    const grid = document.getElementById("houses-grid");
    if (!grid) return;

    const countEl = document.getElementById("houses-count");
    if (countEl) countEl.textContent = housesList.length + " Great Houses";

    const role = (currentUser?.role || "").toLowerCase();
    const createHouseButton = document.getElementById("create-house-button");
    const canCreateHouse = currentUser && role === "noble" && !currentUser.house_id;
    if (createHouseButton) createHouseButton.classList.toggle("hidden", !canCreateHouse);
    const canRequest = currentUser && role !== "commonfolk" && !currentUser.house_id && !currentUser.is_white_knight;

    grid.innerHTML = housesList.map(h => {
        const bannerStyle = getHouseBannerStyle(h.id);
        const motto = getHouseMotto(h.motto);
        const isMyHouse = currentUser && currentUser.house_id === h.id;
        
        let requestBtnHtml = "";
        if (canRequest) {
            if (currentUser.pending_request_house_id === h.id) {
                requestBtnHtml = `<button type="button" class="btn-secondary" disabled style="margin-top: 0.75rem; width: 100%; opacity: 0.7;">Request Pending</button>`;
            } else if (!currentUser.pending_request_house_id) {
                requestBtnHtml = `<button type="button" class="btn-primary" style="margin-top: 0.75rem; width: 100%;" onclick="sendJoinRequest(${h.id})">Send join request</button>`;
            }
        }
        return (
            '<div class="house-card">' +
            '<div class="house-banner" style="' + bannerStyle + '">House ' + h.name + '</div>' +
            '<div class="house-card-body">' +
            '<div class="card-motto">"' + motto + '"</div>' +
            (isMyHouse ? '<span class="role-badge">Your Allegiance</span>' : '') +
            requestBtnHtml +
            '<div style="display:flex; gap:0.5rem; margin-top:auto;">' +
            '<button class="btn-secondary" style="flex:1" onclick="filterHouseInBook(\'knights\', ' + h.id + ')">Knights</button>' +
            '<button class="btn-secondary" style="flex:1" onclick="filterHouseInBook(\'lords\', ' + h.id + ')">Lords</button>' +
            '</div>' +
            '</div>' +
            '</div>'
        );
    }).join("");
}

function openCreateHouseForm() {
    const wrapper = document.getElementById("create-house-wrapper");
    if (!wrapper) return;
    wrapper.classList.remove("hidden");
    wrapper.scrollIntoView({ behavior: "smooth" });
}

function closeCreateHouseForm() {
    const wrapper = document.getElementById("create-house-wrapper");
    if (wrapper) wrapper.classList.add("hidden");
}

async function handleCreateHouse(e) {
    e.preventDefault();
    const name = document.getElementById("create-house-name").value.trim();
    const motto = document.getElementById("create-house-motto").value.trim();

    try {
        if (name.length < 5 || name.length > 20) {
            showAlert("House name must be between 5 and 20 characters long.", true);
            return;
        }
        if (motto.length < 5 || motto.length > 30) {
            showAlert("House motto must be between 5 and 30 characters long.", true);
            return;
        }
        const res = await apiFetch("/houses", {
            method: "POST",
            body: JSON.stringify({ name, motto })
        });

        housesList.push(res.house);
        housesMap[res.house.id] = res.house;
        currentUser = await apiFetch("/me");
        document.getElementById("create-house-form").reset();
        closeCreateHouseForm();
        renderHousesPage();
        updateNavUI(currentUser);
        showAlert(res.message);
    } catch (err) {
        showAlert(err.message, true);
    }
}

function filterHouseInBook(bookPage, houseId) {
    window.location.href = "/" + bookPage + "?house=" + houseId;
}

async function sendJoinRequest(houseId) {
    try {
        const res = await apiFetch(`/houses/${houseId}/request`, {
            method: "POST"
        });
        showAlert(res.message || "Join request sent!");
        currentUser = await apiFetch("/me");
        if (typeof loadHouses === "function") {
            await loadHouses();
        } else {
            window.location.reload();
        }
    } catch (err) {
        showAlert(err.message, true);
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    if (window.coreInitPromise) await window.coreInitPromise;
    renderHousesPage();
});