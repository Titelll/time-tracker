# Time Tracker

Таймер от 00:00:00 без верхнего предела, аккаунты, календарь, задачи, недельная диаграмма и цели.
Работает на Windows и macOS (Electron).

## Запуск для разработки

1. Установите Node.js (LTS): https://nodejs.org
2. В папке проекта выполните:

    npm install
    npm start

## Сборка установщиков

    npm run build:win    # Windows: dist/Time Tracker Setup.exe (собирать на Windows)
    npm run build:mac    # macOS:   dist/Time Tracker.dmg      (собирать на Mac)

Сборку под каждую систему удобнее делать на ней самой.

Приложение не подписано. На Mac при первом запуске: правый клик по приложению, затем «Открыть».
На Windows SmartScreen покажет предупреждение: «Подробнее», затем «Выполнить в любом случае».

## Где хранятся данные

Один файл `timetracker-data.json` в папке пользовательских данных приложения:

- Windows: `%APPDATA%\time-tracker\`
- macOS: `~/Library/Application Support/time-tracker/`

Таймер хранит время старта, поэтому продолжает считать, даже если закрыть приложение или выйти из аккаунта.

## Автообновления (через GitHub Releases)

Один раз:
1. Создайте на GitHub публичный репозиторий `time-tracker`.
2. Впишите свой логин вместо `YOUR_GITHUB_USERNAME` в двух местах: `package.json` (build.publish.owner) и `main.js` (GH_OWNER).
3. Создайте токен: GitHub, Settings, Developer settings, Personal access tokens, право `repo`.
4. После обновления файлов выполните `npm install` (добавилась зависимость electron-updater).

Выпуск новой версии:
1. Увеличьте `version` в `package.json` (например, 1.0.0 на 1.0.1).
2. На каждой системе выполните: `GH_TOKEN=ваш_токен npm run release`
   (на Windows в PowerShell: `$env:GH_TOKEN="ваш_токен"; npm run release`).
3. На GitHub откройте черновик релиза и нажмите Publish.

Приложение проверяет обновления через 5 секунд после запуска и затем раз в 4 часа.
Windows: обновление скачивается само, внизу слева появляется кнопка «Перезапустить».
macOS без платной подписи Apple: приложение показывает «Доступна версия X» и открывает страницу загрузки.
Автообновления работают только в собранном приложении, не в `npm start`.
