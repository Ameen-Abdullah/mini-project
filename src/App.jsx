import { useState } from "react";
import { Link } from "react-router-dom";
import SkeletonScene from "./components/SkeletonScene";
import Dashboard from "./components/Dashboard";
import mockData from "./data/mockData";
import "./App.css";

function getRiskColor(level) {
  switch (level) {
    case "high":
      return "#FF3B30"; // Red
    case "mid":
      return "#FF9500"; // Orange
    case "low":
    default:
      return "#30D158"; // Green
  }
}

function App() {
  const [data] = useState(mockData);
  const riskColor = getRiskColor(data.riskLevel);

  return (
    <div className="w-full h-full flex relative">
      {/* Nav link to DataCapture */}
      <Link
        to="/datacapture"
        className="absolute top-4 left-4 px-4 py-2 border text-lg bg-black z-90 uppercase tracking-widest font-heading transition-all duration-300"
        style={{
          borderColor: "rgba(57,255,20,0.27)",
          color: "#39ff14",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "rgba(57,255,20,100)";
          e.currentTarget.style.color = "black";
          e.currentTarget.style.borderColor = "rgba(57,255,20,0.53)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgba(0,0,0,100)";
          e.currentTarget.style.color = "#39ff14";
          e.currentTarget.style.borderColor = "rgba(57,255,20,0.27)";
        }}
      >
        Data Capture →
      </Link>
      <div className="w-[60%] h-full">
        <SkeletonScene injuredJoints={data.injuredJoints} riskColor={riskColor} />
      </div>
      <div className="w-[40%] h-full">
        <Dashboard data={data} riskColor={riskColor} />
      </div>
    </div>
  );
}

export default App;
