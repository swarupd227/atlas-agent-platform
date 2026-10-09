# AWS Deployment Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the current and future AWS EC2 deployment without changing Azure, DNS, SSO, passwords, or AI providers.

**Architecture:** Keep CloudFront in front of the existing internet-facing ALB, authenticate origin requests with a per-deployment secret header, restrict ALB ingress to CloudFront, and attach WAF. Build immutable images in GitHub Actions through OIDC; EC2 pulls exact digests and deploys them through SSM with rollback.

**Tech Stack:** Bash, AWS CLI v2, jq, GitHub Actions, Docker, ECR, SSM, CloudFront, ALB, WAFv2, Secrets Manager.

**Spec:** Approved in conversation on 2026-10-09; no separate spec file exists.

## Global Constraints

- AWS account `964604400233`, default region `us-east-1`.
- Repository `swarupd227/atlas-agent-platform`; Azure files and resources are read-only and unchanged.
- `DEPLOYMENT_ID` matches `[a-z0-9][a-z0-9-]{0,11}` and every lookup must resolve exactly one deployment-scoped resource.
- DNS/custom TLS, Bedrock, SSO, admin passwords, vault keys, and audit signing keys are out of scope.
- Deployments are manually initiated and images are selected by immutable digest.

## Review Focus

- Zero or multiple EC2 matches must fail before any mutation.
- CloudFront must be proven healthy before the ALB default action or public ingress is closed.
- A failed replacement container must restore the previous container and secret version when applicable.
- Cleanup must detach WAF and remain confined to one deployment ID.
- The GitHub role must be unable to invoke SSM or read Secrets Manager; the EC2 role must be unable to push to ECR.

### Task 1: Deployment contract and shared shell library

- [ ] Add executable contract tests for deployment ID validation, exact instance selection, state isolation, and command prerequisites.
- [ ] Watch the tests fail because the shared library is absent.
- [ ] Add `deploy/aws/common.sh` with the minimum functions required by the tests.
- [ ] Run the contract tests and shell syntax checks.
- [ ] Commit.

### Task 2: GitHub OIDC image build and least-privilege role

- [ ] Add failing tests for trust-policy scope and ECR-only permissions.
- [ ] Add the manual GitHub Actions image-build workflow and `bootstrap-ci` operation.
- [ ] Verify the workflow contract and IAM policy tests.
- [ ] Commit.

### Task 3: Digest deployment and EC2 pull-only permissions

- [ ] Add failing tests for exact digest validation, SSM target isolation, rollback commands, and forbidden EC2 push actions.
- [ ] Implement `deploy-image`, `verify`, and runtime-role hardening operations.
- [ ] Run contract tests and syntax checks.
- [ ] Commit.

### Task 4: Edge, WAF, and JWT operations

- [ ] Add failing tests for safe ordering, direct-ALB rejection, WAF scope, and single-field JWT rotation.
- [ ] Implement staged origin-header/ALB/prefix-list hardening, WAF creation/logging, JWT rotation, and rollback state capture.
- [ ] Run contract tests and syntax checks.
- [ ] Commit.

### Task 5: Fresh deployment, cleanup, documentation, and live rollout

- [ ] Import and update the sequential provisioner so production EC2 never builds or pushes images.
- [ ] Update cleanup for WAF, log group, and origin secret ownership.
- [ ] Document exact build, deploy, verify, rollback, and deletion commands.
- [ ] Run repository build, AWS shell tests, syntax checks, and diff checks.
- [ ] Review the whole branch, fix important findings, and commit.
- [ ] Apply the staged live rollout only after repository verification; verify every live acceptance criterion.
