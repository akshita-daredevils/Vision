import { FormEvent, useEffect, useState } from 'react';
import FileUpload from '../components/FileUpload';
import DataTable from '../components/DataTable';
import { inferenceApi, modelsApi } from '../api/client';
import { InferenceResult, ModelFile } from '../types';

const ModelPage = () => {
  const [velocity, setVelocity] = useState('0');
  const [source, setSource] = useState('sensor');
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [models, setModels] = useState<ModelFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [version, setVersion] = useState('');
  const [notes, setNotes] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    const numeric = Number(velocity);
    if (Number.isNaN(numeric)) {
      setError('Velocity must be numeric');
      return;
    }
    setLoading(true);
    try {
      const res = await inferenceApi.velocity(numeric, source);
      setResult(res.data.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Inference failed');
    } finally {
      setLoading(false);
    }
  };

  const loadModels = async () => {
    try {
      const res = await modelsApi.list();
      setModels(res.data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadModels();
  }, []);

  const onUpload = async (file: File) => {
    setError('');
    setUploading(true);
    try {
      await modelsApi.upload(file, version || undefined, notes || undefined);
      setVersion('');
      setNotes('');
      await loadModels();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Model upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Model</h2>
          <p className="text-sm text-slate-500">Manage models and run inference (heuristic fallback)</p>
        </div>
        <span className="text-xs text-slate-400">// TODO: Replace with trained ONNX model</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900 mb-3">Run inference</h3>
          <form className="space-y-3" onSubmit={submit}>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Velocity (m/s)</label>
              <input
                type="number"
                step="0.01"
                value={velocity}
                onChange={(e) => setVelocity(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-sky-300"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-600 mb-1">Source</label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-sky-300"
              >
                <option value="sensor">Sensor</option>
                <option value="camera">Camera</option>
                <option value="upload">Upload</option>
              </select>
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-sky-600 text-white rounded-md py-2 font-medium hover:bg-sky-700 disabled:opacity-50"
            >
              {loading ? 'Running...' : 'Run inference'}
            </button>
          </form>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <h3 className="text-lg font-semibold text-slate-900">Model status</h3>
          <ul className="space-y-1 text-sm text-slate-700">
            <li><span className="font-medium">Active:</span> {models[0]?.name || 'Heuristic'}</li>
            <li><span className="font-medium">Version:</span> {models[0]?.version || '0.1.0 (heuristic)'}</li>
            <li><span className="font-medium">Source:</span> {models[0]?.sourceUrl ? 'Uploaded' : 'Heuristic rules'}</li>
          </ul>
          {result && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
              <div className="font-semibold text-slate-900 mb-1">Latest inference</div>
              <div>Label: <span className="font-medium uppercase">{result.label}</span></div>
              <div>Velocity: {result.velocity} m/s (source: {result.source})</div>
              <div>Score: {(result.score * 100).toFixed(1)}%</div>
              <div>Thresholds: warn {result.thresholds.warn} / danger {result.thresholds.danger} m/s</div>
              <div className="text-xs text-slate-500 mt-1">{result.explanation}</div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">Upload model artifact</h3>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Version (optional)</label>
            <input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="v1.0.0"
              className="w-full rounded-md border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-sky-300"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-sky-300"
            />
          </div>
          <FileUpload
            label={uploading ? 'Uploading...' : 'Upload ONNX/TFJS/ZIP'}
            accept=".onnx,.json,.bin,.zip"
            onChange={onUpload}
          />
        </div>
        <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">Model registry</h3>
            <span className="text-xs text-slate-500">Newest first</span>
          </div>
          <DataTable
            columns={[
              { header: 'Name', accessor: (m) => m.name },
              { header: 'Version', accessor: (m) => m.version },
              { header: 'Status', accessor: (m) => m.status },
              { header: 'Uploaded', accessor: (m) => new Date(m.uploadedAt).toLocaleString() },
              { header: 'Source', accessor: (m) => m.sourceUrl ? 'Storage' : 'Heuristic' }
            ]}
            rows={models}
          />
        </div>
      </div>
    </div>
  );
};

export default ModelPage;
