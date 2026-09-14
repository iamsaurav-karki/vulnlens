import { FileUploadProps } from '@/types/security';
import { acceptedFileExtensions } from '@/lib/languages';

function UploadIcon() {
  return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 16V4m0 0L7 9m5-5 5 5M5 20h14" /></svg>;
}

export default function FileUpload({ fileName, language, onFileUpload, onAnalyzeCode, isAnalyzing, hasCode }: FileUploadProps) {
  return <div className="button-row">
    <input type="file" accept={acceptedFileExtensions} onChange={onFileUpload} className="sr-only" id="file-upload" />
    <label htmlFor="file-upload" className="button button-secondary file-picker"><UploadIcon />{fileName ? 'Replace file' : `Choose ${language} file`}</label>
    <button type="button" onClick={onAnalyzeCode} disabled={!hasCode || isAnalyzing} className="button button-primary">
      {isAnalyzing ? 'Scanning…' : 'Run security scan'}
    </button>
  </div>;
}
