// ==============================================
// CONFIGURATION & GLOBAL STATE
// ==============================================

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
    if (savedEmail) document.getElementById("adminEmailInput").value = savedEmail;
    
    const urlParams = new URLSearchParams(window.location.search);
    if (savedId && !urlParams.get('id') && !window.location.hash) {
        document.getElementById("access-id").value = savedId;
    }

    const aptSel = document.getElementById('apartmentSelect');
    if (aptSel) {
        aptSel.addEventListener('change', (e) => {
            if (e.target.value) {
                loadApartmentData(e.target.value);
            } else {
                resetApartmentData();
                if (currentRouteKey) window.location.hash = encodeURIComponent(currentRouteKey);
                else window.location.hash = "";
            }
        });
    }

    const pinIn = document.getElementById("pinInput");
    if (pinIn) {
        pinIn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') verifyPin();
        });
    }

    // --- ID Parsing ---
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
        setTimeout(() => { if (currentRouteKey) openAdmin(); }, 800);
    }
});

async function loadPublicSettings() {
    try {
        const res = await apiCall('getPublicSettings');
        const regLink = document.getElementById("regButtonLink");
        const regText = document.getElementById("regButtonText");
        if (res && res.success && regLink) {
            regLink.style.display = res.showRegForm ? "block" : "none";
            if (res.regFormText && regText) regText.textContent = res.regFormText;
        } else if (regLink) {
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

    if (!SCRIPT_URL || !SCRIPT_URL.startsWith("https://script.google.com/macros")) {
        hideLoading();
        console.error("No real SCRIPT_URL configured");
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

window.activeLoadingRequests = 0;
window.showLoading = function () {
    window.activeLoadingRequests++;
    const loader = document.getElementById("loadingOverlay");
    if (loader) loader.classList.add("active");
    clearTimeout(window.loaderSafetyTimeout);
    window.loaderSafetyTimeout = setTimeout(() => {
        window.activeLoadingRequests = 0;
        const l = document.getElementById("loadingOverlay");
        if (l) l.classList.remove("active");
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

window.normalizeAptName = (name) => {
    if (!name) return "";
    // Заменяме кирилско 'А' (U+0410) с латинско 'A' (U+0041)
    return name.toString().toUpperCase().replace(/\u0410/g, "A").replace(/\s+/g, "");
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
window.showToast = (msg, type) => {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast " + type;
    clearTimeout(toastTimeout);
    requestAnimationFrame(() => t.classList.add("show"));
    toastTimeout = setTimeout(() => t.classList.remove("show"), 3500);
}

window.showSaving = (btn, text = "\u23F3 \u0417\u0430\u043F\u0438\u0441\u0432\u0430\u043D\u0435...") => {
    if (!btn) return;
    btn._originalText = btn.innerHTML;
    btn.innerHTML = `<span style="display:inline-flex;align-items:center;gap:7px;"><span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.4);border-top-color:#fff;border-radius:50%;animation:spin 0.7s linear infinite;"></span>${text}</span>`;
    btn.disabled = true;
    btn.style.opacity = "0.8";
}

window.hideSaving = (btn, originalText) => {
    if (!btn) return;
    btn.innerHTML = originalText || btn._originalText || "\u0417\u0430\u043F\u0430\u0437\u0438";
    btn.disabled = false;
    btn.style.opacity = "";
}

window.refreshCurrentView = () => {
    loadDashboardData();
    const apt = document.getElementById("apartmentSelect").value;
    if (apt) loadApartmentData(apt);
}

window.toggleContactForm = () => {
    const s = document.getElementById('contact-section');
    if (s.classList.contains('hidden')) {
        document.getElementById('registration-section').classList.add('hidden');
        s.classList.remove('hidden');
        setTimeout(() => s.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } else s.classList.add('hidden');
}

window.toggleRegistrationForm = () => {
    const s = document.getElementById('registration-section');
    if (s.classList.contains('hidden')) {
        document.getElementById('contact-section').classList.add('hidden');
        s.classList.remove('hidden');
        setTimeout(() => s.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } else s.classList.add('hidden');
}

// ==============================================
// ENTRANCE NAVIGATION
// ==============================================

window.exitEntrance = () => {
    currentRouteKey = "";
    apartmentList = [];
    window.location.hash = "";
    document.getElementById('access-id').value = "";
    resetApartmentData();
    document.getElementById('view-entrance-home').classList.add('hidden');
    document.getElementById('view-selector').classList.remove('hidden');
    const sel = document.getElementById("apartmentSelect");
    if (sel) sel.innerHTML = '<option value="">Избери апартамент</option>';
}

window.enterEntrance = async () => {
    let accessId = document.getElementById('access-id').value.trim();
    if (!accessId) {
        showToast("\u041C\u043E\u043B\u044F, \u0432\u044A\u0432\u0435\u0434\u0435\u0442\u0435 \u0432\u0430\u0448\u0435\u0442\u043E ID!", "error");
        return false;
    }

    localStorage.setItem("savedAccessId", accessId);
    currentRouteKey = accessId;

    const btn = document.querySelector("#view-selector .btn-primary");
    const originalText = btn.textContent;
    btn.textContent = "\u0417\u0430\u0440\u0435\u0436\u0434\u0430\u043D\u0435...";
    btn.disabled = true;

    try {
        const [result, configResult] = await Promise.all([
            apiCall('list', { list: 'apartments' }),
            apiCall('getEntranceInfo')
        ]);

        btn.textContent = originalText;
        btn.disabled = false;

        if (configResult && configResult.success && configResult.info) {
            const info = configResult.info;
            if (info.isHardBlocked) {
                showToast("⚠️ \u0414\u043E\u0441\u0442\u044A\u043F\u044A\u0442 \u0435 \u041D\u0410\u041F\u042A\u041B\u041D\u041E \u0441\u043F\u0440\u044F\u043D!", "error");
                return false;
            }

            // Save prices/info to session
            sessionStorage.setItem("pricePerApt_" + currentRouteKey, info.pricePerApt);
            sessionStorage.setItem("currency_" + currentRouteKey, info.currency || "EUR");
            if (info.paymentInfo) sessionStorage.setItem('paymentInfo_' + currentRouteKey, info.paymentInfo);
            
            // Set UI titles/news
            document.getElementById('entrance-title').textContent = info.entranceName || `ID ${currentRouteKey}`;
            const gn = document.getElementById("adminGlobalNews");
            if (gn && info.globalMessage) {
                document.getElementById("adminGlobalNewsText").innerHTML = info.globalMessage.replace(/\n/g, '<br>');
                gn.style.display = "block";
            }
            
            const un = document.getElementById("userEntranceNotice");
            if (un && info.entranceNotice) {
                const fmt = info.entranceNotice.replace(/\n/g, '<br>');
                document.getElementById("userEntranceNoticeText").innerHTML = fmt;
                un.style.display = "block";
                const unh = document.getElementById("userEntranceNoticeHome");
                if (unh) {
                    document.getElementById("userEntranceNoticeTextHome").innerHTML = fmt;
                    unh.style.display = "block";
                }
            }
        }

        if (result && !result.error && Array.isArray(result)) {
            apartmentList = result;
            document.getElementById('view-selector').classList.add('hidden');
            document.getElementById('view-entrance-home').classList.remove('hidden');
            
            const select = document.getElementById("apartmentSelect");
            select.innerHTML = '<option value="">\u0418\u0437\u0431\u0435\u0440\u0438 \u0430\u043F\u0430\u0440\u0442\u0430\u043C\u0435\u043D\u0442</option>';
            apartmentList.forEach(a => select.appendChild(new Option(a, a)));

            window.location.hash = "#" + encodeURIComponent(currentRouteKey);
            loadDashboardData();
            return true;
        } else {
            showToast("\u0413\u0440\u0435\u0448\u0435\u043D \u0432\u0445\u043E\u0434: ID \u043D\u0435 \u0435 \u043D\u0430\u043C\u0435\u0440\u0435\u043D.", "error");
            return false;
        }
    } catch (err) {
        console.error("error in enterEntrance", err);
        btn.textContent = originalText;
        btn.disabled = false;
        return false;
    }
}

async function loadDashboardData() {
    try {
        const result = await apiCall('getDashboardData');
        if (result && result.success && result.dashboard) {
            const d = result.dashboard;
            const cur = sessionStorage.getItem("currency_" + currentRouteKey) || "EUR";
            const deb = document.getElementById('dash-debts');
            const bal = document.getElementById('dash-balance');
            const dt = document.getElementById('dash-debts-trend');
            const bt = document.getElementById('dash-balance-trend');

            if (deb) deb.textContent = `${d.totalDebts} ${cur}`;
            if (bal) bal.textContent = `${parseFloat(d.totalBalance || 0).toFixed(2)} ${cur} (от ${parseFloat(d.totalTargetFund || 0).toFixed(2)} ${cur})`;
            if (dt) dt.textContent = parseFloat(d.totalDebts) > 0 ? "\u0418\u0437\u0438\u0441\u043A\u0432\u0430 \u0441\u0435 \u0437\u0430\u043F\u043B\u0430\u0449\u0430\u043D\u0435" : "\u0412\u0441\u0438\u0447\u043A\u043E \u0435 \u0438\u0437\u043F\u043B\u0430\u0442\u0435\u043D\u043E";
            if (bt) bt.textContent = parseFloat(d.totalBalance) > 0 ? "\u041D\u0430\u043B\u0438\u0447\u0435\u043D \u0444\u043E\u043D\u0434" : "\u041E\u0447\u043A\u0432\u0430 \u0441\u044A\u0431\u0438\u0440\u0430\u043D\u0435";
            
            if (d.trendData && d.trendData.length > 0) {
                if (typeof Chart !== 'undefined') initChart(d.trendData);
                else setTimeout(() => { if (typeof Chart !== 'undefined') initChart(d.trendData); }, 1000);
            }
        }
    } catch (err) {
        console.error("Error in loadDashboardData:", err);
    }
}

async function loadApartmentData(apartment) {
    resetApartmentData();
    document.getElementById('payment-details-box').style.display = 'none';

    if (currentRouteKey) {
        window.location.hash = `${encodeURIComponent(currentRouteKey)}/${encodeURIComponent(apartment)}`;
    }

    const pref = document.getElementById("payment-reference-value");
    if (pref) pref.textContent = `${currentRouteKey}-${apartment}`;
    const prefb = document.getElementById("payment-reference-box");
    if (prefb) prefb.style.display = "block";

    try {
        const result = await apiCall('apartment', { apartment: apartment });
        if (result && result.error) {
            if (result.showMessage) {
                document.getElementById("saldo").textContent = "\u0421\u043A\u0440\u0438\u0442";
                showToast("\u0421\u0430\u043B\u0434\u043E\u0442\u043E \u0412\u0438 \u0435 \u0441\u043A\u0440\u0438\u0442\u043E \u043F\u043E\u0440\u0430\u0434\u0438 \u043D\u0435\u043F\u043B\u0430\u0442\u0435\u043D \u0430\u0431\u043E\u043D\u0430\u043C\u0435\u043D\u0442", "error");
            } else {
                showToast("\u0413\u0440\u0435\u0448\u043A\u0430 \u043F\u0440\u0438 \u0437\u0430\u0440\u0435\u0436\u0434\u0430\u043D\u0435: " + result.error, "error");
            }
            return;
        }

        if (result) {
            const saldoVal = Number(result.saldo || 0);
            const sEl = document.getElementById("saldo");
            const sCard = document.getElementById("saldoCard");
            const cur = sessionStorage.getItem("currency_" + currentRouteKey) || "EUR";

            if (sEl) sEl.textContent = saldoVal.toFixed(2) + " " + cur;
            if (sCard) {
                sCard.className = "card saldo-card " + (saldoVal > 0 ? "saldo-positive" : (saldoVal < 0 ? "saldo-negative" : "saldo-zero"));
            }

            const pbox = document.getElementById('payment-details-box');
            if (saldoVal > 0) {
                const pinfo = sessionStorage.getItem('paymentInfo_' + currentRouteKey);
                if (pinfo && pbox) {
                    document.getElementById('payment-instructions').textContent = pinfo;
                    pbox.style.display = 'block';
                }
            } else if (pbox) {
                pbox.style.display = 'none';
            }

            const tBody = document.getElementById("tableBody");
            if (tBody && result.periods) {
                tBody.innerHTML = "";
                result.periods.forEach(r => {
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
            }

            const ian = document.getElementById("individualAptNotice");
            if (ian && result.aptNotice && result.aptNotice.trim() !== "") {
                document.getElementById("individualAptNoticeText").innerHTML = result.aptNotice.replace(/\n/g, '<br>');
                ian.style.display = "block";
            }
        } else {
            showToast("\u041D\u0435\u0443\u0441\u043F\u0435\u0448\u043D\u043E \u0437\u0430\u0440\u0435\u0436\u0434\u0430\u043D\u0435 \u043D\u0430 \u0434\u0430\u043D\u043D\u0438 \u0437\u0430 \u0430\u043F\u0430\u0440\u0442\u0430\u043C\u0435\u043D\u0442.", "error");
        }
    } catch (e) {
        console.error("loadApartmentData failed", e);
        showToast("\u041A\u0440\u0438\u0442\u0438\u0447\u043D\u0430 \u0433\u0440\u0435\u0448\u043A\u0430!", "error");
    }
}

// ----------------------------------------------------
// CHART & ADMIN LOGIC
// ----------------------------------------------------

let myChart = null;
function initChart(data) {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (myChart) myChart.destroy();
    
    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(i => i.period),
            datasets: [
                { label: 'Асансьор', data: data.map(i => i.elevator), borderColor: '#3b6edc', tension: 0.3, fill: false },
                { label: 'Абонамент', data: data.map(i => i.subscription), borderColor: '#ff9500', tension: 0.3, fill: false },
                { label: 'Осветление', data: data.map(i => i.light), borderColor: '#34c759', tension: 0.3, fill: false },
                { label: 'Почистване', data: data.map(i => i.cleaning), borderColor: '#5856d6', tension: 0.3, fill: false },
                { label: 'Поддръжка', data: data.map(i => i.podrajka), borderColor: '#ff2d55', tension: 0.3, fill: false },
                { label: 'Фонд ремонт', data: data.map(i => i.remont), borderColor: '#8e8e93', tension: 0.3, fill: false }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

window.openAdmin = () => {
    document.getElementById("adminOverlay").classList.add("active");
    if (sessionStorage.getItem("adminAuth_" + currentRouteKey)) {
        showAdminContent();
    } else {
        document.getElementById("loginCard").style.display = "block";
        document.getElementById("adminCard").style.display = "none";
        document.getElementById("pinInput").value = "";
    }
}

window.closeAdmin = () => document.getElementById("adminOverlay").classList.remove("active");

window.verifyPin = async () => {
    const email = document.getElementById("adminEmailInput").value.trim();
    const pin = document.getElementById("pinInput").value.trim();
    const err = document.getElementById("pinError");
    if (!email || !pin) { err.textContent = "\u041C\u043E\u043B\u044F, \u0432\u044A\u0432\u0435\u0434\u0435\u0442\u0435 \u0438\u043C\u0435\u0439\u043B \u0438 \u043F\u0430\u0440\u043E\u043B\u0430."; return; }
    
    const res = await apiCall('verifyPin', { pin: pin });
    if (res && res.success) {
        sessionStorage.setItem("adminAuth_" + currentRouteKey, pin);
        localStorage.setItem("savedAdminEmail", email);
        err.textContent = "";
        showAdminContent();
    } else {
        err.textContent = res?.error || "\u0413\u0440\u0435\u0448\u0435\u043D PIN \u043A\u043E\u0434.";
    }
}

function showAdminContent() {
    document.getElementById("loginCard").style.display = "none";
    document.getElementById("adminCard").style.display = "block";
    const subCodeEl = document.getElementById("subscriptionCodeDisplay");
    if (subCodeEl) subCodeEl.textContent = currentRouteKey;
    populateAdminDropdowns();
    if (typeof checkRemontEligibility === 'function') checkRemontEligibility();
}

function populateAdminDropdowns() {
    const ids = ["adminApt", "adminEmailApt", "masterUchApt", "masterObApt", "masterChApt", "masterIdApt", "masterBookApt", "docAptSelect", "masterInfoApt", "emailAptTarget"];
    ids.forEach(id => {
        const sel = document.getElementById(id);
        if (sel && sel.options.length <= 1) {
            sel.innerHTML = '<option value="">\u0418\u0437\u0431\u0435\u0440\u0438 \u0430\u043F\u0430\u0440\u0442\u0430\u043C\u0435\u043D\u0442</option>';
            apartmentList.forEach(a => sel.appendChild(new Option(a, a)));
        }
    });
    autoFillCurrentPeriod();
}

function autoFillCurrentPeriod() {
    const d = new Date(), cp = String(d.getMonth() + 1).padStart(2, '0') + "." + d.getFullYear();
    const ids = ["adminPeriod", "chargesPeriod", "masterLogikaFrom", "masterUchFrom", "masterObFrom", "masterChFrom", "masterIdFrom"];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el && el.tagName === 'SELECT') {
            if (el.options.length === 0) {
                const year = d.getFullYear();
                const names = ["Януари", "Февруари", "Март", "Април", "Май", "Юни", "Юли", "Август", "Септември", "Октомври", "Ноември", "Декември"];
                names.forEach((n, idx) => el.appendChild(new Option(`${n} ${year}`, `${String(idx + 1).padStart(2, '0')}.${year}`)));
            }
            if (!el.getAttribute('data-init-done')) { el.value = cp; el.setAttribute('data-init-done', 'true'); }
        } else if (el && !el.value) el.value = cp;
    });
}

// ==============================================
// PROTECTED ACTION SUBMISSIONS
// ==============================================

window.submitPayment = async () => {
    const apt = document.getElementById("adminApt").value;
    const period = document.getElementById("adminPeriod").value.trim();
    const amount = document.getElementById("adminAmount").value.trim();
    if (!apt || !period || !amount) { showToast("Попълнете всички полета!", "error"); return; }
    
    const btn = document.getElementById("payBtn");
    showSaving(btn);
    const result = await apiCall('addPayment', { pin: getStoredPin(), apartment: apt, period: period, amount: amount });
    hideSaving(btn);
    if (result && result.success) {
        showToast("Успешно добавено плащане!", "success");
        document.getElementById("adminAmount").value = "";
        refreshCurrentView();
    } else {
        showToast(result?.error || "Грешка при запис", "error");
    }
}

window.submitCharges = async () => {
    const p = document.getElementById("chargesPeriod").value.trim();
    if (!p) { showToast("Изберете период!", "error"); return; }
    
    const fields = {
        elevator: "chargesElevator", subscription: "chargesSubscription", light: "chargesLight",
        security: "chargesSecurity", cleaning: "chargesCleaning", podrajka: "chargesPodrajka", remont: "chargesRemont"
    };
    const params = { pin: getStoredPin(), period: p };
    for (let k in fields) params[k] = document.getElementById(fields[k]).value.trim();
    
    const btn = document.getElementById("chargesBtn");
    showSaving(btn);
    const result = await apiCall('addCharges', params);
    hideSaving(btn);
    if (result && result.success) {
        showToast("Разходите са записани!", "success");
        refreshCurrentView();
    } else {
        showToast(result?.error || "Грешка", "error");
    }
}

window.submitEmail = async () => {
    const apt = document.getElementById("adminEmailApt").value;
    const mail = document.getElementById("adminEmail").value.trim();
    if (!apt || !mail) { showToast("Изберете апартамент и имейл!", "error"); return; }
    const btn = document.getElementById("emailBtn");
    showSaving(btn);
    const result = await apiCall('addEmail', { pin: getStoredPin(), apartment: apt, email: mail });
    hideSaving(btn);
    if (result && result.success) {
        showToast("Имейлът е записан!", "success");
        loadCurrentEmail();
    } else showToast(result?.error || "Грешка", "error");
}

window.loadCurrentEmail = async () => {
    const apt = document.getElementById("adminEmailApt").value;
    const box = document.getElementById("currentEmailBox"), el = document.getElementById("currentEmail");
    if (!apt) { box.style.display = "none"; return; }
    const res = await apiCall('getEmail', { apartment: apt });
    box.style.display = "block";
    el.textContent = (res && res.email) ? res.email : "\u2014";
}

window.switchMasterTab = (tabId, btn) => {
    document.querySelectorAll('.master-panel').forEach(p => p.style.display = 'none');
    const target = document.getElementById('master-tab-' + tabId);
    if (target) target.style.display = 'block';
    
    document.querySelectorAll('.master-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
}

window.submitMaster = async (type) => {
    const params = { pin: getStoredPin(), type: type };
    if (type === 'Логика') {
        params.value = document.getElementById("masterLogikaVal").value;
        params.period = document.getElementById("masterLogikaFrom").value;
    } else if (type === 'УЧАСТИЕ_АСАНСЬОР') {
        params.apartment = document.getElementById("masterUchApt").value;
        params.value = document.getElementById("masterUchVal").value;
        params.period = document.getElementById("masterUchFrom").value;
    } else if (type === 'ОБИТАТЕЛИ') {
        params.apartment = document.getElementById("masterObApt").value;
        params.value = document.getElementById("masterObVal").value;
        params.period = document.getElementById("masterObFrom").value;
    } else if (type === 'ЧИПОВЕ') {
        params.apartment = document.getElementById("masterChApt").value;
        params.value = document.getElementById("masterChVal").value;
        params.period = document.getElementById("masterChFrom").value;
    } else if (type === 'ИДЕАЛНИ_ЧАСТИ') {
        params.apartment = document.getElementById("masterIdApt").value;
        params.value = document.getElementById("masterIdVal").value;
    } else if (type === 'PAYMENT_INFO') {
        params.paymentInfo = document.getElementById("masterPaymentText").value;
        params.linkElectric = document.getElementById("masterLinkElectric").value;
        params.linkSubscription = document.getElementById("masterLinkSubscription").value;
    }
    
    const loader = showLoading();
    const result = await apiCall('updateMaster', params);
    hideLoading();
    if (result && result.success) showToast("Данните са запазени в MASTER!", "success");
    else showToast(result?.error || "Грешка", "error");
}

window.loadApartmentMasterSummary = async () => {
    const apt = document.getElementById("masterInfoApt").value;
    const container = document.getElementById("aptMasterSummary");
    const editor = document.getElementById("aptNoticeEditor");
    if (!apt) { container.innerHTML = `<p style="font-style:italic;">Изберете апартамент...</p>`; editor.style.display = "none"; return; }
    
    const res = await apiCall('getApartmentMasterSummary', { apartment: apt });
    if (res && res.success && res.data) {
        const d = res.data;
        container.innerHTML = `
            <div style="background:white; padding:15px; border-radius:10px; border:1px solid #eee;">
                <strong>Апартамент ${apt}</strong><br>
                \u2022 Обитатели (текущо): ${d.occupants}<br>
                \u2022 Чипове (текущо): ${d.chips}<br>
                \u2022 Участие асансьор: ${d.participation}<br>
                \u2022 Идеални части: ${d.idealParts}%
            </div>
        `;
        document.getElementById("masterAptNoticeVal").value = d.notice || "";
        editor.style.display = "block";
    }
}

window.submitAptNotice = async () => {
    const apt = document.getElementById("masterInfoApt").value;
    const notice = document.getElementById("masterAptNoticeVal").value;
    const res = await apiCall('updateMaster', { pin: getStoredPin(), type: 'APT_NOTICE', apartment: apt, notice: notice });
    if (res && res.success) showToast("Съобщението е запазено!", "success");
}

window.submitMasterNotice = async () => {
    const notice = document.getElementById("masterEntranceNotice").value;
    if (!confirm("Ще бъде изпратен имейл до всички апартаменти. Продължавате ли?")) return;
    const res = await apiCall('sendNoticeEmail', { pin: getStoredPin(), notice: notice });
    if (res && res.success) showToast(`Успешно изпратени имейли до ${res.sent} апартамента.`, "success");
}

// ==============================================
// SUPER ADMIN LOGIC
// ==============================================

window.openSuperAdmin = () => {
    document.getElementById("superAdminOverlay").style.display = "flex";
    if (sessionStorage.getItem("superAdminAuth")) showSuperDashboard();
    else { document.getElementById("superAdminLoginCard").style.display = "block"; document.getElementById("superAdminDashboard").style.display = "none"; }
}

window.closeSuperAdmin = () => document.getElementById("superAdminOverlay").style.display = "none";

window.loginSuperAdmin = async () => {
    const pin = document.getElementById("superPinInput").value.trim();
    if (!pin) return;
    const res = await apiCall('verifySuperPin', { pin: pin });
    if (res && res.success) { sessionStorage.setItem("superAdminAuth", pin); showSuperDashboard(); }
    else document.getElementById("superPinError").textContent = res?.error || "\u0413\u0440\u0435\u0448\u043D\u0430 \u043F\u0430\u0440\u043E\u043B\u0430.";
}

async function showSuperDashboard() {
    document.getElementById("superAdminLoginCard").style.display = "none";
    document.getElementById("superAdminDashboard").style.display = "block";
    
    // Load lists
    const [regRes, setRes, excRes] = await Promise.all([
        apiCall('getRegistryList'),
        apiCall('getSuperSettings'),
        apiCall('getSuperExceptions', { superPin: sessionStorage.getItem("superAdminAuth") })
    ]);

    if (regRes && regRes.registry) {
        const list = document.getElementById("superAdminEntrancesList");
        list.innerHTML = "";
        const select = document.getElementById("superExceptionRegistry");
        select.innerHTML = '<option value="">\u0418\u0437\u0431\u0435\u0440\u0438 \u0412\u0445\u043E\u0434</option>';
        
        regRes.registry.forEach(e => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="padding:8px;">${e.name}</td>
                <td style="padding:8px; font-family:monospace;">${e.id}</td>
                <td style="padding:8px;">${e.validUntil}</td>
                <td style="padding:8px;"><span class="status-badge" style="background:#ddd;">---</span></td>
                <td style="padding:8px;">
                    <button class="admin-btn secondary small" onclick="manageSub('${e.id}','unblock')">+30</button>
                    <button class="admin-btn small" style="background:#fa5252;color:white;" onclick="manageSub('${e.id}','block')">X</button>
                </td>
            `;
            list.appendChild(tr);
            select.appendChild(new Option(e.name, e.id));
        });
    }

    if (setRes && setRes.success) {
        document.getElementById("superPaymentOptions").value = setRes.paymentOptions;
        document.getElementById("priceBigCities").value = setRes.priceBigCities;
        document.getElementById("priceOtherCities").value = setRes.priceOtherCities;
        document.getElementById("priceLifetime").value = setRes.priceLifetime;
        document.getElementById("superGlobalMessage").value = setRes.globalMessage;
        document.getElementById("superShowRegForm").value = setRes.showRegForm;
        document.getElementById("superRegFormText").value = setRes.regFormText;
    }
}

window.saveSuperSettings = async () => {
    const settings = {
        paymentOptions: document.getElementById("superPaymentOptions").value,
        priceBigCities: document.getElementById("priceBigCities").value,
        priceOtherCities: document.getElementById("priceOtherCities").value,
        priceLifetime: document.getElementById("priceLifetime").value,
        showRegForm: document.getElementById("superShowRegForm").value === "true",
        regFormText: document.getElementById("superRegFormText").value
    };
    const res = await apiCall('updateSuperSettings', { pin: sessionStorage.getItem("superAdminAuth"), settings: JSON.stringify(settings) });
    if (res && res.success) showToast("Супер настройките са запазени!", "success");
}

window.saveGlobalMessage = async () => {
    const msg = document.getElementById("superGlobalMessage").value;
    const res = await apiCall('updateGlobalMessage', { pin: sessionStorage.getItem("superAdminAuth"), message: msg });
    if (res && res.success) showToast("Глобалното съобщение е обновено!", "success");
}

window.manageSub = async (id, action) => {
    const res = await apiCall('updateSubscription', { superPin: sessionStorage.getItem("superAdminAuth"), targetId: id, subAction: action });
    if (res && res.success) { showToast("Абонаментът е обновен!", "success"); showSuperDashboard(); }
}

window.submitNewClient = async () => {
    const params = {
        superPin: sessionStorage.getItem("superAdminAuth"),
        city: document.getElementById("newCity").value,
        block: document.getElementById("newBlock").value,
        entrance: document.getElementById("newEntrance").value,
        adminEmail: document.getElementById("newAdminEmail").value,
        apartmentsCount: document.getElementById("newAptCount").value
    };
    if (!params.city || !params.adminEmail) return;
    const btn = document.getElementById("createClientBtn");
    showSaving(btn, "Създаване...");
    const res = await apiCall('createClient', params);
    hideSaving(btn);
    if (res && res.success) showToast("Новият клиент е създаден успешно!", "success");
    else showToast(res?.error || "Грешка", "error");
}

// ZUES SUBTAB SWITCH
window.switchZuesSubTab = (sub) => {
    document.querySelectorAll('.zues-sub-panel').forEach(p => p.style.display = 'none');
    const t = document.getElementById('zub-' + sub);
    if (t) t.style.display = 'block';
}

function checkRemontEligibility() {
    // Basic logic to show warning if some apt lacks ideal parts
    // In current version, this is checked via getApartmentMasterSummary or similar
}
