#!/usr/bin/env bash
# =============================================================================
# scripts/setup-iam.sh — Wafrivet Field Vet Phase 6
#
# Run this once on a fresh GCP project to wire all IAM permissions and
# Workload Identity Federation required by the automated CI/CD pipeline.
#
# Safe to re-run: every gcloud command uses --quiet and checks for existence
# before attempting to create, so duplicate runs produce no errors.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated: gcloud auth login
#   - You have roles/owner or roles/editor on the wafrivet-agent project
#   - The fieldvet-backend service account already exists
#     (created by deploy/deploy.sh or manually)
#
# Usage:
#   bash scripts/setup-iam.sh
#
# After running, copy the two printed values into GitHub:
#   Repository Settings → Secrets and variables → Actions → New repository secret
# =============================================================================

set -euo pipefail

# ── Constants (must match cloudbuild.yaml and field-vet-config.yaml) ────────
PROJECT_ID="wafrivet-agent"
REGION="us-central1"
SERVICE_NAME="fieldvet-backend"
SERVICE_ACCOUNT="${SERVICE_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
GITHUB_REPO="Tsu-kimi/Wafrivet-Field-Vet"
WIF_POOL_NAME="github-pool"
WIF_PROVIDER_NAME="github-provider"

# ── Heading helper ───────────────────────────────────────────────────────────
heading() {
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo " $*"
  echo "═══════════════════════════════════════════════════════════════"
}

# ─────────────────────────────────────────────────────────────────────────────
# STEP 0 — Resolve project number
#
# The project number (not project ID) is needed to construct the Workload
# Identity Pool member principal URI.
# ─────────────────────────────────────────────────────────────────────────────
heading "STEP 0 — Resolving project number for ${PROJECT_ID}"

PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" \
  --format="value(projectNumber)")

echo "  Project ID     : ${PROJECT_ID}"
echo "  Project number : ${PROJECT_NUMBER}"

# Derive the Cloud Build default service account email from the project number.
# Cloud Build uses <project-number>@cloudbuild.gserviceaccount.com by default.
CLOUDBUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
echo "  Cloud Build SA : ${CLOUDBUILD_SA}"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Grant Cloud Build roles/run.admin
#
# Allows Cloud Build to create, update, and delete Cloud Run services.
# Required for the `gcloud run deploy` step in cloudbuild.yaml.
# ─────────────────────────────────────────────────────────────────────────────
heading "STEP 1 — Granting roles/run.admin to Cloud Build SA"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/run.admin" \
  --quiet

echo "  ✓ roles/run.admin granted to ${CLOUDBUILD_SA}"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — Grant Cloud Build roles/artifactregistry.writer
#
# Allows Cloud Build to push Docker images to the fieldvet-images Artifact
# Registry repository.  Required for the `docker push` step in cloudbuild.yaml.
# ─────────────────────────────────────────────────────────────────────────────
heading "STEP 2 — Granting roles/artifactregistry.writer to Cloud Build SA"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/artifactregistry.writer" \
  --quiet

echo "  ✓ roles/artifactregistry.writer granted to ${CLOUDBUILD_SA}"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — Grant Cloud Build roles/secretmanager.secretAccessor
#
# Allows Cloud Build steps to read secrets from Secret Manager if needed
# during the build (e.g. for integration test steps added in a future Phase).
# The Cloud Run service's own secretAccessor bindings are set by deploy/deploy.sh.
# ─────────────────────────────────────────────────────────────────────────────
heading "STEP 3 — Granting roles/secretmanager.secretAccessor to Cloud Build SA"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet

echo "  ✓ roles/secretmanager.secretAccessor granted to ${CLOUDBUILD_SA}"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — Grant Cloud Build iam.serviceAccountUser on fieldvet-backend SA
#
# This SPECIFIC binding (not a project-wide binding) lets Cloud Build impersonate
# the fieldvet-backend service account for the `gcloud run deploy --service-account`
# flag.  Without this, Cloud Run rejects the deploy with PERMISSION_DENIED.
#
# Scoped to the fieldvet-backend SA only (least-privilege — Cloud Build cannot
# impersonate any other service account in the project).
# ─────────────────────────────────────────────────────────────────────────────
heading "STEP 4 — Granting iam.serviceAccountUser on fieldvet-backend SA to Cloud Build SA"

gcloud iam service-accounts add-iam-policy-binding "${SERVICE_ACCOUNT}" \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/iam.serviceAccountUser" \
  --project="${PROJECT_ID}" \
  --quiet

echo "  ✓ roles/iam.serviceAccountUser granted"
echo "    Member  : ${CLOUDBUILD_SA}"
echo "    Resource: ${SERVICE_ACCOUNT} (SA-level, not project-wide)"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — Create Workload Identity Pool
#
# The pool is the GCP-side container for external identity providers.
# GitHub Actions presents an OIDC token; the pool validates it against the
# github-provider configuration created in the next step.
#
# --location global is required for Workload Identity Federation.
# ─────────────────────────────────────────────────────────────────────────────
heading "STEP 5 — Creating Workload Identity Pool: ${WIF_POOL_NAME}"

if gcloud iam workload-identity-pools describe "${WIF_POOL_NAME}" \
     --location="global" \
     --project="${PROJECT_ID}" &>/dev/null; then
  echo "  ✓ Pool '${WIF_POOL_NAME}' already exists — skipping creation"
else
  gcloud iam workload-identity-pools create "${WIF_POOL_NAME}" \
    --location="global" \
    --display-name="GitHub Actions Pool" \
    --description="Allows GitHub Actions workflows in ${GITHUB_REPO} to authenticate to GCP without a service account key" \
    --project="${PROJECT_ID}" \
    --quiet
  echo "  ✓ Pool '${WIF_POOL_NAME}' created"
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 6 — Create Workload Identity Provider
#
# The provider maps GitHub's OIDC token claims to GCP principal attributes.
# Attribute mapping:
#   google.subject      ← assertion.sub         (e.g. repo:Tsu-kimi/...:ref:refs/heads/main)
#   attribute.actor     ← assertion.actor        (triggering GitHub user)
#   attribute.repository← assertion.repository   (short repo slug: owner/repo)
#
# Attribute condition restricts which GitHub repo can use this provider.
# Without the condition, any GitHub repo could claim this identity.
# ─────────────────────────────────────────────────────────────────────────────
heading "STEP 6 — Creating Workload Identity Provider: ${WIF_PROVIDER_NAME}"

if gcloud iam workload-identity-pools providers describe "${WIF_PROVIDER_NAME}" \
     --workload-identity-pool="${WIF_POOL_NAME}" \
     --location="global" \
     --project="${PROJECT_ID}" &>/dev/null; then
  echo "  ✓ Provider '${WIF_PROVIDER_NAME}' already exists — skipping creation"
else
  gcloud iam workload-identity-pools providers create-oidc "${WIF_PROVIDER_NAME}" \
    --workload-identity-pool="${WIF_POOL_NAME}" \
    --location="global" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository == '${GITHUB_REPO}'" \
    --display-name="GitHub provider" \
    --description="OIDC provider for GitHub Actions in ${GITHUB_REPO}" \
    --project="${PROJECT_ID}" \
    --quiet
  echo "  ✓ Provider '${WIF_PROVIDER_NAME}' created"
  echo "    Issuer    : https://token.actions.githubusercontent.com"
  echo "    Condition : repository == '${GITHUB_REPO}'"
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 7 — Grant Workload Identity impersonation on fieldvet-backend SA
#
# This binding lets any GitHub Actions run from the wafrivet-field-vet repo
# (filtered by the provider's attribute-condition above) exchange its OIDC
# token for a short-lived access token that impersonates fieldvet-backend.
#
# The member URI format is:
#   principalSet://iam.googleapis.com/projects/<number>/locations/global/
#     workloadIdentityPools/<pool>/attribute.repository/<owner>/<repo>
# ─────────────────────────────────────────────────────────────────────────────
heading "STEP 7 — Granting roles/iam.workloadIdentityUser to GitHub Actions identity"

WIF_MEMBER="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL_NAME}/attribute.repository/${GITHUB_REPO}"

gcloud iam service-accounts add-iam-policy-binding "${SERVICE_ACCOUNT}" \
  --member="${WIF_MEMBER}" \
  --role="roles/iam.workloadIdentityUser" \
  --project="${PROJECT_ID}" \
  --quiet

echo "  ✓ roles/iam.workloadIdentityUser granted"
echo "    Member  : ${WIF_MEMBER}"
echo "    Resource: ${SERVICE_ACCOUNT}"

# ─────────────────────────────────────────────────────────────────────────────
# OUTPUT — GitHub repository secrets
#
# Copy these two values into GitHub:
#   Repository → Settings → Secrets and variables → Actions → New repository secret
# ─────────────────────────────────────────────────────────────────────────────
WIF_PROVIDER_FULL="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${WIF_POOL_NAME}/providers/${WIF_PROVIDER_NAME}"

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo " ✓  ALL DONE — IAM setup complete"
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo " Add the following two secrets to your GitHub repository:"
echo " (Settings → Secrets and variables → Actions → New repository secret)"
echo ""
echo " ┌─────────────────────────────────────┬────────────────────────────────────────────────────────────────────────────────────────────────────────────┐"
echo " │ Secret name                         │ Value                                                                                                      │"
echo " ├─────────────────────────────────────┼────────────────────────────────────────────────────────────────────────────────────────────────────────────┤"
echo " │ GCP_WORKLOAD_IDENTITY_PROVIDER      │ ${WIF_PROVIDER_FULL}"
echo " │ GCP_SERVICE_ACCOUNT                 │ ${SERVICE_ACCOUNT}"
echo " └─────────────────────────────────────┴────────────────────────────────────────────────────────────────────────────────────────────────────────────┘"
echo ""
echo " GCP_WORKLOAD_IDENTITY_PROVIDER=${WIF_PROVIDER_FULL}"
echo " GCP_SERVICE_ACCOUNT=${SERVICE_ACCOUNT}"
echo ""
