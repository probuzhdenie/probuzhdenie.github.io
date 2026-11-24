import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

const hero = new Image();
hero.src = `${import.meta.env.BASE_URL}images/cross.jpg`;

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

function within(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
  ]);
}

const heroReady = hero.decode
  ? hero.decode().catch(() => {})
  : Promise.resolve();
const fontsReady = document.fonts?.ready ?? Promise.resolve();

Promise.all([within(heroReady, 3500), within(fontsReady, 2000)]).then(() => {
  requestAnimationFrame(() => window.__bootDone?.());
});
