interface Props {
  label: string;
  accept?: string;
  multiple?: boolean;
  allowDirectory?: boolean;
  onChange?: (file: File) => void;
  onChangeFiles?: (files: File[]) => void;
}

const FileUpload = ({ label, accept, multiple, allowDirectory, onChange, onChangeFiles }: Props) => (
  <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-sky-400 cursor-pointer bg-white">
    <p className="text-sm text-slate-700">{label}</p>
    <p className="text-xs text-slate-500">Click to choose file{multiple || allowDirectory ? 's/folder' : ''}</p>
    <input
      type="file"
      accept={accept}
      className="hidden"
      multiple={multiple}
      // @ts-expect-error webkitdirectory is non-standard but supported in Chromium-based browsers
      {...(allowDirectory ? { webkitdirectory: '' as any, directory: '' as any } : {})}
      onChange={(e) => {
        const files = e.target.files ? Array.from(e.target.files) : [];
        if (files.length === 0) return;
        if (onChangeFiles) {
          onChangeFiles(files);
        } else if (onChange) {
          onChange(files[0]);
        }
      }}
    />
  </label>
);

export default FileUpload;
