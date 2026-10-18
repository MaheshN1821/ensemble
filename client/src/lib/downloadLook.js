const load = (url) => new Promise((resolve, reject) => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('image failed to load'));
  img.src = url;
});

/**
 * Builds the look card as one picture (both panels side by side, with the AI preview label drawn into it) and downloads it.
 * Done in the browser, so nothing extra is sent anywhere. Throws a friendly error if the browser blocks it.
 */
export async function downloadLook(look) {
  const urls = [look.images.body?.url, look.images.face?.url].filter(Boolean);
  if (!urls.length) throw new Error('Nothing has been drawn yet.');
  let images;
  try { images = await Promise.all(urls.map(load)); } catch { throw new Error('Your browser could not prepare the picture. Open each image and save it instead.'); }

  const H = 1200;
  const widths = images.map((i) => Math.round((i.naturalWidth / i.naturalHeight) * H));
  const gap = 8;
  const W = widths.reduce((a, b) => a + b, 0) + gap * (images.length - 1);
  const bar = 96;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H + bar;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H + bar);
  let x = 0;
  images.forEach((img, i) => { ctx.drawImage(img, x, 0, widths[i], H); x += widths[i] + gap; });
  ctx.fillStyle = '#14122B';
  ctx.fillRect(0, H, W, bar);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '500 30px Outfit, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(look.label, 28, H + bar / 2);

  let blob;
  try { blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('empty'))), 'image/png')); } catch { throw new Error('Your browser blocked saving the picture. Open each image and save it instead.'); }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'ensemble-look.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
