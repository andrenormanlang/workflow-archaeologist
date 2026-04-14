#!/bin/bash
# Creates a tiny git repo with known commits for gitExtractor tests

set -e

FIXTURE_DIR="$(dirname "$0")/git-extractor"

rm -rf "$FIXTURE_DIR"
mkdir -p "$FIXTURE_DIR"
cd "$FIXTURE_DIR"

git init
git config user.email "test@example.com"
git config user.name "Test User"

# commit 1 — add a workflow file
mkdir -p .github/workflows
echo "name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
        timeout-minutes: 30" > .github/workflows/ci.yml

git add .
git commit -m "Add CI workflow"

# commit 2 — modify the workflow (change timeout)
echo "name: CI
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm test
        timeout-minutes: 45" > .github/workflows/ci.yml

git add .
git commit -m "Increase timeout on CI workflow"

# commit 3 — add a second workflow file
echo "name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm run deploy" > .github/workflows/deploy.yml

git add .
git commit -m "Add deploy workflow"

# commit 4 — rename ci.yml to build.yml
git mv .github/workflows/ci.yml .github/workflows/build.yml
git commit -m "Rename ci.yml to build.yml"

# commit 5 — a non-workflow commit (should be ignored)
echo "# Workflow Archaeologist" > README.md
git add .
git commit -m "Add README"

# commit 6 — merge commit (should be ignored)
git checkout -b feature-branch
echo "name: Build
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test" > .github/workflows/build.yml
git add .
git commit -m "Update build workflow on feature branch"
git checkout main
git merge --no-ff feature-branch -m "Merge feature-branch into main"
git branch -d feature-branch

echo "Fixture repo created at $FIXTURE_DIR"