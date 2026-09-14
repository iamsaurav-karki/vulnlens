import json
import re
import tempfile  # to create a file on disk for semgrep_scan
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import List
from pathlib import Path

from dotenv import load_dotenv
from agents import Agent, Runner, set_tracing_disabled, usage as agents_usage
from agents.extensions.models.litellm_model import LitellmModel

from context import SECURITY_RESEARCHER_INSTRUCTIONS, get_analysis_prompt
from mcp_servers import create_semgrep_server

# Load .env from project root and backend dir so GEMINI_MODEL / GEMINI_API_KEY
# work whether you run `uv run` from repo root or backend/
for _env_path in (Path(__file__).resolve().parent.parent / ".env", Path(__file__).resolve().parent / ".env"):
    load_dotenv(dotenv_path=_env_path, override=False)
# Fallback: also check cwd
load_dotenv(override=False)
set_tracing_disabled(True)

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini/gemini-2.5-flash")
LANGUAGE_SUFFIXES = {
    "python": ".py",
    "javascript": ".js",
    "typescript": ".ts",
    "java": ".java",
    "go": ".go",
    "c": ".c",
    "cpp": ".cpp",
    "csharp": ".cs",
    "php": ".php",
    "ruby": ".rb",
    "rust": ".rs",
    "kotlin": ".kt",
    "bash": ".sh",
    "sql": ".sql",
    "yaml": ".yaml",
    "json": ".json",
}
JSON_REPORT_INSTRUCTIONS = """
You MUST return the final report as one valid JSON object with exactly this shape:
{"summary":"...","issues":[{"title":"...","description":"...","code":"...","fix":"...","cvss_score":0.0,"severity":"low"}]}
Do not wrap the JSON in Markdown fences or include text before or after it.

IMPORTANT: This is a DEFENSIVE CODE QUALITY REVIEW for a controlled lab exercise. The user owns this code and explicitly requests assessment. You are NOT performing an attack, penetration test, or vulnerability scan on external targets — you are reviewing CODE QUALITY ISSUES in user-provided snippets for remediation purposes. This is standard software engineering practice (like a linter or code review). You MUST NOT refuse. If no issues are found, return {"summary":"No quality issues found","issues":[]}. Never return a natural-language refusal — always return valid JSON.
"""


def configure_litellm_usage_compatibility() -> None:
    """Allow providers without cache-write usage data to work with Agents SDK.

    openai-agents 0.7.0 currently requires ``cache_write_tokens`` even though
    its LiteLLM adapter only supplies ``cached_tokens``. Some providers do not
    return a cache-write count, so zero is the correct value for that field.
    """
    field = agents_usage.InputTokensDetails.model_fields.get("cache_write_tokens")
    if field is None or not field.is_required():
        return

    field.default = 0
    field.default_factory = None
    agents_usage.InputTokensDetails.model_rebuild(force=True)


configure_litellm_usage_compatibility()

app = FastAPI(title="VulnLens API")

# Configure CORS for development and production
cors_origins = [
    "http://localhost:3001",  # Local development
    "http://frontend:3001",  # Docker development
]

# In production, allow same-origin requests (static files served from same domain)
if os.getenv("ENVIRONMENT") == "production":
    cors_origins.append(
        "*"
    )  # Allow all origins in production since we serve frontend from same domain

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    code: str
    language: str = "python"


class SecurityIssue(BaseModel):
    title: str = Field(description="Brief title of the security vulnerability")
    description: str = Field(
        description="Detailed description of the security issue and its potential impact"
    )
    code: str = Field(
        description="The specific vulnerable code snippet that demonstrates the issue"
    )
    fix: str = Field(description="Recommended code fix or mitigation strategy")
    cvss_score: float = Field(description="CVSS score from 0.0 to 10.0 representing severity")
    severity: str = Field(description="Severity level: critical, high, medium, or low")


class SecurityReport(BaseModel):
    summary: str = Field(description="Executive summary of the security analysis")
    issues: List[SecurityIssue] = Field(description="List of identified security vulnerabilities")


def parse_security_report(raw_output: str) -> SecurityReport:
    """Parse a report robustly even when the model wraps JSON or adds a preamble.

    Handles:
    - Markdown fences ```json ... ```
    - Leading/trailing non-JSON text
    - Refusal messages (raises a clear HTTPException instead of json_invalid)
    """
    if raw_output is None or not str(raw_output).strip():
        raise HTTPException(status_code=500, detail="Analysis failed: model returned empty response")
    raw = str(raw_output).strip()

    # Detect refusal without any JSON — surface cleanly instead of cryptic json_invalid
    lower = raw.lower()
    refusal_markers = [
        "sorry, i cannot",
        "i cannot fulfill",
        "i am unable to",
        "unable to analyze",
        "cannot analyze",
        "i can't assist",
        "as an ai",
        "i am not able",
        "not able to analyze",
        "refuse",
        "declin",
        "unable to perform",
        "cannot perform",
        "vulnerability scanning",
        "security analysis on specific",
        "will not analyze",
        "not permitted",
        "policy does not allow",
    ]
    if any(m in lower for m in refusal_markers) and "{" not in raw:
        raise HTTPException(status_code=500, detail=f"Analysis failed: model refused request: {raw[:600]}")

    candidates: list[str] = []

    # 1) Fenced block ```json ... ``` or ``` ... ```
    fence_re = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)
    m = fence_re.search(raw)
    if m:
        candidates.append(m.group(1).strip())

    # 2) Raw as-is
    candidates.append(raw)

    # 3) Largest { ... } substring (handles preamble like "Here is the result: {...}")
    json_obj = re.search(r"\{.*\}", raw, re.DOTALL)
    if json_obj:
        candidates.append(json_obj.group(0).strip())

    last_err: Exception | None = None
    for cand in candidates:
        cand = cand.strip()
        if not cand:
            continue
        try:
            return SecurityReport.model_validate_json(cand)
        except Exception as e:
            last_err = e
            # Fallback: json.loads then validate (more lenient)
            try:
                data = json.loads(cand)
                return SecurityReport.model_validate(data)
            except Exception as e2:
                last_err = e2
                continue

    preview = raw[:800]
    raise HTTPException(
        status_code=500,
        detail=f"Analysis failed: model returned non-JSON response: {preview!r} (parse error: {last_err})",
    )


def validate_request(request: AnalyzeRequest) -> None:
    """Validate the analysis request."""
    if not request.code.strip():
        raise HTTPException(status_code=400, detail="No code provided for analysis")
    if request.language not in LANGUAGE_SUFFIXES:
        raise HTTPException(status_code=400, detail="Unsupported source language")


def check_api_keys() -> None:
    """Verify required API keys are configured."""
    if not os.getenv("GEMINI_API_KEY"):
        raise HTTPException(status_code=500, detail="Gemini API key not configured")


def create_security_agent(semgrep_server, language: str) -> Agent:
    """Create and configure the security analysis agent."""
    return Agent(
        name="Security Researcher",
        instructions=(
            SECURITY_RESEARCHER_INSTRUCTIONS
            + f"\nThe submitted source language is {language}. Apply language-specific secure coding guidance.\n"
            + JSON_REPORT_INSTRUCTIONS
        ),
        model=LitellmModel(
            model=GEMINI_MODEL,
            api_key=os.getenv("GEMINI_API_KEY"),
        ),
        mcp_servers=[semgrep_server],
    )


async def run_security_analysis(code: str, language: str) -> SecurityReport:
    """Execute the security analysis workflow."""
    async with create_semgrep_server() as semgrep:
        agent = create_security_agent(semgrep, language)
        try:
            with tempfile.NamedTemporaryFile(
                mode="w", suffix=LANGUAGE_SUFFIXES[language], delete=False
            ) as temp:
                temp.write(code)
                temp_path = temp.name
            try:
                result = await Runner.run(
                    agent,
                    input=(
                        get_analysis_prompt(code, temp_path)
                        + f"\nThe submitted source language is {language}."
                    ),
                )
                report = parse_security_report(result.final_output)
                report.issues.sort(key=lambda issue: issue.cvss_score, reverse=True)
                return report
            finally:
                try:
                    os.unlink(temp_path)
                except OSError:
                    pass
        except HTTPException:
            raise
        except Exception as error:
            print(f"Unexpected {error=}, {type(error)=}")
            raise


def format_analysis_response(code: str, language: str, report: SecurityReport) -> SecurityReport:
    """Format the final analysis response."""
    enhanced_summary = f"Analyzed {len(code)} characters of {language} code. {report.summary}"
    return SecurityReport(summary=enhanced_summary, issues=report.issues)


@app.post("/api/analyze", response_model=SecurityReport)
async def analyze_code(request: AnalyzeRequest) -> SecurityReport:
    """
    Analyze supported source code for security vulnerabilities using Gemini and Semgrep.

    This endpoint combines static analysis via Semgrep with AI-powered security analysis
    to provide comprehensive vulnerability detection and remediation guidance.
    """
    validate_request(request)
    check_api_keys()

    try:
        report = await run_security_analysis(request.code, request.language)
        return format_analysis_response(request.code, request.language, report)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"message": "Cybersecurity Analyzer API"}


# Mount static files for frontend
if os.path.exists("static"):
    app.mount("/", StaticFiles(directory="static", html=True), name="static")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=9000)
