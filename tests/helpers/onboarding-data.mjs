export const values = {
  displayName: "Sinon",
  goal: "Python API",
  context: "Меняю профессию",
  experience: "Знаю функции",
  workStudy: "Учусь и работаю",
  weeklyAvailability: "Вт и чт вечером",
  interests: "Музыка",
  hobbies: "Бег",
  preferences: "Короткие задачи",
  dailyMinutes: "30",
  currentProjects: "Нет проектов",
};
export const statement = Object.values(values).join(". ");
export const updates = Object.entries(values).map(([field, value]) => ({
  field,
  status: "provided",
  value,
  evidence: value,
}));
