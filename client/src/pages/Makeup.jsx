import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.js';
import { readStoredSession } from '../lib/session.js';
import { rupees } from '../lib/format.js';
import Button from '../components/Button.jsx';

export default function Makeup() {
  const session = readStoredSession();
  const [occasion, setOccasion] = useState('office');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState(null);
  const [renderError, setRenderError] = useState(null);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [viewMode, setViewMode] = useState('preview'); // 'preview' | 'original'

  // Load makeup recommendations for selected occasion
  useEffect(() => {
    let ignore = false;
    async function loadRecommendations() {
      setLoading(true);
      setError(null);
      try {
        const res = await api(`/api/makeup/recommendations?occasion=${occasion}`, {
          sessionId: session?.sessionId,
        });
        if (!ignore) {
          setData(res);
          const initialIds = (res.recommended || []).map((p) => p.id);
          setSelectedProductIds(initialIds);
          setPreviewUrl(null);
        }
      } catch (err) {
        if (!ignore) setError(err.message || 'Could not load makeup recommendations.');
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    loadRecommendations();
    return () => { ignore = true; };
  }, [occasion, session?.sessionId]);

  const toggleProduct = (id) => {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((pId) => pId !== id) : [...prev, id],
    );
  };

  const handleApplyMakeup = async () => {
    if (!session?.sessionId) {
      setRenderError('Session expired. Please visit /start to begin a new session.');
      return;
    }
    if (!data?.selfie?.hasPhoto) {
      setRenderError('Please upload a selfie or choose a sample photo at /start first.');
      return;
    }
    if (!selectedProductIds.length) {
      setRenderError('Please select at least one makeup product to apply.');
      return;
    }

    setRendering(true);
    setRenderError(null);
    try {
      const res = await api('/api/makeup/preview', {
        method: 'POST',
        sessionId: session.sessionId,
        body: { productIds: selectedProductIds, occasion },
      });
      if (res?.imageUrl) {
        setPreviewUrl(res.imageUrl);
        setViewMode('preview');
      }
    } catch (err) {
      setRenderError(err.message || 'Failed to render makeup try-on. Please try again.');
    } finally {
      setRendering(false);
    }
  };

  const activeOccasions = data?.occasions || [
    { id: 'office', label: 'Office & Daily' },
    { id: 'party', label: 'Party & Evening' },
    { id: 'festive', label: 'Festive & Wedding' },
    { id: 'date-night', label: 'Date Night' },
    { id: 'brunch', label: 'Brunch & Casual' },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Header Banner */}
      <div className="mb-8 flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-rani/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-rani">
            ✨ Virtual Beauty Studio
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Custom Makeup Consultation
          </h1>
          <p className="mt-1 text-sm text-ink-soft sm:text-base">
            Personalized shades and virtual try-on powered by your skin depth and undertone analysis.
          </p>
        </div>

        {data?.skinProfile && (
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 shadow-xs">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rani/15 text-rani font-bold">
              🎨
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">Analyzed Skin Profile</p>
              <p className="text-sm font-semibold text-ink">
                {data.skinProfile.summary}
              </p>
            </div>
            <Link to="/profile" className="ml-2 text-xs font-medium text-rani hover:underline">
              Adjust
            </Link>
          </div>
        )}
      </div>

      {/* Occasion Tabs */}
      <div className="mb-8 flex flex-wrap gap-2 border-b border-line pb-4">
        {activeOccasions.map((occ) => {
          const active = occasion === occ.id;
          return (
            <button
              key={occ.id}
              type="button"
              onClick={() => setOccasion(occ.id)}
              className={`rounded-full px-5 py-2.5 text-sm font-medium transition-all ${
                active
                  ? 'bg-ink text-white shadow-sm'
                  : 'bg-surface text-ink-soft hover:bg-surface-raised hover:text-ink'
              }`}
            >
              {occ.label}
            </button>
          );
        })}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-red-700">
          <p className="font-medium">{error}</p>
          <Button variant="secondary" onClick={() => window.location.reload()} className="mt-4">
            Retry
          </Button>
        </div>
      ) : loading ? (
        <div className="py-20 text-center text-ink-soft">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-rani border-t-transparent" />
          <p className="text-sm">Curating shades matching your skin undertone...</p>
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-12">
          {/* Left Column: Try-On Viewer & Skin Tone Advice */}
          <div className="lg:col-span-5 space-y-6">
            <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-xs">
              <div className="relative aspect-[3/4] w-full bg-surface-raised">
                {data?.selfie?.hasPhoto ? (
                  <>
                    <img
                      src={viewMode === 'preview' && previewUrl ? previewUrl : data.selfie.url}
                      alt={viewMode === 'preview' && previewUrl ? 'Selfie with virtual makeup try-on' : 'Original selfie'}
                      className="h-full w-full object-cover"
                    />

                    {/* Mode Toggle Button if previewUrl exists */}
                    {previewUrl && (
                      <div className="absolute top-4 right-4 flex rounded-full bg-ink/80 p-1 backdrop-blur-md">
                        <button
                          type="button"
                          onClick={() => setViewMode('original')}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            viewMode === 'original' ? 'bg-white text-ink shadow-xs' : 'text-white/80 hover:text-white'
                          }`}
                        >
                          Before
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode('preview')}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            viewMode === 'preview' ? 'bg-rani text-white shadow-xs' : 'text-white/80 hover:text-white'
                          }`}
                        >
                          After (VTO)
                        </button>
                      </div>
                    )}

                    <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between rounded-xl bg-black/60 px-3 py-2 text-xs text-white backdrop-blur-md">
                      <span>{previewUrl ? '✨ AI Makeup VTO Applied' : 'Original Selfie'}</span>
                      <span className="text-white/70">YouCam AI</span>
                    </div>
                  </>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center p-6 text-center">
                    <span className="text-4xl">📸</span>
                    <p className="mt-3 font-semibold text-ink">No selfie photo uploaded</p>
                    <p className="mt-1 text-xs text-ink-soft">
                      Upload your selfie or choose a sample model at Start to test virtual try-on.
                    </p>
                    <Link to="/start" className="mt-4">
                      <Button variant="primary" size="sm">
                        Go to Start & Upload Photo
                      </Button>
                    </Link>
                  </div>
                )}
              </div>

              {/* Try On Button Bar */}
              <div className="p-4 bg-surface border-t border-line">
                {renderError && (
                  <p className="mb-3 text-xs font-medium text-red-600 bg-red-50 p-2 rounded-lg border border-red-200">
                    {renderError}
                  </p>
                )}

                <Button
                  variant="primary"
                  className="w-full justify-center text-sm font-semibold"
                  disabled={rendering || !data?.selfie?.hasPhoto || !selectedProductIds.length}
                  onClick={handleApplyMakeup}
                >
                  {rendering ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Applying AI Makeup VTO...
                    </span>
                  ) : previewUrl ? (
                    'Re-apply Selected Shades'
                  ) : (
                    'Try On This Look on My Photo'
                  )}
                </Button>
                <p className="mt-2 text-center text-[11px] text-ink-soft">
                  Applies multiple makeup effects simultaneously via YouCam AI Makeup VTO.
                </p>
              </div>
            </div>

            {/* Stylist Consultation Advice Box */}
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
                <span className="text-rani">💡</span> Why This Look Suits You
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-ink-soft sm:text-sm">
                {data?.advice}
              </p>
              <div className="mt-4 pt-3 border-t border-line flex items-center justify-between text-xs text-ink-soft">
                <span>Selected: <strong className="text-ink">{selectedProductIds.length} products</strong></span>
                <span>Finish: <strong className="text-ink capitalize">Radiant & Long-Wear</strong></span>
              </div>
            </div>
          </div>

          {/* Right Column: Curated Products with Buy Links */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between pb-2">
              <h2 className="text-lg font-semibold text-ink">Curated Product Recommendations</h2>
              <span className="text-xs text-ink-soft">
                Links directly to verified Amazon & Myntra listings
              </span>
            </div>

            <div className="space-y-4">
              {(data?.recommended || []).map((product) => {
                const isSelected = selectedProductIds.includes(product.id);
                const colorHex = product.colours?.[0] || '#B85D68';

                return (
                  <div
                    key={product.id}
                    className={`flex flex-col gap-4 rounded-2xl border p-4 transition-all sm:flex-row sm:items-center sm:justify-between ${
                      isSelected
                        ? 'border-rani/40 bg-surface shadow-xs ring-1 ring-rani/20'
                        : 'border-line bg-surface/50 opacity-80'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Product Checkbox for VTO */}
                      <label className="flex items-center cursor-pointer pt-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleProduct(product.id)}
                          className="h-4 w-4 rounded-sm border-line text-rani focus:ring-rani"
                          title="Toggle for try-on preview"
                        />
                      </label>

                      {/* Product Thumbnail */}
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-raised">
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="h-full w-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      </div>

                      {/* Product Details */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-surface-raised px-2 py-0.5 text-[11px] font-medium text-ink-soft uppercase tracking-wider">
                            {product.brand}
                          </span>
                          <span className="rounded-md bg-rani/10 px-2 py-0.5 text-[11px] font-medium text-rani uppercase">
                            {product.type}
                          </span>
                        </div>

                        <h3 className="mt-1 text-sm font-semibold text-ink line-clamp-1">
                          {product.name}
                        </h3>

                        <div className="mt-1 flex items-center gap-3 text-xs text-ink-soft">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="inline-block h-3.5 w-3.5 rounded-full border border-black/10 shadow-2xs"
                              style={{ backgroundColor: colorHex }}
                            />
                            <span className="font-mono text-[11px]">{colorHex}</span>
                          </div>
                          <span>•</span>
                          <span className="font-semibold text-ink">{rupees(product.price)}</span>
                        </div>

                        {product.tip && (
                          <p className="mt-1 text-xs text-ink-soft/90 italic line-clamp-2">
                            "{product.tip}"
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Buy Link Button */}
                    <div className="flex shrink-0 items-center gap-2 sm:self-center">
                      <a
                        href={product.product_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-ink-strong"
                      >
                        Buy Online
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Note on Retailer Extension */}
            <div className="mt-6 rounded-xl border border-dashed border-line bg-surface/30 p-4 text-xs text-ink-soft">
              <p className="font-medium text-ink">🏪 Retailer catalog sync enabled</p>
              <p className="mt-1">
                Any lipstick, blush, eyeliner, eyeshadow, or foundation uploaded by partnered retailers will automatically be included in this consultation studio and try-on catalog.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

