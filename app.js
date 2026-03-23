// ==============================================
// CONFIGURATION & GLOBAL STATE
// ==============================================

// Р СћРЎС“Р С” РЎвЂљРЎР‚РЎРЏР В±Р Р†Р В° Р Т‘Р В° РЎРѓР Вµ Р С—Р С•РЎРѓРЎвЂљР В°Р Р†Р С‘ Р В»Р С‘Р Р…Р С”Р В° Р С•РЎвЂљ Google Apps Script, РЎРѓР В»Р ВµР Т‘ Р С”Р В°РЎвЂљР С• РЎРѓР Вµ РЎР‚Р В°Р В·Р С–РЎР‰РЎР‚Р Р…Р Вµ (Deploy -> Web App)
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwDypJEQt07rcjZZ0FDDzV_o2QoTfDBaA3p2CGNi99cGT5FeSrJGY-wYGYuB5UO6BZ8jA/exec";

let currentRouteKey = "";
let apartmentList = [];
let _currentIdealParts = {};

// ==============================================
// INITIALIZATION
// ==============================================

document.addEventListener('DOMContentLoaded', async () => {
    // Р вЂ™РЎР‰Р В·РЎРѓРЎвЂљР В°Р Р…Р С•Р Р†РЎРЏР Р†Р В°Р Р…Р Вµ Р Р…Р В° Р В·Р В°Р С—Р В°Р В·Р ВµР Р…Р С‘ Р Т‘Р В°Р Р…Р Р…Р С‘, Р В°Р С”Р С• Р С‘Р СР В° РЎвЂљР В°Р С”Р С‘Р Р†Р В°
    const savedEmail = localStorage.getItem("savedAdminEmail");
    const savedId = localStorage.getItem("savedAccessId");

    if (savedEmail) {
        document.getElementById("adminEmailInput").value = savedEmail;
    }
    // We only set savedId if NO id is provided in the URL to avoid overwriting clean IDs with old/partial ones
    const urlParams = new URLSearchParams(window.location.search);
    if (savedId && !urlParams.get('id') && !window.location.hash) {
        document.getElementById("access-id").value = savedId;
    }

    // Apartment Event Listener for the main view
    document.getElementById('apartmentSelect').addEventListener('change', (e) => {
        if (e.target.value) {
            loadApartmentData(e.target.value);
        } else {
            resetApartmentData();
            // Clear apartment from hash but keep entrance ID
            if (currentRouteKey) {
                window.location.hash = encodeURIComponent(currentRouteKey);
            } else {
                window.location.hash = "";
            }
        }
    });

    // Handle Enter key for admin login
    document.getElementById("pinInput").addEventListener('keydown', (e) => {
        if (e.key === 'Enter') verifyPin();
    });

    // --- Р С’Р Р†РЎвЂљР С•Р СР В°РЎвЂљР С‘РЎвЂЎР Р…Р С• Р Р†Р В»Р С‘Р В·Р В°Р Р…Р Вµ (Parsing ID and Apartment from Hash or Query) ---
    // (use the already declared urlParams)
    let idValue = urlParams.get('id');
    let aptValue = urlParams.get('apt');

    // Hash priority - Handle both encoded and raw hashes
    if (window.location.hash) {
        try {
            const rawHash = window.location.hash.replace('#', '');
            if (rawHash) {
                // Split first to preserve encoded slashes inside parts if any (though rare in IDs)
                const parts = rawHash.split('/');
                if (parts[0]) idValue = decodeURIComponent(parts[0]);
                if (parts[1]) aptValue = decodeURIComponent(parts[1]);
            }
        } catch(e) { console.error("Hash parsing failed", e); }
    }

    if (idValue) {
        const cleanId = idValue.trim();
        document.getElementById('access-id').value = cleanId;
        
        // Trigger entrance
        const success = await enterEntrance();

        if (success && aptValue) {
            const select = document.getElementById("apartmentSelect");
            const targetApt = decodeURIComponent(aptValue);
            
            // Polling approach is safer than a fixed timeout
            // removed attempts
            // removed interval wrapper
                if (apartmentList && apartmentList.length > 0) {
                    // Try to find matching apartment
                    const found = apartmentList.find(a => normalizeAptName(a) === normalizeAptName(targetApt)) || 
                                  apartmentList.find(a => a === targetApt);
                    
                    if (found) {
                        select.value = found;
                        loadApartmentData(found);
                    }
                    // removed clearInterval
                }
                // removed attempts check
            // removed interval closing braces
        }
    }

    // Р вЂ”Р В°РЎР‚Р ВµР В¶Р Т‘Р В°Р СР Вµ Р С—РЎС“Р В±Р В»Р С‘РЎвЂЎР Р…Р С‘РЎвЂљР Вµ Р Р…Р В°РЎРѓРЎвЂљРЎР‚Р С•Р в„–Р С”Р С‘ (Р вЂРЎС“РЎвЂљР С•Р Р… Р В·Р В° РЎР‚Р ВµР С–Р С‘РЎРѓРЎвЂљРЎР‚Р В°РЎвЂ Р С‘РЎРЏ Р С‘ РЎвЂљ.Р Р….)
    loadPublicSettings();

    // Р С’Р С”Р С• РЎРѓР СР Вµ РЎРѓР Вµ Р Р†РЎР‰РЎР‚Р Р…Р В°Р В»Р С‘ Р С•РЎвЂљ РЎР‚РЎР‰Р С”Р С•Р Р†Р С•Р Т‘РЎРѓРЎвЂљР Р†Р С•РЎвЂљР С•, Р С•РЎвЂљР Р†Р В°РЎР‚РЎРЏР СР Вµ Р В°Р Т‘Р СР С‘Р Р… Р С—Р В°Р Р…Р ВµР В»Р В° Р В°Р Р†РЎвЂљР С•Р СР В°РЎвЂљР С‘РЎвЂЎР Р…Р С•
    if (sessionStorage.getItem('shouldOpenAdmin') === 'true') {
        sessionStorage.removeItem('shouldOpenAdmin');
        // Р вЂќР В°Р Р†Р В°Р СР Вµ Р СР В°Р В»Р С”Р С• Р Р†РЎР‚Р ВµР СР Вµ Р Р…Р В° enterEntrance Р Т‘Р В° Р С—РЎР‚Р С‘Р С”Р В»РЎР‹РЎвЂЎР С‘ Р В°Р С”Р С• Р Вµ Р Р† РЎвЂ¦Р С•Р Т‘
        setTimeout(() => {
            if (currentRouteKey) openAdmin();
        }, 800);
    }
});

async function loadPublicSettings() {
    try {
        const res = await apiCall('getPublicSettings');
        const regLink = document.getElementById("regButtonLink");
        const regText = document.getElementById("regButtonText");
        
        if (res && res.success && regLink) {
            regLink.style.display = res.showRegForm ? "block" : "none";
            if (res.regFormText && regText) {
                regText.textContent = res.regFormText;
            }
        } else if (regLink) {
            // Default fallback if API fails
            regLink.style.display = "block";
        }
    } catch (e) {
        console.error("Error loading public settings:", e);
    }
}

// ==============================================
// CORE API CALLER
// ==============================================

async function apiCall(action, params = {}) {
    showLoading();

    // Р С’Р С”Р С• SCRIPT_URL Р Р…Р Вµ РЎРѓРЎР‰Р Т‘РЎР‰РЎР‚Р В¶Р В° Р С‘РЎРѓРЎвЂљР С‘Р Р…РЎРѓР С”Р С‘ google script URL, Р Р†РЎР‚РЎР‰РЎвЂ°Р В°Р СР Вµ Р С–РЎР‚Р ВµРЎв‚¬Р С”Р В°
    if (!SCRIPT_URL.startsWith("https://script.google.com/macros")) {
        hideLoading();
        console.error("Р СљР С•Р В»РЎРЏ, РЎРѓР В»Р С•Р В¶Р ВµРЎвЂљР Вµ РЎР‚Р ВµР В°Р В»Р Р…Р С‘РЎРЏ SCRIPT_URL Р Р† app.js");
        showToast("Р вЂњРЎР‚Р ВµРЎв‚¬Р С”Р В°: Р вЂєР С‘Р С—РЎРѓР Р†Р В° Р Р†РЎР‚РЎР‰Р В·Р С”Р В° РЎРѓ Google Script (API)", "error");
        return { error: 'No Script URL configured' };
    }

    params.action = action;
    params.routeKey = currentRouteKey;

    const queryParams = new URLSearchParams(params).toString();

    try {
        const response = await fetch(`${SCRIPT_URL}?${queryParams}`);
        const result = await response.json();
        hideLoading();
        return result;
    } catch (error) {
        hideLoading();
        console.error("API Call failed:", error);
        showToast("Р СџРЎР‚Р С•Р В±Р В»Р ВµР С РЎРѓ Р Р†РЎР‚РЎР‰Р В·Р С”Р В°РЎвЂљР В° Р С”РЎР‰Р С РЎРѓРЎР‰РЎР‚Р Р†РЎР‰РЎР‚Р В°", "error");
        return { error: error.toString() };
    }
}

// ==============================================
// UI HELPERS
// ==============================================

window.activeLoadingRequests = 0;
window.showLoading = function () {
    window.activeLoadingRequests++;
    const loader = document.getElementById("loadingOverlay");
    if (loader) loader.classList.add("active");

    // Safety timeout: Р В°Р С”Р С• Р Р…Р ВµРЎвЂ°Р С• Р В·Р В°Р В±Р С‘Р Вµ, РЎРѓР С”РЎР‚Р С‘Р Р†Р В°Р СР Вµ Р В»Р С•РЎС“Р Т‘РЎР‰РЎР‚Р В° РЎРѓР В»Р ВµР Т‘ 15 РЎРѓР ВµР С”РЎС“Р Р…Р Т‘Р С‘
    clearTimeout(window.loaderSafetyTimeout);
    window.loaderSafetyTimeout = setTimeout(() => {
        window.activeLoadingRequests = 0;
        const loader = document.getElementById("loadingOverlay");
        if (loader) loader.classList.remove("active");
    }, 15000);
}
window.hideLoading = function () {
    window.activeLoadingRequests--;
    if (window.activeLoadingRequests > 0) return;
    window.activeLoadingRequests = 0;
    const loader = document.getElementById("loadingOverlay");
    if (loader) loader.classList.remove("active");
    clearTimeout(window.loaderSafetyTimeout);
}

window.normalizeAptName = function (name) {
    if (!name) return "";
    return name.toString().toUpperCase().replace(/Р С’/g, "A").replace(/\s+/g, "");
}

function resetApartmentData() {
    const sc = document.getElementById("saldoCard");
    sc.className = "card saldo-card saldo-zero";
    document.getElementById("saldo").textContent = "-";
    document.getElementById("tableBody").innerHTML = "";
    document.getElementById("payment-reference-box").style.display = "none";
    document.getElementById("payment-details-box").style.display = "none";
    document.getElementById("individualAptNotice").style.display = "none";
}

// --- TOAST ---
let toastTimeout;
window.showToast = function (msg, type) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.className = "toast " + type;
    clearTimeout(toastTimeout);
    requestAnimationFrame(() => { t.classList.add("show"); });
    toastTimeout = setTimeout(() => { t.classList.remove("show"); }, 3500);
}

// --- SAVING STATE (Р вЂ”Р В°Р Т‘Р В°РЎвЂЎР В° 8: Р Р†Р С‘Р В·РЎС“Р В°Р В»Р Р…Р В° Р С‘Р Р…Р Т‘Р С‘Р С”Р В°РЎвЂ Р С‘РЎРЏ Р С—РЎР‚Р С‘ Р В·Р В°Р С—Р С‘РЎРѓ) ---
window.showSaving = function (btn, text = "РІРЏС– Р вЂ”Р В°Р С—Р С‘РЎРѓР Р†Р В°Р Р…Р Вµ...") {
    if (!btn) return;
    btn._originalText = btn.innerHTML;
    btn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:7px;">
        <span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.4);border-top-color:#fff;border-radius:50%;animation:spin 0.7s linear infinite;"></span>
        ${text}
    </span>`;
    btn.disabled = true;
    btn.style.opacity = "0.8";
}
window.hideSaving = function (btn, originalText) {
    if (!btn) return;
    btn.innerHTML = originalText || btn._originalText || "Р вЂ”Р В°Р С—Р В°Р В·Р С‘";
    btn.disabled = false;
    btn.style.opacity = "";
}

window.refreshCurrentView = function () {
    console.log("Refreshing current view data...");
    loadDashboardData();
    const apt = document.getElementById("apartmentSelect").value;
    if (apt) {
        loadApartmentData(apt);
    }
}

window.toggleContactForm = function() {
    const section = document.getElementById('contact-section');
    if (section.classList.contains('hidden')) {
        // Р вЂ”Р В°РЎвЂљР Р†Р В°РЎР‚РЎРЏР СР Вµ РЎвЂћР С•РЎР‚Р СР В°РЎвЂљР В° Р В·Р В° РЎР‚Р ВµР С–Р С‘РЎРѓРЎвЂљРЎР‚Р В°РЎвЂ Р С‘РЎРЏ, Р В°Р С”Р С• Р Вµ Р С•РЎвЂљР Р†Р С•РЎР‚Р ВµР Р…Р В°
        document.getElementById('registration-section').classList.add('hidden');
        
        section.classList.remove('hidden');
        setTimeout(() => {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    } else {
        section.classList.add('hidden');
    }
};

window.toggleRegistrationForm = function() {
    const section = document.getElementById('registration-section');
    if (section.classList.contains('hidden')) {
        // Р вЂ”Р В°РЎвЂљР Р†Р В°РЎР‚РЎРЏР СР Вµ РЎвЂћР С•РЎР‚Р СР В°РЎвЂљР В° Р В·Р В° Р С”Р С•Р Р…РЎвЂљР В°Р С”РЎвЂљ, Р В°Р С”Р С• Р Вµ Р С•РЎвЂљР Р†Р С•РЎР‚Р ВµР Р…Р В°
        document.getElementById('contact-section').classList.add('hidden');
        
        section.classList.remove('hidden');
        // Р СџР В»Р В°Р Р†Р Р…Р С• РЎРѓР С”РЎР‚Р С•Р В»Р Р†Р В°Р Р…Р Вµ Р Т‘Р С• РЎвЂћР С•РЎР‚Р СР В°РЎвЂљР В°, Р В·Р В° Р Т‘Р В° РЎРЏ Р Р†Р С‘Р Т‘Р С‘ Р С—Р С•РЎвЂљРЎР‚Р ВµР В±Р С‘РЎвЂљР ВµР В»РЎРЏРЎвЂљ Р Р†Р ВµР Т‘Р Р…Р В°Р С–Р В°
        setTimeout(() => {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    } else {
        section.classList.add('hidden');
    }
};

// ==============================================
// ENTRANCE NAVIGATION
// ==============================================

window.exitEntrance = function () {
    // Reset state
    currentRouteKey = "";
    apartmentList = [];
    
    // Clear hash and UI
    window.location.hash = "";
    document.getElementById('access-id').value = "";
    resetApartmentData();
    
    // Switch views
    document.getElementById('view-entrance-home').classList.remove('active');
    document.getElementById('view-entrance-home').classList.add('hidden');
    document.getElementById('view-selector').classList.remove('hidden');
    document.getElementById('view-selector').classList.add('active');
    
    // Smooth reset the apartment dropdown
    const select = document.getElementById("apartmentSelect");
    if (select) select.innerHTML = '<option value="">Р ВР В·Р В±Р ВµРЎР‚Р С‘ Р В°Р С—Р В°РЎР‚РЎвЂљР В°Р СР ВµР Р…РЎвЂљ</option>';
};

window.enterEntrance = async function () {
    let accessId = document.getElementById('access-id').value.trim();

    // Auto-decode if the field contains encoded characters (handling %D0 %D1 etc.)
    if (accessId.includes('%')) {
        try {
            accessId = decodeURIComponent(accessId);
            document.getElementById('access-id').value = accessId;
        } catch(e) {}
    }

    if (!accessId) {
        showToast("Р СљР С•Р В»РЎРЏ, Р Р†РЎР‰Р Р†Р ВµР Т‘Р ВµРЎвЂљР Вµ Р Р†Р В°РЎв‚¬Р ВµРЎвЂљР С• ID Р В·Р В° Р Т‘Р С•РЎРѓРЎвЂљРЎР‰Р С—!", "error");
        return false;
    }

    // Р вЂ”Р В°Р С—Р В°Р В·Р Р†Р В°Р СР Вµ Р Р† Р В±РЎР‚Р В°РЎС“Р В·РЎР‰РЎР‚Р В° (localStorage), Р В·Р В° Р Р…Р Вµ Р В·Р В°РЎвЂљРЎР‚РЎС“Р Т‘Р Р…РЎРЏР Р†Р В°Р СР Вµ Р Т‘Р С•Р СР С•РЎС“Р С—РЎР‚Р В°Р Р†Р С‘РЎвЂљР ВµР В»РЎРЏ РЎРѓР В»Р ВµР Т‘Р Р†Р В°РЎвЂ°Р С‘РЎРЏ Р С—РЎР‰РЎвЂљ
    localStorage.setItem("savedAccessId", accessId);

    // Р вЂ”Р В°Р Т‘Р В°Р Р†Р В°Р СР Вµ Р С–Р С• Р С”Р В°РЎвЂљР С• РЎвЂљР ВµР С”РЎС“РЎвЂ° Р С”Р В»РЎР‹РЎвЂЎ Р В·Р В° API Р В·Р В°РЎРЏР Р†Р С”Р С‘РЎвЂљР Вµ
    currentRouteKey = accessId;

    // Р РЋР СР ВµР Р…РЎРЏР СР Вµ Р В±РЎС“РЎвЂљР С•Р Р…Р В° Р В·Р В° Р С‘Р Р…Р Т‘Р С‘Р С”Р В°РЎвЂ Р С‘РЎРЏ
    const btn = document.querySelector("#view-selector .btn-primary");
    const originalText = btn.textContent;
    btn.textContent = "Р вЂ”Р В°РЎР‚Р ВµР В¶Р Т‘Р В°Р Р…Р Вµ...";
    btn.disabled = true;

    // Р вЂ”Р В°РЎР‚Р ВµР В¶Р Т‘Р В°Р СР Вµ РЎРѓР С—Р С‘РЎРѓРЎР‰Р С”Р В° РЎРѓ Р В°Р С—Р В°РЎР‚РЎвЂљР В°Р СР ВµР Р…РЎвЂљР С‘
    // Р С›Р В±Р ВµР Т‘Р С‘Р Р…Р ВµР Р…Р В° Р В·Р В°РЎРЏР Р†Р С”Р В° Р С—Р С•-Р Т‘Р С•Р В»РЎС“

    // Р вЂ”Р В°РЎР‚Р ВµР В¶Р Т‘Р В°Р СР Вµ Р С‘ Р С”Р С•Р Р…РЎвЂћР С‘Р С–РЎС“РЎР‚Р В°РЎвЂ Р С‘РЎРЏРЎвЂљР В° Р В·Р В° Р Р†РЎвЂ¦Р С•Р Т‘Р В° (Р СџР В»Р В°РЎвЂ°Р В°Р Р…Р Вµ Р С‘ РЎвЂљ.Р Р….)
    const [result, configResult] = await Promise.all([
        apiCall('list', { list: 'apartments' }),
        apiCall('getEntranceInfo')
    ]);

    if (configResult && configResult.success && configResult.info) {
        const info = configResult.info;

        if (info.isHardBlocked) {
            hideLoading();
            showToast(`РІС™В РїС‘РЏ Р вЂќР С•РЎРѓРЎвЂљРЎР‰Р С—РЎР‰РЎвЂљ Р Вµ Р Р…Р В°Р С—РЎР‰Р В»Р Р…Р С• РЎРѓР С—РЎР‚РЎРЏР Р… Р С—Р С•РЎР‚Р В°Р Т‘Р С‘ Р Р…Р В°Р Т‘ 3 Р СР ВµРЎРѓР ВµРЎвЂ Р В° Р Р…Р ВµР С—Р В»Р В°РЎвЂљР ВµР Р… Р В°Р В±Р С•Р Р…Р В°Р СР ВµР Р…РЎвЂљ. (Р СџРЎР‚Р С‘ Р С—РЎР‚Р ВµР Р†Р С•Р Т‘ Р В·Р В°Р Т‘РЎР‰Р В»Р В¶Р С‘РЎвЂљР ВµР В»Р Р…Р С• Р С—Р С•РЎРѓР С•РЎвЂЎР ВµРЎвЂљР Вµ ID: ${currentRouteKey})`, "error");
            btn.textContent = originalText;
            btn.disabled = false;
            return false; // PREVENT ENTRY
        }

        // Р вЂ™РЎР‰Р В·РЎРѓРЎвЂљР В°Р Р…Р С•Р Р†РЎРЏР Р†Р В°Р СР Вµ Р В±РЎС“РЎвЂљР С•Р Р…Р В° Р Р†Р ВµР Т‘Р Р…Р В°Р С–Р В° РЎвЂ°Р С•Р С Р С—РЎР‚Р С‘Р С”Р В»РЎР‹РЎвЂЎР В°РЎвЂљ Р В·Р В°РЎРЏР Р†Р С”Р С‘РЎвЂљР Вµ
        btn.textContent = originalText;
        btn.disabled = false;

        // Р вЂ”Р В°Р С—Р В°Р В·Р Р†Р В°Р СР Вµ РЎвЂ Р ВµР Р…Р С‘РЎвЂљР Вµ Р Р† РЎРѓР ВµРЎРѓР С‘РЎРЏРЎвЂљР В°
        if (info.pricePerApt !== undefined) {
            sessionStorage.setItem("pricePerApt_" + currentRouteKey, info.pricePerApt);
            sessionStorage.setItem("lifetimePrice_" + currentRouteKey, info.lifetimePrice);
            sessionStorage.setItem("currency_" + currentRouteKey, info.currency);
        }

        // Р ВР Р…РЎРѓРЎвЂљРЎР‚РЎС“Р С”РЎвЂ Р С‘Р С‘ Р В·Р В° Р С—Р В»Р В°РЎвЂ°Р В°Р Р…Р Вµ РІР‚вЂќ Р В·Р В°Р С—Р В°Р В·Р Р†Р В°Р СР Вµ Р В·Р В° Р С—Р С•-Р С”РЎР‰РЎРѓР Р…Р С•, Р Р…Р С• Р СњР вЂў Р С—Р С•Р С”Р В°Р В·Р Р†Р В°Р СР Вµ Р Р†Р ВµР Т‘Р Р…Р В°Р С–Р В° Р С—РЎР‚Р С‘ Р Р†Р В»Р С‘Р В·Р В°Р Р…Р Вµ
        if (info.paymentInfo) {
            document.getElementById('payment-instructions').textContent = info.paymentInfo;
            document.getElementById('masterPaymentText').value = info.paymentInfo;
            // Р РЋРЎР‰РЎвЂ¦РЎР‚Р В°Р Р…РЎРЏР Р†Р В°Р СР Вµ Р Р† session Р В·Р В° Р С‘Р В·Р С—Р С•Р В»Р В·Р Р†Р В°Р Р…Р Вµ Р С—РЎР‚Р С‘ Р С‘Р В·Р В±Р С•РЎР‚ Р Р…Р В° Р В°Р С—Р В°РЎР‚РЎвЂљР В°Р СР ВµР Р…РЎвЂљ
            sessionStorage.setItem('paymentInfo_' + currentRouteKey, info.paymentInfo);
        } else {
            sessionStorage.removeItem('paymentInfo_' + currentRouteKey);
        }
        // Р вЂ™Р С‘Р Р…Р В°Р С–Р С‘ РЎРѓР С”РЎР‚Р С‘Р Р†Р В°Р СР Вµ Р С—РЎР‚Р С‘ Р Р†Р В»Р С‘Р В·Р В°Р Р…Р Вµ РІР‚вЂќ РЎвЂ°Р Вµ РЎРѓР Вµ Р С—Р С•Р С”Р В°Р В¶Р Вµ РЎРѓР В°Р СР С• Р С—РЎР‚Р С‘ Р С‘Р В·Р В±РЎР‚Р В°Р Р… Р В°Р С—Р В°РЎР‚РЎвЂљР В°Р СР ВµР Р…РЎвЂљ РЎРѓ Р Т‘РЎР‰Р В»Р С–
        document.getElementById('payment-details-box').style.display = 'none';

        // Р ВР СР ВµР в„–Р В» Р В·Р В° Р Р†РЎР‚РЎР‰Р В·Р С”Р В°
        const adminMailBtn = document.getElementById('admin-mailto-link');
        if (adminMailBtn) {
            if (info.adminEmail) {
                adminMailBtn.href = `mailto:${info.adminEmail}`;
                adminMailBtn.style.display = 'inline-block';
            } else {
                adminMailBtn.style.display = 'none';
            }
        }

        // Р вЂ™РЎР‰Р Р…РЎв‚¬Р Р…Р С‘ Р В»Р С‘Р Р…Р С”Р С•Р Р†Р Вµ
        if (info.linkElectric) {
            document.getElementById('btn-electric-link').href = info.linkElectric;
            document.getElementById('btn-electric-link').style.display = 'inline-block';
            document.getElementById('masterLinkElectric').value = info.linkElectric;
        } else {
            document.getElementById('btn-electric-link').style.display = 'none';
        }

        if (info.linkSubscription) {
            document.getElementById('btn-subscription-link').href = info.linkSubscription;
            document.getElementById('btn-subscription-link').style.display = 'inline-block';
            document.getElementById('masterLinkSubscription').value = info.linkSubscription;
        } else {
            document.getElementById('btn-subscription-link').style.display = 'none';
        }

        // --- Р ВР вЂ”Р В§Р ВР РЋР вЂєР Р‡Р вЂ™Р С’Р СњР вЂў Р СњР С’ Р С’Р вЂР С›Р СњР С’Р СљР вЂўР СњР Сћ Р С™Р Р„Р Сљ Р СџР вЂєР С’Р СћР В¤Р С›Р В Р СљР С’Р СћР С’ ---
        let totalMonthly = 0;
        const basePrice = parseFloat(info.pricePerApt) || 0;
        const aptCount = (result && Array.isArray(result)) ? result.length : 0;
        const individual = info.individualPrices || [];
        const globalEx = individual.find(ex => ex.apartment === 'ALL');

        if (globalEx) {
            totalMonthly = aptCount * parseFloat(globalEx.price);
        } else {
            totalMonthly = 0;
            if (Array.isArray(result)) {
                result.forEach(apt => {
                    const aptEx = individual.find(ex => ex.apartment === apt);
                    totalMonthly += aptEx ? parseFloat(aptEx.price) : basePrice;
                });
            }
        }

        const subMonthlyEl = document.getElementById("subMonthlyPrice");
        const subLifetimeEl = document.getElementById("subLifetimePrice");
        const subCodeEl = document.getElementById("subscriptionCodeDisplay");

        if (subMonthlyEl) subMonthlyEl.textContent = `${totalMonthly.toFixed(2)} EUR`;
        if (subLifetimeEl) subLifetimeEl.textContent = `${parseFloat(info.lifetimePrice || 0).toFixed(2)} EUR`;
        if (subCodeEl) subCodeEl.textContent = currentRouteKey;

        if (totalMonthly === 0 && aptCount > 0) {
            if (subMonthlyEl) subMonthlyEl.innerHTML = '<span style="color:green;">СЂСџР‹Рѓ Р вЂР вЂўР вЂ”Р СџР вЂєР С’Р СћР СњР С›</span>';
        }

        // --- Р вЂњР вЂєР С›Р вЂР С’Р вЂєР СњР С› Р РЋР Р„Р С›Р вЂР В©Р вЂўР СњР ВР вЂў Р С›Р Сћ Р РЋР Р€Р СџР вЂўР В  Р С’Р вЂќР СљР ВР Сњ ---
        const newsBanner = document.getElementById("adminGlobalNews");
        const newsText = document.getElementById("adminGlobalNewsText");
        if (info.globalMessage && info.globalMessage.trim() !== "") {
            newsText.innerHTML = info.globalMessage.replace(/\n/g, '<br>');
            newsBanner.style.display = "block";
        } else {
            newsBanner.style.display = "none";
        }

        // --- Р РЋР Р„Р С›Р вЂР В©Р вЂўР СњР ВР вЂў Р С›Р Сћ Р вЂќР С›Р СљР С›Р Р€Р СџР В Р С’Р вЂ™Р ВР СћР вЂўР вЂєР Р‡ (Р С™Р Р„Р Сљ Р вЂ“Р ВР вЂ™Р Р€Р В©Р ВР СћР вЂў) ---
        const userNoticeBanner = document.getElementById("userEntranceNotice");
        const userNoticeText = document.getElementById("userEntranceNoticeText");
        const userNoticeBannerHome = document.getElementById("userEntranceNoticeHome");
        const userNoticeTextHome = document.getElementById("userEntranceNoticeTextHome");

        if (info.entranceNotice && info.entranceNotice.trim() !== "") {
            const formatted = info.entranceNotice.replace(/\n/g, '<br>');
            userNoticeText.innerHTML = formatted;
            userNoticeBanner.style.display = "block";
            if (userNoticeTextHome) userNoticeTextHome.innerHTML = formatted;
            if (userNoticeBannerHome) userNoticeBannerHome.style.display = "block";

            // Populate value in admin tab
            const adminNoticeInput = document.getElementById("masterEntranceNotice");
            if (adminNoticeInput) adminNoticeInput.value = info.entranceNotice;
        } else {
            userNoticeBanner.style.display = "none";
            if (userNoticeBannerHome) userNoticeBannerHome.style.display = "none";
            const adminNoticeInput = document.getElementById("masterEntranceNotice");
            if (adminNoticeInput) adminNoticeInput.value = "";
        }
    } else {
        // Р РЋР С”РЎР‚Р С‘Р Р†Р В°Р СР Вµ Р Р†РЎРѓР С‘РЎвЂЎР С”Р С•, Р В°Р С”Р С• Р Р…РЎРЏР СР В° Р С‘Р Р…РЎвЂћР С•
        document.getElementById('payment-details-box').style.display = 'none';
        document.getElementById('admin-mailto-link').style.display = 'none';
        document.getElementById('btn-electric-link').style.display = 'none';
        document.getElementById('btn-subscription-link').style.display = 'none';
    }

    // Р С›Р вЂР В Р С’Р вЂР С›Р СћР С™Р С’ Р СњР С’ Р РЋР СџР ВР РЋР Р„Р С™Р С’ Р РЋ Р С’Р СџР С’Р В Р СћР С’Р СљР вЂўР СњР СћР В Р В Р РЋР СљР Р‡Р СњР С’ Р СњР С’ Р ВР вЂ”Р вЂњР вЂєР вЂўР вЂќР С’
    if (result && !result.error && Array.isArray(result)) {
        apartmentList = result;

        // Р С›Р В±Р Р…Р С•Р Р†РЎРЏР Р†Р В°Р СР Вµ Р В·Р В°Р С–Р В»Р В°Р Р†Р С‘Р ВµРЎвЂљР С• Р Р…Р В° Р Р†РЎвЂ¦Р С•Р Т‘Р В°
        if (configResult && configResult.info && configResult.info.entranceName) {
            document.getElementById('entrance-title').textContent = configResult.info.entranceName;
        } else {
            document.getElementById('entrance-title').textContent = `Р вЂўРЎвЂљР В°Р В¶Р Р…Р В° РЎРѓР С•Р В±РЎРѓРЎвЂљР Р†Р ВµР Р…Р С•РЎРѓРЎвЂљ - ID ${currentRouteKey}`;
        }

        // Р СџРЎР‚Р ВµР Р†Р С”Р В»РЎР‹РЎвЂЎР Р†Р В°Р СР Вµ Р ВµР С”РЎР‚Р В°Р Р…Р В°
        document.getElementById('view-selector').classList.remove('active');
        document.getElementById('view-selector').classList.add('hidden');
        document.getElementById('view-entrance-home').classList.remove('hidden');
        document.getElementById('view-entrance-home').classList.add('active');

        // Р СџРЎР‰Р В»Р Р…Р С‘Р С Р С—Р В°Р Т‘Р В°РЎвЂ°Р С•РЎвЂљР С• Р СР ВµР Р…РЎР‹
        const select = document.getElementById("apartmentSelect");
        select.innerHTML = '<option value="">Р ВР В·Р В±Р ВµРЎР‚Р С‘ Р В°Р С—Р В°РЎР‚РЎвЂљР В°Р СР ВµР Р…РЎвЂљ</option>';
        apartmentList.forEach(a => {
            const opt = document.createElement("option");
            opt.value = opt.textContent = a;
            select.appendChild(opt);
        });

        // Р СџР В Р вЂўР вЂ”Р С’Р С™Р вЂєР В®Р В§Р вЂ™Р С’Р СљР вЂў HASH Р вЂ”Р С’ Р РЋР ВР СњР ТђР В Р С›Р СњР ВР вЂ”Р С’Р В¦Р ВР Р‡ (Р В±Р ВµР В· Р В·Р В°РЎвЂ Р С‘Р С”Р В»РЎРЏР Р…Р Вµ)
        const targetHash = "#" + encodeURIComponent(currentRouteKey);
        if (window.location.hash !== targetHash && !window.location.hash.includes("/")) {
            window.location.hash = targetHash;
        }

        // Р вЂ”Р В°РЎР‚Р ВµР В¶Р Т‘Р В°Р СР Вµ Р Т‘Р В°РЎв‚¬Р В±Р С•РЎР‚Р Т‘Р В°
        loadDashboardData();
        return true;
    } else {
        const errStr = result && result.error ? result.error.toString() : "";
        if (errStr.includes("fetch") || errStr.includes("NetworkError")) {
            showToast("Р вЂњРЎР‚Р ВµРЎв‚¬Р С”Р В° Р С—РЎР‚Р С‘ Р Р†РЎР‚РЎР‰Р В·Р С”Р В° (Failed to fetch). Р СџРЎР‚Р С•Р Р†Р ВµРЎР‚Р ВµРЎвЂљР Вµ Р С‘Р Р…РЎвЂљР ВµРЎР‚Р Р…Р ВµРЎвЂљ Р Р†РЎР‚РЎР‰Р В·Р С”Р В°РЎвЂљР В° РЎРѓР С‘.", "error");
        } else {
            showToast(`Р вЂњРЎР‚Р ВµРЎв‚¬Р ВµР Р… Р Р†РЎвЂ¦Р С•Р Т‘: ${currentRouteKey} Р Р…Р Вµ Р Вµ Р Р…Р В°Р СР ВµРЎР‚Р ВµР Р… Р Р† Р В±Р В°Р В·Р В°РЎвЂљР В°.`, "error");
        }
        return false;
    }
}

// Check URL params on load
// (Moved logic to main DOMContentLoaded at the top)

async function loadDashboardData() {
    try {
        const result = await apiCall('getDashboardData');
        if (result && result.success && result.dashboard) {
            const d = result.dashboard;
            const cur = sessionStorage.getItem("currency_" + currentRouteKey) || "EUR";

            document.getElementById('dash-debts').textContent = `${d.totalDebts} ${cur}`;
            
            // Р СџР С•Р С”Р В°Р В·Р Р†Р В°Р СР Вµ РЎРѓРЎР‰Р В±РЎР‚Р В°Р Р…Р С•РЎвЂљР С• РЎРѓР С—РЎР‚РЎРЏР СР С• Р С•Р В±РЎвЂ°Р С•РЎвЂљР С• Р Р…Р В°РЎвЂЎР С‘РЎРѓР В»Р ВµР Р…Р С•
            const collected = parseFloat(d.totalBalance) || 0;
            const target = parseFloat(d.totalTargetFund) || 0;
            document.getElementById('dash-balance').textContent = `${collected.toFixed(2)} ${cur} (Р С•РЎвЂљ ${target.toFixed(2)} ${cur})`;

            // Trends status text update
            const debtsTrendEl = document.getElementById('dash-debts-trend');
            const balanceTrendEl = document.getElementById('dash-balance-trend');

            if (debtsTrendEl) {
                debtsTrendEl.textContent = parseFloat(d.totalDebts) > 0 ? "Р ВР В·Р С‘РЎРѓР С”Р Р†Р В° РЎРѓР Вµ Р В·Р В°Р С—Р В»Р В°РЎвЂ°Р В°Р Р…Р Вµ" : "Р вЂ™РЎРѓР С‘РЎвЂЎР С”Р С• Р Вµ Р С‘Р В·Р С—Р В»Р В°РЎвЂљР ВµР Р…Р С•";
            }
            if (balanceTrendEl) {
                balanceTrendEl.textContent = parseFloat(d.totalBalance) > 0 ? "Р СњР В°Р В»Р С‘РЎвЂЎР ВµР Р… РЎвЂћР С•Р Р…Р Т‘" : "Р С›РЎвЂЎР В°Р С”Р Р†Р В° РЎРѓРЎР‰Р В±Р С‘РЎР‚Р В°Р Р…Р Вµ";
            }

            if (d.trendData && d.trendData.length > 0) {
                // Ensure Chart.js is loaded before calling initChart
                if (typeof Chart !== 'undefined') {
                    initChart(d.trendData);
                } else {
                    console.warn("Chart.js is not loaded yet.");
                    setTimeout(() => { if (typeof Chart !== 'undefined') initChart(d.trendData); }, 1000);
                }
            } else {
                console.log("No trend data available for dashboard chart.");
            }
        } else {
            const errMsg = result?.error || "Р СњР ВµРЎС“РЎРѓР С—Р ВµРЎв‚¬Р Р…Р С• Р В·Р В°РЎР‚Р ВµР В¶Р Т‘Р В°Р Р…Р Вµ Р Р…Р В° Р С•Р В±Р С•Р В±РЎвЂ°Р ВµР Р…Р С‘РЎвЂљР Вµ Р Т‘Р В°Р Р…Р Р…Р С‘.";
            console.error("Dashboard data load failed:", errMsg);
            // Don't show toast for every fail to not annoy, but update the placeholders if they were stuck
            document.getElementById('dash-debts-trend').textContent = "Р вЂњРЎР‚Р ВµРЎв‚¬Р С”Р В° Р С—РЎР‚Р С‘ Р В·Р В°РЎР‚Р ВµР В¶Р Т‘Р В°Р Р…Р Вµ";
            document.getElementById('dash-balance-trend').textContent = "Р вЂњРЎР‚Р ВµРЎв‚¬Р С”Р В° Р С—РЎР‚Р С‘ Р В·Р В°РЎР‚Р ВµР В¶Р Т‘Р В°Р Р…Р Вµ";
        }
    } catch (err) {
        console.error("Critical error in loadDashboardData:", err);
    }
}

let myChart = null;
function initChart(data) {
    const ctx = document.getElementById('trendChart').getContext('2d');

    if (myChart) {
        myChart.destroy();
    }

    const labels = data.map(i => i.period);

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Р С’РЎРѓР В°Р Р…РЎРѓРЎРЉР С•РЎР‚',
                    data: data.map(i => i.elevator),
                    borderColor: '#3b6edc',
                    backgroundColor: 'rgba(59, 110, 220, 0.1)',
                    tension: 0.3,
                    fill: false,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Р С’Р В±Р С•Р Р…Р В°Р СР ВµР Р…РЎвЂљ',
                    data: data.map(i => i.subscription),
                    borderColor: '#ff9500',
                    backgroundColor: 'rgba(255, 149, 0, 0.1)',
                    tension: 0.3,
                    fill: false,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Р С›РЎРѓР Р†Р ВµРЎвЂљР В»Р ВµР Р…Р С‘Р Вµ',
                    data: data.map(i => i.light),
                    borderColor: '#34c759',
                    backgroundColor: 'rgba(52, 199, 89, 0.1)',
                    tension: 0.3,
                    fill: false,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Р СџР С•РЎвЂЎР С‘РЎРѓРЎвЂљР Р†Р В°Р Р…Р Вµ',
                    data: data.map(i => i.cleaning),
                    borderColor: '#5856d6',
                    backgroundColor: 'rgba(88, 86, 214, 0.1)',
                    tension: 0.3,
                    fill: false,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Р СџР С•Р Т‘Р Т‘РЎР‚РЎР‰Р В¶Р С”Р В°',
                    data: data.map(i => i.podrajka),
                    borderColor: '#ff2d55',
                    backgroundColor: 'rgba(255, 45, 85, 0.1)',
                    tension: 0.3,
                    fill: false,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Р В¤Р С•Р Р…Р Т‘ РЎР‚Р ВµР СР С•Р Р…РЎвЂљ',
                    data: data.map(i => i.remont),
                    borderColor: '#8e8e93',
                    backgroundColor: 'rgba(142, 142, 147, 0.1)',
                    tension: 0.3,
                    fill: false,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 12,
                        font: { size: 11 }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0,0,0,0.05)'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

// ==============================================
// APARTMENT DATA
// ==============================================

async function loadApartmentData(apartment) {
    resetApartmentData();

    // Р РЋР С”РЎР‚Р С‘Р Р†Р В°Р СР Вµ Р С‘Р Р…РЎРѓРЎвЂљРЎР‚РЎС“Р С”РЎвЂ Р С‘Р С‘РЎвЂљР Вµ Р В·Р В° Р С—Р В»Р В°РЎвЂ°Р В°Р Р…Р Вµ Р Т‘Р С•Р С”Р В°РЎвЂљР С• Р Р…Р Вµ Р В·Р Р…Р В°Р ВµР С Р Т‘Р В°Р В»Р С‘ Р С‘Р СР В° Р Т‘РЎР‰Р В»Р С–
    document.getElementById('payment-details-box').style.display = 'none';

    // Update URL Hash for persistence
    if (currentRouteKey) {
        window.location.hash = `${encodeURIComponent(currentRouteKey)}/${encodeURIComponent(apartment)}`;
    }

    // Р СџР С•Р С”Р В°Р В·Р Р†Р В°Р СР Вµ Р С”Р С•Р Т‘Р В° Р В·Р В° Р С—Р В»Р В°РЎвЂ°Р В°Р Р…Р Вµ Р Р†Р ВµР Т‘Р Р…Р В°Р С–Р В°
    document.getElementById("payment-reference-value").textContent = `${currentRouteKey}-${apartment}`;
    document.getElementById("payment-reference-box").style.display = "block";

    const result = await apiCall('apartment', { apartment: apartment });

    if (result && result.error && result.showMessage) {
        document.getElementById("saldo").textContent = "Р РЋР С”РЎР‚Р С‘РЎвЂљ";
        showToast("Р ВР Р…РЎвЂћР С•РЎР‚Р СР В°РЎвЂ Р С‘РЎРЏРЎвЂљР В° Р В·Р В° РЎРѓР В°Р В»Р Т‘Р С•РЎвЂљР С• Р вЂ™Р С‘, Р Р…Р Вµ РЎРѓР Вµ Р С—Р С•Р С”Р В°Р В·Р Р†Р В° Р С—Р С•РЎР‚Р В°Р Т‘Р С‘ Р Р…Р ВµР С—Р В»Р В°РЎвЂљР ВµР Р… Р В°Р В±Р С•Р Р…Р В°Р СР ВµР Р…РЎвЂљ", "error");
        return;
    }

    if (result && !result.error) {
        const saldoVal = Number(result.saldo || 0);
        const sEl = document.getElementById("saldo");
        const sCard = document.getElementById("saldoCard");

        sEl.textContent = saldoVal.toFixed(2) + " EUR";

        sCard.classList.remove("saldo-positive", "saldo-negative", "saldo-zero");
        if (saldoVal > 0) sCard.classList.add("saldo-positive");
        else if (saldoVal < 0) sCard.classList.add("saldo-negative");
        else sCard.classList.add("saldo-zero");

        // --- Р ВР СњР РЋР СћР В Р Р€Р С™Р В¦Р ВР В Р вЂ”Р С’ Р СџР вЂєР С’Р В©Р С’Р СњР вЂў РІР‚вЂќ Р С—Р С•Р С”Р В°Р В·Р Р†Р В°РЎвЂљ РЎРѓР Вµ РЎРѓР В°Р СР С• Р С—РЎР‚Р С‘ Р Т‘РЎР‰Р В»Р С– ---
        const payBox = document.getElementById('payment-details-box');
        if (saldoVal > 0) {
            const storedPayInfo = sessionStorage.getItem('paymentInfo_' + currentRouteKey);
            if (storedPayInfo) {
                document.getElementById('payment-instructions').textContent = storedPayInfo;
                payBox.style.display = 'block';
            }
        } else {
            payBox.style.display = 'none';
        }

        const tBody = document.getElementById("tableBody");
        if (result.periods && Array.isArray(result.periods)) {
            result.periods.forEach((r, idx) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                <td>${r.period}</td>
                <td>${Number(r.elevator || 0).toFixed(2)}</td>
                <td>${Number(r.subscription || 0).toFixed(2)}</td>
                <td>${Number(r.light || 0).toFixed(2)}</td>
                <td>${Number(r.security || 0).toFixed(2)}</td>
                <td>${Number(r.cleaning || 0).toFixed(2)}</td>
                <td>${Number(r.podrajka || 0).toFixed(2)}</td>
                <td>${Number(r.remont || 0).toFixed(2)}</td>
                <td>${Number(r.due || 0).toFixed(2)}</td>
                <td>${Number(r.paid || 0).toFixed(2)}</td>
            `;
                tBody.appendChild(tr);
            });
        } else {
            tBody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Р СњРЎРЏР СР В° Р Р…Р В°Р В»Р С‘РЎвЂЎР Р…Р С‘ Р Т‘Р В°Р Р…Р Р…Р С‘ Р В·Р В° Р С‘Р В·Р В±РЎР‚Р В°Р Р…Р С‘РЎРЏ Р В°Р С—Р В°РЎР‚РЎвЂљР В°Р СР ВµР Р…РЎвЂљ.</td></tr>';
        }

        // --- Р СџР вЂўР В Р РЋР С›Р СњР С’Р вЂєР СњР С› Р РЋР Р„Р С›Р вЂР В©Р вЂўР СњР ВР вЂў Р вЂ”Р С’ Р С’Р СџР С’Р В Р СћР С’Р СљР вЂўР СњР СћР С’ ---
        const aptNoticeBanner = document.getElementById("individualAptNotice");
        const aptNoticeText = document.getElementById("individualAptNoticeText");
        if (result.aptNotice && result.aptNotice.trim() !== "") {
            aptNoticeText.innerHTML = result.aptNotice.replace(/\n/g, '<br>');
            aptNoticeBanner.style.display = "block";
        } else {
            aptNoticeBanner.style.display = "none";
        }
    } else {
        showToast("Р вЂњРЎР‚Р ВµРЎв‚¬Р С”Р В° Р С—РЎР‚Р С‘ Р В·Р В°РЎР‚Р ВµР В¶Р Т‘Р В°Р Р…Р Вµ Р Р…Р В° Р Т‘Р В°Р Р…Р Р…Р С‘РЎвЂљР Вµ", "error");
    }
}

// ==============================================
// ADMIN PANEL LOGIC 
// ==============================================

window.openAdmin = function () {
    document.getElementById("adminOverlay").classList.add("active");
    if (sessionStorage.getItem("adminAuth_" + currentRouteKey)) {
        showAdminContent();
    } else {
        document.getElementById("loginCard").style.display = "block";
        document.getElementById("adminCard").style.display = "none";
        document.getElementById("pinInput").value = "";
    }
}

window.closeAdmin = function () {
    document.getElementById("adminOverlay").classList.remove("active");
}

window.verifyPin = async function () {
    const email = document.getElementById("adminEmailInput").value.trim();
    const pin = document.getElementById("pinInput").value.trim();
    const err = document.getElementById("pinError");

    if (!email || !pin) {
        err.textContent = "Р СљР С•Р В»РЎРЏ, Р Р†РЎР‰Р Р†Р ВµР Т‘Р ВµРЎвЂљР Вµ Р С‘Р СР ВµР в„–Р В» Р С‘ Р С—Р В°РЎР‚Р С•Р В»Р В°.";
        return;
    }

    const result = await apiCall('verifyPin', { pin: pin });

    if (result && result.success) {
        sessionStorage.setItem("adminAuth_" + currentRouteKey, pin);
        localStorage.setItem("savedAdminEmail", email);
        err.textContent = "";
        showAdminContent();
    } else {
        err.textContent = result?.error || "Р вЂњРЎР‚Р ВµРЎв‚¬Р ВµР Р… PIN Р С”Р С•Р Т‘.";
    }
}

function showAdminContent() {
    document.getElementById("loginCard").style.display = "none";
    document.getElementById("adminCard").style.display = "block";

    // Р СџРЎР‰РЎР‚Р Р†Р С•Р Р…Р В°РЎвЂЎР В°Р В»Р Р…Р В° Р С—Р С•Р Т‘Р С”Р В°Р Р…Р В° Р В·Р В° MASTER Р Р…Р В°РЎРѓРЎвЂљРЎР‚Р С•Р в„–Р С”Р С‘
    const masterPromptKey = "hasSeenMasterPrompt_" + currentRouteKey;
    if (!localStorage.getItem(masterPromptKey)) {
        setTimeout(() => {
            showToast("СЂСџР‹Рѓ Р вЂќР С•Р В±РЎР‚Р Вµ Р Т‘Р С•РЎв‚¬Р В»Р С‘! Р СџРЎР‚Р ВµР С—Р С•РЎР‚РЎР‰РЎвЂЎР Р†Р В°Р СР Вµ Р С—РЎР‰РЎР‚Р Р†Р С• Р Т‘Р В° Р С—Р С•РЎРѓР ВµРЎвЂљР С‘РЎвЂљР Вµ РЎРѓР ВµР С”РЎвЂ Р С‘РЎРЏ 'MASTER РІР‚вЂњ Р СњР В°РЎРѓРЎвЂљРЎР‚Р С•Р в„–Р С”Р С‘', Р В·Р В° Р Т‘Р В° Р Р†РЎР‰Р Р†Р ВµР Т‘Р ВµРЎвЂљР Вµ Р Р…Р В°РЎвЂЎР В°Р В»Р Р…Р С‘РЎвЂљР Вµ Р С—Р В°РЎР‚Р В°Р СР ВµРЎвЂљРЎР‚Р С‘ Р Р…Р В° Р Р†РЎвЂ¦Р С•Р Т‘Р В°.", "success");
            localStorage.setItem(masterPromptKey, "true");
        }, 1000);
    }

    const subCodeEl = document.getElementById("subscriptionCodeDisplay");
    if (subCodeEl) {
        subCodeEl.textContent = currentRouteKey;
    }

    // Р СџР С•Р С—РЎР‰Р В»Р Р†Р В°Р СР Вµ РЎвЂ Р ВµР Р…Р С‘РЎвЂљР Вµ, Р В°Р С”Р С• Р С–Р С‘ Р С‘Р СР В°Р СР Вµ Р В·Р В°Р С—Р В°Р В·Р ВµР Р…Р С‘
    const p1 = sessionStorage.getItem("pricePerApt_" + currentRouteKey);
    const p2 = sessionStorage.getItem("lifetimePrice_" + currentRouteKey);
    const curr = sessionStorage.getItem("currency_" + currentRouteKey) || "EUR";

    if (p1 && p2) {
        const aptCount = apartmentList ? apartmentList.length : 0;
        const totalMonthly = (parseFloat(p1) * aptCount).toFixed(2);

        const mPriceEl = document.getElementById("subMonthlyPrice");
        const lPriceEl = document.getElementById("subLifetimePrice");

        if (mPriceEl) mPriceEl.textContent = `${totalMonthly} ${curr}`;
        if (lPriceEl) lPriceEl.textContent = `${p2} ${curr}`;
    }

    populateAdminDropdowns();
    if(typeof checkRemontEligibility === 'function') checkRemontEligibility();
}

function autoFillCurrentPeriod() {
    const d = new Date();
    const currentPeriod = String(d.getMonth() + 1).padStart(2, '0') + "." + d.getFullYear();

    const periodFields = [
        "adminPeriod", "chargesPeriod",
        "masterLogikaFrom", "masterUchFrom",
        "masterObFrom", "masterChFrom", "masterIdFrom"
    ];

    periodFields.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.tagName === 'SELECT') {
            // Populate if empty
            if (el.options.length === 0) {
                const year = d.getFullYear();
                const monthNames = [
                    "Р Р‡Р Р…РЎС“Р В°РЎР‚Р С‘", "Р В¤Р ВµР Р†РЎР‚РЎС“Р В°РЎР‚Р С‘", "Р СљР В°РЎР‚РЎвЂљ", "Р С’Р С—РЎР‚Р С‘Р В»", "Р СљР В°Р в„–", "Р В®Р Р…Р С‘",
                    "Р В®Р В»Р С‘", "Р С’Р Р†Р С–РЎС“РЎРѓРЎвЂљ", "Р РЋР ВµР С—РЎвЂљР ВµР СР Р†РЎР‚Р С‘", "Р С›Р С”РЎвЂљР С•Р СР Р†РЎР‚Р С‘", "Р СњР С•Р ВµР СР Р†РЎР‚Р С‘", "Р вЂќР ВµР С”Р ВµР СР Р†РЎР‚Р С‘"
                ];
                
                monthNames.forEach((name, index) => {
                    const m = String(index + 1).padStart(2, '0');
                    const val = `${m}.${year}`;
                    const opt = new Option(`${name} ${year}`, val);
                    el.appendChild(opt);
                });
            }
            // Always try to set current period as default if no value is set
            if (!el.getAttribute('data-init-done')) {
                el.value = currentPeriod;
                el.setAttribute('data-init-done', 'true');
            }
        } else if (el && !el.value) {
            el.value = currentPeriod;
        }
    });
}

function populateAdminDropdowns() {
    ["adminApt", "adminEmailApt", "masterUchApt", "masterObApt", "masterChApt", "masterIdApt", "masterBookApt", "docAptSelect", "masterInfoApt", "emailAptTarget"].forEach(id => {
        const sel = document.getElementById(id);
        if (sel && sel.options.length <= 1) {
            sel.innerHTML = '<option value="">Р ВР В·Р В±Р ВµРЎР‚Р С‘ Р В°Р С—Р В°РЎР‚РЎвЂљР В°Р СР ВµР Р…РЎвЂљ</option>';
            apartmentList.forEach(a => sel.appendChild(new Option(a, a)));
        }
    });

    // Р вЂ”Р Р€Р вЂўР РЋ Р вЂ™Р В°Р В»Р С‘Р Т‘Р В°РЎвЂ Р С‘РЎРЏ Р Р† РЎР‚Р ВµР В°Р В»Р Р…Р С• Р Р†РЎР‚Р ВµР СР Вµ Р В·Р В° Р С•Р В±Р С‘РЎвЂљР В°РЎвЂљР ВµР В»Р С‘
    const obInput = document.getElementById("masterObVal");
    if (obInput) {
        obInput.addEventListener("change", (e) => {
            if (e.target.value !== "" && parseInt(e.target.value) < 1) {
                showToast("РІС™В РїС‘РЏ Р СљР С‘Р Р…Р С‘Р СР В°Р В»Р Р…Р С‘РЎРЏРЎвЂљ Р В±РЎР‚Р С•Р в„– Р Вµ 1. РІР‚С›Р вЂ”Р В° РЎРѓР В°Р СР С•РЎРѓРЎвЂљР С•РЎРЏРЎвЂљР ВµР В»Р ВµР Р… Р С•Р В±Р ВµР С”РЎвЂљ, Р Р† Р С”Р С•Р в„–РЎвЂљР С• РЎРѓР Вµ Р С—РЎР‚Р ВµР В±Р С‘Р Р†Р В°Р Р†Р В° Р Р…Р Вµ Р С—Р С•Р Р†Р ВµРЎвЂЎР Вµ Р С•РЎвЂљ 30 Р Т‘Р Р…Р С‘ Р Р† Р С–Р С•Р Т‘Р С‘Р Р…Р В°РЎвЂљР В°, РЎР‚Р В°Р В·РЎвЂ¦Р С•Р Т‘Р С‘РЎвЂљР Вµ Р В·Р В° РЎС“Р С—РЎР‚Р В°Р Р†Р В»Р ВµР Р…Р С‘Р Вµ Р С‘ Р С—Р С•Р Т‘Р Т‘РЎР‚РЎР‰Р В¶Р С”Р В° РЎРѓР Вµ Р В·Р В°Р С—Р В»Р В°РЎвЂ°Р В°РЎвЂљ Р Р† РЎР‚Р В°Р В·Р СР ВµРЎР‚Р В°, Р С•Р С—РЎР‚Р ВµР Т‘Р ВµР В»Р ВµР Р… Р В·Р В° Р ВµР Т‘Р С‘Р Р… Р С•Р В±Р С‘РЎвЂљР В°РЎвЂљР ВµР В».РІР‚Сљ (Р В§Р В». 51, Р В°Р В». 1 Р С•РЎвЂљ Р вЂ”Р Р€Р вЂўР РЋ)", "error");
                e.target.value = 1;
            }
        });
    }
    autoFillCurrentPeriod();
}

const getStoredPin = () => sessionStorage.getItem("adminAuth_" + currentRouteKey);

window.submitPayment = async function () {
    const apt = document.getElementById("adminApt").value;
    const period = document.getElementById("adminPeriod").value.trim();
    const amount = document.getElementById("adminAmount").value.trim();

    if (!apt || !period || !amount) {
        showToast("Р СџР С•Р С—РЎР‰Р В»Р Р…Р ВµРЎвЂљР Вµ Р Р†РЎРѓР С‘РЎвЂЎР С”Р С‘ Р С—Р С•Р В»Р ВµРЎвЂљР В° Р В·Р В° Р С—Р В»Р В°РЎвЂ°Р В°Р Р…Р Вµ!", "error");
        return;
    }

    const btn = document.getElementById("payBtn");
    showSaving(btn, "Р вЂ”Р В°Р С—Р С‘РЎРѓР Р†Р В°Р Р…Р Вµ...");

    const result = await apiCall('addPayment', {
        pin: getStoredPin(),
        apartment: apt,
        period: period,
        amount: amount
    });

    hideSaving(btn, "Р вЂќР С•Р В±Р В°Р Р†Р С‘ Р С—Р В»Р В°РЎвЂ°Р В°Р Р…Р Вµ");

    if (result && result.success) {
        showToast("РІСљвЂ¦ Р Р€РЎРѓР С—Р ВµРЎв‚¬Р Р…Р С• Р Т‘Р С•Р В±Р В°Р Р†Р ВµР Р…Р С• Р С—Р В»Р В°РЎвЂ°Р В°Р Р…Р Вµ.", "success");
        document.getElementById("adminAmount").value = "";
        refreshCurrentView();
    } else {
        showToast(result?.error || "Р вЂ™РЎР‰Р В·Р Р…Р С‘Р С”Р Р…Р В° Р С–РЎР‚Р ВµРЎв‚¬Р С”Р В°", "error");
    }
}

window.loadBookData = async function () {
    const apt = document.getElementById("masterBookApt").value;
    if (!apt) return;

    // Clear fields first
    const fields = ["Owner", "Email", "Occupants", "EntryDate", "Pets", "Purpose"];
    fields.forEach(f => {
        const el = document.getElementById("book-" + f);
        if (el) el.value = "";
    });

    try {
        const result = await apiCall('getBookData', { apartment: apt });
        if (result && result.success && result.data) {
            const d = result.data;
            if (d["Р РЋР С•Р В±РЎРѓРЎвЂљР Р†Р ВµР Р…Р С‘Р С”"]) document.getElementById("book-Owner").value = d["Р РЋР С•Р В±РЎРѓРЎвЂљР Р†Р ВµР Р…Р С‘Р С”"];
            if (d["Р ВР СР ВµР в„–Р В»"]) document.getElementById("book-Email").value = d["Р ВР СР ВµР в„–Р В»"];
            if (d["Р С›Р В±Р С‘РЎвЂљР В°РЎвЂљР ВµР В»Р С‘"]) document.getElementById("book-Occupants").value = d["Р С›Р В±Р С‘РЎвЂљР В°РЎвЂљР ВµР В»Р С‘"];
            if (d["Р вЂќР С•Р СР В°РЎв‚¬Р Р…Р С‘ Р В»РЎР‹Р В±Р С‘Р СРЎвЂ Р С‘"]) document.getElementById("book-Pets").value = d["Р вЂќР С•Р СР В°РЎв‚¬Р Р…Р С‘ Р В»РЎР‹Р В±Р С‘Р СРЎвЂ Р С‘"];
            if (d["Р СџРЎР‚Р ВµР Т‘Р Р…Р В°Р В·Р Р…Р В°РЎвЂЎР ВµР Р…Р С‘Р Вµ"]) document.getElementById("book-Purpose").value = d["Р СџРЎР‚Р ВµР Т‘Р Р…Р В°Р В·Р Р…Р В°РЎвЂЎР ВµР Р…Р С‘Р Вµ"];

            if (d["Р вЂќР В°РЎвЂљР В° Р Р†Р С—Р С‘РЎРѓР Р†Р В°Р Р…Р Вµ"]) {
                try {
                    const date = new Date(d["Р вЂќР В°РЎвЂљР В° Р Р†Р С—Р С‘РЎРѓР Р†Р В°Р Р…Р Вµ"]);
                    if (!isNaN(date.getTime())) {
                        document.getElementById("book-EntryDate").value = date.toISOString().split('T')[0];
                    }
                } catch (e) { }
            }
        }
    } catch (e) {
        showToast("Р вЂњРЎР‚Р ВµРЎв‚¬Р С”Р В° Р С—РЎР‚Р С‘ Р В·Р В°РЎР‚Р ВµР В¶Р Т‘Р В°Р Р…Р Вµ Р Р…Р В° Р Т‘Р В°Р Р…Р Р…Р С‘РЎвЂљР Вµ", "error");
    }
}

window.submitBookData = async function () {
    const apt = document.getElementById("masterBookApt").value;
    if (!apt) {
        showToast("Р СљР С•Р В»РЎРЏ, Р С‘Р В·Р В±Р ВµРЎР‚Р ВµРЎвЂљР Вµ Р В°Р С—Р В°РЎР‚РЎвЂљР В°Р СР ВµР Р…РЎвЂљ!", "error");
        return;
    }

    const mapping = [
        { id: "book-Owner", key: "Р РЋР С•Р В±РЎРѓРЎвЂљР Р†Р ВµР Р…Р С‘Р С”" },
        { id: "book-Email", key: "Р ВР СР ВµР в„–Р В»" },
        { id: "book-Occupants", key: "Р С›Р В±Р С‘РЎвЂљР В°РЎвЂљР ВµР В»Р С‘" },
        { id: "book-EntryDate", key: "Р вЂќР В°РЎвЂљР В° Р Р†Р С—Р С‘РЎРѓР Р†Р В°Р Р…Р Вµ" },
        { id: "book-Pets", key: "Р вЂќР С•Р СР В°РЎв‚¬Р Р…Р С‘ Р В»РЎР‹Р В±Р С‘Р СРЎвЂ Р С‘" },
        { id: "book-Purpose", key: "Р СџРЎР‚Р ВµР Т‘Р Р…Р В°Р В·Р Р…Р В°РЎвЂЎР ВµР Р…Р С‘Р Вµ" }
    ];

    const updates = {};
    mapping.forEach(item => {
        const el = document.getElementById(item.id);
        if (el) updates[item.key] = el.value;
    });

    const btn = document.getElementById('book-save-btn');
    showSaving(btn, "Р вЂ”Р В°Р С—Р С‘РЎРѓР Р†Р В°Р Р…Р Вµ...");

    try {
        const result = await apiCall('updateBookData', {
            pin: getStoredPin(),
            apartment: apt,
            updates: JSON.stringify(updates)
        });

        if (result && result.success) {
            showToast("РІСљвЂ¦ Р С™Р Р…Р С‘Р С–Р В°РЎвЂљР В° Р Р…Р В° Р вЂўР РЋ Р Вµ РЎС“РЎРѓР С—Р ВµРЎв‚¬Р Р…Р С• Р С•Р В±Р Р…Р С•Р Р†Р ВµР Р…Р В° Р В·Р В° " + apt, "success");
        } else {
            showToast(result?.error || "Р вЂњРЎР‚Р ВµРЎв‚¬Р С”Р В° Р С—РЎР‚Р С‘ Р В·Р В°Р С—Р С‘РЎРѓ", "error");
        }
    } catch (e) {
        console.error(e);
        showToast("Р вЂ™РЎР‰Р В·Р Р…Р С‘Р С”Р Р…Р В° Р С–РЎР‚Р ВµРЎв‚¬Р С”Р В° Р С—РЎР‚Р С‘ Р В·Р В°Р С—Р С‘РЎРѓР В°", "error");
    } finally {
        hideSaving(btn, "Р вЂ”Р В°Р С—Р С‘РЎв‚¬Р С‘ Р СџРЎР‚Р С•Р СР ВµР Р…Р С‘РЎвЂљР Вµ");
    }
}

window.submitCharges = async function () {
    const period = document.getElementById("chargesPeriod").value.trim();
    const elev = document.getElementById("chargesElevator").value.trim();
    const sub = document.getElementById("chargesSubscription").value.trim();
    const light = document.getElementById("chargesLight").value.trim();
    const security = document.getElementById("chargesSecurity").value.trim();
    const cleaning = document.getElementById("chargesCleaning").value.trim();
    const podrajka = document.getElementById("chargesPodrajka").value.trim();
    const remont = document.getElementById("chargesRemont").value.trim();

    if (!period) {
        showToast("Р СџР ВµРЎР‚Р С‘Р С•Р Т‘РЎР‰РЎвЂљ Р Вµ Р В·Р В°Р Т‘РЎР‰Р В»Р В¶Р С‘РЎвЂљР ВµР В»Р ВµР Р…!", "error");
        return;
    }

    const btn = document.getElementById("chargesBtn");
    showSaving(btn, "Р вЂ”Р В°Р С—Р С‘РЎРѓР Р†Р В°Р Р…Р Вµ...");

    const result = await apiCall('addCharges', {
        pin: getStoredPin(),
        period: period,
        elevator: elev,
        subscription: sub,
        light: light,
        security: security,
        cleaning: cleaning,
        podrajka: podrajka,
        remont: remont
    });

    hideSaving(btn, "Р вЂ”Р В°Р С—Р С‘РЎв‚¬Р С‘ Р Р…Р В°РЎвЂЎР С‘РЎРѓР В»Р ВµР Р…Р С‘РЎРЏ");

    if (result && result.success) {
        showToast("РІСљвЂ¦ Р Р€РЎРѓР С—Р ВµРЎв‚¬Р Р…Р С• Р В·Р В°Р С—Р С‘РЎРѓР В°Р Р…Р С‘ Р Р…Р В°РЎвЂЎР С‘РЎРѓР В»Р ВµР Р…Р С‘РЎРЏ.", "success");
        document.getElementById("chargesElevator").value = "";
        document.getElementById("chargesSubscription").value = "";
        document.getElementById("chargesLight").value = "";
        document.getElementById("chargesSecurity").value = "";
        document.getElementById("chargesCleaning").value = "";
        document.getElementById("chargesPodrajka").value = "";
        document.getElementById("chargesRemont").value = "";
        refreshCurrentView();
    } else {
        showToast(result?.error || "Р вЂ™РЎР‰Р В·Р Р…Р С‘Р С”Р Р…Р В° Р С–РЎР‚Р ВµРЎв‚¬Р С”Р В°", "error");
    }
}

window.loadCurrentEmail = async function () {
    const apt = document.getElementById("adminEmailApt").value;
    if (!apt) {
        document.getElementById("currentEmailBox").style.display = "none";
        return;
    }

    const result = await apiCall('getEmail', { apartment: apt });
    if (result && typeof result.email !== 'undefined') {
        const span = document.getElementById("currentEmail");
        span.textContent = result.email ? result.email : "Р СњРЎРЏР СР В° Р В·Р В°Р С—Р С‘РЎРѓР В°Р Р…";
        document.getElementById("currentEmailBox").style.display = "block";
    }
}

window.submitEmail = async function () {
    const apt = document.getElementById("adminEmailApt").value;
    const email = document.getElementById("adminEmail").value.trim();

    if (!apt || !email) {
        showToast("Р ВР В·Р В±Р ВµРЎР‚Р ВµРЎвЂљР Вµ Р В°Р С—Р В°РЎР‚РЎвЂљР В°Р СР ВµР Р…РЎвЂљ Р С‘ Р С‘Р СР ВµР в„–Р В»!", "error");
        return;
    }

    const btn = document.getElementById("emailBtn");
    btn.textContent = "Р вЂ”Р В°Р С—Р С‘РЎРѓР Р†Р В°Р Р…Р Вµ...";

    const result = await apiCall('addEmail', {
        pin: getStoredPin(),
        apartment: apt,
        email: email
    });

    btn.textContent = "Р вЂ”Р В°Р С—Р В°Р В·Р С‘ Р С‘Р СР ВµР в„–Р В»";

    if (result && result.success) {
        showToast("Р ВР СР ВµР в„–Р В»РЎР‰РЎвЂљ Р Вµ Р С•Р В±Р Р…Р С•Р Р†Р ВµР Р….", "success");
        document.getElementById("adminEmail").value = "";
        loadCurrentEmail(); // Refresh current email display
    } else {
        showToast(result?.error || "Р вЂ™РЎР‰Р В·Р Р…Р С‘Р С”Р Р…Р В° Р С–РЎР‚Р ВµРЎв‚¬Р С”Р В°", "error");
    }
}

window.switchMasterTab = function (tab, btn) {
    document.querySelectorAll(".master-panel").forEach(p => p.style.display = "none");
    document.querySelectorAll(".master-tab").forEach(b => {
        b.classList.remove("active");
        // Reset special styles for ZUES toggle
        b.style.background = "";
        b.style.color = "";
        b.style.borderColor = "";
    });

    const pane = document.getElementById("master-tab-" + tab);
    if (pane) pane.style.display = "block";
    btn.classList.add("active");

    if (tab === 'zues') {
        // Р РЋР С‘Р Р…РЎРЉР С• Р С”Р С•Р С–Р В°РЎвЂљР С• Р Вµ Р В°Р С”РЎвЂљР С‘Р Р†Р Р…Р С•
        btn.style.background = "var(--primary)";
        btn.style.color = "white";
        btn.style.borderColor = "var(--primary)";
        switchZuesSubTab('z-book');
    }
}

window.submitMaster = async function (sheetName) {
    // Р вЂ™ Р В·Р В°Р Р†Р С‘РЎРѓР С‘Р СР С•РЎРѓРЎвЂљ Р С•РЎвЂљ Р С—Р С•Р Т‘Р В°Р Т‘Р ВµР Р…Р С•РЎвЂљР С• Р С‘Р СР Вµ (Р вЂєР С•Р С–Р С‘Р С”Р В°, Р С‘ РЎвЂљ.Р Р….) РЎРѓРЎР‰Р В±Р С‘РЎР‚Р В°Р СР Вµ РЎРѓРЎвЂљР С•Р в„–Р Р…Р С•РЎРѓРЎвЂљР С‘РЎвЂљР Вµ
    let val, fromP, toP, apt;

    if (sheetName === 'Р вЂєР С•Р С–Р С‘Р С”Р В°') {
        val = document.getElementById('masterLogikaVal').value;
        fromP = document.getElementById('masterLogikaFrom').value.trim();
        toP = "12.2050"; 
        apt = "";
    } else if (sheetName === 'Р Р€Р В§Р С’Р РЋР СћР ВР вЂў_Р С’Р РЋР С’Р СњР РЋР В¬Р С›Р В ') {
        apt = document.getElementById('masterUchApt').value;
        val = document.getElementById('masterUchVal').value;
        fromP = document.getElementById('masterUchFrom').value.trim();
        toP = "12.2050";
    } else if (sheetName === 'Р С›Р вЂР ВР СћР С’Р СћР вЂўР вЂєР В') {
        apt = document.getElementById('masterObApt').value;
        val = document.getElementById('masterObVal').value;
        fromP = document.getElementById('masterObFrom').value.trim();
        toP = "12.2050";
        if (val !== "" && parseInt(val) < 1) {
            showToast("РІС™В РїС‘РЏ Р СљР С‘Р Р…Р С‘Р СР В°Р В»Р Р…Р С‘РЎРЏРЎвЂљ Р В±РЎР‚Р С•Р в„– Р Вµ 1.", "error");
            return;
        }
    } else if (sheetName === 'Р В§Р ВР СџР С›Р вЂ™Р вЂў') {
        apt = document.getElementById('masterChApt').value;
        val = document.getElementById('masterChVal').value;
        fromP = document.getElementById('masterChFrom').value.trim();
        toP = "12.2050";
    } else if (sheetName === 'Р ВР вЂќР вЂўР С’Р вЂєР СњР В_Р В§Р С’Р РЋР СћР В') {
        apt = document.getElementById('masterIdApt').value;
        val = document.getElementById('masterIdVal').value;
        fromP = document.getElementById('masterIdFrom').value.trim();
        toP = "12.2050";
    }

    if (sheetName === 'PAYMENT_INFO') {
        const pText = document.getElementById('masterPaymentText').value.trim();

        const lElectric = document.getElementById('masterLinkElectric').value.trim();
        const lSub = document.getElementById('masterLinkSubscription').value.trim();

        if (!pText && !aEmail && !lElectric && !lSub) {
            showToast("Р СљР С•Р В»РЎРЏ, Р С—Р С•Р С—РЎР‰Р В»Р Р…Р ВµРЎвЂљР Вµ Р С—Р С•Р Р…Р Вµ Р ВµР Т‘Р Р…Р С• Р С—Р С•Р В»Р Вµ!", "error");
            return;
        }

        // Р СџРЎР‚Р В°РЎвЂ°Р В°Р СР Вµ Р С–Р С• Р С”Р В°РЎвЂљР С• Р С•Р В±Р ВµР С”РЎвЂљ, Р В±Р ВµР С”Р ВµР Р…Р Т‘РЎР‰РЎвЂљ РЎвЂ°Р Вµ Р С–Р С• РЎР‚Р В°Р В·Р С—Р С•Р В·Р Р…Р В°Р Вµ
        val = JSON.stringify({
            paymentInfo: pText,

            linkElectric: lElectric,
            linkSubscription: lSub
        });

        fromP = "01.2000";
        apt = "global";
    }

    if (sheetName !== 'PAYMENT_INFO' && (!val || !fromP || (sheetName !== 'Р вЂєР С•Р С–Р С‘Р С”Р В°' && !apt))) {
        showToast("Р СљР С•Р В»РЎРЏ, Р С—Р С•Р С—РЎР‰Р В»Р Р…Р ВµРЎвЂљР Вµ Р В·Р В°Р Т‘РЎР‰Р В»Р В¶Р С‘РЎвЂљР ВµР В»Р Р…Р С‘РЎвЂљР Вµ Р С—Р С•Р В»Р ВµРЎвЂљР В°!", "error");
        return;
    }

    // Р ВР В·РЎвЂЎР С‘РЎРѓРЎвЂљР Р†Р В°Р СР Вµ Р С‘ Р Р…Р В°Р СР С‘РЎР‚Р В°Р СР Вµ Р В°Р С”РЎвЂљР С‘Р Р†Р Р…Р С‘РЎРЏ Р В±РЎС“РЎвЂљР С•Р Р…, Р В·Р В° Р Т‘Р В° Р СРЎС“ РЎРѓР В»Р С•Р В¶Р С‘Р С Loading State
    const activeTabObj = document.querySelector(`.master-panel[style*="display: block"] button`);
    const originalText = activeTabObj ? activeTabObj.textContent : "Р вЂ”Р В°Р С—Р С‘РЎв‚¬Р С‘";
    if (activeTabObj) {
        activeTabObj.disabled = true;
        activeTabObj.textContent = "Р вЂ”Р В°Р С—Р С‘РЎРѓР Р†Р В°Р Р…Р Вµ...";
    }

    try {
        const result = await apiCall('updateMaster', {
            pin: getStoredPin(),
            sheet: sheetName,
            value: val,
            apartment: apt,
            fromPeriod: fromP,
            toPeriod: toP
        });

        if (result && result.success) {
            showToast(`Р Р€РЎРѓР С—Р ВµРЎв‚¬Р Р…Р С• Р С•Р В±Р Р…Р С•Р Р†Р ВµР Р… РЎР‚Р ВµР С–Р С‘РЎРѓРЎвЂљРЎР‰РЎР‚: ${sheetName}`, "success");
            if (sheetName === 'Р С›Р вЂР ВР СћР С’Р СћР вЂўР вЂєР В') {
                const valInput = document.getElementById('masterObVal');
                if (valInput) valInput.value = "";
            }
            if (sheetName === 'Р В§Р ВР СџР С›Р вЂ™Р вЂў') {
                const valInput = document.getElementById('masterChVal');
                if (valInput) valInput.value = "";
            }
            refreshCurrentView();
        } else {
            showToast(result?.error || "Р вЂ™РЎР‰Р В·Р Р…Р С‘Р С”Р Р…Р В° Р С–РЎР‚Р ВµРЎв‚¬Р С”Р В°", "error");
        }
    } catch (e) {
        showToast("Р РЋРЎР‰РЎР‚Р Р†РЎР‰РЎР‚Р Р…Р В° Р С–РЎР‚Р ВµРЎв‚¬Р С”Р В° Р С—РЎР‚Р С‘ Р В·Р В°Р С—Р С‘РЎРѓ", "error");
    } finally {
        if (activeTabObj) {
            activeTabObj.disabled = false;
            activeTabObj.textContent = originalText;
        }
    }
}

window.loadApartmentMasterSummary = async function () {
    const apt = document.getElementById("masterInfoApt").value;
    const container = document.getElementById("aptMasterSummary");
    if (!apt) {
        container.innerHTML = '<p style="color:#666; font-style:italic;">Р ВР В·Р В±Р ВµРЎР‚Р ВµРЎвЂљР Вµ Р В°Р С—Р В°РЎР‚РЎвЂљР В°Р СР ВµР Р…РЎвЂљ...</p>';
        return;
    }

    container.innerHTML = "РІРЉвЂє Р вЂ”Р В°РЎР‚Р ВµР В¶Р Т‘Р В°Р Р…Р Вµ Р Р…Р В° Р С‘Р Р…РЎвЂћР С•РЎР‚Р СР В°РЎвЂ Р С‘РЎРЏ...";

    try {
        const res = await apiCall('getApartmentMasterSummary', { apartment: apt, pin: getStoredPin() });
        if (res && res.success) {
            const d = res.data;
            container.innerHTML = `
                <div style="background:rgba(0,122,255,0.05); padding:15px; border-radius:8px; border-left:4px solid var(--primary);">
                    <h4 style="margin-bottom:10px;">СЂСџвЂњР‰ Р РЋРЎвЂљР В°РЎвЂљРЎС“РЎРѓ Р В·Р В° Р С’Р С—РЎвЂљ. ${apt}</h4>
                    <ul style="list-style:none; padding:0;">
                        <li><b>СЂСџвЂТђ Р С›Р В±Р С‘РЎвЂљР В°РЎвЂљР ВµР В»Р С‘:</b> ${d.occupants || 0} Р В±РЎР‚.</li>
                        <li><b>СЂСџвЂќвЂ Р В§Р С‘Р С—Р С•Р Р†Р Вµ:</b> ${d.chips || 0} Р В±РЎР‚.</li>
                        <li><b>СЂСџвЂќВ Р Р€РЎвЂЎ. Р В°РЎРѓР В°Р Р…РЎРѓРЎРЉР С•РЎР‚:</b> ${d.participation === 'Р вЂќР В°' ? 'РІСљвЂ¦ Р вЂќР В°' : 'РІСњРЉ Р СњР Вµ'}</li>
                        <li><b>СЂСџвЂњС’ Р ВР Т‘Р ВµР В°Р В»Р Р…Р С‘ РЎвЂЎР В°РЎРѓРЎвЂљР С‘:</b> ${d.idealParts || 0}%</li>
                    </ul>
                    <p style="font-size:11px; color:#666; margin-top:10px;">* Р СџР С•РЎРѓР С•РЎвЂЎР ВµР Р…Р С‘РЎвЂљР Вµ Р Т‘Р В°Р Р…Р Р…Р С‘ РЎРѓР В° Р С•РЎвЂљ РЎвЂљР ВµР С”РЎС“РЎвЂ°Р С‘РЎРЏ MASTER РЎР‚Р ВµР С–Р С‘РЎРѓРЎвЂљРЎР‰РЎР‚ Р С‘ РЎРѓР Вµ Р С‘Р В·Р С—Р С•Р В»Р В·Р Р†Р В°РЎвЂљ Р В·Р В° РЎРѓР В»Р ВµР Т‘Р Р†Р В°РЎвЂ°Р С‘РЎвЂљР Вµ Р Р…Р В°РЎвЂЎР С‘РЎРѓР В»Р ВµР Р…Р С‘РЎРЏ.</p>
                </div>
            `;

            // Show notice editor
            const editor = document.getElementById("aptNoticeEditor");
            const input = document.getElementById("masterAptNoticeVal");
            if (editor && input) {
                editor.style.display = "block";
                input.value = d.notice || "";
            }
        } else {
            container.innerHTML = '<p style="color:red;">Р вЂњРЎР‚Р ВµРЎв‚¬Р С”Р В° Р С—РЎР‚Р С‘ Р В·Р В°РЎР‚Р ВµР В¶Р Т‘Р В°Р Р…Р Вµ Р Р…Р В° Р Т‘Р В°Р Р…Р Р…Р С‘РЎвЂљР Вµ.</p>';
            const editor = document.getElementById("aptNoticeEditor");
            if (editor) editor.style.display = "none";
        }
    } catch (e) {
        container.innerHTML = '<p style="color:red;">Р РЋРЎР‰РЎР‚Р Р†РЎР‰РЎР‚Р Р…Р В° Р С–РЎР‚Р ВµРЎв‚¬Р С”Р В°.</p>';
        const editor = document.getElementById("aptNoticeEditor");
        if (editor) editor.style.display = "none";
    }
}

window.submitAptNotice = async function () {
    const apt = document.getElementById("masterInfoApt").value;
    const notice = document.getElementById("masterAptNoticeVal").value.trim();
    if (!apt) return;

    showLoading();
    const result = await apiCall('updateMaster', {
        pin: getStoredPin(),
        sheet: 'PAYMENT_INFO',
        apartment: apt,
        value: JSON.stringify({ ['notice_' + normalizeAptName(apt)]: notice })
    });
    hideLoading();

    if (result && result.success) {
        showToast("Р СџР ВµРЎР‚РЎРѓР С•Р Р…Р В°Р В»Р Р…Р С•РЎвЂљР С• РЎРѓРЎР‰Р С•Р В±РЎвЂ°Р ВµР Р…Р С‘Р Вµ Р Вµ Р В·Р В°Р С—Р В°Р В·Р ВµР Р…Р С•!", "success");
        refreshCurrentView();
    } else {
        showToast(result?.error || "Р вЂњРЎР‚Р ВµРЎв‚¬Р С”Р В° Р С—РЎР‚Р С‘ Р В·Р В°Р С—Р С‘РЎРѓ", "error");
    }
}

// ==============================================
// SUPER ADMIN LOGIC 
// ==============================================

window.openSuperAdmin = function () {
    console.log("Opening Super Admin Overlay...");
    document.getElementById("superAdminOverlay").style.display = "flex";
    if (sessionStorage.getItem("superAdminAuth")) {
        showSuperAdminDashboard();
    } else {
        document.getElementById("superAdminLoginCard").style.display = "block";
        document.getElementById("superAdminDashboard").style.display = "none";
        document.getElementById("superPinInput").value = "";
        document.getElementById("superPinInput").focus();
    }
}

window.closeSuperAdmin = function () {
    document.getElementById("superAdminOverlay").style.display = "none";
}

window.loginSuperAdmin = async function () {
    const pin = document.getElementById("superPinInput").value.trim();
    if (!pin) {
        document.getElementById("superPinError").textContent = "Р вЂ™РЎР‰Р Р†Р ВµР Т‘Р ВµРЎвЂљР Вµ Р С—Р В°РЎР‚Р С•Р В»Р В°!";
        return;
    }

    // Р СџР ВР Сњ Р С”Р С•Р Т‘РЎР‰РЎвЂљ РЎРѓР Вµ Р С—РЎР‚Р С•Р Р†Р ВµРЎР‚РЎРЏР Р†Р В° РЎвЂ Р ВµР Р…РЎвЂљРЎР‚Р В°Р В»Р Р…Р С• Р С—РЎР‚Р ВµР В· РЎРѓР С—Р ВµРЎвЂ Р С‘Р В°Р В»Р Р…Р С‘РЎРЏ endpoint verifySuperPin
    const result = await apiCall('verifySuperPin', { pin: pin });

    if (result && result.success) {
        sessionStorage.setItem("superAdminAuth", pin);
        showSuperAdminDashboard();
    } else {
        document.getElementById("superPinError").textContent = result.error || "Р вЂњРЎР‚Р ВµРЎв‚¬Р Р…Р В° Р С—Р В°РЎР‚Р С•Р В»Р В° Р В·Р В° Р РЋРЎС“Р С—Р ВµРЎР‚ Р С’Р Т‘Р СР С‘Р Р….";
    }
}

async function showSuperAdminDashboard() {
    console.log("Loading Super Admin Dashboard...");
    document.getElementById("superAdminLoginCard").style.display = "none";
    document.getElementById("superAdminDashboard").style.display = "block";

    try {
        const res = await apiCall('getSuperSettings');
        if (res && res.success) {
            const setVal = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.value = val || "";
            };
            setVal("superPaymentOptions", res.paymentOptions);
            setVal("priceBigCities", res.priceBigCities);
            setVal("priceOtherCities", res.priceOtherCities);
            setVal("priceLifetime", res.priceLifetime);
            setVal("superGlobalMessage", res.globalMessage);
            setVal("superShowRegForm", res.showRegForm || "true");
            setVal("superRegFormText", res.regFormText);
        }
    } catch (e) {
        console.error("Error loading super settings:", e);
    }

    loadSuperAdminEntrances();
    loadSuperExceptions();
}

window.saveSuperSettings = async function () {
    const btn = document.getElementById("saveSuperSettingsBtn");
    showSaving(btn, "Р вЂ”Р В°Р С—Р В°Р В·Р Р†Р В°Р Р…Р Вµ...");

    try {
        const getVal = (id) => {
            const el = document.getElementById(id);
            return el ? el.value.trim() : "";
        };

        const reqData = {
            paymentOptions: getVal("superPaymentOptions"),
            priceBigCities: getVal("priceBigCities"),
            priceOtherCities: getVal("priceOtherCities"),
            priceLifetime: getVal("priceLifetime"),
            showRegForm: document.getElementById("superShowRegForm").value === "true",
            regFormText: getVal("superRegFormText")
        };

        const result = await apiCall('updateSuperSettings', {
            pin: sessionStorage.getItem("superAdminAuth"),
            settings: JSON.stringify(reqData)
        });

        if (result && result.success) {
            showToast("РІСљвЂ¦ Р СњР В°РЎРѓРЎвЂљРЎР‚Р С•Р в„–Р С”Р С‘РЎвЂљР Вµ РЎРѓР В° Р В·Р В°Р С—Р В°Р В·Р ВµР Р…Р С‘ РЎС“РЎРѓР С—Р ВµРЎв‚¬Р Р…Р С•!", "success");
        } else {
            showToast(result.error || "Р вЂњРЎР‚Р ВµРЎв‚¬Р С”Р В° Р С—РЎР‚Р С‘ Р В·Р В°Р С—Р В°Р В·Р Р†Р В°Р Р…Р Вµ", "error");
        }
    } catch (e) {
        console.error(e);
        showToast("Р вЂ™РЎР‰Р В·Р Р…Р С‘Р С”Р Р…Р В° Р С–РЎР‚Р ВµРЎв‚¬Р С”Р В° Р С—РЎР‚Р С‘ Р В·Р В°Р С—Р В°Р В·Р Р†Р В°Р Р…Р Вµ", "error");
    } finally {
        hideSaving(btn, "Р вЂ”Р В°Р С—Р В°Р В·Р С‘ Р Р…Р В°РЎРѓРЎвЂљРЎР‚Р С•Р в„–Р С”Р С‘РЎвЂљР Вµ");
    }
}

window.submitMasterNotice = async function () {
    const notice = document.getElementById("masterEntranceNotice").value.trim();
    showLoading();

    const result = await apiCall('updateMaster', {
        pin: getStoredPin(),
        sheet: 'PAYMENT_INFO', // Reuse config logic
        value: JSON.stringify({ entranceNotice: notice })
    });

    hideLoading();

    if (result && result.success) {
        showToast("Р РЋРЎР‰Р С•Р В±РЎвЂ°Р ВµР Р…Р С‘Р ВµРЎвЂљР С• Р Вµ Р В·Р В°Р С—Р В°Р В·Р ВµР Р…Р С•!", "success");
        // Update local displays
        const banners = ["userEntranceNotice", "userEntranceNoticeHome"];
        const texts = ["userEntranceNoticeText", "userEntranceNoticeTextHome"];

        if (notice !== "") {
            const formatted = notice.replace(/\n/g, '<br>');
            banners.forEach(bId => {
                const b = document.getElementById(bId);
                if (b) b.style.display = "block";
            });
            texts.forEach(tId => {
                const t = document.getElementById(tId);
                if (t) t.innerHTML = formatted;
            });

            // Р ВР В·Р С—РЎР‚Р В°РЎвЂ°Р В°Р СР Вµ Р С‘Р СР ВµР в„–Р В» Р Т‘Р С• Р Р†РЎРѓР С‘РЎвЂЎР С”Р С‘ Р В¶Р С‘Р Р†РЎС“РЎвЂ°Р С‘ РЎРѓ РЎР‚Р ВµР С–Р С‘РЎРѓРЎвЂљРЎР‚Р С‘РЎР‚Р В°Р Р… Р С‘Р СР ВµР в„–Р В»
            if (notice !== "") {
                apiCall('sendNoticeEmail', { pin: getStoredPin(), notice: notice })
                    .then(emailResult => {
                        if (emailResult && emailResult.success) {
                            showToast(`СЂСџвЂњВ§ Р ВР СР ВµР в„–Р В»РЎР‰РЎвЂљ Р Вµ Р С‘Р В·Р С—РЎР‚Р В°РЎвЂљР ВµР Р… Р Т‘Р С• ${emailResult.sent || 0} Р В°Р С—Р В°РЎР‚РЎвЂљР В°Р СР ВµР Р…РЎвЂљР В°.`, "success");
                        }
                    })
                    .catch(() => { });
            }
        } else {
            banners.forEach(bId => {
                const b = document.getElementById(bId);
                if (b) b.style.display = "none";
            });
        }
    } else {
        showToast(result?.error || "Р вЂњРЎР‚Р ВµРЎв‚¬Р С”Р В° Р С—РЎР‚Р С‘ Р В·Р В°Р С—Р С‘РЎРѓ", "error");
    }
}

// Р ВР В·Р С—РЎР‚Р В°РЎвЂ°Р В°Р Р…Р Вµ Р Р…Р В° Р С‘Р Р…Р Т‘Р С‘Р Р†Р С‘Р Т‘РЎС“Р В°Р В»Р ВµР Р… Р С‘Р СР ВµР в„–Р В» Р Т‘Р С• Р С”Р С•Р Р…Р С”РЎР‚Р ВµРЎвЂљР ВµР Р… Р В°Р С—Р В°РЎР‚РЎвЂљР В°Р СР ВµР Р…РЎвЂљ
window.sendAptEmail = async function () {
    const apt = document.getElementById("emailAptTarget").value;
    const subject = document.getElementById("emailAptSubject").value.trim();
    const body = document.getElementById("emailAptBody").value.trim();

    if (!apt) { showToast("Р ВР В·Р В±Р ВµРЎР‚Р ВµРЎвЂљР Вµ Р В°Р С—Р В°РЎР‚РЎвЂљР В°Р СР ВµР Р…РЎвЂљ!", "error"); return; }
    if (!subject) { showToast("Р СџР С•Р С—РЎР‰Р В»Р Р…Р ВµРЎвЂљР Вµ РЎвЂљР ВµР СР В° Р Р…Р В° Р С‘Р СР ВµР в„–Р В»Р В°!", "error"); return; }
    if (!body) { showToast("Р СџР С•Р С—РЎР‰Р В»Р Р…Р ВµРЎвЂљР Вµ РЎвЂљР ВµР С”РЎРѓРЎвЂљ Р Р…Р В° Р С‘Р СР ВµР в„–Р В»Р В°!", "error"); return; }

    showLoading();
    const result = await apiCall('sendAptEmail', {
        pin: getStoredPin(),
        apartment: apt,
        subject: subject,
        body: body
    });
    hideLoading();

    if (result && result.success) {
        showToast("РІСљвЂ¦ Р ВР СР ВµР в„–Р В»РЎР‰РЎвЂљ Р Вµ Р С‘Р В·Р С—РЎР‚Р В°РЎвЂљР ВµР Р… РЎС“РЎРѓР С—Р ВµРЎв‚¬Р Р…Р С•!", "success");
        document.getElementById("emailAptSubject").value = "";
        document.getElementById("emailAptBody").value = "";
    } else {
        showToast(result?.error || "Р вЂњРЎР‚Р ВµРЎв‚¬Р С”Р В° Р С—РЎР‚Р С‘ Р С‘Р В·Р С—РЎР‚Р В°РЎвЂ°Р В°Р Р…Р Вµ", "error");
    }
}

window.saveGlobalMessage = async function () {
    const btn = document.getElementById("saveGlobalMessageBtn");
    const msg = document.getElementById("superGlobalMessage").value.trim();

    showSaving(btn, "Р ВР В·Р С—РЎР‚Р В°РЎвЂ°Р В°Р Р…Р Вµ...");

    try {
        const result = await apiCall('updateGlobalMessage', {
            pin: sessionStorage.getItem("superAdminAuth"),
            message: msg
        });

        if (result && result.success) {
            showToast("РІСљвЂ¦ Р РЋРЎР‰Р С•Р В±РЎвЂ°Р ВµР Р…Р С‘Р ВµРЎвЂљР С• Р Вµ Р С‘Р В·Р С—РЎР‚Р В°РЎвЂљР ВµР Р…Р С• Р Т‘Р С• Р Р†РЎРѓР С‘РЎвЂЎР С”Р С‘!", "success");
        } else {
            showToast(result.error || "Р вЂњРЎР‚Р ВµРЎв‚¬Р С”Р В° Р С—РЎР‚Р С‘ Р С‘Р В·Р С—РЎР‚Р В°РЎвЂ°Р В°Р Р…Р Вµ", "error");
        }
    } catch (e) {
        showToast("Р СџРЎР‚Р С•Р В±Р В»Р ВµР С Р С—РЎР‚Р С‘ Р С”Р С•Р СРЎС“Р Р…Р С‘Р С”Р В°РЎвЂ Р С‘РЎРЏ РЎРѓРЎР‰РЎРѓ РЎРѓРЎР‰РЎР‚Р Р†РЎР‰РЎР‚Р В°", "error");
    } finally {
        hideSaving(btn, "Р ВР В·Р С—РЎР‚Р В°РЎвЂљР С‘ РЎРѓРЎР‰Р С•Р В±РЎвЂ°Р ВµР Р…Р С‘Р Вµ");
    }
}

async function loadSuperAdminEntrances() {
    const tbody = document.getElementById("superAdminEntrancesList");
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Р вЂ”Р В°РЎР‚Р ВµР В¶Р Т‘Р В°Р Р…Р Вµ...</td></tr>';

    const result = await apiCall('getRegistryList');
    if (result && result.success && Array.isArray(result.registry)) {
        tbody.innerHTML = '';
        const select = document.getElementById("superExceptionRegistry");
        if (select) select.innerHTML = '<option value="">-- Р ВР В·Р В±Р ВµРЎР‚Р С‘ Р Р†РЎвЂ¦Р С•Р Т‘ --</option>';

        result.registry.forEach(ent => {
            if (select) select.appendChild(new Option(ent.name + " (" + ent.id + ")", ent.id));
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="padding: 8px;"><b>${ent.name}</b></td>
                <td style="padding: 8px; font-family: monospace;">${ent.id}</td>
                <td style="padding: 8px; color: ${ent.validUntil === '2000-01-01' ? 'red' : 'inherit'};">
                    ${ent.validUntil === '2000-01-01' ? 'Р вЂР В»Р С•Р С”Р С‘РЎР‚Р В°Р Р…' : (ent.validUntil || '---')}
                </td>
                <td style="padding: 8px;">
                    <span class="status-badge" style="background:${ent.validUntil === '2000-01-01' ? '#fa5252' : '#4ade80'}; color:white; padding: 2px 6px; border-radius: 4px; font-size: 11px;">
                        ${ent.validUntil === '2000-01-01' ? 'Р РЋР С—РЎР‚РЎРЏР Р…' : 'Р С’Р С”РЎвЂљР С‘Р Р†Р ВµР Р…'}
                    </span>
                </td>
                <td style="padding: 8px;">
                    <button class="admin-btn secondary small" onclick="manageSub('${ent.id}', 'unblock')" style="padding:4px 8px; font-size:11px; margin-right:4px;">+30 Р Т‘Р Р….</button>
                    <button class="admin-btn small" onclick="manageSub('${ent.id}', 'block')" style="background:#fa5252; color:white; padding:4px 8px; font-size:11px; margin-right:4px;">Р РЋР С—РЎР‚Р С‘</button>
                    <button class="admin-btn small" onclick="manageSub('${ent.id}', 'lifetime')" style="background:#4ade80; color:white; padding:4px 8px; font-size:11px;">Р вЂР ВµР В·РЎРѓРЎР‚Р С•РЎвЂЎР ВµР Р…</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Р вЂњРЎР‚Р ВµРЎв‚¬Р С”Р В° Р С—РЎР‚Р С‘ Р В·Р В°РЎР‚Р ВµР В¶Р Т‘Р В°Р Р…Р Вµ.</td></tr>';
    }
}

window.manageSub = async function (targetId, subAction) {
    if (!confirm(`Р РЋР С‘Р С–РЎС“РЎР‚Р Р…Р С‘ Р В»Р С‘ РЎРѓРЎвЂљР Вµ, РЎвЂЎР Вµ Р С‘РЎРѓР С”Р В°РЎвЂљР Вµ Р Т‘Р В° Р С—РЎР‚Р С•Р СР ВµР Р…Р С‘РЎвЂљР Вµ Р Т‘Р С•РЎРѓРЎвЂљРЎР‰Р С—Р В° Р Р…Р В° ID: ${targetId}?`)) return;

    const result = await apiCall('updateSubscription', {
        superPin: sessionStorage.getItem("superAdminAuth"),
        targetId: targetId,
        subAction: subAction
    });

    if (result && result.success) {
        showToast("Р СџРЎР‚Р В°Р Р†Р В°РЎвЂљР В° РЎРѓР В° Р С•Р В±Р Р…Р С•Р Р†Р ВµР Р…Р С‘ РЎС“РЎРѓР С—Р ВµРЎв‚¬Р Р…Р С•!", "success");
        loadSuperAdminEntrances();
    } else {
        showToast(result?.error || "Р вЂњРЎР‚Р ВµРЎв‚¬Р С”Р В° Р С—РЎР‚Р С‘ Р С•Р В±Р Р…Р С•Р Р†РЎРЏР Р†Р В°Р Р…Р Вµ", "error");
    }
}

window.submitNewClient = async function () {
    const city = document.getElementById("newCity").value.trim();
    const block = document.getElementById("newBlock").value.trim();
    const entrance = document.getElementById("newEntrance").value.trim();
    const email = document.getElementById("newAdminEmail").value.trim();
    const aptCount = document.getElementById("newAptCount").value.trim();

    if (!city || !block || !entrance || !email || !aptCount) {
        showToast("Р СљР С•Р В»РЎРЏ, Р С—Р С•Р С—РЎР‰Р В»Р Р…Р ВµРЎвЂљР Вµ Р Р†РЎРѓР С‘РЎвЂЎР С”Р С‘ Р С—Р С•Р В»Р ВµРЎвЂљР В°", "error");
        return;
    }

    const btn = document.getElementById("createClientBtn");
    btn.textContent = "Р вЂњР ВµР Р…Р ВµРЎР‚Р С‘РЎР‚Р В°Р Р…Р Вµ (Р ВР В·РЎвЂЎР В°Р С”Р В°Р в„–РЎвЂљР Вµ Р Т‘Р С• 15 РЎРѓР ВµР С”)...";

    const result = await apiCall('createClient', {
        superPin: sessionStorage.getItem("superAdminAuth"),
        city: city,
        block: block,
        entrance: entrance,
        adminEmail: email,
        apartmentsCount: aptCount
    });

    btn.textContent = "Р РЋРЎР‰Р В·Р Т‘Р В°Р в„– Р С™Р В»Р С‘Р ВµР Р…РЎвЂљ & Р вЂњР ВµР Р…Р ВµРЎР‚Р С‘РЎР‚Р В°Р в„– Р СћР В°Р В±Р В»Р С‘РЎвЂ Р С‘";

    if (result && result.success) {
        showToast("РІСљвЂ¦ Р С™Р В»Р С‘Р ВµР Р…РЎвЂљРЎР‰РЎвЂљ Р Вµ РЎРѓРЎР‰Р В·Р Т‘Р В°Р Т‘Р ВµР Р… РЎС“РЎРѓР С—Р ВµРЎв‚¬Р Р…Р С•! Р ВР СР ВµР в„–Р В»РЎР‰РЎвЂљ Р Вµ Р С‘Р В·Р С—РЎР‚Р В°РЎвЂљР ВµР Р….", "success");
        document.getElementById("newCity").value = "";
        document.getElementById("newBlock").value = "";
        document.getElementById("newEntrance").value = "";
        document.getElementById("newAdminEmail").value = "";
        document.getElementById("newAptCount").value = "";

        // Refresh dropdowns if necessary by refreshing page
        setTimeout(() => location.reload(), 3000);
    } else {
        showToast(result?.error || "Р вЂњРЎР‚Р ВµРЎв‚¬Р С”Р В° Р С—РЎР‚Р С‘ РЎРѓРЎР‰Р В·Р Т‘Р В°Р Р†Р В°Р Р…Р Вµ", "error");
    }
}

window.runSystemBackup = async function () {
    const btn = document.getElementById("runBackupBtn");
    const statusDiv = document.getElementById("backupStatus");
    const linkA = document.getElementById("backupFolderLink");

    btn.disabled = true;
    btn.textContent = "Р С’РЎР‚РЎвЂ¦Р С‘Р Р†Р С‘РЎР‚Р В°Р Р…Р Вµ (Р СљР С•Р В»РЎРЏ, Р С‘Р В·РЎвЂЎР В°Р С”Р В°Р в„–РЎвЂљР Вµ)...";
    statusDiv.style.display = "block";
    statusDiv.innerHTML = "РІРЏС– Р С›Р В±Р С‘Р С”Р В°Р В»РЎРЏР Р…Р Вµ Р Р…Р В° Р Р†РЎРѓР С‘РЎвЂЎР С”Р С‘ Р Р†РЎвЂ¦Р С•Р Т‘Р С•Р Р†Р Вµ Р С‘ Р С”Р С•Р С—Р С‘РЎР‚Р В°Р Р…Р Вµ Р Р…Р В° РЎвЂљР В°Р В±Р В»Р С‘РЎвЂ Р С‘...";
    statusDiv.style.color = "#666";

    const result = await apiCall('runBackup', {
        superPin: sessionStorage.getItem("superAdminAuth")
    });

    btn.disabled = false;
    btn.textContent = "СЂСџвЂњВ¦ Р РЋРЎР‰Р В·Р Т‘Р В°Р в„– Р В РЎР‰РЎвЂЎР ВµР Р… Р С’РЎР‚РЎвЂ¦Р С‘Р Р† Р РЋР ВµР С–Р В°";

    if (result && result.success) {
        statusDiv.innerHTML = "РІСљвЂ¦ " + result.message;
        statusDiv.style.color = "green";
        if (result.folderUrl) {
            linkA.href = result.folderUrl;
            // Р СџР С•Р С”Р В°Р В·Р Р†Р В°Р СР Вµ Р С‘ Р Р†РЎР‚Р ВµР СР ВµР Р…Р ВµР Р… Р В»Р С‘Р Р…Р С” Р Т‘Р С‘РЎР‚Р ВµР С”РЎвЂљР Р…Р С• Р Р† РЎРѓРЎвЂљР В°РЎвЂљРЎС“РЎРѓР В° Р В·Р В° РЎС“Р Т‘Р С•Р В±РЎРѓРЎвЂљР Р†Р С•
            statusDiv.innerHTML += `<br><a href="${result.folderUrl}" target="_blank" style="color:var(--primary); font-weight:bold;">Р вЂ™Р С‘Р В¶ Р Р…Р С•Р Р†Р С‘РЎРЏ Р В°РЎР‚РЎвЂ¦Р С‘Р Р† РЎвЂљРЎС“Р С” РІС›вЂќ</a>`;
        }
    } else {
        statusDiv.innerHTML = "РІСњРЉ Р вЂњРЎР‚Р ВµРЎв‚¬Р С”Р В°: " + (result?.error || "Р СџРЎР‚Р С•Р В±Р В»Р ВµР С Р С—РЎР‚Р С‘ Р В°РЎР‚РЎвЂ¦Р С‘Р Р†Р С‘РЎР‚Р В°Р Р…Р Вµ");
        statusDiv.style.color = "red";
    }
}

async function loadSuperExceptions() {
    const list = document.getElementById("superAdminExceptionsList");
    if (!list) return;
    list.innerHTML = '<tr><td colspan="5" style="text-align:center;">Р вЂ”Р В°РЎР‚Р ВµР В¶Р Т‘Р В°Р Р…Р Вµ...</td></tr>';

    const result = await apiCall('getSuperExceptions', {
        superPin: sessionStorage.getItem("superAdminAuth")
    });

    if (result && result.success && Array.isArray(result.exceptions)) {
        list.innerHTML = "";
        result.exceptions.forEach(ex => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="padding:6px;">${ex.targetId}</td>
                <td style="padding:6px;">${ex.apartment === 'ALL' ? 'Р вЂ™РЎРѓР С‘РЎвЂЎР С”Р С‘' : ex.apartment}</td>
                <td style="padding:6px;">${ex.price} EUR</td>
                <td style="padding:6px;">${ex.validUntil}</td>
                <td style="padding:6px;"><button onclick="deleteSuperException(${ex.rowIdx})" style="color:red; background:none; border:none; cursor:pointer; font-size:14px;">РІСљвЂў</button></td>
            `;
            list.appendChild(tr);
        });
    } else {
        list.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:10px; color:#999;">Р СњРЎРЏР СР В° Р В°Р С”РЎвЂљР С‘Р Р†Р Р…Р С‘ Р С‘Р В·Р С”Р В»РЎР‹РЎвЂЎР ВµР Р…Р С‘РЎРЏ.</td></tr>';
    }
}

window.addSuperException = async function () {
    const targetId = document.getElementById("superExceptionRegistry").value;
    const apartment = document.getElementById("superExceptionApt").value.trim();
    const price = document.getElementById("superExceptionPrice").value.trim();
    const validUntil = document.getElementById("superExceptionDate").value;

    if (!targetId || price === "") {
        showToast("Р ВР В·Р В±Р ВµРЎР‚Р ВµРЎвЂљР Вµ Р Р†РЎвЂ¦Р С•Р Т‘ Р С‘ РЎвЂ Р ВµР Р…Р С•Р Р†Р В° РЎРѓРЎвЂљР С•Р в„–Р Р…Р С•РЎРѓРЎвЂљ!", "error");
        return;
    }

    const res = await apiCall('addSuperException', {
        superPin: sessionStorage.getItem("superAdminAuth"),
        targetId: targetId,
        apartment: apartment || "ALL",
        price: price,
        validUntil: validUntil || "2099-12-31"
    });

    if (res && res.success) {
        showToast("Р РЋР С—Р ВµРЎвЂ Р С‘Р В°Р В»Р Р…Р В°РЎвЂљР В° РЎвЂ Р ВµР Р…Р В° Р Вµ Р Т‘Р С•Р В±Р В°Р Р†Р ВµР Р…Р В°!", "success");
        document.getElementById("superExceptionApt").value = "";
        document.getElementById("superExceptionPrice").value = "";
        loadSuperExceptions();
    } else {
        showToast(res?.error || "Р вЂ™РЎР‰Р В·Р Р…Р С‘Р С”Р Р…Р В° Р С–РЎР‚Р ВµРЎв‚¬Р С”Р В°", "error");
    }
}

window.deleteSuperException = async function (rowIdx) {
    if (!confirm("Р РЋР С‘Р С–РЎС“РЎР‚Р Р…Р С‘ Р В»Р С‘ РЎРѓРЎвЂљР Вµ, РЎвЂЎР Вµ Р С‘РЎРѓР С”Р В°РЎвЂљР Вµ Р Т‘Р В° Р С—РЎР‚Р ВµР СР В°РЎвЂ¦Р Р…Р ВµРЎвЂљР Вµ РЎвЂљР С•Р Р†Р В° Р С‘Р В·Р С”Р В»РЎР‹РЎвЂЎР ВµР Р…Р С‘Р Вµ?")) return;
    const res = await apiCall('deleteSuperException', {
        superPin: sessionStorage.getItem("superAdminAuth"),
        rowIdx: rowIdx
    });
    if (res && res.success) {
        showToast("Р ВР В·Р С”Р В»РЎР‹РЎвЂЎР ВµР Р…Р С‘Р ВµРЎвЂљР С• Р Вµ Р С—РЎР‚Р ВµР СР В°РЎвЂ¦Р Р…Р В°РЎвЂљР С•", "success");
        loadSuperExceptions();
    } else {
        showToast("Р вЂњРЎР‚Р ВµРЎв‚¬Р С”Р В° Р С—РЎР‚Р С‘ Р С‘Р В·РЎвЂљРЎР‚Р С‘Р Р†Р В°Р Р…Р Вµ", "error");
    }
}

// ==============================================
// РІС™вЂ“РїС‘РЏ Р вЂ”Р Р€Р вЂўР РЋ Р СљР вЂўР СњР ВР вЂќР вЂ“Р Р„Р В  Р вЂєР С›Р вЂњР ВР С™Р С’
// ==============================================

window.switchZuesSubTab = function (subId) {
    document.querySelectorAll(".zues-sub-panel").forEach(p => p.style.display = "none");
    const target = document.getElementById("zub-" + subId);
    if (target) target.style.display = "block";

    if (subId === 'z-meeting') {
        populateAttendanceTable();
    }
    if (subId === 'z-fullbook') {
        loadFullBook();
    }
}

// ==============================================
// СЂСџвЂњвЂ№ Р В¦Р Р‡Р вЂєР С’ Р вЂќР С›Р СљР С›Р вЂ™Р С’ Р С™Р СњР ВР вЂњР С’
// ==============================================

let _fullBookData = []; // Р С”Р ВµРЎв‚¬ Р В·Р В° РЎвЂљРЎР‰РЎР‚РЎРѓР ВµР Р…Р Вµ

window.loadFullBook = async function () {
    const tbody = document.getElementById("fullBookBody");
    const status = document.getElementById("fullBookStatus");
    tbody.innerHTML = '<tr><td colspan="7" style="padding:20px; text-align:center; color:#aaa;">РІРЏС– Р вЂ”Р В°РЎР‚Р ВµР В¶Р Т‘Р В°Р Р…Р Вµ...</td></tr>';
    if (status) status.textContent = "";

    const result = await apiCall('getFullBook', { pin: getStoredPin() });

    if (!result || !result.success) {
        tbody.innerHTML = '<tr><td colspan="7" style="padding:20px; text-align:center; color:red;">РІСњРЉ Р вЂњРЎР‚Р ВµРЎв‚¬Р С”Р В° Р С—РЎР‚Р С‘ Р В·Р В°РЎР‚Р ВµР В¶Р Т‘Р В°Р Р…Р Вµ</td></tr>';
        return;
    }

    _fullBookData = result.rows || [];
    renderBookTable(_fullBookData);

    if (status) {
        const filled = _fullBookData.filter(r => r["Р РЋР С•Р В±РЎРѓРЎвЂљР Р†Р ВµР Р…Р С‘Р С”"] && r["Р РЋР С•Р В±РЎРѓРЎвЂљР Р†Р ВµР Р…Р С‘Р С”"].trim() !== "").length;
        status.textContent = `Р С›Р В±РЎвЂ°Р С•: ${_fullBookData.length} Р В°Р С—Р В°РЎР‚РЎвЂљР В°Р СР ВµР Р…РЎвЂљР В° | Р СџР С•Р С—РЎР‰Р В»Р Р…Р ВµР Р…Р С‘: ${filled} | Р СњР ВµР С—Р С•Р С—РЎР‰Р В»Р Р…Р ВµР Р…Р С‘: ${_fullBookData.length - filled}`;
    }
}

function renderBookTable(rows) {
    const tbody = document.getElementById("fullBookBody");
    if (!rows || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="padding:20px; text-align:center; color:#aaa;">Р СњРЎРЏР СР В° Р Т‘Р В°Р Р…Р Р…Р С‘ Р Р† Р С”Р Р…Р С‘Р С–Р В°РЎвЂљР В°.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map((r, idx) => {
        const hasMissing = !r["Р РЋР С•Р В±РЎРѓРЎвЂљР Р†Р ВµР Р…Р С‘Р С”"] || r["Р РЋР С•Р В±РЎРѓРЎвЂљР Р†Р ВµР Р…Р С‘Р С”"].trim() === "";
        const bg = hasMissing ? "background:#fffbf0;" : (idx % 2 === 0 ? "" : "background:#fafbfd;");
        const missingMark = hasMissing ? ' <span style="color:#e67e22; font-size:11px;">РІС™В РїС‘РЏ</span>' : '';

        return `<tr style="${bg} cursor:pointer;" onclick="switchZuesSubTab('z-book'); document.getElementById('masterBookApt').value='${r["Р С’Р С—Р В°РЎР‚РЎвЂљР В°Р СР ВµР Р…РЎвЂљ"] || ""}'; loadBookData();">
            <td style="padding:9px 12px; font-weight:700; color:#3b6edc;">${r["Р С’Р С—Р В°РЎР‚РЎвЂљР В°Р СР ВµР Р…РЎвЂљ"] || "РІР‚вЂќ"}${missingMark}</td>
            <td style="padding:9px 12px;">${r["Р РЋР С•Р В±РЎРѓРЎвЂљР Р†Р ВµР Р…Р С‘Р С”"] || '<span style="color:#ccc;">Р Р…Р ВµР С—Р С•Р С—РЎР‰Р В»Р Р…Р ВµР Р…Р С•</span>'}</td>
            <td style="padding:9px 12px; font-size:12px;">${r["Р ВР СР ВµР в„–Р В»"] || 'РІР‚вЂќ'}</td>
            <td style="padding:9px 12px; font-size:12px;">${r["Р С›Р В±Р С‘РЎвЂљР В°РЎвЂљР ВµР В»Р С‘"] || 'РІР‚вЂќ'}</td>
            <td style="padding:9px 12px; font-size:12px;">${r["Р СџРЎР‚Р ВµР Т‘Р Р…Р В°Р В·Р Р…Р В°РЎвЂЎР ВµР Р…Р С‘Р Вµ"] || 'РІР‚вЂќ'}</td>
            <td style="padding:9px 12px; font-size:12px;">${r["Р вЂќР В°РЎвЂљР В° Р Р†Р С—Р С‘РЎРѓР Р†Р В°Р Р…Р Вµ"] || 'РІР‚вЂќ'}</td>
            <td style="padding:9px 12px; font-size:12px;">${r["Р вЂќР С•Р СР В°РЎв‚¬Р Р…Р С‘ Р В»РЎР‹Р В±Р С‘Р СРЎвЂ Р С‘"] || 'РІР‚вЂќ'}</td>
        </tr>`;
    }).join('');
}

window.filterBookTable = function () {
    const q = (document.getElementById("bookSearchInput").value || "").toLowerCase();
    if (!q) {
        renderBookTable(_fullBookData);
        return;
    }
    const filtered = _fullBookData.filter(r =>
        Object.values(r).some(v => String(v).toLowerCase().includes(q))
    );
    renderBookTable(filtered);
    const status = document.getElementById("fullBookStatus");
    if (status) status.textContent = `Р СњР В°Р СР ВµРЎР‚Р ВµР Р…Р С‘: ${filtered.length} Р С•РЎвЂљ ${_fullBookData.length} Р В°Р С—Р В°РЎР‚РЎвЂљР В°Р СР ВµР Р…РЎвЂљР В°`;
}

window.printFullBook = function () {
    if (!_fullBookData || _fullBookData.length === 0) {
        showToast("Р вЂ”Р В°РЎР‚Р ВµР Т‘Р ВµРЎвЂљР Вµ Р С”Р Р…Р С‘Р С–Р В°РЎвЂљР В° Р С—РЎР‚Р ВµР Т‘Р С‘ Р С—Р ВµРЎвЂЎР В°РЎвЂљ!", "error");
        return;
    }

    const rows = _fullBookData.map((r, idx) => `
        <tr style="${idx % 2 === 0 ? '' : 'background:#f9f9f9;'}">
            <td style="padding:6px 8px; border:1px solid #ddd; font-weight:600;">${r["Р С’Р С—Р В°РЎР‚РЎвЂљР В°Р СР ВµР Р…РЎвЂљ"] || "РІР‚вЂќ"}</td>
            <td style="padding:6px 8px; border:1px solid #ddd;">${r["Р РЋР С•Р В±РЎРѓРЎвЂљР Р†Р ВµР Р…Р С‘Р С”"] || "РІР‚вЂќ"}</td>
            <td style="padding:6px 8px; border:1px solid #ddd; font-size:11px;">${r["Р ВР СР ВµР в„–Р В»"] || "РІР‚вЂќ"}</td>
            <td style="padding:6px 8px; border:1px solid #ddd;">${r["Р С›Р В±Р С‘РЎвЂљР В°РЎвЂљР ВµР В»Р С‘"] || "РІР‚вЂќ"}</td>
            <td style="padding:6px 8px; border:1px solid #ddd;">${r["Р СџРЎР‚Р ВµР Т‘Р Р…Р В°Р В·Р Р…Р В°РЎвЂЎР ВµР Р…Р С‘Р Вµ"] || "РІР‚вЂќ"}</td>
            <td style="padding:6px 8px; border:1px solid #ddd;">${r["Р вЂќР В°РЎвЂљР В° Р Р†Р С—Р С‘РЎРѓР Р†Р В°Р Р…Р Вµ"] || "РІР‚вЂќ"}</td>
            <td style="padding:6px 8px; border:1px solid #ddd;">${r["Р вЂќР С•Р СР В°РЎв‚¬Р Р…Р С‘ Р В»РЎР‹Р В±Р С‘Р СРЎвЂ Р С‘"] || "РІР‚вЂќ"}</td>
        </tr>`).join('');

    const html = `<!DOCTYPE html><html><head>
        <meta charset="UTF-8">
        <title>Р вЂќР С•Р СР С•Р Р†Р В° Р С”Р Р…Р С‘Р С–Р В° РІР‚вЂќ Р В§Р В». 7 Р С•РЎвЂљ Р вЂ”Р Р€Р вЂўР РЋ</title>
        <style>
            body { font-family: Arial, sans-serif; font-size: 13px; padding: 30px; color: #222; }
            h2 { text-align: center; margin-bottom: 4px; }
            p.subtitle { text-align: center; font-size: 12px; color: #666; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #1a1a2e; color: white; padding: 8px; border: 1px solid #333; font-size: 12px; }
            @media print { button { display: none; } }
        </style>
    </head><body>
        <h2>СЂСџвЂњвЂ№ Р вЂќР С›Р СљР С›Р вЂ™Р С’ Р С™Р СњР ВР вЂњР С’ РІР‚вЂќ Р С™Р Р…Р С‘Р С–Р В° Р Р…Р В° Р ВµРЎвЂљР В°Р В¶Р Р…Р В°РЎвЂљР В° РЎРѓР С•Р В±РЎРѓРЎвЂљР Р†Р ВµР Р…Р С•РЎРѓРЎвЂљ (Р В§Р В». 7 Р С•РЎвЂљ Р вЂ”Р Р€Р вЂўР РЋ)</h2>
        <p class="subtitle">Р вЂќР В°РЎвЂљР В° Р Р…Р В° Р С‘Р В·Р Р†Р В»Р С‘РЎвЂЎР В°Р Р…Р Вµ: ${new Date().toLocaleDateString('bg-BG')} Р С–. | Р С›Р В±РЎвЂ°Р С• Р В°Р С—Р В°РЎР‚РЎвЂљР В°Р СР ВµР Р…РЎвЂљР С‘: ${_fullBookData.length}</p>
        <table>
            <thead><tr>
                <th>Р С’Р С—РЎвЂљ.</th><th>Р РЋР С•Р В±РЎРѓРЎвЂљР Р†Р ВµР Р…Р С‘Р С”/РЎвЂ Р С‘</th><th>Р ВР СР ВµР в„–Р В»</th>
                <th>Р С›Р В±Р С‘РЎвЂљР В°РЎвЂљР ВµР В»Р С‘</th><th>Р СџРЎР‚Р ВµР Т‘Р Р…Р В°Р В·Р Р….</th><th>Р вЂќР В°РЎвЂљР В° Р Р†Р С—Р С‘РЎРѓР Р†Р В°Р Р…Р Вµ</th><th>Р вЂќР С•Р СР В°РЎв‚¬Р Р…Р С‘</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
        <div style="margin-top:30px; font-size:11px; color:#888; text-align:right;">
            Р Р€Р С—РЎР‚Р В°Р Р†Р В»РЎРЏР Р†Р В°Р Р…Р С• Р С•РЎвЂљ РЎРѓР С‘РЎРѓРЎвЂљР ВµР СР В°РЎвЂљР В° Р В·Р В° РЎС“Р С—РЎР‚Р В°Р Р†Р В»Р ВµР Р…Р С‘Р Вµ Р Р…Р В° Р вЂўР РЋ
        </div>
        <br><button onclick="window.print()" style="padding:8px 20px; background:#1a1a2e; color:white; border:none; border-radius:6px; cursor:pointer; font-size:13px;">СЂСџвЂ“РЃРїС‘РЏ Р СџР ВµРЎвЂЎР В°РЎвЂљ</button>
    </body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
}


window.populateAttendanceTable = async function () {
    const list = document.getElementById("meeting-attendance-list");
    if (!list) return;
    list.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:15px; color:#666;">РІРЏС– Р вЂ”Р В°РЎР‚Р ВµР В¶Р Т‘Р В°Р Р…Р Вµ Р Р…Р В° Р Т‘Р В°Р Р…Р Р…Р С‘...</td></tr>';

    try {
        const result = await apiCall('getBuildingIdealParts', { pin: getStoredPin() });
        _currentIdealParts = (result && result.success) ? result.parts : {};

        list.innerHTML = "";
        apartmentList.forEach(apt => {
            const tr = document.createElement("tr");
            tr.style.borderBottom = "1px solid #eee";

            const normApt = normalizeAptName(apt);
            const percent = _currentIdealParts[normApt] !== undefined ? parseFloat(_currentIdealParts[normApt]) : 0;

            tr.innerHTML = `
                <td style="padding:6px;">${apt}</td>
                <td style="padding:6px; text-align:center;">
                    <input type="checkbox" class="quorum-check" data-apt="${apt}" data-percent="${percent}" onchange="calculateQuorum()">
                </td>
                <td style="padding:6px; text-align:right;">${percent.toFixed(2)}%</td>
            `;
            list.appendChild(tr);
        });
        calculateQuorum();
    } catch (e) {
        list.innerHTML = '<tr><td colspan="3" style="text-align:center; color:red; padding:10px;">Р вЂњРЎР‚Р ВµРЎв‚¬Р С”Р В° Р С—РЎР‚Р С‘ Р В·Р В°РЎР‚Р ВµР В¶Р Т‘Р В°Р Р…Р Вµ Р Р…Р В° Р С‘Р Т‘Р ВµР В°Р В»Р Р…Р С‘РЎвЂљР Вµ РЎвЂЎР В°РЎРѓРЎвЂљР С‘.</td></tr>';
    }
}

window.calculateQuorum = function () {
    let total = 0;
    document.querySelectorAll(".quorum-check:checked").forEach(chk => {
        total += parseFloat(chk.dataset.percent);
    });

    const p = document.getElementById("quorum-percent");
    const s = document.getElementById("quorum-status");
    if (p) p.innerText = total.toFixed(2) + "%";

    if (s) {
        if (total >= 67) {
            s.innerText = "РІСљвЂ¦ Р ВР СР В° Р С”Р Р†Р С•РЎР‚РЎС“Р С (Р Р…Р В°Р Т‘ 67%)";
            s.style.color = "green";
        } else if (total >= 51) {
            s.innerText = "СЂСџвЂќВ¶ Р С™Р Р†Р С•РЎР‚РЎС“Р С Р В·Р В° Р С•РЎвЂљР В»Р С•Р В¶Р ВµР Р…Р С• РЎРѓРЎР‰Р В±РЎР‚Р В°Р Р…Р С‘Р Вµ (Р Р…Р В°Р Т‘ 51%)";
            s.style.color = "orange";
        } else {
            s.innerText = "РІСњРЉ Р СњРЎРЏР СР В° Р С”Р Р†Р С•РЎР‚РЎС“Р С (Р Р…Р ВµР С•Р В±РЎвЂ¦Р С•Р Т‘Р С‘Р СР С‘ 67%)";
            s.style.color = "red";
        }
    }
}

window.printAttendanceList = function () {
    const agenda = document.getElementById("meetingAgenda").value || "Р вЂњР ВµР Р…Р ВµРЎР‚Р В°Р В»Р ВµР Р… Р Т‘Р Р…Р ВµР Р†Р ВµР Р… РЎР‚Р ВµР Т‘";
    const now = new Date();

    let html = `
        <div style="font-family: Arial, sans-serif; padding: 40px; line-height: 1.6;">
            <h2 style="text-align:center;">Р СџР В Р ВР РЋР Р„Р РЋР СћР вЂ™Р вЂўР Сњ Р РЋР СџР ВР РЋР Р„Р С™</h2>
            <p style="text-align:center;">Р Р…Р В° РЎРѓР С•Р В±РЎРѓРЎвЂљР Р†Р ВµР Р…Р С‘РЎвЂ Р С‘РЎвЂљР Вµ/Р С•Р В±Р С‘РЎвЂљР В°РЎвЂљР ВµР В»Р С‘РЎвЂљР Вµ Р Р† Р ВµРЎвЂљР В°Р В¶Р Р…Р В° РЎРѓР С•Р В±РЎРѓРЎвЂљР Р†Р ВµР Р…Р С•РЎРѓРЎвЂљ</p>
            <p><strong>Р вЂќР В°РЎвЂљР В°:</strong> ${now.toLocaleDateString('bg-BG')} Р С–.</p>
            <p><strong>Р вЂќР Р…Р ВµР Р†Р ВµР Р… РЎР‚Р ВµР Т‘:</strong> ${agenda}</p>
            <table border="1" style="width:100%; border-collapse: collapse; margin-top:20px;">
                <thead>
                    <tr style="background:#eee;">
                        <th style="padding:8px;">Р С’Р С—РЎвЂљ.</th>
                        <th style="padding:8px;">Р СџРЎР‚Р ВµР Т‘РЎРѓРЎвЂљР В°Р Р†Р ВµР Р…Р С‘ Р ВР Т‘.РЎвЂЎР В°РЎРѓРЎвЂљР С‘ %</th>
                        <th style="padding:8px;">Р ВР СР Вµ Р Р…Р В° Р С—РЎР‚Р С‘РЎРѓРЎР‰РЎРѓРЎвЂљР Р†Р В°РЎвЂ°Р С‘РЎРЏ / Р СџРЎР‰Р В»Р Р…Р С•Р СР С•РЎвЂ°Р Р…Р С‘Р С”</th>
                        <th style="padding:8px;">Р СџР С•Р Т‘Р С—Р С‘РЎРѓ</th>
                    </tr>
                </thead>
                <tbody>
    `;

    apartmentList.forEach(apt => {
        const normApt = normalizeAptName(apt);
        const percent = _currentIdealParts[normApt] !== undefined ? parseFloat(_currentIdealParts[normApt]) : 0;

        html += `
            <tr>
                <td style="padding:10px;">${apt}</td>
                <td style="padding:10px; text-align:center;">${percent.toFixed(2)}%</td>
                <td style="padding:10px;"></td>
                <td style="padding:10px; height: 30px;"></td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
            <div style="margin-top:30px;">
                <p>Р СџРЎР‚Р ВµР Т‘РЎРѓР ВµР Т‘Р В°РЎвЂљР ВµР В» Р Р…Р В° РЎРѓРЎР‰Р В±РЎР‚Р В°Р Р…Р С‘Р ВµРЎвЂљР С•: ____________________</p>
                <p>Р СџРЎР‚Р С•РЎвЂљР С•Р С”Р С•Р В»РЎвЂЎР С‘Р С”: ____________________</p>
            </div>
        </div>
    `;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.print();
}

window.generateMeetingMinutes = function () {
    const agenda = document.getElementById("meetingAgenda").value || "Р вЂњР ВµР Р…Р ВµРЎР‚Р В°Р В»Р ВµР Р… Р Т‘Р Р…Р ВµР Р†Р ВµР Р… РЎР‚Р ВµР Т‘";
    const quorum = document.getElementById("quorum-percent").innerText;
    const now = new Date();

    let html = `
        <div style="font-family: Times New Roman, serif; padding: 50px; line-height: 1.5; color: #000;">
            <h2 style="text-align:center; text-decoration: underline;">Р СџР В Р С›Р СћР С›Р С™Р С›Р вЂє РІвЂћвЂ“____</h2>
            <h3 style="text-align:center;">Р С•РЎвЂљ Р С›Р В±РЎвЂ°Р С• РЎРѓРЎР‰Р В±РЎР‚Р В°Р Р…Р С‘Р Вµ Р Р…Р В° РЎРѓР С•Р В±РЎРѓРЎвЂљР Р†Р ВµР Р…Р С‘РЎвЂ Р С‘РЎвЂљР Вµ</h3>
            <p>Р вЂќР Р…Р ВµРЎРѓ, ${now.toLocaleDateString('bg-BG')} Р С–., РЎРѓР Вµ Р С—РЎР‚Р С•Р Р†Р ВµР Т‘Р Вµ Р С•Р В±РЎвЂ°Р С• РЎРѓРЎР‰Р В±РЎР‚Р В°Р Р…Р С‘Р Вµ Р Р…Р В° Р ВµРЎвЂљР В°Р В¶Р Р…Р В°РЎвЂљР В° РЎРѓР С•Р В±РЎРѓРЎвЂљР Р†Р ВµР Р…Р С•РЎРѓРЎвЂљ.</p>
            <p><strong>Р СџРЎР‚Р ВµР Т‘РЎРѓРЎвЂљР В°Р Р†Р ВµР Р…Р С‘ Р С‘Р Т‘Р ВµР В°Р В»Р Р…Р С‘ РЎвЂЎР В°РЎРѓРЎвЂљР С‘:</strong> ${quorum}</p>
            <p><strong>Р вЂќР Р…Р ВµР Р†Р ВµР Р… РЎР‚Р ВµР Т‘:</strong></p>
            <p>${agenda}</p>
            <hr>
            <p><strong>Р ТђР С›Р вЂќ Р СњР С’ Р РЋР Р„Р вЂР В Р С’Р СњР ВР вЂўР СћР С› Р В Р СџР В Р ВР вЂўР СћР В Р В Р вЂўР РЃР вЂўР СњР ВР Р‡:</strong></p>
            <div style="min-height: 300px; border: 1px dashed #ccc; padding: 10px;">
                <em>[Р СћРЎС“Р С” Р С•Р С—Р С‘РЎв‚¬Р ВµРЎвЂљР Вµ Р Т‘Р С‘РЎРѓР С”РЎС“РЎРѓР С‘Р С‘РЎвЂљР Вµ Р С‘ Р С–Р В»Р В°РЎРѓРЎС“Р Р†Р В°Р Р…Р С‘РЎРЏРЎвЂљР В° Р В·Р В° Р Р†РЎРѓРЎРЏР С”Р В° РЎвЂљР С•РЎвЂЎР С”Р В°...]</em>
            </div>
            <p style="margin-top:40px;">Р СџРЎР‚Р С•РЎвЂљР С•Р С”Р С•Р В»РЎР‰РЎвЂљ Р Вµ РЎРѓРЎР‰РЎРѓРЎвЂљР В°Р Р†Р ВµР Р… РЎРѓРЎР‰Р С–Р В»Р В°РЎРѓР Р…Р С• Р В§Р В». 16 Р С•РЎвЂљ Р вЂ”Р Р€Р вЂўР РЋ.</p>
            <div style="display:flex; justify-content: space-between; margin-top:50px;">
                <div>Р СџРЎР‚Р ВµР Т‘РЎРѓР ВµР Т‘Р В°РЎвЂљР ВµР В»: ......................</div>
                <div>Р СџРЎР‚Р С•РЎвЂљР С•Р С”Р С•Р В»РЎвЂЎР С‘Р С”: ......................</div>
            </div>
        </div>
    `;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
}

window.printOwnerDeclaration = async function () {
    const apt = document.getElementById("docAptSelect").value;
    if (!apt) {
        showToast("Р СљР С•Р В»РЎРЏ, Р С‘Р В·Р В±Р ВµРЎР‚Р ВµРЎвЂљР Вµ Р В°Р С—Р В°РЎР‚РЎвЂљР В°Р СР ВµР Р…РЎвЂљ", "warning");
        return;
    }

    // Р вЂ”Р В°РЎР‚Р ВµР В¶Р Т‘Р В°Р СР Вµ Р Т‘Р В°Р Р…Р Р…Р С‘РЎвЂљР Вµ Р С•РЎвЂљ Р С™Р Р…Р С‘Р С–Р В°РЎвЂљР В° (Р В°Р С”Р С• РЎРѓР В° Р Р…Р В°Р В»Р С‘РЎвЂЎР Р…Р С‘)
    const result = await apiCall('getBookData', { apartment: apt });
    const data = result?.data || {};

    let html = `
        <div style="font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: auto; line-height: 1.6;">
            <h2 style="text-align:center;">Р вЂќР вЂўР С™Р вЂєР С’Р В Р С’Р В¦Р ВР Р‡</h2>
            <p style="text-align:center;">Р С—Р С• Р В§Р В». 47, Р В°Р В». 2 Р С•РЎвЂљ Р вЂ”Р В°Р С”Р С•Р Р…Р В° Р В·Р В° РЎС“Р С—РЎР‚Р В°Р Р†Р В»Р ВµР Р…Р С‘Р Вµ Р Р…Р В° Р ВµРЎвЂљР В°Р В¶Р Р…Р В°РЎвЂљР В° РЎРѓР С•Р В±РЎРѓРЎвЂљР Р†Р ВµР Р…Р С•РЎРѓРЎвЂљ</p>
            <br>
            <p>Р вЂќР С• Р Р€Р С—РЎР‚Р В°Р Р†Р С‘РЎвЂљР ВµР В»Р Р…Р С‘РЎРЏ РЎРѓРЎР‰Р Р†Р ВµРЎвЂљ / Р Р€Р С—РЎР‚Р В°Р Р†Р С‘РЎвЂљР ВµР В»РЎРЏ Р Р…Р В° Р вЂўР РЋ</p>
            <p><strong>Р С›Р СћР СњР С›Р РЋР СњР С›:</strong> Р вЂ™Р С—Р С‘РЎРѓР Р†Р В°Р Р…Р Вµ Р Р…Р В° Р Т‘Р В°Р Р…Р Р…Р С‘ Р Р† Р С™Р Р…Р С‘Р С–Р В°РЎвЂљР В° Р Р…Р В° Р ВµРЎвЂљР В°Р В¶Р Р…Р В°РЎвЂљР В° РЎРѓР С•Р В±РЎРѓРЎвЂљР Р†Р ВµР Р…Р С•РЎРѓРЎвЂљ</p>
            <br>
            <p>Р вЂќР С•Р В»РЎС“Р С—Р С•Р Т‘Р С—Р С‘РЎРѓР В°Р Р…Р С‘РЎРЏРЎвЂљ/Р В°РЎвЂљР В°: <strong>${data.Owner || '..........................................................'}</strong></p>
            <p>Р вЂ™ Р С”Р В°РЎвЂЎР ВµРЎРѓРЎвЂљР Р†Р С•РЎвЂљР С• Р СР С‘ Р Р…Р В° РЎРѓР С•Р В±РЎРѓРЎвЂљР Р†Р ВµР Р…Р С‘Р С”/Р С—Р С•Р В»Р В·Р Р†Р В°РЎвЂљР ВµР В» Р Р…Р В° РЎРѓР В°Р СР С•РЎРѓРЎвЂљР С•РЎРЏРЎвЂљР ВµР В»Р ВµР Р… Р С•Р В±Р ВµР С”РЎвЂљ <strong>РІвЂћвЂ“ ${apt}</strong></p>
            <br>
            <p><strong>Р вЂќР вЂўР С™Р вЂєР С’Р В Р ВР В Р С’Р Сљ Р РЋР вЂєР вЂўР вЂќР СњР ВР СћР вЂў Р С›Р вЂР РЋР СћР С›Р Р‡Р СћР вЂўР вЂєР РЋР СћР вЂ™Р С’:</strong></p>
            <p>1. Р В§Р В»Р ВµР Р…Р С•Р Р†Р Вµ Р Р…Р В° Р СР С•Р ВµРЎвЂљР С• Р Т‘Р С•Р СР В°Р С”Р С‘Р Р…РЎРѓРЎвЂљР Р†Р С• / Р С›Р В±Р С‘РЎвЂљР В°РЎвЂљР ВµР В»Р С‘: <br><em>${data.Occupants || '..........................................................'}</em></p>
            <p>2. Р СџРЎР‚Р С‘РЎвЂљР ВµР В¶Р В°Р Р†Р В°Р Р…Р С‘ Р Т‘Р С•Р СР В°РЎв‚¬Р Р…Р С‘ Р В»РЎР‹Р В±Р С‘Р СРЎвЂ Р С‘: <em>${data.Pets || 'Р СњРЎРЏР СР В°'}</em></p>
            <p>3. Р ВР В·Р С—Р С•Р В»Р В·Р Р†Р В°Р С Р С•Р В±Р ВµР С”РЎвЂљР В° Р В·Р В°: <em>${data.Purpose || 'Р вЂ“Р С‘Р В»Р С‘РЎвЂ°Р Р…Р С‘ Р Р…РЎС“Р В¶Р Т‘Р С‘'}</em></p>
            <br>
            <p>Р ВР В·Р Р†Р ВµРЎРѓРЎвЂљР Р…Р С• Р СР С‘ Р Вµ, РЎвЂЎР Вµ Р В·Р В° Р Т‘Р ВµР С”Р В»Р В°РЎР‚Р С‘РЎР‚Р В°Р Р…Р С‘ Р Р…Р ВµР Р†Р ВµРЎР‚Р Р…Р С‘ Р Т‘Р В°Р Р…Р Р…Р С‘ Р Р…Р С•РЎРѓРЎРЏ Р Р…Р В°Р С”Р В°Р В·Р В°РЎвЂљР ВµР В»Р Р…Р В° Р С•РЎвЂљР С–Р С•Р Р†Р С•РЎР‚Р Р…Р С•РЎРѓРЎвЂљ Р С—Р С• РЎвЂЎР В». 313 Р С•РЎвЂљ Р СњР В°Р С”Р В°Р В·Р В°РЎвЂљР ВµР В»Р Р…Р С‘РЎРЏ Р С”Р С•Р Т‘Р ВµР С”РЎРѓ.</p>
            <br><br>
            <div style="display:flex; justify-content: space-between;">
                <div>Р вЂќР В°РЎвЂљР В°: ......................</div>
                <div>Р вЂќР ВµР С”Р В»Р В°РЎР‚Р В°РЎвЂљР С•РЎР‚: ......................</div>
            </div>
        </div>
    `;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.print();
}

// ==============================================
// Р СљР вЂўР РЋР вЂўР В§Р вЂўР Сњ Р В¤Р ВР СњР С’Р СњР РЋР С›Р вЂ™ Р С›Р СћР В§Р вЂўР Сћ (Р В§Р В». 23 Р вЂ”Р Р€Р вЂўР РЋ)
// ==============================================

window.openMonthlyReport = function () {
    switchPage('monthly-report');
    const d = new Date();
    // Р СџР С• Р С—Р С•Р Т‘РЎР‚Р В°Р В·Р В±Р С‘РЎР‚Р В°Р Р…Р Вµ Р С—РЎР‚Р ВµР Т‘РЎвЂ¦Р С•Р Т‘Р Р…Р С‘РЎРЏ Р СР ВµРЎРѓР ВµРЎвЂ  (Р В·Р В°РЎвЂ°Р С•РЎвЂљР С• Р С•РЎвЂљРЎвЂЎР ВµРЎвЂљР С‘РЎвЂљР Вµ РЎРѓР Вµ Р С—РЎР‚Р В°Р Р†РЎРЏРЎвЂљ Р В·Р В° Р В·Р В°Р Р†РЎР‰РЎР‚РЎв‚¬Р ВµР Р… Р С—Р ВµРЎР‚Р С‘Р С•Р Т‘)
    const lastMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const periodStr = String(lastMonth.getMonth() + 1).padStart(2, '0') + "." + lastMonth.getFullYear();
    document.getElementById("reportPeriodInput").value = periodStr;
    document.getElementById("report-content").style.display = "none";
}

window.generateReport = async function () {
    const period = document.getElementById("reportPeriodInput").value.trim();
    if (!period) {
        showToast("Р СљР С•Р В»РЎРЏ, Р Р†РЎР‰Р Р†Р ВµР Т‘Р ВµРЎвЂљР Вµ Р С—Р ВµРЎР‚Р С‘Р С•Р Т‘!", "error");
        return;
    }

    const btn = document.querySelector("#view-monthly-report .btn-primary");
    showSaving(btn, "Р вЂ”Р В°РЎР‚Р ВµР В¶Р Т‘Р В°Р Р…Р Вµ...");

    try {
        const result = await apiCall('getMonthlyReport', { period: period });
        if (result && result.success && result.data) {
            const d = result.data;
            document.getElementById("report-title-period").textContent = `Р В·Р В° Р СР ВµРЎРѓР ВµРЎвЂ  ${period} Р С–.`;
            document.getElementById("report-gen-date").textContent = new Date().toLocaleDateString('bg-BG');

            const tableBody = document.getElementById("report-invoiced-rows");
            tableBody.innerHTML = "";

            const labels = {
                elevator: "Р В Р В°Р В·РЎвЂ¦Р С•Р Т‘Р С‘ Р В·Р В° Р В°РЎРѓР В°Р Р…РЎРѓРЎРЉР С•РЎР‚",
                subscription: "Р вЂќРЎР‚РЎС“Р С–Р С‘ Р В°Р В±Р С•Р Р…Р В°Р СР ВµР Р…РЎвЂљР С‘",
                light: "Р вЂўР В»Р ВµР С”РЎвЂљРЎР‚Р С‘РЎвЂЎР ВµРЎРѓР С”Р В° Р ВµР Р…Р ВµРЎР‚Р С–Р С‘РЎРЏ - Р С•Р В±РЎвЂ°Р С‘ РЎвЂЎР В°РЎРѓРЎвЂљР С‘",
                security: "Р С›РЎвЂ¦РЎР‚Р В°Р Р…Р В° / Р С™Р С•Р Р…РЎРѓР С‘Р ВµРЎР‚Р В¶",
                cleaning: "Р ТђР С‘Р С–Р С‘Р ВµР Р…Р В° Р С‘ Р С—Р С•РЎвЂЎР С‘РЎРѓРЎвЂљР Р†Р В°Р Р…Р Вµ",
                podrajka: "Р СџР С•Р Т‘Р Т‘РЎР‚РЎР‰Р В¶Р С”Р В° Р Р…Р В° Р С•Р В±РЎвЂ°Р С‘ РЎвЂЎР В°РЎРѓРЎвЂљР С‘",
                remont: 'Р В¤Р С•Р Р…Р Т‘ \u201eР В Р ВµР СР С•Р Р…РЎвЂљ Р С‘ Р С•Р В±Р Р…Р С•Р Р†РЎРЏР Р†Р В°Р Р…Р Вµ\u201c'
            };

            for (let key in labels) {
                const val = d.invoiced[key] || 0;
                if (val > 0) {
                    const tr = document.createElement("tr");
                    tr.innerHTML = `
                        <td style="padding: 10px 0; border-bottom: 1px dashed #eee;">${labels[key]}</td>
                        <td style="text-align: right; padding: 10px 0; border-bottom: 1px dashed #eee;">${val.toFixed(2)} EUR</td>
                    `;
                    tableBody.appendChild(tr);
                }
            }

            document.getElementById("report-total-invoiced").textContent = d.invoiced.total.toFixed(2) + " EUR";
            document.getElementById("report-total-collected").textContent = d.collected.toFixed(2) + " EUR";
            // --- Р”РћР‘РђР’РЇРќР• РќРђ РџРђР РђРњР•РўР Р Р—Рђ РџР•Р РРћР”Рђ (Р›РћР“РРљРђ, РЎРўРђРўРРЎРўРРљРђ) ---
            const statsBoxId = "monthly-report-stats-box";
            let statsSect = document.getElementById(statsBoxId);
            if (!statsSect) {
                statsSect = document.createElement("div");
                statsSect.id = statsBoxId;
                statsSect.style.marginTop = "25px";
                statsSect.style.padding = "20px";
                statsSect.style.background = "#fff8f0";
                statsSect.style.border = "1px solid #feebc8";
                statsSect.style.borderRadius = "10px";
                document.getElementById("report-content").appendChild(statsSect);
            }
            statsSect.innerHTML = `
                <h4 style="margin: 0 0 12px; font-size: 13px; color: #c05621; text-transform: uppercase;">📊 Параметри за периода:</h4>
                <table style="width: 100%; font-size: 14px; color: #4a5568; border-collapse: collapse;">
                    <tr><td style="padding: 5px 0; border-bottom: 1px dashed #eee;">Логика на разпределение:</td><td style="text-align: right; font-weight: 700; color: #2d3748;">${d.logic || "Равно"}</td></tr>
                    <tr><td style="padding: 5px 0; border-bottom: 1px dashed #eee;">Общо обитатели:</td><td style="text-align: right; font-weight: 700;">${d.stats?.totalOccupants || 0}</td></tr>
                    <tr><td style="padding: 5px 0; border-bottom: 1px dashed #eee;">Участници в асансьора (брой):</td><td style="text-align: right; font-weight: 700;">${d.stats?.totalParticipation || 0}</td></tr>
                    <tr><td style="padding: 5px 0; border-bottom: 1px dashed #eee;">Активни чипове за мес.:</td><td style="text-align: right; font-weight: 700;">${d.stats?.totalChips || 0}</td></tr>
                    <tr><td style="padding: 5px 0;">Общо идеални части:</td><td style="text-align: right; font-weight: 700;">${d.stats?.totalIdealParts || 0}%</td></tr>
                </table>
            `;

            document.getElementById("report-content").style.display = "block";
        } else {
            showToast(result?.error || "Р СњРЎРЏР СР В° Р Т‘Р В°Р Р…Р Р…Р С‘ Р В·Р В° РЎвЂљР С•Р В·Р С‘ Р С—Р ВµРЎР‚Р С‘Р С•Р Т‘.", "error");
            document.getElementById("report-content").style.display = "none";
        }
    } catch (e) {
        showToast("Грешка при генериране на отчета", "error");
    } finally {
        hideSaving(btn, "Покажи");
    }
}

window.printReport = function () {
    const printContents = document.getElementById('report-print-area').innerHTML;
    const originalContents = document.body.innerHTML;

    // Р вЂ™РЎР‚Р ВµР СР ВµР Р…Р Р…Р В° РЎРѓР СРЎРЏР Р…Р В° Р Р…Р В° РЎвЂљРЎРЏР В»Р С•РЎвЂљР С• Р В·Р В° Р С—РЎР‚Р С‘Р Р…РЎвЂљР С‘РЎР‚Р В°Р Р…Р Вµ (Р С‘Р В»Р С‘ Р С—Р С•-Р Т‘Р С•Р В±РЎР‚Р Вµ РЎвЂЎРЎР‚Р ВµР В· CSS media print)
    // Р СћРЎР‰Р в„– Р С”Р В°РЎвЂљР С• РЎвЂљР С•Р Р†Р В° Р Вµ SPA, print() РЎвЂ°Р Вµ РЎвЂ¦Р Р†Р В°Р Р…Р Вµ Р Р†РЎРѓР С‘РЎвЂЎР С”Р С•. Р ВР В·Р С—Р С•Р В»Р В·Р Р†Р В°Р СР Вµ Р С—РЎР‚Р С•РЎРѓРЎвЂљ Р СР ВµРЎвЂљР С•Р Т‘:
    const printWindow = window.open('', '', 'height=800,width=800');
    printWindow.document.write('<html><head><title>Р СљР ВµРЎРѓР ВµРЎвЂЎР ВµР Р… Р С•РЎвЂљРЎвЂЎР ВµРЎвЂљ - ' + document.getElementById("reportPeriodInput").value + '</title>');
    printWindow.document.write('<style>body{font-family: Arial, sans-serif; padding: 40px;} table{width:100%; border-collapse:collapse;} td{padding:10px 0;} tr.total{font-weight:bold; border-top:2px solid black;}</style>');
    printWindow.document.write('</head><body>');
    printWindow.document.write(printContents);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.print();
}

// Р СџР С•Р СР С•РЎвЂ°Р Р…Р В° РЎвЂћРЎС“Р Р…Р С”РЎвЂ Р С‘РЎРЏ Р В·Р В° РЎРѓР СРЎРЏР Р…Р В° Р Р…Р В° РЎРѓРЎвЂљРЎР‚Р В°Р Р…Р С‘РЎвЂ Р С‘РЎвЂљР Вµ
window.switchPage = function (pageId) {
    // Р вЂ™РЎРѓР С‘РЎвЂЎР С”Р С‘ Р С—Р В°Р Р…Р ВµР В»Р С‘
    const panels = ['view-selector', 'view-entrance-home', 'view-monthly-report'];
    panels.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.remove('active');
            el.classList.add('hidden');
        }
    });

    const activePanel = document.getElementById('view-' + pageId) || document.getElementById(pageId);
    if (activePanel) {
        activePanel.classList.remove('hidden');
        activePanel.classList.add('active');
    }
}



async function checkRemontEligibility() {
    try {
        const res = await apiCall('getBuildingIdealParts');
        const input = document.getElementById("chargesRemont");
        const warn = document.getElementById("remontWarning");
        
        let allHaveParts = false;
        let missing = [];
        if (res && res.success && res.parts && typeof apartmentList !== 'undefined' && apartmentList.length > 0) {
            missing = apartmentList.filter(apt => res.parts[apt] === undefined || res.parts[apt] === "" || parseFloat(res.parts[apt]) <= 0);
            allHaveParts = missing.length === 0;
        }

        if (input) {
            input.disabled = !allHaveParts;
            input.placeholder = allHaveParts ? "Р С›Р В±РЎвЂ°Р В° РЎРѓРЎС“Р СР В° Р В·Р В° Р Р†РЎвЂ¦Р С•Р Т‘Р В°" : "Р вЂќР ВµР В°Р С”РЎвЂљР С‘Р Р†Р С‘РЎР‚Р В°Р Р…Р С• (Р В»Р С‘Р С—РЎРѓР Р†Р В°РЎвЂљ Р ВР Т‘. РЎвЂЎР В°РЎРѓРЎвЂљР С‘ Р В·Р В° Р Р†РЎРѓР С‘РЎвЂЎР С”Р С‘)";
            if(!allHaveParts) input.value = "";
        }
        
        if (warn) {
            warn.style.display = allHaveParts ? "none" : "block";
            if (!allHaveParts) {
                if (missing.length > 0 && missing.length <= 15) {
                    warn.innerHTML = `РІС™В РїС‘РЏ Р вЂ”Р В° Р Р…Р В°РЎвЂЎР С‘РЎРѓР В»Р ВµР Р…Р С‘РЎРЏ Р С”РЎР‰Р С РЎвЂћР С•Р Р…Р Т‘ РЎР‚Р ВµР СР С•Р Р…РЎвЂљ Р С—РЎР‰РЎР‚Р Р†Р С• Р Р†РЎР‰Р Р†Р ВµР Т‘Р ВµРЎвЂљР Вµ Р ВР Т‘. РЎвЂЎР В°РЎРѓРЎвЂљ (%) Р В·Р В° <b>Р Р†РЎРѓР С‘РЎвЂЎР С”Р С‘</b> Р В°Р С—Р В°РЎР‚РЎвЂљР В°Р СР ВµР Р…РЎвЂљР С‘.<br><b>Р вЂєР С‘Р С—РЎРѓР Р†Р В°РЎвЂљ Р В·Р В°:</b> ${missing.join(", ")}`;
                } else if (missing.length > 15) {
                    warn.innerHTML = `РІС™В РїС‘РЏ Р вЂ”Р В° Р Р…Р В°РЎвЂЎР С‘РЎРѓР В»Р ВµР Р…Р С‘РЎРЏ Р С”РЎР‰Р С РЎвЂћР С•Р Р…Р Т‘ РЎР‚Р ВµР СР С•Р Р…РЎвЂљ Р С—РЎР‰РЎР‚Р Р†Р С• Р Р†РЎР‰Р Р†Р ВµР Т‘Р ВµРЎвЂљР Вµ Р ВР Т‘. РЎвЂЎР В°РЎРѓРЎвЂљ (%) Р В·Р В° <b>Р Р†РЎРѓР С‘РЎвЂЎР С”Р С‘</b> Р В°Р С—Р В°РЎР‚РЎвЂљР В°Р СР ВµР Р…РЎвЂљР С‘.<br><b>Р вЂєР С‘Р С—РЎРѓР Р†Р В°РЎвЂљ Р В·Р В° ${missing.length} Р В°Р С—Р В°РЎР‚РЎвЂљР В°Р СР ВµР Р…РЎвЂљР В°.</b>`;
                } else {
                    warn.innerHTML = `РІС™В РїС‘РЏ Р вЂ”Р В° Р Р…Р В°РЎвЂЎР С‘РЎРѓР В»Р ВµР Р…Р С‘РЎРЏ Р С”РЎР‰Р С РЎвЂћР С•Р Р…Р Т‘ РЎР‚Р ВµР СР С•Р Р…РЎвЂљ Р С—РЎР‰РЎР‚Р Р†Р С• Р Р†РЎР‰Р Р†Р ВµР Т‘Р ВµРЎвЂљР Вµ Р ВР Т‘. РЎвЂЎР В°РЎРѓРЎвЂљ (%) Р В·Р В° Р Р†РЎРѓР ВµР С”Р С‘ Р В°Р С—Р В°РЎР‚РЎвЂљР В°Р СР ВµР Р…РЎвЂљ Р Р† MASTER.`;
                }
            }
        }
    } catch(e) {}
}


