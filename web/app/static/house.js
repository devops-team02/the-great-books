let currentHouse = null;

async function loadHouse() {
    if (!currentUser) {
        window.location.href = "/login";
        return;
    }

    try {
        const house = await apiFetch('/house');
        if (!house) return;
        currentHouse = house;

        document.getElementById("house-name").textContent = `House ${house.name}`;
        document.getElementById("house-motto").textContent = house.motto ? `"${house.motto}"` : "No motto set.";

        const members = await apiFetch(`/houses/${house.id}/members`);
        const membersList = document.getElementById("house-members-list");
        const noMembersMsg = document.getElementById("no-members-msg");
        const countBadge = document.getElementById("members-count");

        membersList.innerHTML = "";
        countBadge.textContent = members.length;

        if (members.length === 0) {
            noMembersMsg.classList.remove("hidden");
        } else {
            noMembersMsg.classList.add("hidden");
            members.forEach(member => {
                const memberCard = createMemberCard(member, house);
                membersList.appendChild(memberCard);
            });
        }

        await loadApplications(house.id);
    } catch (error) {
        console.error("Error loading house data:", error);
        showAlert(error.message || "Failed to load house data", "danger");
    }
}

function createMemberCard(member, house) {
    const isKnight = member.role && member.role.toLowerCase() === "knight";
    const isNoble = member.role && member.role.toLowerCase() === "noble";
    const bannerStyle = getHouseBannerStyle(house ? house.id : null);
    const initials = getInitials(member.username);

    const avatarHtml = member.photo_url
        ? `<img src="/static/pictures/${member.photo_url}" alt="" class="crest-monogram" style="object-fit: cover; padding: 0;" onerror="this.outerHTML='<div class=\\'crest-monogram\\'>${initials}</div>'">`
        : `<div class="crest-monogram">${initials}</div>`;

    const isLordOfHouse = currentUser && currentUser.role && currentUser.role.toLowerCase() === "noble" && currentUser.id !== member.id;
    const banBtnHtml = isLordOfHouse
        ? `<button type="button" class="btn-ban" style="margin-top: 0.6rem; width: 100%;" onclick="openBanModal(${member.id}, '${member.username.replace(/'/g, "\\'")}')">⚔️ Send to Night's Watch</button>`
        : "";
    const kickBtnHtml = isLordOfHouse
        ? `<button type="button" class="btn-kick" style="margin-top: 0.6rem; width: 100%;" onclick="openKickModal(${member.id}, '${member.username.replace(/'/g, "\\'")}')">💨 Cast out of the family</button>`
        : "";

    let statsHtml = "";
    if (isKnight && member.stats) {
        statsHtml = `
            <div class="card-stats" style="margin-top: 0.8rem;">
                <div class="stats-visible">
                    <span>STR: <b>${member.stats.strength ?? 0}</b></span>
                    <span>DEF: <b>${member.stats.defense ?? 0}</b></span>
                    <span>END: <b>${member.stats.endurance ?? 0}</b></span>
                </div>
            </div>
        `;
    }

    const card = document.createElement("div");
    card.className = "knight-card";
    card.innerHTML = `
        <div class="card-crest-bg" style="${bannerStyle}">
            ${avatarHtml}
            <span class="card-role-tag">${member.role || "Member"}</span>
        </div>
        <div class="card-body">
            <div class="card-house">House ${house ? house.name : ""}</div>
            <div class="card-name" style="margin-top: 0.3rem;">${member.username}</div>
            ${banBtnHtml}
            ${kickBtnHtml}
            ${statsHtml}
        </div>
    `;
    return card;
}

function switchHouseTab(tabName) {
    const isMembers = tabName === 'members';
    document.getElementById('tab-members').classList.toggle('hidden', !isMembers);
    document.getElementById('tab-applications').classList.toggle('hidden', isMembers);

    document.getElementById('tab-btn-members').classList.toggle('active', isMembers);
    document.getElementById('tab-btn-applications').classList.toggle('active', !isMembers);
}

let pendingBanTarget = null;
let pendingKickTarget = null;

function openBanModal(targetId, targetName) {
    pendingBanTarget = { id: targetId, name: targetName };
    const nameEl = document.getElementById("ban-target-name");
    if (nameEl) nameEl.textContent = targetName;
    const modal = document.getElementById("ban-modal");
    if (modal) modal.classList.remove("hidden");
}

function closeBanModal() {
    pendingBanTarget = null;
    const modal = document.getElementById("ban-modal");
    if (modal) modal.classList.add("hidden");
}

function handleBanModalBackdropClick(e) {
    if (e.target && e.target.id === "ban-modal") {
        closeBanModal();
    }
}

async function confirmBanMember() {
    if (!pendingBanTarget) return;
    const btn = document.getElementById("btn-confirm-ban");
    if (btn) btn.disabled = true;

    try {
        await apiFetch(`/nightwatch/${pendingBanTarget.id}`, { method: "POST" });
        showAlert(`${pendingBanTarget.name} has been banished to the Night's Watch!`, false);
        closeBanModal();
        await loadHouse();
    } catch (err) {
        showAlert(err.message, true);
    } finally {
        if (btn) btn.disabled = false;
    }
}

function openKickModal(targetId, targetName) {
    pendingKickTarget = { id: targetId, name: targetName };
    const nameEl = document.getElementById("kick-target-name");
    if (nameEl) nameEl.textContent = targetName;
    const modal = document.getElementById("kick-modal");
    if (modal) modal.classList.remove("hidden");
}

function closeKickModal() {
    pendingKickTarget = null;
    const modal = document.getElementById("kick-modal");
    if (modal) modal.classList.add("hidden");
}

function handleKickModalBackdropClick(e) {
    if (e.target && e.target.id === "kick-modal") {
        closeKickModal();
    }
}

async function confirmKickMember() {
    if (!pendingKickTarget || !currentHouse) return;
    const btn = document.getElementById("btn-confirm-kick");
    if (btn) btn.disabled = true;

    try {
        const res = await apiFetch(`/houses/${currentHouse.id}/kick/${pendingKickTarget.id}`, {
            method: "POST"
        });
        showAlert(res.message || `${pendingKickTarget.name} has been kicked from the house.`, false);
        closeKickModal();
        await loadHouse();
    } catch (err) {
        showAlert(err.message, true);
    } finally {
        if (btn) btn.disabled = false;
    }
}

function openChangeHouseModal() {
    showAlert("Change house feature: Select or apply for a new house in Book of Houses.", "info");
}

function openLeaveHouseModal() {
    const modal = document.getElementById("leave-house-modal");
    const nameEl = document.getElementById("leave-house-target-name");
    if (nameEl && currentHouse) {
        nameEl.textContent = `House ${currentHouse.name}`;
    }
    if (modal) modal.classList.remove("hidden");
}

function closeLeaveHouseModal() {
    const modal = document.getElementById("leave-house-modal");
    if (modal) modal.classList.add("hidden");
}

function handleLeaveModalBackdropClick(e) {
    if (e.target && e.target.id === "leave-house-modal") {
        closeLeaveHouseModal();
    }
}

async function confirmLeaveHouse() {
    const btn = document.getElementById("btn-confirm-leave");
    if (btn) btn.disabled = true;

    try {
        const res = await apiFetch("/house/leave", {
            method: "POST"
        });
        showAlert(res.message || "You have left your house.", false);
        closeLeaveHouseModal();
        if (currentUser) {
            currentUser.house_id = null;
        }
        setTimeout(() => {
            window.location.href = "/houses";
        }, 700);
    } catch (err) {
        showAlert(err.message, true);
    } finally {
        if (btn) btn.disabled = false;
    }
}

function leaveHouse() {
    openLeaveHouseModal();
}

function openEditHouseModal() {
    if (!currentUser) return;
    editSelectedPhotoFile = null;
    editRemoveExistingPhoto = false;

    const modal = document.getElementById("edit-house-modal");
    const nameInput = document.getElementById("edit-name");
    const mottoInput = document.getElementById("edit-motto");

    if (nameInput) nameInput.value = currentHouse.name || "";
    if (mottoInput) mottoInput.value = currentHouse.motto || "";

    if (modal) modal.classList.remove("hidden");
}

async function saveHouseChanges(e) {
    e.preventDefault();
    const btn = document.getElementById("btn-save-house");
    if (btn) btn.disabled = true;

    const name = document.getElementById("edit-name").value.trim();;
    const motto = document.getElementById("edit-motto").value;



    try {
        if (name.length < 5 || name.length > 20) {
            showAlert("House name must be between 5 and 20 characters long.", true);
            return;
        }
        if (motto && (motto.length < 5 || motto.length > 30)) {
            showAlert("House motto must be between 5 and 30 characters long.", true);
            return;
        }
        const res = await apiFetch(`/houses/${currentHouse.id}`, {
            method: "PATCH",
            body: JSON.stringify({
                    name: name,
                    motto: motto
            })
            });
        showAlert(res.message || "House updated");
        closeEditHouseModal();
        await loadHouse();
        updateNavUI(currentUser);
    } catch (err) {
        showAlert(err.message, true);
    } finally {
        if (btn) btn.disabled = false;
    }
}

function closeEditHouseModal() {
    const modal = document.getElementById("edit-house-modal");
    if (modal) modal.classList.add("hidden");
}

function handleModalBackdropClick(e) {
    if (e.target && e.target.id === "edit-house-modal") {
        closeEditHouseModal();
    }
}

let houseApplications = [];

async function loadApplications(houseId) {
    const tabBtn = document.getElementById("tab-btn-applications");
    const listEl = document.getElementById("house-applications-list");
    const countBadge = document.getElementById("applications-count");
    const emptyMsg = document.getElementById("no-applications-msg");

    const isNoble = currentUser && currentUser.role && currentUser.role.toLowerCase() === "noble";
    if (!isNoble) {
        if (tabBtn) tabBtn.classList.add("hidden");
        return;
    }

    if (tabBtn) tabBtn.classList.remove("hidden");
    if (!listEl) return;

    try {
        houseApplications = await apiFetch(`/houses/${houseId}/requests`);
        listEl.innerHTML = "";
        if (countBadge) countBadge.textContent = houseApplications.length;

        if (houseApplications.length === 0) {
            if (emptyMsg) emptyMsg.classList.remove("hidden");
            return;
        }

        if (emptyMsg) emptyMsg.classList.add("hidden");

        houseApplications.forEach(app => {
            const item = createApplicationItem(app);
            listEl.appendChild(item);
        });
    } catch (err) {
        console.error("Error loading applications:", err);
        showAlert(err.message || "Failed to load applications", true);
    }
}

function createApplicationItem(app) {
    const isKnight = app.role && app.role.toLowerCase() === "knight";
    const initials = getInitials(app.username);

    const avatarHtml = app.photo_url
        ? `<img src="/static/pictures/${app.photo_url}" alt="${app.username}" class="crest-monogram" style="width: 48px; height: 48px; object-fit: cover; padding: 0; flex-shrink: 0;" onerror="this.outerHTML='<div class=\\'crest-monogram\\' style=\\'width: 48px; height: 48px; font-size: 1.1rem; flex-shrink: 0;\\'>${initials}</div>'">`
        : `<div class="crest-monogram" style="width: 48px; height: 48px; font-size: 1.1rem; flex-shrink: 0;">${initials}</div>`;

    let statsHtml = "";
    if (isKnight && app.stats) {
        statsHtml = `
            <div class="application-stats">
                <span>STR: <b style="color: var(--text-main);">${app.stats.strength}</b></span>
                <span>DEF: <b style="color: var(--text-main);">${app.stats.defense}</b></span>
                <span>END: <b style="color: var(--text-main);">${app.stats.endurance}</b></span>
            </div>
        `;
    }

    const card = document.createElement("div");
    card.className = "application-card";
    card.id = `application-item-${app.id}`;
    card.innerHTML = `
        <div class="application-info">
            ${avatarHtml}
            <div class="application-details">
                <div class="application-name-row">
                    <span class="application-name">${app.username}</span>
                    <span class="card-role-tag" style="position: static; font-size: 0.72rem; padding: 0.15rem 0.5rem;">${app.role}</span>
                </div>
                ${statsHtml}
            </div>
        </div>

        <div class="application-actions">
            <button type="button" class="btn-round-action btn-action-accept" title="Accept Application" onclick="handleApplicationAction(${app.id}, 'accept')">
                ✓
            </button>
            <button type="button" class="btn-round-action btn-action-reject" title="Reject Application" onclick="handleApplicationAction(${app.id}, 'reject')">
                ✕
            </button>
            <button type="button" class="btn-round-action btn-action-imposter" title="Mark as Imposter" onclick="handleApplicationAction(${app.id}, 'imposter')">
                🎭
            </button>
        </div>
    `;
    return card;
}

async function handleApplicationAction(appId, action) {
    const app = houseApplications.find(a => a.id === appId);
    const name = app ? app.username : "Applicant";

    try {
        const res = await apiFetch(`/requests/${appId}/${action}`, {
            method: "POST"
        });

        if (action === "accept") {
            showAlert(res.message || `Accepted ${name} into the House!`, false);
            await loadHouse();
        } else if (action === "reject") {
            showAlert(res.message || `Rejected application from ${name}.`, true);
            if (currentHouse) await loadApplications(currentHouse.id);
        } else if (action === "imposter") {
            showAlert(res.message || `Declared ${name} as a treacherous imposter!`, true);
            if (currentHouse) await loadApplications(currentHouse.id);
        }
    } catch (err) {
        showAlert(err.message, true);
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    if (window.coreInitPromise) await window.coreInitPromise;
    await loadHouse();
});