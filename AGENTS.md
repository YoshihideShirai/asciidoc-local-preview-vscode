# Repository Instructions

## Release Changelog

When preparing a release PR, update `CHANGELOG.md` by listing the pull requests merged into the target branch since the previous release tag.

- Determine the target branch from the release PR base branch, usually `main`.
- Determine the previous release tag as the latest version tag reachable from the target branch before the release PR changes.
- For the new release section, list each merged PR from after that tag up to the target branch head.
- Include the PR number, title, and link. Do not replace this list with a generic release-preparation bullet.
