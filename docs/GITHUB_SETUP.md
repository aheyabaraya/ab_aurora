# GitHub Repository Setup

Use this exact order for a new repository connection.

## 1) Initialize git locally
```bash
cd /Users/yuminseog/ab_aurora
git init -b main
git add .
git commit -m "chore: bootstrap ab_aurora project from docs"
```

## 2) Create remote repository on GitHub
- Create an empty repo in GitHub UI (no README, no license, no gitignore).
- Copy repository URL (SSH recommended): `git@github.com:<your-id>/<repo-name>.git`

## 3) Connect local repo to remote
```bash
git remote add origin git@github.com:<your-id>/<repo-name>.git
git remote -v
git push -u origin main
```

## 4) If SSH key is not configured
```bash
ssh-keygen -t ed25519 -C "<your-email>"
cat ~/.ssh/id_ed25519.pub
```
- Add the printed key in GitHub: `Settings -> SSH and GPG keys -> New SSH key`.

## Security notes
- Never commit `.env*` files with real keys.
- Use GitHub secrets for CI/CD credentials.
- Rotate API keys if accidentally exposed.
