import { createRoot } from "react-dom/client";
import { useToolOutput, useTheme } from "../hooks.js";
import "../styles.css";

function ExportWidget() {
  const data = useToolOutput();
  const theme = useTheme();
  if (!data) return <div className="loading">Loading...</div>;
  return (
    <div className={theme === "dark" ? "dark" : ""}>
      <div className="title">Export Data</div>
      <pre style={{ fontSize: 12, overflow: "auto", maxHeight: 400 }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<ExportWidget />);
