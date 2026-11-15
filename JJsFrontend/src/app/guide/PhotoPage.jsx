import { useEffect, useState } from "react";
import guideCss from "../../site/styles.css?inline";
import PageSwitch from "../PageSwitch.jsx";

const FILES = ["photo.jpg", "photo.jpeg", "photo.png", "photo.webp", "photo.gif"];

function probe(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  });
}

export default function PhotoPage() {
  const [photo, setPhoto] = useState(null);

  useEffect(() => {
    let cancel = false;
    const folder = `${import.meta.env.BASE_URL}photo-of-the-day/`;
    (async () => {
      let text = "";
      try {
        const response = await fetch(`${folder}caption.txt`);
        if (response.ok) text = (await response.text()).trim();
      } catch { /* caption is optional */ }
      for (const file of FILES) {
        const url = `${folder}${file}`;
        if (await probe(url)) {
          if (!cancel) setPhoto({ url, text });
          return;
        }
      }
    })();
    return () => { cancel = true; };
  }, []);

  return (
    <>
      <style>{guideCss}</style>
      <a className="skip-link" href="#photo-folder-title">Skip to content</a>
      <header className="site-header">
        <div className="notice"><p>A NASA Space Apps Challenge 2026 project. This is not an official NASA website.</p></div>
        <div className="bar">
          <a className="wordmark" href="?view=guide" onClick={(event) => { event.preventDefault(); import("../navigation.js").then((nav) => nav.goToView("guide")); }}>
            <span className="mark" aria-hidden="true" />
            <span className="wordmark-text">Earth Jukebox</span>
          </a>
          <PageSwitch current="photo" />
        </div>
      </header>
      <main className="band">
        <p className="eyebrow">Photo folder</p>
        <h1 id="photo-folder-title" tabIndex={-1}>Space photo of the day</h1>
        <p>Put today’s picture in <code>public/photo-of-the-day</code>. The guide page loads it from there. You do not need to edit the page.</p>
        <ul className="checks">
          <li>Save the picture as <code>photo.jpg</code>, <code>photo.png</code>, or <code>photo.webp</code>.</li>
          <li>Write what the picture shows in <code>caption.txt</code>, in this same folder. That text is the description for people who cannot see the image.</li>
          <li>Replace both files when the photo changes. If more than one picture is here, <code>photo.jpg</code> is used first.</li>
        </ul>
        <figure className="photo-frame" hidden={!photo}>
          {photo && <img src={photo.url} alt={photo.text || "Space photo of the day."} />}
          <figcaption>{photo?.text}</figcaption>
        </figure>
        {!photo && <p>No photo file yet.</p>}
      </main>
      <footer className="site-footer">
        <div className="footer-inner">
          <div>
            <p className="footer-title">Earth Information Jukebox</p>
            <p>A NASA Space Apps Challenge project. Not an official NASA website.</p>
          </div>
        </div>
      </footer>
    </>
  );
}
