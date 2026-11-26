terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.0"
    }
  }
}

variable "location" {
  description = "The region the repository lives in."
  type        = string
}

variable "repository_id" {
  description = "The repository's id, which the image path names."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{0,62}$", var.repository_id))
    error_message = "repository_id is lowercase letters, digits and hyphens, starting with a letter."
  }
}

variable "keep_count" {
  description = "How many of the newest images the repository keeps."
  type        = number
  default     = 2

  validation {
    condition     = var.keep_count >= 1 && floor(var.keep_count) == var.keep_count
    error_message = "keep_count is a whole number of at least 1, or the running image could be deleted."
  }
}

resource "google_artifact_registry_repository" "this" {
  location               = var.location
  repository_id          = var.repository_id
  format                 = "DOCKER"
  cleanup_policy_dry_run = false

  cleanup_policies {
    id     = "keep-newest"
    action = "KEEP"

    most_recent_versions {
      keep_count = var.keep_count
    }
  }

  cleanup_policies {
    id     = "delete-older"
    action = "DELETE"

    condition {
      tag_state = "ANY"
    }
  }
}

output "name" {
  description = "The repository's id."
  value       = google_artifact_registry_repository.this.repository_id
}

output "location" {
  description = "The repository's region."
  value       = google_artifact_registry_repository.this.location
}

output "image" {
  description = "The path of the ras image, without a tag."
  value       = "${var.location}-docker.pkg.dev/${google_artifact_registry_repository.this.project}/${var.repository_id}/ras"
}
