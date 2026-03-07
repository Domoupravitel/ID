// ==============================================
// CONFIGURATION & GLOBAL STATE
// ==============================================

// Тук трябва да се постави линка от Google Apps Script, след като се разгърне (Deploy -> Web App)
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxdVCArTTKxTJ-_Kgrk8TmDocMTV5tKDT2ELDhSu78XLuVndrBP8dxtlTl06BkoOrMOvw/exec";

let currentRouteKey = "";
let apartmentList = [];

// ==============================================
// INITIALIZATION
// ==============================================

document.addEventListener('DOMContentLoaded', () => {
    // Възстановяване на запазени данни, ако има такива
    const savedEmail = localStorage.getItem("savedAdminEmail");
    const savedId = localStorage.getItem("savedAccessId");

    if (savedEmail) {
        document.getElementById("adminEmailInput").value = savedEmail;
    }
    if (savedId) {
        document.getElementById("access-id").value = savedId;
    }

    // Apartment Event Listener for the main view
    document.getElementById('apartmentSelect').addEventListener('change', (e) => {
        if (e.target.value) {
            loadApartmentData(e.target.value);
        } else {
            resetApartmentData();
        }
    });

    // Handle Enter key for admin login
    document.getElementById("pinInput").addEventListener('keydown', (e) => {
        if (e.key === 'Enter') verifyPin();
    });

    // Автоматично влизане, ако в URL-а има ?id=XXXXXX
    const urlParams = new URLSearchParams(window.location.search);
    const idParam = urlParams.get('id');
    if (idParam) {
        document.getElementById('access-id').value = idParam;
        enterEntrance();
    }
});

// ==============================================
// CORE API CALLER
// ==============================================

async function apiCall(action, params = {}) {
    showLoading();

    // Ако SCRIPT_URL не съдържа истински google script URL, връщаме грешка
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

// ==============================================
// UI HELPERS
// ==============================================

window.showLoading = function () {
    document.getElementById("loadingOverlay").classList.add("active");
}
window.hideLoading = function () {
    document.getElementById("loadingOverlay").classList.remove("active");
}

function resetApartmentData() {
    const sc = document.getElementById("saldoCard");
    sc.className = "card saldo-card saldo-zero";
    document.getElementById("saldo").textContent = "-";
    document.getElementById("tableBody").innerHTML = "";
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

// ==============================================
// ENTRANCE NAVIGATION
// ==============================================

window.enterEntrance = async function () {
    const accessId = document.getElementById('access-id').value.trim();

    if (!accessId) {
        showToast("Моля, въведете вашето ID за достъп!", "error");
        return;
    }

    // Запазваме в браузъра (localStorage), за не затрудняваме домоуправителя следващия път
    localStorage.setItem("savedAccessId", accessId);

    // Задаваме го като текущ ключ за API заявките
    currentRouteKey = accessId;

    // Сменяме бутона за индикация
    const btn = document.querySelector("#view-selector .btn-primary");
    const originalText = btn.textContent;
    btn.textContent = "Зареждане...";
    btn.disabled = true;

    // Зареждаме списъка с апартаменти
    const result = await apiCall('list', { list: 'apartments' });

    // Зареждаме и конфигурацията за входа (Плащане и т.н.)
    const configResult = await apiCall('getEntranceInfo');

    if (configResult && configResult.info && configResult.info.isHardBlocked) {
        showToast(`⚠️ Достъпът е напълно спрян поради над 3 месеца неплатен абонамент. (При превод задължително посочете ID: ${currentRouteKey})`, "error");
        btn.textContent = originalText;
        btn.disabled = false;
        return; // PREVENT ENTRY
    }

    if (configResult && configResult.info) {
        // Запазваме цените в сесията, за да ги ползваме в Админ панела
        if (configResult.info.pricePerApt !== undefined) {
            sessionStorage.setItem("pricePerApt_" + currentRouteKey, configResult.info.pricePerApt);
            sessionStorage.setItem("lifetimePrice_" + currentRouteKey, configResult.info.lifetimePrice);
            sessionStorage.setItem("currency_" + currentRouteKey, configResult.info.currency);
        }

        if (configResult.info.paymentInfo) {
            document.getElementById('payment-instructions').textContent = configResult.info.paymentInfo;
            document.getElementById('payment-details-box').style.display = 'block';
            document.getElementById('masterPaymentText').value = configResult.info.paymentInfo;
        } else {
            document.getElementById('payment-details-box').style.display = 'none';
        }

        // Зареждаме имейла на домоуправителя за контакт
        if (configResult.info.adminContactEmail) {
            document.getElementById('admin-mailto-link').href = `mailto:${configResult.info.adminContactEmail}`;
            document.getElementById('admin-mailto-link').style.display = 'inline-block';
            document.getElementById('masterAdminContactEmail').value = configResult.info.adminContactEmail;
        } else {
            document.getElementById('admin-mailto-link').style.display = 'none';
        }
    } else {
        document.getElementById('admin-mailto-link').style.display = 'none';
    }

    // Зареждаме външните линкове за фактури
    if (configResult.info.linkElectric) {
        document.getElementById('btn-electric-link').href = configResult.info.linkElectric;
        document.getElementById('btn-electric-link').style.display = 'inline-block';
        document.getElementById('masterLinkElectric').value = configResult.info.linkElectric;
    } else {
        document.getElementById('btn-electric-link').style.display = 'none';
    }

    if (configResult.info.linkSubscription) {
        document.getElementById('btn-subscription-link').href = configResult.info.linkSubscription;
        document.getElementById('btn-subscription-link').style.display = 'inline-block';
        document.getElementById('masterLinkSubscription').value = configResult.info.linkSubscription;
    } else {
        document.getElementById('btn-subscription-link').style.display = 'none';
    }
} else {

    // Възстановяваме бутона
    btn.textContent = originalText;
    btn.disabled = false;

    if (result && !result.error && Array.isArray(result)) {
        apartmentList = result;

        // Обновяваме заглавието на входа, ако е върнато от getEntranceInfo
        if (configResult && configResult.info && configResult.info.entranceName) {
            document.getElementById('entrance-title').textContent = configResult.info.entranceName;
        } else {
            document.getElementById('entrance-title').textContent = `Етажна собственост - ID ${currentRouteKey}`;
        }
        // Change View
        document.getElementById('view-selector').classList.remove('active');
        document.getElementById('view-selector').classList.add('hidden');
        document.getElementById('view-entrance-home').classList.remove('hidden');
        document.getElementById('view-entrance-home').classList.add('active');

        // Populate dropdown
        const select = document.getElementById("apartmentSelect");
        select.innerHTML = '<option value="">Избери апартамент</option>';
        apartmentList.forEach(a => {
            const opt = document.createElement("option");
            opt.value = opt.textContent = a;
            select.appendChild(opt);
        });

        // Зареждаме данните за дашборда на входа
        loadDashboardData();
    } else {
        const errStr = result && result.error ? result.error.toString() : "";
        if (errStr.includes("fetch") || errStr.includes("NetworkError")) {
            showToast("Грешка при връзка (Failed to fetch). Обновете SCRIPT_URL в app.js и проверете интернет връзката си.", "error");
        } else {
            showToast(`Грешен вход: ${currentRouteKey} не е намерен в базата.`, "error");
        }
        console.error(result);
    }
}

// Check URL params on load
document.addEventListener('DOMContentLoaded', () => {
    // Check for standard URL param ?id=123456...
    const urlParams = new URLSearchParams(window.location.search);
    let idParam = urlParams.get('id');

    // Check for hash #123456...
    if (!idParam && window.location.hash) {
        idParam = window.location.hash.replace('#', '').replace('/', '');
    }

    if (idParam) {
        document.getElementById('access-id').value = idParam;
        enterEntrance();
    }
});

async function loadDashboardData() {
    const result = await apiCall('getDashboardData');
    if (result && result.success && result.dashboard) {
        const d = result.dashboard;
        const cur = sessionStorage.getItem("currency_" + currentRouteKey) || "EUR";

        document.getElementById('dash-debts').textContent = `${d.totalDebts} ${cur}`;
        document.getElementById('dash-balance').textContent = `${d.totalBalance} ${cur}`;

        // Trends (просто визуални за момента)
        document.getElementById('dash-debts-trend').textContent = d.totalDebts > 0 ? "Изисква се заплащане" : "Всичко е изплатено";
        document.getElementById('dash-balance-trend').textContent = d.totalBalance > 0 ? "Наличен бюджет" : "Очаква събиране";

        const tbody = document.getElementById('dash-recent-payments');
        if (d.recentPayments && d.recentPayments.length > 0) {
            tbody.innerHTML = '';
            d.recentPayments.forEach(p => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${p.date}</td>
                    <td>${p.apartment}</td>
                    <td class="amount positive">+${p.amount.toFixed(2)} ${cur}</td>
                    <td><span class="badge success">Платено</span></td>
                `;
                tbody.appendChild(tr);
            });
        }
    }
}

// ==============================================
// APARTMENT DATA
// ==============================================

async function loadApartmentData(apartment) {
    resetApartmentData();
    const result = await apiCall('apartment', { apartment: apartment });

    if (result && result.error && result.showMessage) {
        document.getElementById("saldo").textContent = "Скрит";
        showToast("Информацията за салдото Ви, не се показва поради неплатен абонамент", "error");
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

        const tBody = document.getElementById("tableBody");
        if (result.periods && Array.isArray(result.periods)) {
            result.periods.forEach((r, idx) => {
                const tr = document.createElement("tr");
                tr.style.opacity = '0';
                tr.style.animation = `fadeIn 0.35s ease forwards ${idx * 0.05}s`;

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
        }
    } else {
        showToast("Грешка при зареждане на данните", "error");
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
        err.textContent = "Моля, въведете имейл и парола.";
        return;
    }

    const result = await apiCall('verifyPin', { pin: pin });

    if (result && result.success) {
        sessionStorage.setItem("adminAuth_" + currentRouteKey, pin);
        localStorage.setItem("savedAdminEmail", email);
        err.textContent = "";
        showAdminContent();
    } else {
        err.textContent = result?.error || "Грешен PIN код.";
    }
}

function showAdminContent() {
    document.getElementById("loginCard").style.display = "none";
    document.getElementById("adminCard").style.display = "block";

    const subCodeEl = document.getElementById("subscriptionCodeDisplay");
    if (subCodeEl) {
        subCodeEl.textContent = currentRouteKey;
    }

    // Попълваме цените, ако ги имаме запазени
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
    autoFillCurrentPeriod();
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
        if (el && !el.value) el.value = currentPeriod;
    });
}

function populateAdminDropdowns() {
    ["adminApt", "adminEmailApt", "masterUchApt", "masterObApt", "masterChApt", "masterIdApt"].forEach(id => {
        const sel = document.getElementById(id);
        if (sel && sel.options.length <= 1) {
            sel.innerHTML = '<option value="">Избери апартамент</option>';
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
        showToast("Попълнете всички полета за плащане!", "error");
        return;
    }

    const btn = document.getElementById("payBtn");
    btn.textContent = "Записване...";

    const result = await apiCall('addPayment', {
        pin: getStoredPin(),
        apartment: apt,
        period: period,
        amount: amount
    });

    btn.textContent = "Добави плащане";

    if (result && result.success) {
        showToast("Успешно добавено плащане.", "success");
        document.getElementById("adminAmount").value = "";
    } else {
        showToast(result?.error || "Възникна грешка", "error");
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
        showToast("Периодът е задължителен!", "error");
        return;
    }

    const btn = document.getElementById("chargesBtn");
    btn.textContent = "Записване...";

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

    btn.textContent = "Запиши начисления";

    if (result && result.success) {
        showToast("Успешно записани начисления.", "success");
        document.getElementById("chargesElevator").value = "";
        document.getElementById("chargesSubscription").value = "";
        document.getElementById("chargesLight").value = "";
        document.getElementById("chargesSecurity").value = "";
        document.getElementById("chargesCleaning").value = "";
        document.getElementById("chargesPodrajka").value = "";
        document.getElementById("chargesRemont").value = "";
    } else {
        showToast(result?.error || "Възникна грешка", "error");
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
        span.textContent = result.email ? result.email : "Няма записан";
        document.getElementById("currentEmailBox").style.display = "block";
    }
}

window.submitEmail = async function () {
    const apt = document.getElementById("adminEmailApt").value;
    const email = document.getElementById("adminEmail").value.trim();

    if (!apt || !email) {
        showToast("Изберете апартамент и имейл!", "error");
        return;
    }

    const btn = document.getElementById("emailBtn");
    btn.textContent = "Записване...";

    const result = await apiCall('addEmail', {
        pin: getStoredPin(),
        apartment: apt,
        email: email
    });

    btn.textContent = "Запази имейл";

    if (result && result.success) {
        showToast("Имейлът е обновен.", "success");
        document.getElementById("adminEmail").value = "";
        loadCurrentEmail(); // Refresh current email display
    } else {
        showToast(result?.error || "Възникна грешка", "error");
    }
}

window.switchMasterTab = function (tab, btn) {
    document.querySelectorAll(".master-panel").forEach(p => p.style.display = "none");
    document.querySelectorAll(".master-tab").forEach(b => b.classList.remove("active"));
    document.getElementById("master-tab-" + tab).style.display = "block";
    btn.classList.add("active");
}

window.submitMaster = async function (sheetName) {
    // В зависимост от подаденото име (Логика, и т.н.) събираме стойностите
    let val, fromP, toP, apt;

    if (sheetName === 'Логика') {
        val = document.getElementById('masterLogikaVal').value;
        fromP = document.getElementById('masterLogikaFrom').value.trim();
        toP = document.getElementById('masterLogikaTo').value.trim();
        apt = "";
    } else if (sheetName === 'УЧАСТИЕ') {
        apt = document.getElementById('masterUchApt').value;
        val = document.getElementById('masterUchVal').value;
        fromP = document.getElementById('masterUchFrom').value.trim();
        toP = document.getElementById('masterUchTo').value.trim();
    } else if (sheetName === 'ОСВЕТЛЕНИЕ_УЧАСТИЕ') {
        apt = document.getElementById('masterOsvApt').value;
        val = document.getElementById('masterOsvVal').value;
        fromP = document.getElementById('masterOsvFrom').value.trim();
        toP = document.getElementById('masterOsvTo').value.trim();
    } else if (sheetName === 'ОБИТАТЕЛИ') {
        apt = document.getElementById('masterObApt').value;
        val = document.getElementById('masterObVal').value;
        fromP = document.getElementById('masterObFrom').value.trim();
        toP = document.getElementById('masterObTo').value.trim();
    } else if (sheetName === 'ЧИПОВЕ') {
        apt = document.getElementById('masterChApt').value;
        val = document.getElementById('masterChVal').value;
        fromP = document.getElementById('masterChFrom').value.trim();
        toP = document.getElementById('masterChTo').value.trim();
    }

    if (sheetName === 'PAYMENT_INFO') {
        const pText = document.getElementById('masterPaymentText').value.trim();
        const aEmail = document.getElementById('masterAdminContactEmail').value.trim();
        const lElectric = document.getElementById('masterLinkElectric').value.trim();
        const lSub = document.getElementById('masterLinkSubscription').value.trim();

        if (!pText && !aEmail && !lElectric && !lSub) {
            showToast("Моля, попълнете поне едно поле!", "error");
            return;
        }

        // Пращаме го като обект, бекендът ще го разпознае
        val = JSON.stringify({
            paymentInfo: pText,
            adminContactEmail: aEmail,
            linkElectric: lElectric,
            linkSubscription: lSub
        });

        fromP = "01.2000";
        apt = "global";
    }

    if (sheetName !== 'PAYMENT_INFO' && (!val || !fromP || (sheetName !== 'Логика' && !apt))) {
        showToast("Моля, попълнете задължителните полета!", "error");
        return;
    }

    // Изчистваме и намираме активния бутон, за да му сложим Loading State
    const activeTabObj = document.querySelector(`.master-panel[style*="display: block"] button`);
    if (activeTabObj) activeTabObj.textContent = "Записване...";

    const result = await apiCall('updateMaster', {
        pin: getStoredPin(),
        sheet: sheetName,
        value: val,
        apartment: apt,
        fromPeriod: fromP,
        toPeriod: toP
    });

    if (activeTabObj) activeTabObj.textContent = "Запиши";

    if (result && result.success) {
        showToast(`Успешно обновен регистър: ${sheetName}`, "success");
        // Clear value inputs based on sheet
        if (sheetName === 'ОБИТАТЕЛИ') document.getElementById('masterObVal').value = "";
        if (sheetName === 'ЧИПОВЕ') document.getElementById('masterChVal').value = "";
    } else {
        showToast(result?.error || "Възникна грешка", "error");
    }
}

// ==============================================
// SUPER ADMIN LOGIC 
// ==============================================

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
    if (!pin) {
        document.getElementById("superPinError").textContent = "Въведете парола!";
        return;
    }

    // ПИН кодът се проверява централно през специалния endpoint verifySuperPin
    const result = await apiCall('verifySuperPin', { pin: pin });

    if (result && result.success) {
        sessionStorage.setItem("superAdminAuth", pin);
        showSuperAdminDashboard();
    } else {
        document.getElementById("superPinError").textContent = result.error || "Грешна парола за Супер Админ.";
    }
}

function showSuperAdminDashboard() {
    document.getElementById("superAdminLoginCard").style.display = "none";
    document.getElementById("superAdminDashboard").style.display = "block";

    // Fetch settings and populate fields
    apiCall('getSuperSettings').then(res => {
        if (res && res.success) {
            document.getElementById("superPaymentOptions").value = res.paymentOptions || "";
            document.getElementById("priceBigCities").value = res.priceBigCities || "";
            document.getElementById("priceOtherCities").value = res.priceOtherCities || "";
            document.getElementById("priceLifetime").value = res.priceLifetime || "";
        }
    });

    loadSuperAdminEntrances();
}

window.saveSuperSettings = async function () {
    const btn = document.getElementById("saveSuperSettingsBtn");
    const originalText = btn.textContent;
    btn.textContent = "Запазване...";
    btn.disabled = true;

    const reqData = {
        paymentOptions: document.getElementById("superPaymentOptions").value.trim(),
        priceBigCities: document.getElementById("priceBigCities").value.trim(),
        priceOtherCities: document.getElementById("priceOtherCities").value.trim(),
        priceLifetime: document.getElementById("priceLifetime").value.trim()
    };

    const result = await apiCall('updateSuperSettings', {
        pin: sessionStorage.getItem("superAdminAuth"),
        settings: JSON.stringify(reqData)
    });

    if (result && result.success) {
        showToast("Настройките са запазени успешно!", "success");
    } else {
        showToast(result.error || "Грешка при запазване", "error");
    }

    btn.textContent = originalText;
    btn.disabled = false;
}

async function loadSuperAdminEntrances() {
    const tbody = document.getElementById("superAdminEntrancesList");
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Зареждане...</td></tr>';

    const result = await apiCall('getRegistryList');
    if (result && result.success && Array.isArray(result.registry)) {
        tbody.innerHTML = '';
        result.registry.forEach(ent => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="padding: 8px;"><b>${ent.name}</b></td>
                <td style="padding: 8px;">${ent.id}</td>
                <td style="padding: 8px; color: ${ent.validUntil === '2000-01-01' ? 'red' : 'inherit'};">
                    ${ent.validUntil === '2000-01-01' ? 'Блокиран' : ent.validUntil}
                </td>
                <td style="padding: 8px;">
                    <button onclick="manageSub('${ent.id}', 'unblock')" style="padding:4px 8px; font-size:11px; margin-right:4px;">Пусни 30 д.</button>
                    <button onclick="manageSub('${ent.id}', 'block')" style="padding:4px 8px; font-size:11px; margin-right:4px; color:red;">Спри</button>
                    <button onclick="manageSub('${ent.id}', 'lifetime')" style="padding:4px 8px; font-size:11px; color:green;">Безсрочен</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Грешка при зареждане.</td></tr>';
    }
}

window.manageSub = async function (targetId, subAction) {
    if (!confirm(`Сигурни ли сте, че искате да промените достъпа на ID: ${targetId}?`)) return;

    const result = await apiCall('updateSubscription', {
        superPin: sessionStorage.getItem("superAdminAuth"),
        targetId: targetId,
        subAction: subAction
    });

    if (result && result.success) {
        showToast("Правата са обновени успешно!", "success");
        loadSuperAdminEntrances();
    } else {
        showToast(result?.error || "Грешка при обновяване", "error");
    }
}

window.submitNewClient = async function () {
    const city = document.getElementById("newCity").value.trim();
    const block = document.getElementById("newBlock").value.trim();
    const entrance = document.getElementById("newEntrance").value.trim();
    const email = document.getElementById("newAdminEmail").value.trim();
    const aptCount = document.getElementById("newAptCount").value.trim();

    if (!city || !block || !entrance || !email || !aptCount) {
        showToast("Моля, попълнете всички полета", "error");
        return;
    }

    const btn = document.getElementById("createClientBtn");
    btn.textContent = "Генериране (Изчакайте до 15 сек)...";

    const result = await apiCall('createClient', {
        superPin: sessionStorage.getItem("superAdminAuth"),
        city: city,
        block: block,
        entrance: entrance,
        adminEmail: email,
        apartmentsCount: aptCount
    });

    btn.textContent = "Създай Клиент & Генерирай Таблици";

    if (result && result.success) {
        showToast("✅ Клиентът е създаден успешно! Имейлът е изпратен.", "success");
        document.getElementById("newCity").value = "";
        document.getElementById("newBlock").value = "";
        document.getElementById("newEntrance").value = "";
        document.getElementById("newAdminEmail").value = "";
        document.getElementById("newAptCount").value = "";

        // Refresh dropdowns if necessary by refreshing page
        setTimeout(() => location.reload(), 3000);
    } else {
        showToast(result?.error || "Грешка при създаване", "error");
    }
}
