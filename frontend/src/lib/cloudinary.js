/**
 * Cloudinary URL transforms.
 *
 * Why: the gallery's source images are 3000–4000px wide originals,
 * and the rendered cards are 240–500px tall. Serving the originals
 * meant ~8.7MB on first load (per the audit) plus lots of decode work
 * on the GPU as each card faded in. Cloudinary supports inline URL
 * transforms — `w_<width>,q_auto,f_auto` resizes server-side and
 * picks WebP/AVIF when the browser supports it. Same source URL, way
 * less bytes + decode time.
 *
 * Pattern: any `https://res.cloudinary.com/<cloud>/image/upload/v<ver>/<id>`
 * URL becomes
 *   `https://res.cloudinary.com/<cloud>/image/upload/<transforms>/v<ver>/<id>`
 * by inserting the transform segment right after `/upload/`.
 *
 * Non-Cloudinary URLs pass through unchanged.
 */

/**
 * @param {string} url Original Cloudinary URL.
 * @param {number} width Target width in CSS pixels (Cloudinary will
 *   factor in DPR via `dpr_auto`).
 * @param {object} [opts]
 * @param {"low"|"good"|"best"} [opts.quality="good"]
 *   "low" → q_auto:eco (more aggressive, fine for thumbs),
 *   "good" → q_auto (balanced default),
 *   "best" → q_auto:best (lightbox / featured hero).
 * @returns {string}
 */
export function cloudinaryImg(url, width, opts = {}) {
  if (typeof url !== "string") return url;
  if (!url.includes("res.cloudinary.com")) return url;
  if (!url.includes("/image/upload/")) return url;

  const quality = opts.quality === "low"  ? "q_auto:eco"
                : opts.quality === "best" ? "q_auto:best"
                : "q_auto";
  // Order of transforms doesn't matter to Cloudinary, but listing
  // width first keeps the URL readable in the network tab.
  const transforms = `w_${Math.round(width)},${quality},f_auto,dpr_auto`;
  return url.replace("/image/upload/", `/image/upload/${transforms}/`);
}

/**
 * Video posters / thumbnails — Cloudinary can extract a frame from a
 * video upload as an image at any width. Useful when we want a
 * lightweight still on the gallery card and only load the MP4 if the
 * user actually clicks to play.
 */
export function cloudinaryVideoPoster(url, width) {
  if (typeof url !== "string") return null;
  if (!url.includes("res.cloudinary.com")) return null;
  if (!url.includes("/video/upload/")) return null;
  // /video/upload/<id>.mp4 → /video/upload/<transforms>/<id>.jpg
  return url
    .replace("/video/upload/", `/video/upload/w_${Math.round(width)},q_auto,f_auto,so_1/`)
    .replace(/\.(mp4|mov|webm)$/, ".jpg");
}
