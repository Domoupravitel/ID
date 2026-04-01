// ==============================================
// CONFIGURATION & GLOBAL STATE
// ==============================================

// РўСѓРє С‚СЂСЏР±РІР° РґР° СЃРµ РїРѕСЃС‚Р°РІРё Р»РёРЅРєР° РѕС‚ Google Apps Script, СЃР»РµРґ РєР°С‚Рѕ СЃРµ СЂР°Р·РіСЉСЂРЅРµ (Deploy -> Web App)
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwDypJEQt07rcjZZ0FDDzV_o2QoTfDBaA3p2CGNi99cGT5FeSrJGY-wYGYuB5UO6BZ8jA/exec";

let currentRouteKey = "";
let apartmentList = [];
let _currentIdealParts = {};

// ==============================================
// INITIALIZATION
// ==============================================

document.addEventListener('DOMContentLoaded', async () => {
    // Р’СЉР·СЃС‚Р°РЅРѕРІСЏРІР°РЅРµ РЅР° Р·Р°РїР°Р·РµРЅРё РґР°РЅРЅРё, Р°РєРѕ РёРјР° С‚Р°РєРёРІР°
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

    // --- РђРІС‚РѕРјР°С‚РёС‡РЅРѕ РІР»РёР·Р°РЅРµ (Parsing ID and Apartment from Hash or Query) ---
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
            
            if (apartmentList && apartmentList.length > 0) {
                // Try to find matching apartment
                const found = apartmentList.find(a => normalizeAptName(a) === normalizeAptName(targetApt)) || 
                              apartmentList.find(a => a === targetApt);
                
                if (found) {
                    select.value = found;
                    loadApartmentData(found);
                }
            }
        }
    }

    // Р—Р°СЂРµР¶РґР°РјРµ РїСѓР±Р»РёС‡РЅРёС‚Рµ РЅР°СЃС‚СЂРѕР№РєРё (Р‘СѓС‚РѕРЅ Р·Р° СЂРµРіРёСЃС‚СЂР°С†РёСЏ Рё С‚.РЅ.)
    loadPublicSettings();

    // РђРєРѕ СЃРјРµ СЃРµ РІСЉСЂРЅР°Р»Рё РѕС‚ СЂСЉРєРѕРІРѕРґСЃС‚РІРѕС‚Рѕ, РѕС‚РІР°СЂСЏРјРµ Р°РґРјРёРЅ РїР°РЅРµР»Р° Р°РІС‚РѕРјР°С‚РёС‡РЅРѕ
    if (sessionStorage.getItem('shouldOpenAdmin') === 'true') {
        sessionStorage.removeItem('shouldOpenAdmin');
        // Р”Р°РІР°РјРµ РјР°Р»РєРѕ РІСЂРµРјРµ РЅР° enterEntrance РґР° РїСЂРёРєР»СЋС‡Рё Р°РєРѕ Рµ РІ С…РѕРґ
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
        const regMsg = document.getElementById("regButtonMessage");
        
        if (res && res.success && regLink) {
            if (res.showRegForm) {
                regLink.style.display = "block";
                if(regMsg) regMsg.style.display = "none";
            } else {
                regLink.style.display = "none";
                if(regMsg) {
                    regMsg.textContent = res.regFormMessage || "";
                    regMsg.style.display = res.regFormMessage ? "block" : "none";
                }
            }
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

    // РђРєРѕ SCRIPT_URL РЅРµ СЃСЉРґСЉСЂР¶Р° РёСЃС‚РёРЅСЃРєРё google script URL, РІСЂСЉС‰Р°РјРµ РіСЂРµС€РєР°
    if (!SCRIPT_URL.startsWith("https://script.google.com/macros")) {
        hideLoading();
        console.error("РњРѕР»СЏ, СЃР»РѕР¶РµС‚Рµ СЂРµР°Р»РЅРёСЏ SCRIPT_URL РІ app.js");
        showToast("Р“СЂРµС€РєР°: Р›РёРїСЃРІР° РІСЂСЉР·РєР° СЃ Google Script (API)", "error");
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
        showToast("РџСЂРѕР±Р»РµРј СЃ РІСЂСЉР·РєР°С‚Р° РєСЉРј СЃСЉСЂРІСЉСЂР°", "error");
        return { error: error.toString() };
    }
}

// ==============================================
// UI HELPERS
// ==============================================

window.activeLoadingRequests = 0;
window.showLoading = function () { return;
    window.activeLoadingRequests++;
    const loader = document.getElementById("loadingOverlay");
    if (loader) loader.classList.add("active");

    // Safety timeout: Р°РєРѕ РЅРµС‰Рѕ Р·Р°Р±РёРµ, СЃРєСЂРёРІР°РјРµ Р»РѕСѓРґСЉСЂР° СЃР»РµРґ 15 СЃРµРєСѓРЅРґРё
    clearTimeout(window.loaderSafetyTimeout);
    window.loaderSafetyTimeout = setTimeout(() => {
        window.activeLoadingRequests = 0;
        const loader = document.getElementById("loadingOverlay");
        if (loader) loader.classList.remove("active");
    }, 15000);
}
window.hideLoading = function () { return;
    window.activeLoadingRequests--;
    if (window.activeLoadingRequests > 0) return;
    window.activeLoadingRequests = 0;
    const loader = document.getElementById("loadingOverlay");
    if (loader) loader.classList.remove("active");
    clearTimeout(window.loaderSafetyTimeout);
}

window.normalizeAptName = function (name) {
    if (!name) return "";
    return name.toString().toUpperCase().replace(/Рђ/g, "A").replace(/\s+/g, "");
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

// --- SAVING STATE (Р—Р°РґР°С‡Р° 8: РІРёР·СѓР°Р»РЅР° РёРЅРґРёРєР°С†РёСЏ РїСЂРё Р·Р°РїРёСЃ) ---
window.showSaving = function (btn, text = "вЏі Р—Р°РїРёСЃРІР°РЅРµ...") {
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
    btn.innerHTML = originalText || btn._originalText || "Р—Р°РїР°Р·Рё";
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
        // Р—Р°С‚РІР°СЂСЏРјРµ С„РѕСЂРјР°С‚Р° Р·Р° СЂРµРіРёСЃС‚СЂР°С†РёСЏ, Р°РєРѕ Рµ РѕС‚РІРѕСЂРµРЅР°
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
        // Р—Р°С‚РІР°СЂСЏРјРµ С„РѕСЂРјР°С‚Р° Р·Р° РєРѕРЅС‚Р°РєС‚, Р°РєРѕ Рµ РѕС‚РІРѕСЂРµРЅР°
        document.getElementById('contact-section').classList.add('hidden');
        
        section.classList.remove('hidden');
        // РџР»Р°РІРЅРѕ СЃРєСЂРѕР»РІР°РЅРµ РґРѕ С„РѕСЂРјР°С‚Р°, Р·Р° РґР° СЏ РІРёРґРё РїРѕС‚СЂРµР±РёС‚РµР»СЏС‚ РІРµРґРЅР°РіР°
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
    if (select) select.innerHTML = '<option value="">РР·Р±РµСЂРё Р°РїР°СЂС‚Р°РјРµРЅС‚</option>';
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
        showToast("РњРѕР»СЏ, РІСЉРІРµРґРµС‚Рµ РІР°С€РµС‚Рѕ ID Р·Р° РґРѕСЃС‚СЉРї!", "error");
        return false;
    }

    // Р—Р°РїР°Р·РІР°РјРµ РІ Р±СЂР°СѓР·СЉСЂР° (localStorage), Р·Р° РЅРµ Р·Р°С‚СЂСѓРґРЅСЏРІР°РјРµ РґРѕРјРѕСѓРїСЂР°РІРёС‚РµР»СЏ СЃР»РµРґРІР°С‰РёСЏ РїСЉС‚
    localStorage.setItem("savedAccessId", accessId);

    // Р—Р°РґР°РІР°РјРµ РіРѕ РєР°С‚Рѕ С‚РµРєСѓС‰ РєР»СЋС‡ Р·Р° API Р·Р°СЏРІРєРёС‚Рµ
    currentRouteKey = accessId;

    // РЎРјРµРЅСЏРјРµ Р±СѓС‚РѕРЅР° Р·Р° РёРЅРґРёРєР°С†РёСЏ
    const btn = document.querySelector("#view-selector .btn-primary");
    const originalText = btn.textContent;
    btn.textContent = "Р—Р°СЂРµР¶РґР°РЅРµ...";
    btn.disabled = true;

    // Р—Р°СЂРµР¶РґР°РјРµ СЃРїРёСЃСЉРєР° СЃ Р°РїР°СЂС‚Р°РјРµРЅС‚Рё
    // РћР±РµРґРёРЅРµРЅР° Р·Р°СЏРІРєР° РїРѕ-РґРѕР»Сѓ

    // Р—Р°СЂРµР¶РґР°РјРµ Рё РєРѕРЅС„РёРіСѓСЂР°С†РёСЏС‚Р° Р·Р° РІС…РѕРґР° (РџР»Р°С‰Р°РЅРµ Рё С‚.РЅ.)
    const [result, configResult] = await Promise.all([
        apiCall('list', { list: 'apartments' }),
        apiCall('getEntranceInfo')
    ]);

    if (configResult && configResult.success && configResult.info) {
        const info = configResult.info;

        if (info.isHardBlocked) {
            hideLoading();
            showToast(`вљ пёЏ Р”РѕСЃС‚СЉРїСЉС‚ Рµ РЅР°РїСЉР»РЅРѕ СЃРїСЂСЏРЅ РїРѕСЂР°РґРё РЅР°Рґ 3 РјРµСЃРµС†Р° РЅРµРїР»Р°С‚РµРЅ Р°Р±РѕРЅР°РјРµРЅС‚. (РџСЂРё РїСЂРµРІРѕРґ Р·Р°РґСЉР»Р¶РёС‚РµР»РЅРѕ РїРѕСЃРѕС‡РµС‚Рµ ID: ${currentRouteKey})`, "error");
            btn.textContent = originalText;
            btn.disabled = false;
            return false; // PREVENT ENTRY
        }

        // Р’СЉР·СЃС‚Р°РЅРѕРІСЏРІР°РјРµ Р±СѓС‚РѕРЅР° РІРµРґРЅР°РіР° С‰РѕРј РїСЂРёРєР»СЋС‡Р°С‚ Р·Р°СЏРІРєРёС‚Рµ
        btn.textContent = originalText;
        btn.disabled = false;

        // Р—Р°РїР°Р·РІР°РјРµ С†РµРЅРёС‚Рµ РІ СЃРµСЃРёСЏС‚Р°
        if (info.pricePerApt !== undefined) {
            sessionStorage.setItem("pricePerApt_" + currentRouteKey, info.pricePerApt);
            sessionStorage.setItem("lifetimePrice_" + currentRouteKey, info.lifetimePrice);
            sessionStorage.setItem("currency_" + currentRouteKey, info.currency);
        }

        // РРЅСЃС‚СЂСѓРєС†РёРё Р·Р° РїР»Р°С‰Р°РЅРµ вЂ” Р·Р°РїР°Р·РІР°РјРµ Р·Р° РїРѕ-РєСЉСЃРЅРѕ, РЅРѕ РќР• РїРѕРєР°Р·РІР°РјРµ РІРµРґРЅР°РіР° РїСЂРё РІР»РёР·Р°РЅРµ
        if (info.paymentInfo) {
            document.getElementById('payment-instructions').textContent = info.paymentInfo;
            document.getElementById('masterPaymentText').value = info.paymentInfo;
            // РЎСЉС…СЂР°РЅСЏРІР°РјРµ РІ session Р·Р° РёР·РїРѕР»Р·РІР°РЅРµ РїСЂРё РёР·Р±РѕСЂ РЅР° Р°РїР°СЂС‚Р°РјРµРЅС‚
            sessionStorage.setItem('paymentInfo_' + currentRouteKey, info.paymentInfo);
        } else {
            sessionStorage.removeItem('paymentInfo_' + currentRouteKey);
        }
        // Р’РёРЅР°РіРё СЃРєСЂРёРІР°РјРµ РїСЂРё РІР»РёР·Р°РЅРµ вЂ” С‰Рµ СЃРµ РїРѕРєР°Р¶Рµ СЃР°РјРѕ РїСЂРё РёР·Р±СЂР°РЅ Р°РїР°СЂС‚Р°РјРµРЅС‚ СЃ РґСЉР»Рі
        document.getElementById('payment-details-box').style.display = 'none';

        // РРјРµР№Р» Р·Р° РІСЂСЉР·РєР°
        const adminMailBtn = document.getElementById('admin-mailto-link');
        if (adminMailBtn) {
            if (info.adminEmail) {
                adminMailBtn.href = `mailto:${info.adminEmail}`;
                adminMailBtn.style.display = 'inline-block';
            } else {
                adminMailBtn.style.display = 'none';
            }
        }

        // Р’СЉРЅС€РЅРё Р»РёРЅРєРѕРІРµ
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

        // --- РР—Р§РРЎР›РЇР’РђРќР• РќРђ РђР‘РћРќРђРњР•РќРў РљРЄРњ РџР›РђРўР¤РћР РњРђРўРђ ---
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
            if (subMonthlyEl) subMonthlyEl.innerHTML = '<span style="color:green;">рџЋЃ Р‘Р•Р—РџР›РђРўРќРћ</span>';
        }

        // --- Р“Р›РћР‘РђР›РќРћ РЎРЄРћР‘Р©Р•РќРР• РћРў РЎРЈРџР•Р  РђР”РњРРќ ---
        const newsBanner = document.getElementById("adminGlobalNews");
        const newsText = document.getElementById("adminGlobalNewsText");
        if (info.globalMessage && info.globalMessage.trim() !== "") {
            newsText.innerHTML = info.globalMessage.replace(/\n/g, '<br>');
            newsBanner.style.display = "block";
        } else {
            newsBanner.style.display = "none";
        }

        // --- РЎРЄРћР‘Р©Р•РќРР• РћРў Р”РћРњРћРЈРџР РђР’РРўР•Р›РЇ (РљРЄРњ Р–РР’РЈР©РРўР•) ---
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
        // РЎРєСЂРёРІР°РјРµ РІСЃРёС‡РєРѕ, Р°РєРѕ РЅСЏРјР° РёРЅС„Рѕ
        document.getElementById('payment-details-box').style.display = 'none';
        document.getElementById('admin-mailto-link').style.display = 'none';
        document.getElementById('btn-electric-link').style.display = 'none';
        document.getElementById('btn-subscription-link').style.display = 'none';
    }

    // РћР‘Р РђР‘РћРўРљРђ РќРђ РЎРџРРЎРЄРљРђ РЎ РђРџРђР РўРђРњР•РќРўР Р РЎРњРЇРќРђ РќРђ РР—Р“Р›Р•Р”Рђ
    if (result && !result.error && Array.isArray(result)) {
        apartmentList = result;

        // РЎРѕСЂС‚РёСЂР°РЅРµ РїРѕ РЅРѕРјРµСЂ РЅР° Р°РїР°СЂС‚Р°РјРµРЅС‚
        apartmentList.sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, '')) || 0;
            const numB = parseInt(b.replace(/\D/g, '')) || 0;
            return numA - numB;
        });

        // РћР±РЅРѕРІСЏРІР°РјРµ Р·Р°РіР»Р°РІРёРµС‚Рѕ РЅР° РІС…РѕРґР°
        if (configResult && configResult.info && configResult.info.entranceName) {
            document.getElementById('entrance-title').textContent = configResult.info.entranceName;
        } else {
            document.getElementById('entrance-title').textContent = `Р•С‚Р°Р¶РЅР° СЃРѕР±СЃС‚РІРµРЅРѕСЃС‚ - ID ${currentRouteKey}`;
        }

        // РџСЂРµРІРєР»СЋС‡РІР°РјРµ РµРєСЂР°РЅР°
        document.getElementById('view-selector').classList.remove('active');
        document.getElementById('view-selector').classList.add('hidden');
        document.getElementById('view-entrance-home').classList.remove('hidden');
        document.getElementById('view-entrance-home').classList.add('active');

        // РџСЉР»РЅРёРј РїР°РґР°С‰РѕС‚Рѕ РјРµРЅСЋ
        const select = document.getElementById("apartmentSelect");
        select.innerHTML = '<option value="">РР·Р±РµСЂРё Р°РїР°СЂС‚Р°РјРµРЅС‚</option>';
        apartmentList.forEach(a => {
            const opt = document.createElement("option");
            opt.value = opt.textContent = a;
            select.appendChild(opt);
        });

        // РџР Р•Р—РђРљР›Р®Р§Р’РђРњР• HASH Р—Рђ РЎРРќРҐР РћРќРР—РђР¦РРЇ (Р±РµР· Р·Р°С†РёРєР»СЏРЅРµ)
        const targetHash = "#" + encodeURIComponent(currentRouteKey);
        if (window.location.hash !== targetHash && !window.location.hash.includes("/")) {
            window.location.hash = targetHash;
        }

        // Р—Р°СЂРµР¶РґР°РјРµ РґР°С€Р±РѕСЂРґР°
        loadDashboardData();
        return true;
    } else {
        const errStr = result && result.error ? result.error.toString() : "";
        if (errStr.includes("fetch") || errStr.includes("NetworkError")) {
            showToast("Р“СЂРµС€РєР° РїСЂРё РІСЂСЉР·РєР° (Failed to fetch). РџСЂРѕРІРµСЂРµС‚Рµ РёРЅС‚РµСЂРЅРµС‚ РІСЂСЉР·РєР°С‚Р° СЃРё.", "error");
        } else {
            showToast(`Р“СЂРµС€РµРЅ РІС…РѕРґ: ${currentRouteKey} РЅРµ Рµ РЅР°РјРµСЂРµРЅ РІ Р±Р°Р·Р°С‚Р°.`, "error");
        }
        return false;
    }
}

// Check URL params on load
// (Moved logic to main DOMContentLoaded at the top)

async function loadDashboardFromFirebase(routeKey) {
  const { collection, getDocs, query, where } = window.fb;
  const db = window.db;

  const q = query(
    collection(db, "apartments"),
    where("buildingId", "==", routeKey)
  );

  const snapshot = await getDocs(q);

  let totalDebt = 0;
  let totalBalance = 0;
  let totalTargetFund = 0;

  const apartments = [];

  snapshot.forEach(doc => {
    const data = doc.data();
    const balance = Number(data.balance || 0);
    const targetFund = Number(data.targetFund || 0);

    apartments.push({
      id: data.apartmentId,
      balance,
      targetFund
    });

    if (balance > 0) {
      totalDebt += balance;
    } else if (balance < 0) {
      const overpayment = Math.abs(balance);
      const repairContribution = Math.min(overpayment, targetFund);
      totalBalance += repairContribution;
    }
    
    totalTargetFund += targetFund;
  });

  return {
    success: true,
    dashboard: {
      totalDebts: totalDebt.toFixed(2),
      totalBalance: totalBalance.toFixed(2),
      totalTargetFund: totalTargetFund.toFixed(2),
      trendData: []
    }
  };
}

async function loadDashboardData() {
    try {
        const result = await loadDashboardFromFirebase(currentRouteKey);
        if (result && result.success && result.dashboard) {
            const d = result.dashboard;
            const cur = sessionStorage.getItem("currency_" + currentRouteKey) || "EUR";

            document.getElementById('dash-debts').textContent = `${d.totalDebts} ${cur}`;
            
            // РџРѕРєР°Р·РІР°РјРµ СЃСЉР±СЂР°РЅРѕС‚Рѕ СЃРїСЂСЏРјРѕ РѕР±С‰РѕС‚Рѕ РЅР°С‡РёСЃР»РµРЅРѕ
            const collected = parseFloat(d.totalBalance) || 0;
            const target = parseFloat(d.totalTargetFund) || 0;
            document.getElementById('dash-balance').textContent = `${collected.toFixed(2)} ${cur}`;

            // Trends status text update
            const debtsTrendEl = document.getElementById('dash-debts-trend');
            const balanceTrendEl = document.getElementById('dash-balance-trend');

            if (debtsTrendEl) {
                debtsTrendEl.textContent = parseFloat(d.totalDebts) > 0 ? "РР·РёСЃРєРІР° СЃРµ Р·Р°РїР»Р°С‰Р°РЅРµ" : "Р’СЃРёС‡РєРѕ Рµ РёР·РїР»Р°С‚РµРЅРѕ";
            }
            if (balanceTrendEl) {
                balanceTrendEl.textContent = parseFloat(d.totalBalance) > 0 ? "РќР°Р»РёС‡РµРЅ С„РѕРЅРґ" : "РћС‡Р°РєРІР° СЃСЉР±РёСЂР°РЅРµ";
            }

        } else {
            const errMsg = result?.error || "РќРµСѓСЃРїРµС€РЅРѕ Р·Р°СЂРµР¶РґР°РЅРµ РЅР° РѕР±РѕР±С‰РµРЅРёС‚Рµ РґР°РЅРЅРё.";
            console.error("Dashboard data load failed:", errMsg);
            // Don't show toast for every fail to not annoy, but update the placeholders if they were stuck
            document.getElementById('dash-debts-trend').textContent = "Р“СЂРµС€РєР° РїСЂРё Р·Р°СЂРµР¶РґР°РЅРµ";
            document.getElementById('dash-balance-trend').textContent = "Р“СЂРµС€РєР° РїСЂРё Р·Р°СЂРµР¶РґР°РЅРµ";
        }
    } catch (err) {
        console.error("Critical error in loadDashboardData:", err);
    }
}


// ==============================================
// APARTMENT DATA
// ==============================================

async function loadApartmentFromFirebase(routeKey, apartmentId) {
  const { collection, getDocs, query, where } = window.fb;
  const db = window.db;

  const qApt = query(
    collection(db, "apartments"),
    where("buildingId", "==", routeKey),
    where("apartmentId", "==", apartmentId)
  );
  const snapApt = await getDocs(qApt);

  let result = { saldo: 0, periods: [], aptNotice: "" };

  snapApt.forEach(doc => {
    const data = doc.data();
    result.saldo = Number(data.balance || 0);
    result.targetFund = Number(data.targetFund || 0);
  });

  const qPeriods = query(
    collection(db, "monthlyReports"),
    where("buildingId", "==", routeKey),
    where("apartmentId", "==", apartmentId)
  );
  const snapPeriods = await getDocs(qPeriods);

  const rawPeriods = [];
  snapPeriods.forEach(doc => {
    rawPeriods.push(doc.data());
  });

  rawPeriods.sort((a, b) => {
    const [mA, yA] = (a.period || "").split(".");
    const [mB, yB] = (b.period || "").split(".");
    const dA = new Date(yA, mA - 1);
    const dB = new Date(yB, mB - 1);
    return dA - dB;
  });

  result.periods = rawPeriods.map(p => ({
    period: p.period,
    elevator: Number(p.elevator || 0),
    subscription: Number(p.subscription || 0),
    light: Number(p.light || 0),
    security: Number(p.security || 0),
    cleaning: Number(p.cleaning || 0),
    podrajka: Number(p.podrajka || 0),
    remont: Number(p.remont || 0),
    due: Number(p.due || 0),
    paid: Number(p.paid || 0)
  }));

  return result;
}

async function loadApartmentData(apartment) {
    resetApartmentData();

    // РЎРєСЂРёРІР°РјРµ РёРЅСЃС‚СЂСѓРєС†РёРёС‚Рµ Р·Р° РїР»Р°С‰Р°РЅРµ РґРѕРєР°С‚Рѕ РЅРµ Р·РЅР°РµРј РґР°Р»Рё РёРјР° РґСЉР»Рі
    document.getElementById('payment-details-box').style.display = 'none';

    // Update URL Hash for persistence
    if (currentRouteKey) {
        window.location.hash = `${encodeURIComponent(currentRouteKey)}/${encodeURIComponent(apartment)}`;
    }

    // РџРѕРєР°Р·РІР°РјРµ РєРѕРґР° Р·Р° РїР»Р°С‰Р°РЅРµ РІРµРґРЅР°РіР°
    document.getElementById("payment-reference-value").textContent = `${currentRouteKey}-${apartment}`;
    document.getElementById("payment-reference-box").style.display = "block";

    const result = await loadApartmentFromFirebase(currentRouteKey, apartment);

    if (result && result.error && result.showMessage) {
        document.getElementById("saldo").textContent = "РЎРєСЂРёС‚";
        showToast("РРЅС„РѕСЂРјР°С†РёСЏС‚Р° Р·Р° СЃР°Р»РґРѕС‚Рѕ Р’Рё, РЅРµ СЃРµ РїРѕРєР°Р·РІР° РїРѕСЂР°РґРё РЅРµРїР»Р°С‚РµРЅ Р°Р±РѕРЅР°РјРµРЅС‚", "error");
        return;
    }

    if (result && !result.error) {
        const saldoVal = Number(result.saldo || 0);
        const targetFund = Number(result.targetFund || 0);
        const sEl = document.getElementById("saldo");
        const sCard = document.getElementById("saldoCard");

        sEl.textContent = saldoVal.toFixed(2) + " EUR";

        sCard.classList.remove("saldo-positive", "saldo-negative", "saldo-zero");
        if (saldoVal > 0) sCard.classList.add("saldo-positive");
        else if (saldoVal < 0) sCard.classList.add("saldo-negative");
        else sCard.classList.add("saldo-zero");

        // --- РРќРЎРўР РЈРљР¦РР Р—Рђ РџР›РђР©РђРќР• вЂ” РїРѕРєР°Р·РІР°С‚ СЃРµ СЃР°РјРѕ РїСЂРё РґСЉР»Рі ---
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
            (result.periods || []).forEach((r, idx) => {
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
            tBody.innerHTML = '<tr><td colspan="10" style="text-align:center;">РќСЏРјР° РЅР°Р»РёС‡РЅРё РґР°РЅРЅРё Р·Р° РёР·Р±СЂР°РЅРёСЏ Р°РїР°СЂС‚Р°РјРµРЅС‚.</td></tr>';
        }

        // --- РџР•Р РЎРћРќРђР›РќРћ РЎРЄРћР‘Р©Р•РќРР• Р—Рђ РђРџРђР РўРђРњР•РќРўРђ ---
        const aptNoticeBanner = document.getElementById("individualAptNotice");
        const aptNoticeText = document.getElementById("individualAptNoticeText");
        if (result.aptNotice && result.aptNotice.trim() !== "") {
            aptNoticeText.innerHTML = result.aptNotice.replace(/\n/g, '<br>');
            aptNoticeBanner.style.display = "block";
        } else {
            aptNoticeBanner.style.display = "none";
        }
    } else {
        showToast("Р“СЂРµС€РєР° РїСЂРё Р·Р°СЂРµР¶РґР°РЅРµ РЅР° РґР°РЅРЅРёС‚Рµ", "error");
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
        err.textContent = "РњРѕР»СЏ, РІСЉРІРµРґРµС‚Рµ РёРјРµР№Р» Рё РїР°СЂРѕР»Р°.";
        return;
    }

    const result = await apiCall('verifyPin', { pin: pin });

    if (result && result.success) {
        sessionStorage.setItem("adminAuth_" + currentRouteKey, pin);
        localStorage.setItem("savedAdminEmail", email);
        err.textContent = "";
        showAdminContent();
    } else {
        err.textContent = result?.error || "Р“СЂРµС€РµРЅ PIN РєРѕРґ.";
    }
}

function showAdminContent() {
    document.getElementById("loginCard").style.display = "none";
    document.getElementById("adminCard").style.display = "block";
    populateAdminDropdowns();
    if(typeof checkRemontEligibility === 'function') checkRemontEligibility();
}

function populateAdminDropdowns() {
    ["adminApt", "adminEmailApt", "masterUchApt", "masterObApt", "masterChApt", "masterIdApt", "masterBookApt", "docAptSelect", "masterInfoApt", "emailAptTarget"].forEach(id => {
        const sel = document.getElementById(id);
        if (sel && sel.options.length <= 1) {
            sel.innerHTML = '<option value="">РР·Р±РµСЂРё Р°РїР°СЂС‚Р°РјРµРЅС‚</option>';
            apartmentList.forEach(a => sel.appendChild(new Option(a, a)));
        }
    });
}

const getStoredPin = () => sessionStorage.getItem("adminAuth_" + currentRouteKey);

window.submitPayment = async function () {
    const apt = document.getElementById("adminApt").value;
    const period = document.getElementById("adminPeriod").value.trim();
    const amount = document.getElementById("adminAmount").value.trim();

    if (!apt || !period || !amount) {
        showToast("РџРѕРїСЉР»РЅРµС‚Рµ РІСЃРёС‡РєРё РїРѕР»РµС‚Р° Р·Р° РїР»Р°С‰Р°РЅРµ!", "error");
        return;
    }

    const result = await apiCall('addPayment', {
        pin: getStoredPin(),
        apartment: apt,
        period: period,
        amount: amount
    });

    if (result && result.success) {
        showToast("вњ… РЈСЃРїРµС€РЅРѕ РґРѕР±Р°РІРµРЅРѕ РїР»Р°С‰Р°РЅРµ.", "success");
        document.getElementById("adminAmount").value = "";
        refreshCurrentView();
    } else {
        showToast(result?.error || "Р’СЉР·РЅРёРєРЅР° РіСЂРµС€РєР°", "error");
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

    if (!period) { showToast("РџРµСЂРёРѕРґСЉС‚ Рµ Р·Р°РґСЉР»Р¶РёС‚РµР»РµРЅ!", "error"); return; }
    
    const btn = document.getElementById("chargesBtn");
    showSaving(btn, "Р—Р°РїРёСЃРІР°РЅРµ...");

    const result = await apiCall('addCharges', {
        pin: getStoredPin(),
        period: period, elevator: elev, subscription: sub, light: light,
        security: security, cleaning: cleaning, podrajka: podrajka, remont: remont
    });

    hideSaving(btn, "Р—Р°РїРёС€Рё РЅР°С‡РёСЃР»РµРЅРёСЏ");
    if (result && result.success) {
        showToast("вњ… РЈСЃРїРµС€РЅРѕ Р·Р°РїРёСЃР°РЅРё РЅР°С‡РёСЃР»РµРЅРёСЏ.", "success");
        refreshCurrentView();
    } else {
        showToast(result?.error || "Р’СЉР·РЅРёРєРЅР° РіСЂРµС€РєР°", "error");
    }
}

window.loadCurrentEmail = async function () {
    const apt = document.getElementById("adminEmailApt").value;
    if (!apt) { document.getElementById("currentEmailBox").style.display = "none"; return; }
    const result = await apiCall('getEmail', { apartment: apt });
    if (result && typeof result.email !== 'undefined') {
        document.getElementById("currentEmail").textContent = result.email || "РќСЏРјР° Р·Р°РїРёСЃР°РЅ";
        document.getElementById("currentEmailBox").style.display = "block";
    }
}

window.submitEmail = async function () {
    const apt = document.getElementById("adminEmailApt").value;
    const email = document.getElementById("adminEmail").value.trim();
    if (!apt || !email) { showToast("РР·Р±РµСЂРµС‚Рµ Р°РїР°СЂС‚Р°РјРµРЅС‚ Рё РёРјРµР№Р»!", "error"); return; }
    const result = await apiCall('addEmail', { pin: getStoredPin(), apartment: apt, email: email });
    if (result && result.success) {
        showToast("РРјРµР№Р»СЉС‚ Рµ РѕР±РЅРѕРІРµРЅ.", "success");
        loadCurrentEmail();
    }
}

window.openSuperAdmin = function () {
    document.getElementById("superAdminOverlay").style.display = "flex";
    if (sessionStorage.getItem("superAdminAuth")) {
        showSuperAdminDashboard();
    } else {
        document.getElementById("superAdminLoginCard").style.display = "block";
        document.getElementById("superAdminDashboard").style.display = "none";
        document.getElementById("superPinInput").value = "";
    }
}

window.closeSuperAdmin = function () {
    document.getElementById("superAdminOverlay").style.display = "none";
}

window.loginSuperAdmin = async function () {
    const pin = document.getElementById("superPinInput").value.trim();
    const result = await apiCall('verifySuperPin', { pin: pin });
    if (result && result.success) {
        sessionStorage.setItem("superAdminAuth", pin);
        showSuperAdminDashboard();
    } else {
        document.getElementById("superPinError").textContent = result.error || "Р“СЂРµС€РЅР° РїР°СЂРѕР»Р°.";
    }
}

async function showSuperAdminDashboard() {
    document.getElementById("superAdminLoginCard").style.display = "none";
    document.getElementById("superAdminDashboard").style.display = "block";
    try {
        const res = await apiCall('getSuperSettings');
        if (res && res.success) {
            const setV = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ""; };
            setV("superPaymentOptions", res.paymentOptions);
            setV("priceBigCities", res.priceBigCities);
            setV("priceOtherCities", res.priceOtherCities);
            setV("priceLifetime", res.priceLifetime);
            setV("superGlobalMessage", res.globalMessage);
            const showReg = res.showRegForm !== undefined ? res.showRegForm.toString() : "true";
            setV("superShowRegForm", showReg);
            setV("superRegFormText", res.regFormText);
            setV("superRegFormMessage", res.regFormMessage || "");

            const wrapper = document.getElementById("superRegFormMessageWrapper");
            if (wrapper) wrapper.style.display = (showReg === "false") ? "block" : "none";
        }
    } catch (e) { console.error(e); }
    loadSuperAdminEntrances();
    loadSuperExceptions();
}

window.saveSuperSettings = async function () {
    const btn = document.getElementById("saveSuperSettingsBtn");
    showSaving(btn, "Р—Р°РїР°Р·РІР°РЅРµ...");
    try {
        const getV = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
        const reqData = {
            paymentOptions: getV("superPaymentOptions"),
            priceBigCities: getV("priceBigCities"),
            priceOtherCities: getV("priceOtherCities"),
            priceLifetime: getV("priceLifetime"),
            showRegForm: document.getElementById("superShowRegForm").value === "true",
            regFormMessage: getV("superRegFormMessage"),
            regFormText: getV("superRegFormText")
        };
        const result = await apiCall('updateSuperSettings', {
            pin: sessionStorage.getItem("superAdminAuth"),
            settings: JSON.stringify(reqData)
        });
        if (result && result.success) {
            showToast("вњ… РќР°СЃС‚СЂРѕР№РєРёС‚Рµ СЃР° Р·Р°РїР°Р·РµРЅРё!", "success");
        } else {
            showToast(result.error || "Р“СЂРµС€РєР° РїСЂРё Р·Р°РїРёСЃ", "error");
        }
    } catch (e) { console.error(e); } finally {
        hideSaving(btn, "Р—Р°РїР°Р·Рё РЅР°СЃС‚СЂРѕР№РєРёС‚Рµ");
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
        showToast("РЎСЉРѕР±С‰РµРЅРёРµС‚Рѕ Рµ Р·Р°РїР°Р·РµРЅРѕ!", "success");
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

            // РР·РїСЂР°С‰Р°РјРµ РёРјРµР№Р» РґРѕ РІСЃРёС‡РєРё Р¶РёРІСѓС‰Рё СЃ СЂРµРіРёСЃС‚СЂРёСЂР°РЅ РёРјРµР№Р»
            if (notice !== "") {
                apiCall('sendNoticeEmail', { pin: getStoredPin(), notice: notice })
                    .then(emailResult => {
                        if (emailResult && emailResult.success) {
                            showToast(`рџ“§ РРјРµР№Р»СЉС‚ Рµ РёР·РїСЂР°С‚РµРЅ РґРѕ ${emailResult.sent || 0} Р°РїР°СЂС‚Р°РјРµРЅС‚Р°.`, "success");
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
        showToast(result?.error || "Р“СЂРµС€РєР° РїСЂРё Р·Р°РїРёСЃ", "error");
    }
}

// РР·РїСЂР°С‰Р°РЅРµ РЅР° РёРЅРґРёРІРёРґСѓР°Р»РµРЅ РёРјРµР№Р» РґРѕ РєРѕРЅРєСЂРµС‚РµРЅ Р°РїР°СЂС‚Р°РјРµРЅС‚
window.sendAptEmail = async function () {
    const apt = document.getElementById("emailAptTarget").value;
    const subject = document.getElementById("emailAptSubject").value.trim();
    const body = document.getElementById("emailAptBody").value.trim();

    if (!apt) { showToast("РР·Р±РµСЂРµС‚Рµ Р°РїР°СЂС‚Р°РјРµРЅС‚!", "error"); return; }
    if (!subject) { showToast("РџРѕРїСЉР»РЅРµС‚Рµ С‚РµРјР° РЅР° РёРјРµР№Р»Р°!", "error"); return; }
    if (!body) { showToast("РџРѕРїСЉР»РЅРµС‚Рµ С‚РµРєСЃС‚ РЅР° РёРјРµР№Р»Р°!", "error"); return; }

    showLoading();
    const result = await apiCall('sendAptEmail', {
        pin: getStoredPin(),
        apartment: apt,
        subject: subject,
        body: body
    });
    hideLoading();

    if (result && result.success) {
        showToast("вњ… РРјРµР№Р»СЉС‚ Рµ РёР·РїСЂР°С‚РµРЅ СѓСЃРїРµС€РЅРѕ!", "success");
        document.getElementById("emailAptSubject").value = "";
        document.getElementById("emailAptBody").value = "";
    } else {
        showToast(result?.error || "Р“СЂРµС€РєР° РїСЂРё РёР·РїСЂР°С‰Р°РЅРµ", "error");
    }
}

window.saveGlobalMessage = async function () {
    const btn = document.getElementById("saveGlobalMessageBtn");
    const msg = document.getElementById("superGlobalMessage").value.trim();

    showSaving(btn, "РР·РїСЂР°С‰Р°РЅРµ...");

    try {
        const result = await apiCall('updateGlobalMessage', {
            pin: sessionStorage.getItem("superAdminAuth"),
            message: msg
        });

        if (result && result.success) {
            showToast("вњ… РЎСЉРѕР±С‰РµРЅРёРµС‚Рѕ Рµ РёР·РїСЂР°С‚РµРЅРѕ РґРѕ РІСЃРёС‡РєРё!", "success");
        } else {
            showToast(result.error || "Р“СЂРµС€РєР° РїСЂРё РёР·РїСЂР°С‰Р°РЅРµ", "error");
        }
    } catch (e) {
        showToast("РџСЂРѕР±Р»РµРј РїСЂРё РєРѕРјСѓРЅРёРєР°С†РёСЏ СЃСЉСЃ СЃСЉСЂРІСЉСЂР°", "error");
    } finally {
        hideSaving(btn, "РР·РїСЂР°С‚Рё СЃСЉРѕР±С‰РµРЅРёРµ");
    }
}

async function loadSuperAdminEntrances() {
    const tbody = document.getElementById("superAdminEntrancesList");
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Р—Р°СЂРµР¶РґР°РЅРµ...</td></tr>';

    const result = await apiCall('getRegistryList');
    if (result && result.success && Array.isArray(result.registry)) {
        tbody.innerHTML = '';
        const select = document.getElementById("superExceptionRegistry");
        if (select) select.innerHTML = '<option value="">-- РР·Р±РµСЂРё РІС…РѕРґ --</option>';

        result.registry.forEach(ent => {
            if (select) select.appendChild(new Option(ent.name + " (" + ent.id + ")", ent.id));
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="padding: 8px;"><b>${ent.name}</b></td>
                <td style="padding: 8px; font-family: monospace;">${ent.id}</td>
                <td style="padding: 8px; color: ${ent.validUntil === '2000-01-01' ? 'red' : 'inherit'};">
                    ${ent.validUntil === '2000-01-01' ? 'Р‘Р»РѕРєРёСЂР°РЅ' : (ent.validUntil || '---')}
                </td>
                <td style="padding: 8px;">
                    <span class="status-badge" style="background:${ent.validUntil === '2000-01-01' ? '#fa5252' : '#4ade80'}; color:white; padding: 2px 6px; border-radius: 4px; font-size: 11px;">
                        ${ent.validUntil === '2000-01-01' ? 'РЎРїСЂСЏРЅ' : 'РђРєС‚РёРІРµРЅ'}
                    </span>
                </td>
                <td style="padding: 8px;">
                    <button class="admin-btn secondary small" onclick="manageSub('${ent.id}', 'unblock')" style="padding:4px 8px; font-size:11px; margin-right:4px;">+30 РґРЅ.</button>
                    <button class="admin-btn small" onclick="manageSub('${ent.id}', 'block')" style="background:#fa5252; color:white; padding:4px 8px; font-size:11px; margin-right:4px;">РЎРїСЂРё</button>
                    <button class="admin-btn small" onclick="manageSub('${ent.id}', 'lifetime')" style="background:#4ade80; color:white; padding:4px 8px; font-size:11px;">Р‘РµР·СЃСЂРѕС‡РµРЅ</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Р“СЂРµС€РєР° РїСЂРё Р·Р°СЂРµР¶РґР°РЅРµ.</td></tr>';
    }
}

window.manageSub = async function (targetId, subAction) {
    if (!confirm(`РЎРёРіСѓСЂРЅРё Р»Рё СЃС‚Рµ, С‡Рµ РёСЃРєР°С‚Рµ РґР° РїСЂРѕРјРµРЅРёС‚Рµ РґРѕСЃС‚СЉРїР° РЅР° ID: ${targetId}?`)) return;

    const result = await apiCall('updateSubscription', {
        superPin: sessionStorage.getItem("superAdminAuth"),
        targetId: targetId,
        subAction: subAction
    });

    if (result && result.success) {
        showToast("РџСЂР°РІР°С‚Р° СЃР° РѕР±РЅРѕРІРµРЅРё СѓСЃРїРµС€РЅРѕ!", "success");
        loadSuperAdminEntrances();
    } else {
        showToast(result?.error || "Р“СЂРµС€РєР° РїСЂРё РѕР±РЅРѕРІСЏРІР°РЅРµ", "error");
    }
}

window.submitNewClient = async function () {
    const city = document.getElementById("newCity").value.trim();
    const block = document.getElementById("newBlock").value.trim();
    const entrance = document.getElementById("newEntrance").value.trim();
    const email = document.getElementById("newAdminEmail").value.trim();
    const aptCount = document.getElementById("newAptCount").value.trim();

    if (!city || !block || !entrance || !email || !aptCount) {
        showToast("РњРѕР»СЏ, РїРѕРїСЉР»РЅРµС‚Рµ РІСЃРёС‡РєРё РїРѕР»РµС‚Р°", "error");
        return;
    }

    const btn = document.getElementById("createClientBtn");
    btn.textContent = "Р“РµРЅРµСЂРёСЂР°РЅРµ (РР·С‡Р°РєР°Р№С‚Рµ РґРѕ 15 СЃРµРє)...";

    const result = await apiCall('createClient', {
        superPin: sessionStorage.getItem("superAdminAuth"),
        city: city,
        block: block,
        entrance: entrance,
        adminEmail: email,
        apartmentsCount: aptCount
    });

    btn.textContent = "РЎСЉР·РґР°Р№ РљР»РёРµРЅС‚ & Р“РµРЅРµСЂРёСЂР°Р№ РўР°Р±Р»РёС†Рё";

    if (result && result.success) {
        showToast("вњ… РљР»РёРµРЅС‚СЉС‚ Рµ СЃСЉР·РґР°РґРµРЅ СѓСЃРїРµС€РЅРѕ! РРјРµР№Р»СЉС‚ Рµ РёР·РїСЂР°С‚РµРЅ.", "success");
        document.getElementById("newCity").value = "";
        document.getElementById("newBlock").value = "";
        document.getElementById("newEntrance").value = "";
        document.getElementById("newAdminEmail").value = "";
        document.getElementById("newAptCount").value = "";

        // Refresh dropdowns if necessary by refreshing page
        setTimeout(() => location.reload(), 3000);
    } else {
        showToast(result?.error || "Р“СЂРµС€РєР° РїСЂРё СЃСЉР·РґР°РІР°РЅРµ", "error");
    }
}

window.runSystemBackup = async function () {
    const btn = document.getElementById("runBackupBtn");
    const statusDiv = document.getElementById("backupStatus");
    const linkA = document.getElementById("backupFolderLink");

    btn.disabled = true;
    btn.textContent = "РђСЂС…РёРІРёСЂР°РЅРµ (РњРѕР»СЏ, РёР·С‡Р°РєР°Р№С‚Рµ)...";
    statusDiv.style.display = "block";
    statusDiv.innerHTML = "вЏі РћР±РёРєР°Р»СЏРЅРµ РЅР° РІСЃРёС‡РєРё РІС…РѕРґРѕРІРµ Рё РєРѕРїРёСЂР°РЅРµ РЅР° С‚Р°Р±Р»РёС†Рё...";
    statusDiv.style.color = "#666";

    const result = await apiCall('runBackup', {
        superPin: sessionStorage.getItem("superAdminAuth")
    });

    btn.disabled = false;
    btn.textContent = "рџ“¦ РЎСЉР·РґР°Р№ Р СЉС‡РµРЅ РђСЂС…РёРІ РЎРµРіР°";

    if (result && result.success) {
        statusDiv.innerHTML = "вњ… " + result.message;
        statusDiv.style.color = "green";
        if (result.folderUrl) {
            linkA.href = result.folderUrl;
            // РџРѕРєР°Р·РІР°РјРµ Рё РІСЂРµРјРµРЅРµРЅ Р»РёРЅРє РґРёСЂРµРєС‚РЅРѕ РІ СЃС‚Р°С‚СѓСЃР° Р·Р° СѓРґРѕР±СЃС‚РІРѕ
            statusDiv.innerHTML += `<br><a href="${result.folderUrl}" target="_blank" style="color:var(--primary); font-weight:bold;">Р’РёР¶ РЅРѕРІРёСЏ Р°СЂС…РёРІ С‚СѓРє вћ”</a>`;
        }
    } else {
        statusDiv.innerHTML = "вќЊ Р“СЂРµС€РєР°: " + (result?.error || "РџСЂРѕР±Р»РµРј РїСЂРё Р°СЂС…РёРІРёСЂР°РЅРµ");
        statusDiv.style.color = "red";
    }
}

async function loadSuperExceptions() {
    const list = document.getElementById("superAdminExceptionsList");
    if (!list) return;
    list.innerHTML = '<tr><td colspan="5" style="text-align:center;">Р—Р°СЂРµР¶РґР°РЅРµ...</td></tr>';

    const result = await apiCall('getSuperExceptions', {
        superPin: sessionStorage.getItem("superAdminAuth")
    });

    if (result && result.success && Array.isArray(result.exceptions)) {
        list.innerHTML = "";
        result.exceptions.forEach(ex => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="padding:6px;">${ex.targetId}</td>
                <td style="padding:6px;">${ex.apartment === 'ALL' ? 'Р’СЃРёС‡РєРё' : ex.apartment}</td>
                <td style="padding:6px;">${ex.price} EUR</td>
                <td style="padding:6px;">${ex.validUntil}</td>
                <td style="padding:6px;"><button onclick="deleteSuperException(${ex.rowIdx})" style="color:red; background:none; border:none; cursor:pointer; font-size:14px;">вњ•</button></td>
            `;
            list.appendChild(tr);
        });
    } else {
        list.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:10px; color:#999;">РќСЏРјР° Р°РєС‚РёРІРЅРё РёР·РєР»СЋС‡РµРЅРёСЏ.</td></tr>';
    }
}

window.addSuperException = async function () {
    const targetId = document.getElementById("superExceptionRegistry").value;
    const apartment = document.getElementById("superExceptionApt").value.trim();
    const price = document.getElementById("superExceptionPrice").value.trim();
    const validUntil = document.getElementById("superExceptionDate").value;

    if (!targetId || price === "") {
        showToast("РР·Р±РµСЂРµС‚Рµ РІС…РѕРґ Рё С†РµРЅРѕРІР° СЃС‚РѕР№РЅРѕСЃС‚!", "error");
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
        showToast("РЎРїРµС†РёР°Р»РЅР°С‚Р° С†РµРЅР° Рµ РґРѕР±Р°РІРµРЅР°!", "success");
        document.getElementById("superExceptionApt").value = "";
        document.getElementById("superExceptionPrice").value = "";
        loadSuperExceptions();
    } else {
        showToast(res?.error || "Р’СЉР·РЅРёРєРЅР° РіСЂРµС€РєР°", "error");
    }
}

window.deleteSuperException = async function (rowIdx) {
    if (!confirm("РЎРёРіСѓСЂРЅРё Р»Рё СЃС‚Рµ, С‡Рµ РёСЃРєР°С‚Рµ РґР° РїСЂРµРјР°С…РЅРµС‚Рµ С‚РѕРІР° РёР·РєР»СЋС‡РµРЅРёРµ?")) return;
    const res = await apiCall('deleteSuperException', {
        superPin: sessionStorage.getItem("superAdminAuth"),
        rowIdx: rowIdx
    });
    if (res && res.success) {
        showToast("РР·РєР»СЋС‡РµРЅРёРµС‚Рѕ Рµ РїСЂРµРјР°С…РЅР°С‚Рѕ", "success");
        loadSuperExceptions();
    } else {
        showToast("Р“СЂРµС€РєР° РїСЂРё РёР·С‚СЂРёРІР°РЅРµ", "error");
    }
}

// ==============================================
// вљ–пёЏ Р—РЈР•РЎ РњР•РќРР”Р–РЄР  Р›РћР“РРљРђ
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
// рџ“‹ Р¦РЇР›Рђ Р”РћРњРћР’Рђ РљРќРР“Рђ
// ==============================================

let _fullBookData = []; // РєРµС€ Р·Р° С‚СЉСЂСЃРµРЅРµ

window.loadFullBook = async function () {
    const tbody = document.getElementById("fullBookBody");
    const status = document.getElementById("fullBookStatus");
    tbody.innerHTML = '<tr><td colspan="7" style="padding:20px; text-align:center; color:#aaa;">вЏі Р—Р°СЂРµР¶РґР°РЅРµ...</td></tr>';
    if (status) status.textContent = "";

    const result = await apiCall('getFullBook', { pin: getStoredPin() });

    if (!result || !result.success) {
        tbody.innerHTML = '<tr><td colspan="7" style="padding:20px; text-align:center; color:red;">вќЊ Р“СЂРµС€РєР° РїСЂРё Р·Р°СЂРµР¶РґР°РЅРµ</td></tr>';
        return;
    }

    _fullBookData = result.rows || [];
    renderBookTable(_fullBookData);

    if (status) {
        const filled = _fullBookData.filter(r => r["РЎРѕР±СЃС‚РІРµРЅРёРє"] && r["РЎРѕР±СЃС‚РІРµРЅРёРє"].trim() !== "").length;
        status.textContent = `РћР±С‰Рѕ: ${_fullBookData.length} Р°РїР°СЂС‚Р°РјРµРЅС‚Р° | РџРѕРїСЉР»РЅРµРЅРё: ${filled} | РќРµРїРѕРїСЉР»РЅРµРЅРё: ${_fullBookData.length - filled}`;
    }
}

function renderBookTable(rows) {
    const tbody = document.getElementById("fullBookBody");
    if (!rows || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="padding:20px; text-align:center; color:#aaa;">РќСЏРјР° РґР°РЅРЅРё РІ РєРЅРёРіР°С‚Р°.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map((r, idx) => {
        const hasMissing = !r["РЎРѕР±СЃС‚РІРµРЅРёРє"] || r["РЎРѕР±СЃС‚РІРµРЅРёРє"].trim() === "";
        const bg = hasMissing ? "background:#fffbf0;" : (idx % 2 === 0 ? "" : "background:#fafbfd;");
        const missingMark = hasMissing ? ' <span style="color:#e67e22; font-size:11px;">вљ пёЏ</span>' : '';

        return `<tr style="${bg} cursor:pointer;" onclick="switchZuesSubTab('z-book'); document.getElementById('masterBookApt').value='${r["РђРїР°СЂС‚Р°РјРµРЅС‚"] || ""}'; loadBookData();">
            <td style="padding:9px 12px; font-weight:700; color:#3b6edc;">${r["РђРїР°СЂС‚Р°РјРµРЅС‚"] || "вЂ”"}${missingMark}</td>
            <td style="padding:9px 12px;">${r["РЎРѕР±СЃС‚РІРµРЅРёРє"] || '<span style="color:#ccc;">РЅРµРїРѕРїСЉР»РЅРµРЅРѕ</span>'}</td>
            <td style="padding:9px 12px; font-size:12px;">${r["РРјРµР№Р»"] || 'вЂ”'}</td>
            <td style="padding:9px 12px; font-size:12px;">${r["РћР±РёС‚Р°С‚РµР»Рё"] || 'вЂ”'}</td>
            <td style="padding:9px 12px; font-size:12px;">${r["РџСЂРµРґРЅР°Р·РЅР°С‡РµРЅРёРµ"] || 'вЂ”'}</td>
            <td style="padding:9px 12px; font-size:12px;">${r["Р”Р°С‚Р° РІРїРёСЃРІР°РЅРµ"] || 'вЂ”'}</td>
            <td style="padding:9px 12px; font-size:12px;">${r["Р”РѕРјР°С€РЅРё Р»СЋР±РёРјС†Рё"] || 'вЂ”'}</td>
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
    if (status) status.textContent = `РќР°РјРµСЂРµРЅРё: ${filtered.length} РѕС‚ ${_fullBookData.length} Р°РїР°СЂС‚Р°РјРµРЅС‚Р°`;
}

window.printFullBook = function () {
    if (!_fullBookData || _fullBookData.length === 0) {
        showToast("Р—Р°СЂРµРґРµС‚Рµ РєРЅРёРіР°С‚Р° РїСЂРµРґРё РїРµС‡Р°С‚!", "error");
        return;
    }

    const rows = _fullBookData.map((r, idx) => `
        <tr style="${idx % 2 === 0 ? '' : 'background:#f9f9f9;'}">
            <td style="padding:6px 8px; border:1px solid #ddd; font-weight:600;">${r["РђРїР°СЂС‚Р°РјРµРЅС‚"] || "вЂ”"}</td>
            <td style="padding:6px 8px; border:1px solid #ddd;">${r["РЎРѕР±СЃС‚РІРµРЅРёРє"] || "вЂ”"}</td>
            <td style="padding:6px 8px; border:1px solid #ddd; font-size:11px;">${r["РРјРµР№Р»"] || "вЂ”"}</td>
            <td style="padding:6px 8px; border:1px solid #ddd;">${r["РћР±РёС‚Р°С‚РµР»Рё"] || "вЂ”"}</td>
            <td style="padding:6px 8px; border:1px solid #ddd;">${r["РџСЂРµРґРЅР°Р·РЅР°С‡РµРЅРёРµ"] || "вЂ”"}</td>
            <td style="padding:6px 8px; border:1px solid #ddd;">${r["Р”Р°С‚Р° РІРїРёСЃРІР°РЅРµ"] || "вЂ”"}</td>
            <td style="padding:6px 8px; border:1px solid #ddd;">${r["Р”РѕРјР°С€РЅРё Р»СЋР±РёРјС†Рё"] || "вЂ”"}</td>
        </tr>`).join('');

    const html = `<!DOCTYPE html><html><head>
        <meta charset="UTF-8">
        <title>Р”РѕРјРѕРІР° РєРЅРёРіР° вЂ” Р§Р». 7 РѕС‚ Р—РЈР•РЎ</title>
        <style>
            body { font-family: Arial, sans-serif; font-size: 13px; padding: 30px; color: #222; }
            h2 { text-align: center; margin-bottom: 4px; }
            p.subtitle { text-align: center; font-size: 12px; color: #666; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #1a1a2e; color: white; padding: 8px; border: 1px solid #333; font-size: 12px; }
            @media print { button { display: none; } }
        </style>
    </head><body>
        <h2>рџ“‹ Р”РћРњРћР’Рђ РљРќРР“Рђ вЂ” РљРЅРёРіР° РЅР° РµС‚Р°Р¶РЅР°С‚Р° СЃРѕР±СЃС‚РІРµРЅРѕСЃС‚ (Р§Р». 7 РѕС‚ Р—РЈР•РЎ)</h2>
        <p class="subtitle">Р”Р°С‚Р° РЅР° РёР·РІР»РёС‡Р°РЅРµ: ${new Date().toLocaleDateString('bg-BG')} Рі. | РћР±С‰Рѕ Р°РїР°СЂС‚Р°РјРµРЅС‚Рё: ${_fullBookData.length}</p>
        <table>
            <thead><tr>
                <th>РђРїС‚.</th><th>РЎРѕР±СЃС‚РІРµРЅРёРє/С†Рё</th><th>РРјРµР№Р»</th>
                <th>РћР±РёС‚Р°С‚РµР»Рё</th><th>РџСЂРµРґРЅР°Р·РЅ.</th><th>Р”Р°С‚Р° РІРїРёСЃРІР°РЅРµ</th><th>Р”РѕРјР°С€РЅРё</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
        <div style="margin-top:30px; font-size:11px; color:#888; text-align:right;">
            РЈРїСЂР°РІР»СЏРІР°РЅРѕ РѕС‚ СЃРёСЃС‚РµРјР°С‚Р° Р·Р° СѓРїСЂР°РІР»РµРЅРёРµ РЅР° Р•РЎ
        </div>
        <br><button onclick="window.print()" style="padding:8px 20px; background:#1a1a2e; color:white; border:none; border-radius:6px; cursor:pointer; font-size:13px;">рџ–ЁпёЏ РџРµС‡Р°С‚</button>
    </body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
}


window.populateAttendanceTable = async function () {
    const list = document.getElementById("meeting-attendance-list");
    if (!list) return;
    list.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:15px; color:#666;">вЏі Р—Р°СЂРµР¶РґР°РЅРµ РЅР° РґР°РЅРЅРё...</td></tr>';

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
        list.innerHTML = '<tr><td colspan="3" style="text-align:center; color:red; padding:10px;">Р“СЂРµС€РєР° РїСЂРё Р·Р°СЂРµР¶РґР°РЅРµ РЅР° РёРґРµР°Р»РЅРёС‚Рµ С‡Р°СЃС‚Рё.</td></tr>';
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
            s.innerText = "вњ… РРјР° РєРІРѕСЂСѓРј (РЅР°Рґ 67%)";
            s.style.color = "green";
        } else if (total >= 51) {
            s.innerText = "рџ”¶ РљРІРѕСЂСѓРј Р·Р° РѕС‚Р»РѕР¶РµРЅРѕ СЃСЉР±СЂР°РЅРёРµ (РЅР°Рґ 51%)";
            s.style.color = "orange";
        } else {
            s.innerText = "вќЊ РќСЏРјР° РєРІРѕСЂСѓРј (РЅРµРѕР±С…РѕРґРёРјРё 67%)";
            s.style.color = "red";
        }
    }
}

window.printAttendanceList = function () {
    const agenda = document.getElementById("meetingAgenda").value || "Р“РµРЅРµСЂР°Р»РµРЅ РґРЅРµРІРµРЅ СЂРµРґ";
    const now = new Date();

    let html = `
        <div style="font-family: Arial, sans-serif; padding: 40px; line-height: 1.6;">
            <h2 style="text-align:center;">РџР РРЎРЄРЎРўР’Р•Рќ РЎРџРРЎРЄРљ</h2>
            <p style="text-align:center;">РЅР° СЃРѕР±СЃС‚РІРµРЅРёС†РёС‚Рµ/РѕР±РёС‚Р°С‚РµР»РёС‚Рµ РІ РµС‚Р°Р¶РЅР° СЃРѕР±СЃС‚РІРµРЅРѕСЃС‚</p>
            <p><strong>Р”Р°С‚Р°:</strong> ${now.toLocaleDateString('bg-BG')} Рі.</p>
            <p><strong>Р”РЅРµРІРµРЅ СЂРµРґ:</strong> ${agenda}</p>
            <table border="1" style="width:100%; border-collapse: collapse; margin-top:20px;">
                <thead>
                    <tr style="background:#eee;">
                        <th style="padding:8px;">РђРїС‚.</th>
                        <th style="padding:8px;">РџСЂРµРґСЃС‚Р°РІРµРЅРё РРґ.С‡Р°СЃС‚Рё %</th>
                        <th style="padding:8px;">РРјРµ РЅР° РїСЂРёСЃСЉСЃС‚РІР°С‰РёСЏ / РџСЉР»РЅРѕРјРѕС‰РЅРёРє</th>
                        <th style="padding:8px;">РџРѕРґРїРёСЃ</th>
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
                <p>РџСЂРµРґСЃРµРґР°С‚РµР» РЅР° СЃСЉР±СЂР°РЅРёРµС‚Рѕ: ____________________</p>
                <p>РџСЂРѕС‚РѕРєРѕР»С‡РёРє: ____________________</p>
            </div>
        </div>
    `;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.print();
}

window.generateMeetingMinutes = function () {
    const agenda = document.getElementById("meetingAgenda").value || "Р“РµРЅРµСЂР°Р»РµРЅ РґРЅРµРІРµРЅ СЂРµРґ";
    const quorum = document.getElementById("quorum-percent").innerText;
    const now = new Date();

    let html = `
        <div style="font-family: Times New Roman, serif; padding: 50px; line-height: 1.5; color: #000;">
            <h2 style="text-align:center; text-decoration: underline;">РџР РћРўРћРљРћР› в„–____</h2>
            <h3 style="text-align:center;">РѕС‚ РћР±С‰Рѕ СЃСЉР±СЂР°РЅРёРµ РЅР° СЃРѕР±СЃС‚РІРµРЅРёС†РёС‚Рµ</h3>
            <p>Р”РЅРµСЃ, ${now.toLocaleDateString('bg-BG')} Рі., СЃРµ РїСЂРѕРІРµРґРµ РѕР±С‰Рѕ СЃСЉР±СЂР°РЅРёРµ РЅР° РµС‚Р°Р¶РЅР°С‚Р° СЃРѕР±СЃС‚РІРµРЅРѕСЃС‚.</p>
            <p><strong>РџСЂРµРґСЃС‚Р°РІРµРЅРё РёРґРµР°Р»РЅРё С‡Р°СЃС‚Рё:</strong> ${quorum}</p>
            <p><strong>Р”РЅРµРІРµРЅ СЂРµРґ:</strong></p>
            <p>${agenda}</p>
            <hr>
            <p><strong>РҐРћР” РќРђ РЎРЄР‘Р РђРќРР•РўРћ Р РџР РР•РўР Р Р•РЁР•РќРРЇ:</strong></p>
            <div style="min-height: 300px; border: 1px dashed #ccc; padding: 10px;">
                <em>[РўСѓРє РѕРїРёС€РµС‚Рµ РґРёСЃРєСѓСЃРёРёС‚Рµ Рё РіР»Р°СЃСѓРІР°РЅРёСЏС‚Р° Р·Р° РІСЃСЏРєР° С‚РѕС‡РєР°...]</em>
            </div>
            <p style="margin-top:40px;">РџСЂРѕС‚РѕРєРѕР»СЉС‚ Рµ СЃСЉСЃС‚Р°РІРµРЅ СЃСЉРіР»Р°СЃРЅРѕ Р§Р». 16 РѕС‚ Р—РЈР•РЎ.</p>
            <div style="display:flex; justify-content: space-between; margin-top:50px;">
                <div>РџСЂРµРґСЃРµРґР°С‚РµР»: ......................</div>
                <div>РџСЂРѕС‚РѕРєРѕР»С‡РёРє: ......................</div>
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
        showToast("РњРѕР»СЏ, РёР·Р±РµСЂРµС‚Рµ Р°РїР°СЂС‚Р°РјРµРЅС‚", "warning");
        return;
    }

    // Р—Р°СЂРµР¶РґР°РјРµ РґР°РЅРЅРёС‚Рµ РѕС‚ РљРЅРёРіР°С‚Р° (Р°РєРѕ СЃР° РЅР°Р»РёС‡РЅРё)
    const result = await apiCall('getBookData', { apartment: apt });
    const data = result?.data || {};

    let html = `
        <div style="font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: auto; line-height: 1.6;">
            <h2 style="text-align:center;">Р”Р•РљР›РђР РђР¦РРЇ</h2>
            <p style="text-align:center;">РїРѕ Р§Р». 47, Р°Р». 2 РѕС‚ Р—Р°РєРѕРЅР° Р·Р° СѓРїСЂР°РІР»РµРЅРёРµ РЅР° РµС‚Р°Р¶РЅР°С‚Р° СЃРѕР±СЃС‚РІРµРЅРѕСЃС‚</p>
            <br>
            <p>Р”Рѕ РЈРїСЂР°РІРёС‚РµР»РЅРёСЏ СЃСЉРІРµС‚ / РЈРїСЂР°РІРёС‚РµР»СЏ РЅР° Р•РЎ</p>
            <p><strong>РћРўРќРћРЎРќРћ:</strong> Р’РїРёСЃРІР°РЅРµ РЅР° РґР°РЅРЅРё РІ РљРЅРёРіР°С‚Р° РЅР° РµС‚Р°Р¶РЅР°С‚Р° СЃРѕР±СЃС‚РІРµРЅРѕСЃС‚</p>
            <br>
            <p>Р”РѕР»СѓРїРѕРґРїРёСЃР°РЅРёСЏС‚/Р°С‚Р°: <strong>${data.Owner || '..........................................................'}</strong></p>
            <p>Р’ РєР°С‡РµСЃС‚РІРѕС‚Рѕ РјРё РЅР° СЃРѕР±СЃС‚РІРµРЅРёРє/РїРѕР»Р·РІР°С‚РµР» РЅР° СЃР°РјРѕСЃС‚РѕСЏС‚РµР»РµРЅ РѕР±РµРєС‚ <strong>в„– ${apt}</strong></p>
            <br>
            <p><strong>Р”Р•РљР›РђР РР РђРњ РЎР›Р•Р”РќРРўР• РћР‘РЎРўРћРЇРўР•Р›РЎРўР’Рђ:</strong></p>
            <p>1. Р§Р»РµРЅРѕРІРµ РЅР° РјРѕРµС‚Рѕ РґРѕРјР°РєРёРЅСЃС‚РІРѕ / РћР±РёС‚Р°С‚РµР»Рё: <br><em>${data.Occupants || '..........................................................'}</em></p>
            <p>2. РџСЂРёС‚РµР¶Р°РІР°РЅРё РґРѕРјР°С€РЅРё Р»СЋР±РёРјС†Рё: <em>${data.Pets || 'РќСЏРјР°'}</em></p>
            <p>3. РР·РїРѕР»Р·РІР°Рј РѕР±РµРєС‚Р° Р·Р°: <em>${data.Purpose || 'Р–РёР»РёС‰РЅРё РЅСѓР¶РґРё'}</em></p>
            <br>
            <p>РР·РІРµСЃС‚РЅРѕ РјРё Рµ, С‡Рµ Р·Р° РґРµРєР»Р°СЂРёСЂР°РЅРё РЅРµРІРµСЂРЅРё РґР°РЅРЅРё РЅРѕСЃСЏ РЅР°РєР°Р·Р°С‚РµР»РЅР° РѕС‚РіРѕРІРѕСЂРЅРѕСЃС‚ РїРѕ С‡Р». 313 РѕС‚ РќР°РєР°Р·Р°С‚РµР»РЅРёСЏ РєРѕРґРµРєСЃ.</p>
            <br><br>
            <div style="display:flex; justify-content: space-between;">
                <div>Р”Р°С‚Р°: ......................</div>
                <div>Р”РµРєР»Р°СЂР°С‚РѕСЂ: ......................</div>
            </div>
        </div>
    `;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.print();
}

// ==============================================
// РњР•РЎР•Р§Р•Рќ Р¤РРќРђРќРЎРћР’ РћРўР§Р•Рў (Р§Р». 23 Р—РЈР•РЎ)
// ==============================================

window.openMonthlyReport = function () {
    switchPage('monthly-report');
    const d = new Date();
    // РџРѕ РїРѕРґСЂР°Р·Р±РёСЂР°РЅРµ РїСЂРµРґС…РѕРґРЅРёСЏ РјРµСЃРµС† (Р·Р°С‰РѕС‚Рѕ РѕС‚С‡РµС‚РёС‚Рµ СЃРµ РїСЂР°РІСЏС‚ Р·Р° Р·Р°РІСЉСЂС€РµРЅ РїРµСЂРёРѕРґ)
    const lastMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const periodStr = String(lastMonth.getMonth() + 1).padStart(2, '0') + "." + lastMonth.getFullYear();
    document.getElementById("reportPeriodInput").value = periodStr;
    document.getElementById("report-content").style.display = "none";
}

async function loadMonthlyReportFromFirebase(routeKey, period) {
  const { collection, getDocs, query, where } = window.fb;
  const db = window.db;

  const q = query(
    collection(db, "monthlyReports"),
    where("buildingId", "==", routeKey),
    where("period", "==", period)
  );

  const snapshot = await getDocs(q);

  let totalInvoiced = 0;
  let totalCollected = 0;

  const rows = [];
  
  let invoicedCounts = {
      elevator: 0, subscription: 0, light: 0,
      security: 0, cleaning: 0, podrajka: 0, remont: 0
  };

  snapshot.forEach(doc => {
    const d = doc.data();

    const due = Number(d.due || 0);
    const paid = Number(d.paid || 0);

    totalInvoiced += due;
    totalCollected += paid;

    invoicedCounts.elevator += Number(d.elevator || 0);
    invoicedCounts.subscription += Number(d.subscription || 0);
    invoicedCounts.light += Number(d.light || 0);
    invoicedCounts.security += Number(d.security || 0);
    invoicedCounts.cleaning += Number(d.cleaning || 0);
    invoicedCounts.podrajka += Number(d.podrajka || 0);
    invoicedCounts.remont += Number(d.remont || 0);

    rows.push(d);
  });
  
  invoicedCounts.total = totalInvoiced;

  return {
    success: true,
    data: {
      invoiced: invoicedCounts,
      collected: totalCollected,
      logic: rows[0] ? (rows[0].logic || 'Р Р°РІРЅРѕ') : 'Р Р°РІРЅРѕ', // Р’Р·РёРјР°РјРµ Р»РѕРіРёРєР°С‚Р° РѕС‚ РїСЉСЂРІРёСЏ Р·Р°РїРёСЃ
      apartments: rows.map(r => ({
        apt: r.apartmentId || r.apt || '?',
        occupants: r.occupants || 0,
        chips: r.chips || 0,
        participation: r.participation || 'Р”Р°',
        idealParts: r.idealParts || 0,
        due: Number(r.due || 0)
      })).sort((a, b) => {
        const numA = parseInt(a.apt.replace(/[^0-9]/g, '')) || 0;
        const numB = parseInt(b.apt.replace(/[^0-9]/g, '')) || 0;
        return numA - numB;
      })
    }
  };
}

window.generateReport = async function () {
    const period = document.getElementById("reportPeriodInput").value.trim();
    if (!period) {
        showToast("РњРѕР»СЏ, РІСЉРІРµРґРµС‚Рµ РїРµСЂРёРѕРґ!", "error");
        return;
    }

    const btn = document.querySelector("#view-monthly-report .btn-primary");
    showSaving(btn, "Р—Р°СЂРµР¶РґР°РЅРµ...");

    try {
        const result = await loadMonthlyReportFromFirebase(currentRouteKey, period);
        if (result && result.success && result.data) {
            const d = result.data;
            document.getElementById("report-title-period").textContent = `Р·Р° РјРµСЃРµС† ${period} Рі.`;
            document.getElementById("report-gen-date").textContent = new Date().toLocaleDateString('bg-BG');

            const tableBody = document.getElementById("report-invoiced-rows");
            tableBody.innerHTML = "";

            const labels = {
                elevator: "Р Р°Р·С…РѕРґРё Р·Р° Р°СЃР°РЅСЃСЊРѕСЂ",
                subscription: "Р”СЂСѓРіРё Р°Р±РѕРЅР°РјРµРЅС‚Рё",
                light: "Р•Р»РµРєС‚СЂРёС‡РµСЃРєР° РµРЅРµСЂРіРёСЏ - РѕР±С‰Рё С‡Р°СЃС‚Рё",
                security: "РћС…СЂР°РЅР° / РљРѕРЅСЃРёРµСЂР¶",
                cleaning: "РҐРёРіРёРµРЅР° Рё РїРѕС‡РёСЃС‚РІР°РЅРµ",
                podrajka: "РџРѕРґРґСЂСЉР¶РєР° РЅР° РѕР±С‰Рё С‡Р°СЃС‚Рё",
                remont: 'Р¤РѕРЅРґ \u201eР РµРјРѕРЅС‚ Рё РѕР±РЅРѕРІСЏРІР°РЅРµ\u201c'
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

            // --- Р”РћР‘РђР’РЇРќР• РќРђ РЎРўРђРўРРЎРўРРљРђ Р—Рђ РџР•Р РРћР”Рђ (РџРђР РђРњР•РўР Р РџР•Р РЎРћРќРђР›РќРћ) ---
            const statsBoxId = "monthly-report-stats-box";
            let statsSect = document.getElementById(statsBoxId);
            if (!statsSect) {
                statsSect = document.createElement("div");
                statsSect.id = statsBoxId;
                statsSect.style.marginTop = "30px";
                statsSect.style.paddingTop = "15px";
                statsSect.style.borderTop = "1px solid #eee";
            }
            // Р’РёРЅР°РіРё РіРѕ РґРѕР±Р°РІСЏРјРµ РЅР°РЅРѕРІРѕ, Р·Р° РґР° СЃРјРµ СЃРёРіСѓСЂРЅРё, С‡Рµ Рµ РІСЉС‚СЂРµ РІ СЃР°РјРёСЏ РѕС‚С‡РµС‚ (РїСЂРµРґРё РїРѕРґРїРёСЃРёС‚Рµ):
            document.getElementById("report-total-collected").parentNode.parentNode.appendChild(statsSect);

            let aptRowsHTML = "";
            let summaryTotalDue = 0;
            if (d.apartments && d.apartments.length > 0) {
                d.apartments.forEach(a => {
                    summaryTotalDue += a.due;
                    aptRowsHTML += `
                        <tr style="text-align: center; border-bottom: 1px dashed #eee;">
                            <td style="padding: 6px 0;"><strong>${a.apt}</strong></td>
                            <td style="padding: 6px 0;">${a.occupants}</td>
                            <td style="padding: 6px 0;">${a.chips}</td>
                            <td style="padding: 6px 0;">${a.participation}</td>
                            <td style="padding: 6px 0;">${a.idealParts}%</td>
                            <td style="padding: 6px 0; font-weight: bold;">${a.due.toFixed(2)} EUR</td>
                        </tr>
                    `;
                });
            } else {
                aptRowsHTML = `<tr><td colspan="6" style="padding: 10px; text-align: center;">РќСЏРјР° РЅР°Р»РёС‡РЅРё РґРµС‚Р°Р№Р»РЅРё РґР°РЅРЅРё</td></tr>`;
            }

            statsSect.innerHTML = `
                <div style="page-break-inside: avoid;">
                    <h4 style="margin: 0 0 5px; font-size: 14px; text-transform: uppercase;">
                        III. РџРѕРґСЂРѕР±РЅРё РїР°СЂР°РјРµС‚СЂРё РїРѕ Р°РїР°СЂС‚Р°РјРµРЅС‚Рё
                    </h4>
                    <p style="font-size: 11px; margin-bottom: 15px; color: #555;">Р›РѕРіРёРєР° РЅР° СЂР°Р·РїСЂРµРґРµР»РµРЅРёРµ (РђСЃР°РЅСЃСЊРѕСЂ): <strong>${d.logic || 'Р Р°РІРЅРѕ'}</strong></p>
                    <table style="width: 100%; font-size: 12px; color: #333; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f8f9fa; border-bottom: 1px solid #ccc; text-align: center; font-weight: normal;">
                                <th style="padding: 8px 4px; border-bottom: 2px solid #ddd;">РђРї.</th>
                                <th style="padding: 8px 4px; border-bottom: 2px solid #ddd;">РћР±РёС‚Р°С‚РµР»Рё</th>
                                <th style="padding: 8px 4px; border-bottom: 2px solid #ddd;">Р§РёРїРѕРІРµ</th>
                                <th style="padding: 8px 4px; border-bottom: 2px solid #ddd;">РЈС‡Р°СЃС‚РёРµ РђСЃР°РЅ.</th>
                                <th style="padding: 8px 4px; border-bottom: 2px solid #ddd;">РРґ. Р§Р°СЃС‚Рё</th>
                                <th style="padding: 8px 4px; border-bottom: 2px solid #ddd;">РќР°С‡РёСЃР»РµРЅРѕ</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${aptRowsHTML}
                        </tbody>
                    </table>
                </div>
            `;

            document.getElementById("report-content").style.display = "block";
        } else {
            showToast(result?.error || "РќСЏРјР° РґР°РЅРЅРё Р·Р° С‚РѕР·Рё РїРµСЂРёРѕРґ.", "error");
            document.getElementById("report-content").style.display = "none";
        }
    } catch (e) {
        showToast("Р“СЂРµС€РєР° РїСЂРё РіРµРЅРµСЂРёСЂР°РЅРµ РЅР° РѕС‚С‡РµС‚Р°", "error");
    } finally {
        hideSaving(btn, "РџРѕРєР°Р¶Рё");
    }
}

window.printReport = function () {
    const printContents = document.getElementById('report-print-area').innerHTML;
    const originalContents = document.body.innerHTML;

    // Р’СЂРµРјРµРЅРЅР° СЃРјСЏРЅР° РЅР° С‚СЏР»РѕС‚Рѕ Р·Р° РїСЂРёРЅС‚РёСЂР°РЅРµ (РёР»Рё РїРѕ-РґРѕР±СЂРµ С‡СЂРµР· CSS media print)
    // РўСЉР№ РєР°С‚Рѕ С‚РѕРІР° Рµ SPA, print() С‰Рµ С…РІР°РЅРµ РІСЃРёС‡РєРѕ. РР·РїРѕР»Р·РІР°РјРµ РїСЂРѕСЃС‚ РјРµС‚РѕРґ:
    const printWindow = window.open('', '', 'height=800,width=800');
    printWindow.document.write('<html><head><title>РњРµСЃРµС‡РµРЅ РѕС‚С‡РµС‚ - ' + document.getElementById("reportPeriodInput").value + '</title>');
    printWindow.document.write('<style>body{font-family: Arial, sans-serif; padding: 40px;} table{width:100%; border-collapse:collapse;} td{padding:10px 0;} tr.total{font-weight:bold; border-top:2px solid black;}</style>');
    printWindow.document.write('</head><body>');
    printWindow.document.write(printContents);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.print();
}

// РџРѕРјРѕС‰РЅР° С„СѓРЅРєС†РёСЏ Р·Р° СЃРјСЏРЅР° РЅР° СЃС‚СЂР°РЅРёС†РёС‚Рµ
window.switchPage = function (pageId) {
    // Р’СЃРёС‡РєРё РїР°РЅРµР»Рё
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
            input.placeholder = allHaveParts ? "РћР±С‰Р° СЃСѓРјР° Р·Р° РІС…РѕРґР°" : "Р”РµР°РєС‚РёРІРёСЂР°РЅРѕ (Р»РёРїСЃРІР°С‚ РРґ. С‡Р°СЃС‚Рё Р·Р° РІСЃРёС‡РєРё)";
            if(!allHaveParts) input.value = "";
        }
        
        if (warn) {
            warn.style.display = allHaveParts ? "none" : "block";
            if (!allHaveParts) {
                if (missing.length > 0 && missing.length <= 15) {
                    warn.innerHTML = `вљ пёЏ Р—Р° РЅР°С‡РёСЃР»РµРЅРёСЏ РєСЉРј С„РѕРЅРґ СЂРµРјРѕРЅС‚ РїСЉСЂРІРѕ РІСЉРІРµРґРµС‚Рµ РРґ. С‡Р°СЃС‚ (%) Р·Р° <b>РІСЃРёС‡РєРё</b> Р°РїР°СЂС‚Р°РјРµРЅС‚Рё.<br><b>Р›РёРїСЃРІР°С‚ Р·Р°:</b> ${missing.join(", ")}`;
                } else if (missing.length > 15) {
                    warn.innerHTML = `вљ пёЏ Р—Р° РЅР°С‡РёСЃР»РµРЅРёСЏ РєСЉРј С„РѕРЅРґ СЂРµРјРѕРЅС‚ РїСЉСЂРІРѕ РІСЉРІРµРґРµС‚Рµ РРґ. С‡Р°СЃС‚ (%) Р·Р° <b>РІСЃРёС‡РєРё</b> Р°РїР°СЂС‚Р°РјРµРЅС‚Рё.<br><b>Р›РёРїСЃРІР°С‚ Р·Р° ${missing.length} Р°РїР°СЂС‚Р°РјРµРЅС‚Р°.</b>`;
                } else {
                    warn.innerHTML = `вљ пёЏ Р—Р° РЅР°С‡РёСЃР»РµРЅРёСЏ РєСЉРј С„РѕРЅРґ СЂРµРјРѕРЅС‚ РїСЉСЂРІРѕ РІСЉРІРµРґРµС‚Рµ РРґ. С‡Р°СЃС‚ (%) Р·Р° РІСЃРµРєРё Р°РїР°СЂС‚Р°РјРµРЅС‚ РІ MASTER.`;
                }
            }
        }
    } catch(e) {}
}



window.forceFirebaseSync = async function() {
    const btn = document.getElementById('forceSyncBtn');
    if (!btn) return;
    showSaving(btn, 'РЎРёРЅС…СЂРѕРЅРёР·РёСЂР°РЅРµ... (РѕС‚РЅРµРјР° 5-15 СЃРµРє)');
    try {
        const result = await apiCall('forceDataSync', { pin: getStoredPin() });
        if (result && result.success) {
            showToast('РЎРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏС‚Р° РїСЂРёРєР»СЋС‡Рё СѓСЃРїРµС€РЅРѕ!', 'success');
            refreshCurrentView();
        } else {
            showToast(result?.error || 'СЂРѕР±Р»РµРј РїСЂРё СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏС‚Р°.', 'error');
        }
    } catch(e) {
        showToast('СЂРµС€РєР° РїСЂРё РєРѕРјСѓРЅРёРєР°С†РёСЏ СЃСЉСЃ СЃСЉСЂРІСЉСЂР°', 'error');
    } finally {
        hideSaving(btn, 'Р·РїСЂР°С‚Рё РґР°РЅРЅРёС‚Рµ РєСЉРј РїСЂРёР»РѕР¶РµРЅРёРµС‚Рѕ');
    }
}


// ==============================================
// FORCE FIREBASE SYNC (Manual Trigger)
// ==============================================
window.forceFirebaseSync = async function() {
    const btn = document.getElementById("forceSyncBtn");
    if (!btn) return;
    showSaving(btn, "РЎРёРЅС…СЂРѕРЅРёР·РёСЂР°РЅРµ... (РѕС‚РЅРµРјР° 5-15 СЃРµРє)");
    try {
        const result = await apiCall("forceDataSync", { pin: getStoredPin() });
        if (result && result.success) {
            showToast("РЎРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏС‚Р° РїСЂРёРєР»СЋС‡Рё СѓСЃРїРµС€РЅРѕ!", "success");
            refreshCurrentView();
        } else {
            showToast(result?.error || "РџСЂРѕР±Р»РµРј РїСЂРё СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёСЏС‚Р°.", "error");
        }
    } catch(e) {
        showToast("Р“СЂРµС€РєР° РїСЂРё РєРѕРјСѓРЅРёРєР°С†РёСЏ СЃСЉСЃ СЃСЉСЂРІСЉСЂР°", "error");
    } finally {
        hideSaving(btn, "РР·РїСЂР°С‚Рё РґР°РЅРЅРёС‚Рµ РєСЉРј РїСЂРёР»РѕР¶РµРЅРёРµС‚Рѕ");
    }
}
