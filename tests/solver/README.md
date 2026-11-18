# Регрессия решателя ограничений эскиза

Сетка сценариев на реальных сущностях (`LineEntity`, `CircleEntity`, `ArcEntity`,
`OvalEntity`, `PointEntity`) и реальных ограничениях из `js/tools/sketch/constraints/`.
Работает в Node, без браузера и без редактора.

## Запуск

```bash
npm run check:solver              # проверка, exit 1 при падении
npm run check:solver -- --verbose # подробности по каждой проверке
npm run check:solver -- --json    # машинный вывод
npm run check:solver -- --update  # перезаписать эталон baseline.json
node tests/solver/perf.mjs        # замеры скорости (не входит в check)
node tests/solver/perf-jacobian.mjs   # эффект аналитики: hybrid vs FD (solve и DOF)
```

`npm run check` запускает синтаксис, граф импортов и эту сетку.

## Устройство

* `regression.mjs` — сценарии: каждый строит эскиз, запускает `NewtonSolver` и возвращает
  проверки (`ok/detail`) и метрики (сходящиеся в `baseline.json`).
* `../../scripts/check-solver.mjs` — раннер: заглушки `localStorage`/DOM (нужны только на
  этапе импорта `js/`), ESM-хук «голых» спецификаторов, сравнение с эталоном, печать.
* `../../scripts/lib/bare-specifier-hooks.mjs` — резолвит `three`, `three/addons/`,
  `core/`, `tools/`, `utils/`, `lib/` так же, как importmap в браузере.

## Правила

1. Сценарии детерминированы: фиксированный seed, фиксированный порядок ограничений,
   `IterationTimeOut: 1e9` (иначе wall-clock отсечка делает результат машино-зависимым).
2. Новый баг → новый сценарий (или новая проверка в существующем).
3. Эталон обновлять только осознанно: падение по `residual`/`iter` — это регрессия,
   а не повод переписать baseline.
4. Сценарии проверяют инварианты (длины, углы, совпадения, DOF/ранг), а не побитовую
   геометрию: у недоопределённых эскизов решение зависит от пути.
