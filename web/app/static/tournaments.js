function openCreateTournamentModal() {
    const modal = document.getElementById("create-tournament-modal");
    if (modal) modal.classList.remove("hidden");
}

function closeCreateTournamentModal() {
    const modal = document.getElementById("create-tournament-modal");
    if (modal) modal.classList.add("hidden");
}

function handleTournamentModalBackdrop(e) {
    if (e.target && e.target.id === "create-tournament-modal") {
        closeCreateTournamentModal();
    }
}

function formatLocalDate(isoStr) {
    if (!isoStr) return "";
    const utcStr = isoStr.endsWith("Z") || isoStr.includes("+") ? isoStr : isoStr + "Z";
    return new Date(utcStr).toLocaleString("uk-UA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}

async function loadTournamentsList() {
    const grid = document.getElementById("tournaments-grid");
    if (!grid) return;

    const createBtn = document.getElementById("btn-open-create-tournament");
    if (createBtn && currentUser && currentUser.role.toLowerCase() === "noble") {
        createBtn.classList.remove("hidden");
    }

    try {
        const tournaments = await apiFetch("/tournaments");
        if (tournaments.length === 0) {
            grid.innerHTML = '<p class="muted">No active or upcoming tournaments right now.</p>';
            return;
        }

        grid.innerHTML = tournaments.map(t => {
            const houseName = t.lord ? t.lord.house_name : null;
            const bannerClass = getHouseBannerClass(houseName);
            const houseLabel = houseName ? "House " + houseName : "Great House";
            const hostName = t.lord ? t.lord.username : "Unknown Lord";
            const statusTag = t.is_started ? "In Progress (Closed)" : "Open for Entry";

            return (
                '<div class="knight-card">' +
                '<div class="card-crest-bg ' + bannerClass + '">' +
                '<div class="crest-monogram">&#9876;</div>' +
                '<span class="card-role-tag">' + statusTag + '</span>' +
                '</div>' +
                '<div class="card-body">' +
                '<div class="card-house">' + houseLabel + '</div>' +
                '<div class="card-name">' + t.tournament_date + '</div>' +
                '<div class="card-motto">Hosted by Lord ' + hostName + '</div>' +
                '<div class="card-stats">' +
                '<div class="stats-visible" style="margin-bottom: 0.6rem;">' +
                '<span>Knights: <b>' + t.participants_count + ' / ' + t.max_participants + '</b></span>' +
                '</div>' +
                '<div class="muted" style="font-size: 0.8rem; margin-bottom: 0.6rem;">' +
                'Starts: ' + formatLocalDate(t.start_date) + '<br>' +
                'Ends: ' + formatLocalDate(t.end_date) +
                '</div>' +
                '<a href="/tournaments/' + t.id + '" class="btn-secondary" style="width: 100%;">View Tournament</a>' +
                '</div>' +
                '</div>' +
                '</div>'
            );
        }).join("");
    } catch (err) {
        showAlert(err.message, true);
    }
}

async function handleCreateTournament(e) {
    e.preventDefault();
    const btn = document.getElementById("btn-submit-tournament");
    if (btn) btn.disabled = true;

    const tournament_date = document.getElementById("tourn-date-label").value.trim();
    const max_participants = Number(document.getElementById("tourn-max-participants").value);
    const startRaw = document.getElementById("tourn-start-date").value;
    const endRaw = document.getElementById("tourn-end-date").value;

    if (!startRaw || !endRaw) {
        showAlert("Please select both start and end dates.", true);
        if (btn) btn.disabled = false;
        return;
    }

    const start_date = new Date(startRaw).toISOString();
    const end_date = new Date(endRaw).toISOString();

    try {
        const res = await apiFetch("/tournaments", {
            method: "POST",
            body: JSON.stringify({
                tournament_date,
                max_participants,
                start_date,
                end_date
            })
        });
        showAlert(res.message || "Tournament created!");
        closeCreateTournamentModal();
        document.getElementById("create-tournament-form").reset();
        await loadTournamentsList();
    } catch (err) {
        showAlert(err.message, true);
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function loadTournamentDetail() {
    const participantsGrid = document.getElementById("participants-grid");
    if (!participantsGrid) return;

    const parts = window.location.pathname.split("/").filter(Boolean);
    const tournamentId = parts[parts.length - 1];

    try {
        const t = await apiFetch("/tournaments/" + tournamentId);

        const houseName = t.lord ? t.lord.house_name : null;
        const houseLabel = houseName ? " (House " + houseName + ")" : "";
        const hostName = t.lord ? t.lord.username : "Unknown Lord";

        document.getElementById("detail-title").textContent = t.tournament_date;
        document.getElementById("detail-host").textContent = "Hosted by Lord " + hostName + houseLabel;
        document.getElementById("detail-count").textContent = t.participants_count + " / " + t.max_participants;

        const infoBanner = document.getElementById("detail-info-banner");
        if (infoBanner) {
            infoBanner.classList.remove("hidden");
            infoBanner.innerHTML =
                "<strong>Starts:</strong> " + formatLocalDate(t.start_date) +
                " &nbsp;|&nbsp; <strong>Ends:</strong> " + formatLocalDate(t.end_date) +
                (t.is_started ? " &nbsp;|&nbsp; <strong>Status:</strong> Tournament has started (registration closed)" : "");
        }

        const actionArea = document.getElementById("detail-action-area");
        const isKnight = currentUser && currentUser.role.toLowerCase() === "knight";
        const isFull = t.participants_count >= t.max_participants;

        if (actionArea) {
            if (t.is_joined) {
                actionArea.innerHTML = '<span class="role-badge">Registered</span>';
            } else if (isKnight && !t.is_started && !isFull) {
                actionArea.innerHTML =
                    '<button id="btn-join-tournament" class="btn-primary" style="margin-top: 0;" onclick="joinTournament(' + t.id + ')">' +
                    'Join Tournament' +
                    '</button>';
            } else if (t.is_started) {
                actionArea.innerHTML = '<span class="muted">Registration Closed</span>';
            } else if (isFull) {
                actionArea.innerHTML = '<span class="muted">Tournament Full</span>';
            } else {
                actionArea.innerHTML = "";
            }
        }

        if (t.participants.length === 0) {
            participantsGrid.innerHTML = '<p class="muted">No knights have entered this tournament yet.</p>';
            return;
        }

        participantsGrid.innerHTML = t.participants.map(p => {
            const pHouse = p.house_name;
            const pBanner = getHouseBannerClass(pHouse);
            const pHouseLabel = p.is_white_knight
                ? "White Knight (Kingsguard)"
                : (pHouse ? "House " + pHouse : "Free Banner");
            const initials = getInitials(p.username);

            const avatarHtml = p.photo_url
                ? '<img src="/static/pictures/' + p.photo_url + '" alt="" class="crest-monogram" style="object-fit: cover; padding: 0;" onerror="this.outerHTML=\'<div class=\\\'crest-monogram\\\'>' + initials + '</div>\'">'
                : '<div class="crest-monogram">' + initials + '</div>';

            return (
                '<div class="knight-card">' +
                '<div class="card-crest-bg ' + pBanner + '">' +
                avatarHtml +
                '<span class="card-role-tag">' + (p.is_white_knight ? "white knight" : "knight") + '</span>' +
                '</div>' +
                '<div class="card-body">' +
                '<div class="card-house">' + pHouseLabel + '</div>' +
                '<div class="card-name">' + p.username + '</div>' +
                '<div class="muted" style="font-size: 0.8rem;">Joined: ' + formatLocalDate(p.joined_at) + '</div>' +
                '</div>' +
                '</div>'
            );
        }).join("");
    } catch (err) {
        showAlert(err.message, true);
        document.getElementById("detail-title").textContent = "Tournament Unavailable";
    }
}

async function joinTournament(tournamentId) {
    const btn = document.getElementById("btn-join-tournament");
    if (btn) btn.disabled = true;

    try {
        const res = await apiFetch("/tournaments/" + tournamentId + "/join", {
            method: "POST"
        });
        showAlert(res.message || "You have entered the tournament!");
        await loadTournamentDetail();
    } catch (err) {
        showAlert(err.message, true);
        if (btn) btn.disabled = false;
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    if (window.coreInitPromise) await window.coreInitPromise;
    await loadTournamentsList();
    await loadTournamentDetail();
});