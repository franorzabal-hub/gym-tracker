import { createRoot } from "react-dom/client";
import { useToolOutput } from "../hooks.js";
import { AppProvider } from "../app-context.js";
import "../styles.css";

function MeasurementsWidget() {
  const data = useToolOutput();
  if (!data) return <div className="loading">Loading...</div>;
  return (
    <div>
      <div className="title">Body Measurements</div>
      <pre style={{ fontSize: 12, overflow: "auto", maxHeight: 400 }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <AppProvider><MeasurementsWidget /></AppProvider>
);
