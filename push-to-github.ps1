# PowerShell script to push to GitHub
# Run this after creating the repository on GitHub.com

# Replace with your GitHub username
$githubUsername = "dmhirschfeld"  # Change this if different
$repoName = "google-meet-auto-record"

Write-Host "Setting up GitHub remote..."
Write-Host "Repository: https://github.com/$githubUsername/$repoName"
Write-Host ""

# Add remote (will fail if already added, that's okay)
git remote remove origin 2>$null
git remote add origin "https://github.com/$githubUsername/$repoName.git"

Write-Host "Pushing to GitHub..."
git push -u origin master

Write-Host ""
Write-Host "Done! Your code is now on GitHub."
Write-Host "Repository URL: https://github.com/$githubUsername/$repoName"

