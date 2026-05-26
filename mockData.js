// mockData.js - Статични и начални динамични данни за железопътните бригади

const DEFAULT_DRIVERS = [
  {
    id: "1001",
    firstName: "Иван",
    middleName: "Петров",
    lastName: "Димитров",
    name: "Иван Петров Димитров",
    phone: "0888 123 456",
    depot: "София",
    position: "Локомотивен машинист",
    residence: "София",
    competencies: ["Серия 40 (вкл. 42/43/44/45)", "Серия 46", "Проба \"А\""],
    monthlyNorm: 160,
    quarterlyNorm: 480,
    monthlyWorked: 135.5,
    quarterlyWorked: 412.0,
    absences: [
      {
        id: "abs_1",
        type: "Vacation", // Vacation, Sick, Personal
        typeBG: "Платен отпуск",
        start: "2026-05-25T00:00:00",
        end: "2026-05-28T23:59:59"
      }
    ]
  },
  {
    id: "1002",
    firstName: "Георги",
    middleName: "Василев",
    lastName: "Иванов",
    name: "Георги Василев Иванов",
    phone: "0887 234 567",
    depot: "Пловдив",
    position: "Локомотивен машинист",
    residence: "Пловдив",
    competencies: ["Серия 40 (вкл. 42/43/44/45)", "Серия 51", "ТМРВ"],
    monthlyNorm: 160,
    quarterlyNorm: 480,
    monthlyWorked: 154.0, // Близо до лимита от 160 часа
    quarterlyWorked: 455.5, // Риск от извънреден труд
    absences: [
      {
        id: "abs_2",
        type: "Sick",
        typeBG: "Болничен",
        start: "2026-05-20T00:00:00",
        end: "2026-05-23T23:59:59" // Активен до края на утрешния ден (текущо е 22 май)
      }
    ]
  },
  {
    id: "1003",
    firstName: "Димитър",
    middleName: "Стоянов",
    lastName: "Георгиев",
    name: "Димитър Стоянов Георгиев",
    phone: "0889 345 678",
    depot: "Русе",
    position: "Локомотивен машинист",
    residence: "Русе",
    competencies: ["Серия 46", "Серия 55", "Серия 07", "Проба \"А\""],
    monthlyNorm: 160,
    quarterlyNorm: 480,
    monthlyWorked: 110.0,
    quarterlyWorked: 320.0,
    absences: []
  },
  {
    id: "1004",
    firstName: "Асен",
    middleName: "Маринов",
    lastName: "Петров",
    name: "Асен Маринов Петров",
    phone: "0886 456 789",
    depot: "Горна Оряховица",
    position: "Локомотивен машинист",
    residence: "Горна Оряховица",
    competencies: ["Серия 40 (вкл. 42/43/44/45)", "Серия 07"],
    monthlyNorm: 160,
    quarterlyNorm: 480,
    monthlyWorked: 122.5,
    quarterlyWorked: 365.0,
    absences: []
  },
  {
    id: "1005",
    firstName: "Николай",
    middleName: "Ангелов",
    lastName: "Василев",
    name: "Николай Ангелов Василев",
    phone: "0885 567 890",
    depot: "София",
    position: "Инструктор/Депомайстор",
    residence: "София",
    competencies: ["Серия 40 (вкл. 42/43/44/45)", "Серия 51", "Инструктор/Депомайстор"],
    monthlyNorm: 160,
    quarterlyNorm: 480,
    monthlyWorked: 145.0,
    quarterlyWorked: 420.0,
    absences: []
  },
  {
    id: "1006",
    firstName: "Стефан",
    middleName: "Христов",
    lastName: "Тодоров",
    name: "Стефан Христов Тодоров",
    phone: "0884 678 901",
    depot: "Пловдив",
    position: "Помощник-локомотивен машинист",
    residence: "Пловдив",
    competencies: ["Серия 46", "Серия 51", "Серия 55", "Стрелочник"],
    monthlyNorm: 160,
    quarterlyNorm: 480,
    monthlyWorked: 98.0,
    quarterlyWorked: 290.0,
    absences: [
      {
        id: "abs_3",
        type: "Personal",
        typeBG: "Неприсъствен (Лични)",
        start: "2026-05-22T08:00:00",
        end: "2026-05-22T20:00:00" // Неприсъствен днес
      }
    ]
  },
  {
    id: "1007",
    firstName: "Красимир",
    middleName: "Костов",
    lastName: "Павлов",
    name: "Красимир Костов Павлов",
    phone: "0883 789 012",
    depot: "Русе",
    position: "Локомотивен машинист",
    residence: "Русе",
    competencies: ["Серия 40 (вкл. 42/43/44/45)", "Серия 55", "ТМРВ"],
    monthlyNorm: 160,
    quarterlyNorm: 480,
    monthlyWorked: 130.0,
    quarterlyWorked: 395.0,
    absences: []
  },
  {
    id: "1008",
    firstName: "Васил",
    middleName: "Колев",
    lastName: "Димитров",
    name: "Васил Колев Димитров",
    phone: "0882 890 123",
    depot: "София",
    position: "Локомотивен машинист",
    residence: "София",
    competencies: ["Серия 40 (вкл. 42/43/44/45)", "Серия 46", "Серия 55", "Проба \"А\""],
    monthlyNorm: 160,
    quarterlyNorm: 480,
    monthlyWorked: 85.0,
    quarterlyWorked: 260.0,
    absences: []
  }
];

const DEFAULT_TRAINS = [
  { id: "Влак 20611", series: "Серия 40 (вкл. 42/43/44/45)", route: "София - Пловдив", etaHours: 4 },
  { id: "Влак 40402", series: "Серия 46", route: "Русе - Горна Оряховица", etaHours: 3 },
  { id: "Влак 80120", series: "Серия 40 (вкл. 42/43/44/45)", route: "Пловдив - Бургас", etaHours: 5 },
  { id: "Влак 07101", series: "Серия 07", route: "Димитровград - Кърджали", etaHours: 3 },
  { id: "Влак 51102", series: "Серия 51", route: "Маневра гара Пловдив", etaHours: 8 },
  { id: "Влак 55201", series: "Серия 55", route: "Маневра гара Русе", etaHours: 6 },
  { id: "Влак 40600", series: "Серия 46", route: "София - Карлово", etaHours: 4.5 },
  { id: "Влак 86012", series: "Серия 40 (вкл. 42/43/44/45)", route: "Карнобат - Варна", etaHours: 3.5 }
];

// Исторически и текущи смени (базирани около 2026-05-22)
// Настоящото диспечерско време се симулира да бъде: 2026-05-22T16:00:00
const DEFAULT_SHIFTS = [
  {
    id: "shift_101",
    driverId: "1001",
    trainId: "Влак 20611",
    appearancePlanned: "2026-05-22T08:00:00",
    appearanceActual: "2026-05-22T08:05:00",
    releaseActual: "2026-05-22T12:15:00", // Завършена. Почива до 22 май, 12:15 + 16 часа = 23 май, 04:15.
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
    appearanceActual: "2026-05-22T12:55:00",
    releaseActual: null, // Активна смяна
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
    appearanceActual: "2026-05-21T20:00:00",
    releaseActual: "2026-05-22T01:30:00", // Свободен след 01:30 + 16ч = 17:30 на 22 май. Сега е 16:00, т.е. още е в почивка!
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
    appearanceActual: "2026-05-21T06:00:00",
    releaseActual: "2026-05-21T10:00:00", // Свободен
    status: "completed",
    actualDurationHours: 4.0,
    logs: []
  }
];
