import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorker;
import chapelIcon from "./assets/icons/chapel.png";
import bookIcon from "./assets/icons/book.png";
import altarIcon from "./assets/icons/altar.png";
import cupIcon from "./assets/icons/cup.png";
import emailLink from "./assets/icons/email.png";
import vkLink from "./assets/icons/vk.png";
import rutubeLink from "./assets/icons/rt.png";
import youtubeLink from "./assets/icons/yt.png";
import svetBg from "./assets/svet.png";

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

const LINKS = [
  {
    id: "email",
    label: "Электронная почта",
    href: "#write",
    icon: emailLink,
  },
  {
    id: "vk",
    label: "ВКонтакте",
    href: "https://vk.ru/probuzhdenierossii",
    icon: vkLink,
  },
  {
    id: "rutube",
    label: "Rutube",
    href: "https://rutube.ru/channel/34502812/",
    icon: rutubeLink,
  },
  {
    id: "youtube",
    label: "YouTube",
    href: "https://www.youtube.com/@ProbuzhdenieChristian",
    icon: youtubeLink,
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
      let next = progressRef.current + dt / 4600;
      next = ((next % count) + count) % count;
      progressRef.current = next;
      setProgress(next);
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
    const view = filmFrame(progress, count, false);
    const returning = view.current === count - 1;
    const index = returning ? view.shown : Math.floor(progress);
    const frac = returning ? 0 : progress - index;
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

function normalizedRotation(page) {
  return ((page.rotate % 360) + 360) % 360;
}

function mostCommon(values) {
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  let best = null;
  let bestCount = 0;
  counts.forEach((count, value) => {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  });
  return best;
}

async function measureTurn(page, worker) {
  const viewport = page.getViewport({ scale: 1.4, rotation: normalizedRotation(page) });
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const canvasContext = canvas.getContext("2d");
  canvasContext.fillStyle = "#ffffff";
  canvasContext.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext, viewport }).promise;
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  const { data } = await worker.detect(blob);
  if (data.orientation_degrees == null || data.orientation_confidence < 2) return null;
  return data.orientation_degrees;
}

function usePdfIssue() {
  const [state, setState] = useState({ ready: false, pages: null });

  useEffect(() => {
    let cancel = false;
    let documentTask;
    (async () => {
      try {
        const response = await fetch(pub("data/issue.pdf"), { cache: "no-store" });
        if (!response.ok) throw new Error("missing");
        const data = await response.arrayBuffer();
        documentTask = getDocument({ data });
        const pdf = await documentTask.promise;
        let turns = [];
        try {
          const imported = await import("tesseract.js/dist/tesseract.esm.min.js");
          const Tesseract = imported.createWorker ? imported : imported.default;
          const worker = await Tesseract.createWorker("osd", 0, {
            workerPath: pub("tessdata/worker.min.js"),
            corePath: pub("tessdata/tesseract-core.wasm.js"),
            langPath: pub("tessdata"),
            workerBlobURL: false,
          });
          try {
            for (let number = 1; number <= pdf.numPages; number += 1) {
              if (cancel) return;
              turns.push(await measureTurn(await pdf.getPage(number), worker));
            }
          } finally {
            await worker.terminate();
          }
        } catch {
          turns = [];
        }
        if (cancel) return;
        const fallback = mostCommon(turns.filter((turn) => turn != null));
        const pages = [];
        for (let number = 1; number <= pdf.numPages; number += 1) {
          const page = await pdf.getPage(number);
          const rotation = (normalizedRotation(page) + (turns[number - 1] ?? fallback ?? 0)) % 360;
          const viewport = page.getViewport({ scale: 2, rotation });
          const canvas = window.document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const canvasContext = canvas.getContext("2d");
          await page.render({ canvasContext, viewport }).promise;
          pages.push(canvas.toDataURL("image/jpeg", 0.92));
        }
        if (!cancel) setState({ ready: true, pages });
      } catch {
        if (!cancel) setState({ ready: true, pages: null });
      }
    })();
    return () => {
      cancel = true;
      documentTask?.destroy();
    };
  }, []);

  return state;
}

function PdfPaper({ pages }) {
  const sheets = [];
  const list = pages.length % 2 === 0 ? pages : [...pages, null];
  for (let index = 0; index < list.length; index += 2) {
    sheets.push([list[index], list[index + 1]]);
  }

  return sheets.map((pair, spreadIndex) => (
    <div className="paper-spread" key={spreadIndex}>
      {pair.map((src, side) => {
        const folio = spreadIndex * 2 + side + 1;
        return (
          <article className="paper-page pdf-page" key={folio}>
            {src ? <img className="pdf-sheet" src={src} alt="" /> : null}
            <p className={`paper-folio${side === 1 ? " paper-folio-right" : ""}`}>{folio}</p>
          </article>
        );
      })}
    </div>
  ));
}

function Newspaper({ onClose }) {
  const stackRef = useRef(null);
  const { ready, pages } = usePdfIssue();

  useLayoutEffect(() => {
    const stack = stackRef.current;
    if (!stack) return undefined;
    const pages = () => [...stack.querySelectorAll(".paper-page")];
    const equalize = () => {
      const nodes = pages();
      nodes.forEach((page) => {
        page.style.minHeight = "";
      });
      if (window.matchMedia("(max-width: 760px)").matches) return;
      const tallest = nodes.reduce((max, page) => Math.max(max, page.getBoundingClientRect().height), 0);
      const height = `${Math.ceil(tallest)}px`;
      nodes.forEach((page) => {
        page.style.minHeight = height;
      });
    };

    equalize();
    const images = [...stack.querySelectorAll("img")];
    images.forEach((image) => image.addEventListener("load", equalize));
    images.forEach((image) => image.addEventListener("error", equalize));
    window.addEventListener("resize", equalize);
    document.fonts?.ready.then(equalize);
    return () => {
      images.forEach((image) => image.removeEventListener("load", equalize));
      images.forEach((image) => image.removeEventListener("error", equalize));
      window.removeEventListener("resize", equalize);
    };
  }, [ready, pages]);

  return (
    <div className="paper-view" role="dialog" aria-modal="true" aria-label="Наша газета">
      <svg className="paper-filters" aria-hidden="true">
        <filter id="newsprint" x="-3%" y="-3%" width="106%" height="106%">
          <feTurbulence type="fractalNoise" baseFrequency="0.62" numOctaves="2" seed="4" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="0.62" xChannelSelector="R" yChannelSelector="G" result="shifted" />
          <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" seed="2" result="blot" />
          <feColorMatrix
            in="blot"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.72 0 0 0 0.32"
            result="holes"
          />
          <feComposite in="shifted" in2="holes" operator="in" />
        </filter>
      </svg>
      <button className="paper-close" type="button" onClick={onClose}>
        Закрыть
      </button>
      {!ready && (
        <div className="paper-loader" role="status" aria-live="polite">
          <div className="paper-loader-book" aria-hidden="true">
            <span className="paper-loader-leaf" />
          </div>
          <p>Открываем выпуск</p>
        </div>
      )}
      <div className="paper-scroll" onClick={onClose}>
        <div className="paper-stack" ref={stackRef} onClick={(event) => event.stopPropagation()}>
        {ready && pages ? <PdfPaper pages={pages} /> : ready && (
        <>
        <div className="paper-spread">
          <article className="paper-page">
            <div className="paper-ink">
              <header className="paper-mast">
                <p>Волжский</p>
                <h2>Свет Евангелия</h2>
                <p>Воскресный листок</p>
              </header>
              <p className="paper-sample">Образец для подбора бумаги и шрифта</p>
              <p className="paper-kicker">Воскресное собрание</p>
              <h3>Приходите, как есть</h3>
            </div>
            <img
              className="paper-photo"
              src={pub("ascension.jpg")}
              alt="Внутренний двор храма"
            />
            <div className="paper-ink">
              <p className="paper-caption">Храм на Комсомольской, 22а</p>
              <p className="paper-lead">
                В воскресенье церковь собирается к десяти. Двери открыты раньше:
                можно войти, сесть и помолчать, пока зал ещё наполняется. Первые
                минуты здесь тихие, и в этом тоже есть место для человека, который
                пришёл впервые.
              </p>
              <p className="paper-folio">1</p>
            </div>
          </article>
          <article className="paper-page">
            <div className="paper-ink">
              <p className="paper-running">Свет Евангелия · Волжский</p>
              <div className="paper-columns">
                <p>
                  Служба простая. Поют вместе, читают Писание, пастор говорит о
                  Христе понятными словами. После проповеди можно подать записку о
                  нужде: община молится не за общую тему, а за конкретные имена.
                </p>
                <p>
                  Затем остаётся чай. Никто не спрашивает, давно ли вы в церкви и
                  знаете ли порядок. Если захотите, с вами поговорят. Если нет,
                  можно просто побыть рядом и уйти, когда будете готовы.
                </p>
                <p>
                  Так проходит каждое воскресенье. Новый человек не обязан знать,
                  куда встать и когда петь. Рядом подскажут, если спросите, и не
                  станут торопить, если вы просто смотрите.
                </p>
              </div>
              <p className="paper-folio paper-folio-right">2</p>
            </div>
          </article>
        </div>
        <div className="paper-spread">
          <article className="paper-page">
            <div className="paper-ink">
              <p className="paper-running">Свет Евангелия · Волжский</p>
              <p className="paper-kicker">После собрания</p>
              <h3>Остаёмся на чай</h3>
              <p className="paper-lead">
                Чай накрывают в той же зале, где только что пели. Столы сдвигают,
                ставят чашки, и разговор начинается сам: о проповеди, о детях, о
                том, кому на этой неделе нужна помощь.
              </p>
              <p>
                Можно подойти к пастору с вопросом, который не решились задать
                при всех. Можно просто посидеть у окна. Никто не ведёт список
                гостей и не просит оставить телефон.
              </p>
              <p className="paper-folio">3</p>
            </div>
          </article>
          <article className="paper-page">
            <div className="paper-ink">
              <p className="paper-running">Свет Евангелия · Волжский</p>
              <div className="paper-columns">
                <p>
                  Для детей в это время открыта воскресная школа. Они возвращаются
                  к родителям как раз к чаю и рассказывают, что разбирали сегодня.
                </p>
                <p>
                  Если вы пришли впервые, сядьте там, где свободно. Чашку вам
                  нальют. Разговор можно не поддерживать: присутствия достаточно.
                </p>
              </div>
              <p className="paper-folio paper-folio-right">4</p>
            </div>
          </article>
        </div>
        <div className="paper-spread">
          <article className="paper-page">
            <div className="paper-ink">
              <p className="paper-running">Свет Евангелия · Волжский</p>
              <p className="paper-kicker">Адрес</p>
              <h3>Комсомольская, 22а</h3>
              <p className="paper-lead">
                Храм открыт каждый день с девяти утра до восьми вечера. Воскресная
                служба начинается в десять. Вход со двора, дверь не запирают
                заранее.
              </p>
              <p className="paper-folio">5</p>
            </div>
          </article>
          <article className="paper-page">
            <div className="paper-ink">
              <p className="paper-running">Свет Евангелия · Волжский</p>
              <p>
                Записку о молитве можно передать в воскресенье или оставить через
                форму на сайте. Напишите имя и нужду своими словами. Община
                молится за то, что вы доверили.
              </p>
              <p>
                Этот разворот короче предыдущих: так видно, что следующий лист
                начинается отдельно, даже если текста на нём немного.
              </p>
              <p className="paper-folio paper-folio-right">6</p>
            </div>
          </article>
        </div>
        </>
        )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [menu, setMenu] = useState(false);
  const [paper, setPaper] = useState(false);
  const [formState, setFormState] = useState("idle");
  useReveal();

  useEffect(() => {
    document.body.style.overflow = menu || paper ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menu, paper]);

  useEffect(() => {
    if (!paper) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") setPaper(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paper]);

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
      {paper && <Newspaper onClose={() => setPaper(false)} />}
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
              <button
                className="nav-paper"
                type="button"
                onClick={() => {
                  closeMenu();
                  setPaper(true);
                }}
              >
                Наша газета
              </button>
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
              <span className={`link-badge link-badge-${item.id}`}>
                <img src={item.icon} alt="" />
              </span>
              <span className="link-text">
                <span className="link-label">{item.label}</span>
                <span className="link-arrow" aria-hidden="true" />
              </span>
            </a>
          ))}
        </div>
      </section>

      <section className={`screen about${GALLERY.length ? " has-gallery" : ""}`} id="about">
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
        <div
          className="visit-bg"
          style={{ backgroundImage: `url(${pub("ascension.jpg")})` }}
          aria-hidden="true"
        />
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
            <p>© {new Date().getFullYear()} Храм Свет Евангелия</p>
            <p className="motto">Бог есть свет</p>
          </div>
        </div>
      </footer>
    </>
  );
}
