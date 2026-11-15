const base = import.meta.env.BASE_URL;

export const SPACE_PHOTOS = Object.freeze({
  marble: `${base}backgrounds/blue-marble.jpg`,
  limb: `${base}backgrounds/earth-limb.jpg`,
  night: `${base}backgrounds/night-earth.jpg`,
});

/** Decorative NASA photograph. Hidden from assistive technology. */
export default function SpaceWash({ photo }) {
  return <div className="space-wash" aria-hidden="true" style={{ backgroundImage: `url("${photo}")` }} />;
}
