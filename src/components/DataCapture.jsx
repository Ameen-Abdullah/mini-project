import { useRef, useState, useEffect, useCallback, useLayoutEffect } from "react";
import { Link } from "react-router-dom";
import { PoseLandmarker, FilesetResolver, DrawingUtils } from "@mediapipe/tasks-vision";
import gsap from "gsap";

/* ------------------------------------------------------------------ */
/*  MediaPipe landmark names (33 landmarks)                           */
/* ------------------------------------------------------------------ */
const LANDMARK_NAMES = [
  "Nose", "Left Eye Inner", "Left Eye", "Left Eye Outer",
  "Right Eye Inner", "Right Eye", "Right Eye Outer",
  "Left Ear", "Right Ear", "Mouth Left", "Mouth Right",
  "Left Shoulder", "Right Shoulder", "Left Elbow", "Right Elbow",
  "Left Wrist", "Right Wrist", "Left Pinky", "Right Pinky",
  "Left Index", "Right Index", "Left Thumb", "Right Thumb",
  "Left Hip", "Right Hip", "Left Knee", "Right Knee",
  "Left Ankle", "Right Ankle", "Left Heel", "Right Heel",
  "Left Foot Index", "Right Foot Index",
];

/* ------------------------------------------------------------------ */
/*  Joint groups for organized display                                */
/* ------------------------------------------------------------------ */
const JOINT_GROUPS = [
  { label: "Head", indices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { label: "Upper Body", indices: [11, 12, 13, 14, 15, 16] },
  { label: "Hands", indices: [17, 18, 19, 20, 21, 22] },
  { label: "Lower Body", indices: [23, 24, 25, 26, 27, 28, 29, 30, 31, 32] },
];

const ACCENT = "#39ff14";

/* ------------------------------------------------------------------ */
/*  Per-person color palette (up to 6 people)                         */
/* ------------------------------------------------------------------ */
const PERSON_COLORS = [
  { hex: "#39ff14", label: "Person A" },
  { hex: "#00d4ff", label: "Person B" },
  { hex: "#ff3bff", label: "Person C" },
  { hex: "#ffb700", label: "Person D" },
  { hex: "#ff3b30", label: "Person E" },
  { hex: "#a78bfa", label: "Person F" },
];

const MAX_POSES = 6;

/* ------------------------------------------------------------------ */
/*  DataCapture Page                                                  */
/* ------------------------------------------------------------------ */
export default function DataCapture() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const poseLandmarkerRef = useRef(null);
  const animationFrameRef = useRef(null);

  const [allLandmarks, setAllLandmarks] = useState([]);       // array of per-person landmark arrays
  const [allWorldLandmarks, setAllWorldLandmarks] = useState([]); // array of per-person world landmark arrays
  const [poseCount, setPoseCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [selectedPerson, setSelectedPerson] = useState(0);
  const [fps, setFps] = useState(0);

  const lastTimeRef = useRef(performance.now());
  const frameCountRef = useRef(0);

  /* ---- GSAP entry animations ---- */
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const ctx = gsap.context(() => {
      const panels = containerRef.current.querySelectorAll("[data-animate]");
      gsap.set(panels, { opacity: 0, y: 14, clipPath: "inset(0 0 6% 0)" });
      gsap.to(panels, {
        opacity: 1,
        y: 0,
        clipPath: "inset(0 0 0% 0)",
        stagger: 0.07,
        duration: 0.7,
        delay: 0.2,
        ease: "power3.out",
      });
    }, containerRef);
    return () => ctx.revert();
  }, []);

  /* ---- Initialize MediaPipe Pose Landmarker ---- */
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );

        const landmarker = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: MAX_POSES,
          minPoseDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        if (!cancelled) {
          poseLandmarkerRef.current = landmarker;
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Failed to initialize pose landmarker:", err);
          setError("Failed to load pose estimation model.");
          setIsLoading(false);
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- Start / Stop camera ---- */
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsStreaming(true);
      }
    } catch (err) {
      setError("Camera access denied. Please allow camera permissions.");
      console.error(err);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setIsStreaming(false);
    setAllLandmarks([]);
    setAllWorldLandmarks([]);
    setPoseCount(0);
    setSelectedPerson(0);
  }, []);

  /* ---- Detection loop ---- */
  useEffect(() => {
    if (!isStreaming || !poseLandmarkerRef.current || !videoRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    function detect() {
      if (!video || video.readyState < 2) {
        animationFrameRef.current = requestAnimationFrame(detect);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const now = performance.now();
      const result = poseLandmarkerRef.current.detectForVideo(video, now);

      /* FPS counter */
      frameCountRef.current++;
      if (now - lastTimeRef.current >= 1000) {
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastTimeRef.current = now;
      }

      /* Draw */
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const numDetected = result.landmarks?.length ?? 0;

      if (numDetected > 0) {
        const drawingUtils = new DrawingUtils(ctx);

        for (let p = 0; p < numDetected; p++) {
          const color = PERSON_COLORS[p % PERSON_COLORS.length].hex;
          const label = PERSON_COLORS[p % PERSON_COLORS.length].label;

          /* skeleton */
          drawingUtils.drawConnectors(
            result.landmarks[p],
            PoseLandmarker.POSE_CONNECTIONS,
            { color: color + "66", lineWidth: 2 }
          );
          drawingUtils.drawLandmarks(result.landmarks[p], {
            color,
            lineWidth: 1,
            radius: 3,
          });

          /* label near nose (landmark 0) */
          const nose = result.landmarks[p][0];
          if (nose) {
            const lx = nose.x * canvas.width;
            const ly = nose.y * canvas.height - 24;
            ctx.save();
            ctx.font = "bold 13px 'Helvetica', sans-serif";
            ctx.textAlign = "center";

            /* background pill */
            const metrics = ctx.measureText(label);
            const pw = metrics.width + 14;
            const ph = 20;
            ctx.fillStyle = color + "33";
            ctx.strokeStyle = color + "88";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(lx - pw / 2, ly - ph + 4, pw, ph, 4);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = color;
            ctx.fillText(label, lx, ly);
            ctx.restore();
          }
        }

        setAllLandmarks(result.landmarks.map((l) => [...l]));
        setAllWorldLandmarks(
          (result.worldLandmarks ?? []).map((l) => [...l])
        );
        setPoseCount(numDetected);
      } else {
        setAllLandmarks([]);
        setAllWorldLandmarks([]);
        setPoseCount(0);
      }

      animationFrameRef.current = requestAnimationFrame(detect);
    }

    detect();
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isStreaming]);

  /* ---- Cleanup on unmount ---- */
  useEffect(() => {
    return () => {
      stopCamera();
      poseLandmarkerRef.current?.close();
    };
  }, [stopCamera]);

  /* ---- Clamp selectedPerson to valid range ---- */
  const safePerson = Math.min(selectedPerson, Math.max(poseCount - 1, 0));

  /* ---- Displayed landmarks ---- */
  const displayedIndices = selectedGroup !== null
    ? JOINT_GROUPS[selectedGroup].indices
    : Array.from({ length: 33 }, (_, i) => i);

  const personWorldLm = allWorldLandmarks[safePerson] ?? [];
  const personLm = allLandmarks[safePerson] ?? [];
  const activeData = personWorldLm.length > 0 ? personWorldLm : personLm;
  const personColor = PERSON_COLORS[safePerson % PERSON_COLORS.length].hex;
  const personLabel = PERSON_COLORS[safePerson % PERSON_COLORS.length].label;

  /* ---- Render ---- */
  return (
    <div
      ref={containerRef}
      className="w-full h-full flex"
      style={{ background: "#0a0a0a" }}
    >
      {/* ═══ Left: Camera Feed ═══════════════════════════════ */}
      <div className="w-[60%] h-full relative flex items-center justify-center bg-black/50">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }}
          playsInline
          muted
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: "scaleX(-1)" }}
        />

        {/* Overlay controls */}
        {!isStreaming && (
          <div className="relative z-10 flex flex-col items-center gap-4">
            {isLoading ? (
              <div data-animate className="text-center">
                <div
                  className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-4"
                  style={{ borderColor: `${ACCENT}55`, borderTopColor: "transparent" }}
                />
                <p className="text-lg text-white/50 uppercase tracking-widest font-heading">
                  Loading Model…
                </p>
              </div>
            ) : error ? (
              <div data-animate className="text-center px-8">
                <p className="text-lg text-red-400 uppercase tracking-wider font-heading mb-2">
                  Error
                </p>
                <p className="text-sm text-white/50">{error}</p>
              </div>
            ) : (
              <button
                data-animate
                onClick={startCamera}
                className="px-8 py-3 border text-lg uppercase tracking-widest font-heading transition-all duration-300 cursor-pointer"
                style={{
                  borderColor: ACCENT + "44",
                  color: ACCENT,
                  background: ACCENT + "08",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = ACCENT + "1a";
                  e.currentTarget.style.borderColor = ACCENT + "88";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = ACCENT + "08";
                  e.currentTarget.style.borderColor = ACCENT + "44";
                }}
              >
                Start Capture
              </button>
            )}
          </div>
        )}

        {/* Top-left status badge */}
        {isStreaming && (
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
            <span
              className="block w-2 h-2 rounded-full"
              style={{
                background: "#FF3B30",
                boxShadow: "0 0 8px #FF3B30",
                animation: "hotspot-pulse 1.5s ease-in-out infinite",
              }}
            />
            <span className="text-xs uppercase tracking-widest text-white/60 font-heading">
              Live — {fps} FPS · {poseCount} {poseCount === 1 ? "person" : "people"}
            </span>
          </div>
        )}

        {/* Stop button */}
        {isStreaming && (
          <button
            onClick={stopCamera}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 px-6 py-2 border text-sm uppercase tracking-widest font-heading transition-all duration-300 cursor-pointer"
            style={{
              borderColor: "#FF3B30" + "44",
              color: "#FF3B30",
              background: "#FF3B30" + "08",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#FF3B30" + "1a";
              e.currentTarget.style.borderColor = "#FF3B30" + "88";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#FF3B30" + "08";
              e.currentTarget.style.borderColor = "#FF3B30" + "44";
            }}
          >
            Stop Capture
          </button>
        )}
      </div>

      {/* ═══ Right: Coordinates Panel ════════════════════════ */}
      <div
        className="w-[40%] h-full overflow-y-auto border-l border-white/15 px-4 py-8 flex flex-col gap-6"
        style={{ background: "#0a0a0a", scrollbarWidth: "none" }}
      >
        {/* ── Header ────────────────────────────────────────── */}
        <div data-animate className="flex items-baseline justify-between">
          <h1 className="text-3xl font-heading">
            <span style={{ color: ACCENT }}>◆</span> DATA CAPTURE
          </h1>
          <Link
            to="/"
            className="text-md font-sans  text-white/75 text-center uppercase hover:text-white/80 transition-colors duration-300"
          >
            ← Dashboard
          </Link>
        </div>

        {/* ── Status ────────────────────────────────────────── */}
        <div data-animate>
          <div className="h-px bg-white/5 mb-4" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="block w-1.5 h-1.5 rounded-full"
                style={{
                  background: isStreaming ? ACCENT : "#FF9500",
                  boxShadow: `0 0 6px ${isStreaming ? ACCENT : "#FF9500"}`,
                  animation: "hotspot-pulse 2.5s ease-in-out infinite",
                }}
              />
              <span
                className="text-3xl uppercase font-heading"
                style={{ color: isStreaming ? ACCENT : "#FF9500" }}
              >
                {isStreaming
                  ? `Tracking ${poseCount} ${poseCount === 1 ? "Person" : "People"}`
                  : "Standby"}
              </span>
            </div>
            <span className="text-md  text-white/75 font-sans">
              MediaPipe Pose
            </span>
          </div>
        </div>

        {/* ── Pose Info ─────────────────────────────────────── */}
        <div data-animate>
          <div className="h-px bg-white/5 mb-4" />
          <span className="text-xs font-sans text-white/75 uppercase block mb-2">
            Pose Estimation
          </span>
          <h2 className="text-6xl mb-1 font-heading">
            {poseCount > 0
              ? `${poseCount} ${poseCount === 1 ? "POSE" : "POSES"}`
              : "NO POSE"}
          </h2>
          <p className="text-md font-sans text-white/75 tracking-wide">
            {poseCount > 0
              ? `${poseCount * 33} total landmarks · ${
                  allWorldLandmarks.length > 0 ? "3D World" : "2D Normalized"
                } coordinates`
              : "Waiting for detection…"}
          </p>
        </div>

        {/* ── Person Selector ───────────────────────────────── */}
        {poseCount > 1 && (
          <div data-animate>
            <div className="h-px bg-white/5 mb-4" />
            <span className="text-md text-white/85 uppercase block mb-3">
              Tracked People
            </span>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: poseCount }, (_, i) => {
                const c = PERSON_COLORS[i % PERSON_COLORS.length];
                const active = safePerson === i;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedPerson(i)}
                    className="px-3 py-1.5 border text-xs uppercase tracking-widest font-heading transition-all duration-300 cursor-pointer flex items-center gap-2"
                    style={{
                      borderColor: active ? c.hex + "66" : "rgba(255,255,255,0.05)",
                      color: active ? c.hex : "rgba(255,255,255,0.5)",
                      background: active ? c.hex + "0d" : "rgba(255,255,255,0.02)",
                    }}
                  >
                    <span
                      className="block w-2 h-2 rounded-full shrink-0"
                      style={{ background: c.hex, boxShadow: `0 0 6px ${c.hex}55` }}
                    />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Joint Group Filter ────────────────────────────── */}
        <div data-animate>
          <div className="h-px bg-white/5 mb-4" />
          <span className="text-md text-white/85 uppercase block mb-3">
            Joint Groups
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedGroup(null)}
              className="px-3 py-1.5 border text-xl uppercase font-heading transition-all duration-300 cursor-pointer"
              style={{
                borderColor: selectedGroup === null ? ACCENT + "66" : "rgba(255,255,255,0.3)",
                color: selectedGroup === null ? ACCENT : "rgba(255,255,255,0.8)",
                background: selectedGroup === null ? ACCENT + "0d" : "rgba(255,255,255,0.02)",
              }}
            >
              All
            </button>
            {JOINT_GROUPS.map((g, i) => (
              <button
                key={i}
                onClick={() => setSelectedGroup(i)}
                className="px-3 py-1.5 border text-xl uppercase  font-heading transition-all duration-300 cursor-pointer"
                style={{
                  borderColor: selectedGroup === i ? ACCENT + "66" : "rgba(255,255,255,0.3)",
                  color: selectedGroup === i ? ACCENT : "rgba(255,255,255,0.8)",
                  background: selectedGroup === i ? ACCENT + "0d" : "rgba(255,255,255,0.02)",
                }}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Joint Coordinates ─────────────────────────────── */}
        <div data-animate>
          <div className="h-px bg-white/5 mb-4" />
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span
                className="block w-2 h-2 rounded-full shrink-0"
                style={{ background: personColor, boxShadow: `0 0 6px ${personColor}55` }}
              />
              <span className="text-md text-white/85 uppercase">
                {poseCount > 1 ? `${personLabel} — Joints` : "Joint Coordinates"}
              </span>
            </div>
            <span className="text-md text-white/15 font-heading">
              {displayedIndices.length}
            </span>
          </div>

          {activeData.length === 0 ? (
            <div className="border border-white/5 bg-white/2 p-6 text-center">
              <p className="text-sm text-white/30 uppercase tracking-widest font-heading">
                Awaiting pose data…
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {displayedIndices.map((idx) => {
                const lm = activeData[idx];
                if (!lm) return null;
                const vis = lm.visibility ?? 0;
                return (
                  <div
                    key={idx}
                    className="border border-white/5 bg-white/2 p-3 backdrop-blur-sm"
                    style={{ transition: "all 0.3s cubic-bezier(0.5, 0, 0, 1)" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = personColor + "26";
                      e.currentTarget.style.background = personColor + "08";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)";
                      e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                    }}
                  >
                    {/* Joint header */}
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="text-3xl font-heading leading-none"
                        style={{ color: personColor, textShadow: `0 0 12px ${personColor}55` }}
                      >
                        {String(idx).padStart(2, "0")}
                      </span>
                      <span
                        className="block w-1 h-1 shrink-0"
                        style={{ background: personColor }}
                      />
                      <span className="text-sm font-bold uppercase text-white/75">
                        {LANDMARK_NAMES[idx]}
                      </span>
                      {/* Visibility badge */}
                      <span
                        className="text-xs ml-auto px-2 py-0.5 uppercase tracking-wider"
                        style={{
                          color: vis > 0.7 ? "#30D158" : vis > 0.4 ? "#FF9500" : "#FF3B30",
                          background:
                            (vis > 0.7 ? "#30D158" : vis > 0.4 ? "#FF9500" : "#FF3B30") + "12",
                          border: `1px solid ${
                            vis > 0.7 ? "#30D158" : vis > 0.4 ? "#FF9500" : "#FF3B30"
                          }22`,
                        }}
                      >
                        {(vis * 100).toFixed(0)}%
                      </span>
                    </div>

                    {/* Coordinate grid */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { axis: "X", val: lm.x },
                        { axis: "Y", val: lm.y },
                        { axis: "Z", val: lm.z },
                      ].map(({ axis, val }) => (
                        <div
                          key={axis}
                          className="border border-white/5 bg-black/30 px-2 py-1.5"
                        >
                          <span className="text-xs text-white/40 uppercase block">
                            {axis}
                          </span>
                          <span className="text-sm font-mono text-white/80">
                            {val?.toFixed(4) ?? "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────── */}
        <div data-animate className="mt-auto pt-4">
          <div className="h-px bg-white/5 mb-4" />
          <div className="flex items-center justify-between">
            <span className="text-xl text-white/80 font-heading">
              POSE CAPTURE ENGINE
            </span>
            <span className="text-xl tracking-wide text-white/80 font-heading">
              BUILD 2026.02
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
