import React, { useEffect, useState } from "react";
import Jukebox from "./Jukebox.jsx";
import GuidePage from "./guide/GuidePage.jsx";
import PhotoPage from "./guide/PhotoPage.jsx";
import LayerExplorer from "./layers/LayerExplorer.jsx";
import { viewFromLocation } from "./navigation.js";

export default function App() {
  const [view, setView] = useState(viewFromLocation);

  useEffect(() => {
    const sync = () => setView(viewFromLocation());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  return (
    <>
      {view === "music" && <Jukebox />}
      {view === "guide" && <GuidePage />}
      {view === "layers" && <LayerExplorer />}
      {view === "photo" && <PhotoPage />}
    </>
  );
}
