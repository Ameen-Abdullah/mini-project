import { useRef, useLayoutEffect, useMemo } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/* ------------------------------------------------------------------ */
/*  Cubic-bezier(0.5, 0, 0, 1) implemented as a GSAP-compatible ease */
/* ------------------------------------------------------------------ */
function createCubicBezier(x1, y1, x2, y2) {
  const ax = 1 - 3 * x2 + 3 * x1;
  const bx = 3 * x2 - 6 * x1;
  const cx = 3 * x1;
  const ay = 1 - 3 * y2 + 3 * y1;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;

  function sampleX(t) {
    return ((ax * t + bx) * t + cx) * t;
  }
  function sampleY(t) {
    return ((ay * t + by) * t + cy) * t;
  }
  function sampleXDeriv(t) {
    return (3 * ax * t + 2 * bx) * t + cx;
  }

  function solveTForX(x) {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-7) return t;
      const d = sampleXDeriv(t);
      if (Math.abs(d) < 1e-7) break;
      t -= err / d;
    }
    return t;
  }

  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return sampleY(solveTForX(x));
  };
}

const customEase = createCubicBezier(0.5, 0, 0, 1);

/* ------------------------------------------------------------------ */
/*  Status / risk config                                              */
/* ------------------------------------------------------------------ */
const STATUS_MAP = {
  200: { label: "SYSTEMS NORMAL", color: "#30D158" },
  400: { label: "CLIENT ERROR", color: "#FF9500" },
  500: { label: "SERVER DOWN", color: "#FF3B30" },
};

function riskMeta(level) {
  switch (level) {
    case "high":
      return { pct: 87, color: "#FF3B30" };
    case "mid":
      return { pct: 50, color: "#FF9500" };
    default:
      return { pct: 22, color: "#30D158" };
  }
}

/* Parse metric value into number (for animation) and optional suffix (e.g. "85%" → 85, "%") */
function parseMetricValue(value) {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return { num: value, suffix: "" };
  }
  const s = String(value).trim();
  const match = s.match(/^([-\d.]+)\s*(.*)$/);
  if (match) {
    const num = parseFloat(match[1]);
    return Number.isNaN(num) ? { num: null, suffix: s } : { num, suffix: match[2] || "" };
  }
  return { num: null, suffix: s };
}

function formatAnimatedValue(val, parsed) {
  if (parsed.suffix && parsed.num === null) return parsed.suffix;
  const n = parsed.num;
  const display =
    n !== null && Number.isInteger(n) ? Math.round(val) : Number(val).toFixed(1);
  return parsed.suffix ? `${display}${parsed.suffix}` : display;
}

/* ------------------------------------------------------------------ */
/*  Dashboard                                                         */
/* ------------------------------------------------------------------ */
export default function Dashboard({ data, riskColor = "#39FF14" }) {
  const ACCENT = riskColor;
  const containerRef = useRef(null);
  const riskBarRef = useRef(null);
  const biometricsSectionRef = useRef(null);
  const metricValueRefs = useRef([]);

  const risk = riskMeta(data.riskLevel);
  const status = STATUS_MAP[data.serverStatus] ?? STATUS_MAP[500];

  const scanTime = new Date(data.lastScanTime).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const metrics = useMemo(
    () =>
      [
        { value: data.playerMetrics.fatigueLevel, label: "FATIGUE" },
        { value: data.playerMetrics.recentImpactForce, label: "IMPACT" },
        { value: data.playerMetrics.heartRate, label: "HEART RATE" },
        { value: data.playerMetrics.sprintDistance, label: "SPRINT DIST." },
        { value: String(data.playerMetrics.matchesPlayed), label: "MATCHES" },
        { value: data.playerMetrics.trainingLoad, label: "TR. LOAD" },
      ].map((m) => ({ ...m, parsed: parseMetricValue(m.value) })),
    [data]
  );

  /* ---- GSAP entry animations ---- */
  useLayoutEffect(() => {
    if (!containerRef.current) return;

    const ctx = gsap.context(() => {
      const panels = containerRef.current.querySelectorAll("[data-animate]");

      gsap.set(panels, {
        opacity: 0,
        y: 14,
        clipPath: "inset(0 0 6% 0)",
      });

      gsap.to(panels, {
        opacity: 1,
        y: 0,
        clipPath: "inset(0 0 0% 0)",
        stagger: 0.07,
        duration: 0.7,
        delay: 0.35,
        ease: customEase,
      });

      if (riskBarRef.current) {
        gsap.fromTo(
          riskBarRef.current,
          { width: "0%" },
          {
            width: `${risk.pct}%`,
            duration: 1.1,
            delay: 0.9,
            ease: customEase,
          },
        );
      }
    }, containerRef);

    return () => ctx.revert();
  }, [risk.pct]);

  /* ---- Biometrics count-up when section scrolls into view ---- */
  useLayoutEffect(() => {
    const section = biometricsSectionRef.current;
    const scroller = containerRef.current;
    if (!section || !scroller || !metrics.length) return;

    const valueRefs = metricValueRefs.current;
    const fromVals = {};
    const toVals = {};
    metrics.forEach((_, i) => {
      fromVals[`v${i}`] = 0;
      toVals[`v${i}`] = metrics[i].parsed.num ?? 0;
    });

    const ctx = gsap.context(() => {
      const tween = gsap.to(fromVals, {
        ...toVals,
        duration: 1.4,
        ease: customEase,
        paused: true,
        onUpdate: () => {
          metrics.forEach((m, i) => {
            const el = valueRefs[i];
            if (el) {
              el.textContent = formatAnimatedValue(fromVals[`v${i}`], m.parsed);
            }
          });
        },
      });

      ScrollTrigger.create({
        trigger: section,
        scroller,
        start: "top 90%",
        once: true,
        onEnter: () => tween.play(),
      });

      // If section is already in view on load (e.g. after refresh), play immediately
      requestAnimationFrame(() => {
        ScrollTrigger.refresh();
        const scrollTop = scroller.scrollTop;
        const sectionTop = section.offsetTop;
        const viewportH = scroller.clientHeight;
        if (sectionTop - scrollTop < viewportH * 0.9) tween.play();
      });
    }, scroller);

    return () => ctx.revert();
  }, [metrics]);

  /* ---- Render ---- */
  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto border-l border-white/15 px-4 py-8 flex flex-col gap-6"
      style={{ background: "#0a0a0a", scrollbarWidth: "none" }}
    >
      {/* ── Header ─────────────────────────────────────────── */}
      <div data-animate className="flex items-baseline justify-between">
        <h1 className="text-3xl font-heading">
          <span style={{ color: ACCENT }}></span>AI
        </h1>
        <span className="text-md font-sans  tracking-widest text-white/50 uppercase">
          v2.1.0
        </span>
      </div>

      {/* ── Server status ──────────────────────────────────── */}
      <div data-animate>
        <div className="h-px bg-white/5 mb-4" />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className="block w-1.5 h-1.5 rounded-full"
              style={{
                background: status.color,
                boxShadow: `0 0 6px ${status.color}`,
                animation: "hotspot-pulse 2.5s ease-in-out infinite",
              }}
            />
            <span
              className="text-3xl uppercase font-heading"
              style={{ color: status.color }}
            >
              {status.label}
            </span>
          </div>
          <span className="text-md tracking-wider text-white/50 font-sans">
            {scanTime} UTC
          </span>
        </div>
      </div>

      {/* ── Player profile ─────────────────────────────────── */}
      <div data-animate>
        <div className="h-px bg-white/5 mb-4" />
        <span className="text-xs font-sans  text-white/50 uppercase block mb-2">
          Player Profile
        </span>
        <h2 className="text-6xl  mb-1 font-heading">
          {data.playerInfo.name}
        </h2>
        <p className="text-md font-sans text-white/50 tracking-wide">
          {data.playerInfo.position} · {data.playerInfo.team} · Age{" "}
          {data.playerInfo.age}
        </p>
      </div>

      {/* ── Risk assessment ────────────────────────────────── */}
      <div data-animate>
        <div className="h-px bg-white/5 mb-4" />
        <div className="flex items-center justify-between mb-3">
          <span className="text-md  text-white/85 uppercase">
            Risk Assessment
          </span>
          <span
            className="text-md font-bold font-sans uppercase"
            style={{ color: risk.color }}
          >
            {data.riskLevel}
          </span>
        </div>
        <div className="h-5  bg-white/24 overflow-hidden">
          <div
            ref={riskBarRef}
            className="h-full"
            style={{ background: risk.color, width: 0 }}
          />
        </div>
      </div>

      {/* ── Injured joints ─────────────────────────────────── */}
      <div data-animate>
        <div className="h-px bg-white/5 mb-4" />
        <div className="flex items-center justify-between mb-3">
          <span className="text-md  text-white/85 uppercase">
            Detected Injuries
          </span>
          <span className="text-md text-white/15 font-heading">
            {data.injuredJoints.length}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {data.injuredJoints.map((joint, i) => (
            <div
              key={i}
              className="border border-white/5 bg-white/2 p-4 backdrop-blur-sm"
              style={{
                transition: "all 0.3s cubic-bezier(0.5, 0, 0, 1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `${ACCENT}26`; // 15% opacity
                e.currentTarget.style.background = `${ACCENT}08`; // 3% opacity
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)";
                e.currentTarget.style.background = "rgba(255,255,255,0.02)";
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="text-6xl font-heading"
                  style={{ color: ACCENT, textShadow: `0 0 12px ${ACCENT}55` }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span
                  className="block w-1 h-1 shrink-0"
                  style={{ background: ACCENT }}
                />
                <span className="text-xl font-bold uppercase text-white/75">
                  {joint.name}
                </span>
                <span className="text-md text-white/50  uppercase ml-auto">
                  {"(" + joint.side + ")"}
                </span>
              </div>
              <p className="text-md leading-relaxed text-white/80 pl-7">
                {joint.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Biometrics grid ────────────────────────────────── */}
      <div ref={biometricsSectionRef} data-animate>
        <div className="h-px bg-white/5 mb-4" />
        <span className="text-lg   text-white/75 uppercase block mb-3">
          Biometrics
        </span>
        <div className="grid grid-cols-3 gap-2">
          {metrics.map((m, i) => (
            <div key={i} className="border border-white/5 bg-white/2 p-3">
              <div
                ref={(el) => (metricValueRefs.current[i] = el)}
                className="text-6xl  uppercase  text-white/75 font-heading mb-1"
              >
                0
              </div>
              <div className="text-md  text-white/50 uppercase">
                {m.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────────── */}
      <div data-animate className="mt-auto pt-4">
        <div className="h-px bg-white/5 mb-4" />
        <div className="flex items-center justify-between">
          <span className="text-xl text-white/80 font-heading">
            AI PREDICTIVE ENGINE
          </span>
          <span className="text-xl tracking-wide text-white/80 font-heading">
            BUILD 2026.02
          </span>
        </div>
      </div>
    </div>
  );
}
