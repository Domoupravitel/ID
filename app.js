// ==============================================
// CONFIGURATION & GLOBAL STATE
// ==============================================

// Тук трябва да се постави линка от Google Apps Script, след като се разгърне (Deploy -> Web App)
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwDypJEQt07rcjZZ0FDDzV_o2QoTfDBaA3p2CGNi99cGT5FeSrJGY-wYGYuB5UO6BZ8jA/exec";

let currentRouteKey = "";
let apartmentList = [];
let _currentIdealParts = {};

function getStoredPin() {
    return sessionStorage.getItem("adminAuth_" + currentRouteKey);
}

// ==============================================
// INITIALIZATION
// ==============================================

document.addEventListener('DOMContentLoaded', async () => {
    const savedEmail = localStorage.getItem("savedAdminEmail");
    const savedId = localStorage.getItem("savedAccessId");

    if (savedEmail) {
        document.getElementById("adminEmailInput").value = savedEmail;
    }
    const urlParams = new URLSearchParams(window.location.search);
    if (savedId && !urlParams.get('id') && !window.location.hash) {
        document.getElementById("access-id").value = savedId;
    }

    document.getElementById('apartmentSelect').addEventListener('change', (e) => {
        if (e.target.value) {
            loadApartmentData(e.target.value);
        } else {
            resetApartmentData();
            if (currentRouteKey) {
                window.location.hash = encodeURIComponent(currentRouteKey);
            } else {
                window.location.hash = "";
            }
        }
    });

    document.getElementById("pinInput").addEventListener('keydown', (e) => {
        if (e.key === 'Enter') verifyPin();
    });

    let idValue = urlParams.get('id');
    let aptValue = urlParams.get('apt');

    if (window.location.hash) {
        try {
            const rawHash = window.location.hash.replace('#', '');
            if (rawHash) {
                const parts = rawHash.split('/');
                if (parts[0]) idValue = decodeURIComponent(parts[0]);
                if (parts[1]) aptValue = decodeURIComponent(parts[1]);
            }
        } catch(e) { console.error("Hash parsing failed", e); }
    }

    if (idValue) {
        const cleanId = idValue.trim();
        document.getElementById('access-id').value = cleanId;
        const success = await enterEntrance();
        if (success && aptValue) {
            const select = document.getElementById("apartmentSelect");
            const targetApt = decodeURIComponent(aptValue);
            if (apartmentList && apartmentList.length > 0) {
                const found = apartmentList.find(a => normalizeAptName(a) === normalizeAptName(targetApt)) || 
                              apartmentList.find(a => a === targetApt);
                if (found) {
                    select.value = found;
                    loadApartmentData(found);
                }
            }
        }
    }

    loadPublicSettings();

    if (sessionStorage.getItem('shouldOpenAdmin') === 'true') {
        sessionStorage.removeItem('shouldOpenAdmin');
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
            regLink.style.display = "block";
        }
    } catch (e) {
        console.error("Error loading public settings:", e);
    }
}

async function apiCall(action, params = {}) {
    showLoading();
    if (!SCRIPT_URL.startsWith("https://script.google.com/macros")) {
        hideLoading();
        console.error("Моля, сложете реалния SCRIPT_URL в app.js");
        showToast("Грешка: Липсва връзка с Google Script (API)", "error");
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
        showToast("Проблем с връзката към сървъра", "error");
        return { error: error.toString() };
    }
}

window.activeLoadingRequests = 0;
window.showLoading = function () {
    window.activeLoadingRequests++;
    const loader = document.getElementById("loadingOverlay");
    if (loader) loader.classList.add("active");
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
    return name.toString().toUpperCase().replace(/А/g, "A").replace(/\s+/g, "");
}

function resetApartmentData() {
    const sc = document.getElementById("saldoCard");
    if (sc) sc.className = "card saldo-card saldo-zero";
    const sEl = document.getElementById("saldo");
    if (sEl) sEl.textContent = "-";
    const tBody = document.getElementById("tableBody");
    if (tBody) tBody.innerHTML = "";
    const pRef = document.getElementById("payment-reference-box");
    if (pRef) pRef.style.display = "none";
    const pDet = document.getElementById("payment-details-box");
    if (pDet) pDet.style.display = "none";
    const iApt = document.getElementById("individualAptNotice");
    if (iApt) iApt.style.display = "none";
}

let toastTimeout;
window.showToast = function (msg, type) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast " + type;
    clearTimeout(toastTimeout);
    requestAnimationFrame(() => { t.classList.add("show"); });
    toastTimeout = setTimeout(() => { t.classList.remove("show"); }, 3500);
}

window.showSaving = function (btn, text = "⏳ Записване...") {
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
    btn.innerHTML = originalText || btn._originalText || "Запази";
    btn.disabled = false;
    btn.style.opacity = "";
}

window.refreshCurrentView = function () {
    loadDashboardData();
    const apt = document.getElementById("apartmentSelect").value;
    if (apt) {
        loadApartmentData(apt);
    }
}

window.toggleContactForm = function() {
    const section = document.getElementById('contact-section');
    if (section && section.classList.contains('hidden')) {
        const regSection = document.getElementById('registration-section');
        if (regSection) regSection.classList.add('hidden');
        section.classList.remove('hidden');
        setTimeout(() => { section.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
    } else if (section) {
        section.classList.add('hidden');
    }
}

window.toggleRegistrationForm = function() {
    const section = document.getElementById('registration-section');
    if (section && section.classList.contains('hidden')) {
        const contactSection = document.getElementById('contact-section');
        if (contactSection) contactSection.classList.add('hidden');
        section.classList.remove('hidden');
        setTimeout(() => { section.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
    } else if (section) {
        section.classList.add('hidden');
    }
}

window.exitEntrance = function () {
    currentRouteKey = "";
    apartmentList = [];
    window.location.hash = "";
    document.getElementById('access-id').value = "";
    resetApartmentData();
    document.getElementById('view-entrance-home').classList.remove('active');
    document.getElementById('view-entrance-home').classList.add('hidden');
    document.getElementById('view-selector').classList.remove('hidden');
    document.getElementById('view-selector').classList.add('active');
    const select = document.getElementById("apartmentSelect");
    if (select) select.innerHTML = '<option value="">Избери апартамент</option>';
}

window.enterEntrance = async function () {
    let accessId = document.getElementById('access-id').value.trim();
    if (accessId.includes('%')) {
        try { accessId = decodeURIComponent(accessId); document.getElementById('access-id').value = accessId; } catch(e) {}
    }
    if (!accessId) { showToast("Моля, въведете вашето ID за достъп!", "error"); return false; }
    localStorage.setItem("savedAccessId", accessId);
    currentRouteKey = accessId;
    const btn = document.querySelector("#view-selector .btn-primary");
    const originalText = btn.textContent;
    btn.textContent = "Зареждане...";
    btn.disabled = true;

    const [result, configResult] = await Promise.all([
        apiCall('list', { list: 'apartments' }),
        apiCall('getEntranceInfo')
    ]);

    if (configResult && configResult.success && configResult.info) {
        const info = configResult.info;
        if (info.isHardBlocked) {
            hideLoading();
            showToast(`⚠️ Достъпът е напълно спрян поради над 3 месеца неплатен абонамент. (При превод задължително посочете ID: ${currentRouteKey})`, "error");
            btn.textContent = originalText;
            btn.disabled = false;
            return false;
        }
        btn.textContent = originalText;
        btn.disabled = false;
        if (info.pricePerApt !== undefined) {
            sessionStorage.setItem("pricePerApt_" + currentRouteKey, info.pricePerApt);
            sessionStorage.setItem("lifetimePrice_" + currentRouteKey, info.lifetimePrice);
            sessionStorage.setItem("currency_" + currentRouteKey, info.currency);
        }
        if (info.paymentInfo) {
            document.getElementById('payment-instructions').textContent = info.paymentInfo;
            document.getElementById('masterPaymentText').value = info.paymentInfo;
            sessionStorage.setItem('paymentInfo_' + currentRouteKey, info.paymentInfo);
        } else {
            sessionStorage.removeItem('paymentInfo_' + currentRouteKey);
        }
        document.getElementById('payment-details-box').style.display = 'none';
        const adminMailBtn = document.getElementById('admin-mailto-link');
        if (adminMailBtn) {
            if (info.adminEmail) { adminMailBtn.href = `mailto:${info.adminEmail}`; adminMailBtn.style.display = 'inline-block'; }
            else { adminMailBtn.style.display = 'none'; }
        }
        if (info.linkElectric) {
            document.getElementById('btn-electric-link').href = info.linkElectric;
            document.getElementById('btn-electric-link').style.display = 'inline-block';
            document.getElementById('masterLinkElectric').value = info.linkElectric;
        } else { document.getElementById('btn-electric-link').style.display = 'none'; }
        if (info.linkSubscription) {
            document.getElementById('btn-subscription-link').href = info.linkSubscription;
            document.getElementById('btn-subscription-link').style.display = 'inline-block';
            document.getElementById('masterLinkSubscription').value = info.linkSubscription;
        } else { document.getElementById('btn-subscription-link').style.display = 'none'; }

        let totalMonthly = 0;
        const basePrice = parseFloat(info.pricePerApt) || 0;
        const aptCount = (result && Array.isArray(result)) ? result.length : 0;
        const individual = info.individualPrices || [];
        const globalEx = individual.find(ex => ex.apartment === 'ALL');
        if (globalEx) { totalMonthly = aptCount * parseFloat(globalEx.price); }
        else if (Array.isArray(result)) {
            result.forEach(apt => {
                const aptEx = individual.find(ex => ex.apartment === apt);
                totalMonthly += aptEx ? parseFloat(aptEx.price) : basePrice;
            });
        }
        const subMonthlyEl = document.getElementById("subMonthlyPrice");
        const subLifetimeEl = document.getElementById("subLifetimePrice");
        const subCodeEl = document.getElementById("subscriptionCodeDisplay");
        if (subMonthlyEl) subMonthlyEl.textContent = `${totalMonthly.toFixed(2)} EUR`;
        if (subLifetimeEl) subLifetimeEl.textContent = `${parseFloat(info.lifetimePrice || 0).toFixed(2)} EUR`;
        if (subCodeEl) subCodeEl.textContent = currentRouteKey;
        if (totalMonthly === 0 && aptCount > 0) {
            if (subMonthlyEl) subMonthlyEl.innerHTML = '<span style="color:green;">🎁 БЕЗПЛАТНО</span>';
        }
        const newsBanner = document.getElementById("adminGlobalNews");
        if (newsBanner && info.globalMessage && info.globalMessage.trim() !== "") {
            document.getElementById("adminGlobalNewsText").innerHTML = info.globalMessage.replace(/\n/g, '<br>');
            newsBanner.style.display = "block";
        } else if (newsBanner) { newsBanner.style.display = "none"; }
        const userNoticeBanner = document.getElementById("userEntranceNotice");
        const userNoticeBannerHome = document.getElementById("userEntranceNoticeHome");
        if (info.entranceNotice && info.entranceNotice.trim() !== "") {
            const f = info.entranceNotice.replace(/\n/g, '<br>');
            if (userNoticeBanner) { document.getElementById("userEntranceNoticeText").innerHTML = f; userNoticeBanner.style.display = "block"; }
            if (userNoticeBannerHome) { document.getElementById("userEntranceNoticeTextHome").innerHTML = f; userNoticeBannerHome.style.display = "block"; }
            if (document.getElementById("masterEntranceNotice")) document.getElementById("masterEntranceNotice").value = info.entranceNotice;
        } else {
            if (userNoticeBanner) userNoticeBanner.style.display = "none";
            if (userNoticeBannerHome) userNoticeBannerHome.style.display = "none";
            if (document.getElementById("masterEntranceNotice")) document.getElementById("masterEntranceNotice").value = "";
        }
    } else {
        document.getElementById('payment-details-box').style.display = 'none';
        document.getElementById('admin-mailto-link').style.display = 'none';
        document.getElementById('btn-electric-link').style.display = 'none';
        document.getElementById('btn-subscription-link').style.display = 'none';
    }

    if (result && !result.error && Array.isArray(result)) {
        apartmentList = result;
        if (configResult && configResult.info && configResult.info.entranceName) {
            document.getElementById('entrance-title').textContent = configResult.info.entranceName;
        } else {
            document.getElementById('entrance-title').textContent = `Етажна собственост - ID ${currentRouteKey}`;
        }
        document.getElementById('view-selector').classList.remove('active');
        document.getElementById('view-selector').classList.add('hidden');
        document.getElementById('view-entrance-home').classList.remove('hidden');
        document.getElementById('view-entrance-home').classList.add('active');
        const select = document.getElementById("apartmentSelect");
        select.innerHTML = '<option value="">Избери апартамент</option>';
        apartmentList.forEach(a => { select.appendChild(new Option(a, a)); });
        const targetHash = "#" + encodeURIComponent(currentRouteKey);
        if (window.location.hash !== targetHash && !window.location.hash.includes("/")) { window.location.hash = targetHash; }
        loadDashboardData();
        return true;
    } else {
        showToast(`Грешен вход: ${currentRouteKey} не е намерен в базата.`, "error");
        btn.textContent = originalText;
        btn.disabled = false;
        return false;
    }
}

window.submitPayment = async function () {
    const apt = document.getElementById("adminApt").value;
    const period = document.getElementById("adminPeriod").value.trim();
    const amount = document.getElementById("adminAmount").value.trim();
    if (!apt || !period || !amount) { showToast("Попълнете всички полета за плащане!", "error"); return; }
    const btn = document.getElementById("payBtn");
    showSaving(btn, "Записване...");
    const result = await apiCall('addPayment', { pin: getStoredPin(), apartment: apt, period: period, amount: amount });
    hideSaving(btn, "Добави плащане");
    if (result && result.success) { showToast("✅ Успешно добавено плащане.", "success"); document.getElementById("adminAmount").value = ""; refreshCurrentView(); }
    else showToast(result?.error || "Възникна грешка", "error");
}

window.loadBookData = async function () {
    const apt = document.getElementById("masterBookApt").value;
    if (!apt) return;
    const fields = ["Owner", "Email", "Occupants", "EntryDate", "Pets", "Purpose"];
    fields.forEach(f => { const el = document.getElementById("book-" + f); if (el) el.value = ""; });
    try {
        const result = await apiCall('getBookData', { apartment: apt });
        if (result && result.success && result.data) {
            const d = result.data;
            if (d["Собственик"]) document.getElementById("book-Owner").value = d["Собственик"];
            if (d["Имейл"]) document.getElementById("book-Email").value = d["Имейл"];
            if (d["Обитатели"]) document.getElementById("book-Occupants").value = d["Обитатели"];
            if (d["Домашни любимци"]) document.getElementById("book-Pets").value = d["Домашни любимци"];
            if (d["Предназначение"]) document.getElementById("book-Purpose").value = d["Предназначение"];
            if (d["Дата вписване"]) {
                try {
                    const date = new Date(d["Дата вписване"]);
                    if (!isNaN(date.getTime())) document.getElementById("book-EntryDate").value = date.toISOString().split('T')[0];
                } catch (e) { }
            }
        }
    } catch (e) { showToast("Грешка при зареждане на данните", "error"); }
}

window.submitBookData = async function () {
    const apt = document.getElementById("masterBookApt").value;
    if (!apt) { showToast("Моля, изберете апартамент!", "error"); return; }
    const mapping = [ { id: "book-Owner", key: "Собственик" }, { id: "book-Email", key: "Имейл" }, { id: "book-Occupants", key: "Обитатели" }, { id: "book-EntryDate", key: "Дата вписване" }, { id: "book-Pets", key: "Домашни любимци" }, { id: "book-Purpose", key: "Предназначение" } ];
    const updates = {};
    mapping.forEach(item => { const el = document.getElementById(item.id); if (el) updates[item.key] = el.value; });
    const btn = document.getElementById('book-save-btn');
    showSaving(btn, "Записване...");
    try {
        const result = await apiCall('updateBookData', { pin: getStoredPin(), apartment: apt, updates: JSON.stringify(updates) });
        if (result && result.success) showToast("✅ Книгата на ЕС е успешно обновена за " + apt, "success");
        else showToast(result?.error || "Грешка при запис", "error");
    } catch (e) { showToast("Възникна грешка при записа", "error"); }
    finally { hideSaving(btn, "Запиши Промените"); }
}

window.submitCharges = async function () {
    const period = document.getElementById("chargesPeriod").value.trim();
    const elev = document.getElementById("chargesElevator").value.trim(), sub = document.getElementById("chargesSubscription").value.trim(), light = document.getElementById("chargesLight").value.trim(), security = document.getElementById("chargesSecurity").value.trim(), cleaning = document.getElementById("chargesCleaning").value.trim(), podrajka = document.getElementById("chargesPodrajka").value.trim(), remont = document.getElementById("chargesRemont").value.trim();
    if (!period) { showToast("Периодът е задължителен!", "error"); return; }
    const btn = document.getElementById("chargesBtn");
    showSaving(btn, "Записване...");
    const result = await apiCall('addCharges', { pin: getStoredPin(), period: period, elevator: elev, subscription: sub, light: light, security: security, cleaning: cleaning, podrajka: podrajka, remont: remont });
    hideSaving(btn, "Запиши начисления");
    if (result && result.success) {
        showToast("✅ Успешно записани начисления.", "success");
        ["chargesElevator", "chargesSubscription", "chargesLight", "chargesSecurity", "chargesCleaning", "chargesPodrajka", "chargesRemont"].forEach(id => document.getElementById(id).value = "");
        refreshCurrentView();
    } else showToast(result?.error || "Възникна грешка", "error");
}

window.loadCurrentEmail = async function () {
    const apt = document.getElementById("adminEmailApt").value;
    if (!apt) { document.getElementById("currentEmailBox").style.display = "none"; return; }
    const result = await apiCall('getEmail', { apartment: apt });
    if (result && typeof result.email !== 'undefined') {
        document.getElementById("currentEmail").textContent = result.email ? result.email : "Няма записан";
        document.getElementById("currentEmailBox").style.display = "block";
    }
}

window.submitEmail = async function () {
    const apt = document.getElementById("adminEmailApt").value, email = document.getElementById("adminEmail").value.trim();
    if (!apt || !email) { showToast("Изберете апартамент и имейл!", "error"); return; }
    const btn = document.getElementById("emailBtn");
    btn.textContent = "Записване...";
    const result = await apiCall('addEmail', { pin: getStoredPin(), apartment: apt, email: email });
    btn.textContent = "Запази имейл";
    if (result && result.success) { showToast("Имейлът е обновен.", "success"); document.getElementById("adminEmail").value = ""; loadCurrentEmail(); }
    else showToast(result?.error || "Възникна грешка", "error");
}

window.switchMasterTab = function (tab, btn) {
    document.querySelectorAll(".master-panel").forEach(p => p.style.display = "none");
    document.querySelectorAll(".master-tab").forEach(b => { b.classList.remove("active"); b.style.background = ""; b.style.color = ""; b.style.borderColor = ""; });
    const pane = document.getElementById("master-tab-" + tab);
    if (pane) pane.style.display = "block";
    btn.classList.add("active");
    if (tab === 'zues') { btn.style.background = "var(--primary)"; btn.style.color = "white"; btn.style.borderColor = "var(--primary)"; switchZuesSubTab('z-book'); }
}

window.submitMaster = async function (sheetName) {
    let val, fromP, toP = "12.2050", apt;
    if (sheetName === 'Логика') { val = document.getElementById('masterLogikaVal').value; fromP = document.getElementById('masterLogikaFrom').value.trim(); apt = ""; }
    else if (sheetName === 'УЧАСТИЕ_АСАНСЬОР') { apt = document.getElementById('masterUchApt').value; val = document.getElementById('masterUchVal').value; fromP = document.getElementById('masterUchFrom').value.trim(); }
    else if (sheetName === 'ОБИТАТЕЛИ') {
        apt = document.getElementById('masterObApt').value; val = document.getElementById('masterObVal').value; fromP = document.getElementById('masterObFrom').value.trim();
        if (val !== "" && parseInt(val) < 1) { showToast("⚠️ Минималният брой е 1.", "error"); return; }
    }
    else if (sheetName === 'ЧИПОВЕ') { apt = document.getElementById('masterChApt').value; val = document.getElementById('masterChVal').value; fromP = document.getElementById('masterChFrom').value.trim(); }
    else if (sheetName === 'ИДЕАЛНИ_ЧАСТИ') { apt = document.getElementById('masterIdApt').value; val = document.getElementById('masterIdVal').value; fromP = document.getElementById('masterIdFrom').value.trim(); }
    else if (sheetName === 'PAYMENT_INFO') {
        const pText = document.getElementById('masterPaymentText').value.trim(), lElectric = document.getElementById('masterLinkElectric').value.trim(), lSub = document.getElementById('masterLinkSubscription').value.trim();
        if (!pText && !lElectric && !lSub) { showToast("Моля, попълнете поне едно поле!", "error"); return; }
        val = JSON.stringify({ paymentInfo: pText, linkElectric: lElectric, linkSubscription: lSub }); fromP = "01.2000"; apt = "global";
    }
    if (sheetName !== 'PAYMENT_INFO' && (!val || !fromP || (sheetName !== 'Логика' && !apt))) { showToast("Моля, попълнете задължителните полета!", "error"); return; }
    const activeTabObj = document.querySelector(`.master-panel[style*="display: block"] button`);
    const originalText = activeTabObj ? activeTabObj.textContent : "Запиши";
    if (activeTabObj) { activeTabObj.disabled = true; activeTabObj.textContent = "Записване..."; }
    try {
        const result = await apiCall('updateMaster', { pin: getStoredPin(), sheet: sheetName, value: val, apartment: apt, fromPeriod: fromP, toPeriod: toP });
        if (result && result.success) {
            showToast(`Успешно обновен регистър: ${sheetName}`, "success");
            if (sheetName === 'ОБИТАТЕЛИ') document.getElementById('masterObVal').value = "";
            if (sheetName === 'ЧИПОВЕ') document.getElementById('masterChVal').value = "";
            refreshCurrentView();
        } else showToast(result?.error || "Възникна грешка", "error");
    } catch (e) { showToast("Сървърна грешка при запис", "error"); }
    finally { if (activeTabObj) { activeTabObj.disabled = false; activeTabObj.textContent = originalText; } }
}

window.loadApartmentMasterSummary = async function () {
    const apt = document.getElementById("masterInfoApt").value, container = document.getElementById("aptMasterSummary");
    if (!apt) { container.innerHTML = '<p style="color:#666; font-style:italic;">Изберете апартамент...</p>'; return; }
    container.innerHTML = "⌛ Зареждане на информация...";
    try {
        const res = await apiCall('getApartmentMasterSummary', { apartment: apt, pin: getStoredPin() });
        if (res && res.success) {
            const d = res.data;
            container.innerHTML = `<div style="background:rgba(0,122,255,0.05); padding:15px; border-radius:8px; border-left:4px solid var(--primary);"><h4 style="margin-bottom:10px;">📊 Статус за Апт. ${apt}</h4><ul style="list-style:none; padding:0;"><li><b>👥 Обитатели:</b> ${d.occupants || 0} бр.</li><li><b>🔑 Чипове:</b> ${d.chips || 0} бр.</li><li><b>🚠 Уч. асансьор:</b> ${d.participation === 'Да' ? '✅ Да' : '❌ Не'}</li><li><b>📐 Идеални части:</b> ${d.idealParts || 0}%</li></ul><p style="font-size:11px; color:#666; margin-top:10px;">* Посочените данни са от текущия MASTER регистър и се използват за следващите начисления.</p></div>`;
            const editor = document.getElementById("aptNoticeEditor"), input = document.getElementById("masterAptNoticeVal");
            if (editor && input) { editor.style.display = "block"; input.value = d.notice || ""; }
        } else { container.innerHTML = '<p style="color:red;">Грешка при зареждане на данните.</p>'; if (document.getElementById("aptNoticeEditor")) document.getElementById("aptNoticeEditor").style.display = "none"; }
    } catch (e) { container.innerHTML = '<p style="color:red;">Сървърна грешка.</p>'; if (document.getElementById("aptNoticeEditor")) document.getElementById("aptNoticeEditor").style.display = "none"; }
}

window.submitAptNotice = async function () {
    const apt = document.getElementById("masterInfoApt").value, notice = document.getElementById("masterAptNoticeVal").value.trim();
    if (!apt) return;
    showLoading();
    const result = await apiCall('updateMaster', { pin: getStoredPin(), sheet: 'PAYMENT_INFO', apartment: apt, value: JSON.stringify({ ['notice_' + normalizeAptName(apt)]: notice }) });
    hideLoading();
    if (result && result.success) { showToast("Персоналното съобщение е запазено!", "success"); refreshCurrentView(); }
    else showToast(result?.error || "Грешка при запис", "error");
}

window.submitMasterNotice = async function () {
    const notice = document.getElementById("masterEntranceNotice").value.trim();
    showLoading();
    const result = await apiCall('updateMaster', { pin: getStoredPin(), sheet: 'PAYMENT_INFO', apartment: 'global_notice', value: notice });
    hideLoading();
    if (result && result.success) { showToast("Съобщението на входа е обновено!", "success"); refreshCurrentView(); }
    else showToast(result?.error || "Грешка при запис", "error");
}

// ==============================================
// SUPER ADMIN LOGIC 
// ==============================================

window.openSuperAdmin = function () {
    document.getElementById("superAdminOverlay").style.display = "flex";
    if (sessionStorage.getItem("superAdminAuth")) showSuperAdminDashboard();
    else { document.getElementById("superAdminLoginCard").style.display = "block"; document.getElementById("superAdminDashboard").style.display = "none"; document.getElementById("superPinInput").value = ""; document.getElementById("superPinInput").focus(); }
}

window.closeSuperAdmin = () => document.getElementById("superAdminOverlay").style.display = "none";

window.loginSuperAdmin = async function () {
    const pin = document.getElementById("superPinInput").value.trim();
    if (!pin) { document.getElementById("superPinError").textContent = "Въведете парола!"; return; }
    const result = await apiCall('verifySuperPin', { pin: pin });
    if (result && result.success) { sessionStorage.setItem("superAdminAuth", pin); showSuperAdminDashboard(); }
    else document.getElementById("superPinError").textContent = result.error || "Грешна парола за Супер Админ.";
}

async function showSuperAdminDashboard() {
    document.getElementById("superAdminLoginCard").style.display = "none";
    document.getElementById("superAdminDashboard").style.display = "block";
    try {
        const res = await apiCall('getSuperSettings');
        if (res && res.success) {
            const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ""; };
            setVal("superPaymentOptions", res.paymentOptions);
            setVal("priceBigCities", res.priceBigCities);
            setVal("priceOtherCities", res.priceOtherCities);
            setVal("priceLifetime", res.priceLifetime);
            setVal("superGlobalMessage", res.globalMessage);
            setVal("superShowRegForm", res.showRegForm || "true");
            setVal("superRegFormText", res.regFormText);
        }
    } catch (e) { console.error("Error loading super settings:", e); }
    loadSuperAdminEntrances();
    loadSuperExceptions();
}

window.saveSuperSettings = async function () {
    const btn = document.getElementById("saveSuperSettingsBtn");
    showSaving(btn, "Запазване...");
    try {
        const getVal = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ""; };
        const reqData = { paymentOptions: getVal("superPaymentOptions"), priceBigCities: getVal("priceBigCities"), priceOtherCities: getVal("priceOtherCities"), priceLifetime: getVal("priceLifetime"), showRegForm: document.getElementById("superShowRegForm").value === "true", regFormText: getVal("regFormText") };
        const result = await apiCall('updateSuperSettings', { pin: sessionStorage.getItem("superAdminAuth"), settings: JSON.stringify(reqData) });
        if (result && result.success) showToast("✅ Настройките са запазени успешно!", "success");
        else showToast(result.error || "Грешка при запазване", "error");
    } catch (e) { showToast("Възникна грешка при запазване", "error"); }
    finally { hideSaving(btn, "Запази настройките"); }
}

window.saveGlobalMessage = async function () {
    const btn = document.getElementById("saveGlobalMessageBtn"), msg = document.getElementById("superGlobalMessage").value.trim();
    showSaving(btn, "Изпращане...");
    try {
        const result = await apiCall('updateGlobalMessage', { pin: sessionStorage.getItem("superAdminAuth"), message: msg });
        if (result && result.success) showToast("✅ Съобщението е изпратено до всички!", "success");
        else showToast(result.error || "Грешка при изпращане", "error");
    } catch (e) { showToast("Проблем при комуникация със сървъра", "error"); }
    finally { hideSaving(btn, "Изпрати съобщение"); }
}

async function loadSuperAdminEntrances() {
    const tbody = document.getElementById("superAdminEntrancesList");
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Зареждане...</td></tr>';
    const result = await apiCall('getRegistryList');
    if (result && result.success && Array.isArray(result.registry)) {
        tbody.innerHTML = '';
        const select = document.getElementById("superExceptionRegistry");
        if (select) select.innerHTML = '<option value="">-- Избери вход --</option>';
        result.registry.forEach(ent => {
            if (select) select.appendChild(new Option(ent.name + " (" + ent.id + ")", ent.id));
            const tr = document.createElement("tr");
            let sHtml = '', dCol = 'inherit', today = new Date().toISOString().split('T')[0];
            if (ent.validUntil === '2000-01-01') { sHtml = '<span class="status-badge status-blocked">Спрян</span>'; dCol = 'var(--danger)'; }
            else if (ent.validUntil === '2099-12-31') { sHtml = '<span class="status-badge status-lifetime">Безсрочен</span>'; dCol = 'var(--primary)'; }
            else if (ent.validUntil < today) { sHtml = '<span class="status-badge status-expired">Изтекъл</span>'; dCol = 'var(--warning)'; }
            else { sHtml = '<span class="status-badge status-active">Активен</span>'; dCol = 'var(--secondary)'; }
            tr.innerHTML = `<td style="padding:10px 8px;"><b>${ent.name}</b></td><td style="padding:10px 8px; font-family: monospace;">${ent.id}</td><td style="padding:10px 8px; color: ${dCol}; font-weight: 600;">${(ent.validUntil === '2099-12-31' || ent.validUntil === 'Без лимит') ? '&infin;' : ent.validUntil}</td><td style="padding:10px 8px;">${sHtml}</td><td style="padding:10px 8px;"><button onclick="manageSub('${ent.id}', 'unblock')" class="btn green" style="padding:5px 10px; font-size:10px; margin-right:4px;">+30д</button><button onclick="manageSub('${ent.id}', 'block')" style="padding:5px 10px; font-size:10px; margin-right:4px; background:#fde8e8; color:#d32f2f; border:1px solid #f99;">Спри</button><button onclick="manageSub('${ent.id}', 'lifetime')" class="btn blue" style="padding:5px 10px; font-size:10px;">&infin; Безср.</button></td>`;
            tbody.appendChild(tr);
        });
    } else tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Грешка при зареждане.</td></tr>';
}

window.manageSub = async function (id, action) {
    if (!confirm(`Сигурни ли сте, че искате да промените достъпа на ID: ${id}?`)) return;
    const res = await apiCall('updateSubscription', { superPin: sessionStorage.getItem("superAdminAuth"), targetId: id, subAction: action });
    if (res && res.success) { showToast("Правата са обновени успешно!", "success"); loadSuperAdminEntrances(); }
    else showToast(res?.error || "Грешка при обновяване", "error");
}

window.submitNewClient = async function () {
    const c = document.getElementById("newCity").value.trim(), b = document.getElementById("newBlock").value.trim(), e = document.getElementById("newEntrance").value.trim(), m = document.getElementById("newAdminEmail").value.trim(), a = document.getElementById("newAptCount").value.trim();
    if (!c || !b || !e || !m || !a) { showToast("Моля, попълнете всички полета", "error"); return; }
    const btn = document.getElementById("createClientBtn");
    btn.textContent = "Генериране (Изчакайте до 15 сек)...";
    const res = await apiCall('createClient', { superPin: sessionStorage.getItem("superAdminAuth"), city: c, block: b, entrance: e, adminEmail: m, apartmentsCount: a });
    btn.textContent = "Създай Клиент & Генерирай Таблици";
    if (res && res.success) { showToast("✅ Клиентът е създаден успешно!", "success"); setTimeout(() => location.reload(), 3000); }
    else showToast(res?.error || "Грешка при създаване", "error");
}

window.runSystemBackup = async function () {
    const btn = document.getElementById("runBackupBtn"), statusDiv = document.getElementById("backupStatus");
    btn.disabled = true; btn.textContent = "Архивиране...";
    statusDiv.style.display = "block"; statusDiv.innerHTML = "⏳ Обикаляне на всички входове...";
    const res = await apiCall('runBackup', { superPin: sessionStorage.getItem("superAdminAuth") });
    btn.disabled = false; btn.textContent = "📦 Създай Ръчен Архив";
    if (res && res.success) { statusDiv.innerHTML = "✅ " + res.message; if (res.folderUrl) statusDiv.innerHTML += `<br><a href="${res.folderUrl}" target="_blank">Виж новия архив тук ➔</a>`; }
    else statusDiv.innerHTML = "❌ Грешка: " + (res?.error || "Неизвестна грешка");
}

async function loadSuperExceptions() {
    const list = document.getElementById("superAdminExceptionsList");
    if (!list) return;
    list.innerHTML = '<tr><td colspan="5" style="text-align:center;">Зареждане...</td></tr>';
    const result = await apiCall('getSuperExceptions', { superPin: sessionStorage.getItem("superAdminAuth") });
    if (result && result.success && Array.isArray(result.exceptions)) {
        list.innerHTML = "";
        result.exceptions.forEach(ex => {
            const tr = document.createElement("tr");
            tr.innerHTML = `<td style="padding:6px;">${ex.targetId}</td><td style="padding:6px;">${ex.apartment === 'ALL' ? 'Всички' : ex.apartment}</td><td style="padding:6px;">${ex.price} EUR</td><td style="padding:6px;">${ex.validUntil}</td><td style="padding:6px;"><button onclick="deleteSuperException(${ex.rowIdx})">✕</button></td>`;
            list.appendChild(tr);
        });
    } else list.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:10px;">Няма активни изключения.</td></tr>';
}

window.addSuperException = async function () {
    const tid = document.getElementById("superExceptionRegistry").value, apt = document.getElementById("superExceptionApt").value.trim(), pr = document.getElementById("superExceptionPrice").value.trim(), v = document.getElementById("superExceptionDate").value;
    if (!tid || pr === "") { showToast("Изберете вход и ценова стойност!", "error"); return; }
    const res = await apiCall('addSuperException', { superPin: sessionStorage.getItem("superAdminAuth"), targetId: tid, apartment: apt || "ALL", price: pr, validUntil: v || "2099-12-31" });
    if (res && res.success) { showToast("Добавено!", "success"); loadSuperExceptions(); }
    else showToast(res?.error || "Грешка", "error");
}

window.deleteSuperException = async function (idx) {
    if (!confirm("Сигурни ли сте?")) return;
    const res = await apiCall('deleteSuperException', { superPin: sessionStorage.getItem("superAdminAuth"), rowIdx: idx });
    if (res && res.success) loadSuperExceptions();
    else showToast(res?.error || "Грешка", "error");
}

window.switchZuesSubTab = function (id) {
    document.querySelectorAll(".zues-sub-panel").forEach(p => p.style.display = "none");
    const t = document.getElementById("zub-" + id);
    if (t) t.style.display = "block";
    if (id === 'z-meeting') populateAttendanceTable();
    if (id === 'z-fullbook') loadFullBook();
}

let _fullBookData = [];
window.loadFullBook = async function () {
    const tbody = document.getElementById("fullBookBody");
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">⏳ Зареждане...</td></tr>';
    const res = await apiCall('getFullBook', { pin: getStoredPin() });
    if (res && res.success) { _fullBookData = res.rows || []; renderBookTable(_fullBookData); }
    else tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:red;">❌ Грешка</td></tr>';
}

function renderBookTable(rows) {
    const tbody = document.getElementById("fullBookBody");
    if (!rows || rows.length === 0) { tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">Няма данни.</td></tr>'; return; }
    tbody.innerHTML = rows.map((r, idx) => `
        <tr onclick="switchZuesSubTab('z-book'); document.getElementById('masterBookApt').value='${r["Апартамент"] || ""}'; loadBookData();" style="cursor:pointer; ${idx % 2 === 0 ? '' : 'background:#fafbfd;'}">
            <td>${r["Апартамент"] || "—"}</td><td>${r["Собственик"] || "—"}</td><td>${r["Имейл"] || "—"}</td><td>${r["Обитатели"] || "—"}</td><td>${r["Предназначение"] || "—"}</td><td>${r["Дата вписване"] || "—"}</td><td>${r["Домашни любимци"] || "—"}</td>
        </tr>`).join('');
}

window.printFullBook = function () {
    if (!_fullBookData || _fullBookData.length === 0) { showToast("Заредете книгата!", "error"); return; }
    let rows = _fullBookData.map(r => `<tr><td>${r["Апартамент"] || "—"}</td><td>${r["Собственик"] || "—"}</td><td>${r["Имейл"] || "—"}</td><td>${r["Обитатели"] || "—"}</td><td>${r["Предназначение"] || "—"}</td><td>${r["Дата вписване"] || "—"}</td><td>${r["Домашни любимци"] || "—"}</td></tr>`).join('');
    const h = `<html><head><title>Домова книга</title><style>table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ddd;padding:8px;}</style></head><body><h2>Домова книга</h2><table><thead><tr><th>Апт.</th><th>Собственик</th><th>Имейл</th><th>Обитатели</th><th>Предназнач.</th><th>Дата впис.</th><th>Домашни</th></tr></thead><tbody>${rows}</tbody></table><button onclick="window.print()">Печат</button></body></html>`;
    const w = window.open('', '_blank'); w.document.write(h); w.document.close();
}

window.populateAttendanceTable = async function () {
    const list = document.getElementById("meeting-attendance-list");
    list.innerHTML = '<tr><td colspan="3" style="text-align:center;">⏳ Зареждане...</td></tr>';
    try {
        const res = await apiCall('getBuildingIdealParts', { pin: getStoredPin() });
        _currentIdealParts = (res && res.success) ? res.parts : {};
        list.innerHTML = "";
        apartmentList.forEach(apt => {
            const tr = document.createElement("tr");
            const n = normalizeAptName(apt);
            const p = _currentIdealParts[n] !== undefined ? parseFloat(_currentIdealParts[n]) : 0;
            tr.innerHTML = `<td>${apt}</td><td style="text-align:center;"><input type="checkbox" class="quorum-check" data-apt="${apt}" data-percent="${p}" onchange="calculateQuorum()"></td><td style="text-align:right;">${p.toFixed(2)}%</td>`;
            list.appendChild(tr);
        });
        calculateQuorum();
    } catch (e) { list.innerHTML = '<tr><td colspan="3" style="text-align:center; color:red;">Грешка</td></tr>'; }
}

window.calculateQuorum = function () {
    let t = 0; document.querySelectorAll(".quorum-check:checked").forEach(c => { t += parseFloat(c.dataset.percent); });
    const p = document.getElementById("quorum-percent"), s = document.getElementById("quorum-status");
    if (p) p.innerText = t.toFixed(2) + "%";
    if (s) {
        if (t >= 67) { s.innerText = "✅ Има кворум"; s.style.color = "green"; }
        else if (t >= 51) { s.innerText = "🔶 Кворум за отложено събрание"; s.style.color = "orange"; }
        else { s.innerText = "❌ Няма кворум"; s.style.color = "red"; }
    }
}

window.generateMeetingMinutes = function () {
    const a = document.getElementById("meetingAgenda").value || "Генерален дневен ред", q = document.getElementById("quorum-percent").innerText;
    const h = `<html><head><title>Протокол</title></head><body><h2>ПРОТОКОЛ</h2><p>Дата: ${new Date().toLocaleDateString('bg-BG')}</p><p>Кворум: ${q}</p><p>Дневен ред: ${a}</p><hr><p>Ход на събранието: ...</p></body></html>`;
    const w = window.open('', '_blank'); w.document.write(h); w.document.close();
}

window.openMonthlyReport = function () {
    switchPage('monthly-report');
    const d = new Date(), p = String(d.getMonth()).padStart(2, '0') + "." + d.getFullYear();
    const el = document.getElementById("reportPeriodInput");
    if (el) el.value = p;
    const content = document.getElementById("report-content");
    if (content) content.style.display = "none";
}

window.generateReport = async function () {
    const p = document.getElementById("reportPeriodInput").value.trim();
    if (!p) { showToast("Моля, въведете период!", "error"); return; }
    const btn = document.querySelector("#view-monthly-report .btn-primary");
    showSaving(btn, "Зареждане...");
    try {
        const res = await apiCall('getMonthlyReport', { period: p });
        if (res && res.success && res.data) {
            const d = res.data;
            document.getElementById("report-title-period").textContent = `за месец ${p} г.`;
            document.getElementById("report-gen-date").textContent = new Date().toLocaleDateString('bg-BG');
            const b = document.getElementById("report-invoiced-rows");
            if (b) {
                b.innerHTML = "";
                const l = { elevator: "Асансьор", subscription: "Абонаменти", light: "Ток общи части", cleaning: "Почистване", podrajka: "Поддръжка", remont: "Фонд ремонт" };
                for (let k in l) {
                    const v = d.invoiced[k] || 0;
                    if (v > 0) { let tr = document.createElement("tr"); tr.innerHTML = `<td>${l[k]}</td><td style="text-align:right;">${v.toFixed(2)} EUR</td>`; b.appendChild(tr); }
                }
            }
            document.getElementById("report-total-invoiced").textContent = (d.invoiced.total || 0).toFixed(2) + " EUR";
            document.getElementById("report-total-collected").textContent = (d.collected || 0).toFixed(2) + " EUR";
            document.getElementById("report-content").style.display = "block";
        } else showToast(res?.error || "Няма данни за този период", "error");
    } catch (e) { showToast("Грешка при генериране", "error"); }
    finally { hideSaving(btn, "Покажи"); }
}

window.printReport = function () {
    const c = document.getElementById('report-print-area').innerHTML;
    const w = window.open('', '', 'height=800,width=800');
    w.document.write('<html><body>' + c + '</body></html>');
    w.document.close(); w.print();
}

window.switchPage = function (id) {
    ['view-selector', 'view-entrance-home', 'view-monthly-report'].forEach(pid => {
        const el = document.getElementById(pid);
        if (el) { el.classList.remove('active'); el.classList.add('hidden'); }
    });
    const a = document.getElementById('view-' + id) || document.getElementById(id);
    if (a) { a.classList.remove('hidden'); a.classList.add('active'); }
}

async function checkRemontEligibility() {
    try {
        const res = await apiCall('getBuildingIdealParts');
        const input = document.getElementById("chargesRemont"), warn = document.getElementById("remontWarning");
        let ok = false, miss = [];
        if (res && res.success && res.parts && typeof apartmentList !== 'undefined' && apartmentList.length > 0) {
            miss = apartmentList.filter(a => res.parts[a] === undefined || parseFloat(res.parts[a]) <= 0);
            ok = miss.length === 0;
        }
        if (input) { input.disabled = !ok; input.placeholder = ok ? "Обща сума за входа" : "Деактивирано (липсват Ид. части)"; }
        if (warn) { warn.style.display = ok ? "none" : "block"; if (!ok) warn.innerHTML = `⚠️ Липсват Ид. части за: ${miss.join(", ")}`; }
    } catch(e) {}
}
