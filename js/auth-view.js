import { brand, icon } from './design.js';

export function renderAuthShell(ready = false) {
  const page = document.getElementById('auth-page');
  page.innerHTML = `
    <div class="auth-shell">
      <div class="auth-topbar"><a href="#auth" class="header-logo" aria-label="F1 Predict home">${brand}</a><span class="season-tag"><span class="status-dot"></span> THE 2026 SEASON</span></div>
      <div class="auth-layout">
        <section class="auth-story" aria-label="Welcome to F1 Predict">
          <div class="auth-story-top"><span class="eyebrow">FOR THE LOVE OF THE RACE</span><span class="story-edition">EST. 2026 / VOL. 01</span></div>
          <h1>YOUR INSTINCT.<br>YOUR GRID.<br><span>YOUR GLORY.</span></h1>
          <p class="auth-story-copy">Every position matters. Call the race,<br>outsmart the grid, and chase the championship.</p>
          <img class="auth-car" src="assets/race-car.svg" alt="An overhead illustration of a red Formula racing car" width="1000" height="760">
          <div class="story-stamp"><span class="stamp-cross">+</span><span>BUILT FOR<br>THE RACE OBSESSED.</span></div>
          <div class="story-bottom"><span><i class="live-dot"></i> LIGHTS OUT. GAME ON.</span><span>01 — 24</span></div>
        </section>
        <section class="auth-form-side" aria-label="Account access">
          <div class="auth-form-intro"><span class="eyebrow"><span class="tiny-line"></span> YOUR SEAT IS WAITING</span><span class="form-number">01 / SIGN IN</span></div>
          <div class="auth-card" id="auth-card">
            <div class="auth-title-row"><span class="auth-symbol">${icon('flag')}</span><span class="text-label">THE PREDICTION LEAGUE</span></div>
            <h2 id="auth-title">Welcome to<br>the paddock.</h2>
            <p class="auth-description" id="auth-description">Your next winning prediction starts here.</p>
            <form id="auth-form" novalidate>
              <fieldset id="auth-fields" ${ready ? '' : 'disabled'}>
                <div id="name-group" class="form-group hidden"><label class="form-label" for="auth-name">Display name</label><input class="form-input" type="text" id="auth-name" placeholder="What should we call you?" autocomplete="nickname" aria-describedby="name-error"><span class="form-error hidden" id="name-error"></span></div>
                <div class="form-group"><label class="form-label" for="auth-email">Email address</label><input class="form-input" type="email" id="auth-email" placeholder="you@example.com" required autocomplete="email" aria-describedby="email-error"><span class="form-error hidden" id="email-error"></span></div>
                <div class="form-group"><label class="form-label" for="auth-password">Password</label><div class="password-field"><input class="form-input" type="password" id="auth-password" placeholder="Your password" required autocomplete="current-password" minlength="6" aria-describedby="password-error"><button type="button" class="password-toggle" id="password-toggle" aria-label="Show password" aria-pressed="false">${icon('eye')}</button></div><span class="form-error hidden" id="password-error"></span></div>
                <button type="submit" class="btn btn-primary auth-submit" id="auth-submit"><span>Enter the paddock</span>${icon('arrow')}</button>
              </fieldset>
            </form>
            <p class="auth-switch"><span id="auth-switch-label">New to the grid?</span> <button id="auth-toggle" type="button" ${ready ? '' : 'disabled'}>Create an account ${icon('arrow', 'diagonal-arrow')}</button></p>
            <div class="connection-state ${ready ? 'hidden' : ''}" id="connection-state" role="status"><span class="status-dot"></span> Connecting to the paddock…</div>
            <div class="auth-footnote">${icon('trophy')} A little knowledge. A little instinct. All to play for.</div>
          </div>
          <div class="auth-form-footer"><span>THE GRID IS OPEN TO EVERYONE.</span><span class="checker-pattern" aria-hidden="true"></span></div>
        </section>
      </div>
      <div class="auth-features"><div><span class="feature-index">01</span><div><h3>Call the grid.</h3><p>Pick your order for every session.</p></div>${icon('flag')}</div><div><span class="feature-index">02</span><div><h3>Make every point count.</h3><p>Turn your race knowledge into points.</p></div>${icon('grid')}</div><div><span class="feature-index">03</span><div><h3>Own the season.</h3><p>Climb the ranks. Take the bragging rights.</p></div>${icon('trophy')}</div></div>
      <footer class="auth-bottom"><span>F1 PREDICT © 2026</span><span>AN INDEPENDENT LEAGUE. A SHARED OBSESSION.</span><span>PREDICT. COMPETE. REPEAT. ${icon('arrow', 'diagonal-arrow text-accent')}</span></footer>
    </div>`;
}

export function showConnectionError() {
  const status = document.getElementById('connection-state');
  if (!status) return;
  status.classList.remove('hidden');
  status.classList.add('connection-error');
  status.innerHTML = `<span>We couldn’t connect. Check your connection and try again.</span><button type="button" class="btn btn-secondary btn-sm" id="retry-connection">Retry connection ${icon('arrow', 'diagonal-arrow')}</button>`;
  document
    .getElementById('retry-connection')
    .addEventListener('click', () => window.location.reload());
}
