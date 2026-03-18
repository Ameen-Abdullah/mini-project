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
/*  Per-person color palette (up to 6 players)                        */
/* ------------------------------------------------------------------ */
const PERSON_COLORS = [
  { hex: "#39ff14", label: "Player 1" },
  { hex: "#00d4ff", label: "Player 2" },
  { hex: "#ff3bff", label: "Player 3" },
  { hex: "#ffb700", label: "Player 4" },
  { hex: "#ff3b30", label: "Player 5" },
  { hex: "#a78bfa", label: "Player 6" },
];

const MAX_POSES = 6;

/* ------------------------------------------------------------------ */
/*  Biomechanical Analysis Utilities                                  */
/* ------------------------------------------------------------------ */
function calcAngle(a, b, c) {
  const ax = a.x - b.x, ay = a.y - b.y;
  const cx = c.x - b.x, cy = c.y - b.y;
  const dot = ax * cx + ay * cy;
  const mag = Math.sqrt(ax * ax + ay * ay) * Math.sqrt(cx * cx + cy * cy);
  if (mag < 1e-6) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, dot / mag))) * 180) / Math.PI;
}

function classifyFootballMovement(lm, prevLm) {
  if (!lm || lm.length < 33) return null;

  const nose      = lm[0];
  const lShoulder = lm[11], rShoulder = lm[12];
  const lWrist    = lm[15], rWrist    = lm[16];
  const lHip      = lm[23], rHip      = lm[24];
  const lKnee     = lm[25], rKnee     = lm[26];
  const lAnkle    = lm[27], rAnkle    = lm[28];

  const lKneeAngle = calcAngle(lHip, lKnee, lAnkle);
  const rKneeAngle = calcAngle(rHip, rKnee, rAnkle);

  const hipMidY      = (lHip.y + rHip.y) / 2;
  const hipMidX      = (lHip.x + rHip.x) / 2;
  const shoulderMidX = (lShoulder.x + rShoulder.x) / 2;

  const lAnkleRelY = lAnkle.y - hipMidY;
  const rAnkleRelY = rAnkle.y - hipMidY;
  const avgKneeAngle = (lKneeAngle + rKneeAngle) / 2;
  const trunkLean  = Math.abs(shoulderMidX - hipMidX);

  /* ---- Temporal motion features (frame-to-frame) ---- */
  let hipRise = 0;
  let noseRise = 0;
  let ankleRise = 0;
  if (prevLm && prevLm.length >= 33) {
    const prevNose = prevLm[0];
    const prevLHip = prevLm[23], prevRHip = prevLm[24];
    const prevLAnkle = prevLm[27], prevRAnkle = prevLm[28];
    const prevHipMidY = (prevLHip.y + prevRHip.y) / 2;
    const prevAnkleAvgY = (prevLAnkle.y + prevRAnkle.y) / 2;
    const currAnkleAvgY = (lAnkle.y + rAnkle.y) / 2;

    hipRise = prevHipMidY - hipMidY;
    noseRise = prevNose.y - nose.y;
    ankleRise = prevAnkleAvgY - currAnkleAvgY;
  }

  /* ---- Risk Pattern Detection ---- */
  const risks = [];

  // Knee valgus: knee width significantly narrower than ankle width under load
  const kneeWidth  = Math.abs(lKnee.x - rKnee.x);
  const ankleWidth = Math.abs(lAnkle.x - rAnkle.x);
  if (avgKneeAngle < 155 && ankleWidth > 0.01 && kneeWidth < ankleWidth * 0.65) {
    risks.push({ label: "Knee Valgus", severity: "high", joint: "Knees", color: "#FF3B30" });
  }

  // Hip drop: asymmetric hip height
  if (Math.abs(lHip.y - rHip.y) > 0.045) {
    const side = lHip.y > rHip.y ? "L" : "R";
    risks.push({ label: `Hip Drop (${side})`, severity: "medium", joint: "Hip", color: "#FF9500" });
  }

  // Trunk lateral lean
  if (trunkLean > 0.07) {
    risks.push({ label: "Trunk Lean", severity: "low", joint: "Spine", color: "#FFD60A" });
  }

  // Stride asymmetry: large difference in knee angles during motion
  if (Math.abs(lKneeAngle - rKneeAngle) > 45 && avgKneeAngle < 160) {
    risks.push({ label: "Stride Asymmetry", severity: "medium", joint: "Knees", color: "#FF9500" });
  }

  /* ---- Football Action Classification ---- */
  let action = "STANDING";
  let confidence = 0.92;

  if (Math.abs(nose.y - lAnkle.y) < 0.2 || Math.abs(nose.y - rAnkle.y) < 0.2) {
    action = "FALLEN / PRONE";
    confidence = 0.88;
  } else if (
    hipRise > 0.012 &&
    noseRise > 0.014 &&
    ankleRise > 0.01 &&
    avgKneeAngle > 130
  ) {
    action = "JUMPING";
    confidence = 0.9;
  } else if (lAnkleRelY < 0.12) {
    action = "LEFT LEG KICK";
    confidence = 0.83;
  } else if (rAnkleRelY < 0.12) {
    action = "RIGHT LEG KICK";
    confidence = 0.83;
  } else if (lWrist.y < nose.y - 0.05 && rWrist.y < nose.y - 0.05) {
    action = "HEADING";
    confidence = 0.79;
  } else if (lKneeAngle < 115 && rKneeAngle < 115) {
    action = "SQUAT / TACKLE";
    confidence = 0.86;
  } else if ((lKneeAngle < 105 && rKneeAngle > 145) || (rKneeAngle < 105 && lKneeAngle > 145)) {
    action = "LUNGE / CUT";
    confidence = 0.84;
  } else if (lKneeAngle < 140 && rKneeAngle < 140 && trunkLean > 0.04) {
    action = "DECELERATING";
    confidence = 0.74;
  } else if (Math.abs(lKneeAngle - rKneeAngle) > 25 && (lKneeAngle < 165 || rKneeAngle < 165)) {
    action = "RUNNING";
    confidence = 0.77;
  } else if (lKneeAngle > 160 && rKneeAngle > 160) {
    action = "STANDING";
    confidence = 0.92;
  } else {
    action = "IN MOTION";
    confidence = 0.65;
  }

  return {
    action,
    confidence,
    risks,
    angles: {
      lKnee: Math.round(lKneeAngle),
      rKnee: Math.round(rKneeAngle),
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Action visual config                                              */
/* ------------------------------------------------------------------ */
const ACTION_CONFIG = {
  "STANDING":       { icon: "◼", color: "#39ff14" },
  "RUNNING":        { icon: "▶▶", color: "#00d4ff" },
  "JUMPING":        { icon: "▲", color: "#00d4ff" },
  "LEFT LEG KICK":  { icon: "◀", color: "#ffb700" },
  "RIGHT LEG KICK": { icon: "▶", color: "#ffb700" },
  "HEADING":        { icon: "●", color: "#ff3bff" },
  "SQUAT / TACKLE": { icon: "▼", color: "#ff9500" },
  "LUNGE / CUT":    { icon: "◆", color: "#00d4ff" },
  "DECELERATING":   { icon: "■", color: "#ffb700" },
  "FALLEN / PRONE": { icon: "—", color: "#FF3B30" },
  "IN MOTION":      { icon: "~", color: "#a78bfa" },
};

/* ------------------------------------------------------------------ */
/*  DataCapture Page                                                  */
/* ------------------------------------------------------------------ */
export default function DataCapture() {
  const videoRef         = useRef(null);
  const canvasRef        = useRef(null);
  const containerRef     = useRef(null);
  const fileInputRef     = useRef(null);
  const poseLandmarkerRef = useRef(null);
  const animationFrameRef = useRef(null);
  const prevLandmarksRef   = useRef([]);
  const lastVideoTimeRef   = useRef(-1);
  const lastActionsRef     = useRef([]);
  const uploadedUrlRef     = useRef(null);
  const sessionStartRef    = useRef(performance.now());

  const [allLandmarks, setAllLandmarks]           = useState([]);
  const [allWorldLandmarks, setAllWorldLandmarks] = useState([]);
  const [poseCount, setPoseCount]                 = useState(0);
  const [isLoading, setIsLoading]                 = useState(true);
  const [isStreaming, setIsStreaming]              = useState(false);
  const [sourceMode, setSourceMode]               = useState("camera");
  const [sourceLabel, setSourceLabel]             = useState("Live Camera");
  const [error, setError]                         = useState(null);
  const [selectedGroup, setSelectedGroup]         = useState(null);
  const [selectedPerson, setSelectedPerson]       = useState(0);
  const [fps, setFps]                             = useState(0);
  const [actionFeed, setActionFeed]               = useState([]);

  /* Movement analysis state */
  const [movementData, setMovementData] = useState([]);
  const [sessionStats, setSessionStats] = useState({
    framesAnalyzed: 0,
    riskEventFrames: 0,
    peakPlayerCount: 0,
    actionCounts: {},
  });

  const lastTimeRef   = useRef(performance.now());
  const frameCountRef = useRef(0);
  const statsRef      = useRef({ framesAnalyzed: 0, riskEventFrames: 0, peakPlayerCount: 0, actionCounts: {} });

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
    return () => { cancelled = true; };
  }, []);

  /* ---- Start / Stop camera ---- */
  const startCamera = async () => {
    if (isLoading || !poseLandmarkerRef.current) {
      setError("Model is still loading. Please wait before starting capture.");
      return;
    }

    stopCamera();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      if (videoRef.current) {
        setSourceMode("camera");
        setSourceLabel("Live Camera");
        setError(null);
        sessionStartRef.current = performance.now();
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsStreaming(true);
      }
    } catch (err) {
      setError("Camera access denied. Please allow camera permissions.");
      console.error(err);
    }
  };

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
    if (uploadedUrlRef.current) {
      URL.revokeObjectURL(uploadedUrlRef.current);
      uploadedUrlRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setIsStreaming(false);
    setSourceMode("camera");
    setSourceLabel("Live Camera");
    setAllLandmarks([]);
    setAllWorldLandmarks([]);
    setPoseCount(0);
    setFps(0);
    setSelectedPerson(0);
    setMovementData([]);
    setActionFeed([]);
    prevLandmarksRef.current = [];
    lastActionsRef.current = [];
    lastVideoTimeRef.current = -1;
    sessionStartRef.current = performance.now();
    frameCountRef.current = 0;
    lastTimeRef.current = performance.now();
    statsRef.current = { framesAnalyzed: 0, riskEventFrames: 0, peakPlayerCount: 0, actionCounts: {} };
    setSessionStats({ framesAnalyzed: 0, riskEventFrames: 0, peakPlayerCount: 0, actionCounts: {} });
  }, []);

  const handleVideoUpload = useCallback(async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (isLoading || !poseLandmarkerRef.current) {
      setError("Model is still loading. Please wait before uploading a video.");
      return;
    }

    if (!file.type.startsWith("video/")) {
      setError("Please select a valid video file.");
      return;
    }

    stopCamera();
    const video = videoRef.current;
    if (!video) return;

    const fileUrl = URL.createObjectURL(file);
    uploadedUrlRef.current = fileUrl;
    setSourceMode("upload");
    setSourceLabel(file.name);
    setError(null);
    sessionStartRef.current = performance.now();

    try {
      video.srcObject = null;
      video.src = fileUrl;
      video.muted = true;
      video.loop = false;
      await video.play();
      setIsStreaming(true);
    } catch (err) {
      setError("Unable to play the uploaded video.");
      console.error(err);
    }
  }, [isLoading, stopCamera]);

  const replayUploadedVideo = useCallback(async () => {
    if (sourceMode !== "upload") return;
    const video = videoRef.current;
    if (!video) return;

    try {
      if (video.ended || video.currentTime >= Math.max(0, (video.duration || 0) - 0.05)) {
        video.currentTime = 0;
      }
      prevLandmarksRef.current = [];
      lastActionsRef.current = [];
      lastVideoTimeRef.current = -1;
      frameCountRef.current = 0;
      lastTimeRef.current = performance.now();
      sessionStartRef.current = performance.now();
      await video.play();
      setIsStreaming(true);
      setError(null);
    } catch (err) {
      setError("Unable to replay video.");
      console.error(err);
    }
  }, [sourceMode]);

  /* ---- Detection loop ---- */
  useEffect(() => {
    if (!isStreaming || !poseLandmarkerRef.current || !videoRef.current) return;

    const video  = videoRef.current;
    const canvas = canvasRef.current;
    const ctx    = canvas?.getContext("2d");
    const isMirrored = sourceMode === "camera";

    function detect() {
      if (!video || video.readyState < 2) {
        animationFrameRef.current = requestAnimationFrame(detect);
        return;
      }

      if (sourceMode === "upload") {
        if (video.ended) {
          setIsStreaming(false);
          return;
        }
        if (video.paused) {
          animationFrameRef.current = requestAnimationFrame(detect);
          return;
        }
        if (Math.abs(video.currentTime - lastVideoTimeRef.current) < 1e-4) {
          animationFrameRef.current = requestAnimationFrame(detect);
          return;
        }
        lastVideoTimeRef.current = video.currentTime;
      }

      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;

      const now = performance.now();
      const result = poseLandmarkerRef.current.detectForVideo(video, now);

      /* FPS counter */
      frameCountRef.current++;
      if (now - lastTimeRef.current >= 1000) {
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastTimeRef.current   = now;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const numDetected = result.landmarks?.length ?? 0;

      if (numDetected > 0) {
        const drawingUtils = new DrawingUtils(ctx);
        const prevLandmarks = prevLandmarksRef.current;

        /* Classify movements for each detected person */
        const newMovementData = result.landmarks.map((lm, i) =>
          classifyFootballMovement(lm, prevLandmarks[i])
        );

        const eventTimeSec = sourceMode === "upload"
          ? video.currentTime
          : (performance.now() - sessionStartRef.current) / 1000;
        const actionEvents = [];
        newMovementData.forEach((mv, i) => {
          if (!mv?.action) return;
          const lastAction = lastActionsRef.current[i];
          if (lastAction !== mv.action) {
            const cfg = ACTION_CONFIG[mv.action] ?? ACTION_CONFIG["IN MOTION"];
            actionEvents.push({
              id: `${eventTimeSec.toFixed(3)}-${i}-${mv.action}`,
              time: eventTimeSec,
              player: PERSON_COLORS[i % PERSON_COLORS.length].label,
              action: mv.action,
              icon: cfg.icon,
              color: cfg.color,
            });
            lastActionsRef.current[i] = mv.action;
          }
        });
        if (lastActionsRef.current.length > numDetected) {
          lastActionsRef.current = lastActionsRef.current.slice(0, numDetected);
        }
        if (actionEvents.length > 0) {
          setActionFeed((prev) => [...prev, ...actionEvents].slice(-120));
        }

        /* Save current frame for next-frame temporal detection */
        prevLandmarksRef.current = result.landmarks.map((lm) =>
          lm.map((p) => ({ ...p }))
        );

        /* Update session stats */
        const s = statsRef.current;
        s.framesAnalyzed++;
        if (numDetected > s.peakPlayerCount) s.peakPlayerCount = numDetected;
        const hasRisk = newMovementData.some((m) => m?.risks?.length > 0);
        if (hasRisk) s.riskEventFrames++;
        newMovementData.forEach((m) => {
          if (m?.action) {
            s.actionCounts[m.action] = (s.actionCounts[m.action] ?? 0) + 1;
          }
        });
        /* Throttle React state update for stats to every ~30 frames */
        if (s.framesAnalyzed % 30 === 0) {
          setSessionStats({ ...s, actionCounts: { ...s.actionCounts } });
        }

        for (let p = 0; p < numDetected; p++) {
          const color  = PERSON_COLORS[p % PERSON_COLORS.length].hex;
          const label  = PERSON_COLORS[p % PERSON_COLORS.length].label;
          const mvData = newMovementData[p];
          const actionCfg = ACTION_CONFIG[mvData?.action] ?? ACTION_CONFIG["IN MOTION"];

          /* Draw skeleton */
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

          /* Draw player label + action near nose */
          const nose = result.landmarks[p][0];
          if (nose) {
            const lx = nose.x * canvas.width;
            const ly = nose.y * canvas.height - 30;

            ctx.save();
            if (isMirrored) {
              ctx.translate(lx, ly);
              ctx.scale(-1, 1);
              ctx.translate(-lx, -ly);
            }
            ctx.textAlign = "center";

            /* Player badge */
            ctx.font = "bold 13px 'Helvetica', sans-serif";
            const pm = ctx.measureText(label);
            const pw = pm.width + 14, ph = 20;
            ctx.fillStyle   = color + "33";
            ctx.strokeStyle = color + "88";
            ctx.lineWidth   = 1;
            ctx.beginPath();
            ctx.roundRect(lx - pw / 2, ly - ph + 4, pw, ph, 4);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = color;
            ctx.fillText(label, lx, ly);

            /* Action badge below */
            if (mvData?.action) {
              const actionText = `${actionCfg.icon} ${mvData.action}`;
              ctx.font = "bold 11px 'Helvetica', sans-serif";
              const am  = ctx.measureText(actionText);
              const aw  = am.width + 12, ah = 18;
              const ay  = ly + 22;
              ctx.fillStyle   = actionCfg.color + "25";
              ctx.strokeStyle = actionCfg.color + "77";
              ctx.lineWidth   = 1;
              ctx.beginPath();
              ctx.roundRect(lx - aw / 2, ay - ah + 4, aw, ah, 4);
              ctx.fill();
              ctx.stroke();
              ctx.fillStyle = actionCfg.color;
              ctx.fillText(actionText, lx, ay);
            }

            ctx.restore();
          }
        }

        setAllLandmarks(result.landmarks.map((l) => [...l]));
        setAllWorldLandmarks((result.worldLandmarks ?? []).map((l) => [...l]));
        setPoseCount(numDetected);
        setMovementData(newMovementData);
      } else {
        setAllLandmarks([]);
        setAllWorldLandmarks([]);
        setPoseCount(0);
        setMovementData([]);
        prevLandmarksRef.current = [];
        lastActionsRef.current = [];
      }

      animationFrameRef.current = requestAnimationFrame(detect);
    }

    detect();
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isStreaming, sourceMode]);

  /* ---- Cleanup on unmount ---- */
  useEffect(() => {
    return () => {
      stopCamera();
      poseLandmarkerRef.current?.close();
    };
  }, [stopCamera]);

  /* ---- Derived values ---- */
  const safePerson    = Math.min(selectedPerson, Math.max(poseCount - 1, 0));
  const displayedIndices = selectedGroup !== null
    ? JOINT_GROUPS[selectedGroup].indices
    : Array.from({ length: 33 }, (_, i) => i);

  const personWorldLm  = allWorldLandmarks[safePerson] ?? [];
  const personLm       = allLandmarks[safePerson] ?? [];
  const activeData     = personWorldLm.length > 0 ? personWorldLm : personLm;
  const personColor    = PERSON_COLORS[safePerson % PERSON_COLORS.length].hex;
  const personLabel    = PERSON_COLORS[safePerson % PERSON_COLORS.length].label;
  const currentMvData  = movementData[safePerson];
  const actionCfg      = ACTION_CONFIG[currentMvData?.action] ?? ACTION_CONFIG["IN MOTION"];
  const formatTime = (seconds) => {
    const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const mins = Math.floor(safe / 60);
    const secs = (safe % 60).toFixed(2).padStart(5, "0");
    return `${String(mins).padStart(2, "0")}:${secs}`;
  };

  /* Top action for session stats */
  const topAction = Object.entries(sessionStats.actionCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

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
          className="absolute inset-0 w-full h-full object-contain"
          style={{ transform: sourceMode === "camera" ? "scaleX(-1)" : "none" }}
          playsInline
          muted
          controls={sourceMode === "upload"}
          onPlay={() => {
            if (sourceMode === "upload" && poseLandmarkerRef.current) setIsStreaming(true);
          }}
          onEnded={() => {
            if (sourceMode === "upload") {
              setIsStreaming(false);
              prevLandmarksRef.current = [];
              lastActionsRef.current = [];
              lastVideoTimeRef.current = -1;
              if (videoRef.current) {
                videoRef.current.currentTime = 0;
              }
            }
          }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          style={{ transform: sourceMode === "camera" ? "scaleX(-1)" : "none", pointerEvents: "none" }}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleVideoUpload}
        />

        {/* Overlay controls */}
        {!isStreaming && sourceMode !== "upload" && (
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
                <p className="text-lg text-red-400 uppercase tracking-wider font-heading mb-2">Error</p>
                <p className="text-sm text-white/50">{error}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <button
                  data-animate
                  onClick={startCamera}
                  className="px-8 py-3 border text-lg uppercase tracking-widest font-heading transition-all duration-300 cursor-pointer"
                  style={{ borderColor: ACCENT + "44", color: ACCENT, background: ACCENT + "08" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = ACCENT + "1a"; e.currentTarget.style.borderColor = ACCENT + "88"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = ACCENT + "08"; e.currentTarget.style.borderColor = ACCENT + "44"; }}
                >
                  Start Live Capture
                </button>
                <button
                  data-animate
                  onClick={() => fileInputRef.current?.click()}
                  className="px-8 py-3 border text-sm uppercase tracking-widest font-heading transition-all duration-300 cursor-pointer"
                  style={{ borderColor: "#00d4ff44", color: "#00d4ff", background: "#00d4ff08" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#00d4ff1a"; e.currentTarget.style.borderColor = "#00d4ff88"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#00d4ff08"; e.currentTarget.style.borderColor = "#00d4ff44"; }}
                >
                  Upload Video
                </button>
              </div>
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
              {sourceMode === "upload" ? "Video" : "Live"} — {fps} FPS · {poseCount} {poseCount === 1 ? "player" : "players"}
            </span>
          </div>
        )}

        {isStreaming && (
          <div className="absolute top-10 left-4 z-10">
            <span className="text-[10px] uppercase tracking-widest text-white/45 font-heading">
              Source: {sourceLabel}
            </span>
          </div>
        )}

        {/* Movement overlay badge (top-right) */}
        {isStreaming && currentMvData && (
          <div
            className={`absolute ${sourceMode === "upload" ? "top-32" : "top-4"} right-4 z-10 px-3 py-1.5 border text-xs uppercase tracking-widest font-heading`}
            style={{
              borderColor: actionCfg.color + "55",
              color: actionCfg.color,
              background: actionCfg.color + "12",
            }}
          >
            {actionCfg.icon} {currentMvData.action}
          </div>
        )}

        {/* Stop button */}
        {isStreaming && sourceMode === "camera" && (
          <button
            onClick={stopCamera}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 px-6 py-2 border text-sm uppercase tracking-widest font-heading transition-all duration-300 cursor-pointer"
            style={{ borderColor: "#FF3B30" + "44", color: "#FF3B30", background: "#FF3B30" + "08" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#FF3B30" + "1a"; e.currentTarget.style.borderColor = "#FF3B30" + "88"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#FF3B30" + "08"; e.currentTarget.style.borderColor = "#FF3B30" + "44"; }}
          >
            Stop Capture
          </button>
        )}

        {sourceMode === "upload" && (
          <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 border text-[10px] uppercase tracking-widest font-heading transition-all duration-300 cursor-pointer"
              style={{ borderColor: "#00d4ff55", color: "#00d4ff", background: "#00d4ff10" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#00d4ff22"; e.currentTarget.style.borderColor = "#00d4ffaa"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#00d4ff10"; e.currentTarget.style.borderColor = "#00d4ff55"; }}
            >
              Reupload Video
            </button>
            <button
              onClick={replayUploadedVideo}
              className="px-3 py-1.5 border text-[10px] uppercase tracking-widest font-heading transition-all duration-300 cursor-pointer"
              style={{ borderColor: "#39ff1455", color: "#39ff14", background: "#39ff1410" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#39ff1422"; e.currentTarget.style.borderColor = "#39ff14aa"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#39ff1410"; e.currentTarget.style.borderColor = "#39ff1455"; }}
            >
              Replay
            </button>
            <button
              onClick={stopCamera}
              className="px-3 py-1.5 border text-[10px] uppercase tracking-widest font-heading transition-all duration-300 cursor-pointer"
              style={{ borderColor: "#FF3B30" + "55", color: "#FF3B30", background: "#FF3B30" + "10" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#FF3B30" + "22"; e.currentTarget.style.borderColor = "#FF3B30" + "aa"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#FF3B30" + "10"; e.currentTarget.style.borderColor = "#FF3B30" + "55"; }}
            >
              Close Video
            </button>
          </div>
        )}
      </div>

      {/* ═══ Right: Analysis Panel ═══════════════════════════ */}
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
            className="text-md font-sans text-white/75 text-center uppercase hover:text-white/80 transition-colors duration-300"
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
                  ? `Tracking ${poseCount} ${poseCount === 1 ? "Player" : "Players"}`
                  : "Standby"}
              </span>
            </div>
            <span className="text-md text-white/75 font-sans">
              MediaPipe Pose · {sourceMode === "upload" ? "Video" : "Camera"}
            </span>
          </div>
        </div>

        {/* ── Player Count ──────────────────────────────────── */}
        <div data-animate>
          <div className="h-px bg-white/5 mb-4" />
          <span className="text-xs font-sans text-white/75 uppercase block mb-2">
            Players Detected
          </span>
          <h2 className="text-6xl mb-1 font-heading">
            {poseCount > 0
              ? `${poseCount} ${poseCount === 1 ? "PLAYER" : "PLAYERS"}`
              : "NO PLAYER"}
          </h2>
          <p className="text-md font-sans text-white/75 tracking-wide">
            {poseCount > 0
              ? `${poseCount * 33} total landmarks · ${
                  allWorldLandmarks.length > 0 ? "3D World" : "2D Normalized"
                } coordinates`
              : "Waiting for detection…"}
          </p>
        </div>

        {/* ── Movement Analysis ─────────────────────────────── */}
        {isStreaming && (
          <div data-animate>
            <div className="h-px bg-white/5 mb-4" />
            <span className="text-xs font-sans text-white/75 uppercase block mb-3">
              Movement Analysis — {personLabel}
            </span>

            {currentMvData ? (
              <div className="flex flex-col gap-3">
                {/* Detected action */}
                <div
                  className="border p-4 flex items-center justify-between"
                  style={{
                    borderColor: actionCfg.color + "44",
                    background: actionCfg.color + "08",
                  }}
                >
                  <div>
                    <span className="text-xs text-white/40 uppercase block mb-1">
                      Detected Action
                    </span>
                    <span
                      className="text-2xl font-heading"
                      style={{ color: actionCfg.color }}
                    >
                      {actionCfg.icon} {currentMvData.action}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-white/40 uppercase block mb-1">
                      Confidence
                    </span>
                    <span
                      className="text-xl font-heading"
                      style={{ color: actionCfg.color }}
                    >
                      {(currentMvData.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                {/* Knee angle meters */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { side: "L Knee", angle: currentMvData.angles.lKnee },
                    { side: "R Knee", angle: currentMvData.angles.rKnee },
                  ].map(({ side, angle }) => {
                    const pct = Math.min(100, Math.max(0, ((angle - 60) / (180 - 60)) * 100));
                    const col = angle < 110 ? "#FF3B30" : angle < 140 ? "#FF9500" : "#39ff14";
                    return (
                      <div key={side} className="border border-white/5 bg-white/2 p-3">
                        <span className="text-xs text-white/40 uppercase block mb-2">{side}</span>
                        <span
                          className="text-2xl font-heading block mb-2"
                          style={{ color: col }}
                        >
                          {angle}°
                        </span>
                        <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-150"
                            style={{ width: `${pct}%`, background: col }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* All players quick-view */}
                {poseCount > 1 && (
                  <div className="border border-white/5 bg-white/2 p-3">
                    <span className="text-xs text-white/40 uppercase block mb-2">
                      All Players
                    </span>
                    <div className="flex flex-col gap-1.5">
                      {movementData.map((md, i) => {
                        if (!md) return null;
                        const pc   = PERSON_COLORS[i % PERSON_COLORS.length];
                        const acfg = ACTION_CONFIG[md.action] ?? ACTION_CONFIG["IN MOTION"];
                        return (
                          <div key={i} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span
                                className="block w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ background: pc.hex }}
                              />
                              <span className="text-xs text-white/60 font-heading">{pc.label}</span>
                            </div>
                            <span
                              className="text-xs font-heading"
                              style={{ color: acfg.color }}
                            >
                              {acfg.icon} {md.action}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="border border-white/5 bg-white/2 p-6 text-center">
                <p className="text-sm text-white/30 uppercase tracking-widest font-heading">
                  Awaiting movement data…
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── Biomechanical Risk Alerts ──────────────────────── */}
        {isStreaming && (
          <div data-animate>
            <div className="h-px bg-white/5 mb-4" />
            <span className="text-xs font-sans text-white/75 uppercase block mb-3">
              Biomechanical Risk Alerts
            </span>

            {currentMvData?.risks?.length > 0 ? (
              <div className="flex flex-col gap-2">
                {currentMvData.risks.map((risk, i) => (
                  <div
                    key={i}
                    className="border p-3 flex items-center justify-between"
                    style={{
                      borderColor: risk.color + "44",
                      background: risk.color + "0a",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="block w-2 h-2 rounded-full shrink-0"
                        style={{ background: risk.color, boxShadow: `0 0 6px ${risk.color}` }}
                      />
                      <div>
                        <span
                          className="text-xl tracking-wide font-heading uppercase block"
                          style={{ color: risk.color }}
                        >
                          {risk.label}
                        </span>
                        <span className="text-xl text-white/40 uppercase">
                          {risk.joint}
                        </span>
                      </div>
                    </div>
                    <span
                      className="text-xl uppercase tracking-wider px-2 py-0.5 border font-heading"
                      style={{
                        color: risk.color,
                        borderColor: risk.color + "33",
                        background: risk.color + "12",
                      }}
                    >
                      {risk.severity}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="border p-3 flex items-center gap-3"
                style={{ borderColor: "#39ff14" + "22", background: "#39ff14" + "06" }}
              >
                <span
                  className="block w-2 h-2 rounded-full shrink-0"
                  style={{ background: "#39ff14", boxShadow: "0 0 6px #39ff14" }}
                />
                <span className="text-sm font-heading uppercase" style={{ color: "#39ff14" }}>
                  {poseCount > 0 ? "No Risk Patterns Detected" : "Awaiting pose data…"}
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── Player Selector ───────────────────────────────── */}
        {poseCount > 1 && (
          <div data-animate>
            <div className="h-px bg-white/5 mb-4" />
            <span className="text-md text-white/85 uppercase block mb-3">
              Tracked Players
            </span>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: poseCount }, (_, i) => {
                const c      = PERSON_COLORS[i % PERSON_COLORS.length];
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
                className="px-3 py-1.5 border text-xl uppercase font-heading transition-all duration-300 cursor-pointer"
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
                const lm  = activeData[idx];
                if (!lm) return null;
                const vis = lm.visibility ?? 0;
                return (
                  <div
                    key={idx}
                    className="border border-white/5 bg-white/2 p-3 backdrop-blur-sm"
                    style={{ transition: "all 0.3s cubic-bezier(0.5, 0, 0, 1)" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = personColor + "26";
                      e.currentTarget.style.background  = personColor + "08";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)";
                      e.currentTarget.style.background  = "rgba(255,255,255,0.02)";
                    }}
                  >
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
                      <span
                        className="text-xs ml-auto px-2 py-0.5 uppercase tracking-wider"
                        style={{
                          color: vis > 0.7 ? "#30D158" : vis > 0.4 ? "#FF9500" : "#FF3B30",
                          background: (vis > 0.7 ? "#30D158" : vis > 0.4 ? "#FF9500" : "#FF3B30") + "12",
                          border: `1px solid ${vis > 0.7 ? "#30D158" : vis > 0.4 ? "#FF9500" : "#FF3B30"}22`,
                        }}
                      >
                        {(vis * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { axis: "X", val: lm.x },
                        { axis: "Y", val: lm.y },
                        { axis: "Z", val: lm.z },
                      ].map(({ axis, val }) => (
                        <div key={axis} className="border border-white/5 bg-black/30 px-2 py-1.5">
                          <span className="text-xs text-white/40 uppercase block">{axis}</span>
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

        {/* ── Session Stats ─────────────────────────────────── */}
        {(sessionStats.framesAnalyzed > 0 || isStreaming) && (
          <div data-animate>
            <div className="h-px bg-white/5 mb-4" />
            <span className="text-xs font-sans text-white/75 uppercase block mb-3">
              Session Statistics
            </span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: "Frames Analysed", value: sessionStats.framesAnalyzed.toLocaleString() },
                { label: "Risk Event Frames", value: sessionStats.riskEventFrames.toLocaleString() },
                { label: "Peak Players", value: sessionStats.peakPlayerCount },
                { label: "Top Action", value: topAction, small: true },
              ].map(({ label, value, small }) => (
                <div key={label} className="border border-white/5 bg-white/2 p-3">
                  <span className="text-xs text-white/40 uppercase block mb-1">{label}</span>
                  <span
                    className={`font-heading ${small ? "text-sm" : "text-xl"}`}
                    style={{ color: ACCENT }}
                  >
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Action Event Feed ─────────────────────────────── */}
        {(actionFeed.length > 0 || isStreaming) && (
          <div data-animate>
            <div className="h-px bg-white/5 mb-4" />
            <span className="text-xs font-sans text-white/75 uppercase block mb-3">
              Detected Actions Timeline
            </span>
            {actionFeed.length === 0 ? (
              <div className="border border-white/5 bg-white/2 p-3">
                <span className="text-xs text-white/35 uppercase tracking-widest">
                  Waiting for action changes…
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-1">
                {[...actionFeed].reverse().slice(0, 18).map((evt) => (
                  <div
                    key={evt.id}
                    className="border border-white/5 bg-white/2 px-3 py-2 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-heading shrink-0" style={{ color: evt.color }}>
                        {evt.icon}
                      </span>
                      <span className="text-xs text-white/55 uppercase shrink-0">{evt.player}</span>
                      <span className="text-xs font-heading uppercase truncate" style={{ color: evt.color }}>
                        {evt.action}
                      </span>
                    </div>
                    <span className="text-[10px] text-white/35 font-mono ml-2 shrink-0">
                      {formatTime(evt.time)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

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
