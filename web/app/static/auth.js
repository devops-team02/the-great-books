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

    try {
        const res = await apiFetch("/auth/login", {
            method: "POST",
            body: JSON.stringify({ username, password })
        });
        await checkAuth();
        showAlert("Welcome back to the realm, " + res.user.username + "!");
        setTimeout(() => {
            window.location.href = res.user.role === "noble" ? "/lords" : "/knights";
        }, 300);
    } catch (err) {
        showAlert(err.message, true);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById("reg-username").value;
    const password = document.getElementById("reg-password").value;
    const role_id = Number(document.getElementById("reg-role").value);
    const houseRaw = document.getElementById("reg-house").value;
    const house_id = houseRaw ? Number(houseRaw) : null;

    try {
        const res = await apiFetch("/auth/register", {
            method: "POST",
            body: JSON.stringify({ username, password, role_id, house_id })
        });
        await checkAuth();
        showAlert("Oath sworn! Account created for " + res.user.username + ".");
        setTimeout(() => {
            window.location.href = "/profile";
        }, 300);
    } catch (err) {
        showAlert(err.message, true);
    }
}
