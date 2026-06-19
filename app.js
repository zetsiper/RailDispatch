// app.js - Логически двигател и визуализация на диспечерския пулт

// Помощна функция за днешната дата
function getTodayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Инициализация на състоянието на системата
let state = {
  drivers: [],
  trains: [],
  shifts: [],
  positionNorms: {},
  assignations: [],
  assigningCell: null,
  timelineDriverFilter: "",
  timelineViewMode: "24h",
  timelineDate: getTodayDateStr(),
  timelineMonthOffset: 0,
  assignationsDate: ""
};

// Зареждане на данни при стартиране
function initData() {
  const storedDrivers = localStorage.getItem("dispatch_drivers");
  const storedTrains = localStorage.getItem("dispatch_trains");
  const storedShifts = localStorage.getItem("dispatch_shifts");
  const storedAssignations = localStorage.getItem("dispatch_assignations");
  const storedNorms = localStorage.getItem("dispatch_position_norms");

  if (storedDrivers && storedTrains && storedShifts) {
    state.drivers = JSON.parse(storedDrivers);
    state.trains = JSON.parse(storedTrains);
    state.shifts = JSON.parse(storedShifts);
    if (storedAssignations) state.assignations = JSON.parse(storedAssignations);
    
    if (storedNorms) {
      state.positionNorms = JSON.parse(storedNorms);
    } else {
      state.positionNorms = typeof DEFAULT_POSITION_NORMS !== 'undefined' ? {...DEFAULT_POSITION_NORMS} : {};
    }

    let needsSave = false;
    state.drivers = state.drivers.map(driver => {
      let migrated = false;
      if (!driver.firstName || !driver.lastName) {
        const parts = (driver.name || "").split(/\s+/);
        driver.firstName = parts[0] || "";
        driver.middleName = parts[1] || "";
        driver.lastName = parts.slice(2).join(" ") || "";
        migrated = true;
      }
      if (!driver.position) {
        driver.position = driver.id === "1005" ? "Инструктор/Депомайстор" : (driver.id === "1006" ? "Помощник-локомотивен машинист" : "Локомотивен машинист");
        migrated = true;
      }
      if (!driver.residence) {
        driver.residence = driver.depot || "Русе";
        migrated = true;
      }
      if (!driver.phones) {
        driver.phones = driver.phone ? [{ number: driver.phone, description: "Личен" }] : [];
        migrated = true;
      }
      if (driver.competencies) {
        driver.competencies = driver.competencies.map(c => {
          if (c === "Серия 40 (вкл. 42/43/44/45)") {
            migrated = true;
            return "Серия 40";
          }
          return c;
        });
      }
      const allowedDepots = ["Русе", "Плевен", "Горна Оряховица", "Каспичан"];
      if (!allowedDepots.includes(driver.depot)) {
        if (driver.depot === "София") driver.depot = "Русе";
        else if (driver.depot === "Пловдив") driver.depot = "Плевен";
        else driver.depot = "Русе";
        migrated = true;
      }
      if (driver.absences) {
        driver.absences = driver.absences.map(abs => {
          if (abs.requested === undefined) abs.requested = true;
          if (abs.approved === undefined) abs.approved = false;
          if (abs.presented === undefined) abs.presented = false;
          if (abs.explanation === undefined) abs.explanation = "";
          return abs;
        });
      }
      if (driver.yearlyNorm === undefined) {
        driver.yearlyNorm = 1920;
        migrated = true;
      }
      if (driver.yearlyWorked === undefined) {
        driver.yearlyWorked = driver.quarterlyWorked ? driver.quarterlyWorked * 4 : 0;
        migrated = true;
      }
      if (state.positionNorms && state.positionNorms[driver.position] && driver.monthlyNorm !== state.positionNorms[driver.position]) {
        driver.monthlyNorm = state.positionNorms[driver.position];
        driver.quarterlyNorm = driver.monthlyNorm * 3;
        driver.yearlyNorm = driver.monthlyNorm * 12;
        migrated = true;
      }
      if (migrated) {
        needsSave = true;
      }
      return driver;
    });
    state.trains = state.trains.map(train => {
      if (train.series === "Серия 40 (вкл. 42/43/44/45)") {
        train.series = "Серия 40";
        needsSave = true;
      }
      return train;
    });
    if (needsSave) {
      saveToLocalStorage();
    }
  } else {
    state.drivers = typeof DEFAULT_DRIVERS !== 'undefined' ? DEFAULT_DRIVERS : [];
    state.trains = typeof DEFAULT_TRAINS !== 'undefined' ? DEFAULT_TRAINS : [];
    state.shifts = typeof DEFAULT_SHIFTS !== 'undefined' ? DEFAULT_SHIFTS : [];
    state.positionNorms = typeof DEFAULT_POSITION_NORMS !== 'undefined' ? {...DEFAULT_POSITION_NORMS} : {};
    saveToLocalStorage();
  }

  migrateShiftData();
  state.timelineDate = getTodayDateStr();
  
  const tomorrow = new Date(getTodayDateStr());
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`;
  state.assignationsDate = state.assignationsDate || tomorrowStr;
  state.assignations.forEach(a => { if (!a.date) a.date = tomorrowStr; });
  saveToLocalStorage();
}

function migrateShiftData() {
  state.shifts.forEach(s => {
    if (!s.releasePlanned) {
      const train = state.trains.find(t => t.id === s.trainId);
      const eta = train ? train.etaHours : 4;
      s.releasePlanned = new Date(new Date(s.appearancePlanned).getTime() + eta * 60 * 60 * 1000).toISOString();
    }
  });
}

function saveToLocalStorage() {
  localStorage.setItem("dispatch_drivers", JSON.stringify(state.drivers));
  localStorage.setItem("dispatch_trains", JSON.stringify(state.trains));
  localStorage.setItem("dispatch_shifts", JSON.stringify(state.shifts));
  localStorage.setItem("dispatch_assignations", JSON.stringify(state.assignations));
  localStorage.setItem("dispatch_position_norms", JSON.stringify(state.positionNorms));
}

// Връща текущото реално време
function getSimulatedDateTime() {
  return new Date();
}

function formatTime(dateOrStr) {
  if (!dateOrStr) return "-";
  const date = new Date(dateOrStr);
  return date.toLocaleTimeString('bg-BG', { hour: '2-digit', minute: '2-digit' }) + 'ч';
}

function getAssignedDriverIdsOnDate(dateStr) {
  const assigned = new Set();
  const pad = n => String(n).padStart(2, "0");
  // Проверка в shifts (appearancePlanned съдържа ISO дата)
  state.shifts.forEach(s => {
    const shiftDate = new Date(s.appearancePlanned);
    const shiftDateStr = `${shiftDate.getFullYear()}-${pad(shiftDate.getMonth()+1)}-${pad(shiftDate.getDate())}`;
    if (shiftDateStr === dateStr && s.status !== 'cancelled') {
      assigned.add(s.driverId);
    }
  });
  // Проверка в assignations (винаги за следващия ден)
  const nextDate = new Date(getTodayDateStr());
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = `${nextDate.getFullYear()}-${pad(nextDate.getMonth()+1)}-${pad(nextDate.getDate())}`;
  if (dateStr === nextDateStr) {
    state.assignations.forEach(a => {
      if (a.driverId) assigned.add(a.driverId);
      if (a.assistantId) assigned.add(a.assistantId);
    });
  }
  return assigned;
}

function formatDate(dateOrStr) {
  if (!dateOrStr) return "-";
  const date = new Date(dateOrStr);
  return date.toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit' }) + ' ' + formatTime(date);
}

function hasCompetencyForTrain(driverId, trainId) {
  if (!driverId || !trainId) return true;
  const driver = state.drivers.find(d => d.id === driverId);
  const train = state.trains.find(t => t.id === trainId);
  if (!driver || !train) return true;
  return driver.competencies.includes(train.series);
}

function checkCompetency(driverId, trainId) {
  if (!hasCompetencyForTrain(driverId, trainId)) {
    const driver = state.drivers.find(d => d.id === driverId);
    const train = state.trains.find(t => t.id === trainId);
    showToast(`❌ ${driver ? driver.name : 'Машинист №'+driverId} няма правоспособност за ${train ? train.series : 'тази серия'}!`, "error");
    return false;
  }
  return true;
}

// ==========================================
// БИЗНЕС ПРАВИЛА И ОГРАНИЧЕНИЯ (LOGIC ENGINE)
// ==========================================

/**
 * Валидира бизнес правилата за конкретен машинист при назначение на влак в определено време.
 * @param {string} driverId - ID на машиниста
 * @param {string} trainId - ID на влака
 * @param {string} appearanceTimeStr - Планирано време за явяване (ISO стринг)
 * @returns {object} Статус на правилата ("светофар")
 */
function checkBusinessRules(driverId, trainId, appearanceTimeStr) {
  const driver = state.drivers.find(d => d.id === driverId);
  const train = state.trains.find(t => t.id === trainId);
  
  const result = {
    rest: { status: "green", text: "ОК - Минималната почивка от 16 часа е спазена." },
    competence: { status: "green", text: "ОК - Машинистът притежава нужната правоспособност." },
    rotation: { status: "green", text: "ОК - Няма засичане с последните дежурства на този влак." },
    balance: { status: "green", text: "ОК - Месечните часове са в нормални граници." }
  };

  if (!driver || !train) {
    return result;
  }

  const plannedTime = new Date(appearanceTimeStr);

  // --- Правило 4: Отсъствия и Отпуски ---
  // Проверка за отсъствие в планираното време
  for (const absence of driver.absences) {
    const absStart = new Date(absence.start);
    const absEnd = new Date(absence.end);
    if (plannedTime >= absStart && plannedTime <= absEnd) {
      const behavior = getAbsenceBehavior(absence);
      if (behavior.blockLevel === 'block') {
        result.rest = { 
          status: "red", 
          text: `Недостъпен - ${behavior.label} до ${formatDate(absEnd)}.` 
        };
        return result;
      } else {
        result.rest = { 
          status: "yellow", 
          text: `⚠️ Предупреждение - ${behavior.label} до ${formatDate(absEnd)}.` 
        };
        // Не прекъсваме - проверяваме и другите правила
        break;
      }
    }
  }

  // --- Правило 1: Задължителна почивка (Твърдо) ---
  // Намираме последната приключена смяна на този машинист
  const driverShifts = state.shifts
    .filter(s => s.driverId === driverId && s.status === 'completed' && s.releaseActual)
    .sort((a, b) => new Date(b.releaseActual) - new Date(a.releaseActual));

  if (driverShifts.length > 0) {
    const lastRelease = new Date(driverShifts[0].releaseActual);
    const nextEarliestAppearance = new Date(lastRelease.getTime() + 16 * 60 * 60 * 1000); // + 16 часа
    
    if (plannedTime < nextEarliestAppearance) {
      const hoursDiff = ((nextEarliestAppearance - plannedTime) / (60 * 60 * 1000)).toFixed(1);
      result.rest = {
        status: "red",
        text: `Недостъпен - Почива след последна смяна. Свободен най-рано на ${formatDate(nextEarliestAppearance)} (недостигат ${hoursDiff}ч).`
      };
    } else {
      const restHours = ((plannedTime - lastRelease) / (60 * 60 * 1000)).toFixed(1);
      result.rest = {
        status: "green",
        text: `ОК - Почивал е ${restHours} часа (над изискваните 16 часа).`
      };
    }
  }

  // --- Проверка за Правоспособност (Твърдо) ---
  const isQualified = driver.competencies.includes(train.series);
  if (!isQualified) {
    result.competence = {
      status: "red",
      text: `Несъвместимост - Машинистът няма правоспособност за локомотив от серия ${train.series}.`
    };
  } else {
    result.competence = {
      status: "green",
      text: `ОК - Правоспособен за ${train.series}.`
    };
  }

  // --- Правило 2: Ротация на влаковете (Меко) ---
  // Проверяваме последните 5 дежурства на машиниста
  const driverPastShifts = state.shifts
    .filter(s => s.driverId === driverId)
    .sort((a, b) => new Date(b.appearancePlanned) - new Date(a.appearancePlanned))
    .slice(0, 5);

  const droveSameTrain = driverPastShifts.some(s => s.trainId === trainId);
  if (droveSameTrain) {
    result.rotation = {
      status: "yellow",
      text: `⚠️ Повторение - Машинистът е обслужвал този влак (${trainId}) в последните 5 дежурства.`
    };
  }

  // --- Правило 3: Натрупване на баланси (Акумулатори) ---
  const estimatedHours = train.etaHours || 4;
  const projectMonthly = driver.monthlyWorked + estimatedHours;
  const projectQuarterly = driver.quarterlyWorked + estimatedHours;

  if (projectMonthly > driver.monthlyNorm) {
    result.balance = {
      status: "yellow",
      text: `⚠️ Превишение на нормата - Месечният баланс ще достигне ${projectMonthly.toFixed(1)}ч от макс. ${driver.monthlyNorm}ч.`
    };
  } else if (projectMonthly > driver.monthlyNorm - 10) {
    result.balance = {
      status: "yellow",
      text: `Риск - Наближава границата на месечния лимит: ${projectMonthly.toFixed(1)}ч.`
    };
  } else {
    result.balance = {
      status: "green",
      text: `ОК - Месечни часове след смяната: ${projectMonthly.toFixed(1)}ч / ${driver.monthlyNorm}ч.`
    };
  }

  return result;
}

/**
 * Определя поведението на дадено отсъствие: цвят за показване и ниво на блокиране.
 * @returns {{ blockLevel: 'block'|'warn'|'none', colorClass: string, label: string }}
 */
function getAbsenceBehavior(absence) {
  if (absence.type === 'Vacation') {
    if (absence.approved) {
      return { blockLevel: 'block', colorClass: 'absence-vacation-approved', label: 'Платен отпуск (Одобрен)' };
    }
    return { blockLevel: 'warn', colorClass: 'absence-vacation-requested', label: 'Платен отпуск (Заявен)' };
  }
  if (absence.type === 'Sick') {
    if (absence.presented) {
      return { blockLevel: 'block', colorClass: 'absence-sick-presented', label: 'Медицински отпуск (Представен)' };
    }
    return { blockLevel: 'block', colorClass: 'absence-sick-requested', label: 'Медицински отпуск (Заявен)' };
  }
  if (absence.type === 'Service') {
    return { blockLevel: 'block', colorClass: 'absence-service', label: 'Служебна ангажираност' };
  }
  if (absence.type === 'Personal') {
    return { blockLevel: 'warn', colorClass: 'absence-personal', label: 'Лична ангажираност' };
  }
  return { blockLevel: 'block', colorClass: 'absence', label: absence.typeBG || 'Отсъствие' };
}

function onAbsenceTypeChange() {
  const type = document.getElementById('modal-absence-type').value;
  const checkSection = document.getElementById('absence-checkboxes-section');
  const explSection = document.getElementById('absence-explanation-section');
  const approvedLabel = document.getElementById('absence-approved-label');
  const presentedLabel = document.getElementById('absence-presented-label');

  if (type === 'Vacation' || type === 'Sick') {
    checkSection.style.display = 'block';
    explSection.style.display = 'none';
    if (type === 'Vacation') {
      approvedLabel.style.display = 'flex';
      presentedLabel.style.display = 'none';
    } else {
      approvedLabel.style.display = 'none';
      presentedLabel.style.display = 'flex';
    }
  } else {
    checkSection.style.display = 'none';
    explSection.style.display = 'block';
  }
}

// ==========================================
// УПРАВЛЕНИЕ НА ДЕЖУРСТВАТА (СЪБИТИЯ)
// ==========================================

function getPlannedEnd(shift) {
  if (shift.releasePlanned) return new Date(shift.releasePlanned);
  const train = state.trains.find(t => t.id === shift.trainId);
  const eta = train ? train.etaHours : 4;
  return new Date(new Date(shift.appearancePlanned).getTime() + eta * 60 * 60 * 1000);
}

function createShift(driverId, trainId, appearancePlanned) {
  const train = state.trains.find(t => t.id === trainId);
  const etaHours = train ? train.etaHours : 4;
  const releasePlanned = new Date(new Date(appearancePlanned).getTime() + etaHours * 60 * 60 * 1000).toISOString();
  const newShift = {
    id: "shift_" + Date.now(),
    driverId,
    trainId,
    appearancePlanned,
    releasePlanned,
    appearanceActual: null,
    releaseActual: null,
    status: "active",
    actualDurationHours: null,
    logs: [
      { time: getSimulatedDateTime().toISOString(), type: "info", text: "Планирано назначение на влак." }
    ]
  };

  state.shifts.push(newShift);
  saveToLocalStorage();
  showToast("Успешно планирано дежурство!", "success");
}

function startShift(shiftId, actualTime) {
  const shift = state.shifts.find(s => s.id === shiftId);
  if (shift) {
    shift.appearanceActual = actualTime;
    shift.logs.push({
      time: getSimulatedDateTime().toISOString(),
      type: "info",
      text: `Действително явяване на работа в ${formatTime(actualTime)}.`
    });
    saveToLocalStorage();
    showToast("Смяната започна успешно!", "success");
  }
}

function closeShift(shiftId, releaseTime) {
  const shift = state.shifts.find(s => s.id === shiftId);
  if (shift) {
    shift.releaseActual = releaseTime;
    shift.status = "completed";

    // Изчисляване на продължителност
    const appTime = new Date(shift.appearanceActual || shift.appearancePlanned);
    const relTime = new Date(releaseTime);
    const durationHours = parseFloat(((relTime - appTime) / (60 * 60 * 1000)).toFixed(2));
    shift.actualDurationHours = durationHours;

    shift.logs.push({
      time: getSimulatedDateTime().toISOString(),
      type: "info",
      text: `Действително освобождаване от работа в ${formatTime(releaseTime)}. Общо времетраене: ${durationHours} часа.`
    });

    // Акумулиране на часове към профила
    const driver = state.drivers.find(d => d.id === shift.driverId);
    if (driver) {
      driver.monthlyWorked = parseFloat((driver.monthlyWorked + durationHours).toFixed(2));
      driver.quarterlyWorked = parseFloat((driver.quarterlyWorked + durationHours).toFixed(2));
      driver.yearlyWorked = parseFloat((driver.yearlyWorked + durationHours).toFixed(2));
    }

    saveToLocalStorage();
    showToast("Дежурството бе затворено успешно! Часовете са акумулирани.", "success");
  }
}

function logOperationalEvent(shiftId, type, reason, note) {
  const shift = state.shifts.find(s => s.id === shiftId);
  if (shift) {
    const timeStr = getSimulatedDateTime().toISOString();
    shift.logs.push({
      time: timeStr,
      type: type, // 'delay', 'cancel', 'reassign'
      text: `Промяна: ${reason}. Забележка: ${note || "няма"}`
    });

    if (type === 'cancel') {
      shift.status = 'cancelled';
      shift.releaseActual = timeStr; // Освобождава се веднага
      shift.actualDurationHours = 0;
    }

    saveToLocalStorage();
    showToast(`Оперативното събитие е записано (${reason})`, "warning");
  }
}

// ==========================================
// ВИЗУАЛИЗАЦИЯ И РЕНДИРАНЕ (DOM)
// ==========================================

// Рендиране на Gantt времевата линия
function renderGanttTimeline() {
  const gridContainer = document.getElementById("gantt-grid");
  if (!gridContainer) return;

  const hourRow = gridContainer.querySelector(".timeline-hours-row");
  gridContainer.innerHTML = "";
  gridContainer.appendChild(hourRow);

  const selectedDateStr = state.timelineDate;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  let filteredDrivers = [...state.drivers];
  if (state.timelineDriverFilter) {
    if (state.timelineDriverFilter.startsWith("depot:")) {
      const depot = state.timelineDriverFilter.slice(6);
      filteredDrivers = filteredDrivers.filter(d => d.depot === depot);
    } else {
      filteredDrivers = filteredDrivers.filter(d => d.id === state.timelineDriverFilter);
    }
  }
  const sortedDrivers = filteredDrivers.sort((a,b) => a.name.localeCompare(b.name, 'bg'));

  sortedDrivers.forEach(driver => {
    const driverState = getDriverStateAtCurrentTime(driver.id);
    
    const row = document.createElement("div");
    row.className = "timeline-row";
    row.dataset.driverId = driver.id;

    const metaCell = document.createElement("div");
    metaCell.className = "driver-meta-cell";
    
    let statusClass = "available";
    let statusBG = "Свободен";
    if (driverState.status === "resting") {
      statusClass = "resting";
      statusBG = "В почивка";
    } else if (driverState.status === "absent") {
      statusClass = "absent";
      statusBG = driverState.absenceType;
    } else if (driverState.status === "active") {
      statusClass = "resting";
      statusBG = "На смяна";
    }

    metaCell.innerHTML = `
      <div class="driver-meta-name" title="${driver.name}">${driver.name}</div>
      <div class="driver-meta-sub">
        <span class="depot-badge">${driver.depot}</span>
        <span class="status-indicator ${statusClass}">● ${statusBG}</span>
      </div>
      <div class="driver-meta-tags">
        ${driver.competencies.map(c => {
          const cleanTag = c.replace("Серия ", "");
          return `<span class="competency-tag">${cleanTag}</span>`;
        }).join("")}
      </div>
    `;

    metaCell.style.cursor = "pointer";
    metaCell.addEventListener("click", () => {
      openSchedulingFormForDriver(driver.id);
    });

    const barsCell = document.createElement("div");
    barsCell.className = "timeline-bars-cell";

    const dayStart = new Date(`${selectedDateStr}T00:00:00`);
    const dayEnd = new Date(`${selectedDateStr}T23:59:59`);

    const driverDayShifts = state.shifts.filter(s => s.driverId === driver.id && s.status !== 'cancelled');
    
    driverDayShifts.forEach(shift => {
      const actualBounds = getActualBounds(shift);
      const isClosed = !!actualBounds;

      const pStart = new Date(shift.appearancePlanned);
      const pEnd = getPlannedEnd(shift);
      const pStartLim = Math.max(pStart, dayStart);
      const pEndLim = Math.min(pEnd, dayEnd);

      if (pStartLim < pEndLim) {
        const left = ((pStartLim - dayStart) / (24 * 60 * 60 * 1000)) * 100;
        const width = ((pEndLim - pStartLim) / (24 * 60 * 60 * 1000)) * 100;
        const hrs = ((pEnd - pStart) / (60 * 60 * 1000)).toFixed(1);

        const b = document.createElement("div");
        b.className = "time-block duty-planned";
        if (isClosed) b.classList.add("duty-overlap");
        b.style.left = left + "%";
        b.style.width = width + "%";
        b.innerHTML = `<span class="block-title">План: ${shift.trainId}</span><span class="block-time">${formatTime(pStart)} - ${formatTime(pEnd)} (${hrs}ч)</span>`;
        b.addEventListener("click", (e) => { e.stopPropagation(); openShiftManagementModal(shift); });
        barsCell.appendChild(b);
      }

      if (isClosed) {
        const aStart = actualBounds.start;
        const aEnd = actualBounds.end;
        const aStartLim = Math.max(aStart, dayStart);
        const aEndLim = Math.min(aEnd, dayEnd);

        if (aStartLim < aEndLim) {
          const left = ((aStartLim - dayStart) / (24 * 60 * 60 * 1000)) * 100;
          const width = ((aEndLim - aStartLim) / (24 * 60 * 60 * 1000)) * 100;
          const hrs = shift.actualDurationHours || ((aEnd - aStart) / (60 * 60 * 1000));

          const b = document.createElement("div");
          b.className = "time-block duty-actual";
          b.style.left = left + "%";
          b.style.width = width + "%";
          b.style.zIndex = "2";
          b.innerHTML = `<span class="block-title">Факт: ${shift.trainId}</span><span class="block-time">${formatTime(aStart)} - ${formatTime(aEnd)} (${typeof hrs === 'number' ? hrs.toFixed(1) : hrs}ч)</span>`;
          b.addEventListener("click", (e) => { e.stopPropagation(); openShiftManagementModal(shift); });
          barsCell.appendChild(b);
        }
      }

      if (shift.releaseActual) {
        const relTime = new Date(shift.releaseActual);
        const restEndTime = new Date(relTime.getTime() + 16 * 60 * 60 * 1000);
        
        const restStartLimit = Math.max(relTime, dayStart);
        const restEndLimit = Math.min(restEndTime, dayEnd);

        if (restStartLimit < restEndLimit) {
          const leftPercent = ((restStartLimit - dayStart) / (24 * 60 * 60 * 1000)) * 100;
          const widthPercent = ((restEndLimit - restStartLimit) / (24 * 60 * 60 * 1000)) * 100;

          const block = document.createElement("div");
          block.className = "time-block rest";
          block.style.left = `${leftPercent}%`;
          block.style.width = `${widthPercent}%`;
          block.innerHTML = `
            <span class="block-title">Задължителна почивка</span>
            <span class="block-time">до ${formatTime(restEndTime)}</span>
          `;
          
          barsCell.appendChild(block);
        }
      }
    });

    driver.absences.forEach(absence => {
      const absStart = new Date(absence.start);
      const absEnd = new Date(absence.end);
      
      const startLimit = Math.max(absStart, dayStart);
      const endLimit = Math.min(absEnd, dayEnd);

      if (startLimit < endLimit) {
        const leftPercent = ((startLimit - dayStart) / (24 * 60 * 60 * 1000)) * 100;
        const widthPercent = ((endLimit - startLimit) / (24 * 60 * 60 * 1000)) * 100;

        const behavior = getAbsenceBehavior(absence);

        const block = document.createElement("div");
        block.className = `time-block ${behavior.colorClass}`;
        block.style.left = `${leftPercent}%`;
        block.style.width = `${widthPercent}%`;
        let label = behavior.label;
        if ((absence.type === 'Service' || absence.type === 'Personal') && absence.explanation) {
          label += `: ${absence.explanation}`;
        }
        block.innerHTML = `
          <span class="block-title">${label}</span>
          <span class="block-time">${absStart.getDate()}.${absStart.getMonth()+1} - ${absEnd.getDate()}.${absEnd.getMonth()+1}</span>
        `;
        
        barsCell.appendChild(block);
      }
    });

    barsCell.addEventListener("click", () => {
      openSchedulingFormForDriver(driver.id);
    });

    row.appendChild(metaCell);
    row.appendChild(barsCell);
    gridContainer.appendChild(row);
  });
}

// Попълване на падащото меню за филтриране на служители във времевата линия
function populateTimelineDriverFilter() {
  const sel = document.getElementById("timeline-driver-filter");
  if (!sel) return;
  const currentVal = sel.value;
  sel.innerHTML = `<option value="">-- Всички служители --</option>`;

  const depotOrder = ["Русе", "Плевен", "Горна Оряховица", "Каспичан"];
  const grouped = {};
  state.drivers.forEach(d => {
    if (!grouped[d.depot]) grouped[d.depot] = [];
    grouped[d.depot].push(d);
  });

  depotOrder.forEach(depot => {
    const drivers = grouped[depot];
    if (!drivers || drivers.length === 0) return;
    const depotOpt = document.createElement("option");
    depotOpt.value = `depot:${depot}`;
    depotOpt.textContent = `🚉 Депо ${depot} (всички)`;
    sel.appendChild(depotOpt);
    const group = document.createElement("optgroup");
    group.label = `Депо ${depot}`;
    drivers.sort((a, b) => a.name.localeCompare(b.name, 'bg')).forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = d.name;
      group.appendChild(opt);
    });
    sel.appendChild(group);
  });

  if (currentVal) sel.value = currentVal;
}

function getTimelineDateParts() {
  const now = new Date();
  const m = now.getMonth() + state.timelineMonthOffset;
  return { year: now.getFullYear() + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
}

function prevTimelineMonth() { state.timelineMonthOffset--; syncTimelineDateToOffset(); updateUI(); }
function nextTimelineMonth() { state.timelineMonthOffset++; syncTimelineDateToOffset(); updateUI(); }

function syncTimelineDateToOffset() {
  const { year, month } = getTimelineDateParts();
  const day = Math.min(parseInt(state.timelineDate.split('-')[2]) || 1, new Date(year, month + 1, 0).getDate());
  state.timelineDate = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

function updateTimelineTitle() {
  const titleEl = document.getElementById("timeline-title");
  if (!titleEl) return;
  const bgMonths = ["Януари","Февруари","Март","Април","Май","Юни","Юли","Август","Септември","Октомври","Ноември","Декември"];
  if (state.timelineViewMode === "24h") {
    const d = new Date(state.timelineDate);
    titleEl.textContent = `24-часов графичен поглед — ${d.getDate()} ${bgMonths[d.getMonth()]} ${d.getFullYear()}г.`;
  } else {
    const now = new Date();
    const m = now.getMonth() + calendarMonthOffset;
    const y = now.getFullYear() + Math.floor(m / 12);
    const mo = ((m % 12) + 12) % 12;
    titleEl.textContent = `Месечен календар — ${bgMonths[mo]} ${y}г.`;
  }
}

// Актуализиране на плъзгача за дати в 24-часовия изглед
function updateTimelineDateSlider() {
  const wrapper = document.getElementById("date-slider-wrapper");
  const slider = document.getElementById("timeline-date-slider");
  const label = document.getElementById("timeline-date-label");
  if (!slider || !label) return;

  if (state.timelineViewMode === "24h") {
    if (wrapper) wrapper.style.display = "flex";
    const { year, month } = getTimelineDateParts();
    const bgMonths = ["Януари","Февруари","Март","Април","Май","Юни","Юли","Август","Септември","Октомври","Ноември","Декември"];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    slider.min = 1;
    slider.max = daysInMonth;
    const currentDay = parseInt(state.timelineDate.split('-')[2]) || 1;
    slider.value = Math.min(currentDay, daysInMonth);
    const d = new Date(year, month, parseInt(slider.value));
    label.textContent = `${d.getDate()} ${bgMonths[d.getMonth()]} ${d.getFullYear()}г.`;
  } else {
    if (wrapper) wrapper.style.display = "none";
  }
}

// Рендиране на месечен календар
let calendarMonthOffset = 0;

function prevCalendarMonth() { calendarMonthOffset--; renderMonthCalendar(); }
function nextCalendarMonth() { calendarMonthOffset++; renderMonthCalendar(); }

function renderMonthCalendar() {
  const container = document.getElementById("month-calendar");
  if (!container) return;

  const now = new Date();
  const year = now.getFullYear() + Math.floor((now.getMonth() + calendarMonthOffset) / 12);
  const month = ((now.getMonth() + calendarMonthOffset) % 12 + 12) % 12;
  const today = (calendarMonthOffset === 0) ? now.getDate() : 0;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const bgDays = ["Пон","Вто","Сря","Чет","Пет","Съб","Нед"];
  const bgMonths = ["Януари","Февруари","Март","Април","Май","Юни","Юли","Август","Септември","Октомври","Ноември","Декември"];

  container.innerHTML = "";

  const navRow = document.createElement("div");
  navRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;";
  navRow.innerHTML = `<button class="btn btn-sm" onclick="prevCalendarMonth()">&larr; ${bgMonths[(month+11)%12]}</button>
    <span style="font-weight:700;font-size:1.1rem;">${bgMonths[month]} ${year}г.</span>
    <button class="btn btn-sm" onclick="nextCalendarMonth()">${bgMonths[(month+1)%12]} &rarr;</button>`;
  container.appendChild(navRow);

  const header = document.createElement("div");
  header.className = "month-calendar-header";
  bgDays.forEach(d => {
    const cell = document.createElement("div");
    cell.className = "calendar-day-header";
    cell.textContent = d;
    header.appendChild(cell);
  });
  container.appendChild(header);

  const grid = document.createElement("div");
  grid.className = "month-calendar-grid";

  const startOffset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;
  for (let i = 0; i < startOffset; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-cell empty";
    grid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement("div");
    cell.className = "calendar-cell";
    if (day === today && calendarMonthOffset === 0) cell.classList.add("today");

    const dayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayStart = new Date(`${dayStr}T00:00:00`);
    const dayEnd = new Date(`${dayStr}T23:59:59`);

    let driversToShow = [...state.drivers];
    if (state.timelineDriverFilter) {
      if (state.timelineDriverFilter.startsWith("depot:")) {
        const depot = state.timelineDriverFilter.slice(6);
        driversToShow = driversToShow.filter(d => d.depot === depot);
      } else {
        driversToShow = driversToShow.filter(d => d.id === state.timelineDriverFilter);
      }
    }

    const dayShifts = [];
    const dayHasAbsence = [];

    const dayEndMs = dayEnd.getTime();
    const dayStartMs = dayStart.getTime();
    const dayDurationMs = 24 * 60 * 60 * 1000;

    for (const driver of driversToShow) {
      const driverShifts = state.shifts.filter(s => s.driverId === driver.id && s.status !== 'cancelled');
      driverShifts.forEach(shift => {
        const appTime = new Date(shift.appearancePlanned);
        const relTime = shift.releaseActual ? new Date(shift.releaseActual) : null;
        if (appTime <= dayEnd && (!relTime || relTime >= dayStart)) {
          const overlapStart = Math.max(appTime.getTime(), dayStartMs);
          const overlapEnd = relTime ? Math.min(relTime.getTime(), dayEndMs) : Math.min(Date.now(), dayEndMs);
          const leftPct = ((overlapStart - dayStartMs) / dayDurationMs) * 100;
          const widthPct = ((overlapEnd - overlapStart) / dayDurationMs) * 100;
          dayShifts.push({ shift, leftPct, widthPct });
        }
      });

      driver.absences.forEach(abs => {
        const absStart = new Date(abs.start);
        const absEnd = new Date(abs.end);
        if (absStart <= dayEnd && absEnd >= dayStart) {
          dayHasAbsence.push(abs);
        }
      });
    }

    const hasAbsence = dayHasAbsence.length > 0;
    const hasShift = dayShifts.length > 0;

    const absDot = hasAbsence ? '<span class="cal-indicator cal-absence"></span>' : '';
    const restDot = (() => {
      for (const d of driversToShow) {
        const completedShifts = state.shifts
          .filter(s => s.driverId === d.id && s.status === 'completed' && s.releaseActual)
          .sort((a, b) => new Date(b.releaseActual) - new Date(a.releaseActual));
        for (const s of completedShifts) {
          const relTime = new Date(s.releaseActual);
          const restEnd = new Date(relTime.getTime() + 16 * 60 * 60 * 1000);
          if (dayStartMs >= relTime.getTime() && dayStartMs < restEnd.getTime()) {
            return '<span class="cal-indicator cal-rest"></span>';
          }
        }
      }
      return '';
    })();

    let shiftBarsHTML = '';
    if (hasShift) {
      shiftBarsHTML = '<div class="cal-shift-track">';
      dayShifts.forEach(({ shift, leftPct, widthPct }) => {
        const appStr = formatTime(shift.appearancePlanned);
        const relStr = shift.releaseActual ? formatTime(shift.releaseActual) : 'сега';
        shiftBarsHTML += `<div class="cal-shift-bar" style="left:${leftPct}%;width:${Math.max(widthPct, 2)}%;" title="${shift.trainId} (${appStr} - ${relStr})"></div>`;
      });
      shiftBarsHTML += '</div>';
    }

    const dayOfWeek = new Date(year, month, day).getDay();
    const bgDayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    let titleInfo = `${day} ${bgDays[bgDayIndex]}`;
    if (hasShift) {
      titleInfo += `\nДежурства: ${dayShifts.map(s => `${s.shift.trainId} (${formatTime(s.shift.appearancePlanned)}-${s.shift.releaseActual ? formatTime(s.shift.releaseActual) : 'сега'})`).join(", ")}`;
    }
    if (hasAbsence) {
      titleInfo += `\nОтсъствия: ${dayHasAbsence.map(a => a.typeBG || a.type).join(", ")}`;
    }

    cell.innerHTML = `<div class="cal-day-number">${day}</div>${shiftBarsHTML}<div class="cal-indicators">${restDot}${absDot}</div>`;
    cell.title = titleInfo;

    if (hasAbsence) cell.classList.add("has-absence");
    if (hasShift) cell.classList.add("has-shift");

    cell.addEventListener("click", () => {
      state.timelineDate = dayStr;
      state.timelineMonthOffset = calendarMonthOffset;
      state.timelineViewMode = "24h";
      updateUI();
    });

    grid.appendChild(cell);
  }

  container.appendChild(grid);
}

/**
 * Изчислява състоянието на даден шофьор спрямо сегашното време
 */
function getDriverStateAtCurrentTime(driverId) {
  const driver = state.drivers.find(d => d.id === driverId);
  const currentTime = getSimulatedDateTime();

  // 1. Проверка за отсъствие
  for (const absence of driver.absences) {
    const absStart = new Date(absence.start);
    const absEnd = new Date(absence.end);
    if (currentTime >= absStart && currentTime <= absEnd) {
      return { status: "absent", absenceType: absence.typeBG };
    }
  }

  // 2. Проверка за активна смяна в момента
  const activeShift = state.shifts.find(s => s.driverId === driverId && s.status === 'active');
  if (activeShift) {
    return { status: "active", shift: activeShift };
  }

  // 3. Проверка за почивка
  const completedShifts = state.shifts
    .filter(s => s.driverId === driverId && s.status === 'completed' && s.releaseActual)
    .sort((a, b) => new Date(b.releaseActual) - new Date(a.releaseActual));

  if (completedShifts.length > 0) {
    const lastRelease = new Date(completedShifts[0].releaseActual);
    const nextEarliestAppearance = new Date(lastRelease.getTime() + 16 * 60 * 60 * 1000);
    if (currentTime < nextEarliestAppearance) {
      return { status: "resting", restUntil: nextEarliestAppearance };
    }
  }

  return { status: "available" };
}

// Популиране на филтрираните водачи в селекторите за смени
function populateDepotDropdowns() {
  const depotSelect = document.getElementById("shift-depot-select");
  if (!depotSelect) return;

  const currentSelection = depotSelect.value;
  depotSelect.innerHTML = `<option value="">-- Всички депа --</option>`;

  const depots = [...new Set(state.drivers.map(d => d.depot))].sort();
  depots.forEach(depot => {
    const option = document.createElement("option");
    option.value = depot;
    option.textContent = `Депо ${depot}`;
    depotSelect.appendChild(option);
  });

  if (currentSelection) depotSelect.value = currentSelection;
}

function populateDriverDropdowns() {
  const driverSelect = document.getElementById("shift-driver-select");
  if (!driverSelect) return;

  const currentSelection = driverSelect.value;
  driverSelect.innerHTML = `<option value="">-- Празно --</option>`;

  // Взимаме планираното време от формата
  const plannedTimeInput = document.getElementById("shift-planned-time");
  let targetTime = getSimulatedDateTime();
  if (plannedTimeInput && plannedTimeInput.value) {
    targetTime = new Date(plannedTimeInput.value);
  }

  // Взимаме избраното депо
  const depotSelect = document.getElementById("shift-depot-select");
  const selectedDepot = depotSelect ? depotSelect.value : "";

  // Взимаме избрания влак (за проверка на правоспособност)
  const trainSelect = document.getElementById("shift-train-select");
  const selectedTrainId = trainSelect ? trainSelect.value : "";
  const selectedTrain = state.trains.find(t => t.id === selectedTrainId);

  // Определяне на целевата дата за проверка на дублиране
  let targetDateStr = "";
  if (plannedTimeInput && plannedTimeInput.value) {
    targetDateStr = plannedTimeInput.value.split("T")[0];
  } else {
    targetDateStr = getTodayDateStr();
  }
  const alreadyAssigned = getAssignedDriverIdsOnDate(targetDateStr);

  const eligible = [];

  // Филтриране на водачите
  state.drivers.forEach(driver => {
    // Филтър по депо
    if (selectedDepot && driver.depot !== selectedDepot) return;

    // Скриваме ако вече е назначен на същата дата
    if (alreadyAssigned.has(driver.id)) return;

    let absenceBlockLevel = null;
    let absenceLabel = null;
    for (const abs of driver.absences) {
      const absStart = new Date(abs.start);
      const absEnd = new Date(abs.end);
      if (targetTime >= absStart && targetTime <= absEnd) {
        const behavior = getAbsenceBehavior(abs);
        absenceBlockLevel = behavior.blockLevel;
        absenceLabel = behavior.label;
        break;
      }
    }

    // Скриваме ако отсъствието блокира
    if (absenceBlockLevel === 'block') return;

    // Проверка за правоспособност и почивка спрямо избрания влак
    if (selectedTrainId && selectedTrain) {
      const rules = checkBusinessRules(driver.id, selectedTrainId, targetTime.toISOString());
      // Скриваме ако не отговаря на твърдите правила
      if (rules.rest.status === 'red' || rules.competence.status === 'red') return;
    }

    // Изчисляване на почивка от последната смяна (в часове)
    const driverShifts = state.shifts
      .filter(s => s.driverId === driver.id && s.status === 'completed' && s.releaseActual)
      .sort((a, b) => new Date(b.releaseActual) - new Date(a.releaseActual));
    let restHours = 999;
    if (driverShifts.length > 0) {
      restHours = (targetTime - new Date(driverShifts[0].releaseActual)) / (1000 * 60 * 60);
    }

    // Изчисляване откога не е карал този влак (в дни)
    const pastShifts = state.shifts
      .filter(s => s.driverId === driver.id && s.trainId === selectedTrainId)
      .sort((a, b) => new Date(b.appearancePlanned) - new Date(a.appearancePlanned));
    let daysSinceLastTrain = 9999;
    if (pastShifts.length > 0) {
      daysSinceLastTrain = (targetTime - new Date(pastShifts[0].appearancePlanned)) / (1000 * 60 * 60 * 24);
    }

    const driverState = getDriverStateAtCurrentTime(driver.id);
    let suffix = " (Свободен)";
    if (absenceBlockLevel === 'warn') {
      suffix = ` ⚠️ (${absenceLabel})`;
    } else if (driverState.status === 'resting') {
      suffix = ` (Почива до ${formatTime(driverState.restUntil)})`;
    } else if (driverState.status === 'active') {
      suffix = ` (На влак ${driverState.shift.trainId})`;
    }

    eligible.push({ driver, absenceBlockLevel, suffix, restHours, daysSinceLastTrain });
  });

  const noAbsence = eligible.filter(e => e.absenceBlockLevel !== 'warn');
  const withWarn = eligible.filter(e => e.absenceBlockLevel === 'warn');

  const sortFn = (a, b) => {
    if (b.restHours !== a.restHours) return b.restHours - a.restHours;
    return b.daysSinceLastTrain - a.daysSinceLastTrain;
  };
  noAbsence.sort(sortFn);
  withWarn.sort(sortFn);

  const renderGroup = (items, label) => {
    if (items.length === 0) return;
    const group = document.createElement("optgroup");
    group.label = label;
    items.forEach(e => {
      const opt = document.createElement("option");
      opt.value = e.driver.id;
      opt.textContent = `${e.driver.name}${e.suffix}`;
      group.appendChild(opt);
    });
    driverSelect.appendChild(group);
  };

  renderGroup(noAbsence, "✅ Налични (без заявена почивка)");
  renderGroup(withWarn, "⚠️ Свободни с предупреждение");

  if (currentSelection) {
    driverSelect.value = currentSelection;
  }
}

// Популиране на селектора с влакове
function populateTrainDropdowns() {
  const trainSelect = document.getElementById("shift-train-select");
  if (!trainSelect) return;

  const currentSelection = trainSelect.value;
  trainSelect.innerHTML = `<option value="">-- Изберете Влак / Редовен шаблон --</option>`;

  state.trains.forEach(train => {
    const option = document.createElement("option");
    option.value = train.id;
    option.textContent = `${train.id} [${train.series}] (${train.route})`;
    trainSelect.appendChild(option);
  });

  if (currentSelection) {
    trainSelect.value = currentSelection;
  }
}

// Рендиране на панела с норми по длъжности
function renderPositionNorms() {
  const container = document.getElementById("position-norms-container");
  if (!container) return;

  container.innerHTML = "";
  const positions = Object.keys(state.positionNorms);
  if (positions.length === 0) {
    container.innerHTML = '<span style="color:var(--text-muted);font-size:0.85rem;">Няма зададени норми.</span>';
    return;
  }

  positions.forEach(pos => {
    const item = document.createElement("div");
    item.className = "norm-item";
    item.innerHTML = `
      <label>${pos}</label>
      <div class="norm-input-row">
        <input type="number" class="norm-input" data-position="${pos}" value="${state.positionNorms[pos]}" min="80" max="240" step="1">
        <span style="font-size:0.75rem;color:var(--text-muted);white-space:nowrap;">ч/мес</span>
      </div>
    `;
    container.appendChild(item);
  });
}

function savePositionNorms() {
  const inputs = document.querySelectorAll("#position-norms-container .norm-input");
  inputs.forEach(input => {
    const pos = input.dataset.position;
    const val = parseInt(input.value);
    if (pos && val > 0) {
      state.positionNorms[pos] = val;
      // Актуализиране на нормите на всички служители с тази длъжност
      state.drivers.forEach(d => {
        if (d.position === pos) {
          d.monthlyNorm = val;
          d.quarterlyNorm = val * 3;
          d.yearlyNorm = val * 12;
        }
      });
    }
  });
  saveToLocalStorage();
  renderCrewProfiles();
  showToast("Нормите са запазени и приложени към служителите!", "success");
}

// Помощна функция за рендиране на карта на служител
function renderDriverCard(driver) {
  const card = document.createElement("div");
  card.className = "glass crew-card";

  const monthPct = Math.min((driver.monthlyWorked / driver.monthlyNorm) * 100, 100);
  let monthBarClass = "normal";
  if (driver.monthlyWorked >= driver.monthlyNorm) monthBarClass = "overtime";
  else if (driver.monthlyWorked >= driver.monthlyNorm - 15) monthBarClass = "warning";

  const qPct = Math.min((driver.quarterlyWorked / driver.quarterlyNorm) * 100, 100);
  let qBarClass = "normal";
  if (driver.quarterlyWorked >= driver.quarterlyNorm - 30) qBarClass = "warning";

  // Годишен извънреден труд = общо отработено - норма за изминалите месеци
  const monthsElapsed = new Date().getMonth() + 1;
  const expectedYtd = monthsElapsed * driver.monthlyNorm;
  const yearlyOvertime = Math.max(0, driver.yearlyWorked - expectedYtd);
  let yBarClass = "normal";
  if (yearlyOvertime > 100 && yearlyOvertime <= 150) yBarClass = "warning";
  if (yearlyOvertime > 150) yBarClass = "overtime";

  let activeAbsenceHTML = "";
  if (driver.absences.length > 0) {
    activeAbsenceHTML = `<div style="border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 6px;">
      <span class="crew-info-label" style="margin-bottom: 4px; display: block;">Отсъствия:</span>
      ${driver.absences.map(abs => {
        const behavior = getAbsenceBehavior(abs);
        const colorMap = {
          'absence-vacation-requested': '#9ca3af',
          'absence-vacation-approved': '#3b82f6',
          'absence-sick-requested': '#f59e0b',
          'absence-sick-presented': '#f43f5e',
          'absence-service': '#f97316',
          'absence-personal': '#f97316'
        };
        const color = colorMap[behavior.colorClass] || '#f43f5e';
        let extra = "";
        if ((abs.type === 'Service' || abs.type === 'Personal') && abs.explanation) {
          extra = ` <span style="font-size:0.7rem;color:var(--text-muted)">(${abs.explanation})</span>`;
        }
        return `<div style="display:flex;justify-content:space-between;align-items:center;font-size:0.8rem;margin-bottom:4px;color:${color}">
          <span>${behavior.label}${extra} (${formatDate(abs.start)} - ${formatDate(abs.end)})</span>
          <span style="display:flex;gap:4px;flex-shrink:0;">
            <button class="btn-icon" onclick="showAbsenceModal('${driver.id}','${abs.id}')" style="font-size:0.7rem;padding:2px 6px;">✏️</button>
            <button class="btn-icon btn-icon-danger" onclick="deleteAbsence('${driver.id}','${abs.id}')" style="font-size:0.7rem;padding:2px 6px;">❌</button>
          </span>
        </div>`;
      }).join("")}
    </div>`;
  }

  const fullName = `${driver.firstName || ""} ${driver.middleName || ""} ${driver.lastName || ""}`.trim() || driver.name || "Няма име";

  let phonesHTML = "";
  if (driver.phones && driver.phones.length > 0) {
    phonesHTML = driver.phones.map(p => {
      return `
      <div style="display:flex; justify-content:space-between; width: 100%; font-size: 0.75rem; color: #fff; margin-bottom: 2px;">
        <span style="color: var(--text-muted);">${p.description || "Личен"}:</span>
        <span style="font-weight: 500;">${p.number}</span>
      </div>`;
    }).join("");
  } else if (driver.phone) {
    phonesHTML = `
    <div style="display:flex; justify-content:space-between; width: 100%; font-size: 0.75rem; color: #fff; margin-bottom: 2px;">
      <span style="color: var(--text-muted);">Личен:</span>
      <span style="font-weight: 500;">${driver.phone}</span>
    </div>`;
  } else {
    phonesHTML = `
    <div style="display:flex; justify-content:space-between; width: 100%; font-size: 0.75rem; color: #fff; margin-bottom: 2px;">
      <span style="color: var(--text-muted);">Телефон:</span>
      <span style="font-weight: 500;">-</span>
    </div>`;
  }

  card.innerHTML = `
  <div class="crew-card-header">
    <div class="crew-card-name">${fullName}</div>
    <div class="crew-card-depot">Депо ${driver.depot}</div>
  </div>

  <div class="crew-info-row">
    <span class="crew-info-label">Табелен номер:</span>
    <span class="crew-info-value">#${driver.id}</span>
  </div>

  <div class="crew-info-row">
    <span class="crew-info-label">Длъжност:</span>
    <span class="crew-info-value">${driver.position || "Машинист"}</span>
  </div>

  <div class="crew-info-row">
    <span class="crew-info-label">Местоживеене:</span>
    <span class="crew-info-value">${driver.residence || driver.depot}</span>
  </div>

  <div class="crew-info-row" style="flex-direction: column; align-items: flex-start; gap: 4px; border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 6px;">
    <span class="crew-info-label" style="margin-bottom: 2px;">Телефони за връзка:</span>
    ${phonesHTML}
  </div>

  <div class="crew-info-row">
    <span class="crew-info-label">Компетенции:</span>
    <span class="crew-info-value" style="text-align: right; max-width: 60%;">${driver.competencies.join(", ")}</span>
  </div>

  ${activeAbsenceHTML}

  <div class="progress-container">
    <div class="progress-header">
      <span>📅 Месечен Баланс</span>
      <span><strong>${driver.monthlyWorked}</strong> / ${driver.monthlyNorm} ч</span>
    </div>
    <div class="progress-bar-bg">
      <div class="progress-bar-fill ${monthBarClass}" style="width: ${monthPct}%"></div>
    </div>
  </div>

  <div class="progress-container">
    <div class="progress-header">
      <span>📅 Тримесечен Баланс</span>
      <span><strong>${driver.quarterlyWorked}</strong> / ${driver.quarterlyNorm} ч</span>
    </div>
    <div class="progress-bar-bg">
      <div class="progress-bar-fill ${qBarClass}" style="width: ${qPct}%"></div>
    </div>
  </div>

  <div class="progress-container">
    <div class="progress-header">
      <span>📅 Извънреден труд (годишен)</span>
      <span style="font-weight:700;color:${yBarClass === 'normal' ? 'var(--color-success)' : yBarClass === 'warning' ? 'var(--color-warning)' : 'var(--color-danger)'}">${yearlyOvertime.toFixed(1)} ч над нормата</span>
    </div>
    <div class="progress-bar-bg">
      <div class="progress-bar-fill ${yBarClass}" style="width: ${Math.min((yearlyOvertime / 200) * 100, 100)}%"></div>
    </div>
  </div>

  <div class="crew-card-actions">
    <button class="btn-icon" onclick="showCrewModal('${driver.id}')">✏️ Редактиране</button>
    <button class="btn-icon" onclick="showAbsenceModal('${driver.id}')">📅 Отсъствие</button>
    <button class="btn-icon btn-icon-danger" onclick="deleteCrew('${driver.id}')">❌ Изтриване</button>
  </div>
  `;

  return card;
}

// Рендиране на профилите в таб "Служители", групирани по депа
function renderCrewProfiles() {
  const crewContainer = document.getElementById("crew-profiles-list");
  if (!crewContainer) return;

  renderPositionNorms();

  crewContainer.innerHTML = "";

  // Групиране на служителите по депа
  const depots = {};
  const depotOrder = ["Русе", "Плевен", "Горна Оряховица", "Каспичан"];
  state.drivers.forEach(d => {
    if (!depots[d.depot]) depots[d.depot] = [];
    depots[d.depot].push(d);
  });

  depotOrder.forEach(depot => {
    const drivers = depots[depot];
    if (!drivers || drivers.length === 0) return;

    // Секция за депото
    const section = document.createElement("div");
    section.className = "crew-depot-section";

    const header = document.createElement("div");
    header.className = "crew-depot-header";
    const posCounts = {};
    drivers.forEach(d => { posCounts[d.position] = (posCounts[d.position] || 0) + 1; });
    const posSummary = Object.entries(posCounts)
      .map(([pos, count]) => `${pos}: ${count}`)
      .join(" | ");
    header.innerHTML = `
      <span style="font-size:1.3rem;">🚉</span>
      <h4>Депо ${depot}</h4>
      <span class="crew-depot-count">${posSummary}</span>
    `;
    section.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "crew-grid";

    // Сортиране на служителите по име в рамките на депото
    drivers.sort((a, b) => a.name.localeCompare(b.name, 'bg')).forEach(d => {
      grid.appendChild(renderDriverCard(d));
    });

    section.appendChild(grid);
    crewContainer.appendChild(section);
  });

  // Ако има депа извън стандартния списък
  Object.keys(depots).forEach(depot => {
    if (depotOrder.includes(depot)) return;
    const drivers = depots[depot];
    const section = document.createElement("div");
    section.className = "crew-depot-section";
    const header = document.createElement("div");
    header.className = "crew-depot-header";
    const posCounts = {};
    drivers.forEach(d => { posCounts[d.position] = (posCounts[d.position] || 0) + 1; });
    const posSummary = Object.entries(posCounts)
      .map(([pos, count]) => `${pos}: ${count}`)
      .join(" | ");
    header.innerHTML = `<span style="font-size:1.3rem;">🚉</span><h4>Депо ${depot}</h4><span class="crew-depot-count">${posSummary}</span>`;
    section.appendChild(header);
    const grid = document.createElement("div");
    grid.className = "crew-grid";
    drivers.sort((a, b) => a.name.localeCompare(b.name, 'bg')).forEach(d => {
      grid.appendChild(renderDriverCard(d));
    });
    section.appendChild(grid);
    crewContainer.appendChild(section);
  });
}

// Рендиране на таблицата за Управление на Влакове
function renderTrainsManagement() {
  const tbody = document.getElementById("trains-table-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  state.trains.forEach(train => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight: 700; color: #fff;">${train.id}</td>
      <td><span class="competency-tag" style="font-size:0.8rem; padding: 3px 8px;">${train.series}</span></td>
      <td>${train.route}</td>
      <td>${train.etaHours} часа</td>
      <td class="action-btns-cell">
        <button class="btn btn-secondary btn-sm" onclick="editTrainTrigger('${train.id}')">Редакция</button>
        <button class="btn btn-danger btn-sm" onclick="deleteTrainTrigger('${train.id}')">Изтриване</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Рендиране на бързите шаблони за влакове
function renderTrainTemplates() {
  const container = document.getElementById("quick-templates");
  if (!container) return;

  container.innerHTML = "";

  state.trains.slice(0, 6).forEach(train => {
    const btn = document.createElement("button");
    btn.className = "template-btn";
    btn.innerHTML = `
      <span class="template-id">${train.id}</span>
      <span class="template-route">${train.route}</span>
      <span class="template-series">${train.series}</span>
    `;

    btn.addEventListener("click", () => {
      const trainSelect = document.getElementById("shift-train-select");
      if (trainSelect) {
        trainSelect.value = train.id;
        // Извикваме промяната ръчно
        trainSelect.dispatchEvent(new Event("change"));
        showToast(`Зареден шаблон за ${train.id}`, "info");
      }
    });

    container.appendChild(btn);
  });
}

// ==========================================
// СЪБИТИЯ И КОНТРОЛИ НА ИНТЕРФЕЙСА
// ==========================================

function openSchedulingFormForDriver(driverId) {
  // Сменяме таба на "Панел за Смени"
  switchTab("shift-manager");
  
  // Изчакваме рендирането и избираме водача
  setTimeout(() => {
    const driverSelect = document.getElementById("shift-driver-select");
    if (driverSelect) {
      driverSelect.value = driverId;
      driverSelect.dispatchEvent(new Event("change"));
    }
  }, 50);
}

// Отваряне на модален прозорец за управление на активна / приключена смяна
function computeWaybillDuration(waybills) {
  if (!waybills || waybills.length === 0) return 0;
  return waybills.reduce((sum, wb) => {
    if (wb.start && wb.end) {
      return sum + Math.max(0, (new Date(wb.end) - new Date(wb.start)) / (60 * 60 * 1000));
    }
    return sum;
  }, 0);
}

function getActualBounds(shift) {
  if (shift.waybills && shift.waybills.length > 0) {
    const starts = shift.waybills.filter(w => w.start).map(w => new Date(w.start));
    const ends = shift.waybills.filter(w => w.end).map(w => new Date(w.end));
    if (starts.length > 0 && ends.length > 0) {
      const minStart = new Date(Math.min(...starts));
      const totalHrs = computeWaybillDuration(shift.waybills);
      return { start: minStart, end: new Date(minStart.getTime() + totalHrs * 60 * 60 * 1000) };
    }
  }
  if (shift.appearanceActual && shift.releaseActual) {
    return { start: new Date(shift.appearanceActual), end: new Date(shift.releaseActual) };
  }
  return null;
}

function renderWaybills(container, list) {
  container.innerHTML = "";
  if (!list || list.length === 0) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem;padding:8px 0;">Няма добавени пътни листи.</div>';
    return;
  }
  const nowVal = new Date().toISOString().slice(0, 16);
  list.forEach((wb, i) => {
    const d = document.createElement("div");
    d.style.cssText = "background:rgba(0,0,0,0.1);padding:12px;border-radius:8px;margin-bottom:8px;";
    d.innerHTML = `<div style="font-weight:600;margin-bottom:8px;font-size:0.85rem;">Пътен лист ${i+1}</div>
      <div class="form-row">
        <div><label style="font-size:0.75rem;">Начало (дата и час)</label>
          <input type="datetime-local" class="wb-start" value="${wb.start ? wb.start.slice(0,16) : nowVal}"></div>
        <div><label style="font-size:0.75rem;">Край (дата и час)</label>
          <input type="datetime-local" class="wb-end" value="${wb.end ? wb.end.slice(0,16) : nowVal}"></div>
      </div>`;
    container.appendChild(d);
  });
  container.querySelectorAll("input").forEach(inp => inp.addEventListener("input", updateWaybillDurationDisplay));
}

function updateWaybillDurationDisplay() {
  const starts = document.querySelectorAll("#modal-waybills-container .wb-start");
  const ends = document.querySelectorAll("#modal-waybills-container .wb-end");
  const waybills = [];
  for (let i = 0; i < starts.length; i++) {
    waybills.push({
      start: starts[i].value ? new Date(starts[i].value).toISOString() : null,
      end: ends[i].value ? new Date(ends[i].value).toISOString() : null
    });
  }
  const totalHrs = computeWaybillDuration(waybills);
  const el = document.getElementById("modal-shift-actual-dur");
  if (totalHrs > 0) el.textContent = totalHrs.toFixed(1) + "ч (от пътни листи)";
  else el.textContent = "-";
}

function saveWaybills(shift) {
  const n = parseInt(document.getElementById("modal-waybill-count").value);
  const starts = document.querySelectorAll("#modal-waybills-container .wb-start");
  const ends = document.querySelectorAll("#modal-waybills-container .wb-end");
  shift.waybills = [];
  for (let i = 0; i < n; i++) {
    shift.waybills.push({
      start: starts[i] && starts[i].value ? new Date(starts[i].value).toISOString() : null,
      end: ends[i] && ends[i].value ? new Date(ends[i].value).toISOString() : null
    });
  }
  const wbHrs = computeWaybillDuration(shift.waybills);
  if (wbHrs > 0) shift.actualDurationHours = wbHrs;
}

function closeShiftModal() {
  const m = document.getElementById("shift-modal");
  if (m._shift) { saveWaybills(m._shift); saveToLocalStorage(); m._shift = null; }
  m.classList.remove("active");
}

function saveShiftModal() {
  const m = document.getElementById("shift-modal");
  if (m._shift) { saveWaybills(m._shift); saveToLocalStorage(); showToast("Промените са запазени.", "success"); }
}

function openShiftManagementModal(shift) {
  const overlay = document.getElementById("shift-modal");
  const driver = state.drivers.find(d => d.id === shift.driverId);
  const train = state.trains.find(t => t.id === shift.trainId);
  overlay._shift = shift;

  document.getElementById("modal-shift-title").textContent = "Отчитане на дежурство: " + shift.trainId;
  document.getElementById("modal-shift-driver").textContent = driver ? driver.name : "Неизвестен";
  document.getElementById("modal-shift-route").textContent = train ? train.route : "-";

  const pHrs = ((getPlannedEnd(shift) - new Date(shift.appearancePlanned)) / (60 * 60 * 1000)).toFixed(1);
  document.getElementById("modal-shift-planned-dur").textContent = pHrs + "ч";

  if (!shift.waybills) shift.waybills = [];

  const wbHrs = computeWaybillDuration(shift.waybills);
  let aHrs = "-";
  if (wbHrs > 0) aHrs = wbHrs.toFixed(1) + "ч (от пътни листи)";
  else if (shift.appearanceActual && shift.releaseActual) {
    const s = new Date(shift.appearanceActual), e = new Date(shift.releaseActual);
    const h = shift.actualDurationHours || (e - s) / (60 * 60 * 1000);
    aHrs = (typeof h === 'number' ? h.toFixed(1) : h) + "ч";
  }
  document.getElementById("modal-shift-actual-dur").textContent = aHrs;

  const wbSel = document.getElementById("modal-waybill-count");
  const wbBox = document.getElementById("modal-waybills-container");
  wbSel.value = shift.waybills.length + "";
  renderWaybills(wbBox, shift.waybills);

  wbSel.onchange = function () {
    const n = parseInt(this.value);
    while (shift.waybills.length < n) shift.waybills.push({ start: null, end: null });
    while (shift.waybills.length > n) shift.waybills.pop();
    renderWaybills(wbBox, shift.waybills);
  };

  const act = document.getElementById("modal-active-controls");
  const inact = document.getElementById("modal-inactive-controls");
  const closeBtn = document.getElementById("modal-close-shift-btn");
  const evtBtn = document.getElementById("modal-save-event-btn");

  document.getElementById("modal-release-time").value = getSimulatedDateTime().toISOString().slice(0, 16);
  document.getElementById("modal-event-type").value = "delay";
  document.getElementById("modal-event-reason").value = "Локомотивна повреда";
  document.getElementById("modal-event-note").value = "";

  if (shift.status === "active") {
    act.style.display = "block";
    inact.style.display = "none";
    closeBtn.style.display = "inline-flex";

    const startBtn = document.getElementById("modal-start-shift-btn");
    if (!shift.appearanceActual) {
      startBtn.style.display = "inline-flex";
      startBtn.onclick = function () {
        saveWaybills(shift);
        startShift(shift.id, getSimulatedDateTime().toISOString());
        overlay.classList.remove("active");
        overlay._shift = null;
        updateUI();
      };
    } else {
      startBtn.style.display = "none";
    }

    closeBtn.onclick = function () {
      const t = document.getElementById("modal-release-time").value;
      if (!t) { showToast("Моля, въведете време на освобождаване!", "error"); return; }
      if (!shift.appearanceActual) shift.appearanceActual = shift.appearancePlanned;
      const iso = new Date(t).toISOString();
      if (new Date(iso) < new Date(shift.appearanceActual)) {
        showToast("Времето на освобождаване не може да е преди явяването!", "error");
        return;
      }
      saveWaybills(shift);
      closeShift(shift.id, iso);
      overlay.classList.remove("active");
      overlay._shift = null;
      updateUI();
    };

    evtBtn.onclick = function () {
      const tp = document.getElementById("modal-event-type").value;
      const r = document.getElementById("modal-event-reason").value;
      const n = document.getElementById("modal-event-note").value;
      logOperationalEvent(shift.id, tp, r, n);
      overlay.classList.remove("active");
      overlay._shift = null;
      updateUI();
    };
  } else {
    act.style.display = "none";
    inact.style.display = "block";
    closeBtn.style.display = "none";
    let h = "<strong>История на събитията:</strong><br>";
    shift.logs.forEach(l => { h += "• <span style='font-family:var(--font-mono)'>[" + formatTime(l.time) + "]</span> " + l.text + "<br>"; });
    document.getElementById("modal-shift-history").innerHTML = h;
  }

  overlay.classList.add("active");
}

// Актуализиране на светофара при избор на водач или влак във формата
function updateTrafficLight() {
  const driverId = document.getElementById("shift-driver-select").value;
  const trainId = document.getElementById("shift-train-select").value;
  const plannedTimeStr = document.getElementById("shift-planned-time").value;

  const btnApprove = document.getElementById("btn-finalize-scheduling");

  if (!driverId || !trainId || !plannedTimeStr) {
    if (btnApprove) btnApprove.disabled = true;
    return;
  }

  const plannedTime = new Date(plannedTimeStr).toISOString();
  const checks = checkBusinessRules(driverId, trainId, plannedTime);

  // Валидиране дали можем да финализираме (блокиране при RED статус на твърдите правила)
  const hasHardError = checks.rest.status === "red" || checks.competence.status === "red";
  if (btnApprove) {
    btnApprove.disabled = hasHardError;
  }
}

function resetTrafficLight() {
  // Traffic light UI е премахнат — функцията остава за съвместимост
}

// ==========================================
// УПРАВЛЕНИЕ НА ВЛАКОВЕ
// ==========================================

let editingTrainId = null;

function showTrainModal(trainId = null) {
  const modal = document.getElementById("train-modal");
  const title = document.getElementById("train-modal-title");
  
  if (trainId) {
    editingTrainId = trainId;
    title.textContent = "Редактиране на Влак";
    const train = state.trains.find(t => t.id === trainId);
    if (train) {
      document.getElementById("modal-train-id").value = train.id;
      document.getElementById("modal-train-id").disabled = true; // Забрана за промяна на ключа
      document.getElementById("modal-train-series").value = train.series;
      document.getElementById("modal-train-route").value = train.route;
      document.getElementById("modal-train-eta").value = train.etaHours;
    }
  } else {
    editingTrainId = null;
    title.textContent = "Добавяне на нов Влак";
    document.getElementById("modal-train-id").value = "";
    document.getElementById("modal-train-id").disabled = false;
    document.getElementById("modal-train-series").value = "Серия 40";
    document.getElementById("modal-train-route").value = "";
    document.getElementById("modal-train-eta").value = "4";
  }
  
  modal.classList.add("active");
}

function saveTrainTrigger() {
  const id = document.getElementById("modal-train-id").value.trim();
  const series = document.getElementById("modal-train-series").value;
  const route = document.getElementById("modal-train-route").value.trim();
  const etaHours = parseFloat(document.getElementById("modal-train-eta").value);

  if (!id || !route || isNaN(etaHours)) {
    showToast("Всички полета са задължителни!", "error");
    return;
  }

  if (editingTrainId) {
    // Редакция
    const train = state.trains.find(t => t.id === editingTrainId);
    if (train) {
      train.series = series;
      train.route = route;
      train.etaHours = etaHours;
      showToast("Влакът бе редактиран успешно!", "success");
    }
  } else {
    // Нов
    if (state.trains.some(t => t.id === id)) {
      showToast("Влак с този номер вече съществува!", "error");
      return;
    }
    state.trains.push({ id, series, route, etaHours });
    showToast("Новият влак бе добавен към шаблоните!", "success");
  }

  saveToLocalStorage();
  document.getElementById("train-modal").classList.remove("active");
  updateUI();
}

function editTrainTrigger(trainId) {
  showTrainModal(trainId);
}

function deleteTrainTrigger(trainId) {
  if (confirm(`Сигурни ли сте, че искате да изтриете влак ${trainId}?`)) {
    state.trains = state.trains.filter(t => t.id !== trainId);
    saveToLocalStorage();
    showToast("Влакът бе изтрит от списъка.", "warning");
    updateUI();
  }
}

// ==========================================
// УПРАВЛЕНИЕ НА ЛОКОМОТИВЕН ПЕРСОНАЛ (CRUD)
// ==========================================

let editingCrewId = null;

function addPhoneRowInput(number = "", description = "") {
  const container = document.getElementById("modal-crew-phones-container");
  if (!container) return;

  const row = document.createElement("div");
  row.className = "phone-row";
  row.style.display = "flex";
  row.style.gap = "8px";
  row.style.alignItems = "center";
  row.style.marginBottom = "6px";

  row.innerHTML = `
    <input type="text" placeholder="напр. 0888 123 456" class="phone-number" value="${number}" required style="flex: 1.2; background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); color: #fff; padding: 6px 10px; border-radius: 6px; font-size: 0.85rem;">
    <input type="text" placeholder="Пояснение (напр. Личен, Служебен)" class="phone-desc" value="${description}" required style="flex: 1; background: rgba(0,0,0,0.2); border: 1px solid var(--border-color); color: #fff; padding: 6px 10px; border-radius: 6px; font-size: 0.85rem;">
    <button type="button" class="btn-icon btn-icon-danger" onclick="this.parentElement.remove()" style="padding: 6px; flex: 0 0 auto; min-height: 32px;">❌</button>
  `;
  container.appendChild(row);
}

function showCrewModal(driverId = null) {
  const modal = document.getElementById("crew-modal");
  const title = document.getElementById("crew-modal-title");
  
  // Изчистване на чекбоксовете
  const checkboxes = document.querySelectorAll("#crew-modal input[name='competency']");
  checkboxes.forEach(cb => cb.checked = false);

  // Изчистване на контейнера за телефони
  const phonesContainer = document.getElementById("modal-crew-phones-container");
  if (phonesContainer) phonesContainer.innerHTML = "";

  if (driverId) {
    editingCrewId = driverId;
    title.textContent = "Редактиране на Служител";
    const driver = state.drivers.find(d => d.id === driverId);
    if (driver) {
      document.getElementById("modal-crew-first-name").value = driver.firstName || "";
      document.getElementById("modal-crew-middle-name").value = driver.middleName || "";
      document.getElementById("modal-crew-last-name").value = driver.lastName || "";
      document.getElementById("modal-crew-id").value = driver.id;
      document.getElementById("modal-crew-id").disabled = false; // Позволяваме редактиране на Табелен номер
      document.getElementById("modal-crew-position").value = driver.position || "Локомотивен машинист";
      document.getElementById("modal-crew-depot").value = driver.depot || "Русе";
      document.getElementById("modal-crew-residence").value = driver.residence || "";
      
      // Запълване на телефоните
      if (driver.phones && driver.phones.length > 0) {
        driver.phones.forEach(p => addPhoneRowInput(p.number, p.description));
      } else if (driver.phone) {
        addPhoneRowInput(driver.phone, "Личен");
      } else {
        addPhoneRowInput("", "Личен");
      }

      // Запълване на чекбоксовете за компетенции
      if (driver.competencies) {
        checkboxes.forEach(cb => {
          if (driver.competencies.includes(cb.value)) {
            cb.checked = true;
          }
        });
      }
    }
  } else {
    editingCrewId = null;
    title.textContent = "Добавяне на Служител";
    document.getElementById("modal-crew-first-name").value = "";
    document.getElementById("modal-crew-middle-name").value = "";
    document.getElementById("modal-crew-last-name").value = "";
    document.getElementById("modal-crew-id").value = "";
    document.getElementById("modal-crew-id").disabled = false;
    document.getElementById("modal-crew-position").value = "Локомотивен машинист";
    document.getElementById("modal-crew-depot").value = "Русе";
    document.getElementById("modal-crew-residence").value = "";
    
    // Първи празен ред за телефон по подразбиране
    addPhoneRowInput("", "Личен");
  }
  
  modal.classList.add("active");
}

function saveCrewTrigger() {
  const firstName = document.getElementById("modal-crew-first-name").value.trim();
  const middleName = document.getElementById("modal-crew-middle-name").value.trim();
  const lastName = document.getElementById("modal-crew-last-name").value.trim();
  const id = document.getElementById("modal-crew-id").value.trim();
  const position = document.getElementById("modal-crew-position").value;
  const depot = document.getElementById("modal-crew-depot").value;
  const residence = document.getElementById("modal-crew-residence").value.trim();

  // Събиране на телефоните
  const phoneRows = document.querySelectorAll("#modal-crew-phones-container .phone-row");
  const phones = [];
  phoneRows.forEach(row => {
    const number = row.querySelector(".phone-number").value.trim();
    const description = row.querySelector(".phone-desc").value.trim();
    if (number) {
      phones.push({ number, description: description || "Пояснение" });
    }
  });

  if (!firstName || !lastName || !id || !residence) {
    showToast("Всички полета са задължителни (без презиме)!", "error");
    return;
  }

  if (phones.length === 0) {
    showToast("Моля, въведете поне един телефон за връзка!", "error");
    return;
  }

  // Вземане на избраните правоспособности
  const checkboxes = document.querySelectorAll("#crew-modal input[name='competency']:checked");
  const competencies = Array.from(checkboxes).map(cb => cb.value);

  const fullName = `${firstName} ${middleName} ${lastName}`.replace(/\s+/g, ' ').trim();

  if (editingCrewId) {
    // Проверка дали новият табелен номер вече е зает от друг служител
    if (id !== editingCrewId && state.drivers.some(d => d.id === id)) {
      showToast("Служител с този табелен номер вече съществува!", "error");
      return;
    }

    // Редакция
    const driver = state.drivers.find(d => d.id === editingCrewId);
    if (driver) {
      const oldId = driver.id;
      driver.firstName = firstName;
      driver.middleName = middleName;
      driver.lastName = lastName;
      driver.name = fullName;
      driver.id = id; // Обновяваме табеления номер
      driver.position = position;
      driver.depot = depot;
      driver.residence = residence;
      driver.phones = phones;
      driver.phone = phones[0].number; // съвместимост назад
      driver.competencies = competencies;
      // Синхронизиране на норми според длъжността
      const normForPosition = state.positionNorms[position];
      if (normForPosition) {
        driver.monthlyNorm = normForPosition;
        driver.quarterlyNorm = normForPosition * 3;
        driver.yearlyNorm = normForPosition * 12;
      }

      // Обновяване на всички смени, които препращат към стария табелен номер, за да се запази интегритетът на базата
      if (oldId !== id) {
        state.shifts.forEach(shift => {
          if (shift.driverId === oldId) {
            shift.driverId = id;
          }
        });
      }

      showToast("Данните за служителя бяха актуализирани!", "success");
    }
  } else {
    // Нов служител
    if (state.drivers.some(d => d.id === id)) {
      showToast("Служител с този табелен номер вече съществува!", "error");
      return;
    }
    const newDriver = {
      id,
      firstName,
      middleName,
      lastName,
      name: fullName,
      phones,
      phone: phones[0].number, // съвместимост назад
      depot,
      position,
      residence,
      competencies,
      monthlyNorm: state.positionNorms[position] || 160,
      quarterlyNorm: (state.positionNorms[position] || 160) * 3,
      yearlyNorm: (state.positionNorms[position] || 160) * 12,
      monthlyWorked: 0,
      quarterlyWorked: 0,
      yearlyWorked: 0,
      absences: []
    };
    state.drivers.push(newDriver);
    showToast("Новият служител бе добавен успешно!", "success");
  }

  saveToLocalStorage();
  document.getElementById("crew-modal").classList.remove("active");
  updateUI();
}

function deleteCrew(driverId) {
  // Проверка за активни или планирани смени
  const activeOrPlannedShifts = state.shifts.filter(s => s.driverId === driverId && (s.status === 'active' || s.status === 'planned'));
  if (activeOrPlannedShifts.length > 0) {
    showToast("Не можете да изтриете служител с планирани или активни смени!", "error");
    return;
  }

  const driver = state.drivers.find(d => d.id === driverId);
  const fullName = driver ? `${driver.firstName} ${driver.lastName}` : driverId;

  if (confirm(`Сигурни ли сте, че искате да изтриете служител ${fullName} (Табелен № ${driverId})?`)) {
    state.drivers = state.drivers.filter(d => d.id !== driverId);
    saveToLocalStorage();
    showToast("Служителят бе премахнат от базата данни.", "warning");
    updateUI();
  }
}

// ==========================================
// УПРАВЛЕНИЕ НА ОТСЪСТВИЯ (CRUD)
// ==========================================

let editingAbsenceDriverId = null;
let editingAbsenceId = null;

function showAbsenceModal(driverId, absenceId = null) {
  const modal = document.getElementById("absence-modal");
  const title = document.getElementById("absence-modal-title");
  const driver = state.drivers.find(d => d.id === driverId);
  if (!driver) return;

  editingAbsenceDriverId = driverId;
  editingAbsenceId = absenceId;
  onAbsenceTypeChange();

  if (absenceId) {
    title.textContent = "Редактиране на Отсъствие";
    const absence = driver.absences.find(a => a.id === absenceId);
    if (absence) {
      document.getElementById("modal-absence-type").value = absence.type;
      onAbsenceTypeChange();
      document.getElementById("modal-absence-requested").checked = !!absence.requested;
      document.getElementById("modal-absence-approved").checked = !!absence.approved;
      document.getElementById("modal-absence-presented").checked = !!absence.presented;
      document.getElementById("modal-absence-explanation").value = absence.explanation || "";
      document.getElementById("modal-absence-start").value = absence.start.slice(0, 16);
      document.getElementById("modal-absence-end").value = absence.end.slice(0, 16);
    }
  } else {
    title.textContent = "Добавяне на Отсъствие";
    document.getElementById("modal-absence-type").value = "Vacation";
    onAbsenceTypeChange();
    document.getElementById("modal-absence-requested").checked = true;
    document.getElementById("modal-absence-approved").checked = false;
    document.getElementById("modal-absence-presented").checked = false;
    document.getElementById("modal-absence-explanation").value = "";
    const now = getSimulatedDateTime();
    const pad = (n) => String(n).padStart(2, '0');
    const startStr = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    document.getElementById("modal-absence-start").value = startStr;
    document.getElementById("modal-absence-end").value = startStr;
  }

  modal.classList.add("active");
}

function saveAbsenceTrigger() {
  const driver = state.drivers.find(d => d.id === editingAbsenceDriverId);
  if (!driver) {
    showToast("Грешка: Не е избран служител!", "error");
    return;
  }

  const type = document.getElementById("modal-absence-type").value;
  const requested = document.getElementById("modal-absence-requested").checked;
  const approved = document.getElementById("modal-absence-approved").checked;
  const presented = document.getElementById("modal-absence-presented").checked;
  const explanation = document.getElementById("modal-absence-explanation").value.trim();
  const start = document.getElementById("modal-absence-start").value;
  const end = document.getElementById("modal-absence-end").value;

  if (!start || !end) {
    showToast("Началото и краят са задължителни!", "error");
    return;
  }
  if (new Date(end) <= new Date(start)) {
    showToast("Краят трябва да е след началото!", "error");
    return;
  }
  if ((type === 'Service' || type === 'Personal') && !explanation) {
    showToast("Моля, въведете пояснение за ангажираността!", "error");
    return;
  }

  const typeBG = {
    Vacation: "Платен отпуск",
    Sick: "Медицински отпуск",
    Service: "Служебна ангажираност",
    Personal: "Лична ангажираност"
  }[type] || type;

  if (editingAbsenceId) {
    const absence = driver.absences.find(a => a.id === editingAbsenceId);
    if (absence) {
      absence.type = type;
      absence.typeBG = typeBG;
      absence.requested = requested;
      absence.approved = approved;
      absence.presented = presented;
      absence.explanation = explanation;
      absence.start = new Date(start).toISOString();
      absence.end = new Date(end).toISOString();
      showToast("Отсъствието бе редактирано!", "success");
    }
  } else {
    const newAbsence = {
      id: "abs_" + Date.now(),
      type,
      typeBG,
      requested,
      approved,
      presented,
      explanation,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString()
    };
    driver.absences.push(newAbsence);
    showToast("Отсъствието бе добавено!", "success");
  }

  saveToLocalStorage();
  document.getElementById("absence-modal").classList.remove("active");
  updateUI();
}

function deleteAbsence(driverId, absenceId) {
  const driver = state.drivers.find(d => d.id === driverId);
  if (!driver) return;

  if (confirm("Сигурни ли сте, че искате да изтриете това отсъствие?")) {
    driver.absences = driver.absences.filter(a => a.id !== absenceId);
    saveToLocalStorage();
    showToast("Отсъствието бе премахнато.", "warning");
    updateUI();
  }
}

// ==========================================
// ОСНОВНИ ФУНКЦИИ ЗА ОБНОВЯВАНЕ И ИНТЕРФЕЙС
// ==========================================

// ==========================================
// ЗАЯВЕНИ ВЛАКОВЕ (Assignations Table)
// ==========================================
function addAssignationRow() {
  state.assignations.push({
    id: "asgn_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
    date: state.assignationsDate,
    time: "05:00",
    location: "",
    trainId: "",
    driverId: "",
    assistantId: ""
  });
  saveToLocalStorage();
  renderAssignationsTable();
}

function removeAssignationRow(id) {
  state.assignations = state.assignations.filter(a => a.id !== id);
  saveToLocalStorage();
  renderAssignationsTable();
  if (state.assigningCell && state.assigningCell.rowId === id) {
    state.assigningCell = null;
    document.getElementById("btn-finalize-scheduling").textContent = "✅ Финализиране и Одобрение на Назначението";
  }
}

function prevAssignationsDay() {
  const d = new Date(state.assignationsDate);
  d.setDate(d.getDate() - 1);
  state.assignationsDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  renderAssignationsTable();
}

function nextAssignationsDay() {
  const d = new Date(state.assignationsDate);
  d.setDate(d.getDate() + 1);
  state.assignationsDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  renderAssignationsTable();
}

function renderAssignationsTable() {
  const tbody = document.getElementById("assignations-body");
  if (!tbody) return;

  const nextDayEl = document.getElementById("assignations-date");
  if (nextDayEl) {
    const d = new Date(state.assignationsDate);
    const bgMonths = ["Януари","Февруари","Март","Април","Май","Юни","Юли","Август","Септември","Октомври","Ноември","Декември"];
    nextDayEl.textContent = `${d.getDate()} ${bgMonths[d.getMonth()]} ${d.getFullYear()}г.`;
  }

  const filtered = state.assignations.filter(a => a.date === state.assignationsDate);

  tbody.innerHTML = "";
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;font-size:0.85rem;">Няма заявени влакове за тази дата.</td></tr>';
    return;
  }

  filtered.forEach((a, i) => {
    const tr = document.createElement("tr");
    const driverLabel = a.driverId
      ? `${a.driverId}`
      : "Избери...";
    const assistantLabel = a.assistantId
      ? `${a.assistantId}`
      : "Избери...";
    const driverIncompetent = a.driverId && a.trainId && !hasCompetencyForTrain(a.driverId, a.trainId);
    const asstIncompetent = a.assistantId && a.trainId && !hasCompetencyForTrain(a.assistantId, a.trainId);
    const first = i === 0;
    const last = i === filtered.length - 1;

    tr.innerHTML = `
      <td><input type="time" value="${a.time}" data-id="${a.id}" class="asgn-time-input"></td>
      <td><input type="text" value="${a.location}" data-id="${a.id}" class="asgn-location-input" placeholder="..." maxlength="3"></td>
      <td>
        <select data-id="${a.id}" class="asgn-train-select">
          <option value="">-- Изберете --</option>
          ${state.trains.map(t =>
            `<option value="${t.id}"${t.id === a.trainId ? " selected" : ""}>${t.id.replace("Влак ", "")}</option>`
          ).join("")}
        </select>
      </td>
      <td><span class="driver-cell${a.driverId ? " filled" : ""}${driverIncompetent ? " incompetent" : ""}" data-id="${a.id}" data-field="driverId">${driverLabel}</span></td>
      <td><span class="driver-cell${a.assistantId ? " filled" : ""}${asstIncompetent ? " incompetent" : ""}" data-id="${a.id}" data-field="assistantId">${assistantLabel}</span></td>
      <td>
        <button class="btn-move-row" data-id="${a.id}" data-dir="up" ${first ? "disabled" : ""} title="Премести нагоре">▲</button>
        <button class="btn-move-row" data-id="${a.id}" data-dir="down" ${last ? "disabled" : ""} title="Премести надолу">▼</button>
        <button class="btn-remove-row" data-id="${a.id}">&times;</button>
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Event listeners
  tbody.querySelectorAll(".asgn-time-input").forEach(inp => {
    inp.addEventListener("change", e => {
      const a = state.assignations.find(x => x.id === e.target.dataset.id);
      if (a) { a.time = e.target.value; saveToLocalStorage(); }
    });
  });

  tbody.querySelectorAll(".asgn-location-input").forEach(inp => {
    inp.addEventListener("change", e => {
      const a = state.assignations.find(x => x.id === e.target.dataset.id);
      if (a) { a.location = e.target.value; saveToLocalStorage(); }
    });
  });

  tbody.querySelectorAll(".asgn-train-select").forEach(sel => {
    sel.addEventListener("change", e => {
      const a = state.assignations.find(x => x.id === e.target.dataset.id);
      if (!a) return;
      a.trainId = e.target.value;
      saveToLocalStorage();
      const container = sel.closest("tr");
      const driverCell = container && container.querySelector('.driver-cell[data-field="driverId"]');
      const asstCell = container && container.querySelector('.driver-cell[data-field="assistantId"]');
      if (a.driverId) {
        const ok = checkCompetency(a.driverId, a.trainId);
        if (driverCell) driverCell.classList.toggle("incompetent", !ok);
      } else if (driverCell) {
        driverCell.classList.remove("incompetent");
      }
      if (a.assistantId) {
        const ok = checkCompetency(a.assistantId, a.trainId);
        if (asstCell) asstCell.classList.toggle("incompetent", !ok);
      } else if (asstCell) {
        asstCell.classList.remove("incompetent");
      }
    });
  });

  tbody.querySelectorAll(".driver-cell").forEach(cell => {
    cell.addEventListener("click", e => {
      const id = e.currentTarget.dataset.id;
      const field = e.currentTarget.dataset.field;
      startAssigningDriver(id, field);
    });
  });

  tbody.querySelectorAll(".btn-remove-row").forEach(btn => {
    btn.addEventListener("click", e => {
      removeAssignationRow(e.currentTarget.dataset.id);
    });
  });

  tbody.querySelectorAll(".btn-move-row").forEach(btn => {
    btn.addEventListener("click", e => {
      const id = e.currentTarget.dataset.id;
      const dir = e.currentTarget.dataset.dir;
      const filtered = state.assignations.filter(a => a.date === state.assignationsDate);
      const idx = filtered.findIndex(a => a.id === id);
      if (idx === -1) return;
      const swapIdx = dir === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= filtered.length) return;
      const realIdx = state.assignations.indexOf(filtered[idx]);
      const realSwapIdx = state.assignations.indexOf(filtered[swapIdx]);
      [state.assignations[realIdx], state.assignations[realSwapIdx]] = [state.assignations[realSwapIdx], state.assignations[realIdx]];
      saveToLocalStorage();
      renderAssignationsTable();
    });
  });
}

function startAssigningDriver(rowId, field) {
  const assignation = state.assignations.find(a => a.id === rowId);
  if (!assignation) return;

  state.assigningCell = { rowId, field };

  // Pre-fill the planning form
  const trainSelect = document.getElementById("shift-train-select");
  const timeInput = document.getElementById("shift-planned-time");
  if (trainSelect && assignation.trainId) {
    trainSelect.value = assignation.trainId;
    trainSelect.dispatchEvent(new Event("change"));
  }
  if (timeInput) {
    const nextDate = new Date(getTodayDateStr());
    nextDate.setDate(nextDate.getDate() + 1);
    const pad = n => String(n).padStart(2, "0");
    const timeParts = assignation.time.split(":");
    timeInput.value = `${nextDate.getFullYear()}-${pad(nextDate.getMonth()+1)}-${pad(nextDate.getDate())}T${pad(timeParts[0])}:${pad(timeParts[1])}`;
    timeInput.dispatchEvent(new Event("change"));
  }

  populateDriverDropdowns();

  // Change button text
  const btn = document.getElementById("btn-finalize-scheduling");
  if (btn) {
    btn.textContent = field === "driverId" ? "🎯 Задай машинист" : "🎯 Задай пом. машинист";
    btn.disabled = false;
    btn.dataset.assignMode = "true";
  }

  // Scroll to form
  document.getElementById("btn-finalize-scheduling")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function updateUI() {
  const now = new Date();
  const todayStr = getTodayDateStr();

  // Актуализиране на датата за "Назначен персонал"
  const nextDayEl = document.getElementById("next-day-date");
  if (nextDayEl) {
    const nextDate = new Date(todayStr);
    nextDate.setDate(nextDate.getDate() + 1);
    const bgMonths = ["Януари", "Февруари", "Март", "Април", "Май", "Юни", "Юли", "Август", "Септември", "Октомври", "Ноември", "Декември"];
    const day = nextDate.getDate();
    const month = bgMonths[nextDate.getMonth()];
    const year = nextDate.getFullYear();
    nextDayEl.textContent = `${day} ${month} ${year}г.`;
  }

  // Актуализиране на контролите на времевата линия
  populateTimelineDriverFilter();
  updateTimelineDateSlider();
  updateTimelineTitle();

  // Рендиране според избрания изглед
  const ganttContent = document.getElementById("gantt-timeline-container");
  const calendarContainer = document.getElementById("month-calendar");
  if (state.timelineViewMode === "24h") {
    if (ganttContent) ganttContent.style.display = "block";
    if (calendarContainer) calendarContainer.style.display = "none";
    renderGanttTimeline();
  } else {
    if (ganttContent) ganttContent.style.display = "none";
    if (calendarContainer) calendarContainer.style.display = "block";
    renderMonthCalendar();
  }

  populateDepotDropdowns();
  populateDriverDropdowns();
  populateTrainDropdowns();
  renderAssignationsTable();
  renderCrewProfiles();
  renderTrainsManagement();
  renderTrainTemplates();

  let totalDrivers = state.drivers.length;
  let availableDrivers = 0;
  let onShiftDrivers = 0;
  let absentDrivers = 0;

  state.drivers.forEach(d => {
    const drState = getDriverStateAtCurrentTime(d.id);
    if (drState.status === 'available') availableDrivers++;
    else if (drState.status === 'active') onShiftDrivers++;
    else if (drState.status === 'absent') absentDrivers++;
  });

  const elTotal = document.getElementById("stat-total");
  const elAvail = document.getElementById("stat-available");
  const elActive = document.getElementById("stat-active");
  const elAbsent = document.getElementById("stat-absent");

  if (elTotal) elTotal.textContent = totalDrivers;
  if (elAvail) elAvail.textContent = availableDrivers;
  if (elActive) elActive.textContent = onShiftDrivers;
  if (elAbsent) elAbsent.textContent = absentDrivers;
}

// Toast известия
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  
  let icon = "ℹ️";
  if (type === "success") icon = "🟢";
  else if (type === "error") icon = "🔴";
  else if (type === "warning") icon = "⚠️";

  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(toast);

  // Автоматично премахване след 3 секунди
  setTimeout(() => {
    toast.style.animation = "slideIn 0.3s ease reverse";
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}

// Смяна на табовете в главното меню
function switchTab(tabId) {
  const tabs = document.querySelectorAll(".tab-content");
  const navItems = document.querySelectorAll(".nav-item");

  tabs.forEach(tab => {
    if (tab.id === tabId) tab.classList.add("active");
    else tab.classList.remove("active");
  });

  navItems.forEach(item => {
    if (item.dataset.tab === tabId) item.classList.add("active");
    else item.classList.remove("active");
  });

  // Reset assign mode on tab switch
  if (state.assigningCell) {
    state.assigningCell = null;
    const btn = document.getElementById("btn-finalize-scheduling");
    if (btn) {
      btn.textContent = "✅ Финализиране и Одобрение на Назначението";
      btn.dataset.assignMode = "";
    }
  }
}

// Свързване на слушатели при зареждане
document.addEventListener("DOMContentLoaded", () => {
  initData();

  // Инициализиране на формата за планиране с текущото време
  const plannedTimeInput = document.getElementById("shift-planned-time");
  if (plannedTimeInput) {
    const now = new Date();
    const pad = (num) => String(num).padStart(2, '0');
    plannedTimeInput.value = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }

  // Обновяване на интерфейса
  updateUI();

  // Слушатели за навигация
  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach(item => {
    item.addEventListener("click", () => {
      switchTab(item.dataset.tab);
    });
  });

  // Слушатели за контролите на времевата линия
  const driverFilter = document.getElementById("timeline-driver-filter");
  if (driverFilter) {
    driverFilter.addEventListener("change", () => {
      state.timelineDriverFilter = driverFilter.value;
      updateUI();
    });
  }

  const viewToggles = document.querySelectorAll(".view-toggle-btn");
  viewToggles.forEach(btn => {
    btn.addEventListener("click", () => {
      viewToggles.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.timelineViewMode = btn.dataset.view;
      updateUI();
    });
  });

  const dateSlider = document.getElementById("timeline-date-slider");
  if (dateSlider) {
    dateSlider.addEventListener("input", () => {
      const { year, month } = getTimelineDateParts();
      const day = parseInt(dateSlider.value);
      state.timelineDate = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      updateUI();
    });
  }

  const prevMonthBtn = document.getElementById("prev-month-btn");
  const nextMonthBtn = document.getElementById("next-month-btn");
  if (prevMonthBtn) prevMonthBtn.addEventListener("click", prevTimelineMonth);
  if (nextMonthBtn) nextMonthBtn.addEventListener("click", nextTimelineMonth);

  // Слушатели за формата за планиране
  const driverSelect = document.getElementById("shift-driver-select");
  const trainSelect = document.getElementById("shift-train-select");
  
  const depotSelect = document.getElementById("shift-depot-select");
  if (depotSelect) {
    depotSelect.addEventListener("change", () => {
      populateDriverDropdowns();
      updateTrafficLight();
    });
  }
  if (driverSelect) driverSelect.addEventListener("change", updateTrafficLight);
  if (trainSelect) {
    trainSelect.addEventListener("change", (e) => {
      const selectedTrain = state.trains.find(t => t.id === e.target.value);
      if (selectedTrain) {
        const routeInfo = document.getElementById("train-route-info");
        if (routeInfo) {
          routeInfo.innerHTML = `
            📍 <strong>Маршрут:</strong> ${selectedTrain.route} <br>
            🚂 <strong>Изискван Локомотив:</strong> ${selectedTrain.series} <br>
            ⏱️ <strong>ETA времетраене:</strong> ${selectedTrain.etaHours}ч
          `;
        }
      } else {
        const routeInfo = document.getElementById("train-route-info");
        if (routeInfo) routeInfo.innerHTML = "Изберете влак, за да видите маршрута му.";
      }
      populateDriverDropdowns();
      updateTrafficLight();
    });
  }
  if (plannedTimeInput) {
    plannedTimeInput.addEventListener("change", () => {
      populateDriverDropdowns();
      updateTrafficLight();
    });
  }

  // Затваряне на модални прозорци
  const closeButtons = document.querySelectorAll(".close-btn");
  closeButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const modals = document.querySelectorAll(".modal-overlay");
      modals.forEach(m => m.classList.remove("active"));
    });
  });

  // Действие при Финализиране на смяна / Задаване на машинист
  const btnFinalize = document.getElementById("btn-finalize-scheduling");
  if (btnFinalize) {
    btnFinalize.addEventListener("click", () => {
      const driverId = driverSelect.value;
      const trainId = trainSelect.value;
      const plannedTime = plannedTimeInput.value;

      if (state.assigningCell) {
        if (!driverId) {
          const assignation = state.assignations.find(a => a.id === state.assigningCell.rowId);
          if (assignation && assignation[state.assigningCell.field]) {
            if (!confirm("Премахване на назначението?")) return;
            assignation[state.assigningCell.field] = null;
            saveToLocalStorage();
            renderAssignationsTable();
            showToast("Назначението е премахнато.", "info");
            state.assigningCell = null;
            btnFinalize.textContent = "✅ Финализиране и Одобрение на Назначението";
            btnFinalize.dataset.assignMode = "";
            btnFinalize.disabled = true;
            driverSelect.value = "";
            trainSelect.value = "";
            const routeInfo = document.getElementById("train-route-info");
            if (routeInfo) routeInfo.innerHTML = "Изберете влак, за да видите маршрута му.";
            resetTrafficLight();
            return;
          }
          showToast("Няма назначение за премахване.", "error");
          return;
        }

        const assignation = state.assignations.find(a => a.id === state.assigningCell.rowId);
        if (!assignation) return;
        if (!trainId || !plannedTime) {
          showToast("Моля, изберете влак!", "error");
          return;
        }
        if (assignation.trainId && !hasCompetencyForTrain(driverId, assignation.trainId)) {
          const driver = state.drivers.find(d => d.id === driverId);
          const train = state.trains.find(t => t.id === assignation.trainId);
          showToast(`❌ ${driver ? driver.name : 'Машинист №'+driverId} няма правоспособност за ${train ? train.series : 'тази серия'}!`, "error");
          return;
        }

        assignation[state.assigningCell.field] = driverId;
        saveToLocalStorage();
        renderAssignationsTable();
        showToast(`Машинист №${driverId} зададен успешно!`, "success");

        state.assigningCell = null;
        btnFinalize.textContent = "✅ Финализиране и Одобрение на Назначението";
        btnFinalize.dataset.assignMode = "";
        btnFinalize.disabled = true;
        driverSelect.value = "";
        trainSelect.value = "";
        const routeInfo = document.getElementById("train-route-info");
        if (routeInfo) routeInfo.innerHTML = "Изберете влак, за да видите маршрута му.";
        resetTrafficLight();
        return;
      }

      showToast("Първо изберете клетка за машинист или помощник-машинист от таблицата с заявени влакове!", "error");
    });
  }

  // Свиване/Разширяване на страничното меню
  const toggleBtn = document.getElementById("sidebar-toggle");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      document.querySelector(".app-container").classList.toggle("collapsed");
    });
  }
});
