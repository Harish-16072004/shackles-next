# Phase 6 Release Freeze Policy

## Purpose
Reduce release risk by limiting high-impact refactors during release windows.

## Freeze Window
- Starts: at release candidate cut.
- Ends: 24h after post-release verification is complete.

## Restricted Changes During Freeze
- Large refactors across scanner/offline/admin core flows.
- Schema changes without approved migration and rollback notes.
- Major dependency upgrades.

## Allowed Changes During Freeze
- Critical production bug fixes.
- Security patches.
- Documentation/runbook corrections.

## Required Controls
1. Every PR during freeze must include:
   - risk assessment
   - rollback impact note
2. High-risk refactor PRs must be deferred unless explicitly approved by Release Owner + Tech Lead.

## Enforcement Guidance
- Use PR labels:
  - `release-freeze`
  - `high-risk-refactor`
  - `release-approved-exception`
- CI governance check can fail if high-risk changes are merged without exception note in release evidence.
