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
- **Firebase** (Assumed for authentication and data, based on common structure)

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
