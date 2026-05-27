// app.js - Логически двигател и визуализация на диспечерския пулт

// Инициализация на състоянието на системата
let state = {
  drivers: [],
  trains: [],
  shifts: [],
  positionNorms: {},
  assignations: [],
  assigningCell: null,
  // Текущо диспечерско време за симулацията: 22 Май 2026г.
  currentDateStr: "2026-05-22",
  currentHour: 16, // по подразбиране е 16:00
  currentMinute: 0
};

// Зареждане на данни при стартиране
function initData() {
  const storedDrivers = localStorage.getItem("dispatch_drivers");
  const storedTrains = localStorage.getItem("dispatch_trains");
  const storedShifts = localStorage.getItem("dispatch_shifts");
  const storedTime = localStorage.getItem("dispatch_sim_time");
  const storedAssignations = localStorage.getItem("dispatch_assignations");

  const storedNorms = localStorage.getItem("dispatch_position_norms");

  if (storedDrivers && storedTrains && storedShifts) {
    state.drivers = JSON.parse(storedDrivers);
    state.trains = JSON.parse(storedTrains);
    state.shifts = JSON.parse(storedShifts);
    if (storedAssignations) state.assignations = JSON.parse(storedAssignations);
    
    // Зареждане на норми по длъжности
    if (storedNorms) {
      state.positionNorms = JSON.parse(storedNorms);
    } else {
      state.positionNorms = typeof DEFAULT_POSITION_NORMS !== 'undefined' ? {...DEFAULT_POSITION_NORMS} : {};
    }

    // Миграция за нови полета на локомотивен персонал
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
      // Миграция за нови полета на отсъствия
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
      // Подсигуряване на норми според длъжността
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
    // Използваме подготвените данни от mockData.js (ако са достъпни)
    state.drivers = typeof DEFAULT_DRIVERS !== 'undefined' ? DEFAULT_DRIVERS : [];
    state.trains = typeof DEFAULT_TRAINS !== 'undefined' ? DEFAULT_TRAINS : [];
    state.shifts = typeof DEFAULT_SHIFTS !== 'undefined' ? DEFAULT_SHIFTS : [];
    state.positionNorms = typeof DEFAULT_POSITION_NORMS !== 'undefined' ? {...DEFAULT_POSITION_NORMS} : {};
    saveToLocalStorage();
  }

  if (storedTime) {
    const timeObj = JSON.parse(storedTime);
    state.currentHour = timeObj.hour;
    state.currentMinute = timeObj.minute;
  }
}

function saveToLocalStorage() {
  localStorage.setItem("dispatch_drivers", JSON.stringify(state.drivers));
  localStorage.setItem("dispatch_trains", JSON.stringify(state.trains));
  localStorage.setItem("dispatch_shifts", JSON.stringify(state.shifts));
  localStorage.setItem("dispatch_assignations", JSON.stringify(state.assignations));
  localStorage.setItem("dispatch_position_norms", JSON.stringify(state.positionNorms));
  localStorage.setItem("dispatch_sim_time", JSON.stringify({ hour: state.currentHour, minute: state.currentMinute }));
}

// Форматиране на дати за улеснение
function getSimulatedDateTime() {
  const pad = (num) => String(num).padStart(2, '0');
  return new Date(`${state.currentDateStr}T${pad(state.currentHour)}:${pad(state.currentMinute)}:00`);
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
  // Проверка в assignations (винаги за следващия ден спрямо currentDateStr)
  const nextDate = new Date(state.currentDateStr);
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

function createShift(driverId, trainId, appearancePlanned) {
  const train = state.trains.find(t => t.id === trainId);
  const newShift = {
    id: "shift_" + Date.now(),
    driverId,
    trainId,
    appearancePlanned,
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

  // Изчистване на редовете с изключение на заглавната лента с часове
  const hourRow = gridContainer.querySelector(".timeline-hours-row");
  gridContainer.innerHTML = "";
  gridContainer.appendChild(hourRow);

  // Сортиране на водачите по име
  const sortedDrivers = [...state.drivers].sort((a,b) => a.name.localeCompare(b.name, 'bg'));

  sortedDrivers.forEach(driver => {
    // Взимаме текущото състояние на водача за деня
    const driverState = getDriverStateAtCurrentTime(driver.id);
    
    // Създаване на ред за Gantt
    const row = document.createElement("div");
    row.className = "timeline-row";
    row.dataset.driverId = driver.id;

    // Лява клетка с метаданни за водача
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
      statusClass = "resting"; // Цветът е оранжев/активен
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

    // Клик върху метаданните отваря формата за планиране с преселектиран водач
    metaCell.style.cursor = "pointer";
    metaCell.addEventListener("click", () => {
      openSchedulingFormForDriver(driver.id);
    });

    // Дясна клетка с времеви блокове
    const barsCell = document.createElement("div");
    barsCell.className = "timeline-bars-cell";

    // Начертаване на вертикалния диспечерски маркер
    const marker = document.createElement("div");
    marker.className = "current-time-marker";
    const markerPos = ((state.currentHour * 60 + state.currentMinute) / (24 * 60)) * 100;
    marker.style.left = `${markerPos}%`;
    barsCell.appendChild(marker);

    // Взимаме всички активности за този шофьор, засичащи текущия ден
    const dayStart = new Date(`${state.currentDateStr}T00:00:00`);
    const dayEnd = new Date(`${state.currentDateStr}T23:59:59`);

    // 1. Смени за деня
    const driverDayShifts = state.shifts.filter(s => s.driverId === driver.id && s.status !== 'cancelled');
    
    driverDayShifts.forEach(shift => {
      const appTime = new Date(shift.appearancePlanned);
      
      // Блок за самата смяна
      const startLimit = Math.max(appTime, dayStart);
      const shiftEnd = shift.releaseActual ? new Date(shift.releaseActual) : getSimulatedDateTime();
      const endLimit = Math.min(shiftEnd, dayEnd);

      if (startLimit < endLimit) {
        const leftPercent = ((startLimit - dayStart) / (24 * 60 * 60 * 1000)) * 100;
        const widthPercent = ((endLimit - startLimit) / (24 * 60 * 60 * 1000)) * 100;

        const block = document.createElement("div");
        block.className = "time-block duty";
        block.style.left = `${leftPercent}%`;
        block.style.width = `${widthPercent}%`;
        
        let label = shift.trainId;
        if (shift.status === 'active') {
          label += " (Активен)";
        }
        
        block.innerHTML = `
          <span class="block-title">${label}</span>
          <span class="block-time">${formatTime(appTime)} - ${shift.releaseActual ? formatTime(shift.releaseActual) : "сега"}</span>
        `;

        // Клик върху смяна отваря панела за приключване или логване
        block.addEventListener("click", (e) => {
          e.stopPropagation();
          openShiftManagementModal(shift);
        });

        barsCell.appendChild(block);
      }

      // Блок за 16-часовата ПОЧИВКА след освобождаване
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

    // 2. Отсъствия за деня
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

    // Клик върху празно място на времевата скала отваря формата за планиране
    barsCell.addEventListener("click", () => {
      openSchedulingFormForDriver(driver.id);
    });

    row.appendChild(metaCell);
    row.appendChild(barsCell);
    gridContainer.appendChild(row);
  });
}

/**
 * Изчислява състоянието на даден шофьор спрямо сегашното диспечерско време
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
  driverSelect.innerHTML = `<option value="">-- Изберете локомотивен машинист --</option>`;

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
    targetDateStr = state.currentDateStr;
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
  const monthsElapsed = parseInt(state.currentDateStr.split('-')[1]) || 5;
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

// Рендиране на последните оперативни логове на главния екран
function renderRecentLogs() {
  const container = document.getElementById("operational-logs-list");
  if (!container) return;

  container.innerHTML = "";

  // Обединяваме всички логове от всички смени
  let allLogs = [];
  state.shifts.forEach(shift => {
    const driver = state.drivers.find(d => d.id === shift.driverId);
    shift.logs.forEach(log => {
      allLogs.push({
        time: log.time,
        type: log.type || 'info',
        text: `[${driver ? driver.name.split(' ')[0] : 'Машинист'} - ${shift.trainId}] ${log.text}`
      });
    });
  });

  // Сортиране по време низходящо
  allLogs.sort((a,b) => new Date(b.time) - new Date(a.time));

  allLogs.slice(0, 10).forEach(log => {
    const div = document.createElement("div");
    div.className = `log-item ${log.type}`;
    div.innerHTML = `
      <span class="log-text">${log.text}</span>
      <span class="log-time">${formatTime(log.time)}</span>
    `;
    container.appendChild(div);
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
function openShiftManagementModal(shift) {
  const overlay = document.getElementById("shift-modal");
  const driver = state.drivers.find(d => d.id === shift.driverId);
  const train = state.trains.find(t => t.id === shift.trainId);

  document.getElementById("modal-shift-title").textContent = `Управление на смяна: ${shift.trainId}`;
  document.getElementById("modal-shift-driver").textContent = driver ? driver.name : "Неизвестен";
  document.getElementById("modal-shift-route").textContent = train ? train.route : "-";
  document.getElementById("modal-shift-planned").textContent = formatDate(shift.appearancePlanned);
  document.getElementById("modal-shift-actual").textContent = formatDate(shift.appearanceActual || "Не се е явил");
  
  // Бутони и контроли спрямо статуса
  const activeControls = document.getElementById("modal-active-controls");
  const inactiveControls = document.getElementById("modal-inactive-controls");
  const closeBtn = document.getElementById("modal-close-shift-btn");
  const saveEventBtn = document.getElementById("modal-save-event-btn");

  // Нулиране на стойности
  document.getElementById("modal-release-time").value = getSimulatedDateTime().toISOString().slice(0, 16);
  document.getElementById("modal-event-type").value = "delay";
  document.getElementById("modal-event-reason").value = "Локомотивна повреда";
  document.getElementById("modal-event-note").value = "";

  if (shift.status === 'active') {
    activeControls.style.display = "block";
    inactiveControls.style.display = "none";
    closeBtn.style.display = "inline-flex";
    
    // Ако не се е явил още реално, позволяваме да започне смяната
    const startBtn = document.getElementById("modal-start-shift-btn");
    if (!shift.appearanceActual) {
      startBtn.style.display = "inline-flex";
      startBtn.onclick = () => {
        startShift(shift.id, getSimulatedDateTime().toISOString());
        overlay.classList.remove("active");
        updateUI();
      };
    } else {
      startBtn.style.display = "none";
    }

    closeBtn.onclick = () => {
      const relTime = document.getElementById("modal-release-time").value;
      if (!relTime) {
        showToast("Моля, въведете време на освобождаване!", "error");
        return;
      }
      
      // Действително време на явяване се проверява
      if (!shift.appearanceActual) {
        // Ако не се е явил реално, записваме явяването като планираното
        shift.appearanceActual = shift.appearancePlanned;
      }

      const releaseISO = new Date(relTime).toISOString();
      if (new Date(releaseISO) < new Date(shift.appearanceActual)) {
        showToast("Времето на освобождаване не може да е преди явяването!", "error");
        return;
      }

      closeShift(shift.id, releaseISO);
      overlay.classList.remove("active");
      updateUI();
    };

    saveEventBtn.onclick = () => {
      const type = document.getElementById("modal-event-type").value;
      const reason = document.getElementById("modal-event-reason").value;
      const note = document.getElementById("modal-event-note").value;
      
      logOperationalEvent(shift.id, type, reason, note);
      overlay.classList.remove("active");
      updateUI();
    };

  } else {
    activeControls.style.display = "none";
    inactiveControls.style.display = "block";
    closeBtn.style.display = "none";
    
    let historyHTML = `<strong>История на събитията:</strong><br>`;
    shift.logs.forEach(log => {
      historyHTML += `• <span style="font-family:var(--font-mono)">[${formatTime(log.time)}]</span> ${log.text}<br>`;
    });
    document.getElementById("modal-shift-history").innerHTML = historyHTML;
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
    const startStr = `${state.currentDateStr}T${pad(state.currentHour)}:${pad(state.currentMinute)}`;
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

function renderAssignationsTable() {
  const tbody = document.getElementById("assignations-body");
  if (!tbody) return;

  const nextDayEl = document.getElementById("assignations-date");
  if (nextDayEl) {
    const nextDate = new Date(state.currentDateStr);
    nextDate.setDate(nextDate.getDate() + 1);
    const bgMonths = ["Януари","Февруари","Март","Април","Май","Юни","Юли","Август","Септември","Октомври","Ноември","Декември"];
    nextDayEl.textContent = `${nextDate.getDate()} ${bgMonths[nextDate.getMonth()]} ${nextDate.getFullYear()}г.`;
  }

  tbody.innerHTML = "";
  if (state.assignations.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:24px;font-size:0.85rem;">Все още няма заявени влакове. Натиснете "+ Добави ред"</td></tr>';
    return;
  }

  state.assignations.forEach(a => {
    const tr = document.createElement("tr");
    const driverLabel = a.driverId
      ? `${a.driverId}`
      : "Избери...";
    const assistantLabel = a.assistantId
      ? `${a.assistantId}`
      : "Избери...";

    tr.innerHTML = `
      <td><input type="time" value="${a.time}" data-id="${a.id}" class="asgn-time-input"></td>
      <td><input type="text" value="${a.location}" data-id="${a.id}" class="asgn-location-input" placeholder="..." maxlength="3"></td>
      <td>
        <select data-id="${a.id}" class="asgn-train-select">
          <option value="">-- Изберете --</option>
          ${state.trains.map(t =>
            `<option value="${t.id}"${t.id === a.trainId ? " selected" : ""}>${t.id}</option>`
          ).join("")}
        </select>
      </td>
      <td><span class="driver-cell${a.driverId ? " filled" : ""}" data-id="${a.id}" data-field="driverId">${driverLabel}</span></td>
      <td><span class="driver-cell${a.assistantId ? " filled" : ""}" data-id="${a.id}" data-field="assistantId">${assistantLabel}</span></td>
      <td><button class="btn-remove-row" data-id="${a.id}">&times;</button></td>
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
      if (a) { a.trainId = e.target.value; saveToLocalStorage(); }
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
    const nextDate = new Date(state.currentDateStr);
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
  renderGanttTimeline();
  populateDepotDropdowns();
  populateDriverDropdowns();
  populateTrainDropdowns();
  renderAssignationsTable();
  renderCrewProfiles();
  renderTrainsManagement();
  renderTrainTemplates();
  renderRecentLogs();
  
  // Актуализиране на часовника на диспечера
  const pad = (num) => String(num).padStart(2, '0');
  const clockText = `${pad(state.currentHour)}:${pad(state.currentMinute)}`;
  const dateText = `22 Май 2026г.`;
  
  const clockEl = document.getElementById("sim-clock-time");
  const dateEl = document.getElementById("sim-clock-date");
  if (clockEl) clockEl.textContent = clockText;
  if (dateEl) dateEl.textContent = dateText;

  // Актуализиране на датата за "Назначен персонал" (следващия ден)
  const nextDayEl = document.getElementById("next-day-date");
  if (nextDayEl) {
    const nextDate = new Date(state.currentDateStr);
    nextDate.setDate(nextDate.getDate() + 1);
    const bgMonths = ["Януари", "Февруари", "Март", "Април", "Май", "Юни", "Юли", "Август", "Септември", "Октомври", "Ноември", "Декември"];
    const day = nextDate.getDate();
    const month = bgMonths[nextDate.getMonth()];
    const year = nextDate.getFullYear();
    nextDayEl.textContent = `${day} ${month} ${year}г.`;
  }

  // Изчисляване на статистиката спрямо диспечерското време
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

  // Инициализиране на формата за планиране с времето на диспечера
  const plannedTimeInput = document.getElementById("shift-planned-time");
  if (plannedTimeInput) {
    const pad = (num) => String(num).padStart(2, '0');
    plannedTimeInput.value = `2026-05-22T${pad(state.currentHour)}:${pad(state.currentMinute)}`;
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

  // Слушател на плъзгача за времето
  const timeSlider = document.getElementById("sim-time-slider");
  if (timeSlider) {
    timeSlider.value = state.currentHour * 60 + state.currentMinute;
    timeSlider.addEventListener("input", (e) => {
      const minutesTotal = parseInt(e.target.value);
      state.currentHour = Math.floor(minutesTotal / 60);
      state.currentMinute = minutesTotal % 60;
      
      const label = document.getElementById("sim-time-slider-val");
      const pad = (num) => String(num).padStart(2, '0');
      if (label) label.textContent = `${pad(state.currentHour)}:${pad(state.currentMinute)}ч`;

      // Променяме и планираното време във формата
      if (plannedTimeInput) {
        plannedTimeInput.value = `2026-05-22T${pad(state.currentHour)}:${pad(state.currentMinute)}`;
      }

      saveToLocalStorage();
      updateUI();
    });
  }

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
        // Автоматично попълване на маршрута и правоспособността в лебела за информация
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
      // При промяна на планираното време, актуализираме списъка с шофьори (тъй като някой може да е в отпуск в това време)
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

      // Assign mode - fill driver back to table cell
      if (state.assigningCell) {
        if (!driverId || !trainId || !plannedTime) {
          showToast("Моля, изберете машинист!", "error");
          return;
        }
        const assignation = state.assignations.find(a => a.id === state.assigningCell.rowId);
        if (assignation) {
          assignation[state.assigningCell.field] = driverId;
          saveToLocalStorage();
          renderAssignationsTable();
          showToast(`Машинист №${driverId} зададен успешно!`, "success");
        }
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

      if (!driverId || !trainId || !plannedTime) {
        showToast("Моля, попълнете всички полета!", "error");
        return;
      }

      // Проверка за предупредителни отсъствия (warn level)
      const driver = state.drivers.find(d => d.id === driverId);
      if (driver) {
        const planned = new Date(plannedTime);
        for (const abs of driver.absences) {
          const absStart = new Date(abs.start);
          const absEnd = new Date(abs.end);
          if (planned >= absStart && planned <= absEnd) {
            const behavior = getAbsenceBehavior(abs);
            if (behavior.blockLevel === 'warn') {
              const msg = abs.type === 'Vacation'
                ? `ВНИМАНИЕ! Машинистът има ${behavior.label} до ${formatDate(absEnd)}. Отпускът е само заявен, но не е одобрен. Желаете ли да продължите с назначаването?`
                : `ВНИМАНИЕ! Машинистът има ${behavior.label} до ${formatDate(absEnd)}. Желаете ли да продължите с назначаването?`;
              if (!confirm(msg)) {
                return;
              }
              break;
            }
          }
        }
      }

      // Проверка за дублиране на същата дата
      const plannedDate = plannedTime.split("T")[0];
      if (getAssignedDriverIdsOnDate(plannedDate).has(driverId)) {
        showToast(`Машинистът вече е назначен на ${plannedDate}!`, "error");
        return;
      }

      createShift(driverId, trainId, new Date(plannedTime).toISOString());
      
      // Нулиране на формата
      driverSelect.value = "";
      trainSelect.value = "";
      const routeInfo = document.getElementById("train-route-info");
      if (routeInfo) routeInfo.innerHTML = "Изберете влак, за да видите маршрута му.";
      resetTrafficLight();
      btnFinalize.disabled = true;

      // Сменяме таба на времевата линия за преглед
      switchTab("gantt-timeline");
      updateUI();
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
