import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { Photo, Preference, Report } from "./types";
import { Button, Icon, IconButton, Modal, Topbar } from "./components";
import { processImage } from "./storage";
import { tapFeedback } from './mobile';
import { apiUrl, accountHeaders } from './api';
import { useI18n } from './i18n';
import { analysisRequest, type AnalysisProgress } from './analysisRequest.mjs';
export default function Scanner({
  mode,
  profile,
  onClose,
  onReport,
  onAccount,
  onUpgrade,
  active = true,
}: {
  mode: "camera" | "photo";
  profile: Preference[];
  onClose: () => void;
  onReport: (report: Report) => void;
  onAccount: () => void;
  onUpgrade: () => void;
  active?: boolean;
}) {
  const {t}=useI18n();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [step, setStep] = useState<"ask" | "capture" | "review">("ask");
  const [kind, setKind] = useState<Photo["kind"]>("menu");
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<AnalysisProgress>({ phase: 'uploading', percent: null });
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [busy]);
  const [aiConsent, setAiConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [accessAction,setAccessAction]=useState('');
  const [discard, setDiscard] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const abort = useRef<AbortController | null>(null);
  const replace = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abort.current?.abort();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    if (!active || step !== "capture" || mode !== "camera") return;
    let cancelled = false;
    setCameraError("");
    setCameraReady(false);
    navigator.mediaDevices
      ?.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
        audio: false,
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() =>
        setCameraError(
          "Camera access is unavailable. Allow camera access, or choose a photo below.",
        ),
      );
    if (!navigator.mediaDevices)
      setCameraError(
        "Camera needs HTTPS or localhost. You can still choose a photo.",
      );
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [step, mode, active]);
  const begin = (k: Photo["kind"]) => {
    setKind(k);
    setStep(mode === "camera" ? "capture" : "review");
    if (mode === "photo") fileRef.current?.click();
  };
  async function receive(files: FileList | File[] | null, receivedKind = kind) {
    if (!files?.length) return;
    setLoading(true);
    setError("");
    setAccessAction('');
    try {
      const chosen = Array.from(files);
      if (!replace.current && photos.length + chosen.length > 6)
        throw Error("You can add up to 6 photos in one analysis.");
      const next = await Promise.all(
        chosen
          .slice(0, replace.current ? 1 : 6)
          .map(async (f) => ({
            id: crypto.randomUUID(),
            data: await processImage(f),
            name: f.name,
            kind: receivedKind,
          })),
      );
      if (!alive.current) return;
      if (replace.current) {
        setPhotos((p) => p.map((v, i) => (i === selected ? next[0] : v)));
        replace.current = false;
      } else {
        setSelected(photos.length);
        setPhotos((p) => [...p, ...next]);
      }
      setStep("review");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (alive.current) setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  function capture() {
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    tapFeedback();
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 2000 / video.videoWidth);
    canvas.width = video.videoWidth * scale;
    canvas.height = video.videoHeight * scale;
    canvas
      .getContext("2d")!
      .drawImage(video, 0, 0, canvas.width, canvas.height);
    const p: Photo = {
      id: crypto.randomUUID(),
      data: canvas.toDataURL("image/jpeg", 0.88),
      name: "Camera photo",
      kind,
    };
    if (replace.current) {
      setPhotos((a) => a.map((v, i) => (i === selected ? p : v)));
      replace.current = false;
    } else {
      setSelected(photos.length);
      setPhotos((a) => [...a, p]);
    }
    setStep("review");
  }
  async function run() {
    if (!aiConsent || (abort.current && !abort.current.signal.aborted)) return;
    setProgress({ phase: 'uploading', percent: null });
    setBusy(true);
    setError("");
    const controller = new AbortController();
    abort.current = controller;
    try {
      const token = sessionStorage.getItem("yoeo-access-token");
      const res = await analysisRequest(apiUrl("/api/analyze"), JSON.stringify({
        images: photos.map(({ data, kind }) => ({ data, kind })),
        text: '',
        profile,
        guestToken: localStorage.getItem('yoeo-guest-token') || undefined,
      }), {
        headers: {
          "Content-Type": "application/json",
          ...accountHeaders(),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
        onProgress: value => { if (alive.current && abort.current === controller) setProgress(value); },
      });
      if (controller.signal.aborted || abort.current !== controller) return;
      const responseText = res.text;
      let payload: Report & { code?: string; error?: string; usageToken?: string; usage?: {plan:string;remaining:number} };
      try {
        payload = JSON.parse(responseText);
      } catch {
        const receivedHtml = responseText.trimStart().toLowerCase().startsWith("<!doctype") ||
          res.contentType.includes("text/html");
        throw new Error(receivedHtml
          ? "Online analysis is not connected yet. Finish setting up this demo site, then try again."
          : "The analysis service returned an unreadable response. Please try again.");
      }
      if (!res.ok) {setAccessAction(payload.code||'');throw Error(payload.error || "Analysis failed. Try again.");}
      if (payload.usageToken) localStorage.setItem('yoeo-guest-token',payload.usageToken);
      const {usageToken: _usageToken,usage: _usage,...report}=payload;
      if (alive.current) onReport(report);
    } catch (e) {
      if (alive.current && !controller.signal.aborted && abort.current === controller)
        setError(e instanceof TypeError
          ? "Could not connect to the analysis server. Check your internet connection and try again. If this continues, contact support."
          : (e as Error).message);
    } finally {
      if (abort.current === controller) {
        abort.current = null;
        if (alive.current) setBusy(false);
      }
    }
  }
  const quit = () => (photos.length ? setDiscard(true) : onClose());
  const photo = photos[selected];
  return (
    <div className="page scanner">
      <input
        ref={fileRef}
        className="visually-hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(e) => receive(e.target.files)}
        aria-label={t('Upload menu photos')}
      />
      <Topbar
        dark
        title={
          step === "capture"
            ? kind === "legend"
              ? t('Take the allergen list')
              : t('Take the menu')
            : kind === "legend"
              ? t('Review the allergen list')
              : t('Review the menu')
        }
        onClose={quit}
      />
      {step === "ask" ? (
        <div className="scan-intro">
          <Modal
            label={t('Does this menu have an allergen list?')}
            onClose={onClose}
          >
            <h2>
              {t('Does this menu have an allergen list?')}
            </h2>
            <p>
              {t('Usually on the last page, marked with letter codes')}
            </p>
            <Button onClick={() => begin("legend")}>{t(mode === 'camera' ? 'Yes, take the list' : 'Yes, upload the list')}</Button>
            <Button secondary onClick={() => begin("menu")}>
              {t(mode === 'camera' ? 'No, take the menu' : 'No, upload the menu')}
            </Button>
          </Modal>
        </div>
      ) : (
        <>
          {step === "capture" ? (
            <div className="camera-view">
              <video ref={videoRef} autoPlay playsInline muted onLoadedData={() => setCameraReady(true)} />
              <div className="viewfinder" />
              <p className="camera-hint">
                {t('Fit the {kind} inside the frame',{kind:t(kind === 'legend' ? 'allergen list' : 'menu')})}
              </p>
              {cameraError && (
                <p role="alert" className="camera-error">
                  {cameraError}
                </p>
              )}
              {error && <p role="alert" className="camera-error">{error}</p>}
              <div className="camera-controls">
                <button
                  className="shutter"
                  onClick={capture}
                  aria-label={t('Take photo')}
                  disabled={!!cameraError || !cameraReady || loading}
                />
              </div>
            </div>
          ) : (
            <div className="scan-review scroll-body">
              {photo ? (
                <img
                  className="photo-preview"
                  src={photo.data}
                  alt={
                    photo.kind === "legend"
                      ? "Allergen legend to analyze"
                      : "Menu or food to analyze"
                  }
                />
              ) : (
                <button
                  className="upload-empty"
                  onClick={() => fileRef.current?.click()}
                >
                  <strong>{t('Add a menu photo')}</strong>
                  <span>JPEG, PNG or WebP</span>
                </button>
              )}
              <div className="photo-strip">
                {photos.map((p, i) => (
                  <div
                    key={p.id}
                    className={`thumbnail ${selected === i ? "selected" : ""}`}
                  >
                    <button
                      className="thumbnail-image"
                      onClick={() => {
                        setSelected(i);
                        setKind(p.kind);
                      }}
                      aria-label={`View photo ${i + 1}`}
                    >
                      <img src={p.data} alt={`Photo ${i + 1}: ${p.kind}`} />
                    </button>
                    <button
                      className="remove-photo"
                      aria-label={`Remove photo ${i + 1}`}
                      onClick={() => {
                        setPhotos((a) => a.filter((_, j) => i !== j));
                        setSelected((v) =>
                          Math.max(0, Math.min(v, photos.length - 2)),
                        );
                      }}
                    >
                      ×
                    </button>
                    <span>{t(p.kind === "legend" ? "Allergen list" : p.kind === "menu" ? "Menu" : "Food")}</span>
                  </div>
                ))}
                {photos.length < 6 && (
                  <button
                    className="add-photo"
                    onClick={() =>
                      mode === "camera"
                        ? setStep("capture")
                        : fileRef.current?.click()
                    }
                  >
                    <span>
                      {t('Add')}
                      <br />
                      {t('photo')}
                    </span>
                  </button>
                )}
              </div>
              {kind === "legend" && (
                <Button onClick={() => begin("menu")}>
                  {t('Continue to the menu')}
                </Button>
              )}
              <label className="privacy-note ai-consent">
                <input type="checkbox" checked={aiConsent} onChange={e => setAiConsent(e.target.checked)} />
                {t('I agree to send these photos and my allergen preferences to YOEO’s server and {provider} for this analysis. AI can make mistakes; confirm ingredients and cross-contact with staff.',{provider:import.meta.env.VITE_AI_PROVIDER_NAME || t('the configured AI provider')})}
              </label>
              {error && (
                <div role="alert" className="error-box">
                  <strong>{t('Analysis needs your attention')}</strong>
                  <p>{error}</p>
                  {accessAction==='SCAN_LIMIT_REACHED'&&<Button onClick={onUpgrade}>{t('Upgrade to Pro')}</Button>}
                  {accessAction==='SIGN_IN_REQUIRED'&&<Button onClick={onAccount}>{t('Sign in to continue')}</Button>}
                </div>
              )}
              <div className="scan-actions">
                <Button
                  disabled={
                    !aiConsent ||
                    busy ||
                    loading ||
                    !photos.length ||
                    (photos.every((p) => p.kind === "legend") &&
                      !!photos.length)
                  }
                  onClick={run}
                >
                  {loading
                    ? t('Preparing photos…')
                    : t(photos.length === 1 ? 'Analyze {count} photo' : 'Analyze {count} photos',{count:photos.length})}
                </Button>
                {photo && (
                  <Button
                    secondary
                    onClick={() => {
                      replace.current = true;
                      mode === "camera"
                        ? setStep("capture")
                        : fileRef.current?.click();
                    }}
                  >
                    {t('Retake this photo')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </>
      )}
      {busy && (
        <Modal
          label={t('Analyzing your results')}
          onClose={() => {
            abort.current?.abort();
            setBusy(false);
          }}
        >
          <div className="spinner" />
          <div role="status" aria-live="polite">
            <h2>{t(progress.phase === 'uploading' ? 'Uploading photos…' : 'Waiting for analysis…')}</h2>
            <p>{t(progress.phase === 'uploading' ? 'Sending your photos securely.' : 'Photos uploaded. Waiting for the server to finish checking the menu.')}</p>
          </div>
          {progress.phase === 'uploading' && <progress aria-label={t('Photo upload')} max={100} value={progress.percent ?? undefined} style={{width:'100%'}} />}
          <p>{t('{seconds}s elapsed', {seconds:elapsed})}</p>
          {elapsed >= 20 && <p>{t('Larger menus can take longer. You can cancel and retry with fewer photos.')}</p>}
          <Button
            secondary
            onClick={() => {
              abort.current?.abort();
              setBusy(false);
            }}
          >
            {t('Cancel')}
          </Button>
        </Modal>
      )}
      {discard && (
        <Modal label={t('Discard this scan?')} onClose={() => setDiscard(false)}>
          <div className="confirm-dialog discard-dialog"><div className="discard-dialog-icon"><Icon name="trash" size={28}/></div><div className="modal-heading"><h2>{t('Discard this scan?')}</h2><IconButton name="close" label={t('Close')} onClick={() => setDiscard(false)}/></div>
          <p>{t('Your photos won’t be saved.')}</p>
          <Button danger onClick={() => { flushSync(() => setDiscard(false)); onClose(); }}>{t('Discard')}</Button>
          <Button secondary onClick={() => setDiscard(false)}>
            {t('Continue')}
          </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
