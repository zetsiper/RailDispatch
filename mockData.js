// mockData.js - Статични и начални динамични данни за железопътните бригади

const DEFAULT_POSITION_NORMS = {
  "Локомотивен машинист": 160,
  "Помощник-локомотивен машинист": 160,
  "Инструктор/Депомайстор": 160,
  "Маневрист": 160,
  "Стрелочник": 160
};

const DEFAULT_DRIVERS = [
  {
    id: "1001",
    firstName: "Иван",
    middleName: "Петров",
    lastName: "Димитров",
    name: "Иван Петров Димитров",
    phones: [{ number: "0888 123 456", description: "Личен" }],
    depot: "Русе",
    position: "Локомотивен машинист",
    residence: "Русе",
    competencies: ["Серия 40", "Серия 46", "Проба \"А\""],
    monthlyNorm: 160,
    quarterlyNorm: 480,
    yearlyNorm: 1920,
    monthlyWorked: 135.5,
    quarterlyWorked: 412.0,
    yearlyWorked: 950.0,
    absences: [
      {
        id: "abs_1",
        type: "Vacation",
        typeBG: "Платен отпуск",
        start: "2026-05-25T00:00:00",
        end: "2026-05-28T23:59:59",
        requested: true,
        approved: false,
        presented: false,
        explanation: ""
      }
    ]
  },
  {
    id: "1002",
    firstName: "Георги",
    middleName: "Василев",
    lastName: "Иванов",
    name: "Георги Василев Иванов",
    phones: [
      { number: "0887 234 567", description: "Личен" },
      { number: "0887 999 888", description: "Служебен" }
    ],
    depot: "Плевен",
    position: "Локомотивен машинист",
    residence: "Плевен",
    competencies: ["Серия 40", "Серия 51", "ТМРВ"],
    monthlyNorm: 160,
    quarterlyNorm: 480,
    yearlyNorm: 1920,
    monthlyWorked: 154.0,
    quarterlyWorked: 455.5,
    yearlyWorked: 920.0,
    absences: [
      {
        id: "abs_2",
        type: "Sick",
        typeBG: "Медицински отпуск",
        start: "2026-05-20T00:00:00",
        end: "2026-05-23T23:59:59",
        requested: true,
        approved: false,
        presented: true,
        explanation: ""
      }
    ]
  },
  {
    id: "1003",
    firstName: "Димитър",
    middleName: "Стоянов",
    lastName: "Георгиев",
    name: "Димитър Стоянов Георгиев",
    phones: [{ number: "0889 345 678", description: "Личен" }],
    depot: "Русе",
    position: "Локомотивен машинист",
    residence: "Русе",
    competencies: ["Серия 46", "Серия 55", "Серия 07", "Проба \"А\""],
    monthlyNorm: 160,
    quarterlyNorm: 480,
    yearlyNorm: 1920,
    monthlyWorked: 110.0,
    quarterlyWorked: 320.0,
    yearlyWorked: 580.0,
    absences: [
      {
        id: "abs_4",
        type: "Service",
        typeBG: "Служебна ангажираност",
        start: "2026-05-24T09:00:00",
        end: "2026-05-24T17:00:00",
        requested: false,
        approved: false,
        presented: false,
        explanation: "Обучение - нова серия локомотиви"
      }
    ]
  },
  {
    id: "1004",
    firstName: "Асен",
    middleName: "Маринов",
    lastName: "Петров",
    name: "Асен Маринов Петров",
    phones: [{ number: "0886 456 789", description: "Личен" }],
    depot: "Горна Оряховица",
    position: "Локомотивен машинист",
    residence: "Горна Оряховица",
    competencies: ["Серия 40", "Серия 07"],
    monthlyNorm: 160,
    quarterlyNorm: 480,
    yearlyNorm: 1920,
    monthlyWorked: 122.5,
    quarterlyWorked: 365.0,
    yearlyWorked: 650.0,
    absences: []
  },
  {
    id: "1005",
    firstName: "Николай",
    middleName: "Ангелов",
    lastName: "Василев",
    name: "Николай Ангелов Василев",
    phones: [{ number: "0885 567 890", description: "Служебен" }],
    depot: "Каспичан",
    position: "Инструктор/Депомайстор",
    residence: "Каспичан",
    competencies: ["Серия 40", "Серия 51", "Инструктор/Депомайстор"],
    monthlyNorm: 160,
    quarterlyNorm: 480,
    yearlyNorm: 1920,
    monthlyWorked: 145.0,
    quarterlyWorked: 420.0,
    yearlyWorked: 880.0,
    absences: []
  },
  {
    id: "1006",
    firstName: "Стефан",
    middleName: "Христов",
    lastName: "Тодоров",
    name: "Стефан Христов Тодоров",
    phones: [{ number: "0884 678 901", description: "Личен" }],
    depot: "Плевен",
    position: "Помощник-локомотивен машинист",
    residence: "Плевен",
    competencies: ["Серия 46", "Серия 51", "Серия 55", "Стрелочник"],
    monthlyNorm: 160,
    quarterlyNorm: 480,
    yearlyNorm: 1920,
    monthlyWorked: 98.0,
    quarterlyWorked: 290.0,
    yearlyWorked: 490.0,
    absences: [
      {
        id: "abs_3",
        type: "Personal",
        typeBG: "Лична ангажираност",
        start: "2026-05-22T08:00:00",
        end: "2026-05-22T20:00:00",
        requested: false,
        approved: false,
        presented: false,
        explanation: "Лични ангажименти - банка"
      }
    ]
  },
  {
    id: "1007",
    firstName: "Красимир",
    middleName: "Костов",
    lastName: "Павлов",
    name: "Красимир Костов Павлов",
    phones: [{ number: "0883 789 012", description: "Личен" }],
    depot: "Каспичан",
    position: "Локомотивен машинист",
    residence: "Каспичан",
    competencies: ["Серия 40", "Серия 55", "ТМРВ"],
    monthlyNorm: 160,
    quarterlyNorm: 480,
    yearlyNorm: 1920,
    monthlyWorked: 130.0,
    quarterlyWorked: 395.0,
    yearlyWorked: 930.0,
    absences: []
  },
  {
    id: "1008",
    firstName: "Васил",
    middleName: "Колев",
    lastName: "Димитров",
    name: "Васил Колев Димитров",
    phones: [
      { number: "0882 890 123", description: "Личен" },
      { number: "0882 111 222", description: "Домашен" }
    ],
    depot: "Русе",
    position: "Локомотивен машинист",
    residence: "Русе",
    competencies: ["Серия 40", "Серия 46", "Серия 55", "Проба \"А\""],
    monthlyNorm: 160,
    quarterlyNorm: 480,
    yearlyNorm: 1920,
    monthlyWorked: 85.0,
    quarterlyWorked: 260.0,
    yearlyWorked: 425.0,
    absences: []
  }
];

const DEFAULT_TRAINS = [
  { id: "Влак 20611", series: "Серия 40", route: "Русе - Плевен", etaHours: 4 },
  { id: "Влак 40402", series: "Серия 46", route: "Русе - Горна Оряховица", etaHours: 3 },
  { id: "Влак 80120", series: "Серия 40", route: "Плевен - Каспичан", etaHours: 5 },
  { id: "Влак 07101", series: "Серия 07", route: "Горна Оряховица - Каспичан", etaHours: 3 },
  { id: "Влак 51102", series: "Серия 51", route: "Маневра гара Плевен", etaHours: 8 },
  { id: "Влак 55201", series: "Серия 55", route: "Маневра гара Русе", etaHours: 6 },
  { id: "Влак 40600", series: "Серия 46", route: "Каспичан - Горна Оряховица", etaHours: 4.5 },
  { id: "Влак 86012", series: "Серия 40", route: "Каспичан - Русе", etaHours: 3.5 }
];

// Исторически и текущи смени (базирани около 2026-05-22)
// Настоящото диспечерско време се симулира да бъде: 2026-05-22T16:00:00
const DEFAULT_SHIFTS = [
  {
    id: "shift_101",
    driverId: "1001",
    trainId: "Влак 20611",
    appearancePlanned: "2026-05-22T08:00:00",
    releasePlanned: "2026-05-22T12:00:00",
    appearanceActual: "2026-05-22T08:05:00",
    releaseActual: "2026-05-22T12:15:00",
    status: "completed",
    actualDurationHours: 4.17,
    logs: [
      { time: "2026-05-22T08:05:00", type: "info", text: "Явяване на работа с 5 мин закъснение" }
    ]
  },
  {
    id: "shift_102",
    driverId: "1003",
    trainId: "Влак 40402",
    appearancePlanned: "2026-05-22T13:00:00",
    releasePlanned: "2026-05-22T17:00:00",
    appearanceActual: "2026-05-22T12:55:00",
    releaseActual: null,
    status: "active",
    actualDurationHours: null,
    logs: [
      { time: "2026-05-22T12:55:00", type: "info", text: "Явяване на работа" }
    ]
  },
  {
    id: "shift_103",
    driverId: "1005",
    trainId: "Влак 86012",
    appearancePlanned: "2026-05-21T20:00:00",
    releasePlanned: "2026-05-22T00:00:00",
    appearanceActual: "2026-05-21T20:00:00",
    releaseActual: "2026-05-22T01:30:00",
    status: "completed",
    actualDurationHours: 5.5,
    logs: []
  },
  {
    // За тест на правилото за ротация (последна смяна със същия влак)
    id: "shift_104",
    driverId: "1008",
    trainId: "Влак 20611",
    appearancePlanned: "2026-05-21T06:00:00",
    releasePlanned: "2026-05-21T10:00:00",
    appearanceActual: "2026-05-21T06:00:00",
    releaseActual: "2026-05-21T10:00:00",
    status: "completed",
    actualDurationHours: 4.0,
    logs: []
  }
];
