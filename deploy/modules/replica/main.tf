terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.0"
    }
  }
}

variable "name" {
  description = "The bucket's globally unique name."
  type        = string
}

variable "location" {
  description = "The region the bucket lives in."
  type        = string
}

variable "writer" {
  description = "The service account member that restores and replicates the database."
  type        = string

  validation {
    condition     = startswith(var.writer, "serviceAccount:")
    error_message = "writer is a service account member, such as serviceAccount:ras@project.iam.gserviceaccount.com."
  }
}

variable "soft_delete_days" {
  description = "How long a deleted object can still be restored."
  type        = number
  default     = 7

  validation {
    condition     = var.soft_delete_days >= 7 && var.soft_delete_days <= 90
    error_message = "soft_delete_days is between 7 and 90, the range Cloud Storage accepts."
  }
}

variable "noncurrent_days" {
  description = "How long a replaced or deleted version is kept before Cloud Storage removes it."
  type        = number
  default     = 30

  validation {
    condition     = var.noncurrent_days >= 1
    error_message = "noncurrent_days is at least 1."
  }
}

resource "google_storage_bucket" "this" {
  name                        = var.name
  location                    = var.location
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  soft_delete_policy {
    retention_duration_seconds = var.soft_delete_days * 86400
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }

    condition {
      days_since_noncurrent_time = var.noncurrent_days
      with_state                 = "ARCHIVED"
    }
  }
}

resource "google_storage_bucket_iam_member" "writer" {
  bucket = google_storage_bucket.this.name
  role   = "roles/storage.objectAdmin"
  member = var.writer
}

output "name" {
  description = "The bucket's name."
  value       = google_storage_bucket.this.name
}
