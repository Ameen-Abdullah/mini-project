import { useState } from "react";
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
    <div className="w-full h-full flex">
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
