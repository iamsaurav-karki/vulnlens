import { AnalysisResultsProps } from '@/types/security';

function DownloadIcon() { return <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 21h14" /></svg>; }
function ShieldIcon() { return <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3 5 6v5c0 4.7 2.9 8.5 7 10 4.1-1.5 7-5.3 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></svg>; }

function severityClass(severity: string) { return `severity severity-${severity.toLowerCase()}`; }

export default function AnalysisResults({ analysisResults, isAnalyzing, error, onDownload }: AnalysisResultsProps) {
  return <section className="panel results-panel" aria-labelledby="results-heading">
    <div className="panel-header"><div><div className="panel-kicker">02 / Findings</div><h2 className="panel-title" id="results-heading">Security assessment</h2></div>{analysisResults && <button type="button" className="button button-secondary" onClick={onDownload}><DownloadIcon />Export HTML</button>}</div>
    <div className="results-body">
      {error && <div className="error-state" role="alert"><strong>Analysis could not be completed.</strong><br />{error}</div>}
      {isAnalyzing && !error && <div className="loading-state" role="status" aria-live="polite" aria-busy="true"><div className="panel-kicker">Building the assessment</div><div className="skeleton" /><div className="skeleton" /><div className="skeleton short" /><div className="helper-text">Semgrep is collecting static evidence while Gemini prepares remediation guidance.</div></div>}
      {!analysisResults && !isAnalyzing && !error && <div className="empty-state"><div><div className="empty-icon"><ShieldIcon /></div><h3>Your findings will appear here</h3><p>Paste source or choose a supported file to receive severity-ranked vulnerabilities, evidence, and remediation guidance.</p></div></div>}
      {analysisResults && <div>
        <div className="summary"><div className="summary-label">Executive summary</div><p>{analysisResults.summary}</p></div>
        <div className="result-overview"><div><h3>Findings register</h3><span className="issue-count">All returned vulnerabilities, sorted by CVSS</span></div><span className="issue-count">{analysisResults.issues.length} {analysisResults.issues.length === 1 ? 'finding' : 'findings'}</span></div>
        {analysisResults.issues.length === 0 ? <div className="empty-state compact-empty"><div><div className="empty-icon"><ShieldIcon /></div><h3>No vulnerabilities reported</h3><p>The scan did not identify actionable issues in this source.</p></div></div> : <div className="table-scroll"><table className="findings-table"><caption className="sr-only">Security vulnerabilities found during analysis</caption><thead><tr><th scope="col">Finding</th><th scope="col">Risk</th><th scope="col">Description</th><th scope="col">Vulnerable code</th><th scope="col">Recommended fix</th></tr></thead><tbody>{analysisResults.issues.map((issue, index) => <tr key={`${issue.title}-${index}`}><td className="finding-cell"><span className="issue-number">{String(index + 1).padStart(2, '0')}</span><strong>{issue.title}</strong></td><td><span className={severityClass(issue.severity)}>{issue.severity}</span><span className="table-cvss">CVSS <b>{issue.cvss_score.toFixed(1)}</b></span></td><td className="description-cell">{issue.description}</td><td><pre className="table-code vulnerable">{issue.code}</pre></td><td><pre className="table-code remediation">{issue.fix}</pre></td></tr>)}</tbody></table></div>}
      </div>}
    </div>
  </section>;
}
