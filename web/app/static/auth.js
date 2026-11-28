function switchAuthTab(tab) {
    const tabLogin = document.getElementById("tab-login");
    const tabRegister = document.getElementById("tab-register");
    const formLogin = document.getElementById("login-form");
    const formRegister = document.getElementById("register-form");

    if (tabLogin) tabLogin.classList.toggle("active", tab === "login");
    if (tabRegister) tabRegister.classList.toggle("active", tab === "register");
    if (formLogin) formLogin.classList.toggle("hidden", tab !== "login");
    if (formRegister) formRegister.classList.toggle("hidden", tab !== "register");
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;
    const remember_me = document.getElementById("login-remember-me").checked;

    try {
        const res = await apiFetch("/auth/login", {
            method: "POST",
            body: JSON.stringify({ username, password, remember_me })
        });
        await checkAuth();
        if (res.redirect_url) {
            window.location.href = res.redirect_url;
        }
        showAlert("Welcome back to the realm, " + res.user.username + "!");
        setTimeout(() => {
            const role = res.user.role.toLowerCase();
            window.location.href = role === "noble" ? "/lords" : "/knights";
        }, 300);
    } catch (err) {
        showAlert(err.message, true);
        if (err.message && err.message.toLowerCase().includes("nightwatch")){
            window.location.href = "/nightwatch";
        }
    }
}

async function handleRegister(e) {
    e.preventDefault();

    const username = document.getElementById("reg-username").value;
    const password = document.getElementById("reg-password").value;
    const role_id = Number(document.getElementById("reg-role").value);

    try {
        if (username.length < 5 || username.length > 20) {
            showAlert(`Username must be between 5 and 20 characters long.`, true);
            return;
        }
        if (password.length < 8 || password.length > 20) {
            showAlert(`Password must be between 8 and 20 characters long.`, true);
            return;
        }
        const formData = new FormData();
        formData.append("username", username);
        formData.append("password", password);
        formData.append("role_id", String(role_id));
        if (selectedPhotoFile) formData.append("photo", selectedPhotoFile);

        const res = await apiFetch("/auth/register", {
            method: "POST",
            body: formData
        });
        await checkAuth();

        const role = res.user.role.toLowerCase();
        if (role === "knight") {
            window.location.href = "/knight-setup";
        } else {
            showAlert("Account created!");
            setTimeout(() => {
                window.location.href = "/profile";
            }, 300);
        }
    } catch (err) {
        showAlert(err.message, true);
    }
}

let selectedPhotoFile = null;

function handlePhotoDragOver(e) {
    e.preventDefault();
    const zone = document.getElementById("photo-dropzone");
    if (zone) {
        zone.style.borderColor = "#d4af37";
        zone.style.background = "rgba(212, 175, 55, 0.08)";
    }
}

function handlePhotoDragLeave(e) {
    e.preventDefault();
    const zone = document.getElementById("photo-dropzone");
    if (zone) {
        zone.style.borderColor = "rgba(212, 175, 55, 0.45)";
        zone.style.background = "rgba(255, 255, 255, 0.02)";
    }
}

function handlePhotoDrop(e) {
    e.preventDefault();
    handlePhotoDragLeave(e);
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
        processSelectedPhoto(files[0]);
    }
}

function handlePhotoSelect(e) {
    const file = e.target.files?.[0];
    if (file) {
        processSelectedPhoto(file);
    }
}

function processSelectedPhoto(file) {
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
        showAlert("Invalid format. Please choose PNG, JPG, or WEBP.", true);
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showAlert("Image is too large. Maximum size is 5 MB.", true);
        return;
    }

    selectedPhotoFile = file;

    const reader = new FileReader();
    reader.onload = (ev) => {
        const previewImg = document.getElementById("photo-preview-img");
        const fileNameEl = document.getElementById("photo-file-name");
        const placeholder = document.getElementById("photo-placeholder");
        const previewWrap = document.getElementById("photo-preview-wrap");

        if (previewImg) previewImg.src = ev.target.result;
        if (fileNameEl) fileNameEl.textContent = file.name;
        if (placeholder) placeholder.classList.add("hidden");
        if (previewWrap) previewWrap.classList.remove("hidden");
    };
    reader.readAsDataURL(file);
}

function clearSelectedPhoto(e) {
    if (e) e.stopPropagation();
    selectedPhotoFile = null;

    const input = document.getElementById("reg-photo");
    const previewImg = document.getElementById("photo-preview-img");
    const placeholder = document.getElementById("photo-placeholder");
    const previewWrap = document.getElementById("photo-preview-wrap");

    if (input) input.value = "";
    if (previewImg) previewImg.src = "";
    if (previewWrap) previewWrap.classList.add("hidden");
    if (placeholder) placeholder.classList.remove("hidden");
}
