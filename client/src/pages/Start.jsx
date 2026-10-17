import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from '../hooks/useSession.js';
import { useIntake } from '../hooks/useIntake.js';
import Button from '../components/Button.jsx';
import Stepper from '../components/intake/Stepper.jsx';
import Consent from '../components/intake/Consent.jsx';
import Photos from '../components/intake/Photos.jsx';
import Details from '../components/intake/Details.jsx';
import Review from '../components/intake/Review.jsx';
import DeleteEverything from '../components/intake/DeleteEverything.jsx';
import { ErrorNote } from '../components/intake/fields.jsx';
import { useNavigate } from 'react-router-dom';

const firstIncomplete = (s) => {
  if (!s.consent?.over18) return 'consent';
  if (!s.photos.selfie || !s.photos.body) return 'photos';
  if (!s.preferences) return 'details';
  return 'review';
};

function Shell({ children }) {
  return <section className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">{children}</section>;
}

export default function Start() {
  const { session, error: sessionError, retry, reset } = useSession();
  const [deleted, setDeleted] = useState(false);
  const [step, setStep] = useState(null);
  const navigate = useNavigate();
  const onSessionLost = useCallback(() => { setStep(null); reset(); }, [reset]);
  const intake = useIntake(session?.sessionId, { onSessionLost });
  const { config, state } = intake;
  const initialised = useRef(false);

  // Resume where the person left off, once the saved state arrives.
  useEffect(() => {
    if (state && !initialised.current) {
      initialised.current = true;
      setStep(firstIncomplete(state));
    }
    if (!state) initialised.current = false;
  }, [state]);

  // Move keyboard and screen-reader focus to the new step's heading.
  const focusReady = useRef(false);
  useEffect(() => {
    if (!step) return;
    if (!focusReady.current) { focusReady.current = true; return; } // not on first load
    document.querySelector('[data-step-heading]')?.focus({ preventScroll: true });
  }, [step]);

  const go = (next) => { setStep(next); window.scrollTo({ top: 0 }); };

  const deleteEverything = async () => {
    await intake.deleteEverything();
    initialised.current = false;
    setStep(null);
    setDeleted(true);
    reset();
  };

  if (deleted) {
    return (
      <Shell>
        <h1 data-step-heading tabIndex={-1} className="text-[34px] font-light leading-[1.08] tracking-[-0.03em] outline-none sm:text-[44px]">Everything is deleted</h1>
        <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-ink-soft">Your photos, answers and consent were removed. Nothing about this session remains with us.</p>
        <div className="mt-8 flex gap-3">
          <Button onClick={() => setDeleted(false)}>Start again</Button>
          <Button to="/" variant="secondary">Back to home</Button>
        </div>
      </Shell>
    );
  }

  const failure = sessionError || intake.loadError;
  if (failure) {
    return (
      <Shell>
        <h1 className="text-[34px] font-light tracking-[-0.03em]">We could not start your session</h1>
        <ErrorNote error={failure} className="mt-6 max-w-lg" />
        <div className="mt-6"><Button onClick={sessionError ? retry : intake.reload}>Try again</Button></div>
      </Shell>
    );
  }

  if (!config || !state || !step) {
    return (
      <Shell>
        <p role="status" className="text-ink-soft">Getting ready…</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <Stepper current={step} />
      <div className="mt-10">
        {step === 'consent' && (
          <Consent
            initial={state.consent}
            onAccept={async (over18, ownPhotos) => {
              await intake.acceptConsent(over18, ownPhotos);
              go('photos');
            }}
          />
        )}
        {step === 'photos' && (
          <Photos config={config} state={state} actions={intake} onBack={() => go('consent')} onNext={() => go(state.preferences ? 'review' : 'details')} />
        )}
        {step === 'details' && (
          <Details
            config={config}
            saved={state.preferences}
            onBack={() => go('photos')}
            onSave={async (prefs) => { await intake.savePreferences(prefs); go('review'); }}
          />
        )}
        {step === 'review' && state.preferences && (
          <Review config={config} state={state} onEdit={go} onBack={() => go('details')} onConfirm={() => navigate('/profile')} />
        )}
      </div>
      <DeleteEverything onDelete={deleteEverything} />
    </Shell>
  );
}
