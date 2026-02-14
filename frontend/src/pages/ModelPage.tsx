import { FormEvent, useEffect, useState } from 'react';
import FileUpload from '../components/FileUpload';
import DataTable from '../components/DataTable';
import { datasetApi, inferenceApi, modelsApi, notificationsApi } from '../api/client';
import { DatasetItem, InferenceResult, ModelFile } from '../types';

const ModelPage = () => {
  const [velocity, setVelocity] = useState('0');
  const [source, setSource] = useState('sensor');
  const [result, setResult] = useState<InferenceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [models, setModels] = useState<ModelFile[]>([]);
  const [modelsError, setModelsError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [version, setVersion] = useState('');
  const [notes, setNotes] = useState('');
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [analysisStatus, setAnalysisStatus] = useState('');
  const [analysisLoading, setAnalysisLoading] = useState(false);

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
      setModelsError('');
    } catch (err: any) {
      console.error(err);
      setModelsError(err?.response?.data?.message || 'Failed to load models');
    }
  };

  const loadDatasets = async () => {
    try {
      const res = await datasetApi.list();
      setDatasets(res.data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadModels();
    loadDatasets();
  }, []);

  const onUploadFiles = async (files: File[]) => {
    setError('');
    if (files.length === 0) return;
    setUploading(true);
    try {
      if (files.length === 1) {
        await modelsApi.upload(files[0], version || undefined, notes || undefined);
      } else {
        await modelsApi.uploadBundle(files, version || undefined, notes || undefined);
      }
      setVersion('');
      setNotes('');
      await loadModels();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Model upload failed');
    } finally {
      setUploading(false);
    }
  };

  const runDatasetAnalysis = async () => {
    if (!selectedDatasetId) {
      setAnalysisStatus('Pick a dataset first.');
      return;
    }
    const ds = datasets.find((d) => d.id === selectedDatasetId);
    if (!ds) {
      setAnalysisStatus('Dataset not found.');
      return;
    }
    setAnalysisStatus('');
    setAnalysisLoading(true);
    try {
      const syntheticVelocity = Math.max(0.5, ((ds.size || 500000) / 1_000_000) * 2.5);
      await inferenceApi.velocity(syntheticVelocity, 'dataset-analysis');
      await notificationsApi.create(
        `Dataset ${ds.name} analyzed: est velocity ${syntheticVelocity.toFixed(2)} m/s`,
        'simulated',
        'dataset_report'
      );
      setAnalysisStatus('Report logged (inference + notification).');
    } catch (err: any) {
      setAnalysisStatus(err?.response?.data?.message || 'Analysis failed');
    } finally {
      setAnalysisLoading(false);
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
            label={uploading ? 'Uploading...' : 'Upload model file or folder'}
            accept=".onnx,.json,.bin,.zip,.tflite"
            multiple
            allowDirectory
            onChangeFiles={onUploadFiles}
          />
        </div>
        <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">Model registry</h3>
            <div className="flex items-center space-x-2 text-xs text-slate-500">
              <span>Newest first</span>
              <button
                onClick={loadModels}
                className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
              >
                Refresh
              </button>
            </div>
          </div>
          {modelsError && <p className="text-sm text-rose-600 mb-2">{modelsError}</p>}
          <DataTable
            columns={[
              { header: 'Name', accessor: (m) => m.name },
              { header: 'Version', accessor: (m) => m.version },
              { header: 'Status', accessor: (m) => m.status },
              { header: 'Uploaded', accessor: (m) => new Date(m.uploadedAt).toLocaleString() },
              { header: 'Main file', accessor: (m) => m.mainFilePath || 'n/a' },
              { header: 'Files', accessor: (m) => (m.files ? m.files.length : m.sourceUrl ? 1 : 0) },
              { header: 'Source', accessor: (m) => m.sourceUrl ? 'Storage' : 'Heuristic' }
            ]}
            rows={models}
          />
        </div>
        <div className="rounded-lg border-2 border-slate-900 bg-white p-4 shadow-[4px_4px_0_#0f172a] space-y-2 text-sm text-slate-800">
          <h3 className="text-lg font-semibold text-slate-900">Public model references</h3>
          <p>Start with lightweight models; download externally then upload:</p>
          <ul className="list-disc list-inside space-y-1">
            <li><a className="underline" href="https://github.com/isl-org/MiDaS" target="_blank" rel="noreferrer">MiDaS depth (for water surface cues)</a></li>
            <li><a className="underline" href="https://github.com/google-research/google-research/tree/master/optical_flow" target="_blank" rel="noreferrer">Lightweight optical flow models</a></li>
            <li><a className="underline" href="https://huggingface.co/spaces/akhaliq/raft-small-onnx" target="_blank" rel="noreferrer">RAFT-small ONNX (optical flow)</a></li>
          </ul>
          <p className="text-xs text-slate-600">Tip: export to ONNX/TFJS, then upload to register in Firebase.</p>
        </div>
      </div>

      <div className="rounded-lg border-2 border-slate-900 bg-white p-4 shadow-[4px_4px_0_#0f172a] space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Dataset-driven analysis</h3>
          <span className="text-xs text-slate-500">Logs inference + notification</span>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2">
            <label className="block text-sm text-slate-600 mb-1">Dataset</label>
            <select
              value={selectedDatasetId}
              onChange={(e) => setSelectedDatasetId(e.target.value)}
              className="w-full rounded-md border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-sky-300"
            >
              <option value="">Select a dataset</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.size ? `(${(d.size / 1024 / 1024).toFixed(2)} MB)` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={runDatasetAnalysis}
              disabled={analysisLoading}
              className="w-full rounded-md border-2 border-slate-900 bg-emerald-200 text-slate-900 py-2 text-sm font-semibold hover:shadow-[4px_4px_0_#0f172a] disabled:opacity-50"
            >
              {analysisLoading ? 'Analyzing…' : 'Run analysis'}
            </button>
          </div>
        </div>
        {analysisStatus && <p className="text-sm text-slate-700">{analysisStatus}</p>}
      </div>
    </div>
  );
};

export default ModelPage;
