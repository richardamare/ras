# The secrets have no versions here: the seed script adds the values, so Terraform's state never holds one.

terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.0"
    }
  }
}

variable "secret_ids" {
  description = "The ids of the secrets to create."
  type        = set(string)

  validation {
    condition     = alltrue([for id in var.secret_ids : can(regex("^[a-z][a-z0-9-]{0,254}$", id))])
    error_message = "Each secret id is lowercase letters, digits and hyphens, starting with a letter."
  }
}

variable "accessor" {
  description = "The service account member that reads every secret."
  type        = string

  validation {
    condition     = startswith(var.accessor, "serviceAccount:")
    error_message = "accessor is a service account member, such as serviceAccount:ras@project.iam.gserviceaccount.com."
  }
}

resource "google_secret_manager_secret" "this" {
  for_each  = var.secret_ids
  secret_id = each.value

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_iam_member" "accessor" {
  for_each  = google_secret_manager_secret.this
  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = var.accessor
}

output "ids" {
  description = "Each secret's id, keyed by itself."
  value       = { for id, secret in google_secret_manager_secret.this : id => secret.secret_id }
}
