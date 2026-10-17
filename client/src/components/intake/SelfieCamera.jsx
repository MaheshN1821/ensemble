import { useEffect, useRef, useState } from 'react';
import Button from '../Button.jsx';

/**
 * Live selfie capture with the browser camera. Used in place of YouCam's JS Camera Kit, whose loading
 * steps are still to be confirmed against the docs (see docs/CONTEXT.md). The captured photo goes through
 * the same checks and upload path as a chosen file, so swapping in Camera Kit later only changes this file.
 */
export default function SelfieCamera({ onCapture, onCancel }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser cannot open the camera. Choose a photo from your device instead.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        const v = videoRef.current;
        v.srcObject = stream;
        await v.play();
        setReady(true);
      } catch (e) {
        setError(
          e?.name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow the camera for this site in your browser settings, or choose a photo from your device.'
            : 'We could not start the camera. Check that no other app is using it, or choose a photo from your device.',
        );
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const capture = () => {
    const v = videoRef.current;
    if (!v?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext('2d').drawImage(v, 0, 0); // un-mirrored, so the photo matches reality
    canvas.toBlob((blob) => blob && onCapture(new File([blob], 'selfie.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.92);
  };

  if (error) {
    return (
      <div>
        <p role="alert" className="rounded-xl bg-alert-wash px-4 py-3 text-[15px] text-alert">{error}</p>
        <div className="mt-4"><Button variant="secondary" onClick={onCancel}>Back</Button></div>
      </div>
    );
  }

  return (
    <div>
      <div className="relative aspect-square w-full max-w-sm overflow-hidden rounded-t-full bg-ink">
        <video ref={videoRef} playsInline muted className="size-full -scale-x-100 object-cover" aria-label="Camera preview" />
        {!ready && <p className="absolute inset-0 grid place-items-center text-sm text-white">Starting the camera…</p>}
      </div>
      <p className="mt-3 max-w-[44ch] text-[14px] leading-relaxed text-ink-soft">
        Face a window or lamp so the light is even on your face. No filters, and keep your face in the middle.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button onClick={capture} disabled={!ready}>Take selfie</Button>
        <Button variant="quiet" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
