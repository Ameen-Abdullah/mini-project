const mockData = {
  serverStatus: 200,
  riskLevel: "high",
  injuredJoints: [
    {
      name: "Rib Cage",
      side: "Right Side",
      coordinates: { x: 0.1, y: 0.5, z: 0.15 },
      description:
        "Contusion detected on lower right ribs following collision event in match 41.",
      },
    {
      name: "Tibia",
      side: "Left Leg",
      coordinates: { x: 0.1, y: -0.15, z: 0. },
      description:
        "Repetitive strain on the tibial shaft. Shin splint indicators present — recommend reduced training load.",
    },
    {
      name: "Femur",
      side: "Right side",
      coordinates: { x: -0.12, y: -0.55, z: 0.05 },
      description:
        "High impact stress detected on the lower femur. Risk of stress fracture elevated after repeated sprints.",
    },
  ],
  playerMetrics: {
    fatigueLevel: "85%",
    recentImpactForce: "4.2G",
    heartRate: "168 BPM",
    sprintDistance: "2.4 km",
    matchesPlayed: 42,
    trainingLoad: "High",
  },
  playerInfo: {
    name: "Marcus Okafor",
    position: "Centre-Back",
    age: 24,
    team: "FC Meridian",
  },
  lastScanTime: "2026-02-25T14:32:00Z",
};

export default mockData;
