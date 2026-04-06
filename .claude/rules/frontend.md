---
paths: quiz/apps/frontend/**/*.tsx, quiz/apps/frontend/**/*.ts, quiz/apps/frontend/**/*.css
---

## Frontend Rules

- **Tailwind CSS v4**: important modifier via SUFFIX (`bg-red-400!`), never prefix (`!bg-red-400`)
- **Conditional classes**: use `clsx` from the clsx package, not string concatenation
- **Design tokens**: use Carbon palette from `@theme` in global.css (carbon-950 to carbon-100)
- **Colors**: teal-400 primary, emerald-400 success, rose-400 error, amber-400 warning, sky-400 info
- **Fonts**: font-sans = Sora, font-mono = JetBrains Mono (both from Google Fonts)
- **Animations**: defined in global.css @theme — animate-fade-slide-up, animate-slide-up, animate-arrow-bounce
- **Graph nodes**: color-mix() rules in roadmap-nodes.css (can't be Tailwind utilities)
- **Responsive**: max-[768px] tablet, max-[600px] mobile, max-[480px] small mobile
- **Touch**: [@media(pointer:coarse)] for touch targets (min-h-12)
- **i18n**: all user-facing text via `t("key")` from react-i18next. Keys in both ru.json and en.json
