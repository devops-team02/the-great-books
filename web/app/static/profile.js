let editSelectedPhotoFile = null;
let editRemoveExistingPhoto = false;
const DEFAULT_IMG = "/static/assets/image.png";

async function loadProfile() {
    const profUsername = document.getElementById("prof-username");
    if (!profUsername) return;

    if (!currentUser) {
        window.location.href = "/login";
        return;
    }
    try {
        const me = await apiFetch("/me");
        currentUser = me;

        const houseObj = housesMap[me.house_id];
        const houseName = houseObj ? houseObj.name : null;

        const profBanner = document.getElementById("prof-banner");
        if (profBanner) {
            profBanner.className = "profile-banner";
            profBanner.style.cssText = getHouseBannerStyle(me.house_id);
        }

        const profMonogram = document.getElementById("prof-monogram");
        if (profMonogram) {
            if (me.photo_url) {
                profMonogram.innerHTML = `<img src="/static/pictures/${me.photo_url}" alt="${me.username}" class="monogram-avatar">`;
            } else {
                profMonogram.textContent = getInitials(me.username);
            }
        }
        profUsername.textContent = me.username;
        const profRole = document.getElementById("prof-role");
        if (profRole) profRole.textContent = me.is_white_knight ? "White Knight (Kingsguard)" : me.role;
        const profHouse = document.getElementById("prof-house");
        if (profHouse) {
            profHouse.textContent = me.is_white_knight
                ? "Kingsguard (Sworn to no Great House)"
                : (houseName ? "House " + houseName : "Free Rider / Commonfolk");
        }
        const isKnight = (me.role || "").toLowerCase() === "knight";
        const isCommonfolk = (me.role || "").toLowerCase() === "commonfolk";

        const profMotto = document.getElementById("prof-motto");
        if (profMotto) {
            if (isCommonfolk) {
                profMotto.classList.add("hidden");
            } else {
                profMotto.classList.remove("hidden");
                profMotto.textContent = houseName && HOUSE_MOTTOS[houseName]
                    ? '"' + HOUSE_MOTTOS[houseName] + '"'
                    : '"Unbowed by titles, forged by steel."';
            }
        }

        const statsSection = document.querySelector(".profile-stats");
        if (statsSection) {
            statsSection.classList.toggle("hidden", !isKnight);
        }

        if (isKnight) {
            const str = me.stats.strength || 0;
            const def = me.stats.defense || 0;
            const end = me.stats.endurance || 0;

            const statStr = document.getElementById("stat-str");
            if (statStr) statStr.textContent = str;
            const statDef = document.getElementById("stat-def");
            if (statDef) statDef.textContent = def;
            const statEnd = document.getElementById("stat-end");
            if (statEnd) statEnd.textContent = end;

            const barStr = document.getElementById("bar-str");
            if (barStr) barStr.style.width = Math.min(100, str * 5) + "%";
            const barDef = document.getElementById("bar-def");
            if (barDef) barDef.style.width = Math.min(100, def * 5) + "%";
            const barEnd = document.getElementById("bar-end");
            if (barEnd) barEnd.style.width = Math.min(100, end * 5) + "%";
        }

        const spySection = document.querySelector(".spy-section");
        if (spySection) {
            spySection.classList.toggle("hidden", !isKnight);
        }

        const pill = document.getElementById("gossip-status-pill");
        const desc = document.getElementById("gossip-desc");
        const controls = document.getElementById("gossip-key-controls");
        const keyInput = document.getElementById("gossip-key-input");
        const nextTimeEl = document.getElementById("gossip-next-time");

        if (isKnight && pill && desc) {
            if (controls) controls.classList.remove("hidden");
            if (keyInput) keyInput.value = me.gossip_key || "";

            if (!me.gossip_key) {
                pill.textContent = "No Key Yet";
                desc.textContent = "Click 'Update Key' to generate your first daily Gossip key.";
            } else if (me.gossip_target_id) {
                pill.textContent = "Used Today";
                desc.textContent = "You have already used today's key to reveal a rival knight's stats.";
            } else {
                pill.textContent = "Key Active";
                desc.textContent = "Copy your key and use it in the Book of Knights to reveal 1 rival knight's stats.";
            }

            if (nextTimeEl) {
                if (me.next_key) {
                    const nextDate = new Date(me.next_key + "Z");
                    nextTimeEl.textContent = "Next key update available after: " + nextDate.toLocaleString();
                } else {
                    nextTimeEl.textContent = "Key update is available now.";
                }
            }
        }
    } catch (err) {
        showAlert(err.message, true);
    }
}

function handleEditPhotoDragOver(e) {
    e.preventDefault();
    const zone = document.getElementById("edit-photo-dropzone");
    if (zone) {
        zone.style.borderColor = "#d4af37";
        zone.style.background = "rgba(212, 175, 55, 0.08)";
    }
}

function handleEditPhotoDragLeave(e) {
    e.preventDefault();
    const zone = document.getElementById("edit-photo-dropzone");
    if (zone) {
        zone.style.borderColor = "rgba(212, 175, 55, 0.45)";
        zone.style.background = "rgba(255, 255, 255, 0.02)";
    }
}

function handleEditPhotoDrop(e) {
    e.preventDefault();
    handleEditPhotoDragLeave(e);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
        processEditSelectedPhoto(files[0]);
    }
}

function handleEditPhotoSelect(e) {
    const file = e.target.files?.[0];
    if (file) {
        processEditSelectedPhoto(file);
    }
}

function processEditSelectedPhoto(file) {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
        showAlert("Invalid format. Please choose PNG, JPG, or WEBP.", true);
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showAlert("Image is too large. Maximum size is 5 MB.", true);
        return;
    }

    editSelectedPhotoFile = file;
    editRemoveExistingPhoto = false;

    const reader = new FileReader();
    reader.onload = (ev) => {
        const previewImg = document.getElementById("edit-photo-preview-img");
        const fileNameEl = document.getElementById("edit-photo-file-name");
        const placeholder = document.getElementById("edit-photo-placeholder");
        const previewWrap = document.getElementById("edit-photo-preview-wrap");

        if (previewImg) previewImg.src = ev.target.result;
        if (fileNameEl) fileNameEl.textContent = file.name;
        if (placeholder) {
            placeholder.classList.add("hidden");
            placeholder.style.display = "none";
        }
        if (previewWrap) {
            previewWrap.classList.remove("hidden");
            previewWrap.style.display = "flex";
        }
    };
    reader.readAsDataURL(file);
}

function clearEditSelectedPhoto(e) {
    if (e) e.stopPropagation();
    editSelectedPhotoFile = null;
    editRemoveExistingPhoto = true;

    const input = document.getElementById("edit-photo");
    const previewImg = document.getElementById("edit-photo-preview-img");
    const fileNameEl = document.getElementById("edit-photo-file-name");
    const placeholder = document.getElementById("edit-photo-placeholder");
    const previewWrap = document.getElementById("edit-photo-preview-wrap");

    if (input) input.value = "";
    if (previewImg) previewImg.src = DEFAULT_IMG;
    if (fileNameEl) fileNameEl.textContent = "Default portrait";
    if (placeholder) {
        placeholder.classList.add("hidden");
        placeholder.style.display = "none";
    }
    if (previewWrap) {
        previewWrap.classList.remove("hidden");
        previewWrap.style.display = "flex";
    }
}

function openEditProfileModal() {
    if (!currentUser) return;
    editSelectedPhotoFile = null;
    editRemoveExistingPhoto = false;

    const modal = document.getElementById("edit-profile-modal");
    const usernameInput = document.getElementById("edit-username");
    const houseSelect = document.getElementById("edit-house");
    const curPassInput = document.getElementById("edit-current-password");
    const newPassInput = document.getElementById("edit-new-password");
    const photoInput = document.getElementById("edit-photo");
    const previewImg = document.getElementById("edit-photo-preview-img");
    const fileNameEl = document.getElementById("edit-photo-file-name");
    const placeholder = document.getElementById("edit-photo-placeholder");
    const previewWrap = document.getElementById("edit-photo-preview-wrap");
    const houseLabel = document.getElementById("edit-house-label");
    if (houseLabel) {
        if (currentUser && currentUser.role && currentUser.role.toLowerCase() === "noble") {
            houseLabel.classList.remove("hidden");
        } else {
            houseLabel.classList.add("hidden");
        }
    }

    if (usernameInput) usernameInput.value = currentUser.username || "";
    if (curPassInput) curPassInput.value = "";
    if (newPassInput) newPassInput.value = "";
    if (photoInput) photoInput.value = "";

    if (currentUser.photo_url) {
        if (previewImg) {
            previewImg.onerror = () => { previewImg.src = DEFAULT_IMG; };
            previewImg.src = `/static/pictures/${currentUser.photo_url}`;
        }
        if (fileNameEl) fileNameEl.textContent = "Current portrait";
    } else {
        if (previewImg) previewImg.src = DEFAULT_IMG;
        if (fileNameEl) fileNameEl.textContent = "Default portrait";
    }
    if (placeholder) {
        placeholder.classList.add("hidden");
        placeholder.style.display = "none";
    }
    if (previewWrap) {
        previewWrap.classList.remove("hidden");
        previewWrap.style.display = "flex";
    }

    if (houseSelect) {
        houseSelect.innerHTML = '<option value="">None (Free Rider / Commonfolk)</option>';
        Object.values(housesMap).forEach(h => {
            const opt = document.createElement("option");
            opt.value = h.id;
            opt.textContent = "House " + h.name;
            houseSelect.appendChild(opt);
        });
        houseSelect.value = currentUser.house_id ? String(currentUser.house_id) : "";
    }

    if (modal) modal.classList.remove("hidden");
}

function closeEditProfileModal() {
    const modal = document.getElementById("edit-profile-modal");
    if (modal) modal.classList.add("hidden");
}

function handleModalBackdropClick(e) {
    if (e.target && e.target.id === "edit-profile-modal") {
        closeEditProfileModal();
    }
}

async function saveProfileChanges(e) {
    e.preventDefault();
    const btn = document.getElementById("btn-save-profile");
    if (btn) btn.disabled = true;

    const username = document.getElementById("edit-username").value.trim();
    const houseRaw = document.getElementById("edit-house").value;
    const current_password = document.getElementById("edit-current-password").value;
    const new_password = document.getElementById("edit-new-password").value;

    const formData = new FormData();
    formData.append("username", username);

    const isLord = currentUser && currentUser.role && currentUser.role.toLowerCase() === "noble";
    if (isLord) {
        formData.append("house_id", houseRaw);
    }

    if (editSelectedPhotoFile) {
        formData.append("photo", editSelectedPhotoFile);
    } else if (editRemoveExistingPhoto) {
        formData.append("remove_photo", "1");
    }
    if (new_password) {
        formData.append("current_password", current_password);
        formData.append("new_password", new_password);
    }

    try {
        if (username.length < 5 || username.length > 20) {
            showAlert("Username must be between 5 and 20 characters long.", true);
            return;
        }
        if (new_password && (new_password.length < 8 || new_password.length > 20)) {
            showAlert("New password must be between 8 and 20 characters long.", true);
            return;
        }
        const res = await apiFetch("/me", {
            method: "PATCH",
            body: formData
        });
        showAlert(res.message || "Profile updated");
        closeEditProfileModal();
        await loadProfile();
        updateNavUI(currentUser);
    } catch (err) {
        showAlert(err.message, true);
    } finally {
        if (btn) btn.disabled = false;
    }
}

async function updateGossipKey() {
    const btn = document.getElementById("btn-update-key");
    if (btn) btn.disabled = true;

    try {
        const res = await apiFetch("/me/gossip-key", { method: "POST" });
        showAlert(res.message || "Gossip key updated");
        await loadProfile();
    } catch (err) {
        showAlert(err.message, true);
    } finally {
        if (btn) btn.disabled = false;
    }
}

function copyGossipKey() {
    const keyInput = document.getElementById("gossip-key-input");
    if (!keyInput || !keyInput.value) {
        return showAlert("Generate a gossip key first.", true);
    }

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(keyInput.value)
            .then(() => showAlert("Gossip key copied to clipboard!"))
            .catch(() => fallbackCopy(keyInput));
    } else {
        fallbackCopy(keyInput);
    }
}

function fallbackCopy(inputEl) {
    inputEl.select();
    inputEl.setSelectionRange(0, 99999);
    try {
        document.execCommand("copy");
        showAlert("Gossip key copied to clipboard!");
    } catch (_) {
        showAlert("Could not copy key. Please copy it manually.", true);
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    if (window.coreInitPromise) await window.coreInitPromise;
    await loadProfile();
});