import { useEffect, useRef, useState } from 'react';
import FileUpload from '../components/FileUpload';
import { analyzeVideo } from '../api/analysis';
import { VideoAnalysisResult } from '../types';

type SourceMode = 'upload' | 'camera';

const LiveFeedPage = () => {
  const [mode, setMode] = useState<SourceMode>('upload');
  const [status, setStatus] = useState('Pick a source to start');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [nonFlood, setNonFlood] = useState(false);
  const [result, setResult] = useState<VideoAnalysisResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const resetPreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  };

  const stopStream = () => {
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
  };

  useEffect(() => () => {
    stopStream();
    resetPreview();
  }, []);

  const showNonFlood = (message: string) => {
    setNonFlood(true);
    setError('');
    setStatus(message);
  };

  const analyzeFile = async (file: File) => {
    setLoading(true);
    setError('');
    setNonFlood(false);
    setResult(null);
    setStatus('Analyzing flood risk and velocity...');
    const url = URL.createObjectURL(file);
    resetPreview();
    setPreviewUrl(url);
    try {
      const res = await analyzeVideo(file);
      setResult(res);
      if (res.risk_level === 'LOW' || res.flood_probability < 0.3) {
        showNonFlood('No flood detected. Upload flood footage to measure velocity.');
      } else {
        setStatus('Velocity calculated from flood footage.');
      }
    } catch (err: any) {
      const message = err?.message || 'Analysis failed';
      if (message.toLowerCase().includes('non-water') || message.toLowerCase().includes('non water')) {
        showNonFlood('Rejected: non-flood footage detected.');
      } else {
        setError(message);
        setStatus('Analysis failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (file: File) => {
    await analyzeFile(file);
  };

  const startCamera = async () => {
    try {
      stopStream();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => undefined);
      }
      setStatus('Camera ready. Record a short clip and we will analyze it.');
      setError('');
      setNonFlood(false);
      setResult(null);
    } catch (err: any) {
      setError(err?.message || 'Unable to access camera');
      setStatus('Camera not available');
    }
  };

  const startRecording = () => {
    if (!mediaStreamRef.current) {
      setError('Start the camera first.');
      return;
    }
    chunksRef.current = [];
    const recorder = new MediaRecorder(mediaStreamRef.current, { mimeType: 'video/webm' });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const file = new File([blob], 'capture.webm', { type: 'video/webm' });
      await analyzeFile(file);
    };
    recorder.start();
    recorderRef.current = recorder;
    setStatus('Recording... Press stop to analyze.');
    setError('');
  };

  const stopRecording = () => {
    if (!recorderRef.current) return;
    setStatus('Processing recording...');
    recorderRef.current.stop();
  };

  const modeButton = (value: SourceMode, label: string) => (
    <button
      className={`px-3 py-2 text-sm font-semibold rounded-md border ${mode === value ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200'}`}
      onClick={() => {
        setMode(value);
        setError('');
        setResult(null);
        setNonFlood(false);
        setStatus(value === 'upload' ? 'Choose a video to analyze.' : 'Start camera to capture a clip.');
        if (value === 'upload') {
          stopStream();
        }
      }}
    >
      {label}
    </button>
  );

  const renderResult = () => {
    if (nonFlood) {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          No flood detected. Upload flood footage to get velocity measurements.
        </div>
      );
    }
    if (!result) return null;
    return (
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Flood probability (confidence)</p>
          <p className="text-2xl font-semibold text-slate-900">{(result.flood_probability * 100).toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Risk level</p>
          <p className="text-xl font-semibold text-slate-900">{result.risk_level}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-slate-500">Average velocity</p>
          <p className="text-2xl font-semibold text-slate-900">{result.average_velocity.toFixed(2)} m/s</p>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Live Analysis</h2>
          <p className="text-sm text-slate-500">Choose capture or upload, then we run the flood model and velocity estimation.</p>
        </div>
        <div className="flex gap-2">{modeButton('upload', 'Upload video')}{modeButton('camera', 'Capture from camera')}</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-black aspect-video overflow-hidden">
          <video
            ref={videoRef}
            src={previewUrl || undefined}
            controls
            autoPlay
            muted
            playsInline
            className="w-full h-full object-contain bg-black"
          />
        </div>

        <div className="space-y-4">
          {mode === 'upload' ? (
            <FileUpload label={loading ? 'Analyzing...' : 'Upload flood video (mp4/avi/webm)'} accept="video/*" onChange={handleUpload} />
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <p className="text-sm font-semibold text-slate-900">Camera capture</p>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={startCamera}
                  className="px-3 py-2 text-sm font-semibold rounded-md border border-slate-200 bg-white hover:border-slate-400"
                >
                  Start camera
                </button>
                <button
                  onClick={startRecording}
                  className="px-3 py-2 text-sm font-semibold rounded-md border border-slate-900 bg-slate-900 text-white hover:opacity-90"
                >
                  Record clip
                </button>
                <button
                  onClick={stopRecording}
                  className="px-3 py-2 text-sm font-semibold rounded-md border border-emerald-500 bg-emerald-50 text-emerald-700 hover:border-emerald-600"
                >
                  Stop & analyze
                </button>
              </div>
              <p className="text-xs text-slate-500">Record a short flood clip (5-10s). After stop, we upload and analyze automatically.</p>
            </div>
          )}

          {loading && <p className="text-sm text-slate-600">Calculating velocity with the model…</p>}
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <p className="text-sm text-slate-700">{status}</p>

          {renderResult()}
        </div>
      </div>
    </div>
  );
};

export default LiveFeedPage;
