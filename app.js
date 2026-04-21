// ==============================================
// CONFIGURATION & GLOBAL STATE
// ==============================================

// Тук трябва да се постави линка от Google Apps Script, след като се разгърне (Deploy -> Web App)
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwDypJEQt07rcjZZ0FDDzV_o2QoTfDBaA3p2CGNi99cGT5FeSrJGY-wYGYuB5UO6BZ8jA/exec";

let currentRouteKey = "";
let apartmentList = [];
let _currentIdealParts = {};

// ==============================================
// INITIALIZATION
// ==============================================

document.addEventListener('DOMContentLoaded', async () => {
    // Възстановяване на запазени данни, ако има такива
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

    // --- Автоматично влизане (Parsing ID and Apartment from Hash or Query) ---
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

    // Зареждаме публичните настройки (Бутон за регистрация и т.н.)
    loadPublicSettings();

    // Ако сме се върнали от ръководството, отваряме админ панела автоматично
    if (sessionStorage.getItem('shouldOpenAdmin') === 'true') {
        sessionStorage.removeItem('shouldOpenAdmin');
        // Даваме малко време на enterEntrance да приключи ако е в ход
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

window.activeLoadingRequests = 0;
window.showLoading = function () { return;
    window.activeLoadingRequests++;
    const loader = document.getElementById("loadingOverlay");
    if (loader) loader.classList.add("active");

    // Safety timeout: ако нещо забие, скриваме лоудъра след 15 секунди
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
    return name.toString().toUpperCase().replace(/А/g, "A").replace(/\s+/g, "");
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

// --- SAVING STATE (Задача 8: визуална индикация при запис) ---
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
        // Затваряме формата за регистрация, ако е отворена
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
        // Затваряме формата за контакт, ако е отворена
        document.getElementById('contact-section').classList.add('hidden');
        
        section.classList.remove('hidden');
        // Плавно скролване до формата, за да я види потребителят веднага
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
    if (select) select.innerHTML = '<option value="">Избери апартамент</option>';
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
        showToast("Моля, въведете вашето ID за достъп!", "error");
        return false;
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
    // Обединена заявка по-долу

    // Зареждаме и конфигурацията за входа (Плащане и т.н.)
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
            return false; // PREVENT ENTRY
        }

        // Възстановяваме бутона веднага щом приключат заявките
        btn.textContent = originalText;
        btn.disabled = false;

        // Запазваме цените в сесията
        if (info.pricePerApt !== undefined) {
            sessionStorage.setItem("pricePerApt_" + currentRouteKey, info.pricePerApt);
            sessionStorage.setItem("lifetimePrice_" + currentRouteKey, info.lifetimePrice);
            sessionStorage.setItem("currency_" + currentRouteKey, info.currency);
        }

        // Инструкции за плащане — запазваме за по-късно, но НЕ показваме веднага при влизане
        if (info.paymentInfo) {
            document.getElementById('payment-instructions').textContent = info.paymentInfo;
            document.getElementById('masterPaymentText').value = info.paymentInfo;
            // Съхраняваме в session за използване при избор на апартамент
            sessionStorage.setItem('paymentInfo_' + currentRouteKey, info.paymentInfo);
        } else {
            sessionStorage.removeItem('paymentInfo_' + currentRouteKey);
        }
        // Винаги скриваме при влизане — ще се покаже само при избран апартамент с дълг
        document.getElementById('payment-details-box').style.display = 'none';

        // Имейл за връзка
        const adminMailBtn = document.getElementById('admin-mailto-link');
        if (adminMailBtn) {
            if (info.adminEmail) {
                adminMailBtn.href = `mailto:${info.adminEmail}`;
                adminMailBtn.style.display = 'inline-block';
            } else {
                adminMailBtn.style.display = 'none';
            }
        }

        // Външни линкове
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

        // --- ИЗЧИСЛЯВАНЕ НА АБОНАМЕНТ КЪМ ПЛАТФОРМАТА ---
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
            if (subMonthlyEl) subMonthlyEl.innerHTML = '<span style="color:green;">🎁 БЕЗПЛАТНО</span>';
        }

        // --- ГЛОБАЛНО СЪОБЩЕНИЕ ОТ СУПЕР АДМИН ---
        const newsBanner = document.getElementById("adminGlobalNews");
        const newsText = document.getElementById("adminGlobalNewsText");
        if (info.globalMessage && info.globalMessage.trim() !== "") {
            newsText.innerHTML = info.globalMessage.replace(/\n/g, '<br>');
            newsBanner.style.display = "block";
        } else {
            newsBanner.style.display = "none";
        }

        // --- СЪОБЩЕНИЕ ОТ ДОМОУПРАВИТЕЛЯ (КЪМ ЖИВУЩИТЕ) ---
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
        // Скриваме всичко, ако няма инфо
        document.getElementById('payment-details-box').style.display = 'none';
        document.getElementById('admin-mailto-link').style.display = 'none';
        document.getElementById('btn-electric-link').style.display = 'none';
        document.getElementById('btn-subscription-link').style.display = 'none';
    }

    // ОБРАБОТКА НА СПИСЪКА С АПАРТАМЕНТИ И СМЯНА НА ИЗГЛЕДА
    if (result && !result.error && Array.isArray(result)) {
        apartmentList = result;

        // Сортиране по номер на апартамент
        apartmentList.sort((a, b) => {
            const numA = parseInt(a.replace(/\D/g, '')) || 0;
            const numB = parseInt(b.replace(/\D/g, '')) || 0;
            return numA - numB;
        });

        // Обновяваме заглавието на входа
        if (configResult && configResult.info && configResult.info.entranceName) {
            document.getElementById('entrance-title').textContent = configResult.info.entranceName;
        } else {
            document.getElementById('entrance-title').textContent = `Етажна собственост - ID ${currentRouteKey}`;
        }

        // Превключваме екрана
        document.getElementById('view-selector').classList.remove('active');
        document.getElementById('view-selector').classList.add('hidden');
        document.getElementById('view-entrance-home').classList.remove('hidden');
        document.getElementById('view-entrance-home').classList.add('active');

        // Пълним падащото меню
        const select = document.getElementById("apartmentSelect");
        select.innerHTML = '<option value="">Избери апартамент</option>';
        apartmentList.forEach(a => {
            const opt = document.createElement("option");
            opt.value = opt.textContent = a;
            select.appendChild(opt);
        });

        // ПРЕЗАКЛЮЧВАМЕ HASH ЗА СИНХРОНИЗАЦИЯ (без зацикляне)
        const targetHash = "#" + encodeURIComponent(currentRouteKey);
        if (window.location.hash !== targetHash && !window.location.hash.includes("/")) {
            window.location.hash = targetHash;
        }

        // Зареждаме дашборда
        loadDashboardData();
        return true;
    } else {
        const errStr = result && result.error ? result.error.toString() : "";
        if (errStr.includes("fetch") || errStr.includes("NetworkError")) {
            showToast("Грешка при връзка (Failed to fetch). Проверете интернет връзката си.", "error");
        } else {
            showToast(`Грешен вход: ${currentRouteKey} не е намерен в базата.`, "error");
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
      // Дългът включва фонд ремонт. Ако дългът е по-малък от фонда,
      // значи част от фонда е покрита. Ако е по-голям — нищо от фонда не е платено.
      totalBalance += Math.max(0, targetFund - balance);
    } else {
      // balance <= 0: всичко е платено (вкл. целия фонд ремонт)
      totalBalance += targetFund;
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
            
            // Показваме събраното спрямо общото начислено
            const collected = parseFloat(d.totalBalance) || 0;
            const target = parseFloat(d.totalTargetFund) || 0;
            document.getElementById('dash-balance').textContent = `${collected.toFixed(2)} ${cur} (${target.toFixed(2)} ${cur})`;

            // Trends status text update
            const debtsTrendEl = document.getElementById('dash-debts-trend');
            const balanceTrendEl = document.getElementById('dash-balance-trend');

            if (debtsTrendEl) {
                debtsTrendEl.textContent = parseFloat(d.totalDebts) > 0 ? "Изисква се заплащане" : "Всичко е изплатено";
            }
            if (balanceTrendEl) {
                if (target > 0) {
                    balanceTrendEl.textContent = collected > 0 
                        ? `Събрано ${collected.toFixed(2)} от ${target.toFixed(2)} ${cur}` 
                        : `Начислено ${target.toFixed(2)} ${cur}`;
                } else {
                    balanceTrendEl.textContent = "Няма начислен фонд";
                }
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
            const errMsg = result?.error || "Неуспешно зареждане на обобщените данни.";
            console.error("Dashboard data load failed:", errMsg);
            // Don't show toast for every fail to not annoy, but update the placeholders if they were stuck
            document.getElementById('dash-debts-trend').textContent = "Грешка при зареждане";
            document.getElementById('dash-balance-trend').textContent = "Грешка при зареждане";
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
                    label: 'Асансьор',
                    data: data.map(i => i.elevator),
                    borderColor: '#3b6edc',
                    backgroundColor: 'rgba(59, 110, 220, 0.1)',
                    tension: 0.3,
                    fill: false,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Абонамент',
                    data: data.map(i => i.subscription),
                    borderColor: '#ff9500',
                    backgroundColor: 'rgba(255, 149, 0, 0.1)',
                    tension: 0.3,
                    fill: false,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Осветление',
                    data: data.map(i => i.light),
                    borderColor: '#34c759',
                    backgroundColor: 'rgba(52, 199, 89, 0.1)',
                    tension: 0.3,
                    fill: false,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Почистване',
                    data: data.map(i => i.cleaning),
                    borderColor: '#5856d6',
                    backgroundColor: 'rgba(88, 86, 214, 0.1)',
                    tension: 0.3,
                    fill: false,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Поддръжка',
                    data: data.map(i => i.podrajka),
                    borderColor: '#ff2d55',
                    backgroundColor: 'rgba(255, 45, 85, 0.1)',
                    tension: 0.3,
                    fill: false,
                    pointRadius: 4,
                    pointHoverRadius: 6
                },
                {
                    label: 'Фонд ремонт',
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

    // Скриваме инструкциите за плащане докато не знаем дали има дълг
    document.getElementById('payment-details-box').style.display = 'none';

    // Update URL Hash for persistence
    if (currentRouteKey) {
        window.location.hash = `${encodeURIComponent(currentRouteKey)}/${encodeURIComponent(apartment)}`;
    }

    // Показваме кода за плащане веднага
    document.getElementById("payment-reference-value").textContent = `${currentRouteKey}-${apartment}`;
    document.getElementById("payment-reference-box").style.display = "block";

    const result = await loadApartmentFromFirebase(currentRouteKey, apartment);

    if (result && result.error && result.showMessage) {
        document.getElementById("saldo").textContent = "Скрит";
        showToast("Информацията за салдото Ви, не се показва поради неплатен абонамент", "error");
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

        // --- ИНСТРУКЦИИ ЗА ПЛАЩАНЕ — показват се само при дълг ---
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
            tBody.innerHTML = '<tr><td colspan="10" style="text-align:center;">Няма налични данни за избрания апартамент.</td></tr>';
        }

        // --- ПЕРСОНАЛНО СЪОБЩЕНИЕ ЗА АПАРТАМЕНТА ---
        const aptNoticeBanner = document.getElementById("individualAptNotice");
        const aptNoticeText = document.getElementById("individualAptNoticeText");
        if (result.aptNotice && result.aptNotice.trim() !== "") {
            aptNoticeText.innerHTML = result.aptNotice.replace(/\n/g, '<br>');
            aptNoticeBanner.style.display = "block";
        } else {
            aptNoticeBanner.style.display = "none";
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

    // Първоначална подкана за MASTER настройки
    const masterPromptKey = "hasSeenMasterPrompt_" + currentRouteKey;
    if (!localStorage.getItem(masterPromptKey)) {
        setTimeout(() => {
            showToast("🎁 Добре дошли! Препоръчваме първо да посетите секция 'MASTER – Настройки', за да въведете началните параметри на входа.", "success");
            localStorage.setItem(masterPromptKey, "true");
        }, 1000);
    }

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
                    "Януари", "Февруари", "Март", "Април", "Май", "Юни",
                    "Юли", "Август", "Септември", "Октомври", "Ноември", "Декември"
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
            sel.innerHTML = '<option value="">Избери апартамент</option>';
            apartmentList.forEach(a => sel.appendChild(new Option(a, a)));
        }
    });

    // ЗУЕС Валидация в реално време за обитатели
    const obInput = document.getElementById("masterObVal");
    if (obInput) {
        obInput.addEventListener("change", (e) => {
            if (e.target.value !== "" && parseInt(e.target.value) < 1) {
                showToast("⚠️ Минималният брой е 1. „За самостоятелен обект, в който се пребивава не повече от 30 дни в годината, разходите за управление и поддръжка се заплащат в размера, определен за един обитател.“ (Чл. 51, ал. 1 от ЗУЕС)", "error");
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
        showToast("Попълнете всички полета за плащане!", "error");
        return;
    }

    const btn = document.getElementById("payBtn");
    showSaving(btn, "Записване...");

    const result = await apiCall('addPayment', {
        pin: getStoredPin(),
        apartment: apt,
        period: period,
        amount: amount
    });

    hideSaving(btn, "Добави плащане");

    if (result && result.success) {
        showToast("✅ Успешно добавено плащане.", "success");
        document.getElementById("adminAmount").value = "";
        refreshCurrentView();
    } else {
        showToast(result?.error || "Възникна грешка", "error");
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
            if (d["Собственик"]) document.getElementById("book-Owner").value = d["Собственик"];
            if (d["Имейл"]) document.getElementById("book-Email").value = d["Имейл"];
            if (d["Обитатели"]) document.getElementById("book-Occupants").value = d["Обитатели"];
            if (d["Домашни любимци"]) document.getElementById("book-Pets").value = d["Домашни любимци"];
            if (d["Предназначение"]) document.getElementById("book-Purpose").value = d["Предназначение"];

            if (d["Дата вписване"]) {
                try {
                    const date = new Date(d["Дата вписване"]);
                    if (!isNaN(date.getTime())) {
                        document.getElementById("book-EntryDate").value = date.toISOString().split('T')[0];
                    }
                } catch (e) { }
            }
        }
    } catch (e) {
        showToast("Грешка при зареждане на данните", "error");
    }
}

window.submitBookData = async function () {
    const apt = document.getElementById("masterBookApt").value;
    if (!apt) {
        showToast("Моля, изберете апартамент!", "error");
        return;
    }

    const mapping = [
        { id: "book-Owner", key: "Собственик" },
        { id: "book-Email", key: "Имейл" },
        { id: "book-Occupants", key: "Обитатели" },
        { id: "book-EntryDate", key: "Дата вписване" },
        { id: "book-Pets", key: "Домашни любимци" },
        { id: "book-Purpose", key: "Предназначение" }
    ];

    const updates = {};
    mapping.forEach(item => {
        const el = document.getElementById(item.id);
        if (el) updates[item.key] = el.value;
    });

    const btn = document.getElementById('book-save-btn');
    showSaving(btn, "Записване...");

    try {
        const result = await apiCall('updateBookData', {
            pin: getStoredPin(),
            apartment: apt,
            updates: JSON.stringify(updates)
        });

        if (result && result.success) {
            showToast("✅ Книгата на ЕС е успешно обновена за " + apt, "success");
        } else {
            showToast(result?.error || "Грешка при запис", "error");
        }
    } catch (e) {
        console.error(e);
        showToast("Възникна грешка при записа", "error");
    } finally {
        hideSaving(btn, "Запиши Промените");
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
    showSaving(btn, "Записване...");

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

    hideSaving(btn, "Запиши начисления");

    if (result && result.success) {
        showToast("✅ Успешно записани начисления.", "success");
        document.getElementById("chargesElevator").value = "";
        document.getElementById("chargesSubscription").value = "";
        document.getElementById("chargesLight").value = "";
        document.getElementById("chargesSecurity").value = "";
        document.getElementById("chargesCleaning").value = "";
        document.getElementById("chargesPodrajka").value = "";
        document.getElementById("chargesRemont").value = "";
        refreshCurrentView();
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
        // Синьо когато е активно
        btn.style.background = "var(--primary)";
        btn.style.color = "white";
        btn.style.borderColor = "var(--primary)";
        switchZuesSubTab('z-book');
    }
}

window.submitMaster = async function (sheetName) {
    // В зависимост от подаденото име (Логика, и т.н.) събираме стойностите
    let val, fromP, toP, apt;

    if (sheetName === 'Логика') {
        val = document.getElementById('masterLogikaVal').value;
        fromP = document.getElementById('masterLogikaFrom').value.trim();
        toP = "12.2050"; 
        apt = "";
    } else if (sheetName === 'УЧАСТИЕ_АСАНСЬОР') {
        apt = document.getElementById('masterUchApt').value;
        val = document.getElementById('masterUchVal').value;
        fromP = document.getElementById('masterUchFrom').value.trim();
        toP = "12.2050";
    } else if (sheetName === 'ОБИТАТЕЛИ') {
        apt = document.getElementById('masterObApt').value;
        val = document.getElementById('masterObVal').value;
        fromP = document.getElementById('masterObFrom').value.trim();
        toP = "12.2050";
        if (val !== "" && parseInt(val) < 1) {
            showToast("⚠️ Минималният брой е 1.", "error");
            return;
        }
    } else if (sheetName === 'ЧИПОВЕ') {
        apt = document.getElementById('masterChApt').value;
        val = document.getElementById('masterChVal').value;
        fromP = document.getElementById('masterChFrom').value.trim();
        toP = "12.2050";
    } else if (sheetName === 'ИДЕАЛНИ_ЧАСТИ') {
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
            showToast("Моля, попълнете поне едно поле!", "error");
            return;
        }

        // Пращаме го като обект, бекендът ще го разпознае
        val = JSON.stringify({
            paymentInfo: pText,

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
    const originalText = activeTabObj ? activeTabObj.textContent : "Запиши";
    if (activeTabObj) {
        activeTabObj.disabled = true;
        activeTabObj.textContent = "Записване...";
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
            showToast(`Успешно обновен регистър: ${sheetName}`, "success");
            if (sheetName === 'ОБИТАТЕЛИ') {
                const valInput = document.getElementById('masterObVal');
                if (valInput) valInput.value = "";
            }
            if (sheetName === 'ЧИПОВЕ') {
                const valInput = document.getElementById('masterChVal');
                if (valInput) valInput.value = "";
            }
            refreshCurrentView();
        } else {
            showToast(result?.error || "Възникна грешка", "error");
        }
    } catch (e) {
        showToast("Сървърна грешка при запис", "error");
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
        container.innerHTML = '<p style="color:#666; font-style:italic;">Изберете апартамент...</p>';
        return;
    }

    container.innerHTML = "⌛ Зареждане на информация...";

    try {
        const res = await apiCall('getApartmentMasterSummary', { apartment: apt, pin: getStoredPin() });
        if (res && res.success) {
            const d = res.data;
            container.innerHTML = `
                <div style="background:rgba(0,122,255,0.05); padding:15px; border-radius:8px; border-left:4px solid var(--primary);">
                    <h4 style="margin-bottom:10px;">📊 Статус за Апт. ${apt}</h4>
                    <ul style="list-style:none; padding:0;">
                        <li><b>👥 Обитатели:</b> ${d.occupants || 0} бр.</li>
                        <li><b>🔑 Чипове:</b> ${d.chips || 0} бр.</li>
                        <li><b>🔘 Уч. асансьор:</b> ${d.participation === 'Да' ? '✅ Да' : '❌ Не'}</li>
                        <li><b>📐 Идеални части:</b> ${d.idealParts || 0}%</li>
                    </ul>
                    <p style="font-size:11px; color:#666; margin-top:10px;">* Посочените данни са от текущия MASTER регистър и се използват за следващите начисления.</p>
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
            container.innerHTML = '<p style="color:red;">Грешка при зареждане на данните.</p>';
            const editor = document.getElementById("aptNoticeEditor");
            if (editor) editor.style.display = "none";
        }
    } catch (e) {
        container.innerHTML = '<p style="color:red;">Сървърна грешка.</p>';
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
        showToast("Персоналното съобщение е запазено!", "success");
        refreshCurrentView();
    } else {
        showToast(result?.error || "Грешка при запис", "error");
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
    showSaving(btn, "Запазване...");

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
            showToast("✅ Настройките са запазени успешно!", "success");
        } else {
            showToast(result.error || "Грешка при запазване", "error");
        }
    } catch (e) {
        console.error(e);
        showToast("Възникна грешка при запазване", "error");
    } finally {
        hideSaving(btn, "Запази настройките");
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
        showToast("Съобщението е запазено!", "success");
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

            // Изпращаме имейл до всички живущи с регистриран имейл
            if (notice !== "") {
                apiCall('sendNoticeEmail', { pin: getStoredPin(), notice: notice })
                    .then(emailResult => {
                        if (emailResult && emailResult.success) {
                            showToast(`📧 Имейлът е изпратен до ${emailResult.sent || 0} апартамента.`, "success");
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
        showToast(result?.error || "Грешка при запис", "error");
    }
}

// Изпращане на индивидуален имейл до конкретен апартамент
window.sendAptEmail = async function () {
    const apt = document.getElementById("emailAptTarget").value;
    const subject = document.getElementById("emailAptSubject").value.trim();
    const body = document.getElementById("emailAptBody").value.trim();

    if (!apt) { showToast("Изберете апартамент!", "error"); return; }
    if (!subject) { showToast("Попълнете тема на имейла!", "error"); return; }
    if (!body) { showToast("Попълнете текст на имейла!", "error"); return; }

    showLoading();
    const result = await apiCall('sendAptEmail', {
        pin: getStoredPin(),
        apartment: apt,
        subject: subject,
        body: body
    });
    hideLoading();

    if (result && result.success) {
        showToast("✅ Имейлът е изпратен успешно!", "success");
        document.getElementById("emailAptSubject").value = "";
        document.getElementById("emailAptBody").value = "";
    } else {
        showToast(result?.error || "Грешка при изпращане", "error");
    }
}

window.saveGlobalMessage = async function () {
    const btn = document.getElementById("saveGlobalMessageBtn");
    const msg = document.getElementById("superGlobalMessage").value.trim();

    showSaving(btn, "Изпращане...");

    try {
        const result = await apiCall('updateGlobalMessage', {
            pin: sessionStorage.getItem("superAdminAuth"),
            message: msg
        });

        if (result && result.success) {
            showToast("✅ Съобщението е изпратено до всички!", "success");
        } else {
            showToast(result.error || "Грешка при изпращане", "error");
        }
    } catch (e) {
        showToast("Проблем при комуникация със сървъра", "error");
    } finally {
        hideSaving(btn, "Изпрати съобщение");
    }
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
            tr.innerHTML = `
                <td style="padding: 8px;"><b>${ent.name}</b></td>
                <td style="padding: 8px; font-family: monospace;">${ent.id}</td>
                <td style="padding: 8px; color: ${ent.validUntil === '2000-01-01' ? 'red' : 'inherit'};">
                    ${ent.validUntil === '2000-01-01' ? 'Блокиран' : (ent.validUntil || '---')}
                </td>
                <td style="padding: 8px;">
                    <span class="status-badge" style="background:${ent.validUntil === '2000-01-01' ? '#fa5252' : '#4ade80'}; color:white; padding: 2px 6px; border-radius: 4px; font-size: 11px;">
                        ${ent.validUntil === '2000-01-01' ? 'Спрян' : 'Активен'}
                    </span>
                </td>
                <td style="padding: 8px;">
                    <button class="admin-btn secondary small" onclick="manageSub('${ent.id}', 'unblock')" style="padding:4px 8px; font-size:11px; margin-right:4px;">+30 дн.</button>
                    <button class="admin-btn small" onclick="manageSub('${ent.id}', 'block')" style="background:#fa5252; color:white; padding:4px 8px; font-size:11px; margin-right:4px;">Спри</button>
                    <button class="admin-btn small" onclick="manageSub('${ent.id}', 'lifetime')" style="background:#4ade80; color:white; padding:4px 8px; font-size:11px;">Безсрочен</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } else {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Грешка при зареждане.</td></tr>';
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

window.runSystemBackup = async function () {
    const btn = document.getElementById("runBackupBtn");
    const statusDiv = document.getElementById("backupStatus");
    const linkA = document.getElementById("backupFolderLink");

    btn.disabled = true;
    btn.textContent = "Архивиране (Моля, изчакайте)...";
    statusDiv.style.display = "block";
    statusDiv.innerHTML = "⏳ Обикаляне на всички входове и копиране на таблици...";
    statusDiv.style.color = "#666";

    const result = await apiCall('runBackup', {
        superPin: sessionStorage.getItem("superAdminAuth")
    });

    btn.disabled = false;
    btn.textContent = "📦 Създай Ръчен Архив Сега";

    if (result && result.success) {
        statusDiv.innerHTML = "✅ " + result.message;
        statusDiv.style.color = "green";
        if (result.folderUrl) {
            linkA.href = result.folderUrl;
            // Показваме и временен линк директно в статуса за удобство
            statusDiv.innerHTML += `<br><a href="${result.folderUrl}" target="_blank" style="color:var(--primary); font-weight:bold;">Виж новия архив тук ➔</a>`;
        }
    } else {
        statusDiv.innerHTML = "❌ Грешка: " + (result?.error || "Проблем при архивиране");
        statusDiv.style.color = "red";
    }
}

async function loadSuperExceptions() {
    const list = document.getElementById("superAdminExceptionsList");
    if (!list) return;
    list.innerHTML = '<tr><td colspan="5" style="text-align:center;">Зареждане...</td></tr>';

    const result = await apiCall('getSuperExceptions', {
        superPin: sessionStorage.getItem("superAdminAuth")
    });

    if (result && result.success && Array.isArray(result.exceptions)) {
        list.innerHTML = "";
        result.exceptions.forEach(ex => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td style="padding:6px;">${ex.targetId}</td>
                <td style="padding:6px;">${ex.apartment === 'ALL' ? 'Всички' : ex.apartment}</td>
                <td style="padding:6px;">${ex.price} EUR</td>
                <td style="padding:6px;">${ex.validUntil}</td>
                <td style="padding:6px;"><button onclick="deleteSuperException(${ex.rowIdx})" style="color:red; background:none; border:none; cursor:pointer; font-size:14px;">✕</button></td>
            `;
            list.appendChild(tr);
        });
    } else {
        list.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:10px; color:#999;">Няма активни изключения.</td></tr>';
    }
}

window.addSuperException = async function () {
    const targetId = document.getElementById("superExceptionRegistry").value;
    const apartment = document.getElementById("superExceptionApt").value.trim();
    const price = document.getElementById("superExceptionPrice").value.trim();
    const validUntil = document.getElementById("superExceptionDate").value;

    if (!targetId || price === "") {
        showToast("Изберете вход и ценова стойност!", "error");
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
        showToast("Специалната цена е добавена!", "success");
        document.getElementById("superExceptionApt").value = "";
        document.getElementById("superExceptionPrice").value = "";
        loadSuperExceptions();
    } else {
        showToast(res?.error || "Възникна грешка", "error");
    }
}

window.deleteSuperException = async function (rowIdx) {
    if (!confirm("Сигурни ли сте, че искате да премахнете това изключение?")) return;
    const res = await apiCall('deleteSuperException', {
        superPin: sessionStorage.getItem("superAdminAuth"),
        rowIdx: rowIdx
    });
    if (res && res.success) {
        showToast("Изключението е премахнато", "success");
        loadSuperExceptions();
    } else {
        showToast("Грешка при изтриване", "error");
    }
}

// ==============================================
// ⚖️ ЗУЕС МЕНИДЖЪР ЛОГИКА
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
// 📋 ЦЯЛА ДОМОВА КНИГА
// ==============================================

let _fullBookData = []; // кеш за търсене

window.loadFullBook = async function () {
    const tbody = document.getElementById("fullBookBody");
    const status = document.getElementById("fullBookStatus");
    tbody.innerHTML = '<tr><td colspan="7" style="padding:20px; text-align:center; color:#aaa;">⏳ Зареждане...</td></tr>';
    if (status) status.textContent = "";

    const result = await apiCall('getFullBook', { pin: getStoredPin() });

    if (!result || !result.success) {
        tbody.innerHTML = '<tr><td colspan="7" style="padding:20px; text-align:center; color:red;">❌ Грешка при зареждане</td></tr>';
        return;
    }

    _fullBookData = result.rows || [];
    renderBookTable(_fullBookData);

    if (status) {
        const filled = _fullBookData.filter(r => r["Собственик"] && r["Собственик"].trim() !== "").length;
        status.textContent = `Общо: ${_fullBookData.length} апартамента | Попълнени: ${filled} | Непопълнени: ${_fullBookData.length - filled}`;
    }
}

function renderBookTable(rows) {
    const tbody = document.getElementById("fullBookBody");
    if (!rows || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="padding:20px; text-align:center; color:#aaa;">Няма данни в книгата.</td></tr>';
        return;
    }

    tbody.innerHTML = rows.map((r, idx) => {
        const hasMissing = !r["Собственик"] || r["Собственик"].trim() === "";
        const bg = hasMissing ? "background:#fffbf0;" : (idx % 2 === 0 ? "" : "background:#fafbfd;");
        const missingMark = hasMissing ? ' <span style="color:#e67e22; font-size:11px;">⚠️</span>' : '';

        return `<tr style="${bg} cursor:pointer;" onclick="switchZuesSubTab('z-book'); document.getElementById('masterBookApt').value='${r["Апартамент"] || ""}'; loadBookData();">
            <td style="padding:9px 12px; font-weight:700; color:#3b6edc;">${r["Апартамент"] || "—"}${missingMark}</td>
            <td style="padding:9px 12px;">${r["Собственик"] || '<span style="color:#ccc;">непопълнено</span>'}</td>
            <td style="padding:9px 12px; font-size:12px;">${r["Имейл"] || '—'}</td>
            <td style="padding:9px 12px; font-size:12px;">${r["Обитатели"] || '—'}</td>
            <td style="padding:9px 12px; font-size:12px;">${r["Предназначение"] || '—'}</td>
            <td style="padding:9px 12px; font-size:12px;">${r["Дата вписване"] || '—'}</td>
            <td style="padding:9px 12px; font-size:12px;">${r["Домашни любимци"] || '—'}</td>
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
    if (status) status.textContent = `Намерени: ${filtered.length} от ${_fullBookData.length} апартамента`;
}

window.printFullBook = function () {
    if (!_fullBookData || _fullBookData.length === 0) {
        showToast("Заредете книгата преди печат!", "error");
        return;
    }

    const rows = _fullBookData.map((r, idx) => `
        <tr style="${idx % 2 === 0 ? '' : 'background:#f9f9f9;'}">
            <td style="padding:6px 8px; border:1px solid #ddd; font-weight:600;">${r["Апартамент"] || "—"}</td>
            <td style="padding:6px 8px; border:1px solid #ddd;">${r["Собственик"] || "—"}</td>
            <td style="padding:6px 8px; border:1px solid #ddd; font-size:11px;">${r["Имейл"] || "—"}</td>
            <td style="padding:6px 8px; border:1px solid #ddd;">${r["Обитатели"] || "—"}</td>
            <td style="padding:6px 8px; border:1px solid #ddd;">${r["Предназначение"] || "—"}</td>
            <td style="padding:6px 8px; border:1px solid #ddd;">${r["Дата вписване"] || "—"}</td>
            <td style="padding:6px 8px; border:1px solid #ddd;">${r["Домашни любимци"] || "—"}</td>
        </tr>`).join('');

    const html = `<!DOCTYPE html><html><head>
        <meta charset="UTF-8">
        <title>Домова книга — Чл. 7 от ЗУЕС</title>
        <style>
            body { font-family: Arial, sans-serif; font-size: 13px; padding: 30px; color: #222; }
            h2 { text-align: center; margin-bottom: 4px; }
            p.subtitle { text-align: center; font-size: 12px; color: #666; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; }
            th { background: #1a1a2e; color: white; padding: 8px; border: 1px solid #333; font-size: 12px; }
            @media print { button { display: none; } }
        </style>
    </head><body>
        <h2>📋 ДОМОВА КНИГА — Книга на етажната собственост (Чл. 7 от ЗУЕС)</h2>
        <p class="subtitle">Дата на извличане: ${new Date().toLocaleDateString('bg-BG')} г. | Общо апартаменти: ${_fullBookData.length}</p>
        <table>
            <thead><tr>
                <th>Апт.</th><th>Собственик/ци</th><th>Имейл</th>
                <th>Обитатели</th><th>Предназн.</th><th>Дата вписване</th><th>Домашни</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
        <div style="margin-top:30px; font-size:11px; color:#888; text-align:right;">
            Управлявано от системата за управление на ЕС
        </div>
        <br><button onclick="window.print()" style="padding:8px 20px; background:#1a1a2e; color:white; border:none; border-radius:6px; cursor:pointer; font-size:13px;">🖨️ Печат</button>
    </body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
}


window.populateAttendanceTable = async function () {
    const list = document.getElementById("meeting-attendance-list");
    if (!list) return;
    list.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:15px; color:#666;">⏳ Зареждане на данни...</td></tr>';

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
        list.innerHTML = '<tr><td colspan="3" style="text-align:center; color:red; padding:10px;">Грешка при зареждане на идеалните части.</td></tr>';
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
            s.innerText = "✅ Има кворум (над 67%)";
            s.style.color = "green";
        } else if (total >= 51) {
            s.innerText = "🔶 Кворум за отложено събрание (над 51%)";
            s.style.color = "orange";
        } else {
            s.innerText = "❌ Няма кворум (необходими 67%)";
            s.style.color = "red";
        }
    }
}

window.printAttendanceList = function () {
    const agenda = document.getElementById("meetingAgenda").value || "Генерален дневен ред";
    const now = new Date();

    let html = `
        <div style="font-family: Arial, sans-serif; padding: 40px; line-height: 1.6;">
            <h2 style="text-align:center;">ПРИСЪСТВЕН СПИСЪК</h2>
            <p style="text-align:center;">на собствениците/обитателите в етажна собственост</p>
            <p><strong>Дата:</strong> ${now.toLocaleDateString('bg-BG')} г.</p>
            <p><strong>Дневен ред:</strong> ${agenda}</p>
            <table border="1" style="width:100%; border-collapse: collapse; margin-top:20px;">
                <thead>
                    <tr style="background:#eee;">
                        <th style="padding:8px;">Апт.</th>
                        <th style="padding:8px;">Представени Ид.части %</th>
                        <th style="padding:8px;">Име на присъстващия / Пълномощник</th>
                        <th style="padding:8px;">Подпис</th>
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
                <p>Председател на събранието: ____________________</p>
                <p>Протоколчик: ____________________</p>
            </div>
        </div>
    `;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.print();
}

window.generateMeetingMinutes = function () {
    const agenda = document.getElementById("meetingAgenda").value || "Генерален дневен ред";
    const quorum = document.getElementById("quorum-percent").innerText;
    const now = new Date();

    let html = `
        <div style="font-family: Times New Roman, serif; padding: 50px; line-height: 1.5; color: #000;">
            <h2 style="text-align:center; text-decoration: underline;">ПРОТОКОЛ №____</h2>
            <h3 style="text-align:center;">от Общо събрание на собствениците</h3>
            <p>Днес, ${now.toLocaleDateString('bg-BG')} г., се проведе общо събрание на етажната собственост.</p>
            <p><strong>Представени идеални части:</strong> ${quorum}</p>
            <p><strong>Дневен ред:</strong></p>
            <p>${agenda}</p>
            <hr>
            <p><strong>ХОД НА СЪБРАНИЕТО И ПРИЕТИ РЕШЕНИЯ:</strong></p>
            <div style="min-height: 300px; border: 1px dashed #ccc; padding: 10px;">
                <em>[Тук опишете дискусиите и гласуванията за всяка точка...]</em>
            </div>
            <p style="margin-top:40px;">Протоколът е съставен съгласно Чл. 16 от ЗУЕС.</p>
            <div style="display:flex; justify-content: space-between; margin-top:50px;">
                <div>Председател: ......................</div>
                <div>Протоколчик: ......................</div>
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
        showToast("Моля, изберете апартамент", "warning");
        return;
    }

    // Зареждаме данните от Книгата (ако са налични)
    const result = await apiCall('getBookData', { apartment: apt });
    const data = result?.data || {};

    let html = `
        <div style="font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: auto; line-height: 1.6;">
            <h2 style="text-align:center;">ДЕКЛАРАЦИЯ</h2>
            <p style="text-align:center;">по Чл. 47, ал. 2 от Закона за управление на етажната собственост</p>
            <br>
            <p>До Управителния съвет / Управителя на ЕС</p>
            <p><strong>ОТНОСНО:</strong> Вписване на данни в Книгата на етажната собственост</p>
            <br>
            <p>Долуподписаният/ата: <strong>${data.Owner || '..........................................................'}</strong></p>
            <p>В качеството ми на собственик/ползвател на самостоятелен обект <strong>№ ${apt}</strong></p>
            <br>
            <p><strong>ДЕКЛАРИРАМ СЛЕДНИТЕ ОБСТОЯТЕЛСТВА:</strong></p>
            <p>1. Членове на моето домакинство / Обитатели: <br><em>${data.Occupants || '..........................................................'}</em></p>
            <p>2. Притежавани домашни любимци: <em>${data.Pets || 'Няма'}</em></p>
            <p>3. Използвам обекта за: <em>${data.Purpose || 'Жилищни нужди'}</em></p>
            <br>
            <p>Известно ми е, че за декларирани неверни данни нося наказателна отговорност по чл. 313 от Наказателния кодекс.</p>
            <br><br>
            <div style="display:flex; justify-content: space-between;">
                <div>Дата: ......................</div>
                <div>Декларатор: ......................</div>
            </div>
        </div>
    `;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.print();
}

// ==============================================
// МЕСЕЧЕН ФИНАНСОВ ОТЧЕТ (Чл. 23 ЗУЕС)
// ==============================================

window.openMonthlyReport = function () {
    switchPage('monthly-report');
    const d = new Date();
    // По подразбиране предходния месец (защото отчетите се правят за завършен период)
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
      logic: rows[0] ? (rows[0].logic || 'Равно') : 'Равно', // Взимаме логиката от първия запис
      apartments: rows.map(r => ({
        apt: r.apartmentId || r.apt || '?',
        occupants: r.occupants || 0,
        chips: r.chips || 0,
        participation: r.participation || 'Да',
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
        showToast("Моля, въведете период!", "error");
        return;
    }

    const btn = document.querySelector("#view-monthly-report .btn-primary");
    showSaving(btn, "Зареждане...");

    try {
        const result = await loadMonthlyReportFromFirebase(currentRouteKey, period);
        if (result && result.success && result.data) {
            const d = result.data;
            document.getElementById("report-title-period").textContent = `за месец ${period} г.`;
            document.getElementById("report-gen-date").textContent = new Date().toLocaleDateString('bg-BG');

            const tableBody = document.getElementById("report-invoiced-rows");
            tableBody.innerHTML = "";

            const labels = {
                elevator: "Разходи за асансьор",
                subscription: "Други абонаменти",
                light: "Електрическа енергия - общи части",
                security: "Охрана / Консиерж",
                cleaning: "Хигиена и почистване",
                podrajka: "Поддръжка на общи части",
                remont: 'Фонд \u201eРемонт и обновяване\u201c'
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

            // --- ДОБАВЯНЕ НА СТАТИСТИКА ЗА ПЕРИОДА (ПАРАМЕТРИ ПЕРСОНАЛНО) ---
            const statsBoxId = "monthly-report-stats-box";
            let statsSect = document.getElementById(statsBoxId);
            if (!statsSect) {
                statsSect = document.createElement("div");
                statsSect.id = statsBoxId;
                statsSect.style.marginTop = "30px";
                statsSect.style.paddingTop = "15px";
                statsSect.style.borderTop = "1px solid #eee";
            }
            // Винаги го добавяме наново, за да сме сигурни, че е вътре в самия отчет (преди подписите):
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
                aptRowsHTML = `<tr><td colspan="6" style="padding: 10px; text-align: center;">Няма налични детайлни данни</td></tr>`;
            }

            statsSect.innerHTML = `
                <div style="page-break-inside: avoid;">
                    <h4 style="margin: 0 0 5px; font-size: 14px; text-transform: uppercase;">
                        III. Подробни параметри по апартаменти
                    </h4>
                    <p style="font-size: 11px; margin-bottom: 15px; color: #555;">Логика на разпределение (Асансьор): <strong>${d.logic || 'Равно'}</strong></p>
                    <table style="width: 100%; font-size: 12px; color: #333; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f8f9fa; border-bottom: 1px solid #ccc; text-align: center; font-weight: normal;">
                                <th style="padding: 8px 4px; border-bottom: 2px solid #ddd;">Ап.</th>
                                <th style="padding: 8px 4px; border-bottom: 2px solid #ddd;">Обитатели</th>
                                <th style="padding: 8px 4px; border-bottom: 2px solid #ddd;">Чипове</th>
                                <th style="padding: 8px 4px; border-bottom: 2px solid #ddd;">Участие Асан.</th>
                                <th style="padding: 8px 4px; border-bottom: 2px solid #ddd;">Ид. Части</th>
                                <th style="padding: 8px 4px; border-bottom: 2px solid #ddd;">Начислено</th>
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
            showToast(result?.error || "Няма данни за този период.", "error");
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

    // Временна смяна на тялото за принтиране (или по-добре чрез CSS media print)
    // Тъй като това е SPA, print() ще хване всичко. Използваме прост метод:
    const printWindow = window.open('', '', 'height=800,width=800');
    printWindow.document.write('<html><head><title>Месечен отчет - ' + document.getElementById("reportPeriodInput").value + '</title>');
    printWindow.document.write('<style>body{font-family: Arial, sans-serif; padding: 40px;} table{width:100%; border-collapse:collapse;} td{padding:10px 0;} tr.total{font-weight:bold; border-top:2px solid black;}</style>');
    printWindow.document.write('</head><body>');
    printWindow.document.write(printContents);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.print();
}

// Помощна функция за смяна на страниците
window.switchPage = function (pageId) {
    // Всички панели
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
            input.placeholder = allHaveParts ? "Обща сума за входа" : "Деактивирано (липсват Ид. части за всички)";
            if(!allHaveParts) input.value = "";
        }
        
        if (warn) {
            warn.style.display = allHaveParts ? "none" : "block";
            if (!allHaveParts) {
                if (missing.length > 0 && missing.length <= 15) {
                    warn.innerHTML = `⚠️ За начисления към фонд ремонт първо въведете Ид. част (%) за <b>всички</b> апартаменти.<br><b>Липсват за:</b> ${missing.join(", ")}`;
                } else if (missing.length > 15) {
                    warn.innerHTML = `⚠️ За начисления към фонд ремонт първо въведете Ид. част (%) за <b>всички</b> апартаменти.<br><b>Липсват за ${missing.length} апартамента.</b>`;
                } else {
                    warn.innerHTML = `⚠️ За начисления към фонд ремонт първо въведете Ид. част (%) за всеки апартамент в MASTER.`;
                }
            }
        }
    } catch(e) {}
}



window.forceFirebaseSync = async function() {
    const btn = document.getElementById('forceSyncBtn');
    if (!btn) return;
    showSaving(btn, 'Синхронизиране... (отнема 5-15 сек)');
    try {
        const result = await apiCall('forceDataSync', { pin: getStoredPin() });
        if (result && result.success) {
            showToast('Синхронизацията приключи успешно!', 'success');
            refreshCurrentView();
        } else {
            showToast(result?.error || 'роблем при синхронизацията.', 'error');
        }
    } catch(e) {
        showToast('решка при комуникация със сървъра', 'error');
    } finally {
        hideSaving(btn, 'зпрати данните към приложението');
    }
}


// ==============================================
// FORCE FIREBASE SYNC (Manual Trigger)
// ==============================================
window.forceFirebaseSync = async function() {
    const btn = document.getElementById("forceSyncBtn");
    if (!btn) return;
    showSaving(btn, "Синхронизиране... (отнема 5-15 сек)");
    try {
        const result = await apiCall("forceDataSync", { pin: getStoredPin() });
        if (result && result.success) {
            showToast("Синхронизацията приключи успешно!", "success");
            refreshCurrentView();
        } else {
            showToast(result?.error || "Проблем при синхронизацията.", "error");
        }
    } catch(e) {
        showToast("Грешка при комуникация със сървъра", "error");
    } finally {
        hideSaving(btn, "Изпрати данните към приложението");
    }
}
