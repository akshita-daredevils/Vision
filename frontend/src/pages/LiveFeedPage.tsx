import { useEffect, useRef, useState } from 'react';
import FileUpload from '../components/FileUpload';
import { inferenceApi, videoApi } from '../api/client';
import { VideoItem } from '../types';

const LiveFeedPage = () => {
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [active, setActive] = useState<VideoItem | null>(null);
  const [error, setError] = useState('');
  const [predicting, setPredicting] = useState(false);
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
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
    };
    resize();
    const handleResize = () => resize();
    window.addEventListener('resize', handleResize);

    let raf = 0;
    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const now = Date.now() / 1000;
      const lines = 18;
      for (let i = 0; i < lines; i++) {
        const x = ((i * 73) % canvas.width) + (Math.sin(now + i) * 20);
        const y = ((i * 37) % canvas.height) + (Math.cos(now * 0.5 + i) * 10);
        const length = 30 + ((i * 11) % 40);
        const angle = (now * 0.6 + i) % (Math.PI * 2);
        const x2 = x + Math.cos(angle) * length;
        const y2 = y + Math.sin(angle) * length;
        const danger = length > 50;
        ctx.strokeStyle = danger ? 'rgba(244, 63, 94, 0.8)' : 'rgba(56, 189, 248, 0.8)';
        ctx.lineWidth = danger ? 2.4 : 1.4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(raf);
    };
  }, [active]);

  const onUpload = async (file: File) => {
    setError('');
    setUploading(true);
    try {
      await videoApi.upload(file);
      // Run a quick inference based on file size to simulate flow estimation and trigger alerts
      const syntheticVelocity = Math.min(6, Math.max(0.3, file.size / 1_000_000));
      await inferenceApi.velocity(syntheticVelocity, 'video-upload');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const runDemoInference = async () => {
    if (!active) return;
    setPredicting(true);
    setError('');
    try {
      const syntheticVelocity = Math.max(0.1, Math.random() * 4.5);
      await inferenceApi.velocity(syntheticVelocity, 'neuromorphic-camera-demo');
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Inference failed');
    } finally {
      setPredicting(false);
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
          <button
            disabled={!active || predicting}
            onClick={runDemoInference}
            className="w-full rounded-md border-2 border-slate-900 bg-amber-200 text-slate-900 py-2 text-sm font-semibold hover:shadow-[4px_4px_0_#0f172a] disabled:opacity-50"
          >
            {predicting ? 'Estimating...' : 'Estimate velocity (neuromorphic demo)'}
          </button>
          <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
            {videos.map((video) => (
              <button
                key={video.id}
                className={`w-full text-left px-4 py-3 text-sm hover:bg-slate-50 ${
                  active?.id === video.id ? 'bg-slate-100' : ''
                }`}
                onClick={() => setActive(video)}
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
