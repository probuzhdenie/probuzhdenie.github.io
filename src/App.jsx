import { useEffect, useLayoutEffect, useRef, useState } from "react";
import galleryFiles from "virtual:gallery";
import verses from "./data/verses-list.json";

const pub = (file) => `${import.meta.env.BASE_URL}${file}`;

const chapelIcon = pub("images/chapel.png");
const bookIcon = pub("images/book.png");
const altarIcon = pub("images/altar.png");
const cupIcon = pub("images/cup.png");
const emailLink = pub("images/email.jpg");
const vkLink = pub("images/vk.jpg");
const rutubeLink = pub("images/rt.jpg");
const youtubeLink = pub("images/yt.jpg");
const svetBg = pub("images/svet.jpg");
const heroBg = pub("images/cross.jpg");
const pastorPhoto = pub("images/pastor.jpg");
const visitBg = pub("images/ascension.jpg");

const GALLERY = galleryFiles.map((photo) => pub(photo.full));

const MAP_URL =
  "https://yandex.ru/maps/?ll=44.741985%2C48.803119&z=17&pt=44.741985%2C48.803119%2Cpm2rdm&mode=whatshere&whatshere%5Bpoint%5D=44.741985%2C48.803119&whatshere%5Bzoom%5D=17";

const SCRIPT_URL = import.meta.env.VITE_GAS_URL;
const MIN_NOTE_AGE_MS = 3000;
const NOTE_KINDS = [
  { id: "pastor", label: "Обращение к пастору" },
  { id: "prayer", label: "Молитвенная записка" },
];

async function requestToken() {
  if (!SCRIPT_URL) throw new Error("send failed");
  const response = await fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ issue: "token" }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.token) throw new Error("send failed");
  return data.token;
}

async function sendNote(name, contact, message, kind, fax, token) {
  if (!SCRIPT_URL) throw new Error("send failed");
  const response = await fetch(SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ name, contact, message, kind, fax, token }),
  });
  const data = await response.json().catch(() => null);
  if (response.ok && data?.ok) return;
  const error = new Error("send failed");
  error.reason = data?.reason || "bad";
  throw error;
}

function CrossMark({ className }) {
  return (
    <svg className={className} viewBox="0 0 20 32" aria-hidden="true">
      <path d="M10 1v30M6 6.2h8M1.6 12.2h16.8M4.6 22h10.8" />
    </svg>
  );
}

const SHARE_TITLE = "Храм Свет Евангелия в Волжском";
const SHARE_TEXT =
  "Богослужение каждое воскресенье в 10:00. г. Волжский, ул. Комсомольская, 22а";

function nextVerseIndex() {
  const key = "verse-index";

  try {
    const raw = sessionStorage.getItem(key);
    const saved = raw === null ? NaN : Number(raw);
    const index = Number.isInteger(saved) ? (saved + 1) % verses.length : 0;
    sessionStorage.setItem(key, String(index));
    return index;
  } catch {
    return Math.floor(Math.random() * verses.length);
  }
}

const VERSE = verses[nextVerseIndex()];

function getShareUrl() {
  const canonical = document.querySelector('link[rel="canonical"]')?.href;
  return canonical || window.location.href.split("#")[0];
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // пробуем fallback ниже
    }
  }

  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.cssText = "position:fixed;top:-1000px;opacity:0";
  document.body.appendChild(area);
  area.select();
  area.setSelectionRange(0, area.value.length);

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}

function ShareButton({ onBeforeShare }) {
  const [status, setStatus] = useState("idle");
  const [url, setUrl] = useState("");
  const timerRef = useRef(0);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  function announce(next) {
    setStatus(next);
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setStatus("idle"), 2600);
  }

  async function onClick() {
    onBeforeShare?.();
    window.clearTimeout(timerRef.current);
    setStatus("idle");

    const shareUrl = getShareUrl();

    if (navigator.share) {
      try {
        // Вызываем сразу в обработчике клика: так сохраняется жест пользователя.
        // Успех системного окна никак не подсвечиваем — сайт не знает, что произошло дальше.
        await navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url: shareUrl });
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }

    setUrl(shareUrl);
    const ok = await copyText(shareUrl);
    announce(ok ? "copied" : "error");
  }

  return (
    <div className="share-header-wrap">
      {status === "copied" && (
        <span className="share-done" role="status" aria-label="Ссылка скопирована">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M4 10.6 8.1 14.7 16 6.6" />
          </svg>
        </span>
      )}

      <button
        className="share-header"
        type="button"
        onClick={onClick}
        aria-label="Поделиться"
      >
        <span className="share-header-text">Поделиться</span>
        <svg className="share-header-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 15V3m0 0L8 7m4-4 4 4M5 13v6h14v-6" />
        </svg>
      </button>

      {status === "error" && (
        <div className="share-error" role="status">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M5 5 15 15M15 5 5 15" />
          </svg>
          <input
            className="share-fallback"
            readOnly
            value={url}
            onFocus={(event) => event.target.select()}
            aria-label="Адрес сайта для копирования"
          />
        </div>
      )}
    </div>
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
  { kicker: "Молитва", title: "Часовня и святая вода", icon: chapelIcon },
  { kicker: "Для детей", title: "Воскресная школа", icon: bookIcon },
  { kicker: "Причастие", title: "Молитвенные собрания", icon: altarIcon },
  { kicker: "Христианское кафе", title: "Чаепитие и общение", icon: cupIcon },
];

const VISIT = [
  {
    title: "Приходите на служение",
    text: "Приходите сами и приводите друзей и близких",
  },
  {
    title: "Слушайте слово Божие",
    text: "Проповедь пастора и братьев",
  },
  {
    title: "Молимся за нужды",
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

function AboutCarousel({ photos }) {
  const count = photos.length;
  const reduce = useReducedMotion();
  const galleryRef = useRef(null);
  const trackRef = useRef(null);
  const indexRef = useRef(null);
  const offsetRef = useRef(0);
  const metricsRef = useRef({ stride: 0, loop: 0 });
  const shownRef = useRef(-1);
  const holdRef = useRef({ hover: false, focus: false, drag: false, visible: false });
  const reduceRef = useRef(reduce);
  const pointerRef = useRef(null);
  const placedRef = useRef(false);
  const apiRef = useRef({
    sync() {},
    apply() {},
    stride() {
      return 0;
    },
  });
  const [copies, setCopies] = useState(2);
  reduceRef.current = reduce;

  useEffect(() => {
    const stage = galleryRef.current;
    const track = trackRef.current;
    if (!stage || !track || count < 1) return undefined;

    let raf = 0;
    let last = 0;
    let running = false;

    const measure = () => {
      const card = track.querySelector(".about-card");
      const viewport = stage.querySelector(".about-viewport");
      if (!card || !viewport) return;
      const styles = getComputedStyle(track);
      const gap = Number.parseFloat(styles.columnGap || styles.gap) || 0;
      const stride = card.offsetWidth + gap;
      const loop = stride * count;
      metricsRef.current = { stride, loop };
      if (!placedRef.current && stride > 0) {
        offsetRef.current = stride * 0.45;
        placedRef.current = true;
      }
      const need = loop > 0 ? Math.max(2, Math.ceil(viewport.clientWidth / loop) + 1) : 2;
      setCopies((prev) => (prev === need ? prev : need));
    };

    const apply = () => {
      const { stride, loop } = metricsRef.current;
      if (!(loop > 0)) return;
      offsetRef.current = ((offsetRef.current % loop) + loop) % loop;
      track.style.transform = `translate3d(${-offsetRef.current}px,0,0)`;
      const viewport = stage.querySelector(".about-viewport");
      if (!viewport || !indexRef.current || !(stride > 0)) return;
      const center = offsetRef.current + viewport.clientWidth / 2;
      const index = ((Math.floor(center / stride) % count) + count) % count;
      if (index !== shownRef.current) {
        shownRef.current = index;
        indexRef.current.textContent = `${index + 1} — ${count}`;
      }
    };

    const tick = (now) => {
      const dt = last ? Math.min(48, now - last) : 16;
      last = now;
      const { stride } = metricsRef.current;
      if (stride > 0) {
        offsetRef.current += (stride / 5200) * dt;
        apply();
      }
      raf = requestAnimationFrame(tick);
    };

    const sync = () => {
      const hold = holdRef.current;
      const play =
        !reduceRef.current && hold.visible && !hold.hover && !hold.focus && !hold.drag && count > 1;
      if (play && !running) {
        running = true;
        last = 0;
        raf = requestAnimationFrame(tick);
      } else if (!play && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    };

    apiRef.current = { sync, apply, stride: () => metricsRef.current.stride };
    measure();
    apply();

    const resize = new ResizeObserver(() => {
      measure();
      apply();
    });
    resize.observe(stage);

    const seen = new IntersectionObserver(([entry]) => {
      holdRef.current.visible = Boolean(entry?.isIntersecting);
      sync();
    });
    seen.observe(stage);

    const onWheel = (event) => {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      offsetRef.current += event.deltaX;
      apply();
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    sync();

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      resize.disconnect();
      seen.disconnect();
      stage.removeEventListener("wheel", onWheel);
      apiRef.current = {
        sync() {},
        apply() {},
        stride() {
          return 0;
        },
      };
    };
  }, [count, copies]);

  useEffect(() => {
    reduceRef.current = reduce;
    apiRef.current.sync();
  }, [reduce]);

  function shift(cards) {
    const stride = apiRef.current.stride();
    if (!stride) return;
    offsetRef.current += cards * stride;
    apiRef.current.apply();
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    pointerRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      origin: offsetRef.current,
      dragging: event.pointerType === "mouse",
    };
    if (event.pointerType === "mouse") {
      event.currentTarget.setPointerCapture(event.pointerId);
      holdRef.current.drag = true;
      apiRef.current.sync();
    }
  }

  function onPointerMove(event) {
    const point = pointerRef.current;
    if (!point || point.id !== event.pointerId) return;
    const dx = event.clientX - point.x;
    const dy = event.clientY - point.y;
    if (!point.dragging) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        pointerRef.current = null;
        return;
      }
      point.dragging = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      holdRef.current.drag = true;
      apiRef.current.sync();
    }
    offsetRef.current = point.origin - dx;
    apiRef.current.apply();
  }

  function onPointerUp(event) {
    const point = pointerRef.current;
    if (!point || point.id !== event.pointerId) return;
    pointerRef.current = null;
    if (!point.dragging) return;
    holdRef.current.drag = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    apiRef.current.sync();
  }

  return (
    <div
      className="about-gallery"
      ref={galleryRef}
      role="region"
      aria-roledescription="карусель"
      aria-label="Фотографии храма"
      tabIndex={0}
      onMouseEnter={() => {
        holdRef.current.hover = true;
        apiRef.current.sync();
      }}
      onMouseLeave={() => {
        holdRef.current.hover = false;
        apiRef.current.sync();
      }}
      onFocus={(event) => {
        if (!event.currentTarget.matches(":focus-visible")) return;
        holdRef.current.focus = true;
        apiRef.current.sync();
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        holdRef.current.focus = false;
        apiRef.current.sync();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") {
          event.preventDefault();
          shift(1);
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          shift(-1);
        } else if (event.key === "Home") {
          event.preventDefault();
          offsetRef.current = 0;
          apiRef.current.apply();
        } else if (event.key === "End") {
          event.preventDefault();
          offsetRef.current = apiRef.current.stride() * Math.max(0, count - 1);
          apiRef.current.apply();
        }
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="about-stage">
        <div className="about-viewport">
          <div className="about-track" ref={trackRef}>
            {Array.from({ length: copies }, (_, copy) =>
              photos.map((src, index) => (
                <div className="about-card" key={`${copy}-${index}`}>
                  <img src={src} alt="" draggable="false" />
                </div>
              )),
            )}
          </div>
        </div>
        <p className="about-index" ref={indexRef} aria-hidden="true">
          1 — {count}
        </p>
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

function useFooterScroll() {
  useEffect(() => {
    const query = window.matchMedia(
      "(orientation: landscape) and (min-width: 761px) and (max-height: 1024px)",
    );
    const footer = document.querySelector(".footer");
    if (!footer) return undefined;
    const root = document.documentElement;
    const screens = [...document.querySelectorAll(".screen:not(.footer)")];
    let holding = false;
    let frame = 0;

    const apply = () => {
      if (!query.matches) {
        holding = false;
        root.style.scrollSnapType = "";
        return;
      }
      const top = footer.getBoundingClientRect().top;
      const height = window.innerHeight;
      const aligned = screens.some(
        (screen) => Math.abs(screen.getBoundingClientRect().top) <= 3,
      );
      if (!holding && top < height - 1) holding = true;
      else if (holding && top >= height - 1 && aligned) holding = false;
      root.style.scrollSnapType = holding ? "none" : "";
    };

    const onChange = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener("scroll", onChange, { passive: true });
    window.addEventListener("resize", onChange);
    query.addEventListener("change", onChange);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onChange);
      window.removeEventListener("resize", onChange);
      query.removeEventListener("change", onChange);
      root.style.scrollSnapType = "";
    };
  }, []);
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
      { threshold: 0, rootMargin: "120px 0px 180px 0px" },
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

function sheetScale(width, height) {
  const cssWidth = Math.min(window.innerWidth || 390, 900);
  const pixels = cssWidth * Math.min(window.devicePixelRatio || 1, 2);
  let scale = pixels / width;
  const longest = Math.max(width, height) * scale;
  if (longest > 1600) scale *= 1600 / longest;
  return Math.max(scale, 0.5);
}

async function paintPage(page) {
  const base = page.getViewport({ scale: 1 });
  let scale = sheetScale(base.width, base.height);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const viewport = page.getViewport({ scale });
    const canvas = window.document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const canvasContext = canvas.getContext("2d");
    if (!canvasContext) {
      scale *= 0.6;
      continue;
    }
    await page.render({ canvasContext, viewport }).promise;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
    canvas.width = 0;
    canvas.height = 0;
    if (blob) return URL.createObjectURL(blob);
    scale *= 0.6;
  }
  throw new Error("canvas");
}

let issueCache = null;

function usePdfIssue() {
  const [state, setState] = useState(
    issueCache ? { ready: true, pages: issueCache } : { ready: false, pages: null },
  );

  useEffect(() => {
    if (issueCache) return undefined;
    let cancel = false;
    let documentTask;
    const urls = [];
    (async () => {
      try {
        const response = await fetch(pub("data/issue.pdf"));
        if (!response.ok) throw new Error("missing");
        const data = await response.arrayBuffer();
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const workerModule = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(workerModule.default, window.location.href).href;
        if (cancel) return;
        documentTask = pdfjs.getDocument({
          data,
          isOffscreenCanvasSupported: false,
          isImageDecoderSupported: false,
        });
        const pdf = await documentTask.promise;
        if (cancel) return;
        const pages = [];
        for (let number = 1; number <= pdf.numPages; number += 1) {
          if (cancel) return;
          const page = await pdf.getPage(number);
          const url = await paintPage(page);
          urls.push(url);
          pages.push(url);
          if (!cancel) setState({ ready: true, pages: pages.slice() });
        }
        if (!cancel) issueCache = pages.slice();
      } catch {
        if (!cancel) setState({ ready: true, pages: null });
      }
    })();
    return () => {
      cancel = true;
      documentTask?.destroy();
      if (!issueCache) urls.forEach((url) => URL.revokeObjectURL(url));
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
        {ready && pages?.length ? <PdfPaper pages={pages} /> : ready && (
          <div className="paper-spread">
            <article className="paper-page paper-notice">
              <p>Ведутся технические работы.</p>
              <p>Приносим наши извинения.</p>
            </article>
          </div>
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
  const openedRef = useRef(Date.now());
  const tokenRef = useRef("");
  useReveal();
  useFooterScroll();

  useEffect(() => {
    let cancel = false;
    requestToken()
      .then((token) => {
        if (!cancel) tokenRef.current = token;
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, []);

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
    const kind = form.kind.value;
    const fax = form.fax.value.trim();
    if (!NOTE_KINDS.some((item) => item.id === kind) || !name || !message) {
      if (!name) form.name.value = "";
      if (!message) form.message.value = "";
      form.reportValidity();
      return;
    }
    if (fax) {
      form.reset();
      setFormState("sent");
      return;
    }
    if (Date.now() - openedRef.current < MIN_NOTE_AGE_MS) {
      setFormState("wait");
      return;
    }
    setFormState("sending");
    try {
      let token = tokenRef.current;
      if (!token) {
        try {
          token = await requestToken();
          tokenRef.current = token;
        } catch {
          token = "";
        }
      }
      await sendNote(name, contact, message, kind, fax, token);
      form.reset();
      setFormState("sent");
    } catch (error) {
      if (error?.reason === "soon") setFormState("wait");
      else if (error?.reason === "rate") setFormState("limited");
      else {
        tokenRef.current = "";
        requestToken()
          .then((token) => {
            tokenRef.current = token;
          })
          .catch(() => {});
        setFormState("error");
      }
    }
  }

  return (
    <>
      {paper && <Newspaper onClose={() => setPaper(false)} />}
      <section className="screen hero" id="top">
        <div
          className="hero-photo"
          style={{ backgroundImage: `url(${heroBg})` }}
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
            </nav>
            <ShareButton onBeforeShare={closeMenu} />
          </div>
        </header>

        <div className="hero-stage">
          <div className="hero-left" data-reveal>
            <p className="hero-kicker">
              Служба по воскресеньям
              <br />в городе Волжском в 10:00 с 1990 года
            </p>
            <h1>
              <span>Храм</span>
              <span>Свет</span>
              <span>Евангелия</span>
            </h1>
          </div>
          <div className="hero-gap" aria-hidden="true" />
          <p className="hero-call" data-reveal>
            Пробуждение и возрождение России реально!
            <br />
            Для этого есть мы, и наша вера в нашего спасителя Иисуса Христа!           
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
          style={{ backgroundImage: `url(${pastorPhoto})` }}
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
          style={{ backgroundImage: `url(${visitBg})` }}
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
          <figure className="visit-verse">
            <blockquote className="visit-verse-text">{VERSE.text}</blockquote>
            <figcaption className="visit-verse-ref">— {VERSE.reference}</figcaption>
          </figure>
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
            <span className="contacts-time">каждое воскресенье в 10:00</span>
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
            <a
              className="gold-button map-button"
              href={MAP_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Как нас найти
            </a>
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
                  <span className="sr">Вид сообщения</span>
                  <select name="kind" defaultValue="" required>
                    <option value="" disabled>
                      Вид сообщения
                    </option>
                    {NOTE_KINDS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
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
                <label className="hp-field" aria-hidden="true">
                  <span>Факс</span>
                  <input name="fax" tabIndex={-1} autoComplete="off" defaultValue="" />
                </label>
                <div className="form-actions">
                  <button
                    className="gold-button"
                    type="submit"
                    disabled={formState === "sending"}
                  >
                    {formState === "sending" ? "Отправляем…" : "Отправить"}
                  </button>
                  {formState === "wait" && (
                    <p className="form-note is-error">
                      Подождите несколько секунд и отправьте ещё раз.
                    </p>
                  )}
                  {formState === "limited" && (
                    <p className="form-note is-error">
                      Сейчас много сообщений. Напишите чуть позже.
                    </p>
                  )}
                  {formState === "error" && (
                    <p className="form-note is-error">
                      Не удалось отправить. Попробуйте ещё раз.
                    </p>
                  )}
                </div>
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
            <p className="motto">переходи на сторону Христа</p>
          </div>
        </div>
      </footer>
    </>
  );
}
