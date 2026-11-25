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

function canEditHouse(house) {
    if (!currentUser) return false;
    if (currentUser.house_id !== house.id) return false;
    const role = (currentUser.role || "").toLowerCase();
    return role === "noble";
}

function renderHousesPage() {
    const grid = document.getElementById("houses-grid");
    if (!grid) return;

    const countEl = document.getElementById("houses-count");
    if (countEl) countEl.textContent = housesList.length + " Great Houses";

    grid.innerHTML = housesList.map(h => {
        const bannerStyle = getHouseBannerStyle(h.id);
        const motto = getHouseMotto(h);
        const isMyHouse = currentUser && currentUser.house_id === h.id;
        const editable = canEditHouse(h);

        return (
            '<div class="house-card">' +
            '<div class="house-banner" style="' + bannerStyle + '">House ' + h.name + '</div>' +
            '<div class="house-card-body">' +
            '<div class="card-motto">"' + motto + '"</div>' +
            (isMyHouse ? '<span class="role-badge">Your Allegiance</span>' : '') +
            (editable
                ? '<button class="btn-primary" style="padding: 0.5rem; font-size: 0.9rem;" onclick="openEditHouseForm(' + h.id + ')">✏️ Edit House Info</button>'
                : '') +
            '<div style="display:flex; gap:0.5rem; margin-top:auto;">' +
            '<button class="btn-secondary" style="flex:1" onclick="filterHouseInBook(\'knights\', ' + h.id + ')">Knights</button>' +
            '<button class="btn-secondary" style="flex:1" onclick="filterHouseInBook(\'lords\', ' + h.id + ')">Lords</button>' +
            '</div>' +
            '</div>' +
            '</div>'
        );
    }).join("");
}

function openEditHouseForm(houseId) {
    const house = housesMap[houseId];
    if (!house) return;

    const currentMotto = getHouseMotto(house);

    document.getElementById("edit-house-id").value = house.id;
    document.getElementById("edit-house-title").textContent = "Edit House " + house.name;
    document.getElementById("edit-house-name").value = house.name;
    document.getElementById("edit-house-motto").value = currentMotto === "Words Unrecorded" ? "" : currentMotto;

    const wrapper = document.getElementById("edit-house-wrapper");
    wrapper.classList.remove("hidden");
    wrapper.scrollIntoView({ behavior: "smooth" });
}

function closeEditHouseForm() {
    document.getElementById("edit-house-wrapper").classList.add("hidden");
}

async function handleEditHouse(e) {
    e.preventDefault();
    const houseId = Number(document.getElementById("edit-house-id").value);
    const name = document.getElementById("edit-house-name").value.trim();
    const motto = document.getElementById("edit-house-motto").value.trim();

    try {
        if (name.length < 5 || name.length > 20) {
            showAlert(`House name must be between 5 and 20 characters long.`, true);
            return;
        }
        if (motto.length < 5 || motto.length > 30) {
            showAlert(`House motto must be between 5 and 30 characters long.`, true);
            return;
        }
        const res = await apiFetch("/houses/" + houseId, {
            method: "PUT",
            body: JSON.stringify({ name, motto })
        });

        housesMap[houseId] = res.house;
        housesList = housesList.map(h => (h.id === houseId ? res.house : h));

        closeEditHouseForm();
        renderHousesPage();
        updateNavUI(currentUser);
        showAlert("House " + res.house.name + " info updated!");
    } catch (err) {
        showAlert(err.message, true);
    }
}

function filterHouseInBook(bookPage, houseId) {
    window.location.href = "/" + bookPage + "?house=" + houseId;
}

document.addEventListener("DOMContentLoaded", async () => {
    if (window.coreInitPromise) await window.coreInitPromise;
    renderHousesPage();
});