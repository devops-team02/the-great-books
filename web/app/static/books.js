let allRealmMembers = [];

async function loadRealmRoster() {
    let dbMembers = [];
    let noticeText = "";

    if (currentUser) {
        try {
            const [knights, lords] = await Promise.all([
                apiFetch("/knights"),
                apiFetch("/lords")
            ]);
            dbMembers.push(...knights, ...lords);
        } catch (err) {
            console.warn(err.message);
        }

        if (currentUser.house_id) {
            try {
                const houseMembers = await apiFetch("/houses/" + currentUser.house_id + "/members");
                houseMembers.forEach(m => {
                    if (!dbMembers.some(d => d.id === m.id)) {
                        dbMembers.push({ ...m, house_id: currentUser.house_id });
                    }
                });
                const curHouseName = housesMap[currentUser.house_id] ? housesMap[currentUser.house_id].name : "your House";
                noticeText = "Sworn to House " + curHouseName + ": viewing live members alongside rival houses.";
            } catch (err) {
                console.warn(err.message);
            }
        } else {
            noticeText = currentUser.is_white_knight
                ? "Sworn to the Kingsguard: only your own combat stats are visible without Gossip."
                : "You are not sworn to any Great House. Combat stats of noble houses remain sealed.";
        }
    } else {
        noticeText = "Guest view: Sign in and swear allegiance to a Great House to inspect your housemates' combat stats.";
    }

    ["notice-knights", "notice-lords"].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove("hidden");
            el.textContent = noticeText;
        }
    });

    allRealmMembers = dbMembers;
    if (document.getElementById("grid-knights")) renderBook("knight");
    if (document.getElementById("grid-lords")) renderBook("noble");
}

function renderBook(targetRole) {
    const isKnightBook = targetRole === "knight";
    const gridId = isKnightBook ? "grid-knights" : "grid-lords";
    const searchId = isKnightBook ? "search-knights" : "search-lords";
    const filterId = isKnightBook ? "filter-knights" : "filter-lords";

    const grid = document.getElementById(gridId);
    if (!grid) return;

    const searchEl = document.getElementById(searchId);
    const filterEl = document.getElementById(filterId);
    const query = searchEl ? searchEl.value.trim().toLowerCase() : "";
    const houseFilter = filterEl ? filterEl.value : "all";

    const filtered = allRealmMembers.filter(m => {
        const matchesRole = m.role && m.role.toLowerCase() === targetRole;
        const matchesName = m.username.toLowerCase().includes(query);
        const matchesHouse = houseFilter === "all" || String(m.house_id) === houseFilter;
        return matchesRole && matchesName && matchesHouse;
    });

    if (filtered.length === 0) {
        const label = isKnightBook ? "knights" : "lords";
        grid.innerHTML = '<p class="muted">No ' + label + ' match your current filter.</p>';
        return;
    }

    grid.innerHTML = filtered.map(m => renderCharacterCard(m, targetRole)).join("");
}

function renderCharacterCard(person, bookRole) {
    const houseObj = housesMap[person.house_id];
    const houseName = houseObj ? houseObj.name : null;
    const houseLabel = person.is_white_knight
        ? "White Knight (Kingsguard)"
        : (houseName ? "House " + houseName : (bookRole === "noble" ? "Great House" : "Free Banner"));
    const motto = houseName && HOUSE_MOTTOS[houseName]
        ? HOUSE_MOTTOS[houseName]
        : (bookRole === "noble" ? "By Right of Blood" : "Sword for Hire");
    const bannerStyle = getHouseBannerStyle(person.house_id);
    const initials = getInitials(person.username);

    const avatarHtml = person.photo_url
        ? '<img src="/static/pictures/' + person.photo_url + '" alt="" class="crest-monogram" style="object-fit: cover; padding: 0;" onerror="this.outerHTML=\'<div class=\\\'crest-monogram\\\'>' + initials + '</div>\'">'
        : '<div class="crest-monogram">' + initials + '</div>';

    const activeTargetId = currentUser ? currentUser.gossip_target_id : null;
    const revealedByGossip = activeTargetId === person.id;

    const isSelf = currentUser && currentUser.id === person.id;
    const isSameHouse = currentUser && !currentUser.is_white_knight &&
        currentUser.house_id !== null && currentUser.house_id === person.house_id;

    const canSeeStats = Boolean(person.is_white_knight) || isSelf || revealedByGossip || isSameHouse;

    const isKnightViewer = currentUser && currentUser.role.toLowerCase() === "knight";
    const alreadyUsedToday = activeTargetId !== null;

    let statsSectionHtml = "";
    if (bookRole !== "noble") {
        let statsHtml = "";
        if (canSeeStats && person.stats) {
            statsHtml =
                '<div class="stats-visible">' +
                '<span>STR: <b>' + person.stats.strength + '</b></span>' +
                '<span>DEF: <b>' + person.stats.defense + '</b></span>' +
                '<span>END: <b>' + person.stats.endurance + '</b></span>' +
                '</div>';
        } else {
            statsHtml = '<div class="stats-locked">🔒 Stats hidden (Same House only)</div>';

            if (isKnightViewer && bookRole === "knight") {
                if (alreadyUsedToday) {
                    statsHtml += '<button class="btn-gossip" disabled>👁️ Daily Gossip Used</button>';
                } else {
                    statsHtml +=
                        '<button type="button" class="btn-gossip" onclick="toggleGossipForm(' + person.id + ')">👁️ Use Gossip Key</button>' +
                        '<div id="gossip-form-' + person.id + '" class="hidden" style="margin-top: 0.5rem; display: flex; gap: 0.4rem;">' +
                        '<input type="text" id="gossip-input-' + person.id + '" class="search-input" placeholder="Paste gossip key..." style="padding: 0.4rem; font-size: 0.85rem;">' +
                        '<button type="button" class="btn-primary" style="margin-top: 0; padding: 0.4rem 0.7rem; font-size: 0.85rem;" onclick="submitGossip(' + person.id + ')">Unlock</button>' +
                        '</div>';
                }
            }
        }
        statsSectionHtml = '<div class="card-stats">' + statsHtml + '</div>';
    }

    const targetRole = person.role ? person.role.toLowerCase() : "";

    return (
        '<div class="knight-card">' +
        '<div class="card-crest-bg" style="' + bannerStyle + '">' +
        avatarHtml +
        '<span class="card-role-tag">' + (person.is_white_knight ? "white knight" : person.role) + '</span>' +
        '</div>' +
        '<div class="card-body">' +
        '<div class="card-house">' + houseLabel + '</div>' +
        '<div class="card-motto">"' + motto + '"</div>' +
        '<div class="card-name">' + person.username + '</div>' +
        statsSectionHtml +
        '</div>' +
        '</div>'
    );
}

function toggleGossipForm(targetId) {
    const form = document.getElementById("gossip-form-" + targetId);
    if (form) form.classList.toggle("hidden");
}

async function submitGossip(targetId) {
    const input = document.getElementById("gossip-input-" + targetId);
    const key = input ? input.value.trim() : "";

    if (!key) {
        return showAlert("Please paste your Gossip key first.", true);
    }

    try {
        const res = await apiFetch("/gossip", {
            method: "POST",
            body: JSON.stringify({ key: key, target_id: targetId })
        });
        showAlert(res.message || "Combat stats revealed!");
        currentUser = await apiFetch("/me");
        await loadRealmRoster();
    } catch (err) {
        showAlert(err.message, true);
    }
}


document.addEventListener("DOMContentLoaded", async () => {
    if (window.coreInitPromise) await window.coreInitPromise;
    await loadRealmRoster();
});