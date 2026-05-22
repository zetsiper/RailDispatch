// app.js - Логически двигател и визуализация на диспечерския пулт

// Инициализация на състоянието на системата
let state = {
  drivers: [],
  trains: [],
  shifts: [],
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

  if (storedDrivers && storedTrains && storedShifts) {
    state.drivers = JSON.parse(storedDrivers);
    state.trains = JSON.parse(storedTrains);
    state.shifts = JSON.parse(storedShifts);
  } else {
    // Използваме подготвените данни от mockData.js (ако са достъпни)
    state.drivers = typeof DEFAULT_DRIVERS !== 'undefined' ? DEFAULT_DRIVERS : [];
    state.trains = typeof DEFAULT_TRAINS !== 'undefined' ? DEFAULT_TRAINS : [];
    state.shifts = typeof DEFAULT_SHIFTS !== 'undefined' ? DEFAULT_SHIFTS : [];
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

  // --- Правило 4: Отсъствия и Отпуски (Твърдо) ---
  for (const absence of driver.absences) {
    const absStart = new Date(absence.start);
    const absEnd = new Date(absence.end);
    if (plannedTime >= absStart && plannedTime <= absEnd) {
      result.rest = { 
        status: "red", 
        text: `Недостъпен - В отпуск или болничен (${absence.typeBG}) до ${formatDate(absEnd)}.` 
      };
      // Ако е в отпуск, той е абсолютно блокиран
      return result;
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

        const block = document.createElement("div");
        block.className = "time-block absence";
        block.style.left = `${leftPercent}%`;
        block.style.width = `${widthPercent}%`;
        block.innerHTML = `
          <span class="block-title">${absence.typeBG}</span>
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

  // Скриваме напълно тези, които в това време са в отпуск/болничен
  state.drivers.forEach(driver => {
    let isAbsent = false;
    for (const abs of driver.absences) {
      const absStart = new Date(abs.start);
      const absEnd = new Date(abs.end);
      if (targetTime >= absStart && targetTime <= absEnd) {
        isAbsent = true;
        break;
      }
    }

    if (!isAbsent) {
      const option = document.createElement("option");
      option.value = driver.id;
      // Добавяне на допълнителна информация в името
      const driverState = getDriverStateAtCurrentTime(driver.id);
      let suffix = " (Свободен)";
      if (driverState.status === 'resting') {
        suffix = ` (Почива до ${formatTime(driverState.restUntil)})`;
      } else if (driverState.status === 'active') {
        suffix = ` (На влак ${driverState.shift.trainId})`;
      }
      option.textContent = `${driver.name} - Депо ${driver.depot}${suffix}`;
      driverSelect.appendChild(option);
    }
  });

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

// Рендиране на профилите в таб "Служители"
function renderCrewProfiles() {
  const crewContainer = document.getElementById("crew-profiles-list");
  if (!crewContainer) return;

  crewContainer.innerHTML = "";

  state.drivers.forEach(driver => {
    const card = document.createElement("div");
    card.className = "glass crew-card";

    // Прогрес за месечните часове
    const monthPct = Math.min((driver.monthlyWorked / driver.monthlyNorm) * 100, 100);
    let monthBarClass = "normal";
    if (driver.monthlyWorked >= driver.monthlyNorm) monthBarClass = "overtime";
    else if (driver.monthlyWorked >= driver.monthlyNorm - 15) monthBarClass = "warning";

    // Прогрес за тримесечните часове
    const qPct = Math.min((driver.quarterlyWorked / driver.quarterlyNorm) * 100, 100);
    let qBarClass = "normal";
    if (driver.quarterlyWorked >= driver.quarterlyNorm - 30) qBarClass = "warning";

    // Активно отсъствие
    let activeAbsenceHTML = "";
    if (driver.absences.length > 0) {
      activeAbsenceHTML = driver.absences.map(abs => {
        return `<div class="crew-info-row" style="color: var(--color-danger)">
          <span class="crew-info-label">Отсъствие:</span>
          <span class="crew-info-value">${abs.typeBG} (${formatDate(abs.start)} - ${formatDate(abs.end)})</span>
        </div>`;
      }).join("");
    }

    card.innerHTML = `
      <div class="crew-card-header">
        <div class="crew-card-name">${driver.name}</div>
        <div class="crew-card-depot">Депо ${driver.depot}</div>
      </div>
      
      <div class="crew-info-row">
        <span class="crew-info-label">Табелен номер:</span>
        <span class="crew-info-value">#${driver.id}</span>
      </div>
      
      <div class="crew-info-row">
        <span class="crew-info-label">Телефон:</span>
        <span class="crew-info-value">${driver.phone}</span>
      </div>

      <div class="crew-info-row">
        <span class="crew-info-label">Правоспособност:</span>
        <span class="crew-info-value">${driver.competencies.join(", ")}</span>
      </div>

      ${activeAbsenceHTML}

      <div class="progress-container">
        <div class="progress-header">
          <span>Месечен Баланс</span>
          <span><strong>${driver.monthlyWorked}</strong> / ${driver.monthlyNorm} ч</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill ${monthBarClass}" style="width: ${monthPct}%"></div>
        </div>
      </div>

      <div class="progress-container">
        <div class="progress-header">
          <span>Тримесечен Баланс</span>
          <span><strong>${driver.quarterlyWorked}</strong> / ${driver.quarterlyNorm} ч</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill ${qBarClass}" style="width: ${qPct}%"></div>
        </div>
      </div>
    `;

    crewContainer.appendChild(card);
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
    // Изключване на светофара
    resetTrafficLight();
    if (btnApprove) btnApprove.disabled = true;
    return;
  }

  const plannedTime = new Date(plannedTimeStr).toISOString();
  const checks = checkBusinessRules(driverId, trainId, plannedTime);

  // Рендиране на състоянието
  renderLightRow("light-rest", checks.rest);
  renderLightRow("light-competence", checks.competence);
  renderLightRow("light-rotation", checks.rotation);
  renderLightRow("light-balance", checks.balance);

  // Валидиране дали можем да финализираме (блокиране при RED статус на твърдите правила)
  const hasHardError = checks.rest.status === "red" || checks.competence.status === "red";
  if (btnApprove) {
    btnApprove.disabled = hasHardError;
  }
}

function renderLightRow(rowId, check) {
  const row = document.getElementById(rowId);
  const circle = row.querySelector(".light-circle");
  const desc = row.querySelector(".light-desc");

  // Изчистване на стари класове
  circle.className = "light-circle";
  row.className = "light-row";

  circle.classList.add(check.status);
  row.classList.add(check.status);
  desc.textContent = check.text;
}

function resetTrafficLight() {
  const rows = ["light-rest", "light-competence", "light-rotation", "light-balance"];
  rows.forEach(rowId => {
    const row = document.getElementById(rowId);
    if (row) {
      row.className = "light-row";
      row.querySelector(".light-circle").className = "light-circle off";
      row.querySelector(".light-desc").textContent = "Изчаква се избор...";
    }
  });
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
    document.getElementById("modal-train-series").value = "Серия 40 (вкл. 42/43/44/45)";
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
// ОСНОВНИ ФУНКЦИИ ЗА ОБНОВЯВАНЕ И ИНТЕРФЕЙС
// ==========================================

function updateUI() {
  renderGanttTimeline();
  populateDriverDropdowns();
  populateTrainDropdowns();
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

  // Действие при Финализиране на смяна
  const btnFinalize = document.getElementById("btn-finalize-scheduling");
  if (btnFinalize) {
    btnFinalize.addEventListener("click", () => {
      const driverId = driverSelect.value;
      const trainId = trainSelect.value;
      const plannedTime = plannedTimeInput.value;

      if (!driverId || !trainId || !plannedTime) {
        showToast("Моля, попълнете всички полета!", "error");
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
});
