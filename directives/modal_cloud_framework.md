# Modal Cloud Execution Framework (Master SOP)

This framework defines the professional standards for cloud-hosted execution scripts. It provides everything needed to replicate the pattern established in this codebase.

---

## Overview

The DOE (Directive-Orchestration-Execution) framework separates concerns:
- **Directives**: SOPs in markdown describing what to do
- **Orchestration**: Claude (Antigravity) making decisions and calling tools
- **Execution**: Deterministic Python scripts doing the actual work

This document focuses on moving the **Execution** layer to the cloud via Modal, so you (the orchestrator) can trigger workflows via HTTP webhooks instead of local Python scripts.

---

## Architecture Pattern: Immediate Response + Background Task

For any workflow taking longer than 10-15 seconds, use this pattern:

### 1. The Background Task
Does the heavy lifting (Scraping, AI processing, Sheet uploads).
```python
@app.function(image=image, secrets=ALL_SECRETS, timeout=1800)
def workflow_background(param1: str, job_id: str):
    try:
        slack_notify(f"🚀 Step 1/N: Starting {job_id}...")
        # ... logic ...
        slack_notify(f"✅ Complete!")
    except Exception as e:
        slack_error(str(e))
```

### 2. The Instant Endpoint
Validates input and returns `201 Accepted` immediately.
```python
@app.function(image=image, secrets=ALL_SECRETS)
@modal.fastapi_endpoint(method="POST")
def trigger_workflow(data: dict):
    # Spawn background task (non-blocking!)
    workflow_background.spawn(data["param1"], "JOB-123")
    return {"status": "accepted", "message": "Workflow started."}
```

---

## Visibility (Slack Notifications)

Every cloud workflow MUST include Slack pings at these stages:
- `🚀 Started: [Workflow Name]`
- `🔄 Step X/N Completed: [Progress Update]`
- `✅ Complete: [Result/Link]`
- `❌ Error: [Detailed Failure Message]`

---

## Secret Management

Secrets are stored in the Modal dashboard, not in code.

### Required Secrets Checklist
- `anthropic-secret`: `ANTHROPIC_API_KEY`
- `google-token`: `GOOGLE_TOKEN_JSON` (Full OAuth JSON)
- `slack-webhook`: `SLACK_WEBHOOK_URL`
- `apify-secret`: `APIFY_API_TOKEN`

---

## Best Practices
1. **Don't run Claude on the server** - Remote orchestration is too slow. The orchestrator stays local.
2. **Deterministic Execution** - Modal should run predictable Python logic.
3. **Handle Missing Secrets** - Use `os.getenv()` and skip optional steps gracefully.
4. **Use pandas for data** - It ensures proper JSON flattening to Google Sheets.
