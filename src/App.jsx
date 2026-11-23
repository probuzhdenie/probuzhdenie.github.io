import { useEffect, useLayoutEffect, useRef, useState } from "react";
import chapelIcon from "./assets/icons/chapel.png";
import bookIcon from "./assets/icons/book.png";
import altarIcon from "./assets/icons/altar.png";
import cupIcon from "./assets/icons/cup.png";
import svetBg from "./assets/svet.jpg";

const pub = (file) => `${import.meta.env.BASE_URL}${file}`;

const galleryFiles = import.meta.glob(
  "./assets/gallery/*.{avif,jpg,jpeg,png,webp,AVIF,JPG,JPEG,PNG,WEBP}",
  { eager: true, import: "default" },
);

const GALLERY = Object.keys(galleryFiles)
  .sort((a, b) => a.localeCompare(b, "ru", { numeric: true }))
  .map((file) => galleryFiles[file]);

const MAP_URL =
  "https://yandex.ru/maps/?ll=44.741985%2C48.803119&z=17&pt=44.741985%2C48.803119%2Cpm2rdm&mode=whatshere&whatshere%5Bpoint%5D=44.741985%2C48.803119&whatshere%5Bzoom%5D=17";

const SCRIPT_URL = import.meta.env.VITE_GAS_URL;

async function sendNote(name, contact, message) {
  if (!SCRIPT_URL) throw new Error("send failed");
  const response = await fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ name, contact, message }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw new Error("send failed");
}

function CrossMark({ className }) {
  return (
    <svg className={className} viewBox="0 0 20 32" aria-hidden="true">
      <path d="M10 1v30M6 6.2h8M1.6 12.2h16.8M4.6 22h10.8" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.2" y="5.4" width="17.6" height="13.2" rx="1.4" />
      <path d="M4 7.2l8 6.1 8-6.1" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path className="play" d="M9.4 7.6v8.8L17 12z" />
    </svg>
  );
}

const LINKS = [
  {
    label: "Электронная почта",
    href: "#write",
    icon: <MailIcon />,
  },
  {
    label: "ВКонтакте",
    href: "https://vk.ru/probuzhdenierossii",
    icon: <span className="vk-mark">VK</span>,
  },
  {
    label: "Rutube",
    href: "https://rutube.ru/channel/34502812/",
    icon: <PlayIcon />,
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/@ProbuzhdenieChristian",
    icon: <PlayIcon />,
  },
];

const INSIDE = [
  { kicker: "Молитва", title: "Часовня", icon: chapelIcon },
  { kicker: "Для детей", title: "Воскресная школа", icon: bookIcon },
  { kicker: "Причастие", title: "Молитвенные собрания", icon: altarIcon },
  { kicker: "Христианское кафе", title: "Чаепитие", icon: cupIcon },
];

const VISIT = [
  {
    title: "Приходите на служение.",
    text: "Приходите сами и приводите друзей и близких",
  },
  {
    title: "Слушайте слово Божие",
    text: "Проповедь пастора и братьев",
  },
  {
    title: "Молитва за нужды",
    text: "Подайте записку о молитве за Ваши нужды, и церковь будет молиться за них",
  },
  {
    title: "Оставайтесь на чай",
    text: "Общение после служения",
  },
];

function useReducedMotion() {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduce(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  return reduce;
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function filmFrame(progress, count, scrubbing) {
  const wrapped = ((progress % count) + count) % count;
  const current = Math.floor(wrapped);
  const frac = wrapped - current;
  const fade = scrubbing ? smoothstep(0.32, 0.68, frac) : smoothstep(0.58, 0.94, frac);
  const next = (current + 1) % count;
  return {
    current,
    next,
    fade,
    frac,
    shown: fade < 0.5 ? current : next,
  };
}

function AboutCarousel({ photos }) {
  const count = photos.length;
  const reduce = useReducedMotion();
  const [progress, setProgress] = useState(0);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [scrub, setScrub] = useState(false);
  const progressRef = useRef(0);
  const stripRef = useRef(null);
  const headRef = useRef(null);
  const frame = filmFrame(progress, count, scrub);
  const hold = hover || focus || scrub || reduce;

  function moveTo(value) {
    const next = Math.min(count - 1, Math.max(0, value));
    progressRef.current = next;
    setProgress(next);
  }

  function progressFromX(clientX) {
    const strip = stripRef.current;
    if (!strip) return 0;
    const buttons = [...strip.querySelectorAll(".about-film-thumb")];
    if (!buttons.length) return 0;
    const rect = strip.getBoundingClientRect();
    const x = clientX - rect.left + strip.scrollLeft;
    const centers = buttons.map((button) => button.offsetLeft + button.offsetWidth / 2);
    if (x <= centers[0]) return 0;
    const last = centers.length - 1;
    if (x >= centers[last]) return last;
    for (let index = 0; index < last; index += 1) {
      if (x <= centers[index + 1]) {
        const span = centers[index + 1] - centers[index];
        return index + (x - centers[index]) / span;
      }
    }
    return last;
  }

  useEffect(() => {
    if (hold || count < 2) return undefined;
    let raf = 0;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(48, now - last);
      last = now;
      const next = progressRef.current + dt / 4600;
      moveTo(next >= count ? 0 : next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hold, count]);

  useLayoutEffect(() => {
    const strip = stripRef.current;
    const head = headRef.current;
    if (!strip || !head || count < 2) return;
    const buttons = strip.querySelectorAll(".about-film-thumb");
    const place = Math.min(progress, count - 0.0001);
    const index = Math.floor(place);
    const frac = place - index;
    const from = buttons[index];
    const to = buttons[Math.min(count - 1, index + 1)];
    if (!from || !to) return;
    const start = from.offsetLeft + from.offsetWidth / 2;
    const end = to.offsetLeft + to.offsetWidth / 2;
    head.style.left = `${start + (end - start) * frac - strip.scrollLeft}px`;
  }, [progress, count]);

  useEffect(() => {
    const strip = stripRef.current;
    const thumb = strip?.querySelectorAll(".about-film-thumb")[frame.shown];
    if (!strip || !thumb || scrub) return;
    const left = thumb.offsetLeft - (strip.clientWidth - thumb.offsetWidth) / 2;
    strip.scrollTo({ left: Math.max(0, left), behavior: reduce ? "auto" : "smooth" });
  }, [frame.shown, scrub, reduce]);

  function step(dir) {
    moveTo((frame.shown + dir + count) % count);
  }

  return (
    <div
      className="about-gallery"
      role="region"
      aria-roledescription="карусель"
      aria-label="Фотографии храма"
      tabIndex={0}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocus(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          step(1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          step(-1);
        } else if (event.key === "Home") {
          event.preventDefault();
          moveTo(0);
        } else if (event.key === "End") {
          event.preventDefault();
          moveTo(count - 1);
        }
      }}
    >
      <div className="about-frame">
        {photos.map((src, index) => {
          let opacity = 0;
          if (index === frame.current) opacity = 1 - frame.fade;
          else if (index === frame.next && frame.next !== frame.current) opacity = frame.fade;
          const scale = reduce ? 1 : 1.03 + (index === frame.current ? frame.frac * 0.045 : 0);
          return (
            <img
              key={src}
              src={src}
              alt=""
              draggable="false"
              style={{
                opacity,
                transform: `scale(${scale})`,
                zIndex: opacity > 0.5 ? 1 : 0,
              }}
            />
          );
        })}
      </div>
      <div className="about-film-meta">
        <span>
          {frame.shown + 1}/{count}
        </span>
      </div>
      <div className="about-film-wrap">
        {count > 1 && <div className="about-playhead" ref={headRef} aria-hidden="true" />}
        <div
          className="about-film"
          ref={stripRef}
          onPointerDown={(event) => {
            if (event.button !== 0 || count < 2) return;
            event.currentTarget.setPointerCapture(event.pointerId);
            setScrub(true);
            moveTo(progressFromX(event.clientX));
          }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            moveTo(progressFromX(event.clientX));
          }}
          onPointerUp={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            event.currentTarget.releasePointerCapture(event.pointerId);
            const nearest = Math.round(progressRef.current);
            moveTo(nearest);
            setScrub(false);
          }}
        >
          {photos.map((src, index) => (
            <button
              className={`about-film-thumb${index === frame.shown ? " is-active" : ""}`}
              key={src}
              type="button"
              aria-label={`Фото ${index + 1}`}
              aria-current={index === frame.shown ? "true" : undefined}
              onClick={() => moveTo(index)}
            >
              <img src={src} alt="" draggable="false" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Ornament() {
  return (
    <div className="ornament-bar">
      <img src={pub("ornament.png")} alt="" />
    </div>
  );
}

function useReveal() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll("[data-reveal]"));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) {
      nodes.forEach((node) => node.classList.add("is-in"));
      return undefined;
    }
    const show = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("is-in");
        });
      },
      { threshold: 0 },
    );
    const hide = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) entry.target.classList.remove("is-in");
        });
      },
      { threshold: 0, rootMargin: "120px 0px 0px 0px" },
    );
    nodes.forEach((node) => {
      show.observe(node);
      hide.observe(node);
    });
    return () => {
      show.disconnect();
      hide.disconnect();
    };
  }, []);
}

export default function App() {
  const [menu, setMenu] = useState(false);
  const [formState, setFormState] = useState("idle");
  useReveal();

  useEffect(() => {
    document.body.style.overflow = menu ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menu]);

  const closeMenu = () => setMenu(false);

  async function onSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = form.name.value.trim();
    const contact = form.contact.value.trim();
    const message = form.message.value.trim();
    if (!name || !message) {
      if (!name) form.name.value = "";
      else form.message.value = "";
      form.reportValidity();
      return;
    }
    setFormState("sending");
    try {
      await sendNote(name, contact, message);
      form.reset();
      setFormState("sent");
    } catch {
      setFormState("error");
    }
  }

  return (
    <>
      <section className="screen hero" id="top">
        <div
          className="hero-photo"
          style={{ backgroundImage: `url(${pub("hero-bg.png")})` }}
          aria-hidden="true"
        />
        <header className="header">
          <div className="header-inner" data-reveal>
            <a className="brand" href="#top" onClick={closeMenu}>
              <CrossMark className="brand-cross" />
              <span>се стою у двери и стучу...</span>
            </a>
            <button
              className={`menu-toggle${menu ? " is-open" : ""}`}
              type="button"
              aria-expanded={menu}
              aria-label={menu ? "Закрыть меню" : "Открыть меню"}
              onClick={() => setMenu((open) => !open)}
            >
              <span />
              <span />
              <span />
            </button>
            <nav className={`nav${menu ? " is-open" : ""}`}>
              <a href="#visit" onClick={closeMenu}>
                Богослужения
              </a>
              <a href="#about" onClick={closeMenu}>
                Певческая группа
              </a>
              <a href="#contacts" onClick={closeMenu}>
                Контакты
              </a>
              <a
                className="nav-button"
                href={MAP_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={closeMenu}
              >
                Как нас найти
              </a>
            </nav>
          </div>
        </header>

        <div className="hero-stage">
          <div className="hero-left" data-reveal>
            <p className="hero-kicker">
              Служба по воскресеньям
              <br />в 10:00 с 1990 года
            </p>
            <h1>
              <span>Храм</span>
              <span>Свет</span>
              <span>Евангелия</span>
            </h1>
          </div>
          <div className="hero-gap" aria-hidden="true" />
          <p className="hero-call" data-reveal>
            Пробуждение и возрождение
            <br />
            России реально! Для этого есть
            <br />
            мы, и наша вера в нашего
            <br />
            спасителя Иисуса Христа!
            <br />
            Присоединяйся и ты!
          </p>
        </div>
        <Ornament />
      </section>

      <section className="links" aria-label="Ссылки">
        <div className="links-row" data-reveal>
          {LINKS.map((item) => (
            <a
              className="link-item"
              key={item.label}
              href={item.href}
              {...(item.href.startsWith("http")
                ? { target: "_blank", rel: "noreferrer" }
                : {})}
            >
              <span className="link-badge">{item.icon}</span>
              <span className="link-text">
                <span className="link-label">{item.label}</span>
                <span className="link-arrow" aria-hidden="true" />
              </span>
            </a>
          ))}
        </div>
      </section>

      <section className={`screen about${GALLERY.length ? " has-gallery" : ""}`} id="about">
        <div
          className="about-bg"
          style={{ backgroundImage: `url(${pub("ascension.jpg")})` }}
          aria-hidden="true"
        />
        <div className="wrap about-layout" data-reveal>
          <div className="about-copy">
            <p className="kicker">Вместе с 1990 года</p>
            <p className="about-lead">
              Централизованная религиозная организация — Объединение Церквей
              Евангельских Христиан «Пробуждение Христианства» г. Волжский,
              Волгоградская область.
            </p>
          </div>
          {GALLERY.length > 0 && <AboutCarousel photos={GALLERY} />}
        </div>
      </section>

      <section className="screen inside" id="inside">
        <div
          className="inside-bg"
          style={{ backgroundImage: `url(${pub("pastor-bg.jpg")})` }}
          aria-hidden="true"
        />
        <div className="wrap inside-layout" data-reveal>
          <p className="kicker center">Внутри храма</p>
          <h2>
            <span>Часовня, воскресная школа, молитвенные собрания,</span>
            <span>христианское кафе, молодежные встречи</span>
          </h2>
          <div className="inside-grid">
            {INSIDE.map((item) => (
              <article key={item.title}>
                <div className="inside-icon">
                  <img src={item.icon} alt="" />
                </div>
                <p className="inside-kicker">{item.kicker}</p>
                <h3>{item.title}</h3>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="screen pastor" id="pastor">
        <div
          className="pastor-photo"
          data-reveal="photo"
          role="img"
          aria-label="Пастор Кладов Сергей Юрьевич"
          style={{ backgroundImage: `url(${pub("pastor-photo.jpg")})` }}
        />
        <div className="pastor-body" data-reveal>
          <p className="kicker">О нашем пастыре</p>
          <h2>Кладов Сергей Юрьевич</h2>
          <p className="role">Пастор церкви</p>
          <p>
            Здесь будет краткий рассказ о пастыре: как он пришёл к вере, где
            учился и сколько лет служит в церкви. Несколько тёплых слов о семье
            и о том, чем живёт община.
          </p>
          <p>
            Второй абзац — о служении: проповедь по воскресеньям, молитвенные
            собрания, работа с молодёжью и воскресной школой.
          </p>
          <blockquote>
            <CrossMark className="quote-cross" />
            <div>
              <p>
                встань спящий и воскресни из
                <br />
                мертвых и осветит тебя христос
              </p>
              <cite>Ефесянам 5:14</cite>
            </div>
          </blockquote>
        </div>
      </section>

      <section className="screen visit" id="visit">
        <div className="wrap visit-layout" data-reveal>
          <p className="kicker">Ваш первый визит</p>
          <h2>Как проходит воскресенье</h2>
          <ol>
            {VISIT.map((step, index) => (
              <li key={step.title}>
                <span>{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="screen contacts" id="contacts">
        <div
          className="contacts-bg"
          style={{ backgroundImage: `url(${svetBg})` }}
          aria-hidden="true"
        />
        <div className="wrap contacts-grid" data-reveal>
          <p className="kicker">Контакты</p>
          <h2>
            Приходите на
            <br />
            богослужение
          </h2>
          <div className="contact-blocks">
            <div className="contact-block">
              <p className="contact-label">Адрес</p>
              <p>
                Волгоградская область, г. Волжский,
                <br />
                ул. Комсомольская, 22а
              </p>
            </div>
            <div className="contact-block">
              <p className="contact-label">Почта</p>
              <p>
                <a href="mailto:k253vo@mail.ru">k253vo@mail.ru</a>
              </p>
            </div>
            <div className="contact-block">
              <p className="contact-label">Храм открыт</p>
              <p>Ежедневно с 9:00–20:00</p>
            </div>
          </div>
          <form className="card" id="write" onSubmit={onSubmit}>
            <h2>Написать в храм</h2>
            {formState === "sent" ? (
              <div className="form-success" role="status">
                <CrossMark className="form-success-cross" />
                <p>Ваше сообщение отправлено</p>
              </div>
            ) : (
              <>
                <label>
                  <span className="sr">Ваше имя</span>
                  <input
                    name="name"
                    placeholder="Ваше имя"
                    autoComplete="name"
                    required
                  />
                </label>
                <label>
                  <span className="sr">Ваш телефон или почта (по желанию)</span>
                  <input
                    name="contact"
                    placeholder="Ваш телефон или почта (по желанию)"
                    autoComplete="off"
                  />
                </label>
                <label>
                  <span className="sr">Ваше сообщение или записка</span>
                  <textarea
                    name="message"
                    placeholder="Ваше сообщение или записка"
                    rows={4}
                    required
                  />
                </label>
                <button
                  className="gold-button"
                  type="submit"
                  disabled={formState === "sending"}
                >
                  {formState === "sending" ? "Отправляем…" : "Отправить"}
                </button>
                {formState === "error" && (
                  <p className="form-note is-error">
                    Не удалось отправить. Попробуйте ещё раз.
                  </p>
                )}
              </>
            )}
          </form>
        </div>
      </section>

      <footer className="screen footer">
        <Ornament />
        <div className="wrap footer-main" data-reveal>
          <div className="footer-grid">
            <div>
              <p className="footer-brand">
                <span className="light">Храм</span> <span>Свет</span>
              </p>
              <p className="footer-brand second">Евангелия</p>
            </div>
            <div>
              <h2>Богослужения</h2>
              <ul>
                <li>Воскресная служба — вс 10:00</li>
                <li>Всенощная молитва — пт 22:00</li>
              </ul>
            </div>
            <div>
              <h2>Приход</h2>
              <ul>
                <li>Певческая группа</li>
                <li>Воскресная школа</li>
                <li>Милосердие</li>
              </ul>
            </div>
            <div>
              <h2>Контакты</h2>
              <ul>
                <li>
                  г. Волжский, ул.
                  <br />
                  Комсомольская, 22а
                </li>
                <li>
                  <a href="mailto:k253vo@mail.ru">k253vo@mail.ru</a>
                </li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <p>© 2026 Храм Свет Евангелия</p>
            <p className="motto">Бог есть свет</p>
          </div>
        </div>
      </footer>
    </>
  );
}
