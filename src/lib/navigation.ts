export const navigationItems = [
  { href: "/dashboard", label: "Сегодня" },
  { href: "/roadmap", label: "Карта навыков" },
  { href: "/learn", label: "Учиться" },
  { href: "/projects", label: "Проекты" },
  { href: "/progress", label: "Прогресс" },
] as const;

export const utilityItems = [
  { href: "/diagnostic", label: "Диагностика" },
  { href: "/profile", label: "Профиль" },
] as const;

export const pageTitles: Record<string, string> = {
  "/dashboard": "Сегодня",
  "/roadmap": "Карта навыков",
  "/learn": "Учиться",
  "/projects": "Проекты",
  "/progress": "Прогресс",
  "/diagnostic": "Диагностика",
  "/profile": "Профиль",
};
