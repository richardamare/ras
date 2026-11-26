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
  description = "The service's name, which its run.app address starts with."
  type        = string
}

variable "region" {
  description = "The region the service runs in."
  type        = string

  validation {
    condition     = startswith(var.region, "europe-")
    error_message = "region is a European region, where the owner's data stays."
  }
}

variable "service_account" {
  description = "The email of the service account the service runs as."
  type        = string
}

variable "image" {
  description = "The image of the first revision. The deploy workflow owns every later one."
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "memory" {
  description = "The memory of an instance, which also holds the database and the memory clone."
  type        = string
  default     = "512Mi"
}

variable "env" {
  description = "The plain environment variables, by name."
  type        = map(string)

  validation {
    condition     = alltrue([for name in keys(var.env) : can(regex("^RAS_[A-Z0-9_]+$", name))])
    error_message = "Each environment variable is a ras setting, named RAS_ and capitals."
  }
}

variable "secrets" {
  description = "The environment variables read from Secret Manager, as the id of the secret each one holds."
  type        = map(string)

  validation {
    condition     = alltrue([for name in keys(var.secrets) : can(regex("^RAS_[A-Z0-9_]+$", name))])
    error_message = "Each secret environment variable is a ras setting, named RAS_ and capitals."
  }

  validation {
    condition     = length(setintersection(keys(var.secrets), keys(var.env))) == 0
    error_message = "A variable is either plain or a secret, never both."
  }
}

resource "google_cloud_run_v2_service" "this" {
  name     = var.name
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = var.service_account

    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    containers {
      image = var.image

      ports {
        container_port = 8080
      }

      resources {
        cpu_idle          = true
        startup_cpu_boost = true
        limits = {
          cpu    = "1"
          memory = var.memory
        }
      }

      dynamic "env" {
        for_each = var.env

        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.secrets

        content {
          name = env.key

          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      startup_probe {
        period_seconds    = 5
        timeout_seconds   = 3
        failure_threshold = 24

        http_get {
          path = "/health"
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.this.name
  location = google_cloud_run_v2_service.this.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "name" {
  description = "The service's name."
  value       = google_cloud_run_v2_service.this.name
}

output "uri" {
  description = "The service's run.app address."
  value       = google_cloud_run_v2_service.this.uri
}
