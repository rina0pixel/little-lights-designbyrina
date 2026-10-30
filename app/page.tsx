"use client";
import { useState, useEffect, useRef, type CSSProperties } from "react";
import { isNearTable, isNearSpot, START, type Position } from "./movement";
import { FestivalWorld } from "./world";
import { Ambience } from "./ambience";
import { moderate } from "./api/wishes/moderation";
import {
  Flame,
  Wind,
  Flower2,
  Utensils,
  Gift,
  Lamp,
  Sparkles,
  Volume2,
  VolumeX,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  X,
  Mail,
  Check,
  BookOpen,
  Flag,
  Eye,
  Link2,
} from "lucide-react";
const colors = ["#e78899", "#5b9f93", "#e8ac55", "#9c8ac7"];
const activities = [
  {
    id: "lantern",
    en: "Light a lantern",
    mm: "မီးပုံးထွန်းမယ်",
    icon: Lamp,
  },
  {
    id: "balloon",
    en: "Send a wish to the sky",
    mm: "ဆုတောင်းမီးပုံးလွှတ်မယ်",
    icon: Wind,
  },
  {
    id: "candles",
    en: "Light the candles",
    mm: "ဖယောင်းတိုင်ထွန်းမယ်",
    icon: Flame,
  },
  {
    id: "lotus",
    en: "Float a lotus lantern",
    mm: "ကြာမီးခွက်မျှောမယ်",
    icon: Flower2,
  },
  {
    id: "eat",
    en: "Rice Balls",
    mm: "သူငယ်ချင်းတွေနဲ့ မုန့်စားမယ်",
    icon: Utensils,
  },
  {
    id: "gift",
    en: "Give a little sweetness",
    mm: "သူငယ်ချင်းကို မုန့်ပေးမယ်",
    icon: Gift,
  },
];
type Wish = {
  id: string;
  name: string;
  message: string;
  kind: string;
  created: number;
  color?: number | null;
  shape?: number | null;
};

// A random UUID supplies stable, independent choices so every visitor sees the same balloon.
function balloonDesign(id: string) {
  let seed = 2166136261;
  for (const c of id) seed = Math.imul(seed ^ c.charCodeAt(0), 16777619);
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  return {
    shape: Math.floor(next() * 5),
    color: Math.floor(next() * 7),
    sketch: Math.floor(next() * 5),
    x: 14 + next() * 72,
    y: 11 + next() * 19,
    drift: next() * 8 - 4,
  };
}
function WishBalloon({
  id,
  color,
  shape,
}: {
  id: string;
  color?: number | null;
  shape?: number | null;
}) {
  const d = {
      ...balloonDesign(id),
      ...(color != null ? { color } : {}),
      ...(shape != null ? { shape } : {}),
    },
    palette = [
      "#f095a0",
      "#edb764",
      "#a6c790",
      "#8dcbd2",
      "#b4a0dc",
      "#ed9879",
      "#e1c775",
    ];
  const paths = [
    "M23 13Q40 5 57 13L61 60Q40 72 19 60Z",
    "M40 8C7 8 9 59 33 66L47 66C71 59 73 8 40 8Z",
    "M40 22C21 -3 0 23 18 42L40 65L62 42C80 23 59 -3 40 22Z",
    "M40 5L49 24L70 27L55 43L59 65L40 55L21 65L25 43L10 27L31 24Z",
    "M40 5Q52 20 65 36Q56 55 40 68Q24 55 15 36Q28 20 40 5Z",
  ];
  const gradient = "paper-" + id;
  return (
    <svg viewBox="0 0 80 100" className="decorated-balloon" aria-hidden="true">
      <defs>
        <linearGradient id={gradient} x2=".2" y2="1">
          <stop stopColor={palette[d.color]} />
          <stop offset="1" stopColor="#ffe5a0" />
        </linearGradient>
      </defs>
      <path
        d={paths[d.shape]}
        fill={`url(#${gradient})`}
        stroke="#fff0ca"
        strokeWidth="1.4"
      />
      <path
        d="M33 67L35 77H45L47 67"
        fill="none"
        stroke="#dab17d"
        strokeWidth="1.5"
      />
      <ellipse cx="40" cy="78" rx="7" ry="3" fill="#d8a471" />
      <path d="M40 67Q31 77 40 79Q48 77 40 67" fill="#fff3b6" />
      <g
        stroke="#806060"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity=".8"
      >
        {d.sketch === 0 ? (
          <>
            <path d="M40 29C30 16 20 32 40 46C60 32 50 16 40 29Z" />
            <path d="M26 45L23 48M54 23L57 20" />
          </>
        ) : d.sketch === 1 ? (
          <>
            <path d="M40 22L44 31L54 33L46 40L48 50L40 45L31 50L33 40L26 33L36 31Z" />
            <path d="M22 23L24 27M55 46L59 48" />
          </>
        ) : d.sketch === 2 ? (
          <>
            <path d="M40 26C25 10 24 34 36 35C13 36 30 50 38 40C27 60 51 58 43 41C59 53 66 32 47 35C62 19 40 15 40 26Z" />
            <circle cx="41" cy="35" r="4" />
          </>
        ) : d.sketch === 3 ? (
          <>
            <path d="M47 22C22 20 24 50 48 47C35 41 36 29 47 22Z" />
            <path d="M53 24V30M50 27H56M25 45L22 49" />
          </>
        ) : (
          <>
            <path d="M25 40Q40 16 55 40M29 40Q40 23 51 40M33 40Q40 31 47 40" />
            <path d="M22 43Q23 36 29 41Q36 36 36 44ZM45 44Q46 36 52 40Q59 37 60 44Z" />
          </>
        )}
      </g>
      <path
        d="M27 19Q22 29 25 38"
        fill="none"
        stroke="#fff7db"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity=".45"
      />
    </svg>
  );
}

function Person({
  color = "#e78899",
  style = 0,
  walking = false,
  pose = "",
}: {
  color?: string;
  style?: number;
  walking?: boolean;
  pose?: string;
}) {
  return (
    <svg
      viewBox="0 0 80 125"
      className={"person " + (walking ? "walking " : "") + pose}
      aria-hidden="true"
    >
      <ellipse cx="40" cy="118" rx="25" ry="5" fill="#172c32" opacity=".3" />
      <g className="body">
        <path
          d="M27 104L25 117H35L39 102M43 102L47 117H57L54 103"
          fill="#593e39"
        />
        <path d="M25 65Q40 56 55 65L58 107Q40 114 22 107Z" fill={color} />
        <path
          d="M24 78H56M23 88H57M23 99H57"
          stroke="#fff2b3"
          strokeWidth="3"
          opacity=".6"
        />
        <path
          d="M25 43Q40 36 55 43L54 72H26Z"
          fill={style % 2 ? "#f6e6b8" : "#fff0de"}
        />
        {pose === "eating" ? (
          <>
            <path
              d="M27 45L19 64L30 69"
              fill="none"
              stroke="#eab08b"
              strokeWidth="8"
              strokeLinecap="round"
            />
            <ellipse
              cx="31"
              cy="67"
              rx="12"
              ry="5"
              fill="#74977d"
              stroke="#c4cda1"
              strokeWidth="1.5"
            />
            <ellipse cx="27" cy="65" rx="4" ry="3.5" fill="#fff0ce" />
            <g className="rice-ball-hand">
              <path
                d="M54 45L61 57L47 56"
                fill="none"
                stroke="#eab08b"
                strokeWidth="7"
                strokeLinecap="round"
              />
              <circle
                cx="45"
                cy="53"
                r="6"
                fill="#fff0d0"
                stroke="#e1c3a0"
                strokeWidth="1"
              />
              <path
                d="M42 51L44 50M47 53L49 52"
                stroke="#cfaa87"
                strokeWidth="1"
              />
              <circle cx="48" cy="57" r="3" fill="#efba95" />
            </g>
          </>
        ) : (
          <path
            d="M26 43L16 65L22 70L32 52M54 43L65 65L59 70L48 52"
            stroke="#eab08b"
            strokeWidth="8"
            strokeLinecap="round"
            className="arms"
          />
        )}
        <path
          d="M29 44L40 57L50 44M40 57V72"
          fill="none"
          stroke={color}
          strokeWidth="2"
        />
        <g className="character-head">
          <circle cx="40" cy="26" r="19" fill="#efba95" />
          <path
            d="M20 26Q17 0 40 4Q64 1 60 30L54 21Q42 25 29 16L25 30Z"
            fill="#302b39"
          />
          {style % 2 === 0 && (
            <>
              <circle cx="57" cy="14" r="10" fill="#302b39" />
              <circle cx="60" cy="13" r="4" fill="#ffe3a0" />
            </>
          )}
          <circle cx="33" cy="28" r="1.8" fill="#302b39" />
          <circle cx="47" cy="28" r="1.8" fill="#302b39" />
          <path
            className="character-mouth"
            d="M36 36Q40 39 44 36"
            stroke="#9c594a"
            strokeWidth="1.5"
            fill="none"
          />
          <path d="M25 32L31 34M49 34L55 32" stroke="#f5d786" strokeWidth="4" />
        </g>
      </g>
    </svg>
  );
}
const fireworkTypes = [
  {
    en: "Golden stars",
    mm: "ရွှေရောင်ကြယ်များ",
    color: "#ffd66b",
    symbol: "✦",
  },
  { en: "Rose bloom", mm: "ပန်းရောင်ပန်းပွင့်", color: "#ff9acb", symbol: "✿" },
  {
    en: "Blue chrysanthemum",
    mm: "အပြာရောင်ပန်းပွင့်",
    color: "#8de8ff",
    symbol: "✺",
  },
  {
    en: "Rainbow sparkle",
    mm: "သက်တံရောင်မီးပန်း",
    color: "#c0a0ff",
    symbol: "✧",
  },
  { en: "Golden willow", mm: "ရွှေရောင်မိုးမခ", color: "#ffc58a", symbol: "❋" },
];
export default function Home() {
  const [lang, L] = useState("en"),
    [name, N] = useState(""),
    [avatar, A] = useState(0),
    [started, S] = useState(false),
    [modal, M] = useState("welcome"),
    [pos, P] = useState<Position>(START),
    [lit, Li] = useState(false),
    [candles, C] = useState(false),
    [done, D] = useState<string[]>([]),
    [wish, Q] = useState(""),
    [wishes, Ws] = useState<Wish[]>([]),
    [letter, Let] = useState<Wish | null>(null),
    [busy, B] = useState(false),
    [error, E] = useState(""),
    [toast, T] = useState(""),
    [pose, Po] = useState(""),
    [sound, So] = useState(true),
    [help, H] = useState(false);
  const [ready, SetReady] = useState(false),
    [noWebGL, SetNoWebGL] = useState(false),
    [finaleShown, SetFinaleShown] = useState(false),
    [mine, SetMine] = useState<string[]>([]),
    [hidden, SetHidden] = useState<string[]>([]),
    [copied, SetCopied] = useState("");
  const [firework, SetFirework] = useState<number | null>(null),
    [fireworkChoice, ChooseFirework] = useState(0);
  const watching = firework !== null;
  const [letterClosing, SetLetterClosing] = useState(false);
  const [balloonColor, ChooseColor] = useState(0),
    [balloonShape, ChooseShape] = useState(0);
  const [eating, SetEating] = useState(false);
  const [release, Release] = useState<string | null>(null);
  const sceneRef = useRef<HTMLDivElement>(null),
    world = useRef<FestivalWorld | null>(null),
    wishesRef = useRef<Wish[]>([]);
  wishesRef.current = wishes;
  const ambience = useRef<Ambience | null>(null);
  // Night-garden ambience: plays only while sound is on; pauses when the tab is hidden.
  function toggleSound() {
    const next = !sound;
    So(next);
    if (next) {
      ambience.current ??= new Ambience();
      ambience.current.start();
    } else ambience.current?.stop();
  }
  // Sound is on by default. Browsers only allow audio after the visitor interacts, so the
  // garden ambience starts on their first tap, click or key press (usually "Enter the garden").
  const soundRef = useRef(sound);
  soundRef.current = sound;
  useEffect(() => {
    const first = () => {
      off();
      if (!soundRef.current) return;
      ambience.current ??= new Ambience();
      ambience.current.start();
    };
    const off = () => {
      window.removeEventListener("pointerdown", first, true);
      window.removeEventListener("keydown", first, true);
    };
    window.addEventListener("pointerdown", first, true);
    window.addEventListener("keydown", first, true);
    return off;
  }, []);
  useEffect(() => {
    const onVis = () => ambience.current?.setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      ambience.current?.dispose();
    };
  }, []);
  const keys = useRef(new Set<string>()),
    audio = useRef<AudioContext | null>(null);
  const mm = lang === "mm",
    t = (en: string, my: string) => (mm ? my : en);
  const shownWishes = wishes.filter((w) => !hidden.includes(w.id));
  const spotNames: Record<string, [string, string]> = {
    lantern: ["the lantern shop", "မီးပုံးဆိုင်"],
    fireworks: ["the lantern shop", "မီးပုံးဆိုင်"],
    balloon: ["the wish balloons", "ဆုတောင်းမီးပုံး"],
    candles: ["the pagoda candles", "ဘုရားဖယောင်းတိုင်"],
    lotus: ["the lotus pond", "ကြာကန်"],
    eat: ["the rice ball table", "မုန့်စားပွဲ"],
    gift: ["your friend", "သူငယ်ချင်း"],
  };
  // Per-visitor memory: which wishes are yours and which you reported.
  const store = {
    read(key: string): string[] {
      try {
        return JSON.parse(localStorage.getItem(key) || "[]");
      } catch {
        return [];
      }
    },
    write(key: string, v: string[]) {
      try {
        localStorage.setItem(key, JSON.stringify(v));
      } catch {}
    },
  };
  useEffect(() => {
    SetMine(store.read("little-lights-mine"));
    SetHidden(store.read("little-lights-hidden"));
  }, []);
  useEffect(() => {
    document.documentElement.lang = mm ? "my" : "en";
  }, [mm]);
  useEffect(() => {
    if (firework === null) return;
    const timer = setTimeout(() => SetFirework(null), 6000);
    return () => clearTimeout(timer);
  }, [firework]);
  function launchFirework() {
    keys.current.clear();
    M("");
    H(false);
    SetFirework(fireworkChoice);
    world.current?.launchFireworks(fireworkChoice);
    if (sound) ambience.current?.fireworks();
  }
  async function refresh() {
    try {
      const r = await fetch("/api/wishes");
      if (r.ok) {
        Ws(await r.json());
        E("");
      } else
        E(
          t(
            "Shared wishes are temporarily unavailable.",
            "ဆုတောင်းများကို ယခု မဖတ်နိုင်သေးပါ။",
          ),
        );
    } catch {
      E("Unable to connect. Please try again.");
    }
  }
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 20000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName))
        return;
      if (
        [
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
          "w",
          "a",
          "s",
          "d",
        ].includes(e.key)
      ) {
        e.preventDefault();
        keys.current.add(e.key);
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key);
    const clear = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, []);
  function closeLetter() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      Let(null);
      SetLetterClosing(false);
    } else SetLetterClosing(true);
  }
  useEffect(() => {
    if (!letterClosing) return;
    const timer = setTimeout(() => {
      Let(null);
      SetLetterClosing(false);
    }, 900);
    return () => clearTimeout(timer);
  }, [letterClosing]);
  useEffect(() => {
    if (!letter) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLetter();
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [letter]);
  // The 3D garden: created once, then kept in step with React state.
  useEffect(() => {
    if (!sceneRef.current) return;
    let w: FestivalWorld;
    try {
      w = new FestivalWorld(sceneRef.current, keys.current, {
        onMove: (p) => P(p),
        onWishClick: (id) => {
          const found = wishesRef.current.find((x) => x.id === id);
          if (found) Let(found);
        },
        onReady: () => SetReady(true),
      });
    } catch {
      SetNoWebGL(true);
      return;
    }
    world.current = w;
    (window as unknown as { __littleLights?: FestivalWorld }).__littleLights =
      w;
    return () => {
      w.dispose();
      world.current = null;
    };
  }, []);
  useEffect(() => {
    world.current?.setCanMove(started && !modal && !letter && !watching);
  }, [started, modal, letter, watching]);
  useEffect(() => world.current?.setAvatar(avatar), [avatar]);
  useEffect(() => world.current?.setLit(lit), [lit]);
  useEffect(() => world.current?.setCandles(candles), [candles]);
  useEffect(
    () =>
      world.current?.setPose(
        eating ? "eating" : pose === "giving" ? "giving" : "",
      ),
    [eating, pose],
  );
  useEffect(() => {
    world.current?.setWishes(shownWishes.slice(0, 12), release);
    if (release) Release(null);
  }, [wishes, release, hidden]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => T(""), 6000);
    return () => clearTimeout(id);
  }, [toast]);
  function chime() {
    if (!sound) return;
    try {
      const a = audio.current ?? new AudioContext();
      audio.current = a;
      [523, 659, 784].forEach((f, i) => {
        let o = a.createOscillator(),
          g = a.createGain();
        o.type = "sine";
        o.frequency.value = f;
        o.connect(g);
        g.connect(a.destination);
        g.gain.setValueAtTime(0, a.currentTime + i * 0.13);
        g.gain.linearRampToValueAtTime(0.06, a.currentTime + i * 0.13 + 0.02);
        g.gain.exponentialRampToValueAtTime(
          0.001,
          a.currentTime + i * 0.13 + 1,
        );
        o.start(a.currentTime + i * 0.13);
        o.stop(a.currentTime + i * 0.13 + 1);
      });
    } catch {}
  }
  function complete(id: string) {
    D((d) => (d.includes(id) ? d : [...d, id]));
    chime();
  }
  // Tapping a marker or card walks you there, then the activity starts.
  function goTo(id: string, then: () => void) {
    const w = world.current;
    if (!w) return then();
    T(
      t(
        "On your way to " + spotNames[id][0] + "…",
        spotNames[id][1] + " ဆီ သွားနေပါတယ်…",
      ),
    );
    w.walkToSpot(id, () => {
      T("");
      then();
    });
  }
  function act(id: string, arrived = false) {
    if (watching) return;
    if (!started) {
      M("welcome");
      return;
    }
    if (!arrived && !isNearSpot(pos, id)) {
      goTo(id, () => actRef.current(id, true));
      return;
    }
    if (id === "balloon" || id === "lotus") {
      Q("");
      E("");
      M(id);
      return;
    }
    if (id === "lantern") {
      M("shop");
      return;
    }
    if (id === "candles") {
      const done = () => {
        C(true);
        complete("candles");
        T(
          t(
            "May your days be filled with light.",
            "နေ့ရက်တိုင်း အလင်းရောင်တွေနဲ့ ပြည့်ပါစေ။",
          ),
        );
      };
      // Kneel at the pagoda and light the first candle, then the rest follow.
      if (candles || !world.current) done();
      else if (!world.current.lightingCandles) world.current.lightCandles(done);
      return;
    }
    if (id === "eat") {
      if (!arrived && !isNearTable(pos)) {
        T(
          t(
            "Come closer to the table to enjoy the rice balls.",
            "မုန့်အတူစားဖို့ စားပွဲနားကို လာပါ။",
          ),
        );
        return;
      }
      SetEating(true);
      T(
        t(
          "Enjoy the rice balls! Move away from the table when you’re ready to leave.",
          "မုန့်အတူစားကြမယ်။ ပြီးရင် စားပွဲနားကနေ လမ်းလျှောက်ထွက်နိုင်ပါတယ်။",
        ),
      );
    }
    if (id === "gift") {
      Po("giving");
      T(
        t(
          "A sweet gift, and an even sweeter smile.",
          "မုန့်လေးပေးပြီး ပျော်ရွှင်မှုတွေ ဝေမျှလိုက်ပြီ။",
        ),
      );
    }
    complete(id);
    if (id === "gift")
      setTimeout(() => Po((p) => (p === "giving" ? "" : p)), 5000);
  }
  function openFireworks(arrived = false) {
    if (!started) {
      M("welcome");
      return;
    }
    if (watching) return;
    if (!arrived && !nearShop) {
      goTo("fireworks", () => actRef.current("fireworks", true));
      return;
    }
    M("fireworks");
  }
  const actRef = useRef((id: string, arrived?: boolean) => {});
  actRef.current = (id, arrived) =>
    id === "fireworks" ? openFireworks(arrived) : act(id, arrived);
  function startFromCard(id: string) {
    sceneRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    act(id);
  }
  function remember(
    key: "little-lights-mine" | "little-lights-hidden",
    id: string,
  ) {
    const next = [...store.read(key).filter((x) => x !== id), id].slice(-50);
    store.write(key, next);
    (key === "little-lights-mine" ? SetMine : SetHidden)(next);
  }
  async function report(w: Wish) {
    remember("little-lights-hidden", w.id);
    closeLetter();
    T(
      t(
        "Thank you for telling us. This wish is now hidden for you.",
        "အသိပေးတဲ့အတွက် ကျေးဇူးပါ။ ဒီဆုတောင်းကို သင့်အတွက် ဖျောက်ထားပါပြီ။",
      ),
    );
    try {
      await fetch("/api/wishes/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: w.id }),
      });
    } catch {}
  }
  function showWish(id: string) {
    M("");
    sceneRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    world.current?.focusWish(id);
  }
  async function copyLink() {
    const url = location.href.split("#")[0];
    try {
      await navigator.clipboard.writeText(url);
      SetCopied(t("Link copied", "လင့်ခ် ကူးပြီးပါပြီ"));
    } catch {
      SetCopied(url);
    }
  }
  const moderationMessage = (code?: string) =>
    code === "links"
      ? t(
          "Links can’t be shared in wishes.",
          "ဆုတောင်းထဲမှာ လင့်ခ် ထည့်လို့မရပါ။",
        )
      : code === "kind"
        ? t(
            "Please keep wishes kind. Try different words.",
            "ဆုတောင်းကို ကြင်နာတဲ့ စကားလုံးတွေနဲ့ ရေးပေးပါ။",
          )
        : code === "slow"
          ? t(
              "Please wait a few seconds before sending another wish.",
              "နောက်ထပ်ဆုတောင်း မပို့ခင် ခဏစောင့်ပေးပါ။",
            )
          : t(
              "Could not save your wish. Please try again.",
              "ဆုတောင်းကို မသိမ်းနိုင်ပါ။ ထပ်ကြိုးစားပါ။",
            );
  // Finale: once all six moments are done, lanterns rise and the evening is summed up.
  useEffect(() => {
    if (done.length < 6 || finaleShown) return;
    SetFinaleShown(true);
    const a = setTimeout(() => {
      world.current?.celebrate();
      chime();
    }, 1200);
    const b = setTimeout(() => M("finale"), world.current ? 6500 : 1500);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [done.length]);
  async function publish() {
    const local = moderate(wish + " " + name);
    if (local) {
      E(moderationMessage(local));
      return;
    }
    B(true);
    E("");
    try {
      const r = await fetch("/api/wishes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          message: wish,
          kind: modal,
          ...(modal === "balloon"
            ? { color: balloonColor, shape: balloonShape }
            : {}),
        }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        E(moderationMessage(body.code));
        return;
      }
      const row = (await r.json()) as Wish;
      remember("little-lights-mine", row.id);
      Release(row.id);
      Ws((w) => [row, ...w].slice(0, 60));
      complete(modal);
      M("");
      T(
        t(
          "Your wish is on its way. Tap it any time to read the letter.",
          "ဆုတောင်းလေး လွှတ်လိုက်ပြီ။ စာဖတ်ဖို့ ဘယ်အချိန်မဆို နှိပ်ပါ။",
        ),
      );
    } catch {
      E(
        t(
          "Could not save your wish. Please try again.",
          "ဆုတောင်းကို မသိမ်းနိုင်ပါ။ ထပ်ကြိုးစားပါ။",
        ),
      );
    } finally {
      B(false);
    }
  }
  useEffect(() => {
    if (eating && !isNearTable(pos)) SetEating(false);
  }, [eating, pos]);
  const nearby = activities.filter((a) => isNearSpot(pos, a.id));
  const nearShop = isNearSpot(pos, "fireworks") || isNearSpot(pos, "lantern");
  return (
    <main>
      <header>
        <a className="brand" href="/">
          ✧{" "}
          <span>
            little lights<small>THADINGYUT FESTIVAL</small>
          </span>
        </a>
        <nav>
          <button onClick={() => M("wishes")}>
            <Mail size={17} />
            <span>{t("Wishes in the wind", "ဆုတောင်းစာများ")}</span>
            <i>{shownWishes.length}</i>
          </button>
          <button className="language" onClick={() => L(mm ? "en" : "mm")}>
            {mm ? "English" : "မြန်မာ"}
          </button>
          <button
            aria-label={sound ? "Mute sounds" : "Enable sounds"}
            onClick={toggleSound}
            title={
              sound
                ? t("Sound on", "အသံဖွင့်ထားသည်")
                : t("Turn on night garden sounds", "ညဥယျာဉ်အသံ ဖွင့်မယ်")
            }
          >
            {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
        </nav>
      </header>
      <section className="game" aria-label="Interactive Thadingyut festival">
        <div
          ref={sceneRef}
          className={"scene world" + (watching ? " watching-fireworks" : "")}
        >
          <div
            className="scene-note progress-chip"
            aria-label={t(
              done.length + " of 6 little moments done",
              "ပျော်စရာအချိန်လေး ၆ ခုထဲက " + done.length + " ခု ပြီးပါပြီ",
            )}
          >
            <span className="progress-dots" aria-hidden="true">
              {activities.map((a) => (
                <i className={done.includes(a.id) ? "filled" : ""} key={a.id} />
              ))}
            </span>
            {done.length} / 6 · {t("little moments", "ပျော်စရာအချိန်လေးများ")}
          </div>
          <div className="moon-note">
            ✧ {t("A thousand little wishes", "ဆုတောင်းလေးများစွာ")}
          </div>
          {activities.map((a, i) => (
            <div
              key={a.id}
              className="anchor"
              data-anchor={"spot-" + a.id}
              data-edge={started && !done.includes(a.id) ? "1" : "0"}
            >
              <button
                className={
                  "spot " +
                  (nearby.includes(a) ? "near " : "") +
                  (done.includes(a.id) ? "complete" : "")
                }
                onClick={() => act(a.id)}
                title={t(a.en, a.mm)}
                aria-label={t(a.en, a.mm)}
              >
                <a.icon size={20} />
                <span>
                  {t(
                    [
                      "Lanterns",
                      "Wish balloons",
                      "Candles",
                      "Lotus pond",
                      "Rice Balls",
                      "A gift for friends",
                    ][i],
                    [
                      "မီးပုံး",
                      "ဆုတောင်းမီးပုံး",
                      "ဖယောင်းတိုင်",
                      "ကြာမီးခွက်",
                      "မုန့်အတူစားမယ်",
                      "မုန့်ပေးမယ်",
                    ][i],
                  )}
                </span>
                {done.includes(a.id) && <Check size={12} />}
                <i className="edge-arrow" aria-hidden="true" />
              </button>
            </div>
          ))}
          <div className="anchor" data-anchor="spot-fireworks">
            <button
              className={"spot fireworks-spot " + (nearShop ? "near" : "")}
              onClick={() => openFireworks()}
              aria-label={t(
                "Choose fireworks at the lantern shop",
                "မီးပန်းရွေးမယ်",
              )}
            >
              <Sparkles size={20} />
              <span>{t("Fireworks", "မီးပန်း")}</span>
            </button>
          </div>
          <div className="anchor person-anchor" data-anchor="friend-one">
            <div className="label-stack">
              {watching && (
                <span className="sky-reaction">
                  {t("Wow, beautiful!", "အရမ်းလှတယ်။")}
                </span>
              )}
              {pose === "giving" && (
                <span className="bubble">
                  ♡ {t("Thank you!", "ကျေးဇူးပါ။")}
                </span>
              )}
            </div>
          </div>
          <div className="anchor person-anchor" data-anchor="friend-two">
            <div className="label-stack">
              {watching && (
                <span className="sky-reaction">
                  {t("Happy Thadingyut!", "ပျော်ရွှင်ဖွယ် သီတင်းကျွတ်ပါ။")}
                </span>
              )}
            </div>
          </div>
          <div className="anchor person-anchor" data-anchor="friend-three">
            <div className="label-stack">
              {watching && (
                <span className="sky-reaction">
                  {t("Pretty!", "လှလိုက်တာ။")}
                </span>
              )}
            </div>
          </div>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="anchor person-anchor"
              data-anchor={"child-" + i}
            >
              <div className="label-stack">
                {watching && (
                  <span className="sky-reaction child-reaction">
                    {t(
                      ["Wow!", "Beautiful!", "Happy Thadingyut!"][i],
                      ["ဝိုး။", "လှလိုက်တာ။", "ပျော်ရွှင်ဖွယ် သီတင်းကျွတ်ပါ။"][
                        i
                      ],
                    )}
                  </span>
                )}
              </div>
            </div>
          ))}
          {started && (
            <div className="anchor person-anchor" data-anchor="player">
              <div className="label-stack">
                {watching && (
                  <span className="sky-reaction">
                    {t("So magical!", "အံ့ဩစရာလေး။")}
                  </span>
                )}
                <span className="name-tag">
                  {name || t("You", "သင်")}{" "}
                  {name && <small>{t("YOU", "သင်")}</small>}
                </span>
              </div>
            </div>
          )}
          {watching && (
            <>
              <span className="firework-status" role="status">
                {t("A little magic in the sky…", "ကောင်းကင်မှာ မီးပန်းလေးတွေ…")}
                <small>
                  {t(
                    "Tap the garden to return to your view",
                    "ကိုယ့်မြင်ကွင်းကို ပြန်သွားဖို့ ဥယျာဉ်ကို နှိပ်ပါ",
                  )}
                </small>
              </span>
            </>
          )}
          {!ready && !noWebGL && (
            <div className="scene-loading" role="status">
              <span className="loading-lantern" aria-hidden="true" />
              {t("Lighting the lanterns…", "မီးပုံးလေးတွေ ထွန်းနေပါတယ်…")}
            </div>
          )}
          {noWebGL && (
            <div className="scene-fallback" role="status">
              <b>
                {t(
                  "The 3D garden can’t open on this device.",
                  "ဒီစက်မှာ 3D ဥယျာဉ်ကို ဖွင့်လို့မရပါ။",
                )}
              </b>
              <span>
                {t(
                  "You can still enjoy every moment. Choose one from the cards below.",
                  "အောက်က ကတ်တွေကနေ ပျော်စရာအချိန်လေးတွေကို ဆက်ပြီး ခံစားနိုင်ပါတယ်။",
                )}
              </span>
            </div>
          )}
          {toast && (
            <div className="toast" role="status">
              ✧ {toast}
            </div>
          )}
          {started && !noWebGL && (
            <div
              className="dpad"
              role="group"
              aria-label={t("Movement controls", "လမ်းလျှောက်ခလုတ်များ")}
            >
              {[
                ["ArrowUp", ArrowUp],
                ["ArrowLeft", ArrowLeft],
                ["ArrowDown", ArrowDown],
                ["ArrowRight", ArrowRight],
              ].map(([key, Icon]: any) => (
                <button
                  key={key}
                  aria-label={
                    {
                      ArrowUp: t("Walk forward", "ရှေ့ကိုလျှောက်"),
                      ArrowDown: t("Walk back", "နောက်ကိုလျှောက်"),
                      ArrowLeft: t("Turn left", "ဘယ်လှည့်"),
                      ArrowRight: t("Turn right", "ညာလှည့်"),
                    }[key as string]
                  }
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    keys.current.add(key);
                  }}
                  onPointerUp={() => keys.current.delete(key)}
                  onPointerCancel={() => keys.current.delete(key)}
                >
                  <Icon size={23} />
                </button>
              ))}
            </div>
          )}
          <div className="scene-bottom">
            <span className="control-hint" hidden={noWebGL}>
              {t(
                "Tap a marker or the ground to walk · drag to look around",
                "နေရာ (သို့) မြေပြင်ကို နှိပ်ပြီး လမ်းလျှောက်ပါ · ဆွဲပြီး ပတ်ကြည့်ပါ",
              )}
            </span>
            <button onClick={() => H(!help)}>
              {t("How to play", "ကစားနည်း")} <BookOpen size={14} />
            </button>
          </div>
        </div>
      </section>
      <section className="intro about">
        <div className="eyebrow">
          <span />{" "}
          {t("A LITTLE LIGHT. A LITTLE LOVE.", "အလင်းလေးတွေ၊ မေတ္တာလေးတွေ။")}
        </div>
        <h1>{t("A night to glow, together.", "အတူတူ ထွန်းလင်းကြမယ့်ည။")}</h1>
        <p>
          {t(
            "Thadingyut is Myanmar’s Festival of Lights, held at the end of Buddhist Lent. Homes and pagodas glow with lanterns and candles, families share food, and younger people pay respect to their elders.",
            "သီတင်းကျွတ်ပွဲတော်ဟာ ဝါကျွတ်ချိန်မှာ ကျင်းပတဲ့ မြန်မာ့မီးထွန်းပွဲတော် ဖြစ်ပါတယ်။ အိမ်တွေ၊ ဘုရားတွေကို မီးပုံး၊ ဖယောင်းတိုင်တွေနဲ့ ထွန်းညှိကြပြီး မိသားစုတွေ အတူ စားသောက်ကာ လူကြီးသူမတွေကို ကန်တော့ကြပါတယ်။",
          )}
        </p>
      </section>
      <section className="activities">
        <div className="section-heading">
          <h2>
            {t("Make the evening yours", "သင့်စိတ်ကြိုက် ဆင်နွှဲလိုက်ပါ")}
          </h2>
          <span>
            {t(
              "Choose a moment and you’ll walk there.",
              "ပျော်စရာအချိန်လေး ရွေးလိုက်ရင် အဲဒီကို လျှောက်သွားပါမယ်။",
            )}
          </span>
        </div>
        <div className="activity-grid">
          {activities.map((a, i) => (
            <button
              key={a.id}
              className={"activity " + (done.includes(a.id) ? "finished" : "")}
              onClick={() => startFromCard(a.id)}
            >
              <div className={"activity-icon color" + i}>
                <a.icon size={24} />
              </div>
              <div>
                <span className="activity-no">
                  0{i + 1} {done.includes(a.id) && " · ✓"}
                </span>
                <b>{t(a.en, a.mm)}</b>
                <small>
                  {t(
                    [
                      "Let a little warmth in",
                      "Let your hopes take flight",
                      "Brighten the night",
                      "A wish upon the water",
                      "Good food, better company",
                      "Kindness tastes sweeter",
                    ][i],
                    [
                      "အလင်းလေး ထွန်းလိုက်ပါ",
                      "မျှော်လင့်ချက်လေး လွှတ်လိုက်ပါ",
                      "ပွဲတော်ညကို လင်းစေမယ်",
                      "ရေပြင်ပေါ်က ဆုတောင်းလေး",
                      "သူငယ်ချင်းတွေနဲ့ အတူ",
                      "မေတ္တာနဲ့ ဝေမျှမယ်",
                    ][i],
                  )}
                </small>
              </div>
              <span className="activity-arrow">↗</span>
            </button>
          ))}
        </div>
      </section>
      <footer>
        <span>
          ✧{" "}
          {t(
            "Made for moments that bring us closer.",
            "ရင်းနှီးမှုတွေ ပိုတိုးစေမယ့် အချိန်လေးများ။",
          )}
        </span>
        <span>{t("Happy Thadingyut", "ပျော်ရွှင်ဖွယ် သီတင်းကျွတ်ပါ။")} ♡</span>
      </footer>
      {help && (
        <div className="help">
          <button
            className="close"
            onClick={() => H(false)}
            aria-label="Close help"
          >
            <X size={18} />
          </button>
          <h3>{t("A little guide", "ကစားနည်း")}</h3>
          <p>
            {t(
              "Tap any marker or activity card and you’ll walk there. Tap the ground to stroll, and drag to look around. Arrows at the screen edge point to moments you haven’t tried yet. Keyboard: ↑ ↓ or W S to walk, ← → or A D to turn. Tap a floating lantern or lotus to read its wish.",
              "နေရာအမှတ် (သို့) ကတ်ကို နှိပ်ရင် အဲဒီကို လျှောက်သွားပါမယ်။ မြေပြင်ကို နှိပ်ပြီး လမ်းလျှောက်ပါ၊ ဆွဲပြီး ပတ်ကြည့်ပါ။ မျက်နှာပြင်အစွန်က မြားလေးတွေက မလုပ်ရသေးတဲ့နေရာတွေကို ညွှန်ပြပါတယ်။ ကီးဘုတ်: ↑ ↓ (သို့) W S နဲ့ လျှောက်၊ ← → (သို့) A D နဲ့ လှည့်ပါ။ ဆုတောင်းစာဖတ်ဖို့ မီးပုံး (သို့) ကြာမီးခွက်ကို နှိပ်ပါ။",
            )}
          </p>
        </div>
      )}
      {modal && (
        <div className="overlay">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            className={"modal " + (modal === "wishes" ? "wish-list" : "")}
          >
            {modal !== "welcome" && (
              <button
                className="close"
                aria-label="Close dialog"
                onClick={() => M("")}
              >
                <X size={20} />
              </button>
            )}
            {modal === "welcome" ? (
              <>
                <span className="modal-spark">✧</span>
                <div className="eyebrow">
                  {t(
                    "WELCOME TO LITTLE LIGHTS",
                    "သီတင်းကျွတ်ညလေးမှ ကြိုဆိုပါတယ်",
                  )}
                </div>
                <h2 id="dialog-title">
                  {t(
                    "Who’s joining the celebration?",
                    "ဘယ်သူ ပွဲတော်လာလည်မလဲ။",
                  )}
                </h2>
                <p>
                  {t(
                    "Thadingyut is Myanmar’s Festival of Lights. Pick your little festival self and step into a glowing evening.",
                    "သီတင်းကျွတ်ဟာ မြန်မာ့မီးထွန်းပွဲတော်ပါ။ သင့်ဇာတ်ကောင်လေး ရွေးပြီး ထွန်းလင်းနေတဲ့ ညလေးထဲ ဝင်လိုက်ပါ။",
                  )}
                </p>
                <div className="avatars">
                  {colors.map((c, i) => (
                    <button
                      key={c}
                      className={avatar === i ? "selected" : ""}
                      aria-label={`Choose avatar ${i + 1}`}
                      aria-pressed={avatar === i}
                      onClick={() => A(i)}
                    >
                      <Person color={c} style={i} />
                      {avatar === i && <span>✓</span>}
                    </button>
                  ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    N(name.trim());
                    S(true);
                    M("");
                    H(true);
                  }}
                >
                  <label htmlFor="name">
                    {t("What shall we call you?", "သင့်နာမည်လေး ရေးပေးပါ")}{" "}
                    <span className="optional">
                      {t("(optional)", "(မထည့်လည်းရ)")}
                    </span>
                  </label>
                  <input
                    id="name"
                    maxLength={24}
                    value={name}
                    onChange={(e) => N(e.target.value)}
                    placeholder={t("Your name", "သင့်နာမည်")}
                  />
                  <button className="primary" type="submit">
                    {t("Step into the festival", "ပွဲတော်ထဲ ဝင်မယ်")}{" "}
                    <span>→</span>
                  </button>
                </form>
                <small className="modal-foot">
                  {t(
                    "You can add your name later, when you send a wish.",
                    "ဆုတောင်းပို့တဲ့အချိန်မှ နာမည်ထည့်လည်း ရပါတယ်။",
                  )}
                </small>
              </>
            ) : modal === "shop" ? (
              <>
                <span className="modal-spark">✧</span>
                <h2 id="dialog-title">
                  {t("The lantern shop", "မီးပုံးဆိုင်")}
                </h2>
                <p>
                  {t(
                    "Bring a little glow to the garden, or light up the sky.",
                    "ဥယျာဉ်လေးမှာ မီးပုံးထွန်းမလား၊ ကောင်းကင်မှာ မီးပန်းလွှတ်မလား။",
                  )}
                </p>
                <button
                  className="primary"
                  onClick={() => {
                    Li(true);
                    complete("lantern");
                    M("");
                    T(
                      t(
                        "The lanterns are glowing.",
                        "မီးပုံးလေးတွေ ထွန်းလင်းလာပြီ။",
                      ),
                    );
                  }}
                >
                  {t("Light the lanterns", "မီးပုံးထွန်းမယ်")} ✧
                </button>
              </>
            ) : modal === "fireworks" ? (
              <>
                <div className="eyebrow">
                  {t("FROM THE LANTERN SHOP", "မီးပုံးဆိုင်မှ")}
                </div>
                <h2 id="dialog-title">
                  {t("A little sky celebration", "ကောင်းကင်က ပွဲတော်လေး")}
                </h2>
                <p>
                  {t(
                    "Choose a firework. Everyone will stop to watch a gentle six-second show.",
                    "နှစ်သက်ရာမီးပန်း ရွေးပါ။ မီးပန်းလွှတ်တဲ့ ခြောက်စက္ကန့်အတွင်း အားလုံး ကြည့်ရှုကြမယ်။",
                  )}
                </p>
                <div className="firework-options">
                  {fireworkTypes.map((f, i) => (
                    <button
                      key={f.en}
                      aria-pressed={fireworkChoice === i}
                      className={fireworkChoice === i ? "selected" : ""}
                      onClick={() => ChooseFirework(i)}
                    >
                      <span style={{ color: f.color }}>{f.symbol}</span>
                      <b>{t(f.en, f.mm)}</b>
                      {fireworkChoice === i && <Check size={15} />}
                    </button>
                  ))}
                </div>
                <button className="primary" onClick={launchFirework}>
                  {t("Launch fireworks", "မီးပန်းလွှတ်မယ်")} ↗
                </button>
                <button className="change-balloon" onClick={() => M("shop")}>
                  {t("← Back to the shop", "← ဆိုင်သို့ ပြန်မယ်")}
                </button>
              </>
            ) : modal === "wishes" ? (
              <>
                <span className="modal-spark">✉</span>
                <h2 id="dialog-title">
                  {t("Wishes in the wind", "လေထဲက ဆုတောင်းစာလေးများ")}
                </h2>
                <p>
                  {t(
                    "Little hopes, shared by festival visitors.",
                    "ပွဲတော်လာလည်သူတွေရဲ့ မျှော်လင့်ချက်လေးများ။",
                  )}
                </p>
                {error && (
                  <p role="alert">
                    {error}
                    <button onClick={refresh}>Retry</button>
                  </p>
                )}
                {!shownWishes.length && !error && (
                  <p>
                    {t(
                      "The sky is waiting for its first wish.",
                      "ပထမဆုံးဆုတောင်းလေးကို စောင့်နေပါတယ်။",
                    )}
                  </p>
                )}
                <ul className="wish-rows">
                  {[...shownWishes]
                    .sort(
                      (a, b) =>
                        Number(mine.includes(b.id)) -
                        Number(mine.includes(a.id)),
                    )
                    .map((w) => {
                      const inWorld =
                        !noWebGL &&
                        shownWishes.slice(0, 12).some((x) => x.id === w.id);
                      return (
                        <li
                          key={w.id}
                          className={mine.includes(w.id) ? "mine" : ""}
                        >
                          <button className="wish-open" onClick={() => Let(w)}>
                            <span className="wish-kind" aria-hidden="true">
                              {w.kind === "lotus" ? "🪷" : "✧"}
                            </span>
                            <span className="wish-text">
                              <b>
                                {w.name}
                                {mine.includes(w.id) && (
                                  <em>{t("Yours", "သင့်ဆုတောင်း")}</em>
                                )}
                              </b>
                              <small>
                                {w.message.length > 90
                                  ? w.message.slice(0, 88) + "…"
                                  : w.message}
                              </small>
                            </span>
                          </button>
                          {inWorld && (
                            <button
                              className="wish-find"
                              onClick={() => showWish(w.id)}
                              aria-label={t(
                                "Show " + w.name + "’s wish in the garden",
                                w.name + " ရဲ့ဆုတောင်းကို ဥယျာဉ်ထဲမှာ ပြပါ",
                              )}
                            >
                              <Eye size={16} />
                              <span>{t("Show me", "ပြပါ")}</span>
                            </button>
                          )}
                        </li>
                      );
                    })}
                </ul>
              </>
            ) : modal === "finale" ? (
              <>
                <span className="modal-spark">✧</span>
                <div className="eyebrow">
                  {t("ALL SIX LITTLE MOMENTS", "ပျော်စရာအချိန်လေး ၆ ခုလုံး")}
                </div>
                <h2 id="dialog-title">
                  {t("Your evening in the garden", "ဥယျာဉ်ထဲက သင့်ညလေး")}
                </h2>
                <p>
                  {t(
                    "You lit the lanterns and candles, shared rice balls and a gift, and sent your wishes into the night. Happy Thadingyut.",
                    "မီးပုံး၊ ဖယောင်းတိုင်တွေ ထွန်းခဲ့တယ်၊ မုန့်တွေ မျှစားခဲ့တယ်၊ ဆုတောင်းလေးတွေ လွှတ်ခဲ့တယ်။ ပျော်ရွှင်ဖွယ် သီတင်းကျွတ်ပါ။",
                  )}
                </p>
                {shownWishes.filter((w) => mine.includes(w.id)).length > 0 && (
                  <ul className="wish-rows finale-wishes">
                    {shownWishes
                      .filter((w) => mine.includes(w.id))
                      .slice(0, 3)
                      .map((w) => (
                        <li key={w.id} className="mine">
                          <button className="wish-open" onClick={() => Let(w)}>
                            <span className="wish-kind" aria-hidden="true">
                              {w.kind === "lotus" ? "🪷" : "✧"}
                            </span>
                            <span className="wish-text">
                              <b>{t("Your wish", "သင့်ဆုတောင်း")}</b>
                              <small>{w.message}</small>
                            </span>
                          </button>
                        </li>
                      ))}
                  </ul>
                )}
                <button className="primary" onClick={copyLink}>
                  <Link2 size={16} />{" "}
                  {t("Copy a link to share", "မျှဝေဖို့ လင့်ခ် ကူးမယ်")}
                </button>
                {copied && (
                  <p className="copied" role="status">
                    {copied.startsWith("http") ? (
                      <>
                        {t("Copy this link:", "ဒီလင့်ခ်ကို ကူးပါ:")}{" "}
                        <input
                          readOnly
                          value={copied}
                          onFocus={(e) => e.currentTarget.select()}
                        />
                      </>
                    ) : (
                      copied
                    )}
                  </p>
                )}
                <button className="change-balloon" onClick={() => M("")}>
                  {t("Keep wandering", "ဆက်လျှောက်လည်မယ်")} →
                </button>
              </>
            ) : (
              <>
                <span className="modal-spark">
                  {modal === "lotus" ? "🪷" : "✧"}
                </span>
                <h2 id="dialog-title">
                  {t(
                    "What does your heart wish for?",
                    "သင့်ရင်ထဲက ဆုတောင်းလေးက ဘာလဲ။",
                  )}
                </h2>
                <p>
                  {t(
                    modal === "lotus"
                      ? "Let the water carry your wish."
                      : "Send a little hope into the night sky.",
                    "သင့်ဆုတောင်းလေးကို ဝေမျှလိုက်ပါ။",
                  )}
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    publish();
                  }}
                >
                  <label htmlFor="wish">{t("Your wish", "သင့်ဆုတောင်း")}</label>
                  <textarea
                    id="wish"
                    autoFocus
                    required
                    maxLength={280}
                    value={wish}
                    onChange={(e) => Q(e.target.value)}
                    placeholder={t("May this year bring…", "ဒီနှစ်မှာ…")}
                    rows={3}
                  />
                  <small className="count">{wish.length}/280</small>
                  {modal === "balloon" && (
                    <div className="balloon-designer">
                      <div className="balloon-preview small" aria-hidden="true">
                        <WishBalloon
                          id="chosen-preview"
                          color={balloonColor}
                          shape={balloonShape}
                        />
                      </div>
                      <div className="balloon-pickers">
                        <fieldset className="balloon-choices">
                          <legend>{t("Colour", "အရောင်")}</legend>
                          <div className="colour-options">
                            {[
                              "#f095a0",
                              "#edb764",
                              "#a6c790",
                              "#8dcbd2",
                              "#b4a0dc",
                              "#ed9879",
                              "#e1c775",
                            ].map((color, i) => (
                              <button
                                key={color}
                                type="button"
                                aria-label={t(
                                  [
                                    "Rose",
                                    "Orange",
                                    "Green",
                                    "Blue",
                                    "Purple",
                                    "Coral",
                                    "Gold",
                                  ][i],
                                  [
                                    "ပန်းရောင်",
                                    "လိမ္မော်ရောင်",
                                    "အစိမ်းရောင်",
                                    "အပြာရောင်",
                                    "ခရမ်းရောင်",
                                    "သန္တာရောင်",
                                    "ရွှေရောင်",
                                  ][i],
                                )}
                                aria-pressed={balloonColor === i}
                                className={balloonColor === i ? "selected" : ""}
                                style={{ background: color }}
                                onClick={() => ChooseColor(i)}
                              >
                                {balloonColor === i && <Check size={18} />}
                              </button>
                            ))}
                          </div>
                        </fieldset>
                        <fieldset className="balloon-choices">
                          <legend>{t("Shape", "ပုံစံ")}</legend>
                          <div className="shape-options">
                            {[
                              "Paper lantern",
                              "Round",
                              "Heart",
                              "Star",
                              "Diamond",
                            ].map((label, i) => (
                              <button
                                key={label}
                                type="button"
                                aria-pressed={balloonShape === i}
                                className={balloonShape === i ? "selected" : ""}
                                onClick={() => ChooseShape(i)}
                              >
                                <WishBalloon
                                  id={"shape-preview-" + i}
                                  color={balloonColor}
                                  shape={i}
                                />
                                <span>
                                  {t(
                                    label,
                                    [
                                      "မီးပုံး",
                                      "အဝိုင်း",
                                      "နှလုံး",
                                      "ကြယ်",
                                      "စိန်",
                                    ][i],
                                  )}
                                </span>
                              </button>
                            ))}
                          </div>
                        </fieldset>
                      </div>
                    </div>
                  )}
                  <label htmlFor="signed">{t("Signed as", "လက်မှတ်")}</label>
                  <input
                    id="signed"
                    maxLength={24}
                    value={name}
                    onChange={(e) => N(e.target.value)}
                    placeholder={t(
                      "Your name, or leave blank for “Friend”",
                      "သင့်နာမည် (မထည့်ရင် “Friend”)",
                    )}
                  />
                  <p className="public-note">
                    {t(
                      "Your wish and name will be shown to everyone who visits the garden.",
                      "သင့်ဆုတောင်းနဲ့ နာမည်ကို ဥယျာဉ်ကို လာလည်သူတိုင်း မြင်ရပါမယ်။",
                    )}
                  </p>
                  {error && (
                    <p className="error" role="alert">
                      {error}
                    </p>
                  )}
                  <button className="primary" disabled={busy || !wish.trim()}>
                    {busy
                      ? t("Sending…", "လွှတ်နေပါတယ်…")
                      : t("Release my wish", "ဆုတောင်းလေး လွှတ်မယ်")}{" "}
                    ↗
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      )}
      {letter && (
        <div
          className={
            "overlay letter-overlay" + (letterClosing ? " scroll-closing" : "")
          }
          onClick={closeLetter}
        >
          <article
            className="letter wish-scroll"
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget && letterClosing) {
                Let(null);
                SetLetterClosing(false);
              }
            }}
            role="dialog"
            aria-modal="true"
            aria-label="Wish letter"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Close wish"
              onClick={closeLetter}
            >
              <X />
            </button>
            <div className="scroll-art" aria-hidden="true">
              <svg viewBox="0 0 600 360" preserveAspectRatio="none">
                <g fill="#bd833d" opacity=".28">
                  <path d="M25 329H180V338H25ZM48 315H157V327H48ZM63 296H144V314H63ZM71 276H136V294H71ZM78 253H129V274H78ZM86 230H121V251H86ZM94 203H113V229H94ZM99 174H108V202H99ZM103 145L106 176H100Z" />
                  <path d="M34 314L102 292L170 314ZM51 294L103 272L154 294ZM67 274L104 252L139 274ZM79 252L104 229L128 252Z" />
                </g>
                <g stroke="#9d652d" strokeWidth="1.5">
                  <path d="M448 0V42M510 0V67M562 0V31" />
                  <g fill="#cf7749">
                    <rect x="431" y="42" width="34" height="45" rx="12" />
                    <rect x="494" y="67" width="32" height="41" rx="11" />
                    <rect x="548" y="31" width="28" height="37" rx="10" />
                  </g>
                  <path d="M437 48V81M449 45V84M459 48V81M500 73V102M511 70V105M520 73V102M554 37V62M563 34V65M570 37V62M448 87V99M510 108V120M562 68V80" />
                </g>
                <g fill="#bc8444" opacity=".65">
                  <rect x="478" y="304" width="15" height="30" rx="3" />
                  <rect x="511" y="288" width="17" height="46" rx="3" />
                  <rect x="548" y="310" width="14" height="24" rx="3" />
                </g>
                <g fill="#e6a246">
                  <path d="M485 282Q471 300 485 302Q498 300 485 282ZM519 265Q505 284 519 286Q532 284 519 265ZM555 290Q544 306 555 308Q566 306 555 290Z" />
                </g>
              </svg>
            </div>
            <div className="eyebrow">
              {t("A WISH FOR THE WORLD", "ကမ္ဘာကြီးအတွက် ဆုတောင်းလေး")}
            </div>
            <p>{letter.message}</p>
            <span className="signature">♡ {letter.name}</span>
            {!mine.includes(letter.id) && (
              <button className="report-wish" onClick={() => report(letter)}>
                <Flag size={13} />{" "}
                {t("Report this wish", "ဒီဆုတောင်းကို တိုင်ကြားမယ်")}
              </button>
            )}
            <small>
              {t(
                "Sent with love this Thadingyut",
                "သီတင်းကျွတ်မှာ မေတ္တာနဲ့ ပေးပို့ပါတယ်။",
              )}
            </small>
          </article>
        </div>
      )}
    </main>
  );
}
