# VulnLens

VulnLens is a containerized, AI-assisted source-code security review application. It combines Semgrep static analysis with Google Gemini reasoning to turn a submitted file or pasted source into a prioritized, actionable vulnerability report.

Built as a DevOps portfolio project, the repository includes repeatable Terraform deployments for both Google Cloud Platform and Microsoft Azure.

## Highlights

- Upload a source file and receive a structured security assessment.
- Analyze pasted or uploaded source in Python, JavaScript, TypeScript, Java, Go, C, C++, C#, PHP, Ruby, Rust, Kotlin, Bash, SQL, YAML, and JSON.
- Combine Semgrep findings with Gemini-powered explanations and remediation guidance.
- Rank findings by descending CVSS score with critical, high, medium, and low severity labels.
- Export assessments as portable HTML reports.
- Use a responsive security workspace with paste support, language detection from file extensions, source metrics, and mobile-friendly controls.
- Package the Next.js frontend and FastAPI API in one Docker image.
- Deploy the same container image to GCP Cloud Run or Azure Container Apps through Terraform.

## Sample Reports

Open exported examples to see the structured vulnerability output, including CVSS-ranked findings, evidence, and remediation guidance:

- [TypeScript security assessment](./vulnlens-typescript.html)
- [Rust security assessment](./vulnlens-rust.html)

## Architecture

```text
Browser
  -> Next.js static UI
  -> FastAPI /api/analyze
       -> Semgrep MCP static analysis
       -> Gemini API (Gemini 2.5 Flash)
  <- Structured JSON report
```

For every analysis, FastAPI validates the selected language, creates a temporary file with a controlled matching extension for the Semgrep MCP tool, asks the Gemini agent to synthesize the static-analysis results with remediation guidance, validates the JSON response, sorts findings by CVSS score, and removes the temporary file.

## Technology Stack

| Area | Technology |
| --- | --- |
| Frontend | Next.js 15, React 19, TypeScript |
| Backend | FastAPI, Python 3.12, Uvicorn |
| AI | OpenAI Agents SDK, LiteLLM, Google Gemini 2.5 Flash |
| Static analysis | Semgrep through MCP |
| Packaging | Docker multi-stage build |
| Infrastructure as code | Terraform |
| GCP deployment | Artifact Registry and Cloud Run |
| Azure deployment | Azure Container Registry and Azure Container Apps |

## Prerequisites

- Node.js 20+
- Python 3.12+
- [uv](https://docs.astral.sh/uv/)
- Docker, for local container builds and Terraform cloud deployments
- A [Google Gemini API key](https://aistudio.google.com/app/apikey)
- A Semgrep AppSec token when using the Semgrep MCP integration
- Terraform 1.0+

## Configuration

Copy the committed template and add credentials locally:

```bash
cp .env.example .env
```

```env
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini/gemini-2.5-flash
SEMGREP_APP_TOKEN=your_semgrep_app_token
```

`GEMINI_MODEL` is optional; Gemini 2.5 Flash is the application default and is eligible for the Gemini API free tier, subject to Google's current quotas. Use another supported LiteLLM Gemini model identifier if your account provides access to it.

Never commit `.env` files, Terraform variable files containing credentials, or Terraform state. The provided `.gitignore` excludes these files. Source submitted for analysis is sent to Gemini and Semgrep, so do not upload code that your organization's data-handling policy prohibits sharing.

## Local Development

Start the FastAPI backend:

```bash
cd backend
uv sync
uv run uvicorn server:app --reload --host 0.0.0.0 --port 9000
```

In a second terminal, start the frontend:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:3001`. The development frontend calls the API at `http://localhost:9000`.

### Supported Languages

The workspace supports pasted code and file upload for Python, JavaScript, TypeScript, Java, Go, C, C++, C#, PHP, Ruby, Rust, Kotlin, Bash, SQL, YAML, and JSON. Select a language before pasting source, or let VulnLens detect it from the uploaded file extension. The backend validates the language and chooses a matching temporary-file extension for Semgrep.

## Container Run

The Dockerfile exports the Next.js application as static files, installs the FastAPI and Semgrep dependencies, and serves both the UI and API from one container on port 9000.

```bash
docker build -t vulnlens .
docker run --rm --env-file .env -p 9000:9000 vulnlens
```

Open `http://localhost:9000`. Container platforms can use `GET /health` for health checks.

## Infrastructure and Deployment

Both Terraform configurations build the Docker image from the repository root, push it to the cloud provider registry, configure runtime credentials, and expose the application publicly. Run Terraform from the corresponding cloud directory with authenticated provider and Docker credentials.

### Google Cloud Platform

`terraform/gcp` provisions:

- Required Google APIs: Cloud Run, Artifact Registry, and Cloud Build.
- A regional Docker Artifact Registry repository.
- A locally built Linux AMD64 image pushed to Artifact Registry.
- A public Cloud Run service with one vCPU, 2 GiB memory, and a scale-to-zero / maximum-one-instance policy.

Authenticate with `gcloud auth application-default login` and ensure Docker can obtain Google credentials. Then deploy:

```bash
cd terraform/gcp
terraform init
terraform apply \
  -var="project_id=your-gcp-project-id" \
  -var="gemini_api_key=your-gemini-api-key" \
  -var="semgrep_app_token=your-semgrep-token"
```

Retrieve the public endpoint with:

```bash
terraform output -raw service_url
```

### Microsoft Azure

`terraform/azure` provisions:

- An Azure Container Registry with a unique generated suffix.
- A Log Analytics workspace with 30-day retention.
- An Azure Container Apps environment and a public Container App.
- The same Linux AMD64 Docker image, with one vCPU, 2 GiB memory, and zero-to-one replica scaling.

The Azure resource group must already exist. Authenticate with `az login`, authenticate Docker for the deployment, and run:

```bash
cd terraform/azure
terraform init
terraform apply \
  -var="resource_group_name=your-resource-group" \
  -var="gemini_api_key=your-gemini-api-key" \
  -var="semgrep_app_token=your-semgrep-token"
```

Retrieve the public endpoint with:

```bash
terraform output -raw app_url
```

For production use, pass Terraform credentials through a secure CI secret store or migrate the runtime secrets to the cloud provider's secret-management service. Do not commit `terraform.tfvars`; Terraform state can contain injected secret values and must use a protected remote backend.

## API

### `POST /api/analyze`

Analyzes a source string in the selected supported language.

```json
{
  "code": "const command = request.query.command; exec(command);",
  "language": "javascript"
}
```

```json
{
  "summary": "Analyzed 74 characters of javascript code. ...",
  "issues": [
    {
      "title": "Command injection risk",
      "description": "...",
      "code": "os.system('echo ' + password)",
      "fix": "Use subprocess with an argument list...",
      "cvss_score": 7.5,
      "severity": "high"
    }
  ]
}
```

The optional `language` field defaults to `python`. It must be one of the languages listed above; the backend maps it to a controlled temporary-file extension before Semgrep runs. The endpoint returns `400` for empty or unsupported source and `500` when a required credential is missing or an analysis provider fails.

### `GET /health`

Returns a lightweight service-health response.

## Repository Layout

```text
backend/           FastAPI API, LLM agent configuration, and Semgrep MCP server
frontend/          Next.js interface and security-report UI
terraform/gcp/     Artifact Registry and Cloud Run Terraform deployment
terraform/azure/   Azure Container Apps, ACR, and monitoring Terraform deployment
assets/            Project visual assets
Dockerfile         Production multi-stage container build
```

## Validation Commands

```bash
cd backend && uv run python -m compileall .
cd frontend && npm run build
cd terraform/gcp && terraform validate
cd terraform/azure && terraform validate
```

## Scope and Limitations

VulnLens is a developer-assistance tool, not a substitute for manual security review, dependency scanning, threat modeling, penetration testing, or professional security advice. Treat AI output as untrusted guidance and verify recommendations before deploying changes.
