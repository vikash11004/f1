# F1 PREDICT — Formula 1 Prediction League

Welcome to **F1 PREDICT**, a Formula 1 Prediction League application. Predict the finishing order of every Grand Prix session, earn points, and compete on the season leaderboard.

## Features

- **Dashboard**: View upcoming races, recent results, and your prediction status.
- **Races**: Browse the calendar, see session times, and access prediction builders.
- **Prediction Builder**: Drag and drop drivers to build your predicted grid for Qualifying, Sprint, and Race sessions.
- **Leaderboard**: Compete with other players and track your points across the season.
- **Global Chat**: Talk with other players in real-time.

## Tech Stack

This project is a client-side web application built with:
- **HTML5** & **CSS3** (Custom properties, animations, and responsive layouts)
- **Vanilla JavaScript** (ES6 modules for routing and UI logic)
- **SheetJS** (Excel Export capabilities)
- **Firebase Authentication & Cloud Firestore** (Accounts, predictions, standings, and chat)

## Setup & Usage

To run the application locally:

1. Clone this repository.
2. Serve the directory using a local web server (e.g., using Python's `http.server`, Live Server extension in VS Code, or `npm` packages like `serve`).
   ```bash
   # Example using Python
   python -m http.server 8000
   ```
3. Open your browser and navigate to `http://localhost:8000`.

## Project Structure

- `index.html`: The main entry point and app shell.
- `/styles/`: Contains all CSS files (`base.css`, `components.css`, `layout.css`, `animations.css`).
- `/js/`: Contains JavaScript modules handling authentication, dashboard, races, predictions, leaderboard, and UI routing.

## Paddock design

The interface uses a graphite, warm-white, and racing-red palette with responsive layouts for sign-in, the overview, calendar, standings, and prediction builder. Shared styling lives in `styles/paddock.css`; presentation helpers live in `js/design.js`. Fonts and original SVG artwork are hosted locally in `assets/`. Font licenses are included alongside the fonts.

`js/auth-view.js` renders the entry screen before Firebase loads. If the remote SDK cannot load, the screen presents a connection error and retry action. Firebase authentication and data access still require the configured project's network access.

## Browser smoke checks

```bash
npm ci
# Only needed if Chromium is not already installed:
npx playwright install chromium
npm run test:ui
```

The test starts its own temporary local server and checks sign-in validation, password visibility, navigation, calendar filtering, standings, prediction selection, mobile layouts, and the failed-connection state. It replaces Firebase **only inside the test browser** with local fixtures and makes no requests or writes to the live project. This does not validate live authentication or Firestore permissions.

Screenshots are written to `/tmp/f1-ui-smoke` by default. Set `F1_SCREENSHOT_DIR` to use another directory, or `CHROMIUM_PATH` to select a Chromium executable. The test uses system Chromium when available and otherwise uses Playwright's installed browser.
