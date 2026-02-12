# Security-Sensitive Tasks (Do Yourself)

These steps involve private credentials or account permissions.

## Must be done by repository owner
1. Create GitHub repository under your account/org.
2. Configure SSH key or personal access token on your machine.
3. Set real `OPENAI_API_KEY` in local `.env` (never commit).
4. Add production secrets in deployment platform (Vercel/GitHub Actions).
5. Review repository visibility (private/public) before first push.

## Optional hardening checklist
1. Enable branch protection on `main`.
2. Enable secret scanning and push protection.
3. Add required status checks (`lint`, `typecheck`) before merge.
4. Rotate credentials every 60-90 days.
