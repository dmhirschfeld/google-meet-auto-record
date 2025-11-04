# Instructions to create GitHub repository and push code

## Step 1: Create Repository on GitHub

1. Go to https://github.com/new
2. Repository name: `google-meet-auto-record`
3. Description: "Chrome extension that automatically starts recording when the host joins a Google Meet session"
4. Choose visibility (Public or Private)
5. DO NOT initialize with README, .gitignore, or license (we already have these)
6. Click "Create repository"

## Step 2: Push Code to GitHub

After creating the repository, GitHub will show you commands. 
Run these commands (replace YOUR_USERNAME with your GitHub username):

```bash
git remote add origin https://github.com/YOUR_USERNAME/google-meet-auto-record.git
git branch -M main
git push -u origin main
```

Or if your default branch is already "master":

```bash
git remote add origin https://github.com/YOUR_USERNAME/google-meet-auto-record.git
git push -u origin master
```

## Alternative: Using GitHub CLI (if installed)

```bash
gh repo create google-meet-auto-record --public --source=. --remote=origin --push
```

