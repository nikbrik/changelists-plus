# 09. Воспроизводимый релиз и эксплуатационная валидация

## Цель

Создать проверяемую цепочку поставки VSIX и доказать пригодность расширения на реальных, но некритичных репозиториях до широкого использования.

## Анализ

Текущий VSIX `0.2.13` удалось воспроизвести побайтово по JavaScript, runtime dependencies отсутствуют. При этом lock-файл использует `registry.npmmirror.com`, dev-аудит содержит 2 high и 2 moderate у старого `@vscode/vsce`, commits не подписаны, тегов и автоматизированного release pipeline нет. Без зафиксированного provenance пользователь не может просто проверить соответствие установленного VSIX исходникам.

## Зависимости

- Для minimal pre-release: эпики 01–04.
- Для полноценного stable release: эпики 01–08.

## План реализации

1. Обновить build tooling и lock-файл с официальным npm registry; устранить либо документированно изолировать audit findings.
2. Зафиксировать Node/npm версии и выполнять install с `npm ci --ignore-scripts`, где это совместимо со сборкой.
3. Добавить CI: lint/typecheck, unit, Git integration, security contracts, package-content allowlist и smoke install.
4. Собирать VSIX только из чистого commit; публиковать SHA-256, SBOM и provenance/attestation.
5. Проверять, что VSIX содержит только allowlisted compiled files/assets и не содержит source maps, tests, backups или credentials.
6. Подписывать Git tag/release доступным проверяемым способом и вести changelog по эпикам.
7. Провести staged rollout: disposable repo, некритичный реальный repo, несколько дней dogfooding minimal mode, затем opt-in commit/discard.
8. Вести журнал найденных расхождений и блокировать stable release при нарушении инвариантов.

## Критерии качества и приёмки

- Чистая CI-среда собирает функционально и побайтово воспроизводимый VSIX либо документирует единственные недетерминированные metadata.
- SHA-256 опубликован рядом с release и проверяется smoke job перед установкой.
- Runtime dependency audit равен 0; оставшиеся dev findings имеют исправление или формально принятую изоляцию.
- Package allowlist не допускает неожиданные executable, secrets, test fixtures и служебные файлы.
- Все suites эпика 01 и критерии реализованных эпиков зелёные на поддерживаемых ОС.
- Minimal release успешно используется несколько дней без повреждения worktree/index до включения Commit/Discard.
- Stable release не публикуется при незакрытом known-risk case уровня high/critical.
- Документация содержит threat model, recovery runbook, ограничения и способ проверить VSIX.
