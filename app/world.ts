// The 3D festival garden. React owns the game state and dialogs; this class owns the
// Three.js scene, the third-person camera, player movement and everything that animates.
import * as THREE from "three";
import {
  FRIENDS,
  PAGODA,
  POND,
  POSTS,
  SHOP,
  SPOTS,
  GARDEN_TREES,
  ARCH,
  SPOT_FACING,
  START,
  findPath,
  START_HEADING,
  TABLE,
  moveCharacter,
  type Position,
  isWalkable,
} from "./movement";

export type WorldWish = {
  id: string;
  kind: string;
  color?: number | null;
  shape?: number | null;
};
export type PlayerPose = "" | "eating" | "giving";
/** Where the player kneels to light the first candle, in front of the pagoda. */
const KNEEL = { x: 0, z: PAGODA.z + 7.55 };
type Events = {
  onMove: (p: Position, heading: number) => void;
  onWishClick: (id: string) => void;
  onReady?: () => void;
  /** A child stopped to greet the player (index), or walked on (null). */
  onChildNear?: (index: number | null) => void;
};

export const AVATAR_COLORS = ["#e78899", "#5b9f93", "#e8ac55", "#9c8ac7"];
export const FIREWORK_COLORS = [
  "#ffd66b",
  "#ff9acb",
  "#8de8ff",
  "#c0a0ff",
  "#ffc58a",
];
const RAINBOW = ["#ff809d", "#ffe78c", "#94f0c0", "#8adfff", "#c8a2ff"];
const BALLOON_PALETTE = [
  "#f095a0",
  "#edb764",
  "#a6c790",
  "#8dcbd2",
  "#b4a0dc",
  "#ed9879",
  "#e1c775",
];
const LOTUS_PALETTE = [
  "#f2a1bb",
  "#c0a2e5",
  "#f2bd75",
  "#a3d9ce",
  "#f4d783",
  "#e7998f",
  "#aebfea",
];
const LANTERN_COLORS = [
  "#f2a65a",
  "#e46f6f",
  "#9cc98b",
  "#f3cf6a",
  "#f09a5b",
  "#e98aa0",
];
const SKIN = "#efba95";
const HAIR = "#302b39";

// Same hash as the 2D version, so a wish keeps its colour, shape and place for everyone.
export function wishDesign(id: string) {
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

/* ---------- small helpers ---------- */
const std = (color: string, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0,
    ...extra,
  });
function mesh(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}
function canvasTexture(
  w: number,
  h: number,
  draw: (g: CanvasRenderingContext2D) => void,
) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let glowTex: THREE.Texture | null = null;
function glowTexture() {
  if (glowTex) return glowTex;
  glowTex = canvasTexture(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.25, "rgba(255,255,255,.55)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 128, 128);
  });
  return glowTex;
}
let starTex: THREE.Texture | null = null;
function starTexture() {
  if (starTex) return starTex;
  starTex = canvasTexture(128, 128, (g) => {
    g.translate(64, 64);
    g.fillStyle = "#fff6c8";
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? 12 : 60,
        a = (i * Math.PI) / 4;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.fill();
  });
  return starTex;
}
function glow(color: string, size: number, opacity = 1) {
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  s.scale.set(size, size, 1);
  return s;
}
const ease = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);

/* ---------- people ---------- */
type Rig = {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  plate: THREE.Group;
  riceBall: THREE.Mesh;
  gift: THREE.Group;
  taper: THREE.Group;
};
const stripeCache = new Map<string, THREE.Texture>();
function longyiTexture(color: string) {
  if (!stripeCache.has(color))
    stripeCache.set(
      color,
      canvasTexture(64, 128, (g) => {
        g.fillStyle = color;
        g.fillRect(0, 0, 64, 128);
        g.fillStyle = "rgba(255,242,179,.55)";
        for (const y of [30, 58, 86]) g.fillRect(0, y, 64, 6);
      }),
    );
  return stripeCache.get(color)!;
}
function makePerson(color: string, style: number, scale = 1): Rig {
  const root = new THREE.Group(),
    body = new THREE.Group();
  root.add(body);
  const shadow = mesh(
    new THREE.CircleGeometry(0.5, 20),
    new THREE.MeshBasicMaterial({
      color: "#10232a",
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
    }),
    0,
    0.03,
    0,
  );
  shadow.rotation.x = -Math.PI / 2;
  root.add(shadow);
  const skin = std(SKIN),
    hair = std(HAIR, { roughness: 0.6 });
  const leg = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0.32, 0);
    const l = mesh(
      new THREE.CylinderGeometry(0.075, 0.07, 0.3, 8),
      std("#593e39"),
      0,
      -0.15,
      0,
    );
    const foot = mesh(
      new THREE.BoxGeometry(0.14, 0.08, 0.22),
      std("#593e39"),
      0,
      -0.29,
      0.04,
    );
    g.add(l, foot);
    body.add(g);
    return g;
  };
  const legL = leg(-0.11),
    legR = leg(0.11);
  body.add(
    mesh(
      new THREE.CylinderGeometry(0.25, 0.34, 0.62, 18),
      std(color, { map: longyiTexture(color) }),
      0,
      0.5,
      0,
    ),
  );
  body.add(
    mesh(
      new THREE.CylinderGeometry(0.21, 0.27, 0.38, 18),
      std(style % 2 ? "#f6e6b8" : "#fff0de"),
      0,
      0.98,
      0,
    ),
  );
  // Crossed collar in the longyi colour, like the 2D costume.
  const collar = mesh(
    new THREE.TorusGeometry(0.16, 0.025, 6, 18, Math.PI),
    std(color),
    0,
    1.13,
    0.06,
  );
  collar.rotation.set(Math.PI / 2 + 0.5, 0, Math.PI);
  body.add(collar);
  const arm = (side: number) => {
    const g = new THREE.Group();
    g.position.set(side * 0.27, 1.12, 0);
    g.rotation.z = side * 0.18;
    g.add(mesh(new THREE.CapsuleGeometry(0.065, 0.3, 4, 8), skin, 0, -0.22, 0));
    body.add(g);
    return g;
  };
  const armL = arm(-1),
    armR = arm(1);
  const head = new THREE.Group();
  head.position.set(0, 1.18, 0);
  body.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.4, 24, 18), skin, 0, 0.38, 0));
  const cap = mesh(
    new THREE.SphereGeometry(0.425, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.52),
    hair,
    0,
    0.4,
    -0.02,
  );
  cap.rotation.x = -0.42;
  head.add(cap);
  if (style % 2 === 0) {
    head.add(
      mesh(new THREE.SphereGeometry(0.17, 14, 10), hair, 0.24, 0.7, -0.16),
    );
    head.add(
      mesh(
        new THREE.SphereGeometry(0.07, 10, 8),
        std("#ffe3a0", { emissive: "#ffd36e", emissiveIntensity: 0.3 }),
        0.32,
        0.76,
        -0.04,
      ),
    );
  } else {
    head.add(mesh(new THREE.SphereGeometry(0.12, 12, 8), hair, 0, 0.66, -0.3));
  }
  const dark = std(HAIR);
  head.add(mesh(new THREE.SphereGeometry(0.042, 8, 6), dark, -0.14, 0.4, 0.37));
  head.add(mesh(new THREE.SphereGeometry(0.042, 8, 6), dark, 0.14, 0.4, 0.37));
  const mouth = mesh(
    new THREE.TorusGeometry(0.05, 0.012, 6, 12, Math.PI),
    std("#9c594a"),
    0,
    0.28,
    0.385,
  );
  mouth.rotation.z = Math.PI;
  head.add(mouth);
  // Thanaka on the cheeks.
  for (const s of [-1, 1]) {
    const c = mesh(
      new THREE.SphereGeometry(0.09, 10, 8),
      std("#f5d786"),
      s * 0.22,
      0.31,
      0.3,
    );
    c.scale.set(1, 0.6, 0.35);
    c.rotation.y = s * 0.6;
    head.add(c);
  }
  // Eating props: a leaf plate and a rice ball in the hand.
  const plate = new THREE.Group();
  plate.add(
    mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 0.025, 16),
      std("#74977d"),
      0,
      0,
      0,
    ),
  );
  plate.add(
    mesh(new THREE.SphereGeometry(0.06, 10, 8), std("#fff0ce"), 0.05, 0.05, 0),
  );
  plate.position.set(-0.12, 0.92, 0.36);
  plate.visible = false;
  body.add(plate);
  const riceBall = mesh(
    new THREE.SphereGeometry(0.065, 10, 8),
    std("#fff0d0"),
    0,
    -0.44,
    0.02,
  );
  riceBall.visible = false;
  armR.add(riceBall);
  const gift = new THREE.Group();
  gift.add(
    mesh(new THREE.BoxGeometry(0.2, 0.18, 0.2), std("#ef8fa5"), 0, 0, 0),
  );
  gift.add(
    mesh(new THREE.BoxGeometry(0.21, 0.05, 0.05), std("#ffe39a"), 0, 0.02, 0),
  );
  gift.add(
    mesh(new THREE.BoxGeometry(0.05, 0.05, 0.21), std("#ffe39a"), 0, 0.02, 0),
  );
  gift.position.set(0, -0.48, 0.04);
  gift.visible = false;
  armR.add(gift);
  // A small lit taper the player holds while lighting the pagoda candles.
  const taper = new THREE.Group();
  taper.add(
    mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.26, 6),
      std("#fbefd2"),
      0,
      -0.1,
      0,
    ),
  );
  taper.add(
    mesh(
      new THREE.ConeGeometry(0.035, 0.1, 8),
      new THREE.MeshBasicMaterial({ color: "#ffd773" }),
      0,
      -0.27,
      0,
    ),
  );
  taper.children[1].rotation.x = Math.PI; // flame tip points out along the taper
  const tg = glow("#ffbe5c", 0.55, 0.9);
  tg.position.set(0, -0.27, 0);
  taper.add(tg);
  taper.rotation.x = -0.6; // held tilted forward, so it points up and out when reaching
  taper.position.set(0, -0.44, 0.03);
  taper.visible = false;
  armR.add(taper);
  root.scale.setScalar(scale);
  return {
    root,
    body,
    head,
    armL,
    armR,
    legL,
    legR,
    plate,
    riceBall,
    gift,
    taper,
  };
}
type RigState = {
  walking: boolean;
  pose: string;
  holding?: boolean; // gift visible in the hands (give / receive poses)
  talking?: boolean; // party pose: this person is the one chatting
  lookAt?: number; // party pose: head turn (radians) towards whoever is talking
  kneel?: number; // 0 standing → 1 kneeling
  reach?: number; // 0 arm down → 1 arm reaching forward with the taper
  t: number;
  phase: number;
  calm: boolean;
};
function animateRig(r: Rig, s: RigState) {
  const t = s.t + s.phase;
  const swing = s.walking ? Math.sin(t * 9) * 0.55 : 0;
  r.legL.rotation.x = swing;
  r.legR.rotation.x = -swing;
  r.body.position.y =
    s.walking && !s.calm
      ? Math.abs(Math.sin(t * 9)) * 0.05
      : s.calm
        ? 0
        : Math.sin(t * 1.6) * 0.008;
  r.armL.rotation.x = -swing * 0.8;
  r.armR.rotation.x = swing * 0.8;
  r.head.rotation.x = 0;
  r.plate.visible =
    r.riceBall.visible =
    r.gift.visible =
    r.taper.visible =
      false;
  if (s.pose === "kneel") {
    // Kneel on the ground (legs tucked back), lean in and reach the taper to a candle.
    const k = s.kneel ?? 1,
      reach = s.reach ?? 0;
    r.legL.rotation.x = r.legR.rotation.x = 1.45 * k;
    r.body.position.y = -0.3 * k;
    r.body.rotation.x = 0.12 * k + 0.1 * reach;
    r.armL.rotation.x = -0.35 * k;
    r.armR.rotation.x = -0.2 - 1.15 * reach;
    r.taper.visible = true;
    r.head.rotation.x = 0.25 * k;
    return;
  }
  r.body.rotation.x = 0;
  r.armL.rotation.z = -0.18;
  r.armR.rotation.z = 0.18;
  r.gift.position.set(0, -0.48, 0.04);
  if (s.pose === "give") {
    // Hold the gift out with the right hand.
    const k = s.reach ?? 0;
    r.armR.rotation.x = -0.25 - 1.15 * k;
    r.armR.rotation.z = 0.18 - 0.12 * k;
    r.gift.visible = !!s.holding;
    r.head.rotation.x = 0.12 * k;
    return;
  }
  if (s.pose === "receive") {
    // Reach out with both hands, then hold the gift close.
    const k = s.reach ?? 0;
    r.armL.rotation.x = r.armR.rotation.x = -1.25 * k;
    r.armL.rotation.z = -0.18 + 0.5 * k;
    r.armR.rotation.z = 0.18 - 0.5 * k;
    r.gift.visible = !!s.holding;
    r.gift.position.set(-0.12, -0.5, 0.06);
    if (s.holding && !s.calm)
      r.body.position.y = Math.abs(Math.sin(t * 6)) * 0.05;
    r.head.rotation.x = s.holding ? -0.1 : 0.1;
    return;
  }
  r.head.rotation.y = r.head.rotation.z = 0;
  if (s.pose === "party") {
    // Eating together: nibbling, turning to whoever is talking, giggling.
    const talk = s.talking ? 1 : 0,
      look = s.lookAt ?? 0;
    r.plate.visible = r.riceBall.visible = true;
    r.armL.rotation.x = -1.05;
    r.head.rotation.y = look;
    if (s.calm) {
      r.armR.rotation.x = -1.6;
      return;
    }
    if (talk) {
      // Chatting: the free hand gestures and the head bobs.
      r.armR.rotation.x = -1.2 - Math.sin(t * 5) * 0.35;
      r.armR.rotation.z = 0.18 + Math.sin(t * 3.3) * 0.15;
      r.head.rotation.x = Math.sin(t * 9) * 0.08;
    } else {
      // Listening: a bite now and then, and a giggle.
      r.armR.rotation.x = -1.8 - Math.max(0, Math.sin(t * 2.2)) * 0.5;
      const giggle = Math.max(0, Math.sin(t * 1.3));
      r.body.position.y = Math.abs(Math.sin(t * 16)) * 0.035 * giggle;
      r.head.rotation.z = Math.sin(t * 2.1) * 0.12 * giggle;
      r.head.rotation.x = 0.06 - giggle * 0.12;
    }
    return;
  }
  if (s.pose === "wave") {
    r.armR.rotation.x = -2.7;
    r.armR.rotation.z = 0.25 + (s.calm ? 0 : Math.sin(t * 8) * 0.3);
    r.head.rotation.x = -0.15;
    r.body.position.y = s.calm ? 0 : Math.abs(Math.sin(t * 4)) * 0.03;
    return;
  }
  if (s.pose === "watching") {
    r.head.rotation.x = -0.5;
    r.armL.rotation.x = r.armR.rotation.x = -0.15;
  } else if (s.pose === "eating") {
    r.plate.visible = r.riceBall.visible = true;
    r.armL.rotation.x = -1.05;
    r.armR.rotation.x = s.calm
      ? -2.1
      : -1.8 - Math.max(0, Math.sin(t * 2.6)) * 0.55;
    r.head.rotation.x = 0.08;
  } else if (s.pose === "giving") {
    r.gift.visible = true;
    r.armR.rotation.x = -1.35;
  } else if (s.pose === "happy") {
    r.body.position.y = s.calm ? 0 : Math.abs(Math.sin(t * 7)) * 0.1;
    r.armL.rotation.x = r.armR.rotation.x = -0.4;
  }
}

/* ---------- toy lanterns for the children ---------- */
function makeToy(kind: number, paper: string) {
  const g = new THREE.Group();
  const m = std(paper, {
    emissive: paper,
    emissiveIntensity: 0.85,
    roughness: 0.6,
  });
  const body = mesh(new THREE.SphereGeometry(0.32, 16, 12), m, 0, 0.45, 0);
  body.scale.set(0.85, 0.8, 1.15);
  g.add(body);
  const headM = mesh(new THREE.SphereGeometry(0.21, 14, 10), m, 0, 0.62, 0.32);
  g.add(headM);
  if (kind === 0) {
    for (const s of [-1, 1]) {
      const ear = mesh(
        new THREE.CapsuleGeometry(0.05, 0.28, 4, 8),
        m,
        s * 0.08,
        0.95,
        0.28,
      );
      ear.rotation.z = s * -0.15;
      g.add(ear);
    }
  } else if (kind === 1) {
    for (const s of [-1, 1]) {
      const ear = mesh(
        new THREE.CircleGeometry(0.17, 14),
        m,
        s * 0.19,
        0.64,
        0.25,
      );
      ear.rotation.y = s * 1.1;
      (ear.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      g.add(ear);
    }
    const trunk = mesh(
      new THREE.CylinderGeometry(0.04, 0.06, 0.32, 8),
      m,
      0,
      0.47,
      0.5,
    );
    trunk.rotation.x = 0.5;
    g.add(trunk);
  } else {
    for (const s of [-1, 1])
      g.add(
        mesh(new THREE.ConeGeometry(0.07, 0.14, 4), m, s * 0.1, 0.84, 0.32),
      );
    const tail = mesh(
      new THREE.CylinderGeometry(0.025, 0.03, 0.4, 6),
      m,
      0,
      0.72,
      -0.4,
    );
    tail.rotation.x = -0.6;
    g.add(tail);
  }
  const wood = std("#8b6248");
  g.add(mesh(new THREE.BoxGeometry(0.42, 0.05, 0.62), wood, 0, 0.14, 0));
  for (const x of [-0.2, 0.2])
    for (const z of [-0.22, 0.22]) {
      const w = mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 0.04, 12),
        wood,
        x,
        0.08,
        z,
      );
      w.rotation.z = Math.PI / 2;
      g.add(w);
    }
  const light = glow(paper, 2.2, 0.75);
  light.position.set(0, 0.5, 0.05);
  g.add(light);
  return g;
}

/* ---------- wishes ---------- */
const SKETCHES: ((g: CanvasRenderingContext2D) => void)[] = [
  (g) => {
    g.beginPath();
    g.moveTo(0, -4);
    g.bezierCurveTo(-14, -20, -26, 0, 0, 16);
    g.bezierCurveTo(26, 0, 14, -20, 0, -4);
    g.stroke();
  },
  (g) => {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 7 : 17,
        a = -Math.PI / 2 + (i * Math.PI) / 5;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.stroke();
  },
  (g) => {
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.ellipse(
        Math.cos((i * Math.PI) / 3) * 9,
        Math.sin((i * Math.PI) / 3) * 9,
        7,
        4,
        (i * Math.PI) / 3,
        0,
        Math.PI * 2,
      );
      g.stroke();
    }
  },
  (g) => {
    g.beginPath();
    g.arc(0, 0, 15, 0.6, Math.PI * 2 - 0.6);
    g.arc(7, 0, 11, Math.PI * 2 - 0.9, 0.9, true);
    g.stroke();
  },
  (g) => {
    for (const r of [16, 11, 6]) {
      g.beginPath();
      g.arc(0, 8, r, Math.PI, 0);
      g.stroke();
    }
  },
];
function paperTexture(color: string, sketch: number) {
  return canvasTexture(256, 128, (g) => {
    const lg = g.createLinearGradient(0, 0, 0, 128);
    lg.addColorStop(0, "#ffe5a0");
    lg.addColorStop(1, color);
    g.fillStyle = lg;
    g.fillRect(0, 0, 256, 128);
    g.strokeStyle = "rgba(128,96,96,.8)";
    g.lineWidth = 2.5;
    g.lineCap = g.lineJoin = "round";
    for (const u of [64, 192]) {
      g.save();
      g.translate(u, 64);
      g.scale(1.2, -1.2);
      SKETCHES[sketch](g);
      g.restore();
    }
  });
}
const lathe = (pts: [number, number][]) =>
  new THREE.LatheGeometry(
    pts.map(([x, y]) => new THREE.Vector2(x, y)),
    28,
  );
function balloonGeometry(shape: number): THREE.BufferGeometry {
  if (shape === 0)
    return lathe([
      [0.42, 0],
      [0.5, 0.15],
      [0.58, 0.95],
      [0.5, 1.18],
      [0.3, 1.28],
      [0.001, 1.3],
    ]);
  if (shape === 1) {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 14; i++) {
      const a = 0.45 + (i / 14) * (Math.PI - 0.45);
      pts.push([Math.max(0.001, 0.6 * Math.sin(a)), 0.65 * (1 - Math.cos(a))]);
    }
    return lathe(pts);
  }
  if (shape === 4)
    return lathe([
      [0.16, 0],
      [0.4, 0.3],
      [0.6, 0.66],
      [0.38, 1.05],
      [0.001, 1.38],
    ]);
  const s = new THREE.Shape();
  if (shape === 2) {
    s.moveTo(0, 0.25);
    s.bezierCurveTo(-0.35, 0.85, -0.95, 0.35, 0, -0.45);
    s.bezierCurveTo(0.95, 0.35, 0.35, 0.85, 0, 0.25);
  } else {
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.32 : 0.72,
        a = Math.PI / 2 + (i * Math.PI) / 5;
      if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    s.closePath();
  }
  const g = new THREE.ExtrudeGeometry(s, {
    depth: 0.3,
    bevelEnabled: true,
    bevelSize: 0.07,
    bevelThickness: 0.07,
    bevelSegments: 3,
  });
  g.center();
  g.translate(0, 0.65, 0);
  return g;
}
function makeBalloon(w: WorldWish) {
  const d = wishDesign(w.id),
    shape = w.shape ?? d.shape,
    color = BALLOON_PALETTE[w.color ?? d.color];
  const g = new THREE.Group();
  const isLathe = shape === 0 || shape === 1 || shape === 4;
  const mat = std(color, {
    map: isLathe ? paperTexture(color, d.sketch) : null,
    emissive: color,
    emissiveIntensity: 0.55,
    side: THREE.DoubleSide,
    roughness: 0.7,
  });
  g.add(new THREE.Mesh(balloonGeometry(shape), mat));
  const ring = mesh(
    new THREE.TorusGeometry(0.34, 0.03, 6, 20),
    std("#d8a471"),
    0,
    -0.05,
    0,
  );
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  g.add(
    mesh(
      new THREE.SphereGeometry(0.08, 8, 6),
      new THREE.MeshBasicMaterial({ color: "#fff3b6" }),
      0,
      0.02,
      0,
    ),
  );
  const inner = glow("#ffe5a0", 3, 0.9);
  inner.position.y = 0.6;
  g.add(inner);
  g.scale.setScalar(1.5);
  return g;
}
function makeLotus(w: WorldWish) {
  const d = wishDesign(w.id),
    color = LOTUS_PALETTE[d.color];
  const g = new THREE.Group();
  g.add(
    mesh(
      new THREE.CylinderGeometry(0.75, 0.75, 0.04, 22),
      std("#87aa87"),
      0,
      0.02,
      0,
    ),
  );
  const petal = new THREE.SphereGeometry(0.34, 12, 8);
  const pm = std(color, {
    emissive: color,
    emissiveIntensity: 0.35,
    roughness: 0.6,
  });
  for (const [count, tilt, r, s] of [
    [8, 1.0, 0.36, 1],
    [6, 0.55, 0.2, 0.8],
  ] as const)
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (count === 6 ? 0.3 : 0);
      const holder = new THREE.Group();
      holder.rotation.y = a;
      const p = mesh(petal, pm, 0, 0.18, r);
      p.scale.set(0.45 * s, 0.22 * s, 1 * s);
      p.rotation.x = -tilt;
      holder.add(p);
      g.add(holder);
    }
  g.add(
    mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.22, 10),
      std("#fff0c7"),
      0,
      0.35,
      0,
    ),
  );
  g.add(
    mesh(
      new THREE.SphereGeometry(0.06, 8, 6),
      new THREE.MeshBasicMaterial({ color: "#fff4bd" }),
      0,
      0.52,
      0,
    ),
  );
  const fl = glow("#ffd890", 2.2, 0.95);
  fl.position.y = 0.55;
  g.add(fl);
  g.scale.setScalar(1.5);
  return g;
}

/* ---------- fireworks ---------- */
/**
 * The fireworks show, timed to the recorded sound (public/sounds/fireworks.mp3). The sound starts
 * FIREWORK_AUDIO_AT seconds after launch so the first rocket can be seen rising; every burst below
 * lands on a boom in the recording (onset time in the file + FIREWORK_AUDIO_AT).
 *   off/h: sideways offset and height above the pagoda, size: spread and brightness,
 *   rocket: false for the small crackles that sparkle without a rising rocket.
 */
export const FIREWORK_AUDIO_AT = 0.45;
export const FIREWORK_SHOW_SECONDS = 6.5;
const SHOW: {
  at: number;
  off: number;
  h: number;
  z: number;
  size: number;
  rocket: boolean;
}[] = [
  // First wave: three booms.
  { at: 0.305, off: -8, h: 15.5, z: 0.4, size: 1, rocket: true },
  { at: 0.81, off: 8.5, h: 18.5, z: 1.4, size: 1, rocket: true },
  { at: 1.105, off: 0, h: 13.5, z: 2.4, size: 0.95, rocket: true },
  { at: 1.23, off: 2.5, h: 15, z: 2.2, size: 0.35, rocket: false }, // crackle
  // Second wave: a quick double, then the finale.
  { at: 2.05, off: -5, h: 19.5, z: 0.8, size: 0.85, rocket: true },
  { at: 2.18, off: 5.5, h: 15.5, z: 1.8, size: 0.8, rocket: true },
  { at: 2.57, off: 0, h: 17.5, z: 2.8, size: 1.2, rocket: true },
  { at: 2.725, off: 7.5, h: 17.5, z: 2.6, size: 0.35, rocket: false }, // crackle
  // A soft, faraway pop low on the horizon.
  { at: 3.625, off: -13, h: 10, z: -6, size: 0.4, rocket: false },
];
type Burst = {
  pos: THREE.Vector3;
  from: THREE.Vector3;
  delay: number;
  size: number;
  hasRocket: boolean;
  dirs: THREE.Vector3[];
  speeds: number[];
  points: THREE.Points;
  lines: THREE.LineSegments;
  stars: THREE.Points | null;
  rocket: THREE.Sprite;
  flash: THREE.Sprite;
  light: THREE.PointLight;
  reflection: THREE.Mesh;
};

export class FestivalWorld {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
  private clock = new THREE.Clock();
  private frame = 0;
  private host: HTMLElement;
  private events: Events;
  private keys: Set<string>;
  private calm =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  private visible = true;
  private observers: (ResizeObserver | IntersectionObserver)[] = [];

  private player: Rig | null = null;
  private pos: Position = { ...START };
  private heading = START_HEADING;
  private walking = false;
  private canMove = false;
  private pose: PlayerPose = "";
  private lastSent = { x: START.x, z: START.z, h: START_HEADING, at: 0 };

  private orbitYaw = 0;
  private orbitPitch = 0;
  private camPos = new THREE.Vector3();
  private camTarget = new THREE.Vector3();
  private drag: { x: number; y: number; moved: number } | null = null;

  private friends: {
    rig: Rig;
    key: string;
    heading: number;
    eating: boolean;
  }[] = [];
  private friendHappy = false;
  /** Who is chatting at the rice-ball table right now ("friend-two", "friend-three", "player"). */
  private speaker = "";
  setSpeaker(key: string) {
    this.speaker = key;
  }
  private nearChild: number | null = null;
  private children: {
    rig: Rig;
    toy: THREE.Group;
    string: THREE.Line;
    route: Position[];
    seg: number;
    along: number;
    speed: number;
    pos: Position;
    dir: number;
  }[] = [];

  private lanternBodies: THREE.InstancedMesh[] = [];
  private lanternGlow!: THREE.Points;
  private shopLanterns: THREE.Mesh[] = [];
  private warmLights: THREE.PointLight[] = [];
  private candleFlames!: THREE.Group;
  private candleLight!: THREE.PointLight;
  private lit = false;
  private candles = false;
  private candleBits: THREE.Object3D[][] = [];
  private giftRite: {
    start: number;
    from: { x: number; z: number; h: number };
    to: { x: number; z: number };
    thanked: boolean;
    onThanks?: () => void;
  } | null = null;
  private rite: {
    start: number;
    from: { x: number; z: number; h: number };
    lit: boolean[];
    onDone?: () => void;
  } | null = null;
  private spotRings: Record<string, THREE.Mesh> = {};
  private clouds: THREE.Group[] = [];
  // Fairy lights (tree wires, arch, shop eaves) are gathered while building, then drawn as one point cloud.
  private fairyPos: number[] = [];
  private fairyCol: number[] = [];
  private fairySeed: number[] = [];
  private fairyMat!: THREE.ShaderMaterial;
  private fireflyMat!: THREE.ShaderMaterial;
  private starMat!: THREE.ShaderMaterial;
  private water!: THREE.Mesh;

  private wishes = new Map<
    string,
    {
      group: THREE.Group;
      kind: string;
      home: THREE.Vector3;
      phase: number;
      release?: { from: THREE.Vector3; start: number };
    }
  >();
  private wishTargets: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();

  private bursts: Burst[] = [];
  private fireworkStart = -1;
  private fireworkType = 0;
  private fireLights: THREE.PointLight[] = [];
  private skyLook = new THREE.Vector3();
  private camDt = 0;
  // Fireworks cinematic: a wide, low shot of the garden with the bursts above the pagoda.
  private cine: {
    pos: THREE.Vector3;
    target: THREE.Vector3;
    dir: THREE.Vector3;
    start: number;
    skipped: boolean;
  } | null = null;
  private route: {
    points: Position[];
    face?: number;
    onArrive?: () => void;
  } | null = null;
  private tapMarker!: THREE.Mesh;
  private tapAt = -10;
  private focus: { id?: string; point?: THREE.Vector3; until: number } | null =
    null;
  private celebration: {
    start: number;
    items: {
      g: THREE.Group;
      from: THREE.Vector3;
      sway: number;
      delay: number;
    }[];
  } | null = null;
  private readySent = false;
  private time = 0;
  /** Test hook: slow the world down to inspect animations frame by frame. */
  timeScale = 1;

  constructor(host: HTMLElement, keys: Set<string>, events: Events) {
    this.host = host;
    this.keys = keys;
    this.events = events;
    const probe = document.createElement("canvas");
    if (!(probe.getContext("webgl2") || probe.getContext("webgl")))
      throw new Error("WebGL unavailable");
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    const canvas = this.renderer.domElement;
    canvas.className = "world-canvas";
    canvas.setAttribute("aria-hidden", "true");
    host.prepend(canvas);
    this.scene.fog = new THREE.Fog("#2a2d5c", 38, 115);
    this.buildSky();
    this.buildGround();
    this.buildPagoda();
    this.buildShop();
    this.buildTable();
    this.buildPond();
    this.buildStringLanterns();
    this.buildTrees();
    this.buildArch();
    this.buildShopLights();
    this.buildPondDecor();
    this.buildFlowers();
    this.buildFireflies();
    this.buildFairyLights();
    this.buildSpots();
    this.buildPeople();
    this.buildFireworkLights();
    this.tapMarker = mesh(
      new THREE.RingGeometry(0.35, 0.5, 32),
      new THREE.MeshBasicMaterial({
        color: "#fff3c4",
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
      0,
      0.08,
      0,
    );
    this.tapMarker.rotation.x = -Math.PI / 2;
    this.scene.add(this.tapMarker);
    this.setAvatar(0);
    this.snapCamera();
    this.bindPointer(canvas);
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(host);
    const io = new IntersectionObserver(
      ([e]) => (this.visible = e.isIntersecting),
    );
    io.observe(host);
    this.observers.push(ro, io);
    this.resize();
    this.loop();
  }

  /* ----- public API used by the React page ----- */
  setCanMove(v: boolean) {
    this.canMove = v;
  }
  setAvatar(i: number) {
    if (this.player) this.scene.remove(this.player.root);
    this.player = makePerson(AVATAR_COLORS[i], i);
    this.scene.add(this.player.root);
  }
  setPose(p: PlayerPose) {
    this.pose = p;
    this.friendHappy = p === "giving";
  }
  setLit(v: boolean) {
    this.lit = v;
    for (const m of this.lanternBodies)
      (m.material as THREE.MeshStandardMaterial).emissiveIntensity = v
        ? 0.85
        : 0.12;
    (this.lanternGlow.material as THREE.PointsMaterial).opacity = v ? 0.6 : 0;
    for (const m of this.shopLanterns)
      (m.material as THREE.MeshStandardMaterial).emissiveIntensity = v
        ? 0.9
        : 0.12;
    for (const l of this.warmLights) l.intensity = v ? 60 : 0;
  }
  setCandles(v: boolean) {
    this.candles = v;
    if (this.rite && v) return; // the lighting moment is in charge
    for (const b of this.candleBits) for (const o of b) o.visible = v;
    this.candleLight.intensity = v ? 120 : 0;
  }
  /**
   * The candle-lighting moment: the player kneels at the pagoda, lights the first candle with a
   * taper (about 2 s in), then the light passes around the ring until every candle glows.
   */
  lightCandles(onDone?: () => void) {
    if (this.rite) return;
    this.route = null;
    this.keys.clear();
    this.rite = {
      start: this.time,
      from: { x: this.pos.x, z: this.pos.z, h: this.heading },
      lit: this.candleBits.map(() => false),
      onDone,
    };
  }
  /**
   * The gift moment: the player steps up to the friend and holds out the gift (about 0.8 s),
   * the friend reaches out with both hands and takes it (about 1.8 s), then says thank you and
   * holds it close, happy. The player keeps standing near the friend afterwards.
   */
  giveGift(onThanks?: () => void) {
    if (this.giftRite) return;
    const f = FRIENDS.one,
      dx = this.pos.x - f.x,
      dz = this.pos.z - f.z,
      len = Math.hypot(dx, dz) || 1;
    let to = { x: f.x + (dx / len) * 1.15, z: f.z + (dz / len) * 1.15 };
    if (!isWalkable(to)) to = { ...this.pos };
    this.route = null;
    this.keys.clear();
    this.giftRite = {
      start: this.time,
      from: { x: this.pos.x, z: this.pos.z, h: this.heading },
      to,
      thanked: false,
      onThanks,
    };
  }
  get givingGift() {
    return !!this.giftRite;
  }
  /** Gift moment timeline, seconds since start. */
  private giftTimes(e: number) {
    const clamp = (x: number) => Math.min(1, Math.max(0, x)),
      sm = (x: number) => x * x * (3 - 2 * x);
    return {
      walk: sm(clamp(e / 0.8)),
      give: sm(clamp((e - 0.7) / 0.6)) * (1 - sm(clamp((e - 2.0) / 0.5))),
      giverHolds: e < 1.85,
      receive: sm(clamp((e - 1.2) / 0.55)),
      receiverHolds: e >= 1.85,
      hug: sm(clamp((e - 2.1) / 0.5)), // gift drawn in close to the chest
    };
  }
  private updateGift(t: number) {
    const r = this.giftRite;
    if (!r || !this.player) return false;
    const e = t - r.start,
      g = this.giftTimes(e);
    this.pos = {
      x: r.from.x + (r.to.x - r.from.x) * g.walk,
      z: r.from.z + (r.to.z - r.from.z) * g.walk,
    };
    const want = Math.atan2(
      FRIENDS.one.x - this.pos.x,
      FRIENDS.one.z - this.pos.z,
    );
    let dh = want - r.from.h;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.heading = r.from.h + dh * Math.min(1, g.walk * 1.4);
    if (!r.thanked && e >= 1.95) {
      r.thanked = true;
      r.onThanks?.();
    }
    this.player.root.position.set(this.pos.x, 0, this.pos.z);
    this.player.root.rotation.y = this.heading;
    animateRig(this.player, {
      walking: g.walk > 0 && g.walk < 0.99,
      pose: "give",
      reach: g.give,
      holding: g.giverHolds,
      t,
      phase: 0,
      calm: this.calm,
    });
    if (e >= 3.8) {
      this.giftRite = null;
      this.giftHeldUntil = t + 3;
      this.lastSent.at = -1;
      this.events.onMove({ ...this.pos }, this.heading);
    }
    return true;
  }
  private giftHeldUntil = -1;
  get lightingCandles() {
    return !!this.rite;
  }
  /** Runs the candle moment each frame. Returns true while it controls the player. */
  private updateRite(t: number) {
    const r = this.rite;
    if (!r || !this.player) return false;
    const e = t - r.start,
      ease = (x: number) => x * x * (3 - 2 * x),
      clamp = (x: number) => Math.min(1, Math.max(0, x));
    // 0–0.7 s: step up to the candles and face the pagoda; 4.8–5.4 s: step back to where the
    // player started (the kneeling spot is inside the pagoda's walking boundary).
    const w = ease(clamp(e / 0.7)) * (1 - ease(clamp((e - 4.8) / 0.6)));
    this.pos = {
      x: r.from.x + (KNEEL.x - r.from.x) * w,
      z: r.from.z + (KNEEL.z - r.from.z) * w,
    };
    let dh = Math.PI - r.from.h;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.heading = r.from.h + dh * w;
    // 0.7–1.2 s kneel, 1.2–2.0 s reach in, first candle lights at 2.1 s, arm back by 2.9 s,
    // the rest light in a wave from 3.0 s, stand up 4.4–4.9 s.
    const kneel =
      ease(clamp((e - 0.7) / 0.5)) * (1 - ease(clamp((e - 4.4) / 0.5)));
    const reach =
      ease(clamp((e - 1.2) / 0.8)) * (1 - ease(clamp((e - 2.4) / 0.5)));
    const light = (i: number) => {
      if (r.lit[i]) return;
      r.lit[i] = true;
      for (const o of this.candleBits[i]) o.visible = true;
    };
    if (e >= 2.1) light(0);
    const n = this.candleBits.length;
    for (let i = 1; i < n; i++) {
      const steps = Math.min(i, n - i); // spread both ways round the ring
      if (e >= 3.0 + (steps / (n / 2)) * 1.1) light(i);
    }
    const count = r.lit.filter(Boolean).length;
    const target = count === 0 ? 0 : count === 1 ? 35 : 35 + (85 * count) / n;
    this.candleLight.intensity += (target - this.candleLight.intensity) * 0.2;
    this.player.root.position.set(this.pos.x, 0, this.pos.z);
    this.player.root.rotation.y = this.heading;
    animateRig(this.player, {
      walking: (e < 0.7 && w < 0.98) || (e > 4.85 && e < 5.4),
      pose: e < 0.7 || e > 4.85 ? "" : "kneel",
      kneel,
      reach,
      t,
      phase: 0,
      calm: this.calm,
    });
    if (e >= 5.4) {
      this.rite = null;
      // Always finish on walkable ground so the player can move away.
      this.pos = isWalkable(r.from)
        ? { x: r.from.x, z: r.from.z }
        : { x: KNEEL.x, z: KNEEL.z + 2.2 };
      this.candles = true;
      this.candleLight.intensity = 120;
      for (const b of this.candleBits) for (const o of b) o.visible = true;
      this.lastSent.at = -1;
      this.events.onMove({ ...this.pos }, this.heading);
      r.onDone?.();
    }
    return true;
  }
  get position() {
    return { ...this.pos };
  }
  setWishes(list: WorldWish[], releaseId: string | null) {
    const keep = new Set(list.map((w) => w.id));
    for (const [id, w] of this.wishes)
      if (!keep.has(id)) {
        this.scene.remove(w.group);
        this.wishes.delete(id);
      }
    for (const w of list) {
      if (this.wishes.has(w.id)) continue;
      const d = wishDesign(w.id);
      const lotus = w.kind === "lotus";
      const group = lotus ? makeLotus(w) : makeBalloon(w);
      group.traverse((o) => (o.userData.wishId = w.id));
      let home: THREE.Vector3;
      if (lotus) {
        const a = ((d.x - 14) / 72) * Math.PI * 2,
          r = Math.sqrt((d.y - 11) / 19);
        home = new THREE.Vector3(
          POND.x + Math.cos(a) * 6 * r,
          0.06,
          POND.z + Math.sin(a) * 4.3 * r,
        );
      } else {
        // Float in the open sky just above and behind the pagoda, clear of the trees,
        // so every wish balloon can be seen from the garden. Ones near the middle sit
        // higher so they never hide behind the spire.
        const x = (d.x - 50) * 0.45;
        home = new THREE.Vector3(
          PAGODA.x + x,
          9.6 + ((d.y - 11) / 19) * 3.2 + Math.max(0, 2.6 - Math.abs(x) * 0.45),
          PAGODA.z - 4 - d.sketch * 0.9 + d.drift * 0.3,
        );
      }
      const entry: {
        group: THREE.Group;
        kind: string;
        home: THREE.Vector3;
        phase: number;
        release?: { from: THREE.Vector3; start: number };
      } = {
        group,
        kind: w.kind,
        home,
        phase: d.drift * 3,
      };
      if (w.id === releaseId) {
        const from = lotus
          ? new THREE.Vector3(SPOTS.lotus.x + 2.2, 0.06, SPOTS.lotus.z)
          : new THREE.Vector3(this.pos.x, 2.4, this.pos.z);
        entry.release = { from, start: this.time };
        this.focus = { id: w.id, until: this.time + 5 };
        group.position.copy(from);
      } else group.position.copy(home);
      this.scene.add(group);
      this.wishes.set(w.id, entry);
    }
    this.wishTargets = [...this.wishes.values()].map((w) => w.group);
  }
  launchFireworks(type: number) {
    this.clearFireworks();
    this.fireworkType = type;
    this.fireworkStart = this.time;
    // Frame the shot from the hand-picked viewpoint on the player's side of the pagoda.
    // Each viewpoint has a clear view: through the arch, across the pond, past the table, and so on.
    const pagoda = new THREE.Vector3(PAGODA.x, 0, PAGODA.z);
    const viewpoints: [number, number][] = [
      [0.6, 27], // down the path, through the lit arch
      [17, 24], // across the pond, with its reflections
      [-11, 18.5], // past the rice-ball table
      [27, -8.5], // from the east lawn
    ];
    const playerDir = Math.atan2(this.pos.x - PAGODA.x, this.pos.z - PAGODA.z);
    let best = viewpoints[0],
      bestDiff = Infinity;
    for (const vp of viewpoints) {
      let d = Math.atan2(vp[0] - PAGODA.x, vp[1] - PAGODA.z) - playerDir;
      d = Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
      if (d < bestDiff) ((bestDiff = d), (best = vp));
    }
    const narrow = this.camera.aspect < 1.2;
    const camPos = new THREE.Vector3(best[0], narrow ? 3.4 : 3.1, best[1]);
    const dir = new THREE.Vector3(
      best[0] - PAGODA.x,
      0,
      best[1] - PAGODA.z,
    ).normalize();
    const lookAt = pagoda.clone().setY(narrow ? 11 : 9.5);
    this.cine = {
      pos: camPos,
      target: lookAt,
      dir,
      start: this.time,
      skipped: false,
    };
    // Everyone faces the show.
    this.heading = Math.atan2(PAGODA.x - this.pos.x, PAGODA.z - this.pos.z);
    this.orbitYaw = 0;
    this.route = null;
    const fwd = dir.clone().negate();
    const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const centre = pagoda.clone().addScaledVector(fwd, 4);
    this.skyLook.copy(centre).setY(17);
    const spread = narrow ? 0.55 : 1;
    SHOW.forEach((shot, b) => {
      const { off, h, size } = shot,
        delay = FIREWORK_AUDIO_AT + shot.at,
        n = Math.round((type === 2 ? 64 : 44) * (size < 0.5 ? 0.45 : 1));
      const pos = centre
        .clone()
        .addScaledVector(side, off * spread)
        .addScaledVector(fwd, -shot.z)
        .setY(h);
      const from = centre
        .clone()
        .addScaledVector(side, off * 0.6 - 3)
        .addScaledVector(fwd, -10)
        .setY(0);
      const dirs: THREE.Vector3[] = [],
        speeds: number[] = [];
      for (let i = 0; i < n; i++) {
        // Even spread over a sphere (Fibonacci), alternating long and short rays like the 2D bursts.
        const y = 1 - (i / (n - 1)) * 2,
          r = Math.sqrt(1 - y * y),
          a = i * 2.39996;
        dirs.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
        speeds.push(
          (i % 2 ? 6.8 : 10.5) *
            (type === 1 ? 0.85 : 1) *
            (narrow ? 0.8 : 1) *
            size,
        );
      }
      const colors = new Float32Array(n * 3),
        lineColors = new Float32Array(n * 6);
      const c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        c.set(type === 3 ? RAINBOW[i % 5] : FIREWORK_COLORS[type]);
        colors.set([c.r, c.g, c.b], i * 3);
        lineColors.set([c.r, c.g, c.b, c.r * 0.2, c.g * 0.2, c.b * 0.2], i * 6);
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(n * 3), 3),
      );
      pg.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      const points = new THREE.Points(
        pg,
        new THREE.PointsMaterial({
          size: type === 1 ? 2.8 : 2.2,
          map: glowTexture(),
          vertexColors: true,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          opacity: 0,
          fog: false,
          toneMapped: false,
        }),
      );
      const lg = new THREE.BufferGeometry();
      lg.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(n * 6), 3),
      );
      lg.setAttribute("color", new THREE.BufferAttribute(lineColors, 3));
      const lines = new THREE.LineSegments(
        lg,
        new THREE.LineBasicMaterial({
          vertexColors: true,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          opacity: 0,
          fog: false,
          toneMapped: false,
        }),
      );
      let stars: THREE.Points | null = null;
      if (type === 0) {
        const sg = new THREE.BufferGeometry();
        sg.setAttribute(
          "position",
          new THREE.BufferAttribute(new Float32Array(Math.ceil(n / 4) * 3), 3),
        );
        stars = new THREE.Points(
          sg,
          new THREE.PointsMaterial({
            size: 4,
            map: starTexture(),
            color: "#fff1a0",
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            opacity: 0,
            fog: false,
            toneMapped: false,
          }),
        );
        this.scene.add(stars);
      }
      const color =
        type === 3 ? RAINBOW[(b + 1) % RAINBOW.length] : FIREWORK_COLORS[type];
      const rocket = glow(color, 1.2, 0);
      const flash = glow(color, 16 * Math.max(0.4, size), 0);
      flash.position.copy(pos);
      // A few shared lights; each frame the brightest bursts claim them (see updateFireworks).
      const light = this.fireLights[b % this.fireLights.length];
      const reflection = mesh(
        new THREE.CircleGeometry(1, 32),
        new THREE.MeshBasicMaterial({
          map: glowTexture(),
          color,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
        POND.x + ((b % 3) - 1) * 2.5,
        0.08,
        POND.z - 0.5,
      );
      reflection.rotation.x = -Math.PI / 2;
      reflection.scale.set(POND.rx * 0.8, POND.rz * 0.8, 1);
      // Positions are written every frame, so skip the stale bounding-sphere culling test.
      points.frustumCulled = lines.frustumCulled = false;
      if (stars) stars.frustumCulled = false;
      this.scene.add(points, lines, rocket, flash, reflection);
      this.bursts.push({
        pos,
        from,
        delay,
        size,
        hasRocket: shot.rocket,
        dirs,
        speeds,
        points,
        lines,
        stars,
        rocket,
        flash,
        light,
        reflection,
      });
    });
  }
  /** Walk to a spot by itself, steering around obstacles, then face the activity. */
  walkToSpot(id: string, onArrive?: () => void) {
    this.walkTo(SPOTS[id], SPOT_FACING[id], onArrive);
  }
  walkTo(target: Position, face?: number, onArrive?: () => void) {
    if (this.calm) {
      // Reduced motion: no long walks, just arrive.
      const path = findPath(this.pos, target);
      const end = path?.[path.length - 1] ?? target;
      this.teleport(end, face ?? this.heading);
      onArrive?.();
      return;
    }
    const points = findPath(this.pos, target);
    if (!points) return;
    if (!points.length) {
      if (face !== undefined) this.heading = face;
      onArrive?.();
      return;
    }
    this.route = { points, face, onArrive };
  }
  get walkingToSpot() {
    return !!this.route;
  }
  /** Turn the camera towards a wish for a few seconds. */
  focusWish(id: string, seconds = 4.5) {
    if (this.wishes.has(id)) this.focus = { id, until: this.time + seconds };
  }
  /** Finale: dozens of sky lanterns rise from the whole garden. */
  celebrate() {
    if (this.celebration)
      for (const it of this.celebration.items) this.scene.remove(it.g);
    const items: {
      g: THREE.Group;
      from: THREE.Vector3;
      sway: number;
      delay: number;
    }[] = [];
    for (let i = 0; i < 42; i++) {
      const g = makeBalloon({
        id: "finale-" + i,
        kind: "balloon",
        color: i % 7,
        shape: i % 5 === 2 || i % 5 === 3 ? 0 : i % 5,
      });
      const a = Math.random() * Math.PI * 2,
        r = 3 + Math.random() * 20;
      const from = new THREE.Vector3(
        this.pos.x + Math.cos(a) * r,
        1.5,
        this.pos.z + Math.sin(a) * r,
      );
      g.position.copy(from);
      g.scale.setScalar(1.1 + Math.random() * 0.5);
      this.scene.add(g);
      items.push({
        g,
        from,
        sway: Math.random() * 6,
        delay: Math.random() * 3,
      });
    }
    this.celebration = { start: this.time, items };
    const fwd = new THREE.Vector3(
      Math.sin(this.heading),
      0,
      Math.cos(this.heading),
    );
    this.skyLook
      .set(this.pos.x, 0, this.pos.z)
      .addScaledVector(fwd, 18)
      .setY(13);
  }
  /** Leave the fireworks shot early and return to the normal follow camera. */
  skipCinematic() {
    if (this.cine) this.cine.skipped = true;
  }
  /** Test hook: jump the player to a spot (used by automated play-tests). */
  teleport(p: Position, heading = this.heading) {
    this.pos = { ...p };
    this.heading = heading;
    this.orbitYaw = 0;
    this.events.onMove({ ...this.pos }, heading);
    this.snapCamera();
  }
  dispose() {
    cancelAnimationFrame(this.frame);
    this.observers.forEach((o) => o.disconnect());
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /* ----- building the world ----- */
  private buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(220, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color("#10143a") },
          bottom: { value: new THREE.Color("#4b4d86") },
        },
        vertexShader:
          "varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader:
          "uniform vec3 top; uniform vec3 bottom; varying float h; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(-0.05, 0.55, h)), 1.0); }",
      }),
    );
    this.scene.add(sky);
    const n = 1500,
      pos = new Float32Array(n * 3),
      seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2,
        y = 0.12 + Math.random() * 0.88,
        r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * r * 200, y * 200, Math.sin(a) * r * 200], i * 3);
      seed[i] = Math.random() * 10;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
    this.starMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { time: { value: 0 } },
      vertexShader:
        "attribute float seed; uniform float time; varying float a; void main(){ a = 0.45 + 0.55 * sin(time * (0.6 + fract(seed) * 1.4) + seed * 6.0); gl_PointSize = 1.6 + fract(seed * 3.7) * 2.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader:
        "varying float a; void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(1.0, 0.97, 0.86, a * smoothstep(0.5, 0.1, d)); }",
    });
    this.scene.add(new THREE.Points(g, this.starMat));
    const moonDir = new THREE.Vector3(34, 30, -120);
    // A soft crescent moon, as in the reference.
    const moonTex = canvasTexture(256, 256, (g) => {
      g.fillStyle = "#f4f1ff";
      g.beginPath();
      g.arc(128, 128, 100, 0, Math.PI * 2);
      g.fill();
      g.globalCompositeOperation = "destination-out";
      g.beginPath();
      g.arc(170, 104, 92, 0, Math.PI * 2);
      g.fill();
    });
    const moon = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: moonTex,
        fog: false,
        transparent: true,
        depthWrite: false,
      }),
    );
    moon.scale.set(22, 22, 1);
    moon.position.copy(moonDir);
    this.scene.add(moon);
    const halo = glow("#d9dcff", 55, 0.35);
    (halo.material as THREE.SpriteMaterial).fog = false;
    halo.position.copy(moonDir);
    this.scene.add(halo);
    this.scene.add(new THREE.HemisphereLight("#9ea2e6", "#2b4a3c", 1.9));
    const moonLight = new THREE.DirectionalLight("#c9cfff", 1.2);
    moonLight.position.copy(moonDir);
    this.scene.add(moonLight);
    const cloudMat = new THREE.MeshLambertMaterial({
      color: "#3b3e70",
      transparent: true,
      opacity: 0.55,
      fog: false,
    });
    // Low mist drifting around the edges of the garden.
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2,
        r = 30 + (i % 3) * 7;
      const m = glow("#8d90cf", 22 + (i % 4) * 6, 0.1);
      (m.material as THREE.SpriteMaterial).blending = THREE.NormalBlending;
      m.position.set(Math.cos(a) * r, 1.5 + (i % 2), Math.sin(a) * r);
      this.scene.add(m);
    }
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Group();
      for (let j = 0; j < 5; j++) {
        const puff = mesh(
          new THREE.SphereGeometry(4 + Math.random() * 3, 12, 8),
          cloudMat,
          j * 5 - 10,
          Math.random() * 2,
          Math.random() * 3,
        );
        puff.scale.y = 0.45;
        c.add(puff);
      }
      c.position.set(-110 + i * 34, 42 + (i % 3) * 7, -95 + (i % 2) * 20);
      this.clouds.push(c);
      this.scene.add(c);
    }
  }
  private buildGround() {
    const S = 2048,
      W = 120;
    const px = (v: number) => ((v + W / 2) / W) * S;
    const tex = canvasTexture(S, S, (g) => {
      g.fillStyle = "#3f7158";
      g.fillRect(0, 0, S, S);
      for (let i = 0; i < 14000; i++) {
        g.fillStyle =
          Math.random() > 0.5 ? "rgba(90,140,105,.18)" : "rgba(25,55,45,.18)";
        g.fillRect(
          Math.random() * S,
          Math.random() * S,
          3 + Math.random() * 5,
          3 + Math.random() * 5,
        );
      }
      // Stone plaza around the pagoda.
      g.fillStyle = "#b09670";
      g.beginPath();
      g.arc(px(PAGODA.x), px(PAGODA.z), (10.5 / W) * S, 0, Math.PI * 2);
      g.fill();
      // Winding path from the garden entrance to the pagoda.
      g.strokeStyle = "#8f7656";
      g.lineCap = "round";
      g.lineWidth = (3.4 / W) * S;
      g.beginPath();
      g.moveTo(px(2), px(30));
      g.bezierCurveTo(px(-4), px(18), px(5), px(6), px(0), px(-6));
      g.stroke();
      g.strokeStyle = "#b8986c";
      g.lineWidth = (3 / W) * S;
      g.beginPath();
      g.moveTo(px(2), px(30));
      g.bezierCurveTo(px(-4), px(18), px(5), px(6), px(0), px(-6));
      g.stroke();
      // Packed earth in front of the shop and around the table.
      g.fillStyle = "rgba(160,135,95,.55)";
      g.beginPath();
      g.ellipse(
        px(SHOP.x + 2),
        px(SHOP.z + 6),
        (8 / W) * S,
        (4 / W) * S,
        0,
        0,
        Math.PI * 2,
      );
      g.fill();
      g.beginPath();
      g.ellipse(
        px(TABLE.x - 2),
        px(TABLE.z + 1.5),
        (7.5 / W) * S,
        (5.5 / W) * S,
        0,
        0,
        Math.PI * 2,
      );
      g.fill();
      // Pond bank.
      g.fillStyle = "#c2b98a";
      g.beginPath();
      g.ellipse(
        px(POND.x),
        px(POND.z),
        ((POND.rx + 0.9) / W) * S,
        ((POND.rz + 0.9) / W) * S,
        0,
        0,
        Math.PI * 2,
      );
      g.fill();
    });
    tex.anisotropy = 8;
    const ground = mesh(
      new THREE.PlaneGeometry(W, W),
      std("#ffffff", { map: tex, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    const far = mesh(
      new THREE.PlaneGeometry(600, 600),
      std("#335f4c", { roughness: 1 }),
      0,
      -0.05,
      0,
    );
    far.rotation.x = -Math.PI / 2;
    this.scene.add(far);
    // Grass tufts.
    const tuft = new THREE.ConeGeometry(0.07, 0.35, 4);
    tuft.translate(0, 0.17, 0);
    const tufts = new THREE.InstancedMesh(tuft, std("#79a36f"), 420);
    const m = new THREE.Matrix4();
    let n = 0;
    while (n < 420) {
      const x = (Math.random() - 0.5) * 58,
        z = (Math.random() - 0.5) * 56;
      const pondD =
        ((x - POND.x) / (POND.rx + 1.2)) ** 2 +
        ((z - POND.z) / (POND.rz + 1.2)) ** 2;
      if (
        pondD < 1 ||
        Math.hypot(x - PAGODA.x, z - PAGODA.z) < 11 ||
        Math.abs(x - 1) < 3 ||
        (Math.abs(x - SHOP.x) < 7 && Math.abs(z - SHOP.z) < 6)
      )
        continue;
      m.compose(
        new THREE.Vector3(x, 0, z),
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, Math.random() * 3, (Math.random() - 0.5) * 0.4),
        ),
        new THREE.Vector3(1, 0.6 + Math.random(), 1),
      );
      tufts.setMatrixAt(n++, m);
    }
    this.scene.add(tufts);
    // Low hills on the horizon.
    const hillMat = [std("#2d3560"), std("#343c6a"), std("#283058")];
    for (const [x, z, r, i] of [
      [-70, -95, 55, 0],
      [-10, -120, 70, 1],
      [65, -100, 60, 2],
      [-110, -30, 50, 1],
      [110, -20, 55, 0],
    ]) {
      const h = mesh(
        new THREE.SphereGeometry(r, 24, 12),
        hillMat[i],
        x,
        -r * 0.62,
        z,
      );
      this.scene.add(h);
    }
  }
  private buildPagoda() {
    const g = new THREE.Group();
    g.position.set(PAGODA.x, 0, PAGODA.z);
    const cream = std("#efdcaa"),
      gold = std("#f2c255", {
        metalness: 0.2,
        roughness: 0.45,
        emissive: "#b57a1c",
        emissiveIntensity: 0.5,
      });
    [
      [7, 0.6, 0.3],
      [5.6, 0.6, 0.9],
      [4.4, 0.6, 1.5],
    ].forEach(([r, h, y], i) =>
      g.add(
        mesh(
          new THREE.CylinderGeometry(r, r + 0.15, h, 8),
          i ? gold : cream,
          0,
          y,
          0,
        ),
      ),
    );
    const bell = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          [3.6, 0],
          [3.5, 0.6],
          [3.1, 1.6],
          [2.4, 2.6],
          [1.6, 3.4],
          [1.0, 4.2],
          [0.7, 5.2],
          [0.45, 6.3],
          [0.22, 7.4],
          [0.001, 8.3],
        ].map(([x, y]) => new THREE.Vector2(x, y)),
        40,
      ),
      gold,
    );
    bell.position.y = 1.8;
    g.add(bell);
    for (const [r, y] of [
      [3.35, 2.6],
      [2.2, 4.5],
      [0.98, 6.0],
      [0.62, 7.0],
    ]) {
      const band = mesh(
        new THREE.TorusGeometry(r, 0.09, 8, 40),
        cream,
        0,
        y,
        0,
      );
      band.rotation.x = Math.PI / 2;
      g.add(band);
    }
    // The hti umbrella and the diamond orb at the top.
    for (const [r, y] of [
      [0.55, 9.6],
      [0.4, 9.95],
      [0.26, 10.25],
    ])
      g.add(mesh(new THREE.ConeGeometry(r, 0.3, 12), gold, 0, y, 0));
    g.add(
      mesh(
        new THREE.SphereGeometry(0.14, 10, 8),
        new THREE.MeshBasicMaterial({ color: "#fff6d0" }),
        0,
        10.55,
        0,
      ),
    );
    const tip = glow("#ffe6a0", 3.5, 0.7);
    tip.position.y = 10.55;
    g.add(tip);
    g.add(
      mesh(new THREE.BoxGeometry(1.1, 1.7, 0.4), std("#3b3536"), 0, 2.65, 3.22),
    );
    const arch = mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.4, 16, 1, false, 0, Math.PI),
      std("#3b3536"),
      0,
      3.5,
      3.22,
    );
    arch.rotation.set(Math.PI / 2, Math.PI / 2, 0);
    g.add(arch);
    // Small stupas on the lower terrace.
    for (const a of [-0.65, 0.65, Math.PI - 0.65, Math.PI + 0.65]) {
      const small = bell.clone();
      small.scale.setScalar(0.26);
      small.position.set(Math.sin(a) * 6.25, 0.6, Math.cos(a) * 6.25);
      g.add(small);
    }
    // Candles around the edge of the platform.
    const candleGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.3, 8),
      flameGeo = new THREE.ConeGeometry(0.055, 0.16, 8),
      wax = std("#fbefd2"),
      flameMat = new THREE.MeshBasicMaterial({ color: "#ffd773" });
    this.candleFlames = new THREE.Group();
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2,
        x = Math.sin(a) * 6.7,
        z = Math.cos(a) * 6.7;
      g.add(mesh(candleGeo, wax, x, 0.75, z));
      const flame = mesh(flameGeo, flameMat, x, 0.98, z);
      this.candleFlames.add(flame);
      const gl = glow("#ffbe5c", 1.1, 0.9);
      gl.position.set(x, 1.0, z);
      this.candleFlames.add(gl);
      flame.visible = gl.visible = false;
      this.candleBits.push([flame, gl]);
    }
    g.add(this.candleFlames);
    this.candleLight = new THREE.PointLight("#ffbf6b", 0, 22, 1.6);
    this.candleLight.position.set(0, 2.2, 7.5);
    g.add(this.candleLight);
    this.scene.add(g);
  }
  private buildShop() {
    const g = new THREE.Group();
    g.position.set(SHOP.x, 0, SHOP.z);
    const wood = std("#8d5a43"),
      light = std("#c99a6b"),
      darkWood = std("#5a3a2e"),
      roof = std("#5c3e4a"),
      inside = std("#33262b");
    const W = SHOP.hw * 2,
      D = SHOP.hd * 2;
    g.add(mesh(new THREE.BoxGeometry(W, 0.25, D), darkWood, 0, 0.125, 0));
    g.add(
      mesh(new THREE.BoxGeometry(W, 3.2, 0.2), inside, 0, 1.85, -SHOP.hd + 0.1),
    );
    for (const s of [-1, 1])
      g.add(
        mesh(
          new THREE.BoxGeometry(0.2, 3.2, D),
          wood,
          s * (SHOP.hw - 0.1),
          1.85,
          0,
        ),
      );
    g.add(
      mesh(
        new THREE.BoxGeometry(W - 0.4, 1.05, 0.55),
        wood,
        0,
        0.77,
        SHOP.hd - 0.35,
      ),
    );
    g.add(
      mesh(
        new THREE.BoxGeometry(W - 0.2, 0.1, 0.75),
        light,
        0,
        1.33,
        SHOP.hd - 0.35,
      ),
    );
    for (const x of [-SHOP.hw + 0.15, SHOP.hw - 0.15, -1.7, 1.7])
      g.add(
        mesh(
          new THREE.CylinderGeometry(0.11, 0.11, 3.5, 8),
          darkWood,
          x,
          1.75,
          SHOP.hd - 0.12,
        ),
      );
    for (const s of [-1, 1]) {
      const slab = mesh(
        new THREE.BoxGeometry(W + 1.4, 0.22, 4.8),
        roof,
        0,
        4.15,
        s * 1.85,
      );
      slab.rotation.x = s * 0.42;
      g.add(slab);
    }
    g.add(
      mesh(
        new THREE.BoxGeometry(W + 1.6, 0.25, 0.3),
        std("#e8c78f"),
        0,
        4.95,
        0,
      ),
    );
    // Shelves of paper lanterns and firework tubes inside.
    g.add(
      mesh(
        new THREE.BoxGeometry(W - 1, 0.1, 0.9),
        light,
        0,
        2.2,
        -SHOP.hd + 0.6,
      ),
    );
    for (let i = 0; i < 9; i++) {
      const c = LANTERN_COLORS[i % LANTERN_COLORS.length];
      g.add(
        mesh(
          new THREE.CylinderGeometry(0.22, 0.22, 0.38, 10),
          std(c, { emissive: c, emissiveIntensity: 0.25 }),
          -3.6 + i * 0.9,
          2.5,
          -SHOP.hd + 0.6,
        ),
      );
    }
    for (let i = 0; i < 7; i++) {
      const c = ["#d9584f", "#e8b84f", "#5d8ec7", "#a77fd0", "#e98a4f"][i % 5];
      g.add(
        mesh(
          new THREE.CylinderGeometry(0.1, 0.1, 0.55, 8),
          std(c),
          -2.6 + i * 0.85,
          1.65,
          SHOP.hd - 0.35,
        ),
      );
      g.add(
        mesh(
          new THREE.ConeGeometry(0.1, 0.18, 8),
          std("#f3e2b8"),
          -2.6 + i * 0.85,
          2.01,
          SHOP.hd - 0.35,
        ),
      );
    }
    // Lanterns hanging from the front eave.
    for (let i = 0; i < 6; i++) {
      const c = LANTERN_COLORS[i];
      const x = -SHOP.hw + 0.9 + i * ((W - 1.8) / 5);
      g.add(
        mesh(
          new THREE.CylinderGeometry(0.01, 0.01, 0.45, 4),
          darkWood,
          x,
          3.35,
          SHOP.hd + 0.35,
        ),
      );
      const l = mesh(
        new THREE.CylinderGeometry(0.28, 0.28, 0.48, 12),
        std(c, { emissive: c, emissiveIntensity: 0.12 }),
        x,
        2.9,
        SHOP.hd + 0.35,
      );
      this.shopLanterns.push(l);
      g.add(l);
    }
    const shopLight = new THREE.PointLight("#ffb46e", 0, 16, 1.6);
    shopLight.position.set(0, 2.6, SHOP.hd + 1.5);
    g.add(shopLight);
    this.warmLights.push(shopLight);
    this.scene.add(g);
  }
  private buildTable() {
    const g = new THREE.Group();
    g.position.set(TABLE.x, 0, TABLE.z);
    const wood = std("#b98657"),
      dark = std("#7d5638");
    g.add(
      mesh(
        new THREE.CylinderGeometry(TABLE.r - 0.2, TABLE.r - 0.2, 0.12, 32),
        wood,
        0,
        0.78,
        0,
      ),
    );
    const rim = mesh(
      new THREE.TorusGeometry(TABLE.r - 0.2, 0.06, 6, 40),
      dark,
      0,
      0.78,
      0,
    );
    rim.rotation.x = Math.PI / 2;
    g.add(rim);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.78;
      g.add(
        mesh(
          new THREE.CylinderGeometry(0.08, 0.1, 0.72, 8),
          dark,
          Math.sin(a) * 1.4,
          0.36,
          Math.cos(a) * 1.4,
        ),
      );
    }
    const runner = mesh(
      new THREE.BoxGeometry(3.6, 0.02, 0.9),
      std("#d98a8a"),
      0,
      0.85,
      0,
    );
    runner.rotation.y = 0.4;
    g.add(runner);
    g.add(
      mesh(
        new THREE.CylinderGeometry(0.62, 0.62, 0.04, 20),
        std("#74977d"),
        0,
        0.88,
        0,
      ),
    );
    const ball = new THREE.SphereGeometry(0.13, 12, 10),
      rice = std("#fff3dc"),
      sesame = std("#cfaa87");
    for (let i = 0; i < 7; i++) {
      const a = (i / 6) * Math.PI * 2,
        r = i === 6 ? 0 : 0.34;
      g.add(mesh(ball, rice, Math.sin(a) * r, 1.0, Math.cos(a) * r));
      g.add(
        mesh(
          new THREE.SphereGeometry(0.02, 4, 4),
          sesame,
          Math.sin(a) * r,
          1.12,
          Math.cos(a) * r,
        ),
      );
    }
    for (const [x, z] of [
      [1.1, 0.5],
      [-0.9, -0.8],
      [0.3, -1.2],
    ]) {
      g.add(
        mesh(
          new THREE.CylinderGeometry(0.12, 0.09, 0.14, 12),
          std("#f6ead2"),
          x,
          0.92,
          z,
        ),
      );
      g.add(
        mesh(
          new THREE.CylinderGeometry(0.1, 0.1, 0.01, 12),
          std("#8a5a33"),
          x,
          0.99,
          z,
        ),
      );
    }
    const tableLight = new THREE.PointLight("#ffc27a", 0, 12, 1.6);
    tableLight.position.set(0, 3, 0);
    g.add(tableLight);
    this.warmLights.push(tableLight);
    this.scene.add(g);
  }
  private buildPond() {
    this.water = mesh(
      new THREE.CircleGeometry(1, 64),
      std("#27466f", {
        metalness: 0.45,
        roughness: 0.06,
        emissive: "#111c3c",
        emissiveIntensity: 0.7,
      }),
      POND.x,
      0.04,
      POND.z,
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.scale.set(POND.rx, POND.rz, 1);
    this.scene.add(this.water);
    const moonPath = mesh(
      new THREE.CircleGeometry(1, 32),
      new THREE.MeshBasicMaterial({
        map: glowTexture(),
        color: "#ffe9b0",
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      POND.x + 2.5,
      0.06,
      POND.z - 2.5,
    );
    moonPath.rotation.x = -Math.PI / 2;
    moonPath.scale.set(1.6, 3.5, 1);
    this.scene.add(moonPath);
    const pad = std("#5f8f68");
    for (let i = 0; i < 7; i++) {
      const a = i * 1.7,
        r = 0.55 + (i % 3) * 0.15;
      const lily = mesh(
        new THREE.CylinderGeometry(
          0.45,
          0.45,
          0.03,
          16,
          1,
          false,
          0.4,
          Math.PI * 1.85,
        ),
        pad,
        POND.x + Math.cos(a) * POND.rx * r,
        0.06,
        POND.z + Math.sin(a) * POND.rz * r,
      );
      this.scene.add(lily);
    }
    const reed = new THREE.ConeGeometry(0.05, 1.1, 4);
    reed.translate(0, 0.55, 0);
    const reedMat = std("#5d8a55");
    for (let i = 0; i < 40; i++) {
      const a = 0.4 + (i / 40) * 2.2 + (i % 2) * 3.4,
        r = 1.02 + Math.random() * 0.06;
      const m = mesh(
        reed,
        reedMat,
        POND.x + Math.cos(a) * POND.rx * r,
        0,
        POND.z + Math.sin(a) * POND.rz * r,
      );
      m.rotation.z = (Math.random() - 0.5) * 0.3;
      m.scale.y = 0.6 + Math.random() * 0.8;
      this.scene.add(m);
    }
    const jetty = new THREE.Group();
    const plank = std("#8c6446");
    for (let i = 0; i < 6; i++)
      jetty.add(
        mesh(new THREE.BoxGeometry(0.42, 0.1, 1.4), plank, i * 0.48, 0.18, 0),
      );
    for (const x of [0, 2.4])
      for (const z of [-0.6, 0.6])
        jetty.add(
          mesh(
            new THREE.CylinderGeometry(0.07, 0.07, 0.5, 6),
            std("#5a3a2e"),
            x,
            0.1,
            z,
          ),
        );
    jetty.position.set(POND.x - 6.5, 0, POND.z + 4.6);
    jetty.rotation.y = 0.55;
    this.scene.add(jetty);
  }
  private buildStringLanterns() {
    const wood = std("#6b4c3b");
    const tops: THREE.Vector3[] = POSTS.map(
      (p) => new THREE.Vector3(p.x, 5.4, p.z),
    );
    for (const p of POSTS) {
      this.scene.add(
        mesh(
          new THREE.CylinderGeometry(0.13, 0.17, 5.5, 8),
          wood,
          p.x,
          2.75,
          p.z,
        ),
      );
    }
    const spire = new THREE.Vector3(PAGODA.x, 9.2, PAGODA.z);
    const strings: [THREE.Vector3, THREE.Vector3][] = [
      [tops[0], tops[1]],
      [tops[1], tops[2]],
      [tops[2], tops[3]],
      ...tops.map((t) => [spire, t] as [THREE.Vector3, THREE.Vector3]),
    ];
    const points: THREE.Vector3[] = [];
    const lineMat = new THREE.LineBasicMaterial({ color: "#1d2834" });
    for (const [a, b] of strings) {
      const len = a.distanceTo(b),
        sag = len * 0.08;
      const curve: THREE.Vector3[] = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        curve.push(
          new THREE.Vector3()
            .lerpVectors(a, b, t)
            .add(new THREE.Vector3(0, -Math.sin(Math.PI * t) * sag, 0)),
        );
      }
      this.scene.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(curve),
          lineMat,
        ),
      );
      const count = Math.floor(len / 1.9);
      for (let i = 1; i < count; i++) {
        const t = i / count;
        points.push(
          new THREE.Vector3()
            .lerpVectors(a, b, t)
            .add(new THREE.Vector3(0, -Math.sin(Math.PI * t) * sag - 0.5, 0)),
        );
      }
    }
    const geo = new THREE.SphereGeometry(0.32, 14, 10);
    geo.scale(1, 1.2, 1);
    const capGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10);
    const glowPos = new Float32Array(points.length * 3),
      glowCol = new Float32Array(points.length * 3);
    // One instanced mesh per colour, so each lantern can glow in its own colour.
    LANTERN_COLORS.forEach((c, ci) => {
      const mine = points.filter((_, i) => i % LANTERN_COLORS.length === ci);
      const inst = new THREE.InstancedMesh(
        geo,
        std(c, { emissive: c, emissiveIntensity: 0.12, roughness: 0.6 }),
        mine.length,
      );
      const caps = new THREE.InstancedMesh(
        capGeo,
        std("#7a5530"),
        mine.length * 2,
      );
      const m = new THREE.Matrix4();
      mine.forEach((p, i) => {
        inst.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z));
        caps.setMatrixAt(i * 2, m.makeTranslation(p.x, p.y + 0.36, p.z));
        caps.setMatrixAt(i * 2 + 1, m.makeTranslation(p.x, p.y - 0.36, p.z));
      });
      this.lanternBodies.push(inst);
      this.scene.add(inst, caps);
    });
    const col = new THREE.Color();
    points.forEach((p, i) => {
      glowPos.set([p.x, p.y, p.z], i * 3);
      col
        .set(LANTERN_COLORS[i % LANTERN_COLORS.length])
        .lerp(new THREE.Color("#ffe2a0"), 0.2);
      glowCol.set([col.r, col.g, col.b], i * 3);
    });
    const gg = new THREE.BufferGeometry();
    gg.setAttribute("position", new THREE.BufferAttribute(glowPos, 3));
    gg.setAttribute("color", new THREE.BufferAttribute(glowCol, 3));
    this.lanternGlow = new THREE.Points(
      gg,
      new THREE.PointsMaterial({
        size: 2.6,
        map: glowTexture(),
        vertexColors: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(this.lanternGlow);
    for (const [x, z] of [
      [-12, -3],
      [12, -3],
    ]) {
      const l = new THREE.PointLight("#ffbe7a", 0, 20, 1.5);
      l.position.set(x, 4.2, z);
      this.warmLights.push(l);
      this.scene.add(l);
    }
  }
  /** Warm fairy light at a world position (drawn later as one twinkling point cloud). */
  private fairy(v: THREE.Vector3, tint = 0) {
    const c = new THREE.Color(
      tint === 1 ? "#fff3d6" : tint === 2 ? "#ffc18a" : "#ffd98c",
    );
    this.fairyPos.push(v.x, v.y, v.z);
    this.fairyCol.push(c.r, c.g, c.b);
    this.fairySeed.push(Math.random() * 100);
  }
  /** A round, leafy garden tree. `lights` wraps the trunk and drapes the canopy with fairy-light wires. */
  private lushTree(
    x: number,
    z: number,
    s: number,
    i: number,
    lights: "full" | "light",
    lanterns = 0,
  ) {
    const g = new THREE.Group();
    const bark = std("#4a3730");
    const leafColors = ["#3a6c52", "#467a58", "#355f4c", "#4f8460", "#3d6c5c"];
    // Fully lit trees glow a little warm from the lights inside them.
    const warm =
      lights === "full"
        ? { emissive: "#5a4a1c", emissiveIntensity: 0.32 }
        : { emissive: "#1a2240", emissiveIntensity: 0.2 };
    g.add(mesh(new THREE.CylinderGeometry(0.22, 0.4, 3.4, 8), bark, 0, 1.7, 0));
    for (const [rx, rz, len] of [
      [0.7, 0.3, 1.6],
      [-0.6, -0.4, 1.4],
    ]) {
      const b = mesh(
        new THREE.CylinderGeometry(0.07, 0.13, len, 6),
        bark,
        rx * 0.6,
        2.9,
        rz * 0.6,
      );
      b.rotation.set(rz, 0, -rx);
      g.add(b);
    }
    const blobs: [number, number, number, number][] = [
      [0, 4.4, 0, 2.1],
      [1.35, 3.85, 0.35, 1.55],
      [-1.25, 3.95, -0.3, 1.6],
      [0.3, 5.4, -0.2, 1.35],
      [-0.4, 3.75, 1.25, 1.35],
      [0.55, 3.75, -1.3, 1.3],
    ];
    blobs.forEach(([bx, by, bz, r], k) => {
      const leaf = mesh(
        new THREE.IcosahedronGeometry(r, 1),
        std(leafColors[(i + k) % leafColors.length], {
          flatShading: true,
          roughness: 0.95,
          ...warm,
        }),
        bx,
        by,
        bz,
      );
      leaf.scale.y = 0.85;
      g.add(leaf);
    });
    g.position.set(x, 0, z);
    g.scale.setScalar(s);
    g.rotation.y = i * 1.7;
    this.scene.add(g);
    g.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    const put = (lx: number, ly: number, lz: number, tint = 0) =>
      this.fairy(v.set(lx, ly, lz).applyMatrix4(g.matrixWorld), tint);
    // Wire wound around the trunk.
    const turns = lights === "full" ? 120 : 60;
    for (let k = 0; k < turns; k++) {
      const a = k * (lights === "full" ? 0.52 : 0.9),
        y = 0.35 + (k / turns) * 2.9,
        r = 0.42 - y * 0.06;
      put(Math.cos(a) * r, y, Math.sin(a) * r, k % 9 === 0 ? 1 : 0);
    }
    // Wires draped over the canopy along random arcs.
    const strands = lights === "full" ? 3 : 1;
    blobs.forEach(([bx, by, bz, r], k) => {
      if (lights === "light" && k > 2) return;
      for (let n = 0; n < strands; n++) {
        const axis = new THREE.Vector3(
          Math.random() - 0.5,
          Math.random() * 0.6,
          Math.random() - 0.5,
        ).normalize();
        const start = new THREE.Vector3(1, 0, 0).cross(axis).normalize();
        const steps = Math.round(r * 9);
        for (let q = 0; q < steps; q++) {
          const p = start
            .clone()
            .applyAxisAngle(axis, (q / steps) * Math.PI * 1.6);
          if (p.y < -0.35) continue;
          put(
            bx + p.x * r * 1.04,
            by + p.y * r * 0.88,
            bz + p.z * r * 1.04,
            q % 7 === 0 ? 1 : 0,
          );
        }
      }
    });
    // Strands hanging down from the canopy edge, like a light curtain.
    const drips = lights === "full" ? 9 : 3;
    for (let d = 0; d < drips; d++) {
      const a = (d / drips) * Math.PI * 2 + i,
        r = 1.9 + (d % 3) * 0.3,
        len = 1.2 + ((d * 7) % 5) * 0.25;
      for (let y = 0; y < len; y += 0.17)
        put(Math.cos(a) * r, 3.3 - y, Math.sin(a) * r, d % 4 === 0 ? 2 : 0);
    }
    // Paper lanterns hanging from the lower branches.
    for (let n = 0; n < lanterns; n++) {
      const a = (n / Math.max(1, lanterns)) * Math.PI * 2 + 0.6,
        r = 1.5;
      const top = new THREE.Vector3(
        Math.cos(a) * r,
        3.2,
        Math.sin(a) * r,
      ).applyMatrix4(g.matrixWorld);
      const drop = 0.7 + (n % 2) * 0.5;
      const bottom = top.clone().setY(top.y - drop);
      this.scene.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([top, bottom]),
          new THREE.LineBasicMaterial({ color: "#2a2230" }),
        ),
      );
      const lan = new THREE.Group();
      lan.add(
        mesh(
          new THREE.CylinderGeometry(0.24, 0.24, 0.5, 4),
          std("#ffd38a", { emissive: "#ffb85c", emissiveIntensity: 1.5 }),
          0,
          0,
          0,
        ),
      );
      lan.add(
        mesh(
          new THREE.CylinderGeometry(0.29, 0.29, 0.06, 4),
          std("#3a2b26"),
          0,
          0.28,
          0,
        ),
      );
      lan.add(
        mesh(
          new THREE.CylinderGeometry(0.29, 0.29, 0.06, 4),
          std("#3a2b26"),
          0,
          -0.28,
          0,
        ),
      );
      const halo = glow("#ffc46b", 2.6, 0.9);
      lan.add(halo);
      lan.position.copy(bottom).setY(bottom.y - 0.2);
      lan.rotation.y = Math.PI / 4;
      this.scene.add(lan);
    }
  }
  private buildTrees() {
    let i = 0;
    // Perimeter woods: lighter wiring so the edges glow without too many lights.
    for (let x = -34; x <= 34; x += 6.5)
      this.lushTree(
        x + (i % 2) * 2,
        -31 - (i % 3) * 3,
        1.15 + (i % 3) * 0.2,
        i++,
        "light",
      );
    for (let z = -24; z <= 26; z += 7) {
      this.lushTree(-32 - (i % 2) * 2, z, 1.05 + (i % 3) * 0.2, i++, "light");
      this.lushTree(
        32 + (i % 2) * 2,
        z + 3,
        1.05 + (i % 3) * 0.2,
        i++,
        "light",
      );
    }
    for (let x = -28; x <= 28; x += 9)
      this.lushTree(x + 3, 31 + (i % 2) * 3, 1, i++, "light");
    // Feature trees inside the garden: fully wrapped in fairy lights with hanging lanterns.
    GARDEN_TREES.forEach((t, k) =>
      this.lushTree(t.x, t.z, t.s, 50 + k, "full", k % 3 === 2 ? 3 : 2),
    );
  }
  /** Vine-covered arch with lights over the entrance path. */
  private buildArch() {
    const g = new THREE.Group();
    g.position.set(ARCH.x, 0, ARCH.z);
    const wood = std("#5a4034");
    for (const sx of [-1, 1])
      g.add(
        mesh(
          new THREE.CylinderGeometry(0.13, 0.16, 3.3, 8),
          wood,
          sx * ARCH.half,
          1.65,
          0,
        ),
      );
    const arc = mesh(
      new THREE.TorusGeometry(ARCH.half, 0.12, 8, 32, Math.PI),
      wood,
      0,
      3.3,
      0,
    );
    g.add(arc);
    const leaf = std("#4a8059", {
      flatShading: true,
      emissive: "#3a3416",
      emissiveIntensity: 0.3,
    });
    const blossom = ["#f3a6c8", "#f7f0ff", "#c99cf2", "#e7678f"].map((c) =>
      std(c, { emissive: c, emissiveIntensity: 0.12 }),
    );
    for (let k = 0; k <= 26; k++) {
      const a = (k / 26) * Math.PI;
      const x = Math.cos(a) * ARCH.half,
        y = 3.3 + Math.sin(a) * ARCH.half;
      const l = mesh(
        new THREE.IcosahedronGeometry(0.24 + (k % 3) * 0.06, 1),
        leaf,
        x,
        y,
        (k % 2) * 0.12 - 0.06,
      );
      g.add(l);
      if (k % 2 === 0)
        g.add(
          mesh(
            new THREE.IcosahedronGeometry(0.1, 0),
            blossom[k % 4],
            x + 0.12,
            y - 0.18,
            0.22,
          ),
        );
    }
    for (const sx of [-1, 1])
      for (let y = 0.4; y < 3.3; y += 0.45) {
        g.add(
          mesh(
            new THREE.IcosahedronGeometry(0.2, 1),
            leaf,
            sx * ARCH.half + 0.1,
            y,
            0.1 * sx,
          ),
        );
        g.add(
          mesh(
            new THREE.IcosahedronGeometry(0.09, 0),
            blossom[Math.round(y * 3) % 4],
            sx * ARCH.half - 0.12,
            y + 0.15,
            0.2,
          ),
        );
      }
    this.scene.add(g);
    g.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    for (let k = 0; k <= 160; k++) {
      const a = (k / 160) * Math.PI;
      const r = ARCH.half + 0.2 + Math.sin(k * 1.7) * 0.1;
      this.fairy(
        v
          .set(Math.cos(a) * r, 3.3 + Math.sin(a) * r, Math.sin(k * 2.3) * 0.25)
          .applyMatrix4(g.matrixWorld),
        k % 6 === 0 ? 1 : 0,
      );
    }
    for (const sx of [-1, 1])
      for (let k = 0; k < 40; k++) {
        const a = k * 0.8;
        this.fairy(
          v
            .set(
              sx * ARCH.half + Math.cos(a) * 0.3,
              0.3 + k * 0.075,
              Math.sin(a) * 0.3,
            )
            .applyMatrix4(g.matrixWorld),
        );
      }
  }
  /** Scalloped fairy lights along the lantern shop's eaves, like the gazebo in the reference. */
  private buildShopLights() {
    const v = new THREE.Vector3();
    const front = SHOP.z + SHOP.hd + 0.9,
      left = SHOP.x - SHOP.hw - 0.6,
      right = SHOP.x + SHOP.hw + 0.6;
    const span = 1.8;
    for (let x = left; x <= right; x += 0.12) {
      const f = ((x - left) % span) / span;
      this.fairy(
        v.set(x, 3.45 - Math.sin(f * Math.PI) * 0.35, front),
        Math.round(x * 10) % 8 === 0 ? 1 : 0,
      );
    }
    for (const sx of [left, right])
      for (let z = SHOP.z - SHOP.hd - 0.6; z <= front; z += 0.14) {
        const f = ((z - (SHOP.z - SHOP.hd)) % span) / span;
        this.fairy(v.set(sx, 3.45 - Math.sin(f * Math.PI) * 0.3, z));
      }
    // Vines trailing over the roof edge.
    const leaf = std("#4d8458", {
      flatShading: true,
      emissive: "#3a3416",
      emissiveIntensity: 0.3,
    });
    for (let x = left; x <= right; x += 0.6) {
      this.scene.add(
        mesh(
          new THREE.IcosahedronGeometry(0.2 + Math.abs((x * 7) % 3) * 0.04, 1),
          leaf,
          x,
          3.72,
          front - 0.3,
        ),
      );
      if (Math.round(x * 3) % 3 === 0)
        this.scene.add(
          mesh(
            new THREE.IcosahedronGeometry(0.13, 1),
            leaf,
            x + 0.1,
            3.35,
            front - 0.2,
          ),
        );
    }
  }
  /** Stepping stones and drifting petals on the pond. */
  private buildPondDecor() {
    const stone = std("#857c78", { roughness: 0.9 });
    for (const [x, z, r] of [
      [20.5, 9, 0.55],
      [19.3, 10.5, 0.6],
      [18.5, 12.1, 0.5],
      [18.9, 13.8, 0.58],
      [20.1, 15.1, 0.52],
    ]) {
      const st = mesh(
        new THREE.CylinderGeometry(r, r * 1.12, 0.22, 12),
        stone,
        x,
        0.07,
        z,
      );
      st.scale.z = 0.85;
      st.rotation.y = x;
      this.scene.add(st);
    }
    const petalGeo = new THREE.CircleGeometry(0.075, 6);
    petalGeo.rotateX(-Math.PI / 2);
    const petals = new THREE.InstancedMesh(
      petalGeo,
      new THREE.MeshLambertMaterial({ emissive: "#3a1a2c" }),
      520,
    );
    const m = new THREE.Matrix4(),
      c = new THREE.Color();
    const pinks = ["#f29bc4", "#ef7fae", "#f7c6dc", "#e86f9a"];
    for (let k = 0; k < 520; k++) {
      const a = Math.random() * Math.PI * 2,
        r = Math.sqrt(Math.random()) * 0.94;
      m.compose(
        new THREE.Vector3(
          POND.x + Math.cos(a) * POND.rx * r,
          0.055,
          POND.z + Math.sin(a) * POND.rz * r,
        ),
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, Math.random() * 3, 0),
        ),
        new THREE.Vector3(1, 1, 0.6 + Math.random() * 0.6),
      );
      petals.setMatrixAt(k, m);
      petals.setColorAt(k, c.set(pinks[k % 4]));
    }
    this.scene.add(petals);
    // Warm reflections of the nearby tree lights on the water.
    for (const [x, z] of [
      [21.2, 16.6],
      [9, 7.6],
    ]) {
      const r = mesh(
        new THREE.CircleGeometry(1, 24),
        new THREE.MeshBasicMaterial({
          map: glowTexture(),
          color: "#ffc77a",
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
        x,
        0.07,
        z,
      );
      r.rotation.x = -Math.PI / 2;
      r.scale.set(0.9, 2.6, 1);
      this.scene.add(r);
    }
  }
  /** Flower beds: bushes topped with purple, pink, red, blue and white blooms. */
  private buildFlowers() {
    const path: Position[] = [];
    for (let k = 0; k <= 60; k++) {
      const t = k / 60,
        u = 1 - t;
      path.push({
        x: u ** 3 * 2 + 3 * u * u * t * -4 + 3 * u * t * t * 5 + t ** 3 * 0,
        z: u ** 3 * 30 + 3 * u * u * t * 18 + 3 * u * t * t * 6 + t ** 3 * -6,
      });
    }
    const nearPath = (x: number, z: number) =>
      path.some((p) => Math.hypot(p.x - x, p.z - z) < 2.3);
    const blocked = (x: number, z: number) =>
      nearPath(x, z) ||
      Object.values(SPOTS).some((sp) => Math.hypot(sp.x - x, sp.z - z) < 2.6) ||
      ((x - POND.x) / (POND.rx + 0.6)) ** 2 +
        ((z - POND.z) / (POND.rz + 0.6)) ** 2 <
        1 ||
      (Math.abs(x - SHOP.x) < SHOP.hw + 1.4 &&
        Math.abs(z - SHOP.z) < SHOP.hd + 1.4) ||
      Math.hypot(x - TABLE.x, z - TABLE.z) < TABLE.r + 3 ||
      Math.hypot(x - PAGODA.x, z - PAGODA.z) < PAGODA.r + 0.6;
    const centres: [number, number, number][] = [];
    const add = (x: number, z: number, hue: number) => {
      if (!blocked(x, z)) centres.push([x, z, hue]);
    };
    // Around the pond bank.
    for (let a = 0; a < Math.PI * 2; a += 0.32)
      add(
        POND.x + Math.cos(a) * (POND.rx + 1.4),
        POND.z + Math.sin(a) * (POND.rz + 1.4),
        Math.floor(a * 3),
      );
    // Around the pagoda terrace, leaving the front open.
    for (let a = 0; a < Math.PI * 2; a += 0.3)
      if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) - Math.PI / 2) > 0.55)
        add(
          PAGODA.x + Math.cos(a) * 9.6,
          PAGODA.z + Math.sin(a) * 9.6,
          Math.floor(a * 5),
        );
    // Along both sides of the path.
    path.forEach((p, k) => {
      if (k % 3) return;
      add(p.x - 3.1, p.z, k);
      add(p.x + 3.1, p.z, k + 3);
    });
    // At the feet of the lit trees and the arch.
    GARDEN_TREES.forEach((t, k) => {
      for (let a = 0; a < Math.PI * 2; a += 1.1)
        add(t.x + Math.cos(a) * 2, t.z + Math.sin(a) * 2, k + Math.round(a));
    });
    for (const sx of [-1, 1])
      add(ARCH.x + sx * (ARCH.half + 1.1), ARCH.z, 2 + sx);
    // Garden edges.
    for (let x = -26; x <= 26; x += 2.6) {
      add(x, -26.5, Math.round(x));
      add(x, 24.6, Math.round(x) + 2);
    }
    for (let z = -24; z <= 22; z += 2.6) {
      add(-26.6, z, Math.round(z));
      add(26.6, z, Math.round(z) + 1);
    }
    const palettes = [
      ["#8e6bd8", "#b9a2ff", "#f4eefc"],
      ["#f18ac0", "#ffc2dd", "#f4eefc"],
      ["#d14ba0", "#f18ac0", "#b9a2ff"],
      ["#e5486a", "#f59ab0", "#ffe3ea"],
      ["#6aa0ff", "#a8c6ff", "#f4eefc"],
      ["#c77dff", "#8e6bd8", "#f18ac0"],
    ];
    const per = 22;
    const flowers = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.065, 0),
      new THREE.MeshLambertMaterial({ emissive: "#2c1a3c" }),
      centres.length * per,
    );
    const bushes = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.5, 1),
      std("#3b6c4e", {
        flatShading: true,
        emissive: "#14243a",
        emissiveIntensity: 0.25,
      }),
      centres.length,
    );
    const m = new THREE.Matrix4(),
      c = new THREE.Color(),
      q = new THREE.Quaternion();
    let n = 0;
    centres.forEach(([x, z, hue], k) => {
      const bs = 0.6 + ((k * 13) % 7) * 0.07;
      m.compose(
        new THREE.Vector3(x, 0.18 * bs, z),
        q,
        new THREE.Vector3(bs * 1.25, bs * 0.6, bs * 1.15),
      );
      bushes.setMatrixAt(k, m);
      const pal = palettes[Math.abs(hue) % palettes.length];
      for (let f = 0; f < per; f++) {
        const a = Math.random() * Math.PI * 2,
          r = Math.sqrt(Math.random()) * 0.75 * bs;
        const sc = 0.7 + Math.random() * 0.7;
        m.compose(
          new THREE.Vector3(
            x + Math.cos(a) * r,
            0.24 * bs + Math.random() * 0.3,
            z + Math.sin(a) * r * 0.9,
          ),
          q,
          new THREE.Vector3(sc, sc, sc),
        );
        flowers.setMatrixAt(n, m);
        flowers.setColorAt(n++, c.set(pal[f % 3 === 0 ? 2 : f % 2]));
      }
    });
    flowers.count = n;
    this.scene.add(bushes, flowers);
  }
  /** Fireflies drifting low over the garden. */
  private buildFireflies() {
    const n = 170,
      pos = new Float32Array(n * 3),
      seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos.set(
        [
          (Math.random() - 0.5) * 54,
          0.4 + Math.random() * 2.6,
          -26 + Math.random() * 50,
        ],
        i * 3,
      );
      seed[i] = Math.random() * 100;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
    this.fireflyMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, px: { value: 400 } },
      vertexShader:
        "attribute float seed; uniform float time; uniform float px; varying float a; void main(){ vec3 p = position + vec3(sin(time*0.31+seed*7.0)*1.4, sin(time*0.53+seed*3.0)*0.45, cos(time*0.27+seed*5.0)*1.4); a = smoothstep(0.1, 1.0, sin(time*(0.9+fract(seed*3.1)*1.3)+seed*9.0)); vec4 mv = modelViewMatrix*vec4(p,1.0); gl_PointSize = 0.22*px/max(-mv.z,0.5); gl_Position = projectionMatrix*mv; }",
      fragmentShader:
        "varying float a; void main(){ float d = length(gl_PointCoord-0.5); float core = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vec3(0.88,1.0,0.55)*1.4, a*core*core); }",
    });
    const pts = new THREE.Points(g, this.fireflyMat);
    pts.frustumCulled = false;
    this.scene.add(pts);
  }
  /** Draw every fairy light gathered above as a single twinkling point cloud. */
  private buildFairyLights() {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(this.fairyPos), 3),
    );
    g.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(this.fairyCol), 3),
    );
    g.setAttribute(
      "seed",
      new THREE.BufferAttribute(new Float32Array(this.fairySeed), 1),
    );
    this.fairyMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, px: { value: 400 } },
      vertexShader:
        "attribute float seed; attribute vec3 color; uniform float time; uniform float px; varying vec3 vc; varying float a; void main(){ vc = color; a = 0.7 + 0.3*sin(time*(0.8+fract(seed)*2.2)+seed*12.0); vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = clamp(0.34*px/max(-mv.z,0.5), 1.5, 40.0); gl_Position = projectionMatrix*mv; }",
      fragmentShader:
        "varying vec3 vc; varying float a; void main(){ float d = length(gl_PointCoord-0.5); float core = smoothstep(0.18, 0.0, d); float halo = smoothstep(0.5, 0.0, d)*0.45; gl_FragColor = vec4(vc*1.3 + core*0.4, a*(core + halo)); }",
    });
    const pts = new THREE.Points(g, this.fairyMat);
    pts.frustumCulled = false;
    this.scene.add(pts);
  }
  private buildSpots() {
    for (const [id, p] of Object.entries(SPOTS)) {
      const ring = mesh(
        new THREE.RingGeometry(0.85, 1.05, 40),
        new THREE.MeshBasicMaterial({
          color: "#ffe3a0",
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
        p.x,
        0.07,
        p.z,
      );
      ring.rotation.x = -Math.PI / 2;
      this.spotRings[id] = ring;
      this.scene.add(ring);
    }
  }
  private buildPeople() {
    [
      ["one", "#e6aa59", 1, false],
      ["two", "#8da8c2", 2, true],
      ["three", "#b6a0bd", 3, true],
    ].forEach(([key, color, style, eating]) => {
      const f = FRIENDS[key as "one"];
      const rig = makePerson(color as string, style as number);
      rig.root.position.set(f.x, 0, f.z);
      rig.root.rotation.y = f.heading;
      this.scene.add(rig.root);
      this.friends.push({
        rig,
        key: "friend-" + key,
        heading: f.heading,
        eating: eating as boolean,
      });
    });
    const routes: Position[][] = [
      [
        { x: 2, z: 4 },
        { x: 5.2, z: 6 },
        { x: 5.2, z: 21 },
        { x: -3, z: 22 },
      ],
      [
        { x: -24, z: 9 },
        { x: -24, z: 22 },
        { x: -21.5, z: 23 },
        { x: -21.5, z: 10 },
      ],
      [
        { x: 11, z: -12 },
        { x: 23, z: -12 },
        { x: 23, z: -3 },
        { x: 11, z: -3 },
      ],
    ];
    const dress = ["#e99ab1", "#91b8c6", "#c5b0df"],
      paper = ["#f3bb78", "#df9faf", "#a7c9aa"];
    routes.forEach((route, i) => {
      const rig = makePerson(dress[i], i * 2, 0.7);
      const toy = makeToy(i, paper[i]);
      const string = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(),
          new THREE.Vector3(),
        ]),
        new THREE.LineBasicMaterial({ color: "#ecd6a2" }),
      );
      this.scene.add(rig.root, toy, string);
      this.children.push({
        rig,
        toy,
        string,
        route,
        seg: i % route.length,
        along: 1.5 * i,
        speed: 1.05 + i * 0.1,
        pos: { ...route[0] },
        dir: 0,
      });
    });
  }
  private buildFireworkLights() {
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight("#ffffff", 0, 140, 1.2);
      this.fireLights.push(l);
      this.scene.add(l);
    }
  }

  /* ----- interaction ----- */
  private bindPointer(canvas: HTMLCanvasElement) {
    canvas.addEventListener("pointerdown", (e) => {
      if (this.cine && !this.cine.skipped && this.fireworkStart >= 0) {
        this.skipCinematic();
        return;
      }
      this.drag = { x: e.clientX, y: e.clientY, moved: 0 };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (this.drag) {
        const dx = e.clientX - this.drag.x,
          dy = e.clientY - this.drag.y;
        this.drag.moved += Math.abs(dx) + Math.abs(dy);
        this.drag.x = e.clientX;
        this.drag.y = e.clientY;
        this.orbitYaw -= dx * 0.008;
        this.orbitPitch = Math.min(
          1,
          Math.max(-0.6, this.orbitPitch + dy * 0.006),
        );
        canvas.style.cursor = "grabbing";
      } else canvas.style.cursor = this.pickWish(e) ? "pointer" : "grab";
    });
    const end = (e: PointerEvent) => {
      if (this.drag && this.drag.moved < 8) {
        const id = this.pickWish(e);
        if (id) this.events.onWishClick(id);
        else if (this.canMove) {
          const hit = this.pickGround(e);
          if (hit) {
            this.walkTo(hit);
            this.tapMarker.position.set(hit.x, 0.08, hit.z);
            this.tapAt = this.time;
          }
        }
      }
      this.drag = null;
      canvas.style.cursor = "grab";
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", () => (this.drag = null));
  }
  private pickGround(e: PointerEvent): Position | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
    );
    const hit = new THREE.Vector3();
    if (
      !this.raycaster.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
        hit,
      )
    )
      return null;
    if (hit.distanceTo(this.camera.position) > 70) return null;
    return { x: hit.x, z: hit.z };
  }
  private pickWish(e: PointerEvent): string | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
    );
    const hit = this.raycaster
      .intersectObjects(this.wishTargets, true)
      .find((h) => !(h.object instanceof THREE.Sprite));
    return hit ? (hit.object.userData.wishId as string) : null;
  }

  /* ----- per-frame ----- */
  private resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1.2 ? 62 : 50;
    this.camera.updateProjectionMatrix();
    // Point sizes are given in world units; convert with the current viewport height.
    const px =
      (h * this.renderer.getPixelRatio()) /
      (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    if (this.fairyMat) this.fairyMat.uniforms.px.value = px;
    if (this.fireflyMat) this.fireflyMat.uniforms.px.value = px;
  }
  private desiredCamera(out: THREE.Vector3, target: THREE.Vector3) {
    const yaw = this.heading + this.orbitYaw;
    const narrow = this.camera.aspect < 1.2;
    let dist = (narrow ? 10.5 : 9) + this.orbitPitch * 3;
    // Pull the camera in rather than letting it pass through the shop or the pagoda.
    for (let d = 1.5; d <= dist; d += 0.5) {
      const x = this.pos.x - Math.sin(yaw) * d,
        z = this.pos.z - Math.cos(yaw) * d;
      const inShop =
        Math.abs(x - SHOP.x) < SHOP.hw + 0.3 &&
        Math.abs(z - SHOP.z) < SHOP.hd + 0.3;
      const inPagoda = Math.hypot(x - PAGODA.x, z - PAGODA.z) < 4.5;
      if (inShop || inPagoda) {
        dist = d - 0.5;
        break;
      }
    }
    out.set(
      this.pos.x - Math.sin(yaw) * dist,
      3.6 + this.orbitPitch * 4 + (narrow ? 0.8 : 0),
      this.pos.z - Math.cos(yaw) * dist,
    );
    target.set(
      this.pos.x + Math.sin(yaw) * 6,
      2.5,
      this.pos.z + Math.cos(yaw) * 6,
    );
    // Gift moment: a side view of the two friends so the hand-over and the thank-you are
    // easy to see, easing in while the player walks up and back out at the end.
    if (this.giftRite) {
      const g = this.giftRite,
        e = this.time - g.start,
        s = (x: number) => x * x * (3 - 2 * x),
        f =
          s(Math.min(1, Math.max(0, e / 0.9))) *
          (1 - s(Math.min(1, Math.max(0, (e - 3.1) / 0.7))));
      const F = FRIENDS.one,
        mx = (g.to.x + F.x) / 2,
        mz = (g.to.z + F.z) / 2;
      let nx = -(F.z - g.to.z),
        nz = F.x - g.to.x;
      const nl = Math.hypot(nx, nz) || 1;
      nx /= nl;
      nz /= nl;
      // Look from the open garden side, not from the trees at the edge.
      if (nx * (0 - mx) + nz * (8 - mz) < 0) ((nx = -nx), (nz = -nz));
      const cx = mx + nx * 4.4,
        cz = mz + nz * 4.4;
      out.set(
        out.x + (cx - out.x) * f,
        out.y + (1.9 - out.y) * f,
        out.z + (cz - out.z) * f,
      );
      target.set(
        target.x + (mx - target.x) * f,
        target.y + (1.05 - target.y) * f,
        target.z + (mz - target.z) * f,
      );
    }
    // Candle moment: a close, low three-quarter view from the side so the kneel and the
    // first flame are easy to see, easing in and back out again.
    if (this.rite) {
      const e = this.time - this.rite.start,
        s = (x: number) => x * x * (3 - 2 * x),
        f =
          s(Math.min(1, Math.max(0, e / 0.9))) *
          (1 - s(Math.min(1, Math.max(0, (e - 4.3) / 0.7))));
      const side = 1.45, // a side profile from just outside the candle ring
        cx = KNEEL.x - Math.sin(side) * 4.6,
        cz = KNEEL.z - Math.cos(side) * 4.6,
        tx = KNEEL.x,
        tz = KNEEL.z - 0.45;
      out.set(
        out.x + (cx - out.x) * f,
        out.y + (2.0 - out.y) * f,
        out.z + (cz - out.z) * f,
      );
      target.set(
        target.x + (tx - target.x) * f,
        target.y + (0.9 - target.y) * f,
        target.z + (tz - target.z) * f,
      );
    }
  }
  private snapCamera() {
    this.desiredCamera(this.camPos, this.camTarget);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
  }
  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    const raw = this.clock.getDelta() * this.timeScale;
    this.time += raw;
    // Movement steps are capped so a slow frame cannot skip through walls; the camera
    // gets a looser cap so it still keeps up on slow devices.
    const dt = Math.min(raw, 0.1);
    this.camDt = Math.min(raw, 0.25);
    const t = this.time;
    if (!this.visible) return;
    const watching =
      this.fireworkStart >= 0 && t - this.fireworkStart < FIREWORK_SHOW_SECONDS;
    this.updatePlayer(dt, t, watching);
    this.updatePeople(dt, t, watching);
    this.updateWishes(t);
    this.updateFireworks(t);
    this.updateAmbient(dt, t);
    this.updateCamera(dt, watching);
    this.updateCelebration(t);
    this.renderer.render(this.scene, this.camera);
    this.updateAnchors();
    if (!this.readySent) {
      this.readySent = true;
      this.events.onReady?.();
    }
  };
  private updatePlayer(dt: number, t: number, watching: boolean) {
    if (this.updateRite(t)) return;
    if (this.updateGift(t)) return;
    const k = this.keys;
    const turn =
      Number(k.has("ArrowLeft") || k.has("a")) -
      Number(k.has("ArrowRight") || k.has("d"));
    const move =
      Number(k.has("ArrowUp") || k.has("w")) -
      Number(k.has("ArrowDown") || k.has("s"));
    const active = this.canMove && !watching;
    if (turn || move) this.route = null;
    let autoStep = false;
    if (active && this.route) {
      const target = this.route.points[0] ?? this.pos;
      const dx = target.x - this.pos.x,
        dz = target.z - this.pos.z,
        d = Math.hypot(dx, dz);
      if (d < 0.25 || !this.route.points.length) {
        this.route.points.shift();
        if (!this.route.points.length) {
          const r = this.route;
          this.route = null;
          if (r.face !== undefined) this.heading = r.face;
          this.lastSent.at = -1;
          this.events.onMove({ ...this.pos }, this.heading);
          r.onArrive?.();
        }
      } else {
        const want = Math.atan2(dx, dz);
        let diff = want - this.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.heading += diff * Math.min(1, dt * 10);
        const step = Math.min(d, 5.2 * dt);
        const before = this.pos;
        this.pos = moveCharacter(this.pos, (dx / d) * step, (dz / d) * step);
        if (
          Math.hypot(this.pos.x - before.x, this.pos.z - before.z) <
          step * 0.1
        )
          this.route.points.shift();
        this.orbitYaw *= Math.exp(-3 * dt);
        this.orbitPitch *= Math.exp(-2 * dt);
        autoStep = true;
      }
    }
    this.walking = active && (turn !== 0 || move !== 0 || autoStep);
    if (active && turn) this.heading += turn * 2.3 * dt;
    if (active && move) {
      const v = move > 0 ? 5.2 : 3;
      this.pos = moveCharacter(
        this.pos,
        Math.sin(this.heading) * v * dt * move,
        Math.cos(this.heading) * v * dt * move,
      );
      this.orbitYaw *= Math.exp(-3 * dt);
      this.orbitPitch *= Math.exp(-2 * dt);
    }
    const s = this.lastSent;
    const moved =
      Math.hypot(this.pos.x - s.x, this.pos.z - s.z) > 0.25 ||
      Math.abs(this.heading - s.h) > 0.2;
    if (
      moved ||
      ((s.x !== this.pos.x || s.z !== this.pos.z) &&
        t - s.at > 0.15 &&
        !this.walking)
    ) {
      this.lastSent = { x: this.pos.x, z: this.pos.z, h: this.heading, at: t };
      this.events.onMove({ ...this.pos }, this.heading);
    }
    if (!this.player) return;
    this.player.root.position.set(this.pos.x, 0, this.pos.z);
    this.player.root.rotation.y = this.heading;
    animateRig(this.player, {
      walking: this.walking && (move !== 0 || autoStep),
      pose: watching ? "watching" : this.pose,
      t,
      phase: 0,
      calm: this.calm,
    });
  }
  private updatePeople(dt: number, t: number, watching: boolean) {
    this.friends.forEach((f, i) => {
      const one = f.key === "friend-one";
      const gr = one ? this.giftRite : null;
      const holding = one && !gr && t < this.giftHeldUntil && !watching;
      if (gr || holding) {
        // Receiving the gift: face the player, reach out with both hands, then hold it close.
        f.rig.root.rotation.y = Math.atan2(
          this.pos.x - f.rig.root.position.x,
          this.pos.z - f.rig.root.position.z,
        );
        const g = gr ? this.giftTimes(t - gr.start) : null;
        animateRig(f.rig, {
          walking: false,
          pose: "receive",
          reach: g ? g.receive * (1 - g.hug * 0.35) : 0.65,
          holding: g ? g.receiverHolds : true,
          t,
          phase: i * 1.3,
          calm: this.calm,
        });
        return;
      }
      if (f.eating && this.pose === "eating" && !watching) {
        // The player has joined the table: everyone eats, chats and giggles together.
        f.rig.root.rotation.y = f.heading;
        const others = [
          ...this.friends
            .filter((o) => o !== f && o.eating)
            .map((o) => ({ key: o.key, p: o.rig.root.position })),
          { key: "player", p: this.player?.root.position },
        ];
        const who =
          others.find((o) => o.key === this.speaker) ??
          others.find((o) => o.key === "player")!;
        let look = 0;
        if (who.p) {
          look =
            Math.atan2(
              who.p.x - f.rig.root.position.x,
              who.p.z - f.rig.root.position.z,
            ) - f.heading;
          look = Math.atan2(Math.sin(look), Math.cos(look));
          look = Math.max(-0.9, Math.min(0.9, look));
        }
        animateRig(f.rig, {
          walking: false,
          pose: "party",
          talking: this.speaker === f.key,
          lookAt: this.speaker === f.key ? 0 : look,
          t,
          phase: i * 1.3,
          calm: this.calm,
        });
        return;
      }
      const happy = one && this.friendHappy;
      if (happy) {
        // Turn to face the player while receiving the gift.
        f.rig.root.rotation.y = Math.atan2(
          this.pos.x - f.rig.root.position.x,
          this.pos.z - f.rig.root.position.z,
        );
      } else f.rig.root.rotation.y = f.heading;
      animateRig(f.rig, {
        walking: false,
        pose: watching
          ? "watching"
          : happy
            ? "happy"
            : f.eating
              ? "eating"
              : "",
        t,
        phase: i * 1.3,
        calm: this.calm,
      });
    });
    // The nearest child within reach stops to greet the player (leaves again past 4.2 m).
    let near: number | null = null,
      best = Infinity;
    this.children.forEach((c, i) => {
      const d = Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z);
      const reach = this.nearChild === i ? 4.2 : 3.2;
      if (d < reach && d < best && !watching) ((best = d), (near = i));
    });
    if (near !== this.nearChild) {
      this.nearChild = near;
      this.events.onChildNear?.(near);
    }
    // While a child greets a player who is standing still, ease the camera a little to the
    // side so the child is not hidden behind the player.
    if (this.nearChild !== null && !this.route && !this.keys.size && !this.drag) {
      const c = this.children[this.nearChild];
      let rel =
        Math.atan2(c.pos.x - this.pos.x, c.pos.z - this.pos.z) - this.heading;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      const want = rel > 0 ? -0.6 : 0.6;
      this.orbitYaw += (want - this.orbitYaw) * Math.min(1, dt * 1.5);
    }
    this.children.forEach((c, ci) => {
      const n = c.route.length;
      let a = c.route[c.seg],
        b = c.route[(c.seg + 1) % n];
      const greeting = ci === this.nearChild;
      if (!watching && !this.calm && !greeting) {
        c.along += dt * c.speed;
        let len = Math.hypot(b.x - a.x, b.z - a.z);
        while (c.along >= len) {
          c.along -= len;
          c.seg = (c.seg + 1) % n;
          a = c.route[c.seg];
          b = c.route[(c.seg + 1) % n];
          len = Math.hypot(b.x - a.x, b.z - a.z);
        }
      }
      const u = c.along / Math.max(Math.hypot(b.x - a.x, b.z - a.z), 0.01);
      c.pos = { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
      c.dir = Math.atan2(b.x - a.x, b.z - a.z);
      c.rig.root.position.set(c.pos.x, 0, c.pos.z);
      c.rig.root.rotation.y = greeting
        ? Math.atan2(this.pos.x - c.pos.x, this.pos.z - c.pos.z)
        : c.dir;
      animateRig(c.rig, {
        walking: !watching && !this.calm && !greeting,
        pose: watching ? "watching" : greeting ? "wave" : "",
        t,
        phase: c.speed * 5,
        calm: this.calm,
      });
      const back = 1.3;
      c.toy.position.set(
        c.pos.x - Math.sin(c.dir) * back,
        0,
        c.pos.z - Math.cos(c.dir) * back,
      );
      c.toy.rotation.y = c.dir;
      const hand = new THREE.Vector3(0.27, 0.65, -0.05)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), c.dir)
        .add(c.rig.root.position);
      const pos = c.string.geometry.attributes
        .position as THREE.BufferAttribute;
      pos.setXYZ(0, hand.x, hand.y, hand.z);
      const nose = new THREE.Vector3(0, 0.25, 0.35)
        .applyAxisAngle(new THREE.Vector3(0, 1, 0), c.dir)
        .add(c.toy.position);
      pos.setXYZ(1, nose.x, nose.y, nose.z);
      pos.needsUpdate = true;
    });
  }
  private updateWishes(t: number) {
    for (const w of this.wishes.values()) {
      const g = w.group;
      if (w.release) {
        const dur = w.kind === "lotus" ? 4.5 : 6;
        const p = (t - w.release.start) / dur;
        if (p >= 1) w.release = undefined;
        else {
          g.position.lerpVectors(w.release.from, w.home, ease(p));
          if (w.kind !== "lotus")
            g.position.x += Math.sin(p * Math.PI * 3) * 0.6 * (1 - p);
          continue;
        }
      }
      if (this.calm) {
        g.position.copy(w.home);
        continue;
      }
      if (w.kind === "lotus") {
        g.position.set(
          w.home.x + Math.cos(t * 0.15 + w.phase) * 0.45,
          w.home.y + Math.sin(t * 1.4 + w.phase) * 0.02,
          w.home.z + Math.sin(t * 0.15 + w.phase) * 0.3,
        );
        g.rotation.y = t * 0.1 + w.phase;
      } else {
        g.position.set(
          w.home.x + Math.sin(t * 0.3 + w.phase) * 0.5,
          w.home.y + Math.sin(t * 0.7 + w.phase) * 0.35,
          w.home.z,
        );
        g.rotation.y = Math.sin(t * 0.25 + w.phase) * 0.6;
      }
    }
  }
  private clearFireworks() {
    for (const b of this.bursts) {
      this.scene.remove(b.points, b.lines, b.rocket, b.flash, b.reflection);
      if (b.stars) this.scene.remove(b.stars);
      b.points.geometry.dispose();
      b.lines.geometry.dispose();
      b.light.intensity = 0;
    }
    this.bursts = [];
  }
  private updateFireworks(t: number) {
    if (this.fireworkStart < 0) return;
    const e = t - this.fireworkStart;
    if (e > FIREWORK_SHOW_SECONDS + 0.2) {
      this.clearFireworks();
      this.fireworkStart = -1;
      return;
    }
    const type = this.fireworkType;
    const gravity = type === 4 ? 4.2 : 1.1;
    for (const l of this.fireLights) l.intensity = 0;
    for (const b of this.bursts) {
      const rt = (e - (b.delay - 0.6)) / 0.6;
      const rocketOn = b.hasRocket && rt > 0 && rt < 1;
      (b.rocket.material as THREE.SpriteMaterial).opacity = rocketOn ? 1 : 0;
      if (rocketOn) b.rocket.position.lerpVectors(b.from, b.pos, ease(rt));
      const s = e - b.delay;
      const pts = b.points.geometry.attributes
        .position as THREE.BufferAttribute;
      const lns = b.lines.geometry.attributes.position as THREE.BufferAttribute;
      if (s < 0) continue;
      const life = 3.3;
      const fade =
        s < 0.1
          ? s / 0.1
          : Math.max(0, 1 - Math.pow((s - 0.1) / (life - 0.1), 1.4));
      const bright = Math.min(1, 0.35 + b.size * 0.65);
      (b.points.material as THREE.PointsMaterial).opacity = fade * bright;
      (b.lines.material as THREE.LineBasicMaterial).opacity =
        fade * 0.9 * bright;
      if (b.stars) (b.stars.material as THREE.PointsMaterial).opacity = fade;
      (b.flash.material as THREE.SpriteMaterial).opacity =
        Math.max(0, 1 - s / 0.45) * 0.9 * bright;
      const glowNow = Math.max(0, 1 - s / 1.6) * 650 * b.size;
      if (glowNow > b.light.intensity) {
        b.light.intensity = glowNow;
        b.light.color.copy((b.flash.material as THREE.SpriteMaterial).color);
        b.light.position.copy(b.pos);
      }
      (b.reflection.material as THREE.MeshBasicMaterial).opacity =
        (s < 0.4
          ? (s / 0.4) * 0.85
          : Math.max(0, 0.85 * (1 - (s - 0.4) / 2.9))) * Math.min(1, b.size);
      const spread = 1 - Math.pow(1 - Math.min(s / 1.3, 1), 3);
      const fall = gravity * s * s * 0.5;
      const trail = type === 4 ? 2.6 : 1.1;
      b.dirs.forEach((d, i) => {
        const r = b.speeds[i] * spread;
        const x = b.pos.x + d.x * r,
          y = b.pos.y + d.y * r - fall,
          z = b.pos.z + d.z * r;
        pts.setXYZ(i, x, y, z);
        const tr = trail * Math.max(0.15, 1 - s / life);
        lns.setXYZ(i * 2, x, y, z);
        lns.setXYZ(
          i * 2 + 1,
          x - d.x * tr,
          y - d.y * tr + (type === 4 ? tr * 0.6 : 0),
          z - d.z * tr,
        );
        if (b.stars && i % 4 === 0)
          (
            b.stars.geometry.attributes.position as THREE.BufferAttribute
          ).setXYZ(i / 4, x, y, z);
      });
      pts.needsUpdate = lns.needsUpdate = true;
      if (b.stars) b.stars.geometry.attributes.position.needsUpdate = true;
    }
  }
  private updateCelebration(t: number) {
    const tm = this.tapMarker.material as THREE.MeshBasicMaterial;
    const age = t - this.tapAt;
    tm.opacity = age < 1 ? 0.8 * (1 - age) : 0;
    this.tapMarker.scale.setScalar(1 + age * 0.8);
    const c = this.celebration;
    if (!c) return;
    const e = t - c.start;
    if (e > 16) {
      for (const it of c.items) this.scene.remove(it.g);
      this.celebration = null;
      return;
    }
    for (const it of c.items) {
      const p = Math.max(0, (e - it.delay) / 12);
      it.g.position.set(
        it.from.x + Math.sin(p * 6 + it.sway) * 0.8,
        it.from.y + ease(p) * 24 + p * 4,
        it.from.z + Math.cos(p * 5 + it.sway) * 0.6,
      );
      it.g.visible = p < 1;
    }
  }
  private updateAmbient(dt: number, t: number) {
    this.starMat.uniforms.time.value = this.calm ? 0 : t;
    this.fairyMat.uniforms.time.value = this.calm ? 0 : t;
    this.fireflyMat.uniforms.time.value = this.calm ? 2 : t;
    if (!this.calm)
      for (const c of this.clouds) {
        c.position.x += dt * 1.2;
        if (c.position.x > 130) c.position.x = -130;
      }
    for (const [id, ring] of Object.entries(this.spotRings)) {
      const near =
        Math.hypot(this.pos.x - SPOTS[id].x, this.pos.z - SPOTS[id].z) < 5;
      (ring.material as THREE.MeshBasicMaterial).opacity = near
        ? 0.75 + Math.sin(t * 4) * 0.2
        : 0.3;
    }
    for (const l of this.warmLights)
      if (this.lit && !this.calm)
        l.intensity = 60 + Math.sin(t * 7 + l.position.x) * 4;
  }
  private updateCamera(dt: number, watching: boolean) {
    const p = new THREE.Vector3(),
      target = new THREE.Vector3();
    this.desiredCamera(p, target);
    const celebrating =
      !!this.celebration && this.time - this.celebration.start < 9;
    let snap = false;
    if (watching && this.cine && !this.cine.skipped) {
      // Wide festival shot with a very slow push in.
      const c = this.cine;
      const prog = Math.min(1, (this.time - c.start) / FIREWORK_SHOW_SECONDS);
      p.copy(c.pos)
        .addScaledVector(c.dir, -3 * prog)
        .setY(c.pos.y + 0.6 * prog);
      target.copy(c.target);
      snap = this.calm;
    } else if (watching && this.cine?.skipped) {
      // Skipped: normal follow camera, tilted a little towards the sky.
      target.lerp(this.skyLook, 0.35);
    } else if (celebrating) {
      p.y = 2.2;
      target.lerp(this.skyLook, 0.85);
    } else if (this.focus && this.time < this.focus.until) {
      const w = this.focus.id ? this.wishes.get(this.focus.id) : null;
      if (w) {
        const fp = w.group.position;
        const yaw = Math.atan2(fp.x - this.pos.x, fp.z - this.pos.z);
        const dist = this.camera.aspect < 1.2 ? 10 : 8.5;
        p.set(
          this.pos.x - Math.sin(yaw) * dist,
          2.6,
          this.pos.z - Math.cos(yaw) * dist,
        );
        target.copy(fp);
      }
    } else if (this.focus) this.focus = null;
    if (!watching && this.cine) {
      // Show over: glide back behind the player (or cut, with reduced motion).
      snap = this.calm;
      this.cine = null;
    }
    const k = snap
      ? 1
      : 1 -
        Math.exp(
          -(watching ? 1.8 : celebrating || this.focus ? 2.5 : 6) * this.camDt,
        );
    this.camPos.lerp(p, k);
    this.camTarget.lerp(target, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
  }
  private anchorPoint(key: string, out: THREE.Vector3): boolean {
    if (key.startsWith("spot-")) {
      const s = SPOTS[key.slice(5)];
      if (!s) return false;
      out.set(s.x, 3.3, s.z);
    } else if (key === "player") out.set(this.pos.x, 2.15, this.pos.z);
    else if (key.startsWith("friend-")) {
      const f = this.friends.find((f) => f.key === key);
      if (!f) return false;
      out.copy(f.rig.root.position).setY(2.15);
    } else if (key.startsWith("child-")) {
      const c = this.children[Number(key.slice(6))];
      if (!c) return false;
      out.set(c.pos.x, 1.6, c.pos.z);
    } else return false;
    return true;
  }
  private updateAnchors() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight,
      v = new THREE.Vector3();
    const placed: [number, number][] = [];
    const mx = Math.max(0.55, 1 - 70 / w),
      my = Math.max(0.55, 1 - 70 / h);
    this.host.querySelectorAll<HTMLElement>("[data-anchor]").forEach((el) => {
      if (!this.anchorPoint(el.dataset.anchor!, v)) return;
      const dist = v.distanceTo(this.camera.position);
      v.project(this.camera);
      const behind = v.z > 1;
      const inside =
        !behind && v.x > -1.05 && v.x < 1.05 && v.y > -1.1 && v.y < 1.15;
      // Spots that are still to do get an edge pointer when they are off screen.
      if (!inside && el.dataset.edge === "1") {
        let x = behind ? -v.x : v.x,
          y = behind ? -v.y : v.y;
        if (behind && Math.abs(y) < 0.2) y = -0.6;
        const k = Math.max(Math.abs(x) / mx, Math.abs(y) / my, 1e-3);
        x /= k;
        y /= k;
        el.dataset.off = "1";
        el.style.setProperty(
          "--edge-angle",
          Math.atan2(-y, x) * (180 / Math.PI) + "deg",
        );
        el.style.visibility = "visible";
        // Keep pointers on the same edge from stacking on top of each other.
        let px = ((x + 1) / 2) * w,
          py = ((1 - y) / 2) * h;
        const sideEdge = Math.abs(x) >= mx * 0.99;
        for (
          let n = 0;
          n < 6 && placed.some(([a, c]) => Math.hypot(a - px, c - py) < 46);
          n++
        ) {
          if (sideEdge) py += py > h / 2 ? -46 : 46;
          else px += px > w / 2 ? -56 : 56;
        }
        placed.push([px, py]);
        el.style.transform = `translate3d(${px}px,${py}px,0)`;
        el.style.zIndex = "60";
        return;
      }
      el.dataset.off = "0";
      const show = inside && dist < 48;
      el.style.visibility = show ? "visible" : "hidden";
      if (!show) return;
      el.dataset.label = dist < 17 ? "1" : "0";
      el.style.transform = `translate3d(${((v.x + 1) / 2) * w}px,${((1 - v.y) / 2) * h}px,0)`;
      el.style.zIndex = String(Math.round(100 - dist));
    });
  }
}
