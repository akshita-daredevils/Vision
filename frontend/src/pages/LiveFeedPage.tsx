import { useEffect, useRef, useState } from 'react';
import FileUpload from '../components/FileUpload';
import { alertsApi, inferenceApi, videoApi } from '../api/client';
import { analyzeVideoWithRaft, FlowAnalysisResult } from '../lib/raftFlow';
import { analyzeVideo } from '../api/analysis';
import { VideoAnalysisResult, VideoItem } from '../types';
import BackendAnalyzer from '../components/BackendAnalyzer';

const LiveFeedPage = () => {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [active, setActive] = useState<VideoItem | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [predicting, setPredicting] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<FlowAnalysisResult | null>(null);
  const [backendResult, setBackendResult] = useState<VideoAnalysisResult | null>(null);
  const [metersPerPixel, setMetersPerPixel] = useState('0.01');
  const [fpsHint, setFpsHint] = useState('30');
  const [samplingMs, setSamplingMs] = useState('120');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);

  const load = async () => {
    try {
      const res = await videoApi.list();
      const list = res.data.data || [];
      setVideos(list);
      setActive(list[0] || null);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const canvas = overlayRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const resize = () => {
      canvas.width = video.clientWidth || video.videoWidth;
      canvas.height = video.clientHeight || video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    };
    resize();
    const handleResize = () => resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [active]);

  const onUpload = async (file: File) => {
    setError('');
    setInfo('');
    setUploading(true);
    try {
      await videoApi.upload(file);
      // Automatically run backend analysis after upload
      const result = await analyzeVideo(file);
      setBackendResult(result);
      if (result.risk_level === 'HIGH') {
        await alertsApi.create(2, result.average_velocity, 'danger');
      } else if (result.risk_level === 'MODERATE') {
        await alertsApi.create(2, result.average_velocity, 'warning');
      }
      await load();
      setInfo('Upload completed and analysis finished.');
    } catch (err: any) {
      setError(err?.message || err?.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const runRaftAnalysis = async () => {
    if (!active || !videoRef.current) {
      setError('Select a video first.');
      return;
    }
    if (backendResult?.risk_level === 'LOW') {
      setError('Flood probability is low; skipping velocity estimation.');
      return;
    }
    setAnalyzing(true);
    setError('');
    setInfo('');
    try {
      const result = await analyzeVideoWithRaft({
        video: videoRef.current,
        overlay: overlayRef.current,
        metersPerPixel: Number(metersPerPixel) || 0.01,
        fpsHint: Number(fpsHint) || 24,
        sampleEveryMs: Number(samplingMs) || 120,
        maxPairs: 28,
        targetWidth: 416
      });
      setAnalysis(result);
      const representative = result.p95 || result.average || 0;
      if (representative > 0) {
        await inferenceApi.velocity(Number(representative.toFixed(3)), 'raft-onnx');
      }
      setInfo(`RAFT-small flow velocity ~${representative.toFixed(2)} m/s (p95). Alerts updated.`);
    } catch (err: any) {
      const msg = err?.message || err?.response?.data?.message;
      if (msg?.toString().includes('model load')) {
        setError('RAFT model missing/blocked. Set VITE_RAFT_MODEL_URL or place raft-small.onnx (+ .onnx_data) in public/models.');
      } else {
        setError(msg || 'RAFT analysis failed');
      }
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Live Feed</h2>
          <p className="text-sm text-slate-500">Manage video inputs and playback</p>
        </div>
        <span className="text-xs text-slate-400">// TODO: Camera stream integration</span>
      </div>

      <BackendAnalyzer />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-black aspect-video overflow-hidden">
          {active ? (
            <div className="relative w-full h-full">
              <video
                ref={videoRef}
                src={active.url}
                controls
                className="w-full h-full object-contain bg-black"
              />
              <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none mix-blend-screen" />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-200">No video selected</div>
          )}
        </div>
        <div className="space-y-4">
          <FileUpload label={uploading ? 'Uploading...' : 'Upload video (mp4/avi)'} accept="video/mp4,video/x-msvideo,video/avi" onChange={onUpload} />
          {error && <p className="text-sm text-rose-600">{error}</p>}
          {info && <p className="text-sm text-emerald-600">{info}</p>}
          <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between text-sm text-slate-700">
              <span className="font-semibold text-slate-900">RAFT-small (ONNX) analysis</span>
              <span className="text-xs text-slate-500">Optical flow</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <label className="space-y-1">
                <span className="block text-slate-500">Meters/pixel</span>
                <input
                  value={metersPerPixel}
                  onChange={(e) => setMetersPerPixel(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-2 py-1"
                  type="number"
                  step="0.0001"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-slate-500">FPS hint</span>
                <input
                  value={fpsHint}
                  onChange={(e) => setFpsHint(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-2 py-1"
                  type="number"
                  step="1"
                />
              </label>
              <label className="space-y-1">
                <span className="block text-slate-500">Sample ms</span>
                <input
                  value={samplingMs}
                  onChange={(e) => setSamplingMs(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-2 py-1"
                  type="number"
                  step="10"
                />
              </label>
            </div>
            <button
              disabled={!active || analyzing}
              onClick={runRaftAnalysis}
              className="w-full rounded-md border-2 border-slate-900 bg-sky-200 text-slate-900 py-2 text-sm font-semibold hover:shadow-[4px_4px_0_#0f172a] disabled:opacity-50"
            >
              {analyzing ? 'Analyzing with RAFT…' : 'Analyze with RAFT-small (ONNX)'}
            </button>
            {analysis && (
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                <div className="rounded-md bg-slate-50 border border-slate-200 p-2">
                  <div className="text-slate-500">p95 velocity</div>
                  <div className="text-lg font-semibold text-slate-900">{analysis.p95.toFixed(2)} m/s</div>
                </div>
                <div className="rounded-md bg-slate-50 border border-slate-200 p-2">
                  <div className="text-slate-500">Mean / Max</div>
                  <div className="text-lg font-semibold text-slate-900">{analysis.average.toFixed(2)} / {analysis.max.toFixed(2)} m/s</div>
                </div>
                <div className="rounded-md bg-slate-50 border border-slate-200 p-2">
                  <div className="text-slate-500">Samples</div>
                  <div className="text-sm font-semibold text-slate-900">{analysis.framesUsed} pairs</div>
                </div>
                <div className="rounded-md bg-slate-50 border border-slate-200 p-2">
                  <div className="text-slate-500">Δt mean</div>
                  <div className="text-sm font-semibold text-slate-900">{(analysis.dtStats.mean * 1000).toFixed(0)} ms</div>
                </div>
              </div>
            )}
          </div>
          <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
            {videos.map((video) => (
              <button
                key={video.id}
                className={`w-full text-left px-4 py-3 text-sm hover:bg-slate-50 ${
                  active?.id === video.id ? 'bg-slate-100' : ''
                }`}
                onClick={() => {
                  setActive(video);
                  setAnalysis(null);
                }}
              >
                <div className="font-medium text-slate-900">{video.name}</div>
                <div className="text-xs text-slate-500">{new Date(video.createdAt).toLocaleString()}</div>
              </button>
            ))}
            {videos.length === 0 && <p className="p-4 text-sm text-slate-500">No uploads yet</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LiveFeedPage;
