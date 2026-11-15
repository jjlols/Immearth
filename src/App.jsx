import React, { useEffect, useState } from "react";
import IntroOverlay from "./IntroOverlay.jsx";
import Jukebox from "./Jukebox.jsx";
import GuidePage from "./guide/GuidePage.jsx";
import DataPage from "./guide/DataPage.jsx";
import AccessPage from "./guide/AccessPage.jsx";
import LayerExplorer from "./layers/LayerExplorer.jsx";
import { VIEW_TITLES, viewFromLocation } from "./navigation.js";

export default function App() {
  const [view, setView] = useState(viewFromLocation);
  const [firstView] = useState(view);

  useEffect(() => {
    const sync = () => setView(viewFromLocation());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  useEffect(() => {
    document.title = VIEW_TITLES[view] || VIEW_TITLES.home;
  }, [view]);

  return (
    <>
      <IntroOverlay view={firstView} />
      {view === "home" && <GuidePage />}
      {view === "music" && <Jukebox />}
      {view === "layers" && <LayerExplorer />}
      {view === "data" && <DataPage />}
      {view === "access" && <AccessPage />}
    </>
  );
}
