resource "google_iam_workload_identity_pool" "this" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "this" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.this.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  display_name                       = "GitHub Actions"
  attribute_condition                = "assertion.repository == '${var.repository}' && assertion.ref.startsWith('refs/tags/v')"
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "this" {
  account_id   = "ras-deployer"
  display_name = "Deploys ras from GitHub Actions"
}

resource "google_service_account_iam_member" "workflow" {
  service_account_id = google_service_account.this.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.this.name}/attribute.repository/${var.repository}"
}

resource "google_artifact_registry_repository_iam_member" "push" {
  location   = var.registry.location
  repository = var.registry.name
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.this.member
}

resource "google_project_iam_member" "deploy" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = google_service_account.this.member
}

resource "google_service_account_iam_member" "act_as_runtime" {
  service_account_id = var.runtime_account
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.this.member
}
