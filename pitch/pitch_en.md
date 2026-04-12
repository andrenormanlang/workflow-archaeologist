# Workflow Archaeologist — Pitch

Workflow Archaeologist is a tool that analyzes a repository's Git history and reverse-engineers the reasons behind CI/workflow configuration choices. Example output: "This 45-minute timeout was added after a flaky Selenium test in March 2026, commit abc123. It is likely safe to reduce it now."

The product is intended for teams that inherit pipelines without institutional memory of past decisions; it reduces time spent investigating CI issues and supports informed configuration changes.
