async function submitKnightSetup(e) {
    e.preventDefault();

    const isWhite = document.getElementById("reg-white-knight").checked;
    // const houseId = document.getElementById("reg-house").value;
    const strength = document.getElementById("knight-str").value;
    const defense = document.getElementById("knight-def").value;
    const endurance = document.getElementById("knight-end").value;

    if (!selectedPhotoFile) {
        showAlert("Please select a photo", true);
        return;
    }

    const formData = new FormData();
    formData.append("is_white_knight", isWhite ? "true" : "false");
    formData.append("house_id", null);
    formData.append("strength", strength);
    formData.append("defense", defense);
    formData.append("endurance", endurance);
    formData.append("photo", selectedPhotoFile);

    try {
        if (strength < 0 || strength > 20 || defense < 0 || defense > 20 || endurance < 0 || endurance > 20) {
            showAlert("Strength, Defense, and Endurance must be between 0 and 20.", true);
            return;
        }
        const res = await fetch(API_BASE + "/knights/setup", {
            method: "POST",
            credentials: "same-origin",
            body: formData
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error saving knight info");

        showAlert("Knight profile completed!");
        setTimeout(() => {
            window.location.href = "/profile";
        }, 300);
    } catch (err) {
        showAlert(err.message, true);
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    if (window.coreInitPromise) await window.coreInitPromise;

    if (!currentUser || currentUser.role.toLowerCase() !== "knight") {
        window.location.href = "/login";
        return;
    }

    if(select) {
        const select = document.getElementById("reg-house");
        select.innerHTML = '<option value="">Choose a Great House...</option>' +
            housesList.map(h => `<option value="${h.id}">House ${h.name}</option>`).join("");
    }
});