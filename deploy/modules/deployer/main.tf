terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.0"
    }
  }
}

variable "project_id" {
  description = "The project the deploy workflow rolls the service in."
  type        = string
}

variable "repository" {
  description = "The GitHub repository whose v* tags deploy, as owner/name."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9-]+/[A-Za-z0-9._-]+$", var.repository))
    error_message = "repository is owner/name, such as octocat/ras."
  }
}

variable "registry" {
  description = "The Artifact Registry repository the workflow pushes images to."
  type = object({
    name     = string
    location = string
  })
}

variable "runtime_account" {
  description = "The id of the service account the service runs as, which a deploy acts as."
  type        = string
}

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

output "workload_identity_provider" {
  description = "The provider the deploy workflow authenticates through."
  value       = google_iam_workload_identity_pool_provider.this.name
}

output "service_account" {
  description = "The email of the account the deploy workflow acts as."
  value       = google_service_account.this.email
}
