import { useEffect, useState } from 'react';
import FileUpload from '../components/FileUpload';
import DataTable from '../components/DataTable';
import { datasetApi } from '../api/client';
import { DatasetItem } from '../types';

const DatasetsPage = () => {
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const res = await datasetApi.list();
      setDatasets(res.data.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onUpload = async (file: File) => {
    setError('');
    setUploading(true);
    try {
      await datasetApi.upload(file);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const importFromHuggingFace = async () => {
    setError('');
    setImporting(true);
    try {
      const datasetId = 'hf-internal-testing/fixtures_image_utils';
      const treeUrl = `https://huggingface.co/api/datasets/${datasetId}/tree/main`;
      const tree = await fetch(treeUrl).then((r) => {
        if (!r.ok) throw new Error('Failed to fetch dataset tree');
        return r.json();
      });
      const files: { path: string; type: string }[] = Array.isArray(tree) ? tree : [];
      const asset = files.find((f) => f.type === 'file' && /\.(png|jpg|jpeg)$/i.test(f.path));
      if (!asset) throw new Error('No image asset found in dataset');
      const rawUrl = `https://huggingface.co/datasets/${datasetId}/resolve/main/${asset.path}`;
      const blob = await fetch(rawUrl).then((r) => {
        if (!r.ok) throw new Error('Failed to fetch sample file');
        return r.blob();
      });
      const file = new File([blob], asset.path.split('/').pop() || 'sample.png', { type: blob.type });
      await datasetApi.upload(file);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Datasets</h2>
          <p className="text-sm text-slate-500">Upload and manage training datasets</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-3">
          <FileUpload
            label={uploading ? 'Uploading...' : 'Upload CSV / ZIP / video'}
            accept=".csv,text/csv,.zip,video/*"
            onChange={onUpload}
          />
          {error && <p className="text-sm text-rose-600">{error}</p>}
          <button
            disabled={importing}
            onClick={importFromHuggingFace}
            className="w-full rounded-md border-2 border-slate-900 bg-amber-200 text-slate-900 py-2 text-sm font-semibold hover:shadow-[4px_4px_0_#0f172a] disabled:opacity-50"
          >
            {importing ? 'Importing…' : 'Import HF sample dataset'}
          </button>
          <div className="rounded-lg border-2 border-slate-900 bg-white p-3 shadow-[4px_4px_0_#0f172a] text-sm text-slate-800 space-y-1">
            <div className="font-semibold text-slate-900">Public resources</div>
            <ul className="list-disc list-inside space-y-1 text-xs text-slate-700">
              <li><a className="underline" href="https://github.com/neuromorphs/ATIS-data" target="_blank" rel="noreferrer">ATIS neuromorphic water sequences</a></li>
              <li><a className="underline" href="https://data.mendeley.com/datasets/7d24kz8x6c" target="_blank" rel="noreferrer">Flooded river video set (Mendeley)</a></li>
              <li><a className="underline" href="https://huggingface.co/datasets/hf-internal-testing/fixtures_image_utils" target="_blank" rel="noreferrer">Hugging Face sample image fixtures (for testing loaders)</a></li>
            </ul>
            <p className="text-xs text-slate-600">Download externally, then upload here to keep everything in Firebase Storage.</p>
          </div>
        </div>
        <div className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">Uploaded datasets</h3>
            <span className="text-xs text-slate-500">Stored in Firebase Storage</span>
          </div>
          <DataTable
            columns={[
              { header: 'Name', accessor: (d) => d.name },
              { header: 'Size', accessor: (d) => d.size ? `${(d.size / 1024 / 1024).toFixed(2)} MB` : 'n/a' },
              { header: 'Added', accessor: (d) => new Date(d.createdAt).toLocaleString() }
            ]}
            rows={datasets}
          />
        </div>
      </div>
    </div>
  );
};

export default DatasetsPage;
